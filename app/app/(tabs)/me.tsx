import { AudioLines, Bot, MapPin, Radio, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, Chip, IconTile, Row, SectionHeader, T } from "@/components/ui";
import { API, api, type Feed } from "@/lib/api";
import type { GradientName } from "@/lib/theme";

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

export default function Me() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [status, setStatus] = useState<Status>({});
  useEffect(() => {
    api.feed().then(setFeed).catch(() => undefined);
    fetch(`${API}/api/status`).then((r) => r.json()).then(setStatus).catch(() => undefined);
  }, []);
  const p = feed?.profile;

  return (
    <Screen>
      <View style={{ paddingHorizontal: 4 }}>
        <T v="sub">Profile</T>
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
        <Engine icon={AudioLines} grad="info" title="Voice of Xerxes" sub="Murf Falcon TTS" ok={status.voice?.murf} />
      </View>
      <T v="caption" style={{ marginTop: 14, textAlign: "center" }}>
        Connected to {API}
      </T>
    </Screen>
  );
}
