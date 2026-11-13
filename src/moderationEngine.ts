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
  // AI Moderation & Silent Mode
  aiBadwordDetection: boolean;
  silentModeration: boolean;
  mayaReplyMode: 'group' | 'inbox' | 'off';
  // AI Provider Management
  aiKeys: AiKey[];
  aiAutoRotate: boolean;
  aiProviderPriority: ('gemini' | 'groq' | 'openrouter')[];
}

export interface AiKey {
  id: string;
  key: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  label: string;
  status: 'active' | 'exhausted' | 'invalid' | 'cooldown';
  cooldownUntil: number;
  lastUsed: number;
  totalRequests: number;
  failureCount: number;
  lastError?: string;
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
  aiBadwordDetection: false,
  silentModeration: false,
  mayaReplyMode: 'group',
  aiKeys: [],
  aiAutoRotate: true,
  aiProviderPriority: ['gemini', 'groq', 'openrouter'],
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

const unmaskedKeyVault = new Map<string, string>();

export function registerUnmaskedKey(id: string, keyString?: string) {
  if (id && keyString && !isMaskedKeyString(keyString)) {
    unmaskedKeyVault.set(id, keyString.trim());
  }
}

export function getUnmaskedKey(id: string, fallbackKey?: string): string {
  if (fallbackKey && !isMaskedKeyString(fallbackKey)) {
    registerUnmaskedKey(id, fallbackKey);
    return fallbackKey.trim();
  }
  return unmaskedKeyVault.get(id) || (fallbackKey && !isMaskedKeyString(fallbackKey) ? fallbackKey.trim() : fallbackKey || '');
}

export function getSettings(): ModerationSettings {
  return JSON.parse(JSON.stringify(db.settings));
}

const isMaskedKeyString = (str?: string): boolean => {
  if (!str) return false;
  return str.includes('...') || str.includes('****');
};

export function updateSettings(newSettings: Partial<ModerationSettings>): ModerationSettings {
  const patch = { ...newSettings };

  // 1. Prevent masked strings from overwriting real plaintext keys in single card settings
  if (isMaskedKeyString(patch.geminiApiKey)) {
    patch.geminiApiKey = db.settings.geminiApiKey;
  } else if (patch.geminiApiKey && patch.geminiApiKey.trim()) {
    patch.geminiApiKey = patch.geminiApiKey.trim();
  }

  if (isMaskedKeyString(patch.groqApiKey)) {
    patch.groqApiKey = db.settings.groqApiKey;
  } else if (patch.groqApiKey && patch.groqApiKey.trim()) {
    patch.groqApiKey = patch.groqApiKey.trim();
  }

  if (isMaskedKeyString(patch.openrouterApiKey)) {
    patch.openrouterApiKey = db.settings.openrouterApiKey;
  } else if (patch.openrouterApiKey && patch.openrouterApiKey.trim()) {
    patch.openrouterApiKey = patch.openrouterApiKey.trim();
  }

  // 2. Safely process aiKeys pool without wiping existing keys
  let currentKeys = [...(db.settings.aiKeys || [])];

  if (patch.aiKeys && Array.isArray(patch.aiKeys)) {
    const existingMap = new Map(currentKeys.map(k => [k.id, getUnmaskedKey(k.id, k.key)]));
    currentKeys = patch.aiKeys.map(k => {
      const realKey = !isMaskedKeyString(k.key) ? k.key.trim() : (existingMap.get(k.id) || getUnmaskedKey(k.id, k.key));
      if (realKey && !isMaskedKeyString(realKey)) {
        registerUnmaskedKey(k.id, realKey);
      }
      return { ...k, key: realKey };
    });
  }

  // 3. If a NEW unmasked key is provided in single card inputs, append it to pool WITHOUT replacing existing keys
  if (newSettings.geminiApiKey && !isMaskedKeyString(newSettings.geminiApiKey)) {
    const cleanKey = newSettings.geminiApiKey.trim();
    if (cleanKey && !currentKeys.some(k => k.key === cleanKey)) {
      currentKeys.push({
        id: 'key_gemini_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        key: cleanKey,
        provider: 'gemini',
        label: 'Gemini Card Key',
        status: 'active',
        cooldownUntil: 0,
        lastUsed: 0,
        totalRequests: 0,
        failureCount: 0
      });
    }
  }

  if (newSettings.groqApiKey && !isMaskedKeyString(newSettings.groqApiKey)) {
    const cleanKey = newSettings.groqApiKey.trim();
    if (cleanKey && !currentKeys.some(k => k.key === cleanKey)) {
      currentKeys.push({
        id: 'key_groq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        key: cleanKey,
        provider: 'groq',
        label: 'Groq Card Key',
        status: 'active',
        cooldownUntil: 0,
        lastUsed: 0,
        totalRequests: 0,
        failureCount: 0
      });
    }
  }

  if (newSettings.openrouterApiKey && !isMaskedKeyString(newSettings.openrouterApiKey)) {
    const cleanKey = newSettings.openrouterApiKey.trim();
    if (cleanKey && !currentKeys.some(k => k.key === cleanKey)) {
      currentKeys.push({
        id: 'key_openrouter_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        key: cleanKey,
        provider: 'openrouter',
        label: 'OpenRouter Card Key',
        status: 'active',
        cooldownUntil: 0,
        lastUsed: 0,
        totalRequests: 0,
        failureCount: 0
      });
    }
  }

  patch.aiKeys = currentKeys;

  // Register all active keys into vault
  for (const k of currentKeys) {
    if (k.id && k.key && !isMaskedKeyString(k.key)) {
      registerUnmaskedKey(k.id, k.key);
    }
  }

  db.settings = { ...db.settings, ...patch };
  saveDatabase();
  return JSON.parse(JSON.stringify(db.settings));
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
let globalSocketGetter: (() => WASocket | null) | null = null;

export function setSocketGetter(getter: () => WASocket | null) {
  globalSocketGetter = getter;
}

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

    if (globalSocketGetter) {
      const sock = globalSocketGetter();
      if (sock && sock.authState?.creds?.registered) {
        safeSendMessage(sock, groupId, {
          text: `✅ WAGuard Security Update\n\n@${restriction.senderPhone}-এর ১০ মিনিটের Temporary Restriction শেষ হয়েছে। তিনি এখন আবার স্বাভাবিকভাবে গ্রুপে মেসেজ করতে পারবেন।`,
          mentions: [restriction.senderJid],
        }).catch(() => {});
      }
    }

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

    if (globalSocketGetter) {
      const sock = globalSocketGetter();
      if (sock && sock.authState?.creds?.registered) {
        safeSendMessage(sock, groupId, {
          text: `✅ WAGuard Security Update\n\n@${restriction.senderPhone}-এর ১০ মিনিটের Temporary Restriction শেষ হয়েছে। তিনি এখন আবার স্বাভাবিকভাবে গ্রুপে মেসেজ করতে পারবেন।`,
          mentions: [restriction.senderJid],
        }).catch(() => {});
      }
    }

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
      if (globalSocketGetter) {
        const sock = globalSocketGetter();
        if (sock && sock.authState?.creds?.registered) {
          safeSendMessage(sock, user.groupId, {
            text: `✅ WAGuard Security Update\n\n@${user.senderPhone}-এর ১০ মিনিটের Temporary Restriction শেষ হয়েছে। তিনি এখন আবার স্বাভাবিকভাবে গ্রুপে মেসেজ করতে পারবেন।`,
            mentions: [user.senderJid],
          }).catch(() => {});
        }
      }
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
  limit: number = 5
): boolean {
  const cleanSender = normalizeJid(senderJid);
  const key = `${groupId}:${cleanSender}`;
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
export function startRestrictedUsersMonitor(sockGetter?: () => WASocket | null) {
  if (sockGetter) {
    globalSocketGetter = sockGetter;
  }

  setInterval(async () => {
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

        const activeGetter = sockGetter || globalSocketGetter;
        if (activeGetter) {
          const sock = activeGetter();
          if (sock && sock.authState?.creds?.registered) {
            try {
              await safeSendMessage(sock, user.groupId, {
                text: `✅ WAGuard Security Update\n\n@${user.senderPhone}-এর ১০ মিনিটের Temporary Restriction শেষ হয়েছে। তিনি এখন আবার স্বাভাবিকভাবে গ্রুপে মেসেজ করতে পারবেন।`,
                mentions: [user.senderJid],
              });
            } catch (e) {}
          }
        }
      }
    }

    if (changed) {
      saveDatabase();
    }
  }, 5000);
}

// -------------------------------------------------------------
// MULTILINGUAL ANTI-BADWORD MATCHING ENGINE
// -------------------------------------------------------------

// Comprehensive dictionary covering Bangla, Sylheti, Banglish, Hindi/Urdu, English, Arabic
const BENGALI_BADWORDS = [
  'খানকি', 'খানকির', 'মাগি', 'মাগির', 'বেশ্যা', 'বেশ্যার', 'রান্ডি', 'রান্ডির',
  'চুদা', 'চুদানি', 'চুদানির', 'চুদ', 'চোদা', 'চোদানি', 'চোদানির', 'মাদারচোদ',
  'মাদারচুদা', 'বাইনচোদ', 'বাইনচুদা', 'ভোনচোদ', 'কুত্তা', 'কুত্তার', 'কুত্তির',
  'শুয়োর', 'শুয়োরের', 'হারামি', 'হারামজাদা', 'হারামখোর', 'ভোদা', 'ভোদাই',
  'ধোন', 'লুচ্চা', 'লুচ্চামি', 'গুয়া', 'গুয়ার', 'গুদে', 'গুদ', 'বাল', 'সালা', 'শালা'
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
  'dhon', 'guya', 'gud', 'bal', 'chutia', 'chutiya', 'chod', 'sala', 'shala'
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

// Safe words that contain small substrings like 'bal' or 'balti' or 'সালা' and must NEVER be flagged
const SAFE_WHITELIST = new Set([
  'আসসালামুয়ালাইকুম', 'আসসালামু', 'সালাম', 'ওয়ালাইকুম', 'সালামুয়ালাইকুম', 'সালামু আলাইকুম', 'আসসালামু আলাইকুম',
  'ওয়ালাইকুম', 'ওয়ালাইকুম আসসালাম', 'ওয়ালাইকুমুস সালাম', 'সালাত', 'সালাতুল', 'সালাউদ্দিন', 'সালাহউদ্দিন', 'সালাহ',
  'সবাই', 'কেমন', 'আছেন', 'আছো', 'ভালো', 'ধন্যবাদ', 'স্বাগতম', 'আলহামদুলিল্লাহ', 'ইনশাআল্লাহ', 'মাশাআল্লাহ', 'সুবহানাল্লাহ', 'জাজাকাল্লাহ',
  'আল্লাহ', 'খোদা', 'নমস্কার', 'আদাব', 'শুভ', 'সকাল', 'সন্ধ্যা', 'রাত্রি', 'রাত', 'মাগফিরাত',
  // Common Conversational Bengali Words & Phrasal Verbs (Must NEVER be flagged as badword)
  'মাইর', 'মাইর খাবে', 'মাইর খাইবা', 'মারামারি', 'মার', 'মারা', 'মারবে', 'খাবে', 'খাবো', 'খাবি', 'খাওয়া', 'খাব',
  'পড়বে', 'পড়বে না', 'যাবে', 'আসবে', 'করবে', 'হবে', 'থাকবে', 'দেবে', 'দিবে', 'বলবে', 'শুনবে', 'চলবে', 'ভাববে', 'জানবে', 'বুঝবে', 'পাবে',
  'ভুল', 'ভুল করে', 'ভুল হলে', 'ভুলবশত', 'ক্ষমা', 'দয়া', 'কথা', 'কাজ', 'পড়া', 'লেখা', 'দেখা', 'খেলবে',
  'বালতি', 'বালিশ', 'বালক', 'বালিকা', 'বাল্য', 'বাল্যকাল', 'বালু', 'বাঙালি',
  'বাঙালী', 'ইকবাল', 'আবুল', 'সবল', 'দূর্বল', 'দুর্বল', 'বল', 'বলা', 'বলে',
  'বলুন', 'বলবেন', 'বলো', 'চাল', 'ডাল', 'পাল', 'কাল', 'মালয়েশিয়া', 'মাল্টা', 'মালামাল', 'মালপত্র',
  'ভাই', 'আপু', 'বন্ধু', 'আপুরা', 'ভাইয়া', 'ভাইরা', 'আপুনি', 'ভাল',
  'ball', 'balance', 'global', 'balcony', 'bald', 'iqbal', 'verbal', 'tribal',
  'herbal', 'football', 'basketball', 'baseball', 'shobhal', 'salam', 'assalamu', 'alaikum', 'walikum'
]);

// Check if a token belongs to Islamic greetings or respectful words
export function isSafeWordOrGreeting(token: string): boolean {
  if (!token) return false;
  const t = token.trim().toLowerCase();

  // Islamic Greetings & Sacred Terms
  if (
    t.startsWith('সালাম') ||
    t.startsWith('আসসালাম') ||
    t.startsWith('ওয়ালাইকুম') ||
    t.startsWith('ওয়ালাইকুম') ||
    t.startsWith('সালাত') ||
    t.startsWith('সালাউদ্দিন') ||
    t.startsWith('সালাহ') ||
    t.startsWith('আলহামদু') ||
    t.startsWith('সুবহান') ||
    t.startsWith('মাশা') ||
    t.startsWith('ইনশা') ||
    t.startsWith('জাজাক') ||
    t.startsWith('আল্লাহ') ||
    t.startsWith('নমস্কার') ||
    t.startsWith('আদাব') ||
    t.startsWith('মাগফিরাত')
  ) {
    return true;
  }

  // Safe conversational Bengali tokens
  if (
    t === 'মাইর' ||
    t === 'খাবে' ||
    t === 'মারবে' ||
    t === 'ভুল' ||
    t === 'মারামারি' ||
    t === 'কথা' ||
    t === 'কাজ'
  ) {
    return true;
  }

  // Banglish greetings
  if (
    t.startsWith('salam') ||
    t.startsWith('assalam') ||
    t.startsWith('alaikum') ||
    t.startsWith('walikum') ||
    t.startsWith('nomoshkar') ||
    t.startsWith('adab')
  ) {
    return true;
  }

  return SAFE_WHITELIST.has(t);
}

// Regex to check if the message is a greeting (Salam, How are you, etc.)
export function isRespectfulSalamOrGreeting(text: string): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  // Expanded regex to cover almost all common variations of Salam and greetings
  const salamRegex = /(?:^|\s)(?:আস+া?লামু|সালাম|ওয়ালাইকুম|ওয়ালাইকুম|নমস্কার|আদাব|আলহামদুলিল্লাহ|ইনশাআল্লাহ|মাশাআল্লাহ|সুবহানাল্লাহ|salam|assalamu|alaikum|walikum|slaam|nomoshkar|adab|কেমন আছেন|কেমন আছো|সবাই কেমন|সবাই কেমন আছেন|শুভ সকাল|শুভ রাত্রি|hello|hi|hey)(?:$|\s|[!?.,])/iu;
  return salamRegex.test(clean);
}

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

// Fast badword match with strict token-boundary enforcement and greeting immunity
export function checkBadwordViolation(text: string, customList: string[] = []): { isBad: boolean; matchedWord?: string } {
  if (!text || text.trim().length === 0) return { isBad: false };

  // 0. QUICK PRE-CHECK: If it's a clear greeting, skip all badword checks
  if (isRespectfulSalamOrGreeting(text)) return { isBad: false };

  const normalized = normalizeText(text);

  // Tokenize by punctuation and whitespace
  const tokens = normalized.split(/[\s,.;:!?+=\-_/\\()\[\]{}|<>*~`'"@#$%^&]+/);

  // 1. Check custom badwords from dashboard
  for (const custom of customList) {
    const trimmed = custom.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) continue;

    // Never treat whitelisted safe words or greetings as badwords
    if (isSafeWordOrGreeting(trimmed)) continue;

    // For multi-word custom phrases
    if (trimmed.includes(' ')) {
      if (normalized.includes(trimmed)) return { isBad: true, matchedWord: trimmed };
      continue;
    }

    // Single-word custom badwords: require exact token match or stem match if >= 6 chars
    for (const token of tokens) {
      if (!token || isSafeWordOrGreeting(token)) continue;

      if (token === trimmed) {
        return { isBad: true, matchedWord: trimmed };
      }
      if (trimmed.length >= 6 && token.startsWith(trimmed) && !SAFE_WHITELIST.has(token)) {
        return { isBad: true, matchedWord: trimmed };
      }
    }
  }

  // 2. Built-in dictionaries check
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
    if (isSafeWordOrGreeting(token)) continue;

    for (const bad of allWordLists) {
      if (token === bad) {
        return { isBad: true, matchedWord: bad };
      }
      // Only stem-match for long explicit slurs (>= 6 chars) if token is not whitelisted
      if (bad.length >= 6 && token.startsWith(bad) && !SAFE_WHITELIST.has(token)) {
        return { isBad: true, matchedWord: bad };
      }
    }
  }

  // 3. Spaced-out word detection (e.g. "ম া দ া র চ ো দ")
  const collapsedSpaced = normalized.replace(/\s+/g, '');
  const DANGEROUS_COLLAPSED_STEMS = [
    'মাদারচোদ', 'বাইনচোদ', 'ভোনচোদ', 'খানকি', 'হারামজাদা', 'কুত্তারবাচ্চা', 'মাগিরপোলা',
    'madarchod', 'bhenchod', 'behnchod', 'motherfucker'
  ];
  for (const bad of DANGEROUS_COLLAPSED_STEMS) {
    if (collapsedSpaced.includes(bad)) return { isBad: true, matchedWord: bad };
  }

  return { isBad: false };
}

/**
 * Advanced AI-Powered Badword Detection (Gemini / ChatGPT Context Engine)
 */
export async function checkBadwordWithAi(
  text: string,
  senderPhone: string,
  userName: string,
  groupSubject: string,
  settings: ModerationSettings
): Promise<{ isBad: boolean; reason: string }> {
  try {
    const prompt = `You are a strict WhatsApp group moderator AI. Analyze the following text from a WhatsApp group to determine if it contains EXPLICIT PROFANITY, VULGAR CURSES, OR SEVERE INSULTS in Bengali, Banglish, Sylheti, Hindi, or English.
    
    IMPORTANT CONTEXTUAL MODERATION RULES:
    1. DO NOT flag normal conversational Bengali sentences or everyday idioms (e.g. "ভুল করে হলে মাইর খাবে", "আজকে কাজ করবো না", "কথা শুনবে", "কথা বলো", "মাইর খাইবা"). Phrasal warnings like "মাইর খাবে" (will get beaten/reprimanded) or "ভুল" are normal Bengali conversation and NOT profanity!
    2. ONLY flag explicit vulgar slurs, curses, sexual profanity, abusive insults, or severe hate speech (e.g. "মাদারচোদ", "খানকি", "fuck", "bitch", etc.).
    3. If the message is normal conversational text or clean chat, reply ONLY with the word "SAFE".
    4. If it contains genuine explicit vulgar profanity/slur, reply ONLY with the word "VIOLATION" followed by a 1-sentence reason in Bengali.

    Text: "${text}"
    User: ${userName} (${senderPhone})
    Group: ${groupSubject}`;

    const aiResult = await getMayaResponse(
      prompt,
      senderPhone,
      userName,
      groupSubject,
      'ai_moderator_check',
      {
        ...settings,
        romantic: false,
        funny: false,
        language: settings.mayaLanguage,
        isPrivate: false,
        memoryLimit: 0, 
      }
    );

    if (aiResult.reply && aiResult.reply.toUpperCase().startsWith('VIOLATION')) {
      const reason = aiResult.reply.replace(/VIOLATION/i, '').trim() || 'গালি বা আপত্তিকর ভাষা শনাক্ত হয়েছে';
      return { isBad: true, reason };
    }
  } catch (err: any) {
    console.error('[AI Badword Check Error]:', err.message);
  }
  return { isBad: false, reason: '' };
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
export function recordStickerAndCheckSpam(
  groupId: string,
  senderJid: string,
  timeWindowSec: number = 5,
  limit: number = 5
): boolean {
  const cleanSender = normalizeJid(senderJid);
  const key = `${groupId}:${cleanSender}`;
  const now = Date.now();
  if (!stickerTimestamps[key]) {
    stickerTimestamps[key] = [];
  }

  const windowMs = Math.max(1, timeWindowSec) * 1000;
  stickerTimestamps[key] = stickerTimestamps[key].filter((t) => now - t <= windowMs);
  stickerTimestamps[key].push(now);

  return stickerTimestamps[key].length >= limit;
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
  if (settings.individualMuteEnabled || settings.antiStickerSpam) {
    const restrictionCheck = isUserRestricted(remoteJid, senderJid);
    if (restrictionCheck.restricted) {
      // Group Admins are never restricted if Admin Shield is active
      if (isSenderAdmin) {
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
  // FEATURE 3: ANTI-STICKER SPAM (5 SECONDS -> 10-MINUTE INDIVIDUAL MEMBER LOCK)
  // -------------------------------------------------------------
  if ((settings.antiStickerSpam || settings.individualMuteEnabled) && isSticker) {
    const isProtected = settings.adminShield && isSenderAdmin;
    if (!isProtected) {
      const windowSec = settings.individualMuteTimeWindow || 5;
      const stickerLimit = settings.individualMuteStickerLimit || 5;
      const durationMins = settings.individualMuteDurationMinutes || 10;

      const isSpam = recordStickerAndCheckSpam(remoteJid, senderJid, windowSec, stickerLimit);
      if (isSpam) {
        console.log(`[Anti-Sticker Spam Triggered] Restricting @${cleanPhone} for ${durationMins} minutes (${stickerLimit}+ stickers in ${windowSec}s in ${groupSubject})`);

        // 1. Delete the spam sticker immediately
        try {
          await sock.sendMessage(remoteJid, { delete: msg.key });
          db.stats.deletedMessages++;
        } catch (delErr: any) {
          console.error('[Anti-Sticker Spam] Failed to delete spam sticker:', delErr.message);
        }

        // 2. Restrict ONLY THIS MEMBER for 10 minutes (Do NOT lock group settings for other members)
        restrictUser(
          remoteJid,
          groupSubject,
          senderJid,
          cleanPhone,
          durationMins,
          `${windowSec} সেকেন্ডে ${stickerLimit}টি স্টিকার পাঠানো (Sticker Spam)`
        );

        saveDatabase();

        // 3. Send warning notice alert to the group if not silent
        if (!settings.silentModeration) {
          await safeSendMessage(sock, remoteJid, {
            text: `🚨 WAGuard Security Alert\n\n⚠️ @${cleanPhone} অতিরিক্ত স্টিকার পাঠানোর কারণে Anti-Spam Protection-এর আওতায় এসেছে।\n\n🔒 Temporary Messaging Restriction Activated\n\n⏳ Restriction Duration: ${durationMins} Minutes\n\n📌 এই সময়ে ওই সদস্যের পাঠানো নতুন মেসেজ স্বয়ংক্রিয়ভাবে মুছে ফেলার চেষ্টা করা হবে।\n\n🛡️ গ্রুপের অন্য সদস্যরা স্বাভাবিকভাবে মেসেজ করতে পারবেন।`,
            mentions: [senderJid],
          });
        }

        return; // Finished handling spam sticker
      }
    }
  }

  // -------------------------------------------------------------
  // RULE EVALUATION ENGINE (Fast Local Moderation)
  // -------------------------------------------------------------
  let violationType: string | null = null;
  let violationDetails = '';

  // Feature 1: Admin Security Shield (Respects settings.adminShield toggle)
  const isProtectedAdmin = settings.adminShield && isSenderAdmin; 

  if (!isProtectedAdmin) {
  // Feature 2: ANTI-STICKER (Delete every sticker instantly if antiSticker is enabled)
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
        violationDetails = `গালি শনাক্ত হয়েছে (${badwordCheck.matchedWord})`;
      } else if (settings.aiBadwordDetection) {
        // Fallback to AI detection if standard dictionary doesn't catch it
        const aiCheck = await checkBadwordWithAi(messageText, cleanPhone, msg.pushName || 'User', groupSubject, settings);
        if (aiCheck.isBad) {
          violationType = 'AI-Anti-Badword';
          violationDetails = aiCheck.reason;
        }
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
    if (!settings.silentModeration) {
      if (warningCount === 1) {
        await sock.sendMessage(remoteJid, {
          text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${violationDetails}!\nআপনার মেসেজটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
          mentions: [senderJid],
        });
      } else if (warningCount === 2) {
        await sock.sendMessage(remoteJid, {
          text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${violationDetails})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
          mentions: [senderJid],
        });
      } else if (warningCount >= 3) {
        if (settings.autoKick3Warnings) {
          const freshPerms = await checkPermissions(sock, remoteJid, senderJid, true);
          if (freshPerms.isSenderAdmin) {
            await safeSendMessage(sock, remoteJid, {
              text: `🛡️ [অ্যাডমিন সুরক্ষা Notice]\nসদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন। তবে তিনি একজন গ্রুপ অ্যাডমিন হওয়ায় তাকে কিক করা সম্ভব নয়।`,
              mentions: [senderJid],
            });
            return;
          }
          if (freshPerms.isBotAdmin) {
            try {
              const targetJid = normalizeJid(senderJid);
              await sock.sendMessage(remoteJid, {
                text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
                mentions: [senderJid],
              });
              await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
              db.stats.kickedMembers++;
              delete db.warnings[warningKey];
              saveDatabase();
            } catch (kickErr: any) {
              console.error('[Kick FAILED]:', kickErr);
            }
          }
        }
      }
    }

    // Always log the activity regardless of silent mode
    const actionMap: Record<number, string> = { 1: '১ম সতর্কতা', 2: '২য় সতর্কতা', 3: '৩য় সতর্কতা' };
    addActivityLog({
      groupId: remoteJid,
      groupName: groupSubject,
      senderJid,
      senderPhone: cleanPhone,
      action: warningCount >= 3 && settings.autoKick3Warnings ? 'kicked' : 'warned',
      reason: `${violationType} (${actionMap[warningCount] || 'সতর্কতা'})`,
      details: violationDetails,
      warningCount,
    });

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

    const isSalamOrGreeting = isRespectfulSalamOrGreeting(messageText);

    const shouldAttemptReply = 
      isDirectMention || 
      isDirectCall || 
      isQuotingBot || 
      isSalamOrGreeting ||
      (settings.mayaAutoParticipate && Math.random() * 100 < settings.mayaReplyFrequency);

    if (shouldAttemptReply) {
      const now = Date.now();
      const lastReply = lastAiReplyTime[remoteJid] || 0;
      const cooldownMs = settings.mayaReplyCooldown * 1000;

      if (!isDirectMention && !isDirectCall && !isQuotingBot && !isSalamOrGreeting && now - lastReply < cooldownMs) {
        return;
      }

      console.log(`[Maya AI Response Engine] Processing for ${groupSubject} (Sending to User DM)`);
      
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

          // Always reply directly to user's private inbox JID as requested
          const targetJid = normalizeJid(senderJid);

          const sent = await safeSendMessage(
            sock,
            targetJid,
            {
              text: `🌸 [Maya AI Private Reply for ${groupSubject}]\n\n${aiResult.reply}`
            }
          );

          if (sent) {
            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'replied',
              reason: `Group Mention -> Private Inbox Reply [${aiResult.provider.toUpperCase()}]`,
              details: aiResult.reply.slice(0, 60),
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to get Maya AI response in group:', err.message);
      }
    }
  }
}
