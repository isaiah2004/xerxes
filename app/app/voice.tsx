import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import { Mic, MicOff, PhoneOff, RotateCcw, Settings, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IdeasCard } from "@/components/cards";
import { TurnView, type Turn } from "@/components/Conversation";
import { Hearing, hearingFeed } from "@/components/Hearing";
import { LogoGlyph } from "@/components/Logo";
import { Button, GradientSurface, Row, T } from "@/components/ui";
import { api, type Card } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { openLink } from "@/lib/links";
import { color, ledge, shadow } from "@/lib/theme";
import { joinVoice, openMic, voiceAvailable, type MicHandle, type VoiceHandle } from "@/lib/voice";

type Phase = "connecting" | "mic" | "waiting" | "live" | "ended" | "error";

/** The call runs in the app on web and in builds with the Agora module; Expo Go hands it to the browser. */
const inApp = Platform.OS === "web" || voiceAvailable;

/** Browser/Agora errors → what to do about them. */
function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "MIC_BLOCKED") return "Microphone access is off for Xerxes. Turn it on in Settings, then come back and tap Try again.";
  if (/PERMISSION_DENIED|NotAllowedError|Permission (denied|dismissed)/i.test(m))
    return Platform.OS === "web"
      ? "Xerxes needs your microphone to hear you. Tap Try again and choose Allow (if the browser stopped asking, allow it from the icon next to the address)."
      : "Xerxes needs your microphone to hear you. Tap Try again and choose Allow.";
  if (/NotFoundError|DEVICE_NOT_FOUND|device not found/i.test(m)) return "No microphone found. Connect or enable one, then try again.";
  if (/NotReadableError|Could not start audio source|MIC_UNAVAILABLE/i.test(m)) return "Your microphone is busy in another app. Free it up, then try again.";
  return m;
}

/** The web build's /voice page with the same params (the dev server serves web too). */
function webVoiceUrl(params: Record<string, string | string[] | undefined>) {
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  const base = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ?? `http://${host}:8081`;
  const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))).toString();
  return `${base}/voice${qs ? `?${qs}` : ""}`;
}

/** Xerxes on the call (its logo): breathes while it waits and swells with the agent's voice. */
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
          <LogoGlyph size={size * 0.44} />
        </GradientSurface>
      </Animated.View>
    </View>
  );
}

export default function Voice() {
  const params = useLocalSearchParams<{ conversationId?: string; occasionId?: string; projectId?: string; topic?: string; context?: string; hello?: string; briefing?: string }>();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>(inApp ? "connecting" : "waiting");
  const [error, setError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [greeting, setGreeting] = useState<string>("");
  const [ideas, setIdeas] = useState<Extract<Card, { type: "ideas" }> | null>(null); // the ones the greeting offers
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState<"agent" | "me" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [level] = useState(() => new Animated.Value(0));
  const [attempt, setAttempt] = useState(0);
  const [feed] = useState(hearingFeed); // mic levels + live transcripts → the Hearing card
  const handle = useRef<VoiceHandle | null>(null);
  const session = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    if (!inApp) {
      // Expo Go has no Agora RTC module, so there the call runs in the browser, which has WebRTC.
      // (localhost / 127.0.0.1 count as secure, so the mic works there; a hosted build sets EXPO_PUBLIC_WEB_URL.)
      openLink(webVoiceUrl(params))
        .catch((e: Error) => {
          setError(e.message);
          setPhase("error");
        })
        .finally(() => alive && router.canGoBack() && router.back());
      return () => {
        alive = false;
      };
    }
    (async () => {
      let mic: MicHandle | undefined;
      try {
        // Mic first: if the browser says no, no agent gets started (and nobody greets an empty room).
        const askTimer = setTimeout(() => alive && setPhase((p) => (p === "connecting" ? "mic" : p)), 400);
        mic = await openMic().finally(() => clearTimeout(askTimer));
        if (!alive) return mic.close();
        setPhase("connecting");
        const { conversationId, occasionId, projectId, topic, context, hello, briefing } = params;
        const s = await api.voiceStart({ conversationId, occasionId, projectId, topic, context, hello, briefing: briefing === "1" });
        if (!alive) {
          mic.close();
          return void api.voiceStop(s.sessionId);
        }
        session.current = s.sessionId;
        setGreeting(s.greeting);
        setIdeas(s.ideas ?? null);
        setPhase("waiting");
        const call = await joinVoice(
          s,
          {
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
            mic: feed.mic,
            heard: feed.heard,
          },
          mic,
        );
        mic = undefined; // the call owns it now; leave() closes it
        if (!alive) return void call.leave().catch(() => undefined); // hung up while connecting (cleanup already stopped the agent)
        handle.current = call;
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
        mic?.close();
        if (session.current) api.voiceStop(session.current).catch(() => undefined);
        session.current = null;
        if (!alive) return;
        haptic.error();
        setMicBlocked(e instanceof Error && e.message === "MIC_BLOCKED");
        setError(friendlyError(e));
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
      clearTimeout(poll);
      handle.current?.leave().catch(() => undefined);
      handle.current = null;
      if (session.current) api.voiceStop(session.current).catch(() => undefined);
      session.current = null;
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    haptic.press();
    setError(null);
    setTurns([]);
    setGreeting("");
    setIdeas(null);
    setPhase("connecting");
    setAttempt((a) => a + 1);
  };

  const hangUp = () => {
    haptic.heavy();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const working = turns.length > 0 && turns[turns.length - 1] && phase === "live";
  const status =
    phase === "connecting"
      ? "Connecting…"
      : phase === "mic"
        ? "Allow your microphone"
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
  const compact = turns.length > 0 || !!ideas; // a smaller orb leaves room for the cards

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, paddingTop: insets.top + 8 }}>
      <Row style={{ justifyContent: "space-between", paddingHorizontal: 18, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <T v="eyebrow" numberOfLines={1}>
            {params.topic ? `Voice · ${params.topic}` : "Voice · Agora + Murf"}
          </T>
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
            {error ??
              (phase === "mic"
                ? "Xerxes only listens while this call is open."
                : greeting
                  ? `“${greeting}”`
                  : "Real-time voice by Agora Conversational AI, spoken with Murf Falcon.")}
          </T>
        ) : null}
        {phase === "error" && inApp ? (
          <Row gap={10} style={{ marginTop: 18 }}>
            {micBlocked ? <Button kind="ghost" icon={Settings} label="Open settings" onPress={() => void Linking.openSettings()} /> : null}
            <Button kind="grad" grad="primary" icon={RotateCcw} label="Try again" onPress={retry} />
          </Row>
        ) : null}
      </View>

      {phase === "live" ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 12, width: "100%", maxWidth: 520, alignSelf: "center" }}>
          <Hearing feed={feed} muted={muted} />
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 16, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        {ideas ? <IdeasCard card={ideas} /> : null}
        {turns.map((t) => (
          <TurnView key={t.key} turn={t} speak={false} />
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
