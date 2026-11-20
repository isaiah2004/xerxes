import { Cake, CalendarDays, Check, Gift, Heart, Pencil, Plus, Sparkles, Trash2, UserPlus, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { DatePicker, MonthArrow, monthCells, shiftYm, WeekdayHeader, WeekRows, ymKey, ymOf, type Ym } from "@/components/DatePicker";
import { daysLabel, OccasionRow, openOccasion, urgencyOf } from "@/components/dates";
import { ChoiceChip, Field, Input, Toggle } from "@/components/forms";
import { Screen } from "@/components/Screen";
import { ConfirmPanel, FormError, Sheet, SheetAction, SheetActions, SheetBody, SheetFooter } from "@/components/Sheet";
import { Button, Card, GradientSurface, Row, SectionHeader, T } from "@/components/ui";
import { api, manage, type Feed, type OccasionFields, type OccasionInput, type OccasionKind, type Person, type SavedOccasion, type Upcoming } from "@/lib/api";
import { addDaysIso, dayDate, isoOf, money, monthTitle, shortDate, todayIso } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, font, radius } from "@/lib/theme";

// Xerxes keeps its own calendar (not synced with Google/phone calendars): birthdays, anniversaries and festivals
// you shop for, each with a budget and a reminder far enough ahead for the gift to arrive.

const dotColor = (o: Upcoming) => (o.kind === "festival" || o.kind === "other" ? color.info : color.primary);
const rank = { bad: 0, warn: 1, neutral: 2 } as const;

/** Feed occasions also carry their stored fields (MM-DD vs one-off date, people, reminder). */
type Occ = Upcoming & Partial<OccasionFields>;

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

// ---------------------------------------------------------------- add / edit form
const KINDS: { id: OccasionKind; label: string; icon: LucideIcon }[] = [
  { id: "birthday", label: "Birthday", icon: Cake },
  { id: "anniversary", label: "Anniversary", icon: Heart },
  { id: "festival", label: "Festival", icon: Sparkles },
  { id: "other", label: "Other", icon: CalendarDays },
];
const BUDGETS = [1000, 2000, 5000, 10000];
const REMIND = [7, 14, 21, 30];
/** Birthdays and anniversaries come round every year and are about someone. */
const personal = (k: OccasionKind) => k === "birthday" || k === "anniversary";
/** The next time MM-DD comes round (today counts). */
const nextOf = (mmdd: string) => {
  const t = todayIso();
  const thisYear = `${t.slice(0, 4)}-${mmdd}`;
  return thisYear >= t ? thisYear : `${Number(t.slice(0, 4)) + 1}-${mmdd}`;
};
const longDay = (iso: string) => `${dayDate(iso)} ${iso.slice(0, 4)}`;

function OccasionForm({ o, date, onSaved }: { o: Occ | null; date?: string; onSaved: (s: SavedOccasion) => void }) {
  const today = todayIso();
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => {
    let alive = true;
    manage
      .people()
      .then((p) => alive && setPeople(p))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, []);

  const [kind, setKind] = useState<OccasionKind>(o?.kind ?? "birthday");
  const [personIds, setPersonIds] = useState<string[]>(o?.personIds ?? []);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRelation, setNewRelation] = useState("");
  const [typed, setTyped] = useState(o?.label ?? "");
  const [touched, setTouched] = useState(!!o); // once the title is typed, stop auto-naming it
  const [day, setDay] = useState<string | null>(o?.nextDate ?? date ?? null);
  const [yearly, setYearly] = useState(o?.date ? !/^\d{4}-/.test(o.date) : false);
  const [budget, setBudget] = useState(String(o?.budget.amount ?? 2000));
  const [remind, setRemind] = useState(o?.remindDaysBefore ?? 21);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPerson = personal(kind);
  const repeats = needsPerson || yearly;
  const names = isNew ? [newName.trim()].filter(Boolean) : (people ?? []).filter((p) => personIds.includes(p.id)).map((p) => p.name);
  const auto = !names.length ? "" : kind === "birthday" ? `${names[0]}'s birthday` : kind === "anniversary" ? `${names.join(" & ")}'s anniversary` : "";
  const label = touched ? typed : auto || typed;
  const currency = o?.budget.currency ?? "INR";
  const amount = Number(budget.replace(/[,\s₹]/g, "") || 0);
  const remindOptions = REMIND.includes(remind) ? REMIND : [...REMIND, remind].sort((a, b) => a - b);

  const changeKind = (k: OccasionKind) => {
    setKind(k);
    setError(null);
    if (k === "birthday") setPersonIds((ids) => ids.slice(0, 1));
    if (k === "anniversary") setPersonIds((ids) => ids.slice(0, 2));
    if (!personal(k)) setIsNew(false);
  };
  const togglePerson = (id: string) => {
    setIsNew(false);
    setError(null);
    setPersonIds((ids) =>
      kind === "birthday" ? [id] : ids.includes(id) ? ids.filter((x) => x !== id) : kind === "anniversary" ? [...ids, id].slice(-2) : [...ids, id],
    );
  };

  const submit = () => {
    const name = newName.trim();
    if (needsPerson && !(isNew ? name : personIds.length))
      return setError(kind === "birthday" ? "Whose birthday is it? Pick someone or add their name." : "Whose anniversary is it? Pick people or add their names.");
    if (!label.trim()) return setError("Give it a title, like “Housewarming”.");
    if (!day) return setError("Pick the date on the calendar.");
    if (!Number.isFinite(amount) || amount < 0) return setError("The budget should be a number, like 2000.");
    const body: OccasionInput = {
      kind,
      label: label.trim(),
      date: repeats ? day.slice(5) : day,
      personIds: needsPerson && isNew ? [] : personIds,
      ...(needsPerson && isNew ? { newPerson: { name, relation: newRelation.trim() } } : {}),
      budget: { amount, currency },
      remindDaysBefore: remind,
    };
    setBusy(true);
    setError(null);
    (o ? manage.updateOccasion(o.id, body) : manage.addOccasion(body))
      .then((s) => {
        haptic.success();
        onSaved(s);
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
        setBusy(false);
      });
  };

  return (
    <>
      <SheetBody gap={20}>
        <Field label="What is it">
          <View style={{ gap: 8 }}>
            {[KINDS.slice(0, 2), KINDS.slice(2)].map((pair, i) => (
              <Row key={i} gap={8}>
                {pair.map((k) => (
                  <ChoiceChip key={k.id} tile="wide" label={k.label} icon={k.icon} selected={kind === k.id} onPress={() => changeKind(k.id)} />
                ))}
              </Row>
            ))}
          </View>
        </Field>

        {needsPerson ? (
          <Field label={kind === "birthday" ? "Whose birthday" : "Whose anniversary"} hint={kind === "anniversary" && !isNew ? "Pick up to two people." : undefined}>
            {people === null ? (
              <T v="caption">Loading your people…</T>
            ) : (
              <Row gap={8} wrap>
                {people.map((p) => (
                  <ChoiceChip key={p.id} label={p.name} selected={!isNew && personIds.includes(p.id)} onPress={() => togglePerson(p.id)} />
                ))}
                <ChoiceChip
                  label="Someone new"
                  icon={UserPlus}
                  selected={isNew}
                  onPress={() => {
                    setIsNew(true);
                    setPersonIds([]);
                    setError(null);
                  }}
                />
              </Row>
            )}
            {isNew ? (
              <View style={{ gap: 10, marginTop: 4 }}>
                <Input value={newName} onChangeText={setNewName} placeholder={kind === "anniversary" ? "Names, e.g. Priya & Arjun" : "Their name"} autoFocus maxLength={60} accessibilityLabel="Name" />
                <Input value={newRelation} onChangeText={setNewRelation} placeholder="Relation, e.g. friend, aunt, colleague" maxLength={40} accessibilityLabel="Relation" />
              </View>
            ) : null}
          </Field>
        ) : (
          <Field label="Who it’s for">
            {people === null ? (
              <T v="caption">Loading your people…</T>
            ) : (
              <Row gap={8} wrap>
                <ChoiceChip label="Everyone" selected={!personIds.length} onPress={() => setPersonIds([])} />
                {people.map((p) => (
                  <ChoiceChip key={p.id} label={p.name} selected={personIds.includes(p.id)} onPress={() => togglePerson(p.id)} />
                ))}
              </Row>
            )}
          </Field>
        )}

        <Field label="Title">
          <Input
            value={label}
            onChangeText={(v) => {
              setTyped(v);
              setTouched(v.length > 0);
            }}
            placeholder={kind === "festival" ? "e.g. Onam" : kind === "other" ? "e.g. Housewarming" : "Pick someone above"}
            maxLength={80}
            accessibilityLabel="Title"
          />
        </Field>

        <Field label="Date">
          <DatePicker
            value={day}
            onChange={(d) => {
              setDay(d);
              setError(null);
            }}
            min={today}
            max={addDaysIso(today, 395)}
          />
          {needsPerson ? null : (
            <View style={{ marginTop: 6 }}>
              <Toggle value={yearly} onChange={setYearly} label="Every year" sub={yearly ? "Same date each year" : "Just this once"} />
            </View>
          )}
          {day ? (
            <T v="caption" style={{ color: color.ok, fontFamily: font.strong, marginTop: 2 }}>
              {repeats ? `Every year on ${shortDate(day)} · next: ${longDay(nextOf(day.slice(5)))}` : `Once, on ${longDay(day)}`}
            </T>
          ) : null}
        </Field>

        <Field label={`Gift budget (${currency === "INR" ? "₹" : currency})`}>
          <Input value={budget} onChangeText={setBudget} prefix={currency === "INR" ? "₹" : undefined} keyboardType="number-pad" placeholder="2,000" maxLength={9} accessibilityLabel="Budget" />
          <Row gap={8} wrap>
            {BUDGETS.map((b) => (
              <ChoiceChip key={b} label={money(b, currency)} selected={amount === b} onPress={() => setBudget(String(b))} />
            ))}
          </Row>
        </Field>

        <Field label="Remind me" hint={`I’ll nudge you ${remind} days before, so there’s time to order and get it delivered.`}>
          <Row gap={8} wrap>
            {remindOptions.map((d) => (
              <ChoiceChip key={d} label={`${d} days`} selected={remind === d} onPress={() => setRemind(d)} />
            ))}
          </Row>
        </Field>
      </SheetBody>
      <SheetFooter>
        {error ? <FormError text={error} /> : null}
        <Button kind="grad" icon={o ? Check : Plus} label={o ? "Save changes" : "Add to calendar"} loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}
