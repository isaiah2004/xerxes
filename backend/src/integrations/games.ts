// Cross-store PC game deals via CheapShark (Steam, GOG, Epic, Humble, Fanatical, GMG, ...). Free, no key.
const BASE = "https://www.cheapshark.com/api/1.0";
// CheapShark rejects missing/generic User-Agents (HTTP 400). Generic client name by default; override if you like.
const headers = { "User-Agent": process.env.CHEAPSHARK_USER_AGENT?.trim() || "deal-radar/1.0 (open-source shopping assistant)" };

let storeNames: Record<string, string> | null = null;
async function stores(): Promise<Record<string, string>> {
  if (storeNames) return storeNames;
  try {
    const r = await fetch(`${BASE}/stores`, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return {}; // retry next time
    const j = (await r.json()) as { storeID: string; storeName: string }[];
    storeNames = Object.fromEntries(j.map((s) => [s.storeID, s.storeName]));
  } catch {
    return {};
  }
  return storeNames;
}

/** How a deal's title relates to what was asked for. Only "game" and "edition" count as the thing itself. */
export type TitleMatch = "game" | "edition" | "related" | "unrelated";

/** "Baldur's Gate 3" → "baldurs gate 3", so store spellings line up. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const EDITION = /^(digital )?(deluxe|complete|definitive|ultimate|gold|goty|game of the year|enhanced|remastered|directors cut|anniversary)( edition)?$|^edition$/;

export function titleMatch(query: string, title: string): TitleMatch {
  const q = norm(query);
  const t = norm(title);
  if (t === q) return "game";
  // "Hades II" for "Hades", "... Soundtrack", "... upgrade" mention the game but aren't it
  if (t.startsWith(`${q} `)) return EDITION.test(t.slice(q.length + 1)) ? "edition" : "related";
  return ` ${t} `.includes(` ${q} `) ? "related" : "unrelated";
}
const rank: Record<TitleMatch, number> = { game: 0, edition: 1, related: 2, unrelated: 3 };

export type GameDeal = {
  title: string;
  match: TitleMatch;
  store: string;
  salePrice: number;
  normalPrice: number;
  savingsPct: number;
  currency: "USD";
  dealUrl: string;
  imageUrl?: string;
  metacritic?: number;
  steamRating?: string;
};

/** Deals for a title, the game itself first (then its editions), cheapest first within each. */
export async function findGameDeals(
  title: string,
  opts: { maxPrice?: number; limit?: number; onSaleOnly?: boolean } = {},
): Promise<GameDeal[]> {
  const url = new URL(`${BASE}/deals`);
  url.searchParams.set("title", title);
  url.searchParams.set("sortBy", "Price");
  url.searchParams.set("pageSize", "60"); // CheapShark's title search is fuzzy ("Hades" → "Shades of …"), so fetch wide and rank here
  if (opts.onSaleOnly) url.searchParams.set("onSale", "1");
  if (opts.maxPrice !== undefined) url.searchParams.set("upperPrice", String(opts.maxPrice));
  const [r, names] = await Promise.all([fetch(url, { headers, signal: AbortSignal.timeout(8000) }), stores()]);
  if (!r.ok) throw new Error(`CheapShark ${r.status}`);
  const j = (await r.json()) as any[];
  const deals: GameDeal[] = j.map((d) => ({
    title: d.title,
    match: titleMatch(title, d.title),
    store: names[d.storeID] ?? `store ${d.storeID}`,
    salePrice: Number(d.salePrice),
    normalPrice: Number(d.normalPrice),
    savingsPct: Math.round(Number(d.savings)),
    currency: "USD" as const,
    dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
    imageUrl: d.thumb,
    metacritic: Number(d.metacriticScore) || undefined,
    steamRating: d.steamRatingText ?? undefined,
  }));
  const relevant = deals.filter((d) => d.match !== "unrelated");
  return (relevant.length ? relevant : deals)
    .sort((a, b) => rank[a.match] - rank[b.match] || a.salePrice - b.salePrice)
    .slice(0, opts.limit ?? 10);
}
