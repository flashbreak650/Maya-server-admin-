export type ProfanitySensitivity = 'low' | 'medium' | 'high';

export type VoiceProfanityCategory = 'bangla' | 'sylheti' | 'english' | 'banglish' | 'semantic' | 'custom';

export interface VoiceProfanityConfig {
  detectBangla: boolean;
  detectSylheti?: boolean;
  detectEnglish: boolean;
  detectBanglish: boolean;
  sensitivity: ProfanitySensitivity;
  allowedWords: string[];
  blockedWords: string[];
  reviewUnclearEnabled?: boolean;
}

export interface VoiceProfanityAnalysis {
  cleanedTranscript: string;
  isHallucinationOrEmpty: boolean;
  isProfane: boolean;
  needsReview: boolean;
  reviewReason?: string;
  confidenceScore: number; // 0-100
  matchedWords: string[];
  matchedCategories: VoiceProfanityCategory[];
  semanticSignals: string[];
  dialectDetected: 'standard_bn' | 'sylheti' | 'banglish' | 'english' | 'mixed' | 'unknown';
  contextReason: string;
  detectedScriptSummary: 'bn' | 'en' | 'banglish' | 'mixed' | 'unknown';
}

interface LexiconEntry {
  term: string;
  category: 'bangla' | 'sylheti' | 'english' | 'banglish';
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
  // Moderate / Mild
  { term: 'হারামি', category: 'bangla', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'হারামী', category: 'bangla', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'বালের', category: 'bangla', severity: 'moderate', baseScore: 74, requireExactToken: true },
  { term: 'বাল', category: 'bangla', severity: 'mild', baseScore: 54, requireExactToken: true },
  { term: 'শালা', category: 'bangla', severity: 'mild', baseScore: 56, requireExactToken: true },
  { term: 'শালী', category: 'bangla', severity: 'mild', baseScore: 56, requireExactToken: true },
  { term: 'ফকিন্নি', category: 'bangla', severity: 'mild', baseScore: 58, requireExactToken: true },
  { term: 'লুচ্চা', category: 'bangla', severity: 'moderate', baseScore: 72, requireExactToken: true },
  { term: 'জারজ', category: 'bangla', severity: 'moderate', baseScore: 80, requireExactToken: true },
  { term: 'কুত্তা', category: 'bangla', severity: 'mild', baseScore: 52, requireExactToken: true },
  { term: 'শুয়োর', category: 'bangla', severity: 'mild', baseScore: 58, requireExactToken: true },
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

// Sylheti (সিলেটি) regional pronunciation & phonetic variants (both Bengali & Roman)
const SYLHETI_LEXICON: LexiconEntry[] = [
  { term: 'হানকির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'হানকির পোলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'হানকি', category: 'sylheti', severity: 'severe', baseScore: 92, requireExactToken: true },
  { term: 'খানকির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'মাগির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'মাগীর ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'হুত্তার বাচ্চা', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'হুত্তার ফুলা', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'হুওরের বাচ্চা', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'হুয়োরের বাচ্চা', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'হারামির ফুত', category: 'sylheti', severity: 'severe', baseScore: 92 },
  { term: 'হারামির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 92 },
  { term: 'হালার ফুত', category: 'sylheti', severity: 'moderate', baseScore: 84 },
  { term: 'হালার পো', category: 'sylheti', severity: 'moderate', baseScore: 84 },
  { term: 'বাইনসোদ', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'বাইনছোদ', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'মাদারসোদ', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'মাদারছোদ', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'সুতমারানি', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'ছোতমারানি', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'সুদানির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'চুদানির ফুলা', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'ফুতকি', category: 'sylheti', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'সোদনা', category: 'sylheti', severity: 'severe', baseScore: 94 },
  { term: 'সুদনা', category: 'sylheti', severity: 'severe', baseScore: 94 },
  { term: 'সুদার', category: 'sylheti', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'হুদার', category: 'sylheti', severity: 'severe', baseScore: 86, requireExactToken: true },
  { term: 'লন', category: 'sylheti', severity: 'moderate', baseScore: 76, requireExactToken: true },
  { term: 'হুওর', category: 'sylheti', severity: 'mild', baseScore: 58, requireExactToken: true },
  { term: 'হালা', category: 'sylheti', severity: 'mild', baseScore: 52, requireExactToken: true },
  { term: 'বেজন্মা', category: 'sylheti', severity: 'severe', baseScore: 90 },
  // Romanized Sylheti
  { term: 'hankir fula', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'hankir pola', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'hanki', category: 'sylheti', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'khankir fula', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'magir fula', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'huttar baccha', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'huttar fula', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'huorer baccha', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'halar fut', category: 'sylheti', severity: 'moderate', baseScore: 84 },
  { term: 'shalar fut', category: 'sylheti', severity: 'moderate', baseScore: 84 },
  { term: 'bainsod', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'madarsod', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'sotmarani', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'sutmarani', category: 'sylheti', severity: 'severe', baseScore: 96 },
  { term: 'sudanir fula', category: 'sylheti', severity: 'severe', baseScore: 98 },
  { term: 'futhki', category: 'sylheti', severity: 'severe', baseScore: 90, requireExactToken: true },
  { term: 'futki', category: 'sylheti', severity: 'severe', baseScore: 90, requireExactToken: true },
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
  { term: 'bal', category: 'banglish', severity: 'mild', baseScore: 52, requireExactToken: true },
  { term: 'shala', category: 'banglish', severity: 'mild', baseScore: 54, requireExactToken: true },
  { term: 'sala', category: 'banglish', severity: 'mild', baseScore: 52, requireExactToken: true },
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
    'বাল্যকাল',
    'বালাই',
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
    'মাগুর',
    'পুতুল',
    'ফাঁকা',
    'ফাঁক',
    'বিছানা',
    'বিচার',
    'বীজ',
    'সকাল',
    'সোনা',
    'চোখ',
    'চুল',
    'চাঁদ',
    'ছোট',
    'ফোন',
    'ফুল',
    'ফুলা',
    'পোলা',
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
    'কিতা',
    'খবর',
    'ভালা',
    'আলহামদুলিল্লাহ',
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
    'beach',
    'sheet',
    'seat',
    'good',
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
  'তোরার',
  'তোরা',
  'তগো',
  'আপনি',
  'শুন',
  'হুন',
  'একটা',
  'বড়',
  'সত্যি',
  'tui',
  'tor',
  'torar',
  'toke',
  'tore',
  'you',
  'your',
  'ur',
  'f***',
]);

const SYLHETI_DIALECT_MARKERS = new Set([
  'কিতা',
  'হুন',
  'হুনো',
  'তোরার',
  'তোমরার',
  'আমরার',
  'গেছলাম',
  'আছিল',
  'আছইন',
  'খইস',
  'কইছস',
  'বেটা',
  'বেটি',
  'ফুলা',
  'ফুত',
  'ভালা',
  'বালা',
  'হানকি',
  'হুত্তার',
  'হুওরের',
  'হালার',
  'kita',
  'hun',
  'torar',
  'amrar',
  'gechlam',
  'achil',
  'fula',
]);

const CORRECTIVE_SAFE_PHRASES = [
  'গালি দিও না',
  'গালি দেবেন না',
  'গালি দিবেন না',
  'গালি দেওয়া',
  'গালি বলা',
  'গালি দিস না',
  'গালি দেওয়া ঠিক না',
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
    const banglishHint = /\b(?:tui|tor|torar|toke|ami|tumi|ki|kita|koro|nai|hobe|valo|vala|kotha|bhai|apu|shala|harami|bokachoda|madarchod|khanki|hanki|magi|fula)\b/i.test(
      text
    );
    return banglishHint ? 'banglish' : 'en';
  }
  return 'unknown';
}

function detectDialect(
  tokens: string[],
  scriptSummary: 'bn' | 'en' | 'banglish' | 'mixed' | 'unknown'
): 'standard_bn' | 'sylheti' | 'banglish' | 'english' | 'mixed' | 'unknown' {
  if (tokens.length === 0) return 'unknown';
  const sylhetiHits = tokens.filter((t) => SYLHETI_DIALECT_MARKERS.has(t)).length;
  if (sylhetiHits >= 1) return 'sylheti';
  if (scriptSummary === 'bn') return 'standard_bn';
  if (scriptSummary === 'banglish') return 'banglish';
  if (scriptSummary === 'en') return 'english';
  if (scriptSummary === 'mixed') return 'mixed';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// LAYER 1 (DICTIONARY-FREE): PHONETIC SKELETON & BOUNDED EDIT-DISTANCE ENGINE
// Catches unseen dialect/Sylheti shifts & Whisper mis-transcriptions
// ---------------------------------------------------------------------------
function toLatinPhoneticSkeleton(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'v')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/chh?/g, 'c')
    .replace(/sh/g, 's')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/[aeiouyw]/g, '')
    .replace(/[h]+/g, '')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/[^a-z]/g, '');
}

function toBengaliPhoneticSkeleton(raw: string): string {
  // Maps Bengali + Sylheti sound shifts into phonetic ASCII consonant skeleton
  const map: Record<string, string> = {
    'ক': 'k',
    'খ': 'k',
    'হ': 'k',
    'গ': 'g',
    'ঘ': 'g',
    'চ': 'c',
    'ছ': 's',
    'শ': 's',
    'স': 's',
    'ষ': 's',
    'জ': 'j',
    'ঝ': 'j',
    'য': 'j',
    'য়': 'y',
    'ট': 't',
    'ঠ': 't',
    'ত': 't',
    'থ': 't',
    'ড': 'd',
    'ঢ': 'd',
    'দ': 'd',
    'ধ': 'd',
    'ড়': 'r',
    'ঢ়': 'r',
    'র': 'r',
    'ল': 'l',
    'প': 'p',
    'ফ': 'p',
    'ব': 'b',
    'ভ': 'b',
    'ম': 'm',
    'ন': 'n',
    'ণ': 'n',
    'ঙ': 'n',
    'ং': 'n',
  };
  let out = '';
  for (const ch of raw) {
    if (map[ch]) {
      const c = map[ch];
      if (!out.endsWith(c)) out += c;
    }
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

interface PhoneticRootTarget {
  label: string;
  bnSkeleton?: string;
  latinSkeleton?: string;
  lang: 'bangla' | 'sylheti' | 'english' | 'banglish';
  score: number;
}

const PHONETIC_OBSCENE_ROOTS: PhoneticRootTarget[] = [
  { label: 'মাদারচোদ/মাদারসোদ', bnSkeleton: 'mdrsd', latinSkeleton: 'mdrcd', lang: 'bangla', score: 94 },
  { label: 'মাদারচোদ', bnSkeleton: 'mdrcd', latinSkeleton: 'mdrscd', lang: 'bangla', score: 94 },
  { label: 'বাইনচোদ/বাইনসোদ', bnSkeleton: 'bncd', latinSkeleton: 'bncd', lang: 'bangla', score: 94 },
  { label: 'বাইনসোদ', bnSkeleton: 'bnsd', latinSkeleton: 'bnsd', lang: 'sylheti', score: 94 },
  { label: 'বোকাচোদা', bnSkeleton: 'bkcd', latinSkeleton: 'bkcd', lang: 'bangla', score: 93 },
  { label: 'চুদানির', bnSkeleton: 'cdnr', latinSkeleton: 'cdnr', lang: 'bangla', score: 92 },
  { label: 'সুদানির', bnSkeleton: 'sdnr', latinSkeleton: 'sdnr', lang: 'sylheti', score: 91 },
  { label: 'চুতমারানি', bnSkeleton: 'ctmrn', latinSkeleton: 'ctmrn', lang: 'bangla', score: 94 },
  { label: 'সুতমারানি', bnSkeleton: 'stmrn', latinSkeleton: 'stmrn', lang: 'sylheti', score: 94 },
  { label: 'খানকির/হানকির', bnSkeleton: 'knkr', latinSkeleton: 'knkr', lang: 'sylheti', score: 90 },
  { label: 'মাগির', bnSkeleton: 'mgr', latinSkeleton: 'mgr', lang: 'bangla', score: 84 },
  { label: 'হারামজাদা', bnSkeleton: 'krmjd', latinSkeleton: 'rmjd', lang: 'bangla', score: 90 },
  { label: 'motherfucker', latinSkeleton: 'mtrfckr', lang: 'english', score: 95 },
  { label: 'asshole', latinSkeleton: 'ssl', lang: 'english', score: 86 },
  { label: 'bastard', latinSkeleton: 'bstrd', lang: 'english', score: 84 },
];

function findUnseenPhoneticMatches(
  tokens: string[],
  config: VoiceProfanityConfig,
  alreadyMatchedSet: Set<string>
): Array<{ term: string; category: VoiceProfanityCategory; score: number; signal: string }> {
  const hits: Array<{ term: string; category: VoiceProfanityCategory; score: number; signal: string }> = [];

  for (const tok of tokens) {
    if (tok.length < 4 || BUILTIN_SAFE_WORDS.has(tok) || alreadyMatchedSet.has(tok)) continue;
    const isBn = /[\u0980-\u09FF]/.test(tok);
    const isLat = /^[a-z]+$/i.test(tok);
    if (!isBn && !isLat) continue;

    const skel = isBn ? toBengaliPhoneticSkeleton(tok) : toLatinPhoneticSkeleton(tok);
    if (skel.length < 4) continue;

    for (const root of PHONETIC_OBSCENE_ROOTS) {
      if (root.lang === 'bangla' && !config.detectBangla) continue;
      if (root.lang === 'sylheti' && config.detectSylheti === false && !config.detectBangla) continue;
      if (root.lang === 'banglish' && !config.detectBanglish) continue;
      if (root.lang === 'english' && !config.detectEnglish) continue;

      const targetSkel = isBn ? root.bnSkeleton : root.latinSkeleton;
      if (!targetSkel || targetSkel.length < 4) continue;

      const dist = levenshtein(skel, targetSkel);
      const maxLen = Math.max(skel.length, targetSkel.length);
      const sim = 1 - dist / maxLen;

      if (dist <= 1 && sim >= 0.8) {
        hits.push({
          term: `${tok} (~${root.label})`,
          category: root.lang === 'sylheti' ? 'sylheti' : 'semantic',
          score: root.score,
          signal: `ফোনেটিক কঙ্কাল বিশ্লেষণ (${tok})`,
        });
        break;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// LAYER 2 (DICTIONARY-FREE): MORPHOLOGICAL & SEMANTIC CONTEXT ANALYZER
// Understands intent, unseen compound insults, & harassment frames
// ---------------------------------------------------------------------------
interface SemanticFrameMatch {
  label: string;
  score: number;
  signal: string;
  category: VoiceProfanityCategory;
}

function analyzeSemanticAbuseFrames(
  workingText: string,
  tokens: string[],
  config: VoiceProfanityConfig
): SemanticFrameMatch[] {
  const findings: SemanticFrameMatch[] = [];
  const bnOrSylhetiActive = config.detectBangla || config.detectSylheti !== false;
  const banglishActive = config.detectBanglish || config.detectSylheti !== false;

  // 1. Morphological unseen inflections of obscene Bangla/Sylheti/Banglish/English stems
  if (bnOrSylhetiActive) {
    const bnInflectedPatterns: Array<{ rx: RegExp; label: string; score: number; sig: string }> = [
      {
        rx: /(?:চোদ|চুদ|সুদ|ছোদ|ছোত|সুত)(?:া|ি|ু|ে|ো|ন|ম|ব|স|ল|র)/,
        label: 'অশ্লীল ধাতুগত ক্রিয়া/শব্দ',
        score: 90,
        sig: 'অজানা/পরিবর্তিত বাংলা-সিলেটি রূপতাত্ত্বিক বিশ্লেষণ',
      },
      {
        rx: /(?:খানক|হানক|মাগী|মাগি|ভোদা|ভোদ|পুটক|ফুতক|চুতম|সুতম|ছোতম)[অ-৿]{0,8}/,
        label: 'অশ্লীল যৌন/গালি রূপ',
        score: 92,
        sig: 'শব্দমূল (Stemming) ভিত্তিক অশ্লীলতা শনাক্ত',
      },
    ];
    for (const tok of tokens) {
      if (BUILTIN_SAFE_WORDS.has(tok) || tok.length < 4) continue;
      for (const pat of bnInflectedPatterns) {
        if (pat.rx.test(tok)) {
          findings.push({
            label: tok,
            score: pat.score,
            signal: pat.sig,
            category: 'semantic',
          });
          break;
        }
      }
    }
  }

  if (banglishActive || config.detectEnglish) {
    const latinStemRx = /(?:m[a@4]d[a@4]r\s*c+h+[ou]+d+|b+[aei]+n+\s*c+h+[ou]+d+|b+o+k+a+\s*c+h+[ou]+d+|s*u*t*m[a@4]r[a@4]n[iy]|f+u+c+k+[a-z]*|c+h+u+d+[a-z]{1,6}|c+h+o+d+[a-z]{1,6}|h[a@4]nk[iy]r)/i;
    for (const tok of tokens) {
      if (BUILTIN_SAFE_WORDS.has(tok) || tok.length < 4) continue;
      if (latinStemRx.test(tok)) {
        findings.push({
          label: tok,
          score: 92,
          signal: 'ইংরেজি/বাংলিশ শব্দমূল বিশ্লেষণ',
          category: 'semantic',
        });
      }
    }
  }

  // 2. Semantic Insult Frame: [2nd Person / Family Target] + [Animal / Filth / Offspring Degradation]
  // Safe example: "আমার কুত্তাটা খুব কিউট" (1st person / affectionate) -> NOT flagged!
  // Abusive example: "তুই একটা নর্দমার পোলা" / "তোর বাপ শুয়োরের জাত" / "তোরার বংশ হারামি" -> FLAGGED even if noun isn't in static list!
  const semanticTargetInsultFrames: Array<{ rx: RegExp; label: string; score: number; sig: string }> = [
    {
      rx: /(?:তুই|তোর|তোকে|তোরে|তোরার|তগো|তোদের|tui|tor|torar|your)\s+(?:একটা\s+|বড়\s+|আসল\s+|পুরা\s+|ekta\s+)?(?:মা|বোন|বাপ|চৌদ্দগুষ্টি|mom|mother|sister)?\s*(?:কুত্তা|কুকুর|শুয়োর|হুওর|হুত্তা|গাধা|বানর|জানোয়ার|নর্দমা|জঞ্জাল|রাস্তার|বেজন্মা|হারামি|বদমাইশ|দালাল|লুচ্চা|kuttar|shuorer|suorer|gadha|janowar|dog|pig|trash)/i,
      label: 'ব্যক্তিগত অবমাননাকর আক্রমণ (Semantic Frame)',
      score: 84,
      sig: 'কথার অর্থ ও প্রসঙ্গ: সরাসরি ব্যক্তিগত/পারিবারিক অপমান',
    },
    {
      rx: /(?:তুই|তোর|তোকে|তোরে|তোরার|তগো|tui|tor|torar)\s+(?:মা|মারে|মাকে|বোন|বোনরে|বোনকে|মা-বোন|ma|bon|mom|sister)\s*(?:কে|রে|দিয়ে|নিয়ে|চুদ|চোদ|সুত|ছোদ|মারা|মারি|fuck|f\*+)/i,
      label: 'পারিবারিক/যৌন হয়রানিমূলক গালি',
      score: 96,
      sig: 'গুরুতর পারিবারিক ও যৌন আক্রমণাত্মক প্রসঙ্গ',
    },
    {
      rx: /(?:তোর|তোদের|তোরার|tor|your)\s+(?:বাপ|মা|বোন|গুষ্টি|বংশ)\s*(?:এর|র)?\s*(?:পোলা|ফুলা|ফুত|বাচ্চা|জাত|ছানা|baccha|pola|fula)/i,
      label: 'বংশ/পরিবার কেন্দ্রিক কটূক্তি',
      score: 78,
      sig: 'অবমাননাকর পারিবারিক ইঙ্গিত',
    },
    {
      rx: /(?:মাইরা\s*ফালামু|মেরে\s*ফেলব|জবাই\s*করমু|ল্যাংটা\s*কর|ধর্ষণ\s*কর|কাপড়\s*খোল|ন্যুড\s*(?:দে|পাঠা)|nude\s*(?:send|de|patha)|send\s*nudes|suck\s*my|lick\s*my|kill\s*yourself)/i,
      label: 'হুমকি বা যৌন হয়রানিমূলক বক্তব্য',
      score: 92,
      sig: 'সহিংস হুমকি বা অশ্লীল হয়রানি শনাক্ত',
    },
  ];

  for (const frame of semanticTargetInsultFrames) {
    if (frame.rx.test(workingText)) {
      findings.push({
        label: frame.label,
        score: frame.score,
        signal: frame.sig,
        category: 'semantic',
      });
    }
  }

  return findings;
}

export interface VoiceProfanityInspectContext {
  avgTokenProb?: number;
  durationSec?: number;
  rms?: number;
}

export function analyzeVoiceTranscriptProfanity(
  rawTranscript: string,
  config: VoiceProfanityConfig,
  probOrContext?: number | VoiceProfanityInspectContext
): VoiceProfanityAnalysis {
  const ctx: VoiceProfanityInspectContext =
    typeof probOrContext === 'number' ? { avgTokenProb: probOrContext } : probOrContext || {};
  const whisperAvgTokenProb = ctx.avgTokenProb;
  const detectSylheti = config.detectSylheti !== false;
  const reviewUnclearEnabled = config.reviewUnclearEnabled !== false;

  const { cleaned, isHallucinationOrEmpty } = cleanWhisperTranscript(rawTranscript);
  const detectedScriptSummary = detectScriptSummary(cleaned);

  if (isHallucinationOrEmpty || !cleaned) {
    // Check if actual voice speech energy existed despite Whisper failing to transcribe cleanly!
    const hasRealSpeechEnergy =
      typeof ctx.rms === 'number' &&
      typeof ctx.durationSec === 'number' &&
      ctx.rms >= 0.0045 &&
      ctx.durationSec >= 1.3;

    if (reviewUnclearEnabled && hasRealSpeechEnergy) {
      return {
        cleanedTranscript: cleaned,
        isHallucinationOrEmpty: true,
        isProfane: false,
        needsReview: true,
        reviewReason: 'অডিওতে স্পষ্ট কণ্ঠস্বর থাকলেও উচ্চারণ অস্পষ্ট — ভুল ডিলিট এড়াতে অ্যাডমিন রিভিউ কিউতে পাঠানো হয়েছে',
        confidenceScore: 35,
        matchedWords: [],
        matchedCategories: [],
        semanticSignals: ['অস্পষ্ট অডিও (Unclear Speech -> Admin Review Queue)'],
        dialectDetected: 'unknown',
        contextReason: 'অস্পষ্ট ভয়েস অডিও — অ্যাডমিন রিভিউ প্রয়োজন',
        detectedScriptSummary,
      };
    }

    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: true,
      isProfane: false,
      needsReview: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      semanticSignals: [],
      dialectDetected: 'unknown',
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
  const dialectDetected = detectDialect(rawTokens, detectedScriptSummary);

  const allowedSet = new Set<string>([...BUILTIN_SAFE_WORDS, ...customAllowed.filter((w) => !w.includes(' '))]);
  const filteredTokens = rawTokens.filter((tok) => !allowedSet.has(tok));
  const filteredText = filteredTokens.join(' ').trim();

  if (!filteredText) {
    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: false,
      isProfane: false,
      needsReview: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      semanticSignals: ['নিরাপদ/হোয়াইটলিস্টেড স্বাভাবিক কথোপকথন'],
      dialectDetected,
      contextReason: 'Allowed / নিরাপদ শব্দ হিসেবে চিহ্নিত',
      detectedScriptSummary,
    };
  }

  // Build active dictionaries from Admin Settings
  const lexicon: LexiconEntry[] = [];
  if (config.detectBangla) lexicon.push(...BANGLA_LEXICON);
  if (detectSylheti) lexicon.push(...SYLHETI_LEXICON);
  if (config.detectBanglish) lexicon.push(...BANGLISH_LEXICON);
  if (config.detectEnglish) lexicon.push(...ENGLISH_LEXICON);

  const matchedWords: string[] = [];
  const matchedCategories = new Set<VoiceProfanityCategory>();
  const semanticSignals: string[] = [];
  let maxScore = 0;
  let hitCount = 0;

  if (dialectDetected === 'sylheti') {
    semanticSignals.push('সিলেটি (Sylheti) আঞ্চলিক উচ্চারণ বিশ্লেষণ');
  }

  // 2. Check Admin Custom Blocked Words
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

  // 3. Check Lexicon (Standard Bangla + Sylheti + Banglish + English)
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

  // 4. Collapsed spacing catch for split severe slurs (e.g. "মা দার চোদ", "হান কির ফুলা")
  if (config.detectBangla || detectSylheti || config.detectBanglish) {
    const collapsed = filteredText.replace(/\s+/g, '');
    const collapsedSevere = [
      'মাদারচোদ',
      'মাদারসোদ',
      'বাইনচোদ',
      'বাইনসোদ',
      'বোনচোদ',
      'খানকিরপোলা',
      'খানকিরফুলা',
      'হানকিরফুলা',
      'হানকিরপোলা',
      'মাগিরপোলা',
      'মাগিরফুলা',
      'বোকাচোদা',
      'হারামজাদা',
      'madarchod',
      'madarsod',
      'bainchod',
      'bainsod',
      'bhenchod',
      'bokachoda',
      'hankirfula',
      'motherfucker',
    ];
    for (const cTerm of collapsedSevere) {
      if (cTerm === 'motherfucker' && !config.detectEnglish) continue;
      if (collapsed.includes(cTerm)) {
        if (!matchedWords.includes(cTerm)) matchedWords.push(cTerm);
        const cat: VoiceProfanityCategory =
          cTerm === 'motherfucker'
            ? 'english'
            : /হানক|ফুলা|সোদ/.test(cTerm) || cTerm.includes('fula') || cTerm.includes('sod')
              ? 'sylheti'
              : /[\u0980-\u09FF]/.test(cTerm)
                ? 'bangla'
                : 'banglish';
        matchedCategories.add(cat);
        maxScore = Math.max(maxScore, 95);
        hitCount++;
      }
    }
  }

  // 5. Dictionary-Free Semantic & Morphological Abuse Analysis (catches NEW / unseen slurs & intent)
  const semanticHits = analyzeSemanticAbuseFrames(workingText, filteredTokens, config);
  for (const sHit of semanticHits) {
    if (!matchedWords.includes(sHit.label)) matchedWords.push(sHit.label);
    matchedCategories.add(sHit.category);
    if (!semanticSignals.includes(sHit.signal)) semanticSignals.push(sHit.signal);
    maxScore = Math.max(maxScore, sHit.score);
    hitCount++;
  }

  // 6. Dictionary-Free Phonetic Skeleton & Bounded Edit-Distance Analysis (catches distorted/Sylheti unseen spellings)
  if (maxScore < 92) {
    const alreadyMatched = new Set(matchedWords.map((w) => normalizeForMatch(w)));
    const phoneticHits = findUnseenPhoneticMatches(filteredTokens, config, alreadyMatched);
    for (const pHit of phoneticHits) {
      if (!matchedWords.includes(pHit.term)) matchedWords.push(pHit.term);
      matchedCategories.add(pHit.category);
      if (!semanticSignals.includes(pHit.signal)) semanticSignals.push(pHit.signal);
      maxScore = Math.max(maxScore, pHit.score);
      hitCount++;
    }
  }

  // Check if completely clean OR low-confidence ambiguous non-hit audio
  if (matchedWords.length === 0) {
    const isLowConfUnclear =
      reviewUnclearEnabled &&
      typeof whisperAvgTokenProb === 'number' &&
      whisperAvgTokenProb < 0.34 &&
      typeof ctx.rms === 'number' &&
      ctx.rms >= 0.005 &&
      rawTokens.length >= 2;

    if (isLowConfUnclear) {
      return {
        cleanedTranscript: cleaned,
        isHallucinationOrEmpty: false,
        isProfane: false,
        needsReview: true,
        reviewReason: `উচ্চারণ অস্পষ্ট (STT Confidence ${Math.round(whisperAvgTokenProb * 100)}%) — অ্যাডমিন রিভিউ কিউতে রাখা হয়েছে`,
        confidenceScore: 38,
        matchedWords: [],
        matchedCategories: [],
        semanticSignals: [...semanticSignals, 'কম অ্যাকোস্টিক কনফিডেন্স (Admin Review)'],
        dialectDetected,
        contextReason: 'অস্পষ্ট উচ্চারণ — ভুল ডিলিট না করে রিভিউ কিউতে রাখা হয়েছে',
        detectedScriptSummary,
      };
    }

    return {
      cleanedTranscript: cleaned,
      isHallucinationOrEmpty: false,
      isProfane: false,
      needsReview: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      semanticSignals: [...semanticSignals, 'স্বাভাবিক ও শালীন কথোপকথন'],
      dialectDetected,
      contextReason: 'কোনো গালি বা অশালীন প্রসঙ্গ পাওয়া যায়নি',
      detectedScriptSummary,
    };
  }

  // 7. Context-Aware Adjustments (Reduce False Positives & Boost Direct Abuse)
  let adjustedScore = maxScore;

  if (hitCount >= 2) {
    adjustedScore = Math.min(100, adjustedScore + 10);
    semanticSignals.push('একাধিক অশালীন ইঙ্গিত');
  }

  if (rawTokens.some((tok) => DIRECTED_ABUSE_CUES.has(tok))) {
    adjustedScore = Math.min(100, adjustedScore + 8);
    semanticSignals.push('ব্যক্তিগত আক্রমণসূচক প্রসঙ্গ (তুই/তোর/you)');
  }

  const hasCorrectiveContext = CORRECTIVE_SAFE_PHRASES.some((phrase) => workingText.includes(phrase));
  if (hasCorrectiveContext && maxScore < 94) {
    adjustedScore = Math.max(0, adjustedScore - 30);
    semanticSignals.push('সতর্কতামূলক/শিক্ষামূলক বাক্য সুরক্ষা');
  }

  if (typeof whisperAvgTokenProb === 'number' && Number.isFinite(whisperAvgTokenProb)) {
    if (whisperAvgTokenProb < 0.30 && maxScore < 92) {
      adjustedScore = Math.max(0, adjustedScore - 22);
      semanticSignals.push(`অস্পষ্ট অডিও পেনাল্টি (${Math.round(whisperAvgTokenProb * 100)}%)`);
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

  // Gray-zone / unclear audio -> Route to Admin Review Queue instead of wrongly deleting!
  const needsReview =
    reviewUnclearEnabled &&
    !isProfane &&
    adjustedScore >= Math.max(36, threshold - 20);

  const reviewReason = needsReview
    ? `সন্দেহজনক বা অস্পষ্ট ইঙ্গিত (Score ${Math.round(adjustedScore)}/${threshold}) — নিরাপদে অ্যাডমিন রিভিউ কিউতে রাখা হয়েছে`
    : undefined;

  const contextReason = isProfane
    ? `অফলাইন AI গালি/অপমান শনাক্ত (${Array.from(matchedCategories).join('+')})${semanticSignals.length ? ` · ${semanticSignals.join(', ')}` : ''}`
    : needsReview
      ? reviewReason!
      : `সন্দেহজনক কিন্তু সীমার নিচে (Score ${Math.round(adjustedScore)}/${threshold}) — সাধারণ কথা হিসেবে অক্ষত রাখা হয়েছে`;

  return {
    cleanedTranscript: cleaned,
    isHallucinationOrEmpty: false,
    isProfane,
    needsReview,
    reviewReason,
    confidenceScore: Math.round(adjustedScore),
    matchedWords,
    matchedCategories: Array.from(matchedCategories),
    semanticSignals,
    dialectDetected,
    contextReason,
    detectedScriptSummary,
  };
}
