import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";
import { HttpError } from "./http.js";

// Photos the user sends in a chat ("find this cheaper", "something like this"): saved under the data dir, served
// back to the app for the chat bubble, and handed to the agent's model as images (codex --image).

const DIR = path.resolve(env.dataDir, "uploads");
const MAX_BYTES = 10 * 1024 * 1024;

/** What we accept, told apart by their first bytes (the label in the data URL is only a hint). */
const KINDS = [
  { ext: "jpg", mime: "image/jpeg", is: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", is: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", is: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { ext: "gif", mime: "image/gif", is: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "GIF8" },
];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

/** The file behind an upload id, if the id is one of ours (never a path someone made up). */
const fileOf = (id: string) => (ID.test(id) ? path.join(DIR, id) : undefined);

/** Upload ids from a chat message → their files, for the agent. Missing or made-up ids are a readable 400. */
export async function uploadFiles(ids: unknown): Promise<string[]> {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) throw new HttpError(400, "images: send the upload ids");
  if (ids.length > 4) throw new HttpError(400, "Up to 4 photos at a time");
  return Promise.all(
    (ids as string[]).map(async (id) => {
      const file = fileOf(id);
      if (!file || !(await access(file).then(() => true, () => false))) throw new HttpError(400, "One of the photos didn't upload. Attach it again?");
      return file;
    }),
  );
}

export function uploadRoutes(app: Hono) {
  // { data: "data:image/jpeg;base64,..." } → { id, path }
  app.post("/api/uploads", async (c) => {
    const body: { data?: unknown } = await c.req.json().catch(() => ({}));
    const m = typeof body.data === "string" ? body.data.match(/^data:([\w/+.-]*);base64,([\s\S]*)$/) : null;
    if (!m) return c.json({ error: "Send the photo as a data URL" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (!bytes.length) return c.json({ error: "That photo came through empty. Try again?" }, 400);
    if (bytes.length > MAX_BYTES) return c.json({ error: "That photo is too big (10 MB at most)" }, 400);
    const kind = KINDS.find((k) => k.is(bytes));
    if (!kind) return c.json({ error: "Xerxes can read JPEG, PNG, WebP or GIF photos" }, 400);
    await mkdir(DIR, { recursive: true });
    const id = `${randomUUID()}.${kind.ext}`;
    await writeFile(path.join(DIR, id), bytes);
    console.log(`[uploads] ${id} (${Math.round(bytes.length / 1024)} KB)`);
    return c.json({ id, path: `/api/uploads/${id}` });
  });

  app.get("/api/uploads/:id", async (c) => {
    const file = fileOf(c.req.param("id"));
    const bytes = file ? await readFile(file).catch(() => null) : null;
    if (!file || !bytes) return c.json({ error: "not found" }, 404);
    const mime = KINDS.find((k) => file.endsWith(`.${k.ext}`))!.mime;
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" } });
  });
}
