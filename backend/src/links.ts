import type { Hono } from "hono";

// Link previews for the chat: a pasted product link shows as a card (picture, title, site, price) from the page's
// Open Graph tags. Best effort: a shop that blocks bots still gets a card with its site name.

export type Unfurl = { url: string; site: string; title?: string; image?: string; price?: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/** Never fetch the machine's own network for a link someone pasted. */
const PRIVATE = /^(localhost|0\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)|\.local$|\.internal$/i;
const cache = new Map<string, { at: number; v: Unfurl }>();

const siteOf = (u: URL) => u.hostname.replace(/^www\./, "");

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

/** A <meta property|name="key" content="..."> value, in either attribute order. */
function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const key = k.replace(/[.:]/g, (c) => `\\${c}`);
    const m =
      html.match(new RegExp(`<meta[^>]*?(?:property|name)\\s*=\\s*["']${key}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${key}["']`, "i"));
    const v = m?.[1] && decode(m[1]);
    if (v) return v;
  }
  return undefined;
}

/** "Buy X Online at Best Price | Amazon.in" → "X". Drops a title that's only the shop's name. */
function tidy(title: string | undefined, site: string) {
  if (!title) return undefined;
  const brand = site.split(".")[0].toLowerCase();
  // Amazon's own shape: "X : Author: Amazon.in: Books" (shop name and department at the end, after colons)
  let t = title.replace(/^(amazon\.[a-z.]+|flipkart\.com)\s*:\s*/i, "").replace(/\s*:\s*amazon\.[a-z.]+(\s*:[^:]*)?$/i, "");
  const parts = t.split(/\s+[|–—]\s+|\s+-\s+/);
  if (parts.length > 1 && parts[parts.length - 1].toLowerCase().includes(brand)) t = parts.slice(0, -1).join(" - ");
  t = t.replace(/^buy\s+/i, "").replace(/\s+online at (the )?(best|lowest) prices?( in india)?.*$/i, "").trim();
  const bare = t.toLowerCase().replace(/\W/g, "");
  return !t || bare === brand || bare === site.replace(/\W/g, "") ? undefined : t.slice(0, 140);
}

/** Shops put the product's name in the path ("amazon.in/Sony-WH-1000XM5-…/dp/B0…"): a title when the page won't say. */
function fromSlug(u: URL) {
  const slug = u.pathname.split("/").find((s) => /^[A-Za-z0-9]+(-[A-Za-z0-9().]+){2,}$/.test(s) && /[a-z]{3}/i.test(s));
  if (!slug) return undefined;
  const words = decodeURIComponent(slug).split("-").filter(Boolean);
  const t = words.join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1, 140);
}

function price(amount?: string, currency?: string) {
  const n = Number(amount?.replace(/,/g, ""));
  if (!amount || !Number.isFinite(n) || n <= 0) return undefined;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: (currency || "INR").toUpperCase(), maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return undefined;
  }
}

export async function unfurl(raw: string): Promise<Unfurl> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("That isn't a link");
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) throw new Error("Only public web links");
  const key = u.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.v;
  let v: Unfurl = { url: key, site: siteOf(u) };
  try {
    const r = await fetch(key, {
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const final = new URL(r.url || key);
    v = { url: key, site: siteOf(final) }; // a short link (amzn.in/d/…) lands on the shop itself
    if (r.ok && /html/i.test(r.headers.get("content-type") ?? "")) {
      const html = (await r.text()).slice(0, 500_000);
      const titleTag = html.match(/<title[^>]*>([^<]{1,400})<\/title>/i)?.[1];
      const title = meta(html, ["og:title", "twitter:title"]) ?? (titleTag ? decode(titleTag) : undefined);
      const image = meta(html, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
      v = {
        ...v,
        title: tidy(title, v.site),
        image: image ? new URL(image, final).toString() : undefined,
        price: price(meta(html, ["product:price:amount", "og:price:amount"]), meta(html, ["product:price:currency", "og:price:currency"])),
      };
    }
  } catch (e) {
    console.warn(`[unfurl] ${u.hostname}: ${(e as Error).message}`);
  }
  if (!v.title) v.title = fromSlug(u);
  cache.set(key, { at: Date.now(), v });
  return v;
}

export function linkRoutes(app: Hono) {
  app.get("/api/unfurl", async (c) => {
    try {
      return c.json(await unfurl(c.req.query("url") ?? ""));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });
}
