import { AlertTriangle, Cake, Check, Gift, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { Verdict } from "@/lib/api";
import { addDaysIso, dayDate, dayNum, daysBetween, monthShort, weekdayDay, weekdayShort } from "@/lib/format";
import { color, type GradientName } from "@/lib/theme";
import { Card, Chip, GradientSurface, Row, T, type Tone } from "./ui";

// The delivery timeline on a recommendation. Dates are points (order, ships, arrives, the occasion); the time between
// them is drawn to scale and says how long it is. So "8 days spare" reads as a stretch of eight days between the
// arrival and the birthday, not as one more date. The safe-by date (a cushion before the occasion, in case delivery
// slips) is said in words underneath.

type Kind = "order" | "ships" | "arrives" | "end";
type Stop = { date: string; labels: string[]; kinds: Kind[] };
type Leg = { days: number; kind: "prep" | "transit" | "spare" | "late" | "open" };

const INSET = 34; // about half a stop's label box, so the first and last labels stay inside the card
const LABEL_W = 72;
const MIN_LEG = 66; // neighbouring stops' labels ("2 Dec", "4 Dec") never touch
const TRACK_Y = 24; // the line's top; the leg lengths are written above it, the dates below
const DATES_Y = 44;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Leg widths in proportion to their days, each at least MIN_LEG (a 1-day leg still has room for its labels). */
function legWidths(days: number[], total: number) {
  if (total < days.length * MIN_LEG) return days.map(() => total / days.length);
  const fixed = new Set<number>();
  for (;;) {
    const free = total - fixed.size * MIN_LEG;
    const sum = days.reduce((s, d, i) => (fixed.has(i) ? s : s + d), 0);
    const out = days.map((d, i) => (fixed.has(i) ? MIN_LEG : (free * d) / sum));
    const short = out.map((x, i) => !fixed.has(i) && x < MIN_LEG);
    if (!short.includes(true)) return out;
    short.forEach((s, i) => s && fixed.add(i));
  }
}

export function DeliveryTimeline({
  today,
  ships = addDaysIso(today, 1),
  arrives,
  arriveBy,
  occasion,
  verdict,
  estimated,
}: {
  today: string;
  ships?: string;
  arrives?: string;
  /** the safe-by date: the occasion less a cushion of a few days */
  arriveBy?: string;
  occasion?: { date: string; label?: string };
  verdict?: Verdict;
  estimated?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const end = occasion?.date ?? arriveBy;
  const endLabel = !occasion
    ? "Needed by"
    : /birthday/i.test(occasion.label ?? "")
      ? "Birthday"
      : /anniversary/i.test(occasion.label ?? "")
        ? "Anniversary"
        : "Occasion";

  // stops on the same day share a point ("Arrives · Birthday")
  const byDate = new Map<string, Stop>();
  const add = (kind: Kind, date: string | undefined, label: string) => {
    if (!date) return;
    const s = byDate.get(date) ?? { date, labels: [], kinds: [] };
    s.labels.push(label);
    s.kinds.push(kind);
    byDate.set(date, s);
  };
  add("order", today, "Order");
  add("ships", ships, "Ships");
  add("arrives", arrives, "Arrives");
  add("end", end, endLabel);
  const stops = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (stops.length < 2 || (!arrives && !end)) return null;

  // how it lands against the occasion
  const early = arrives && end ? daysBetween(arrives, end) : undefined;
  const status: "safe" | "tight" | "late" | undefined =
    early === undefined
      ? verdict === "late" || verdict === "late_and_over_budget"
        ? "late"
        : verdict === "tight"
          ? "tight"
          : verdict === "safe"
            ? "safe"
            : undefined
      : early < 0
        ? "late"
        : early === 0 || (arriveBy !== undefined && arrives! > arriveBy) || verdict === "tight"
          ? "tight"
          : "safe";
  // on its way: green, or orange when it cuts it close or misses (the days past the occasion are the red part)
  const transitGrad: GradientName = status === "late" || status === "tight" ? "warning" : "primary";
  const arrivalColor = status === "late" ? color.danger : status === "tight" ? color.warning : color.primary;
  const chip: { label: string; tone: Tone; icon: LucideIcon } | undefined =
    early === undefined
      ? undefined
      : early < 0
        ? { label: `${plural(-early, "day")} late`, tone: "bad", icon: AlertTriangle }
        : early === 0
          ? { label: "Arrives on the day", tone: "warn", icon: AlertTriangle }
          : status === "tight"
            ? { label: `Only ${plural(early, "day")} spare`, tone: "warn", icon: AlertTriangle }
            : { label: `${plural(early, "day")} to spare`, tone: "ok", icon: Check };

  // what each leg is: before shipping, on its way, waiting with days to spare, or past the occasion
  const legs: Leg[] = stops.slice(1).map((to, i) => {
    const from = stops[i];
    const days = daysBetween(from.date, to.date);
    const kind: Leg["kind"] =
      end && from.date >= end && arrives && to.date <= arrives
        ? "late"
        : to.date <= ships
          ? "prep"
          : arrives && to.date <= arrives
            ? "transit"
            : arrives && from.date >= arrives
              ? "spare"
              : "open";
    return { days, kind };
  });
  const widths = legWidths(
    legs.map((l) => l.days),
    Math.max(0, width - INSET * 2),
  );
  const xs = widths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [INSET]);

  const month = monthShort(today);
  const cushion = occasion && arriveBy && arriveBy < occasion.date ? daysBetween(arriveBy, occasion.date) : 0;
  const note = [
    cushion
      ? `Aim to have it by ${monthShort(arriveBy!) === month ? weekdayDay(arriveBy!) : dayDate(arriveBy!)}, ${plural(cushion, "day")} before the ${endLabel.toLowerCase()}, in case delivery slips.`
      : "",
    estimated ? "Delivery dates are estimates." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const twoLines = stops.some((s) => s.labels.join(" · ").length > 13); // "Arrives · Birthday" wraps, "Order · Ships" fits
  const EndIcon = endLabel === "Birthday" ? Cake : Gift;

  return (
    <Card pad={16}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 6 }}>
        <T v="h3">Delivery timeline</T>
        {chip ? <Chip label={chip.label} tone={chip.tone} icon={chip.icon} /> : null}
      </Row>
      <View style={{ height: DATES_Y + 48 + (twoLines ? 13 : 0), marginTop: 12 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0
          ? legs.map((l, i) => {
              const w = widths[i];
              const base = plural(l.days, "day");
              const long = l.kind === "spare" ? `${base} spare` : l.kind === "late" ? `${base} late` : base;
              const text = long.length * 6 <= w - 8 ? long : base;
              const ink = l.kind === "spare" ? color.infoInk : l.kind === "late" ? color.bad : color.muted;
              const bar = { position: "absolute", top: TRACK_Y, left: 0, right: 0, height: 6, borderRadius: 3 } as const;
              return (
                <View key={i} style={{ position: "absolute", left: xs[i], width: w, top: 0, height: TRACK_Y + 6 }}>
                  <T v="caption" numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 13, textAlign: "center", color: ink }}>
                    {text}
                  </T>
                  {l.kind === "spare" ? (
                    // waiting time: a dashed line, so it doesn't read as one more step of the delivery
                    <View style={{ ...bar, top: TRACK_Y + 1, height: 4, left: 9, right: 9, flexDirection: "row", justifyContent: "space-between" }}>
                      {Array.from({ length: Math.max(2, Math.floor((w - 14) / 10)) }, (_, k) => (
                        <View key={k} style={{ width: 6, height: 4, borderRadius: 2, backgroundColor: color.info }} />
                      ))}
                    </View>
                  ) : l.kind === "open" ? (
                    <View style={{ ...bar, backgroundColor: color.track }} />
                  ) : (
                    <GradientSurface name={l.kind === "late" ? "danger" : l.kind === "transit" ? transitGrad : "primary"} grain={0.3} style={bar} />
                  )}
                </View>
              );
            })
          : null}
        {width > 0
          ? stops.map((s, i) => {
              const x = xs[i];
              const isEnd = s.kinds.includes("end");
              const isArrival = s.kinds.includes("arrives");
              const mid = TRACK_Y + 3;
              return (
                <View key={s.date} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
                  {isEnd ? (
                    <GradientSurface
                      name="navy"
                      glow={0.3}
                      grain={0.3}
                      style={{ position: "absolute", left: x - 12, top: mid - 12, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}
                    >
                      <EndIcon size={11} color="#fff" strokeWidth={2.6} />
                    </GradientSurface>
                  ) : (
                    <View
                      style={{
                        position: "absolute",
                        left: x - (isArrival ? 8 : 6),
                        top: mid - (isArrival ? 8 : 6),
                        width: isArrival ? 16 : 12,
                        height: isArrival ? 16 : 12,
                        borderRadius: 8,
                        borderWidth: isArrival ? 3 : 2.5,
                        borderColor: isArrival ? "#fff" : color.primary,
                        backgroundColor: isArrival ? arrivalColor : s.kinds.includes("order") ? color.primary : "#fff",
                        shadowColor: color.navy,
                        shadowOpacity: isArrival ? 0.25 : 0,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                      }}
                    />
                  )}
                  <View style={{ position: "absolute", left: x - LABEL_W / 2, width: LABEL_W, top: DATES_Y, alignItems: "center" }}>
                    <T v="eyebrow" style={{ fontSize: 9.5, lineHeight: 12, letterSpacing: 0.6 }} numberOfLines={1}>
                      {s.date === today ? "Today" : weekdayShort(s.date)}
                    </T>
                    <T v="num" style={{ fontSize: 16, lineHeight: 20 }} numberOfLines={1}>
                      {monthShort(s.date) === month ? dayNum(s.date) : `${dayNum(s.date)} ${monthShort(s.date)}`}
                    </T>
                    <T
                      v="caption"
                      style={{ fontSize: 10.5, lineHeight: 13, textAlign: "center", color: isEnd || isArrival ? color.ink : color.muted }}
                      numberOfLines={2}
                    >
                      {s.labels.join(" · ")}
                    </T>
                  </View>
                </View>
              );
            })
          : null}
      </View>
      {note ? (
        <T v="caption" style={{ marginTop: 8 }}>
          {note}
        </T>
      ) : null}
    </Card>
  );
}
