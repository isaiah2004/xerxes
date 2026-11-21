import { useEffect, useState } from "react";
import { View } from "react-native";
import type { Heard } from "@/lib/convoStream";
import type { GateState } from "@/lib/gate";
import { color } from "@/lib/theme";
import { T } from "./ui";

// Under the orb on a call, no card: the adaptive noise gate (your level, the threshold it has learned from the room,
// and whether it's letting you through) and speech-to-text (your words as Agora's ASR hears them, live).

type FeedEvent = { gate?: GateState; heard?: Heard };
/** Gate readings and transcripts arrive many times a second; they go straight to this strip, not through the screen. */
export type HearingFeed = { gate: (g: GateState) => void; heard: (h: Heard) => void; listen: (fn: (e: FeedEvent) => void) => () => void };

export function hearingFeed(): HearingFeed {
  const fns = new Set<(e: FeedEvent) => void>();
  return {
    gate: (gate) => fns.forEach((f) => f({ gate })),
    heard: (heard) => fns.forEach((f) => f({ heard })),
    listen: (fn) => {
      fns.add(fn);
      return () => void fns.delete(fn);
    },
  };
}

const FULL = 80; // the meter's top on the 0-100 level scale

function gateText(g: GateState | null) {
  if (!g) return "Noise gate";
  if (g.mode === "muted") return "Muted";
  if (g.mode === "xerxes") return g.open ? "Gate open · you cut in" : "Gate holding · Xerxes is talking";
  return g.open ? "Gate open · hearing you" : "Gate closed · tuned to the room";
}

export function Hearing({ feed }: { feed: HearingFeed }) {
  const [g, setG] = useState<GateState | null>(null);
  const [words, setWords] = useState<{ text: string; final: boolean } | null>(null);

  useEffect(
    () =>
      feed.listen((e) => {
        if (e.gate) setG(e.gate);
        const h = e.heard;
        if (h?.who === "me" && h.text.trim()) setWords({ text: h.text.trim(), final: h.final });
      }),
    [feed],
  );

  const open = !!g?.open;
  const pct = (v: number) => `${Math.min(1, Math.max(0, v / FULL)) * 100}%` as const;
  return (
    <View style={{ width: "100%", maxWidth: 300, alignSelf: "center", alignItems: "center", marginTop: 10, paddingHorizontal: 18 }}>
      <View style={{ width: "100%", height: 4 }}>
        <View style={{ flex: 1, borderRadius: 2, backgroundColor: color.track, overflow: "hidden" }}>
          {/* the room's noise floor, as the gate has learned it */}
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g?.floor ?? 0), backgroundColor: "#E2DCEB" }} />
          <View style={{ width: pct(g?.level ?? 0), height: "100%", borderRadius: 2, backgroundColor: open ? color.primary : color.faint }} />
        </View>
        {/* where the gate opens right now: it follows the room, and jumps above Xerxes' echo while it talks */}
        <View
          style={{
            position: "absolute",
            left: pct(g?.threshold ?? 0),
            top: -3,
            height: 10,
            width: 2,
            borderRadius: 1,
            backgroundColor: g?.mode === "xerxes" ? color.warning : color.ink,
            opacity: g ? 0.55 : 0,
          }}
        />
      </View>
      <T v="caption" style={{ marginTop: 7, textAlign: "center", color: open ? color.ok : color.muted }} numberOfLines={1}>
        {gateText(g)}
      </T>
      {words ? (
        <T v="body" style={{ marginTop: 6, textAlign: "center", fontSize: 14, color: words.final ? color.ink2 : color.ink }} numberOfLines={2}>
          {`“${words.text}${words.final ? "" : "…"}”`}
        </T>
      ) : null}
    </View>
  );
}
