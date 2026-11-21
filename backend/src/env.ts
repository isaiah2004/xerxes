import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Local dev: load backend/.env (written by scripts/sync-secrets.mjs). In Docker, compose injects env_file.
if (existsSync(".env")) process.loadEnvFile(".env");

const opt = (k: string) => process.env[k]?.trim() || undefined;
// The repo-root .env holds the OpenRouter key and model names. Only those are read from it, and they stay out of
// process.env, so the Codex process the backend spawns (which inherits process.env) never sees them.
const root = (existsSync("../.env") ? parseEnv(readFileSync("../.env", "utf8")) : {}) as Record<string, string | undefined>;
const router = (k: string) => opt(k) ?? (root[k]?.trim() || undefined);

export const env = {
  port: Number(opt("PORT") ?? 8787),
  /** Public base URL Agora's cloud can reach (tunnel or deployed host). Needed for voice. */
  publicUrl: opt("PUBLIC_URL")?.replace(/\/$/, ""),
  dataDir: opt("XERXES_DATA_DIR") ?? ".data",

  agoraAppId: opt("AGORA_APP_ID"),
  agoraAppCertificate: opt("AGORA_APP_CERTIFICATE"),
  agoraCustomerId: opt("AGORA_CUSTOMER_ID"),
  agoraCustomerSecret: opt("AGORA_CUSTOMER_SECRET"),
  agoraAsrVendor: opt("AGORA_ASR_VENDOR") ?? "ares",
  agoraAsrLanguage: opt("AGORA_ASR_LANGUAGE") ?? "en-US",
  /** The agent's noise gate: how sure Agora's VAD must be that a sound is speech before it reaches ASR (0-1).
   * 0.5 is Agora's default; raise it (0.6-0.7) in a loud room so chatter and clatter don't start turns. */
  agoraSpeechThreshold: Math.min(0.95, Math.max(0.05, Number(opt("AGORA_SPEECH_THRESHOLD") ?? 0.5) || 0.5)),

  murfApiKey: opt("MURF_API_KEY"),
  murfVoice: opt("MURF_VOICE") ?? "en-IN-anisha",
  murfLocale: opt("MURF_LOCALE") ?? "en-IN",
  murfRegionUrl: opt("MURF_STREAM_URL") ?? "https://global.api.murf.ai",

  anthropicKey: opt("ANTHROPIC_API_KEY"),
  openaiKey: opt("OPENAI_API_KEY"),
  openaiBaseUrl: opt("OPENAI_BASE_URL"),
  gatewayKey: opt("AI_GATEWAY_API_KEY"),
  model: opt("XERXES_MODEL"),
  voiceModel: opt("XERXES_VOICE_MODEL"),
  /** OpenRouter: the quick model that talks on calls (frontDesk.ts) while Codex does the shopping. */
  openrouterKey: router("OPENROUTER_API_KEY"),
  frontModel: opt("XERXES_FRONT_MODEL") ?? router("OPENROUTER_CHAT_MODEL") ?? "openai/gpt-4o-mini",

  tavilyKey: opt("TAVILY_API_KEY"),
  /** Reddit app-only OAuth for r/homelabsales (anonymous JSON is blocked). */
  redditClientId: opt("REDDIT_CLIENT_ID"),
  redditClientSecret: opt("REDDIT_CLIENT_SECRET"),
  watchIntervalMin: Number(opt("WATCH_INTERVAL_MIN") ?? 30),
};

export const mask = (v?: string) => (v ? v.replace(/[A-Za-z]/g, "a").replace(/[0-9]/g, "1") : "(unset)");
