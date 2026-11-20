import { addDays, diffDays, parseIso, toIso, today } from "./dates.js";
import type { Db, Occasion, Person } from "./store.js";

export type Upcoming = Occasion & {
  people: Person[];
  nextDate: string;
  daysLeft: number;
  arriveBy: string;
  turningAge?: number;
  inReminderWindow: boolean;
};

export function nextOccurrence(o: Occasion, from = today()): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return parseIso(o.date) >= from ? o.date : null;
  const year = from.getUTCFullYear();
  const thisYear = parseIso(`${year}-${o.date}`);
  return toIso(thisYear >= from ? thisYear : parseIso(`${year + 1}-${o.date}`));
}

export function upcoming(db: Db, withinDays = 400, from = today()): Upcoming[] {
  const out: Upcoming[] = [];
  for (const o of db.occasions) {
    const next = nextOccurrence(o, from);
    if (!next) continue;
    const daysLeft = diffDays(parseIso(next), from);
    if (daysLeft > withinDays) continue;
    const people = o.personIds.length ? db.people.filter((p) => o.personIds.includes(p.id)) : db.people;
    const p0 = people[0];
    const turningAge =
      o.kind === "birthday" && p0?.birthDate
        ? parseIso(next).getUTCFullYear() - parseIso(p0.birthDate).getUTCFullYear()
        : undefined;
    out.push({
      ...o,
      people,
      nextDate: next,
      daysLeft,
      arriveBy: toIso(addDays(parseIso(next), -o.bufferDays)),
      turningAge,
      inReminderWindow: daysLeft <= o.remindDaysBefore,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
