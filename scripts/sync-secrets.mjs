#!/usr/bin/env node
// Merges raw key drops into backend/.env without ever printing a real value.
//   env.download  -> KEY="value" lines (Agora App ID / certificate, anything else)
//   api-key.txt   -> a single bare Murf API key  => MURF_API_KEY
//   llm-key.txt   -> (optional) bare LLM key, provider inferred from prefix
// Existing keys in backend/.env are preserved unless a source overrides them.
// Usage: node scripts/sync-secrets.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "backend", ".env");

/** Irreversible mask: keeps shape only (letters -> a, digits -> 1). */
export const mask = (v) => v.replace(/[A-Za-z]/g, "a").replace(/[0-9]/g, "1");

function parseEnv(text) {
  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    vars[m[1]] = v;
  }
  return vars;
}

const readIf = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : null);

const merged = existsSync(out) ? parseEnv(readFileSync(out, "utf8")) : {};
const sources = [];

const envDrop = readIf("env.download");
if (envDrop) Object.assign(merged, parseEnv(envDrop)), sources.push("env.download");

const murf = readIf("api-key.txt")?.trim();
if (murf) (merged.MURF_API_KEY = murf), sources.push("api-key.txt -> MURF_API_KEY");

const llm = readIf("llm-key.txt")?.trim();
if (llm) {
  const name = llm.startsWith("sk-ant-")
    ? "ANTHROPIC_API_KEY"
    : llm.startsWith("vck_")
      ? "AI_GATEWAY_API_KEY"
      : llm.startsWith("AIza")
        ? "GOOGLE_GENERATIVE_AI_API_KEY"
        : "OPENAI_API_KEY";
  merged[name] = llm;
  sources.push(`llm-key.txt -> ${name}`);
}

const body = Object.entries(merged)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join("\n");
writeFileSync(out, body + "\n");

console.log(`Wrote backend/.env from: ${sources.join(", ") || "(no sources found)"}`);
for (const [k, v] of Object.entries(merged)) console.log(`  ${k.padEnd(28)} ${mask(v)}  (len ${v.length})`);
