import { AudioLines, Captions } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { Heard } from "@/lib/convoStream";
import { color, font } from "@/lib/theme";
import { Spinner } from "./cards";
import { Card, GradientSurface, Row, T } from "./ui";

// The first two steps of every spoken turn, live on the call screen: the noise gate (your mic's level against the
// threshold that lets a voice through and holds background noise back) and speech-to-text (Agora's ASR, word by word).

type FeedEvent = { mic?: number; heard?: Heard };
/** Mic levels and transcripts arrive many times a second; they go straight to this card, not through the whole screen. */
export type HearingFeed = { mic: (level: number) => void; heard: (h: Heard) => void; listen: (fn: (e: FeedEvent) => void) => () => void };

export function hearingFeed(): HearingFeed {
  const fns = new Set<(e: FeedEvent) => void>();
  return {
    mic: (mic) => fns.forEach((f) => f({ mic })),
    heard: (heard) => fns.forEach((f) => f({ heard })),
    listen: (fn) => {
      fns.add(fn);
      return () => void fns.delete(fn);
    },
  };
}

/** On the 0-100 mic scale: opens above OPEN, shuts below CLOSE (the gap stops flicker), and holds open between words. */
const OPEN = 14;
const CLOSE = 9;
const HOLD_MS = 450;
const FULL = 60; // the meter is full here (speech rarely goes higher)

export function Hearing({ feed, muted }: { feed: HearingFeed; muted: boolean }) {
  const [level, setLevel] = useState(0);
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState<{ text: string; final: boolean } | null>(null);
  const gate = useRef({ open: false, loudAt: 0 });

  useEffect(
    () =>
      feed.listen((e) => {
        if (e.mic !== undefined) {
          const g = gate.current;
          const now = Date.now();
          if (e.mic >= (g.open ? CLOSE : OPEN)) g.loudAt = now;
          g.open = now - g.loudAt < HOLD_MS;
          setLevel(e.mic);
          setOpen(g.open);
        }
        const h = e.heard;
        if (h?.who === "me" && h.text.trim()) setWords({ text: h.text.trim(), final: h.final });
      }),
    [feed],
  );

  const passing = open && !muted;
  const fill = Math.min(1, (muted ? 0 : level) / FULL);
  return (
    <Card pad={14}>
      <T v="eyebrow" style={{ marginBottom: 4 }}>
        Hearing you · live
      </T>
      <Row gap={10} style={{ paddingVertical: 5 }}>
        <Badge on={passing} Icon={AudioLines} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row gap={10} style={{ justifyContent: "space-between" }}>
            <T v="body" style={{ fontSize: 13.5, fontFamily: font.strong, color: color.ink }}>
              Noise gate
            </T>
            <T v="caption" style={{ color: passing ? color.ok : color.muted }} numberOfLines={1}>
              {muted ? "Muted" : passing ? "Open · your voice gets through" : "Closed · background noise held back"}
            </T>
          </Row>
          <View style={{ height: 6, marginTop: 7 }}>
            <View style={{ flex: 1, borderRadius: 3, backgroundColor: color.track, overflow: "hidden" }}>
              <View style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 3, backgroundColor: passing ? color.primary : color.faint }} />
            </View>
            {/* the threshold: louder than this and the gate opens */}
            <View style={{ position: "absolute", left: `${(OPEN / FULL) * 100}%`, top: -3, height: 12, width: 2, borderRadius: 1, backgroundColor: color.ink, opacity: 0.4 }} />
          </View>
        </View>
      </Row>
      <Row gap={10} style={{ paddingVertical: 5, alignItems: "flex-start" }}>
        {words && !words.final ? <Spinner /> : <Badge on={!!words} Icon={Captions} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="body" style={{ fontSize: 13.5, fontFamily: font.strong, color: color.ink }}>
            Speech to text
          </T>
          <T v="body" style={{ fontSize: 13.5, marginTop: 2, color: words ? (words.final ? color.ink2 : color.ink) : color.faint }} numberOfLines={3}>
            {words ? `“${words.text}”` : "Your words show up here as you speak"}
          </T>
        </View>
      </Row>
    </Card>
  );
}

/** The step badge, like the steps card: green when that step is doing its job, grey while it waits. */
function Badge({ on, Icon }: { on: boolean; Icon: typeof AudioLines }) {
  const box = { width: 18, height: 18, borderRadius: 6, alignItems: "center", justifyContent: "center" } as const;
  return on ? (
    <GradientSurface name="primary" style={box} grain={0.3}>
      <Icon size={11} color="#fff" strokeWidth={3} />
    </GradientSurface>
  ) : (
    <View style={[box, { backgroundColor: color.chip }]}>
      <Icon size={11} color={color.faint} strokeWidth={3} />
    </View>
  );
}
