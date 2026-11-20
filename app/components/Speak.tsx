import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Pause, Volume2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { color } from "@/lib/theme";

/** Speaks text with Murf Falcon (via the backend's /api/tts proxy). */
export function useSpeaker() {
  const player = useRef<AudioPlayer | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  useEffect(() => () => player.current?.remove(), []);

  const stop = () => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    setState("idle");
  };

  const speak = (text: string) => {
    if (state !== "idle") return stop();
    setState("loading");
    const p = createAudioPlayer(api.ttsUrl(text));
    player.current = p;
    const sub = p.addListener("playbackStatusUpdate", (s) => {
      if (s.playing) setState("playing");
      if (s.didJustFinish) {
        sub.remove();
        stop();
      }
    });
    p.play();
  };

  return { speak, stop, state };
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
