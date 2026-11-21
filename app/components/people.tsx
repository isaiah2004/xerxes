import { Check, Plus, UserPlus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { manage, type Person } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { color, font, onGradient, radius, type GradientName } from "@/lib/theme";
import { ChoiceChip, Field, Input } from "./forms";
import { FormError, SheetBody, SheetFooter } from "./Sheet";
import { Button, GradientSurface, Row, T } from "./ui";

// The people you shop for: their avatar, the form to add or edit someone, and the quick "Add someone" that lives
// inside people pickers (the calendar form), so adding a person, or a whole group, never means leaving the form.

/** Quick picks for "who they are to you"; anything else can be typed. */
export const RELATIONS = ["Friend", "Family", "Colleague", "Partner"];

const AVATARS: GradientName[] = ["navy", "primary", "info"];

/** Same person, same colour, wherever they show up. */
export function avatarOf(id: string): GradientName {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

export function Avatar({ person }: { person: Person }) {
  const g = avatarOf(person.id);
  return (
    <GradientSurface name={g} glow={g === "navy" ? 0.35 : undefined} style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
      <T v="h2" style={{ color: onGradient[g] }}>
        {person.name.trim().charAt(0).toUpperCase()}
      </T>
    </GradientSurface>
  );
}

/** Adds what's typed ("animals, cricket") to a list, skipping repeats whatever their case. */
const withTyped = (list: string[], typed: string) => {
  const out = [...list];
  for (const x of typed.split(",").map((s) => s.trim()).filter(Boolean)) if (!out.some((y) => y.toLowerCase() === x.toLowerCase())) out.push(x);
  return out.slice(0, 12);
};

const removable: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  height: 34,
  paddingLeft: 13,
  paddingRight: 10,
  borderRadius: radius.pill,
  backgroundColor: color.okBg,
  borderWidth: 1.5,
  borderColor: color.primary,
};

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onRemove();
      }}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
    >
      {({ pressed }) => (
        <View style={[removable, pressed ? { transform: [{ scale: 0.96 }] } : null]}>
          <T v="caption" style={{ color: color.ok, fontFamily: font.strong, fontSize: 13.5 }}>
            {label}
          </T>
          <X size={14} color={color.ok} strokeWidth={2.6} />
        </View>
      )}
    </Pressable>
  );
}

/** Add someone, or edit them: name, who they are to you, what they're into, notes. */
export function PersonForm({ person, onSaved }: { person?: Person; onSaved: (p: Person) => void }) {
  const [name, setName] = useState(person?.name ?? "");
  const [relation, setRelation] = useState(person?.relation ?? "");
  const [interests, setInterests] = useState<string[]>(person?.interests ?? []);
  const [typed, setTyped] = useState("");
  const [notes, setNotes] = useState((person?.notes ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTyped = () => {
    if (!typed.trim()) return;
    setInterests((xs) => withTyped(xs, typed));
    setTyped("");
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return setError("What’s their name?");
    const body = {
      name: n,
      relation: relation.trim(),
      interests: withTyped(interests, typed), // what's still in the box counts too
      notes: notes
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12),
    };
    setBusy(true);
    setError(null);
    (person ? manage.updatePerson(person.id, body) : manage.addPerson(body))
      .then((p) => {
        haptic.success();
        onSaved(p);
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
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="e.g. Priya, Mom, the Sharmas" autoFocus={!person} maxLength={60} accessibilityLabel="Name" />
        </Field>
        <Field label="Who they are to you">
          <Input value={relation} onChangeText={setRelation} placeholder="e.g. cousin sister, best friend" maxLength={40} accessibilityLabel="Relation" />
          <Row gap={8} wrap>
            {RELATIONS.map((r) => (
              <ChoiceChip key={r} label={r} selected={relation.trim().toLowerCase() === r.toLowerCase()} onPress={() => setRelation(r.toLowerCase())} />
            ))}
          </Row>
        </Field>
        <Field label="What they’re into" hint="Every gift I pick for them starts here.">
          {interests.length ? (
            <Row gap={6} wrap>
              {interests.map((x) => (
                <RemovableChip key={x} label={x} onRemove={() => setInterests((xs) => xs.filter((y) => y !== x))} />
              ))}
            </Row>
          ) : null}
          <Row gap={8}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input value={typed} onChangeText={setTyped} placeholder="e.g. animals, cricket" onSubmitEditing={addTyped} keepFocus maxLength={80} accessibilityLabel="Add an interest" />
            </View>
            <Button kind="ghost" compact icon={Plus} label="Add" onPress={addTyped} />
          </Row>
        </Field>
        <Field label="Notes" hint="One per line: sizes, what they already have, anything that helps.">
          <Input value={notes} onChangeText={setNotes} placeholder="e.g. Just got into film photography" multiline maxLength={800} accessibilityLabel="Notes" />
        </Field>
      </SheetBody>
      <SheetFooter>
        {error ? <FormError text={error} /> : null}
        <Button kind="grad" icon={person ? Check : UserPlus} label={person ? "Save changes" : "Add person"} loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}

/**
 * "Add someone" inside a people picker: type a name, tap Add (or Enter) and they're saved and picked. The box
 * clears for the next name, so a whole group goes in fast. A name you already have just picks that person.
 */
export function AddPersonInline({ people, onAdded, hint }: { people: Person[]; onAdded: (p: Person) => void; hint?: string }) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const n = name.trim();
    if (!n || busy) return;
    setError(null);
    const known = people.find((p) => p.name.trim().toLowerCase() === n.toLowerCase());
    if (known) {
      haptic.tap();
      onAdded(known);
      setName("");
      return;
    }
    setBusy(true);
    manage
      .addPerson({ name: n, relation: relation.trim() })
      .then((p) => {
        haptic.success();
        onAdded(p);
        setName("");
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <View style={{ gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: color.chip }}>
      <Row gap={8}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input value={name} onChangeText={setName} placeholder="Their name" autoFocus keepFocus onSubmitEditing={add} maxLength={60} accessibilityLabel="New person’s name" />
        </View>
        <Button kind="grad" compact icon={Plus} label="Add" loading={busy} onPress={add} />
      </Row>
      {/* the relation sticks between names: three colleagues in a row is one tap (three chips fit one line) */}
      <Row gap={6} wrap>
        {RELATIONS.slice(0, 3).map((r) => {
          const on = relation === r.toLowerCase();
          return <ChoiceChip key={r} label={r} selected={on} onPress={() => setRelation(on ? "" : r.toLowerCase())} />;
        })}
      </Row>
      <T v="caption">{hint ?? "They’re saved to People, where you can add what they’re into."}</T>
      {error ? <FormError text={error} /> : null}
    </View>
  );
}
