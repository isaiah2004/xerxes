import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { env } from "./env.js";
import { searchBooks } from "./integrations/books.js";
import { findGameDeals } from "./integrations/games.js";
import { searchHardware } from "./integrations/hardware.js";
import { readPage, webSearch } from "./integrations/web.js";
import { evaluateOffers } from "./offers.js";
import { upcoming } from "./occasions.js";
import { check, HttpError } from "./http.js";
import { findLanguage, LANGUAGES } from "./languages.js";
import { addOccasion, changeOccasion, changeWatch, dismissFind, dropOccasion, dropWatch, occasionCreate, occasionPatch, watchPatch, withNext } from "./manage.js";
import { addPerson, changePerson, distinct, dropPerson, personPatch, sameName } from "./people.js";
import {
  addEntry, bindConversation, changeProject, dropEntry, dropProject, logSearch, PROJECT_ICONS, projectContext, projectPatch, projectSummary, touchProject,
} from "./projects.js";
import { emit, getRun, newCardId } from "./runs.js";
import { directionsUrl, findStores, fresh, openText, storeById } from "./stores.js";
import { mutate, newId, readDb, slug, uniqueId, type Db, type Money, type Project } from "./store.js";
import { toIso, today } from "./dates.js";

// Xerxes tools, exposed to Codex CLI over MCP. The run id in the URL ties tool calls to the app's live view.

type Json = Record<string, unknown>;

/** ISBN-13 (978…) → ISBN-10, which is also the Amazon ASIN for a book. */
function isbn13to10(isbn13: string): string | undefined {
  const d = isbn13.replace(/\D/g, "");
  if (d.length !== 13 || !d.startsWith("978")) return undefined;
  const core = d.slice(3, 12);
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

/**
 * Is there a real picture at this URL? Open Library and Amazon answer "no cover" with a tiny placeholder
 * image (HTTP 200, 1×1), which would render as an empty box. "unknown" = the host refused a server fetch.
 */
async function realImage(url: string): Promise<"yes" | "no" | "unknown"> {
  // Open Library only 404s for a missing cover when asked to
  const u = /covers\.openlibrary\.org/.test(url) && !/[?&]default=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}default=false` : url;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return "no";
    if (!r.ok) return "unknown";
    return (await r.arrayBuffer()).byteLength > 1000 ? "yes" : "no";
  } catch {
    return "unknown";
  }
}

/** Amazon serves a cover for a book ASIN (ISBN-10). */
async function amazonCover(asin: string): Promise<string | undefined> {
  const url = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
  return (await realImage(url)) === "yes" ? url : undefined;
}

/** Make sure a product shows a real cover: the agent's image if it is one, else Amazon by ASIN / ISBN, else Google Books. */
async function withCover(item: { title: string; imageUrl?: string; url?: string }) {
  const given = item.imageUrl;
  const check = given ? await realImage(given) : "no";
  if (check === "yes") return;
  item.imageUrl = undefined;
  try {
    const asin = item.url?.match(/\/(?:dp|gp\/product)\/([0-9A-Z]{10})(?:[/?]|$)/)?.[1];
    const isbn13 = item.url?.match(/97[89]\d{10}/)?.[0] ?? given?.match(/97[89]\d{10}/)?.[0]; // e.g. an Open Library cover URL
    for (const id of new Set([asin, isbn13 && isbn13to10(isbn13)].filter((x): x is string => !!x))) {
      const hit = await amazonCover(id);
      if (hit) return void (item.imageUrl = hit);
    }
    const isbn = asin && /^\d{9}[\dX]$/.test(asin) ? asin : isbn13;
    const books = await searchBooks(isbn ? `isbn:${isbn}` : `intitle:${item.title}`, { max: 3 });
    const found = books.find((b) => b.imageUrl)?.imageUrl?.replace("&edge=curl", "").replace("zoom=1", "zoom=2");
    if (found) return void (item.imageUrl = found);
  } catch {
    /* best effort */
  }
  // nothing better: keep an image we couldn't check (the app shows its own cover if it doesn't load)
  if (check === "unknown") item.imageUrl = given;
}
const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
/** Step labels are shown in the app; agent queries can be very long. */
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** Only the fields the agent actually passed, so a patch never clears what it didn't mention. */
const defined = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const money = (m: Money) => new Intl.NumberFormat("en-IN", { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(m.amount);
/** "2026-12-02" → "Wed, 2 Dec" */
const day = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "");

/** The first emoji/character as the eye sees it (a flag or a family emoji is several code points). */
const firstGrapheme = (s: string) => new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)[Symbol.iterator]().next().value?.segment ?? "";

/** "zara-testwala" → "Zara Testwala": the agent often passes ids, and step labels are read by people. */
const who = (ref: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref)
    ? ref.replace(/-\d+$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : ref;

/** Someone in their people, by personId or name. */
function personRef(db: Db, ref: string) {
  const p = db.people.find((x) => x.id === ref) ?? sameName(db, ref);
  if (!p) throw new HttpError(404, `No one called "${ref}" in their people. Known: ${db.people.map((x) => `${x.id} (${x.name})`).join(", ") || "nobody yet"}`);
  return p;
}
function occasionRef(db: Db, ref: string) {
  const o = db.occasions.find((x) => x.id === ref) ?? db.occasions.find((x) => x.label.toLowerCase() === ref.trim().toLowerCase());
  if (!o) throw new HttpError(404, `No event "${ref}" on their calendar. Call get_context for the ids.`);
  return o;
}
function watchRef(db: Db, ref: string) {
  const w = db.watches.find((x) => x.id === ref) ?? db.watches.find((x) => x.query.toLowerCase() === ref.trim().toLowerCase());
  if (!w) throw new HttpError(404, `Not tracking "${ref}". Tracked: ${db.watches.map((x) => `${x.id} (${x.query})`).join(", ") || "nothing"}`);
  return w;
}
/** People for an event: known ones by id or name; names Xerxes doesn't know yet become new people. */
function peopleFor(db: Db, refs: string[], relation?: string) {
  const known: string[] = [];
  const fresh: { name: string; relation: string }[] = [];
  for (const ref of refs.map((r) => r.trim()).filter(Boolean)) {
    const p = db.people.find((x) => x.id === ref) ?? sameName(db, ref);
    if (p) known.push(p.id);
    else if (!fresh.some((f) => f.name.toLowerCase() === ref.toLowerCase())) fresh.push({ name: ref.slice(0, 60), relation: (relation ?? "").trim().slice(0, 40) });
  }
  return { known, fresh };
}

export function buildServer(runId: string) {
  const server = new McpServer({ name: "xerxes", version: "0.1.0" });

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    label: (a: z.infer<z.ZodObject<S>>) => string,
    fn: (a: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    opts: { silent?: boolean } = {},
  ) {
    server.registerTool(name, { description, inputSchema: shape }, (async (args: any) => {
      const stepId = newCardId();
      const text = label(args);
      if (!opts.silent) emit(runId, { type: "step", stepId, label: text, state: "running" });
      try {
        const result = await fn(args);
        if (!opts.silent) emit(runId, { type: "step", stepId, label: text, state: "done" });
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!opts.silent) emit(runId, { type: "step", stepId, label: text, state: "error", detail: msg });
        return { ...ok({ error: msg }), isError: true };
      }
    }) as any);
  }

  type Area = "person" | "occasion" | "watch" | "project" | "profile" | "find";
  /** A small "done" card in the chat or call, so the caller sees exactly what changed in the app. */
  const done = (area: Area, verb: string, title: string, detail?: string) =>
    emit(runId, { type: "card", card: { id: newCardId(), type: "action", area, verb, title, ...(detail ? { detail } : {}) } });

  // ---------- memory & context ----------
  tool("get_context", "Profile, long-term memory, people, their calendar (occasions with arrive-by dates and budgets), projects, tracked items and fresh finds, with the ids the other tools take.", {},
    () => "Recalled your profile and people",
    async () => {
      const db = await readDb();
      return {
        today: toIso(today()),
        profile: db.profile,
        languages: LANGUAGES.map((l) => l.name),
        memory: db.memory,
        people: db.people,
        calendar: upcoming(db, 400).map((o) => ({
          occasionId: o.id, label: o.label, kind: o.kind, date: o.nextDate, every: /^\d{2}-\d{2}$/.test(o.date) ? "year" : "once", daysLeft: o.daysLeft,
          arriveBy: o.arriveBy, turningAge: o.turningAge, budget: o.budget, people: o.people.map((p) => p.id),
        })),
        projects: db.projects.map((p) => projectSummary(db, p)),
        tracking: db.watches.map((w) => ({ watchId: w.id, kind: w.kind, query: w.query, maxPrice: w.maxPrice, active: w.active, projectId: w.projectId })),
        finds: db.notifications.filter((n) => !n.read && n.kind !== "occasion").slice(0, 10).map((n) => ({ findId: n.id, title: n.title, body: n.body })),
      };
    });

  tool("remember", "Save a durable fact about the user, a person or a project (preferences, home lab gear, room size...).",
    { topic: z.string().describe("e.g. homelab, room, preferences, gaming, a personId, or a projectId (saved as a setup note in that project)"), fact: z.string() },
    (a) => `Remembered: ${clip(a.fact)}`,
    async ({ topic, fact }) =>
      mutate((db) => {
        const person = db.people.find((p) => p.id === topic);
        if (person) { if (!person.notes.includes(fact)) person.notes.push(fact); return { saved: true, person: person.id }; }
        const project = db.projects.find((p) => p.id === topic);
        if (project) {
          if (!project.entries.some((e) => e.kind === "setup" && e.text === fact)) addEntry(project, { kind: "setup", text: fact });
          return { saved: true, project: project.id };
        }
        (db.memory[topic] ??= []).includes(fact) || db.memory[topic].push(fact);
        return { saved: true, topic };
      }));

  tool("save_person",
    "Add someone the user shops for, or add to what you know about them: name, how they're related, interests, notes. Use it when they mention someone new ('my friend Priya loves pottery'). A person with that name is updated, never duplicated.",
    {
      name: z.string().describe("What the user calls them, e.g. 'Priya', 'Mom', 'the Sharmas'"),
      relation: z.string().optional().describe("e.g. friend, cousin sister, colleague"),
      interests: z.array(z.string()).optional(),
      notes: z.array(z.string()).optional(),
    },
    (a) => `Saved ${clip(a.name)} to your people`,
    async (a) => {
      const out = await mutate((db) => {
        const add = (list: string[], xs: string[] = []) => distinct([...list, ...xs.map((x) => x.trim()).filter(Boolean)]).slice(0, 12);
        const have = sameName(db, a.name);
        if (have) {
          const before = JSON.stringify([have.relation, have.interests, have.notes]);
          if (a.relation && !have.relation) have.relation = a.relation.trim().slice(0, 40);
          have.interests = add(have.interests, a.interests);
          have.notes = add(have.notes, a.notes);
          return { person: { ...have }, updated: true, changed: JSON.stringify([have.relation, have.interests, have.notes]) !== before };
        }
        const p = addPerson(db, { name: a.name.trim().slice(0, 60), relation: a.relation?.trim().slice(0, 40), interests: add([], a.interests), notes: add([], a.notes) });
        return { person: { ...p }, updated: false, changed: true };
      });
      const p = out.person;
      if (out.changed) done("person", out.updated ? "Updated · People" : "Added · People", p.name, [p.relation, p.interests.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || undefined);
      return { saved: true, personId: p.id, ...(out.updated ? { updated: true } : {}) };
    });

  // ---------- projects: buckets of context for a chain of purchases ----------
  const conversationId = getRun(runId)?.conversationId;
  const findProject = (db: Db, id: string): Project => {
    const p = db.projects.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
    if (!p) throw new Error(`No project "${id}". Known projects: ${db.projects.map((x) => `${x.id} (${x.name})`).join(", ") || "none"}`);
    return p;
  };
  const projectCard = (p: Project, extra: Json = {}) =>
    emit(runId, { type: "card", card: { id: newCardId(), type: "project", project: { id: p.id, name: p.name, icon: p.icon }, ...extra } });

  tool("get_project",
    "Everything about one of the user's projects: how things are now (setup), what they bought and spent, plans, earlier searches and tracked items. Call it first whenever a request belongs to a project.",
    { projectId: z.string().describe("projectId from the context") },
    () => "Recalled your project",
    async ({ projectId }) => {
      const db = await readDb();
      const p = findProject(db, projectId);
      // From now on this conversation is part of the project: later turns get its context and it's logged as a
      // search. (A conversation that already was has shown the "Recalled" step at the start of the turn.)
      if (conversationId && db.conversationProjects?.[conversationId] !== p.id) {
        await bindConversation(conversationId, p.id);
        const run = getRun(runId);
        if (run) await logSearch(p.id, conversationId, run.userText);
        emit(runId, { type: "step", stepId: newCardId(), label: `Recalled your ${p.name} project`, state: "done" });
      }
      return projectContext(await readDb(), p);
    }, { silent: true });

  tool("add_to_project",
    "Save something to a project: a setup note (how things are now), a plan (something to get) or a purchase (something they bought, with price). " +
      "Saving a pick you found for one of their plans: kind plan with its planId, price and url, and that plan becomes the pick. When they buy a planned item, kind purchase with its planId, so it moves from plans to purchases.",
    {
      projectId: z.string(),
      kind: z.enum(["setup", "plan", "purchase"]),
      text: z.string().describe("Short, e.g. 'Lenovo M720q, 32 GB, i5-8500T'"),
      price: z.number().optional(),
      currency: z.string().optional(),
      date: z.string().optional().describe("Purchases: YYYY-MM-DD bought (default today)"),
      url: z.string().optional(),
      planId: z.string().optional().describe("The entryId of the plan this pick or purchase is for"),
    },
    (a) => `Added to your project: ${clip(a.text)}`,
    async (a) =>
      mutate((db) => {
        const p = findProject(db, a.projectId);
        const date = a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : undefined;
        const planId = a.planId && p.entries.some((e) => e.id === a.planId && e.kind === "plan") ? a.planId : undefined;
        const price = a.price !== undefined ? { amount: a.price, currency: (a.currency ?? p.budget?.currency ?? db.profile.currency).toUpperCase() } : undefined;
        const e = addEntry(p, { kind: a.kind, text: a.text.slice(0, 200), price, date, url: a.url, planId });
        projectCard(p, { added: { kind: e.kind, text: e.text, price: e.price } });
        return { saved: true, projectId: p.id, entryId: e.id };
      }));

  tool("create_project",
    "Start a new project for something that will take several purchases (a room makeover, a hobby setup, a trip). Only when the user wants one.",
    {
      name: z.string().describe("Short, e.g. 'Balcony garden'"),
      goal: z.string().optional().describe("One sentence on what they want to achieve"),
      icon: z.enum(PROJECT_ICONS).optional(),
      budget: z.number().optional(),
      currency: z.string().optional(),
    },
    (a) => `Started a project: ${clip(a.name)}`,
    async (a) => {
      const p = await mutate((db) => {
        const same = db.projects.find((x) => x.name.toLowerCase() === a.name.trim().toLowerCase());
        if (same) return same;
        const at = new Date().toISOString();
        const p: Project = {
          id: uniqueId(slug(a.name) || "project", (id) => db.projects.some((x) => x.id === id) || !!db.seededProjects?.includes(id)),
          name: a.name.trim().slice(0, 60),
          icon: a.icon ?? "other",
          ...(a.goal ? { goal: a.goal.slice(0, 240) } : {}),
          ...(a.budget ? { budget: { amount: a.budget, currency: (a.currency ?? db.profile.currency).toUpperCase() } } : {}),
          status: "active",
          entries: [],
          createdAt: at,
          updatedAt: at,
        };
        db.projects.push(p);
        return p;
      });
      if (conversationId) await bindConversation(conversationId, p.id);
      projectCard(p, { created: true });
      return { projectId: p.id, name: p.name };
    });

  // ---------- discovery ----------
  tool("search_books", "Search real book catalogues (Google Books + Open Library). Returns covers, page counts, ISBNs and verified physical format (Hardcover/Paperback) where known.",
    { query: z.string(), max: z.number().int().min(1).max(15).optional() },
    (a) => `Searched book catalogues for “${clip(a.query)}”`,
    async ({ query, max }) => searchBooks(query, { max: max ?? 8, country: (await readDb()).profile.country }));

  // Keyed search only: without Tavily the scraping fallback gets bot-walled, so Codex's built-in web search covers it.
  if (env.tavilyKey)
    tool("web_search", "Search the web (retailers, prices, second-hand listings, reviews). Prefer Indian retailers for India.",
      { query: z.string() },
      (a) => `Searched the web: ${clip(a.query)}`,
      async ({ query }) => webSearch(query, 8));

  tool("read_page", "Open a web page and read its text, e.g. a product page to confirm price, stock and delivery estimate.",
    { url: z.string().url() },
    (a) => `Opened ${new URL(a.url).hostname.replace(/^www\./, "")}`,
    async ({ url }) => readPage(url));

  tool("find_game_deals", "Current PC game deals across Steam, GOG, Epic, Humble etc. (USD).",
    { title: z.string(), maxPrice: z.number().optional() },
    (a) => `Checked game stores for ${clip(a.title)}`,
    async ({ title, maxPrice }) => findGameDeals(title, { maxPrice, limit: 8 }));

  tool("search_used_hardware", "Recent second-hand hardware listings from r/homelabsales and r/hardwareswap.",
    { query: z.string() },
    (a) => `Scanned second-hand listings for ${clip(a.query)}`,
    async ({ query }) => searchHardware(query));

  // ---------- decision support ----------
  tool("check_offers",
    "Deterministically check offers against budget and arrive-by deadline. Computes total (price+shipping), expected arrival (from the retailer's stated estimate, or a typical window flagged as estimated), spare days and a verdict, then ranks them. ALWAYS use this before recommending.",
    {
      occasionId: z.string().optional().describe("Uses the occasion's budget and arrive-by date"),
      arriveBy: z.string().optional().describe("YYYY-MM-DD, overrides occasion"),
      budget: z.number().optional(),
      preferUsed: z.boolean().optional(),
      offers: z.array(z.object({
        title: z.string(), retailer: z.string(), price: z.number(), shipping: z.number().optional(),
        currency: z.string().optional(), condition: z.enum(["new", "used", "refurbished"]).optional(),
        url: z.string().optional(), imageUrl: z.string().optional(),
        deliveryDaysMin: z.number().optional(), deliveryDaysMax: z.number().optional(),
        deliveryBy: z.string().optional(), priceSource: z.string().optional(),
      })).min(1),
    },
    (a) => `Checked price, budget and delivery for ${a.offers.length} option${a.offers.length > 1 ? "s" : ""}`,
    async (a) => {
      const db = await readDb();
      const occ = a.occasionId ? upcoming(db).find((o) => o.id === a.occasionId) : undefined;
      return {
        arriveBy: a.arriveBy ?? occ?.arriveBy,
        budget: a.budget ?? occ?.budget.amount,
        occasionDate: occ?.nextDate,
        offers: evaluateOffers(a.offers, { arriveBy: a.arriveBy ?? occ?.arriveBy, budget: a.budget ?? occ?.budget.amount, preferUsed: a.preferUsed }),
      };
    });

  // ---------- agentic UI: the agent decides what the user sees ----------
  const productItem = z.object({
    title: z.string(),
    subtitle: z.string().optional().describe("e.g. 'Hardcover · 304 pages · Ages 9+'"),
    imageUrl: z.string().optional(),
    url: z.string().optional(),
    retailer: z.string().optional(),
    price: z.number().optional(),
    shipping: z.number().optional(),
    total: z.number().optional(),
    currency: z.string().default("INR"),
    tags: z.array(z.string()).max(4).optional(),
    arrives: z.string().optional().describe("YYYY-MM-DD"),
    spareDays: z.number().optional(),
    deliveryEstimated: z.boolean().optional(),
    verdict: z.enum(["safe", "tight", "late", "over_budget", "late_and_over_budget", "info"]).optional(),
    bestPick: z.boolean().optional(),
    reason: z.string().optional().describe("One sentence on why it fits"),
  });

  tool("show_products", "Render product cards in the user's app (2-4 items). Use after check_offers so verdicts are real.",
    { heading: z.string(), items: z.array(productItem).min(1).max(6) },
    () => "Showing options", async (a) => {
      await Promise.all(a.items.map(withCover));
      emit(runId, { type: "card", card: { id: newCardId(), type: "products", ...a } });
      return { shown: true };
    }, { silent: true });

  tool("show_recommendation",
    "Render the final decision card: one recommended item with budget bar, delivery timeline and checks. Call once you've picked.",
    {
      item: productItem,
      budget: z.number().optional(),
      occasionLabel: z.string().optional(),
      occasionDate: z.string().optional().describe("YYYY-MM-DD"),
      arriveBy: z.string().optional(),
      ships: z.string().optional(),
      checks: z.array(z.string()).max(5).describe("Short ✓ facts, e.g. 'Hardcover', 'In budget', '4 days spare'"),
      why: z.string().describe("2 sentences max"),
      followUp: z.string().optional().describe("A proactive next step to offer, e.g. a wrap reminder"),
    },
    () => "Prepared recommendation", async (a) => {
      await withCover(a.item);
      emit(runId, { type: "card", card: { id: newCardId(), type: "recommendation", ...a } });
      return { shown: true };
    }, { silent: true });

  tool("show_question", "Ask the user a quick multiple-choice question in the app (e.g. room layout, budget flexibility).",
    { question: z.string(), options: z.array(z.string()).min(2).max(5) },
    () => "Asking you", async (a) => {
      emit(runId, { type: "card", card: { id: newCardId(), type: "question", ...a } });
      return { shown: true, note: "Stop and wait for the user's answer." };
    }, { silent: true });

  tool("show_ideas",
    "Show a few gift or product ideas to pick from (3-5 genuinely different directions) BEFORE any searching. Use it for open-ended asks: gift ideas, 'something for my friend', a birthday with nothing in mind yet. The full search only starts once they pick one.",
    {
      heading: z.string().describe("e.g. 'Gift ideas for your cousin sister' or 'Ideas for a techie friend'"),
      ideas: z
        .array(
          z.object({
            title: z.string().describe("2-6 words, e.g. 'Mechanical keyboard'"),
            why: z.string().describe("One short line on why it fits them"),
            price: z.string().optional().describe("Rough range in their currency, e.g. '₹2,000–4,000'"),
            emoji: z.string().optional().describe("One emoji that pictures it"),
          }),
        )
        .min(2)
        .max(6),
      occasionId: z.string().optional(),
    },
    (a) => `Came up with ${a.ideas.length} ideas`,
    async (a) => {
      const ideas = a.ideas.map((i) => ({
        title: clip(i.title.trim(), 48),
        why: clip(i.why.trim(), 160),
        ...(i.price?.trim() ? { price: clip(i.price.trim(), 28) } : {}),
        ...(i.emoji?.trim() ? { emoji: firstGrapheme(i.emoji.trim()) } : {}),
      }));
      emit(runId, { type: "card", card: { id: newCardId(), type: "ideas", heading: clip(a.heading.trim(), 70), ideas, ...(a.occasionId ? { occasionId: a.occasionId } : {}) } });
      return { shown: true, note: "Now ask which one to look into, in one short sentence. Don't search until they pick one." };
    });

  // ---------- nearby shops: for when it has to be today ----------
  tool("find_stores",
    "Find real shops near the user (OpenStreetMap): for when they need it today or tomorrow, delivery can't make it in time, or they ask where to buy something nearby. Returns the nearest matches with distance, open now / until when, phone and street where known. Then put the best 2-4 on a map with show_stores.",
    {
      kinds: z
        .array(z.string())
        .max(3)
        .default([])
        .describe(
          "OpenStreetMap shop types that would stock it, e.g. books, toys, gift, games, video_games, electronics, computer, mobile_phone, stationery, art, craft, hobby, musical_instrument, sports, outdoor, clothes, shoes, jewelry, watches, cosmetics, perfumery, florist, bakery, pastry, confectionery, chocolate, department_store, mall, photo, kitchen, houseware, pet, bicycle",
        ),
      names: z.array(z.string()).max(3).optional().describe("Specific shops or chains, e.g. 'Crossword', 'Croma', 'Hamleys'"),
      near: z.string().optional().describe("An area when they're not at home, e.g. 'Indiranagar'. Default: their home"),
      radiusKm: z.number().optional().describe("Default 3, up to 10"),
    },
    (a) => `Searched the map near ${a.near?.trim() || "you"}: ${clip([...a.kinds.map((k) => k.replace(/_/g, " ")), ...(a.names ?? [])].join(", "), 48)}`,
    async (a) => {
      const { from, radiusKm, stores } = await findStores(a);
      if (!stores.length) return { near: from.label, radiusKm, stores: [], note: `Nothing within ${radiusKm} km. Try other kinds, a name, or a wider radius (up to 10).` };
      return {
        near: from.label,
        radiusKm,
        stores: stores.map((s) => defined({ id: s.id, name: s.name, kind: s.kind, km: s.distanceKm, street: s.address, open: openText(s.open), hours: s.open ? undefined : s.hours, phone: s.phone, website: s.website })),
        note: "Pick 2-4 that fit (open now first, then nearest) and call show_stores with their ids in the order you recommend. You can't see their stock: say 'likely has it' and suggest calling ahead when there's a phone number.",
      };
    });

  tool("show_stores",
    "Put shops from find_stores on a map in the user's app (it shows in a call too), each with a short note. Your pick goes first: it's pin 1, the one you tell them to head to.",
    {
      heading: z.string().describe("e.g. 'Bookshops open now near you'"),
      stores: z
        .array(
          z.object({
            id: z.string().describe("From find_stores"),
            note: z.string().optional().describe("One short line on why this shop, e.g. 'Big kids' section; likely has it'. Not the distance or hours: the card shows those"),
          }),
        )
        .min(1)
        .max(5),
    },
    (a) => `Put ${a.stores.length} shop${a.stores.length > 1 ? "s" : ""} on the map`,
    async (a) => {
      const picked = a.stores.flatMap((p) => {
        const s = storeById(p.id);
        return s ? [{ s: fresh(s), note: p.note?.trim() }] : [];
      });
      if (!picked.length) throw new Error("Those ids aren't from find_stores. Run find_stores first and pass its ids.");
      const center = picked[0].s.from;
      const stores = picked.map(({ s, note }) =>
        defined({
          id: s.id, name: s.name, kind: s.kind, lat: s.lat, lon: s.lon,
          distanceKm: s.distanceKm,
          address: s.address, hours: s.hours, open: s.open, phone: s.phone, website: s.website,
          note: note ? clip(note, 120) : undefined,
          directionsUrl: directionsUrl(s),
        }),
      );
      emit(runId, { type: "card", card: { id: newCardId(), type: "stores", heading: clip(a.heading.trim(), 70), center, stores } });
      const missing = a.stores.length - picked.length;
      return { shown: picked.length, ...(missing ? { note: `${missing} id(s) weren't from find_stores and were left out.` } : {}), next: "Tell them to head to pin 1 (your first one): how far it is and until when it's open, in 1-2 sentences." };
    });

  tool("save_to_plan", "Save a chosen item to the user's plan/shortlist for an occasion.",
    { occasionId: z.string().optional(), title: z.string(), source: z.string(), url: z.string().optional(), imageUrl: z.string().optional(),
      total: z.number(), currency: z.string().default("INR"), expectedBy: z.string().optional(), verdict: z.string().optional(), reason: z.string() },
    (a) => `Saved “${a.title}” to your plan`,
    async (a) => mutate((db) => {
      const item = { id: newId(), forOccasionId: a.occasionId, title: a.title, source: a.source, url: a.url, imageUrl: a.imageUrl,
        total: { amount: a.total, currency: a.currency }, expectedBy: a.expectedBy, verdict: a.verdict, reason: a.reason, savedAt: new Date().toISOString() };
      db.shortlist.unshift(item);
      return item;
    }));

  tool("create_watch", "Start watching for deals (game sale, used hardware, a book, a product). Xerxes checks periodically and notifies. Pass projectId when it's for one of their projects.",
    { kind: z.enum(["game", "hardware", "book", "product"]), query: z.string(), maxPrice: z.number().optional(), currency: z.string().optional(), notes: z.string().optional(), projectId: z.string().optional() },
    (a) => `Watching for ${clip(a.query)}`,
    async (a) => mutate((db) => {
      const project = a.projectId ? db.projects.find((p) => p.id === a.projectId) : undefined;
      const w = { id: newId(), kind: a.kind, query: a.query, maxPrice: a.maxPrice !== undefined ? { amount: a.maxPrice, currency: a.currency ?? (a.kind === "game" || a.kind === "hardware" ? "USD" : db.profile.currency) } : undefined, notes: a.notes, projectId: project?.id, active: true, createdAt: new Date().toISOString() };
      if (project) touchProject(project);
      db.watches.unshift(w);
      emit(runId, { type: "card", card: { id: newCardId(), type: "watch", watch: w } as Json & { id: string; type: string } });
      return w;
    }));

  // ---------- running the app by voice: everything the screens can add, change or remove ----------
  const occasionLine = (o: Parameters<typeof withNext>[0]) =>
    [day(withNext(o).nextDate), /^\d{2}-\d{2}$/.test(o.date) ? "every year" : "", `${money(o.budget)} budget`].filter(Boolean).join(" · ");

  tool("update_person",
    "Change someone in their people: rename them, change how they're related, or replace their interests or notes (to just add something they like, use save_person).",
    {
      person: z.string().describe("personId or their name"),
      name: z.string().optional().describe("New name"),
      relation: z.string().optional(),
      interests: z.array(z.string()).optional().describe("Replaces the list"),
      notes: z.array(z.string()).optional().describe("Replaces the list"),
    },
    (a) => `Updated ${clip(a.name ?? who(a.person))} in your people`,
    async (a) => {
      const p = await mutate((db) => changePerson(db, personRef(db, a.person).id, check(personPatch, defined({ name: a.name, relation: a.relation, interests: a.interests, notes: a.notes }))));
      done("person", "Updated · People", p.name, [p.relation, p.interests.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || undefined);
      return { updated: true, personId: p.id, name: p.name };
    });

  tool("remove_person", "Remove someone from their people. Birthdays and anniversaries that were only theirs go with them.",
    { person: z.string().describe("personId or their name") },
    (a) => `Removed ${clip(who(a.person))} from your people`,
    async (a) => {
      const out = await mutate((db) => dropPerson(db, personRef(db, a.person).id));
      done("person", "Removed · People", out.person.name, out.removedOccasions.length ? `Also off the calendar: ${out.removedOccasions.join(", ")}` : undefined);
      return { removed: true, name: out.person.name, removedOccasions: out.removedOccasions };
    });

  tool("add_occasion",
    "Add an event to their calendar: a birthday, an anniversary, a festival or any date they'll want a gift for. Birthdays and anniversaries need the people they're for. Xerxes reminds them ahead of it and plans the gift to arrive in time.",
    {
      kind: z.enum(["birthday", "anniversary", "festival", "other"]),
      label: z.string().describe("e.g. \"Priya's birthday\", \"Diwali\", \"Ankit's farewell\""),
      date: z.string().describe("MM-DD to repeat every year (birthdays, anniversaries), YYYY-MM-DD for a one-off"),
      people: z.array(z.string()).optional().describe("personIds or names; a name they don't have yet is added to their people"),
      relation: z.string().optional().describe("How a new person is related to them, e.g. colleague"),
      budget: z.number().optional().describe("Gift budget, default 2000"),
      currency: z.string().optional(),
      remindDaysBefore: z.number().int().optional().describe("Default 21"),
    },
    (a) => `Added ${clip(a.label)} to your calendar`,
    async (a) => {
      const o = await mutate((db) => {
        const { known, fresh } = peopleFor(db, a.people ?? [], a.relation);
        const b = check(occasionCreate, defined({
          kind: a.kind, label: a.label, date: a.date, personIds: known,
          budget: { amount: a.budget ?? 2000, currency: (a.currency ?? db.profile.currency).toUpperCase() }, remindDaysBefore: a.remindDaysBefore,
        }));
        return addOccasion(db, b, fresh);
      });
      done("occasion", "Added · Calendar", o.label, occasionLine(o));
      return { added: true, occasionId: o.id, nextDate: withNext(o).nextDate };
    });

  tool("update_occasion", "Change an event on their calendar: its title, date, budget, reminder, or who it's for.",
    {
      occasionId: z.string().describe("occasionId (or its exact title)"),
      label: z.string().optional(),
      kind: z.enum(["birthday", "anniversary", "festival", "other"]).optional(),
      date: z.string().optional().describe("MM-DD every year, YYYY-MM-DD once"),
      people: z.array(z.string()).optional().describe("Replaces who it's for: personIds or names (new names are added to their people)"),
      relation: z.string().optional(),
      budget: z.number().optional(),
      currency: z.string().optional(),
      remindDaysBefore: z.number().int().optional(),
    },
    (a) => `Updated ${clip(a.label ?? "an event")} on your calendar`,
    async (a) => {
      const o = await mutate((db) => {
        const cur = occasionRef(db, a.occasionId);
        const who = a.people ? peopleFor(db, a.people, a.relation) : undefined;
        const fields = check(occasionPatch, defined({
          kind: a.kind, label: a.label, date: a.date, personIds: who?.known,
          budget: a.budget !== undefined ? { amount: a.budget, currency: (a.currency ?? cur.budget.currency).toUpperCase() } : undefined,
          remindDaysBefore: a.remindDaysBefore,
        }));
        return changeOccasion(db, cur.id, fields, who?.fresh ?? []);
      });
      done("occasion", "Updated · Calendar", o.label, occasionLine(o));
      return { updated: true, occasionId: o.id, nextDate: withNext(o).nextDate };
    });

  tool("remove_occasion", "Remove an event from their calendar.",
    { occasionId: z.string().describe("occasionId (or its exact title)") },
    () => "Removed an event from your calendar",
    async (a) => {
      const o = await mutate((db) => dropOccasion(db, occasionRef(db, a.occasionId).id));
      done("occasion", "Removed · Calendar", o.label);
      return { removed: true, label: o.label };
    });

  tool("update_watch", "Change something they track: pause or resume it, change the target price, or what to look for.",
    {
      watchId: z.string().describe("watchId (or exactly what it tracks)"),
      active: z.boolean().optional().describe("false pauses it, true resumes it"),
      query: z.string().optional(),
      maxPrice: z.number().optional().describe("New target price; 0 clears it"),
      currency: z.string().optional(),
      notes: z.string().optional(),
    },
    (a) => (a.active === false ? "Paused tracking" : a.active === true ? "Resumed tracking" : "Updated what you track"),
    async (a) => {
      const w = await mutate((db) => {
        const cur = watchRef(db, a.watchId);
        const maxPrice =
          a.maxPrice === undefined ? undefined : a.maxPrice <= 0 ? null : { amount: a.maxPrice, currency: (a.currency ?? cur.maxPrice?.currency ?? db.profile.currency).toUpperCase() };
        return changeWatch(db, cur.id, check(watchPatch, defined({ active: a.active, query: a.query, maxPrice, notes: a.notes })));
      });
      done("watch", a.active === false ? "Paused · Tracking" : a.active === true ? "Resumed · Tracking" : "Updated · Tracking", w.query, w.maxPrice ? `Target ${money(w.maxPrice)}` : undefined);
      return { updated: true, watchId: w.id, active: w.active, maxPrice: w.maxPrice };
    });

  tool("remove_watch", "Stop tracking something for good.",
    { watchId: z.string().describe("watchId (or exactly what it tracks)") },
    () => "Removed an item from your tracking",
    async (a) => {
      const w = await mutate((db) => dropWatch(db, watchRef(db, a.watchId).id));
      done("watch", "Removed · Tracking", w.query);
      return { removed: true, query: w.query };
    });

  tool("update_project", "Change one of their projects: rename it, change its goal or budget, or mark it done (or active again).",
    {
      projectId: z.string(),
      name: z.string().optional(),
      goal: z.string().optional(),
      budget: z.number().optional().describe("0 clears it"),
      currency: z.string().optional(),
      status: z.enum(["active", "done"]).optional(),
      icon: z.enum(PROJECT_ICONS).optional(),
    },
    (a) => (a.status === "done" ? "Marked a project done" : `Updated your ${clip(a.name ?? "project")} project`),
    async (a) => {
      const p = await mutate((db) => {
        const cur = findProject(db, a.projectId);
        const budget = a.budget === undefined ? undefined : a.budget <= 0 ? null : { amount: a.budget, currency: (a.currency ?? cur.budget?.currency ?? db.profile.currency).toUpperCase() };
        return changeProject(db, cur.id, check(projectPatch, defined({ name: a.name, goal: a.goal, budget, status: a.status, icon: a.icon })));
      });
      done("project", a.status === "done" ? "Done · Projects" : a.status === "active" ? "Reopened · Projects" : "Updated · Projects", p.name, p.budget ? `Budget ${money(p.budget)}` : undefined);
      return { updated: true, projectId: p.id, name: p.name, status: p.status };
    });

  tool("remove_project", "Delete one of their projects (its tracked items keep being tracked).",
    { projectId: z.string() },
    () => "Removed a project",
    async (a) => {
      const p = await mutate((db) => dropProject(db, findProject(db, a.projectId).id));
      done("project", "Removed · Projects", p.name);
      return { removed: true, name: p.name };
    });

  tool("remove_from_project", "Take a note, a plan or a purchase off one of their projects (entryIds come from get_project).",
    { projectId: z.string(), entryId: z.string() },
    () => "Removed an item from your project",
    async (a) => {
      const out = await mutate((db) => dropEntry(db, findProject(db, a.projectId).id, a.entryId));
      done("project", `Removed · ${out.project.name}`, out.entry.text);
      return { removed: true, text: out.entry.text };
    });

  tool("update_profile",
    "Change their profile: their name, where gifts are delivered (city and PIN code), or the language you talk in (English, Hindi, Tamil, Telugu, Kannada, Bengali, Marathi).",
    {
      name: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
      language: z.string().optional().describe("e.g. Hindi"),
    },
    (a) => (a.language ? `Changed your language to ${clip(a.language, 20)}` : "Updated your profile"),
    async (a) => {
      const lang = a.language ? findLanguage(a.language) : undefined;
      if (a.language && !lang) throw new HttpError(400, `Xerxes doesn't speak ${a.language} yet. It speaks ${LANGUAGES.map((l) => l.name).join(", ")}.`);
      if (a.postalCode && !/^\d{6}$/.test(a.postalCode.replace(/\s/g, ""))) throw new HttpError(400, "A PIN code is 6 digits");
      const name = a.name?.trim().slice(0, 40);
      const city = a.city?.trim().slice(0, 60);
      const profile = await mutate((db) => {
        if (name) db.profile.name = name;
        if (city) db.profile.city = city;
        if (a.postalCode) db.profile.postalCode = a.postalCode.replace(/\s/g, "");
        if (lang) db.profile.language = lang.code;
        return { ...db.profile };
      });
      const details = [
        name && `Name: ${name}`,
        (city || a.postalCode) && `Deliver to ${profile.city} ${profile.postalCode}`,
        lang && `Language: ${lang.native}${lang.code === "en" ? "" : ` (${lang.name})`}`,
      ].filter(Boolean).join(" · ");
      done("profile", "Updated · Profile", lang ? `Xerxes now talks in ${lang.name}` : "Your profile", details || undefined);
      return {
        saved: true,
        profile,
        ...(lang ? { note: `Chat replies switch to ${lang.name} now. A call keeps the language it started in, so voice switches from their next call: tell them to hang up and call again to hear it.` } : {}),
      };
    });

  tool("dismiss_find", "Dismiss a fresh find (a deal from their tracking) so it leaves the feed and isn't announced again.",
    { findId: z.string() },
    () => "Dismissed a find",
    async (a) => {
      const n = await mutate((db) => dismissFind(db, a.findId));
      done("find", "Dismissed · Fresh finds", n.title);
      return { dismissed: true, title: n.title };
    });

  return server;
}

export async function handleMcp(runId: string, req: Request): Promise<Response> {
  const server = buildServer(runId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
