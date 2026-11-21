import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { upcoming, type Upcoming } from "./occasions.js";
import { getRun, type Run, type RunEvent } from "./runs.js";
import { mutate, readDb, type Db, type IdeasCard } from "./store.js";

// Gift ideas, thought up before you ask. For the occasions coming up soonest (the one on Today's hero first), Xerxes
// runs an "ideas only" turn in the background and keeps the result, so a gift chat or call opens with a few
// directions to pick from instead of a 90-second search. The full search runs once you pick one.

/** What the ideas depend on: when any of it changes (new interests, another budget...), they're thought up again. */
const keyOf = (db: Db, o: Upcoming) =>
  JSON.stringify([2 /* bump to think them up again */, o.label, o.kind, o.budget, o.turningAge ?? null, db.profile.language ?? "en", o.people.map((p) => [p.name, p.relation, p.interests, p.notes])]);

/** The occasions worth having ideas ready for: the one on Today's hero, then the next few coming up. */
const due = (db: Db) => upcoming(db, 60).filter((o) => o.inReminderWindow || o.daysLeft <= 30).slice(0, 4);

/** Saved ideas for an occasion (fresh or not), for a call to open with. */
export const ideasFor = (db: Db, occasionId: string) => db.ideas?.[occasionId];

const inFlight = new Map<string, Promise<void>>();
let queue: Promise<unknown> = Promise.resolve();

/** Thinks up ideas for one occasion. One at a time, so a burst doesn't start several agent runs at once. */
export function refreshIdeas(occasionId: string): Promise<void> {
  const busy = inFlight.get(occasionId);
  if (busy) return busy;
  const job = queue
    .then(() => think(occasionId))
    .catch((e: Error) => console.warn(`[ideas] ${occasionId}: ${e.message}`))
    .finally(() => inFlight.delete(occasionId));
  queue = job;
  inFlight.set(occasionId, job);
  return job;
}

const finished = (run: Run, ms: number) =>
  new Promise<void>((resolve) => {
    if (run.status !== "running") return resolve();
    const stop = () => {
      clearTimeout(timer);
      run.listeners.delete(on);
      resolve();
    };
    const on = (e: RunEvent) => (e.type === "done" || e.type === "error") && stop();
    const timer = setTimeout(stop, ms);
    run.listeners.add(on);
  });

async function think(occasionId: string) {
  const db = await readDb();
  const o = upcoming(db, 400).find((x) => x.id === occasionId);
  if (!o) return;
  const key = keyOf(db, o);
  if (db.ideas?.[occasionId]?.key === key) return; // fresh already (it was queued twice)
  const t0 = Date.now();
  const conversationId = `ideas-${randomUUID()}`;
  const run = await startTurn(
    conversationId,
    `Gift ideas for ${o.label} (occasionId ${o.id}): give me a few different directions to choose from. Ideas only for now, no searching.`,
  );
  await finished(run, 180_000);
  const events = getRun(run.id)?.events ?? run.events;
  const shown = [...events].reverse().find((e): e is Extract<RunEvent, { type: "card" }> => e.type === "card" && e.card.type === "ideas");
  const reply = events.find((e): e is Extract<RunEvent, { type: "message" }> => e.type === "message");
  if (!shown) throw new Error(`no ideas came back (${run.status})`);
  const card = { ...(shown.card as IdeasCard), occasionId: o.id };
  await mutate((d) => {
    (d.ideas ??= {})[o.id] = { text: reply?.text ?? "", card, at: new Date().toISOString(), key };
    delete d.conversations?.[conversationId]; // a background turn, not a chat anyone reopens
  });
  console.log(`[ideas] ${o.label}: ${card.ideas.map((i) => i.title).join(" · ")} (${Math.round((Date.now() - t0) / 1000)}s)`);
}

/** Keeps ideas ready for what's coming up: shortly after start, then every 15 minutes (only what's missing or stale). */
export function startIdeas() {
  const tick = async () => {
    const db = await readDb();
    for (const o of due(db)) if (db.ideas?.[o.id]?.key !== keyOf(db, o)) void refreshIdeas(o.id);
  };
  setTimeout(() => void tick().catch((e: Error) => console.warn(`[ideas] ${e.message}`)), 20_000);
  setInterval(() => void tick().catch((e: Error) => console.warn(`[ideas] ${e.message}`)), 15 * 60_000);
}

export function ideasRoutes(app: Hono) {
  // A gift chat opening on an occasion: the ideas thought up for it, or "pending" while they're on their way.
  // Stale ones (the person's interests changed since) still come back right away while fresh ones are thought up.
  app.get("/api/occasions/:id/ideas", async (c) => {
    const id = c.req.param("id");
    const db = await readDb();
    const o = upcoming(db, 400).find((x) => x.id === id);
    if (!o) return c.json({ error: "That occasion doesn't exist (maybe it was removed)" }, 404);
    const saved = db.ideas?.[id];
    const fresh = saved?.key === keyOf(db, o);
    if (!fresh) void refreshIdeas(id);
    if (!saved) return c.json({ status: "pending" });
    return c.json({ status: "ready", text: saved.text, card: saved.card, at: saved.at, ...(fresh ? {} : { stale: true }) });
  });
}
