import { router, useFocusEffect } from "expo-router";
import { BookOpen, Cake, Cpu, Gamepad2, Gift, Library, Mic, PartyPopper, Truck, Wallet, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { OccasionCard } from "@/components/dates";
import { FindArt } from "@/components/FindArt";
import { Screen } from "@/components/Screen";
import { SpeakButton } from "@/components/Speak";
import { findVoice, TalkButton } from "@/components/TalkButton";
import { Button, Card, GradientSurface, IconTile, Ring, Row, SectionHeader, T, Tap } from "@/components/ui";
import { api, type Feed, type Notification, type Upcoming } from "@/lib/api";
import { dayDate, greeting, money, pronounsFor, shortDate } from "@/lib/format";
import { openLink } from "@/lib/links";
import { color, radius, type GradientName } from "@/lib/theme";

function startChat(params: { prompt?: string; occasionId?: string; title?: string }) {
  router.push({ pathname: "/chat/[id]", params: { id: "new", ...params } });
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- hero nudge
function Stat({ icon: Icon, label, value, narrow }: { icon: LucideIcon; label: string; value: string; narrow?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 10, backgroundColor: "rgba(255,255,255,0.06)" }}>
      <Row gap={5}>
        <Icon size={13} color="rgba(255,255,255,0.7)" />
        <T v="caption" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </T>
      </Row>
      <T v="h3" style={{ color: "#fff", marginTop: 3, fontSize: narrow ? 14 : 15 }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function NudgeHero({ o }: { o: Upcoming }) {
  const person = o.people.length === 1 ? o.people[0] : undefined;
  const who = person?.name ?? "the family";
  // two editorial lines: "Cousin sister / turns 14"
  const headline = o.turningAge ? `${capital(who.replace(/^your /i, ""))}\nturns ${o.turningAge}` : o.label;
  const p = pronounsFor(person?.relation);
  const hint = person?.interests?.length
    ? `${p.is} into ${person.interests.slice(0, 2).join(" and ")}. Want me to find something ${p.will} actually geek out over?`
    : `Want me to plan gifts for everyone within ${money(o.budget.amount, o.budget.currency)}?`;
  // countdown ring: orange when it's getting close, red when it's urgent
  const tone = o.daysLeft <= 3 ? "danger" : o.daysLeft <= 7 ? "warning" : "primary";
  const narrow = useWindowDimensions().width < 370; // small phones: drop the weekday, shrink a touch
  return (
    <GradientSurface name="navy" glow={0.2} style={{ borderRadius: radius.xxl, padding: 20, marginTop: 16 }}>
      <Row gap={14} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <T v="eyebrow" style={{ color: color.info }}>
            Xerxes noticed · {o.kind === "birthday" ? "Birthday" : o.label}
          </T>
          <T v="h1" style={{ color: "#fff", fontSize: 26, lineHeight: 29, marginTop: 10 }}>
            {headline}
          </T>
        </View>
        <Ring value={1 - Math.min(o.daysLeft, 30) / 30} size={64} stroke={6} tone={tone} track="rgba(255,255,255,0.12)">
          <T v="num" style={{ color: "#fff", fontSize: 18, lineHeight: 20 }}>
            {o.daysLeft}
          </T>
          <T v="caption" style={{ color: "rgba(255,255,255,0.65)", fontSize: 9.5, lineHeight: 11 }}>
            {o.daysLeft === 1 ? "DAY" : "DAYS"}
          </T>
        </Ring>
      </Row>
      <T v="body" style={{ color: "rgba(255,255,255,0.8)", marginTop: 8 }}>
        {hint}
      </T>
      <View style={{ flexDirection: "row", gap: 1, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.10)", marginTop: 16 }}>
        <Stat
          icon={o.kind === "birthday" ? Cake : PartyPopper}
          label={o.kind === "birthday" ? "Birthday" : "Date"}
          value={narrow ? shortDate(o.nextDate) : dayDate(o.nextDate)}
          narrow={narrow}
        />
        <Stat icon={Truck} label="Arrive by" value={shortDate(o.arriveBy)} narrow={narrow} />
        <Stat icon={Wallet} label="Budget" value={money(o.budget.amount, o.budget.currency)} narrow={narrow} />
      </View>
      <Row gap={10} style={{ marginTop: 16 }}>
        <Button kind="grad" grad="primary" icon={Gift} label="Find a gift" style={{ flex: 1 }} onPress={() => startChat({ occasionId: o.id, title: `Gift for ${who.toLowerCase()}` })} />
        <Button kind="glass" icon={Mic} onPress={() => router.push({ pathname: "/voice", params: { occasionId: o.id } })} />
      </Row>
    </GradientSurface>
  );
}

// ---------------------------------------------------------------- fresh finds
const dealStyle: Record<string, { icon: LucideIcon; grad: GradientName }> = {
  game: { icon: Gamepad2, grad: "navy" },
  hardware: { icon: Cpu, grad: "primary" },
  book: { icon: BookOpen, grad: "info" },
  product: { icon: Gift, grad: "navy" },
};

function DealRow({ n }: { n: Notification }) {
  const s = dealStyle[n.kind] ?? dealStyle.product;
  return (
    <Tap onPress={() => openLink(n.url)} accessibilityLabel={n.title}>
      <Card>
        <Row gap={12}>
          <FindArt uri={n.imageUrl} icon={s.icon} grad={s.grad} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="bodyStrong" numberOfLines={1}>
              {n.title}
            </T>
            <T v="sub" numberOfLines={2} style={{ marginTop: 2 }}>
              {n.body}
            </T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            {n.price ? <T v="num">{n.price}</T> : null}
            <Row gap={6}>
              <SpeakButton text={`${n.title}. ${n.body}`} />
              <TalkButton voice={findVoice(n)} label={`Talk to Xerxes about ${n.title}`} />
            </Row>
          </View>
        </Row>
      </Card>
    </Tap>
  );
}

// ---------------------------------------------------------------- quick asks
// prompt: prefilled when you tap the card (chat); hello: what Xerxes opens with when you tap its mic (voice).
const ASKS: { icon: LucideIcon; grad: GradientName; title: string; sub: string; prompt: string; hello: string }[] = [
  { icon: BookOpen, grad: "navy", title: "Hunt a book", sub: "New or second-hand", prompt: "I'm looking for a specific book. Find where to get it cheapest and fastest — second-hand is fine.", hello: "Which book are we hunting for?" },
  { icon: Cpu, grad: "primary", title: "Homelab deals", sub: "Used enterprise gear", prompt: "Look for great second-hand homelab deals that fit my setup right now.", hello: "Want me to scout second-hand homelab gear? Tell me what you're after." },
  { icon: Library, grad: "info", title: "Big purchase", sub: "Compare, DIY or plan", prompt: "I want a really tall bookshelf that fits about 1000 books. Explore my options.", hello: "What's the big purchase? I'll weigh up the options with you." },
  { icon: Gamepad2, grad: "navy", title: "Game sales", sub: "Across PC stores", prompt: "Which games I'd like are on sale right now across PC stores?", hello: "Which games should I check for sales?" },
];

function QuickAsk({ a }: { a: (typeof ASKS)[number] }) {
  return (
    <Tap onPress={() => startChat({ prompt: a.prompt, title: a.title })} style={{ width: "48.5%" }} accessibilityLabel={a.title}>
      <Card pad={16} style={{ gap: 14, flexGrow: 1 }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <IconTile icon={a.icon} grad={a.grad} size={44} />
          <TalkButton
            voice={{ topic: a.title, hello: a.hello, context: `That shortcut (${a.sub.toLowerCase()}) usually means: "${a.prompt}"` }}
            label={`Talk to Xerxes: ${a.title}`}
          />
        </Row>
        <View style={{ gap: 2 }}>
          <T v="h3" style={{ fontSize: 17, lineHeight: 21 }}>
            {a.title}
          </T>
          <T v="sub" style={{ fontSize: 13.5, lineHeight: 18 }}>
            {a.sub}
          </T>
        </View>
      </Card>
    </Tap>
  );
}

// ---------------------------------------------------------------- screen
export default function Today() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = () =>
    api
      .feed()
      .then((f) => {
        setFeed(f);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));

  // fresh on every visit (a call or a chat may have changed things), then every 30s while it's on screen
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const tick = () =>
        api
          .feed()
          .then((f) => {
            if (!alive) return;
            setFeed(f);
            setError(null);
          })
          .catch((e: Error) => alive && setError(e.message));
      tick();
      const t = setInterval(tick, 30_000);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }, []),
  );

  const deals = feed?.notifications.filter((n) => n.kind !== "occasion").slice(0, 4) ?? [];
  const nudge = feed?.nudges[0];
  const later = feed?.upcoming.filter((o) => o.id !== nudge?.id).slice(0, 8) ?? [];

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await fetchFeed();
        setRefreshing(false);
      }}
    >
      <Row gap={12} style={{ alignItems: "flex-start" }}>
        {/* the 18px on top is where the date line was, so the greeting stays put; a long name shrinks, then truncates */}
        <View style={{ flex: 1, minWidth: 0, paddingLeft: 4, paddingTop: 18 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {greeting(feed?.profile.name ?? "there")}
          </T>
        </View>
        {/* centred on the greeting line (31 tall), flush with the cards' right edge */}
        <Tap onPress={() => router.push("/me")} accessibilityLabel="Your profile" style={{ marginTop: 18 + (31 - 50) / 2 }}>
          <GradientSurface name="primary" style={{ width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
            <T v="h3" style={{ color: "#fff", fontSize: 21, lineHeight: 25 }}>
              {(feed?.profile.name ?? "X").charAt(0)}
            </T>
          </GradientSurface>
        </Tap>
      </Row>

      {error ? (
        <Card style={{ marginTop: 16, borderColor: color.badBg }}>
          <T v="bodyStrong">Can’t reach Xerxes</T>
          <T v="sub" style={{ marginTop: 4 }}>
            {error}. Is the backend running?
          </T>
        </Card>
      ) : null}

      {nudge ? (
        <NudgeHero o={nudge} />
      ) : feed ? (
        <GradientSurface name="navy" glow={0.2} style={{ borderRadius: radius.xxl, padding: 20, marginTop: 16 }}>
          <T v="h1" style={{ color: "#fff" }}>What are we shopping for?</T>
          <Button kind="grad" grad="primary" icon={Mic} label="Talk to Xerxes" style={{ marginTop: 14 }} onPress={() => router.push("/voice")} />
        </GradientSurface>
      ) : null}

      {later.length ? (
        <>
          <SectionHeader title="Coming up" action="Calendar" onAction={() => router.push("/calendar")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -18 }}
            contentContainerStyle={{ paddingHorizontal: 18, gap: 10, alignItems: "stretch" }}
          >
            {later.map((o) => (
              <OccasionCard key={o.id} o={o} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {deals.length ? (
        <>
          <SectionHeader title="Fresh finds" action="See all" onAction={() => router.push({ pathname: "/tracking", params: { view: "items" } })} />
          <View style={{ gap: 10 }}>
            {deals.map((n) => (
              <DealRow key={n.id} n={n} />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="Ask Xerxes" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 }}>
        {ASKS.map((a) => (
          <QuickAsk key={a.title} a={a} />
        ))}
      </View>
    </Screen>
  );
}
