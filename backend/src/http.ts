import type { Context } from "hono";
import { z } from "zod";

// Shared bits for the app's "manage it yourself" routes: readable 400/404/409s and schema-checked JSON bodies.

export class HttpError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

export const fail = (c: Context, e: unknown) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
  throw e;
};

/** JSON body checked against a schema; the first problem becomes a readable 400. */
export async function parse<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  if (raw === undefined) throw new HttpError(400, "Send a JSON body");
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(400, i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message);
  }
  return r.data;
}

export const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "use a 3-letter currency code");
