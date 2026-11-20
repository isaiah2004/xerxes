import { Link, Stack } from "expo-router";
import { View } from "react-native";
import { T } from "@/components/ui";
import { color } from "@/lib/theme";

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: color.paper, gap: 12 }}>
        <T v="h1">Nothing here</T>
        <Link href="/">
          <T v="bodyStrong" style={{ color: color.ok }}>
            Back to Today
          </T>
        </Link>
      </View>
    </>
  );
}
