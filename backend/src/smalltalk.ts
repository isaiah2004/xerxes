// Small talk on a call ("can you hear me?", "hi", "thanks", "who are you?") doesn't need the shopping agent: a Codex
// turn takes seconds and opens with "On it", which is silly for "hello". These are answered on the spot. Anything that
// could be a request, or a yes/no to Xerxes' last question, still goes to Codex.

/** Words that make it a request (or an answer to one): never small talk. */
const TASK =
  /\b(find|buy|get|gift|gifts|price|prices|cost|cheap|cheaper|deal|deals|shop|shops|store|stores|order|track|deliver|delivery|budget|recommend|suggest|compare|search|look|check|book|books|game|games|need|want|birthday|anniversary|show|remind|add|remove|delete|calendar|people|idea|ideas|under|rupees|send|pick|choose|which|option|yes|yeah|yep|no|nope|sure|okay|ok|go|do it|please|more|another|else|also|instead|what about|how about)\b|₹|\d/;

type Rule = { re: RegExp; say: (name: string) => string[] };
const RULES: Rule[] = [
  {
    re: /\b(can|could|do) you hear me\b|\bare you (there|listening|with me|still there)\b|\b(testing|mic check)\b/,
    say: () => ["Yes, loud and clear! What are we shopping for?", "I can hear you fine. What can I find for you?"],
  },
  { re: /\bhow are you\b|\bhow('s| is) it going\b|\bhow are things\b|\bwhat'?s up\b/, say: () => ["Doing great, thanks for asking! What can I find for you today?"] },
  {
    re: /\b(who are you|what'?s your name|what is your name|what are you)\b/,
    say: () => ["I'm Xerxes, your shopping agent. I find gifts and deals, check what arrives in time, and keep an eye on prices for you."],
  },
  {
    re: /\b(what can you do|how can you help|what do you do)\b/,
    say: () => ["I can think up gift ideas, compare prices across shops, check delivery dates, find stores near you, and track prices. What do you need?"],
  },
  { re: /^(thanks|thank you|thank you so much|thanks a lot|cheers|much appreciated)$/, say: () => ["Anytime! Anything else?", "Happy to help! Anything else you need?"] },
  { re: /^(bye|goodbye|good bye|see you|see ya|talk later|talk to you later|that'?s all|that'?s it|nothing else|i'?m done)( thanks| thank you)?$/, say: () => ["Happy shopping! Talk soon."] },
  { re: /^(wait|hold on|one sec|one second|one moment|give me a (sec|second|moment|minute)|just a (sec|second|moment))$/, say: () => ["Sure, take your time."] },
  { re: /^(hi|hey|hello|hiya|good morning|good afternoon|good evening)( there)?$/, say: (n) => [`Hey${n ? ` ${n}` : ""}! What are we shopping for today?`] },
  { re: /^$/, say: () => ["Yes, I'm here. What can I find for you?"] }, // just "Xerxes?"
];

/** A reply for small talk, or undefined when it's anything more (Codex takes it). English calls only. */
export function smallTalk(said: string, name = ""): string | undefined {
  const t = said
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'₹\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^((um|uh|er|oh|ah|so|hey|hi|hello) )?xerxes\b ?|\bxerxes$/g, (m) => (/^(hey|hi|hello)/.test(m) ? m.replace(/\s*xerxes\s*/, "") : ""))
    .trim();
  if (t.split(" ").length > 8 || TASK.test(t)) return undefined;
  // "hey can you hear me": a greeting in front doesn't change what's asked
  const core = t.replace(/^(hi|hey|hello)( there)? (?=\S)/, "");
  const rule = RULES.find((r) => r.re.test(core)) ?? (core !== t ? RULES.find((r) => r.re.test(t)) : undefined);
  if (!rule) return undefined;
  const options = rule.say(name.split(" ")[0] ?? "");
  return options[Math.floor(Math.random() * options.length)];
}
