import type { Hono } from "hono";
import { z } from "zod";
import { parseIso, toIso, today } from "./dates.js";
import { currency, fail, HttpError, parse } from "./http.js";
import { mutate, newId, readDb, slug, uniqueId, type Db, type Project, type ProjectEntry } from "./store.js";

// Projects: buckets of context for a chain of purchases (a living room makeover, a home lab). What the user has,
// what they bought, what they plan and what they asked all shape the next purchase. The app manages projects
// through the routes below; the agent reads and adds to them with its tools (mcp.ts); and every chat or call
// that belongs to a project is logged in it as a search (agent.ts).

export const PROJECT_ICONS = ["home", "sofa", "server", "book", "game", "gift", "camera", "plant", "fitness", "travel", "kitchen", "other"] as const;

export const touchProject = (p: Project) => {
  p.updatedAt = new Date().toISOString();
};

/** A project counts money in its budget's currency, else the user's. */
const currencyOf = (db: Db, p: Project) => p.budget?.currency ?? db.profile.currency;

export function projectStats(db: Db, p: Project) {
  const cur = currencyOf(db, p);
  const counts = { setup: 0, plan: 0, purchase: 0, search: 0, watch: 0 };
  let spent = 0;
  for (const e of p.entries) {
    counts[e.kind]++;
    if (e.kind === "purchase" && e.price?.currency === cur) spent += e.price.amount;
  }
  const watches = db.watches.filter((w) => w.projectId === p.id);
  counts.watch = watches.length;
  return { spent: { amount: spent, currency: cur }, counts, nextPlan: p.entries.find((e) => e.kind === "plan")?.text, watches };
}

/** For lists: everything but the entries themselves. */
export function projectSummary(db: Db, p: Project) {
  const { entries: _entries, ...rest } = p;
  const { watches: _watches, ...stats } = projectStats(db, p);
  return { ...rest, ...stats };
}

export const projectDetail = (db: Db, p: Project) => ({ ...p, ...projectStats(db, p) });

/** Active first, most recently touched first. */
export const listProjects = (db: Db) =>
  [...db.projects].sort((a, b) => (a.status === b.status ? b.updatedAt.localeCompare(a.updatedAt) : a.status === "active" ? -1 : 1));

/** What the agent gets about a project: compact, and in the words the user would use. */
export function projectContext(db: Db, p: Project) {
  const { spent, watches } = projectStats(db, p);
  const of = (k: ProjectEntry["kind"]) => p.entries.filter((e) => e.kind === k);
  return {
    projectId: p.id,
    name: p.name,
    goal: p.goal,
    status: p.status,
    budget: p.budget,
    spent,
    left: p.budget ? { amount: p.budget.amount - spent.amount, currency: p.budget.currency } : undefined,
    setup: of("setup").map((e) => e.text),
    purchases: of("purchase").map((e) => ({ entryId: e.id, item: e.text, price: e.price, date: e.date })),
    plans: of("plan").map((e) => ({ entryId: e.id, item: e.text, price: e.price })),
    earlierSearches: of("search")
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((e) => ({ asked: e.text, answer: e.reply, date: e.at.slice(0, 10) })),
    tracking: watches.map((w) => ({ item: w.query, kind: w.kind, maxPrice: w.maxPrice, active: w.active })),
  };
}

// ---------------------------------------------------------------- conversations that belong to a project
export function projectOf(db: Db, conversationId: string) {
  const id = db.conversationProjects?.[conversationId];
  return id ? db.projects.find((p) => p.id === id) : undefined;
}

/** Ties a chat or call to a project, so each turn gets its context and lands in its searches. */
export function bindConversation(conversationId: string, projectId: string) {
  return mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (p) (db.conversationProjects ??= {})[conversationId] = p.id;
    return p;
  });
}

const ACK = /^(yes|yeah|yep|yup|sure|ok(ay)?|no|nope|nah|thanks?|thank you|go ahead|do it|sounds good|perfect|great|cool|not now)\b/i;
/** "Find a quiet mini PC" is a search worth keeping; "yes, go ahead" isn't. */
const worthLogging = (text: string) => text.split(/\s+/).length >= 3 && !(ACK.test(text) && text.length < 40);
const MAX_SEARCHES = 30;

/** One search per conversation: its first real ask, kept fresh with the latest answer. Returns the entry id. */
export function logSearch(projectId: string, conversationId: string, said: string) {
  const text = said.replace(/\[context:[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  return mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return undefined;
    let e = p.entries.find((x) => x.kind === "search" && x.conversationId === conversationId);
    if (e) e.at = new Date().toISOString();
    else {
      if (!worthLogging(text)) return undefined;
      e = { id: newId(), kind: "search", text, conversationId, at: new Date().toISOString() };
      p.entries.push(e);
      const searches = p.entries.filter((x) => x.kind === "search");
      if (searches.length > MAX_SEARCHES) {
        const drop = new Set(searches.slice(0, searches.length - MAX_SEARCHES).map((x) => x.id));
        p.entries = p.entries.filter((x) => !drop.has(x.id));
      }
    }
    touchProject(p);
    return e.id;
  });
}

/** Chat replies use a little markdown (bold, links, code); a search's stored answer is plain text. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The answer shown under a search: the first reply, then only a new pick replaces it, so follow-ups like
 * "save it to my plan" or "track it" don't bury what Xerxes actually found.
 */
export function setSearchReply(projectId: string, entryId: string, reply: string, newPick: boolean) {
  return mutate((db) => {
    const e = db.projects.find((x) => x.id === projectId)?.entries.find((x) => x.id === entryId);
    if (e && (!e.reply || newPick)) e.reply = plain(reply).slice(0, 280);
  });
}

/** Adds a setup note, plan or purchase (shared by the app's route and the agent's tool). */
export function addEntry(
  p: Project,
  e: { kind: "setup" | "plan" | "purchase"; text: string; price?: ProjectEntry["price"]; date?: string; url?: string; planId?: string },
): ProjectEntry {
  const plan = e.planId && e.kind !== "setup" ? p.entries.find((x) => x.id === e.planId && x.kind === "plan") : undefined;
  if (e.planId && e.kind !== "setup" && !plan) throw new HttpError(400, "planId: that plan isn't on this project");
  // a pick for something on the plan: the plan becomes that pick (name, price, link), in the same spot
  if (plan && e.kind === "plan") {
    plan.text = e.text;
    if (e.price) plan.price = e.price;
    if (e.url) plan.url = e.url;
    plan.at = new Date().toISOString();
    touchProject(p);
    return plan;
  }
  const url = e.url ?? plan?.url;
  const entry: ProjectEntry = {
    id: newId(),
    kind: e.kind,
    text: e.text,
    ...(e.price ? { price: e.price } : {}),
    ...(e.kind === "purchase" ? { date: e.date ?? toIso(today()) } : {}),
    ...(url ? { url } : {}),
    at: new Date().toISOString(),
  };
  // bought something that was planned: it moves from the plan to the purchases (keeping its link)
  if (plan) p.entries = p.entries.filter((x) => x !== plan);
  p.entries.push(entry);
  touchProject(p);
  return entry;
}

// ---------------------------------------------------------------- routes
const money = z.object({ amount: z.number().min(0).max(100_000_000), currency });
const icon = z.enum(PROJECT_ICONS);
const name = z.string().trim().min(1, "give it a name").max(60);
const goal = z.string().trim().max(240);
const projectCreate = z.object({ name, icon: icon.default("other"), goal: goal.optional(), budget: money.optional() });
const projectPatch = z
  .object({ name, icon, goal: goal.nullable(), budget: money.nullable(), status: z.enum(["active", "done"]) })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .refine((s) => toIso(parseIso(s)) === s, "that isn't a real date");
const text = z.string().trim().min(1, "write something").max(200);
const entryKind = z.enum(["setup", "plan", "purchase"]);
const entryCreate = z.object({ kind: entryKind, text, price: money.optional(), date: day.optional(), url: z.string().url().max(500).optional(), planId: z.string().optional() });
const entryPatch = z
  .object({ kind: entryKind, text, price: money.nullable(), date: day.nullable(), url: z.string().url().max(500).nullable() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

function find(db: Db, id: string) {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw new HttpError(404, "That project doesn't exist (maybe it was deleted)");
  return p;
}

export function projectRoutes(app: Hono) {
  app.get("/api/projects", async (c) => {
    const db = await readDb();
    return c.json(listProjects(db).map((p) => projectSummary(db, p)));
  });

  app.get("/api/projects/:id", async (c) => {
    try {
      const db = await readDb();
      return c.json(projectDetail(db, find(db, c.req.param("id"))));
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post("/api/projects", async (c) => {
    try {
      const b = await parse(c, projectCreate);
      const out = await mutate((db) => {
        if (db.projects.some((p) => p.name.toLowerCase() === b.name.toLowerCase())) throw new HttpError(409, `You already have a project called “${b.name}”`);
        const at = new Date().toISOString();
        const p: Project = {
          id: uniqueId(slug(b.name) || "project", (id) => db.projects.some((x) => x.id === id) || !!db.seededProjects?.includes(id)),
          name: b.name,
          icon: b.icon,
          ...(b.goal ? { goal: b.goal } : {}),
          ...(b.budget?.amount ? { budget: b.budget } : {}),
          status: "active",
          entries: [],
          createdAt: at,
          updatedAt: at,
        };
        db.projects.push(p);
        return projectDetail(db, p);
      });
      return c.json(out, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch("/api/projects/:id", async (c) => {
    try {
      const b = await parse(c, projectPatch);
      const out = await mutate((db) => {
        const p = find(db, c.req.param("id"));
        if (b.name && db.projects.some((x) => x !== p && x.name.toLowerCase() === b.name!.toLowerCase())) throw new HttpError(409, `You already have a project called “${b.name}”`);
        if (b.name) p.name = b.name;
        if (b.icon) p.icon = b.icon;
        if (b.status) p.status = b.status;
        if (b.goal === null || b.goal === "") delete p.goal;
        else if (b.goal) p.goal = b.goal;
        if (b.budget === null || b.budget?.amount === 0) delete p.budget;
        else if (b.budget) p.budget = b.budget;
        touchProject(p);
        return projectDetail(db, p);
      });
      return c.json(out);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete("/api/projects/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await mutate((db) => {
        find(db, id);
        // a seed project's id stays in db.seededProjects, so it isn't re-added on the next start
        db.projects = db.projects.filter((p) => p.id !== id);
        // its tracked items keep being tracked, just without a project
        for (const w of db.watches) if (w.projectId === id) delete w.projectId;
        for (const [conv, pid] of Object.entries(db.conversationProjects ?? {})) if (pid === id) delete db.conversationProjects![conv];
      });
      return c.json({ ok: true, id });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post("/api/projects/:id/entries", async (c) => {
    try {
      const b = await parse(c, entryCreate);
      const out = await mutate((db) => {
        const p = find(db, c.req.param("id"));
        addEntry(p, b);
        return projectDetail(db, p);
      });
      return c.json(out, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch("/api/projects/:id/entries/:entryId", async (c) => {
    try {
      const b = await parse(c, entryPatch);
      const out = await mutate((db) => {
        const p = find(db, c.req.param("id"));
        const e = p.entries.find((x) => x.id === c.req.param("entryId"));
        if (!e) throw new HttpError(404, "That entry doesn't exist (maybe it was removed)");
        if (e.kind === "search") throw new HttpError(400, "Searches are logged by Xerxes; you can remove them but not edit them");
        if (b.kind) e.kind = b.kind;
        if (b.text) e.text = b.text;
        if (b.price === null || b.price?.amount === 0) delete e.price;
        else if (b.price) e.price = b.price;
        if (b.date === null) delete e.date;
        else if (b.date) e.date = b.date;
        if (b.url === null) delete e.url;
        else if (b.url) e.url = b.url;
        if (e.kind === "purchase") e.date ??= toIso(today());
        else delete e.date;
        touchProject(p);
        return projectDetail(db, p);
      });
      return c.json(out);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete("/api/projects/:id/entries/:entryId", async (c) => {
    try {
      const out = await mutate((db) => {
        const p = find(db, c.req.param("id"));
        const before = p.entries.length;
        p.entries = p.entries.filter((x) => x.id !== c.req.param("entryId"));
        if (p.entries.length === before) throw new HttpError(404, "That entry doesn't exist (maybe it was removed)");
        touchProject(p);
        return projectDetail(db, p);
      });
      return c.json(out);
    } catch (e) {
      return fail(c, e);
    }
  });
}
