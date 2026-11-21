import Constants from "expo-constants";
import { Platform } from "react-native";

// Backend base URL: EXPO_PUBLIC_API_URL (e.g. the Railway URL) wins; in dev, use the machine running Metro.
function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:8787`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:8787`;
}
export const API = resolveBase();

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

// ---------- types (mirror backend) ----------
export type Money = { amount: number; currency: string };
export type Person = { id: string; name: string; relation: string; birthDate?: string; interests: string[]; notes: string[] };
export type Upcoming = {
  id: string;
  kind: "birthday" | "anniversary" | "festival" | "other";
  label: string;
  nextDate: string;
  daysLeft: number;
  arriveBy: string;
  turningAge?: number;
  budget: Money;
  people: Person[];
  inReminderWindow: boolean;
};
export type Notification = {
  id: string;
  kind: "game" | "hardware" | "book" | "product" | "occasion" | "agent";
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  price?: string;
  createdAt: string;
  read: boolean;
};
export type Watch = { id: string; kind: string; query: string; maxPrice?: Money; notes?: string; projectId?: string; active: boolean; lastCheckedAt?: string; lastError?: string };

/** A bucket of context for a chain of purchases: how things are now, what was bought, what's planned, what was asked. */
export type ProjectIcon = "home" | "sofa" | "server" | "book" | "game" | "gift" | "camera" | "plant" | "fitness" | "travel" | "kitchen" | "other";
export type ProjectEntryKind = "setup" | "plan" | "purchase" | "search";
export type ProjectEntry = {
  id: string;
  kind: ProjectEntryKind;
  text: string;
  price?: Money;
  /** purchases: the day it was bought (YYYY-MM-DD) */
  date?: string;
  url?: string;
  /** searches: what Xerxes came back with */
  reply?: string;
  conversationId?: string;
  at: string;
};
export type ProjectSummary = {
  id: string;
  name: string;
  icon: ProjectIcon;
  goal?: string;
  budget?: Money;
  status: "active" | "done";
  createdAt: string;
  updatedAt: string;
  /** purchases in the project's currency */
  spent: Money;
  counts: Record<ProjectEntryKind | "watch", number>;
  nextPlan?: string;
};
export type Project = ProjectSummary & { entries: ProjectEntry[]; watches: Watch[] };

export type Feed = {
  profile: { name: string; city: string; postalCode: string; country: string; currency: string };
  nudges: Upcoming[];
  upcoming: Upcoming[];
  notifications: Notification[];
  watches: Watch[];
  projects: ProjectSummary[];
  shortlist: unknown[];
};

/** briefing: the centre mic button, the only call that opens with "what's new" (an upcoming birthday, a deal...). */
export type VoiceStart = { conversationId?: string; occasionId?: string; projectId?: string; topic?: string; context?: string; hello?: string; briefing?: boolean };

export type Verdict = "safe" | "tight" | "late" | "over_budget" | "late_and_over_budget" | "info";
export type ProductItem = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
  retailer?: string;
  price?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  tags?: string[];
  arrives?: string;
  spareDays?: number;
  deliveryEstimated?: boolean;
  verdict?: Verdict;
  bestPick?: boolean;
  reason?: string;
};
export type Card =
  | { id: string; type: "products"; heading: string; items: ProductItem[] }
  | {
      id: string;
      type: "recommendation";
      item: ProductItem;
      budget?: number;
      occasionLabel?: string;
      occasionDate?: string;
      arriveBy?: string;
      ships?: string;
      checks: string[];
      why: string;
      followUp?: string;
    }
  | { id: string; type: "question"; question: string; options: string[] }
  | { id: string; type: "watch"; watch: Watch }
  | {
      id: string;
      type: "project";
      project: { id: string; name: string; icon: ProjectIcon };
      created?: boolean;
      added?: { kind: ProjectEntryKind; text: string; price?: Money };
    };

export type RunEvent =
  | { seq: number; type: "step"; stepId: string; label: string; state: "running" | "done" | "error"; detail?: string }
  | { seq: number; type: "card"; card: Card }
  | { seq: number; type: "message"; text: string }
  | { seq: number; type: "error"; message: string }
  | { seq: number; type: "done" };

// ---------- endpoints ----------
export const api = {
  feed: () => j<Feed>("/api/feed"),
  newConversation: () => j<{ id: string }>("/api/conversations", { method: "POST" }),
  /** projectId: a chat opened from a project builds on it (and lands in its searches). */
  send: (conversationId: string, text: string, projectId?: string) =>
    j<{ runId: string }>(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text, projectId }) }),
  run: (runId: string, after: number) => j<{ status: "running" | "done" | "error"; events: RunEvent[] }>(`/api/runs/${runId}?after=${after}`),
  markRead: (id: string) => j(`/api/notifications/${id}/read`, { method: "POST" }),
  ttsUrl: (text: string) => `${API}/api/tts?text=${encodeURIComponent(text)}`,
  /** topic/context/hello: where the call started (an Ask Xerxes card, a Radar find) so Xerxes opens on it. */
  voiceStart: (start: VoiceStart = {}) =>
    j<{ sessionId: string; appId: string; channel: string; uid: number; agentUid: number; token: string; agentId: string; greeting: string }>(
      "/api/voice/start",
      { method: "POST", body: JSON.stringify(start) },
    ),
  voiceStop: (sessionId: string) => j("/api/voice/stop", { method: "POST", body: JSON.stringify({ sessionId }) }),
  voiceSession: (id: string) => j<{ runIds: string[]; runs: ({ id: string; userText: string; status: string } | null)[] }>(`/api/voice/sessions/${id}`),
};

// ---------- manage it yourself: Radar watches, Calendar occasions, Fresh finds ----------
export type WatchKind = "game" | "hardware" | "book" | "product";
export type OccasionKind = Upcoming["kind"];
/** The stored fields behind a feed occasion (the feed sends them alongside the computed ones). */
export type OccasionFields = {
  date: string; // MM-DD = every year, YYYY-MM-DD = once
  personIds: string[];
  remindDaysBefore: number;
  bufferDays: number;
};
export type OccasionInput = {
  kind: OccasionKind;
  label: string;
  date: string;
  personIds?: string[];
  /** someone Xerxes doesn't know yet (remembered as a person) */
  newPerson?: { name: string; relation?: string };
  budget: Money;
  remindDaysBefore?: number;
  bufferDays?: number;
};
export type SavedOccasion = OccasionFields & { id: string; kind: OccasionKind; label: string; budget: Money; nextDate: string | null };
export type PersonInput = { name: string; relation?: string; interests?: string[]; notes?: string[] };
export type PersonPatch = Partial<PersonInput>;
export type WatchInput = { kind: WatchKind; query: string; maxPrice?: Money; notes?: string; projectId?: string };
export type WatchPatch = { active?: boolean; query?: string; maxPrice?: Money | null; notes?: string | null; projectId?: string | null };
export type ProjectInput = { name: string; icon: ProjectIcon; goal?: string; budget?: Money };
export type ProjectPatch = { name?: string; icon?: ProjectIcon; goal?: string | null; budget?: Money | null; status?: "active" | "done" };
/** planId: this purchase is a planned item that was bought, so the plan comes off the list. */
export type EntryInput = { kind: Exclude<ProjectEntryKind, "search">; text: string; price?: Money; date?: string; url?: string; planId?: string };
export type EntryPatch = { kind?: Exclude<ProjectEntryKind, "search">; text?: string; price?: Money | null; date?: string | null; url?: string | null };

const init = (method: "POST" | "PATCH" | "DELETE", body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const at = (id: string) => encodeURIComponent(id);

export const manage = {
  people: () => j<Person[]>("/api/people"),
  addPerson: (p: PersonInput) => j<Person>("/api/people", init("POST", p)),
  updatePerson: (id: string, patch: PersonPatch) => j<Person>(`/api/people/${at(id)}`, init("PATCH", patch)),
  /** removedOccasions: birthdays/anniversaries that were only theirs, gone with them */
  deletePerson: (id: string) => j<{ ok: true; id: string; removedOccasions: string[] }>(`/api/people/${at(id)}`, init("DELETE")),
  addWatch: (w: WatchInput) => j<Watch>("/api/watches", init("POST", w)),
  updateWatch: (id: string, patch: WatchPatch) => j<Watch>(`/api/watches/${at(id)}`, init("PATCH", patch)),
  deleteWatch: (id: string) => j<{ ok: true }>(`/api/watches/${at(id)}`, init("DELETE")),
  addOccasion: (o: OccasionInput & { id?: string }) => j<SavedOccasion>("/api/occasions", init("POST", o)),
  updateOccasion: (id: string, patch: Partial<OccasionInput>) => j<SavedOccasion>(`/api/occasions/${at(id)}`, init("PATCH", patch)),
  deleteOccasion: (id: string) => j<{ ok: true; removed: OccasionFields & OccasionInput & { id: string } }>(`/api/occasions/${at(id)}`, init("DELETE")),
  /** Removes a Fresh find from the feed for good (the same deal won't be announced again). */
  dismissFind: (id: string) => j<{ ok: true }>(`/api/notifications/${at(id)}`, init("DELETE")),
  // projects: every change returns the whole project, so a screen just shows what comes back
  project: (id: string) => j<Project>(`/api/projects/${at(id)}`),
  addProject: (p: ProjectInput) => j<Project>("/api/projects", init("POST", p)),
  updateProject: (id: string, patch: ProjectPatch) => j<Project>(`/api/projects/${at(id)}`, init("PATCH", patch)),
  deleteProject: (id: string) => j<{ ok: true }>(`/api/projects/${at(id)}`, init("DELETE")),
  addEntry: (projectId: string, e: EntryInput) => j<Project>(`/api/projects/${at(projectId)}/entries`, init("POST", e)),
  updateEntry: (projectId: string, entryId: string, patch: EntryPatch) => j<Project>(`/api/projects/${at(projectId)}/entries/${at(entryId)}`, init("PATCH", patch)),
  deleteEntry: (projectId: string, entryId: string) => j<Project>(`/api/projects/${at(projectId)}/entries/${at(entryId)}`, init("DELETE")),
};
