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
import { emit, newCardId } from "./runs.js";
import { mutate, newId, readDb } from "./store.js";
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

/** Amazon serves a cover for a book ASIN; when it has none it returns a tiny placeholder GIF instead. */
async function amazonCover(asin: string): Promise<string | undefined> {
  const url = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const size = (await r.arrayBuffer()).byteLength;
    return r.ok && size > 1000 ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Fill a missing product image: Amazon cover by ASIN / ISBN in the URL, else Google Books (ISBN, then title). */
async function withCover(item: { title: string; imageUrl?: string; url?: string }) {
  if (item.imageUrl) return;
  try {
    const asin = item.url?.match(/\/(?:dp|gp\/product)\/([0-9A-Z]{10})(?:[/?]|$)/)?.[1];
    const isbn13 = item.url?.match(/97[89]\d{10}/)?.[0];
    for (const id of new Set([asin, isbn13 && isbn13to10(isbn13)].filter((x): x is string => !!x))) {
      const hit = await amazonCover(id);
      if (hit) return void (item.imageUrl = hit);
    }
    const isbn = asin && /^\d{9}[\dX]$/.test(asin) ? asin : isbn13;
    const books = await searchBooks(isbn ? `isbn:${isbn}` : `intitle:${item.title}`, { max: 3 });
    item.imageUrl = books.find((b) => b.imageUrl)?.imageUrl?.replace("&edge=curl", "").replace("zoom=1", "zoom=2");
  } catch {
    /* best effort */
  }
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
  tool("get_context", "Profile, long-term memory, people and upcoming occasions (with arrive-by dates and budgets).", {},
    () => "Recalled your profile and people",
    async () => {
      const db = await readDb();
      return { today: toIso(today()), profile: db.profile, memory: db.memory, people: db.people, upcoming: upcoming(db, 120) };
    });

  tool("remember", "Save a durable fact about the user or a person (preferences, home lab gear, room size...).",
    { topic: z.string().describe("e.g. homelab, room, preferences, gaming, or a personId"), fact: z.string() },
    (a) => `Remembered: ${clip(a.fact)}`,
    async ({ topic, fact }) =>
      mutate((db) => {
        const person = db.people.find((p) => p.id === topic);
        if (person) { if (!person.notes.includes(fact)) person.notes.push(fact); return { saved: true, person: person.id }; }
        (db.memory[topic] ??= []).includes(fact) || db.memory[topic].push(fact);
        return { saved: true, topic };
      }));

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

  tool("create_watch", "Start watching for deals (game sale, used hardware, a book, a product). Xerxes checks periodically and notifies.",
    { kind: z.enum(["game", "hardware", "book", "product"]), query: z.string(), maxPrice: z.number().optional(), currency: z.string().optional(), notes: z.string().optional() },
    (a) => `Watching for ${clip(a.query)}`,
    async (a) => mutate((db) => {
      const w = { id: newId(), kind: a.kind, query: a.query, maxPrice: a.maxPrice !== undefined ? { amount: a.maxPrice, currency: a.currency ?? (a.kind === "game" || a.kind === "hardware" ? "USD" : db.profile.currency) } : undefined, notes: a.notes, active: true, createdAt: new Date().toISOString() };
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
