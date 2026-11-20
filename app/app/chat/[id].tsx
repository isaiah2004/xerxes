import { router, useLocalSearchParams } from "expo-router";
import { ArrowUp, ChevronLeft, Mic, Sparkles } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentBubble, TurnView, type Turn } from "@/components/Conversation";
import { Card, GradientSurface, Row, T, Tap } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { api, type Upcoming } from "@/lib/api";
import { dayDate, money, pronounsFor } from "@/lib/format";
import { color, font, ledge, radius } from "@/lib/theme";

export default function Chat() {
  const params = useLocalSearchParams<{ id: string; occasionId?: string; prompt?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const [conversationId, setConversationId] = useState<string | null>(params.id && params.id !== "new" ? params.id : null);
  const [occasion, setOccasion] = useState<Upcoming | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(params.prompt ?? "");
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!conversationId) api.newConversation().then((c) => setConversationId(c.id)).catch(() => undefined);
    if (params.occasionId)
      api.feed().then((f) => setOccasion(f.upcoming.find((o) => o.id === params.occasionId) ?? null)).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const person = occasion?.people.length === 1 ? occasion.people[0] : undefined;
  const p = person ? pronounsFor(person.relation) : undefined;
  const pronoun = p?.subj;
  const suggestions = useMemo(() => {
    if (!occasion) return [];
    const half = `Keep it under ${money(Math.round(occasion.budget.amount / 2), occasion.budget.currency)}`;
    if (!person) {
      return occasion.kind === "anniversary"
        ? ["Something they can enjoy together", "An experience, not a thing", half]
        : ["One thoughtful gift per person, within budget", "One big gift for the whole family", half];
    }
    const interest = person.interests[0];
    return [
      interest ? `A hardcover ${interest.replace(/s$/, "")} book with cool visuals and lots of facts` : "Something thoughtful and useful",
      `Surprise me — you know ${p?.obj ?? "them"}`,
      half,
    ];
  }, [occasion, person, p]);
  const intro = occasion
    ? `${person && occasion.turningAge ? `${person.name} turns ${occasion.turningAge}` : `${occasion.label} is`} on ${dayDate(occasion.nextDate)}. To be safe, it should arrive by ${dayDate(occasion.arriveBy)}, and your budget is ${money(occasion.budget.amount, occasion.budget.currency)}. ${
        person ? `What’s ${pronoun} into lately?` : occasion.kind === "anniversary" ? "What do they love doing together?" : "Who’s on the list this year?"
      }`
    : "";

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || !conversationId || sending) return;
    haptic.press();
    setInput("");
    setSending(true);
    const key = `${Date.now()}`;
    setTurns((t) => [...t, { key, text }]);
    const withCtx = occasion && turns.length === 0 ? `${text}\n\n[context: this is for "${occasion.label}" — occasionId ${occasion.id}]` : text;
    try {
      const { runId } = await api.send(conversationId, withCtx);
      setTurns((t) => t.map((x) => (x.key === key ? { ...x, runId } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setSending(false);
    }
  };

  const title = params.title ?? occasion?.label ?? "Xerxes";
  const subtitle = occasion
    ? `${occasion.kind === "birthday" ? "Birthday" : occasion.label} · ${occasion.daysLeft} days · ${money(occasion.budget.amount, occasion.budget.currency)}`
    : "Your shopping agent";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* header */}
      <View style={{ paddingTop: insets.top + 10, paddingBottom: 10, paddingHorizontal: 18, backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <Row gap={12} style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}>
          <Pressable
            onPress={() => {
              haptic.tap();
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            hitSlop={8}
            accessibilityLabel="Back"
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={20} color={color.ink} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <T v="h2" numberOfLines={1}>
              {title}
            </T>
            <T v="caption">{subtitle}</T>
          </View>
        </Row>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} showsVerticalScrollIndicator={false} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, gap: 14 }}>
          {occasion ? (
            <View style={{ gap: 10 }}>
              <AgentBubble text={intro} />
              {turns.length === 0 ? (
                <View style={{ gap: 8 }}>
                  {suggestions.map((s) => (
                    <Tap key={s} onPress={() => send(s)} accessibilityLabel={s}>
                      <Card pad={12} style={{ borderStyle: "dashed" }}>
                        <Row gap={10}>
                          <Sparkles size={15} color={color.primary} />
                          <T v="bodyStrong" style={{ flex: 1, fontSize: 13.5 }}>
                            {s}
                          </T>
                        </Row>
                      </Card>
                    </Tap>
                  ))}
                </View>
              ) : null}
            </View>
          ) : turns.length === 0 ? (
            <AgentBubble text="Tell me what you're after. I'll do the digging, compare prices and delivery, and come back with a pick." />
          ) : null}
          {turns.map((t) => (
            <TurnView key={t.key} turn={t} onAction={send} />
          ))}
        </View>
      </ScrollView>

      {/* composer */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.paper }}>
        <Row gap={10} style={{ width: "100%", maxWidth: 520, alignSelf: "center", alignItems: "flex-end" }}>
          <View style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 12 : 8, minHeight: 48, justifyContent: "center" }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={occasion ? `What's ${pronoun ?? "everyone"} into?` : "Ask Xerxes anything…"}
              placeholderTextColor={color.faint}
              multiline
              onKeyPress={(e) => {
                const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                  (e as unknown as { preventDefault: () => void }).preventDefault();
                  send(input);
                }
              }}
              style={{ fontFamily: font.body, fontSize: 15, color: color.ink, maxHeight: 120, outlineStyle: "none" } as object}
            />
          </View>
          {input.trim() ? (
            <Pressable onPress={() => send(input)} disabled={sending || !conversationId}>
              <View style={{ paddingBottom: 4 }}>
                <View style={{ position: "absolute", top: 4, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: ledge.primary }} />
                <GradientSurface name="primary" style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                  <ArrowUp size={22} color="#fff" strokeWidth={2.6} />
                </GradientSurface>
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push({ pathname: "/voice", params: { conversationId: conversationId ?? undefined } })}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <Mic size={20} color="#fff" />
              </View>
            </Pressable>
          )}
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}

