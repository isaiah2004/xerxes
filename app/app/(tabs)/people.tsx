import { router } from "expo-router";
import { Gift } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, Chip, GradientSurface, Row, T } from "@/components/ui";
import { api, type Feed } from "@/lib/api";
import { dayDate } from "@/lib/format";
import { onGradient, type GradientName } from "@/lib/theme";

const grads: GradientName[] = ["navy", "primary", "info"];

export default function People() {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    api.feed().then(setFeed).catch(() => undefined);
  }, []);
  const people = feed?.upcoming.flatMap((o) => o.people).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i) ?? [];

  return (
    <Screen>
      <View style={{ paddingHorizontal: 4 }}>
        <T v="sub">Family & friends</T>
        <T v="display">People</T>
        <T v="sub" style={{ marginTop: 6 }}>
          What Xerxes remembers about the people you shop for.
        </T>
      </View>
      <View style={{ gap: 12, marginTop: 18 }}>
        {people.map((p, i) => {
          const next = feed?.upcoming.find((o) => o.people.length === 1 && o.people[0].id === p.id);
          return (
            <Card key={p.id} pad={16}>
              <Row gap={12}>
                <GradientSurface name={grads[i % grads.length]} glow={grads[i % grads.length] === "navy" ? 0.35 : undefined} style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                  <T v="h2" style={{ color: onGradient[grads[i % grads.length]] }}>
                    {p.name.charAt(0)}
                  </T>
                </GradientSurface>
                <View style={{ flex: 1 }}>
                  <T v="h3">{p.name}</T>
                  <T v="caption">{p.relation}</T>
                </View>
                {next ? <Chip label={`${next.label.includes("irthday") ? "Birthday" : next.label} · ${next.daysLeft}d`} tone={next.daysLeft <= 21 ? "warn" : "neutral"} /> : null}
              </Row>
              {p.interests.length ? (
                <Row gap={6} wrap style={{ marginTop: 12 }}>
                  {p.interests.map((x) => (
                    <Chip key={x} label={x} tone="info" />
                  ))}
                </Row>
              ) : null}
              {p.notes.map((n) => (
                <T key={n} v="sub" style={{ marginTop: 10 }}>
                  “{n}”
                </T>
              ))}
              <Button
                kind="ghost"
                compact
                icon={Gift}
                label={next ? `Gift for ${dayDate(next.nextDate)}` : "Find a gift"}
                style={{ marginTop: 12 }}
                onPress={() =>
                  router.push({ pathname: "/chat/[id]", params: { id: "new", occasionId: next?.id, title: `Gift for ${p.name.toLowerCase()}` } })
                }
              />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
