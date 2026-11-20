import "./env.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { env, mask } from "./env.js";
import { handleMcp } from "./mcp.js";
import { upcoming } from "./occasions.js";
import { getRun } from "./runs.js";
import { readDb, mutate } from "./store.js";
import { murfStream } from "./integrations/murf.js";
import { voiceRoutes } from "./voice.js";
import { startWatchers } from "./watchers.js";

const app = new Hono();
app.use("/api/*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// ---- MCP endpoint for Codex (local only in practice; run id scopes events) ----
app.all("/mcp/:runId", (c) => handleMcp(c.req.param("runId"), c.req.raw));

// ---- Today feed: proactive nudges + notifications ----
app.get("/api/feed", async (c) => {
  const db = await readDb();
  const occasions = upcoming(db, 400);
  return c.json({
    profile: db.profile,
    nudges: occasions.filter((o) => o.inReminderWindow),
    upcoming: occasions,
    notifications: db.notifications.slice(0, 30),
    watches: db.watches,
    shortlist: db.shortlist,
  });
});

app.get("/api/people", async (c) => c.json((await readDb()).people));

app.post("/api/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  await mutate((db) => db.notifications.forEach((n) => n.id === id && (n.read = true)));
  return c.json({ ok: true });
});

// ---- Agent conversation ----
app.post("/api/conversations", (c) => c.json({ id: randomUUID() }));

app.post("/api/conversations/:id/messages", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: "text required" }, 400);
  const run = await startTurn(c.req.param("id"), text.trim());
  return c.json({ runId: run.id });
});

app.get("/api/runs/:id", (c) => {
  const run = getRun(c.req.param("id"));
  if (!run) return c.json({ error: "not found" }, 404);
  const after = Number(c.req.query("after") ?? -1);
  return c.json({ status: run.status, events: run.events.filter((e) => e.seq > after) });
});

// ---- Murf TTS (spoken notifications / replies) ----
app.get("/api/tts", async (c) => {
  const text = c.req.query("text");
  if (!text) return c.json({ error: "text required" }, 400);
  try {
    const r = await murfStream(text, { voiceId: c.req.query("voice") ?? undefined });
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

voiceRoutes(app);

serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Xerxes backend on :${info.port}`);
  console.log(`  agora app id ${mask(env.agoraAppId)} · murf ${env.murfApiKey ? "set" : "unset"} · public url ${env.publicUrl ?? "(unset — voice needs it)"}`);
  startWatchers();
});
