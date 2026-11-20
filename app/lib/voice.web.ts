// Web voice client: joins the Agora RTC channel where the Conversational AI agent (ASR -> Xerxes -> Murf TTS) lives.
import type { IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";

export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };
export type MicHandle = { close: () => void; track: IMicrophoneAudioTrack };

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
  on: { level: (who: "agent" | "me", level: number) => void; agentJoined: () => void; agentLeft: () => void },
  mic: MicHandle,
): Promise<VoiceHandle> {
  const AgoraRTC = await sdk();
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

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
    await client.leave().catch(() => undefined);
    throw e;
  }

  return {
    setMuted: (muted) => mic.track.setEnabled(!muted),
    leave: async () => {
      mic.close();
      await client.leave();
    },
  };
}
