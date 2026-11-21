import { Cake, CalendarDays, Check, Heart, Plus, Sparkles, UserPlus, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { manage, type OccasionFields, type OccasionInput, type OccasionKind, type Person, type SavedOccasion, type Upcoming } from "@/lib/api";
import { addDaysIso, dayDate, money, shortDate, todayIso } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, font } from "@/lib/theme";
import { DatePicker } from "./DatePicker";
import { ChoiceChip, Field, Input, Toggle } from "./forms";
import { AddPersonInline } from "./people";
import { FormError, SheetBody, SheetFooter } from "./Sheet";
import { Button, Row, T } from "./ui";

// Add or edit a calendar occasion (Calendar tab, and "Add their birthday" in People). People can be added right
// here: "Add someone" saves them and picks them, as many as you like for a group.

/** Feed occasions also carry their stored fields (MM-DD vs one-off date, people, reminder). */
export type Occ = Upcoming & Partial<OccasionFields>;

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

export function OccasionForm({
  o,
  date,
  preset,
  onSaved,
}: {
  o: Occ | null;
  /** a day picked on the calendar */
  date?: string;
  /** a new occasion that starts filled in, e.g. a birthday for someone in People */
  preset?: { kind?: OccasionKind; personIds?: string[] };
  onSaved: (s: SavedOccasion) => void;
}) {
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

  const [kind, setKind] = useState<OccasionKind>(o?.kind ?? preset?.kind ?? "birthday");
  const [personIds, setPersonIds] = useState<string[]>(o?.personIds ?? preset?.personIds ?? []);
  const [adding, setAdding] = useState(false);
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
  const names = (people ?? []).filter((p) => personIds.includes(p.id)).map((p) => p.name);
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
  };
  /** A birthday is one person, an anniversary two, anything else as many as you like. */
  const select = (ids: string[], id: string) => (kind === "birthday" ? [id] : kind === "anniversary" ? [...ids.filter((x) => x !== id), id].slice(-2) : ids.includes(id) ? ids : [...ids, id]);
  const togglePerson = (id: string) => {
    setError(null);
    setPersonIds((ids) => (ids.includes(id) && kind !== "birthday" ? ids.filter((x) => x !== id) : select(ids, id)));
  };
  // someone added (or found by name) in "Add someone": into the list, and picked
  const added = (p: Person) => {
    setError(null);
    setPeople((list) => (list?.some((x) => x.id === p.id) ? list : [...(list ?? []), p]));
    setPersonIds((ids) => select(ids, p.id));
    if (kind === "birthday") setAdding(false);
  };
  const addChip = <ChoiceChip label="Add someone" icon={UserPlus} selected={adding} onPress={() => setAdding((v) => !v)} />;

  const submit = () => {
    if (needsPerson && !personIds.length)
      return setError(kind === "birthday" ? "Whose birthday is it? Pick someone or add them." : "Whose anniversary is it? Pick people or add them.");
    if (!label.trim()) return setError("Give it a title, like “Housewarming”.");
    if (!day) return setError("Pick the date on the calendar.");
    if (!Number.isFinite(amount) || amount < 0) return setError("The budget should be a number, like 2000.");
    const body: OccasionInput = {
      kind,
      label: label.trim(),
      date: repeats ? day.slice(5) : day,
      personIds,
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

        <Field
          label={kind === "birthday" ? "Whose birthday" : kind === "anniversary" ? "Whose anniversary" : "Who it’s for"}
          hint={adding ? undefined : kind === "anniversary" ? "Pick up to two people." : kind === "birthday" ? undefined : "Everyone, or just the people it’s for."}
        >
          {people === null ? (
            <T v="caption">Loading your people…</T>
          ) : (
            <Row gap={8} wrap>
              {needsPerson ? null : <ChoiceChip label="Everyone" selected={!personIds.length} onPress={() => setPersonIds([])} />}
              {people.map((p) => (
                <ChoiceChip key={p.id} label={p.name} selected={personIds.includes(p.id)} onPress={() => togglePerson(p.id)} />
              ))}
              {addChip}
            </Row>
          )}
          {adding && people ? (
            <AddPersonInline
              people={people}
              onAdded={added}
              hint={kind === "birthday" ? undefined : "Add as many as you like: each one is saved to People and picked here."}
            />
          ) : null}
        </Field>

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
