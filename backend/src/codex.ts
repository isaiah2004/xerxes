import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "./env.js";

// Runs one agent turn through Codex CLI (`codex exec --json`), with Xerxes tools mounted over MCP.
// Auth comes from CODEX_HOME (defaults to ~/.codex) — log in once with `codex login` on the host/container.

export type CodexTurn = { threadId?: string; text: string };

const WORKDIR = path.resolve(env.dataDir, "codex-work");
mkdirSync(WORKDIR, { recursive: true });

export function runCodex(opts: {
  prompt: string;
  threadId?: string;
  mcpUrl: string;
  onMessage?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<CodexTurn> {
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
    const child = spawn(process.env.CODEX_BIN ?? "codex", args, {
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || messages.length) resolve({ threadId, text: messages.at(-1) ?? "" });
      else reject(new Error(`codex exited ${code}: ${lastError || stderr.slice(-800)}`));
    });
    child.stdin.end(opts.prompt);
  });
}
