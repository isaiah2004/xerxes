import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { BookOpen, Cpu, Gamepad2, Gift, Plus, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { SpeakButton } from "@/components/Speak";
import { Button, Card, Chip, IconTile, Row, SectionHeader, T, Tap } from "@/components/ui";
import { api, type Feed } from "@/lib/api";
import { money } from "@/lib/format";
import { color, type GradientName } from "@/lib/theme";

// Radar = the things Xerxes is quietly hunting for you (game sales, homelab gear, books, price drops).
const kinds: Record<string, { icon: LucideIcon; grad: GradientName; label: string }> = {
  game: { icon: Gamepad2, grad: "navy", label: "Game sale" },
  hardware: { icon: Cpu, grad: "primary", label: "Homelab gear" },
  book: { icon: BookOpen, grad: "info", label: "Book" },
  product: { icon: Gift, grad: "navy", label: "Price drop" },
};

const ago = (iso?: string) => {
  if (!iso) return "first check soon";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "checked just now" : m < 60 ? `checked ${m} min ago` : `checked ${Math.round(m / 60)} h ago`;
};

export default function Radar() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const load = useCallback(() => api.feed().then(setFeed).catch(() => undefined), []);
  useEffect(() => {
    let alive = true;
    api
      .feed()
      .then((f) => alive && setFeed(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const finds = feed?.notifications.filter((n) => n.kind !== "occasion") ?? [];
  const active = feed?.watches.filter((w) => w.active) ?? [];

  return (
    <Screen onRefresh={load}>
      <View style={{ paddingHorizontal: 4 }}>
        <T v="sub">Always on</T>
        <T v="display">Radar</T>
        <T v="body" style={{ marginTop: 6, color: color.muted }}>
          What I’m hunting for you around the clock. I only ping you when a price is genuinely worth it.
        </T>
      </View>

      <SectionHeader title={`Tracking ${active.length || ""}`.trim()} />
      <View style={{ gap: 10 }}>
        {active.map((w) => {
          const k = kinds[w.kind] ?? kinds.product;
          // icon says what kind it is; the second line gets the full width for target + status
          return (
            <Card key={w.id}>
              <Row gap={12}>
                <IconTile icon={k.icon} grad={k.grad} size={46} />
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <T v="h3" numberOfLines={2}>
                    {w.query.replace(/\s+OR\s+/gi, " · ")}
                  </T>
                  <Row gap={8}>
                    {w.maxPrice ? <Chip label={`Under ${money(w.maxPrice.amount, w.maxPrice.currency)}`} tone="info" /> : null}
                    <T v="sub" numberOfLines={1} style={{ flexShrink: 1, color: w.lastError ? color.warn : color.muted }}>
                      {w.lastError ?? ago(w.lastCheckedAt)}
                    </T>
                  </Row>
                </View>
              </Row>
            </Card>
          );
        })}
        {feed && !active.length ? (
          <Card>
            <T v="sub">Nothing on the radar yet. Tell me what you want and the price you’d happily pay.</T>
          </Card>
        ) : null}
      </View>
      <Button
        kind="ghost"
        icon={Plus}
        label="Track something new"
        style={{ marginTop: 12 }}
        onPress={() => router.push({ pathname: "/chat/[id]", params: { id: "new", title: "Track something", prompt: "Keep an eye on " } })}
      />

      <SectionHeader title="Fresh finds" />
      <View style={{ gap: 10 }}>
        {finds.map((n) => {
          const k = kinds[n.kind] ?? kinds.product;
          return (
            <Tap key={n.id} onPress={() => n.url && WebBrowser.openBrowserAsync(n.url)} accessibilityLabel={n.title}>
              <Card>
                <Row gap={12}>
                  <IconTile icon={k.icon} grad={k.grad} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <T v="bodyStrong" numberOfLines={2}>
                      {n.title}
                    </T>
                    <T v="sub" numberOfLines={2}>
                      {n.body}
                    </T>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {n.price ? <T v="num">{n.price}</T> : null}
                    <SpeakButton text={`${n.title}. ${n.body}`} />
                  </View>
                </Row>
              </Card>
            </Tap>
          );
        })}
        {feed && !finds.length ? (
          <Card>
            <T v="sub">All quiet. The moment something drops below your target, it lands here and I’ll ping you.</T>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
