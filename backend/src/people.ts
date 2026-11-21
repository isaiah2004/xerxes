import type { Hono } from "hono";
import { z } from "zod";
import { fail, HttpError, parse } from "./http.js";
import { mutate, readDb, slug, uniqueId, type Db, type Person } from "./store.js";

// The people you shop for. Added in the app (the People tab, or right inside a calendar event while you add it)
// or by Xerxes when you mention someone new. Their interests and notes are what every gift pick starts from.

const name = z.string().trim().min(1, "add their name").max(60);
const relation = z.string().trim().max(40);
const interests = z.array(z.string().trim().min(1).max(40)).max(12);
const notes = z.array(z.string().trim().min(1).max(200)).max(12);
const personCreate = z.object({ name, relation: relation.default(""), interests: interests.default([]), notes: notes.default([]) });
const personPatch = z
  .object({ name, relation, interests, notes })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

/** Case-insensitive, first spelling wins: ["Cricket", "cricket"] -> ["Cricket"]. */
export const distinct = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

/** Someone already saved under that name. Names are how you (and Xerxes) refer to people, so they stay unique. */
export const sameName = (db: Db, n: string, exceptId?: string) =>
  db.people.find((p) => p.id !== exceptId && p.name.trim().toLowerCase() === n.trim().toLowerCase());

export function addPerson(db: Db, p: { name: string; relation?: string; interests?: string[]; notes?: string[] }): Person {
  const person: Person = {
    // a removed seed person's id stays retired, like deleted seed occasions
    id: uniqueId(slug(p.name) || "person", (id) => db.people.some((x) => x.id === id) || !!db.seededPeople?.includes(id)),
    name: p.name,
    relation: p.relation ?? "",
    interests: distinct(p.interests ?? []),
    notes: distinct(p.notes ?? []),
  };
  db.people.push(person);
  return person;
}

/** Takes someone off every occasion; a birthday or anniversary left with nobody goes too. Returns what went. */
function forget(db: Db, id: string): string[] {
  const gone: string[] = [];
  for (const o of db.occasions) o.personIds = o.personIds.filter((x) => x !== id);
  db.occasions = db.occasions.filter((o) => {
    const orphan = (o.kind === "birthday" || o.kind === "anniversary") && !o.personIds.length;
    if (orphan) {
      gone.push(o.label);
      db.notifications = db.notifications.filter((n) => !n.dedupeKey.startsWith(`occ:${o.id}:`));
    }
    return !orphan;
  });
  db.people = db.people.filter((p) => p.id !== id);
  return gone;
}

export function peopleRoutes(app: Hono) {
  app.get("/api/people", async (c) => c.json((await readDb()).people));

  app.post("/api/people", async (c) => {
    try {
      const b = await parse(c, personCreate);
      const p = await mutate((db) => {
        const have = sameName(db, b.name);
        if (have) throw new HttpError(409, `${have.name} is already in your people`);
        return addPerson(db, b);
      });
      return c.json(p, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch("/api/people/:id", async (c) => {
    try {
      const b = await parse(c, personPatch);
      const p = await mutate((db) => {
        const p = db.people.find((x) => x.id === c.req.param("id"));
        if (!p) throw new HttpError(404, "That person isn't in your people any more (maybe they were removed)");
        if (b.name !== undefined && b.name !== p.name) {
          const have = sameName(db, b.name, p.id);
          if (have) throw new HttpError(409, `${have.name} is already in your people`);
          // "Cousin sister's birthday" follows a rename to "Ananya's birthday"
          for (const o of db.occasions) if (o.personIds.includes(p.id) && o.label.includes(p.name)) o.label = o.label.replace(p.name, b.name);
          p.name = b.name;
        }
        if (b.relation !== undefined) p.relation = b.relation;
        if (b.interests) p.interests = distinct(b.interests);
        if (b.notes) p.notes = distinct(b.notes);
        return p;
      });
      return c.json(p);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete("/api/people/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const removedOccasions = await mutate((db) => {
        if (!db.people.some((p) => p.id === id)) throw new HttpError(404, "That person isn't in your people any more (maybe they were removed)");
        return forget(db, id);
      });
      return c.json({ ok: true, id, removedOccasions });
    } catch (e) {
      return fail(c, e);
    }
  });
}
