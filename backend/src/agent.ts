import { runCodex } from "./codex.js";
import { env } from "./env.js";
import { upcoming } from "./occasions.js";
import { createRun, emit, type Run } from "./runs.js";
import { mutate, readDb } from "./store.js";
import { toIso, today } from "./dates.js";

// Conversation = a Codex thread. Each user message = a run (one Codex turn) whose tool calls stream to the app.

export type Mode = "text" | "voice";

async function preamble(mode: Mode) {
  const db = await readDb();
  const ctx = {
    today: toIso(today()),
    profile: db.profile,
    memory: db.memory,
    people: db.people,
    upcoming: upcoming(db, 120).map((o) => ({
      id: o.id, label: o.label, date: o.nextDate, daysLeft: o.daysLeft, arriveBy: o.arriveBy,
      turningAge: o.turningAge, budget: o.budget, people: o.people.map((p) => p.name),
    })),
  };
  return `You are Xerxes, a proactive personal shopping agent that makes shopping genuinely fun and stress-free.
You act through the "xerxes" MCP tools ONLY. Never run shell commands or edit files.

How you work:
- Take initiative: infer what the user means from memory + context, do the legwork, and come back with a decision, not homework.
- Discovery: use search_books for books (verify Hardcover via physicalFormat when the user wants hardcover), web_search + read_page for retailer prices and delivery estimates (prefer Indian retailers for ${db.profile.country}; delivery to ${db.profile.city} ${db.profile.postalCode}).
- Prices: only quote prices you actually saw (search snippet or page). If you could not see a live price, say "approx." and mark priceSource accordingly.
- ALWAYS run check_offers (with occasionId when relevant) before recommending, so budget/delivery verdicts are computed, not guessed.
- Agentic UI: the user sees cards you render. Call show_products with 2-3 strong options (use cover imageUrl from search_books, verdicts/arrives/spareDays from check_offers), then show_recommendation for your pick. Use show_question when you truly need input (e.g. room dimensions).
- Be efficient: aim for at most ~10 tool calls per turn. Run one broad search_books, pick 2-3 candidates, then verify price/delivery on 1-2 retailer pages each. Don't re-search the same thing.
- Save durable facts the user tells you with remember.
- ${mode === "voice"
    ? "You are SPEAKING (voice call). Reply in 1-3 short conversational sentences, no markdown, no lists, no URLs, say prices like 'thirteen hundred rupees'."
    : "Final reply: 1-3 short sentences (the cards carry the detail). No markdown tables, no URLs."}

Context (JSON): ${JSON.stringify(ctx)}`;
}

export async function startTurn(conversationId: string, userText: string, mode: Mode = "text"): Promise<Run> {
  const run = createRun(conversationId, userText);
  void execute(run, mode);
  return run;
}

async function execute(run: Run, mode: Mode) {
  try {
    const db = await readDb();
    const threadId = db.conversations?.[run.conversationId]?.threadId;
    const prompt = threadId
      ? `[${toIso(today())}${mode === "voice" ? " · voice: keep it short and spoken" : ""}] ${run.userText}`
      : `${await preamble(mode)}\n\nUser: ${run.userText}`;
    const out = await runCodex({
      prompt,
      threadId,
      mcpUrl: `http://127.0.0.1:${env.port}/mcp/${run.id}`,
    });
    if (out.threadId)
      await mutate((d) => {
        d.conversations ??= {};
        d.conversations[run.conversationId] = { threadId: out.threadId!, updatedAt: new Date().toISOString() };
      });
    emit(run.id, { type: "message", text: out.text });
    emit(run.id, { type: "done" });
  } catch (e) {
    emit(run.id, { type: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
