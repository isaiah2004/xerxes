import Constants from "expo-constants";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { haptic } from "@/lib/haptics";
import { openLink } from "@/lib/links";
import { color, font, palette } from "@/lib/theme";

export type LatLon = { lat: number; lon: number };
/** A numbered pin (1..n in array order). `name` only labels it for screen readers. */
export type MapMarker = LatLon & { name?: string };

const TILE = 256; // CSS px per tile (a @2x tile, where the source has one, keeps it crisp)
const MIN_ZOOM = 11;
const MAX_ZOOM = 17;
/** Room around the points. A pin's head stands ~31px above its point (~38px when selected), so the top gets more. */
const PAD = { x: 48, top: 44, bottom: 30 };
const HEAD = 26; // pin head diameter
const TIP = HEAD / 2 + HEAD / Math.SQRT2; // a pin's point, measured down from the top of its head
const LIFT = 1.22; // the selected pin's scale
const YOU = 34; // the "you" marker's halo
const COPYRIGHT = "https://www.openstreetmap.org/copyright";

/**
 * CARTO Voyager reads best under the pins, but since CARTO's terms of 29 Sep 2026 every tile URL needs a key (free:
 * carto.com/basemaps/apikey); without one it draws "API key required" over the map. So Voyager (retina) when
 * EXPO_PUBLIC_CARTO_KEY is set, and OpenStreetMap's own tiles otherwise: keyless, but 256px, so a touch soft on 2x screens.
 */
const CARTO_KEY = process.env.EXPO_PUBLIC_CARTO_KEY?.trim();
const TILES = CARTO_KEY
  ? {
      url: (z: number, x: number, y: number) =>
        `https://${"abcd"[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png?key=${encodeURIComponent(CARTO_KEY)}`,
      credit: "© OpenStreetMap © CARTO",
      a11y: "Map data © OpenStreetMap contributors, map style © CARTO",
      wash: 0,
    }
  : {
      url: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      credit: "© OpenStreetMap",
      a11y: "Map data © OpenStreetMap contributors",
      wash: 0.24, // OSM's own style is loud next to the app's palette; a veil of paper calms it so the pins lead
    };
/** OSM's tile policy wants apps to say who they are. Browsers send their own User-Agent, plus the page as the Referer. */
const HEADERS = Platform.OS === "web" ? undefined : { "User-Agent": `Xerxes/${Constants.expoConfig?.version ?? "1.0"} (Expo; React Native)` };
const tileSource = (uri: string) => (HEADERS ? { uri, headers: HEADERS } : { uri });

const valid = (p?: LatLon): p is LatLon => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

type Px = { x: number; y: number };

/** Web Mercator in zoom-0 pixels (the whole world is one 256px tile); multiply by 2^z for zoom z. */
function project({ lat, lon }: LatLon): Px {
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * TILE,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * TILE,
  };
}

/** The largest zoom where every point fits inside the padding, centred on their bounding box, and the tiles that cover it. */
function frame(points: Px[], w: number, h: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const room = { w: Math.max(1, w - 2 * PAD.x), h: Math.max(1, h - PAD.top - PAD.bottom) };
  let z = MIN_ZOOM;
  for (let k = MAX_ZOOM; k > MIN_ZOOM; k--) {
    if ((maxX - minX) * 2 ** k <= room.w && (maxY - minY) * 2 ** k <= room.h) {
      z = k;
      break;
    }
  }
  const scale = 2 ** z; // also the number of tiles across the world at this zoom
  // whole-pixel offsets keep every tile edge on a whole pixel, so neighbours meet without a seam
  const ox = Math.round(((minX + maxX) / 2) * scale - w / 2);
  const oy = Math.round(((minY + maxY) / 2) * scale - (PAD.top + room.h / 2));
  const tiles: { key: string; source: ReturnType<typeof tileSource>; left: number; top: number }[] = [];
  for (let ty = Math.max(0, Math.floor(oy / TILE)); ty <= Math.min(scale - 1, Math.floor((oy + h - 1) / TILE)); ty++) {
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + Math.ceil(w) - 1) / TILE); tx++) {
      const x = ((tx % scale) + scale) % scale; // wraps across the antimeridian
      tiles.push({ key: `${z}/${tx}/${ty}`, source: tileSource(TILES.url(z, x, ty)), left: tx * TILE - ox, top: ty * TILE - oy });
    }
  }
  return { zoom: z, tiles, at: (p: Px): Px => ({ x: p.x * scale - ox, y: p.y * scale - oy }) };
}

/** Pins close enough that their heads overlap. */
const crowded = (spots: Px[]) => spots.some((a, i) => spots.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < HEAD + 4));

// ---------------------------------------------------------------- markers
/** A numbered teardrop: a rotated square with three round corners, its sharp corner pointing at the spot. */
function Pin({ n, at, selected, label, onPress }: { n: number; at: Px; selected: boolean; label: string; onPress?: () => void }) {
  const [lift] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.spring(lift, { toValue: selected ? 1 : 0, useNativeDriver: Platform.OS !== "web", speed: 16, bounciness: 10 }).start();
  }, [selected, lift]);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={selected}
      // lower pins overlap higher ones, like real pins; the selected one sits on top of everything
      style={[styles.pin, { left: at.x - HEAD / 2, top: at.y - TIP, zIndex: selected ? 1000 : 10 + Math.max(0, Math.round(at.y)) }]}
    >
      <View style={styles.ground} />
      <Animated.View style={[styles.pinBody, { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT] }) }] }]}>
        <View style={[styles.drop, { backgroundColor: selected ? palette.green : palette.navy }]} />
        <View style={styles.pinFace}>
          <Text allowFontScaling={false} style={styles.pinNum}>
            {n}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Where the user is: a blue dot in a white ring with a soft halo. away: off the map, so it sits on the edge facing home. */
function You({ at, away }: { at: Px; away?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.you, { left: at.x - YOU / 2, top: at.y - YOU / 2, opacity: away ? 0.7 : 1 }]}>
      <View style={styles.youHalo} />
      <YouDot />
    </View>
  );
}

/** The "you" dot on its own (for a legend next to the map). */
export function YouDot({ size = 18 }: { size?: number }) {
  return (
    <View style={[styles.youRing, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={{ width: size * 0.66, height: size * 0.66, borderRadius: size, backgroundColor: palette.blue }} />
    </View>
  );
}

// ---------------------------------------------------------------- map
/**
 * A static map of a few numbered pins around a "you" dot: OpenStreetMap raster tiles laid out as plain images, so it
 * needs no native module and scrolls with its parent (no pan or zoom). It frames all the points at the largest zoom
 * that fits. Tapping a pin calls `onSelect` with its index.
 */
export function StoreMap({
  center,
  pins,
  height = 180,
  selected,
  onSelect,
  style,
}: {
  center: LatLon;
  pins: MapMarker[];
  height?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const view = useMemo(() => {
    if (!width) return null;
    const you = valid(center) ? project(center) : undefined;
    const spots = pins.map((p) => (valid(p) ? project(p) : undefined));
    const shops = spots.filter((p): p is Px => !!p);
    const points = [you, ...shops].filter((p): p is Px => !!p);
    if (!points.length) return null;
    let f = frame(points, width, height);
    let away = false;
    // Shops a street apart with home a few km off: framing both stacks the pins on one spot. Then frame the shops,
    // and keep the "you" dot on the edge, on the side home is.
    if (you && shops.length > 1 && crowded(shops.map(f.at))) {
      const g = frame(shops, width, height);
      if (g.zoom > f.zoom) {
        f = g;
        const at = g.at(you);
        away = at.x < 0 || at.y < 0 || at.x > width || at.y > height;
      }
    }
    const m = YOU / 2 + 4;
    const edge = (p: Px): Px => ({ x: Math.min(Math.max(p.x, m), width - m), y: Math.min(Math.max(p.y, m), height - m) });
    return { tiles: f.tiles, you: you && (away ? edge(f.at(you)) : f.at(you)), away, spots: spots.map((p) => p && f.at(p)) };
  }, [width, height, center, pins]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.map, { height }, style]}>
      {view ? (
        <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {view.tiles.map((t) => (
              <Image
                key={t.key}
                source={t.source}
                style={[styles.tile, { left: t.left, top: t.top }]}
                cachePolicy="memory-disk"
                contentFit="fill"
                transition={160}
                draggable={false}
                accessible={false}
              />
            ))}
            {TILES.wash ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(253, 249, 255, ${TILES.wash})` }]} /> : null}
          </View>
          {view.you ? <You at={view.you} away={view.away} /> : null}
          {view.spots.map((at, i) =>
            at ? (
              <Pin
                key={i}
                n={i + 1}
                at={at}
                selected={i === selected}
                label={`${i + 1}. ${pins[i]?.name ?? "Pin"}`}
                onPress={onSelect ? () => onSelect(i) : undefined}
              />
            ) : null,
          )}
        </>
      ) : null}
      <Pressable
        onPress={() => void openLink(COPYRIGHT)}
        hitSlop={6}
        accessibilityRole="link"
        accessibilityLabel={TILES.a11y}
        style={styles.attribution}
      >
        <Text allowFontScaling={false} style={styles.attributionText}>
          {TILES.credit}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", overflow: "hidden", backgroundColor: "#ECEAE5" },
  tile: { position: "absolute", width: TILE, height: TILE },

  pin: { position: "absolute", width: HEAD, height: TIP },
  pinBody: { width: HEAD, height: TIP, transformOrigin: "bottom" },
  drop: {
    position: "absolute",
    left: 0,
    top: 0,
    width: HEAD,
    height: HEAD,
    borderRadius: HEAD / 2,
    borderBottomRightRadius: 3, // after the 45° turn this is the point; a hair of rounding keeps it from looking like a needle
    borderWidth: 2,
    borderColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    boxShadow: "1px 1px 3px rgba(16, 24, 40, 0.35)", // drawn before the turn, so it falls straight down
  },
  pinFace: { position: "absolute", left: 0, top: 0, width: HEAD, height: HEAD, alignItems: "center", justifyContent: "center" },
  pinNum: { fontFamily: font.bold, fontSize: 13, lineHeight: 16, color: "#FFFFFF", textAlign: "center", includeFontPadding: false },
  ground: { position: "absolute", left: HEAD / 2 - 5, top: TIP - 2, width: 10, height: 4, borderRadius: 5, backgroundColor: "rgba(16, 24, 40, 0.25)" },

  you: { position: "absolute", width: YOU, height: YOU, alignItems: "center", justifyContent: "center", zIndex: 5 },
  youHalo: { position: "absolute", left: 0, top: 0, width: YOU, height: YOU, borderRadius: YOU / 2, backgroundColor: "rgba(155, 186, 243, 0.32)", borderWidth: 1, borderColor: "rgba(111, 146, 218, 0.32)" },
  youRing: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", boxShadow: "0px 1px 4px rgba(16, 24, 40, 0.28)" },

  attribution: { position: "absolute", right: 6, bottom: 6, zIndex: 2000, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: "rgba(255, 255, 255, 0.82)" },
  attributionText: { fontFamily: font.medium, fontSize: 9, lineHeight: 11, color: color.ink2 },
});
