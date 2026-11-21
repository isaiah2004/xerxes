import { router, useLocalSearchParams } from "expo-router";
import { ArrowUp, Camera, ChevronLeft, ImagePlus, Images, Link2, Mic, Sparkles } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachButton, AttachNotice, LinkChip, PhotoStrip } from "@/components/Attachments";
import { IdeasCard, Spinner } from "@/components/cards";
import { AgentBubble, TurnView, type Turn } from "@/components/Conversation";
import { Sheet, SheetAction, SheetActions, SheetBody } from "@/components/Sheet";
import { Card, GradientSurface, Row, T, Tap } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { api, manage, type Card as CardT, type Ideas, type Person, type Project, type Upcoming } from "@/lib/api";
import { dayDate, money, pronounsFor } from "@/lib/format";
import { linksIn } from "@/lib/links";
import { cameraAvailable, photosAvailable, type PhotoSource } from "@/lib/photos";
import { MAX_PHOTOS, usePhotos, type Photo } from "@/lib/usePhotos";
import { color, font, ledge, radius } from "@/lib/theme";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What Xerxes says it already knows when a chat opens from a project. */
function projectIntro(p: Project) {
  const known = [
    p.counts.purchase && plural(p.counts.purchase, "purchase"),
    p.counts.setup && plural(p.counts.setup, "note") + " on how things are",
    p.counts.plan && plural(p.counts.plan, "plan"),
    p.counts.search && plural(p.counts.search, "earlier search", "earlier searches"),
  ].filter((x): x is string => !!x);
  const left = p.budget ? ` and ${money(p.budget.amount - p.spent.amount, p.budget.currency)} left in the budget` : "";
  return known.length
    ? `I’ve got your ${p.name} project open: ${known.join(", ")}${left}. Whatever we look for, I’ll make it fit. What’s next?`
    : `This chat is part of your ${p.name} project, so I’ll remember what we find. What are we looking for?`;
}

/** "Cousin sister turns 14 on Wed 2 Dec" / "Diwali is on Sun 8 Nov" */
const occasionWhen = (o: Upcoming, person?: Person) =>
  `${person && o.turningAge ? `${person.name} turns ${o.turningAge}` : `${o.label} is`} on ${dayDate(o.nextDate)}`;

/** What Xerxes says over the ideas it thought up ahead of time for an occasion. */
const ideasIntro = (o: Upcoming, person?: Person) =>
  `${occasionWhen(o, person)}. It should arrive by ${dayDate(o.arriveBy)}, and your budget is ${money(o.budget.amount, o.budget.currency)}. I’ve had a think, so here are a few directions:`;

type IdeasCardT = Extract<CardT, { type: "ideas" }>;
/**
 * The ideas an occasion chat opens on. loading: first ask in flight. pending: still being thought up (polled).
 * failed: none coming (unknown occasion, an error, too slow), so the chat opens the old way, with suggestions.
 */
type IdeasState = { phase: "off" | "loading" | "pending" | "failed" } | { phase: "ready"; text: string; card: IdeasCardT };
const IDEAS_POLL_MS = 2500;
const IDEAS_WAIT_MS = 60_000;
/** a slow first answer shows "Thinking of a few ideas…" rather than nothing */
const IDEAS_SLOW_MS = 1500;

/** A usable "ready" answer (at least one idea with a title) as a card, or null so the chat falls back. */
function readyIdeas(r: Ideas | null | undefined, occasionId: string): { text: string; card: IdeasCardT } | null {
  if (r?.status !== "ready" || !Array.isArray(r.card?.ideas)) return null;
  const ideas = r.card.ideas.filter((i) => typeof i?.title === "string" && i.title.trim());
  if (!ideas.length) return null;
  return {
    text: typeof r.text === "string" ? r.text : "",
    card: { ...r.card, id: r.card.id || `ideas-${occasionId}`, type: "ideas", heading: r.card.heading || "A few ideas", ideas },
  };
}

/** Keeps the [context: …] note in one piece: the chat hides it only up to its first "]" (clean() in Conversation). */
const noteSafe = (s: string) => s.replace(/[[\]]/g, "");

/** Under the intro while the ideas are still on their way. */
function ThinkingOfIdeas() {
  return (
    <Row gap={10} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
      <Spinner size={16} />
      <T v="sub">Thinking of a few ideas…</T>
    </Row>
  );
}

/** Under the general chat's hello: links and photos work too. Hints, not buttons. */
function Hints() {
  const hints = [
    { icon: Link2, text: "Paste a link: is this a good deal?" },
    ...(photosAvailable ? [{ icon: ImagePlus, text: "Add a photo: find this cheaper" }] : []),
  ];
  return (
    <View style={{ gap: 6, paddingHorizontal: 6 }}>
      {hints.map(({ icon: Icon, text }) => (
        <Row key={text} gap={8}>
          <Icon size={14} color={color.muted} strokeWidth={2.2} />
          <T v="sub">{text}</T>
        </Row>
      ))}
    </View>
  );
}

export default function Chat() {
  const params = useLocalSearchParams<{ id: string; occasionId?: string; projectId?: string; prompt?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const [conversationId, setConversationId] = useState<string | null>(params.id && params.id !== "new" ? params.id : null);
  const [occasion, setOccasion] = useState<Upcoming | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  // an occasion or project chat opens once we know what it's about, so a generic hello doesn't flash up first
  const [lookedUp, setLookedUp] = useState(!params.occasionId && !params.projectId);
  const [ideas, setIdeas] = useState<IdeasState>({ phase: params.occasionId && !params.projectId ? "loading" : "off" });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(params.prompt ?? "");
  const [sending, setSending] = useState(false);
  // photos for the next message (each uploads as it's picked) and, on a phone, the camera-or-library sheet
  const pics = usePhotos();
  const [attaching, setAttaching] = useState(false);
  const typedLink = useMemo(() => linksIn(input)[0], [input]);
  const scroll = useRef<ScrollViewInstance>(null);
  const chatting = turns.length > 0;

  useEffect(() => {
    if (!conversationId) api.newConversation().then((c) => setConversationId(c.id)).catch(() => undefined);
    const lookups: Promise<unknown>[] = [];
    if (params.occasionId) lookups.push(api.feed().then((f) => setOccasion(f.upcoming.find((o) => o.id === params.occasionId) ?? null)));
    if (params.projectId) lookups.push(manage.project(params.projectId).then(setProject));
    if (lookups.length) void Promise.allSettled(lookups).then(() => setLookedUp(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // An occasion chat opens on ideas thought up beforehand. "pending" means they're still being thought up: ask again
  // every few seconds, for up to a minute. Writing first ends the wait (that turn brings its own ideas).
  useEffect(() => {
    const id = params.occasionId;
    if (!id || params.projectId || chatting) return;
    let live = true;
    let pendingSeen = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    // only loading/pending move on: once the ideas are in or given up on, a late answer changes nothing
    const move = (s: IdeasState) => setIdeas((cur) => (cur.phase === "loading" || cur.phase === "pending" ? s : cur));
    const showWaiting = () => setIdeas((cur) => (cur.phase === "loading" ? { phase: "pending" } : cur));
    const slow = setTimeout(showWaiting, IDEAS_SLOW_MS);
    const deadline = setTimeout(() => {
      live = false;
      clearTimeout(next);
      move({ phase: "failed" });
    }, IDEAS_WAIT_MS);
    const ask = async () => {
      try {
        const r = await api.ideas(id);
        if (!live) return;
        const ready = readyIdeas(r, id);
        if (ready) return move({ phase: "ready", ...ready });
        if (r?.status !== "pending") return move({ phase: "failed" });
        pendingSeen = true;
        showWaiting();
      } catch {
        if (!live) return;
        // before any "pending", an error means there's nothing to wait for (unknown occasion, a backend without ideas);
        // after one, it's most likely the backend restarting, so keep asking
        if (!pendingSeen) return move({ phase: "failed" });
      }
      next = setTimeout(ask, IDEAS_POLL_MS);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(next);
      clearTimeout(slow);
      clearTimeout(deadline);
    };
  }, [params.occasionId, params.projectId, chatting]);

  const person = occasion?.people.length === 1 ? occasion.people[0] : undefined;
  const p = person ? pronounsFor(person.relation) : undefined;
  const pronoun = p?.subj;
  const suggestions = useMemo(() => {
    if (project) return project.entries.filter((e) => e.kind === "plan").slice(0, 3).map((e) => `Find me: ${e.text}`);
    if (!occasion) return [];
    const half = `Keep it under ${money(Math.round(occasion.budget.amount / 2), occasion.budget.currency)}`;
    const interest = person?.interests[0];
    const asks = !person
      ? occasion.kind === "anniversary"
        ? ["Something they can enjoy together", "An experience, not a thing", half]
        : ["One thoughtful gift per person, within budget", "One big gift for the whole family", half]
      : [
          interest ? `A hardcover ${interest.replace(/s$/, "")} book with cool visuals and lots of facts` : "Something thoughtful and useful",
          `Surprise me — you know ${p?.obj ?? "them"}`,
          half,
        ];
    // these only show when the ideas didn't come through, so asking for some comes first
    return ["Give me a few ideas", ...asks];
  }, [occasion, project, person, p]);
  const occasionIntro = occasion
    ? `${occasionWhen(occasion, person)}. To be safe, it should arrive by ${dayDate(occasion.arriveBy)}, and your budget is ${money(occasion.budget.amount, occasion.budget.currency)}. ${
        person ? `What’s ${pronoun} into lately?` : occasion.kind === "anniversary" ? "What do they love doing together?" : "Who’s on the list this year?"
      }`
    : "";

  // The first message says which occasion this is and which ideas are already on the table, so the agent's fresh thread knows.
  const firstNote = () => {
    const id = occasion?.id ?? params.occasionId;
    if (!id) return "";
    const shown = ideas.phase === "ready" ? `. You already suggested: ${ideas.card.ideas.map((i) => (i.price ? `${i.title} (${i.price})` : i.title)).join("; ")}` : "";
    return `\n\n[context: this is for "${noteSafe(occasion?.label ?? params.title ?? "")}" — occasionId ${noteSafe(id)}${noteSafe(shown)}]`;
  };

  /** attached: the message box's photos (only the message box sends them; a tapped idea or suggestion is just text). */
  const send = async (raw: string, attached: Photo[] = []) => {
    const text = raw.trim();
    const photos = attached.filter((p) => p.status === "done" && p.id && p.url);
    if ((!text && !photos.length) || !conversationId || sending) return;
    haptic.press();
    setInput("");
    if (attached.length) pics.clear();
    setSending(true);
    const key = `${Date.now()}`;
    setTurns((t) => [...t, { key, text, images: photos.length ? photos.map((p) => p.url!) : undefined }]);
    const withCtx = turns.length === 0 ? `${text}${firstNote()}` : text;
    try {
      const { runId } = await api.send(conversationId, withCtx, params.projectId, photos.map((p) => p.id!));
      setTurns((t) => t.map((x) => (x.key === key ? { ...x, runId } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setSending(false);
    }
  };

  // Text or an uploaded photo is enough. Not while a photo is still uploading, or one failed: it would go missing.
  const canSend = !!conversationId && !sending && !pics.uploading && !pics.failed && (!!input.trim() || pics.ready.length > 0);
  const submit = () => {
    if (canSend) void send(input, pics.photos);
  };

  // The web goes straight to the file picker (it has to open from the tap itself); a phone asks camera or library.
  const attach = () => {
    if (cameraAvailable) setAttaching(true);
    else void pics.add("library");
  };
  const choose = (source: PhotoSource) => {
    setAttaching(false);
    // let the sheet slide away first: iOS won't show the camera or library over a sheet that's still closing
    setTimeout(() => void pics.add(source), 400);
  };

  const title = params.title ?? project?.name ?? occasion?.label ?? "Xerxes";
  const subtitle = project
    ? `Project${project.budget ? ` · ${money(project.spent.amount, project.spent.currency)} of ${money(project.budget.amount, project.budget.currency)} spent` : ""}`
    : occasion
      ? `${occasion.kind === "birthday" ? "Birthday" : occasion.label} · ${occasion.daysLeft} days · ${money(occasion.budget.amount, occasion.budget.currency)}`
      : "Your shopping agent";

  const suggestionCards = (
    <View style={{ gap: 8 }}>
      {suggestions.map((s) => (
        <Tap key={s} onPress={() => send(s)} accessibilityLabel={s}>
          <Card pad={12} style={{ borderStyle: "dashed" }}>
            <Row gap={10}>
              <Sparkles size={15} color={color.primary} />
              <T v="bodyStrong" style={{ flex: 1, fontSize: 13.5 }}>
                {s}
              </T>
            </Row>
          </Card>
        </Tap>
      ))}
    </View>
  );

  /** What the chat opens on, above the turns. The ideas stay up after one is picked. */
  const opening = () => {
    // hold it until the first ideas answer too (≤ 1.5 s), so the plain intro doesn't flash up before the ideas one
    if (!lookedUp || (ideas.phase === "loading" && !chatting)) return null;
    if (project)
      return (
        <View style={{ gap: 10 }}>
          <AgentBubble text={projectIntro(project)} />
          {chatting ? null : suggestionCards}
        </View>
      );
    if (ideas.phase === "ready")
      return (
        <View style={{ gap: 10 }}>
          <AgentBubble text={occasion ? ideasIntro(occasion, person) : ideas.text || "Here are a few directions to start from:"} />
          <IdeasCard card={ideas.card} onAction={send} />
        </View>
      );
    if (occasion)
      return (
        <View style={{ gap: 10 }}>
          <AgentBubble text={occasionIntro} />
          {chatting ? null : ideas.phase === "pending" ? <ThinkingOfIdeas /> : suggestionCards}
        </View>
      );
    return chatting ? null : (
      <View style={{ gap: 12 }}>
        <AgentBubble text="Tell me who it’s for or what you’re after. I’ll throw out a few ideas first, then find the best one once you pick." />
        <Hints />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* header */}
      <View style={{ paddingTop: insets.top + 10, paddingBottom: 10, paddingHorizontal: 18, backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <Row gap={12} style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}>
          <Pressable
            onPress={() => {
              haptic.tap();
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            hitSlop={8}
            accessibilityLabel="Back"
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={20} color={color.ink} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <T v="h2" numberOfLines={1}>
              {title}
            </T>
            <T v="caption">{subtitle}</T>
          </View>
        </Row>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        // follow the conversation as it grows; before the first message the opening (intro, ideas) reads from the top
        onContentSizeChange={() => {
          if (chatting) scroll.current?.scrollToEnd({ animated: true });
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, gap: 14 }}>
          {opening()}
          {turns.map((t) => (
            <TurnView key={t.key} turn={t} onAction={send} />
          ))}
        </View>
      </ScrollView>

      {/* composer */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.paper }}>
        <Row gap={10} style={{ width: "100%", maxWidth: 520, alignSelf: "center", alignItems: "flex-end" }}>
          {photosAvailable ? <AttachButton onPress={attach} disabled={pics.full} /> : null}
          <View style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: color.line, borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 12 : 8, minHeight: 48, justifyContent: "center" }}>
            {pics.notice ? <AttachNotice text={pics.notice} onDismiss={pics.dismissNotice} /> : null}
            {pics.photos.length ? <PhotoStrip photos={pics.photos} onRemove={pics.remove} onRetry={pics.retry} /> : null}
            {typedLink ? <LinkChip url={typedLink} /> : null}
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={project ? `What do you need for your ${project.name.toLowerCase()}?` : occasion ? `What's ${pronoun ?? "everyone"} into?` : "Ask Xerxes anything…"}
              placeholderTextColor={color.faint}
              multiline
              onKeyPress={(e) => {
                const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                  (e as unknown as { preventDefault: () => void }).preventDefault();
                  submit();
                }
              }}
              style={{ fontFamily: font.body, fontSize: 15, color: color.ink, maxHeight: 120, outlineStyle: "none" } as object}
            />
          </View>
          {input.trim() || pics.photos.length ? (
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={pics.uploading ? "Send (waiting for the photo to upload)" : "Send"}
              accessibilityState={{ disabled: !canSend }}
              style={{ opacity: canSend || sending ? 1 : 0.45 }}
            >
              <View style={{ paddingBottom: 4 }}>
                <View style={{ position: "absolute", top: 4, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: ledge.primary }} />
                <GradientSurface name="primary" style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                  <ArrowUp size={22} color="#fff" strokeWidth={2.6} />
                </GradientSurface>
              </View>
            </Pressable>
          ) : (
            // a call from here carries on this chat: same conversation, and it opens on what the chat is about
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/voice",
                  params: { conversationId: conversationId ?? undefined, projectId: params.projectId, occasionId: params.occasionId, topic: params.title ?? project?.name },
                })
              }
              accessibilityLabel="Talk to Xerxes"
            >
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <Mic size={20} color="#fff" />
              </View>
            </Pressable>
          )}
        </Row>
      </View>

      {/* on a phone: take the photo now, or pick from the library */}
      {cameraAvailable ? (
        <Sheet open={attaching} onClose={() => setAttaching(false)} title="Show Xerxes a photo" subtitle="A product, its box or its label. I’ll find it, or something like it.">
          <SheetBody gap={12}>
            <SheetActions>
              <SheetAction icon={Camera} label="Take photo" onPress={() => choose("camera")} />
              <SheetAction
                icon={Images}
                label="Choose from library"
                sub={MAX_PHOTOS - pics.photos.length > 1 ? `Up to ${MAX_PHOTOS - pics.photos.length}` : undefined}
                onPress={() => choose("library")}
              />
            </SheetActions>
          </SheetBody>
        </Sheet>
      ) : null}
    </KeyboardAvoidingView>
  );
}
