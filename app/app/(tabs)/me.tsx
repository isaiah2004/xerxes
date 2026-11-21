import { router, useFocusEffect } from "expo-router";
import { AudioLines, Bot, CalendarDays, Check, ChevronRight, Eye, FolderOpen, Languages, MapPin, Mic, Radio, Users, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Screen } from "@/components/Screen";
import { FormError, Sheet, SheetBody } from "@/components/Sheet";
import { VoiceSheet } from "@/components/VoicePicker";
import { Button, Card, Chip, IconTile, Row, SectionHeader, T, Tap } from "@/components/ui";
import { API, api, type Feed, type Language, type Settings } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { color, radius, type GradientName } from "@/lib/theme";

type Status = { codexLoggedIn?: boolean; voice?: { publicUrl: string | null; reachable?: boolean; agora: boolean; murf: boolean } };

function Engine({ icon, grad, title, sub, ok, problem = "Setup" }: { icon: LucideIcon; grad: GradientName; title: string; sub: string; ok?: boolean; problem?: string }) {
  return (
    <Card>
      <Row gap={12}>
        <IconTile icon={icon} grad={grad} size={44} />
        <View style={{ flex: 1 }}>
          <T v="h3">{title}</T>
          <T v="caption">{sub}</T>
        </View>
        {ok === undefined ? null : <Chip label={ok ? "Ready" : problem} tone={ok ? "ok" : "warn"} />}
      </Row>
    </Card>
  );
}

/** Everything the screens can do, Xerxes can do when you just say it (on a call or in a chat). */
const SAY: { icon: LucideIcon; text: string }[] = [
  { icon: Users, text: "Add Priya, my colleague. She loves pottery." },
  { icon: CalendarDays, text: "Add Priya's birthday on 14 March, budget 1,500." },
  { icon: Eye, text: "Track the Steam Deck OLED under 40,000." },
  { icon: FolderOpen, text: "Start a project for my balcony garden." },
  { icon: Languages, text: "Talk to me in Hindi." },
];

const langLabel = (l?: Language) => (!l || l.code === "en" ? "English" : `${l.native} · ${l.name}`);

export default function Me() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [status, setStatus] = useState<Status>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voicing, setVoicing] = useState(false);
  /** what just changed and when it takes effect (chats now, calls from the next one) */
  const [note, setNote] = useState<string | null>(null);

  // every visit: a call or a chat may have changed the language or where gifts are delivered
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api.feed().then((f) => alive && setFeed(f)).catch(() => undefined);
      api.settings().then((s) => alive && setSettings(s)).catch(() => undefined);
      fetch(`${API}/api/status`)
        .then((r) => r.json())
        .then((s: Status) => alive && setStatus(s))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );
  const p = feed?.profile;
  const lang = settings?.languages.find((l) => l.code === settings.language);

  const choose = (code: string) => {
    if (code === settings?.language) return setPicking(false);
    setSaving(code);
    setError(null);
    api
      .setLanguage(code)
      .then((s) => {
        haptic.success();
        setSettings(s);
        const l = s.languages.find((x) => x.code === s.language);
        setNote(l ? `Chats are in ${l.name} from now on, in ${s.voice.name}'s voice. A call keeps its language, so voice switches from your next call.` : null);
        setPicking(false);
      })
      .catch((e: Error) => {
        haptic.error();
        setError(e.message);
      })
      .finally(() => setSaving(null));
  };

  return (
    <Screen>
      {/* the 18px on top is where the "Profile" line was, so the name sits where Today's greeting does */}
      <View style={{ paddingHorizontal: 4, paddingTop: 18 }}>
        <T v="display">{p?.name ?? "You"}</T>
      </View>
      <Card style={{ marginTop: 18 }}>
        <Row gap={12}>
          <IconTile icon={MapPin} grad="navy" size={44} />
          <View style={{ flex: 1 }}>
            <T v="h3">Deliver to</T>
            <T v="caption">
              {p ? `${p.city} ${p.postalCode} · ${p.country} · ${p.currency}` : "—"}
            </T>
          </View>
        </Row>
      </Card>

      <SectionHeader title="Settings" />
      <Tap onPress={() => setPicking(true)} scale={0.985} accessibilityLabel={`Language: ${langLabel(lang)}. Change the language Xerxes talks in`}>
        <Card>
          <Row gap={12}>
            <IconTile icon={Languages} grad="info" size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="h3">Language</T>
              <T v="caption" numberOfLines={2}>
                {settings ? langLabel(lang) : "—"} · what Xerxes hears, says and replies in
              </T>
            </View>
            <ChevronRight size={18} color={color.faint} />
          </Row>
        </Card>
      </Tap>
      <Tap onPress={() => setVoicing(true)} scale={0.985} style={{ marginTop: 10 }} accessibilityLabel={`Voice: ${settings?.voice.name ?? "Anisha"}. Change how Xerxes sounds`}>
        <Card>
          <Row gap={12}>
            <IconTile icon={AudioLines} grad="primary" size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="h3">Voice</T>
              <T v="caption" numberOfLines={2}>
                {settings ? `${settings.voice.name} · how Xerxes sounds in ${lang?.name ?? "English"}` : "—"}
              </T>
            </View>
            <ChevronRight size={18} color={color.faint} />
          </Row>
        </Card>
      </Tap>
      {note ? (
        <T v="caption" style={{ marginTop: 8, paddingHorizontal: 4 }}>
          {note}
        </T>
      ) : null}

      <SectionHeader title="Run the app by voice" />
      <Card>
        <T v="sub">Anything the app can do, Xerxes can do when you say it: people, calendar, tracking, projects and your profile.</T>
        <View style={{ gap: 10, marginTop: 12 }}>
          {SAY.map(({ icon: Icon, text }) => (
            <Row key={text} gap={10}>
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color.chip, alignItems: "center", justifyContent: "center" }}>
                <Icon size={15} color={color.ink2} strokeWidth={2.3} />
              </View>
              <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                “{text}”
              </T>
            </Row>
          ))}
        </View>
        <Button kind="grad" grad="primary" icon={Mic} label="Talk to Xerxes" style={{ marginTop: 14 }} onPress={() => router.push("/voice")} />
      </Card>

      <SectionHeader title="Under the hood" />
      <View style={{ gap: 10 }}>
        <Engine icon={Bot} grad="primary" title="Agent brain" sub="Codex CLI + Xerxes MCP tools" ok={status.codexLoggedIn} />
        <Engine
          icon={Radio}
          grad="navy"
          title="Real-time voice"
          sub="Agora Conversational AI Engine"
          ok={status.voice ? status.voice.agora && !!status.voice.publicUrl && status.voice.reachable !== false : undefined}
          problem={status.voice?.agora && status.voice.publicUrl && status.voice.reachable === false ? "Line down" : "Setup"}
        />
        <Engine icon={AudioLines} grad="info" title="Voice of Xerxes" sub={`Murf Falcon TTS${settings ? ` · ${settings.voice.name}` : ""}`} ok={status.voice?.murf} />
      </View>
      <T v="caption" style={{ marginTop: 14, textAlign: "center" }}>
        Connected to {API}
      </T>

      <Sheet
        open={picking}
        onClose={() => {
          setPicking(false);
          setError(null);
        }}
        title="Language"
        subtitle="What Xerxes listens for, speaks and replies in. The app's own text stays in English."
      >
        <SheetBody gap={14}>
          <View style={{ backgroundColor: color.card, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, paddingVertical: 4 }}>
            {(settings?.languages ?? []).map((l, i) => {
              const on = l.code === settings?.language;
              return (
                <View key={l.code}>
                  {i ? <View style={{ height: 1, backgroundColor: color.line, marginLeft: 16 }} /> : null}
                  <Tap onPress={() => choose(l.code)} scale={0.985} disabled={!!saving} accessibilityLabel={`${l.name}${on ? ", selected" : ""}`}>
                    <Row gap={12} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T v="h3">{l.native}</T>
                        {l.native !== l.name ? <T v="caption">{l.name}</T> : null}
                      </View>
                      {saving === l.code ? <ActivityIndicator color={color.primary} /> : on ? <Check size={20} color={color.primary} strokeWidth={2.6} /> : null}
                    </Row>
                  </Tap>
                </View>
              );
            })}
          </View>
          {error ? <FormError text={error} /> : null}
          <T v="caption">Chats switch right away; voice switches from your next call. You can also just tell Xerxes: “talk to me in Tamil”.</T>
        </SheetBody>
      </Sheet>
      <VoiceSheet
        open={voicing}
        onClose={() => setVoicing(false)}
        settings={settings}
        onSaved={(s) => {
          setSettings(s);
          setNote(`Read-aloud is in ${s.voice.name}'s voice now. A call keeps the voice it started with, so you'll hear ${s.voice.name} from your next call.`);
        }}
      />
    </Screen>
  );
}
