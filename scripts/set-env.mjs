#!/usr/bin/env node
// Set non-secret keys in backend/.env without printing existing values.
//   node scripts/set-env.mjs PUBLIC_URL=https://xyz.trycloudflare.com [KEY=value ...]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "backend", ".env");
const lines = existsSync(out) ? readFileSync(out, "utf8").split(/\r?\n/).filter(Boolean) : [];
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) throw new Error(`expected KEY=value, got ${arg.split("=")[0]}`);
  const [, key, value] = m;
  const i = lines.findIndex((l) => l.replace(/^export\s+/, "").startsWith(`${key}=`));
  const line = `${key}=${JSON.stringify(value)}`;
  i >= 0 ? (lines[i] = line) : lines.push(line);
  console.log(`set ${key}`);
}
writeFileSync(out, lines.join("\n") + "\n");
