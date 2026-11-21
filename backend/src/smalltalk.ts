// Small talk on a call ("can you hear me?", "hi", "thanks", "who are you?") doesn't need the shopping agent: a Codex
// turn takes seconds and opens with "On it", which is silly for "hello". These are answered on the spot. Anything that
// could be a request, or a yes/no to Xerxes' last question, still goes to Codex.

/** Words that make it a request: never small talk. */
const TASK =
  /\b(find|buy|get|gift|gifts|price|prices|cost|cheap|cheaper|deal|deals|shop|shops|store|stores|order|track|deliver|delivery|budget|recommend|suggest|compare|search|look|check|book|books|game|games|need|want|birthday|anniversary|show|remind|add|remove|delete|calendar|people|idea|ideas|under|rupees|send|pick|choose|which|option)\b|₹|\d/;
/** Words that could answer Xerxes' last question ("yes", "the other one"): Codex takes those too, except in a hearing check. */
const ANSWER = /\b(yes|yeah|yep|no|nope|sure|okay|ok|go|do it|please|more|another|else|also|instead|what about|how about)\b/;

const GREET = "(?:hi|hey|hello|hiya|heya|yo|hola|namaste|namaskar|vanakkam|good (?:morning|afternoon|evening))(?: (?:there|again|buddy|friend))?";
/** Sounds, not words: "um", "so", "hmm" heard on their own. */
const FILLER = "(?:um+|uh+|er+|erm|hm+|mm+|ah+|oh+|so|well|right|alright)";

type Rule = { re: RegExp; say: (name: string) => string[] };
/** "can you hear me?", "hello, you hear me?", "are you there?", "is this working?", "testing, testing" */
const HEARING: Rule = {
  re: /\bhear me\b|\bhearing me\b|\bcan you hear\b|\bam i (audible|coming through|loud enough|clear)\b|\b(is|was) (it|this|that) (thing )?(on|working)\b|\b(are )?you (there|listening|with me|still there|awake|around)\b|\b(testing|mic check)\b/,
  say: () => ["Yes, loud and clear! What are we shopping for?", "I can hear you fine. What can I find for you?"],
};
const RULES: Rule[] = [
  HEARING,
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
  { re: new RegExp(`^${GREET}(?: ${GREET})*$`), say: (n) => [`Hey${n ? ` ${n}` : ""}! What are we shopping for today?`] },
  { re: new RegExp(`^${FILLER}(?: ${FILLER})*$`), say: () => ["I'm listening."] }, // a lone "so" or "um" the ASR sent as a turn
  { re: /^$/, say: () => ["Yes, I'm here. What can I find for you?"] }, // just "Xerxes?"
];

/** A reply for small talk, or undefined when it's anything more (Codex takes it). English calls only. */
export function smallTalk(said: string, name = ""): string | undefined {
  const t = said
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'₹\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "hey xerxes, you there?" → "hey you there"; "xerxes?" → ""
    .replace(/^((um|uh|er|oh|ah|so|hey|hi|hello) )?xerxes\b ?|\bxerxes$/g, (m) => (/^(hey|hi|hello)/.test(m) ? m.replace(/\s*xerxes\s*/, " ") : ""))
    .replace(/\s+/g, " ")
    .trim();
  if (t.split(" ").length > 12 || TASK.test(t)) return undefined;
  // "hello hello, can you hear me": greetings and "um"s in front don't change what's asked
  const core = t.replace(new RegExp(`^(?:(?:${GREET}|${FILLER}) )+(?=\\S)`), "");
  const pick = (r: Rule) => {
    const options = r.say(name.split(" ")[0] ?? "");
    return options[Math.floor(Math.random() * options.length)];
  };
  // "okay, can you hear me?" is still a hearing check; otherwise "okay"/"yes" may answer Xerxes, so Codex takes it
  if (HEARING.re.test(t)) return pick(HEARING);
  if (ANSWER.test(t)) return undefined;
  const rule = RULES.find((r) => r.re.test(core)) ?? (core !== t ? RULES.find((r) => r.re.test(t)) : undefined);
  return rule ? pick(rule) : undefined;
}
