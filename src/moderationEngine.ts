import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { proto, WASocket } from '@whiskeysockets/baileys';
import { getMayaResponse } from './aiEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'moderation_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface ModerationSettings {
  adminShield: boolean;
  antiSticker: boolean;
  antiStickerSpam: boolean;
  antiGif: boolean;
  antiVideo: boolean;
  antiImage: boolean;
  antiViewOnce: boolean;
  antiBadword: boolean;
  antiLink: boolean;
  autoKick3Warnings: boolean;
  botReply: boolean;
  customBadwords: string[];
  // Individual Temporary Mute (Auto-Delete Interception for Sticker Spammers)
  individualMuteEnabled: boolean;
  individualMuteStickerLimit: number;
  individualMuteTimeWindow: number; // in seconds
  individualMuteDurationMinutes: number; // in minutes
  // Maya AI Settings
  mayaAiEnabled: boolean;
  mayaPrivateReply: boolean; // Auto reply to individual private WhatsApp messages
  mayaGroupReply: boolean;   // Auto reply to group WhatsApp messages
  aiProvider: 'gemini' | 'groq' | 'openrouter' | 'auto';
  geminiModel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  mayaRomantic: boolean;
  mayaFunny: boolean;
  mayaAutoParticipate: boolean;
  mayaReplyCooldown: number; // in seconds
  mayaReplyFrequency: number; // 0-100 probability
  mayaLanguage: string;
  mayaMemoryLimit: number;
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  action: 'deleted' | 'warned' | 'kicked' | 'locked' | 'unlocked' | 'error' | 'replied' | 'restricted' | 'unmuted';
  reason: string;
  details?: string;
  warningCount?: number;
}

export interface UserWarning {
  count: number;
  lastViolation: number;
  violations: Array<{ timestamp: number; reason: string }>;
}

export interface GroupLock {
  groupId: string;
  lockedUntil: number;
  originalSetting: string;
  reason: string;
  timerActive?: boolean;
}

export interface RestrictedUser {
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  restrictedAt: number;
  expiresAt: number;
  reason: string;
  violationCount: number;
}

export interface ModerationDB {
  settings: ModerationSettings;
  warnings: Record<string, UserWarning>; // key: `${groupId}:${senderJid}`
  groupLocks: Record<string, GroupLock>; // key: groupId
  restrictedUsers: Record<string, RestrictedUser>; // key: `${groupId}:${normalizeJid(senderJid)}`
  activityLogs: ActivityLog[];
  stats: {
    messagesChecked: number;
    warningsGiven: number;
    deletedMessages: number;
    kickedMembers: number;
    groupLocksTriggered: number;
    individualMutesTriggered?: number;
    restrictedMessagesBlocked?: number;
  };
}

const DEFAULT_SETTINGS: ModerationSettings = {
  adminShield: true,
  antiSticker: false,
  antiStickerSpam: true,
  antiGif: true,
  antiVideo: false,
  antiImage: false,
  antiViewOnce: true,
  antiBadword: true,
  antiLink: true,
  autoKick3Warnings: true,
  botReply: true,
  customBadwords: [],
  individualMuteEnabled: true,
  individualMuteStickerLimit: 3,
  individualMuteTimeWindow: 5,
  individualMuteDurationMinutes: 10,
  mayaAiEnabled: true,
  mayaPrivateReply: true,
  mayaGroupReply: true,
  aiProvider: 'auto',
  geminiModel: 'gemini-3.1-flash-lite',
  geminiApiKey: '',
  groqApiKey: '',
  openrouterApiKey: '',
  mayaRomantic: true,
  mayaFunny: true,
  mayaAutoParticipate: true,
  mayaReplyCooldown: 10,
  mayaReplyFrequency: 100,
  mayaLanguage: 'auto',
  mayaMemoryLimit: 20,
};

// In-memory runtime database
let db: ModerationDB = {
  settings: { ...DEFAULT_SETTINGS },
  warnings: {},
  groupLocks: {},
  restrictedUsers: {},
  activityLogs: [],
  stats: {
    messagesChecked: 0,
    warningsGiven: 0,
    deletedMessages: 0,
    kickedMembers: 0,
    groupLocksTriggered: 0,
    individualMutesTriggered: 0,
    restrictedMessagesBlocked: 0,
  },
};

// Load database from disk
export function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      db = {
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        warnings: data.warnings || {},
        groupLocks: data.groupLocks || {},
        restrictedUsers: data.restrictedUsers || {},
        activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs.slice(-100) : [],
        stats: {
          messagesChecked: data.stats?.messagesChecked || 0,
          warningsGiven: data.stats?.warningsGiven || 0,
          deletedMessages: data.stats?.deletedMessages || 0,
          kickedMembers: data.stats?.kickedMembers || 0,
          groupLocksTriggered: data.stats?.groupLocksTriggered || 0,
          individualMutesTriggered: data.stats?.individualMutesTriggered || 0,
          restrictedMessagesBlocked: data.stats?.restrictedMessagesBlocked || 0,
        },
      };
      console.log('Moderation DB loaded successfully. Logs count:', db.activityLogs.length, 'Restricted users:', Object.keys(db.restrictedUsers).length);
    } else {
      saveDatabase();
    }
  } catch (err: any) {
    console.error('Error loading moderation DB, using defaults:', err.message);
  }
}

// Atomic save database to disk
let saveTimeout: NodeJS.Timeout | null = null;
export function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const tmpPath = DB_PATH + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err: any) {
      console.error('Error saving moderation DB:', err.message);
    }
  }, 200);
}

// Initialize on start
loadDatabase();

// In-memory caches for fast processing
const processedMsgIds = new Set<string>();
const stickerTimestamps: Record<string, number[]> = {}; // key: `${groupId}:${senderJid}`
const groupMetaCache: Record<string, { meta: any; fetchedAt: number }> = {};
const lastAiReplyTime: Record<string, number> = {}; // key: groupId

export function getSettings(): ModerationSettings {
  return { ...db.settings };
}

export function updateSettings(newSettings: Partial<ModerationSettings>): ModerationSettings {
  db.settings = { ...db.settings, ...newSettings };
  saveDatabase();
  return { ...db.settings };
}

export function getStats() {
  return { ...db.stats };
}

export function getActivityLogs(limit = 50): ActivityLog[] {
  return db.activityLogs.slice(-limit).reverse();
}

export function resetWarnings(): boolean {
  db.warnings = {};
  saveDatabase();
  return true;
}

export function clearActivityLogs(): boolean {
  db.activityLogs = [];
  saveDatabase();
  return true;
}

export function addActivityLog(log: Omit<ActivityLog, 'id' | 'timestamp'>) {
  const newLog: ActivityLog = {
    ...log,
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
  };
  db.activityLogs.push(newLog);
  if (db.activityLogs.length > 200) {
    db.activityLogs = db.activityLogs.slice(-200);
  }
  saveDatabase();
}

// -------------------------------------------------------------
// INDIVIDUAL TEMPORARY MUTE ENGINE (Auto-Delete Interception)
// -------------------------------------------------------------
export function getRestrictedUserKey(groupId: string, senderJid: string): string {
  return `${groupId}:${normalizeJid(senderJid)}`;
}

export function isUserRestricted(
  groupId: string,
  senderJid: string
): { restricted: boolean; remainingMs: number; restriction?: RestrictedUser } {
  if (!db.restrictedUsers) {
    db.restrictedUsers = {};
    return { restricted: false, remainingMs: 0 };
  }

  const key = getRestrictedUserKey(groupId, senderJid);
  const rawKey = `${groupId}:${senderJid}`;
  let restriction = db.restrictedUsers[key] || db.restrictedUsers[rawKey];

  if (!restriction) {
    return { restricted: false, remainingMs: 0 };
  }

  const now = Date.now();
  if (now >= restriction.expiresAt) {
    // Restriction duration has elapsed! Automatically remove
    delete db.restrictedUsers[key];
    delete db.restrictedUsers[rawKey];
    saveDatabase();

    addActivityLog({
      groupId,
      groupName: restriction.groupName || 'WhatsApp Group',
      senderJid: restriction.senderJid,
      senderPhone: restriction.senderPhone,
      action: 'unmuted',
      reason: 'সাময়িক রেস্ট্রিকশনের মেয়াদ শেষ হয়েছে (Auto Lifted)',
    });

    return { restricted: false, remainingMs: 0 };
  }

  return {
    restricted: true,
    remainingMs: restriction.expiresAt - now,
    restriction,
  };
}

export function restrictUser(
  groupId: string,
  groupName: string,
  senderJid: string,
  senderPhone: string,
  durationMinutes: number = 10,
  reason: string = 'অতিরিক্ত স্টিকার স্প্যাম'
): RestrictedUser {
  if (!db.restrictedUsers) db.restrictedUsers = {};

  const now = Date.now();
  const expiresAt = now + Math.max(1, durationMinutes) * 60 * 1000;
  const key = getRestrictedUserKey(groupId, senderJid);

  const prevCount = db.restrictedUsers[key]?.violationCount || 0;

  const restriction: RestrictedUser = {
    groupId,
    groupName,
    senderJid: normalizeJid(senderJid),
    senderPhone,
    restrictedAt: now,
    expiresAt,
    reason,
    violationCount: prevCount + 1,
  };

  db.restrictedUsers[key] = restriction;
  db.stats.individualMutesTriggered = (db.stats.individualMutesTriggered || 0) + 1;
  saveDatabase();

  addActivityLog({
    groupId,
    groupName,
    senderJid,
    senderPhone,
    action: 'restricted',
    reason: `Individual Temporary Mute (${durationMinutes} মিনিট): ${reason}`,
    details: `${durationMinutes} মিনিটের জন্য গ্রুপের সকল নতুন মেসেজ স্বয়ংক্রিয়ভাবে মুছে দেওয়া হবে`,
  });

  return restriction;
}

export function unrestrictUser(groupId: string, senderJid: string): boolean {
  if (!db.restrictedUsers) return false;

  const key = getRestrictedUserKey(groupId, senderJid);
  const rawKey = `${groupId}:${senderJid}`;

  const restriction = db.restrictedUsers[key] || db.restrictedUsers[rawKey];
  if (restriction) {
    delete db.restrictedUsers[key];
    delete db.restrictedUsers[rawKey];
    saveDatabase();

    addActivityLog({
      groupId,
      groupName: restriction.groupName || 'WhatsApp Group',
      senderJid: restriction.senderJid,
      senderPhone: restriction.senderPhone,
      action: 'unmuted',
      reason: 'ম্যানুয়ালি রেস্ট্রিকশন তুলে দেওয়া হয়েছে (Manual Unmute)',
    });
    return true;
  }
  return false;
}

export function getActiveRestrictedUsers(): Array<RestrictedUser & { remainingSeconds: number; remainingText: string }> {
  if (!db.restrictedUsers) return [];

  const now = Date.now();
  const list: Array<RestrictedUser & { remainingSeconds: number; remainingText: string }> = [];

  for (const [key, user] of Object.entries(db.restrictedUsers)) {
    if (now >= user.expiresAt) {
      delete db.restrictedUsers[key];
      saveDatabase();
    } else {
      const remainingSec = Math.max(0, Math.ceil((user.expiresAt - now) / 1000));
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;

      list.push({
        ...user,
        remainingSeconds: remainingSec,
        remainingText,
      });
    }
  }

  return list.sort((a, b) => a.expiresAt - b.expiresAt);
}

// Check sticker spam within configurable time window
export function recordStickerAndCheckIndividualSpam(
  groupId: string,
  senderJid: string,
  timeWindowSec: number = 5,
  limit: number = 3
): boolean {
  const key = `${groupId}:${senderJid}`;
  const now = Date.now();
  if (!stickerTimestamps[key]) {
    stickerTimestamps[key] = [];
  }

  const windowMs = Math.max(1, timeWindowSec) * 1000;
  stickerTimestamps[key] = stickerTimestamps[key].filter((t) => now - t <= windowMs);
  stickerTimestamps[key].push(now);

  return stickerTimestamps[key].length >= limit;
}

// Background monitor to lift expired restrictions automatically
export function startRestrictedUsersMonitor() {
  setInterval(() => {
    if (!db.restrictedUsers) return;
    const now = Date.now();
    let changed = false;

    for (const [key, user] of Object.entries(db.restrictedUsers)) {
      if (now >= user.expiresAt) {
        delete db.restrictedUsers[key];
        changed = true;
        console.log(`[Individual Mute] Restriction expired for @${user.senderPhone} in ${user.groupName}. Auto-lifted.`);
        addActivityLog({
          groupId: user.groupId,
          groupName: user.groupName,
          senderJid: user.senderJid,
          senderPhone: user.senderPhone,
          action: 'unmuted',
          reason: 'সাময়িক রেস্ট্রিকশনের মেয়াদ শেষ হয়েছে (Auto Lifted)',
        });
      }
    }

    if (changed) {
      saveDatabase();
    }
  }, 10000);
}

// Start auto-lift timer
startRestrictedUsersMonitor();

// -------------------------------------------------------------
// MULTILINGUAL ANTI-BADWORD MATCHING ENGINE
// -------------------------------------------------------------

// Comprehensive dictionary covering Bangla, Sylheti, Banglish, Hindi/Urdu, English, Arabic
const BENGALI_BADWORDS = [
  'খানকি', 'খানকির', 'মাগি', 'মাগির', 'বেশ্যা', 'বেশ্যার', 'রান্ডি', 'রান্ডির',
  'চুদা', 'চুদানি', 'চুদানির', 'চুদ', 'চোদা', 'চোদানি', 'চোদানির', 'মাদারচোদ',
  'মাদারচুদা', 'বাইনচোদ', 'বাইনচুদা', 'ভোনচোদ', 'কুত্তা', 'কুত্তার', 'কুত্তির',
  'শুয়োর', 'শুয়োরের', 'হারামি', 'হারামজাদা', 'হারামখোর', 'ভোদা', 'ভোদাই',
  'ধোন', 'লুচ্চা', 'লুচ্চামি', 'গুয়া', 'গুয়ার', 'গুদে', 'গুদ', 'বাল'
];

// Sylheti local slang
const SYLHETI_BADWORDS = [
  'ফুয়া', 'রান্দি', 'খাউয়াস', 'আওলাইন্না', 'মুতার', 'নাঙ্গট'
];

// Banglish (slang transliterated into English letters)
const BANGLISH_BADWORDS = [
  'khanki', 'khankir', 'magi', 'magir', 'besha', 'beshar', 'beshya',
  'randi', 'randir', 'raandi', 'choda', 'chudani', 'chuda', 'chudanir',
  'madarchod', 'madarchuda', 'bainchod', 'baimchod', 'bhenchod', 'behnchod',
  'harami', 'haramzada', 'kuttar baccha', 'shuorer baccha', 'bhoda', 'bhodai',
  'dhon', 'guya', 'gud', 'bal', 'chutia', 'chutiya', 'chod'
];

// Hindi / Urdu slang
const HINDI_URDU_BADWORDS = [
  'madarchod', 'bhenchod', 'behnchod', 'gaand', 'gandu', 'lund', 'lauda',
  'laude', 'lavde', 'raand', 'bsdk', 'bhosdike', 'chutiya', 'harami', 'kutte'
];

// English profanities
const ENGLISH_BADWORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches',
  'asshole', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'nigga'
];

// Arabic profanities
const ARABIC_BADWORDS = [
  'شرموطة', 'قحبة', 'كس', 'طيز', 'منيوك', 'ابن الكلب', 'عرص', 'زب'
];

// Safe words that contain small substrings like 'bal' or 'balti' and must NEVER be flagged
const SAFE_WHITELIST = new Set([
  'বালতি', 'বালিশ', 'বালক', 'বালিকা', 'বাল্য', 'বাল্যকাল', 'বালু', 'বাঙালি',
  'বাঙালী', 'ইকবাল', 'আবুল', 'সবল', 'দূর্বল', 'দুর্বল', 'বল', 'বলা', 'বলে',
  'বলুন', 'বলবেন', 'বলো', 'কথা', 'ভালো', 'চাল', 'ডাল', 'পাল', 'কাল', 'মালয়েশিয়া',
  'ball', 'balance', 'global', 'balcony', 'bald', 'iqbal', 'verbal', 'tribal',
  'herbal', 'football', 'basketball', 'baseball', 'shobhal'
]);

// Normalization function: strips accents, reduces repeated consecutive letters, decodes leetspeak
function normalizeText(raw: string): string {
  let str = raw.toLowerCase();

  // Leetspeak replacements
  str = str
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b');

  // Remove invisible and zero-width characters
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');

  return str;
}

// Fast badword match
export function checkBadwordViolation(text: string, customList: string[] = []): { isBad: boolean; matchedWord?: string } {
  if (!text || text.trim().length === 0) return { isBad: false };

  const normalized = normalizeText(text);

  // 1. Check custom badwords from dashboard
  for (const custom of customList) {
    const trimmed = custom.trim().toLowerCase();
    if (trimmed.length > 1 && normalized.includes(trimmed)) {
      return { isBad: true, matchedWord: trimmed };
    }
  }

  // Check spaced letters (e.g. "খ া ন কি" or "b a l" or "f u c k")
  const collapsedSpaced = normalized.replace(/\s+/g, '');

  // 2. Exact word tokens check
  // Tokenize by punctuation and whitespace
  const tokens = normalized.split(/[\s,.;:!?+=\-_/\\()\[\]{}|<>*~`'"@#$%^&]+/);

  const allWordLists = [
    ...BENGALI_BADWORDS,
    ...SYLHETI_BADWORDS,
    ...BANGLISH_BADWORDS,
    ...HINDI_URDU_BADWORDS,
    ...ENGLISH_BADWORDS,
    ...ARABIC_BADWORDS,
  ];

  for (const token of tokens) {
    if (!token || token.length < 2) continue;

    // Check if token is in whitelist
    if (SAFE_WHITELIST.has(token)) continue;

    for (const bad of allWordLists) {
      // For short words like 'bal' or 'গুদ', require exact token match
      if (bad.length <= 3) {
        if (token === bad) {
          return { isBad: true, matchedWord: bad };
        }
      } else {
        // For longer words, check exact match or starting with bad stem
        if (token === bad || token.startsWith(bad)) {
          return { isBad: true, matchedWord: bad };
        }
      }
    }
  }

  // 3. Check collapsed spaced words for dangerous words
  for (const bad of allWordLists) {
    if (bad.length >= 4) {
      if (collapsedSpaced.includes(bad)) {
        return { isBad: true, matchedWord: bad };
      }
    }
  }

  return { isBad: false };
}

// -------------------------------------------------------------
// ANTI-LINK DETECTION
// -------------------------------------------------------------
const LINK_REGEX = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|io|me|app|xyz|info|biz|top|bd|co|in|link|site|online|live|tv|cc|ly|to|gg|me|dev)[^\s]*|chat\.whatsapp\.com\/[a-zA-Z0-9]+|t\.me\/[a-zA-Z0-9_]+|wa\.me\/[0-9]+|facebook\.com\/[^\s]+|fb\.watch\/[^\s]+|youtu\.be\/[^\s]+|youtube\.com\/[^\s]+|tiktok\.com\/[^\s]+|instagram\.com\/[^\s]+/i;

export function checkLinkViolation(text: string): { isLink: boolean; matchedLink?: string } {
  if (!text) return { isLink: false };
  const match = text.match(LINK_REGEX);
  if (match) {
    return { isLink: true, matchedLink: match[0] };
  }
  return { isLink: false };
}

// -------------------------------------------------------------
// MESSAGE UNPACKER
// -------------------------------------------------------------
export function extractRealMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  if (!message) return null;
  if (message.ephemeralMessage?.message) return extractRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractRealMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return extractRealMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return extractRealMessage(message.documentWithCaptionMessage.message);
  return message;
}

export function extractMessageText(realMsg: proto.IMessage | null | undefined): string {
  if (!realMsg) return '';
  return (
    realMsg.conversation ||
    realMsg.extendedTextMessage?.text ||
    realMsg.imageMessage?.caption ||
    realMsg.videoMessage?.caption ||
    realMsg.documentMessage?.caption ||
    realMsg.buttonsResponseMessage?.selectedDisplayText ||
    realMsg.templateButtonReplyMessage?.selectedDisplayText ||
    realMsg.listResponseMessage?.title ||
    ''
  );
}

// Check if message is View Once
export function isViewOnceMessage(rawMsg: proto.IWebMessageInfo, realMsg: proto.IMessage | null | undefined): boolean {
  if (rawMsg.message?.viewOnceMessage || rawMsg.message?.viewOnceMessageV2 || rawMsg.message?.viewOnceMessageV2Extension) {
    return true;
  }
  if (realMsg?.imageMessage?.viewOnce || realMsg?.videoMessage?.viewOnce) {
    return true;
  }
  return false;
}

export function normalizeJid(jid: string): string {
  if (!jid) return '';
  const parts = jid.split('@');
  if (parts.length < 2) return jid;
  const user = parts[0].split(':')[0]; // strip device suffix like :12
  const domain = parts[1];
  return `${user}@${domain}`;
}

export async function safeSendMessage(
  sock: WASocket,
  jid: string,
  content: any,
  options?: any
): Promise<boolean> {
  try {
    await sock.sendMessage(jid, content, options);
    return true;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Connection Closed') || msg.includes('Closed') || msg.includes('not connected')) {
      console.warn(`[Baileys Socket Warn] Cannot send message to ${jid} because connection was closed/reconnecting.`);
    } else {
      console.error(`[Baileys Socket Error] Failed to send message to ${jid}:`, msg);
    }
    return false;
  }
}

// -------------------------------------------------------------
// GROUP ADMIN VERIFICATION
// -------------------------------------------------------------
export async function getGroupMeta(sock: WASocket, groupId: string, forceRefresh = false) {
  const cached = groupMetaCache[groupId];
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.fetchedAt < 30000) {
    return cached.meta;
  }
  try {
    const meta = await sock.groupMetadata(groupId);
    groupMetaCache[groupId] = { meta, fetchedAt: now };
    return meta;
  } catch (err: any) {
    console.error(`Failed to fetch metadata for group ${groupId}:`, err.message);
    return cached ? cached.meta : null;
  }
}

export async function checkPermissions(
  sock: WASocket,
  groupId: string,
  senderJid: string,
  forceRefresh = false
): Promise<{ isSenderAdmin: boolean; isBotAdmin: boolean; groupSubject: string }> {
  try {
    const meta = await getGroupMeta(sock, groupId, forceRefresh);
    if (!meta || !meta.participants) {
      return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
    }

    const senderClean = senderJid.split('@')[0].split(':')[0];

    const botId = sock.user?.id || '';
    const botLid = sock.user?.lid || '';

    const botPhoneClean = botId.split('@')[0].split(':')[0];
    const botLidClean = botLid ? botLid.split('@')[0].split(':')[0] : '';

    let isSenderAdmin = false;
    let isBotAdmin = false;

    for (const p of meta.participants) {
      const pClean = p.id.split('@')[0].split(':')[0];
      const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';

      if (
        (pClean === senderClean ||
         p.id === senderJid ||
         normalizeJid(p.id) === normalizeJid(senderJid)) &&
        isAdmin
      ) {
        isSenderAdmin = true;
      }

      if (
        isAdmin &&
        (pClean === botPhoneClean ||
         (botLidClean && pClean === botLidClean) ||
         p.id === botId ||
         p.id === botLid)
      ) {
        isBotAdmin = true;
      }
    }

    console.log(`[Admin Verification] Group: "${meta.subject}" | Bot Phone: ${botPhoneClean} | Bot LID: ${botLidClean} | isBotAdmin: ${isBotAdmin}`);

    return {
      isSenderAdmin,
      isBotAdmin,
      groupSubject: meta.subject || 'WhatsApp Group',
    };
  } catch (err: any) {
    console.error('[checkPermissions error]:', err.message);
    return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
  }
}

// -------------------------------------------------------------
// STICKER SPAM & 10-MINUTE GROUP LOCK SYSTEM
// -------------------------------------------------------------
export function recordStickerAndCheckSpam(groupId: string, senderJid: string): boolean {
  const key = `${groupId}:${senderJid}`;
  const now = Date.now();
  if (!stickerTimestamps[key]) {
    stickerTimestamps[key] = [];
  }

  // Keep timestamps within last 5 seconds (5000ms)
  stickerTimestamps[key] = stickerTimestamps[key].filter((t) => now - t <= 5000);
  stickerTimestamps[key].push(now);

  // If 3 or more stickers in 5 seconds -> Spam!
  return stickerTimestamps[key].length >= 3;
}

// Start group unlock timer monitor
export function startGroupLockMonitor(sockGetter: () => WASocket | null) {
  setInterval(async () => {
    const sock = sockGetter();
    if (!sock || !sock.authState?.creds?.registered) return;

    const now = Date.now();
    for (const [groupId, lock] of Object.entries(db.groupLocks)) {
      if (now >= lock.lockedUntil) {
        try {
          console.log(`Unlocking group ${groupId} after 10-minute spam timeout.`);
          await sock.groupSettingUpdate(groupId, 'not_announcement');
          await sock.sendMessage(groupId, {
            text: '✅ [WAGuard Security]\n১০ মিনিটের লক মেয়াদ শেষ হয়েছে। গ্রুপটি পুনরায় সকল সদস্যের মেসেজ পাঠানোর জন্য উন্মুক্ত করা হলো। সবাইকে নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।',
          });

          addActivityLog({
            groupId,
            groupName: 'Protected Group',
            senderJid: 'SYSTEM',
            senderPhone: 'SYSTEM',
            action: 'unlocked',
            reason: '১০ মিনিটের লক মেয়াদ শেষ হয়েছে। গ্রুপ আনলক করা হয়েছে।',
          });

          delete db.groupLocks[groupId];
          saveDatabase();
        } catch (err: any) {
          console.error(`Failed to unlock group ${groupId}:`, err.message);
          // If permission error or transient, remove lock to avoid endless retry
          delete db.groupLocks[groupId];
          saveDatabase();
        }
      }
    }
  }, 10000); // Check every 10 seconds
}

// -------------------------------------------------------------
// MAIN REAL-TIME MODERATION & AI PROCESSING PIPELINE
// -------------------------------------------------------------
export async function processIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  if (!msg.key || !msg.message) return;

  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') {
    // Ignore WhatsApp status broadcasts
    return;
  }

  // Ignore bot's own messages
  if (msg.key.fromMe) return;

  // Ignore protocol messages, reactions, and poll updates
  if (msg.message.protocolMessage || msg.message.reactionMessage || msg.message.pollUpdateMessage) {
    return;
  }

  const msgId = msg.key.id;
  if (msgId && processedMsgIds.has(msgId)) {
    return; // Already processed
  }
  if (msgId) {
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > 2000) {
      const first = processedMsgIds.values().next().value;
      if (first) processedMsgIds.delete(first);
    }
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const isPrivate = remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid');

  if (!isGroup && !isPrivate) {
    return;
  }

  // Update total messages checked
  db.stats.messagesChecked++;
  saveDatabase();

  const settings = getSettings();
  const realMsg = extractRealMessage(msg.message);
  if (!realMsg) return;
  const messageText = extractMessageText(realMsg);

  // -------------------------------------------------------------
  // 1. INDIVIDUAL PRIVATE INBOX CHAT SYSTEM (1-ON-1 WHATSAPP)
  // -------------------------------------------------------------
  if (isPrivate) {
    if (!settings.mayaAiEnabled || !settings.mayaPrivateReply) {
      return;
    }

    if (!messageText || messageText.trim().length === 0) {
      return; // Skip media without captions in private chats
    }

    const senderJid = remoteJid;
    const cleanPhone = senderJid.split('@')[0].split(':')[0];
    const userName = msg.pushName || 'Friend';
    // Strictly isolate private conversation history per user
    const memoryKey = `private:${normalizeJid(senderJid)}`;

    console.log(`[Maya AI Private Inbox] Incoming message from @${cleanPhone} (${userName}): "${messageText}"`);

    try {
      const aiResult = await getMayaResponse(
        messageText,
        cleanPhone,
        userName,
        'Private Chat',
        memoryKey,
        {
          romantic: settings.mayaRomantic,
          funny: settings.mayaFunny,
          language: settings.mayaLanguage,
          memoryLimit: settings.mayaMemoryLimit,
          aiProvider: settings.aiProvider,
          geminiModel: settings.geminiModel,
          geminiApiKey: settings.geminiApiKey,
          groqApiKey: settings.groqApiKey,
          openrouterApiKey: settings.openrouterApiKey,
          isPrivate: true,
        }
      );

      if (aiResult.reply) {
        const sent = await safeSendMessage(
          sock,
          remoteJid,
          { text: aiResult.reply },
          { quoted: msg as any }
        );

        if (sent) {
          addActivityLog({
            groupId: 'private',
            groupName: `Private (${userName})`,
            senderJid: remoteJid,
            senderPhone: cleanPhone,
            action: 'replied',
            reason: `Private Chat Reply [${aiResult.provider.toUpperCase()}]`,
            details: aiResult.reply.slice(0, 60),
          });

          console.log(
            `[Maya AI Private Inbox SUCCESS] Replied to @${cleanPhone} via ${aiResult.provider} (${aiResult.latencyMs}ms)`
          );
        }
      }
    } catch (err: any) {
      console.error(`[Maya AI Private Inbox ERROR]:`, err.message);
    }
    return;
  }

  // -------------------------------------------------------------
  // 2. GROUP MODERATION & AUTO-REPLY SYSTEM
  // -------------------------------------------------------------
  const senderJid = msg.key.participant || msg.participant || '';
  if (!senderJid) return;

  const cleanPhone = senderJid.split('@')[0].split(':')[0];

  // 1. Verify Admin Permissions
  const { isSenderAdmin, isBotAdmin, groupSubject } = await checkPermissions(sock, remoteJid, senderJid);

  // -------------------------------------------------------------
  // FEATURE 0: ACTIVE INDIVIDUAL RESTRICTION (MESSAGE INTERCEPTION & AUTO-DELETE)
  // -------------------------------------------------------------
  if (settings.individualMuteEnabled) {
    const restrictionCheck = isUserRestricted(remoteJid, senderJid);
    if (restrictionCheck.restricted) {
      // Group Admins are never restricted if Admin Shield is active
      if (settings.adminShield && isSenderAdmin) {
        console.log(`[Individual Mute] @${cleanPhone} is an Admin with Admin Shield active. Lifting restriction.`);
        unrestrictUser(remoteJid, senderJid);
      } else {
        const remainingSec = Math.round(restrictionCheck.remainingMs / 1000);
        console.log(`[Individual Mute ACTIVE] Intercepted message from restricted user @${cleanPhone} in "${groupSubject}". Auto-deleting message (${remainingSec}s remaining)...`);

        try {
          await sock.sendMessage(remoteJid, { delete: msg.key });
          db.stats.deletedMessages++;
          db.stats.restrictedMessagesBlocked = (db.stats.restrictedMessagesBlocked || 0) + 1;
          saveDatabase();
        } catch (delErr: any) {
          console.error('[Individual Mute] Failed to delete message from restricted user:', delErr.message);
        }

        // Halts all processing! Message deleted instantly, other members chat freely.
        return;
      }
    }
  }

  const isSticker = Boolean(realMsg.stickerMessage);
  const isGif = Boolean(realMsg.videoMessage?.gifPlayback || realMsg.imageMessage?.mimetype === 'image/gif' || realMsg.videoMessage?.mimetype === 'image/gif');
  const isVideo = Boolean(realMsg.videoMessage) && !isGif;
  const isImage = Boolean(realMsg.imageMessage) && !isGif;
  const isViewOnce = isViewOnceMessage(msg, realMsg);

  // -------------------------------------------------------------
  // FEATURE 3: INDIVIDUAL STICKER SPAM DETECTION & 10-MINUTE RESTRICTION
  // (Note: Never locks the group! Intercepts and auto-deletes the restricted member's messages)
  // -------------------------------------------------------------
  if (settings.individualMuteEnabled && isSticker) {
    const isProtected = settings.adminShield && isSenderAdmin;
    if (!isProtected) {
      const timeWindow = settings.individualMuteTimeWindow || 5;
      const limit = settings.individualMuteStickerLimit || 3;
      const durationMin = settings.individualMuteDurationMinutes || 10;

      const isSpam = recordStickerAndCheckIndividualSpam(remoteJid, senderJid, timeWindow, limit);
      if (isSpam) {
        console.log(`[Individual Mute Triggered] Sticker spam detected: @${cleanPhone} sent ${limit}+ stickers in ${timeWindow}s in ${groupSubject}`);

        // 1. Delete the spam sticker immediately
        try {
          await sock.sendMessage(remoteJid, { delete: msg.key });
          db.stats.deletedMessages++;
        } catch (delErr: any) {
          console.error('[Individual Mute] Failed to delete spam sticker:', delErr.message);
        }

        // 2. Individual Restrict the user for durationMin (DO NOT LOCK THE GROUP)
        restrictUser(
          remoteJid,
          groupSubject,
          senderJid,
          cleanPhone,
          durationMin,
          `${timeWindow} সেকেন্ডে ${limit}+ স্টিকার পাঠানো`
        );

        // 3. Send the exact required notification to the group
        await safeSendMessage(sock, remoteJid, {
          text: `⚠️ STICKER SPAM DETECTED!\nএকজন সদস্য অতিরিক্ত স্টিকার পাঠানোর কারণে ${durationMin} মিনিটের জন্য Restrict করা হয়েছে।`,
          mentions: [senderJid],
        });

        return; // Finished handling spam sticker
      }
    }
  } else if (!settings.individualMuteEnabled && settings.antiStickerSpam && isSticker) {
    // Legacy fallback: only if Individual Mute is turned off but whole-group lock is desired
    const isSpam = recordStickerAndCheckSpam(remoteJid, senderJid);
    if (isSpam) {
      console.log(`[Legacy Group Lock Anti-Sticker Spam] Detected 3+ stickers in 5s by @${cleanPhone} in ${groupSubject}`);

      try {
        await sock.sendMessage(remoteJid, { delete: msg.key });
        db.stats.deletedMessages++;
      } catch (err: any) {
        console.error('Failed to delete spam sticker:', err.message);
      }

      const lockDurationMs = 10 * 60 * 1000;
      const lockedUntil = Date.now() + lockDurationMs;

      if (isBotAdmin) {
        try {
          await sock.groupSettingUpdate(remoteJid, 'announcement');
          db.groupLocks[remoteJid] = {
            groupId: remoteJid,
            lockedUntil,
            originalSetting: 'not_announcement',
            reason: `Sticker spam by @${cleanPhone}`,
          };
          db.stats.groupLocksTriggered++;
          saveDatabase();

          await sock.sendMessage(remoteJid, {
            text: `⚠️ [WAGuard Anti-Sticker Spam Alert]\n🚫 সদস্য @${cleanPhone} কর্তৃক অতিরিক্ত স্টিকার স্প্যাম শনাক্ত হয়েছে!\n🔒 গ্রুপটিকে ১০ মিনিটের জন্য Announcement Mode-এ লক করা হলো।`,
            mentions: [senderJid],
          });
        } catch (err: any) {}
      }
      return;
    }
  }

  // -------------------------------------------------------------
  // RULE EVALUATION ENGINE (Fast Local Moderation)
  // -------------------------------------------------------------
  let violationType: string | null = null;
  let violationDetails = '';

  // Feature 1: Admin Security Shield (Admins are never penalized)
  const isProtectedAdmin = settings.adminShield && isSenderAdmin;

  if (!isProtectedAdmin) {
    // Feature 2: ANTI-STICKER
    if (settings.antiSticker && isSticker) {
      violationType = 'Anti-Sticker';
      violationDetails = 'স্টিকার পাঠানো নিষিদ্ধ';
    }
    // Feature 4: ANTI-GIF
    else if (settings.antiGif && isGif) {
      violationType = 'Anti-GIF';
      violationDetails = 'GIF এবং এনিমেটেড ভিডিও পাঠানো নিষিদ্ধ';
    }
    // Feature 5: ANTI-VIDEO
    else if (settings.antiVideo && isVideo) {
      violationType = 'Anti-Video';
      violationDetails = 'ভিডিও পাঠানো নিষিদ্ধ';
    }
    // Feature 6: ANTI-IMAGE
    else if (settings.antiImage && isImage) {
      violationType = 'Anti-Image';
      violationDetails = 'ছবি বা ফটো পাঠানো নিষিদ্ধ';
    }
    // Feature 7: ANTI-VIEW ONCE
    else if (settings.antiViewOnce && isViewOnce) {
      violationType = 'Anti-View Once';
      violationDetails = 'View Once মিডিয়া পাঠানো নিষিদ্ধ';
    }
    // Feature 9: ANTI-LINK
    else if (settings.antiLink && messageText) {
      const linkCheck = checkLinkViolation(messageText);
      if (linkCheck.isLink) {
        violationType = 'Anti-Link';
        violationDetails = `লিংক পাঠানো নিষিদ্ধ (${linkCheck.matchedLink})`;
      }
    }
    // Feature 8: ADVANCED MULTILINGUAL ANTI-BADWORD
    if (!violationType && settings.antiBadword && messageText) {
      const badwordCheck = checkBadwordViolation(messageText, settings.customBadwords);
      if (badwordCheck.isBad) {
        violationType = 'Anti-Badword';
        violationDetails = `অপমানজনক বা গালি শব্দ শনাক্ত হয়েছে (${badwordCheck.matchedWord})`;
      }
    }
  }

  // -------------------------------------------------------------
  // VIOLATION ENFORCEMENT (Delete -> Warning -> Auto Kick on 3rd)
  // -------------------------------------------------------------
  if (violationType) {
    console.log(`[Moderation Triggered] ${violationType} in ${groupSubject} by @${cleanPhone}`);

    // Step 1: Real Message Delete Operation
    let deleteSuccessful = false;
    try {
      await sock.sendMessage(remoteJid, { delete: msg.key });
      deleteSuccessful = true;
      db.stats.deletedMessages++;
    } catch (err: any) {
      console.error('Failed to delete violating message:', err.message);
    }

    // Step 2: Warning Counter per Member per Group
    const warningKey = `${remoteJid}:${senderJid}`;
    if (!db.warnings[warningKey]) {
      db.warnings[warningKey] = {
        count: 0,
        lastViolation: Date.now(),
        violations: [],
      };
    }

    db.warnings[warningKey].count++;
    db.warnings[warningKey].lastViolation = Date.now();
    db.warnings[warningKey].violations.push({
      timestamp: Date.now(),
      reason: violationDetails,
    });
    db.stats.warningsGiven++;
    saveDatabase();

    const warningCount = db.warnings[warningKey].count;

    // Feature 10: THREE WARNING AUTO KICK
    if (warningCount === 1) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${violationDetails}!\nআপনার মেসেজটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
        mentions: [senderJid],
      });

      addActivityLog({
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid,
        senderPhone: cleanPhone,
        action: 'warned',
        reason: `${violationType} (১ম সতর্কতা)`,
        details: violationDetails,
        warningCount: 1,
      });
    } else if (warningCount === 2) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${violationDetails})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
        mentions: [senderJid],
      });

      addActivityLog({
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid,
        senderPhone: cleanPhone,
        action: 'warned',
        reason: `${violationType} (২য় সতর্কতা)`,
        details: violationDetails,
        warningCount: 2,
      });
    } else if (warningCount >= 3) {
      // 3rd Warning -> Final Warning & Auto Kick Execution
      if (settings.autoKick3Warnings) {
        // Force fresh metadata check from WhatsApp server to ensure admin status is up-to-date
        const freshPerms = await checkPermissions(sock, remoteJid, senderJid, true);
        
        // Under NO circumstances should any Group Admin ever be kicked by WAGuard
        if (freshPerms.isSenderAdmin) {
          console.warn(`[Kick Blocked] Target user @${cleanPhone} is a Group Admin in ${groupSubject}. Group Admins cannot be kicked.`);
          await safeSendMessage(sock, remoteJid, {
            text: `🛡️ [অ্যাডমিন সুরক্ষা Notice]\nসদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন। তবে তিনি একজন গ্রুপ অ্যাডমিন (Group Admin) হওয়ায় তাকে কিক (Kick) করা সম্ভব নয়।`,
            mentions: [senderJid],
          });
          return;
        }

        const canKick = freshPerms.isBotAdmin;

        if (canKick) {
          try {
            // Normalize target JID (strips device suffix like :12)
            const targetJid = normalizeJid(senderJid);

            await sock.sendMessage(remoteJid, {
              text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ (Kick) করা হচ্ছে!`,
              mentions: [senderJid],
            });

            console.log(`[Baileys Kick Action] Executing groupParticipantsUpdate for target ${targetJid} in group ${remoteJid}...`);
            const kickResult = await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
            console.log(`[Baileys Kick Action SUCCESS] Result for @${cleanPhone}:`, kickResult);

            db.stats.kickedMembers++;
            delete db.warnings[warningKey];
            saveDatabase();

            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid: targetJid,
              senderPhone: cleanPhone,
              action: 'kicked',
              reason: `৩ বার সতর্কতা অতিক্রান্ত (${violationType})`,
              details: 'সদস্যকে গ্রুপ থেকে সফলভাবে রিমুভ করা হয়েছে।',
              warningCount: 3,
            });
          } catch (kickErr: any) {
            console.error('[Baileys Kick Action FAILED]:', kickErr);
            const errCode = kickErr?.output?.statusCode || kickErr?.code || 'ERROR';
            const errMsg = kickErr?.message || String(kickErr);

            await sock.sendMessage(remoteJid, {
              text: `⚠️ [কিক ত্রুটি - Code: ${errCode}]\nসদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন, কিন্তু কিক করার সময় ত্রুটি দেখা দিয়েছে: ${errMsg}`,
              mentions: [senderJid],
            });

            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'error',
              reason: `Kick Failed (${errCode}): ${errMsg}`,
              warningCount: 3,
            });
          }
        } else {
          // Bot is genuinely NOT admin in group metadata
          console.warn(`[Kick Cancelled] Bot is NOT listed as admin in fresh groupMetadata for ${groupSubject} (${remoteJid}). Bot ID: ${sock.user?.id}, LID: ${sock.user?.lid}`);

          await sock.sendMessage(remoteJid, {
            text: `⚠️ [সতর্কবার্তা ৩/৩ - অ্যাডমিন আবশ্যক]\nসদস্য @${cleanPhone} ৩টি নিয়ম লঙ্ঘন করেছেন! কিন্তু WAGuard বট এই গ্রুপের অ্যাডমিন না হওয়ায় সদস্যকে বাস্তবে কিক করা সম্ভব হয়নি। দয়া করে গ্রুপ অ্যাডমিন বটকে অ্যাডমিন পারমিশন দিন।`,
            mentions: [senderJid],
          });

          addActivityLog({
            groupId: remoteJid,
            groupName: groupSubject,
            senderJid,
            senderPhone: cleanPhone,
            action: 'error',
            reason: 'Bot is not admin in fresh group metadata.',
            warningCount: 3,
          });
        }
      } else {
        await sock.sendMessage(remoteJid, {
          text: `🚨 [সতর্কবার্তা ৩/৩]\nসদস্য @${cleanPhone}, আপনি ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})। দয়া করে গ্রুপের নিয়ম মেনে চলুন।`,
          mentions: [senderJid],
        });
      }
    }

    return; // Message handled and penalized
  }

  // -------------------------------------------------------------
  // MAYA AI PERSONALITY & GROUP AUTO-REPLY ENGINE
  // -------------------------------------------------------------
  if (settings.botReply && settings.mayaAiEnabled && settings.mayaGroupReply && messageText) {
    const lower = messageText.toLowerCase();
    const botJid = sock.user?.id || '';
    const botLid = sock.user?.lid || '';
    const cleanBot = botJid.split('@')[0].split(':')[0];
    const cleanBotLid = botLid ? botLid.split('@')[0].split(':')[0] : '';

    const contextInfo = (realMsg as any)?.extendedTextMessage?.contextInfo ||
                        (realMsg as any)?.imageMessage?.contextInfo ||
                        (realMsg as any)?.videoMessage?.contextInfo;

    // Check if the user is quoting Maya's previous message
    const quotedParticipant = contextInfo?.participant || '';
    const isQuotingBot = quotedParticipant ? (
      quotedParticipant.includes(cleanBot) ||
      (cleanBotLid && quotedParticipant.includes(cleanBotLid)) ||
      quotedParticipant === botJid ||
      quotedParticipant === botLid
    ) : false;

    // Direct mention or name calling ("Maya", "মায়া", "এই মায়া", etc.)
    const isDirectMention =
      contextInfo?.mentionedJid?.includes(botJid) ||
      (botLid && contextInfo?.mentionedJid?.includes(botLid)) ||
      lower.includes('@' + cleanBot) ||
      lower.includes('maya') ||
      lower.includes('মায়া') ||
      lower.includes('মায়া') ||
      lower.includes('waguard') ||
      isQuotingBot;

    const isDirectCall = 
      lower.includes('এই মায়া') ||
      lower.includes('এই মায়া') ||
      lower.includes('মায়া শুনছো') ||
      lower.includes('মায়া কোথায়') ||
      lower.includes('মায়া কেমন আছো') ||
      lower.includes('মায়ান') || 
      lower.includes('মায়ান') || 
      lower.includes('বট') || 
      lower.includes('bot');

    const shouldAttemptReply = 
      isDirectMention || 
      isDirectCall || 
      isQuotingBot || 
      (settings.mayaAutoParticipate && Math.random() * 100 < settings.mayaReplyFrequency) ||
      (settings.botReply && Math.random() * 100 <= (settings.mayaReplyFrequency || 50));

    if (shouldAttemptReply) {
      const now = Date.now();
      const lastReply = lastAiReplyTime[remoteJid] || 0;
      const cooldownMs = settings.mayaReplyCooldown * 1000;

      // Mentions, direct calls, and quoted messages ALWAYS bypass cooldown for fluid conversation
      if (!isDirectMention && !isDirectCall && !isQuotingBot && now - lastReply < cooldownMs) {
        return; // Still in cooldown for unprompted background chat participation
      }

      console.log(`[Maya AI Response Engine] Processing for ${groupSubject} (Direct/Quoting: ${isDirectMention || isDirectCall || isQuotingBot})`);
      
      try {
        const userName = msg.pushName || 'User';
        const memoryKey = `group:${remoteJid}`;
        
        const aiResult = await getMayaResponse(
          messageText,
          cleanPhone,
          userName,
          groupSubject,
          memoryKey,
          {
            romantic: settings.mayaRomantic,
            funny: settings.mayaFunny,
            language: settings.mayaLanguage,
            memoryLimit: settings.mayaMemoryLimit,
            aiProvider: settings.aiProvider,
            geminiModel: settings.geminiModel,
            geminiApiKey: settings.geminiApiKey,
            groqApiKey: settings.groqApiKey,
            openrouterApiKey: settings.openrouterApiKey,
            isPrivate: false,
          }
        );

        if (aiResult.reply) {
          lastAiReplyTime[remoteJid] = now;

          const sent = await safeSendMessage(
            sock,
            remoteJid,
            {
              text: aiResult.reply,
              mentions: [senderJid],
            },
            { quoted: msg as any }
          );

          if (sent) {
            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'replied',
              reason: isDirectMention || isDirectCall || isQuotingBot
                ? `Group AI Direct [${aiResult.provider.toUpperCase()}]`
                : `Group AI Chat [${aiResult.provider.toUpperCase()}]`,
              details: aiResult.reply.slice(0, 60),
            });

            console.log(`[Maya AI Group SUCCESS] Replied in ${groupSubject} via ${aiResult.provider} in ${aiResult.latencyMs}ms`);
          }
        }
      } catch (err: any) {
        console.error('Failed to get Maya AI response in group:', err.message);
      }
    }
  }
}
