import { router } from "expo-router";
import { Mic } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";
import type { Notification, VoiceStart } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { color } from "@/lib/theme";

/** A call about a Radar find opens with it ("Want me to dig into Outer Wilds? It's $9.74 right now."). */
export function findVoice(n: Notification): VoiceStart {
  const name = n.title.split(" · ")[0].slice(0, 60);
  return {
    topic: n.title,
    hello: `Want me to dig into ${name}?${n.price ? ` It's ${n.price} right now.` : ""}`,
    context: `It's this Radar find: "${n.title}: ${n.body}"${n.url ? ` (${n.url})` : ""}`,
  };
}

/** Starts a voice call with Xerxes about this card. The topic travels to the backend, so Xerxes opens on it
 *  instead of a generic "what are we shopping for?". Green so it reads as "talk", next to the grey "listen" key. */
export function TalkButton({ voice, label = "Talk to Xerxes about this" }: { voice: VoiceStart; label?: string }) {
  const params = Object.fromEntries(Object.entries(voice).filter(([, v]) => v)) as Record<string, string>;
  return (
    <Pressable
      onPress={() => {
        haptic.press();
        router.push({ pathname: "/voice", params });
      }}
      hitSlop={10}
      // it sits inside a tappable card, and on web a role="button" here would nest a <button> in a <button>
      accessibilityRole={Platform.OS === "web" ? undefined : "button"}
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color.primary,
            transform: [{ scale: pressed ? 0.9 : 1 }],
          }}
        >
          <Mic size={16} color="#fff" strokeWidth={2.4} />
        </View>
      )}
    </Pressable>
  );
}
