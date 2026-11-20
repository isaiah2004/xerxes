import { Children, isValidElement, type ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color } from "@/lib/theme";

/** Sections rise in one after another when a screen first opens, and again as data arrives (new sections mount).
 *  Quick and small so it reads as polish, not a loading show. */
function Stagger({ children }: { children: ReactNode }) {
  return Children.toArray(children).map((child, i) => (
    <Animated.View key={isValidElement(child) && child.key != null ? child.key : i} entering={FadeInDown.duration(360).delay(Math.min(i, 8) * 45)}>
      {child}
    </Animated.View>
  ));
}

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
  if (!scroll)
    return (
      <View style={[{ flex: 1, backgroundColor: color.paper }]}>
        <Animated.View entering={FadeIn.duration(300)} style={[inner, { flex: 1 }]}>
          {children}
        </Animated.View>
      </View>
    );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={{ paddingBottom: insets.bottom + bottomPad }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[color.primary]} tintColor={color.primary} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      <View style={inner}>
        <Stagger>{children}</Stagger>
      </View>
    </ScrollView>
  );
}
