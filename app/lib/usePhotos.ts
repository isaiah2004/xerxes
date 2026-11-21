import { useState } from "react";
import { api } from "./api";
import { pickPhotos, type PhotoSource } from "./photos";

/** The most photos one message carries (the backend takes 4). */
export const MAX_PHOTOS = 4;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A photo in the message box. It uploads as soon as it's picked; once "done" it has the upload id (sent with the
 * message) and url (shown in the bubble). data is kept only while a failed upload can be tried again.
 */
export type Photo = { key: string; uri: string; status: "uploading" | "done" | "error"; id?: string; url?: string; error?: string; data?: string };

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/** What went wrong, in words: the backend's own message (e.g. a photo it can't use), or that it can't be reached. */
function readable(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  if (!m || /network request failed|failed to fetch|load failed|networkerror/i.test(m)) return "Couldn’t reach Xerxes.";
  if (/^HTTP 413\b/.test(m)) return "That photo is too big to send (10 MB at most).";
  return m;
}

let next = 0;

export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  /** a problem opening the camera or library (no permission, a file that isn't a photo) */
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (key: string, change: Partial<Photo>) => setPhotos((all) => all.map((p) => (p.key === key ? { ...p, ...change } : p)));

  const upload = async (key: string, data: string) => {
    patch(key, { status: "uploading", error: undefined });
    try {
      const { id, path } = await api.upload(data);
      patch(key, { status: "done", id, url: api.uploadUrl(path), data: undefined });
    } catch (e) {
      patch(key, { status: "error", error: readable(e) });
    }
  };

  /** Opens the camera or the library; whatever comes back starts uploading straight away. */
  const add = async (source: PhotoSource) => {
    setNotice(null);
    const room = MAX_PHOTOS - photos.length;
    if (room < 1) return;
    let picked;
    try {
      picked = await pickPhotos(source, room);
    } catch (e) {
      setNotice(readable(e));
      return;
    }
    const fresh = picked.slice(0, room).map((p): Photo => {
      const tooBig = bytesOf(p.data) > MAX_BYTES; // no point sending it, or trying again
      return tooBig
        ? { key: `photo-${next++}`, uri: p.uri, status: "error", error: "That photo is too big to send (10 MB at most)." }
        : { key: `photo-${next++}`, uri: p.uri, status: "uploading", data: p.data };
    });
    if (!fresh.length) return;
    setPhotos((all) => [...all, ...fresh]);
    for (const p of fresh) if (p.data) void upload(p.key, p.data);
  };

  /** Tries the failed uploads again (one, by key, or all of them). */
  const retry = (key?: string) => {
    for (const p of photos) if (p.status === "error" && p.data && (!key || p.key === key)) void upload(p.key, p.data);
  };
  const remove = (key: string) => setPhotos((all) => all.filter((p) => p.key !== key));
  const clear = () => {
    setPhotos([]);
    setNotice(null);
  };

  return {
    photos,
    notice,
    dismissNotice: () => setNotice(null),
    add,
    retry,
    remove,
    clear,
    /** uploaded, ready to go with the message */
    ready: photos.filter((p) => p.status === "done" && p.id),
    uploading: photos.some((p) => p.status === "uploading"),
    failed: photos.some((p) => p.status === "error"),
    full: photos.length >= MAX_PHOTOS,
  };
}
