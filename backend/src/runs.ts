import { randomUUID } from "node:crypto";

// A "run" is one agent turn. The app polls its events to render live steps and agent-generated cards.
export type Card = { id: string; type: string; [k: string]: unknown };
export type RunEvent =
  | { seq: number; type: "step"; stepId: string; label: string; state: "running" | "done" | "error"; detail?: string }
  | { seq: number; type: "card"; card: Card }
  | { seq: number; type: "message"; text: string }
  | { seq: number; type: "error"; message: string }
  | { seq: number; type: "done" };

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type RunEventInput = DistributiveOmit<RunEvent, "seq">;

export type Run = {
  id: string;
  conversationId: string;
  userText: string;
  status: "running" | "done" | "error";
  events: RunEvent[];
  createdAt: number;
  listeners: Set<(e: RunEvent) => void>;
};

const runs = new Map<string, Run>();

export function createRun(conversationId: string, userText: string): Run {
  const run: Run = {
    id: randomUUID(),
    conversationId,
    userText,
    status: "running",
    events: [],
    createdAt: Date.now(),
    listeners: new Set(),
  };
  runs.set(run.id, run);
  // GC old runs
  for (const [id, r] of runs) if (Date.now() - r.createdAt > 6 * 3600_000) runs.delete(id);
  return run;
}

export const getRun = (id: string) => runs.get(id);

export function emit(runId: string, e: RunEventInput) {
  const run = runs.get(runId);
  if (!run) return;
  const ev = { ...e, seq: run.events.length } as RunEvent;
  run.events.push(ev);
  if (e.type === "done") run.status = "done";
  if (e.type === "error") run.status = "error";
  for (const l of run.listeners) l(ev);
}

export const newCardId = () => randomUUID().slice(0, 8);
