import { env } from "./env.js";

// The language Xerxes listens and speaks in (Profile → Language). Agora's ARES speech-to-text covers every one of
// these, and Murf Falcon speaks them: anisha (Xerxes' voice) is multi-native in most, so the voice stays the same.
// App text stays English; what changes is the conversation: what Xerxes hears, says and writes back.

export type LangCode = "en" | "hi" | "ta" | "te" | "kn" | "bn" | "mr";

/** What Xerxes says on its own (greetings, "on it", narration while it works), before the agent has a say. */
type Phrases = {
  /** just hello: the centre mic button opens with this and lets them speak first */
  hi: (name: string) => string;
  hello: (name: string) => string;
  occasion: (name: string, label: string, days: number) => string;
  continuing: (name: string) => string;
  project: (name: string, project: string) => string;
  deal: (name: string) => string;
  ack: string;
  search: string;
  check: string;
  budget: string;
  save: string;
  fillers: string[];
  sorry: string;
  snag: string;
};

export type Language = {
  code: LangCode;
  /** English name, for the agent's instructions */
  name: string;
  /** what the user sees in the picker */
  native: string;
  /** Agora ARES recognition language (BCP-47) */
  asr: string;
  /** Murf Falcon voice + locale */
  voice: string;
  locale: string;
  /** how the agent should write replies (script, register) */
  style: string;
  phrases?: Phrases;
};

const ANISHA = "en-IN-anisha";

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    asr: env.agoraAsrLanguage,
    voice: env.murfVoice,
    locale: env.murfLocale,
    style: "English",
  },
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    asr: "hi-IN",
    voice: ANISHA,
    locale: "hi-IN",
    style: "natural, everyday spoken Hindi in Devanagari script (you are a woman, so use feminine verb forms like 'देख रही हूँ')",
    phrases: {
      hi: (n) => `नमस्ते ${n}!`,
      hello: (n) => `नमस्ते ${n}, मैं Xerxes। बताइए, आज क्या खरीदना है?`,
      occasion: (n, l, d) => `नमस्ते ${n}! याद दिला दूँ, ${l} ${d} दिन में है। कुछ ढूँढूँ?`,
      continuing: (n) => `नमस्ते ${n}! चलिए, वहीं से आगे बढ़ते हैं। अब क्या करें?`,
      project: (n, p) => `नमस्ते ${n}! चलिए, आपके ${p} पर काम करते हैं। क्या ढूँढना है?`,
      deal: (n) => `नमस्ते ${n}! अच्छी खबर है, आपके लिए एक नई डील मिली है। देखूँ?`,
      ack: "ठीक है, एक पल दीजिए।",
      search: "ऑनलाइन स्टोर्स में ढूँढ रही हूँ।",
      check: "कीमत और डिलीवरी की तारीख देख रही हूँ।",
      budget: "देख रही हूँ कि यह आपके बजट में हो और समय पर पहुँचे।",
      save: "यह सेव कर रही हूँ।",
      fillers: ["बस थोड़ा और, अभी भी देख रही हूँ।", "लगभग हो गया।", "बस हो ही गया।"],
      sorry: "माफ़ कीजिए, यह पूरा नहीं कर पाई। एक बार फिर से कहेंगे?",
      snag: "माफ़ कीजिए, कुछ गड़बड़ हो गई। क्या आप फिर से कह सकते हैं?",
    },
  },
  {
    code: "ta",
    name: "Tamil",
    native: "தமிழ்",
    asr: "ta-IN",
    voice: ANISHA,
    locale: "ta-IN",
    style: "natural, everyday spoken Tamil in Tamil script",
    phrases: {
      hi: (n) => `வணக்கம் ${n}!`,
      hello: (n) => `வணக்கம் ${n}, நான் Xerxes. இன்று என்ன வாங்கலாம்?`,
      occasion: (n, l, d) => `வணக்கம் ${n}! ஒரு நினைவூட்டல், ${l} இன்னும் ${d} நாட்களில் வருகிறது. ஏதாவது தேடட்டுமா?`,
      continuing: (n) => `வணக்கம் ${n}! விட்ட இடத்திலிருந்து தொடரலாம். அடுத்து என்ன?`,
      project: (n, p) => `வணக்கம் ${n}! உங்கள் ${p} வேலையைத் தொடரலாம். என்ன தேட வேண்டும்?`,
      deal: (n) => `வணக்கம் ${n}! நல்ல செய்தி, உங்களுக்கு ஒரு புதிய டீல் கிடைத்திருக்கிறது. பார்க்கட்டுமா?`,
      ack: "சரி, ஒரு நிமிடம்.",
      search: "ஆன்லைன் கடைகளில் தேடுகிறேன்.",
      check: "விலையையும் டெலிவரி தேதியையும் சரிபார்க்கிறேன்.",
      budget: "உங்கள் பட்ஜெட்டுக்குள் இருக்கிறதா, நேரத்துக்கு வருமா என்று பார்க்கிறேன்.",
      save: "அதைச் சேமிக்கிறேன்.",
      fillers: ["இன்னும் பார்த்துக்கொண்டிருக்கிறேன்.", "கிட்டத்தட்ட முடிந்தது.", "இதோ முடிந்துவிட்டது."],
      sorry: "மன்னிக்கவும், அதை முடிக்க முடியவில்லை. மீண்டும் சொல்ல முடியுமா?",
      snag: "மன்னிக்கவும், ஒரு சிக்கல் ஏற்பட்டது. மீண்டும் சொல்ல முடியுமா?",
    },
  },
  {
    code: "te",
    name: "Telugu",
    native: "తెలుగు",
    asr: "te-IN",
    voice: ANISHA,
    locale: "te-IN",
    style: "natural, everyday spoken Telugu in Telugu script",
    phrases: {
      hi: (n) => `నమస్తే ${n}!`,
      hello: (n) => `నమస్తే ${n}, నేను Xerxes. ఈ రోజు ఏం కొందాం?`,
      occasion: (n, l, d) => `నమస్తే ${n}! గుర్తుచేస్తున్నాను, ${l} ఇంకా ${d} రోజుల్లో ఉంది. ఏదైనా వెతకనా?`,
      continuing: (n) => `నమస్తే ${n}! ఆపిన చోట నుంచి కొనసాగిద్దాం. తర్వాత ఏంటి?`,
      project: (n, p) => `నమస్తే ${n}! మీ ${p} పని కొనసాగిద్దాం. ఏం వెతకాలి?`,
      deal: (n) => `నమస్తే ${n}! శుభవార్త, మీ కోసం ఒక కొత్త డీల్ దొరికింది. చూడనా?`,
      ack: "సరే, ఒక్క నిమిషం.",
      search: "ఆన్‌లైన్ స్టోర్లలో వెతుకుతున్నాను.",
      check: "ధర, డెలివరీ తేదీ చూస్తున్నాను.",
      budget: "మీ బడ్జెట్‌లో ఉందా, సమయానికి వస్తుందా అని చూస్తున్నాను.",
      save: "దాన్ని సేవ్ చేస్తున్నాను.",
      fillers: ["ఇంకా చూస్తున్నాను.", "దాదాపు అయిపోయింది.", "ఇదిగో, అయిపోయింది."],
      sorry: "క్షమించండి, అది పూర్తి చేయలేకపోయాను. మళ్ళీ చెప్తారా?",
      snag: "క్షమించండి, చిన్న సమస్య వచ్చింది. మళ్ళీ చెప్తారా?",
    },
  },
  {
    code: "kn",
    name: "Kannada",
    native: "ಕನ್ನಡ",
    asr: "kn-IN",
    voice: "kn-IN-harshitha", // anisha doesn't speak Kannada; Harshitha is Murf's native Kannada voice
    locale: "kn-IN",
    style: "natural, everyday spoken Kannada in Kannada script",
    phrases: {
      hi: (n) => `ನಮಸ್ಕಾರ ${n}!`,
      hello: (n) => `ನಮಸ್ಕಾರ ${n}, ನಾನು Xerxes. ಇವತ್ತು ಏನು ಖರೀದಿಸೋಣ?`,
      occasion: (n, l, d) => `ನಮಸ್ಕಾರ ${n}! ನೆನಪಿಸುತ್ತಿದ್ದೇನೆ, ${l} ಇನ್ನು ${d} ದಿನಗಳಲ್ಲಿ ಇದೆ. ಏನಾದರೂ ಹುಡುಕಲಾ?`,
      continuing: (n) => `ನಮಸ್ಕಾರ ${n}! ನಿಲ್ಲಿಸಿದ ಕಡೆಯಿಂದ ಮುಂದುವರಿಸೋಣ. ಮುಂದೇನು?`,
      project: (n, p) => `ನಮಸ್ಕಾರ ${n}! ನಿಮ್ಮ ${p} ಕೆಲಸ ಮುಂದುವರಿಸೋಣ. ಏನು ಹುಡುಕಬೇಕು?`,
      deal: (n) => `ನಮಸ್ಕಾರ ${n}! ಒಳ್ಳೆಯ ಸುದ್ದಿ, ನಿಮಗಾಗಿ ಒಂದು ಹೊಸ ಡೀಲ್ ಸಿಕ್ಕಿದೆ. ನೋಡಲಾ?`,
      ack: "ಸರಿ, ಒಂದು ನಿಮಿಷ.",
      search: "ಆನ್‌ಲೈನ್ ಸ್ಟೋರ್‌ಗಳಲ್ಲಿ ಹುಡುಕುತ್ತಿದ್ದೇನೆ.",
      check: "ಬೆಲೆ ಮತ್ತು ಡೆಲಿವರಿ ದಿನಾಂಕ ನೋಡುತ್ತಿದ್ದೇನೆ.",
      budget: "ನಿಮ್ಮ ಬಜೆಟ್‌ನಲ್ಲಿ ಇದೆಯಾ, ಸಮಯಕ್ಕೆ ಬರುತ್ತಾ ಅಂತ ನೋಡುತ್ತಿದ್ದೇನೆ.",
      save: "ಅದನ್ನು ಸೇವ್ ಮಾಡುತ್ತಿದ್ದೇನೆ.",
      fillers: ["ಇನ್ನೂ ನೋಡುತ್ತಿದ್ದೇನೆ.", "ಬಹುತೇಕ ಆಯಿತು.", "ಇಗೋ, ಆಯಿತು."],
      sorry: "ಕ್ಷಮಿಸಿ, ಅದನ್ನು ಮುಗಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೊಮ್ಮೆ ಹೇಳುತ್ತೀರಾ?",
      snag: "ಕ್ಷಮಿಸಿ, ಏನೋ ತೊಂದರೆ ಆಯಿತು. ಮತ್ತೊಮ್ಮೆ ಹೇಳುತ್ತೀರಾ?",
    },
  },
  {
    code: "bn",
    name: "Bengali",
    native: "বাংলা",
    asr: "bn-IN",
    voice: ANISHA,
    locale: "bn-IN",
    style: "natural, everyday spoken Bengali in Bengali script",
    phrases: {
      hi: (n) => `নমস্কার ${n}!`,
      hello: (n) => `নমস্কার ${n}, আমি Xerxes। আজ কী কেনা যাক?`,
      occasion: (n, l, d) => `নমস্কার ${n}! মনে করিয়ে দিই, ${l} আর ${d} দিন পরে। কিছু খুঁজব?`,
      continuing: (n) => `নমস্কার ${n}! যেখানে থেমেছিলাম, সেখান থেকে শুরু করি। এবার কী?`,
      project: (n, p) => `নমস্কার ${n}! চলুন, আপনার ${p} নিয়ে কাজ করি। কী খুঁজব?`,
      deal: (n) => `নমস্কার ${n}! সুখবর, আপনার জন্য একটা নতুন ডিল পেয়েছি। দেখব?`,
      ack: "ঠিক আছে, এক মিনিট।",
      search: "অনলাইন দোকানগুলোতে খুঁজছি।",
      check: "দাম আর ডেলিভারির তারিখ দেখছি।",
      budget: "দেখছি বাজেটের মধ্যে আছে কিনা আর সময়মতো পৌঁছাবে কিনা।",
      save: "এটা সেভ করছি।",
      fillers: ["এখনও দেখছি।", "প্রায় হয়ে গেছে।", "এই তো, হয়ে গেল।"],
      sorry: "দুঃখিত, এটা শেষ করতে পারলাম না। আরেকবার বলবেন?",
      snag: "দুঃখিত, একটা সমস্যা হয়েছে। আরেকবার বলবেন?",
    },
  },
  {
    code: "mr",
    name: "Marathi",
    native: "मराठी",
    asr: "mr-IN",
    voice: ANISHA,
    locale: "mr-IN",
    style: "natural, everyday spoken Marathi in Devanagari script (you are a woman, so use feminine verb forms)",
    phrases: {
      hi: (n) => `नमस्कार ${n}!`,
      hello: (n) => `नमस्कार ${n}, मी Xerxes. आज काय खरेदी करूया?`,
      occasion: (n, l, d) => `नमस्कार ${n}! आठवण करून देते, ${l} ${d} दिवसांवर आहे. काही शोधू का?`,
      continuing: (n) => `नमस्कार ${n}! जिथे थांबलो होतो तिथून पुढे जाऊया. आता काय?`,
      project: (n, p) => `नमस्कार ${n}! चला, तुमच्या ${p} वर काम करूया. काय शोधायचं आहे?`,
      deal: (n) => `नमस्कार ${n}! आनंदाची बातमी, तुमच्यासाठी एक नवीन डील मिळाली आहे. बघू का?`,
      ack: "ठीक आहे, एक मिनिट.",
      search: "ऑनलाइन स्टोअर्समध्ये शोधत आहे.",
      check: "किंमत आणि डिलिव्हरीची तारीख बघत आहे.",
      budget: "तुमच्या बजेटमध्ये आहे का आणि वेळेवर पोहोचेल का ते बघत आहे.",
      save: "हे सेव्ह करत आहे.",
      fillers: ["अजून बघत आहे.", "जवळजवळ झालं.", "हे बघा, झालंच."],
      sorry: "माफ करा, ते पूर्ण करता आलं नाही. पुन्हा एकदा सांगाल का?",
      snag: "माफ करा, काहीतरी अडचण आली. पुन्हा एकदा सांगाल का?",
    },
  },
];

export const languageOf = (code?: string): Language => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

/** Looks a language up by code or by name, in English or its own script ("Hindi", "hindi", "हिन्दी", "hi"). */
export const findLanguage = (q: string): Language | undefined => {
  const s = q.trim().toLowerCase();
  return LANGUAGES.find((l) => l.code === s || l.name.toLowerCase() === s || l.native.toLowerCase() === s || l.asr.toLowerCase() === s);
};

/** The line for the agent: which language to reply in. */
export const replyIn = (l: Language) =>
  l.code === "en"
    ? "Reply in English."
    : `Reply ONLY in ${l.name}: ${l.style}. Keep product titles, brand names and people's names as they are. The app's own text is English, which is fine.`;
