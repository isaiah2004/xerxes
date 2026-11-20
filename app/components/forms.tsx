import type { LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { haptic } from "@/lib/haptics";
import { color, font, radius } from "@/lib/theme";
import { Row, T } from "./ui";

// Small form kit for the sheets: labelled fields, a text input, selectable chips and a switch (all palette-only).

export function Field({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T v="eyebrow">{label}</T>
        {right}
      </Row>
      {children}
      {hint ? <T v="caption">{hint}</T> : null}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  prefix,
  keyboardType,
  autoFocus,
  maxLength = 120,
  onSubmitEditing,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** e.g. "₹" or "$" */
  prefix?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  maxLength?: number;
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[styles.input, { borderColor: focus ? color.primary : color.line }]}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.faint}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? "done" : undefined}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={[styles.inputText, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
      />
    </View>
  );
}

/**
 * Pressable chip with an on/off state (people, quick amounts). For kind pickers: `tile` = equal-width icon-over-label
 * tile (four in a row), `tile="wide"` = equal-width icon-beside-label tile (two in a row, for longer labels).
 */
export function ChoiceChip({ label, selected, onPress, icon: Icon, tile }: { label: string; selected: boolean; onPress: () => void; icon?: LucideIcon; tile?: boolean | "wide" }) {
  const fg = selected ? color.ok : color.ink2;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={tile ? { flex: 1, minWidth: 0 } : undefined}
    >
      {({ pressed }) => (
        <View style={[tile === "wide" ? styles.wide : tile ? styles.tile : styles.choice, selected ? styles.choiceOn : null, pressed ? { transform: [{ scale: 0.96 }] } : null]}>
          {Icon ? <Icon size={tile ? 19 : 15} color={fg} strokeWidth={2.3} /> : null}
          <Text style={[styles.choiceText, tile === true ? { fontSize: 12.5 } : tile ? { fontSize: 14 } : null, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Green switch with a label. */
export function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: 170, useNativeDriver: false }).start();
  }, [value, x]);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Row gap={12}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong">{label}</T>
          {sub ? <T v="caption">{sub}</T> : null}
        </View>
        <Animated.View style={[styles.track, { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [color.faint, color.primary] }) }]}>
          <Animated.View style={[styles.knob, { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }]} />
        </Animated.View>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 50,
    paddingHorizontal: 14,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderRadius: radius.lg,
  },
  prefix: { fontFamily: font.bold, fontSize: 16, color: color.muted },
  inputText: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 16, color: color.ink, paddingVertical: 12 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: color.line,
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 66,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: color.line,
  },
  wide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: color.line,
  },
  choiceOn: { backgroundColor: color.okBg, borderColor: color.primary },
  choiceText: { fontFamily: font.strong, fontSize: 13.5 },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: color.navy,
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
