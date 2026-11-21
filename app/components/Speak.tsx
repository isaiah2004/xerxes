import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Pause, Volume2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { color } from "@/lib/theme";

/** Speaks text with Murf Falcon (via the backend's /api/tts proxy): in Xerxes' voice, or a given one (previews).
 *  key: what's loading or playing (voice id + text), so a list of previews can show which one. */
export function useSpeaker() {
  const player = useRef<AudioPlayer | null>(null);
  const current = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => () => player.current?.remove(), []);

  const stop = () => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    current.current = null;
    setKey(null);
    setState("idle");
  };

  /** Press again on what's playing to stop it; something else stops it and plays instead. */
  const speak = (text: string, voice?: { id: string; locale: string }) => {
    const k = `${voice?.id ?? ""}|${text}`;
    const again = current.current === k;
    if (player.current) stop();
    if (again) return;
    current.current = k;
    setKey(k);
    setState("loading");
    const p = createAudioPlayer(api.ttsUrl(text, voice));
    player.current = p;
    const sub = p.addListener("playbackStatusUpdate", (s) => {
      if (player.current !== p) return sub.remove(); // replaced by another one
      if (s.playing) setState("playing");
      if (s.didJustFinish) {
        sub.remove();
        stop();
      }
    });
    p.play();
  };

  return { speak, stop, state, key };
}

export function SpeakButton({ text, light }: { text: string; light?: boolean }) {
  const { speak, state } = useSpeaker();
  const fg = light ? "#fff" : color.ink;
  return (
    <Pressable onPress={() => speak(text)} hitSlop={10} accessibilityLabel="Listen">
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: light ? "rgba(255,255,255,0.12)" : color.chip,
        }}
      >
        {state === "loading" ? <ActivityIndicator size="small" color={fg} /> : state === "playing" ? <Pause size={16} color={fg} /> : <Volume2 size={16} color={fg} />}
      </View>
    </Pressable>
  );
}
