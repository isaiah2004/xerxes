import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { daysLabel, OccasionRow, urgencyOf } from "@/components/dates";
import { Screen } from "@/components/Screen";
import { Card, GradientSurface, Row, SectionHeader, T } from "@/components/ui";
import { api, type Feed, type Upcoming } from "@/lib/api";
import { dayDate, isoOf, money, monthTitle, todayIso } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, font, radius } from "@/lib/theme";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const dotColor = (o: Upcoming) => (o.kind === "festival" ? color.info : color.primary);
const rank = { bad: 0, warn: 1, neutral: 2 } as const;

type Ym = { y: number; m: number };
const ymOf = (iso: string): Ym => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 });
const shift = ({ y, m }: Ym, by: number): Ym => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 });
const key = ({ y, m }: Ym) => y * 12 + m;

function Summary({ occ }: { occ: Upcoming[] }) {
  const soon = occ.filter((o) => o.daysLeft <= 60);
  const budget = soon.reduce((s, o) => s + o.budget.amount, 0);
  const needs = occ.filter((o) => o.inReminderWindow);
  const next = needs[0] ?? occ[0];
  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, padding: 10, backgroundColor: "rgba(255,255,255,0.06)" }}>
      <T v="caption" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5 }}>
        {label}
      </T>
      <T v="h2" style={{ color: "#fff", marginTop: 2 }}>
        {value}
      </T>
    </View>
  );
  return (
    <GradientSurface name="navy" glow={0.16} style={{ borderRadius: radius.xxl, padding: 18, marginTop: 16 }}>
      <T v="eyebrow" style={{ color: color.info }}>
        Next 60 days
      </T>
      <View style={{ flexDirection: "row", gap: 1, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.10)", marginTop: 12 }}>
        {stat("Occasions", String(soon.length))}
        {stat("Budgeted", money(budget, soon[0]?.budget.currency ?? "INR"))}
        {stat("Shop now", String(needs.length))}
      </View>
      {next ? (
        <T v="body" style={{ color: "rgba(255,255,255,0.8)", marginTop: 12 }}>
          Next deadline: {next.label.replace(/'s birthday$/, "’s gift")} should arrive by{" "}
          <Text style={{ color: "#fff", fontFamily: font.strong }}>{dayDate(next.arriveBy)}</Text>.
        </T>
      ) : null}
    </GradientSurface>
  );
}

function MonthGrid({ view, byDay, selected, onSelect, onShift, canBack }: {
  view: Ym;
  byDay: Map<string, Upcoming[]>;
  selected: string | null;
  onSelect: (iso: string) => void;
  onShift: (by: number) => void;
  canBack: boolean;
}) {
  const today = todayIso();
  const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const arrow = (dir: -1 | 1, enabled: boolean) => (
    <Pressable
      disabled={!enabled}
      onPress={() => {
        haptic.tap();
        onShift(dir);
      }}
      hitSlop={8}
      accessibilityLabel={dir < 0 ? "Previous month" : "Next month"}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: color.chip, alignItems: "center", justifyContent: "center", opacity: enabled ? 1 : 0.35 }}>
        {dir < 0 ? <ChevronLeft size={18} color={color.ink} /> : <ChevronRight size={18} color={color.ink} />}
      </View>
    </Pressable>
  );

  return (
    <Card pad={14} style={{ marginTop: 12 }}>
      <Row style={{ justifyContent: "space-between", marginBottom: 10 }}>
        {arrow(-1, canBack)}
        <T v="h2">{monthTitle(view.y, view.m)}</T>
        {arrow(1, true)}
      </Row>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((d, i) => (
          <T key={i} v="caption" style={{ width: `${100 / 7}%`, textAlign: "center", color: color.faint }}>
            {d}
          </T>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 48 }} />;
          const iso = isoOf(view.y, view.m, d);
          const events = byDay.get(iso) ?? [];
          const isToday = iso === today;
          const isSel = iso === selected;
          const past = iso < today;
          // same urgency language as the cards: orange = time to shop, red = 3 days or less
          const urgency = events.length ? events.map(urgencyOf).sort((a, b) => rank[a] - rank[b])[0] : null;
          const fill = urgency === "bad" ? color.badBg : urgency === "warn" ? color.warnBg : events.length ? color.chip : "transparent";
          const ink = urgency === "bad" ? color.bad : urgency === "warn" ? color.warn : color.ink;
          return (
            <Pressable
              key={i}
              disabled={!events.length}
              onPress={() => onSelect(iso)}
              style={{ width: `${100 / 7}%`, height: 48, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel={events.length ? `${iso}: ${events.map((e) => e.label).join(", ")}` : undefined}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isToday ? color.navy : fill,
                  borderWidth: isSel ? 1.5 : 0,
                  borderColor: color.primary,
                }}
              >
                <Text
                  style={{
                    fontFamily: events.length || isToday ? font.bold : font.medium,
                    fontSize: 14,
                    color: isToday ? "#fff" : past ? color.faint : ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {d}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 3, height: 5, marginTop: 3 }}>
                {events.slice(0, 3).map((e) => (
                  <View key={e.id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dotColor(e) }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Row gap={16} style={{ marginTop: 8, justifyContent: "center" }}>
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.primary }} />
          <T v="caption">Birthdays & anniversaries</T>
        </Row>
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.info }} />
          <T v="caption">Festivals</T>
        </Row>
      </Row>
    </Card>
  );
}

export default function CalendarScreen() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [view, setView] = useState<Ym | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  const occ = useMemo(() => feed?.upcoming ?? [], [feed]);
  const byDay = useMemo(() => {
    const m = new Map<string, Upcoming[]>();
    for (const o of occ) m.set(o.nextDate, [...(m.get(o.nextDate) ?? []), o]);
    return m;
  }, [occ]);

  const now = ymOf(todayIso());
  // open on the month of the next occasion so the first view is never empty
  const shown = view ?? (occ[0] ? ymOf(occ[0].nextDate) : now);
  const prefix = `${shown.y}-${String(shown.m + 1).padStart(2, "0")}`;
  const inMonth = occ.filter((o) => o.nextDate.startsWith(prefix));
  const list = selected ? inMonth.filter((o) => o.nextDate === selected) : inMonth;
  const monthName = monthTitle(shown.y, shown.m).split(" ")[0];

  return (
    <Screen>
      <View style={{ paddingHorizontal: 4 }}>
        <T v="sub">Plan ahead</T>
        <T v="display">Calendar</T>
        <T v="body" style={{ marginTop: 6, color: color.muted }}>
          Every birthday and festival you shop for, with budgets and arrive-by dates.
        </T>
      </View>

      {feed ? <Summary occ={occ} /> : null}

      <MonthGrid
        view={shown}
        byDay={byDay}
        selected={selected}
        canBack={key(shown) > key(now)}
        onShift={(by) => {
          setSelected(null);
          setView(shift(shown, by));
        }}
        onSelect={(iso) => {
          haptic.tap();
          setSelected((s) => (s === iso ? null : iso));
        }}
      />

      <SectionHeader
        title={selected ? dayDate(selected) : `${monthName} · ${inMonth.length ? `${inMonth.length} ${inMonth.length === 1 ? "occasion" : "occasions"}` : "all clear"}`}
        action={selected ? "Whole month" : undefined}
        onAction={() => setSelected(null)}
      />
      <View style={{ gap: 10 }}>
        {list.map((o) => (
          <OccasionRow key={o.id} o={o} highlight={o.nextDate === selected} />
        ))}
        {feed && !list.length ? (
          <Card>
            <T v="sub">Nothing to shop for in {monthName}. Enjoy the quiet — I’ll nudge you before the next one.</T>
          </Card>
        ) : null}
        {list.length && !selected && inMonth.length ? (
          <T v="caption" style={{ textAlign: "center", marginTop: 4 }}>
            {inMonth.length} in {monthName} · {money(inMonth.reduce((s, o) => s + o.budget.amount, 0), inMonth[0].budget.currency)} budgeted · next in{" "}
            {daysLabel(inMonth[0].daysLeft).toLowerCase()}
          </T>
        ) : null}
      </View>
    </Screen>
  );
}
