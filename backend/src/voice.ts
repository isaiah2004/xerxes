import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { env } from "./env.js";
import { AGENT_UID, USER_UID, agentStatus, startAgent, stopAgent, userRtcToken } from "./integrations/agora.js";
import { upcoming } from "./occasions.js";
import { getRun, type Run } from "./runs.js";
import { readDb } from "./store.js";

// Agora Conversational AI: Agora handles ASR + turn-taking + Murf Falcon TTS in the RTC channel,
// and calls our OpenAI-compatible endpoint below as its "custom LLM" — which runs the same Codex agent + tools.

/** llmKey: per-session secret handed to Agora as llm.api_key; checked when Agora sends it back as a Bearer token. */
type VoiceSession = { id: string; channel: string; agentId?: string; llmKey?: string; runIds: string[] };
const sessions = new Map<string, VoiceSession>();

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
      return c.json({ sessionId: id, appId: env.agoraAppId, channel, uid: USER_UID, agentUid: AGENT_UID, token: userRtcToken(channel), agentId: agent.agent_id, greeting });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.post("/api/voice/stop", async (c) => {
    const { sessionId } = await c.req.json<{ sessionId: string }>();
    const s = sessions.get(sessionId);
    if (!s?.agentId) return c.json({ ok: true });
    try {
      await stopAgent(s.channel, s.agentId);
      s.agentId = undefined;
      return c.json({ ok: true });
    } catch (e) {
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

    const stream = new ReadableStream({
      async start(ctrl) {
        const enc = new TextEncoder();
        const send = (s: string) => ctrl.enqueue(enc.encode(s));
        // Codex turns take 10-60s. Spoken fillers keep the call alive while tools run.
        const fillers = [
          setTimeout(() => send(sseChunk(chunkId, "On it, give me a few seconds. ")), 2500),
          setTimeout(() => send(sseChunk(chunkId, "Still digging, I'm checking prices and delivery dates. ")), 15_000),
          setTimeout(() => send(sseChunk(chunkId, "Almost there, just comparing the best options. ")), 35_000),
        ];
        await waitForRun(run);
        fillers.forEach(clearTimeout);
        const msg = run.events.find((e) => e.type === "message");
        const reply = msg && msg.type === "message" ? msg.text : "Sorry, I couldn't finish that one. Mind trying again?";
        for (const part of reply.match(/[^.!?]+[.!?]*\s*/g) ?? [reply]) send(sseChunk(chunkId, part));
        send(sseChunk(chunkId, null, "stop"));
        send("data: [DONE]\n\n");
        ctrl.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  });
}
