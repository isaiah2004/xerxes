// Adaptive noise gate for the call mic. Two jobs:
// 1. Room noise: it learns the noise floor (a fan, a hall's hum) from the quietest moments of the last few seconds,
//    and opens only for sound clearly above it.
// 2. Xerxes' own voice: from a laptop or phone speaker it reaches the mic and would sound like you talking, so the
//    agent kept interrupting itself. While Xerxes talks the gate holds, learning how loud that echo gets; only a voice
//    clearly louder than the echo, kept up for a moment, gets through (that's you cutting in).
// Levels are on a 0-100 scale. The clients gate the audio they send with it, so Agora never hears what it holds back.

export type GateMode = "listening" | "xerxes" | "muted";
export type GateState = { open: boolean; mode: GateMode; level: number; threshold: number; floor: number };

const MIN_OPEN = 8; // never opens for anything quieter
const HOLD_MS = 600; // stays open through the gaps between words
const ECHO_HOLD_MS = 700; // Xerxes' voice lingers in the room (and the speaker's buffer) after it stops
const BARGE_MS = 300; // talking over Xerxes has to be kept up this long to count
const BARGE_MIN = 55; // ...and be at least this loud
const AGENT_TALKING = 3; // Xerxes' playback above this level = it's talking
const FLOOR_WINDOW_MS = 3000; // the noise floor is the quietest moment of this window

export function adaptiveGate() {
  const recent: { at: number; level: number }[] = [];
  let floor = 4;
  let echo = 45; // a cautious guess until it has heard Xerxes through this device
  let open = false;
  let loudAt = 0;
  let overSince = 0;
  let agentAt = 0;
  let agentSpeaking = false;
  let last = 0;
  return {
    /** The agent's own state from the data stream ("speaking", "listening", "thinking", "silent"). */
    agentState(state: string) {
      agentSpeaking = state === "speaking";
    },
    /** One reading: your mic level, Xerxes' playback level, whether you muted yourself. */
    step(mic: number, agent: number, muted: boolean, now = Date.now()): GateState {
      const k = (last ? Math.min(500, now - last) : 50) / 50; // rates below are per 50 ms
      last = now;
      if (agent > AGENT_TALKING || agentSpeaking) agentAt = now;
      const xerxes = now - agentAt < ECHO_HOLD_MS;

      // noise floor: the quietest moment lately (speech has gaps, a fan doesn't), not counting Xerxes' echo
      if (!xerxes) recent.push({ at: now, level: mic });
      while (recent.length && now - recent[0].at > FLOOR_WINDOW_MS) recent.shift();
      if (recent.length) {
        const quietest = recent.reduce((m, r) => Math.min(m, r.level), Infinity);
        floor += Math.min(1, 0.2 * k) * (Math.min(40, quietest) - floor);
      }

      const base = Math.max(MIN_OPEN, floor * 1.5 + 6);
      const openAt = xerxes ? Math.max(BARGE_MIN, Math.min(92, echo * 1.3 + 5)) : base;
      // the echo level: the loudest Xerxes has reached the mic lately, fading slowly. Only sound under the bar is
      // learned; louder could be you cutting in, and learning that would raise the bar out of your reach.
      if (xerxes && !open && mic < openAt) echo = Math.max(mic, echo * (1 - 0.004 * k));
      echo = Math.max(20, Math.min(85, echo));
      const stayAt = xerxes ? Math.max(base, echo * 1.1) : Math.max(floor + 3, base * 0.7);
      const hold = xerxes ? 300 : HOLD_MS;

      if (muted) {
        open = false;
        overSince = 0;
      } else if (!open) {
        if (mic >= openAt) {
          overSince ||= now;
          if (!xerxes || now - overSince >= BARGE_MS) {
            open = true;
            loudAt = now;
          }
        } else overSince = 0;
      } else {
        if (mic >= stayAt) loudAt = now;
        if (now - loudAt >= hold) {
          open = false;
          overSince = 0;
        }
      }
      return { open, mode: muted ? "muted" : xerxes ? "xerxes" : "listening", level: mic, threshold: muted ? 100 : openAt, floor };
    },
  };
}
