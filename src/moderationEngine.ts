import fs from 'fs';
import { downloadMediaMessage, jidNormalizedUser, type proto, type WASocket } from '@whiskeysockets/baileys';
import { getMayaMultimodalResponse, getMayaResponse, inspectImageSafetyWithAi } from './aiEngine.ts';
import { DATA_DIR, MODERATION_DB_PATH } from './storagePaths.ts';

const DB_PATH = MODERATION_DB_PATH;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface KeywordTrigger {
  id: string;
  keyword: string;
  reply: string;
  matchType: 'exact' | 'contains';
  enabled: boolean;
  createdAt: number;
  hitCount?: number;
}

export interface CallLogItem {
  id: string;
  timestamp: number;
  callerJid: string;
  callerPhone: string;
  isVideo: boolean;
  status: string;
  blocked: boolean;
}

export interface MemberActivityItem {
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  name: string;
  messageCount: number;
  lastSeen: number;
  firstSeen: number;
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
  allowCarromLinks?: boolean;
  autoKick3Warnings: boolean;
  autoWelcome: boolean;
  welcomeMessage?: string;
  botReply: boolean;
  customBadwords: string[];
  // Feature 1: Dashboard Admin PIN Lock
  dashboardPinEnabled: boolean;
  dashboardPin: string;
  // Feature 2: Scheduled Night Mode
  nightModeEnabled: boolean;
  nightLockStart: string;
  nightLockEnd: string;
  nightModeTimezone: string;
  nightModeNotify: boolean;
  // Feature 3: Anti-Call Protection
  antiCallEnabled: boolean;
  antiCallMessage: string;
  antiCallAutoBlockCount: number;
  // Feature 4: Maya Voice, Vision & Anti-NSFW Image
  mayaVoiceEnabled: boolean;
  mayaVisionEnabled: boolean;
  antiNsfwImage: boolean;
  // Feature 5: Activity Tracking
  activityTrackingEnabled: boolean;
  // Feature 6: Keyword Auto-Responder
  keywordAutoReplyEnabled: boolean;
  keywordTriggers: KeywordTrigger[];
  // Individual Temporary Mute (Auto-Delete Interception for Sticker Spammers)
  individualMuteEnabled: boolean;
  individualMuteStickerLimit: number;
  individualMuteTimeWindow: number; // in seconds
  individualMuteDurationMinutes: number; // in minutes
  stickerDeleteMaxRetries?: number;
  stickerQueueConcurrency?: number;
  manualBlockNotice?: string;
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
  // Anti-Spam Warning Privacy, Auto Salam, Admin Mention Reply, Typing Indicator, Boss Fight Alert & Zero-API Server Notice
  autoSalamReplyEnabled?: boolean;
  botTypingEnabled?: boolean;
  leaderboardCleanOnly?: boolean;
  adminMentionReplyEnabled?: boolean;
  adminMentionReplyTarget?: 'all_admins' | 'boss_only';
  adminMentionReplyMessage?: string;
  bossAdminNumber?: string;
  bossFightAlertEnabled?: boolean;
  bossFightMinPeople?: number;
  bossFightWindowMinutes?: number;
  serverErrorNoticeEnabled?: boolean;
  serverErrorNoticeTarget?: 'boss_inbox' | 'groups' | 'both';
  // Secondary Independent Female AI Companion Account (Zero Moderation, Pure Chat)
  companionEnabled?: boolean;
  companionName?: string;
  companionInboxReply?: boolean;
  companionGroupReply?: boolean;
  companionGroupMode?: 'smart_auto' | 'mention_or_reply' | 'all';
  companionRomanticLevel?: 'sweet' | 'romantic' | 'balanced';
  companionStrictAccuracy?: boolean;
  companionCooldownSec?: number;
  companionAllowedGroups?: string[];
  companionCustomBio?: string;
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
  groupId?: string;
  groupName?: string;
  senderJid?: string;
  senderPhone?: string;
}

export interface GroupLock {
  groupId: string;
  groupName?: string;
  lockedUntil: number;
  originalSetting: string;
  reason: string;
  timerActive?: boolean;
}

export interface RestrictedUser {
  groupId: string;
  groupName: string;
  senderJid: string;
  altJid?: string;
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
  nightLockedGroups: Record<string, { groupName: string; lockedAt: number }>;
  restrictedUsers: Record<string, RestrictedUser>; // key: `${groupId}:${normalizeJid(senderJid)}`
  callLogs: CallLogItem[];
  callCounts: Record<string, number>;
  memberActivity: Record<string, MemberActivityItem>;
  activityLogs: ActivityLog[];
  stats: {
    messagesChecked: number;
    warningsGiven: number;
    deletedMessages: number;
    kickedMembers: number;
    groupLocksTriggered: number;
    individualMutesTriggered?: number;
    restrictedMessagesBlocked?: number;
    callsRejected?: number;
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
  allowCarromLinks: true,
  autoKick3Warnings: true,
  autoWelcome: true,
  welcomeMessage: '',
  botReply: true,
  customBadwords: [],
  dashboardPinEnabled: false,
  dashboardPin: '',
  nightModeEnabled: false,
  nightLockStart: '00:00',
  nightLockEnd: '06:00',
  nightModeTimezone: 'Asia/Dhaka',
  nightModeNotify: true,
  antiCallEnabled: true,
  antiCallMessage: '📵 দুঃখিত! এটি একটি অটোমেটেড WhatsApp সিকিউরিটি বট। অনুগ্রহ করে কল না করে মেসেজ পাঠান।',
  antiCallAutoBlockCount: 3,
  mayaVoiceEnabled: true,
  mayaVisionEnabled: true,
  antiNsfwImage: false,
  activityTrackingEnabled: true,
  keywordAutoReplyEnabled: true,
  keywordTriggers: [],
  individualMuteEnabled: true,
  individualMuteStickerLimit: 3,
  individualMuteTimeWindow: 5,
  individualMuteDurationMinutes: 10,
  stickerDeleteMaxRetries: 4,
  stickerQueueConcurrency: 5,
  manualBlockNotice: '',
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
  autoSalamReplyEnabled: true,
  botTypingEnabled: true,
  leaderboardCleanOnly: true,
  adminMentionReplyEnabled: true,
  adminMentionReplyTarget: 'all_admins',
  adminMentionReplyMessage: '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।',
  bossAdminNumber: '8801632222592',
  bossFightAlertEnabled: true,
  bossFightMinPeople: 3,
  bossFightWindowMinutes: 5,
  serverErrorNoticeEnabled: true,
  serverErrorNoticeTarget: 'boss_inbox',
  companionEnabled: true,
  companionName: 'নিলা (Nila)',
  companionInboxReply: true,
  companionGroupReply: true,
  companionGroupMode: 'smart_auto',
  companionRomanticLevel: 'romantic',
  companionStrictAccuracy: true,
  companionCooldownSec: 6,
  companionAllowedGroups: [],
  companionCustomBio: '',
};

// In-memory runtime database
let db: ModerationDB = {
  settings: { ...DEFAULT_SETTINGS },
  warnings: {},
  groupLocks: {},
  nightLockedGroups: {},
  restrictedUsers: {},
  callLogs: [],
  callCounts: {},
  memberActivity: {},
  activityLogs: [],
  stats: {
    messagesChecked: 0,
    warningsGiven: 0,
    deletedMessages: 0,
    kickedMembers: 0,
    groupLocksTriggered: 0,
    individualMutesTriggered: 0,
    restrictedMessagesBlocked: 0,
    callsRejected: 0,
  },
};

// Load database from disk
export function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      db = {
        settings: {
          ...DEFAULT_SETTINGS,
          ...(data.settings || {}),
          keywordTriggers: Array.isArray(data.settings?.keywordTriggers) ? data.settings.keywordTriggers : [],
        },
        warnings: data.warnings || {},
        groupLocks: data.groupLocks || {},
        nightLockedGroups: data.nightLockedGroups || {},
        restrictedUsers: data.restrictedUsers || {},
        callLogs: Array.isArray(data.callLogs) ? data.callLogs.slice(-100) : [],
        callCounts: data.callCounts || {},
        memberActivity: data.memberActivity || {},
        activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs.slice(-100) : [],
        stats: {
          messagesChecked: data.stats?.messagesChecked || 0,
          warningsGiven: data.stats?.warningsGiven || 0,
          deletedMessages: data.stats?.deletedMessages || 0,
          kickedMembers: data.stats?.kickedMembers || 0,
          groupLocksTriggered: data.stats?.groupLocksTriggered || 0,
          individualMutesTriggered: data.stats?.individualMutesTriggered || 0,
          restrictedMessagesBlocked: data.stats?.restrictedMessagesBlocked || 0,
          callsRejected: data.stats?.callsRejected || 0,
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
export function flushDatabaseSync() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err: any) {
    console.error('Error saving moderation DB:', err.message);
    reportServerProblem({
      category: 'db_save_error',
      title: 'ডাটাবেজ সেভ ব্যর্থ (DB Write Error)',
      details: err?.message || 'moderation_db.json সংরক্ষণ করা যায়নি।',
      suggestion: 'সার্ভারের ডিস্ক স্পেস ও ফোল্ডার পারমিশন পরীক্ষা করুন।',
    });
  }
}

export function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    flushDatabaseSync();
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

  // Never accidentally overwrite dashboardPin with masked string or empty string from general settings updates
  if (patch.dashboardPin === undefined || isMaskedKeyString(patch.dashboardPin)) {
    delete patch.dashboardPin;
  }

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
  flushDatabaseSync(); // Immediately write settings changes to disk so toggles never revert on redeploy/restart
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

export function resetSingleWarning(warningKey: string): boolean {
  if (!db.warnings || !db.warnings[warningKey]) return false;
  delete db.warnings[warningKey];
  saveDatabase();
  return true;
}

export function getActiveWarnings() {
  if (!db.warnings) return [];
  const logLookupByGroupSender = new Map<string, { groupName?: string; senderPhone?: string }>();
  const groupNameLookup = new Map<string, string>();
  for (const log of db.activityLogs) {
    if (log.groupId && log.groupName) {
      groupNameLookup.set(log.groupId, log.groupName);
    }
    if (log.groupId && log.senderJid) {
      logLookupByGroupSender.set(`${log.groupId}:${normalizeJid(log.senderJid)}`, {
        groupName: log.groupName,
        senderPhone: log.senderPhone,
      });
    }
  }

  return Object.entries(db.warnings)
    .filter(([, w]) => w && w.count > 0)
    .map(([key, w]) => {
      const splitIdx = key.indexOf('@g.us:');
      const parsedGroupId = w.groupId || (splitIdx !== -1 ? key.slice(0, splitIdx + 5) : key.split(':')[0] || '');
      const parsedSenderJid = w.senderJid || (splitIdx !== -1 ? key.slice(splitIdx + 6) : key.slice(parsedGroupId.length + 1));
      const logMeta = logLookupByGroupSender.get(`${parsedGroupId}:${normalizeJid(parsedSenderJid)}`);
      const fallbackPhone = parsedSenderJid ? parsedSenderJid.split('@')[0].split(':')[0] : 'Unknown';

      return {
        key,
        groupId: parsedGroupId,
        groupName: w.groupName || logMeta?.groupName || groupNameLookup.get(parsedGroupId) || 'Protected Group',
        senderJid: parsedSenderJid,
        senderPhone: w.senderPhone || logMeta?.senderPhone || fallbackPhone,
        count: w.count,
        maxWarnings: 3,
        lastViolation: w.lastViolation,
        violations: (w.violations || []).slice(-5),
      };
    })
    .sort((a, b) => b.lastViolation - a.lastViolation);
}

export function getActiveGroupLocks() {
  if (!db.groupLocks) return [];
  const now = Date.now();
  const groupNameLookup = new Map<string, string>();
  for (const log of db.activityLogs) {
    if (log.groupId && log.groupName) {
      groupNameLookup.set(log.groupId, log.groupName);
    }
  }

  const active: Array<GroupLock & { groupName: string; remainingSeconds: number; remainingText: string }> = [];
  for (const [groupId, lock] of Object.entries(db.groupLocks)) {
    if (!lock) continue;
    if (now >= lock.lockedUntil) continue;
    const remainingSec = Math.max(0, Math.ceil((lock.lockedUntil - now) / 1000));
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;
    active.push({
      ...lock,
      groupId,
      groupName: lock.groupName || groupNameLookup.get(groupId) || 'Protected Group',
      remainingSeconds: remainingSec,
      remainingText,
    });
  }
  return active.sort((a, b) => a.lockedUntil - b.lockedUntil);
}

export async function unlockGroupManually(sock: WASocket | null, groupId: string): Promise<boolean> {
  if (!db.groupLocks || !db.groupLocks[groupId]) return false;
  const lock = db.groupLocks[groupId];
  delete db.groupLocks[groupId];
  saveDatabase();

  let groupName = lock.groupName || 'Protected Group';
  for (const log of db.activityLogs) {
    if (log.groupId === groupId && log.groupName) {
      groupName = log.groupName;
      break;
    }
  }

  if (sock && sock.authState?.creds?.registered) {
    try {
      await sock.groupSettingUpdate(groupId, 'not_announcement');
      await safeSendMessage(sock, groupId, {
        text: '✅ [WAGuard Security]\nঅ্যাডমিন ড্যাশবোর্ড থেকে গ্রুপটি আনলক করা হয়েছে। এখন সবাই স্বাভাবিকভাবে মেসেজ পাঠাতে পারবেন।',
      });
    } catch (err: any) {
      console.error(`Manual unlock failed for ${groupId}:`, err?.message || err);
    }
  }

  addActivityLog({
    groupId,
    groupName,
    senderJid: 'ADMIN',
    senderPhone: 'ADMIN',
    action: 'unlocked',
    reason: 'ড্যাশবোর্ড থেকে ম্যানুয়ালি গ্রুপ আনলক করা হয়েছে।',
  });
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

const contactNamesCache: Record<string, string> = {};
const lidToPnUserMap = new Map<string, string>();
const pnToLidUserMap = new Map<string, string>();

export function normalizePhoneDigits(raw?: string | null): string {
  if (!raw) return '';
  let digits = String(raw)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('01') && digits.length === 11) digits = '88' + digits;
  else if (digits.startsWith('1') && digits.length === 10) digits = '880' + digits;
  return digits;
}

function isLidJid(jid?: string | null): boolean {
  return Boolean(jid && String(jid).toLowerCase().includes('@lid'));
}

function isPnJid(jid?: string | null): boolean {
  if (!jid) return false;
  const lower = String(jid).toLowerCase();
  return lower.includes('@s.whatsapp.net') || lower.includes('@c.us');
}

export function rememberLidPnPair(jidA?: string | null, jidB?: string | null) {
  const cands = [jidA, jidB].filter(Boolean) as string[];
  if (cands.length < 2) return;
  let lidUser = '';
  let pnDigits = '';
  for (const raw of cands) {
    const str = String(raw).trim();
    const cu = cleanJidUser(str);
    if (!cu) continue;
    if (isLidJid(str)) {
      lidUser = cu;
    } else if (isPnJid(str) || (!str.includes('@') && /^\d{10,15}$/.test(cu))) {
      pnDigits = normalizePhoneDigits(cu) || cu;
    }
  }
  if (lidUser && pnDigits && pnDigits.length >= 10) {
    lidToPnUserMap.set(lidUser, pnDigits);
    pnToLidUserMap.set(pnDigits, lidUser);
  }
}

function learnGroupParticipantsLidPn(meta: any) {
  if (!meta || !Array.isArray(meta.participants)) return;
  for (const p of meta.participants) {
    if (!p) continue;
    const lidCand = p.lid || (isLidJid(p.id) ? p.id : '');
    const pnCand = p.phoneNumber || (isPnJid(p.id) ? p.id : '');
    if (lidCand && pnCand) {
      rememberLidPnPair(lidCand, pnCand);
    }
  }
}

export function updateContactNames(
  contacts: Array<{ id?: string; lid?: string; phoneNumber?: string; name?: string; notify?: string; verifiedName?: string }>
) {
  if (!Array.isArray(contacts)) return;
  for (const c of contacts) {
    rememberLidPnPair(c.id, c.phoneNumber || c.lid);
    rememberLidPnPair(c.lid, c.phoneNumber || c.id);
    const display = (c.name || c.notify || c.verifiedName || '').trim();
    if (!display) continue;
    for (const jid of [c.id, c.lid, c.phoneNumber]) {
      if (!jid) continue;
      const clean = cleanJidUser(jid);
      if (clean) contactNamesCache[clean] = display;
      contactNamesCache[normalizeJid(jid)] = display;
    }
  }
}

export function getRestrictedUserKey(groupId: string, senderJid: string): string {
  return `${groupId}:${normalizeJid(senderJid)}`;
}

function findRestrictionEntry(
  groupId: string,
  senderJid: string,
  extraJids: string[] = []
): { key: string; restriction: RestrictedUser } | null {
  if (!db.restrictedUsers) return null;
  const candidates = [senderJid, ...extraJids].filter(Boolean);
  const candidateKeys = new Set<string>();
  const candidateUsers = new Set<string>();

  for (const cand of candidates) {
    candidateKeys.add(getRestrictedUserKey(groupId, cand));
    candidateKeys.add(`${groupId}:${cand}`);
    const cu = cleanJidUser(cand);
    if (cu) candidateUsers.add(cu);
  }

  for (const ck of candidateKeys) {
    if (db.restrictedUsers[ck]) {
      return { key: ck, restriction: db.restrictedUsers[ck] };
    }
  }

  // Fallback: match stored altJid or clean user digits in the same group
  for (const [storedKey, entry] of Object.entries(db.restrictedUsers)) {
    if (entry.groupId !== groupId) continue;
    const entryUsers = [cleanJidUser(entry.senderJid), cleanJidUser(entry.altJid), cleanJidUser(entry.senderPhone)].filter(Boolean);
    if (entryUsers.some((u) => candidateUsers.has(u))) {
      return { key: storedKey, restriction: entry };
    }
  }

  return null;
}

export function isUserRestricted(
  groupId: string,
  senderJid: string,
  extraJids: string[] = []
): { restricted: boolean; remainingMs: number; restriction?: RestrictedUser } {
  if (!db.restrictedUsers) {
    db.restrictedUsers = {};
    return { restricted: false, remainingMs: 0 };
  }

  const found = findRestrictionEntry(groupId, senderJid, extraJids);
  if (!found) {
    return { restricted: false, remainingMs: 0 };
  }

  const { key, restriction } = found;
  const now = Date.now();
  if (now >= restriction.expiresAt) {
    // Restriction duration has elapsed! Automatically remove
    delete db.restrictedUsers[key];
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
          text: `🔔 *মেসেজিং বিরতি সমাপ্ত*\n\n👤 @${restriction.senderPhone}\n✅ আপনার সাময়িক নীরবতার সময় শেষ হয়েছে। এখন থেকে পুনরায় গ্রুপে মেসেজ পাঠাতে পারবেন।`,
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
  reason: string = 'অতিরিক্ত স্টিকার স্প্যাম',
  altJid?: string
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
    altJid: altJid ? normalizeJid(altJid) : undefined,
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

export function unrestrictUser(groupId: string, senderJid: string, extraJids: string[] = []): boolean {
  if (!db.restrictedUsers) return false;

  const found = findRestrictionEntry(groupId, senderJid, extraJids);
  if (found) {
    const { key, restriction } = found;
    delete db.restrictedUsers[key];
    saveDatabase();

    addActivityLog({
      groupId,
      groupName: restriction.groupName || 'WhatsApp Group',
      senderJid: restriction.senderJid,
      senderPhone: restriction.senderPhone,
      action: 'unmuted',
      reason: 'সাময়িক মেসেজ ব্লক তুলে নেওয়া হয়েছে (Manual Unblock)',
    });

    if (globalSocketGetter) {
      const sock = globalSocketGetter();
      if (sock && sock.authState?.creds?.registered) {
        safeSendMessage(sock, groupId, {
          text: `✅ *মেসেজ ব্লক প্রত্যাহার*\n\n👤 @${restriction.senderPhone}\nএখন থেকে আপনি আবার স্বাভাবিকভাবে গ্রুপে মেসেজ পাঠাতে পারবেন।`,
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
  'খানকি', 'খানকির', 'খানকিরপোলা', 'খাঁনকি', 'মাগি', 'মাগির', 'মাগী', 'মাগীর', 'বেশ্যা', 'বেশ্যার',
  'রান্ডি', 'রান্ডির', 'চুদা', 'চুদানি', 'চুদানির', 'চুদ', 'চুদি', 'চুদির', 'চোদ', 'চোদা', 'চুদাই',
  'চোদনা', 'চুদনা', 'চোদানি', 'চোদানির', 'বোকাচোদা', 'বোকচোদা', 'বোকাচুদা', 'মাদারচোদ', 'মাদারচুদা', 'মাদারচুদ',
  'বাইনচোদ', 'বাইনচুদা', 'বাইনচুদ', 'ভোনচোদ', 'কুত্তা', 'কুত্তার', 'কুত্তির', 'শুয়োর', 'শুয়োরের',
  'শুয়োর', 'শুয়োরের', 'হারামি', 'হারামী', 'হারামজাদা', 'হারামখোর', 'ভোদা', 'ভোদাই',
  'ধোন', 'ধন', 'লুচ্চা', 'লুচ্চামি', 'গুয়া', 'গুয়ার', 'গুদে', 'গুদ', 'বাল', 'বালের', 'বালছাল',
  'সালা', 'শালা', 'শালার', 'সালার', 'চুতিয়া', 'চুতিয়া', 'নটি', 'নটির', 'জারজ', 'পুটকি', 'ফকিন্নি',
  'বেয়াদব', 'বেয়াদব', 'লেংটা', 'ল্যাংটা', 'চুদুরবুদুর',
  'কুত্তার বাচ্চা', 'শুয়োরের বাচ্চা', 'শুয়োরের বাচ্চা', 'মাগির পোলা', 'খানকির পোলা', 'তোর মারে', 'তোর মাকে'
].map((w) => w.normalize('NFC'));

// Sylheti local slang
const SYLHETI_BADWORDS = [
  'ফুয়া', 'রান্দি', 'খাউয়াস', 'আওলাইন্না', 'মুতার', 'নাঙ্গট'
].map((w) => w.normalize('NFC'));

// Banglish (slang transliterated into English letters)
const BANGLISH_BADWORDS = [
  'khanki', 'khankir', 'magi', 'magir', 'besha', 'beshar', 'beshya',
  'randi', 'randir', 'raandi', 'choda', 'chudani', 'chuda', 'chudanir', 'chodna', 'chudna', 'chudi', 'chudai',
  'bokachoda', 'bokachuda', 'madarchod', 'madarchuda', 'madarchud', 'bainchod', 'baimchod', 'bhenchod', 'behnchod',
  'harami', 'haramzada', 'kuttar baccha', 'shuorer baccha', 'magir pola', 'khankir pola', 'bhoda', 'bhodai',
  'dhon', 'guya', 'gud', 'putki', 'bal', 'baler', 'chutia', 'chutiya', 'chod', 'sala', 'shala', 'shalar',
  'fokinni', 'beyadob', 'mc', 'bc', 'bsdk'
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

// Strict detector for Islamic Salam greetings (for Zero-API Auto Salam Reply)
export function isSalamMessage(text: string): boolean {
  if (!text) return false;
  const clean = text.normalize('NFC').trim().toLowerCase();
  if (clean.length > 140) return false;
  const salamPattern =
    /(?:^|[\s,!?.])(?:আস+া?লামু\s*আলাইকুম|আসসালামুআলাইকুম|আসলামু\s*আলাইকুম|স্লামালাইকুম|সালামু\s*আলাইকুম|শুধু\s*সালাম|সালাম\s*(?:সবাইকে|ভাই|বোন|আপুরা|বন্ধুরা|গ্রুপ)?|ass?alamu\s*a?laikum|ass?alamualaykum|as[-\s]?salamu\s*alaykum|salam\s*a?laikum|walikum\s*assalam|salam\b|slm\b|السلام\s*عليكم)(?:$|[\s,!?.]|(?:সবাই|কেমন|ভাই|আপু|বন্ধু))/iu;
  return salamPattern.test(clean);
}

// Regex to check if the message is a greeting (Salam, How are you, etc.)
export function isRespectfulSalamOrGreeting(text: string): boolean {
  if (!text) return false;
  if (isSalamMessage(text)) return true;
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

export function isAllowedCarromUrl(rawToken: string): boolean {
  if (!rawToken) return false;
  try {
    const trimmed = rawToken.trim().replace(/[),.!?;:]+$/g, '');
    const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'carrom.co' || host.endsWith('.carrom.co');
  } catch {
    return false;
  }
}

export function checkLinkViolation(
  text: string,
  options?: { allowCarromLinks?: boolean }
): { isLink: boolean; matchedLink?: string } {
  if (!text) return { isLink: false };
  const allowCarrom = options?.allowCarromLinks !== false;
  const globalRx = new RegExp(LINK_REGEX.source, 'gi');
  for (const match of text.matchAll(globalRx)) {
    const token = match[0];
    if (!token) continue;
    if (allowCarrom && isAllowedCarromUrl(token)) {
      continue;
    }
    return { isLink: true, matchedLink: token };
  }
  return { isLink: false };
}

// -------------------------------------------------------------
// MESSAGE UNPACKER
// -------------------------------------------------------------
export function extractRealMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  if (!message) return null;
  let current: any = message;
  for (let depth = 0; depth < 8; depth++) {
    const wrapped =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.deviceSentMessage?.message ||
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

// Bulletproof View-Once detector (handles ephemeral-wrapped ViewOnce, V2/V2Extension, Photo, Video, Voice Note Audio, PTV)
export function isViewOnceMessage(rawMsg: proto.IWebMessageInfo, realMsg: proto.IMessage | null | undefined): boolean {
  let cursor: any = rawMsg?.message;
  for (let depth = 0; depth < 8 && cursor; depth++) {
    if (
      cursor.viewOnceMessage ||
      cursor.viewOnceMessageV2 ||
      cursor.viewOnceMessageV2Extension ||
      cursor.imageMessage?.viewOnce ||
      cursor.videoMessage?.viewOnce ||
      cursor.audioMessage?.viewOnce ||
      cursor.ptvMessage?.viewOnce ||
      cursor.documentMessage?.viewOnce ||
      cursor.extendedTextMessage?.viewOnce ||
      cursor.viewOnce === true
    ) {
      return true;
    }
    cursor =
      cursor.ephemeralMessage?.message ||
      cursor.viewOnceMessage?.message ||
      cursor.viewOnceMessageV2?.message ||
      cursor.viewOnceMessageV2Extension?.message ||
      cursor.documentWithCaptionMessage?.message ||
      cursor.deviceSentMessage?.message ||
      cursor.editedMessage?.message ||
      cursor.associatedChildMessage?.message ||
      cursor.groupMentionedMessage?.message ||
      cursor.botInvokeMessage?.message ||
      cursor.botForwardedMessage?.message ||
      cursor.groupStatusMessage?.message ||
      cursor.groupStatusMessageV2?.message ||
      null;
  }

  const r: any = realMsg;
  if (
    r?.imageMessage?.viewOnce ||
    r?.videoMessage?.viewOnce ||
    r?.audioMessage?.viewOnce ||
    r?.ptvMessage?.viewOnce ||
    r?.documentMessage?.viewOnce ||
    r?.extendedTextMessage?.viewOnce ||
    r?.viewOnce === true
  ) {
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

const typingWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function safeSendMessage(
  sock: WASocket,
  jid: string,
  content: any,
  options?: any
): Promise<boolean> {
  const settings = getSettings();
  const shouldShowTyping =
    settings.botTypingEnabled !== false &&
    !content?.delete &&
    !options?.skipTyping &&
    Boolean(sock?.user) &&
    Boolean((sock as any)?.ws?.isOpen ?? true);

  try {
    if (shouldShowTyping) {
      try {
        await sock.sendPresenceUpdate('composing', jid);
        const textSample = String(content?.text || content?.caption || '');
        const typingDelayMs = Math.min(1250, Math.max(450, Math.round(textSample.length * 10)));
        await typingWait(typingDelayMs);
      } catch {
        // Presence update failure must never block actual message delivery
      }
    }

    await sock.sendMessage(jid, content, options);

    if (shouldShowTyping) {
      sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    return true;
  } catch (err: any) {
    if (shouldShowTyping) {
      sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    const msg = err?.message || String(err);
    const statusCode = Number(err?.output?.statusCode || err?.status || 0);
    if (msg.includes('Connection Closed') || msg.includes('Closed') || msg.includes('not connected')) {
      console.warn(`[Baileys Socket Warn] Cannot send message to ${jid} because connection was closed/reconnecting.`);
    } else {
      console.error(`[Baileys Socket Error] Failed to send message to ${jid}:`, msg);
      if (statusCode === 429 || statusCode >= 500) {
        reportServerProblem(
          {
            category: `wa_send_${statusCode}`,
            title: statusCode === 429 ? 'WhatsApp রেট-লিমিট সতর্কতা (429)' : `WhatsApp সার্ভার এরর (${statusCode})`,
            details: msg,
            suggestion: 'বট স্বয়ংক্রিয়ভাবে গতি নিয়ন্ত্রণ করছে। কিছুক্ষণ পর স্বাভাবিক হয়ে যাবে।',
          },
          sock
        );
      }
    }
    return false;
  }
}

// -------------------------------------------------------------
// BOSS ADMIN INBOX (ONLY SINGLE OWNER NUMBER), FIGHT TRACKER & ZERO-API SERVER ALERT
// -------------------------------------------------------------
export function resolveBossAdminJid(): string {
  const settings = getSettings();
  let digits = normalizePhoneDigits(settings.bossAdminNumber || DEFAULT_SETTINGS.bossAdminNumber || '8801632222592');
  if (!digits || digits.length < 10) digits = '8801632222592';
  return `${digits}@s.whatsapp.net`;
}

interface ConflictEvent {
  senderKey: string;
  senderPhone: string;
  senderName: string;
  reason: string;
  timestamp: number;
}

export const DEFAULT_ADMIN_MENTION_REPLY =
  '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।';

const groupConflictWindow = new Map<string, ConflictEvent[]>();
const lastBossFightAlertAt = new Map<string, number>();
const lastAutoSalamAt = new Map<string, number>();
const lastAdminMentionReplyAt = new Map<string, number>();
const lastServerProblemAlertAt = new Map<string, number>();

function collectMentionedJidsFromMessage(realMsg: any, rawMsg?: any): string[] {
  const collected: string[] = [];
  const pushJids = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string' && item.trim() && !collected.includes(item.trim())) {
        collected.push(item.trim());
      }
    }
  };

  const inspectContainer = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    pushJids(obj?.contextInfo?.mentionedJid);
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        pushJids((val as any)?.contextInfo?.mentionedJid);
      }
    }
  };

  inspectContainer(realMsg);
  if (rawMsg?.message && rawMsg.message !== realMsg) {
    let cursor: any = rawMsg.message;
    for (let depth = 0; depth < 6 && cursor && typeof cursor === 'object'; depth++) {
      inspectContainer(cursor);
      cursor =
        cursor?.ephemeralMessage?.message ||
        cursor?.groupMentionedMessage?.message ||
        cursor?.associatedChildMessage?.message ||
        cursor?.documentWithCaptionMessage?.message ||
        cursor?.editedMessage?.message ||
        null;
    }
  }

  return collected;
}

export async function findMentionedAdminInMessage(
  sock: WASocket,
  groupId: string,
  realMsg: any,
  messageText: string,
  senderJid: string,
  senderAltJid: string | undefined,
  targetMode: 'all_admins' | 'boss_only',
  bossPhoneDigits: string,
  rawMsg?: any
): Promise<{ adminJid: string; adminTag: string; isBoss: boolean } | null> {
  const rawMentions: string[] = collectMentionedJidsFromMessage(realMsg, rawMsg);
  const ctxMentionSet = new Set(rawMentions.map((j) => normalizeJid(j)));

  // Also detect inline numeric mentions like @+8801632222592, @\u2068+8801632222592, @01632222592, @+880 1632-222592
  if (messageText) {
    const cleanedText = messageText.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
    const inlineMatches = cleanedText.matchAll(/@\s*(\+?[\d][\d\s-]{8,17}\d)/g);
    for (const match of inlineMatches) {
      const normalizedDigits = normalizePhoneDigits(match[1]);
      if (normalizedDigits.length >= 10) {
        const candJid = `${normalizedDigits}@s.whatsapp.net`;
        if (!rawMentions.some((m) => normalizeJid(m) === candJid)) {
          rawMentions.push(candJid);
        }
      }
    }
  }
  if (rawMentions.length === 0) return null;

  rememberLidPnPair(sock?.user?.id, sock?.user?.lid);
  rememberLidPnPair(sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid);

  const botRawIds = [
    sock?.user?.id,
    sock?.user?.lid,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid,
  ].filter(Boolean) as string[];
  const botUsers = new Set(botRawIds.map((j) => cleanJidUser(j)).filter(Boolean));
  for (const b of Array.from(botUsers)) {
    const pn = lidToPnUserMap.get(b);
    const lid = pnToLidUserMap.get(b);
    if (pn) botUsers.add(pn);
    if (lid) botUsers.add(lid);
  }

  const senderUsers = new Set(
    [cleanJidUser(senderJid), cleanJidUser(senderAltJid), normalizePhoneDigits(cleanJidUser(senderAltJid || senderJid))].filter(Boolean)
  );
  for (const s of Array.from(senderUsers)) {
    const pn = lidToPnUserMap.get(s);
    const lid = pnToLidUserMap.get(s);
    if (pn) senderUsers.add(pn);
    if (lid) senderUsers.add(lid);
  }

  const cleanBossDigits = normalizePhoneDigits(bossPhoneDigits);
  const bossPnJid = cleanBossDigits ? `${cleanBossDigits}@s.whatsapp.net` : '';
  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;

  let bossLidUser = cleanBossDigits ? pnToLidUserMap.get(cleanBossDigits) || '' : '';
  if (!bossLidUser && bossPnJid && typeof lidMappingApi?.getLIDForPN === 'function') {
    try {
      const lookedUpLid = await lidMappingApi.getLIDForPN(bossPnJid);
      if (lookedUpLid) {
        rememberLidPnPair(lookedUpLid, bossPnJid);
        bossLidUser = cleanJidUser(lookedUpLid);
      }
    } catch {}
  }

  let meta = await getGroupMeta(sock, groupId, false).catch(() => null);
  learnGroupParticipantsLidPn(meta);
  let participants: any[] = Array.isArray(meta?.participants) ? meta.participants : [];
  let didForceRefreshMeta = false;

  let firstAdminHit: { adminJid: string; adminTag: string; isBoss: boolean } | null = null;

  for (const mentionedJid of rawMentions) {
    const mentionedUser = cleanJidUser(mentionedJid);
    if (!mentionedUser) continue;

    const resolvedUsers = new Set<string>([mentionedUser]);
    const mentionedNormDigits = !isLidJid(mentionedJid) ? normalizePhoneDigits(mentionedUser) : '';
    if (mentionedNormDigits) resolvedUsers.add(mentionedNormDigits);

    // Resolve via cached map & Baileys lidMapping if mentionedJid is @lid
    const mappedPn = lidToPnUserMap.get(mentionedUser);
    if (mappedPn) resolvedUsers.add(mappedPn);
    const mappedLid = pnToLidUserMap.get(mentionedUser) || (mentionedNormDigits ? pnToLidUserMap.get(mentionedNormDigits) : '');
    if (mappedLid) resolvedUsers.add(mappedLid);

    if (isLidJid(mentionedJid) && !mappedPn && typeof lidMappingApi?.getPNForLID === 'function') {
      try {
        const lookedUpPn = await lidMappingApi.getPNForLID(mentionedJid);
        if (lookedUpPn) {
          rememberLidPnPair(mentionedJid, lookedUpPn);
          const pnUser = normalizePhoneDigits(cleanJidUser(lookedUpPn)) || cleanJidUser(lookedUpPn);
          if (pnUser) resolvedUsers.add(pnUser);
        }
      } catch {}
    }

    const findParticipant = (list: any[]) =>
      list.find((p: any) => {
        const pJids = [p.id, p.lid, p.phoneNumber].filter(Boolean) as string[];
        return pJids.some((j) => {
          const cu = cleanJidUser(j);
          const nu = !isLidJid(j) ? normalizePhoneDigits(cu) : '';
          return resolvedUsers.has(cu) || (nu && resolvedUsers.has(nu));
        });
      });

    let matchedParticipant = findParticipant(participants);
    // If @lid mention wasn't resolved to a phone number or participant wasn't found in stale cache, force refresh metadata once
    if (
      (!matchedParticipant || (isLidJid(mentionedJid) && !matchedParticipant.phoneNumber && !lidToPnUserMap.has(mentionedUser))) &&
      !didForceRefreshMeta
    ) {
      didForceRefreshMeta = true;
      const freshMeta = await getGroupMeta(sock, groupId, true).catch(() => null);
      if (freshMeta) {
        meta = freshMeta;
        learnGroupParticipantsLidPn(freshMeta);
        participants = Array.isArray(freshMeta.participants) ? freshMeta.participants : participants;
        matchedParticipant = findParticipant(participants);
      }
    }

    if (matchedParticipant) {
      const pJids = [matchedParticipant.id, matchedParticipant.lid, matchedParticipant.phoneNumber].filter(Boolean) as string[];
      for (const j of pJids) {
        const cu = cleanJidUser(j);
        if (cu) resolvedUsers.add(cu);
        if (!isLidJid(j)) {
          const nu = normalizePhoneDigits(cu);
          if (nu) resolvedUsers.add(nu);
        }
      }
      if (!bossLidUser && cleanBossDigits && resolvedUsers.has(cleanBossDigits)) {
        const lidPart = pJids.find((j) => isLidJid(j));
        if (lidPart) bossLidUser = cleanJidUser(lidPart);
      }
    }

    const isSenderSelf = Array.from(resolvedUsers).some((u) => senderUsers.has(u));
    if (isSenderSelf) continue;

    const isBoss = Boolean(
      (cleanBossDigits && resolvedUsers.has(cleanBossDigits)) ||
      (bossLidUser && resolvedUsers.has(bossLidUser))
    );

    const isBotSelf = Array.from(resolvedUsers).some((u) => botUsers.has(u));
    // Never trigger on mentioning a non-boss bot account (e.g. standalone Maya AI bot),
    // but DO allow Boss Admin Mention Reply even if the bot session uses Boss's own WhatsApp number!
    if (isBotSelf && !isBoss) continue;

    const isGroupAdmin = Boolean(
      matchedParticipant &&
      (matchedParticipant.admin === 'admin' ||
        matchedParticipant.admin === 'superadmin' ||
        Boolean(matchedParticipant.isAdmin) ||
        Boolean(matchedParticipant.isSuperAdmin))
    );

    const matched = targetMode === 'boss_only' ? isBoss : isBoss || isGroupAdmin;
    if (!matched) continue;

    // Prefer the exact tagged JID if it came from WhatsApp contextInfo; otherwise prefer group participant ID or normalized JID
    const cameFromCtx = ctxMentionSet.has(normalizeJid(mentionedJid));
    const replyMentionJid = cameFromCtx
      ? normalizeJid(mentionedJid)
      : matchedParticipant?.id
        ? normalizeJid(matchedParticipant.id)
        : isBoss && bossLidUser && (meta as any)?.addressingMode === 'lid'
          ? `${bossLidUser}@lid`
          : normalizeJid(mentionedJid);

    const hit = {
      adminJid: replyMentionJid,
      adminTag: cleanJidUser(replyMentionJid) || mentionedUser,
      isBoss,
    };

    if (isBoss) {
      return hit; // Prioritize Boss Admin match immediately
    }
    if (!firstAdminHit) {
      firstAdminHit = hit;
    }
  }

  return firstAdminHit;
}

interface QueuedServerProblem {
  category: string;
  title: string;
  details: string;
  suggestion?: string;
  timestamp: number;
}
const pendingServerProblems: QueuedServerProblem[] = [];

const FIGHT_QUARREL_PATTERNS: RegExp[] = [
  /(?:তোরে|তোর|তুই)\s*(?:দেখে নিব|দেখব|মারব|খাব|চুদ|ফাট|মেরে ফেলব|জবাই|পাছায়|বের হ)/iu,
  /(?:ঝগড়া|গালাগালি|গালি দিচ্ছিস|চুপ কর|মুখ সামলে|বেয়াদব|ফাজিল|হারামি|শয়তান|কামড়াবি|মাইর খাবি|ফাইজলামি)/iu,
  /\b(?:shut up|f\*+k|bastard|idiot|stupid|fight me|motherfucker|bitch)\b/iu,
];

function hasHeatedFightSignal(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  if (isRespectfulSalamOrGreeting(text)) return false;
  return FIGHT_QUARREL_PATTERNS.some((rx) => rx.test(text));
}

async function trackGroupConflictAndNotifyBoss(
  sock: WASocket,
  params: {
    groupId: string;
    groupName: string;
    senderKey: string;
    senderPhone: string;
    senderName: string;
    reason: string;
  }
): Promise<boolean> {
  const settings = getSettings();
  if (settings.bossFightAlertEnabled === false) return false;

  const now = Date.now();
  const windowMinutes = Math.max(1, Math.min(30, Number(settings.bossFightWindowMinutes ?? 5)));
  const minPeople = Math.max(2, Math.min(10, Number(settings.bossFightMinPeople ?? 3)));
  const windowMs = windowMinutes * 60 * 1000;

  const currentList = (groupConflictWindow.get(params.groupId) || []).filter((e) => now - e.timestamp <= windowMs);
  currentList.push({
    senderKey: params.senderKey,
    senderPhone: params.senderPhone,
    senderName: params.senderName,
    reason: params.reason,
    timestamp: now,
  });
  groupConflictWindow.set(params.groupId, currentList);

  const distinctParticipants = new Map<string, string>();
  for (const item of currentList) {
    const label = item.senderName && item.senderName !== 'User'
      ? `${item.senderName} (+${item.senderPhone})`
      : `+${item.senderPhone}`;
    distinctParticipants.set(item.senderKey, label);
  }

  if (distinctParticipants.size < minPeople) {
    return false;
  }

  const lastAlert = lastBossFightAlertAt.get(params.groupId) || 0;
  if (now - lastAlert < 10 * 60 * 1000) {
    return false; // 10-minute per-group alert cooldown
  }

  const bossJid = resolveBossAdminJid();
  if (!sock?.user || !sock?.authState?.creds?.registered) {
    return false;
  }

  lastBossFightAlertAt.set(params.groupId, now);
  const participantListText = Array.from(distinctParticipants.values()).slice(0, 8).join(', ');
  const timeStr = new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const bossMessage =
    `বস, জরুরি সমস্যা! 😟\n\n` +
    `*"${params.groupName}"* গ্রুপে এখন *${distinctParticipants.size} জন* সদস্য মিলে গালিগালাজ বা ঝগড়া করছে!\n\n` +
    `👥 জড়িত সদস্য: ${participantListText}\n` +
    `📊 সাম্প্রতিক ঘটনা: ${currentList.length}টি আপত্তিকর/ঝগড়াপূর্ণ মেসেজ (গত ${windowMinutes} মিনিটে)\n` +
    `🕒 সময়: ${timeStr}\n\n` +
    `বস, দয়া করে একটু গ্রুপটা দেখুন বা প্রয়োজনীয় ব্যবস্থা নিন। আমি স্বয়ংক্রিয়ভাবে মেসেজগুলো নজরদারিতে রেখেছি। 🛡️`;

  const sent = await safeSendMessage(sock, bossJid, { text: bossMessage });
  if (sent) {
    addActivityLog({
      groupId: params.groupId,
      groupName: params.groupName,
      senderJid: bossJid,
      senderPhone: cleanJidUser(bossJid),
      action: 'warned',
      reason: `বস অ্যাডমিনকে গ্রুপ ঝগড়া/গালি অ্যালার্ট পাঠানো হয়েছে (${distinctParticipants.size} জন)`,
      details: participantListText,
    });
  }
  return sent;
}

function buildServerNoticeText(problem: QueuedServerProblem): string {
  const timeStr = new Date(problem.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    `⚠️ *[WAGuard সার্ভার ও সিস্টেম নোটিশ]*\n\n` +
    `বস, সার্ভারে একটি সমস্যা শনাক্ত হয়েছে:\n` +
    `📌 ধরন: ${problem.title}\n` +
    `📝 বিবরণ: ${problem.details}\n` +
    `🕒 সময়: ${timeStr}` +
    (problem.suggestion ? `\n\n💡 পরামর্শ: ${problem.suggestion}` : '')
  );
}

async function deliverServerNotice(sock: WASocket, problem: QueuedServerProblem): Promise<boolean> {
  const settings = getSettings();
  if (settings.serverErrorNoticeEnabled === false) return false;
  if (!sock?.user || !sock?.authState?.creds?.registered) return false;
  const ws = (sock as any).ws;
  if (ws && typeof ws.isOpen === 'boolean' && !ws.isOpen) return false;

  const targetMode = settings.serverErrorNoticeTarget || 'boss_inbox';
  const text = buildServerNoticeText(problem);
  let deliveredAny = false;

  if (targetMode === 'boss_inbox' || targetMode === 'both') {
    const bossJid = resolveBossAdminJid();
    const ok = await safeSendMessage(sock, bossJid, { text });
    if (ok) deliveredAny = true;
  }

  if (targetMode === 'groups' || targetMode === 'both') {
    const groupIds = Object.keys(groupMetaCache).slice(0, 5);
    for (const gid of groupIds) {
      const ok = await safeSendMessage(sock, gid, { text });
      if (ok) deliveredAny = true;
    }
  }

  if (deliveredAny) {
    addActivityLog({
      groupId: 'SYSTEM',
      groupName: 'Server Health Monitor',
      senderJid: resolveBossAdminJid(),
      senderPhone: cleanJidUser(resolveBossAdminJid()),
      action: 'error',
      reason: `সার্ভার সমস্যা নোটিশ পাঠানো হয়েছে: ${problem.title}`,
      details: problem.details,
    });
  }
  return deliveredAny;
}

export async function reportServerProblem(
  params: { category: string; title: string; details: string; suggestion?: string; urgent?: boolean },
  sock?: WASocket | null
): Promise<boolean> {
  const settings = getSettings();
  if (settings.serverErrorNoticeEnabled === false) return false;

  const now = Date.now();
  const lastAt = lastServerProblemAlertAt.get(params.category) || 0;
  const cooldownMs = params.urgent ? 2 * 60 * 1000 : 8 * 60 * 1000;
  if (now - lastAt < cooldownMs) {
    return false;
  }
  lastServerProblemAlertAt.set(params.category, now);

  const item: QueuedServerProblem = {
    category: params.category,
    title: params.title,
    details: params.details,
    suggestion: params.suggestion,
    timestamp: now,
  };

  if (sock) {
    const sent = await deliverServerNotice(sock, item);
    if (sent) return true;
  }

  if (!pendingServerProblems.some((p) => p.category === item.category)) {
    pendingServerProblems.push(item);
    if (pendingServerProblems.length > 12) pendingServerProblems.shift();
  }
  return false;
}

export async function flushPendingServerNotices(sock: WASocket | null) {
  if (!sock || pendingServerProblems.length === 0) return;
  while (pendingServerProblems.length > 0) {
    const next = pendingServerProblems[0];
    const ok = await deliverServerNotice(sock, next);
    if (!ok) break;
    pendingServerProblems.shift();
  }
}

let serverHealthTimer: ReturnType<typeof setInterval> | null = null;
export function startServerHealthMonitor(getSock: () => WASocket | null) {
  if (serverHealthTimer) clearInterval(serverHealthTimer);
  serverHealthTimer = setInterval(async () => {
    const sock = getSock();
    if (sock) {
      await flushPendingServerNotices(sock);
    }
    try {
      const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      if (memMb > 460) {
        await reportServerProblem(
          {
            category: 'high_memory',
            title: 'সার্ভার মেমোরি (RAM) বেশি ব্যবহৃত হচ্ছে',
            details: `বর্তমান RAM ব্যবহার: ${memMb} MB। এতে বট স্লো বা রিস্টার্ট হতে পারে।`,
            suggestion: 'সার্ভার রিস্টার্ট অথবা অপ্রয়োজনীয় লগ ক্লিয়ার করুন।',
          },
          sock
        );
      }
    } catch {}
  }, 45000);
}

export async function sendTestBossAndServerNotice(sock: WASocket | null): Promise<{ bossSent: boolean; targetJid: string }> {
  const targetJid = resolveBossAdminJid();
  if (!sock || !sock.user || !sock.authState?.creds?.registered) {
    return { bossSent: false, targetJid };
  }
  const ok = await safeSendMessage(sock, targetJid, {
    text:
      `বস, আমি WAGuard বট! ✅\n\n` +
      `আপনার পার্সোনাল বস অ্যালার্ট, টাইপিং ইন্ডিকেটর এবং সার্ভার হেলথ নোটিশ সিস্টেম একদম সক্রিয় আছে।\n` +
      `কোনো গ্রুপে ৩+ জন গালি/ঝগড়া করলে বা সার্ভারে কোনো সমস্যা হলেই আমি সাথে সাথে আপনাকে এখানে নক দেবো! 🛡️`,
  });
  return { bossSent: ok, targetJid };
}

// -------------------------------------------------------------
// GROUP ADMIN VERIFICATION
// -------------------------------------------------------------
export async function getGroupMeta(sock: WASocket, groupId: string, forceRefresh = false) {
  const cached = groupMetaCache[groupId];
  const now = Date.now();
  // Fast path: serve fresh cache within 5 minutes (0ms latency for instant sticker/profanity removal)
  if (!forceRefresh && cached && now - cached.fetchedAt < 300000) {
    learnGroupParticipantsLidPn(cached.meta);
    return cached.meta;
  }
  // Stale-while-revalidate: if older cache exists, return immediately & refresh silently in background
  if (!forceRefresh && cached) {
    learnGroupParticipantsLidPn(cached.meta);
    sock.groupMetadata(groupId)
      .then((freshMeta) => {
        groupMetaCache[groupId] = { meta: freshMeta, fetchedAt: Date.now() };
        learnGroupParticipantsLidPn(freshMeta);
      })
      .catch(() => {});
    return cached.meta;
  }
  try {
    const meta = await sock.groupMetadata(groupId);
    groupMetaCache[groupId] = { meta, fetchedAt: now };
    learnGroupParticipantsLidPn(meta);
    return meta;
  } catch (err: any) {
    console.error(`Failed to fetch metadata for group ${groupId}:`, err.message);
    return cached ? cached.meta : null;
  }
}

export function primeGroupMetaCache(groupsMap: Record<string, any>) {
  if (!groupsMap || typeof groupsMap !== 'object') return;
  const now = Date.now();
  for (const [groupId, meta] of Object.entries(groupsMap)) {
    if (groupId && meta) {
      groupMetaCache[groupId] = { meta, fetchedAt: now };
      learnGroupParticipantsLidPn(meta);
    }
  }
}

export function getCachedGroupMetadataSync(groupId: string): any | undefined {
  return groupMetaCache[groupId]?.meta;
}

export function incrementMessagesChecked(count: number = 1) {
  db.stats.messagesChecked += Math.max(0, count);
  saveDatabase();
}

export function incrementVerifiedDeletedStat(isRestrictedInterception = false) {
  db.stats.deletedMessages += 1;
  if (isRestrictedInterception) {
    db.stats.restrictedMessagesBlocked = (db.stats.restrictedMessagesBlocked || 0) + 1;
  }
  saveDatabase();
}

export function recordStickerContactAndActivity(
  groupId: string,
  groupName: string,
  senderJid: string,
  senderAltJid: string | undefined,
  _senderPhone: string,
  pushName?: string | null
) {
  rememberLidPnPair(senderJid, senderAltJid);
  if (pushName) {
    const cu1 = cleanJidUser(senderJid);
    const cu2 = cleanJidUser(senderAltJid);
    if (cu1) contactNamesCache[cu1] = pushName;
    if (cu2) contactNamesCache[cu2] = pushName;
  }
  // Clean-Behavior Leaderboard works automatically: stickers never add leaderboard points
}

export function getGroupAdminJidsFromCachedMeta(groupId: string): string[] {
  const meta = groupMetaCache[groupId]?.meta;
  if (!meta?.participants) return [];
  const admins: string[] = [];
  for (const p of meta.participants) {
    const pAny = p as any;
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);
    if (isAdmin && p.id) {
      admins.push(normalizeJid(p.id));
    }
  }
  return admins;
}

export async function handleGroupParticipantsUpdate(
  sock: WASocket,
  update: { id: string; participants: any[]; action: string }
) {
  try {
    const groupId = update?.id;
    if (!groupId || !groupId.endsWith('@g.us')) return;

    // Always invalidate cache when members or admin roles change so moderation stays accurate
    delete groupMetaCache[groupId];

    if (update.action !== 'add' || !Array.isArray(update.participants) || update.participants.length === 0) {
      return;
    }

    const settings = getSettings();
    if (!settings.autoWelcome) {
      return;
    }

    const meta = await getGroupMeta(sock, groupId, true);
    const groupSubject = meta?.subject || 'আমাদের গ্রুপ';
    const memberCount = meta?.participants?.length || 0;

    // Build bot identity set so we don't welcome the bot itself
    const botUsers = new Set<string>();
    for (const b of [
      sock.user?.id,
      sock.user?.lid,
      sock.authState?.creds?.me?.id,
      sock.authState?.creds?.me?.lid,
    ]) {
      const cu = cleanJidUser(b);
      if (cu) botUsers.add(cu);
    }

    const mentions: string[] = [];
    const mentionLabels: string[] = [];

    for (const rawParticipant of update.participants) {
      const rawJid =
        typeof rawParticipant === 'string'
          ? rawParticipant
          : rawParticipant?.id || rawParticipant?.jid || rawParticipant?.lid || '';
      if (!rawJid) continue;

      const normalized = normalizeJid(rawJid);
      const participantUser = cleanJidUser(normalized);
      if (botUsers.has(participantUser)) continue;

      // Resolve phone number from participant object or group metadata if @lid
      let displayNum = participantUser;
      const metaMatch = meta?.participants?.find(
        (p: any) =>
          cleanJidUser(p.id) === participantUser ||
          cleanJidUser(p.lid) === participantUser ||
          cleanJidUser(p.phoneNumber) === participantUser
      );
      if (typeof rawParticipant === 'object' && rawParticipant?.phoneNumber) {
        displayNum = cleanJidUser(rawParticipant.phoneNumber) || displayNum;
      } else if (metaMatch?.phoneNumber) {
        displayNum = cleanJidUser(metaMatch.phoneNumber) || displayNum;
      }

      if (!mentions.includes(normalized)) {
        mentions.push(normalized);
        mentionLabels.push(`@${displayNum}`);
      }
    }

    if (mentions.length === 0) return;

    const userTagString = mentionLabels.join(', ');
    const customTemplate = (settings.welcomeMessage || '').trim();
    const welcomeText = customTemplate
      ? customTemplate.replace(/\{user\}/gi, userTagString).replace(/\{group\}/gi, groupSubject)
      : `🌸 *আসসালামু আলাইকুম ও স্বাগতম!* 🌸\n\nহ্যালো ${userTagString},\n✨ *${groupSubject}* গ্রুপে আপনাকে আন্তরিক স্বাগতম!\n\n🛡️ অনুগ্রহ করে গ্রুপের নিয়মকানুন মেনে চলুন এবং সবার সাথে ভদ্র ও সুন্দর ব্যবহার করুন।${
          memberCount > 0 ? `\n👥 বর্তমান সদস্য সংখ্যা: ${memberCount} জন` : ''
        }`;

    const sent = await safeSendMessage(sock, groupId, {
      text: welcomeText,
      mentions,
    });

    if (sent) {
      addActivityLog({
        groupId,
        groupName: groupSubject,
        senderJid: mentions[0],
        senderPhone: mentionLabels[0].replace(/^@/, ''),
        action: 'replied',
        reason: 'নতুন সদস্যকে অটো ওয়েলকাম জানানো হয়েছে (Auto Welcome)',
        details: `${userTagString} গ্রুপে যুক্ত হয়েছেন`,
      });
    }
  } catch (err: any) {
    console.error('[Auto Welcome Error]:', err?.message || err);
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
 * Strict Permission Check: Never falsely returns true when bot lacks Admin delete permissions.
 */
async function deleteMessageSafely(
  sock: WASocket,
  remoteJid: string,
  msg: proto.IWebMessageInfo,
  matchedSenderId?: string,
  isBotAdmin?: boolean
): Promise<boolean> {
  const key = msg.key;
  if (!key?.id) return false;
  if (isBotAdmin === false && !key.fromMe) {
    return false;
  }
  if (!sock || !sock.user || !sock.authState?.creds?.registered) {
    return false;
  }

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

const lastAntiStickerNoticeAt = new Map<string, number>();

/**
 * Applies warning + 3-strike Auto-Kick ONLY after real verified delete succeeded
 */
export async function applyVerifiedAntiStickerViolation(
  sock: WASocket,
  params: {
    groupId: string;
    groupName: string;
    senderJid: string;
    canonicalSender: string;
    senderAltJid?: string;
    senderPhone: string;
  }
) {
  const { groupId, groupName, senderJid, canonicalSender, senderAltJid, senderPhone } = params;
  const settings = getSettings();
  const warningKey = `${groupId}:${canonicalSender}`;
  if (!db.warnings[warningKey]) {
    db.warnings[warningKey] = {
      count: 0,
      lastViolation: Date.now(),
      violations: [],
      groupId,
      groupName,
      senderJid: canonicalSender,
      senderPhone,
    };
  }

  db.warnings[warningKey].groupId = groupId;
  db.warnings[warningKey].groupName = groupName;
  db.warnings[warningKey].senderJid = canonicalSender;
  db.warnings[warningKey].senderPhone = senderPhone;
  db.warnings[warningKey].count++;
  db.warnings[warningKey].lastViolation = Date.now();
  db.warnings[warningKey].violations.push({
    timestamp: Date.now(),
    reason: 'স্টিকার পাঠানো নিষিদ্ধ',
  });
  db.stats.warningsGiven++;
  saveDatabase();

  const warningCount = db.warnings[warningKey].count;
  const now = Date.now();
  const throttleKey = `${groupId}:${canonicalSender}`;
  const lastNotice = lastAntiStickerNoticeAt.get(throttleKey) || 0;
  const canSendNotice = now - lastNotice > 3500;

  if (warningCount === 1 && !settings.silentModeration && canSendNotice) {
    lastAntiStickerNoticeAt.set(throttleKey, now);
    await safeSendMessage(sock, groupId, {
      text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${senderPhone}, গ্রুপে স্টিকার পাঠানো নিষিদ্ধ!\nআপনার স্টিকারটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
      mentions: [senderJid],
    });
  } else if (warningCount === 2 && !settings.silentModeration && canSendNotice) {
    lastAntiStickerNoticeAt.set(throttleKey, now);
    await safeSendMessage(sock, groupId, {
      text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${senderPhone}, এটি আপনার দ্বিতীয় সতর্কতা (স্টিকার পাঠানো নিষিদ্ধ)!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
      mentions: [senderJid],
    });
  } else if (warningCount >= 3 && settings.autoKick3Warnings) {
    const freshPerms = await checkPermissions(sock, groupId, senderJid, true, senderAltJid);
    if (!freshPerms.isSenderAdmin && freshPerms.isBotAdmin) {
      const kickTargets: string[] = [];
      for (const cand of [
        freshPerms.matchedSenderId,
        normalizeJid(senderJid),
        senderAltJid ? normalizeJid(senderAltJid) : '',
      ]) {
        if (cand && !kickTargets.includes(cand)) kickTargets.push(cand);
      }

      if (!settings.silentModeration && canSendNotice) {
        lastAntiStickerNoticeAt.set(throttleKey, now);
        await safeSendMessage(sock, groupId, {
          text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${senderPhone} ৩ বার স্টিকার নিয়ম লঙ্ঘন করেছেন।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
          mentions: [senderJid],
        });
      }

      let kickedOk = false;
      for (const targetJid of kickTargets) {
        try {
          const kickRes: any = await sock.groupParticipantsUpdate(groupId, [targetJid], 'remove');
          const status = Array.isArray(kickRes) ? String(kickRes[0]?.status || '200') : '200';
          if (status === '200' || status === '207') {
            kickedOk = true;
            break;
          }
        } catch {}
      }
      if (kickedOk) {
        db.stats.kickedMembers++;
        delete db.warnings[warningKey];
        saveDatabase();
      }
    }
  }

  const actionMap: Record<number, string> = { 1: '১ম সতর্কতা', 2: '২য় সতর্কতা', 3: '৩য় সতর্কতা' };
  addActivityLog({
    groupId,
    groupName,
    senderJid,
    senderPhone,
    action: warningCount >= 3 && settings.autoKick3Warnings ? 'kicked' : 'warned',
    reason: `Anti-Sticker (${actionMap[warningCount] || 'সতর্কতা'}) [Verified Deleted]`,
    details: 'স্টিকার পাঠানো নিষিদ্ধ (High-Priority Queue দ্বারা ডিলিট)',
    warningCount,
  });
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
// FEATURE 2: SCHEDULED NIGHT MODE (AUTO NIGHT LOCK)
// -------------------------------------------------------------
function getLocalTimeHHMM(timeZone: string = 'Asia/Dhaka'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const h = parts.find((p) => p.type === 'hour')?.value || '00';
    const m = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${h === '24' ? '00' : h}:${m}`;
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function parseTimeToMinutes(hhmm: string): number {
  const match = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return h * 60 + m;
}

export function isWithinNightWindow(nowHHMM: string, startHHMM: string, endHHMM: string): boolean {
  const nowMin = parseTimeToMinutes(nowHHMM);
  const startMin = parseTimeToMinutes(startHHMM || '00:00');
  const endMin = parseTimeToMinutes(endHHMM || '06:00');
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}

export function getNightModeStatus() {
  const settings = getSettings();
  const tz = settings.nightModeTimezone || 'Asia/Dhaka';
  const currentLocalTime = getLocalTimeHHMM(tz);
  const inWindow = isWithinNightWindow(
    currentLocalTime,
    settings.nightLockStart || '00:00',
    settings.nightLockEnd || '06:00'
  );
  const lockedGroups = Object.entries(db.nightLockedGroups || {}).map(([groupId, info]) => ({
    groupId,
    groupName: info.groupName,
    lockedAt: info.lockedAt,
  }));
  return {
    enabled: Boolean(settings.nightModeEnabled),
    start: settings.nightLockStart || '00:00',
    end: settings.nightLockEnd || '06:00',
    timezone: tz,
    notify: settings.nightModeNotify !== false,
    currentLocalTime,
    isNightWindowNow: Boolean(settings.nightModeEnabled && inWindow),
    lockedCount: lockedGroups.length,
    lockedGroups,
  };
}

function isBotGroupAdminFromMeta(sock: WASocket, meta: any): boolean {
  if (!meta?.participants) return false;
  const botIds = [sock.user?.id, sock.user?.lid, sock.authState?.creds?.me?.id, sock.authState?.creds?.me?.lid]
    .filter(Boolean)
    .map((j) => cleanJidUser(String(j)));
  const botSet = new Set(botIds);
  for (const p of meta.participants) {
    const pAny = p as any;
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);
    if (!isAdmin) continue;
    const candidates = [p.id, pAny.lid, pAny.phoneNumber].filter(Boolean).map((j) => cleanJidUser(String(j)));
    if (candidates.some((c) => botSet.has(c))) return true;
  }
  return false;
}

export async function applyNightModeManually(sock: WASocket | null, lock: boolean): Promise<{ affected: number }> {
  if (!sock || !sock.authState?.creds?.registered) {
    return { affected: 0 };
  }
  const settings = getSettings();
  let affected = 0;

  if (lock) {
    const groups = await sock.groupFetchAllParticipating().catch(() => ({} as Record<string, any>));
    primeGroupMetaCache(groups);
    for (const [groupId, meta] of Object.entries(groups)) {
      if (!isBotGroupAdminFromMeta(sock, meta)) continue;
      if (meta?.announce) {
        if (!db.nightLockedGroups[groupId]) {
          db.nightLockedGroups[groupId] = { groupName: meta.subject || 'WhatsApp Group', lockedAt: Date.now() };
        }
        continue;
      }
      try {
        await sock.groupSettingUpdate(groupId, 'announcement');
        db.nightLockedGroups[groupId] = { groupName: meta.subject || 'WhatsApp Group', lockedAt: Date.now() };
        affected++;
        if (settings.nightModeNotify !== false) {
          await safeSendMessage(sock, groupId, {
            text: `🌙 *শুভ রাত্রি — নাইট মোড চালু হয়েছে*\n\nগ্রুপটি সাময়িকভাবে অ্যাডমিনদের জন্য লক করা হয়েছে (${settings.nightLockStart || '00:00'} – ${settings.nightLockEnd || '06:00'})।\n☀️ সকালে নির্ধারিত সময়ে গ্রুপটি আবার সবার জন্য খুলে দেওয়া হবে।`,
          });
        }
        addActivityLog({
          groupId,
          groupName: meta.subject || 'WhatsApp Group',
          senderJid: 'SYSTEM',
          senderPhone: 'NIGHT-MODE',
          action: 'locked',
          reason: 'শিডিউল নাইট মোড: গ্রুপ লক করা হয়েছে',
        });
      } catch (err: any) {
        console.warn(`[Night Mode Lock Failed] ${groupId}:`, err?.message || err);
      }
    }
    saveDatabase();
  } else {
    const entries = Object.entries(db.nightLockedGroups || {});
    for (const [groupId, info] of entries) {
      try {
        await sock.groupSettingUpdate(groupId, 'not_announcement');
        affected++;
        if (settings.nightModeNotify !== false) {
          await safeSendMessage(sock, groupId, {
            text: `☀️ *সুপ্রভাত — নাইট মোড শেষ হয়েছে*\n\nগ্রুপটি আবার সকল সদস্যের জন্য উন্মুক্ত করা হলো। সবার দিনটি শুভ হোক! 🌸`,
          });
        }
        addActivityLog({
          groupId,
          groupName: info.groupName || 'WhatsApp Group',
          senderJid: 'SYSTEM',
          senderPhone: 'NIGHT-MODE',
          action: 'unlocked',
          reason: 'নাইট মোড শেষ: গ্রুপ সবার জন্য আনলক করা হয়েছে',
        });
      } catch (err: any) {
        console.warn(`[Night Mode Unlock Failed] ${groupId}:`, err?.message || err);
      }
      delete db.nightLockedGroups[groupId];
    }
    saveDatabase();
  }
  return { affected };
}

let nightModeBusy = false;
export function startNightModeScheduler(sockGetter: () => WASocket | null) {
  setInterval(async () => {
    if (nightModeBusy) return;
    const sock = sockGetter();
    if (!sock || !sock.authState?.creds?.registered) return;
    const settings = getSettings();
    const tz = settings.nightModeTimezone || 'Asia/Dhaka';
    const nowHHMM = getLocalTimeHHMM(tz);
    const shouldBeLocked =
      Boolean(settings.nightModeEnabled) &&
      isWithinNightWindow(nowHHMM, settings.nightLockStart || '00:00', settings.nightLockEnd || '06:00');

    nightModeBusy = true;
    try {
      if (shouldBeLocked) {
        await applyNightModeManually(sock, true);
      } else if (Object.keys(db.nightLockedGroups || {}).length > 0) {
        await applyNightModeManually(sock, false);
      }
    } catch (err: any) {
      console.warn('[Night Mode Scheduler Error]:', err?.message || err);
    } finally {
      nightModeBusy = false;
    }
  }, 30000);
}

// -------------------------------------------------------------
// FEATURE 3: ANTI-CALL PROTECTION
// -------------------------------------------------------------
export function getCallLogs(limit = 50): CallLogItem[] {
  return (db.callLogs || []).slice(-limit).reverse();
}

export function clearCallLogs(): boolean {
  db.callLogs = [];
  saveDatabase();
  return true;
}

export function resetCallCounts(): boolean {
  db.callCounts = {};
  saveDatabase();
  return true;
}

export async function handleIncomingCall(sock: WASocket, call: any) {
  try {
    if (!call || !call.id || !call.from) return;
    if (call.status !== 'offer') return;

    const settings = getSettings();
    if (!settings.antiCallEnabled) return;

    const callerJid = normalizeJid(call.from);
    const callerPhone = cleanJidUser(callerJid);
    const isVideo = Boolean(call.isVideo);

    try {
      await sock.rejectCall(call.id, call.from);
    } catch (err: any) {
      console.warn(`[Anti-Call] rejectCall failed for ${callerPhone}:`, err?.message || err);
    }

    if (!db.callCounts) db.callCounts = {};
    db.callCounts[callerJid] = (db.callCounts[callerJid] || 0) + 1;
    const count = db.callCounts[callerJid];
    const autoBlockLimit = Number(settings.antiCallAutoBlockCount ?? 3);
    let blocked = false;

    if (autoBlockLimit > 0 && count >= autoBlockLimit) {
      try {
        await sock.updateBlockStatus(call.from, 'block');
        blocked = true;
      } catch (err: any) {
        console.warn(`[Anti-Call] updateBlockStatus failed:`, err?.message || err);
      }
    }

    if (!db.callLogs) db.callLogs = [];
    db.callLogs.push({
      id: 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      callerJid,
      callerPhone,
      isVideo,
      status: blocked ? 'Rejected & Blocked' : 'Auto-Rejected',
      blocked,
    });
    if (db.callLogs.length > 100) db.callLogs = db.callLogs.slice(-100);
    db.stats.callsRejected = (db.stats.callsRejected || 0) + 1;
    saveDatabase();

    const warnText = blocked
      ? `🚫 বারবার কল করার কারণে (@${callerPhone}) অটো-ব্লক করা হয়েছে!`
      : `${settings.antiCallMessage || DEFAULT_SETTINGS.antiCallMessage}${
          autoBlockLimit > 0 ? `\n\n⚠️ সতর্কতা: কল সংখ্যা ${count}/${autoBlockLimit} (${autoBlockLimit} বার হলে অটো-ব্লক হবে)` : ''
        }`;

    await safeSendMessage(sock, callerJid, { text: warnText });

    addActivityLog({
      groupId: 'call',
      groupName: isVideo ? 'Incoming Video Call' : 'Incoming Voice Call',
      senderJid: callerJid,
      senderPhone: callerPhone,
      action: blocked ? 'kicked' : 'deleted',
      reason: blocked ? `অ্যান্টি-কল: বারবার কল করায় ব্লক (${count} বার)` : `অ্যান্টি-কল: ${isVideo ? 'ভিডিও' : 'অডিও'} কল অটো-রিজেক্ট`,
    });
  } catch (err: any) {
    console.error('[Anti-Call Error]:', err?.message || err);
  }
}

// -------------------------------------------------------------
// FEATURE 5: MEMBER ACTIVITY RANK & GHOST/INACTIVE DETECTOR
// -------------------------------------------------------------
function recordMemberActivity(
  groupId: string,
  groupName: string,
  senderJid: string,
  senderPhone: string,
  pushName?: string | null
) {
  const settings = getSettings();
  if (settings.activityTrackingEnabled === false) return;
  if (!db.memberActivity) db.memberActivity = {};

  const cleanSender = normalizeJid(senderJid);
  const key = `${groupId}:${cleanSender}`;
  const now = Date.now();
  const prev = db.memberActivity[key];

  db.memberActivity[key] = {
    groupId,
    groupName: groupName || prev?.groupName || 'WhatsApp Group',
    senderJid: cleanSender,
    senderPhone: senderPhone || prev?.senderPhone || cleanJidUser(cleanSender),
    name: (pushName && pushName.trim()) || prev?.name || senderPhone || 'Member',
    messageCount: (prev?.messageCount || 0) + 1,
    lastSeen: now,
    firstSeen: prev?.firstSeen || now,
  };

  // Prune if table grows huge
  const entries = Object.entries(db.memberActivity);
  if (entries.length > 2000) {
    entries
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, entries.length - 1800)
      .forEach(([k]) => delete db.memberActivity[k]);
  }
  saveDatabase();
}

export function getMemberActivityReport(groupId?: string, ghostDays: number = 7) {
  const all = Object.values(db.memberActivity || {});
  const groupMap = new Map<string, { id: string; name: string; members: number; totalMessages: number }>();

  for (const m of all) {
    const cur = groupMap.get(m.groupId) || { id: m.groupId, name: m.groupName, members: 0, totalMessages: 0 };
    cur.members += 1;
    cur.totalMessages += m.messageCount;
    if (m.groupName && m.groupName !== 'WhatsApp Group') cur.name = m.groupName;
    groupMap.set(m.groupId, cur);
  }

  const filtered = groupId && groupId !== 'all' ? all.filter((m) => m.groupId === groupId) : all;
  const now = Date.now();
  const ghostCutoffMs = Math.max(1, ghostDays) * 24 * 60 * 60 * 1000;

  const topActive = [...filtered]
    .sort((a, b) => b.messageCount - a.messageCount || b.lastSeen - a.lastSeen)
    .slice(0, 30);

  const ghostMembers = [...filtered]
    .filter((m) => now - m.lastSeen >= ghostCutoffMs || m.messageCount <= 2)
    .sort((a, b) => a.lastSeen - b.lastSeen)
    .slice(0, 40)
    .map((m) => ({
      ...m,
      inactiveDays: Math.floor((now - m.lastSeen) / (24 * 60 * 60 * 1000)),
    }));

  return {
    groups: Array.from(groupMap.values()),
    topActive,
    ghostMembers,
    totalTracked: filtered.length,
    totalMessages: filtered.reduce((acc, cur) => acc + cur.messageCount, 0),
  };
}

export function resetMemberActivity(groupId?: string): boolean {
  if (!db.memberActivity) return true;
  if (!groupId || groupId === 'all') {
    db.memberActivity = {};
  } else {
    for (const [key, item] of Object.entries(db.memberActivity)) {
      if (item.groupId === groupId) delete db.memberActivity[key];
    }
  }
  saveDatabase();
  return true;
}

// -------------------------------------------------------------
// FEATURE 6: KEYWORD AUTO-RESPONDER (ZERO AI COST)
// -------------------------------------------------------------
export function getKeywordTriggers(): KeywordTrigger[] {
  return [...(db.settings.keywordTriggers || [])];
}

export function addKeywordTrigger(keyword: string, reply: string, matchType: 'exact' | 'contains' = 'contains'): KeywordTrigger[] {
  const list = [...(db.settings.keywordTriggers || [])];
  const item: KeywordTrigger = {
    id: 'kw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    keyword: keyword.trim(),
    reply: reply.trim(),
    matchType,
    enabled: true,
    createdAt: Date.now(),
    hitCount: 0,
  };
  list.unshift(item);
  updateSettings({ keywordTriggers: list });
  return list;
}

export function toggleKeywordTrigger(id: string): KeywordTrigger[] {
  const list = (db.settings.keywordTriggers || []).map((t) =>
    t.id === id ? { ...t, enabled: !t.enabled } : t
  );
  updateSettings({ keywordTriggers: list });
  return list;
}

export function removeKeywordTrigger(id: string): KeywordTrigger[] {
  const list = (db.settings.keywordTriggers || []).filter((t) => t.id !== id);
  updateSettings({ keywordTriggers: list });
  return list;
}

function matchKeywordTrigger(text: string): KeywordTrigger | null {
  const settings = getSettings();
  if (!settings.keywordAutoReplyEnabled) return null;
  const list = settings.keywordTriggers || [];
  if (list.length === 0 || !text) return null;

  const cleanText = text.trim().toLowerCase();
  if (!cleanText) return null;

  for (const trigger of list) {
    if (!trigger.enabled || !trigger.keyword || !trigger.reply) continue;
    const aliases = trigger.keyword
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const kw of aliases) {
      if (trigger.matchType === 'exact') {
        if (cleanText === kw) return trigger;
      } else {
        if (cleanText.includes(kw)) return trigger;
      }
    }
  }
  return null;
}

function incrementKeywordHit(id: string) {
  const list = (db.settings.keywordTriggers || []).map((t) =>
    t.id === id ? { ...t, hitCount: (t.hitCount || 0) + 1 } : t
  );
  db.settings.keywordTriggers = list;
  saveDatabase();
}

// -------------------------------------------------------------
// GROUP MEMBER DIRECTORY & ANONYMOUS 10-MINUTE MEMBER BLOCK
// -------------------------------------------------------------
export const DEFAULT_MANUAL_MEMBER_BLOCK_NOTICE =
  '🔕 *সাময়িক মেসেজিং বিরতি (Temporary Mute)*\n\n👤 @{{user}}\n⏳ সময়কাল: *{{minutes}} মিনিট*\n\n📌 গ্রুপের শৃঙ্খলা বজায় রাখার স্বার্থে আপনার মেসেজ পাঠানোর সুবিধা আগামী {{minutes}} মিনিটের জন্য স্থগিত করা হয়েছে। এই সময়ে পাঠানো আপনার কোনো মেসেজ গ্রুপে থাকবে না (স্বয়ংক্রিয়ভাবে মুছে দেওয়া হবে)।\n\n⏳ সময় শেষ হলে পুনরায় স্বাভাবিকভাবে মেসেজ করতে পারবেন।';

export interface GroupMemberDirectoryItem {
  jid: string;
  altJid: string;
  phone: string;
  name: string;
  role: 'superadmin' | 'admin' | 'member';
  isSelf: boolean;
  isBlocked: boolean;
  remainingSeconds: number;
  remainingText: string;
}

export async function getGroupMembersForBlockPage(
  sock: WASocket | null,
  requestedGroupId?: string
): Promise<{
  connected: boolean;
  groups: Array<{ id: string; name: string; participants: number; isBotAdmin: boolean }>;
  selectedGroupId: string;
  selectedGroupName: string;
  isBotAdmin: boolean;
  members: GroupMemberDirectoryItem[];
}> {
  if (!sock || !sock.authState?.creds?.registered) {
    return {
      connected: false,
      groups: [],
      selectedGroupId: '',
      selectedGroupName: '',
      isBotAdmin: false,
      members: [],
    };
  }

  const allGroups = await sock.groupFetchAllParticipating().catch(() => ({} as Record<string, any>));
  primeGroupMetaCache(allGroups);

  const groups = Object.values(allGroups)
    .map((g: any) => ({
      id: g.id,
      name: g.subject || 'WhatsApp Group',
      participants: Array.isArray(g.participants) ? g.participants.length : 0,
      isBotAdmin: isBotGroupAdminFromMeta(sock, g),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (groups.length === 0) {
    return {
      connected: true,
      groups: [],
      selectedGroupId: '',
      selectedGroupName: '',
      isBotAdmin: false,
      members: [],
    };
  }

  const selectedGroupId =
    requestedGroupId && allGroups[requestedGroupId] ? requestedGroupId : groups[0].id;
  const meta = (await getGroupMeta(sock, selectedGroupId, true)) || allGroups[selectedGroupId];
  const selectedGroupName = meta?.subject || 'WhatsApp Group';
  const isBotAdmin = isBotGroupAdminFromMeta(sock, meta);

  const botIds = new Set(
    [sock.user?.id, sock.user?.lid, sock.authState?.creds?.me?.id, sock.authState?.creds?.me?.lid]
      .filter(Boolean)
      .map((j) => cleanJidUser(String(j)))
  );

  // Build lookup of known activity names/phones inside this group
  const activityByClean: Record<string, MemberActivityItem> = {};
  for (const act of Object.values(db.memberActivity || {})) {
    if (act.groupId !== selectedGroupId) continue;
    const u1 = cleanJidUser(act.senderJid);
    const u2 = cleanJidUser(act.senderPhone);
    if (u1) activityByClean[u1] = act;
    if (u2) activityByClean[u2] = act;
  }

  const activeRestrictions = getActiveRestrictedUsers().filter((r) => r.groupId === selectedGroupId);

  const members: GroupMemberDirectoryItem[] = (meta?.participants || []).map((p: any) => {
    const jid = normalizeJid(p.id || p.jid || p.lid || '');
    const altJid = p.phoneNumber ? normalizeJid(p.phoneNumber) : p.lid ? normalizeJid(p.lid) : '';
    const cleanId = cleanJidUser(jid);
    const cleanAlt = cleanJidUser(altJid);
    const act = activityByClean[cleanId] || (cleanAlt ? activityByClean[cleanAlt] : undefined);

    let phone = cleanAlt || cleanId;
    if (jid.endsWith('@s.whatsapp.net')) {
      phone = cleanId;
    } else if (p.phoneNumber) {
      phone = cleanJidUser(p.phoneNumber) || phone;
    } else if (act?.senderPhone && /^\d+$/.test(act.senderPhone)) {
      phone = act.senderPhone;
    }

    const resolvedName = (
      p.notify ||
      p.name ||
      contactNamesCache[jid] ||
      contactNamesCache[cleanId] ||
      (altJid ? contactNamesCache[altJid] : '') ||
      (cleanAlt ? contactNamesCache[cleanAlt] : '') ||
      act?.name ||
      ''
    ).trim();

    const role: 'superadmin' | 'admin' | 'member' =
      p.admin === 'superadmin' || p.isSuperAdmin
        ? 'superadmin'
        : p.admin === 'admin' || p.isAdmin
        ? 'admin'
        : 'member';

    const isSelf = botIds.has(cleanId) || (cleanAlt ? botIds.has(cleanAlt) : false);

    const matchedRestriction = activeRestrictions.find((r) => {
      const rUsers = [cleanJidUser(r.senderJid), cleanJidUser(r.altJid), cleanJidUser(r.senderPhone)].filter(Boolean);
      return rUsers.includes(cleanId) || (cleanAlt && rUsers.includes(cleanAlt)) || rUsers.includes(phone);
    });

    return {
      jid,
      altJid,
      phone,
      name: resolvedName || (phone ? `সদস্য (${phone.slice(-4)})` : 'সদস্য'),
      role,
      isSelf,
      isBlocked: Boolean(matchedRestriction),
      remainingSeconds: matchedRestriction?.remainingSeconds || 0,
      remainingText: matchedRestriction?.remainingText || '',
    };
  });

  // Sort: Blocked first, then members alphabetically, then admins last
  members.sort((a, b) => {
    if (a.isBlocked !== b.isBlocked) return a.isBlocked ? -1 : 1;
    if ((a.role === 'member') !== (b.role === 'member')) return a.role === 'member' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    connected: true,
    groups,
    selectedGroupId,
    selectedGroupName,
    isBotAdmin,
    members,
  };
}

export async function manualBlockMember(
  sock: WASocket | null,
  params: {
    groupId: string;
    memberJid: string;
    altJid?: string;
    memberPhone?: string;
    durationMinutes?: number;
    customNotice?: string;
  }
): Promise<{
  success: boolean;
  error?: string;
  noticeSent: boolean;
  restriction?: RestrictedUser;
}> {
  const { groupId, memberJid, altJid, memberPhone } = params;
  const durationMinutes = Math.max(1, Math.min(180, Number(params.durationMinutes || 10)));

  if (!groupId || !memberJid) {
    return { success: false, error: 'গ্রুপ এবং মেম্বার নির্বাচন করুন।', noticeSent: false };
  }

  let groupName = 'WhatsApp Group';
  let isTargetAdmin = false;
  if (sock && sock.authState?.creds?.registered) {
    const meta = await getGroupMeta(sock, groupId, false);
    if (meta?.subject) groupName = meta.subject;
    const targetCleans = new Set([cleanJidUser(memberJid), cleanJidUser(altJid), cleanJidUser(memberPhone)].filter(Boolean));
    for (const p of meta?.participants || []) {
      const pAny = p as any;
      const pCleans = [p.id, pAny.lid, pAny.phoneNumber].filter(Boolean).map((j) => cleanJidUser(String(j)));
      if (pCleans.some((c) => targetCleans.has(c))) {
        if (p.admin === 'admin' || p.admin === 'superadmin' || pAny.isAdmin || pAny.isSuperAdmin) {
          isTargetAdmin = true;
        }
        break;
      }
    }
  }

  const settings = getSettings();
  if (isTargetAdmin && settings.adminShield) {
    return {
      success: false,
      error: 'Admin Security Shield চালু থাকায় গ্রুপ অ্যাডমিনকে ব্লক করা যাবে না।',
      noticeSent: false,
    };
  }

  const cleanPhone =
    (memberPhone || '').replace(/[^\d]/g, '') ||
    cleanJidUser(altJid) ||
    cleanJidUser(memberJid) ||
    'member';

  const restriction = restrictUser(
    groupId,
    groupName,
    memberJid,
    cleanPhone,
    durationMinutes,
    'সাময়িক নীরবতা (১০ মিনিট ডিসিপ্লিনারি ব্লক)',
    altJid
  );

  let noticeSent = false;
  if (sock && sock.authState?.creds?.registered) {
    const rawTemplate = (params.customNotice ?? settings.manualBlockNotice ?? '').trim();
    const template = rawTemplate || DEFAULT_MANUAL_MEMBER_BLOCK_NOTICE;
    // Strip any accidental {admin} placeholder so no admin name can ever appear in the notice
    const noticeText = template
      .replace(/\{\{?admin\}?\}/gi, '')
      .replace(/\{\{?user\}?\}/gi, cleanPhone)
      .replace(/\{\{?minutes\}?\}/gi, String(durationMinutes));

    const mentionJid = normalizeJid(memberJid);
    const sent = await safeSendMessage(sock, groupId, {
      text: noticeText,
      mentions: [mentionJid],
    });
    noticeSent = Boolean(sent);
  }

  return {
    success: true,
    noticeSent,
    restriction,
  };
}

// -------------------------------------------------------------
// MULTIMODAL MEDIA BUFFER HELPER (VOICE NOTES & IMAGES)
// -------------------------------------------------------------
async function downloadMediaBuffer(sock: WASocket, msg: proto.IWebMessageInfo): Promise<Buffer | null> {
  try {
    const buffer = (await downloadMediaMessage(
      msg as any,
      'buffer',
      {},
      {
        logger: { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({} as any) } as any,
        reuploadRequest: sock.updateMediaMessage,
      }
    )) as Buffer;
    if (!buffer || buffer.length === 0) return null;
    if (buffer.length > 8 * 1024 * 1024) {
      console.warn('[Media Download Skipped] File larger than 8MB');
      return null;
    }
    return buffer;
  } catch (err: any) {
    console.warn('[Media Download Error]:', err?.message || err);
    return null;
  }
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
    const senderJid = remoteJid;
    const cleanPhone = senderJid.split('@')[0].split(':')[0];
    const userName = msg.pushName || 'Friend';
    const memoryKey = `private:${normalizeJid(senderJid)}`;

    // Keyword Auto-Reply works instantaneously with 0 AI cost
    if (messageText) {
      const kwHit = matchKeywordTrigger(messageText);
      if (kwHit) {
        incrementKeywordHit(kwHit.id);
        await safeSendMessage(sock, remoteJid, { text: kwHit.reply }, { quoted: msg as any });
        addActivityLog({
          groupId: 'private',
          groupName: `Private (${userName})`,
          senderJid: remoteJid,
          senderPhone: cleanPhone,
          action: 'replied',
          reason: `Keyword Auto-Reply ("${kwHit.keyword}")`,
          details: kwHit.reply.slice(0, 60),
        });
        return;
      }
    }

    if (!settings.mayaAiEnabled || !settings.mayaPrivateReply) {
      return;
    }

    const hasAudio = Boolean(realMsg.audioMessage);
    const hasImage = Boolean(realMsg.imageMessage);

    // Handle Private Voice Notes or Images via Multimodal Gemini
    if ((hasAudio && settings.mayaVoiceEnabled) || (hasImage && settings.mayaVisionEnabled)) {
      const mediaBuf = await downloadMediaBuffer(sock, msg);
      if (mediaBuf) {
        const mimeType = hasAudio
          ? realMsg.audioMessage?.mimetype || 'audio/ogg; codecs=opus'
          : realMsg.imageMessage?.mimetype || 'image/jpeg';
        const aiResult = await getMayaMultimodalResponse(
          mediaBuf,
          mimeType,
          messageText || '',
          hasAudio ? 'audio' : 'image',
          cleanPhone,
          userName,
          'Private Chat',
          memoryKey,
          {
            romantic: settings.mayaRomantic,
            funny: settings.mayaFunny,
            language: settings.mayaLanguage,
            memoryLimit: settings.mayaMemoryLimit,
            aiProvider: 'gemini',
            geminiModel: settings.geminiModel,
            geminiApiKey: settings.geminiApiKey,
            isPrivate: true,
          }
        );
        if (aiResult.reply && aiResult.provider !== 'none') {
          const sent = await safeSendMessage(sock, remoteJid, { text: aiResult.reply }, { quoted: msg as any });
          if (sent) {
            addActivityLog({
              groupId: 'private',
              groupName: `Private (${userName})`,
              senderJid: remoteJid,
              senderPhone: cleanPhone,
              action: 'replied',
              reason: hasAudio ? 'Private Voice Note Reply [GEMINI]' : 'Private Image Vision Reply [GEMINI]',
              details: aiResult.reply.slice(0, 60),
            });
          }
          return;
        }
      }
    }

    if (!messageText || messageText.trim().length === 0) {
      return; // Skip unsupported media without captions in private chats
    }

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
  rememberLidPnPair(senderJid, senderAltJid);

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

  if (msg.pushName && senderJid) {
    const cu1 = cleanJidUser(senderJid);
    const cu2 = cleanJidUser(senderAltJid);
    if (cu1) contactNamesCache[cu1] = msg.pushName;
    if (cu2) contactNamesCache[cu2] = msg.pushName;
  }

  // Note: Clean-behavior Leaderboard tracking runs strictly AFTER spam/sticker/badword checks pass!

  // -------------------------------------------------------------
  // FEATURE 0: ACTIVE INDIVIDUAL RESTRICTION (MESSAGE INTERCEPTION & AUTO-DELETE)
  // -------------------------------------------------------------
  const restrictionCheck = isUserRestricted(
    remoteJid,
    canonicalSender,
    [senderJid, senderAltJid, cleanPhone].filter(Boolean)
  );
  if (restrictionCheck.restricted) {
    // Group Admins are never restricted if Admin Shield is active
    if (isSenderAdmin && settings.adminShield) {
      console.log(`[Individual Mute] @${cleanPhone} is an Admin with Admin Shield active. Lifting restriction.`);
      unrestrictUser(remoteJid, canonicalSender, [senderJid, senderAltJid]);
    } else {
      const remainingSec = Math.round(restrictionCheck.remainingMs / 1000);
      console.log(`[Individual Mute ACTIVE] Intercepted message from restricted user @${cleanPhone} in "${groupSubject}". Auto-deleting message (${remainingSec}s remaining)...`);

      const deleted = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId, isBotAdmin);
      if (deleted) {
        db.stats.deletedMessages++;
        db.stats.restrictedMessagesBlocked = (db.stats.restrictedMessagesBlocked || 0) + 1;
        saveDatabase();
      } else if (!isBotAdmin) {
        console.warn(`[Individual Mute Warn] Bot lacks admin delete permission in "${groupSubject}".`);
      }

      // Halts all processing!
      return;
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
  let publicViolationReason = '';

  // Feature 1: Admin Security Shield (Respects settings.adminShield toggle)
  const isProtectedAdmin = settings.adminShield && isSenderAdmin; 

  if (!isProtectedAdmin) {
  // Feature 2: ANTI-STICKER (Delete every sticker instantly if antiSticker is enabled)
  if (settings.antiSticker && isSticker) {
    violationType = 'Anti-Sticker';
    violationDetails = 'স্টিকার পাঠানো নিষিদ্ধ';
    publicViolationReason = 'স্টিকার পাঠানো নিষিদ্ধ';
  }
  // Feature 7: ANTI-VIEW ONCE (Must run before antiVideo/antiImage so view-once photo/video/audio is properly caught)
    else if (settings.antiViewOnce && isViewOnce) {
      violationType = 'Anti-View Once';
      violationDetails = 'View Once মিডিয়া (ছবি/ভিডিও/ভয়েস) পাঠানো নিষিদ্ধ';
      publicViolationReason = 'View Once মিডিয়া (ছবি/ভিডিও/ভয়েস) পাঠানো নিষিদ্ধ';
    }
  // Feature 4: ANTI-GIF
    else if (settings.antiGif && isGif) {
      violationType = 'Anti-GIF';
      violationDetails = 'GIF এবং এনিমেটেড ভিডিও পাঠানো নিষিদ্ধ';
      publicViolationReason = 'GIF এবং এনিমেটেড ভিডিও পাঠানো নিষিদ্ধ';
    }
    // Feature 5: ANTI-VIDEO
    else if (settings.antiVideo && isVideo) {
      violationType = 'Anti-Video';
      violationDetails = 'ভিডিও পাঠানো নিষিদ্ধ';
      publicViolationReason = 'ভিডিও পাঠানো নিষিদ্ধ';
    }
    // Feature 6: ANTI-IMAGE
    else if (settings.antiImage && isImage) {
      violationType = 'Anti-Image';
      violationDetails = 'ছবি বা ফটো পাঠানো নিষিদ্ধ';
      publicViolationReason = 'ছবি বা ফটো পাঠানো নিষিদ্ধ';
    }
    // Feature 9: ANTI-LINK (NEVER echo deleted URL back into public WhatsApp warning notice!)
    else if (settings.antiLink && messageText) {
      const linkCheck = checkLinkViolation(messageText, {
        allowCarromLinks: settings.allowCarromLinks !== false,
      });
      if (linkCheck.isLink) {
        violationType = 'Anti-Link';
        violationDetails = 'লিংক শেয়ার করা নিষিদ্ধ';
        publicViolationReason = 'লিংক পাঠানো নিষিদ্ধ';
      }
    }
    // Feature 8: ADVANCED MULTILINGUAL ANTI-BADWORD (NEVER echo deleted slur back into warning notice!)
    if (!violationType && settings.antiBadword && messageText) {
      const badwordCheck = checkBadwordViolation(messageText, settings.customBadwords);
      if (badwordCheck.isBad) {
        violationType = 'Anti-Badword';
        violationDetails = 'অশালীন শব্দ বা গালি শনাক্ত হয়েছে';
        publicViolationReason = 'অশালীন শব্দ বা গালি ব্যবহার করা নিষিদ্ধ';
      } else if (settings.aiBadwordDetection) {
        // Fallback to AI detection if standard dictionary doesn't catch it
        const aiCheck = await checkBadwordWithAi(messageText, cleanPhone, msg.pushName || 'User', groupSubject, settings);
        if (aiCheck.isBad) {
          violationType = 'AI-Anti-Badword';
          violationDetails = aiCheck.reason || 'অশালীন ভাষা শনাক্ত হয়েছে';
          publicViolationReason = 'অশালীন শব্দ বা গালি ব্যবহার করা নিষিদ্ধ';
        }
      }
    }
    // Feature 4b: AI ANTI-NSFW IMAGE SCANNING (when antiImage is OFF and antiNsfwImage is ON)
    if (!violationType && isImage && !isViewOnce && settings.antiNsfwImage) {
      const imgBuf = await downloadMediaBuffer(sock, msg);
      if (imgBuf) {
        const nsfwCheck = await inspectImageSafetyWithAi(
          imgBuf,
          realMsg.imageMessage?.mimetype || 'image/jpeg',
          cleanPhone,
          msg.pushName || 'User',
          groupSubject,
          {
            romantic: false,
            funny: false,
            language: settings.mayaLanguage,
            memoryLimit: 0,
            aiProvider: 'gemini',
            geminiModel: settings.geminiModel,
            geminiApiKey: settings.geminiApiKey,
          }
        );
        if (nsfwCheck.isUnsafe) {
          violationType = 'AI-Anti-NSFW';
          violationDetails = nsfwCheck.reason;
          publicViolationReason = 'অশ্লীল বা আপত্তিকর ছবি পাঠানো নিষিদ্ধ';
        }
      }
    }
  }

  // Track multi-person badword abuse / heated group quarrel (Works 100% locally WITHOUT AI API)
  const isConflictMessage =
    violationType === 'Anti-Badword' ||
    violationType === 'AI-Anti-Badword' ||
    (!isProtectedAdmin && messageText && hasHeatedFightSignal(messageText));
  if (isConflictMessage) {
    trackGroupConflictAndNotifyBoss(sock, {
      groupId: remoteJid,
      groupName: groupSubject,
      senderKey: canonicalSender,
      senderPhone: cleanPhone,
      senderName: msg.pushName || 'User',
      reason: violationType || 'Group Quarrel',
    }).catch(() => {});
  }

  // -------------------------------------------------------------
  // VIOLATION ENFORCEMENT (Delete -> Warning -> Auto Kick on 3rd)
  // -------------------------------------------------------------
  if (violationType) {
    const noticeReason = publicViolationReason || violationDetails;
    console.log(`[Moderation Triggered] ${violationType} in ${groupSubject} by @${cleanPhone} (isBotAdmin=${isBotAdmin})`);

    // Step 1: Real Message Delete Operation (PN + LID compatible & Admin permission verified)
    const deleteSuccessful = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId, isBotAdmin);
    if (deleteSuccessful) {
      db.stats.deletedMessages++;
    } else if (!isBotAdmin) {
      console.warn(`[Moderation Warn] Cannot delete message in "${groupSubject}" because bot is NOT Group Admin.`);
      reportServerProblem(
        {
          category: `no_admin_${remoteJid}`,
          title: 'গ্রুপে বটের Admin Delete Permission নেই',
          details: `"${groupSubject}" গ্রুপে নিয়ম ভঙ্গ (${noticeReason}) শনাক্ত হয়েছে, কিন্তু বট Admin না থাকায় মেসেজ ডিলিট করা যায়নি।`,
          suggestion: `দয়া করে "${groupSubject}" গ্রুপে বট নম্বরটিকে Admin বানিয়ে দিন।`,
        },
        sock
      ).catch(() => {});
    }

    // Step 2: Warning Counter per Member per Group
    const warningKey = `${remoteJid}:${canonicalSender}`;
    if (!db.warnings[warningKey]) {
      db.warnings[warningKey] = {
        count: 0,
        lastViolation: Date.now(),
        violations: [],
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid: canonicalSender,
        senderPhone: cleanPhone,
      };
    }

    db.warnings[warningKey].groupId = remoteJid;
    db.warnings[warningKey].groupName = groupSubject;
    db.warnings[warningKey].senderJid = canonicalSender;
    db.warnings[warningKey].senderPhone = cleanPhone;
    db.warnings[warningKey].count++;
    db.warnings[warningKey].lastViolation = Date.now();
    db.warnings[warningKey].violations.push({
      timestamp: Date.now(),
      reason: noticeReason,
    });
    db.stats.warningsGiven++;
    saveDatabase();

    const warningCount = db.warnings[warningKey].count;

    // Feature 10: THREE WARNING AUTO KICK (Always enforce kick even if silentModeration is enabled)
    if (warningCount === 1 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${noticeReason}!\n${
          deleteSuccessful
            ? 'আপনার মেসেজটি মুছে দেওয়া হয়েছে।'
            : !isBotAdmin
              ? '⚠️ বটের মেসেজ ডিলিট পারমিশন (Admin) না থাকায় মেসেজটি মুছে ফেলা যায়নি।'
              : 'মেসেজটি মুছে ফেলার চেষ্টা করা হয়েছে।'
        } নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
        mentions: [senderJid],
      });
    } else if (warningCount === 2 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${noticeReason})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
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
            text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${noticeReason})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
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
      details: noticeReason,
      warningCount,
    });

    return; // Message handled and penalized
  }

  // -------------------------------------------------------------
  // CLEAN-BEHAVIOR LEADERBOARD TRACKING (AUTOMATIC: NO BADWORDS, NO STICKERS, NO SPAM)
  // -------------------------------------------------------------
  const trimmedCmd = (messageText || '').trim().toLowerCase();
  const isRankCmd = trimmedCmd === '.top' || trimmedCmd === '!top' || trimmedCmd === '.rank';
  const hasBadwordForRank = Boolean(messageText && checkBadwordViolation(messageText, settings.customBadwords).isBad);
  const hasQuarrelForRank = Boolean(messageText && hasHeatedFightSignal(messageText));
  const hasLinkForRank = Boolean(
    messageText &&
    checkLinkViolation(messageText, { allowCarromLinks: settings.allowCarromLinks !== false }).isLink
  );
  const shouldCountInLeaderboard =
    !isSticker && !isGif && !isViewOnce && !hasBadwordForRank && !hasQuarrelForRank && !hasLinkForRank && !isRankCmd;

  if (shouldCountInLeaderboard) {
    recordMemberActivity(remoteJid, groupSubject, canonicalSender, cleanPhone, msg.pushName);
  }

  // -------------------------------------------------------------
  // GROUP COMMAND: .top / !top / .rank (TOP ACTIVE LEADERBOARD)
  // -------------------------------------------------------------
  if (settings.activityTrackingEnabled && isRankCmd) {
    const report = getMemberActivityReport(remoteJid, 7);
    const top10 = report.topActive.slice(0, 10);
    if (top10.length > 0) {
      const lines = top10.map((m, i) => `${i + 1}. @${m.senderPhone} — ${m.messageCount} মেসেজ`);
      await safeSendMessage(
        sock,
        remoteJid,
        {
          text: `🏆 *${groupSubject} — টপ অ্যাক্টিভ মেম্বার র‍্যাংকিং*\n\n${lines.join('\n')}\n\n📊 মোট পরীক্ষিত মেসেজ: ${report.totalMessages}`,
          mentions: top10.map((m) => m.senderJid),
        },
        { quoted: msg as any }
      );
      return;
    }
  }

  // -------------------------------------------------------------
  // KEYWORD AUTO-RESPONDER IN GROUP (ZERO AI COST)
  // -------------------------------------------------------------
  if (messageText) {
    const kwHit = matchKeywordTrigger(messageText);
    if (kwHit) {
      incrementKeywordHit(kwHit.id);
      await safeSendMessage(sock, remoteJid, { text: kwHit.reply }, { quoted: msg as any });
      addActivityLog({
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid,
        senderPhone: cleanPhone,
        action: 'replied',
        reason: `Keyword Auto-Reply ("${kwHit.keyword}")`,
        details: kwHit.reply.slice(0, 60),
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // ADMIN MENTION AUTO-REPLY IN GROUP (ZERO AI API, TYPING INDICATOR + COOLDOWN)
  // Runs BEFORE Auto-Salam so "সলাম @+8801632222592" still replies to Boss/Admin mention!
  // -------------------------------------------------------------
  if (settings.adminMentionReplyEnabled !== false) {
    const bossDigits = resolveBossAdminJid().split('@')[0];
    const targetMode = settings.adminMentionReplyTarget === 'boss_only' ? 'boss_only' : 'all_admins';
    const adminHit = await findMentionedAdminInMessage(
      sock,
      remoteJid,
      realMsg,
      messageText,
      senderJid,
      senderAltJid,
      targetMode,
      bossDigits,
      msg
    );
    if (adminHit) {
      const nowMs = Date.now();
      const userCooldownKey = `${remoteJid}:${canonicalSender}`;
      const adminCooldownKey = `${remoteJid}:admin:${cleanJidUser(adminHit.adminJid)}`;
      const lastUserAt = lastAdminMentionReplyAt.get(userCooldownKey) || 0;
      const lastAdminAt = lastAdminMentionReplyAt.get(adminCooldownKey) || 0;
      if (nowMs - lastUserAt >= 5000 && nowMs - lastAdminAt >= 3000) {
        lastAdminMentionReplyAt.set(userCooldownKey, nowMs);
        lastAdminMentionReplyAt.set(adminCooldownKey, nowMs);

        const template = (settings.adminMentionReplyMessage || '').trim() || DEFAULT_ADMIN_MENTION_REPLY;
        const userTag = cleanJidUser(senderJid) || cleanPhone;
        const replyText = template
          .replace(/\{\{\s*admin\s*\}\}|\{\s*admin\s*\}/gi, adminHit.adminTag)
          .replace(/\{\{\s*user\s*\}\}|\{\s*user\s*\}/gi, userTag);

        const mentionJids = Array.from(new Set([adminHit.adminJid, normalizeJid(senderJid)].filter(Boolean)));
        console.log(
          `[Admin Mention Reply] Matched (${adminHit.isBoss ? 'BOSS' : 'ADMIN'}, mode=${targetMode}) in "${groupSubject}": @${adminHit.adminTag} <- by @${userTag}`
        );
        const sent = await safeSendMessage(
          sock,
          remoteJid,
          { text: replyText, mentions: mentionJids },
          { quoted: msg as any }
        );
        if (sent) {
          addActivityLog({
            groupId: remoteJid,
            groupName: groupSubject,
            senderJid,
            senderPhone: cleanPhone,
            action: 'replied',
            reason: adminHit.isBoss
              ? 'বস অ্যাডমিন মেনশন অটো রিপ্লাই (Boss Mention Reply — Zero API)'
              : 'অ্যাডমিন মেনশন অটো রিপ্লাই (Admin Mention Reply — Zero API)',
            details: replyText.slice(0, 80),
          });
        } else {
          console.warn(`[Admin Mention Reply Warn] Failed sending reply to "${groupSubject}"`);
        }
      } else {
        console.log(
          `[Admin Mention Reply Cooldown] Throttled duplicate ping in "${groupSubject}" for @${adminHit.adminTag}`
        );
      }
      return;
    }
  }

  // -------------------------------------------------------------
  // AUTO SALAM REPLY IN GROUP ONLY (ZERO AI API NEEDED, PURE SALAM REPLY ONLY)
  // -------------------------------------------------------------
  if (settings.autoSalamReplyEnabled !== false && messageText && isSalamMessage(messageText)) {
    const salamCooldownKey = `${remoteJid}:${canonicalSender}`;
    const nowMs = Date.now();
    const lastUserSalam = lastAutoSalamAt.get(salamCooldownKey) || 0;
    const lastGroupSalam = lastAutoSalamAt.get(remoteJid) || 0;
    if (nowMs - lastUserSalam >= 20000 && nowMs - lastGroupSalam >= 3000) {
      lastAutoSalamAt.set(salamCooldownKey, nowMs);
      lastAutoSalamAt.set(remoteJid, nowMs);

      const salamReplies = [
        'ওয়ালাইকুম আসসালাম ওয়া রাহমাতুল্লাহ! 🌸',
        'ওয়ালাইকুম আসসালাম ওয়া রাহমাতুল্লাহি ওয়া বারাকাতুহ! 😊🌸',
        'ওয়ালাইকুম আসসালাম! কেমন আছেন? 🌸',
      ];
      const chosenReply = salamReplies[Math.floor(Math.random() * salamReplies.length)];
      const sent = await safeSendMessage(
        sock,
        remoteJid,
        { text: chosenReply },
        { quoted: msg as any }
      );
      if (sent) {
        addActivityLog({
          groupId: remoteJid,
          groupName: groupSubject,
          senderJid,
          senderPhone: cleanPhone,
          action: 'replied',
          reason: 'অটো সালাম উত্তর (Auto Salam Reply — Zero API)',
          details: chosenReply,
        });
      }
    }
    return; // Only reply to Salam and nothing else!
  }

  // -------------------------------------------------------------
  // MAYA AI PERSONALITY & GROUP AUTO-REPLY ENGINE (TEXT + VOICE + IMAGE)
  // -------------------------------------------------------------
  const hasGroupAudio = Boolean(realMsg.audioMessage);
  const hasGroupImage = Boolean(realMsg.imageMessage);

  if (settings.botReply && settings.mayaAiEnabled && settings.mayaGroupReply && (messageText || hasGroupAudio || hasGroupImage)) {
    const lower = (messageText || '').toLowerCase();
    const botJid = sock.user?.id || '';
    const botLid = sock.user?.lid || '';
    const cleanBot = botJid.split('@')[0].split(':')[0];
    const cleanBotLid = botLid ? botLid.split('@')[0].split(':')[0] : '';

    const contextInfo = (realMsg as any)?.extendedTextMessage?.contextInfo ||
                        (realMsg as any)?.imageMessage?.contextInfo ||
                        (realMsg as any)?.audioMessage?.contextInfo ||
                        (realMsg as any)?.videoMessage?.contextInfo;

    const quotedParticipant = contextInfo?.participant || '';
    const isQuotingBot = quotedParticipant ? (
      quotedParticipant.includes(cleanBot) ||
      (cleanBotLid && quotedParticipant.includes(cleanBotLid)) ||
      quotedParticipant === botJid ||
      quotedParticipant === botLid
    ) : false;

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

    // Handle group Voice/Image ONLY when Maya is explicitly invoked (mention/quote/caption calling Maya)
    if (
      (isDirectMention || isDirectCall || isQuotingBot) &&
      ((hasGroupAudio && settings.mayaVoiceEnabled) || (hasGroupImage && settings.mayaVisionEnabled))
    ) {
      const mediaBuf = await downloadMediaBuffer(sock, msg);
      if (mediaBuf) {
        const mimeType = hasGroupAudio
          ? realMsg.audioMessage?.mimetype || 'audio/ogg; codecs=opus'
          : realMsg.imageMessage?.mimetype || 'image/jpeg';
        const aiResult = await getMayaMultimodalResponse(
          mediaBuf,
          mimeType,
          messageText || '',
          hasGroupAudio ? 'audio' : 'image',
          cleanPhone,
          msg.pushName || 'User',
          groupSubject,
          `group:${remoteJid}`,
          {
            romantic: settings.mayaRomantic,
            funny: settings.mayaFunny,
            language: settings.mayaLanguage,
            memoryLimit: settings.mayaMemoryLimit,
            aiProvider: 'gemini',
            geminiModel: settings.geminiModel,
            geminiApiKey: settings.geminiApiKey,
            isPrivate: false,
          }
        );
        if (aiResult.reply && aiResult.provider !== 'none') {
          lastAiReplyTime[remoteJid] = Date.now();
          const targetJid = normalizeJid(senderJid);
          const sent = await safeSendMessage(sock, targetJid, {
            text: `🌸 [Maya AI Private Reply for ${groupSubject}]\n\n${aiResult.reply}`,
          });
          if (sent) {
            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'replied',
              reason: hasGroupAudio ? 'Group Voice Note -> DM Reply [GEMINI]' : 'Group Image Vision -> DM Reply [GEMINI]',
              details: aiResult.reply.slice(0, 60),
            });
          }
          return;
        }
      }
    }

    if (!messageText) return;

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
