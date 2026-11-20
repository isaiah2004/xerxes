import { router, useLocalSearchParams } from "expo-router";
import { Mic, MicOff, PhoneOff, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TurnView, type Turn } from "@/components/Conversation";
import { GradientSurface, Row, T } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { color, ledge, shadow } from "@/lib/theme";
import { joinVoice, type VoiceHandle } from "@/lib/voice";

type Phase = "connecting" | "waiting" | "live" | "ended" | "error";

function Orb({ level, phase, size }: { level: Animated.Value; phase: Phase; size: number }) {
  const [breathe] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [breathe]);
  const halo = Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }), level.interpolate({ inputRange: [0, 100], outputRange: [0, 0.35], extrapolate: "clamp" }));
  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: size * 1.32, height: size * 1.32, borderRadius: size, opacity: 0.22, transform: [{ scale: halo }] }}>
        <GradientSurface name={phase === "error" ? "danger" : "primary"} style={{ flex: 1, borderRadius: size }} grain={0.3} />
      </Animated.View>
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] }, shadow.float]}>
        <GradientSurface name={phase === "error" ? "danger" : "primary"} style={{ flex: 1, alignItems: "center", justifyContent: "center" }} grain={0.7}>
          <Mic size={size * 0.26} color="#fff" strokeWidth={2.2} />
        </GradientSurface>
      </Animated.View>
    </View>
  );
}

export default function Voice() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState<"agent" | "me" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [level] = useState(() => new Animated.Value(0));
  const handle = useRef<VoiceHandle | null>(null);
  const session = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const s = await api.voiceStart(params.conversationId);
        if (!alive) return void api.voiceStop(s.sessionId);
        session.current = s.sessionId;
        setGreeting(s.greeting);
        setPhase("waiting");
        handle.current = await joinVoice(s, {
          level: (who, l) => {
            if (who === "agent") level.setValue(l);
            if (l > 18) setSpeaker(who);
            else setSpeaker((cur) => (cur === who ? null : cur));
          },
          agentJoined: () => {
            haptic.success();
            setPhase("live");
          },
          agentLeft: () => setPhase("ended"),
        });
        setPhase((p) => (p === "waiting" ? "live" : p));
        const tick = async () => {
          try {
            const r = await api.voiceSession(s.sessionId);
            setTurns(r.runs.filter(Boolean).map((x) => ({ key: x!.id, text: x!.userText, runId: x!.id })));
          } catch {}
          if (alive) poll = setTimeout(tick, 1500);
        };
        tick();
      } catch (e) {
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
      clearTimeout(poll);
      handle.current?.leave().catch(() => undefined);
      if (session.current) api.voiceStop(session.current).catch(() => undefined);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hangUp = () => {
    haptic.heavy();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const working = turns.length > 0 && turns[turns.length - 1] && phase === "live";
  const status =
    phase === "connecting"
      ? "Connecting…"
      : phase === "waiting"
        ? "Calling Xerxes…"
        : phase === "error"
          ? "Couldn't start the call"
          : phase === "ended"
            ? "Call ended"
            : speaker === "agent"
              ? "Xerxes is speaking"
              : speaker === "me"
                ? "Listening…"
                : working
                  ? "Go ahead, I'm listening"
                  : "Say hi to Xerxes";
  const compact = turns.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, paddingTop: insets.top + 8 }}>
      <Row style={{ justifyContent: "space-between", paddingHorizontal: 18, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        <View>
          <T v="eyebrow">Voice · Agora + Murf</T>
          <T v="h2">Xerxes</T>
        </View>
        <Pressable onPress={hangUp} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" }}>
            <X size={18} color={color.ink} />
          </View>
        </Pressable>
      </Row>

      <View style={{ alignItems: "center", marginTop: compact ? 0 : 40 }}>
        <Orb level={level} phase={phase} size={compact ? 92 : 170} />
        <T v={compact ? "h3" : "h1"} style={{ marginTop: compact ? 0 : 6 }}>
          {status}
        </T>
        {!compact ? (
          <T v="sub" style={{ marginTop: 8, textAlign: "center", paddingHorizontal: 40 }}>
            {error ?? (greeting ? `“${greeting}”` : "Real-time voice by Agora Conversational AI, spoken with Murf Falcon.")}
          </T>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 16, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        {turns.map((t) => (
          <TurnView key={t.key} turn={t} onAction={() => undefined} speak={false} />
        ))}
      </ScrollView>

      <Row gap={18} style={{ justifyContent: "center", paddingTop: 12, paddingBottom: Math.max(insets.bottom, 18) }}>
        <Pressable
          onPress={() => {
            const m = !muted;
            haptic.tap();
            setMuted(m);
            handle.current?.setMuted(m);
          }}
          disabled={phase !== "live"}
        >
          <View style={{ width: 60, height: 60, borderRadius: 22, backgroundColor: muted ? color.ink : "#fff", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", opacity: phase === "live" ? 1 : 0.5 }}>
            {muted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color={color.ink} />}
          </View>
        </Pressable>
        <Pressable onPress={hangUp}>
          <View style={{ paddingBottom: 4 }}>
            <View style={{ position: "absolute", top: 4, left: 0, right: 0, bottom: 0, borderRadius: 22, backgroundColor: ledge.danger }} />
            <View style={{ width: 60, height: 60, borderRadius: 22, backgroundColor: color.danger, alignItems: "center", justifyContent: "center" }}>
              <PhoneOff size={22} color="#fff" />
            </View>
          </View>
        </Pressable>
      </Row>
    </View>
  );
}
