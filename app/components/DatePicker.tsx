import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { isoOf, monthTitle, todayIso } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { color, font, radius } from "@/lib/theme";
import { Row, T } from "./ui";

// Month-grid pieces shared by the Calendar tab and the in-app date picker (no native picker dependency).

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
export type Ym = { y: number; m: number };
export const ymOf = (iso: string): Ym => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 });
export const shiftYm = ({ y, m }: Ym, by: number): Ym => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 });
export const ymKey = ({ y, m }: Ym) => y * 12 + m;

/** Day numbers for a Monday-first month, padded with nulls to whole weeks. */
export function monthCells({ y, m }: Ym): (number | null)[] {
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function MonthArrow({ dir, enabled, onPress }: { dir: -1 | 1; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={!enabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? "Previous month" : "Next month"}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: color.chip, alignItems: "center", justifyContent: "center", opacity: enabled ? 1 : 0.35 }}>
        {dir < 0 ? <ChevronLeft size={18} color={color.ink} /> : <ChevronRight size={18} color={color.ink} />}
      </View>
    </Pressable>
  );
}

export function WeekdayHeader() {
  return (
    <View style={{ flexDirection: "row" }}>
      {WEEKDAYS.map((d, i) => (
        <T key={i} v="caption" style={{ width: `${100 / 7}%`, textAlign: "center", color: color.faint }}>
          {d}
        </T>
      ))}
    </View>
  );
}

/** Pick one day between `min` and `max` (YYYY-MM-DD). Selected = green, today = navy ring, out of range = faint. */
export function DatePicker({ value, onChange, min, max }: { value: string | null; onChange: (iso: string) => void; min: string; max: string }) {
  const [view, setView] = useState<Ym>(() => ymOf(value ?? min));
  const today = todayIso();
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, padding: 12 }}>
      <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <MonthArrow dir={-1} enabled={ymKey(view) > ymKey(ymOf(min))} onPress={() => setView(shiftYm(view, -1))} />
        <T v="h3">{monthTitle(view.y, view.m)}</T>
        <MonthArrow dir={1} enabled={ymKey(view) < ymKey(ymOf(max))} onPress={() => setView(shiftYm(view, 1))} />
      </Row>
      <WeekdayHeader />
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {monthCells(view).map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 42 }} />;
          const iso = isoOf(view.y, view.m, d);
          const off = iso < min || iso > max;
          const on = iso === value;
          return (
            <Pressable
              key={i}
              disabled={off}
              onPress={() => {
                haptic.tap();
                onChange(iso);
              }}
              style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              accessibilityLabel={iso}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? color.primary : "transparent",
                  borderWidth: iso === today && !on ? 1.5 : 0,
                  borderColor: color.navy,
                }}
              >
                <Text style={{ fontFamily: on || iso === today ? font.bold : font.medium, fontSize: 14, color: on ? "#fff" : off ? color.faint : color.ink, fontVariant: ["tabular-nums"] }}>
                  {d}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
