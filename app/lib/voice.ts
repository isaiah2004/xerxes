// Native voice client: joins the same Agora RTC channel as the web client (where the Conversational AI agent
// ASR -> Xerxes -> Murf TTS lives), through react-native-agora. That needs a development/release build;
// Expo Go has no Agora module, so voiceAvailable is false there and the call screen falls back to the browser.
import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from "react-native";
import type { IRtcEngineEventHandler } from "react-native-agora";
import { transcriptReader, type Heard } from "./convoStream";

export type VoiceHandle = { leave: () => Promise<void>; setMuted: (muted: boolean) => Promise<void> };
export type MicHandle = { close: () => void };
export type VoiceEvents = {
  level: (who: "agent" | "me", level: number) => void;
  agentJoined: () => void;
  agentLeft: () => void;
  /** your mic's level (0-100), several times a second: the call screen's noise gate meter */
  mic?: (level: number) => void;
  /** live speech-to-text from the agent's ASR (and its own words as it speaks) */
  heard?: (h: Heard) => void;
};

/** True when this build includes react-native-agora's native module. */
export const voiceAvailable = (() => {
  try {
    return !!(TurboModuleRegistry.get("AgoraRtcNg") ?? NativeModules.AgoraRtcNg);
  } catch {
    return false;
  }
})();

/** Ask for the microphone before anything else, so a "no" costs nothing: no agent started, no greeting into an empty room. */
export async function openMic(): Promise<MicHandle> {
  // iOS asks on first capture (NSMicrophoneUsageDescription); Android needs a runtime request.
  if (Platform.OS === "android") {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) throw new Error("MIC_BLOCKED");
    if (r !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("PERMISSION_DENIED");
  }
  return { close: () => undefined }; // the engine owns capture once the call starts
}

// Errors that mean the join can't succeed (bad token/app id/channel, rejected, no permission) or the mic won't start.
const FATAL = new Set([2, 7, 9, 17, 101, 102, 109, 110]);
const MIC_FAILED = new Set([1011, 1012]);

export async function joinVoice(
  opts: { appId: string; channel: string; token: string; uid: number; agentUid: number },
  on: VoiceEvents,
  _mic: MicHandle,
): Promise<VoiceHandle> {
  const agora = await import("react-native-agora");
  const engine = agora.createAgoraRtcEngine();
  engine.initialize({
    appId: opts.appId,
    channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
    audioScenario: agora.AudioScenarioType.AudioScenarioAiClient, // Agora's tuning for talking to a Conversational AI agent
  });

  // Agora's on-device AI noise suppression: fans, traffic and keyboards are taken out before the audio leaves the phone.
  try {
    engine.setAINSMode(true, agora.AudioAinsMode.AinsModeBalanced);
  } catch {
    /* older SDK: the AI-client audio scenario still suppresses noise */
  }

  // the agent's ASR transcripts come over the RTC data stream
  const read = transcriptReader((h) => on.heard?.(h));
  let joining: { resolve: () => void; reject: (e: Error) => void } | undefined;
  const handler: IRtcEngineEventHandler = {
    onStreamMessage: (_c, remoteUid, _streamId, data) => {
      if (remoteUid === opts.agentUid) read(data);
    },
    onJoinChannelSuccess: () => joining?.resolve(),
    onError: (err, msg) => {
      if (MIC_FAILED.has(err)) joining?.reject(new Error("MIC_UNAVAILABLE"));
      else if (FATAL.has(err)) joining?.reject(new Error(`Agora error ${err}${msg ? `: ${msg}` : ""}`));
    },
    onConnectionStateChanged: (_c, state, reason) => {
      if (state === agora.ConnectionStateType.ConnectionStateFailed) joining?.reject(new Error(`Agora connection failed (reason ${reason})`));
    },
    onUserJoined: (_c, uid) => uid === opts.agentUid && on.agentJoined(),
    onUserOffline: (_c, uid) => uid === opts.agentUid && on.agentLeft(),
    // Native volumes are 0-255 (local user reported as uid 0); the call screen works in the web SDK's 0-100.
    onAudioVolumeIndication: (_c, speakers) => {
      for (const s of speakers) {
        const level = Math.round(((s.volume ?? 0) / 255) * 100);
        on.level(s.uid === opts.agentUid ? "agent" : "me", level);
        if (s.uid === 0) on.mic?.(level); // uid 0 = this phone's mic
      }
    },
  };
  engine.registerEventHandler(handler);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    engine.unregisterEventHandler(handler);
    engine.leaveChannel();
    engine.release();
  };

  try {
    engine.enableAudio();
    engine.setDefaultAudioRouteToSpeakerphone(true); // you look at the screen while Xerxes talks, so not the earpiece
    engine.enableAudioVolumeIndication(150, 3, true); // often enough for the noise gate meter to feel live
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out joining the voice channel")), 15_000);
      joining = {
        resolve: () => (clearTimeout(timer), resolve()),
        reject: (e) => (clearTimeout(timer), reject(e)),
      };
      const code = engine.joinChannel(opts.token, opts.channel, opts.uid, {
        channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
        clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        autoSubscribeAudio: true,
      });
      if (code < 0) joining.reject(new Error(`Agora joinChannel failed (${code})`));
    });
  } catch (e) {
    release();
    throw e;
  } finally {
    joining = undefined;
  }

  return {
    setMuted: async (muted) => void engine.muteLocalAudioStream(muted),
    leave: async () => release(),
  };
}
