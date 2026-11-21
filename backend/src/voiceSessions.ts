import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";
import type { Desk } from "./frontDesk.js";
import { languageOf, type Language } from "./languages.js";

// Live calls survive a backend restart (tsx watch reloads on every save in dev; a redeploy in production): the
// sessions Agora's agent calls back into are kept on disk, so its next turn still finds its session instead of a 404
// ("I hit a snag"). Runs aren't kept, so after a restart the call carries on but its earlier turns drop off the screen.

/** llmKey: per-session secret handed to Agora as llm.api_key; checked when Agora sends it back as a Bearer token.
 *  context: where the call was started from (a card, a deal) + what Xerxes opened with; handed to the first turn only.
 *  desk: the voice desk's side of the call (frontDesk.ts). */
export type VoiceSession = { id: string; channel: string; agentId?: string; llmKey?: string; runIds: string[]; context?: string; lang: Language; at: number; desk?: Desk };
type Stored = Omit<VoiceSession, "lang"> & { lang: string };

const MAX_AGE = 6 * 3600_000;
const file = () => path.join(env.dataDir, "voice-sessions.json");

function load(): Map<string, VoiceSession> {
  try {
    const list = JSON.parse(readFileSync(file(), "utf8")) as Stored[];
    return new Map(list.filter((s) => Date.now() - s.at < MAX_AGE).map((s) => [s.id, { ...s, lang: languageOf(s.lang) }]));
  } catch {
    return new Map(); // first start, or nothing worth keeping
  }
}

export const sessions = load();
if (sessions.size) console.log(`[voice] picked up ${sessions.size} call session(s) from before the restart`);

/** Write the sessions to disk; call after any change to one. A small file, written whole (tmp + rename). */
export function saveSessions() {
  try {
    mkdirSync(env.dataDir, { recursive: true });
    const keep: Stored[] = [...sessions.values()].filter((s) => Date.now() - s.at < MAX_AGE).map((s) => ({ ...s, lang: s.lang.code }));
    writeFileSync(`${file()}.tmp`, JSON.stringify(keep));
    renameSync(`${file()}.tmp`, file());
  } catch (e) {
    console.warn(`[voice] couldn't save call sessions: ${(e as Error).message}`);
  }
}
