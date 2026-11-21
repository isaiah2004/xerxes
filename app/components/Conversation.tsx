import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { haptic } from "@/lib/haptics";
import { openLink, splitLinks } from "@/lib/links";
import { stepsOf, useRun } from "@/lib/useRun";
import { color, palette } from "@/lib/theme";
import { LinkCard, PHOTOS_WIDTH, PhotoGrid } from "./Attachments";
import { AgentCard, StepsCard } from "./cards";
import { SpeakButton } from "./Speak";
import { Row, T } from "./ui";

/** images: the photos sent with the message (display URLs). */
export type Turn = { key: string; text: string; images?: string[]; runId?: string; error?: string };

export const clean = (s: string) =>
  s
    .replace(/\[context:[^\]]*\]/g, "")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

export function AgentBubble({ text, speak = true }: { text: string; speak?: boolean }) {
  return (
    <Row gap={8} style={{ alignItems: "flex-end", maxWidth: "92%" }}>
      <View
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: color.line,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          paddingHorizontal: 14,
          paddingVertical: 11,
          flexShrink: 1,
        }}
      >
        <T v="body" style={{ color: color.ink }}>
          {clean(text)}
        </T>
      </View>
      {speak ? <SpeakButton text={clean(text)} /> : null}
    </Row>
  );
}

/**
 * What you sent: photos above the text, links shortened (one at the start or end goes, one mid-sentence becomes its
 * site) and shown as preview cards under the bubble. A message that was only a link is just its card.
 */
export function UserBubble({ text, images }: { text: string; images?: string[] }) {
  const { parts, links } = splitLinks(clean(text));
  const photos = (images ?? []).filter(Boolean).slice(0, 4);
  const said = parts.length > 0;
  return (
    <View style={{ alignSelf: "flex-end", alignItems: "flex-end", maxWidth: "86%", gap: 6 }}>
      {said || photos.length ? (
        <View
          style={[
            { backgroundColor: color.ink, borderRadius: 20, borderBottomRightRadius: 6 },
            photos.length ? { padding: 4, width: PHOTOS_WIDTH + 8 } : { paddingHorizontal: 14, paddingVertical: 11 },
          ]}
        >
          {photos.length ? <PhotoGrid uris={photos} tail={!said} /> : null}
          {said ? (
            <T v="body" style={[{ color: "#fff" }, photos.length ? { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 7 } : null]}>
              {parts.map((p, i) =>
                p.url ? (
                  <Text key={i} onPress={() => void openLink(p.url)} style={{ color: palette.blue, textDecorationLine: "underline" }}>
                    {p.text}
                  </Text>
                ) : (
                  <Text key={i}>{p.text}</Text>
                ),
              )}
            </T>
          ) : null}
        </View>
      ) : null}
      {links.slice(0, 3).map((url) => (
        <LinkCard key={url} url={url} />
      ))}
    </View>
  );
}

/** One user message + the agent's live work: steps, generated cards, and its reply.
 *  onAction: what tapping a card sends next. A call passes none: there you say it, and the cards are to look at. */
export function TurnView({ turn, onAction, speak = true }: { turn: Turn; onAction?: (t: string) => void; speak?: boolean }) {
  const { events, status } = useRun(turn.runId);
  const steps = stepsOf(events);
  // a little "ta-da" when the agent lands its answer (a buzz on failure)
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current === "running" && status === "done") haptic.success();
    if (prev.current === "running" && status === "error") haptic.error();
    prev.current = status;
  }, [status]);
  const message = events.find((e) => e.type === "message");
  const error = events.find((e) => e.type === "error");
  return (
    <View style={{ gap: 12 }}>
      <UserBubble text={turn.text} images={turn.images} />
      {turn.error ? <AgentBubble text={`Couldn't reach Xerxes: ${turn.error}`} speak={false} /> : null}
      {turn.runId ? <StepsCard steps={steps} running={status === "running"} /> : null}
      {events.map((e) => (e.type === "card" ? <AgentCard key={e.card.id} card={e.card} onAction={onAction} /> : null))}
      {message?.type === "message" && message.text ? <AgentBubble text={message.text} speak={speak} /> : null}
      {error?.type === "error" && !message ? <AgentBubble text={error.message} speak={false} /> : null}
    </View>
  );
}
