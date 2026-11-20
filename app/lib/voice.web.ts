// Web voice client: joins the Agora RTC channel where the Conversational AI agent (ASR -> Xerxes -> Murf TTS) lives.
export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };

export async function joinVoice(
  opts: { appId: string; channel: string; token: string; uid: number; agentUid: number },
  on: { level: (who: "agent" | "me", level: number) => void; agentJoined: () => void; agentLeft: () => void },
): Promise<VoiceHandle> {
  const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
  AgoraRTC.setLogLevel(3);
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

  await client.join(opts.appId, opts.channel, opts.token, opts.uid);
  const mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
  await client.publish([mic]);

  return {
    setMuted: (muted) => mic.setEnabled(!muted),
    leave: async () => {
      mic.stop();
      mic.close();
      await client.leave();
    },
  };
}
