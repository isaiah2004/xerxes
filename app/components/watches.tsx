import { BookOpen, Cpu, Gamepad2, Gift, MoreHorizontal, Pause, Plus, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { manage, type ProjectSummary, type Watch, type WatchKind } from "@/lib/api";
import { money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, type GradientName } from "@/lib/theme";
import { ChoiceChip, Field, Input } from "./forms";
import { iconOf, parseAmount } from "./projects";
import { FormError, IconButton, SheetBody, SheetFooter } from "./Sheet";
import { Button, Card, Chip, IconTile, Row, T, Tap } from "./ui";

// Tracked items: what Xerxes hunts prices for around the clock (game sales, homelab gear, books, price drops).
// Games and homelab listings are priced in US$ by their sources, so their targets are in dollars.
type KindMeta = { icon: LucideIcon; grad: GradientName; label: string; short: string; example: string; currency: "USD" | "INR" };
export const kinds: Record<WatchKind, KindMeta> = {
  game: { icon: Gamepad2, grad: "navy", label: "Game sale", short: "Game", example: "e.g. Hades II", currency: "USD" },
  hardware: { icon: Cpu, grad: "primary", label: "Homelab gear", short: "Hardware", example: "e.g. Optiplex micro OR ThinkCentre tiny", currency: "USD" },
  book: { icon: BookOpen, grad: "info", label: "Book", short: "Book", example: "e.g. The Wild Robot, hardcover", currency: "INR" },
  product: { icon: Gift, grad: "navy", label: "Price drop", short: "Product", example: "e.g. Sony WH-1000XM5", currency: "INR" },
};
const ORDER: WatchKind[] = ["game", "hardware", "book", "product"];
export const kindOf = (k: string) => kinds[k as WatchKind] ?? kinds.product;
export const symbol = (cur: string) => (cur === "USD" ? "$" : cur === "INR" ? "₹" : `${cur} `);
export const pretty = (q: string) => q.replace(/\s+OR\s+/gi, " · ");

const ago = (iso?: string) => {
  if (!iso) return "first check soon";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "checked just now" : m < 60 ? `checked ${m} min ago` : `checked ${Math.round(m / 60)} h ago`;
};

/** A tracked item. Tap anywhere (or the trailing ⋯) to manage it. `project`: the project it's tracked for. */
export function WatchCard({ w, project, onManage }: { w: Watch; project?: { name: string; icon: string }; onManage: () => void }) {
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
            <Row gap={8} wrap>
              {paused ? <Chip label="Paused" icon={Pause} tone="neutral" /> : null}
              {w.maxPrice ? <Chip label={`Under ${money(w.maxPrice.amount, w.maxPrice.currency)}`} tone={paused ? "neutral" : "info"} /> : null}
              {project ? <Chip label={project.name} icon={iconOf(project.icon).icon} /> : null}
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

/**
 * Start tracking something. `projects`: offer to file it under one of them. `projectId`: it's being added from
 * that project's screen, so it goes there without asking.
 */
export function WatchForm({ onSaved, projects = [], projectId }: { onSaved: () => void; projects?: ProjectSummary[]; projectId?: string }) {
  const [kind, setKind] = useState<WatchKind>(projectId ? "product" : "game");
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState("");
  const [project, setProject] = useState<string | undefined>(projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = kinds[kind];
  const choices = projectId ? [] : projects.filter((p) => p.status === "active");

  const submit = () => {
    const q = query.trim();
    const amount = parseAmount(price);
    if (!q) return setError("Tell me what to track.");
    if (Number.isNaN(amount) || amount < 0) return setError("Enter the target as a number, like 20.");
    setBusy(true);
    setError(null);
    manage
      .addWatch({ kind, query: q, maxPrice: amount ? { amount, currency: k.currency } : undefined, projectId: project })
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
        {choices.length ? (
          <Field label="For a project?" hint="It shows up in the project, and I keep the project in mind when a deal lands.">
            <Row gap={8} wrap>
              <ChoiceChip label="No project" selected={!project} onPress={() => setProject(undefined)} />
              {choices.map((p) => (
                <ChoiceChip key={p.id} label={p.name} icon={iconOf(p.icon).icon} selected={project === p.id} onPress={() => setProject(p.id)} />
              ))}
            </Row>
          </Field>
        ) : null}
        {error ? <FormError text={error} /> : null}
      </SheetBody>
      <SheetFooter>
        <Button kind="grad" icon={Plus} label="Start tracking" loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}

export function PriceForm({ w, onSaved }: { w: Watch; onSaved: () => void }) {
  const cur = w.maxPrice?.currency ?? kindOf(w.kind).currency;
  const [value, setValue] = useState(w.maxPrice ? String(w.maxPrice.amount) : "");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (clear: boolean) => {
    const amount = parseAmount(value);
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
