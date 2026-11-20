import { env } from "../env.js";

/** Murf Falcon streaming TTS. Returns the upstream Response (chunked audio bytes). */
export async function murfStream(text: string, opts: { voiceId?: string; locale?: string; format?: "MP3" | "WAV" } = {}) {
  if (!env.murfApiKey) throw new Error("MURF_API_KEY is not configured");
  const r = await fetch(`${env.murfRegionUrl}/v1/speech/stream`, {
    method: "POST",
    headers: { "api-key": env.murfApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 3000),
      voiceId: opts.voiceId ?? env.murfVoice,
      locale: opts.locale ?? env.murfLocale,
      model: "falcon-2.1",
      format: opts.format ?? "MP3",
      sampleRate: 24000,
      channelType: "MONO",
    }),
  });
  if (!r.ok || !r.body) throw new Error(`Murf ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}
