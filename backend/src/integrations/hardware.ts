// Second-hand hardware listings from r/homelabsales (+ r/hardwareswap) via Reddit's public JSON.
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
  const results = await Promise.all(
    subs.map(async (sub) => {
      const url = new URL(`https://www.reddit.com/r/${sub}/search.json`);
      url.searchParams.set("q", query);
      url.searchParams.set("restrict_sr", "1");
      url.searchParams.set("sort", "new");
      url.searchParams.set("t", "month");
      url.searchParams.set("limit", String(opts.limit ?? 15));
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
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
        return [];
      }
    }),
  );
  return results
    .flat()
    .filter((l) => !/\bW\b|\[W\]\s*$/i.test(l.flair ?? "") && !/^closed|sold/i.test(l.flair ?? ""))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
