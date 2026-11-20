import { addShippingDays, diffDays, parseIso, toIso, today } from "./dates.js";

// Typical metro-India delivery windows (business days) used ONLY when the retailer page gave no estimate.
const TYPICAL: [RegExp, number, number][] = [
  [/amazon/i, 2, 4],
  [/flipkart/i, 3, 5],
  [/bookswagon/i, 5, 8],
  [/crossword/i, 4, 7],
  [/sapna/i, 3, 6],
  [/olx|quikr|marketplace|reddit|ebay/i, 3, 7],
];
const typical = (retailer: string): [number, number] => TYPICAL.find(([re]) => re.test(retailer))?.slice(1) as [number, number] ?? [4, 7];

export type OfferIn = {
  title: string;
  retailer: string;
  price: number;
  shipping?: number;
  currency?: string;
  condition?: "new" | "used" | "refurbished";
  url?: string;
  imageUrl?: string;
  deliveryDaysMin?: number;
  deliveryDaysMax?: number;
  deliveryBy?: string; // explicit date seen on the retailer page
  priceSource?: string; // where the price was seen
};

export type OfferVerdict = "safe" | "tight" | "late" | "over_budget" | "late_and_over_budget";

export type OfferOut = OfferIn & {
  total: number;
  withinBudget: boolean | null;
  budgetLeft: number | null;
  ordered: string;
  shipsBy: string;
  arrivesEarliest: string;
  arrivesLatest: string;
  deliveryEstimated: boolean;
  spareDays: number | null;
  verdict: OfferVerdict;
  rank: number;
};

export function evaluateOffers(
  offers: OfferIn[],
  opts: { arriveBy?: string; budget?: number; preferUsed?: boolean; now?: Date },
): OfferOut[] {
  const start = today(opts.now);
  const out = offers.map((o) => {
    const total = Math.round((o.price + (o.shipping ?? 0)) * 100) / 100;
    let earliest: Date, latest: Date, estimated = false;
    if (o.deliveryBy) {
      earliest = latest = parseIso(o.deliveryBy);
    } else {
      let min = o.deliveryDaysMin, max = o.deliveryDaysMax;
      if (min === undefined && max === undefined) {
        [min, max] = typical(o.retailer);
        estimated = true;
      }
      earliest = addShippingDays(start, min ?? max!);
      latest = addShippingDays(start, max ?? min!);
    }
    const spare = opts.arriveBy ? diffDays(parseIso(opts.arriveBy), latest) : null;
    const withinBudget = opts.budget !== undefined ? total <= opts.budget : null;
    const late = spare !== null && spare < 0;
    const over = withinBudget === false;
    const verdict: OfferVerdict =
      late && over ? "late_and_over_budget" : late ? "late" : over ? "over_budget" : spare !== null && spare < 2 ? "tight" : "safe";
    return {
      ...o,
      total,
      withinBudget,
      budgetLeft: opts.budget !== undefined ? Math.round((opts.budget - total) * 100) / 100 : null,
      ordered: toIso(start),
      shipsBy: toIso(addShippingDays(start, 1)),
      arrivesEarliest: toIso(earliest),
      arrivesLatest: toIso(latest),
      deliveryEstimated: estimated,
      spareDays: spare,
      verdict,
      rank: 0,
    };
  });
  const order: Record<OfferVerdict, number> = { safe: 0, tight: 1, over_budget: 2, late: 3, late_and_over_budget: 4 };
  out.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      (opts.preferUsed ? Number(b.condition === "used") - Number(a.condition === "used") : 0) ||
      a.total - b.total ||
      a.arrivesLatest.localeCompare(b.arrivesLatest),
  );
  out.forEach((o, i) => (o.rank = i + 1));
  return out;
}
