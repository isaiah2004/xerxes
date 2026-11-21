import { env } from "./env.js";
import type { Language } from "./languages.js";
import { upcoming } from "./occasions.js";
import type { Db } from "./store.js";
import { toIso, today } from "./dates.js";

// The voice on a call. A quick model (OpenRouter, about a second) talks with the caller in real time, works out what
// they want, and hands the shopping agent (Codex: slow, searches shops, changes the app) one complete request once
// they've said that's everything. While the agent works it keeps talking: answers, says what the agent is doing,
// takes extra details for it, or calls it off. "Okay", "got it" and small talk never reach the agent.

export type DeskLine = { who: "caller" | "xerxes"; text: string };
export type Desk = {
  /** the call so far, newest last (kept short) */
  lines: DeskLine[];
  /** the agent's latest run on this call */
  runId?: string;
  /** details the caller added while the agent was working, for its next turn */
  updates: string[];
  /** runs the caller called off: their answers aren't spoken */
  dropped: string[];
  /** where the call started from and what Xerxes opened with */
  opening?: string;
};

export type Decision = { say: string; action: "talk" | "handoff" | "update" | "cancel"; brief?: string };

export const deskOn = () => !!env.openrouterKey;

/** What the desk knows without asking: their people, dates, budgets and projects. */
export function deskFacts(db: Db, opening?: string): string {
  const facts = {
    today: toIso(today()),
    name: db.profile.name,
    deliverTo: `${db.profile.city} ${db.profile.postalCode}`,
    people: db.people.slice(0, 25).map((p) => ({ name: p.name, relation: p.relation, likes: (p.interests ?? []).slice(0, 4) })),
    upcoming: upcoming(db, 120)
      .slice(0, 6)
      .map((o) => ({ what: o.label, in: `${o.daysLeft} days`, budget: o.budget ? `${o.budget.amount} ${o.budget.currency}` : undefined })),
    projects: db.projects.filter((p) => p.status === "active").slice(0, 6).map((p) => p.name),
  };
  return `${JSON.stringify(facts)}${opening ? `\nHow this call started: ${opening}` : ""}`;
}

function system(lang: Language, name: string, facts: string) {
  return `You are Xerxes, a shopping assistant, live on a voice call with ${name || "the caller"}. You are the voice: quick, warm and natural, like a helpful friend on the phone. Reply in 1-2 short spoken sentences, no lists, no markdown, no URLs, no emojis. Speak ${lang.name}${lang.code === "en" ? "" : " (in its own script)"}; say prices the way people say them out loud.

Behind you works the shopping agent. It searches shops and compares prices and delivery dates (slow: about a minute), thinks up gift ideas (fast), finds shops nearby, and changes things in the app: people, birthdays and other dates on the calendar, tracked prices, projects, their profile, language and voice. You can't do any of that yourself, and you never make up products, prices or availability.

Every time the caller speaks, reply with JSON only: {"say": "...", "action": "talk" | "handoff" | "update" | "cancel", "brief": "..."}

"talk": you answer yourself. Greetings, "can you hear me", "okay", "got it", "understood", "thanks", "cool", reactions, chit-chat, questions about the call so far: all talk, never handoff. Also talk while you're still working out what they want: one short question at a time, only what you really need and don't already know from the facts below or the call (who it's for, roughly what, budget, by when). Two questions at most, then go with what you have.
"handoff": give the agent the request. Only once you know what they want well enough AND they've said that's everything or to go ahead: when it's clear, ask "Anything else before I start looking?" (for a product search: "Want me to search the shops and compare prices for that?") and hand off when they say no, yes or go ahead. brief: the whole request in 1-2 sentences for the agent, with every detail they gave (who, what, budget, by when, likes, must-haves) and whether they agreed to a search of shops and prices. say: a short heads-up, e.g. "Great, I'm on it. I'll keep you posted."
If your "say" asks them anything at all, the action is "talk": you wait for their answer. "handoff" only when their latest words are the go-ahead.
Gift ideas work the same way: once you know who it's for (and the budget, if they have one), ask if there's anything else, then hand off when they say that's it.
The one exception: a clear change to the app with everything it needs ("add Priya's birthday on 14 March", "track the Steam Deck under 40,000", "remove that reminder", "talk to me in Hindi") is handed off straight away, with a "say" like "Adding that now." If something essential is missing (which date?), ask first.
While the agent is working (see "Agent now"): keep the conversation going, never go quiet. Answer what they ask; if they ask how it's going, say what it's doing in plain words. If they add or change a detail of that request, action "update" with brief = just the new detail, and say you'll pass it on. If they want it stopped ("stop", "never mind", "forget it"), action "cancel"; if they asked for something else instead, say you'll get to it next. Don't hand off while it's working.
Never start a search they haven't agreed to.

Facts: ${facts}`;
}

const isReasoning = (m: string) => /gpt-5|o\d|reasoning|thinking/i.test(m);

/** The desk's next move, or undefined if the model can't be reached (the caller then gets the old path). */
export async function decide(i: {
  said: string;
  desk: Desk;
  lang: Language;
  name: string;
  facts: string;
  /** the request the agent is on and its latest step, when it's working */
  agent?: { task: string; doing?: string };
  /** the agent's last answer, when it's idle */
  lastResult?: string;
}): Promise<Decision | undefined> {
  if (!env.openrouterKey) return undefined;
  const call = i.desk.lines.slice(-14).map((l) => `${l.who === "caller" ? "Caller" : "Xerxes"}: ${l.text}`).join("\n");
  const prompt = [
    call ? `Call so far:\n${call}` : "The call just started.",
    i.agent
      ? `Agent now: working on "${i.agent.task}"${i.agent.doing ? `, currently: ${i.agent.doing}` : ""}.${i.desk.updates.length ? ` Details to pass on when it's done: ${i.desk.updates.join("; ")}.` : ""}`
      : `Agent now: idle.${i.lastResult ? ` Its last answer: "${i.lastResult.slice(0, 400)}"` : ""}`,
    `The caller just said: "${i.said}"`,
  ].join("\n\n");
  const model = env.frontModel;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openrouterKey}`, "Content-Type": "application/json", "X-Title": "Xerxes" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system(i.lang, i.name.split(" ")[0] ?? "", i.facts) },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: isReasoning(model) ? undefined : 0.5,
      max_tokens: isReasoning(model) ? 900 : 300,
      ...(isReasoning(model) ? { reasoning: { effort: "low" } } : {}),
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = out.choices?.[0]?.message?.content ?? "";
  const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<Decision>;
  const action = (["talk", "handoff", "update", "cancel"] as const).find((a) => a === j.action) ?? "talk";
  const say = typeof j.say === "string" ? j.say.trim() : "";
  const brief = typeof j.brief === "string" && j.brief.trim() ? j.brief.trim() : undefined;
  if (!say && action === "talk") throw new Error(`no reply in ${raw.slice(0, 160)}`);
  return { say: say || "On it.", action, brief };
}
