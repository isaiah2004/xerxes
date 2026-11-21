import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FolderMinus, Pause, Pencil, Play, Plus, Sparkles, Trash2, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { FindArt } from "@/components/FindArt";
import { iconOf, ProjectCard, ProjectForm } from "@/components/projects";
import { Screen } from "@/components/Screen";
import { ConfirmPanel, IconButton, Sheet, SheetAction, SheetActions, SheetBody } from "@/components/Sheet";
import { SpeakButton } from "@/components/Speak";
import { findVoice, TalkButton } from "@/components/TalkButton";
import { Button, Card, Row, SectionHeader, Segmented, T, Tap } from "@/components/ui";
import { kindOf, pretty, PriceForm, WatchCard, WatchForm } from "@/components/watches";
import { api, manage, type Feed, type Watch } from "@/lib/api";
import { money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { openLink } from "@/lib/links";
import { color } from "@/lib/theme";

// Tracking = projects (the story behind a chain of purchases) + items (prices Xerxes hunts around the clock).
type Tab = "projects" | "items";
type Mode = "add" | "menu" | "price" | "delete" | "project";

const openProject = (id: string) => router.push({ pathname: "/project/[id]", params: { id } });

export default function Tracking() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [tab, setTab] = useState<Tab>(params.view === "items" ? "items" : "projects");
  // "See all" on Today's finds opens Items, even when this tab was already open on Projects
  const [asked, setAsked] = useState(params.view);
  if (params.view !== asked) {
    setAsked(params.view);
    if (params.view === "items" || params.view === "projects") setTab(params.view);
  }

  const [feed, setFeed] = useState<Feed | null>(null);
  const load = useCallback(() => api.feed().then(setFeed).catch(() => undefined), []);
  // back from a project screen: its counts and budget may have changed
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // one sheet for the whole screen; its content switches between the forms, the menu and the confirm
  const [sheet, setSheet] = useState<{ n: number; mode: Mode; w?: Watch }>({ n: 0, mode: "add" });
  const [open, setOpen] = useState(false);
  const openSheet = (mode: Mode, w?: Watch) => {
    setSheet((s) => ({ n: s.n + 1, mode, w }));
    setOpen(true);
  };
  const setMode = (mode: Mode) => setSheet((s) => ({ ...s, mode }));
  const finish = () => {
    setOpen(false);
    load();
  };

  const toggle = (w: Watch) => {
    setOpen(false);
    setFeed((f) => f && { ...f, watches: f.watches.map((x) => (x.id === w.id ? { ...x, active: !w.active } : x)) });
    manage
      .updateWatch(w.id, { active: !w.active })
      .then(() => haptic.success())
      .catch(() => haptic.error())
      .finally(load);
  };
  const unlink = (w: Watch) => {
    setOpen(false);
    manage
      .updateWatch(w.id, { projectId: null })
      .then(() => haptic.success())
      .catch(() => haptic.error())
      .finally(load);
  };

  const dismiss = (id: string) => {
    setFeed((f) => f && { ...f, notifications: f.notifications.filter((n) => n.id !== id) });
    manage.dismissFind(id).catch(load);
  };

  const projects = feed?.projects ?? [];
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const finds = feed?.notifications.filter((n) => n.kind !== "occasion") ?? [];
  const watches = feed?.watches ?? [];
  const tracked = [...watches.filter((w) => w.active), ...watches.filter((w) => !w.active)];
  const paused = watches.length - watches.filter((w) => w.active).length;
  const projectOf = (w: Watch) => projects.find((p) => p.id === w.projectId);

  const w = sheet.w;
  const wProject = w && projectOf(w);
  const head =
    sheet.mode === "project"
      ? { title: "New project", subtitle: "A home for everything behind a set of purchases, so each pick builds on the last." }
      : sheet.mode === "add" || !w
        ? { title: "Track something", subtitle: "I check prices around the clock and only ping you when it’s worth it." }
        : sheet.mode === "menu"
          ? {
              title: pretty(w.query),
              subtitle: `${kindOf(w.kind).label} · ${w.maxPrice ? `under ${money(w.maxPrice.amount, w.maxPrice.currency)}` : "any good deal"}${wProject ? ` · ${wProject.name}` : ""}${w.active ? "" : " · paused"}`,
            }
          : sheet.mode === "price"
            ? { title: "Target price", subtitle: `I’ll ping you when ${pretty(w.query)} drops below this.` }
            : { title: `Stop tracking ${pretty(w.query)}?` };

  const projectsView = [
    <SectionHeader key="p-head" title={projects.length > activeProjects ? `Your projects · ${projects.length - activeProjects} done` : "Your projects"} action="New" onAction={() => openSheet("project")} />,
    <View key="p-list" style={{ gap: 12 }}>
      {projects.map((p) => (
        <ProjectCard key={p.id} p={p} onPress={() => openProject(p.id)} />
      ))}
      {feed && !projects.length ? (
        <Card>
          <T v="sub">No projects yet. Start one for anything that takes more than one purchase: a room, a hobby setup, a trip. I’ll remember what you have, what you bought and what’s next.</T>
        </Card>
      ) : null}
    </View>,
    <Row key="p-actions" gap={10} style={{ marginTop: 12 }}>
      <Button kind="grad" icon={Plus} label="New project" style={{ flex: 1 }} onPress={() => openSheet("project")} />
      <Button
        kind="ghost"
        icon={Sparkles}
        label="Ask Xerxes"
        style={{ flex: 1 }}
        onPress={() => router.push({ pathname: "/chat/[id]", params: { id: "new", title: "New project", prompt: "I'm starting a new project: " } })}
      />
    </Row>,
  ];

  const itemsView = [
    <SectionHeader
      key="i-head"
      title={paused ? `Your items · ${paused} paused` : "Your items"}
      action="Add"
      onAction={() => openSheet("add")}
    />,
    <View key="i-list" style={{ gap: 10 }}>
      {tracked.map((x) => (
        <WatchCard key={x.id} w={x} project={projectOf(x)} onManage={() => openSheet("menu", x)} />
      ))}
      {feed && !watches.length ? (
        <Card>
          <T v="sub">Nothing tracked yet. Tell me what you want and the price you’d happily pay.</T>
        </Card>
      ) : null}
    </View>,
    <Row key="i-actions" gap={10} style={{ marginTop: 12 }}>
      <Button kind="grad" icon={Plus} label="Track an item" style={{ flex: 1 }} onPress={() => openSheet("add")} />
      <Button
        kind="ghost"
        icon={Sparkles}
        label="Ask Xerxes"
        style={{ flex: 1 }}
        onPress={() => router.push({ pathname: "/chat/[id]", params: { id: "new", title: "Track something", prompt: "Keep an eye on " } })}
      />
    </Row>,
    <SectionHeader key="f-head" title="Fresh finds" />,
    <View key="f-list" style={{ gap: 10 }}>
      {finds.map((n) => {
        const k = kindOf(n.kind);
        return (
          <Tap key={n.id} onPress={() => openLink(n.url)} accessibilityLabel={n.title}>
            <Card>
              <Row gap={12} style={{ alignItems: "flex-start" }}>
                <FindArt uri={n.imageUrl} icon={k.icon} grad={k.grad} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={2}>
                    {n.title}
                  </T>
                  <T v="sub" numberOfLines={2}>
                    {n.body}
                  </T>
                  <Row gap={8} style={{ marginTop: 8 }}>
                    {n.price ? <T v="num">{n.price}</T> : null}
                    <SpeakButton text={`${n.title}. ${n.body}`} />
                    <TalkButton voice={findVoice(n)} label={`Talk to Xerxes about ${n.title}`} />
                  </Row>
                </View>
                <IconButton icon={X} size={30} label={`Dismiss ${n.title}`} onPress={() => dismiss(n.id)} />
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
    </View>,
  ];

  return (
    <>
      <Screen onRefresh={load}>
        <View style={{ paddingHorizontal: 4 }}>
          <T v="sub">Always on</T>
          <T v="display">Tracking</T>
          <T v="body" style={{ marginTop: 6, color: color.muted }}>
            {tab === "projects"
              ? "The story behind your purchases: what you have, what you bought, what’s next. I build on all of it for every pick."
              : "What I’m hunting for you around the clock. I only ping you when a price is genuinely worth it."}
          </T>
        </View>
        <View style={{ marginTop: 18 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: "projects", label: "Projects", count: feed ? activeProjects : undefined },
              { id: "items", label: "Items", count: feed ? watches.length - paused : undefined },
            ]}
          />
        </View>
        {tab === "projects" ? projectsView : itemsView}
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} title={head.title} subtitle={head.subtitle}>
        {sheet.mode === "project" ? (
          <ProjectForm
            key={sheet.n}
            onSaved={(p) => {
              finish();
              openProject(p.id);
            }}
          />
        ) : sheet.mode === "add" || !w ? (
          <WatchForm key={sheet.n} projects={projects} onSaved={finish} />
        ) : sheet.mode === "menu" ? (
          <SheetBody>
            <SheetActions>
              <SheetAction
                icon={w.active ? Pause : Play}
                label={w.active ? "Pause" : "Resume"}
                sub={w.active ? "Stop checking for now, keep it on the list" : "Start checking prices again"}
                onPress={() => toggle(w)}
              />
              <SheetAction
                icon={Pencil}
                label={w.maxPrice ? "Edit target price" : "Set a target price"}
                sub={w.maxPrice ? `Now: under ${money(w.maxPrice.amount, w.maxPrice.currency)}` : "Only ping me below a price"}
                onPress={() => setMode("price")}
              />
              {wProject ? (
                <SheetAction
                  icon={iconOf(wProject.icon).icon}
                  label={`Open ${wProject.name}`}
                  sub="The project it's tracked for"
                  onPress={() => {
                    setOpen(false);
                    openProject(wProject.id);
                  }}
                />
              ) : null}
              {wProject ? <SheetAction icon={FolderMinus} label="Take out of the project" sub="Keep tracking it on its own" onPress={() => unlink(w)} /> : null}
              <SheetAction icon={Trash2} label="Delete" sub="Stop tracking it" danger onPress={() => setMode("delete")} />
            </SheetActions>
          </SheetBody>
        ) : sheet.mode === "price" ? (
          <PriceForm key={sheet.n} w={w} onSaved={finish} />
        ) : (
          <ConfirmPanel
            key={sheet.n}
            message="I stop checking prices for it. Deals I already found stay in Fresh finds."
            onConfirm={() => manage.deleteWatch(w.id).then(finish)}
            onCancel={() => setMode("menu")}
          />
        )}
      </Sheet>
    </>
  );
}
