import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { env } from "./env.js";
import { AGENT_UID, USER_UID, startAgent, stopAgent, userRtcToken } from "./integrations/agora.js";
import { upcoming } from "./occasions.js";
import { getRun, type Run } from "./runs.js";
import { readDb } from "./store.js";

// Agora Conversational AI: Agora handles ASR + turn-taking + Murf Falcon TTS in the RTC channel,
// and calls our OpenAI-compatible endpoint below as its "custom LLM" — which runs the same Codex agent + tools.

type VoiceSession = { id: string; channel: string; agentId?: string; runIds: string[] };
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
    try {
      const agent = await startAgent({
        channel,
        llmUrl: `${env.publicUrl}/v1/sessions/${id}/chat/completions`,
        llmKey: id,
        greeting,
        instructions: "You are Xerxes, a proactive voice shopping agent.",
      });
      sessions.set(id, { id, channel, agentId: agent.agent_id, runIds: [] });
      return c.json({ sessionId: id, appId: env.agoraAppId, channel, uid: USER_UID, agentUid: AGENT_UID, token: userRtcToken(channel), agentId: agent.agent_id, greeting });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.post("/api/voice/stop", async (c) => {
    const { sessionId } = await c.req.json<{ sessionId: string }>();
    const s = sessions.get(sessionId);
    if (s?.agentId) await stopAgent(s.channel, s.agentId).catch(() => undefined);
    return c.json({ ok: true });
  });

  /** App polls this to render the cards/steps produced during the call. */
  app.get("/api/voice/sessions/:id", (c) => {
    const s = sessions.get(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    return c.json({ runIds: s.runIds, runs: s.runIds.map((r) => { const run = getRun(r); return run && { id: run.id, userText: run.userText, status: run.status }; }) });
  });

  // OpenAI-compatible streaming endpoint Agora calls for every user turn.
  app.post("/v1/sessions/:id/chat/completions", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ messages: { role: string; content: unknown }[] }>();
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const text = typeof lastUser?.content === "string" ? lastUser.content : JSON.stringify(lastUser?.content ?? "");
    const session = sessions.get(id) ?? { id, channel: "", runIds: [] };
    sessions.set(id, session);

    const run = await startTurn(id, text, "voice");
    session.runIds.push(run.id);
    const chunkId = `chatcmpl-${run.id.slice(0, 8)}`;

    const stream = new ReadableStream({
      async start(ctrl) {
        const enc = new TextEncoder();
        const send = (s: string) => ctrl.enqueue(enc.encode(s));
        // Spoken filler if the agent is doing real work (tool calls) — keeps the call feeling alive.
        const filler = setTimeout(() => send(sseChunk(chunkId, "On it, give me a few seconds. ")), 2500);
        await waitForRun(run);
        clearTimeout(filler);
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
