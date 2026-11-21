import "./env.js";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { startTurn } from "./agent.js";
import { codexLoggedIn } from "./codex.js";
import { env, mask } from "./env.js";
import { fail } from "./http.js";
import { ideasRoutes, startIdeas } from "./ideas.js";
import { linkRoutes } from "./links.js";
import { uploadFiles, uploadRoutes } from "./uploads.js";
import { findLanguage, LANGUAGES, languageOf } from "./languages.js";
import { handleMcp } from "./mcp.js";
import { upcoming } from "./occasions.js";
import { getRun } from "./runs.js";
import { manageRoutes } from "./manage.js";
import { peopleRoutes } from "./people.js";
import { listProjects, projectRoutes, projectSummary } from "./projects.js";
import { readDb, mutate } from "./store.js";
import { murfStream } from "./integrations/murf.js";
import { publicUrlAnswers, voiceRoutes } from "./voice.js";
import { pickedVoice, voicesFor } from "./voices.js";
import { startWatchers } from "./watchers.js";

// One stray error (a stream write after a client hung up, a flaky upstream) must not take the server down
// and drop every live voice call with it. Log it and keep serving.
process.on("uncaughtException", (e) => console.error("[uncaught]", e));
process.on("unhandledRejection", (e) => console.error("[unhandled rejection]", e));

const app = new Hono();
app.use("/api/*", cors());

app.get("/health", (c) => c.json({ ok: true }));
/** Readiness detail for ops (no secrets): is Codex logged in, is voice configured. */
// reachable: whether Agora's cloud can actually get to us through PUBLIC_URL (a dead tunnel = "I hit a snag" on every turn).
app.get("/api/status", async (c) => {
  const [loggedIn, reachable] = await Promise.all([codexLoggedIn(), env.publicUrl ? publicUrlAnswers() : Promise.resolve(false)]);
  return c.json({ ok: true, codexLoggedIn: loggedIn, voice: { publicUrl: env.publicUrl ?? null, reachable, agora: !!(env.agoraAppId && env.agoraAppCertificate), murf: !!env.murfApiKey } });
});

// ---- MCP endpoint for Codex: loopback only, and only for live runs ----
const PROXY_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "forwarded", "x-envoy-external-address"];
app.all("/mcp/:runId", async (c) => {
  const run = getRun(c.req.param("runId"));
  if (!run || run.status !== "running") return c.json({ error: "not found" }, 404);
  let addr = "";
  try {
    addr = getConnInfo(c).remote.address ?? "";
  } catch {
    /* non-node runtime */
  }
  const loopback = /^(127\.|::1$|::ffff:127\.)/.test(addr);
  // Tunnels/reverse proxies connect from loopback too — any forwarding header means the request is external.
  if (!loopback || PROXY_HEADERS.some((h) => c.req.header(h))) return c.json({ error: "forbidden" }, 403);
  return handleMcp(run.id, c.req.raw);
});

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
    projects: listProjects(db).map((p) => projectSummary(db, p)),
    shortlist: db.shortlist,
  });
});

// ---- Settings (Profile): the language Xerxes hears, speaks and replies in (app text stays English), and its voice. ----
const settings = async () => {
  const db = await readDb();
  const lang = languageOf(db.profile.language);
  return {
    language: lang.code,
    languages: LANGUAGES.map(({ code, name, native }) => ({ code, name, native })),
    /** Xerxes' voice in that language (each language keeps its own) */
    voice: pickedVoice(db, lang),
  };
};
app.get("/api/settings", async (c) => c.json(await settings()));
app.patch("/api/settings", async (c) => {
  const b: { language?: unknown; voice?: unknown } = await c.req.json().catch(() => ({}));
  if (b.language === undefined && b.voice === undefined) return c.json({ error: "Send a language or a voice" }, 400);
  if (b.language !== undefined) {
    const lang = typeof b.language === "string" ? findLanguage(b.language) : undefined;
    if (!lang) return c.json({ error: `Pick one of: ${LANGUAGES.map((l) => l.name).join(", ")}` }, 400);
    await mutate((db) => {
      db.profile.language = lang.code;
    });
    console.log(`[settings] language → ${lang.name} (chat now, voice from the next call)`);
  }
  if (b.voice !== undefined) {
    // a voice for the language Xerxes talks in now; it has to be one that speaks it
    const lang = languageOf((await readDb()).profile.language);
    let voices;
    try {
      voices = await voicesFor(lang);
    } catch (e) {
      return fail(c, e);
    }
    const v = voices.find((x) => x.id === b.voice);
    if (!v) return c.json({ error: `That voice doesn't speak ${lang.name}. Pick one from the list.` }, 400);
    await mutate((db) => {
      db.profile.voices = { ...db.profile.voices, [lang.code]: { id: v.id, locale: v.locale, name: v.name } };
    });
    console.log(`[settings] voice in ${lang.name} → ${v.name} (${v.id}, read-aloud now, calls from the next one)`);
  }
  return c.json(await settings());
});
// The voices that speak the language Xerxes talks in (or ?language=), for the picker; sample: what a preview says.
app.get("/api/voices", async (c) => {
  const db = await readDb();
  const lang = languageOf(c.req.query("language") ?? db.profile.language);
  const first = db.profile.name.split(" ")[0] ?? "";
  try {
    return c.json({
      language: lang.code,
      voice: pickedVoice(db, lang).id,
      defaultVoice: lang.voice,
      sample: lang.phrases ? lang.phrases.hello(first) : `Hey ${first}! I'm Xerxes. What are we shopping for today?`,
      voices: await voicesFor(lang),
    });
  } catch (e) {
    return fail(c, e);
  }
});

app.post("/api/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  await mutate((db) => db.notifications.forEach((n) => n.id === id && (n.read = true)));
  return c.json({ ok: true });
});

// ---- Agent conversation ----
app.post("/api/conversations", (c) => c.json({ id: randomUUID() }));

// projectId: the chat was opened from a project, so it builds on (and is logged in) that project.
// images: ids from /api/uploads (photos the model gets to see); with photos, the text can be empty.
app.post("/api/conversations/:id/messages", async (c) => {
  const { text, projectId, images } = await c.req.json<{ text?: string; projectId?: string; images?: unknown }>();
  let files: string[];
  try {
    files = await uploadFiles(images);
  } catch (e) {
    return fail(c, e);
  }
  const said = typeof text === "string" ? text.trim() : "";
  if (!said && !files.length) return c.json({ error: "text required" }, 400);
  const label = said || (files.length === 1 ? "(a photo)" : `(${files.length} photos)`);
  const run = await startTurn(c.req.param("id"), label, "text", undefined, typeof projectId === "string" ? projectId : undefined, undefined, files);
  return c.json({ runId: run.id });
});

app.get("/api/runs/:id", (c) => {
  const run = getRun(c.req.param("id"));
  if (!run) return c.json({ error: "not found" }, 404);
  const after = Number(c.req.query("after") ?? -1);
  return c.json({ status: run.status, events: run.events.filter((e) => e.seq > after) });
});

// ---- Murf TTS (spoken notifications / replies) ----
// In Xerxes' voice for the language it talks in, unless ?voice=&locale= ask for another (the voice picker's previews).
app.get("/api/tts", async (c) => {
  const text = c.req.query("text");
  if (!text) return c.json({ error: "text required" }, 400);
  const voice = c.req.query("voice") || undefined;
  try {
    const db = await readDb();
    const own = pickedVoice(db, languageOf(db.profile.language));
    const r = await murfStream(text, voice ? { voiceId: voice, locale: c.req.query("locale") || undefined } : { voiceId: own.id, locale: own.locale });
    // a named voice always sounds the same, so it can be cached; Xerxes' own changes when they pick another
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": voice ? "public, max-age=3600" : "no-cache", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

manageRoutes(app); // tracked items / Calendar add-edit-delete, dismiss finds
projectRoutes(app);
peopleRoutes(app); // the People tab: add, edit, remove
ideasRoutes(app); // gift ideas thought up ahead, for chats and calls that open on an occasion
uploadRoutes(app); // photos sent in a chat
linkRoutes(app); // link previews for pasted product links
voiceRoutes(app);

serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Xerxes backend on :${info.port}`);
  console.log(`  agora app id ${mask(env.agoraAppId)} · murf ${env.murfApiKey ? "set" : "unset"} · public url ${env.publicUrl ?? "(unset — voice needs it)"}`);
  startWatchers();
  startIdeas();
});
