import { existsSync } from "node:fs";

// Local dev: load backend/.env (written by scripts/sync-secrets.mjs). In Docker, compose injects env_file.
if (existsSync(".env")) process.loadEnvFile(".env");

const opt = (k: string) => process.env[k]?.trim() || undefined;

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

  tavilyKey: opt("TAVILY_API_KEY"),
  watchIntervalMin: Number(opt("WATCH_INTERVAL_MIN") ?? 30),
};

export const mask = (v?: string) => (v ? v.replace(/[A-Za-z]/g, "a").replace(/[0-9]/g, "1") : "(unset)");
