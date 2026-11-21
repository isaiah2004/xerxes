import { router } from "expo-router";
import { ChevronRight, MoreHorizontal } from "lucide-react-native";
import { View } from "react-native";
import type { Upcoming } from "@/lib/api";
import { dayDate, dayNum, money, monthShort, weekdayShort } from "@/lib/format";
import { color, font, radius } from "@/lib/theme";
import { IconButton } from "./Sheet";
import { Card, Chip, Row, T, Tap, type Tone } from "./ui";

/** Orange once it's inside the reminder window (time to buy), red when it's 3 days or less. */
export const urgencyOf = (o: Upcoming): Extract<Tone, "bad" | "warn" | "neutral"> =>
  o.daysLeft <= 3 ? "bad" : o.daysLeft <= 7 || o.inReminderWindow ? "warn" : "neutral";

export const kindLabel = (o: Pick<Upcoming, "kind">) =>
  o.kind === "birthday" ? "Birthday" : o.kind === "anniversary" ? "Anniversary" : o.kind === "festival" ? "Festival" : "Occasion";

/** "Turns 57 · ₹3,000" / "Festival · ₹6,000" */
export const occasionSub = (o: Upcoming) =>
  `${o.kind === "birthday" && o.turningAge ? `Turns ${o.turningAge}` : kindLabel(o)} · ${money(o.budget.amount, o.budget.currency)}`;

export const daysLabel = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${n} days`);

export function openOccasion(o: Upcoming) {
  const person = o.people.length === 1 ? o.people[0] : undefined;
  router.push({
    pathname: "/chat/[id]",
    params: { id: "new", occasionId: o.id, title: person ? `Gift for ${person.name.toLowerCase()}` : `${o.label} gifts` },
  });
}

const tones = {
  neutral: { bg: color.chip, month: color.muted, day: color.ink },
  warn: { bg: color.warnBg, month: color.warn, day: color.warn },
  bad: { bg: color.badBg, month: color.bad, day: color.bad },
} as const;

/** Little calendar leaf: month (or weekday) over the day number. */
export function DateBlock({ iso, tone = "neutral", top = "month", size = 48 }: { iso: string; tone?: keyof typeof tones; top?: "month" | "weekday"; size?: number }) {
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size + 4, borderRadius: 14, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
      <T v="eyebrow" style={{ fontSize: 10, lineHeight: 12, letterSpacing: 0.8, color: t.month }}>
        {top === "month" ? monthShort(iso) : weekdayShort(iso)}
      </T>
      <T v="num" style={{ fontSize: 19, lineHeight: 23, color: t.day }}>
        {dayNum(iso)}
      </T>
    </View>
  );
}

const leafTones = {
  neutral: { band: color.navy, body: color.chip, day: color.ink, week: color.muted },
  warn: { band: color.warn, body: color.warnBg, day: color.warn, week: color.warn },
  bad: { band: color.bad, body: color.badBg, day: color.bad, week: color.bad },
} as const;

/** Calendar page (62×70): coloured band with the month, a big day number, the weekday underneath. */
export function DateLeaf({ iso, tone = "neutral" }: { iso: string; tone?: keyof typeof leafTones }) {
  const t = leafTones[tone];
  return (
    <View style={{ width: 62, height: 70, borderRadius: radius.md, overflow: "hidden", backgroundColor: t.body }}>
      <View style={{ height: 20, backgroundColor: t.band, alignItems: "center", justifyContent: "center" }}>
        <T v="eyebrow" style={{ fontFamily: font.bold, fontSize: 10, lineHeight: 12, letterSpacing: 1.3, color: "#FFFFFF" }}>
          {monthShort(iso)}
        </T>
      </View>
      {/* a touch of bottom padding lifts the number + weekday to the optical centre of the page */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 2 }}>
        <T v="num" style={{ fontSize: 27, lineHeight: 30, letterSpacing: -0.6, color: t.day }}>
          {dayNum(iso)}
        </T>
        <T v="eyebrow" style={{ fontSize: 9.5, lineHeight: 11, letterSpacing: 0.9, color: t.week }}>
          {weekdayShort(iso)}
        </T>
      </View>
    </View>
  );
}

const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** Horizontal "coming up" card on Today: date leaf on the left; countdown, title and subtitle stacked beside it. */
export function OccasionCard({ o }: { o: Upcoming }) {
  const tone = urgencyOf(o);
  return (
    <Tap onPress={() => openOccasion(o)} style={{ width: 244 }} accessibilityLabel={`${o.label}, ${dayDate(o.nextDate)}, ${inDays(o.daysLeft)}`}>
      {/* the row stretches every card to the tallest one, so centre the content rather than pinning it to the edges */}
      <Card pad={14} style={{ flexGrow: 1, justifyContent: "center" }}>
        <Row gap={12}>
          <DateLeaf iso={o.nextDate} tone={tone} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Chip label={daysLabel(o.daysLeft)} tone={tone} />
            {/* one line keeps every card as tight as the date leaf (the row stretches cards to the tallest); long titles shrink */}
            <T v="h3" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ marginTop: 7 }}>
              {o.label}
            </T>
            <T v="sub" numberOfLines={1} style={{ marginTop: 2 }}>
              {occasionSub(o)}
            </T>
          </View>
        </Row>
      </Card>
    </Tap>
  );
}

/** Agenda row in the calendar. Tapping it opens the gift chat; `onMore` adds a trailing ⋯ (edit / delete / find a gift). */
export function OccasionRow({ o, highlight, onMore }: { o: Upcoming; highlight?: boolean; onMore?: () => void }) {
  const tone = urgencyOf(o);
  return (
    <Tap onPress={() => openOccasion(o)} accessibilityLabel={`${o.label}, in ${o.daysLeft} days`}>
      <Card pad={12} style={highlight ? { borderColor: color.primary, borderWidth: 1.5 } : undefined}>
        <Row gap={12}>
          <DateBlock iso={o.nextDate} tone={tone} top="weekday" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T v="h3" numberOfLines={1}>
              {o.label}
            </T>
            <T v="sub" numberOfLines={1}>
              {occasionSub(o)}
            </T>
            {o.inReminderWindow ? (
              <T v="caption" style={{ color: color.warn, fontFamily: font.strong }}>
                Gift should arrive by {monthShort(o.arriveBy)} {dayNum(o.arriveBy)}
              </T>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Chip label={daysLabel(o.daysLeft)} tone={tone} />
            {onMore ? <IconButton icon={MoreHorizontal} size={30} label={`Manage ${o.label}`} onPress={onMore} /> : <ChevronRight size={18} color={color.faint} />}
          </View>
        </Row>
      </Card>
    </Tap>
  );
}
