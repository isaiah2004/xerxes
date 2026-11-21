// Live speech-to-text from a call. Agora's Conversational AI agent streams its ASR transcripts to the app over the
// RTC data stream (the join's parameters.data_channel, "datastream"): each message arrives as
// "<id>|<part>|<parts>|<base64 of JSON>", a long one split over several messages. This puts them back together and
// hands over the words: the user's while they speak (final once they stop), and the agent's as it talks.

export type Heard = { who: "me" | "agent"; text: string; final: boolean; turn: number };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SIXBITS = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[ALPHABET.charCodeAt(i)] = i;
  t[45] = 62; // "-" and "_" (URL-safe alphabet)
  t[95] = 63;
  return t;
})();

/** Base64 → bytes, without atob (not every React Native runtime has it). */
function fromBase64(s: string): Uint8Array {
  const out = new Uint8Array(Math.ceil((s.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? SIXBITS[c] : -1;
    if (v < 0) continue; // padding, whitespace
    acc = ((acc & 0xffff) << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

/** UTF-8 bytes → text (Hindi, Tamil… transcripts too). */
function utf8(b: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
  let s = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
    else if (c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
    else s += String.fromCodePoint(((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
  }
  return s;
}

type Message = { object?: string; text?: unknown; final?: boolean; turn_id?: number; turn_status?: number };

/** A data-stream message handler: feed it every payload the agent sends; it calls onHeard with each transcript. */
export function transcriptReader(onHeard: (h: Heard) => void) {
  const pending = new Map<string, { at: number; total: number; parts: Map<number, string> }>();
  const handle = (m: Message) => {
    if (typeof m?.text !== "string") return;
    const turn = Number(m.turn_id) || 0;
    if (m.object === "user.transcription") onHeard({ who: "me", text: m.text, final: !!m.final, turn });
    // turn_status: 0 still talking, 1 finished, 2 interrupted
    else if (m.object === "assistant.transcription") onHeard({ who: "agent", text: m.text, final: m.turn_status === 1 || m.turn_status === 2, turn });
  };
  return (data: Uint8Array) => {
    try {
      const raw = utf8(data);
      const m = raw.match(/^([^|]*)\|(\d+)\|([^|]+)\|([\s\S]*)$/);
      if (!m) {
        if (raw.trimStart().startsWith("{")) handle(JSON.parse(raw));
        return;
      }
      const [, id, part, of, body] = m;
      const total = Number(of);
      if (!Number.isInteger(total) || total < 1) return; // "???": size not known yet, it comes again
      const now = Date.now();
      for (const [k, v] of pending) if (now - v.at > 10_000) pending.delete(k); // parts that never completed
      const p = pending.get(id) ?? { at: now, total, parts: new Map<number, string>() };
      p.parts.set(Number(part), body);
      pending.set(id, p);
      if (p.parts.size < p.total) return;
      pending.delete(id);
      const b64 = [...p.parts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v)
        .join("");
      handle(JSON.parse(utf8(fromBase64(b64))));
    } catch {
      /* not a transcript (metrics, a malformed part): skip it */
    }
  };
}
