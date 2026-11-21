import { CodexAuthError, runCodex, type CodexTurn } from "./codex.js";
import { env } from "./env.js";
import { upcoming } from "./occasions.js";
import { bindConversation, logSearch, projectContext, projectOf, projectStats, setSearchReply } from "./projects.js";
import { createRun, emit, runsFor, type Run } from "./runs.js";
import { mutate, readDb, type Project } from "./store.js";
import { toIso, today } from "./dates.js";

// Conversation = a Codex thread. Each user message = a run (one Codex turn) whose tool calls stream to the app.

export type Mode = "text" | "voice";

/** Voice turns are spoken while the caller waits, so they get a tighter tool budget than text turns. */
const VOICE_PACE =
  "Be quick: about 5 tool calls (one search, at most one product page, check_offers, then show_products and show_recommendation).";

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
    projects: db.projects.filter((p) => p.status === "active").map((p) => ({ projectId: p.id, name: p.name, goal: p.goal })),
  };
  return `You are Xerxes, a proactive personal shopping agent that makes shopping genuinely fun and stress-free.
You act through the "xerxes" MCP tools ONLY. Never run shell commands or edit files.

How you work:
- Take initiative: infer what the user means from memory + context, do the legwork, and come back with a decision, not homework.
- Discovery: use search_books for books (verify Hardcover via physicalFormat when the user wants hardcover). For retailer prices and delivery estimates, use your built-in web search (e.g. "site:amazon.in <title> hardcover"; the user watches each search live), then read_page on the best product pages (prefer Indian retailers for ${db.profile.country}; delivery to ${db.profile.city} ${db.profile.postalCode}).
- Prices: only quote prices you actually saw (search snippet or page). If you could not see a live price, say "approx." and mark priceSource accordingly.
- Delivery: retailer pages show their estimate for a ${db.profile.city} location near the user. Use it as the estimate for ${db.profile.postalCode} (pass it to check_offers); don't discuss PIN-code differences.
- ALWAYS run check_offers (with occasionId when relevant) before recommending, so budget/delivery verdicts are computed, not guessed.
- Agentic UI: the user sees cards you render. Call show_products with 2-3 strong options (use cover imageUrl from search_books, verdicts/arrives/spareDays from check_offers), then show_recommendation for your pick. Use show_question when you truly need input (e.g. room dimensions).
- Be efficient: aim for at most ~10 tool calls per turn. Run one broad search_books, pick 2-3 candidates, then verify price/delivery on 1-2 retailer pages each. Don't re-search the same thing.
- Save durable facts the user tells you with remember. When they mention someone new they shop for (a friend, a colleague, a family), save them with save_person, with whatever you learn about what they like.
- Projects: the user groups related purchases into projects (e.g. a living room makeover, a home lab). Each one holds how things are now, what they bought and spent, what they plan, and what they asked before. When a request belongs to one of their projects (see "projects" in the context), call get_project first and build on it: don't suggest what they already own, make it fit their setup, and respect the budget that's left. Save new facts, plans and purchases for a project with add_to_project (when they buy a planned item, pass its planId). If they start something that will take several purchases, offer to make it a project with create_project.
- ${mode === "voice"
    ? `You are SPEAKING on a live voice call and the caller is waiting. ${VOICE_PACE} Reply in 1-3 short conversational sentences, no markdown, no lists, no URLs, say prices like 'thirteen hundred rupees'.`
    : "Final reply: 1-3 short sentences (the cards carry the detail). No markdown tables, no URLs."}

Context (JSON): ${JSON.stringify(ctx)}`;
}

/**
 * context: app-side facts the user didn't say (e.g. which card started a voice call); goes in the prompt, not the transcript.
 * projectId: the chat was opened from a project. The conversation stays tied to it for every later turn.
 */
export async function startTurn(conversationId: string, userText: string, mode: Mode = "text", context?: string, projectId?: string): Promise<Run> {
  const run = createRun(conversationId, userText);
  void execute(run, mode, context, projectId);
  return run;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A turn in a project's conversation: shows the user that their project is in play, logs the ask in the
 * project's searches and hands the agent the whole bucket of context (fresh each turn, it may have changed).
 */
async function projectTurn(run: Run, projectId?: string) {
  const project: Project | undefined = projectId ? await bindConversation(run.conversationId, projectId) : projectOf(await readDb(), run.conversationId);
  if (!project) return undefined;
  const db = await readDb();
  const { counts } = projectStats(db, project);
  const parts = [counts.setup && plural(counts.setup, "note"), counts.purchase && plural(counts.purchase, "purchase"), counts.plan && plural(counts.plan, "plan")].filter(Boolean);
  emit(run.id, { type: "step", stepId: "project", label: `Recalled your ${project.name} project${parts.length ? ` · ${parts.join(", ")}` : ""}`, state: "done" });
  const searchId = await logSearch(project.id, run.conversationId, run.userText);
  const note =
    `This conversation is part of the user's project "${project.name}" (already loaded below, no need for get_project). Build on it: don't suggest what they already have, ` +
    `make it fit their setup and plans, stay within what's left of the budget, and save new facts, plans or purchases with add_to_project. ` +
    `If they ask to save a pick to their plan, it goes on this project: add_to_project kind "plan" with its price and url, plus the planId of the plan it's for (not save_to_plan, that one is for occasions). ` +
    `Project (JSON): ${JSON.stringify(projectContext(db, project))}`;
  return { project, searchId, note };
}

/** What the user sees (and, in voice, hears) when a turn fails. The raw cause goes to the server log. */
function friendly(e: unknown): string {
  if (e instanceof CodexAuthError) return e.message;
  if (/timed out/i.test(e instanceof Error ? e.message : String(e))) return "That took me too long, so I stopped. Mind asking again?";
  return "Something went wrong on my side. Mind trying that again?";
}

/** The last few exchanges of this conversation, so a fresh thread can pick up where a broken one left off. */
function recap(run: Run): string {
  const lines = runsFor(run.conversationId)
    .filter((r) => r.id !== run.id && r.status === "done")
    .slice(-6)
    .flatMap((r) => {
      const reply = r.events.find((e) => e.type === "message");
      return [`User: ${r.userText}`, reply?.type === "message" && reply.text ? `Xerxes: ${reply.text}` : ""];
    })
    .filter(Boolean);
  return lines.length ? `Earlier in this conversation:\n${lines.join("\n")}\n\n` : "";
}

async function execute(run: Run, mode: Mode, context?: string, projectId?: string) {
  const inProject = await projectTurn(run, projectId).catch((e: Error) => {
    console.warn(`[agent] project context skipped: ${e.message}`);
    return undefined;
  });
  const about = [context, inProject?.note].filter(Boolean).join(" ");
  const note = about ? `(Context, not said by the user: ${about})\n` : "";
  const turn = async (threadId?: string) =>
    runCodex({
      prompt: threadId
        ? `[${toIso(today())}${mode === "voice" ? ` · live voice call: ${VOICE_PACE} Reply in 1-3 short spoken sentences.` : ""}] ${note}${run.userText}`
        : `${await preamble(mode)}\n\n${recap(run)}${note}User: ${run.userText}`,
      threadId,
      mcpUrl: `http://127.0.0.1:${env.port}/mcp/${run.id}`,
      onSearch: (s) => emit(run.id, { type: "step", stepId: `web-${s.id}`, label: s.label, state: s.done ? "done" : "running" }),
    });
  try {
    const db = await readDb();
    const threadId = db.conversations?.[run.conversationId]?.threadId;
    let out: CodexTurn;
    const shown = run.events.length; // e.g. the "Recalled your project" step
    try {
      out = await turn(threadId);
    } catch (e) {
      // A thread Codex can't resume (its local history store broke once) must not end the conversation for good.
      // Retry on a fresh thread, but only if the failed attempt hadn't shown the user anything yet.
      if (!threadId || e instanceof CodexAuthError || run.events.length > shown) throw e;
      console.warn(`[agent] couldn't resume thread ${threadId.slice(0, 8)}, starting a fresh one: ${(e as Error).message.slice(0, 300)}`);
      out = await turn(undefined);
    }
    if (out.threadId)
      await mutate((d) => {
        d.conversations ??= {};
        d.conversations[run.conversationId] = { threadId: out.threadId!, updatedAt: new Date().toISOString() };
      });
    if (inProject?.searchId && out.text) {
      const picked = run.events.some((e) => e.type === "card" && (e.card.type === "recommendation" || e.card.type === "products"));
      await setSearchReply(inProject.project.id, inProject.searchId, out.text, picked);
    }
    emit(run.id, { type: "message", text: out.text });
    emit(run.id, { type: "done" });
  } catch (e) {
    console.error(`[agent] run ${run.id.slice(0, 8)} failed: ${e instanceof Error ? e.message : String(e)}`);
    // Surface auth problems as a readable (and, in voice, speakable) message before the error.
    if (e instanceof CodexAuthError) emit(run.id, { type: "message", text: e.message });
    emit(run.id, { type: "error", message: friendly(e) });
  }
}
