import {
  Camera,
  Check,
  ChevronRight,
  CookingPot,
  Dumbbell,
  FolderOpen,
  Gamepad2,
  Gift,
  House,
  Library,
  Plane,
  Plus,
  Server,
  Sofa,
  Sparkles,
  Sprout,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { manage, type EntryInput, type Money, type Project, type ProjectEntry, type ProjectIcon, type ProjectSummary } from "@/lib/api";
import { money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, radius, type GradientName } from "@/lib/theme";
import { ChoiceChip, Field, Input } from "./forms";
import { FormError, SheetBody, SheetFooter } from "./Sheet";
import { Button, Card, Chip, IconTile, ProgressBar, Row, T, Tap } from "./ui";

// Projects: a bucket of context per chain of purchases (a living room, a home lab). Shared by the Tracking tab
// and the project screen.

export const projectIcons: Record<ProjectIcon, { icon: LucideIcon; grad: GradientName; label: string }> = {
  home: { icon: House, grad: "navy", label: "Home" },
  sofa: { icon: Sofa, grad: "primary", label: "Room" },
  server: { icon: Server, grad: "navy", label: "Tech" },
  book: { icon: Library, grad: "info", label: "Books" },
  game: { icon: Gamepad2, grad: "navy", label: "Gaming" },
  gift: { icon: Gift, grad: "primary", label: "Gifts" },
  camera: { icon: Camera, grad: "info", label: "Photo" },
  plant: { icon: Sprout, grad: "primary", label: "Garden" },
  fitness: { icon: Dumbbell, grad: "navy", label: "Fitness" },
  travel: { icon: Plane, grad: "info", label: "Travel" },
  kitchen: { icon: CookingPot, grad: "primary", label: "Kitchen" },
  other: { icon: FolderOpen, grad: "navy", label: "Other" },
};
const ICON_ROWS: ProjectIcon[][] = [
  ["sofa", "home", "server", "book"],
  ["game", "gift", "camera", "plant"],
  ["fitness", "travel", "kitchen", "other"],
];
export const iconOf = (icon: string) => projectIcons[icon as ProjectIcon] ?? projectIcons.other;

/** "" → 0 (none), "1,500" → 1500, junk → NaN */
export const parseAmount = (s: string) => (s.trim() ? Number(s.replace(/[,\s₹$]/g, "")) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Spent against the budget: green while there's room, orange near the end, red past it. */
export function BudgetBar({ spent, budget, light }: { spent: Money; budget?: Money; light?: boolean }) {
  if (!budget) return null;
  const used = budget.amount ? spent.amount / budget.amount : 0;
  const left = budget.amount - spent.amount;
  const muted = light ? "rgba(255,255,255,0.72)" : color.muted;
  return (
    <View style={{ gap: 7 }}>
      <ProgressBar value={used} grad={used > 1 ? "danger" : used > 0.85 ? "warning" : "primary"} />
      <Row style={{ justifyContent: "space-between" }}>
        <T v="caption" style={{ color: light ? "#fff" : color.ink2 }}>
          {money(spent.amount, spent.currency)} spent
        </T>
        <T v="caption" style={{ color: left < 0 ? (light ? "#F3B3B3" : color.bad) : muted }}>
          {left >= 0 ? `${money(left, budget.currency)} left of ${money(budget.amount, budget.currency)}` : `${money(-left, budget.currency)} over budget`}
        </T>
      </Row>
    </View>
  );
}

/** A project in the Tracking tab: what it's for, the budget, what's in it and what's next. */
export function ProjectCard({ p, onPress }: { p: ProjectSummary; onPress: () => void }) {
  const meta = iconOf(p.icon);
  const done = p.status === "done";
  const chips = [
    p.counts.purchase ? plural(p.counts.purchase, "purchase") : null,
    p.counts.plan ? `${p.counts.plan} planned` : null,
    p.counts.setup ? plural(p.counts.setup, "note") : null,
    p.counts.search ? plural(p.counts.search, "search", "searches") : null,
  ].filter((x): x is string => !!x);
  return (
    <Tap onPress={onPress} accessibilityLabel={`Open ${p.name}`}>
      <Card pad={16} style={done ? { backgroundColor: color.paper } : undefined}>
        <Row gap={12} style={{ alignItems: "flex-start" }}>
          <View style={{ opacity: done ? 0.45 : 1 }}>
            <IconTile icon={meta.icon} grad={meta.grad} size={48} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Row gap={8}>
              <T v="h3" numberOfLines={1} style={{ flexShrink: 1, color: done ? color.muted : color.ink }}>
                {p.name}
              </T>
              {done ? <Chip label="Done" icon={Check} tone="ok" /> : null}
            </Row>
            {p.goal ? (
              <T v="sub" numberOfLines={2}>
                {p.goal}
              </T>
            ) : null}
          </View>
          <ChevronRight size={18} color={color.faint} style={{ marginTop: 4 }} />
        </Row>
        {p.budget && !done ? (
          <View style={{ marginTop: 14 }}>
            <BudgetBar spent={p.spent} budget={p.budget} />
          </View>
        ) : null}
        {chips.length || p.counts.watch ? (
          <Row gap={6} wrap style={{ marginTop: 12 }}>
            {chips.map((c) => (
              <Chip key={c} label={c} />
            ))}
            {p.counts.watch ? <Chip label={`Tracking ${p.counts.watch}`} tone="info" /> : null}
          </Row>
        ) : null}
        {p.nextPlan && !done ? (
          <Row gap={10} style={{ marginTop: 12, backgroundColor: color.okBg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Sparkles size={15} color={color.ok} />
            <T v="bodyStrong" numberOfLines={2} style={{ flex: 1, fontSize: 13.5, color: color.ok }}>
              Next: {p.nextPlan}
            </T>
          </Row>
        ) : null}
      </Card>
    </Tap>
  );
}

/** New project, or edit one: name, icon, goal and an optional budget. */
export function ProjectForm({ project, onSaved }: { project?: Project; onSaved: (p: Project) => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [icon, setIcon] = useState<ProjectIcon>(project?.icon ?? "sofa");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const [budget, setBudget] = useState(project?.budget ? String(project.budget.amount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = project?.budget?.currency ?? "INR";

  const submit = () => {
    const n = name.trim();
    const amount = parseAmount(budget);
    if (!n) return setError("Give your project a name.");
    if (Number.isNaN(amount) || amount < 0) return setError("Enter the budget as a number, like 60,000.");
    setBusy(true);
    setError(null);
    const save = project
      ? manage.updateProject(project.id, { name: n, icon, goal: goal.trim() || null, budget: amount ? { amount, currency: cur } : null })
      : manage.addProject({ name: n, icon, goal: goal.trim() || undefined, budget: amount ? { amount, currency: cur } : undefined });
    save
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
      <SheetBody>
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="e.g. Living room, Home lab, Balcony garden" maxLength={60} autoFocus={!project} accessibilityLabel="Project name" />
        </Field>
        <Field label="Looks like">
          <View style={{ gap: 8 }}>
            {ICON_ROWS.map((row) => (
              <Row key={row.join()} gap={8}>
                {row.map((id) => (
                  <ChoiceChip key={id} tile label={projectIcons[id].label} icon={projectIcons[id].icon} selected={icon === id} onPress={() => setIcon(id)} />
                ))}
              </Row>
            ))}
          </View>
        </Field>
        <Field label="What are you going for?" hint="One line. I keep it in mind for every purchase in this project.">
          <Input value={goal} onChangeText={setGoal} placeholder="e.g. A cosy reading corner and storage for my books" maxLength={240} multiline accessibilityLabel="Project goal" />
        </Field>
        <Field label="Budget (₹)" hint="Optional. I keep track of what's spent and what's left.">
          <Input value={budget} onChangeText={setBudget} prefix="₹" keyboardType="decimal-pad" placeholder="60,000" onSubmitEditing={submit} accessibilityLabel="Project budget" />
        </Field>
        {error ? <FormError text={error} /> : null}
      </SheetBody>
      <SheetFooter>
        <Button kind="grad" icon={project ? Check : Plus} label={project ? "Save changes" : "Start project"} loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}

type EntryKind = EntryInput["kind"];
const ENTRY_COPY: Record<EntryKind, { label: string; placeholder: string; save: string }> = {
  setup: { label: "How are things now?", placeholder: "e.g. 14 × 12 ft, one north-facing window", save: "Add note" },
  plan: { label: "What do you want to get?", placeholder: "e.g. A reading chair and a floor lamp", save: "Add to plan" },
  purchase: { label: "What did you buy?", placeholder: "e.g. Jute rug, 5 × 7 ft", save: "Add purchase" },
};

/**
 * Add or edit a setup note, a plan or a purchase. `fromPlan`: a planned item was bought, so it's saved as a
 * purchase and the plan comes off the list.
 */
export function EntryForm({
  projectId,
  kind,
  entry,
  fromPlan,
  currency = "INR",
  onSaved,
}: {
  projectId: string;
  kind: EntryKind;
  entry?: ProjectEntry;
  fromPlan?: ProjectEntry;
  currency?: string;
  onSaved: (p: Project) => void;
}) {
  // a plan Xerxes already found a pick for comes with its price
  const known = entry?.price ?? fromPlan?.price;
  const [text, setText] = useState(entry?.text ?? fromPlan?.text ?? "");
  const [price, setPrice] = useState(known ? String(known.amount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = ENTRY_COPY[kind];
  const cur = known?.currency ?? currency;
  const withPrice = kind === "purchase";

  const submit = () => {
    const t = text.trim();
    const amount = parseAmount(price);
    if (!t) return setError(kind === "purchase" ? "Say what you bought." : "Write a few words first.");
    if (withPrice && (Number.isNaN(amount) || amount < 0)) return setError("Enter the price as a number, like 3,200.");
    setBusy(true);
    setError(null);
    const priced = withPrice && amount ? { amount, currency: cur } : undefined;
    const save = entry
      ? manage.updateEntry(projectId, entry.id, { text: t, ...(withPrice ? { price: priced ?? null } : {}) })
      : manage.addEntry(projectId, { kind, text: t, price: priced, planId: fromPlan?.id });
    save
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
      <SheetBody>
        <Field label={copy.label}>
          <Input value={text} onChangeText={setText} placeholder={copy.placeholder} maxLength={200} multiline autoFocus={!fromPlan} accessibilityLabel={copy.label} />
        </Field>
        {withPrice ? (
          <Field label={`Price (${cur === "INR" ? "₹" : cur})`} hint="Counts toward the project's budget.">
            <Input value={price} onChangeText={setPrice} prefix={cur === "INR" ? "₹" : cur === "USD" ? "$" : `${cur} `} keyboardType="decimal-pad" placeholder="3,200" autoFocus={!!fromPlan} onSubmitEditing={submit} accessibilityLabel="Price" />
          </Field>
        ) : null}
        {error ? <FormError text={error} /> : null}
      </SheetBody>
      <SheetFooter>
        <Button kind="grad" icon={entry ? Check : Plus} label={entry ? "Save" : fromPlan ? "Mark as bought" : copy.save} loading={busy} onPress={submit} />
      </SheetFooter>
    </>
  );
}
