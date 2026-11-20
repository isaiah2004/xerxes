import { ChevronRight, Trash2, X, type LucideIcon } from "lucide-react-native";
import { Children, useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import { color, radius, shadow } from "@/lib/theme";
import { Button, Grain, Row, T, Tap } from "./ui";

const native = Platform.OS !== "web";

/**
 * Bottom sheet: dimmed navy backdrop + a grainy off-white panel that slides up. Same look on iOS, Android and web.
 * Keep one mounted per screen and flip `open`: it stays on screen through the slide-out. Switch its content
 * (menu → form → confirm) instead of stacking a second sheet. Content goes in <SheetBody> (scrolls) and,
 * optionally, <SheetFooter> (pinned, e.g. the Save button).
 */
export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title?: string; subtitle?: string; children: ReactNode }) {
  const [shown, setShown] = useState(false); // true once fully open; keeps the modal up while it slides out
  const [t] = useState(() => new Animated.Value(0));
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: open ? 1 : 0,
      duration: open ? 300 : 210,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: native,
    });
    anim.start(({ finished }) => {
      if (finished) setShown(open);
    });
    return () => anim.stop();
  }, [open, t]);

  const close = () => {
    haptic.tap();
    onClose();
  };

  return (
    <Modal visible={open || shown} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(16,24,40,0.48)", opacity: t }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + 24, pointerEvents: "box-none" }}
        >
          <Animated.View
            style={[
              styles.panel,
              shadow.float,
              { paddingBottom: Math.max(insets.bottom, 14), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height, 1000), 0] }) }] },
            ]}
            accessibilityViewIsModal
          >
            <Grain opacity={0.35} />
            <View style={styles.handle} />
            {title ? (
              <Row gap={12} style={{ alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <T v="h2" numberOfLines={2}>
                    {title}
                  </T>
                  {subtitle ? <T v="sub">{subtitle}</T> : null}
                </View>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                  <View style={styles.close}>
                    <X size={17} color={color.ink} strokeWidth={2.4} />
                  </View>
                </Pressable>
              </Row>
            ) : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Scrolling content area of a sheet (shrinks to fit, scrolls when taller than the screen). */
export function SheetBody({ children, gap = 18 }: { children: ReactNode; gap?: number }) {
  return (
    <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/** Pinned under the body: primary action(s). */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: color.line }}>{children}</View>;
}

/** One row in a sheet's action list. `danger` = red, for Delete. */
export function SheetAction({ icon: Icon, label, sub, danger, onPress }: { icon: LucideIcon; label: string; sub?: string; danger?: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} scale={0.985}>
      <Row gap={12} style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
        <View style={[styles.actionIcon, { backgroundColor: danger ? color.badBg : color.chip }]}>
          <Icon size={18} color={danger ? color.danger : color.ink} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T v="bodyStrong" style={danger ? { color: color.bad } : undefined}>
            {label}
          </T>
          {sub ? (
            <T v="caption" numberOfLines={1}>
              {sub}
            </T>
          ) : null}
        </View>
        {danger ? null : <ChevronRight size={16} color={color.faint} />}
      </Row>
    </Tap>
  );
}

/** White grouped list for SheetActions, with hairlines between rows. */
export function SheetActions({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <View style={styles.group}>
      {items.map((c, i) => (
        <View key={i}>
          {i ? <View style={{ height: 1, backgroundColor: color.line, marginLeft: 62 }} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

/** "Are you sure?" sheet content: red confirm + a calm way out. Shows the server's error if it fails. */
export function ConfirmPanel({
  message,
  confirmLabel = "Delete",
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody gap={16}>
      <T v="body">{message}</T>
      {error ? <FormError text={error} /> : null}
      <View style={{ gap: 10 }}>
        <Button
          kind="grad"
          grad="danger"
          icon={Trash2}
          label={confirmLabel}
          loading={busy}
          onPress={() => {
            setBusy(true);
            setError(null);
            onConfirm()
              .then(() => haptic.success())
              .catch((e: Error) => {
                haptic.error();
                setError(e.message);
                setBusy(false);
              });
          }}
        />
        <Button kind="ghost" label={cancelLabel} onPress={onCancel} disabled={busy} />
      </View>
    </SheetBody>
  );
}

export function FormError({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: color.badBg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }} accessibilityRole="alert">
      <T v="sub" style={{ color: color.bad }}>
        {text}
      </T>
    </View>
  );
}

/**
 * Small rounded icon button, e.g. the trailing "more" on rows that can be managed. It often sits inside a tappable
 * card, so no button role (on web that role renders a <button>, and buttons can't nest). Without `onPress` it's
 * just the visual, for cards that are themselves the button.
 */
export function IconButton({ icon: Icon, onPress, label, size = 34 }: { icon: LucideIcon; onPress?: () => void; label: string; size?: number }) {
  const face = (pressed: boolean) => (
    <View style={[styles.iconBtn, { width: size, height: size, borderRadius: size * 0.36, backgroundColor: pressed ? color.line : color.chip }]}>
      <Icon size={Math.round(size * 0.5)} color={color.ink2} strokeWidth={2.3} />
    </View>
  );
  if (!onPress) return face(false);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityLabel={label}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "100%",
    alignSelf: "center",
    backgroundColor: color.paper,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: "hidden",
    zIndex: 0,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(16,24,40,0.14)", marginTop: 10, marginBottom: 8 },
  close: { width: 34, height: 34, borderRadius: 12, backgroundColor: color.chip, alignItems: "center", justifyContent: "center" },
  actionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  group: { backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, paddingVertical: 4 },
  iconBtn: { alignItems: "center", justifyContent: "center" },
});
