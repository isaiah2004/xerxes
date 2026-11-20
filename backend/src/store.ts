import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

// ---------- types ----------
export type Money = { amount: number; currency: string };

export type Person = {
  id: string;
  name: string;
  relation: string;
  birthDate?: string; // YYYY-MM-DD
  interests: string[];
  notes: string[];
};

export type Occasion = {
  id: string;
  personIds: string[]; // empty = whole family (festivals)
  kind: "birthday" | "anniversary" | "festival" | "other";
  label: string;
  date: string; // MM-DD (recurring) or YYYY-MM-DD (one-off)
  budget: Money;
  remindDaysBefore: number;
  bufferDays: number; // gift must arrive this many days early
};

export type WatchKind = "game" | "hardware" | "book" | "product";
export type Watch = {
  id: string;
  kind: WatchKind;
  query: string;
  maxPrice?: Money;
  notes?: string;
  active: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  /** Short, user-facing reason the last check failed (cleared on the next good check). */
  lastError?: string;
};

export type Notification = {
  id: string;
  kind: WatchKind | "occasion" | "agent";
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  price?: string;
  createdAt: string;
  read: boolean;
  dedupeKey: string;
};

export type ShortlistItem = {
  id: string;
  forOccasionId?: string;
  title: string;
  source: string;
  url?: string;
  imageUrl?: string;
  total: Money;
  expectedBy?: string;
  verdict?: string;
  reason: string;
  savedAt: string;
};

export type Db = {
  profile: { name: string; city: string; postalCode: string; country: string; currency: string };
  /** Long-term memory by topic: "homelab", "room", "preferences", "gaming", ... */
  memory: Record<string, string[]>;
  people: Person[];
  occasions: Occasion[];
  watches: Watch[];
  notifications: Notification[];
  shortlist: ShortlistItem[];
  /** app conversation id -> Codex thread */
  conversations?: Record<string, { threadId: string; updatedAt: string }>;
  /** Seed watch ids already offered once, so a watch the user removes isn't re-added on the next start. */
  seededWatches?: string[];
  /** Same for seed occasions: a deleted birthday/festival stays deleted. */
  seededOccasions?: string[];
  /** dedupeKeys of finds the user dismissed, so the watcher doesn't announce the same deal again. */
  dismissedFinds?: string[];
};

// ---------- seed (demo profile, editable in-app / by the agent) ----------
const occ = (
  id: string,
  label: string,
  kind: Occasion["kind"],
  date: string,
  budget: number,
  personIds: string[] = [],
  remindDaysBefore = 21,
  bufferDays = 2,
): Occasion => ({ id, personIds, kind, label, date, budget: { amount: budget, currency: "INR" }, remindDaysBefore, bufferDays });

// Birthdays + the festivals people actually shop for. Lunar festivals are pinned to their 2027 dates.
const moreOccasions: Occasion[] = [
  occ("rohan-birthday", "Rohan's birthday", "birthday", "12-09", 1500, ["rohan"]),
  occ("dad-birthday", "Dad's birthday", "birthday", "12-19", 3000, ["dad"]),
  occ("new-year", "New Year", "festival", "01-01", 2000, [], 21, 3),
  occ("sankranti-2027", "Sankranti", "festival", "2027-01-15", 2500, [], 21, 3),
  occ("mom-birthday", "Mom's birthday", "birthday", "01-18", 3000, ["mom"]),
  occ("parents-anniversary", "Mom & Dad's anniversary", "anniversary", "02-06", 4000, ["mom", "dad"]),
  occ("eid-2027", "Eid al-Fitr", "festival", "2027-03-10", 2000, [], 21, 3),
  occ("holi-2027", "Holi", "festival", "2027-03-22", 1500, [], 21, 3),
  occ("mothers-day-2027", "Mother's Day", "festival", "2027-05-09", 2000, ["mom"]),
  occ("fathers-day-2027", "Father's Day", "festival", "2027-06-20", 2000, ["dad"]),
  occ("raksha-bandhan-2027", "Raksha Bandhan", "festival", "2027-08-17", 2500, ["cousin-sister"], 21, 3),
  occ("ganesh-chaturthi-2027", "Ganesh Chaturthi", "festival", "2027-09-04", 2000, [], 21, 3),
];
const now = () => new Date().toISOString();
const seed = (): Db => ({
  profile: { name: "Isaiah", city: "Bengaluru", postalCode: "560001", country: "IN", currency: "INR" },
  memory: {
    homelab: [
      "Building a home lab; prefers quiet, power-efficient gear (lives in an apartment).",
      "Interested in Proxmox, a NAS for media/backups, and 10GbE eventually.",
      "Open to second-hand enterprise hardware if the price is right.",
    ],
    preferences: ["Prefers second-hand when condition is good and savings are real.", "Hardcover books for gifts."],
    gaming: ["Plays on PC (Steam). Likes roguelikes, strategy and story-driven RPGs."],
  },
  people: [
    {
      id: "cousin-sister",
      name: "Cousin sister",
      relation: "cousin sister",
      birthDate: "2012-12-02",
      interests: ["animals", "wildlife", "nature"],
      notes: ["Really nerdy about animals — loves facts and cool visuals."],
    },
    { id: "mom", name: "Mom", relation: "mother", birthDate: "1972-01-18", interests: ["gardening", "cooking", "Carnatic music"], notes: [] },
    { id: "dad", name: "Dad", relation: "father", birthDate: "1969-12-19", interests: ["cricket", "gadgets", "history books"], notes: [] },
    {
      id: "rohan",
      name: "Rohan",
      relation: "best friend",
      birthDate: "2001-12-09",
      interests: ["photography", "trekking", "specialty coffee"],
      notes: ["Just got into film photography."],
    },
  ],
  occasions: [
    {
      id: "cousin-sister-birthday",
      personIds: ["cousin-sister"],
      kind: "birthday",
      label: "Cousin sister's birthday",
      date: "12-02",
      budget: { amount: 2000, currency: "INR" },
      remindDaysBefore: 21,
      bufferDays: 2,
    },
    {
      id: "christmas",
      personIds: [],
      kind: "festival",
      label: "Christmas",
      date: "12-25",
      budget: { amount: 6000, currency: "INR" },
      remindDaysBefore: 30,
      bufferDays: 3,
    },
    {
      id: "diwali-2027",
      personIds: [],
      kind: "festival",
      label: "Diwali",
      date: "2027-10-29",
      budget: { amount: 10000, currency: "INR" },
      remindDaysBefore: 30,
      bufferDays: 4,
    },
    ...moreOccasions,
  ],
  watches: [
    { id: "watch-hades-2", kind: "game", query: "Hades II", maxPrice: { amount: 20, currency: "USD" }, active: true, createdAt: now() },
    { id: "watch-bg3", kind: "game", query: "Baldur's Gate 3", maxPrice: { amount: 35, currency: "USD" }, active: true, createdAt: now() },
    { id: "watch-dead-cells", kind: "game", query: "Dead Cells", maxPrice: { amount: 15, currency: "USD" }, active: true, createdAt: now() },
    { id: "watch-outer-wilds", kind: "game", query: "Outer Wilds", maxPrice: { amount: 12, currency: "USD" }, active: true, createdAt: now() },
    {
      id: "watch-homelab-minis",
      kind: "hardware",
      query: "Optiplex micro OR ThinkCentre tiny OR EliteDesk mini",
      maxPrice: { amount: 250, currency: "USD" },
      notes: "Quiet Proxmox node",
      active: true,
      createdAt: now(),
    },
  ],
  notifications: [],
  shortlist: [],
});

// ---------- persistence (JSON file in a Docker volume) ----------
const file = () => path.join(env.dataDir, "xerxes.json");
let cache: Db | null = null;
let queue: Promise<unknown> = Promise.resolve();

export async function readDb(): Promise<Db> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(file(), "utf8")) as Db;
    if (mergeSeed(cache)) await persist(cache);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    cache = seed();
    await persist(cache);
  }
  return cache;
}

/** Adds seed people/occasions that an older data file doesn't have yet (never overwrites user edits). */
function mergeSeed(db: Db): boolean {
  const s = seed();
  let changed = false;
  for (const p of s.people) {
    const have = db.people.find((x) => x.id === p.id);
    if (!have) {
      db.people.push(p);
      changed = true;
    } else if (!have.birthDate && p.birthDate) {
      have.birthDate = p.birthDate;
      changed = true;
    }
  }
  // occasions: offer each seed occasion once, so one the user deletes isn't re-added on the next start
  db.seededOccasions ??= [];
  for (const o of s.occasions) {
    if (db.seededOccasions.includes(o.id)) continue;
    if (!db.occasions.some((x) => x.id === o.id)) db.occasions.push(o);
    db.seededOccasions.push(o.id);
    changed = true;
  }
  // watches: offer each seed watch once (older data files have the same queries under random ids)
  const same = (a: Watch, b: Watch) => a.kind === b.kind && a.query.toLowerCase() === b.query.toLowerCase();
  db.seededWatches ??= [];
  for (const w of s.watches) {
    if (db.seededWatches.includes(w.id)) continue;
    if (!db.watches.some((x) => same(x, w))) db.watches.push(w);
    db.seededWatches.push(w.id);
    changed = true;
  }
  return changed;
}

async function persist(db: Db) {
  await fs.mkdir(env.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file());
}

/** Serialised read-modify-write. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb();
    const out = await fn(db);
    await persist(db);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Adds a notification unless one with the same dedupeKey exists. Returns it if new. */
export function notify(n: Omit<Notification, "id" | "createdAt" | "read">): Promise<Notification | null> {
  return mutate((db) => {
    if (db.notifications.some((x) => x.dedupeKey === n.dedupeKey) || db.dismissedFinds?.includes(n.dedupeKey)) return null;
    const full: Notification = { ...n, id: randomUUID(), createdAt: now(), read: false };
    db.notifications.unshift(full);
    db.notifications = db.notifications.slice(0, 200);
    return full;
  });
}

export const newId = () => randomUUID();
