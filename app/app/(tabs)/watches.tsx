import { router } from "expo-router";
import { BookOpen, Cpu, Gamepad2, Gift, MoreHorizontal, Pause, Pencil, Play, Plus, Sparkles, Trash2, X, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ChoiceChip, Field, Input } from "@/components/forms";
import { Screen } from "@/components/Screen";
import { ConfirmPanel, FormError, IconButton, Sheet, SheetAction, SheetActions, SheetBody, SheetFooter } from "@/components/Sheet";
import { SpeakButton } from "@/components/Speak";
import { findVoice, TalkButton } from "@/components/TalkButton";
import { Button, Card, Chip, IconTile, Row, SectionHeader, T, Tap } from "@/components/ui";
import { api, manage, type Feed, type Watch, type WatchKind } from "@/lib/api";
import { money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { openLink } from "@/lib/links";
import { color, type GradientName } from "@/lib/theme";

// Radar = the things Xerxes is quietly hunting for you (game sales, homelab gear, books, price drops).
// Games and homelab listings are priced in US$ by their sources, so their targets are in dollars.
type KindMeta = { icon: LucideIcon; grad: GradientName; label: string; short: string; example: string; currency: "USD" | "INR" };
const kinds: Record<WatchKind, KindMeta> = {
  game: { icon: Gamepad2, grad: "navy", label: "Game sale", short: "Game", example: "e.g. Hades II", currency: "USD" },
  hardware: { icon: Cpu, grad: "primary", label: "Homelab gear", short: "Hardware", example: "e.g. Optiplex micro OR ThinkCentre tiny", currency: "USD" },
  book: { icon: BookOpen, grad: "info", label: "Book", short: "Book", example: "e.g. The Wild Robot, hardcover", currency: "INR" },
  product: { icon: Gift, grad: "navy", label: "Price drop", short: "Product", example: "e.g. Sony WH-1000XM5", currency: "INR" },
};
const ORDER: WatchKind[] = ["game", "hardware", "book", "product"];
const kindOf = (k: string) => kinds[k as WatchKind] ?? kinds.product;
const symbol = (cur: string) => (cur === "USD" ? "$" : cur === "INR" ? "₹" : `${cur} `);
const pretty = (q: string) => q.replace(/\s+OR\s+/gi, " · ");
/** "" → 0 (no target), "1,500" → 1500, junk → NaN */
const parsePrice = (s: string) => (s.trim() ? Number(s.replace(/[,\s₹$]/g, "")) : 0);

const ago = (iso?: string) => {
  if (!iso) return "first check soon";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "checked just now" : m < 60 ? `checked ${m} min ago` : `checked ${Math.round(m / 60)} h ago`;
};

type Mode = "add" | "menu" | "price" | "delete";

export default function Radar() {
  const [feed, setFeed] = useState<Feed | null>(null);
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

  // one sheet for the whole screen; its content switches between the add form, the menu, the price form and the confirm
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

  const dismiss = (id: string) => {
    setFeed((f) => f && { ...f, notifications: f.notifications.filter((n) => n.id !== id) });
    manage.dismissFind(id).catch(load);
  };

  const finds = feed?.notifications.filter((n) => n.kind !== "occasion") ?? [];
  const watches = feed?.watches ?? [];
  const tracked = [...watches.filter((w) => w.active), ...watches.filter((w) => !w.active)];
  const paused = watches.length - watches.filter((w) => w.active).length;

  const w = sheet.w;
  const head =
    sheet.mode === "add" || !w
      ? { title: "Track something", subtitle: "I check prices around the clock and only ping you when it’s worth it." }
      : sheet.mode === "menu"
        ? {
            title: pretty(w.query),
            subtitle: `${kindOf(w.kind).label} · ${w.maxPrice ? `under ${money(w.maxPrice.amount, w.maxPrice.currency)}` : "any good deal"}${w.active ? "" : " · paused"}`,
          }
        : sheet.mode === "price"
          ? { title: "Target price", subtitle: `I’ll ping you when ${pretty(w.query)} drops below this.` }
          : { title: `Stop tracking ${pretty(w.query)}?` };

  return (
    <>
      <Screen onRefresh={load}>
        <View style={{ paddingHorizontal: 4 }}>
          <T v="sub">Always on</T>
          <T v="display">Radar</T>
          <T v="body" style={{ marginTop: 6, color: color.muted }}>
            What I’m hunting for you around the clock. I only ping you when a price is genuinely worth it.
          </T>
        </View>

        <SectionHeader
          title={watches.length ? `Tracking ${watches.length - paused}${paused ? ` · ${paused} paused` : ""}` : "Tracking"}
          action="Add"
          onAction={() => openSheet("add")}
        />
        <View style={{ gap: 10 }}>
          {tracked.map((x) => (
            <WatchCard key={x.id} w={x} onManage={() => openSheet("menu", x)} />
          ))}
          {feed && !watches.length ? (
            <Card>
              <T v="sub">Nothing on the radar yet. Tell me what you want and the price you’d happily pay.</T>
            </Card>
          ) : null}
        </View>
        <Row gap={10} style={{ marginTop: 12 }}>
          <Button kind="grad" icon={Plus} label="Add to radar" style={{ flex: 1 }} onPress={() => openSheet("add")} />
          <Button
            kind="ghost"
            icon={Sparkles}
            label="Ask Xerxes"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: "new", title: "Track something", prompt: "Keep an eye on " } })}
          />
        </Row>

        <SectionHeader title="Fresh finds" />
        <View style={{ gap: 10 }}>
          {finds.map((n) => {
            const k = kindOf(n.kind);
            return (
              <Tap key={n.id} onPress={() => openLink(n.url)} accessibilityLabel={n.title}>
                <Card>
                  <Row gap={12} style={{ alignItems: "flex-start" }}>
                    <IconTile icon={k.icon} grad={k.grad} size={44} />
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
        </View>
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} title={head.title} subtitle={head.subtitle}>
        {sheet.mode === "add" || !w ? (
          <WatchForm key={sheet.n} onSaved={finish} />
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
              <SheetAction icon={Trash2} label="Delete" sub="Take it off the radar" danger onPress={() => setMode("delete")} />
            </SheetActions>
          </SheetBody>
        ) : sheet.mode === "price" ? (
          <PriceForm key={sheet.n} w={w} onSaved={finish} />
        ) : (
          <ConfirmPanel
            key={sheet.n}
            message="It comes off your radar and I stop checking prices for it. Deals I already found stay in Fresh finds."
            onConfirm={() => manage.deleteWatch(w.id).then(finish)}
            onCancel={() => setMode("menu")}
          />
        )}
      </Sheet>
    </>
  );
}

/** A tracked item. Tap anywhere (or the trailing ⋯) to pause, edit the target or delete it. */
function WatchCard({ w, onManage }: { w: Watch; onManage: () => void }) {
  const k = kindOf(w.kind);
  const paused = !w.active;
  return (
    <Tap onPress={onManage} accessibilityLabel={`Manage ${pretty(w.query)}`}>
      <Card style={paused ? { backgroundColor: color.paper } : undefined}>
        <Row gap={12}>
          <View style={{ opacity: paused ? 0.4 : 1 }}>
            <IconTile icon={k.icon} grad={k.grad} size={46} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <T v="h3" numberOfLines={2} style={paused ? { color: color.muted } : undefined}>
              {pretty(w.query)}
            </T>
            <Row gap={8}>
              {paused ? <Chip label="Paused" icon={Pause} tone="neutral" /> : null}
              {w.maxPrice ? <Chip label={`Under ${money(w.maxPrice.amount, w.maxPrice.currency)}`} tone={paused ? "neutral" : "info"} /> : null}
              {paused ? null : (
                <T v="sub" numberOfLines={1} style={{ flexShrink: 1, color: w.lastError ? color.warn : color.muted }}>
                  {w.lastError ?? ago(w.lastCheckedAt)}
                </T>
              )}
            </Row>
          </View>
          <IconButton icon={MoreHorizontal} label={`More for ${pretty(w.query)}`} />
        </Row>
      </Card>
    </Tap>
  );
}

function WatchForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<WatchKind>("game");
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = kinds[kind];

  const submit = () => {
    const q = query.trim();
    const amount = parsePrice(price);
    if (!q) return setError("Tell me what to track.");
    if (Number.isNaN(amount) || amount < 0) return setError("Enter the target as a number, like 20.");
    setBusy(true);
    setError(null);
    manage
      .addWatch({ kind, query: q, maxPrice: amount ? { amount, currency: k.currency } : undefined })
      .then(() => {
        haptic.success();
        onSaved();
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
        setBusy(false);
      });
  };

  return (
    <>
      <SheetBody>
        <Field label="What kind">
          <Row gap={8}>
            {ORDER.map((id) => (
              <ChoiceChip key={id} tile label={kinds[id].short} icon={kinds[id].icon} selected={kind === id} onPress={() => setKind(id)} />
            ))}
          </Row>
        </Field>
        <Field label="What should I track?" hint={kind === "hardware" ? "Put OR between models to watch several at once." : undefined}>
          <Input value={query} onChangeText={setQuery} placeholder={k.example} accessibilityLabel="What to track" />
        </Field>
        <Field label={`Target price (${k.currency === "USD" ? "US$" : "₹"})`} hint="I’ll ping you when it drops below this. Leave it empty to hear about any good deal.">
          <Input value={price} onChangeText={setPrice} prefix={symbol(k.currency)} keyboardType="decimal-pad" placeholder={k.currency === "USD" ? "20" : "1,500"} onSubmitEditing={submit} accessibilityLabel="Target price" />
        </Field>
        {error ? <FormError text={error} /> : null}
      </SheetBody>
      <SheetFooter>
        <Button kind="grad" icon={Plus} label="Start tracking" loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}

function PriceForm({ w, onSaved }: { w: Watch; onSaved: () => void }) {
  const cur = w.maxPrice?.currency ?? kindOf(w.kind).currency;
  const [value, setValue] = useState(w.maxPrice ? String(w.maxPrice.amount) : "");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (clear: boolean) => {
    const amount = parsePrice(value);
    if (!clear && !(amount > 0)) return setError(`Enter a price above 0, like ${cur === "USD" ? "20" : "1,500"}.`);
    setBusy(clear ? "clear" : "save");
    setError(null);
    manage
      .updateWatch(w.id, { maxPrice: clear ? null : { amount, currency: cur } })
      .then(() => {
        haptic.success();
        onSaved();
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
        setBusy(null);
      });
  };

  return (
    <>
      <SheetBody>
        <Field label={`Target price (${cur === "USD" ? "US$" : cur === "INR" ? "₹" : cur})`}>
          <Input value={value} onChangeText={setValue} prefix={symbol(cur)} keyboardType="decimal-pad" placeholder={cur === "USD" ? "20" : "1,500"} autoFocus onSubmitEditing={() => save(false)} accessibilityLabel="Target price" />
        </Field>
        {error ? <FormError text={error} /> : null}
      </SheetBody>
      <SheetFooter>
        <Button kind="grad" label="Save target" loading={busy === "save"} disabled={busy === "clear"} onPress={() => save(false)} />
        {w.maxPrice ? <Button kind="ghost" label="No target: tell me about any good deal" loading={busy === "clear"} disabled={busy === "save"} onPress={() => save(true)} /> : null}
      </SheetFooter>
    </>
  );
}
