import { Image } from "expo-image";
import { AlertTriangle, ImagePlus, Link2, RotateCcw, X } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { haptic } from "@/lib/haptics";
import { openLink, site } from "@/lib/links";
import { useUnfurl } from "@/lib/unfurl";
import type { Photo } from "@/lib/usePhotos";
import { color, font } from "@/lib/theme";
import { Spinner } from "./cards";
import { Card, Chip, Row, T, Tap } from "./ui";

// Photos and links: what you add in the message box, and how they show in the message you sent.

// ---------------------------------------------------------------- message box
/** Left of the message box: add a photo (camera or library on a phone, the file picker on the web). */
export function AttachButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={disabled ? "Add a photo (4 at most)" : "Add a photo"}
      accessibilityState={{ disabled }}
    >
      {({ pressed }) => (
        <View style={[styles.attach, { backgroundColor: pressed ? color.chip : "#fff", opacity: disabled ? 0.4 : 1 }]}>
          <ImagePlus size={20} color={color.ink2} strokeWidth={2.1} />
        </View>
      )}
    </Pressable>
  );
}

/** Four fit in a row in the message box on a 390 pt phone. */
const THUMB = 50;

/** The photos going with the next message: a spinner while each uploads, × to take one out, and what to do if one fails. */
export function PhotoStrip({ photos, onRemove, onRetry }: { photos: Photo[]; onRemove: (key: string) => void; onRetry: (key?: string) => void }) {
  const failed = photos.filter((p) => p.status === "error");
  const canRetry = failed.some((p) => p.data);
  return (
    <View style={{ gap: 8, marginBottom: 8 }}>
      <Row gap={6} wrap>
        {photos.map((p) => (
          <Thumb key={p.key} photo={p} onRemove={() => onRemove(p.key)} onRetry={() => onRetry(p.key)} />
        ))}
      </Row>
      {failed.length ? (
        <Row gap={8} style={{ alignItems: "flex-start" }}>
          <View style={{ marginTop: 1 }}>
            <AlertTriangle size={14} color={color.bad} strokeWidth={2.4} />
          </View>
          <T v="caption" style={{ color: color.bad, flex: 1 }} accessibilityRole="alert">
            {failed.length > 1 ? `${failed.length} photos didn’t upload. ` : ""}
            {failed[0].error ?? "That photo didn’t upload."}
          </T>
          {canRetry ? (
            <Pressable onPress={() => onRetry()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try the upload again">
              <T v="caption" style={{ color: color.bad, fontFamily: font.strong, textDecorationLine: "underline" }}>
                Try again
              </T>
            </Pressable>
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}

function Thumb({ photo, onRemove, onRetry }: { photo: Photo; onRemove: () => void; onRetry: () => void }) {
  return (
    <View style={styles.thumb}>
      <Image source={{ uri: photo.uri }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
      {photo.status === "uploading" ? (
        <View style={[StyleSheet.absoluteFill, styles.veil]} accessibilityLabel="Uploading photo">
          <Spinner size={18} tint="#fff" />
        </View>
      ) : null}
      {photo.status === "error" ? (
        <Pressable
          onPress={onRetry}
          disabled={!photo.data}
          style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: "rgba(166,60,60,0.66)" }]}
          accessibilityRole="button"
          accessibilityLabel={photo.data ? "Try uploading this photo again" : (photo.error ?? "This photo can’t be sent")}
        >
          {photo.data ? <RotateCcw size={20} color="#fff" strokeWidth={2.6} /> : <AlertTriangle size={20} color="#fff" strokeWidth={2.4} />}
        </Pressable>
      ) : null}
      <Pressable onPress={onRemove} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel="Remove photo">
        <X size={11} color="#fff" strokeWidth={3} />
      </Pressable>
    </View>
  );
}

/** A problem opening the camera or the library, with a way to put it away. */
export function AttachNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <Row gap={8} style={{ alignItems: "flex-start", marginBottom: 8 }}>
      <View style={{ marginTop: 1 }}>
        <AlertTriangle size={14} color={color.bad} strokeWidth={2.4} />
      </View>
      <T v="caption" style={{ color: color.bad, flex: 1 }} accessibilityRole="alert">
        {text}
      </T>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X size={14} color={color.bad} strokeWidth={2.6} />
      </Pressable>
    </Row>
  );
}

/** The page's picture (over a link mark, which shows while it loads or if there's none), or a spinner while the page is read. */
function LinkThumb({ image, loading, size, bg }: { image?: string; loading: boolean; size: number; bg: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const pic = image && /^https?:\/\//i.test(image) && broken !== image ? image : undefined;
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), backgroundColor: bg, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      {loading ? <Spinner size={Math.round(size * 0.38)} /> : <Link2 size={Math.round(size * 0.44)} color={color.muted} strokeWidth={2.2} />}
      {pic && !loading ? (
        <Image source={{ uri: pic }} style={[StyleSheet.absoluteFill, { width: size, height: size }]} contentFit="cover" transition={150} onError={() => setBroken(pic)} />
      ) : null}
    </View>
  );
}

/** Above the text while it has a link in it: what Xerxes will be reading. Looked up once the link stops changing. */
export function LinkChip({ url }: { url: string }) {
  const page = useUnfurl(url, 400);
  const host = page?.site || site(url);
  const meta = page ? [page.title ? host : undefined, page.price].filter(Boolean).join(" · ") : "Reading the page…";
  return (
    <View style={styles.chip} accessible accessibilityLabel={`Link: ${[page?.title || host, meta].filter(Boolean).join(". ")}`}>
      <Row gap={10}>
        <LinkThumb image={page?.image} loading={!page} size={36} bg="#fff" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong" numberOfLines={1} style={{ fontSize: 13.5, lineHeight: 18 }}>
            {page?.title || host}
          </T>
          {meta ? (
            <T v="caption" numberOfLines={1}>
              {meta}
            </T>
          ) : null}
        </View>
      </Row>
    </View>
  );
}

// ---------------------------------------------------------------- sent message
/** How wide the photos in a sent message are. */
export const PHOTOS_WIDTH = 220;
const GAP = 4;
const CELL = (PHOTOS_WIDTH - GAP) / 2;
const PHOTO_BG = "rgba(255,255,255,0.08)";

function PhotoTap({ uri, label, children }: { uri: string; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={() => void openLink(uri)} accessibilityRole="imagebutton" accessibilityLabel={label} accessibilityHint="Opens it full size">
      {children}
    </Pressable>
  );
}

/** One photo, large: its own shape, kept between 3:4 and 16:10 (a tall screenshot is cropped, not a strip). */
function OnePhoto({ uri, tail }: { uri: string; tail?: boolean }) {
  const [ratio, setRatio] = useState(1);
  const height = Math.round(PHOTOS_WIDTH / ratio);
  return (
    <PhotoTap uri={uri} label="Photo">
      <View style={{ width: PHOTOS_WIDTH, height, borderRadius: 16, borderBottomRightRadius: tail ? 4 : 16, overflow: "hidden", backgroundColor: PHOTO_BG }}>
        <Image
          source={{ uri }}
          style={{ width: PHOTOS_WIDTH, height }}
          contentFit="cover"
          transition={200}
          onLoad={(e) => {
            const { width, height: h } = e.source;
            if (width > 0 && h > 0) setRatio(Math.min(1.6, Math.max(0.75, width / h)));
          }}
        />
      </View>
    </PhotoTap>
  );
}

/** The photos in a sent message: one shows large; several sit in a small grid (with three, the first goes wide). */
export function PhotoGrid({ uris, tail }: { uris: string[]; tail?: boolean }) {
  if (uris.length === 1) return <OnePhoto uri={uris[0]} tail={tail} />;
  return (
    <Row gap={GAP} wrap style={{ width: PHOTOS_WIDTH }}>
      {uris.map((uri, i) => {
        const width = uris.length === 3 && i === 0 ? PHOTOS_WIDTH : CELL;
        return (
          <PhotoTap key={`${uri}-${i}`} uri={uri} label={`Photo ${i + 1} of ${uris.length}`}>
            <View style={{ width, height: CELL, borderRadius: 12, overflow: "hidden", backgroundColor: PHOTO_BG }}>
              <Image source={{ uri }} style={{ width, height: CELL }} contentFit="cover" transition={200} />
            </View>
          </PhotoTap>
        );
      })}
    </Row>
  );
}

/** "amazon.in/dp/B0CHX1W1XY": the link without the protocol, for when the page has no title. */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "");

/** Under a sent message, one per link in it: picture, title, site and price. Tap to open the page. */
export function LinkCard({ url }: { url: string }) {
  const page = useUnfurl(url);
  const host = page?.site || site(url);
  return (
    <Tap onPress={() => void openLink(url)} scale={0.985} accessibilityLabel={`Open ${page?.title || host}`} style={{ width: 272, maxWidth: "100%" }}>
      <Card pad={10}>
        <Row gap={10}>
          <LinkThumb image={page?.image} loading={!page} size={56} bg={color.chip} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T v="bodyStrong" numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 18 }}>
              {page?.title || host}
            </T>
            <Row gap={6}>
              <T v="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                {page?.title ? host : shortUrl(url)}
              </T>
              {page?.price ? <Chip label={page.price} tone="ok" /> : null}
            </Row>
          </View>
        </Row>
      </Card>
    </Tap>
  );
}

const styles = StyleSheet.create({
  attach: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 12, overflow: "hidden", backgroundColor: color.chip },
  veil: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(16,24,40,0.38)" },
  remove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(16,24,40,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  chip: { backgroundColor: color.chip, borderRadius: 12, padding: 6, paddingRight: 10, marginBottom: 8 },
});
