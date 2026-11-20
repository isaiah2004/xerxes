import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Circle,
  ExternalLink,
  FolderMinus,
  ListTodo,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Radar,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  CircleCheck,
  type LucideIcon,
} from "lucide-react-native";
import { Children, useCallback, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clean } from "@/components/Conversation";
import { BudgetBar, EntryForm, iconOf, ProjectForm } from "@/components/projects";
import { ConfirmPanel, IconButton, Sheet, SheetAction, SheetActions, SheetBody } from "@/components/Sheet";
import { Button, Card, Chip, GradientSurface, IconTile, Row, SectionHeader, T, Tap } from "@/components/ui";
import { kindOf, pretty, WatchCard, WatchForm } from "@/components/watches";
import { manage, type Project, type ProjectEntry, type Watch } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { openLink, site } from "@/lib/links";
import { color, font, radius } from "@/lib/theme";

// One project: the bucket of context Xerxes builds on for the next purchase. Everything here is editable, and
// chats or calls started from here are tied to the project (their questions show up under "What you asked").

type EntryKind = "setup" | "plan" | "purchase";
type Mode =
  | { kind: "menu" }
  | { kind: "edit" }
  | { kind: "delete" }
  | { kind: "add"; entry: EntryKind }
  | { kind: "entry"; entry: ProjectEntry }
  | { kind: "edit-entry"; entry: ProjectEntry }
  | { kind: "bought"; entry: ProjectEntry }
  | { kind: "delete-entry"; entry: ProjectEntry }
  | { kind: "track" }
  | { kind: "watch"; watch: Watch };

const ADD_COPY: Record<EntryKind, { title: string; subtitle: string }> = {
  setup: { title: "How things are now", subtitle: "Size, style, what you already own: anything that should shape the next purchase." },
  plan: { title: "Add to the plan", subtitle: "Something you still want to get for this project." },
  purchase: { title: "Add a purchase", subtitle: "Something you already bought. It counts toward the budget." },
};
const KIND_LABEL: Record<ProjectEntry["kind"], string> = { setup: "How things are", plan: "Planned", purchase: "Bought", search: "You asked" };

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? `${days} days ago` : shortDate(iso.slice(0, 10));
}

/** Sections rise in one after another, like the tab screens. */
function Stagger({ children }: { children: ReactNode }) {
  return Children.toArray(children).map((child, i) => (
    <Animated.View key={i} entering={FadeInDown.duration(360).delay(Math.min(i, 8) * 45)}>
      {child}
    </Animated.View>
  ));
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 10, backgroundColor: "rgba(255,255,255,0.06)" }}>
      <Row gap={5}>
        <Icon size={13} color="rgba(255,255,255,0.7)" />
        <T v="caption" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </T>
      </Row>
      <T v="h3" style={{ color: "#fff", marginTop: 3 }}>
        {value}
      </T>
    </View>
  );
}

/** White grouped list with hairlines between rows (like the sheet menus). */
function Group({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <Card pad={0} style={{ paddingVertical: 4 }}>
      {rows.map((c, i) => (
        <View key={i}>
          {i ? <View style={{ height: 1, backgroundColor: color.line, marginLeft: 16 }} /> : null}
          {c}
        </View>
      ))}
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card style={{ borderStyle: "dashed", backgroundColor: color.paper }}>
      <T v="sub">{text}</T>
    </Card>
  );
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      manage
        .project(id)
        .then((x) => {
          setP(x);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [id],
  );
  // back from a chat or call: there may be a new search, plan or purchase
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const [sheet, setSheet] = useState<{ n: number; mode: Mode }>({ n: 0, mode: { kind: "menu" } });
  const [open, setOpen] = useState(false);
  const show = (mode: Mode) => {
    setSheet((s) => ({ n: s.n + 1, mode }));
    setOpen(true);
  };
  const swap = (mode: Mode) => setSheet((s) => ({ n: s.n + 1, mode }));
  const saved = (x: Project) => {
    setP(x);
    setOpen(false);
  };

  const back = () => {
    haptic.tap();
    if (router.canGoBack()) router.back();
    else router.replace("/tracking");
  };

  if (!p)
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, paddingTop: insets.top + 10, paddingHorizontal: 18 }}>
        <Pressable onPress={back} hitSlop={8} accessibilityLabel="Back">
          <View style={backBtn}>
            <ChevronLeft size={20} color={color.ink} />
          </View>
        </Pressable>
        {error ? (
          <Card style={{ marginTop: 18 }}>
            <T v="bodyStrong">Couldn’t open this project</T>
            <T v="sub" style={{ marginTop: 4 }}>
              {error}
            </T>
          </Card>
        ) : null}
      </View>
    );

  const meta = iconOf(p.icon);
  const done = p.status === "done";
  const of = (k: ProjectEntry["kind"]) => p.entries.filter((e) => e.kind === k);
  const plans = of("plan");
  const setup = of("setup");
  const purchases = of("purchase").sort((a, b) => (b.date ?? b.at).localeCompare(a.date ?? a.at));
  const searches = of("search").sort((a, b) => b.at.localeCompare(a.at));
  const cur = p.budget?.currency ?? p.spent.currency;

  const ask = (prompt?: string) => {
    setOpen(false);
    router.push({ pathname: "/chat/[id]", params: { id: "new", projectId: p.id, title: p.name, ...(prompt ? { prompt } : {}) } });
  };
  const talk = () => {
    haptic.heavy();
    router.push({ pathname: "/voice", params: { projectId: p.id, topic: p.name } });
  };
  const setStatus = (status: "active" | "done") =>
    manage
      .updateProject(p.id, { status })
      .then((x) => {
        haptic.success();
        saved(x);
      })
      .catch(() => haptic.error());
  const watchUpdate = (w: Watch, patch: Parameters<typeof manage.updateWatch>[1]) => {
    setOpen(false);
    manage
      .updateWatch(w.id, patch)
      .then(() => haptic.success())
      .catch(() => haptic.error())
      .finally(load);
  };

  // ---- sheet: title + content per mode
  const m = sheet.mode;
  const head: { title: string; subtitle?: string } =
    m.kind === "menu"
      ? { title: p.name, subtitle: done ? "Project · done" : "Project · active" }
      : m.kind === "edit"
        ? { title: "Edit project" }
        : m.kind === "delete"
          ? { title: `Delete ${p.name}?` }
          : m.kind === "add"
            ? ADD_COPY[m.entry]
            : m.kind === "entry"
              ? {
                  title: m.entry.text,
                  subtitle: [KIND_LABEL[m.entry.kind], m.entry.price && money(m.entry.price.amount, m.entry.price.currency), m.entry.date && shortDate(m.entry.date)].filter(Boolean).join(" · "),
                }
              : m.kind === "edit-entry"
                ? { title: "Edit" }
                : m.kind === "bought"
                  ? { title: "Mark as bought", subtitle: "What did it cost? It moves from the plan to your purchases." }
                  : m.kind === "delete-entry"
                    ? { title: m.entry.kind === "search" ? "Forget this search?" : "Remove this?" }
                    : m.kind === "track"
                      ? { title: `Track for ${p.name}`, subtitle: "I check prices around the clock and only ping you when it’s worth it." }
                      : { title: pretty(m.watch.query), subtitle: `${kindOf(m.watch.kind).label}${m.watch.active ? "" : " · paused"}` };

  const sheetContent = () => {
    switch (m.kind) {
      case "menu":
        return (
          <SheetBody>
            <SheetActions>
              <SheetAction icon={Pencil} label="Edit details" sub="Name, look, goal and budget" onPress={() => swap({ kind: "edit" })} />
              {done ? (
                <SheetAction icon={RotateCcw} label="Reopen project" sub="Back to active" onPress={() => setStatus("active")} />
              ) : (
                <SheetAction icon={CircleCheck} label="Mark as done" sub="Keep it for reference, out of the way" onPress={() => setStatus("done")} />
              )}
              <SheetAction icon={Trash2} label="Delete project" sub="Its tracked items keep being tracked" danger onPress={() => swap({ kind: "delete" })} />
            </SheetActions>
          </SheetBody>
        );
      case "edit":
        return <ProjectForm key={sheet.n} project={p} onSaved={saved} />;
      case "delete":
        return (
          <ConfirmPanel
            key={sheet.n}
            message="Its notes, plans, purchases and searches go with it. Tracked items stay on your list."
            onConfirm={() =>
              manage.deleteProject(p.id).then(() => {
                setOpen(false);
                back();
              })
            }
            onCancel={() => swap({ kind: "menu" })}
          />
        );
      case "add":
        return <EntryForm key={sheet.n} projectId={p.id} kind={m.entry} currency={cur} onSaved={saved} />;
      case "edit-entry":
        return m.entry.kind === "search" ? null : <EntryForm key={sheet.n} projectId={p.id} kind={m.entry.kind} entry={m.entry} currency={cur} onSaved={saved} />;
      case "bought":
        return <EntryForm key={sheet.n} projectId={p.id} kind="purchase" fromPlan={m.entry} currency={cur} onSaved={saved} />;
      case "delete-entry":
        return (
          <ConfirmPanel
            key={sheet.n}
            message={m.entry.kind === "search" ? "I won’t use it as context for this project any more." : "It comes off the project."}
            confirmLabel="Remove"
            onConfirm={() => manage.deleteEntry(p.id, m.entry.id).then(saved)}
            onCancel={() => swap({ kind: "entry", entry: m.entry })}
          />
        );
      case "entry": {
        const e = m.entry;
        return (
          <SheetBody>
            <SheetActions>
              {e.kind === "plan" ? <SheetAction icon={Sparkles} label="Find it with Xerxes" sub="Builds on everything in this project" onPress={() => ask(`Find me: ${e.text}`)} /> : null}
              {e.url ? (
                <SheetAction
                  icon={ExternalLink}
                  label="Open the listing"
                  sub={site(e.url)}
                  onPress={() => {
                    setOpen(false);
                    openLink(e.url);
                  }}
                />
              ) : null}
              {e.kind === "plan" ? <SheetAction icon={ShoppingBag} label="Mark as bought" sub="Moves it to your purchases" onPress={() => swap({ kind: "bought", entry: e })} /> : null}
              {e.kind === "search" ? <SheetAction icon={MessageCircle} label="Ask again" sub="A fresh look with today’s prices" onPress={() => ask(e.text)} /> : null}
              {e.kind !== "search" ? <SheetAction icon={Pencil} label="Edit" onPress={() => swap({ kind: "edit-entry", entry: e })} /> : null}
              <SheetAction icon={Trash2} label={e.kind === "search" ? "Forget it" : "Remove"} danger onPress={() => swap({ kind: "delete-entry", entry: e })} />
            </SheetActions>
          </SheetBody>
        );
      }
      case "track":
        return (
          <WatchForm
            key={sheet.n}
            projectId={p.id}
            onSaved={() => {
              setOpen(false);
              load();
            }}
          />
        );
      case "watch": {
        const w = m.watch;
        return (
          <SheetBody>
            <SheetActions>
              <SheetAction
                icon={w.active ? Pause : Play}
                label={w.active ? "Pause" : "Resume"}
                sub={w.active ? "Stop checking for now" : "Start checking prices again"}
                onPress={() => watchUpdate(w, { active: !w.active })}
              />
              <SheetAction icon={FolderMinus} label="Take out of this project" sub="Keep tracking it on its own" onPress={() => watchUpdate(w, { projectId: null })} />
            </SheetActions>
          </SheetBody>
        );
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 18, paddingTop: insets.top + 10 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Pressable onPress={back} hitSlop={8} accessibilityLabel="Back">
              <View style={backBtn}>
                <ChevronLeft size={20} color={color.ink} />
              </View>
            </Pressable>
            <IconButton icon={MoreHorizontal} size={38} label={`Manage ${p.name}`} onPress={() => show({ kind: "menu" })} />
          </Row>

          <Stagger>
            {/* hero: what it's for, the money, and the two ways to work on it */}
            <GradientSurface name="navy" glow={0.22} style={{ borderRadius: radius.xxl, padding: 20, marginTop: 14 }}>
              <Row gap={14} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="eyebrow" style={{ color: color.info }}>
                    Project · {done ? "Done" : "Active"}
                  </T>
                  <T v="h1" style={{ color: "#fff", fontSize: 27, lineHeight: 31, marginTop: 8 }}>
                    {p.name}
                  </T>
                </View>
                <IconTile icon={meta.icon} grad={meta.grad === "navy" ? "primary" : meta.grad} size={54} />
              </Row>
              {p.goal ? (
                <T v="body" style={{ color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
                  {p.goal}
                </T>
              ) : null}
              {p.budget ? (
                <View style={{ marginTop: 16 }}>
                  <BudgetBar spent={p.spent} budget={p.budget} light />
                </View>
              ) : p.spent.amount ? (
                <T v="caption" style={{ color: "rgba(255,255,255,0.72)", marginTop: 12 }}>
                  {money(p.spent.amount, p.spent.currency)} spent so far
                </T>
              ) : null}
              <View style={{ flexDirection: "row", gap: 1, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.10)", marginTop: 16 }}>
                <Stat icon={Receipt} label="Bought" value={p.counts.purchase} />
                <Stat icon={ListTodo} label="Planned" value={p.counts.plan} />
                <Stat icon={Radar} label="Tracking" value={p.counts.watch} />
              </View>
              <Row gap={10} style={{ marginTop: 16 }}>
                <Button kind="grad" grad="primary" icon={Sparkles} label="Ask Xerxes" style={{ flex: 1 }} onPress={() => ask()} />
                <Button kind="glass" icon={Mic} onPress={talk} />
              </Row>
            </GradientSurface>

            {/* what's next: the plans, each one a tap away from a search that builds on the whole project */}
            <View>
              <SectionHeader title="Next up" action="Add" onAction={() => show({ kind: "add", entry: "plan" })} />
              {plans.length ? (
                <Group>
                  {plans.map((e) => (
                    <Tap key={e.id} onPress={() => show({ kind: "entry", entry: e })} scale={0.985} accessibilityLabel={e.text}>
                      <Row gap={12} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                        <Circle size={18} color={color.primary} strokeWidth={2.4} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T v="bodyStrong" numberOfLines={2}>
                            {e.text}
                          </T>
                          {/* a pick Xerxes saved for this plan */}
                          {e.price || e.url ? (
                            <T v="caption" numberOfLines={1} style={{ color: color.primary, fontFamily: font.strong }}>
                              {[e.price && money(e.price.amount, e.price.currency), e.url && site(e.url)].filter(Boolean).join(" · ")}
                            </T>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => {
                            haptic.press();
                            ask(`Find me: ${e.text}`);
                          }}
                          hitSlop={8}
                          accessibilityLabel={`Find ${e.text}`}
                        >
                          {({ pressed }) => (
                            <View style={[findBtn, pressed ? { transform: [{ scale: 0.94 }] } : null]}>
                              <Sparkles size={13} color="#fff" strokeWidth={2.4} />
                              <T v="caption" style={{ color: "#fff", fontFamily: font.strong }}>
                                Find
                              </T>
                            </View>
                          )}
                        </Pressable>
                      </Row>
                    </Tap>
                  ))}
                </Group>
              ) : (
                <Empty text={done ? "Nothing left on the plan." : "What do you still want to get? Add it and I’ll find it with everything else here in mind."} />
              )}
            </View>

            <View>
              <SectionHeader title="What you have" action="Add" onAction={() => show({ kind: "add", entry: "setup" })} />
              {setup.length ? (
                <Group>
                  {setup.map((e) => (
                    <Tap key={e.id} onPress={() => show({ kind: "entry", entry: e })} scale={0.985} accessibilityLabel={e.text}>
                      <Row gap={12} style={{ paddingVertical: 12, paddingHorizontal: 14, alignItems: "flex-start" }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.info, marginTop: 8 }} />
                        <T v="body" style={{ flex: 1, color: color.ink }}>
                          {e.text}
                        </T>
                      </Row>
                    </Tap>
                  ))}
                </Group>
              ) : (
                <Empty text="How are things now? Size, style, what you already own. It keeps my picks from clashing with what’s there." />
              )}
            </View>

            <View>
              <SectionHeader title="Purchases" action="Add" onAction={() => show({ kind: "add", entry: "purchase" })} />
              {purchases.length ? (
                <Group>
                  {purchases.map((e) => (
                    <Tap key={e.id} onPress={() => show({ kind: "entry", entry: e })} scale={0.985} accessibilityLabel={e.text}>
                      <Row gap={12} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T v="bodyStrong" numberOfLines={2}>
                            {e.text}
                          </T>
                          {e.date ? <T v="caption">{shortDate(e.date)}</T> : null}
                        </View>
                        {e.price ? <T v="num">{money(e.price.amount, e.price.currency)}</T> : <Chip label="No price" />}
                      </Row>
                    </Tap>
                  ))}
                </Group>
              ) : (
                <Empty text="Nothing bought yet. When you buy something for this project, add it here (or tell me) and I’ll keep the budget honest." />
              )}
            </View>

            <View>
              <SectionHeader title="Tracked items" action="Track" onAction={() => show({ kind: "track" })} />
              {p.watches.length ? (
                <View style={{ gap: 10 }}>
                  {p.watches.map((w) => (
                    <WatchCard key={w.id} w={w} onManage={() => show({ kind: "watch", watch: w })} />
                  ))}
                </View>
              ) : (
                <Empty text="Waiting for a price to drop? Track it here and I’ll ping you when it’s worth buying." />
              )}
            </View>

            <View>
              <SectionHeader title="What you asked" />
              {searches.length ? (
                <Group>
                  {searches.map((e) => (
                    <Tap key={e.id} onPress={() => show({ kind: "entry", entry: e })} scale={0.985} accessibilityLabel={e.text}>
                      <View style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
                        <Row gap={10} style={{ alignItems: "flex-start" }}>
                          <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                            “{e.text}”
                          </T>
                          <T v="caption">{ago(e.at)}</T>
                        </Row>
                        {e.reply ? (
                          <T v="sub" numberOfLines={3}>
                            {clean(e.reply)}
                          </T>
                        ) : null}
                      </View>
                    </Tap>
                  ))}
                </Group>
              ) : (
                <Empty text="Chats and calls you start from this project show up here, and I use them as context next time." />
              )}
            </View>
          </Stagger>
        </View>
      </ScrollView>

      <Sheet open={open} onClose={() => setOpen(false)} title={head.title} subtitle={head.subtitle}>
        {sheetContent()}
      </Sheet>
    </View>
  );
}

const backBtn = { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" } as const;
const findBtn = { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color.primary, borderRadius: 11, paddingHorizontal: 10, height: 30 } as const;
