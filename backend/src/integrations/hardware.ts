import { env } from "../env.js";

// Second-hand hardware listings from r/homelabsales (+ r/hardwareswap).
// Reddit stopped serving anonymous JSON (403), so this uses app-only OAuth when REDDIT_CLIENT_ID/SECRET are set
// (create a "script" app at https://www.reddit.com/prefs/apps — free for low-volume personal use).
export type HardwareListing = {
  title: string;
  subreddit: string;
  url: string;
  createdAt: string;
  flair?: string;
  prices: number[]; // $ amounts spotted in title/body
  location?: string; // e.g. "[US-CA]"
  excerpt: string;
};

const UA = "xerxes-shopping-agent/0.1 (hackathon prototype)";

/** Short, user-facing reason a source can't be read right now (shown on the Radar). */
export class SourceUnavailable extends Error {}

let token: { value: string; exp: number } | undefined;
async function redditToken(): Promise<string | undefined> {
  if (!env.redditClientId || !env.redditClientSecret) return undefined;
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.redditClientId}:${env.redditClientSecret}`).toString("base64")}`,
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new SourceUnavailable(`Reddit sign-in failed (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

function extractPrices(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\$\s?(\d{1,5}(?:\.\d{1,2})?)/g)) out.add(Number(m[1]));
  for (const m of text.matchAll(/(\d{1,5})\s?(?:usd|shipped|obo)\b/gi)) out.add(Number(m[1]));
  return [...out].filter((n) => n > 0).slice(0, 12);
}

export async function searchHardware(
  query: string,
  opts: { subreddits?: string[]; limit?: number } = {},
): Promise<HardwareListing[]> {
  const subs = opts.subreddits ?? ["homelabsales", "hardwareswap"];
  const auth = await redditToken();
  const statuses: number[] = [];
  const results = await Promise.all(
    subs.map(async (sub) => {
      const url = new URL(auth ? `https://oauth.reddit.com/r/${sub}/search` : `https://www.reddit.com/r/${sub}/search.json`);
      url.searchParams.set("q", query);
      url.searchParams.set("restrict_sr", "1");
      url.searchParams.set("sort", "new");
      url.searchParams.set("t", "month");
      url.searchParams.set("limit", String(opts.limit ?? 15));
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": UA, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
          signal: AbortSignal.timeout(8000),
        });
        statuses.push(r.status);
        if (!r.ok) return [];
        const j = (await r.json()) as any;
        return (j.data?.children ?? []).map((c: any): HardwareListing => {
          const d = c.data;
          const text = `${d.title}\n${d.selftext ?? ""}`;
          return {
            title: d.title,
            subreddit: sub,
            url: `https://www.reddit.com${d.permalink}`,
            createdAt: new Date(d.created_utc * 1000).toISOString(),
            flair: d.link_flair_text ?? undefined,
            prices: extractPrices(text),
            location: d.title.match(/^\s*\[([A-Z]{2}(?:-[A-Z]{2})?)\]/)?.[1],
            excerpt: String(d.selftext ?? "").replace(/\s+/g, " ").slice(0, 300),
          };
        });
      } catch {
        statuses.push(0);
        return [];
      }
    }),
  );
  // Every subreddit refused: say so instead of pretending the market is quiet.
  if (statuses.length && statuses.every((s) => s < 200 || s >= 300)) {
    if (!auth && statuses.some((s) => s === 403 || s === 429)) throw new SourceUnavailable("needs Reddit access");
    throw new SourceUnavailable(`Reddit didn't answer (${statuses.join(", ")})`);
  }
  return results
    .flat()
    .filter((l) => !/\bW\b|\[W\]\s*$/i.test(l.flair ?? "") && !/^closed|sold/i.test(l.flair ?? ""))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
