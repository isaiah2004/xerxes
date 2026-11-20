const DAY = 86_400_000;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const shortDate = (iso: string) =>
  parse(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayDate = (iso: string) =>
  parse(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const weekdayDay = (iso: string) =>
  parse(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

export const weekdayShort = (iso: string) => parse(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
export const dayNum = (iso: string) => String(parse(iso).getUTCDate());

export const monthShort = (iso: string) => parse(iso).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
export const monthTitle = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const isoOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Pronouns from a relation like "cousin sister" or "father"; anything else is they/them. */
export function pronounsFor(relation?: string) {
  const r = (relation ?? "").toLowerCase();
  if (/\b(sister|mother|mom|mum|daughter|aunt|niece|wife|girlfriend|grandmother|grandma)\b/.test(r))
    return { subj: "she", obj: "her", is: "She's", will: "she'll" };
  if (/\b(brother|father|dad|son|uncle|nephew|husband|boyfriend|grandfather|grandpa)\b/.test(r))
    return { subj: "he", obj: "him", is: "He's", will: "he'll" };
  return { subj: "they", obj: "them", is: "They're", will: "they'll" };
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const addDaysIso = (iso: string, n: number) => new Date(parse(iso).getTime() + n * DAY).toISOString().slice(0, 10);

export function money(amount: number | undefined, currency = "INR") {
  if (amount === undefined || Number.isNaN(amount)) return "—";
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  if (currency === "USD") return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${currency} ${amount.toLocaleString()}`;
}

export function greeting(name: string, d = new Date()) {
  const h = d.getHours();
  return `${h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"}, ${name}`;
}

export const longToday = (d = new Date()) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
