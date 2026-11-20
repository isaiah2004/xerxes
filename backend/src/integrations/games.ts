// Cross-store PC game deals via CheapShark (Steam, GOG, Epic, Humble, Fanatical, GMG, ...). Free, no key.
const BASE = "https://www.cheapshark.com/api/1.0";

let storeNames: Record<string, string> | null = null;
async function stores(): Promise<Record<string, string>> {
  if (storeNames) return storeNames;
  try {
    const r = await fetch(`${BASE}/stores`, { signal: AbortSignal.timeout(6000) });
    const j = (await r.json()) as { storeID: string; storeName: string }[];
    storeNames = Object.fromEntries(j.map((s) => [s.storeID, s.storeName]));
  } catch {
    storeNames = {};
  }
  return storeNames;
}

export type GameDeal = {
  title: string;
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

export async function findGameDeals(title: string, opts: { maxPrice?: number; limit?: number } = {}): Promise<GameDeal[]> {
  const url = new URL(`${BASE}/deals`);
  url.searchParams.set("title", title);
  url.searchParams.set("sortBy", "Price");
  url.searchParams.set("pageSize", String(opts.limit ?? 10));
  if (opts.maxPrice !== undefined) url.searchParams.set("upperPrice", String(opts.maxPrice));
  const [r, names] = await Promise.all([fetch(url, { signal: AbortSignal.timeout(8000) }), stores()]);
  if (!r.ok) throw new Error(`CheapShark ${r.status}`);
  const j = (await r.json()) as any[];
  return j.map((d) => ({
    title: d.title,
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
}
