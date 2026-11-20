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
};

// ---------- seed (demo profile, editable in-app / by the agent) ----------
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
    { id: "mom", name: "Mom", relation: "mother", interests: ["gardening", "cooking", "Carnatic music"], notes: [] },
    { id: "dad", name: "Dad", relation: "father", interests: ["cricket", "gadgets", "history books"], notes: [] },
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
  ],
  watches: [
    { id: randomUUID(), kind: "game", query: "Hades II", maxPrice: { amount: 20, currency: "USD" }, active: true, createdAt: now() },
    { id: randomUUID(), kind: "game", query: "Baldur's Gate 3", maxPrice: { amount: 35, currency: "USD" }, active: true, createdAt: now() },
    {
      id: randomUUID(),
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
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    cache = seed();
    await persist(cache);
  }
  return cache;
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
    if (db.notifications.some((x) => x.dedupeKey === n.dedupeKey)) return null;
    const full: Notification = { ...n, id: randomUUID(), createdAt: now(), read: false };
    db.notifications.unshift(full);
    db.notifications = db.notifications.slice(0, 200);
    return full;
  });
}

export const newId = () => randomUUID();
