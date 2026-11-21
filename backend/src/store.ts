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
  /** The project this item is tracked for (e.g. homelab gear for "Home lab"). */
  projectId?: string;
  active: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  /** Short, user-facing reason the last check failed (cleared on the next good check). */
  lastError?: string;
};

/**
 * A project is a bucket of context for a chain of purchases (a living room makeover, a home lab): how things are
 * now, what was bought, what's planned and what was asked. Xerxes builds on all of it for the next purchase.
 */
export type ProjectIcon = "home" | "sofa" | "server" | "book" | "game" | "gift" | "camera" | "plant" | "fitness" | "travel" | "kitchen" | "other";
export type ProjectEntryKind = "setup" | "plan" | "purchase" | "search";
export type ProjectEntry = {
  id: string;
  /** setup: how things are now · plan: something to get · purchase: something bought · search: something asked */
  kind: ProjectEntryKind;
  text: string;
  price?: Money;
  /** purchases: the day it was bought (YYYY-MM-DD) */
  date?: string;
  url?: string;
  /** searches: what Xerxes came back with last */
  reply?: string;
  /** searches: the chat or call it came from (one search entry per conversation) */
  conversationId?: string;
  at: string;
};
export type Project = {
  id: string;
  name: string;
  icon: ProjectIcon;
  goal?: string;
  budget?: Money;
  status: "active" | "done";
  entries: ProjectEntry[];
  createdAt: string;
  updatedAt: string;
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
  /** language: the code of the language Xerxes talks in (languages.ts); unset = English */
  profile: { name: string; city: string; postalCode: string; country: string; currency: string; language?: string };
  /** Long-term memory by topic: "homelab", "room", "preferences", "gaming", ... */
  memory: Record<string, string[]>;
  people: Person[];
  occasions: Occasion[];
  watches: Watch[];
  projects: Project[];
  notifications: Notification[];
  shortlist: ShortlistItem[];
  /** app conversation id -> Codex thread */
  conversations?: Record<string, { threadId: string; updatedAt: string }>;
  /** app conversation id (chat or voice call) -> the project it belongs to */
  conversationProjects?: Record<string, string>;
  /** Seed watch ids already offered once, so a watch the user removes isn't re-added on the next start. */
  seededWatches?: string[];
  /** Same for seed occasions: a deleted birthday/festival stays deleted. */
  seededOccasions?: string[];
  /** Same for seed projects. */
  seededProjects?: string[];
  /** Same for seed people: someone the user removes stays removed. */
  seededPeople?: string[];
  /** dedupeKeys of finds the user dismissed, so the watcher doesn't announce the same deal again. */
  dismissedFinds?: string[];
  /** Gift ideas thought up ahead for upcoming occasions (ideas.ts), by occasionId. key: what they were based on. */
  ideas?: Record<string, { text: string; card: IdeasCard; at: string; key: string }>;
};

export type Idea = { title: string; why: string; price?: string; emoji?: string };
/** The card a gift chat or call opens on: a few directions to pick from, before any searching. */
export type IdeasCard = { id: string; type: "ideas"; heading: string; ideas: Idea[]; occasionId?: string };

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

const entry = (kind: ProjectEntryKind, text: string, extra: Partial<ProjectEntry> = {}): ProjectEntry => ({ id: randomUUID(), kind, text, at: now(), ...extra });
const bought = (text: string, amount: number, date: string): ProjectEntry =>
  entry("purchase", text, { price: { amount, currency: "INR" }, date, at: `${date}T12:00:00.000Z` });
/** The demo's two projects, matching the two ways people actually shop in chains: a room and a hobby rig. */
const HOMELAB_WATCH_QUERY = "Optiplex micro OR ThinkCentre tiny OR EliteDesk mini";
const seedProjects = (): Project[] => [
  {
    id: "home-lab",
    name: "Home lab",
    icon: "server",
    goal: "A quiet, power-efficient Proxmox box and a NAS for backups, all in an apartment.",
    budget: { amount: 80000, currency: "INR" },
    status: "active",
    entries: [
      entry("setup", "Lives in an apartment, so everything has to be quiet and easy on power."),
      entry("setup", "Wants Proxmox for VMs, a NAS for media and backups, and 10GbE eventually."),
      entry("setup", "Needs 32 GB of RAM for agentic development and containers."),
      bought("Raspberry Pi 5 (8 GB) running Home Assistant", 8400, "2026-07-12"),
      bought("TP-Link 8-port gigabit switch", 1899, "2026-08-03"),
      entry("plan", "Quiet mini PC with 32 GB RAM for Proxmox"),
      entry("plan", "2-bay NAS for backups"),
    ],
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: now(),
  },
  {
    id: "living-room",
    name: "Living room",
    icon: "sofa",
    goal: "A cosy reading room: proper storage for the books and a good reading corner.",
    budget: { amount: 60000, currency: "INR" },
    status: "active",
    entries: [
      entry("setup", "About 14 × 12 ft, with one big north-facing window."),
      entry("setup", "Off-white walls, teak floor and a grey three-seater sofa."),
      entry("setup", "Around 1,000 books, most of them still in boxes."),
      bought("Grey three-seater sofa", 24500, "2026-08-20"),
      bought("Jute rug, 5 × 7 ft", 3200, "2026-09-14"),
      entry("plan", "Tall bookshelf that holds about 1,000 books"),
      entry("plan", "Reading chair and a warm floor lamp"),
    ],
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: now(),
  },
];

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
      query: HOMELAB_WATCH_QUERY,
      maxPrice: { amount: 250, currency: "USD" },
      notes: "Quiet Proxmox node",
      projectId: "home-lab",
      active: true,
      createdAt: now(),
    },
  ],
  projects: seedProjects(),
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
  // people: offered once too (a removed one stays gone); older files get the seed birth years filled in
  db.seededPeople ??= [];
  for (const p of s.people) {
    const have = db.people.find((x) => x.id === p.id);
    if (!db.seededPeople.includes(p.id)) {
      if (!have) db.people.push(p);
      db.seededPeople.push(p.id);
      changed = true;
    } else if (have && !have.birthDate && p.birthDate) {
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
  // projects: offered once too; the homelab watch an older file already has joins its project
  db.projects ??= [];
  db.seededProjects ??= [];
  for (const p of s.projects) {
    if (db.seededProjects.includes(p.id)) continue;
    if (!db.projects.some((x) => x.id === p.id)) db.projects.push(p);
    db.seededProjects.push(p.id);
    changed = true;
    if (p.id === "home-lab")
      for (const w of db.watches)
        if (!w.projectId && w.kind === "hardware" && w.query.toLowerCase() === HOMELAB_WATCH_QUERY.toLowerCase()) w.projectId = p.id;
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

/** "Mom & Dad's anniversary" → "mom-dads-anniversary" */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** A readable id from `base`, with a short random suffix when it's taken. */
export function uniqueId(base: string, taken: (id: string) => boolean) {
  const root = base || "item";
  if (!taken(root)) return root;
  for (;;) {
    const id = `${root}-${newId().slice(0, 4)}`;
    if (!taken(id)) return id;
  }
}
