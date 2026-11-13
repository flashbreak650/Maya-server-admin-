import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jidNormalizedUser, type proto, type WASocket } from '@whiskeysockets/baileys';
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
  aiBadwordDetection: true,
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
  'খানকি', 'খানকির', 'খানকিরপোলা', 'মাগি', 'মাগির', 'মাগী', 'মাগীর', 'বেশ্যা', 'বেশ্যার',
  'রান্ডি', 'রান্ডির', 'চুদা', 'চুদানি', 'চুদানির', 'চুদ', 'চুদি', 'চুদির', 'চোদ', 'চোদা',
  'চোদনা', 'চুদনা', 'চোদানি', 'চোদানির', 'বোকাচোদা', 'বোকচোদা', 'মাদারচোদ', 'মাদারচুদা',
  'বাইনচোদ', 'বাইনচুদা', 'ভোনচোদ', 'কুত্তা', 'কুত্তার', 'কুত্তির', 'শুয়োর', 'শুয়োরের',
  'শুয়োর', 'শুয়োরের', 'হারামি', 'হারামী', 'হারামজাদা', 'হারামখোর', 'ভোদা', 'ভোদাই',
  'ধোন', 'লুচ্চা', 'লুচ্চামি', 'গুয়া', 'গুয়ার', 'গুদে', 'গুদ', 'বাল', 'বালের', 'বালছাল',
  'সালা', 'শালা', 'শালার', 'সালার', 'চুতিয়া', 'চুতিয়া', 'নটি', 'নটির', 'জারজ',
  'কুত্তার বাচ্চা', 'শুয়োরের বাচ্চা', 'শুয়োরের বাচ্চা', 'মাগির পোলা', 'খানকির পোলা'
].map((w) => w.normalize('NFC'));

// Sylheti local slang
const SYLHETI_BADWORDS = [
  'ফুয়া', 'রান্দি', 'খাউয়াস', 'আওলাইন্না', 'মুতার', 'নাঙ্গট'
].map((w) => w.normalize('NFC'));

// Banglish (slang transliterated into English letters)
const BANGLISH_BADWORDS = [
  'khanki', 'khankir', 'magi', 'magir', 'besha', 'beshar', 'beshya',
  'randi', 'randir', 'raandi', 'choda', 'chudani', 'chuda', 'chudanir', 'chodna', 'chudna',
  'bokachoda', 'madarchod', 'madarchuda', 'bainchod', 'baimchod', 'bhenchod', 'behnchod',
  'harami', 'haramzada', 'kuttar baccha', 'shuorer baccha', 'bhoda', 'bhodai',
  'dhon', 'guya', 'gud', 'bal', 'baler', 'chutia', 'chutiya', 'chod', 'sala', 'shala', 'shalar'
].map((w) => w.normalize('NFC'));

// Hindi / Urdu slang
const HINDI_URDU_BADWORDS = [
  'madarchod', 'bhenchod', 'behnchod', 'gaand', 'gandu', 'lund', 'lauda',
  'laude', 'lavde', 'raand', 'bsdk', 'bhosdike', 'chutiya', 'harami', 'kutte'
].map((w) => w.normalize('NFC'));

// English profanities
const ENGLISH_BADWORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches',
  'asshole', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'nigga'
].map((w) => w.normalize('NFC'));

// Arabic profanities
const ARABIC_BADWORDS = [
  'شرموطة', 'قحبة', 'كس', 'طيز', 'منيوك', 'ابن الكلب', 'عرص', 'زب'
].map((w) => w.normalize('NFC'));

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

// Normalization function: NFC unicode normalization, lowercase, strips invisible chars, decodes leetspeak
function normalizeText(raw: string): string {
  let str = raw.normalize('NFC').toLowerCase();

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

  // 2. Built-in dictionaries check (single words + multi-word phrases)
  const allWordLists = [
    ...BENGALI_BADWORDS,
    ...SYLHETI_BADWORDS,
    ...BANGLISH_BADWORDS,
    ...HINDI_URDU_BADWORDS,
    ...ENGLISH_BADWORDS,
    ...ARABIC_BADWORDS,
  ];

  // Check multi-word phrases cleanly on normalized text
  const normalizedSpaceCollapsed = normalized.replace(/\s+/g, ' ').trim();
  for (const bad of allWordLists) {
    if (bad.includes(' ') && normalizedSpaceCollapsed.includes(bad)) {
      return { isBad: true, matchedWord: bad };
    }
  }

  for (const token of tokens) {
    if (!token || token.length < 2) continue;
    if (isSafeWordOrGreeting(token)) continue;

    for (const bad of allWordLists) {
      if (bad.includes(' ')) continue;
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
  ].map((w) => w.normalize('NFC'));
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
  // Fast exit if no AI API key is configured anywhere
  const hasPoolKey = Array.isArray(settings.aiKeys) && settings.aiKeys.some((k) => k.status === 'active' || k.status === 'cooldown');
  const hasLegacyKey = Boolean(
    (settings.geminiApiKey && settings.geminiApiKey.trim().length > 10) ||
    (settings.groqApiKey && settings.groqApiKey.trim().length > 10) ||
    (settings.openrouterApiKey && settings.openrouterApiKey.trim().length > 10) ||
    process.env.GEMINI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );
  if (!hasPoolKey && !hasLegacyKey) {
    return { isBad: false, reason: '' };
  }

  try {
    const moderatorSystemPrompt = `You are a precise WhatsApp group moderation classifier. Your ONLY task is to classify whether a message contains EXPLICIT PROFANITY, VULGAR CURSES, SEXUAL SLURS, OR SEVERE ABUSIVE INSULTS in Bengali, Banglish, Sylheti, Hindi, Urdu, Arabic, or English.

STRICT RULES:
1. NEVER flag normal conversational Bengali sentences, warnings, jokes, or everyday idioms such as "ভুল করে হলে মাইর খাবে", "আজকে কাজ করবো না", "কথা শুনবে", "কথা বলো", "মাইর খাইবা", "বালতি", "সালাম".
2. ONLY flag genuine explicit profanity, vulgar slurs, curses, sexual abuse, or severe insults (including disguised spelling or slang).
3. Output format MUST strictly be ONE LINE:
   - If clean/normal: SAFE
   - If explicit profanity: VIOLATION: <1 short reason in Bengali>`;

    const userPrompt = `Group: ${groupSubject}\nSender: ${userName} (${senderPhone})\nMessage: "${text}"`;

    const aiResult = await getMayaResponse(
      userPrompt,
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
        customSystemPrompt: moderatorSystemPrompt,
        disableMemory: true,
      }
    );

    const reply = (aiResult.reply || '').trim();
    if (aiResult.provider !== 'none' && /^\s*VIOLATION\b/i.test(reply)) {
      const reason = reply.replace(/^\s*VIOLATION\s*:?\s*/i, '').trim() || 'AI দ্বারা গালি বা আপত্তিকর ভাষা শনাক্ত হয়েছে';
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
  let current: any = message;
  for (let depth = 0; depth < 6; depth++) {
    const wrapped =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message ||
      current?.associatedChildMessage?.message ||
      current?.lottieStickerMessage?.message ||
      current?.groupMentionedMessage?.message ||
      current?.botInvokeMessage?.message ||
      current?.botForwardedMessage?.message ||
      current?.groupStatusMessage?.message ||
      current?.groupStatusMessageV2?.message ||
      current?.questionReplyMessage?.message ||
      current?.questionMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current as proto.IMessage;
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

function cleanJidUser(jid?: string | null): string {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].trim();
}

export async function checkPermissions(
  sock: WASocket,
  groupId: string,
  senderJid: string,
  forceRefresh = false,
  senderAltJid?: string
): Promise<{
  isSenderAdmin: boolean;
  isBotAdmin: boolean;
  groupSubject: string;
  matchedSenderId?: string;
}> {
  try {
    const meta = await getGroupMeta(sock, groupId, forceRefresh);
    if (!meta || !meta.participants) {
      return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
    }

    const senderCandidates = new Set(
      [cleanJidUser(senderJid), cleanJidUser(senderAltJid)].filter(Boolean)
    );
    const senderNormalized = new Set(
      [senderJid ? normalizeJid(senderJid) : '', senderAltJid ? normalizeJid(senderAltJid) : ''].filter(Boolean)
    );

    const botRawIds = [
      sock.user?.id,
      sock.user?.lid,
      sock.authState?.creds?.me?.id,
      sock.authState?.creds?.me?.lid,
    ].filter(Boolean) as string[];
    const botCandidates = new Set(botRawIds.map((j) => cleanJidUser(j)).filter(Boolean));
    const botNormalized = new Set(botRawIds.map((j) => normalizeJid(j)).filter(Boolean));

    let isSenderAdmin = false;
    let isBotAdmin = false;
    let matchedSenderId: string | undefined;

    for (const p of meta.participants) {
      const pAny = p as any;
      const pAllJids = [p.id, pAny.lid, pAny.phoneNumber].filter(Boolean) as string[];
      const pAllClean = pAllJids.map((j) => cleanJidUser(j)).filter(Boolean);
      const pAllNorm = pAllJids.map((j) => normalizeJid(j)).filter(Boolean);
      const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);

      const matchesSender =
        pAllClean.some((c) => senderCandidates.has(c)) ||
        pAllNorm.some((n) => senderNormalized.has(n));

      if (matchesSender) {
        matchedSenderId = p.id;
        if (isAdmin) {
          isSenderAdmin = true;
        }
      }

      const matchesBot =
        pAllClean.some((c) => botCandidates.has(c)) ||
        pAllNorm.some((n) => botNormalized.has(n));

      if (matchesBot && isAdmin) {
        isBotAdmin = true;
      }
    }

    console.log(
      `[Admin Verification] Group: "${meta.subject}" (${meta.addressingMode || 'pn'}) | Bot IDs: ${Array.from(botCandidates).join(',')} | isBotAdmin: ${isBotAdmin} | isSenderAdmin: ${isSenderAdmin}`
    );

    return {
      isSenderAdmin,
      isBotAdmin,
      groupSubject: meta.subject || 'WhatsApp Group',
      matchedSenderId,
    };
  } catch (err: any) {
    console.error('[checkPermissions error]:', err.message);
    return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
  }
}

/**
 * Bulletproof Baileys v7 Group Message Revoke (handles PN + LID addressing modes)
 */
async function deleteMessageSafely(
  sock: WASocket,
  remoteJid: string,
  msg: proto.IWebMessageInfo,
  matchedSenderId?: string
): Promise<boolean> {
  const key = msg.key;
  if (!key?.id) return false;

  const participantCandidates: string[] = [];
  const rawParticipant = key.participant || (msg as any).participant || '';
  const altParticipant = (key as any).participantAlt || '';

  for (const cand of [
    rawParticipant ? jidNormalizedUser(rawParticipant) : '',
    matchedSenderId ? jidNormalizedUser(matchedSenderId) : '',
    altParticipant ? jidNormalizedUser(altParticipant) : '',
    rawParticipant,
  ]) {
    if (cand && !participantCandidates.includes(cand)) {
      participantCandidates.push(cand);
    }
  }

  let lastErr: any = null;
  for (const participant of participantCandidates) {
    try {
      await sock.sendMessage(remoteJid, {
        delete: {
          remoteJid,
          fromMe: Boolean(key.fromMe),
          id: key.id,
          participant,
        },
      });
      return true;
    } catch (err: any) {
      lastErr = err;
    }
  }

  try {
    await sock.sendMessage(remoteJid, { delete: key });
    return true;
  } catch (err: any) {
    lastErr = err;
  }

  console.error('[Delete Message FAILED]:', lastErr?.message || lastErr);
  return false;
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

      if (aiResult.reply && aiResult.provider !== 'none') {
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
  const senderAltJid = (msg.key as any).participantAlt || '';

  const cleanPhone = (senderAltJid || senderJid).split('@')[0].split(':')[0];

  // 1. Verify Admin Permissions (supports both Baileys v7 @lid and @s.whatsapp.net)
  const { isSenderAdmin, isBotAdmin, groupSubject, matchedSenderId } = await checkPermissions(
    sock,
    remoteJid,
    senderJid,
    false,
    senderAltJid
  );
  const canonicalSender = matchedSenderId || normalizeJid(senderJid);

  // -------------------------------------------------------------
  // FEATURE 0: ACTIVE INDIVIDUAL RESTRICTION (MESSAGE INTERCEPTION & AUTO-DELETE)
  // -------------------------------------------------------------
  if (settings.individualMuteEnabled || settings.antiStickerSpam) {
    const restrictionCheck = isUserRestricted(remoteJid, canonicalSender);
    if (restrictionCheck.restricted) {
      // Group Admins are never restricted if Admin Shield is active
      if (isSenderAdmin && settings.adminShield) {
        console.log(`[Individual Mute] @${cleanPhone} is an Admin with Admin Shield active. Lifting restriction.`);
        unrestrictUser(remoteJid, canonicalSender);
      } else {
        const remainingSec = Math.round(restrictionCheck.remainingMs / 1000);
        console.log(`[Individual Mute ACTIVE] Intercepted message from restricted user @${cleanPhone} in "${groupSubject}". Auto-deleting message (${remainingSec}s remaining)...`);

        const deleted = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId);
        if (deleted) {
          db.stats.deletedMessages++;
          db.stats.restrictedMessagesBlocked = (db.stats.restrictedMessagesBlocked || 0) + 1;
          saveDatabase();
        }

        // Halts all processing! Message deleted instantly, other members chat freely.
        return;
      }
    }
  }

  const rawMsgAny = msg.message as any;
  const realMsgAny = realMsg as any;
  const isSticker = Boolean(
    realMsg.stickerMessage ||
    rawMsgAny?.lottieStickerMessage ||
    realMsgAny?.lottieStickerMessage ||
    realMsgAny?.stickerPackMessage ||
    rawMsgAny?.stickerPackMessage ||
    rawMsgAny?.associatedChildMessage?.message?.stickerMessage ||
    rawMsgAny?.associatedChildMessage?.message?.lottieStickerMessage
  );
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

      const isSpam = recordStickerAndCheckSpam(remoteJid, canonicalSender, windowSec, stickerLimit);
      if (isSpam) {
        console.log(`[Anti-Sticker Spam Triggered] Restricting @${cleanPhone} for ${durationMins} minutes (${stickerLimit}+ stickers in ${windowSec}s in ${groupSubject})`);

        // 1. Delete the spam sticker immediately
        const deleted = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId);
        if (deleted) {
          db.stats.deletedMessages++;
        }

        // 2. Restrict ONLY THIS MEMBER for 10 minutes (Do NOT lock group settings for other members)
        restrictUser(
          remoteJid,
          groupSubject,
          canonicalSender,
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
    console.log(`[Moderation Triggered] ${violationType} in ${groupSubject} by @${cleanPhone} (isBotAdmin=${isBotAdmin})`);

    // Step 1: Real Message Delete Operation (PN + LID compatible)
    const deleteSuccessful = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId);
    if (deleteSuccessful) {
      db.stats.deletedMessages++;
    } else if (!isBotAdmin) {
      console.warn(`[Moderation Warn] Cannot delete message in "${groupSubject}" because bot is NOT Group Admin.`);
    }

    // Step 2: Warning Counter per Member per Group
    const warningKey = `${remoteJid}:${canonicalSender}`;
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

    // Feature 10: THREE WARNING AUTO KICK (Always enforce kick even if silentModeration is enabled)
    if (warningCount === 1 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${violationDetails}!\nআপনার মেসেজটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
        mentions: [senderJid],
      });
    } else if (warningCount === 2 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${violationDetails})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
        mentions: [senderJid],
      });
    } else if (warningCount >= 3 && settings.autoKick3Warnings) {
      const freshPerms = await checkPermissions(sock, remoteJid, senderJid, true, senderAltJid);
      if (freshPerms.isSenderAdmin) {
        if (!settings.silentModeration) {
          await safeSendMessage(sock, remoteJid, {
            text: `🛡️ [অ্যাডমিন সুরক্ষা Notice]\nসদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন। তবে তিনি একজন গ্রুপ অ্যাডমিন হওয়ায় তাকে কিক করা সম্ভব নয়।`,
            mentions: [senderJid],
          });
        }
      } else if (freshPerms.isBotAdmin) {
        const kickTargets: string[] = [];
        for (const cand of [
          freshPerms.matchedSenderId,
          normalizeJid(senderJid),
          senderAltJid ? normalizeJid(senderAltJid) : '',
        ]) {
          if (cand && !kickTargets.includes(cand)) {
            kickTargets.push(cand);
          }
        }

        if (!settings.silentModeration) {
          await safeSendMessage(sock, remoteJid, {
            text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
            mentions: [senderJid],
          });
        }

        let kickedOk = false;
        let lastKickStatus = '';
        for (const targetJid of kickTargets) {
          try {
            const kickRes: any = await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
            const status = Array.isArray(kickRes) ? String(kickRes[0]?.status || '200') : '200';
            lastKickStatus = status;
            if (status === '200' || status === '207') {
              kickedOk = true;
              break;
            }
            console.warn(`[Kick Attempt] Target ${targetJid} returned status ${status}`);
          } catch (kickErr: any) {
            lastKickStatus = kickErr?.message || String(kickErr);
            console.error(`[Kick FAILED for ${targetJid}]:`, lastKickStatus);
          }
        }

        if (kickedOk) {
          db.stats.kickedMembers++;
          delete db.warnings[warningKey];
          saveDatabase();
        } else {
          addActivityLog({
            groupId: remoteJid,
            groupName: groupSubject,
            senderJid,
            senderPhone: cleanPhone,
            action: 'error',
            reason: `মেম্বার রিমুভ ব্যর্থ হয়েছে (Status: ${lastKickStatus || 'Unknown'})`,
            details: 'বট গ্রুপের অ্যাডমিন কিনা বা ইউজার গ্রুপের মালিক কিনা যাচাই করুন।',
          });
        }
      } else {
        addActivityLog({
          groupId: remoteJid,
          groupName: groupSubject,
          senderJid,
          senderPhone: cleanPhone,
          action: 'error',
          reason: 'মেম্বার রিমুভ করা যায়নি — বট এই গ্রুপের অ্যাডমিন নয়',
          details: 'মেসেজ ডিলিট ও মেম্বার রিমুভ করার জন্য বট নম্বরটিকে গ্রুপ অ্যাডমিন (Admin) বানান।',
        });
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
      reason: `${violationType} (${actionMap[warningCount] || 'সতর্কতা'})${deleteSuccessful ? '' : ' [Delete Failed: বট অ্যাডমিন নয়]'}`,
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

        if (aiResult.reply && aiResult.provider !== 'none') {
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
