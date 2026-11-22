export type ProfanitySensitivity = 'low' | 'medium' | 'high';

export interface VoiceProfanityConfig {
  detectBangla: boolean;
  detectEnglish: boolean;
  detectBanglish: boolean;
  sensitivity: ProfanitySensitivity;
  allowedWords: string[];
  blockedWords: string[];
}

export interface VoiceProfanityAnalysis {
  cleanedTranscript: string;
  isHallucinationOrEmpty: boolean;
  isProfane: boolean;
  confidenceScore: number; // 0-100
  matchedWords: string[];
  matchedCategories: Array<'bangla' | 'english' | 'banglish' | 'custom'>;
  contextReason: string;
  detectedScriptSummary: 'bn' | 'en' | 'banglish' | 'mixed' | 'unknown';
}

interface LexiconEntry {
  term: string;
  category: 'bangla' | 'english' | 'banglish';
  severity: 'severe' | 'moderate' | 'mild';
  baseScore: number;
  requireExactToken?: boolean;
}

const BANGLA_LEXICON: LexiconEntry[] = [
  // Severe explicit Bengali slurs & Whisper phonetic variants
  { term: 'মাদারচোদ', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'মাদারচোত', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'মাদার চোদ', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'মাদারফাকার', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'মাদার ফাকার', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'বাইনচোদ', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'বাইন চোদ', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'ভাইনচোদ', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'বোনচোদ', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'ভোনচোদ', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'খানকির পোলা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'খানকিরপোলা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'খানকির ছেলে', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'খানকি', category: 'bangla', severity: 'severe', baseScore: 92 },
  { term: 'মাগির পোলা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'মাগিরপোলা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'মাগীর পোলা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'মাগি', category: 'bangla', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'মাগী', category: 'bangla', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'বোকাচোদা', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'বকাচোদা', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'বোকা চোদা', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'চুদানি', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'চুদানির', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'চোদনা', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'চুদনা', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'চোদা', category: 'bangla', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'চুদা', category: 'bangla', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'চুদ', category: 'bangla', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'চোদি', category: 'bangla', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'ভোদাই', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'ভোদা', category: 'bangla', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'পুটকি', category: 'bangla', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'ধোন', category: 'bangla', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'গুদ', category: 'bangla', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'রান্ডি', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'রান্ডির', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'বেশ্যা', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'নটির পোলা', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'হারামজাদা', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'হারামজাদি', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'কুত্তার বাচ্চা', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'কুত্তারবাচ্চা', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'শুয়োরের বাচ্চা', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'শূয়োরের বাচ্চা', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'চুতমারানি', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'চুতমারানী', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'শালার পো', category: 'bangla', severity: 'moderate', baseScore: 84 },
  { term: 'শালার পুত', category: 'bangla', severity: 'moderate', baseScore: 84 },
  { term: 'গান্ডু', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'চুতিয়া', category: 'bangla', severity: 'severe', baseScore: 92 },
  // Whisper phonetic Bengali outputs for English/Hindi slurs
  { term: 'ফাক ইউ', category: 'bangla', severity: 'severe', baseScore: 95 },
  { term: 'ফাকিং', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'ফাক', category: 'bangla', severity: 'severe', baseScore: 84, requireExactToken: true },
  { term: 'বাষ্টার্ড', category: 'bangla', severity: 'severe', baseScore: 88 },
  { term: 'অ্যাসহোল', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'বিচ', category: 'bangla', severity: 'moderate', baseScore: 76, requireExactToken: true },
  // Moderate / Mild (avoid flagging in low sensitivity unless directed/repeated)
  { term: 'হারামি', category: 'bangla', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'হারামী', category: 'bangla', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'বালের', category: 'bangla', severity: 'moderate', baseScore: 74, requireExactToken: true },
  { term: 'বাল', category: 'bangla', severity: 'mild', baseScore: 56, requireExactToken: true },
  { term: 'শালা', category: 'bangla', severity: 'mild', baseScore: 58, requireExactToken: true },
  { term: 'শালী', category: 'bangla', severity: 'mild', baseScore: 58, requireExactToken: true },
  { term: 'ফকিন্নি', category: 'bangla', severity: 'mild', baseScore: 60, requireExactToken: true },
  { term: 'লুচ্চা', category: 'bangla', severity: 'moderate', baseScore: 72, requireExactToken: true },
  { term: 'জারজ', category: 'bangla', severity: 'moderate', baseScore: 80, requireExactToken: true },
  { term: 'কুত্তা', category: 'bangla', severity: 'mild', baseScore: 54, requireExactToken: true },
  { term: 'শুয়োর', category: 'bangla', severity: 'mild', baseScore: 60, requireExactToken: true },
  // Devanagari Whisper mis-scripted catches for Bangla/Banglish voice notes
  { term: 'मादरचोद', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'बहनचोद', category: 'bangla', severity: 'severe', baseScore: 98 },
  { term: 'भोसडीके', category: 'bangla', severity: 'severe', baseScore: 96 },
  { term: 'चूतिया', category: 'bangla', severity: 'severe', baseScore: 94 },
  { term: 'हरामजादा', category: 'bangla', severity: 'severe', baseScore: 92 },
  { term: 'रांडी', category: 'bangla', severity: 'severe', baseScore: 92 },
  { term: 'गांडू', category: 'bangla', severity: 'severe', baseScore: 90 },
  { term: 'हरामी', category: 'bangla', severity: 'moderate', baseScore: 76 },
];

const BANGLISH_LEXICON: LexiconEntry[] = [
  { term: 'madarchod', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'madarchuda', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'madarchud', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'madar chod', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'bainchod', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'baimchod', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'bain chod', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'bhenchod', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'behnchod', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'bokachoda', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'bokachuda', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'bokachod', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'khankir pola', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'khanki', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'magir pola', category: 'banglish', severity: 'severe', baseScore: 98 },
  { term: 'magi', category: 'banglish', severity: 'severe', baseScore: 86, requireExactToken: true },
  { term: 'chudani', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'chudanir', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'choda', category: 'banglish', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'chuda', category: 'banglish', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'chudai', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'chudi', category: 'banglish', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'chodna', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'chudna', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'chod', category: 'banglish', severity: 'severe', baseScore: 86, requireExactToken: true },
  { term: 'bhodai', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'bhoda', category: 'banglish', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'putki', category: 'banglish', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'dhon', category: 'banglish', severity: 'severe', baseScore: 86, requireExactToken: true },
  { term: 'gud', category: 'banglish', severity: 'severe', baseScore: 86, requireExactToken: true },
  { term: 'haramzada', category: 'banglish', severity: 'severe', baseScore: 92 },
  { term: 'kuttar baccha', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'kuttar bacha', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'shuorer baccha', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'suorer baccha', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'randi', category: 'banglish', severity: 'severe', baseScore: 94 },
  { term: 'chutmarani', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'chutiya', category: 'banglish', severity: 'severe', baseScore: 92 },
  { term: 'chutia', category: 'banglish', severity: 'severe', baseScore: 90 },
  { term: 'bhosdike', category: 'banglish', severity: 'severe', baseScore: 96 },
  { term: 'bsdk', category: 'banglish', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'gandu', category: 'banglish', severity: 'severe', baseScore: 90 },
  { term: 'lauda', category: 'banglish', severity: 'severe', baseScore: 90 },
  { term: 'laude', category: 'banglish', severity: 'severe', baseScore: 90 },
  { term: 'lund', category: 'banglish', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'harami', category: 'banglish', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'shalar po', category: 'banglish', severity: 'moderate', baseScore: 82 },
  { term: 'baler', category: 'banglish', severity: 'moderate', baseScore: 74, requireExactToken: true },
  { term: 'bal', category: 'banglish', severity: 'mild', baseScore: 54, requireExactToken: true },
  { term: 'shala', category: 'banglish', severity: 'mild', baseScore: 56, requireExactToken: true },
  { term: 'sala', category: 'banglish', severity: 'mild', baseScore: 54, requireExactToken: true },
  { term: 'fokinni', category: 'banglish', severity: 'mild', baseScore: 58, requireExactToken: true },
  { term: 'beyadob', category: 'banglish', severity: 'mild', baseScore: 52, requireExactToken: true },
];

const ENGLISH_LEXICON: LexiconEntry[] = [
  { term: 'motherfucker', category: 'english', severity: 'severe', baseScore: 98 },
  { term: 'mother fucker', category: 'english', severity: 'severe', baseScore: 98 },
  { term: 'fuck you', category: 'english', severity: 'severe', baseScore: 98 },
  { term: 'fuck off', category: 'english', severity: 'severe', baseScore: 96 },
  { term: 'fucking', category: 'english', severity: 'severe', baseScore: 94 },
  { term: 'fucker', category: 'english', severity: 'severe', baseScore: 95 },
  { term: 'fuck', category: 'english', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'son of a bitch', category: 'english', severity: 'severe', baseScore: 96 },
  { term: 'bitch', category: 'english', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'bitches', category: 'english', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'asshole', category: 'english', severity: 'severe', baseScore: 92 },
  { term: 'ass hole', category: 'english', severity: 'severe', baseScore: 90 },
  { term: 'cunt', category: 'english', severity: 'severe', baseScore: 96, requireExactToken: true },
  { term: 'cocksucker', category: 'english', severity: 'severe', baseScore: 98 },
  { term: 'dickhead', category: 'english', severity: 'severe', baseScore: 92 },
  { term: 'pussy', category: 'english', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'whore', category: 'english', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'slut', category: 'english', severity: 'severe', baseScore: 88, requireExactToken: true },
  { term: 'bastard', category: 'english', severity: 'severe', baseScore: 84, requireExactToken: true },
  { term: 'nigger', category: 'english', severity: 'severe', baseScore: 98 },
  { term: 'nigga', category: 'english', severity: 'severe', baseScore: 92 },
  { term: 'bullshit', category: 'english', severity: 'moderate', baseScore: 76 },
  { term: 'shit', category: 'english', severity: 'moderate', baseScore: 68, requireExactToken: true },
  { term: 'dick', category: 'english', severity: 'moderate', baseScore: 74, requireExactToken: true },
  { term: 'dumbass', category: 'english', severity: 'moderate', baseScore: 72, requireExactToken: true },
  { term: 'jackass', category: 'english', severity: 'moderate', baseScore: 72, requireExactToken: true },
  { term: 'wanker', category: 'english', severity: 'moderate', baseScore: 76, requireExactToken: true },
];

const BUILTIN_SAFE_WORDS = new Set(
  [
    'আসসালামু',
    'আসসালামুয়ালাইকুম',
    'আসসালামু আলাইকুম',
    'সালাম',
    'ওয়ালাইকুম',
    'ওয়ালাইকুম',
    'সালাত',
    'সালাতুল',
    'সালাউদ্দিন',
    'সালাহ',
    'আলহামদুলিল্লাহ',
    'ইনশাআল্লাহ',
    'মাশাআল্লাহ',
    'সুবহানাল্লাহ',
    'জাজাকাল্লাহ',
    'আল্লাহ',
    'বালতি',
    'বালিশ',
    'বালক',
    'বালিকা',
    'বালু',
    'বাঙালি',
    'বাঙালী',
    'ভালো',
    'ভালোবাসা',
    'ভালো আছি',
    'বল',
    'বলা',
    'বলে',
    'বলো',
    'বলুন',
    'বলবেন',
    'সবল',
    'দুর্বল',
    'ইকবাল',
    'আমার',
    'তোমার',
    'মাইর',
    'খাবে',
    'মারামারি',
    'ভুল',
    'ক্ষমা',
    'ধন্যবাদ',
    'কেমন',
    'আছেন',
    'আছো',
    'hello',
    'hi',
    'thanks',
    'thank you',
    'ball',
    'balls',
    'balance',
    'balcony',
    'bald',
    'football',
    'basketball',
    'salad',
    'salary',
    'salam',
    'assalamu',
    'alaikum',
    'walikum',
  ].map((w) => w.normalize('NFC').toLowerCase())
);

const WHISPER_HALLUCINATION_PATTERNS: RegExp[] = [
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^thank\s+you(?:\s+very\s+much)?(?:\s+for\s+watching)?[.!]*$/i,
  /^thanks\s+for\s+watching[.!]*$/i,
  /^please\s+subscribe[.!]*$/i,
  /^subtitles?\s+by\b/i,
  /^you[.!]*$/i,
  /^bye[.!]*$/i,
  /^music[.!]*$/i,
  /^(?:আমাদের\s+চ্যানেল|সাবস্ক্রাইব|ধন্যবাদ\s+দেখার\s+জন্য)/i,
];

const DIRECTED_ABUSE_CUES = new Set([
  'তুই',
  'তোর',
  'তোকে',
  'তোরে',
  'আপনি',
  'শুন',
  'একটা',
  'বড়',
  'সত্যি',
  'tui',
  'tor',
  'toke',
  'tore',
  'you',
  'your',
  'ur',
  'f***',
]);

const CORRECTIVE_SAFE_PHRASES = [
  'গালি দিও না',
  'গালি দেবেন না',
  'গালি দিবেন না',
  'গালি দেওয়া',
  'গালি বলা',
  'গালি দিস না',
  'বাজে কথা বলো না',
  'অশালীন ভাষা',
  "don't say",
  'do not say',
  "don't curse",
  'stop cursing',
  'stop swearing',
  'no bad words',
  'gali dio na',
  'gali dis na',
  'gali deben na',
];

export function cleanWhisperTranscript(raw: string): { cleaned: string; isHallucinationOrEmpty: boolean } {
  if (!raw) return { cleaned: '', isHallucinationOrEmpty: true };
  // Strip bracketed sound tags e.g. [BLANK_AUDIO], [Music], (chiming), ♪
  let cleaned = raw
    .normalize('NFC')
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    .replace(/\([^)]{1,40}\)/g, ' ')
    .replace(/[♪♫★☆]+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return { cleaned: '', isHallucinationOrEmpty: true };
  }

  for (const rx of WHISPER_HALLUCINATION_PATTERNS) {
    if (rx.test(cleaned)) {
      return { cleaned, isHallucinationOrEmpty: true };
    }
  }

  // Collapse Whisper repeated noise syllable hallucinations e.g. "আ আ আ আ আ আ" or "ah ah ah ah ah"
  const parts = cleaned.toLowerCase().split(/\s+/);
  if (parts.length >= 5) {
    const unique = new Set(parts.map((p) => p.replace(/[.,!?]+/g, '')));
    if (unique.size === 1) {
      return { cleaned, isHallucinationOrEmpty: true };
    }
  }

  return { cleaned, isHallucinationOrEmpty: false };
}

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[.,!?;:'"“”‘’()[\]{}<>~`\\/|+=*&^%$#@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectScriptSummary(text: string): 'bn' | 'en' | 'banglish' | 'mixed' | 'unknown' {
  if (!text) return 'unknown';
  const hasBn = /[\u0980-\u09FF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasBn && hasLatin) return 'mixed';
  if (hasBn) return 'bn';
  if (hasLatin) {
    const banglishHint = /\b(?:tui|tor|toke|ami|tumi|ki|koro|nai|hobe|valo|kotha|bhai|apu|shala|harami|bokachoda|madarchod|khanki|magi)\b/i.test(
      text
    );
    return banglishHint ? 'banglish' : 'en';
  }
  return 'unknown';
}

export function analyzeVoiceTranscriptProfanity(
  rawTranscript: string,
  config: VoiceProfanityConfig,
  whisperAvgTokenProb?: number
): VoiceProfanityAnalysis {
  const { cleaned, isHallucinationOrEmpty } = cleanWhisperTranscript(rawTranscript);
  const detectedScriptSummary = detectScriptSummary(cleaned);

  if (isHallucinationOrEmpty || !cleaned) {
    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: true,
      isProfane: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      contextReason: 'নীরব বা অস্পষ্ট অডিও — কোনো বক্তব্য পাওয়া যায়নি',
      detectedScriptSummary,
    };
  }

  let workingText = normalizeForMatch(cleaned);

  // 1. Remove explicit Allowed Words (Admin Whitelist + Built-in safe terms)
  const customAllowed = (config.allowedWords || [])
    .map((w) => normalizeForMatch(w))
    .filter((w) => w.length >= 2);

  for (const allowPhrase of customAllowed) {
    if (allowPhrase.includes(' ')) {
      workingText = workingText.split(allowPhrase).join(' ');
    }
  }

  const rawTokens = workingText.split(/\s+/).filter(Boolean);
  const allowedSet = new Set<string>([...BUILTIN_SAFE_WORDS, ...customAllowed.filter((w) => !w.includes(' '))]);
  const filteredTokens = rawTokens.filter((tok) => !allowedSet.has(tok));
  const filteredText = filteredTokens.join(' ').trim();

  if (!filteredText) {
    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: false,
      isProfane: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      contextReason: 'Allowed / নিরাপদ শব্দ হিসেবে চিহ্নিত',
      detectedScriptSummary,
    };
  }

  // Build active dictionaries from Admin Settings
  const lexicon: LexiconEntry[] = [];
  if (config.detectBangla) lexicon.push(...BANGLA_LEXICON);
  if (config.detectBanglish) lexicon.push(...BANGLISH_LEXICON);
  if (config.detectEnglish) lexicon.push(...ENGLISH_LEXICON);

  const matchedWords: string[] = [];
  const matchedCategories = new Set<'bangla' | 'english' | 'banglish' | 'custom'>();
  let maxScore = 0;
  let hitCount = 0;

  // 2. Check Admin Custom Blocked Words (active regardless of language toggles unless in Allowed Words)
  for (const customRaw of config.blockedWords || []) {
    const term = normalizeForMatch(customRaw);
    if (!term || term.length < 2 || allowedSet.has(term)) continue;
    let hit = false;
    if (term.includes(' ')) {
      if (filteredText.includes(term)) hit = true;
    } else {
      for (const tok of filteredTokens) {
        if (tok === term || (term.length >= 5 && tok.startsWith(term))) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      matchedWords.push(customRaw.trim());
      matchedCategories.add('custom');
      maxScore = Math.max(maxScore, 96);
      hitCount++;
    }
  }

  // 3. Check Language Dictionaries
  for (const entry of lexicon) {
    const term = normalizeForMatch(entry.term);
    if (!term) continue;
    let matched = false;

    if (term.includes(' ')) {
      if (filteredText.includes(term)) {
        matched = true;
      }
    } else {
      for (const tok of filteredTokens) {
        if (tok === term) {
          matched = true;
          break;
        }
        if (!entry.requireExactToken && term.length >= 6 && tok.startsWith(term)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      if (!matchedWords.includes(entry.term)) {
        matchedWords.push(entry.term);
      }
      matchedCategories.add(entry.category);
      maxScore = Math.max(maxScore, entry.baseScore);
      hitCount++;
    }
  }

  // Collapsed spacing catch for severe multi-syllable slurs split by Whisper (e.g. "মা দার চোদ")
  if (config.detectBangla || config.detectBanglish) {
    const collapsed = filteredText.replace(/\s+/g, '');
    const collapsedSevere = [
      'মাদারচোদ',
      'বাইনচোদ',
      'বোনচোদ',
      'খানকিরপোলা',
      'মাগিরপোলা',
      'বোকাচোদা',
      'হারামজাদা',
      'madarchod',
      'bainchod',
      'bhenchod',
      'bokachoda',
      'motherfucker',
    ];
    for (const cTerm of collapsedSevere) {
      if (cTerm === 'motherfucker' && !config.detectEnglish) continue;
      if (collapsed.includes(cTerm)) {
        if (!matchedWords.includes(cTerm)) matchedWords.push(cTerm);
        matchedCategories.add(/[\u0980-\u09FF]/.test(cTerm) ? 'bangla' : cTerm === 'motherfucker' ? 'english' : 'banglish');
        maxScore = Math.max(maxScore, 95);
        hitCount++;
      }
    }
  }

  if (matchedWords.length === 0) {
    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: false,
      isProfane: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      contextReason: 'কোনো গালি বা অশালীন শব্দ পাওয়া যায়নি',
      detectedScriptSummary,
    };
  }

  // 4. Context-Aware Adjustments (Reduce False Positives & Boost Direct Abuse)
  let adjustedScore = maxScore;
  const contextNotes: string[] = [];

  // Multiple profanities in same clip increase certainty
  if (hitCount >= 2) {
    adjustedScore = Math.min(100, adjustedScore + 10);
    contextNotes.push('একাধিক অশালীন শব্দ');
  }

  // Direct second-person insult cue ("তুই ...", "you ...", "তোর ...")
  if (rawTokens.some((tok) => DIRECTED_ABUSE_CUES.has(tok))) {
    adjustedScore = Math.min(100, adjustedScore + 8);
    contextNotes.push('ব্যক্তিগত আক্রমণসূচক প্রসঙ্গ');
  }

  // Anti-abuse / warning / corrective context ("গালি দিও না", "don't curse")
  const hasCorrectiveContext = CORRECTIVE_SAFE_PHRASES.some((phrase) => workingText.includes(phrase));
  if (hasCorrectiveContext && maxScore < 94) {
    adjustedScore = Math.max(0, adjustedScore - 28);
    contextNotes.push('সতর্ক/শিক্ষামূলক বাক্য প্রসঙ্গ');
  }

  // Whisper acoustic probability penalty for ambiguous/short words
  if (typeof whisperAvgTokenProb === 'number' && Number.isFinite(whisperAvgTokenProb)) {
    if (whisperAvgTokenProb < 0.28 && maxScore < 90) {
      adjustedScore = Math.max(0, adjustedScore - 20);
      contextNotes.push('অস্পষ্ট উচ্চারণ (Low STT Confidence)');
    } else if (whisperAvgTokenProb >= 0.72) {
      adjustedScore = Math.min(100, adjustedScore + 4);
    }
  }

  const thresholdMap: Record<ProfanitySensitivity, number> = {
    low: 82,
    medium: 62,
    high: 45,
  };
  const threshold = thresholdMap[config.sensitivity || 'medium'];
  const isProfane = adjustedScore >= threshold;

  const contextReason = isProfane
    ? `গালি শনাক্ত (${Array.from(matchedCategories).join('+')})${contextNotes.length ? ` · ${contextNotes.join(', ')}` : ''}`
    : `সন্দেহজনক শব্দ কিন্তু সীমার নিচে (Score ${adjustedScore}/${threshold}) — নিরাপদ হিসেবে অক্ষত রাখা হয়েছে`;

  return {
    cleanedTranscript: cleaned,
    isHallucinationOrEmpty: false,
    isProfane,
    confidenceScore: Math.round(adjustedScore),
    matchedWords,
    matchedCategories: Array.from(matchedCategories),
    contextReason,
    detectedScriptSummary,
  };
}
