import agoraToken from "agora-token";
import { env } from "../env.js";

const { ConvoAITokenBuilder, RtcTokenBuilder, RtcRole } = agoraToken;
const API = "https://api.agora.io/api/conversational-ai-agent/v2/projects";
const TTL = 60 * 60 * 6;

export const AGENT_UID = 1001;
export const USER_UID = 1002;

function need() {
  if (!env.agoraAppId || !env.agoraAppCertificate) throw new Error("AGORA_APP_ID / AGORA_APP_CERTIFICATE not configured");
  return { appId: env.agoraAppId, cert: env.agoraAppCertificate };
}

export function userRtcToken(channel: string, uid = USER_UID) {
  const { appId, cert } = need();
  return RtcTokenBuilder.buildTokenWithUid(appId, cert, channel, uid, RtcRole.PUBLISHER, TTL, TTL);
}

// One ConvoAI token per channel: Agora requires the REST Authorization token to match properties.token
// (same channel + agent uid). Reused for join, status and leave.
const tokens = new Map<string, { token: string; exp: number }>();
export function agentToken(channel: string, uid = AGENT_UID) {
  const { appId, cert } = need();
  const hit = tokens.get(channel);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const token = ConvoAITokenBuilder.buildToken(appId, cert, channel, String(uid), TTL, TTL);
  tokens.set(channel, { token, exp: Date.now() + TTL * 1000 });
  return token;
}

/** REST auth: Basic (customer key/secret) if provided, otherwise ConvoAI token auth from the App Certificate. */
function authHeader(channel: string) {
  if (env.agoraCustomerId && env.agoraCustomerSecret)
    return `Basic ${Buffer.from(`${env.agoraCustomerId}:${env.agoraCustomerSecret}`).toString("base64")}`;
  return `agora token="${agentToken(channel)}"`;
}

async function call(path: string, channel: string, body?: unknown) {
  const { appId } = need();
  const r = await fetch(`${API}/${appId}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authHeader(channel), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Agora ${path} ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

export type StartAgentInput = {
  channel: string;
  llmUrl: string;
  llmKey: string;
  greeting: string;
  instructions: string;
  /** The caller's language (Profile → Language): what ARES listens for and how Murf speaks. Defaults: env. */
  asrLanguage?: string;
  voiceId?: string;
  locale?: string;
  failureMessage?: string;
};

export async function startAgent(i: StartAgentInput): Promise<{ agent_id: string; status: string }> {
  return call("/join", i.channel, {
    name: `xerxes-${i.channel}`,
    properties: {
      channel: i.channel,
      token: agentToken(i.channel),
      agent_rtc_uid: String(AGENT_UID),
      remote_rtc_uids: [String(USER_UID)],
      enable_string_uid: false,
      idle_timeout: 120,
      asr: { vendor: env.agoraAsrVendor, language: i.asrLanguage ?? env.agoraAsrLanguage, params: {} },
      // Noise gate: only sound Agora's VAD scores as speech above the threshold opens a turn and goes on to ASR.
      turn_detection: { mode: "default", config: { speech_threshold: env.agoraSpeechThreshold } },
      // ASR transcripts (the user's words as they speak) stream to the app over the RTC data stream: the call
      // screen shows them live. "datastream" is Agora's default; set here so the app can count on it.
      parameters: { data_channel: "datastream" },
      llm: {
        vendor: "custom",
        style: "openai",
        url: i.llmUrl,
        api_key: i.llmKey,
        system_messages: [{ role: "system", content: i.instructions }],
        greeting_message: i.greeting,
        failure_message: i.failureMessage ?? "Hmm, I hit a snag looking that up. Could you say that again?",
        max_history: 20,
        params: { model: "xerxes" },
      },
      tts: {
        vendor: "murf",
        params: {
          api_key: env.murfApiKey,
          base_url: "wss://global.api.murf.ai/v1/speech/stream-input",
          voiceId: i.voiceId ?? env.murfVoice,
          locale: i.locale ?? env.murfLocale,
          model: "FALCON",
          sample_rate: 24000,
          rate: 0,
          pitch: 0,
        },
      },
    },
  });
}

export const stopAgent = async (channel: string, agentId: string) => {
  const r = await call(`/agents/${agentId}/leave`, channel, {});
  tokens.delete(channel);
  return r;
};
export const agentStatus = (channel: string, agentId: string): Promise<{ agent_id: string; status: string; message?: string; start_ts?: number; stop_ts?: number }> =>
  call(`/agents/${agentId}`, channel);
export const speak = (channel: string, agentId: string, text: string) =>
  call(`/agents/${agentId}/speak`, channel, { text: text.slice(0, 500), priority: "APPEND", interruptable: true });
