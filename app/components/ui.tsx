import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { haptic, type HapticKind } from "@/lib/haptics";
import { color, font, gradient, ledge, onGradient, palette, radius, shadow, type GradientName } from "@/lib/theme";

// ---------------------------------------------------------------- text
type Variant = "display" | "h1" | "h2" | "h3" | "body" | "bodyStrong" | "sub" | "caption" | "eyebrow" | "num" | "numXL";
const textStyles: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: 28, lineHeight: 31, letterSpacing: -0.6, color: color.ink },
  h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5, color: color.ink },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 22, letterSpacing: -0.2, color: color.ink },
  h3: { fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: color.ink },
  body: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: color.ink2 },
  bodyStrong: { fontFamily: font.strong, fontSize: 14.5, lineHeight: 20, color: color.ink },
  sub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
  caption: { fontFamily: font.medium, fontSize: 12.5, lineHeight: 16, color: color.muted },
  eyebrow: { fontFamily: font.strong, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: "uppercase", color: color.muted },
  num: { fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: color.ink, fontVariant: ["tabular-nums"] },
  numXL: { fontFamily: font.display, fontSize: 36, lineHeight: 40, letterSpacing: -1.1, color: color.ink, fontVariant: ["tabular-nums"] },
};

export function T({ v = "body", style, ...p }: TextProps & { v?: Variant }) {
  return <Text {...p} style={[textStyles[v], style]} />;
}

// ---------------------------------------------------------------- grain + gradient surfaces
const NOISE = require("@/assets/images/noise.png");

export function Grain({ opacity = 0.55 }: { opacity?: number }) {
  if (Platform.OS === "web") {
    // CSS tiling on web (RN-web's ImageBackground doesn't repeat).
    const uri = Asset.fromModule(NOISE).uri;
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { zIndex: -1, opacity, backgroundImage: `url(${uri})`, backgroundRepeat: "repeat", backgroundSize: "120px 120px" } as object]}
      />
    );
  }
  return <ImageBackground source={NOISE} resizeMode="repeat" pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1, opacity }]} />;
}

/** Top-left sheen + grain strength per hue — dark navy needs much less of both or it turns grey. */
const sheen: Record<GradientName, number> = { primary: 0.22, navy: 0.06, info: 0.3, warning: 0.2, danger: 0.18 };
const grainScale: Record<GradientName, number> = { primary: 1, navy: 0.4, info: 0.9, warning: 1, danger: 1 };

/** Soft radial light from a corner (green on navy = the signature Xerxes surface). */
function Glow({ tint = palette.green, strength = 0.5, x = "92%", y = "0%" }: { tint?: string; strength?: number; x?: string; y?: string }) {
  const id = `glow${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1 }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx={x} cy={y} rx="62%" ry="75%" fx={x} fy={y}>
            <Stop offset="0" stopColor={tint} stopOpacity={strength} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function GradientSurface({
  name = "primary",
  style,
  children,
  grain = 0.6,
  glow,
}: {
  name?: GradientName;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  grain?: number;
  /** add a soft green light from the top-right corner (best on navy) */
  glow?: boolean | number;
}) {
  return (
    <View style={[{ overflow: "hidden", zIndex: 0 }, style]}>
      <LinearGradient colors={gradient[name]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
      {glow ? <Glow strength={typeof glow === "number" ? glow : 0.55} /> : null}
      <LinearGradient
        colors={[`rgba(255,255,255,${sheen[name]})`, "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { zIndex: -1 }]}
        pointerEvents="none"
      />
      <Grain opacity={grain * grainScale[name]} />
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- button (3D ledge press)
type ButtonKind = "grad" | "ink" | "white" | "ghost" | "glass";
export function Button({
  label,
  onPress,
  kind = "ink",
  grad = "primary",
  icon: Icon,
  loading,
  disabled,
  style,
  compact,
}: {
  label?: string;
  onPress?: () => void;
  kind?: ButtonKind;
  grad?: GradientName;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const [press] = useState(() => new Animated.Value(0));
  const depth = kind === "glass" ? 0 : kind === "ghost" ? 3 : 4;
  const to = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: Platform.OS !== "web", speed: 50, bounciness: 0 }).start();
  const fg = kind === "white" || kind === "ghost" ? color.ink : kind === "grad" ? onGradient[grad] : "#fff";
  const ledgeColor = kind === "grad" ? ledge[grad] : kind === "ink" ? ledge.ink : kind === "white" ? ledge.white : ledge.ghost;
  const h = compact ? 44 : 52;

  const face = (
    <View style={[styles.btnFace, { height: h, paddingHorizontal: label ? 18 : 0, minWidth: h }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={fg} strokeWidth={2.2} /> : null}
          {label ? <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text> : null}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      disabled={disabled || loading}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      onPress={() => {
        haptic.press();
        onPress?.();
      }}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={{ paddingBottom: depth }}>
        {depth > 0 && <View style={[StyleSheet.absoluteFill, { top: depth, borderRadius: radius.lg, backgroundColor: ledgeColor }]} />}
        <Animated.View
          style={{
            borderRadius: radius.lg,
            overflow: "hidden",
            transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] }) }],
            backgroundColor: kind === "ink" ? color.ink : kind === "white" ? "#fff" : kind === "ghost" ? "#fff" : kind === "glass" ? "rgba(255,255,255,0.10)" : undefined,
            borderWidth: kind === "ghost" ? 1 : kind === "glass" ? 1 : 0,
            borderColor: kind === "glass" ? "rgba(255,255,255,0.18)" : color.line,
          }}
        >
          {kind === "grad" ? <GradientSurface name={grad} grain={0.45}>{face}</GradientSurface> : face}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- tap (cards & rows)
/** Pressable with a subtle press-in scale and a haptic tick — use it for every tappable card or row. */
export function Tap({
  onPress,
  children,
  style,
  disabled,
  feedback = "tap",
  scale = 0.98,
  accessibilityLabel,
}: {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  feedback?: HapticKind;
  scale?: number;
  accessibilityLabel?: string;
}) {
  const [s] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: Platform.OS !== "web", speed: 40, bounciness: 0 }).start();
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
      onPress={() => {
        haptic[feedback]();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View style={{ flexGrow: 1, transform: [{ scale: s }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- card, chip, misc
export function Card({ children, style, pad = 14 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return <View style={[styles.card, { padding: pad }, style]}>{children}</View>;
}

/** Chip tones map 1:1 to the palette roles. */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "dark" | "glass";
const toneStyle: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: color.chip, fg: color.ink2 },
  ok: { bg: color.okBg, fg: color.ok },
  warn: { bg: color.warnBg, fg: color.warn },
  bad: { bg: color.badBg, fg: color.bad },
  info: { bg: color.infoBg, fg: color.infoInk },
  dark: { bg: color.navy, fg: "#FFFFFF" },
  glass: { bg: "rgba(255,255,255,0.12)", fg: "#FFFFFF" },
};
export function Chip({ label, tone = "neutral", icon: Icon }: { label: string; tone?: Tone; icon?: LucideIcon }) {
  const t = toneStyle[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={12} color={t.fg} strokeWidth={2.6} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap, flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

export function IconTile({ icon: Icon, grad = "navy", size = 52, label }: { icon?: LucideIcon; grad?: GradientName; size?: number; label?: string }) {
  const fg = onGradient[grad];
  return (
    <GradientSurface
      name={grad}
      glow={grad === "navy" ? 0.18 : undefined}
      style={{ width: size, height: size, borderRadius: size * 0.28, alignItems: "center", justifyContent: "center" }}
      grain={0.5}
    >
      {Icon ? <Icon size={size * 0.42} color={fg} strokeWidth={2.2} /> : <Text style={{ fontFamily: font.display, color: fg, fontSize: size * 0.36 }}>{label}</Text>}
    </GradientSurface>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 26, marginBottom: 12, paddingHorizontal: 4 }}>
      <T v="h2">{title}</T>
      {action ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            onAction?.();
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <T v="sub" style={{ fontFamily: font.strong, color: color.ok }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </Row>
  );
}

/** Two or three views inside one screen (Projects | Items). The white thumb springs over to the chosen one. */
export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: { id: K; label: string; count?: number }[]; onChange: (k: K) => void }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const [x] = useState(() => new Animated.Value(index));
  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: Platform.OS !== "web", speed: 20, bounciness: 5 }).start();
  }, [index, x]);
  const seg = width ? (width - 12) / options.length : 0; // inside the 1px border and 5px padding
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.segTrack} accessibilityRole="tablist">
      {seg ? <Animated.View style={[styles.segThumb, shadow.card, { width: seg, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, seg] }) }] }]} /> : null}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              if (on) return;
              haptic.tap();
              onChange(o.id);
            }}
            style={styles.segItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.segLabel, { color: on ? color.ink : color.muted }]}>{o.label}</Text>
            {o.count !== undefined ? (
              <View style={[styles.segCount, { backgroundColor: on ? color.okBg : color.line }]}>
                <Text style={[styles.segCountText, { color: on ? color.ok : color.muted }]}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, grad = "primary" }: { value: number; grad?: GradientName }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 12, borderRadius: 99, backgroundColor: color.track, overflow: "hidden" }}>
      <GradientSurface name={grad} style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 99 }} grain={0.4} />
    </View>
  );
}

/** Progress ring — primary accent by default; warning/danger for semantic states. */
export function Ring({
  value,
  size = 56,
  stroke = 6,
  tone = "primary",
  track = color.track,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "primary" | "warning" | "danger" | "info";
  track?: string;
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const stroked = { primary: color.primary, warning: color.warning, danger: color.danger, info: color.info }[tone];
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", zIndex: 0 }}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1 }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={stroked}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - pct)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  btnFace: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnLabel: { fontFamily: font.bold, fontSize: 15.5, letterSpacing: -0.1 },
  card: { backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start", maxWidth: "100%" },
  chipText: { fontFamily: font.strong, fontSize: 11.5, flexShrink: 1 },
  segTrack: { flexDirection: "row", backgroundColor: color.chip, borderRadius: 18, padding: 5, borderWidth: 1, borderColor: color.line },
  segThumb: { position: "absolute", top: 5, left: 5, bottom: 5, borderRadius: 14, backgroundColor: "#fff" },
  segItem: { flex: 1, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  segLabel: { fontFamily: font.bold, fontSize: 15, letterSpacing: -0.1 },
  segCount: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  segCountText: { fontFamily: font.bold, fontSize: 11.5 },
});

export { shadow };
