// Native voice client. react-native-agora needs a development build (not Expo Go), so until that build exists
// the native app opens the call in the browser (see app/voice.tsx). voice.web.ts is the live implementation.
export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };
export type MicHandle = { close: () => void };

const NEEDS_BUILD = "Voice calls inside the native app need the Agora development build; Xerxes opens them in your browser instead.";

export async function openMic(): Promise<MicHandle> {
  throw new Error(NEEDS_BUILD);
}

export async function joinVoice(
  _opts: { appId: string; channel: string; token: string; uid: number; agentUid: number },
  _on: { level: (who: "agent" | "me", level: number) => void; agentJoined: () => void; agentLeft: () => void },
  _mic: MicHandle,
): Promise<VoiceHandle> {
  throw new Error(NEEDS_BUILD);
}
