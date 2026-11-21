import type { Hono } from "hono";
import { z } from "zod";
import { addDays, parseIso, toIso, today } from "./dates.js";
import { currency, fail, HttpError, parse } from "./http.js";
import { nextOccurrence } from "./occasions.js";
import { addPerson, sameName } from "./people.js";
import { touchProject } from "./projects.js";
import { mutate, newId, slug, uniqueId, type Db, type Occasion, type Person, type Watch } from "./store.js";

// "Manage it yourself": the app's own add / edit / delete for tracked items (watches), the Calendar (occasions)
// and dismissing Fresh finds. Projects have their own routes in projects.ts. The agent keeps its own tools in
// mcp.ts; all of them write the same store.

// ---------------------------------------------------------------- watches (tracked items)
const target = z.object({ amount: z.number().positive("a target price must be above 0").max(100_000_000), currency });
const watchCreate = z.object({
  kind: z.enum(["game", "hardware", "book", "product"]),
  query: z.string().trim().min(1, "say what to track").max(160),
  maxPrice: target.optional(),
  notes: z.string().trim().max(200).optional(),
  projectId: z.string().min(1).optional(),
});
const watchPatch = z
  .object({
    active: z.boolean(),
    query: z.string().trim().min(1, "say what to track").max(160),
    maxPrice: target.nullable(), // null clears the target
    notes: z.string().trim().max(200).nullable(),
    projectId: z.string().min(1).nullable(), // null takes it out of its project
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

function projectFor(db: Db, id: string) {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw new HttpError(400, "projectId: that project doesn't exist (maybe it was deleted)");
  return p;
}

const sameWatch = (a: Pick<Watch, "kind" | "query">, b: Pick<Watch, "kind" | "query">) =>
  a.kind === b.kind && a.query.trim().toLowerCase() === b.query.trim().toLowerCase();

function findWatch(db: Db, id: string) {
  const w = db.watches.find((x) => x.id === id);
  if (!w) throw new HttpError(404, "That watch doesn't exist (maybe already removed)");
  return w;
}

// ---------------------------------------------------------------- occasions (Calendar)
const MMDD = /^(\d{2})-(\d{2})$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** One-off dates further out than the feed's 400-day window would never show on the calendar. */
const HORIZON_DAYS = 400;

/** MM-DD (every year; 02-29 allowed) or a real YYYY-MM-DD (once). */
function validDate(s: string) {
  const r = MMDD.exec(s);
  if (r) {
    const m = Number(r[1]);
    const d = Number(r[2]);
    return m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN[m - 1];
  }
  return YMD.test(s) && !Number.isNaN(parseIso(s).getTime()) && toIso(parseIso(s)) === s;
}

const occasionFields = {
  kind: z.enum(["birthday", "anniversary", "festival", "other"]),
  label: z.string().trim().min(1, "give it a title").max(80),
  date: z.string().trim().refine(validDate, "use MM-DD (every year) or YYYY-MM-DD (once)"),
  personIds: z.array(z.string().min(1)).max(12),
  /** Someone Xerxes doesn't know yet: remembered as a person so the occasion behaves like the seeded ones. */
  newPerson: z.object({
    name: z.string().trim().min(1, "add their name").max(60),
    relation: z.string().trim().max(40).default(""),
  }),
  budget: z.object({ amount: z.number().min(0).max(100_000_000), currency }),
  remindDaysBefore: z.number().int().min(0).max(365),
  bufferDays: z.number().int().min(0).max(30),
};
const occasionCreate = z.object({
  ...occasionFields,
  personIds: occasionFields.personIds.default([]),
  newPerson: occasionFields.newPerson.optional(),
  budget: z.object({ amount: z.number().min(0).max(100_000_000), currency: currency.default("INR") }),
  remindDaysBefore: occasionFields.remindDaysBefore.default(21),
  bufferDays: occasionFields.bufferDays.optional(),
  /** Optional fixed id, so an undo of a delete can restore the same occasion. */
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "lowercase letters, digits and dashes")
    .optional(),
});
const occasionPatch = z
  .object(occasionFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

/** Reuses a known person with that name, otherwise remembers a new one (no birth year: we only know the day). */
function personFor(db: Db, np: { name: string; relation: string }): Person {
  return sameName(db, np.name) ?? addPerson(db, { name: np.name, relation: np.relation || "friend" });
}

/**
 * Shared rules for create + edit, checked before anything is written. Birthdays and anniversaries come back
 * every year like the seeded ones, so their date is stored as MM-DD.
 */
function normalise(db: Db, o: Occasion, addsPerson: boolean): Occasion {
  const unknown = o.personIds.find((id) => !db.people.some((p) => p.id === id));
  if (unknown) throw new HttpError(400, `personIds: unknown person "${unknown}"`);
  const yearly = o.kind === "birthday" || o.kind === "anniversary";
  if (yearly && !o.personIds.length && !addsPerson)
    throw new HttpError(400, `${o.kind === "birthday" ? "A birthday" : "An anniversary"} needs a person: pick someone or add their name`);
  const date = yearly ? o.date.slice(-5) : o.date;
  if (YMD.test(date)) {
    if (parseIso(date) < today()) throw new HttpError(400, "That date has already passed");
    if (parseIso(date) > addDays(today(), HORIZON_DAYS)) throw new HttpError(400, "Pick a date within the next 13 months");
  }
  return { ...o, date };
}

const withNext = (o: Occasion) => ({ ...o, nextDate: nextOccurrence(o) });

// ---------------------------------------------------------------- routes
export function manageRoutes(app: Hono) {
  // ---- Tracking: items (watches)
  app.post("/api/watches", async (c) => {
    try {
      const b = await parse(c, watchCreate);
      const w = await mutate((db) => {
        const dupe = db.watches.find((x) => sameWatch(x, b));
        if (dupe) throw new HttpError(409, `Already tracking “${dupe.query}”${dupe.active ? "" : " (paused)"}`);
        const project = b.projectId ? projectFor(db, b.projectId) : undefined;
        const w: Watch = {
          id: newId(),
          kind: b.kind,
          query: b.query,
          ...(b.maxPrice ? { maxPrice: b.maxPrice } : {}),
          ...(b.notes ? { notes: b.notes } : {}),
          ...(project ? { projectId: project.id } : {}),
          active: true,
          createdAt: new Date().toISOString(),
        };
        db.watches.unshift(w);
        if (project) touchProject(project);
        return w;
      });
      return c.json(w, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch("/api/watches/:id", async (c) => {
    try {
      const b = await parse(c, watchPatch);
      const w = await mutate((db) => {
        const w = findWatch(db, c.req.param("id"));
        const query = b.query;
        if (query !== undefined && db.watches.some((x) => x !== w && sameWatch(x, { kind: w.kind, query })))
          throw new HttpError(409, `Already tracking “${query}”`);
        if (b.active !== undefined) w.active = b.active;
        if (query !== undefined && query !== w.query) {
          w.query = query;
          delete w.lastCheckedAt; // a new search starts fresh
          delete w.lastError;
        }
        if (b.maxPrice === null) delete w.maxPrice;
        else if (b.maxPrice) w.maxPrice = b.maxPrice;
        if (b.notes === null || b.notes === "") delete w.notes;
        else if (b.notes) w.notes = b.notes;
        if (b.projectId === null) delete w.projectId;
        else if (b.projectId) w.projectId = projectFor(db, b.projectId).id;
        return w;
      });
      return c.json(w);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete("/api/watches/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await mutate((db) => {
        findWatch(db, id);
        // seed watches are tombstoned in db.seededWatches, so a removed one stays gone
        db.watches = db.watches.filter((x) => x.id !== id);
      });
      return c.json({ ok: true, id });
    } catch (e) {
      return fail(c, e);
    }
  });

  // ---- Calendar: occasions
  app.post("/api/occasions", async (c) => {
    try {
      const b = await parse(c, occasionCreate);
      const o = await mutate((db) => {
        if (b.id && db.occasions.some((x) => x.id === b.id)) throw new HttpError(409, `id "${b.id}" is already used`);
        const draft = normalise(
          db,
          {
            id: b.id ?? uniqueId(slug(b.label), (id) => db.occasions.some((x) => x.id === id) || !!db.seededOccasions?.includes(id)),
            personIds: [...new Set(b.personIds)],
            kind: b.kind,
            label: b.label,
            date: b.date,
            budget: b.budget,
            remindDaysBefore: b.remindDaysBefore,
            bufferDays: b.bufferDays ?? (b.kind === "festival" ? 3 : 2), // same lead time as the seeded ones
          },
          !!b.newPerson,
        );
        if (b.newPerson) {
          const p = personFor(db, b.newPerson);
          if (!draft.personIds.includes(p.id)) draft.personIds.push(p.id);
        }
        db.occasions.push(draft);
        return draft;
      });
      return c.json(withNext(o), 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch("/api/occasions/:id", async (c) => {
    try {
      const { newPerson, ...fields } = await parse(c, occasionPatch);
      const o = await mutate((db) => {
        const cur = db.occasions.find((x) => x.id === c.req.param("id"));
        if (!cur) throw new HttpError(404, "That occasion doesn't exist (maybe already removed)");
        const next = normalise(db, { ...cur, ...fields, personIds: [...new Set(fields.personIds ?? cur.personIds)] }, !!newPerson);
        if (newPerson) {
          const p = personFor(db, newPerson);
          if (!next.personIds.includes(p.id)) next.personIds.push(p.id);
        }
        // a moved date gets a fresh reminder for the new day
        if (next.date !== cur.date) db.notifications = db.notifications.filter((n) => !n.dedupeKey.startsWith(`occ:${cur.id}:`));
        Object.assign(cur, next);
        return cur;
      });
      return c.json(withNext(o));
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete("/api/occasions/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const removed = await mutate((db) => {
        const o = db.occasions.find((x) => x.id === id);
        if (!o) throw new HttpError(404, "That occasion doesn't exist (maybe already removed)");
        // a seed occasion's id stays in db.seededOccasions, so mergeSeed won't bring it back
        db.occasions = db.occasions.filter((x) => x.id !== id);
        db.notifications = db.notifications.filter((n) => !n.dedupeKey.startsWith(`occ:${id}:`));
        return o;
      });
      // the removed occasion comes back so the app can offer an undo (POST it again with the same id)
      return c.json({ ok: true, id, removed });
    } catch (e) {
      return fail(c, e);
    }
  });

  // ---- Fresh finds: dismissed = gone from the feed, and the watcher won't re-announce the same deal
  app.delete("/api/notifications/:id", async (c) => {
    const id = c.req.param("id");
    const found = await mutate((db) => {
      const n = db.notifications.find((x) => x.id === id);
      if (!n) return false;
      db.notifications = db.notifications.filter((x) => x.id !== id);
      db.dismissedFinds = [n.dedupeKey, ...(db.dismissedFinds ?? []).filter((k) => k !== n.dedupeKey)].slice(0, 500);
      return true;
    });
    return found ? c.json({ ok: true, id }) : c.json({ error: "That find doesn't exist (maybe already dismissed)" }, 404);
  });
}
