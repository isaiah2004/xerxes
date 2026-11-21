import { useEffect, useRef } from "react";
import { View } from "react-native";
import { haptic } from "@/lib/haptics";
import { stepsOf, useRun } from "@/lib/useRun";
import { color } from "@/lib/theme";
import { AgentCard, StepsCard } from "./cards";
import { SpeakButton } from "./Speak";
import { Row, T } from "./ui";

export type Turn = { key: string; text: string; runId?: string; error?: string };

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

export function UserBubble({ text }: { text: string }) {
  return (
    <View
      style={{
        alignSelf: "flex-end",
        maxWidth: "86%",
        backgroundColor: color.ink,
        borderRadius: 20,
        borderBottomRightRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 11,
      }}
    >
      <T v="body" style={{ color: "#fff" }}>
        {clean(text)}
      </T>
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
      <UserBubble text={turn.text} />
      {turn.error ? <AgentBubble text={`Couldn't reach Xerxes: ${turn.error}`} speak={false} /> : null}
      {turn.runId ? <StepsCard steps={steps} running={status === "running"} /> : null}
      {events.map((e) => (e.type === "card" ? <AgentCard key={e.card.id} card={e.card} onAction={onAction} /> : null))}
      {message?.type === "message" && message.text ? <AgentBubble text={message.text} speak={speak} /> : null}
      {error?.type === "error" && !message ? <AgentBubble text={error.message} speak={false} /> : null}
    </View>
  );
}
