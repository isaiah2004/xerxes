import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { env } from "./env.js";
import { AGENT_UID, USER_UID, agentStatus, startAgent, stopAgent, userRtcToken } from "./integrations/agora.js";
import { upcoming } from "./occasions.js";
import { getRun, type Run, type RunEvent } from "./runs.js";
import { readDb } from "./store.js";

// Agora Conversational AI: Agora handles ASR + turn-taking + Murf Falcon TTS in the RTC channel,
// and calls our OpenAI-compatible endpoint below as its "custom LLM" — which runs the same Codex agent + tools.

/** llmKey: per-session secret handed to Agora as llm.api_key; checked when Agora sends it back as a Bearer token. */
type VoiceSession = { id: string; channel: string; agentId?: string; llmKey?: string; runIds: string[] };
const sessions = new Map<string, VoiceSession>();
const log = (id: string, msg: string) => console.log(`[voice ${id.slice(0, 8)}] ${msg}`);

const SITES: Record<string, string> = {
  "amazon.in": "Amazon", "amazon.com": "Amazon", "flipkart.com": "Flipkart", "bookswagon.com": "Bookswagon",
  "crossword.in": "Crossword", "sapnaonline.com": "Sapna", "steampowered.com": "Steam", "reddit.com": "Reddit",
};
const siteName = (host: string) => {
  const h = host.replace(/^www\./, "").toLowerCase();
  const base = SITES[h] ?? Object.entries(SITES).find(([d]) => h.endsWith(`.${d}`))?.[1] ?? h.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/** What Xerxes says out loud when a tool step starts, so a caller hears the real work instead of silence. */
export function narrate(label: string): string | undefined {
  let m: RegExpMatchArray | null;
  if (label.startsWith("Searched book catalogues")) return "Looking through book catalogues.";
  if (/^Search(ed|ing) the web/.test(label)) return "Searching the online stores.";
  if ((m = label.match(/^Searched ([a-z0-9.-]+\.[a-z]{2,}):/i))) return `Searching ${siteName(m[1])}.`;
  if ((m = label.match(/^(?:Opened|Checked) ([a-z0-9.-]+\.[a-z]{2,})$/i))) return `Checking ${siteName(m[1])} for the price and delivery date.`;
  if (label.startsWith("Checked price, budget and delivery")) return "Making sure it fits your budget and arrives in time.";
  if (label.startsWith("Checked game stores")) return "Checking the game stores for deals.";
  if (label.startsWith("Scanned second-hand listings")) return "Scanning second-hand listings.";
  if (label.startsWith("Watching for")) return "Setting up a watch for that.";
  return undefined;
}

/** Said when nothing else has been spoken for a while, so the line never goes quiet during a long turn. */
const FILLERS = [
  "Still on it, I'm comparing prices and delivery dates.",
  "Bear with me, I'm double-checking the details.",
  "Almost there, just picking the best option.",
  "Nearly done.",
];

const waitForRun = (run: Run) =>
  new Promise<void>((resolve) => {
    if (run.status !== "running") return resolve();
    const l = () => run.status !== "running" && (run.listeners.delete(l), resolve());
    run.listeners.add(l);
  });

function sseChunk(id: string, content: string | null, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "xerxes",
    choices: [{ index: 0, delta: content === null ? {} : { role: "assistant", content }, finish_reason: finish }],
  })}\n\n`;
}

export function voiceRoutes(app: Hono) {
  app.post("/api/voice/start", async (c) => {
    if (!env.publicUrl) return c.json({ error: "PUBLIC_URL is not set — Agora's cloud must be able to reach this backend." }, 400);
    const { conversationId } = await c.req.json<{ conversationId?: string }>().catch(() => ({ conversationId: undefined }));
    const id = conversationId ?? randomUUID();
    const channel = `xerxes-${id.slice(0, 8)}`;
    const db = await readDb();
    const nudge = upcoming(db, 60).find((o) => o.inReminderWindow);
    const greeting = nudge
      ? `Hey ${db.profile.name}! Heads up, ${nudge.label.toLowerCase()} is in ${nudge.daysLeft} days. Want me to find something?`
      : `Hey ${db.profile.name}, Xerxes here. What are we shopping for?`;
    const llmKey = randomUUID();
    try {
      const agent = await startAgent({
        channel,
        llmUrl: `${env.publicUrl}/v1/sessions/${id}/chat/completions`,
        llmKey,
        greeting,
        instructions: "You are Xerxes, a proactive voice shopping agent.",
      });
      sessions.set(id, { id, channel, agentId: agent.agent_id, llmKey, runIds: sessions.get(id)?.runIds ?? [] });
      log(id, `agent ${agent.agent_id} started in ${channel} (${agent.status})`);
      return c.json({ sessionId: id, appId: env.agoraAppId, channel, uid: USER_UID, agentUid: AGENT_UID, token: userRtcToken(channel), agentId: agent.agent_id, greeting });
    } catch (e) {
      log(id, `agent failed to start: ${(e as Error).message}`);
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.post("/api/voice/stop", async (c) => {
    const { sessionId } = await c.req.json<{ sessionId: string }>();
    const s = sessions.get(sessionId);
    if (!s?.agentId) return c.json({ ok: true });
    try {
      await stopAgent(s.channel, s.agentId);
      log(s.id, `agent ${s.agentId} stopped`);
      s.agentId = undefined;
      return c.json({ ok: true });
    } catch (e) {
      log(s.id, `agent stop failed: ${(e as Error).message}`);
      return c.json({ ok: false, error: (e as Error).message }, 502);
    }
  });

  /** App polls this to render the cards/steps produced during the call. */
  app.get("/api/voice/sessions/:id", (c) => {
    const s = sessions.get(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    return c.json({ runIds: s.runIds, runs: s.runIds.map((r) => { const run = getRun(r); return run && { id: run.id, userText: run.userText, status: run.status }; }) });
  });

  /** Live Agora agent state (IDLE/STARTING/RUNNING/STOPPING/STOPPED/FAILED). */
  app.get("/api/voice/sessions/:id/agent", async (c) => {
    const s = sessions.get(c.req.param("id"));
    if (!s?.agentId) return c.json({ error: "no active agent" }, 404);
    try {
      return c.json(await agentStatus(s.channel, s.agentId));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  // OpenAI-compatible streaming endpoint Agora calls for every user turn.
  app.post("/v1/sessions/:id/chat/completions", async (c) => {
    const id = c.req.param("id");
    const session = sessions.get(id);
    if (!session) return c.json({ error: { message: "unknown voice session" } }, 404);
    const auth = c.req.header("authorization");
    if (auth && session.llmKey && auth !== `Bearer ${session.llmKey}`) return c.json({ error: { message: "bad api key" } }, 401);
    const body = await c.req.json<{ messages?: { role: string; content: unknown }[] }>().catch(() => ({ messages: undefined }));
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
    const text = (typeof lastUser?.content === "string"
      ? lastUser.content
      : Array.isArray(lastUser?.content)
        ? lastUser.content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join(" ")
        : "").trim();
    if (!text) return c.json({ error: { message: "no user message" } }, 400);

    const run = await startTurn(id, text, "voice");
    session.runIds.push(run.id);
    const chunkId = `chatcmpl-${run.id.slice(0, 8)}`;
    const t0 = Date.now();
    const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;
    log(id, `heard: "${text.slice(0, 160)}" -> run ${run.id.slice(0, 8)}`);

    // Codex turns take 30-90s. Xerxes narrates its real tool steps (and falls back to fillers) so the call never
    // goes quiet. Agora drops this request when the caller talks over it, so every write must survive a closed stream.
    let open = true;
    let ack: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setInterval> | undefined;
    let onStep: ((e: RunEvent) => void) | undefined;
    const stopNarrating = () => {
      clearTimeout(ack);
      clearInterval(idle);
      if (onStep) run.listeners.delete(onStep);
    };
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const enc = new TextEncoder();
        const send = (s: string) => {
          if (!open) return;
          try {
            ctrl.enqueue(enc.encode(s));
          } catch {
            open = false;
          }
        };
        const said = new Set<string>();
        let lastSpoke = Date.now();
        let filler = 0;
        const say = (line: string) => {
          if (said.has(line)) return;
          said.add(line);
          lastSpoke = Date.now();
          send(sseChunk(chunkId, `${line} `));
        };
        ack = setTimeout(() => say("On it, give me a moment."), 1500);
        idle = setInterval(() => {
          if (Date.now() - lastSpoke >= 16_000 && filler < FILLERS.length) say(FILLERS[filler++]);
        }, 2000);
        onStep = (e) => {
          if (e.type !== "step" || e.state !== "running" || Date.now() - lastSpoke < 7000) return;
          const line = narrate(e.label);
          if (line) say(line);
        };
        run.listeners.add(onStep);

        void waitForRun(run).then(() => {
          stopNarrating();
          const msg = run.events.find((e) => e.type === "message");
          const err = run.events.find((e) => e.type === "error");
          const reply = msg && msg.type === "message" && msg.text ? msg.text : "Sorry, I couldn't finish that one. Mind trying again?";
          log(id, `run ${run.id.slice(0, 8)} ${run.status} in ${secs()}${err && err.type === "error" ? ` (${err.message.slice(0, 200)})` : ""}${open ? "" : " (caller had moved on)"}: "${reply.slice(0, 160)}"`);
          for (const part of reply.match(/[^.!?]+[.!?]*\s*/g) ?? [reply]) send(sseChunk(chunkId, part));
          send(sseChunk(chunkId, null, "stop"));
          send("data: [DONE]\n\n");
          if (open) {
            open = false;
            try {
              ctrl.close();
            } catch {
              /* already closed */
            }
          }
        });
      },
      cancel() {
        open = false;
        stopNarrating();
        log(id, `Agora closed the stream after ${secs()} (caller interrupted?); run ${run.id.slice(0, 8)} keeps going`);
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  });
}
