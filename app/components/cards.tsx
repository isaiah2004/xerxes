import { Image } from "expo-image";
import { router } from "expo-router";
import { AlertTriangle, BellOff, BookOpen, CalendarDays, Check, ChevronRight, Eye, FolderOpen, RefreshCw, Sparkles, UserRound, Users, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import type { ActionArea, Card as CardT, Idea, ProductItem, RunEvent } from "@/lib/api";
import { addDaysIso, dayNum, money, todayIso, weekdayDay, weekdayShort } from "@/lib/format";
import { openLink } from "@/lib/links";
import { color, font, palette, radius, type GradientName } from "@/lib/theme";
import { iconOf } from "./projects";
import { SpeakButton } from "./Speak";
import { StoresCard } from "./StoresCard";
import { Button, Card, Chip, GradientSurface, IconTile, Ring, Row, T, Tap, type Tone } from "./ui";

const open = (url?: string) => void openLink(url);

// ---------------------------------------------------------------- verdict
function verdictView(item: ProductItem): { tone: Tone; label: string; caption: string } {
  const when = item.arrives ? weekdayDay(item.arrives) : undefined;
  const est = item.deliveryEstimated ? " · est." : "";
  switch (item.verdict) {
    case "safe":
      return { tone: "ok", label: when ?? "On time", caption: `${item.spareDays ?? "–"} days to spare${est}` };
    case "tight":
      return { tone: "warn", label: when ?? "Tight", caption: `Tight — ${item.spareDays ?? 0} days spare${est}` };
    case "late":
      return { tone: "bad", label: when ?? "Late", caption: "Arrives after the deadline" };
    case "over_budget":
      return { tone: "bad", label: "Over budget", caption: when ? `Arrives ${when}` : "" };
    case "late_and_over_budget":
      return { tone: "bad", label: "Late + over", caption: "Doesn't fit" };
    default:
      return { tone: "neutral", label: when ?? "", caption: "" };
  }
}

// ---------------------------------------------------------------- cover
function Cover({ uri, w = 72, h = 96 }: { uri?: string; w?: number; h?: number }) {
  const [failed, setFailed] = useState(false);
  const frame = { width: w, height: h, borderRadius: 10 };
  return (
    <View style={[frame, { backgroundColor: color.chip, shadowColor: palette.navy, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={frame}
          contentFit="cover"
          transition={250}
          onError={() => setFailed(true)}
          // "no cover" placeholders (Open Library, Amazon) load fine but are 1×1: show our own cover instead
          onLoad={(e) => e.source.width <= 2 && setFailed(true)}
        />
      ) : (
        <GradientSurface name="navy" glow={0.4} style={[frame, { alignItems: "center", justifyContent: "center" }]}>
          <BookOpen size={24} color="#fff" />
        </GradientSurface>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- product card
export function ProductCard({ item }: { item: ProductItem }) {
  const v = verdictView(item);
  const cur = item.currency ?? "INR";
  const total = item.total ?? (item.price !== undefined ? item.price + (item.shipping ?? 0) : undefined);
  const delivery =
    item.shipping === undefined ? item.retailer ?? "" : item.shipping === 0 ? "incl. free delivery" : `${money(item.price, cur)} + ${money(item.shipping, cur)} delivery`;
  return (
    <Tap onPress={() => open(item.url)} scale={0.985} accessibilityLabel={item.title}>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <Row gap={12} style={{ padding: 14, alignItems: "flex-start" }}>
          <Cover uri={item.imageUrl} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {item.bestPick ? <Chip label="Best pick" tone="dark" icon={Sparkles} /> : null}
            <T v="h3" numberOfLines={2}>
              {item.title}
            </T>
            {item.subtitle ? (
              <T v="caption" numberOfLines={1}>
                {item.subtitle}
              </T>
            ) : null}
            {item.tags?.length ? (
              <Row gap={6} wrap style={{ marginTop: 4 }}>
                {item.tags.slice(0, 3).map((t) => (
                  <Chip key={t} label={t.length > 28 ? `${t.slice(0, 26)}…` : t} />
                ))}
              </Row>
            ) : null}
          </View>
        </Row>
        <Row style={{ justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: color.line }}>
          <View>
            <T v="num">{money(total, cur)}</T>
            <T v="caption">{delivery}</T>
          </View>
          {item.verdict && item.verdict !== "info" ? (
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Chip label={v.label} tone={v.tone} icon={v.tone === "ok" ? Check : v.tone === "bad" ? AlertTriangle : undefined} />
              {v.caption ? <T v="caption">{v.caption}</T> : null}
            </View>
          ) : null}
        </Row>
        {item.reason ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 12, marginTop: -2 }}>
            <T v="sub" numberOfLines={2}>
              {item.reason}
            </T>
          </View>
        ) : null}
      </Card>
    </Tap>
  );
}

export function ProductsCard({ card }: { card: Extract<CardT, { type: "products" }> }) {
  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow" style={{ marginLeft: 4 }}>
        {card.heading}
      </T>
      {card.items.map((it, i) => (
        <ProductCard key={`${it.title}-${i}`} item={it} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- recommendation (decision card)
export function RecommendationCard({ card, onAction }: { card: Extract<CardT, { type: "recommendation" }>; onAction: (text: string) => void }) {
  const it = card.item;
  const cur = it.currency ?? "INR";
  const total = it.total ?? (it.price ?? 0) + (it.shipping ?? 0);
  const left = card.budget !== undefined ? card.budget - total : undefined;
  const today = todayIso();
  // delivery path in green; tight → orange, late → red; spare buffer in blue (info); the occasion itself in navy
  const arrival: GradientName = it.verdict === "late" || it.verdict === "late_and_over_budget" ? "danger" : it.verdict === "tight" ? "warning" : "primary";
  const timeline = [
    { label: "Order", date: today, g: "primary" },
    { label: "Ships", date: card.ships ?? addDaysIso(today, 1), g: "primary" },
    it.arrives ? { label: "Arrives", date: it.arrives, g: arrival } : null,
    card.arriveBy ? { label: "Buffer", date: card.arriveBy, g: "info" } : null,
    card.occasionDate ? { label: card.occasionLabel?.toLowerCase().includes("birthday") ? "Birthday" : "Occasion", date: card.occasionDate, g: "navy" } : null,
  ].filter(Boolean) as { label: string; date: string; g: GradientName }[];
  const used = card.budget ? total / card.budget : 0;

  return (
    <View style={{ gap: 12 }}>
      <Card pad={16}>
        <Row gap={14} style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="sub">Xerxes recommends</T>
            <T v="h1" numberOfLines={3} style={{ marginTop: 2 }}>
              {it.title}
            </T>
            {it.subtitle ? <T v="caption" style={{ marginTop: 4 }}>{it.subtitle}</T> : null}
          </View>
          <Cover uri={it.imageUrl} w={64} h={86} />
        </Row>
        <View style={{ height: 1, backgroundColor: color.line, marginVertical: 14 }} />
        <Row gap={14}>
          <View style={{ flex: 1 }}>
            <T v="sub">Total incl. delivery</T>
            <T v="numXL" style={{ marginTop: 2 }}>
              {money(total, cur)}
            </T>
            {card.budget !== undefined ? (
              <T v="caption" style={{ marginTop: 4, color: left !== undefined && left < 0 ? color.bad : color.muted }}>
                {left !== undefined && left >= 0
                  ? `${money(left, cur)} left${card.occasionLabel || card.occasionDate ? " — room for a card and wrapping" : " in the budget"}`
                  : `${money(-(left ?? 0), cur)} over budget`}
              </T>
            ) : null}
          </View>
          {card.budget !== undefined ? (
            <Ring value={used} size={74} stroke={7} tone={used > 1 ? "danger" : used > 0.9 ? "warning" : "primary"}>
              <T v="num" style={{ fontSize: 16 }}>{Math.round(used * 100)}%</T>
              <T v="caption" style={{ fontSize: 9.5, lineHeight: 11 }}>of {money(card.budget, cur)}</T>
            </Ring>
          ) : null}
        </Row>
      </Card>

      {timeline.length > 2 ? (
        <Card pad={16}>
          <T v="h3">Delivery timeline</T>
          <Row gap={4} style={{ marginTop: 12, alignItems: "flex-start" }}>
            {timeline.map((s) => (
              <View key={s.label} style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
                <GradientSurface name={s.g} style={{ height: 8, alignSelf: "stretch", borderRadius: 99 }} grain={0.3} />
                <T v="eyebrow" style={{ fontSize: 9.5, letterSpacing: 0.6, marginTop: 8 }} numberOfLines={1}>
                  {s.date === today ? "Today" : weekdayShort(s.date)}
                </T>
                <T v="num" style={{ fontSize: 17, lineHeight: 21 }}>{dayNum(s.date)}</T>
                <T v="caption" style={{ fontSize: 10.5 }} numberOfLines={1}>
                  {s.label}
                </T>
              </View>
            ))}
          </Row>
        </Card>
      ) : null}

      <Card pad={16}>
        <Row gap={6} wrap>
          {card.checks.map((c) => (
            <Chip key={c} label={c} tone="ok" icon={Check} />
          ))}
          {it.retailer ? <Chip label={`Seller: ${it.retailer}`} /> : null}
        </Row>
        <T v="body" style={{ marginTop: 10 }}>
          {card.why}
        </T>
      </Card>

      {card.followUp ? (
        <GradientSurface name="navy" glow style={{ borderRadius: radius.xl, padding: 14 }}>
          <Row gap={12}>
            <SpeakButton text={card.followUp} light />
            <T v="bodyStrong" style={{ color: "#fff", flex: 1, fontSize: 13.5 }}>
              “{card.followUp}”
            </T>
          </Row>
          <Row gap={8} style={{ marginTop: 12 }}>
            <Button kind="grad" grad="primary" compact label="Yes, do it" onPress={() => onAction(`Yes — ${card.followUp}`)} style={{ flex: 1 }} />
            <Button kind="glass" compact label="Not now" onPress={() => onAction("Not now, thanks.")} />
          </Row>
        </GradientSurface>
      ) : null}

      <View style={{ gap: 10, marginTop: 2 }}>
        <Button kind="grad" label={`Buy on ${it.retailer ?? "store"} · ${money(total, cur)}`} onPress={() => open(it.url)} disabled={!it.url} />
        <Button kind="ghost" label="Save to plan" onPress={() => onAction(`Save “${it.title}” to my plan.`)} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- ideas (directions first; the search starts once one is picked)
/** "Let's go with the wildlife field guide. Find me the best one." Names ("Kindle Paperwhite", "LEGO set") keep their capitals. */
function pickMessage(title: string) {
  const words = title.trim().replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "Let's go with that one. Find me the best one.";
  if (/^(a|an|the|some)$/i.test(words[0])) words[0] = words[0].toLowerCase();
  else {
    const named = /^[A-Z0-9]{2}/.test(words[0]) || words.slice(1).some((w) => /^[A-Z]/.test(w));
    if (!named) words[0] = words[0].charAt(0).toLowerCase() + words[0].slice(1);
    words.unshift("the");
  }
  return `Let's go with ${words.join(" ")}. Find me the best one.`;
}

/** One emoji pictures the idea; anything else (none, or a word) gets the sparkles instead. */
const glyphOf = (emoji?: string) => {
  const e = emoji?.trim();
  return e && e.length <= 8 && !/[A-Za-z]/.test(e) ? e : undefined;
};

function IdeaRow({ idea, onPress }: { idea: Idea; onPress?: () => void }) {
  const glyph = glyphOf(idea.emoji);
  const row = (
    <Row gap={12} style={{ paddingHorizontal: 14, paddingVertical: 12, alignItems: "flex-start" }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color.chip, alignItems: "center", justifyContent: "center" }}>
        {glyph ? <Text style={{ fontSize: 24, lineHeight: 30, textAlign: "center" }}>{glyph}</Text> : <Sparkles size={20} color={color.ink2} strokeWidth={2.2} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T v="h3" numberOfLines={2}>
          {idea.title}
        </T>
        {idea.why ? (
          <T v="sub" numberOfLines={2}>
            {idea.why}
          </T>
        ) : null}
        {idea.price ? (
          <View style={{ marginTop: 5 }}>
            <Chip label={idea.price} />
          </View>
        ) : null}
      </View>
      {/* in a call there's nothing to tap: you say which one */}
      {onPress ? (
        <View style={{ alignSelf: "center" }}>
          <ChevronRight size={18} color={color.faint} />
        </View>
      ) : null}
    </Row>
  );
  if (!onPress) return row;
  return (
    <Tap onPress={onPress} scale={0.985} accessibilityLabel={[idea.title, idea.price, idea.why].filter(Boolean).join(". ")}>
      {row}
    </Tap>
  );
}

/**
 * A few directions to choose from, thought up in seconds. Tapping one sends it back as the next message, which is what
 * starts the real search (prices, delivery). In a call (no onAction) it's the same card to look at: you say which one.
 */
export function IdeasCard({ card, onAction }: { card: Extract<CardT, { type: "ideas" }>; onAction?: (text: string) => void }) {
  const ideas = (card.ideas ?? []).filter((i) => i?.title?.trim());
  if (!ideas.length) return null;
  return (
    <Card pad={0}>
      <Row gap={6} style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 }}>
        <Sparkles size={13} color={color.primary} strokeWidth={2.4} />
        <T v="eyebrow" numberOfLines={2} style={{ flex: 1 }}>
          {card.heading || "A few ideas"}
        </T>
      </Row>
      {ideas.map((idea, i) => (
        <View key={`${idea.title}-${i}`}>
          {/* hairline from where the text starts, like a grouped list */}
          {i ? <View style={{ height: 1, backgroundColor: color.line, marginLeft: 70 }} /> : null}
          <IdeaRow idea={idea} onPress={onAction && (() => onAction(pickMessage(idea.title)))} />
        </View>
      ))}
      <View style={{ gap: 10, padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.line }}>
        {onAction ? (
          <>
            <T v="caption">Pick one and I’ll find the best option, with price and delivery checked.</T>
            <Button kind="ghost" compact icon={RefreshCw} label="Different ideas" onPress={() => onAction("Give me a few different ideas.")} />
          </>
        ) : (
          <T v="caption">Say which one and I’ll find the best option, with price and delivery checked.</T>
        )}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- question + watch
export function QuestionCard({ card, onAnswer }: { card: Extract<CardT, { type: "question" }>; onAnswer: (t: string) => void }) {
  return (
    <Card pad={16}>
      <T v="h3">{card.question}</T>
      <View style={{ gap: 8, marginTop: 12 }}>
        {card.options.map((o) => (
          <Button key={o} kind="ghost" compact label={o} onPress={() => onAnswer(o)} />
        ))}
      </View>
    </Card>
  );
}

export function WatchCard({ card }: { card: Extract<CardT, { type: "watch" }> }) {
  const w = card.watch;
  return (
    <Card>
      <Row gap={12}>
        <IconTile icon={Eye} grad="info" size={44} />
        <View style={{ flex: 1 }}>
          <T v="eyebrow">Now tracking</T>
          <T v="h3" numberOfLines={1}>
            {w.query}
          </T>
        </View>
        {w.maxPrice ? <Chip label={`≤ ${money(w.maxPrice.amount, w.maxPrice.currency)}`} tone="info" /> : null}
      </Row>
    </Card>
  );
}

const ADDED: Record<string, string> = { setup: "Noted", plan: "Planned", purchase: "Bought", search: "Saved" };

/** The agent started a project or saved something to one. Tap to open the project. */
export function ProjectNoteCard({ card }: { card: Extract<CardT, { type: "project" }> }) {
  const meta = iconOf(card.project.icon);
  const a = card.added;
  return (
    <Tap onPress={() => router.push({ pathname: "/project/[id]", params: { id: card.project.id } })} accessibilityLabel={`Open ${card.project.name}`}>
      <Card>
        <Row gap={12}>
          <IconTile icon={meta.icon} grad={meta.grad} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="eyebrow" numberOfLines={1}>
              {card.created || !a ? "New project" : `${card.project.name} · ${ADDED[a.kind] ?? "Saved"}`}
            </T>
            <T v="h3" numberOfLines={2}>
              {card.created || !a ? card.project.name : a.text}
            </T>
          </View>
          {a?.price ? <Chip label={money(a.price.amount, a.price.currency)} tone="ok" /> : <ChevronRight size={18} color={color.faint} />}
        </Row>
      </Card>
    </Tap>
  );
}

// ---------------------------------------------------------------- action (the app, run by voice)
const AREA: Record<ActionArea, { icon: LucideIcon; grad: GradientName }> = {
  person: { icon: Users, grad: "primary" },
  occasion: { icon: CalendarDays, grad: "navy" },
  watch: { icon: Eye, grad: "info" },
  project: { icon: FolderOpen, grad: "warning" },
  profile: { icon: UserRound, grad: "navy" },
  find: { icon: BellOff, grad: "info" },
};

/** Xerxes changed something in the app for you (added a birthday, paused tracking...): what changed, at a glance. */
export function ActionCard({ card }: { card: Extract<CardT, { type: "action" }> }) {
  const a = AREA[card.area] ?? AREA.profile;
  const removed = /^(Removed|Dismissed)/.test(card.verb);
  return (
    <Card>
      <Row gap={12}>
        <IconTile icon={a.icon} grad={removed ? "danger" : a.grad} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T v="eyebrow" numberOfLines={1}>
            {card.verb}
          </T>
          <T v="h3" numberOfLines={2}>
            {card.title}
          </T>
          {card.detail ? (
            <T v="caption" numberOfLines={2}>
              {card.detail}
            </T>
          ) : null}
        </View>
        <GradientSurface name={removed ? "danger" : "primary"} style={{ width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" }} grain={0.3}>
          {removed ? <X size={12} color="#fff" strokeWidth={3.5} /> : <Check size={12} color="#fff" strokeWidth={3.5} />}
        </GradientSurface>
      </Row>
    </Card>
  );
}

/** onAction: what a tap sends as the next message. None in a call, where you say it instead. */
export function AgentCard({ card, onAction }: { card: CardT; onAction?: (t: string) => void }) {
  const act = onAction ?? (() => undefined);
  switch (card.type) {
    case "action":
      return <ActionCard card={card} />;
    case "project":
      return <ProjectNoteCard card={card} />;
    case "products":
      return <ProductsCard card={card} />;
    case "recommendation":
      return <RecommendationCard card={card} onAction={act} />;
    case "question":
      return <QuestionCard card={card} onAnswer={act} />;
    case "ideas":
      return <IdeasCard card={card} onAction={onAction} />;
    case "watch":
      return <WatchCard card={card} />;
    case "stores":
      return <StoresCard card={card} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- live steps
/** Xerxes' "working on it" mark: a dashed rounded square turning. */
export function Spinner({ size = 18 }: { size?: number }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }));
    a.start();
    return () => a.stop();
  }, [spin]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: color.faint,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
      }}
    />
  );
}

export function StepsCard({ steps, running }: { steps: Extract<RunEvent, { type: "step" }>[]; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps.length && !running) return null;
  const MAX = 5;
  const hidden = expanded ? 0 : Math.max(0, steps.length - MAX);
  const shown = steps.slice(hidden);
  return (
    <Card pad={14}>
      <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <T v="eyebrow">{running ? "Xerxes is working" : `What I did · ${steps.length} steps`}</T>
        {hidden > 0 || expanded ? (
          <Pressable onPress={() => setExpanded((x) => !x)} hitSlop={8}>
            <T v="caption" style={{ fontFamily: font.strong }}>
              {expanded ? "Less" : `+${hidden} earlier`}
            </T>
          </Pressable>
        ) : null}
      </Row>
      {shown.map((s) => (
        <Row key={s.stepId} gap={10} style={{ paddingVertical: 5 }}>
          {s.state === "running" ? (
            <Spinner />
          ) : s.state === "error" ? (
            <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: color.badBg, alignItems: "center", justifyContent: "center" }}>
              <X size={11} color={color.bad} strokeWidth={3.5} />
            </View>
          ) : (
            <GradientSurface name="primary" style={{ width: 18, height: 18, borderRadius: 6, alignItems: "center", justifyContent: "center" }} grain={0.3}>
              <Check size={11} color="#fff" strokeWidth={3.5} />
            </GradientSurface>
          )}
          <T v="body" style={{ flex: 1, fontSize: 13.5, color: s.state === "running" ? color.ink : color.ink2 }} numberOfLines={2}>
            {s.label}
          </T>
        </Row>
      ))}
      {running && !steps.some((s) => s.state === "running") ? (
        <Row gap={10} style={{ paddingVertical: 5 }}>
          <Spinner />
          <T v="body" style={{ fontSize: 13.5, color: color.ink }}>
            Thinking…
          </T>
        </Row>
      ) : null}
    </Card>
  );
}
