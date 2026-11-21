// Web voice client: joins the Agora RTC channel where the Conversational AI agent (ASR -> Xerxes -> Murf TTS) lives.
import type { IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { transcriptReader, type Heard } from "./convoStream";

export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };
export type MicHandle = { close: () => void; track: IMicrophoneAudioTrack };
export type VoiceEvents = {
  level: (who: "agent" | "me", level: number) => void;
  agentJoined: () => void;
  agentLeft: () => void;
  /** your mic's level (0-100), ~10 times a second: the call screen's noise gate meter */
  mic?: (level: number) => void;
  /** live speech-to-text from the agent's ASR (and its own words as it speaks) */
  heard?: (h: Heard) => void;
};

/** Browsers have WebRTC, so the call always runs in the page. */
export const voiceAvailable = true;

const sdk = async () => {
  const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
  AgoraRTC.setLogLevel(4); // the call screen explains failures itself; SDK error logs only add dev-overlay noise
  return AgoraRTC;
};

/** Ask for the microphone before anything else, so a "no" costs nothing: no agent started, no greeting into an empty room. */
export async function openMic(): Promise<MicHandle> {
  const AgoraRTC = await sdk();
  const track = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
  return {
    track,
    close: () => {
      track.stop();
      track.close();
    },
  };
}

export async function joinVoice(
  opts: { appId: string; channel: string; token: string; uid: number; agentUid: number },
  on: VoiceEvents,
  mic: MicHandle,
): Promise<VoiceHandle> {
  const AgoraRTC = await sdk();
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  // the agent's ASR transcripts come over the RTC data stream
  const read = transcriptReader((h) => on.heard?.(h));
  client.on("stream-message", (uid, payload) => uid === opts.agentUid && read(payload));
  // volume-indicator only fires every 2s on web; the gate meter reads the mic track directly
  const meter = setInterval(() => on.mic?.(Math.round(mic.track.getVolumeLevel() * 100)), 100);

  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") user.audioTrack?.play();
  });
  client.on("user-joined", (user) => user.uid === opts.agentUid && on.agentJoined());
  client.on("user-left", (user) => user.uid === opts.agentUid && on.agentLeft());
  client.enableAudioVolumeIndicator();
  client.on("volume-indicator", (vols: { uid: number | string; level: number }[]) => {
    for (const v of vols) on.level(v.uid === opts.agentUid ? "agent" : "me", v.level);
  });

  try {
    await client.join(opts.appId, opts.channel, opts.token, opts.uid);
    await client.publish([mic.track]);
  } catch (e) {
    clearInterval(meter);
    await client.leave().catch(() => undefined);
    throw e;
  }

  return {
    setMuted: (muted) => mic.track.setEnabled(!muted),
    leave: async () => {
      clearInterval(meter);
      mic.close();
      await client.leave();
    },
  };
}
