import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { color, palette, type GradientName } from "@/lib/theme";
import { IconTile } from "./ui";

/** Steam's portrait box art for a Steam store image (…steamstatic.com/…/apps/<appid>/…, hashed paths included). */
function steamPortrait(url?: string) {
  const [, host = "", path = ""] = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url ?? "") ?? [];
  const app = host.toLowerCase().includes("steamstatic.com") ? /\/apps\/(\d+)\//.exec(path)?.[1] : undefined;
  return app ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${app}/library_600x900.jpg` : undefined;
}

/** A find's cover, edge to edge in a rounded 2:3 frame. Steam games show their portrait box art, then the image the
 *  find came with; when nothing loads (or there's no image), the kind's icon tile. */
export function FindArt({ uri, icon, grad, w = 44, h = 66 }: { uri?: string; icon: LucideIcon; grad: GradientName; w?: number; h?: number }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [steamPortrait(uri), uri].find((s): s is string => !!s && !failed.includes(s));
  if (!src) return <IconTile icon={icon} grad={grad} size={w} />;
  const fail = () => setFailed((f) => [...f, src]);
  const frame = { width: w, height: h, borderRadius: 10 };
  return (
    <View style={[frame, { backgroundColor: color.chip, shadowColor: palette.navy, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }]}>
      <Image
        key={src} // a fresh view per candidate, so a late event from the one before can't knock this one out
        source={{ uri: src }}
        style={frame}
        contentFit="cover"
        transition={200}
        onError={fail}
        // "no image" placeholders load fine but are 1×1: move on to the next candidate
        onLoad={(e) => e.source.width <= 2 && fail()}
      />
    </View>
  );
}
