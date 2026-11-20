import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";

// Runs one agent turn through Codex CLI (`codex exec --json`), with Xerxes tools mounted over MCP.
// Auth comes from CODEX_HOME (defaults to ~/.codex) — log in once with `codex login` on the host/container.

export type CodexTurn = { threadId?: string; text: string };

export const CODEX_NOT_LOGGED_IN = "Codex is not logged in on the server. Run `codex login --device-auth` on the backend host (Docker: `docker compose exec backend codex login --device-auth`).";

export class CodexAuthError extends Error {
  constructor() {
    super(CODEX_NOT_LOGGED_IN);
  }
}

const bin = () => process.env.CODEX_BIN ?? "codex";
let authCache: { ok: boolean; at: number } | undefined;

/** `codex login status` (exit 0 = logged in). Positive results cached 5 min; negatives re-checked every call. */
export function codexLoggedIn(): Promise<boolean> {
  if (authCache?.ok && Date.now() - authCache.at < 5 * 60_000) return Promise.resolve(true);
  return new Promise((resolve) => {
    const child = spawn(bin(), ["login", "status"], { env: process.env, shell: process.platform === "win32", stdio: "ignore" });
    const t = setTimeout(() => child.kill(), 15_000);
    child.on("error", () => (clearTimeout(t), resolve(false)));
    child.on("close", (code) => {
      clearTimeout(t);
      authCache = { ok: code === 0, at: Date.now() };
      resolve(code === 0);
    });
  });
}

const TURN_TIMEOUT_MS = Number(process.env.CODEX_TURN_TIMEOUT_MS ?? 240_000);

const WORKDIR = path.resolve(env.dataDir, "codex-work");
mkdirSync(WORKDIR, { recursive: true });

export async function runCodex(opts: {
  prompt: string;
  threadId?: string;
  mcpUrl: string;
  onMessage?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<CodexTurn> {
  if (!(await codexLoggedIn())) throw new CodexAuthError();
  const cfg = [
    `mcp_servers.xerxes.url="${opts.mcpUrl}"`,
    `mcp_servers.xerxes.tool_timeout_sec=60`,
    `mcp_servers.xerxes.default_tools_approval_mode="approve"`,
    `approval_policy="never"`,
    `sandbox_mode="read-only"`,
    `model_reasoning_effort="${process.env.CODEX_REASONING ?? "low"}"`,
    `web_search="disabled"`,
  ].flatMap((c) => ["-c", c]);
  const common = ["--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", ...cfg];
  if (process.env.CODEX_MODEL) common.push("-m", process.env.CODEX_MODEL);
  const args = opts.threadId ? ["exec", "resume", ...common, opts.threadId, "-"] : ["exec", ...common, "-"];

  return new Promise((resolve, reject) => {
    const child = spawn(bin(), args, {
      cwd: WORKDIR,
      env: process.env,
      shell: process.platform === "win32", // resolve .cmd shims on Windows; args contain no user text
      signal: opts.signal,
    });
    let threadId = opts.threadId;
    const messages: string[] = [];
    let buf = "";
    let stderr = "";
    let lastError = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "thread.started") threadId = ev.thread_id;
          else if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
            messages.push(ev.item.text);
            opts.onMessage?.(ev.item.text);
          } else if (ev.type === "error" || ev.type === "turn.failed") lastError = ev.message ?? ev.error?.message ?? line;
        } catch {
          /* ignore non-JSON */
        }
      }
    });
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    // Unauthenticated / stuck codex retries forever — cap the turn.
    const timer = setTimeout(() => {
      lastError ||= `turn timed out after ${Math.round(TURN_TIMEOUT_MS / 1000)}s`;
      child.kill();
    }, TURN_TIMEOUT_MS);
    child.on("error", (e) => (clearTimeout(timer), reject(e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = `${lastError} ${stderr}`;
      if (!messages.length && /not logged in|401 Unauthorized|login required|refresh token/i.test(out)) {
        authCache = undefined;
        return reject(new CodexAuthError());
      }
      if (code === 0 || messages.length) resolve({ threadId, text: messages.at(-1) ?? "" });
      else reject(new Error(`codex exited ${code}: ${lastError || stderr.slice(-800)}`));
    });
    child.stdin.end(opts.prompt);
  });
}
