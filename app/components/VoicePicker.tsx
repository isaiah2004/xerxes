import { Check, Pause, Play } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { api, type Settings, type Voice, type Voices } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { color, radius } from "@/lib/theme";
import { FormError, Sheet, SheetBody } from "./Sheet";
import { useSpeaker } from "./Speak";
import { Chip, Row, Segmented, T, Tap } from "./ui";

// Profile → Voice: every Murf Falcon voice that speaks the language Xerxes talks in, grouped (English by accent;
// other languages their own voices first). ▶ plays Xerxes' hello in that voice; tapping a voice picks it (and plays it).

type Filter = "all" | "Female" | "Male";

export function VoiceSheet({ open, onClose, settings, onSaved }: { open: boolean; onClose: () => void; settings: Settings | null; onSaved: (s: Settings) => void }) {
  const [list, setList] = useState<Voices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const speaker = useSpeaker();
  const code = settings?.language;
  const lang = settings?.languages.find((l) => l.code === code);
  // the voices for the language Xerxes talks in now; a list for another language is stale (loading until the new one comes)
  const shown = list && list.language === code ? list : null;
  const loaded = !!shown;

  // fetched on open, and again after the language changes; state is only set when the answer comes back
  useEffect(() => {
    if (!open || !code || loaded) return;
    let alive = true;
    api
      .voices(code)
      .then((v) => {
        if (!alive) return;
        setList(v);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, code, loaded]);

  const close = () => {
    speaker.stop();
    setError(null);
    onClose();
  };
  const keyOf = (v: Voice) => `${v.id}|${shown?.sample ?? ""}`;
  const play = (v: Voice) => shown && speaker.speak(shown.sample, v);
  const pick = (v: Voice) => {
    if (speaker.key !== keyOf(v)) play(v); // hear what you picked
    if (v.id === settings?.voice.id) return;
    setSaving(v.id);
    setError(null);
    api
      .setVoice(v.id)
      .then((s) => {
        haptic.success();
        onSaved(s);
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
      })
      .finally(() => setSaving(null));
  };

  const all = shown?.voices ?? [];
  const count = (f: Filter) => all.filter((v) => f === "all" || v.gender === f).length;
  const groups: [string, Voice[]][] = [];
  for (const v of all) {
    if (filter !== "all" && v.gender !== filter) continue;
    const g = groups.find(([name]) => name === v.group);
    if (g) g[1].push(v);
    else groups.push([v.group, [v]]);
  }

  // names the voice on now (in most languages it's in "Also speak X", below the fold); two lines at 390px with the
  // longest names. ▶︎ (U+FE0E) so iOS draws no emoji
  const now = settings ? `: ${settings.voice.name} now` : "";
  return (
    <Sheet open={open} onClose={close} title="Voice" subtitle={`Xerxes’ voice in ${lang?.name ?? "English"}, on calls and when it reads aloud${now}. Tap ▶︎ to listen.`}>
      <SheetBody gap={14}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: shown ? count("all") : undefined },
            { id: "Female", label: "Female", count: shown ? count("Female") : undefined },
            { id: "Male", label: "Male", count: shown ? count("Male") : undefined },
          ]}
        />
        {shown
          ? groups.map(([group, voices]) => (
              <View key={group} style={{ gap: 8 }}>
                <T v="eyebrow" style={{ marginLeft: 4 }}>
                  {group}
                </T>
                <View style={{ backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, paddingVertical: 2 }}>
                  {voices.map((v, i) => {
                    const mine = speaker.key === keyOf(v);
                    const on = v.id === settings?.voice.id;
                    return (
                      <View key={v.id}>
                        {i ? <View style={{ height: 1, backgroundColor: color.line, marginLeft: 62 }} /> : null}
                        <Row gap={12} style={{ paddingVertical: 9, paddingLeft: 12, paddingRight: 16 }}>
                          <Pressable onPress={() => play(v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${mine ? "Stop" : "Hear"} ${v.name}`}>
                            <View
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 19,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: mine ? color.primary : color.chip,
                              }}
                            >
                              {mine && speaker.state === "loading" ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : mine ? (
                                <Pause size={15} color="#fff" fill="#fff" strokeWidth={2.2} />
                              ) : (
                                <Play size={15} color={color.ink} fill={color.ink} strokeWidth={2} style={{ marginLeft: 2 }} />
                              )}
                            </View>
                          </Pressable>
                          <Tap onPress={() => pick(v)} scale={0.985} disabled={!!saving} accessibilityLabel={`${v.name}, ${v.about}${on ? ", selected" : ""}`} style={{ flex: 1 }}>
                            <Row gap={10}>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Row gap={6}>
                                  <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                                    {v.name}
                                  </T>
                                  {v.id === shown.defaultVoice ? <Chip label="Default" /> : null}
                                </Row>
                                <T v="caption" numberOfLines={1}>
                                  {v.about}
                                </T>
                              </View>
                              {saving === v.id ? <ActivityIndicator color={color.primary} /> : on ? <Check size={20} color={color.primary} strokeWidth={2.6} /> : null}
                            </Row>
                          </Tap>
                        </Row>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          : !error
            ? <ActivityIndicator color={color.primary} style={{ marginVertical: 28 }} />
            : null}
        {error ? <FormError text={error} /> : null}
        <T v="caption">Read-aloud switches right away. A call keeps the voice it started with, so calls switch from your next one. You can also just tell Xerxes: “use a male voice”.</T>
      </SheetBody>
    </Sheet>
  );
}
