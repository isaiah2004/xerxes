// Photos for the chat, from the camera or the photo library (expo-image-picker), as data URLs for POST /api/uploads.
// A build made before expo-image-picker was added has no native module for it, and loading the package there throws
// (it calls requireNativeModule as it loads). So the package is only imported once photosAvailable says this build
// has the module, the same way voice.ts treats react-native-agora. Web uses photos.web.ts.
import { requireOptionalNativeModule } from "expo";
import type { ImagePickerAsset } from "expo-image-picker";

export type PhotoSource = "camera" | "library";
/** uri: a local copy for the preview; data: the photo as a data URL ("data:image/jpeg;base64,…"). */
export type PickedPhoto = { uri: string; data: string };

/** True when this build includes expo-image-picker's native module. */
export const photosAvailable = (() => {
  try {
    return requireOptionalNativeModule("ExponentImagePicker") != null;
  } catch {
    return false;
  }
})();

/** On a phone you can also take the photo there and then. */
export const cameraAvailable = photosAvailable;

/** JPEG quality: plenty for the agent to read a label, and a 12 MP photo stays a few MB. */
const QUALITY = 0.7;

/** The picker mostly hands back JPEG, but not always (PNGs on iOS, a GIF's first frame on Android): go by the bytes. */
function mimeOf(base64: string, fallback?: string | null) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return fallback || "image/jpeg";
}

/** Opens the camera or the library. Up to `max` photos; none if it's closed without one. */
export async function pickPhotos(source: PhotoSource, max: number): Promise<PickedPhoto[]> {
  if (!photosAvailable || max < 1) return [];
  const ImagePicker = await import("expo-image-picker");
  let result;
  if (source === "camera") {
    const allowed = await ImagePicker.requestCameraPermissionsAsync();
    if (!allowed.granted)
      throw new Error(
        allowed.canAskAgain ? "Xerxes needs the camera to take a photo. Try again and choose Allow." : "Camera access is off for Xerxes. Turn it on in Settings.",
      );
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: QUALITY });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: QUALITY,
      allowsMultipleSelection: max > 1,
      selectionLimit: max,
    });
  }
  if (result.canceled) return [];
  return result.assets
    .filter((a): a is ImagePickerAsset & { base64: string } => !!a.base64)
    .slice(0, max)
    .map((a) => ({ uri: a.uri, data: `data:${mimeOf(a.base64, a.mimeType)};base64,${a.base64}` }));
}
