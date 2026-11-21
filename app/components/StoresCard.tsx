import { Clock, MapPin, Navigation, Phone, type LucideIcon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { color, font, palette, radius } from "@/lib/theme";
import { StoreMap, YouDot } from "./StoreMap";
import { Card, Chip, Row, T, Tap, type Tone } from "./ui";

export type StorePin = {
  id: string; // "node/123456"
  name: string; // "Blossom Book House"
  kind: string; // human label: "Bookshop", "Toy store"
  lat: number;
  lon: number;
  distanceKm: number; // from the card's centre, 1 decimal
  address?: string; // "Church Street, Shanthala Nagar"
  hours?: string; // raw OSM opening_hours, e.g. "Mo-Su 10:30-21:30"
  open?: { now: boolean; until?: string; opens?: string }; // only when hours parsed; times "HH:MM" 24h local
  phone?: string;
  website?: string;
  note?: string; // Xerxes' one-liner, e.g. "Biggest kids' section near you; likely has it"
  directionsUrl: string; // Google Maps directions URL
};
export type StoresCardData = {
  id: string;
  type: "stores";
  heading: string; // "Open now near you"
  center: { lat: number; lon: number; label: string }; // where the user is: home postal code or a named area
  stores: StorePin[]; // 1-5, in Xerxes' order: pin numbers 1..n
};

const MAX_PINS = 9; // pins hold one digit; the backend sends 1-5
const ROW_INSET = 14 + 26 + 12; // row padding + badge + gap: where a row's text starts

/** "21:30" → "9:30 pm", "10:00" → "10 am", "00:00" → "midnight". Anything else comes back as it was. */
function clock(hhmm: string) {
  const t = hhmm.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 24 || min > 59) return t;
  if (h % 24 === 0 && min === 0) return "midnight";
  return `${h % 12 || 12}${min ? `:${m[2]}` : ""} ${h % 24 < 12 ? "am" : "pm"}`;
}

/** 0.2 → "0.2 km", 1.0 → "1 km", 12.4 → "12 km". */
const km = (d: number) => (Number.isFinite(d) ? `${d >= 10 ? Math.round(d) : Math.round(d * 10) / 10} km` : "");

/** Green while it's open, red while it's shut. Hours we couldn't read are shown as they are. */
function hoursChip(s: StorePin): { label: string; tone: Tone } | undefined {
  const o = s.open;
  const raw = s.hours?.trim();
  if (o?.now) return { tone: "ok", label: o.until ? `Open · till ${clock(o.until)}` : raw === "24/7" ? "Open 24/7" : "Open now" };
  // the backend sets `opens` only for a later opening today, so without it the shop is done for the day
  if (o) return { tone: "bad", label: o.opens ? `Closed · opens ${clock(o.opens)}` : "Closed today" };
  return raw ? { tone: "neutral", label: raw } : undefined;
}

/** The first number in an OSM phone tag ("+91 80 2532 0400; +91 98450 12345"), in dialable form. */
function dialable(phone?: string) {
  const n = phone?.split(/[;,]/)[0]?.replace(/[^\d+]/g, "");
  return n && n.replace(/\D/g, "").length >= 5 ? n : undefined;
}

/** Hands the URL to the OS, so on Android directions open in the Google Maps app and `tel:` in the dialer. */
const launch = (url: string) => void Linking.openURL(url).catch(() => undefined);
const directionsTo = (s: StorePin) => s.directionsUrl || `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

/** "4 shops within 1 km" (the farthest one, rounded up). */
function reach(stores: StorePin[]) {
  const count = `${stores.length} ${stores.length === 1 ? "shop" : "shops"}`;
  const far = Math.max(...stores.map((s) => (Number.isFinite(s.distanceKm) ? s.distanceKm : 0)));
  if (!far) return count;
  const r = far <= 1 ? 1 : far < 5 ? Math.ceil(far * 2) / 2 : Math.ceil(far);
  return `${count} within ${r} km`;
}

// ---------------------------------------------------------------- pieces
/** The store's number, in its pin's colour. */
function Badge({ n, selected }: { n: number; selected: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: selected ? palette.green : palette.navy }]}>
      <Text allowFontScaling={false} style={styles.badgeNum}>
        {n}
      </Text>
    </View>
  );
}

function Action({ icon: Icon, label, hint, primary, onPress }: { icon: LucideIcon; label: string; hint: string; primary?: boolean; onPress: () => void }) {
  const fg = primary ? color.infoInk : color.ink2;
  return (
    <Tap onPress={onPress} scale={0.95} feedback="press" accessibilityLabel={hint}>
      <View style={[styles.action, { backgroundColor: primary ? color.infoBg : color.chip }]}>
        <Icon size={15} color={fg} strokeWidth={2.4} />
        <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
      </View>
    </Tap>
  );
}

function StoreRow({ store, n, selected, onSelect }: { store: StorePin; n: number; selected: boolean; onSelect: () => void }) {
  const chip = hoursChip(store);
  const phone = dialable(store.phone);
  const caption = [store.kind?.trim(), km(store.distanceKm)].filter(Boolean).join(" · ");
  return (
    <View style={selected ? styles.rowOn : undefined}>
      <Tap onPress={onSelect} scale={0.985} accessibilityLabel={[`${n}. ${store.name}`, caption, chip?.label, store.note].filter(Boolean).join(", ")}>
        <Row gap={12} style={styles.rowMain}>
          <Badge n={n} selected={selected} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T v="h3" numberOfLines={1}>
              {store.name}
            </T>
            {caption || chip ? (
              <Row gap={8} wrap>
                {caption ? (
                  <T v="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {caption}
                  </T>
                ) : null}
                {chip ? <Chip label={chip.label} tone={chip.tone} icon={Clock} /> : null}
              </Row>
            ) : null}
            {store.note ? (
              <T v="sub" numberOfLines={2} style={{ marginTop: 2 }}>
                {store.note}
              </T>
            ) : null}
            {store.address ? (
              <Row gap={5} style={{ marginTop: 1 }}>
                <MapPin size={12} color={color.faint} strokeWidth={2.4} />
                <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
                  {store.address}
                </T>
              </Row>
            ) : null}
          </View>
        </Row>
      </Tap>
      <Row gap={8} style={styles.actions}>
        <Action primary icon={Navigation} label="Directions" hint={`Directions to ${store.name}`} onPress={() => launch(directionsTo(store))} />
        {phone ? <Action icon={Phone} label="Call" hint={`Call ${store.name}`} onPress={() => launch(`tel:${phone}`)} /> : null}
      </Row>
    </View>
  );
}

// ---------------------------------------------------------------- card
/**
 * Shops near the user for something needed today: a map with numbered pins, then one row per shop in Xerxes' order.
 * Tapping a row lights up its pin and tapping a pin lights up its row. Directions open Google Maps; Call opens the dialer.
 */
export function StoresCard({ card }: { card: StoresCardData }) {
  const [picked, setPicked] = useState(0);
  // stable across selection changes, so the map doesn't re-frame (or hand its tiles new sources) on every tap
  const stores = useMemo(() => (card.stores ?? []).filter((s) => s?.name?.trim()).slice(0, MAX_PINS), [card.stores]);
  if (!stores.length) return null;
  const selected = Math.min(picked, stores.length - 1);
  const where = card.center?.label?.trim();
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <StoreMap center={card.center} pins={stores} selected={selected} onSelect={setPicked} style={styles.map} />
      <View style={styles.mapEdge} />
      <View style={styles.head}>
        <T v="h2" numberOfLines={2}>
          {card.heading || "Shops near you"}
        </T>
        <Row gap={6} style={{ marginTop: 4 }}>
          <YouDot size={12} />
          <T v="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {[where, reach(stores)].filter(Boolean).join(" · ")}
          </T>
        </Row>
      </View>
      {stores.map((s, i) => (
        <View key={s.id || `${s.name}-${i}`}>
          {i ? <View style={styles.hairline} /> : null}
          <StoreRow store={s} n={i + 1} selected={i === selected} onSelect={() => setPicked(i)} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  map: { borderTopLeftRadius: radius.xl - 1, borderTopRightRadius: radius.xl - 1 }, // the card's corner, inside its 1px border
  mapEdge: { height: 1, backgroundColor: color.line },
  head: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  hairline: { height: 1, backgroundColor: color.line, marginLeft: ROW_INSET },
  rowOn: { backgroundColor: "rgba(17, 156, 112, 0.06)" },
  rowMain: { paddingHorizontal: 14, paddingTop: 12, alignItems: "flex-start" },
  actions: { paddingLeft: ROW_INSET, paddingRight: 14, paddingTop: 10, paddingBottom: 14 },
  badge: { width: 26, height: 26, borderRadius: 13, marginTop: -3, alignItems: "center", justifyContent: "center" }, // centred on the name's line
  badgeNum: { fontFamily: font.bold, fontSize: 13, lineHeight: 16, color: "#FFFFFF", textAlign: "center", includeFontPadding: false },
  action: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 13, borderRadius: radius.pill },
  actionLabel: { fontFamily: font.bold, fontSize: 13.5, letterSpacing: -0.1 },
});
