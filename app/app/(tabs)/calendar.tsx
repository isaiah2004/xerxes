import { Gift, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MonthArrow, monthCells, shiftYm, WeekdayHeader, WeekRows, ymKey, ymOf, type Ym } from "@/components/DatePicker";
import { daysLabel, OccasionRow, openOccasion, urgencyOf } from "@/components/dates";
import { OccasionForm, type Occ } from "@/components/OccasionForm";
import { Screen } from "@/components/Screen";
import { ConfirmPanel, Sheet, SheetAction, SheetActions, SheetBody } from "@/components/Sheet";
import { Button, Card, GradientSurface, Row, SectionHeader, T } from "@/components/ui";
import { api, manage, type Feed, type SavedOccasion, type Upcoming } from "@/lib/api";
import { dayDate, isoOf, money, monthTitle, shortDate, todayIso } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, font, radius } from "@/lib/theme";

// Xerxes keeps its own calendar (not synced with Google/phone calendars): birthdays, anniversaries and festivals
// you shop for, each with a budget and a reminder far enough ahead for the gift to arrive.

const dotColor = (o: Upcoming) => (o.kind === "festival" || o.kind === "other" ? color.info : color.primary);
const rank = { bad: 0, warn: 1, neutral: 2 } as const;

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
  return (
    <Card pad={14} style={{ marginTop: 12 }}>
      <Row style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <MonthArrow dir={-1} enabled={canBack} onPress={() => onShift(-1)} />
        <T v="h2">{monthTitle(view.y, view.m)}</T>
        <MonthArrow dir={1} enabled onPress={() => onShift(1)} />
      </Row>
      <WeekdayHeader />
      <WeekRows
        cells={monthCells(view)}
        style={{ marginTop: 4 }}
        render={(d, i) => {
          if (!d) return <View key={i} style={{ flex: 1, height: 48 }} />;
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
              // empty days from today on can be picked too: that's where "Add something on …" comes from
              disabled={past && !events.length}
              onPress={() => onSelect(iso)}
              style={{ flex: 1, height: 48, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel={events.length ? `${iso}: ${events.map((e) => e.label).join(", ")}` : iso}
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
        }}
      />
      <Row gap={16} style={{ marginTop: 8, justifyContent: "center" }}>
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.primary }} />
          <T v="caption">Birthdays & anniversaries</T>
        </Row>
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.info }} />
          <T v="caption">Festivals & more</T>
        </Row>
      </Row>
    </Card>
  );
}

type Mode = "menu" | "edit" | "delete";

export default function CalendarScreen() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [view, setView] = useState<Ym | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  // one sheet: menu (find a gift / edit / delete) → form or confirm; "edit" without an occasion = add
  const [sheet, setSheet] = useState<{ n: number; mode: Mode; o: Occ | null; date?: string }>({ n: 0, mode: "edit", o: null });
  const [open, setOpen] = useState(false);
  const openSheet = (mode: Mode, o: Occ | null, date?: string) => {
    setSheet((s) => ({ n: s.n + 1, mode, o, date }));
    setOpen(true);
  };
  const setMode = (mode: Mode) => setSheet((s) => ({ ...s, mode }));
  const saved = (s: SavedOccasion) => {
    setOpen(false);
    load();
    // land on the day it was saved for, so the change is right there
    if (s.nextDate) {
      setView(ymOf(s.nextDate));
      setSelected(s.nextDate);
    }
  };
  const removed = () => {
    setOpen(false);
    setSelected(null);
    load();
  };

  const occ = useMemo(() => feed?.upcoming ?? [], [feed]);
  const byDay = useMemo(() => {
    const m = new Map<string, Upcoming[]>();
    for (const o of occ) m.set(o.nextDate, [...(m.get(o.nextDate) ?? []), o]);
    return m;
  }, [occ]);

  const today = todayIso();
  const now = ymOf(today);
  // open on the month of the next occasion so the first view is never empty
  const shown = view ?? (occ[0] ? ymOf(occ[0].nextDate) : now);
  const prefix = `${shown.y}-${String(shown.m + 1).padStart(2, "0")}`;
  const inMonth = occ.filter((o) => o.nextDate.startsWith(prefix));
  const list = selected ? inMonth.filter((o) => o.nextDate === selected) : inMonth;
  const monthName = monthTitle(shown.y, shown.m).split(" ")[0];
  const addDate = selected && selected >= today ? selected : undefined;

  const o = sheet.o;
  const head =
    sheet.mode === "edit"
      ? o
        ? { title: `Edit ${o.label}` }
        : { title: "Add to calendar", subtitle: "A birthday, anniversary or festival you shop for. I’ll remind you in time to get a gift there." }
      : !o
        ? { title: "" }
        : sheet.mode === "menu"
          ? { title: o.label, subtitle: `${dayDate(o.nextDate)} · ${o.daysLeft <= 1 ? daysLabel(o.daysLeft).toLowerCase() : `in ${o.daysLeft} days`} · ${money(o.budget.amount, o.budget.currency)} budget` }
          : { title: `Delete ${o.label}?` };

  return (
    <>
      <Screen onRefresh={load}>
        <View style={{ paddingHorizontal: 4 }}>
          <Row gap={12} style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="sub">Plan ahead</T>
              <T v="display">Calendar</T>
            </View>
            <Button kind="grad" compact icon={Plus} label="Add" style={{ marginTop: 4 }} onPress={() => openSheet("edit", null, addDate)} />
          </Row>
          <T v="body" style={{ marginTop: 6, color: color.muted }}>
            Every birthday and festival you shop for, with budgets and arrive-by dates.
          </T>
        </View>

        {feed ? <Summary occ={occ} /> : null}

        <MonthGrid
          view={shown}
          byDay={byDay}
          selected={selected}
          canBack={ymKey(shown) > ymKey(now)}
          onShift={(by) => {
            setSelected(null);
            setView(shiftYm(shown, by));
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
          {list.map((x) => (
            <OccasionRow key={x.id} o={x} highlight={x.nextDate === selected} onMore={() => openSheet("menu", x)} />
          ))}
          {feed && !list.length ? (
            <Card>
              {selected ? (
                <View style={{ gap: 12 }}>
                  <T v="sub">Nothing on {dayDate(selected)} yet.</T>
                  {addDate ? <Button kind="ghost" compact icon={Plus} label={`Add something on ${shortDate(addDate)}`} onPress={() => openSheet("edit", null, addDate)} /> : null}
                </View>
              ) : (
                <T v="sub">Nothing to shop for in {monthName}. Enjoy the quiet — I’ll nudge you before the next one.</T>
              )}
            </Card>
          ) : null}
          {list.length && !selected && inMonth.length ? (
            <T v="caption" style={{ textAlign: "center", marginTop: 4 }}>
              {inMonth.length} in {monthName} · {money(inMonth.reduce((s, x) => s + x.budget.amount, 0), inMonth[0].budget.currency)} budgeted · next in{" "}
              {daysLabel(inMonth[0].daysLeft).toLowerCase()}
            </T>
          ) : null}
        </View>
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} title={head.title} subtitle={head.subtitle}>
        {sheet.mode === "edit" ? (
          <OccasionForm key={sheet.n} o={o} date={sheet.date} onSaved={saved} />
        ) : !o ? null : sheet.mode === "menu" ? (
          <SheetBody>
            <SheetActions>
              <SheetAction
                icon={Gift}
                label="Find a gift"
                sub="In budget, and arriving in time"
                onPress={() => {
                  setOpen(false);
                  openOccasion(o);
                }}
              />
              <SheetAction icon={Pencil} label="Edit" sub="Date, people, budget, reminder" onPress={() => setMode("edit")} />
              <SheetAction icon={Trash2} label="Delete" sub="Remove it from your calendar" danger onPress={() => setMode("delete")} />
            </SheetActions>
          </SheetBody>
        ) : (
          <ConfirmPanel
            key={sheet.n}
            message={`${o.label} comes off your calendar and I stop reminding you about it.`}
            onConfirm={() => manage.deleteOccasion(o.id).then(removed)}
            onCancel={() => setMode("menu")}
          />
        )}
      </Sheet>
    </>
  );
}
