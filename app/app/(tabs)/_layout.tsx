import { router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/tabs";
import { CalendarDays, House, Mic, Radar, Users, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GradientSurface } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { color, font, ledge, shadow } from "@/lib/theme";

// "me" stays a route (opened from the avatar on Today) but isn't in the bar.
const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: "Today" },
  watches: { icon: Radar, label: "Radar" },
  calendar: { icon: CalendarDays, label: "Calendar" },
  people: { icon: Users, label: "People" },
};

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const tabs = state.routes.flatMap((r, i) => {
    const meta = ICONS[r.name];
    if (!meta) return [];
    const on = state.index === i;
    const Icon = meta.icon;
    return (
      <Pressable
        key={r.key}
        onPress={() => {
          if (!on) haptic.tap();
          navigateToTab(r.key);
        }}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
      >
        <Icon size={21} color={on ? color.ink : color.faint} strokeWidth={on ? 2.4 : 2} />
        <Text style={[styles.tabLabel, { color: on ? color.ink : color.muted }]}>{meta.label}</Text>
      </Pressable>
    );
  });
  const orb = (
    <Pressable
      key="orb"
      onPress={() => {
        haptic.heavy();
        router.push("/voice");
      }}
      accessibilityLabel="Talk to Xerxes"
      style={styles.orbWrap}
    >
      <View style={[styles.orbLedge, { backgroundColor: ledge.primary }]} />
      <GradientSurface name="primary" style={styles.orb}>
        <Mic size={24} color="#fff" strokeWidth={2.3} />
      </GradientSurface>
    </Pressable>
  );
  const items = [...tabs.slice(0, 2), orb, ...tabs.slice(2)];
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, shadow.float]}>{items}</View>
    </View>
  );
}

export default function TabLayout() {
  return (
    // "shift": the new tab slides in a touch from the side it sits on and cross-fades, instead of a hard cut.
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, animation: "shift", sceneStyle: { backgroundColor: color.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="watches" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="people" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: 14 },
  bar: {
    width: "100%",
    maxWidth: 520,
    height: 68,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
  },
  tab: { alignItems: "center", gap: 4, minWidth: 58, paddingVertical: 6 },
  tabLabel: { fontFamily: font.strong, fontSize: 11 },
  orbWrap: { width: 62, height: 66, marginTop: -30, alignItems: "center" },
  orbLedge: { position: "absolute", top: 5, width: 60, height: 60, borderRadius: 21 },
  orb: { width: 60, height: 60, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
