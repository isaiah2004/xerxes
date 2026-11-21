// Photos on the web: the browser's file picker (expo-image-picker's file input). Browsers don't compress what you pick
// (the picker's quality option is native-only), so a big photo is scaled down here before it's uploaded.
import * as ImagePicker from "expo-image-picker";

export type PhotoSource = "camera" | "library";
/** uri: a local copy for the preview; data: the photo as a data URL ("data:image/jpeg;base64,…"). */
export type PickedPhoto = { uri: string; data: string };

export const photosAvailable = true;
/** Just the file picker on the web (on a phone, the browser offers the camera from there). */
export const cameraAvailable = false;

/** Long side in px: about the most detail the model looks at anyway. */
const MAX_SIDE = 1600;
/** A photo under MAX_SIDE and this size goes as it is. */
const KEEP_BYTES = 1.5 * 1024 * 1024;
const QUALITY = 0.8;
const UNREADABLE = "Couldn’t read that photo. Try a JPEG or PNG.";

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(UNREADABLE)));
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.readAsDataURL(file);
  });
}

/** Redraws the photo at most MAX_SIDE across, as a JPEG on white (so a see-through PNG doesn't turn black). */
function shrink(uri: string) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error(UNREADABLE));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => reject(new Error(UNREADABLE));
    img.src = uri;
  });
}

function toDataUrl(a: ImagePicker.ImagePickerAsset): Promise<string> {
  const type = a.mimeType || a.file?.type || "";
  const small = Math.max(a.width, a.height) <= MAX_SIDE && (a.fileSize ?? a.file?.size ?? Infinity) <= KEEP_BYTES;
  // a GIF goes as it is, since redrawing keeps only its first frame (the upload turns away one that's too big)
  if (a.file && (type === "image/gif" || (small && /^image\/(jpeg|png|webp)$/.test(type)))) return readAsDataUrl(a.file);
  return shrink(a.uri);
}

/** Opens the file picker. Up to `max` photos; none if it's closed without one. */
export async function pickPhotos(_source: PhotoSource, max: number): Promise<PickedPhoto[]> {
  if (max < 1) return [];
  let result;
  try {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: max > 1 });
  } catch (e) {
    throw /unsupported file type/i.test(String(e)) ? new Error("That isn’t a photo. Pick a JPEG, PNG, WebP or GIF.") : e;
  }
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, max).map(async (a) => ({ uri: a.uri, data: await toDataUrl(a) })));
}
