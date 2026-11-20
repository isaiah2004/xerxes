import { useEffect, useState } from "react";
import { api, type RunEvent } from "./api";

type Status = "idle" | "running" | "done" | "error";
type RunState = { id?: string; events: RunEvent[]; status: Status };

/** Polls a run's events until it finishes. Cross-platform (no EventSource needed on native). */
export function useRun(runId: string | undefined): { events: RunEvent[]; status: Status } {
  const [state, setState] = useState<RunState>({ id: runId, events: [], status: runId ? "running" : "idle" });

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let cursor = -1;
    const tick = async () => {
      try {
        const r = await api.run(runId, cursor);
        if (!alive) return;
        if (r.events.length) cursor = r.events[r.events.length - 1].seq;
        setState((prev) => ({ id: runId, events: prev.id === runId ? [...prev.events, ...r.events] : r.events, status: r.status }));
        if (r.status === "running") setTimeout(tick, 650);
      } catch {
        if (alive) setTimeout(tick, 1500);
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [runId]);

  // a run we haven't heard back from yet reads as "running" with no events
  if (state.id !== runId) return { events: [], status: runId ? "running" : "idle" };
  return { events: state.events, status: state.status };
}

/** Collapse step start/finish pairs into one row per step. */
export function stepsOf(events: RunEvent[]) {
  const map = new Map<string, Extract<RunEvent, { type: "step" }>>();
  for (const e of events) if (e.type === "step") map.set(e.stepId, e);
  return [...map.values()];
}
