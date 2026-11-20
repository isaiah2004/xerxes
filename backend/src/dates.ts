// Calendar dates (YYYY-MM-DD), handled in UTC to avoid timezone drift.
const DAY = 86_400_000;

export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);
export const today = (now = new Date()) => parseIso(toIso(now));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

/** Courier days: skips Sundays. */
export function addShippingDays(start: Date, n: number): Date {
  let d = start;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    if (d.getUTCDay() !== 0) left--;
  }
  return d;
}

export const pretty = (iso: string) =>
  parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
