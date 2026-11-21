import { env } from "./env.js";
import type { Language } from "./languages.js";
import type { Db } from "./store.js";

// Xerxes' voice (Profile → Voice): any Murf Falcon voice that speaks the language Xerxes talks in. Murf's catalogue for
// falcon-2.1 (the model calls stream with) is fetched once and kept for a few hours. Each language keeps its own pick;
// until there is one, it's the language's own voice (Anisha, or Harshitha for Kannada).

type MurfVoice = {
  voiceId: string;
  displayName: string;
  locale: string;
  displayLanguage: string;
  description?: string;
  gender: string;
  supportedLocales?: Record<string, unknown>;
};

/** A voice as the picker shows it. locale: what it speaks this language as (an American voice speaks en-US). */
export type Voice = { id: string; name: string; gender: string; locale: string; group: string; about: string };
/** What's saved per language: enough to start a call without asking Murf again. */
export type VoicePick = NonNullable<Db["profile"]["voices"]>[string];

let cache: { at: number; list: MurfVoice[] } | undefined;
async function catalogue(): Promise<MurfVoice[]> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.list;
  if (!env.murfApiKey) throw new Error("MURF_API_KEY is not configured");
  // the voice list lives on api.murf.ai only (not the regional streaming host)
  const r = await fetch("https://api.murf.ai/v1/speech/voices?model=falcon-2.1", {
    headers: { "api-key": env.murfApiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Murf's voice list: ${r.status}`);
  const list = (await r.json()) as MurfVoice[];
  cache = { at: Date.now(), list };
  return list;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Harman (M)" → "Harman"; "en-IN-anisha" → "Anisha" */
export const voiceName = (id: string, displayName = "") => displayName.replace(/\s*\((M|F)\)\s*$/, "").trim() || cap(id.split("-").pop() ?? id);

/** English comes in three accents; any other language has its own voices first, then voices that also speak it. */
function groupsFor(lang: Language) {
  return lang.code === "en"
    ? [
        { locale: "en-IN", label: "Indian English", others: true },
        { locale: "en-US", label: "American English", others: false },
        { locale: "en-UK", label: "British English", others: false },
      ]
    : [
        { locale: lang.locale, label: `Native ${lang.name}`, others: false },
        { locale: lang.locale, label: `Also speak ${lang.name}`, others: true },
      ];
}

/** Every voice that can speak this language, grouped (see groupsFor), each group by name. */
export async function voicesFor(lang: Language): Promise<Voice[]> {
  const list = await catalogue();
  const out: Voice[] = [];
  const seen = new Set<string>();
  for (const g of groupsFor(lang)) {
    const speaks = list.filter((v) => v.supportedLocales?.[g.locale] && !seen.has(v.voiceId));
    // English groups put their own accent first, then (for Indian English) the Indian voices that speak it too
    const natives = speaks.filter((v) => v.locale === g.locale).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const others = speaks.filter((v) => v.locale !== g.locale).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const picked = lang.code === "en" ? [...natives, ...(g.others ? others : [])] : g.others ? others : natives;
    for (const v of picked) {
      seen.add(v.voiceId);
      const age = v.description ? cap(v.description.toLowerCase()) : "";
      out.push({
        id: v.voiceId,
        name: voiceName(v.voiceId, v.displayName),
        gender: v.gender,
        locale: g.locale,
        group: g.label,
        about: [v.gender, age, v.locale !== g.locale ? `${v.displayLanguage} voice` : ""].filter(Boolean).join(" · "),
      });
    }
  }
  return out;
}

/** The voice Xerxes speaks this language in: the saved pick, or the language's own. */
export function pickedVoice(db: Db, lang: Language): VoicePick {
  return db.profile.voices?.[lang.code] ?? { id: lang.voice, locale: lang.locale, name: voiceName(lang.voice) };
}

/** A voice by what someone would say: its name ("Samar"), or "a male voice" / "a female voice" (its own first). */
export async function findVoice(lang: Language, said: string): Promise<Voice | undefined> {
  const voices = await voicesFor(lang);
  const s = said.trim().toLowerCase();
  const byName = voices.find((v) => v.id.toLowerCase() === s || v.name.toLowerCase() === s) ?? voices.find((v) => new RegExp(`\\b${v.name.toLowerCase()}\\b`).test(s));
  if (byName) return byName;
  const gender = /\b(female|woman|women|lady|girl|feminine|her)\b/.test(s) ? "Female" : /\b(male|man|men|guy|boy|masculine|his)\b/.test(s) ? "Male" : undefined;
  return gender ? voices.find((v) => v.gender === gender) : undefined;
}
