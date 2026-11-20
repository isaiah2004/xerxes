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
import { addEntry, bindConversation, logSearch, PROJECT_ICONS, projectContext, projectSummary, touchProject } from "./projects.js";
import { emit, getRun, newCardId } from "./runs.js";
import { mutate, newId, readDb, slug, uniqueId, type Db, type Project } from "./store.js";
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

  // ---------- memory & context ----------
  tool("get_context", "Profile, long-term memory, people, upcoming occasions (with arrive-by dates and budgets) and the user's projects.", {},
    () => "Recalled your profile and people",
    async () => {
      const db = await readDb();
      return { today: toIso(today()), profile: db.profile, memory: db.memory, people: db.people, upcoming: upcoming(db, 120), projects: db.projects.map((p) => projectSummary(db, p)) };
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

  return server;
}

export async function handleMcp(runId: string, req: Request): Promise<Response> {
  const server = buildServer(runId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
