// Native voice client. react-native-agora needs a development build (not Expo Go), so until that build exists
// the native app routes voice through the web app. See voice.web.ts for the live implementation.
export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };

export async function joinVoice(
  _opts: { appId: string; channel: string; token: string; uid: number; agentUid: number },
  _on: { level: (who: "agent" | "me", level: number) => void; agentJoined: () => void; agentLeft: () => void },
): Promise<VoiceHandle> {
  throw new Error("Voice calls on the native app need the Agora development build. Open Xerxes in your phone's browser to talk to it for now.");
}
