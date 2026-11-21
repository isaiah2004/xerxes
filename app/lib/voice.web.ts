// Web voice client: joins the Agora RTC channel where the Conversational AI agent (ASR -> Xerxes -> Murf TTS) lives.
import type { IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import { transcriptReader, type Heard } from "./convoStream";
import { adaptiveGate, type GateState } from "./gate";

export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };
export type MicHandle = { close: () => void; track: IMicrophoneAudioTrack };
export type VoiceEvents = {
  level: (who: "agent" | "me", level: number) => void;
  agentJoined: () => void;
  agentLeft: () => void;
  /** the adaptive noise gate, ~20 times a second: your level, its threshold, open or holding */
  gate?: (g: GateState) => void;
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
  const gate = adaptiveGate();
  let agentAudio: IRemoteAudioTrack | undefined;

  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") {
      user.audioTrack?.play();
      if (user.uid === opts.agentUid) agentAudio = user.audioTrack;
    }
  });
  client.on("user-joined", (user) => user.uid === opts.agentUid && on.agentJoined());
  client.on("user-left", (user) => user.uid === opts.agentUid && on.agentLeft());

  // the agent's ASR transcripts, and when it starts and stops speaking, come over the RTC data stream
  const read = transcriptReader(
    (h) => on.heard?.(h),
    (s) => gate.agentState(s),
  );
  client.on("stream-message", (uid, payload) => uid === opts.agentUid && read(payload));

  // What Agora hears is a copy of the mic that the gate turns up or down. The mic track itself is never turned
  // down: the SDK measures its level after its own volume, and the gate needs to keep hearing you while it's shut.
  const send = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: mic.track.getMediaStreamTrack() });
  send.setVolume(0);
  let muted = false;
  let sent = false;
  let silentSince = Date.now();
  let bypass = false; // no level readings at all (no Web Audio): send everything rather than nothing
  const tick = setInterval(() => {
    const raw = mic.track.getVolumeLevel();
    if (raw > 0) silentSince = Date.now();
    else if (!bypass && Date.now() - silentSince > 3000) bypass = true;
    const agent = (agentAudio?.getVolumeLevel() ?? 0) * 100;
    const g = gate.step(raw * 100, agent, muted);
    const pass = bypass ? !muted : g.open;
    if (pass !== sent) {
      sent = pass;
      send.setVolume(pass ? 100 : 0);
    }
    on.gate?.(bypass ? { ...g, open: pass } : g);
    on.level("agent", agent); // smoother than the 2-second volume indicator for the orb
  }, 50);

  try {
    await client.join(opts.appId, opts.channel, opts.token, opts.uid);
    await client.publish([send]);
  } catch (e) {
    clearInterval(tick);
    send.close();
    await client.leave().catch(() => undefined);
    throw e;
  }

  return {
    setMuted: async (m) => {
      muted = m; // the gate shuts and stays shut; the mic keeps running so unmuting is instant
    },
    leave: async () => {
      clearInterval(tick);
      send.close();
      mic.close();
      await client.leave();
    },
  };
}
