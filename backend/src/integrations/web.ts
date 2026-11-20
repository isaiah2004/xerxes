import { env } from "../env.js";

// Web search + page reading: the agent's "browser". Tavily when keyed, DuckDuckGo HTML otherwise.
export type SearchHit = { title: string; url: string; snippet: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function webSearch(query: string, max = 8): Promise<SearchHit[]> {
  if (env.tavilyKey) {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.tavilyKey}` },
      body: JSON.stringify({ query, max_results: max, search_depth: "basic" }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const j = (await r.json()) as { results: { title: string; url: string; content: string }[] };
      return j.results.map((x) => ({ title: x.title, url: x.url, snippet: x.content.slice(0, 400) }));
    }
  }
  const r = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: query, kl: "in-en" }),
    signal: AbortSignal.timeout(12000),
  });
  const html = await r.text();
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    let url = m[1];
    const u = url.match(/uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.includes("duckduckgo.com/y.js")) continue; // ads
    hits.push({ title: decode(m[2]), url, snippet: decode(m[3]) });
    if (hits.length >= max) break;
  }
  return hits;
}

/** Fetch a page and return readable text (prices, delivery estimates, stock status live here). */
export async function readPage(url: string, maxChars = 6000): Promise<{ url: string; title: string; text: string }> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  const html = await r.text();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n");
  const text = decode(body.replace(/\n/g, " ⏎ ")).replace(/( ⏎ )+/g, "\n").slice(0, maxChars);
  return { url: r.url, title, text: r.ok ? text : `HTTP ${r.status}: ${text.slice(0, 500)}` };
}
