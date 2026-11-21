import { router, useFocusEffect } from "expo-router";
import { Cake, Gift, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { openOccasion } from "@/components/dates";
import { OccasionForm, type Occ } from "@/components/OccasionForm";
import { Avatar, PersonForm } from "@/components/people";
import { Screen } from "@/components/Screen";
import { ConfirmPanel, IconButton, Sheet, SheetAction, SheetActions, SheetBody } from "@/components/Sheet";
import { Button, Card, Chip, Row, T, Tap } from "@/components/ui";
import { api, manage, type Feed, type Person } from "@/lib/api";
import { dayDate } from "@/lib/format";
import { color } from "@/lib/theme";

// The people you shop for: who they are, what they're into, what's coming up for them. Add, edit or remove them
// here; people added while making a calendar event (or by Xerxes in a chat) show up here too.

type Mode =
  | { kind: "add" }
  | { kind: "menu"; p: Person }
  | { kind: "edit"; p: Person }
  | { kind: "birthday"; p: Person }
  | { kind: "delete"; p: Person };

/** "Cousin sister / cousin sister" says nothing twice: the relation shows only when it adds something. */
const relationOf = (p: Person) => (p.relation && p.relation.toLowerCase() !== p.name.toLowerCase() ? p.relation : "");
const short = (o: Occ) => (o.kind === "birthday" ? "Birthday" : o.kind === "anniversary" ? "Anniversary" : o.label);

export default function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const load = useCallback(() => {
    manage.people().then(setPeople).catch(() => undefined);
    api.feed().then(setFeed).catch(() => undefined);
  }, []);
  // back from the Calendar or a chat: someone may have been added there
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // occasions that name them (a festival for everyone isn't "theirs"), soonest first
  const theirs = useCallback((p: Person) => ((feed?.upcoming ?? []) as Occ[]).filter((o) => (o.personIds ?? []).includes(p.id)), [feed]);
  const birthdayOf = (p: Person) => theirs(p).find((o) => o.kind === "birthday");
  // whoever has something coming up first, then everyone else by name
  const list = useMemo(
    () =>
      (people ?? [])
        .map((p) => ({ p, next: theirs(p)[0] }))
        .sort((a, b) => (a.next?.daysLeft ?? Infinity) - (b.next?.daysLeft ?? Infinity) || a.p.name.localeCompare(b.p.name)),
    [people, theirs],
  );

  // one sheet: add, or a person's menu → edit / their birthday / remove
  const [sheet, setSheet] = useState<{ n: number; mode: Mode }>({ n: 0, mode: { kind: "add" } });
  const [open, setOpen] = useState(false);
  const show = (mode: Mode) => {
    setSheet((s) => ({ n: s.n + 1, mode }));
    setOpen(true);
  };
  const swap = (mode: Mode) => setSheet((s) => ({ n: s.n + 1, mode }));
  const done = () => {
    setOpen(false);
    load();
  };

  const gift = (p: Person) => {
    setOpen(false);
    const next = theirs(p)[0];
    if (next) openOccasion(next);
    else router.push({ pathname: "/chat/[id]", params: { id: "new", title: `Gift for ${p.name}`, prompt: `Find a gift for ${p.name}` } });
  };

  const m = sheet.mode;
  const head: { title: string; subtitle?: string } = (() => {
    switch (m.kind) {
      case "add":
        return { title: "Add someone", subtitle: "Who do you shop for? What they’re into shapes every gift I pick." };
      case "menu": {
        const next = theirs(m.p)[0];
        return { title: m.p.name, subtitle: [relationOf(m.p), next && `${short(next)} · ${dayDate(next.nextDate)}`].filter(Boolean).join(" · ") || undefined };
      }
      case "edit":
        return { title: `Edit ${m.p.name}` };
      case "birthday": {
        const b = birthdayOf(m.p);
        return b ? { title: `Edit ${b.label}` } : { title: `${m.p.name}’s birthday`, subtitle: "Pick the day. I’ll remind you in time to get a gift there." };
      }
      case "delete":
        return { title: `Remove ${m.p.name}?` };
    }
  })();

  const content = () => {
    switch (m.kind) {
      case "add":
        // straight on to what you can do with them, like adding their birthday
        return (
          <PersonForm
            key={sheet.n}
            onSaved={(p) => {
              load();
              swap({ kind: "menu", p });
            }}
          />
        );
      case "edit":
        return <PersonForm key={sheet.n} person={m.p} onSaved={done} />;
      case "birthday":
        return <OccasionForm key={sheet.n} o={birthdayOf(m.p) ?? null} preset={{ kind: "birthday", personIds: [m.p.id] }} onSaved={done} />;
      case "delete": {
        const solo = theirs(m.p).filter((o) => (o.kind === "birthday" || o.kind === "anniversary") && (o.personIds ?? []).length === 1);
        return (
          <ConfirmPanel
            key={sheet.n}
            message={`I’ll forget what I know about ${m.p.name}${solo.length ? `, and ${solo.map((o) => o.label).join(" and ")} comes off your calendar` : ""}.`}
            confirmLabel="Remove"
            onConfirm={() => manage.deletePerson(m.p.id).then(done)}
            onCancel={() => swap({ kind: "menu", p: m.p })}
          />
        );
      }
      case "menu": {
        const p = m.p;
        const next = theirs(p)[0];
        const birthday = birthdayOf(p);
        return (
          <SheetBody>
            <SheetActions>
              <SheetAction icon={Gift} label="Find a gift" sub={next ? `For ${next.label}, ${dayDate(next.nextDate)}` : "Ideas that fit what they’re into"} onPress={() => gift(p)} />
              <SheetAction
                icon={Cake}
                label={birthday ? "Edit their birthday" : "Add their birthday"}
                sub={birthday ? dayDate(birthday.nextDate) : "I’ll remind you in time to get a gift there"}
                onPress={() => swap({ kind: "birthday", p })}
              />
              <SheetAction icon={Pencil} label="Edit details" sub="Name, relation, what they’re into, notes" onPress={() => swap({ kind: "edit", p })} />
              <SheetAction icon={Trash2} label="Remove" sub="Take them off your people" danger onPress={() => swap({ kind: "delete", p })} />
            </SheetActions>
          </SheetBody>
        );
      }
    }
  };

  return (
    <>
      <Screen onRefresh={load}>
        <View style={{ paddingHorizontal: 4 }}>
          <Row gap={12} style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="sub">Family & friends</T>
              <T v="display">People</T>
            </View>
            <Button kind="grad" compact icon={UserPlus} label="Add" style={{ marginTop: 4 }} onPress={() => show({ kind: "add" })} />
          </Row>
          <T v="body" style={{ marginTop: 6, color: color.muted }}>
            What I remember about the people you shop for, so every gift starts from them.
          </T>
        </View>

        <View style={{ gap: 12, marginTop: 18 }}>
          {list.map(({ p, next }) => {
            const rel = relationOf(p);
            return (
              <Tap key={p.id} onPress={() => show({ kind: "menu", p })} scale={0.985} accessibilityLabel={p.name}>
                <Card pad={16}>
                  <Row gap={12}>
                    <Avatar person={p} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T v="h3" numberOfLines={1}>
                        {p.name}
                      </T>
                      {rel ? (
                        <T v="caption" numberOfLines={1}>
                          {rel}
                        </T>
                      ) : null}
                    </View>
                    {/* a Chip sits at the top of its row on its own; wrapped, it centres on the name */}
                    {next ? (
                      <View>
                        <Chip label={`${short(next)} · ${next.daysLeft}d`} tone={next.daysLeft <= 21 ? "warn" : "neutral"} />
                      </View>
                    ) : null}
                    <IconButton icon={MoreHorizontal} label={`Manage ${p.name}`} onPress={() => show({ kind: "menu", p })} />
                  </Row>
                  {p.interests.length ? (
                    <Row gap={6} wrap style={{ marginTop: 12 }}>
                      {p.interests.map((x) => (
                        <Chip key={x} label={x} tone="info" />
                      ))}
                    </Row>
                  ) : (
                    <T v="caption" style={{ marginTop: 10 }}>
                      Tell me what they’re into and my picks get a lot better.
                    </T>
                  )}
                  {p.notes.slice(0, 2).map((n) => (
                    <T key={n} v="sub" style={{ marginTop: 10 }}>
                      “{n}”
                    </T>
                  ))}
                  <Button kind="ghost" compact icon={Gift} label={next ? `Gift for ${dayDate(next.nextDate)}` : "Find a gift"} style={{ marginTop: 12 }} onPress={() => gift(p)} />
                </Card>
              </Tap>
            );
          })}
          {people && !people.length ? (
            <Card>
              <T v="sub">No one yet. Add the people you shop for and what they’re into, and every gift I pick starts from them.</T>
            </Card>
          ) : null}
          {people ? <Button kind="ghost" icon={UserPlus} label="Add someone" onPress={() => show({ kind: "add" })} /> : null}
        </View>
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} title={head.title} subtitle={head.subtitle}>
        {content()}
      </Sheet>
    </>
  );
}
