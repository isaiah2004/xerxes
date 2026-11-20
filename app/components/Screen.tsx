import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color } from "@/lib/theme";

/** Paper background, safe areas, and a centered phone-width column on desktop web. */
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  bottomPad = 120,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  bottomPad?: number;
}) {
  const insets = useSafeAreaInsets();
  const inner = [{ width: "100%" as const, maxWidth: 520, alignSelf: "center" as const, paddingHorizontal: 18, paddingTop: insets.top + 14 }, contentStyle];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: color.paper }]}><View style={[inner, { flex: 1 }]}>{children}</View></View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={{ paddingBottom: insets.bottom + bottomPad }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      <View style={inner}>{children}</View>
    </ScrollView>
  );
}
