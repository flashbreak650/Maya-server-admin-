import fs from 'fs';
import path from 'path';
import { downloadMediaMessage, jidNormalizedUser, type proto, type WASocket } from '@whiskeysockets/baileys';
import { getMayaMultimodalResponse, getMayaResponse, inspectImageSafetyWithAi } from './aiEngine.ts';
import { DATA_DIR, MODERATION_DB_PATH } from './storagePaths.ts';
import { recordWebServerProblemEvent } from './connectionDiagnostics.ts';
import {
  captureBotOutgoingGroupMessage,
  markInboxMessageDeleted,
  setInboxIdentityResolver,
} from './inboxStore.ts';

const DB_PATH = MODERATION_DB_PATH;
const ACTIVE_PROBLEMS_PATH = path.join(DATA_DIR, 'active_problems.json');

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
  newMemberInboxRulesEnabled?: boolean;
  newMemberInboxRulesNotice?: string;
  newMemberGroupNoticeText?: string;
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
  hideNameOnDelete?: boolean;
  savedBotOriginalProfileName?: string;
  silentAllPresetMigratedV1?: boolean;
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
  secondAdminNumber?: string;
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
  // Offline AI Voice Anti-Abuse System (Zero Paid API, Whisper.cpp)
  voiceModerationEnabled?: boolean;
  voiceUseGeminiApi?: boolean;
  voiceDetectBangla?: boolean;
  voiceDetectSylheti?: boolean;
  voiceDetectEnglish?: boolean;
  voiceDetectBanglish?: boolean;
  voiceProfanitySensitivity?: 'low' | 'medium' | 'high';
  voiceAllowedWords?: string[];
  voiceBlockedWords?: string[];
  voiceWhisperModel?: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';
  voiceReviewUnclearEnabled?: boolean;
  voiceAutoSelectModel?: boolean;
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
  durationMinutes?: number;
  addedMinutesCount?: number;
  extensionNoticeSentAt?: number;
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
  autoWelcome: false,
  welcomeMessage: '',
  newMemberInboxRulesEnabled: false,
  newMemberInboxRulesNotice: '',
  newMemberGroupNoticeText: '',
  botReply: false,
  customBadwords: [],
  dashboardPinEnabled: false,
  dashboardPin: '',
  nightModeEnabled: false,
  nightLockStart: '00:00',
  nightLockEnd: '06:00',
  nightModeTimezone: 'Asia/Dhaka',
  nightModeNotify: false,
  antiCallEnabled: true,
  antiCallMessage: '📵 দুঃখিত! এটি একটি অটোমেটেড WhatsApp সিকিউরিটি বট। অনুগ্রহ করে কল না করে মেসেজ পাঠান।',
  antiCallAutoBlockCount: 3,
  mayaVoiceEnabled: true,
  mayaVisionEnabled: true,
  antiNsfwImage: false,
  activityTrackingEnabled: true,
  keywordAutoReplyEnabled: false,
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
  silentModeration: true,
  hideNameOnDelete: true,
  silentAllPresetMigratedV1: true,
  mayaReplyMode: 'group',
  aiKeys: [],
  aiAutoRotate: true,
  aiProviderPriority: ['gemini', 'groq', 'openrouter'],
  autoSalamReplyEnabled: false,
  botTypingEnabled: true,
  leaderboardCleanOnly: true,
  adminMentionReplyEnabled: false,
  adminMentionReplyTarget: 'all_admins',
  adminMentionReplyMessage: '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।',
  bossAdminNumber: '8801632222592',
  secondAdminNumber: '8801346561627',
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
  voiceModerationEnabled: true,
  voiceUseGeminiApi: true,
  voiceDetectBangla: true,
  voiceDetectSylheti: true,
  voiceDetectEnglish: true,
  voiceDetectBanglish: true,
  voiceProfanitySensitivity: 'medium',
  voiceAllowedWords: [],
  voiceBlockedWords: [],
  voiceWhisperModel: 'base-q5_1',
  voiceReviewUnclearEnabled: true,
  voiceAutoSelectModel: false,
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

interface QueuedServerProblem {
  category: string;
  title: string;
  details: string;
  suggestion?: string;
  timestamp: number;
}
interface TrackedServerProblem {
  category: string;
  title: string;
  details: string;
  suggestion?: string;
  reportedAt: number;
  notifiedBoss: boolean;
}
interface QueuedServerRecovery {
  category: string;
  title: string;
  details: string;
  thanksNote: string;
  reportedAt: number;
  resolvedAt: number;
}

const pendingServerProblems: QueuedServerProblem[] = [];
const activeProblemsMap = new Map<string, TrackedServerProblem>();
const pendingServerRecoveries: QueuedServerRecovery[] = [];
const lastServerRecoveryAlertAt = new Map<string, number>();

function loadPersistedActiveProblems() {
  try {
    if (!fs.existsSync(ACTIVE_PROBLEMS_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(ACTIVE_PROBLEMS_PATH, 'utf-8'));
    if (Array.isArray(raw?.activeProblems)) {
      for (const p of raw.activeProblems) {
        if (p?.category && p?.title) {
          activeProblemsMap.set(String(p.category), {
            category: String(p.category),
            title: String(p.title),
            details: String(p.details || ''),
            suggestion: p.suggestion ? String(p.suggestion) : undefined,
            reportedAt: Number(p.reportedAt || Date.now()),
            notifiedBoss: Boolean(p.notifiedBoss),
          });
        }
      }
    }
    if (Array.isArray(raw?.pendingRecoveries)) {
      for (const r of raw.pendingRecoveries) {
        if (r?.category && r?.title) {
          pendingServerRecoveries.push({
            category: String(r.category),
            title: String(r.title),
            details: String(r.details || ''),
            thanksNote: String(r.thanksNote || 'ধন্যবাদ বস! সমস্যাটি এখন পুরোপুরি সমাধান হয়ে গেছে।'),
            reportedAt: Number(r.reportedAt || Date.now()),
            resolvedAt: Number(r.resolvedAt || Date.now()),
          });
        }
      }
    }
  } catch (err: any) {
    console.warn('[Server Health Monitor] Could not load active_problems.json:', err?.message || err);
  }
}

let emergencyDiskReclaimHandler: (() => Promise<boolean> | boolean) | null = null;
let lastEmergencyReclaimAt = 0;

export function registerEmergencyDiskReclaimHandler(fn: () => Promise<boolean> | boolean) {
  emergencyDiskReclaimHandler = fn;
}

function savePersistedActiveProblems() {
  const payload = JSON.stringify({
    activeProblems: Array.from(activeProblemsMap.values()),
    pendingRecoveries: pendingServerRecoveries.slice(0, 20),
  });
  const tmp = ACTIVE_PROBLEMS_PATH + '.tmp';
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(tmp, payload, 'utf-8');
    fs.renameSync(tmp, ACTIVE_PROBLEMS_PATH);
  } catch (err: any) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      try {
        fs.writeFileSync(ACTIVE_PROBLEMS_PATH, payload, 'utf-8');
      } catch {}
    }
  }
}

loadPersistedActiveProblems();

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
          voiceAllowedWords: Array.isArray(data.settings?.voiceAllowedWords) ? data.settings.voiceAllowedWords : [],
          voiceBlockedWords: Array.isArray(data.settings?.voiceBlockedWords) ? data.settings.voiceBlockedWords : [],
        },
        warnings: data.warnings || {},
        groupLocks: data.groupLocks || {},
        nightLockedGroups: data.nightLockedGroups || {},
        restrictedUsers: data.restrictedUsers || {},
        callLogs: Array.isArray(data.callLogs) ? data.callLogs.slice(-80) : [],
        callCounts: data.callCounts || {},
        memberActivity: data.memberActivity || {},
        activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs.slice(-120) : [],
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
      if (!data.settings?.silentAllPresetMigratedV1) {
        db.settings = {
          ...db.settings,
          silentModeration: true,
          hideNameOnDelete: true,
          autoWelcome: false,
          newMemberInboxRulesEnabled: false,
          nightModeNotify: false,
          adminMentionReplyEnabled: false,
          autoSalamReplyEnabled: false,
          botReply: false,
          keywordAutoReplyEnabled: false,
          silentAllPresetMigratedV1: true,
        };
        saveDatabase();
      }
      console.log('Moderation DB loaded successfully. Logs count:', db.activityLogs.length, 'Restricted users:', Object.keys(db.restrictedUsers).length);
    } else {
      saveDatabase();
    }
  } catch (err: any) {
    console.error('Error loading moderation DB, using defaults:', err.message);
  }
}

function compactInMemoryDbOnTightSpace() {
  if (Array.isArray(db.activityLogs) && db.activityLogs.length > 80) {
    db.activityLogs = db.activityLogs.slice(-80);
  }
  if (Array.isArray(db.callLogs) && db.callLogs.length > 40) {
    db.callLogs = db.callLogs.slice(-40);
  }
  const memberEntries = Object.entries(db.memberActivity || {});
  if (memberEntries.length > 400) {
    memberEntries
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, memberEntries.length - 400)
      .forEach(([k]) => delete db.memberActivity[k]);
  }
}

function notifyDbWriteRecovered() {
  if (typeof resolveServerProblem === 'function' && activeProblemsMap?.has('db_save_error')) {
    resolveServerProblem('db_save_error', {
      details: 'ডাটাবেজ ফাইল এখন স্বাভাবিকভাবে সেভ হচ্ছে।',
      thanksNote: 'ধন্যবাদ বস! স্টোরেজ ও সার্ভার পারমিশন ঠিক হওয়ায় সব তথ্য নিরাপদে সংরক্ষিত হচ্ছে।',
      sock: globalSocketGetter ? globalSocketGetter() : null,
    }).catch(() => {});
  }
}

function writeDbWithEnospcDirectFallbackSync(payload: string) {
  const tmpPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, payload, 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err: any) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      compactInMemoryDbOnTightSpace();
      fs.writeFileSync(DB_PATH, JSON.stringify(db), 'utf-8');
    } else {
      throw err;
    }
  }
}

// Atomic save database to disk
let saveTimeout: NodeJS.Timeout | null = null;
let dbWriteInFlight = false;
let dbWritePendingAgain = false;

export function flushDatabaseSync() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    writeDbWithEnospcDirectFallbackSync(JSON.stringify(db));
    notifyDbWriteRecovered();
  } catch (err: any) {
    console.error('Error saving moderation DB:', err.message);
    if (err?.code === 'ENOSPC' && emergencyDiskReclaimHandler && Date.now() - lastEmergencyReclaimAt > 20000) {
      lastEmergencyReclaimAt = Date.now();
      Promise.resolve(emergencyDiskReclaimHandler())
        .then((reclaimed) => {
          if (reclaimed) {
            try {
              writeDbWithEnospcDirectFallbackSync(JSON.stringify(db));
              notifyDbWriteRecovered();
            } catch {}
          }
        })
        .catch(() => {});
    }
    reportServerProblem(
      {
        category: 'db_save_error',
        title: 'ডাটাবেজ সেভ ব্যর্থ (DB Write Error)',
        details: err?.message || 'moderation_db.json সংরক্ষণ করা যায়নি।',
        suggestion: 'সার্ভারের ডিস্ক স্পেস ও ফোল্ডার পারমিশন পরীক্ষা করুন।',
      },
      globalSocketGetter ? globalSocketGetter() : null
    ).catch(() => {});
  }
}

async function flushDatabaseAsync() {
  if (dbWriteInFlight) {
    dbWritePendingAgain = true;
    return;
  }
  dbWriteInFlight = true;
  const tmpPath = DB_PATH + '.tmp';
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = JSON.stringify(db);
    try {
      await fs.promises.writeFile(tmpPath, payload, 'utf-8');
      await fs.promises.rename(tmpPath, DB_PATH);
    } catch (err: any) {
      await fs.promises.unlink(tmpPath).catch(() => {});
      if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
        if (emergencyDiskReclaimHandler && Date.now() - lastEmergencyReclaimAt > 20000) {
          lastEmergencyReclaimAt = Date.now();
          await Promise.resolve(emergencyDiskReclaimHandler()).catch(() => false);
        }
        compactInMemoryDbOnTightSpace();
        await fs.promises.writeFile(DB_PATH, JSON.stringify(db), 'utf-8');
      } else {
        throw err;
      }
    }
    notifyDbWriteRecovered();
  } catch (err: any) {
    console.error('Error saving moderation DB:', err?.message || err);
    reportServerProblem(
      {
        category: 'db_save_error',
        title: 'ডাটাবেজ সেভ ব্যর্থ (DB Write Error)',
        details: err?.message || 'moderation_db.json সংরক্ষণ করা যায়নি।',
        suggestion: 'সার্ভারের ডিস্ক স্পেস ও ফোল্ডার পারমিশন পরীক্ষা করুন।',
      },
      globalSocketGetter ? globalSocketGetter() : null
    ).catch(() => {});
  } finally {
    dbWriteInFlight = false;
    if (dbWritePendingAgain) {
      dbWritePendingAgain = false;
      saveDatabase();
    }
  }
}

export function saveDatabase() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    void flushDatabaseAsync();
  }, 1200);
}

// Initialize on start
loadDatabase();

// In-memory caches for fast processing
const processedMsgIds = new Set<string>();
const stickerTimestamps: Record<string, number[]> = {}; // key: `${groupId}:${senderJid}`
const groupMetaCache: Record<string, { meta: any; fetchedAt: number }> = {};
const lastAiReplyTime: Record<string, number> = {}; // key: groupId

export function pruneExpiredRuntimeCaches(): number {
  const now = Date.now();
  let pruned = 0;

  if (processedMsgIds.size > 500) {
    const excess = processedMsgIds.size - 500;
    let removed = 0;
    for (const id of processedMsgIds) {
      processedMsgIds.delete(id);
      removed++;
      pruned++;
      if (removed >= excess) break;
    }
  }

  const stickerCutoff = now - 5 * 60 * 1000;
  for (const [k, arr] of Object.entries(stickerTimestamps)) {
    const fresh = arr.filter((ts) => ts >= stickerCutoff);
    if (fresh.length === 0) {
      delete stickerTimestamps[k];
      pruned++;
    } else if (fresh.length < arr.length) {
      stickerTimestamps[k] = fresh;
      pruned += arr.length - fresh.length;
    }
  }

  const aiCutoff = now - 2 * 60 * 60 * 1000;
  for (const [gid, ts] of Object.entries(lastAiReplyTime)) {
    if (ts < aiCutoff) {
      delete lastAiReplyTime[gid];
      pruned++;
    }
  }

  // Keep recently active group metadata caches (within 6h); prune stale volatile cache entries only
  const metaCutoff = now - 6 * 60 * 60 * 1000;
  for (const [gid, entry] of Object.entries(groupMetaCache)) {
    if (entry.fetchedAt < metaCutoff) {
      delete groupMetaCache[gid];
      pruned++;
    }
  }

  return pruned;
}

export async function syncBotProfileNamePrivacy(sock: WASocket | null | undefined): Promise<{ updated: boolean; hidden: boolean }> {
  if (!sock || !sock.authState?.creds?.registered) {
    return { updated: false, hidden: false };
  }
  const settings = getSettings();
  const hideName = Boolean(settings.hideNameOnDelete);
  const currentName = String(sock.user?.name || '').trim();
  const INVISIBLE_PROFILE_NAME = '\u2800'; // Braille Pattern Blank (renders empty, accepted as non-empty PushName by WhatsApp)

  try {
    if (hideName) {
      if (currentName && currentName !== INVISIBLE_PROFILE_NAME && !settings.savedBotOriginalProfileName) {
        db.settings.savedBotOriginalProfileName = currentName;
        saveDatabase();
      }
      if (currentName !== INVISIBLE_PROFILE_NAME) {
        await sock.updateProfileName(INVISIBLE_PROFILE_NAME);
        if (sock.user) {
          sock.user.name = INVISIBLE_PROFILE_NAME;
        }
        return { updated: true, hidden: true };
      }
      return { updated: false, hidden: true };
    } else {
      const original = (settings.savedBotOriginalProfileName || '').trim();
      if (original && (currentName === INVISIBLE_PROFILE_NAME || !currentName)) {
        await sock.updateProfileName(original);
        if (sock.user) {
          sock.user.name = original;
        }
        return { updated: true, hidden: false };
      }
      return { updated: false, hidden: false };
    }
  } catch (err: any) {
    console.warn('[syncBotProfileNamePrivacy] Could not update WhatsApp profile name:', err?.message || err);
    return { updated: false, hidden: hideName };
  }
}

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
  pendingServerProblems.length = 0;
  lastServerProblemAlertAt.clear();
  saveDatabase();
  return true;
}

export function pruneExpiredModerationHistories(maxAgeMs: number): {
  warningsCleared: number;
  activityLogsCleared: number;
  callLogsCleared: number;
} {
  const cutoff = Date.now() - Math.max(60 * 1000, maxAgeMs);
  let warningsCleared = 0;
  let activityLogsCleared = 0;
  let callLogsCleared = 0;
  let dirty = false;

  if (db.warnings && typeof db.warnings === 'object') {
    for (const [k, w] of Object.entries(db.warnings)) {
      if (!w || (w.lastViolation || 0) < cutoff) {
        delete db.warnings[k];
        warningsCleared++;
        dirty = true;
      } else if (Array.isArray(w.violations)) {
        const fresh = w.violations.filter((v) => (v?.timestamp || 0) >= cutoff);
        if (fresh.length !== w.violations.length) {
          w.violations = fresh;
          dirty = true;
        }
      }
    }
  }

  if (Array.isArray(db.activityLogs) && db.activityLogs.length > 0) {
    const beforeLen = db.activityLogs.length;
    db.activityLogs = db.activityLogs.filter((l) => (l?.timestamp || 0) >= cutoff);
    activityLogsCleared = beforeLen - db.activityLogs.length;
    if (activityLogsCleared > 0) dirty = true;
  }

  if (Array.isArray(db.callLogs) && db.callLogs.length > 0) {
    const beforeCallLen = db.callLogs.length;
    db.callLogs = db.callLogs.filter((c) => (c?.timestamp || 0) >= cutoff);
    callLogsCleared = beforeCallLen - db.callLogs.length;
    if (callLogsCleared > 0) dirty = true;
  }

  if (dirty) {
    saveDatabase();
  }
  return { warningsCleared, activityLogsCleared, callLogsCleared };
}

export function clearAllModerationHistories(): {
  warningsCleared: number;
  activityLogsCleared: number;
  callLogsCleared: number;
} {
  const warningsCleared = db.warnings ? Object.keys(db.warnings).length : 0;
  const activityLogsCleared = Array.isArray(db.activityLogs) ? db.activityLogs.length : 0;
  const callLogsCleared = Array.isArray(db.callLogs) ? db.callLogs.length : 0;
  db.warnings = {};
  db.activityLogs = [];
  db.callLogs = [];
  pendingServerProblems.length = 0;
  lastServerProblemAlertAt.clear();
  saveDatabase();
  return { warningsCleared, activityLogsCleared, callLogsCleared };
}

export function addActivityLog(log: Omit<ActivityLog, 'id' | 'timestamp'>, opts?: { skipSave?: boolean }) {
  const now = Date.now();
  if (log.action === 'error') {
    for (let i = db.activityLogs.length - 1; i >= Math.max(0, db.activityLogs.length - 12); i--) {
      const existing = db.activityLogs[i];
      if (
        existing.action === 'error' &&
        existing.groupId === log.groupId &&
        existing.reason === log.reason &&
        now - existing.timestamp < 15 * 60 * 1000
      ) {
        existing.timestamp = now;
        existing.details = log.details;
        if (!opts?.skipSave) saveDatabase();
        return;
      }
    }
  }

  const newLog: ActivityLog = {
    ...log,
    id: 'log_' + now + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
  };
  db.activityLogs.push(newLog);
  if (db.activityLogs.length > 150) {
    db.activityLogs = db.activityLogs.slice(-150);
  }
  if (!opts?.skipSave) {
    saveDatabase();
  }
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

setInboxIdentityResolver(({ groupId, senderJid, senderAltJid, pushName }) => {
  const meta = getCachedGroupMetadataSync(groupId);
  const groupName = meta?.subject || undefined;

  rememberLidPnPair(senderJid, senderAltJid);

  let resolvedPhone = '';
  for (const cand of [senderAltJid, senderJid]) {
    if (!cand) continue;
    const cu = String(cand).split('@')[0].split(':')[0].trim();
    if (!cu) continue;
    if (String(cand).toLowerCase().includes('@lid')) {
      const mapped = lidToPnUserMap.get(cu);
      if (mapped) {
        resolvedPhone = mapped;
        break;
      }
    } else if (/^\d{8,15}$/.test(cu)) {
      resolvedPhone = cu;
      break;
    }
  }
  if (!resolvedPhone && senderJid) {
    resolvedPhone = String(senderJid).split('@')[0].split(':')[0].trim();
  }

  const candUsers = new Set<string>();
  for (const cand of [senderJid, senderAltJid, resolvedPhone]) {
    if (!cand) continue;
    const cu = String(cand).split('@')[0].split(':')[0].trim();
    if (cu) candUsers.add(cu);
  }

  let resolvedName = '';
  for (const cu of candUsers) {
    if (contactNamesCache[cu]) {
      resolvedName = contactNamesCache[cu];
      break;
    }
  }
  if (!resolvedName && Array.isArray(meta?.participants)) {
    for (const p of meta.participants) {
      const pId = String((p as any).id || '').split('@')[0].split(':')[0];
      const pPn = String((p as any).phoneNumber || '').split('@')[0].split(':')[0];
      if (candUsers.has(pId) || (pPn && candUsers.has(pPn))) {
        const pName = String((p as any).notify || (p as any).name || '').trim();
        if (pName) {
          resolvedName = pName;
          break;
        }
      }
    }
  }
  if (!resolvedName && pushName) {
    resolvedName = String(pushName).trim();
  }

  return {
    groupName,
    senderName: resolvedName || undefined,
    senderPhone: resolvedPhone || undefined,
  };
});

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

export function resolveCanonicalUserIdSync(senderJid?: string | null, senderAltJid?: string | null): string {
  rememberLidPnPair(senderJid, senderAltJid);
  for (const raw of [senderAltJid, senderJid]) {
    if (!raw) continue;
    const str = String(raw).trim();
    const cu = cleanJidUser(str);
    if (!cu) continue;
    if (isLidJid(str)) {
      const mappedPn = lidToPnUserMap.get(cu);
      if (mappedPn) return mappedPn;
    } else if (isPnJid(str) || /^\d{10,15}$/.test(cu)) {
      return normalizePhoneDigits(cu) || cu;
    }
  }
  const fallback = cleanJidUser(senderAltJid || senderJid);
  return lidToPnUserMap.get(fallback) || fallback || normalizeJid(senderAltJid || senderJid || '');
}

function expandIdSetWithLidMaps(users: Set<string>, normalized?: Set<string>) {
  for (const id of Array.from(users)) {
    const mappedPn = lidToPnUserMap.get(id);
    if (mappedPn) {
      users.add(mappedPn);
      normalized?.add(`${mappedPn}@s.whatsapp.net`);
    }
    const mappedLid = pnToLidUserMap.get(id);
    if (mappedLid) {
      users.add(mappedLid);
      normalized?.add(`${mappedLid}@lid`);
    }
    const normDigits = /^\d{10,15}$/.test(id) ? normalizePhoneDigits(id) : '';
    if (normDigits && normDigits !== id) {
      users.add(normDigits);
      normalized?.add(`${normDigits}@s.whatsapp.net`);
      const lidFromNorm = pnToLidUserMap.get(normDigits);
      if (lidFromNorm) {
        users.add(lidFromNorm);
        normalized?.add(`${lidFromNorm}@lid`);
      }
    }
  }
}

export function collectKnownBotUsersSync(sock?: WASocket | null): { botUsers: Set<string>; botNormalized: Set<string> } {
  rememberLidPnPair(sock?.user?.id, sock?.user?.lid);
  rememberLidPnPair(sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid);

  const botRawIds = [
    sock?.user?.id,
    sock?.user?.lid,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid,
  ].filter(Boolean) as string[];

  const botUsers = new Set<string>();
  const botNormalized = new Set<string>();

  for (const j of botRawIds) {
    const cu = cleanJidUser(j);
    if (cu) {
      botUsers.add(cu);
      if (!isLidJid(j)) {
        const pnDigits = normalizePhoneDigits(cu);
        if (pnDigits) botUsers.add(pnDigits);
      }
    }
    const norm = normalizeJid(j);
    if (norm) botNormalized.add(norm);
  }

  expandIdSetWithLidMaps(botUsers, botNormalized);
  return { botUsers, botNormalized };
}

export async function resolveBotIdentitySet(sock?: WASocket | null): Promise<{ botUsers: Set<string>; botNormalized: Set<string> }> {
  const { botUsers, botNormalized } = collectKnownBotUsersSync(sock);
  if (!sock) return { botUsers, botNormalized };

  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
  if (lidMappingApi) {
    // 1. Resolve PN -> LID for bot's own phone numbers (handles Baileys v7 @lid groups where sock.user.lid wasn't populated yet)
    if (typeof lidMappingApi.getLIDForPN === 'function') {
      const hasLidAlready = Array.from(botUsers).some((u) => lidToPnUserMap.has(u)) || Boolean(sock.user?.lid || sock.authState?.creds?.me?.lid);
      if (!hasLidAlready) {
        const pnCandidates = [sock.user?.id, sock.authState?.creds?.me?.id].filter((j): j is string => Boolean(j && !isLidJid(j)));
        for (const pnRaw of pnCandidates) {
          const pnClean = normalizePhoneDigits(cleanJidUser(pnRaw)) || cleanJidUser(pnRaw);
          if (!pnClean) continue;
          try {
            const lookedUpLid = await Promise.race([
              lidMappingApi.getLIDForPN(`${pnClean}@s.whatsapp.net`),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
            ]);
            if (lookedUpLid) {
              rememberLidPnPair(lookedUpLid, `${pnClean}@s.whatsapp.net`);
              const lidUser = cleanJidUser(lookedUpLid);
              if (lidUser) {
                botUsers.add(lidUser);
                botNormalized.add(normalizeJid(lookedUpLid));
              }
            }
          } catch {}
        }
      }
    }

    // 2. Resolve LID -> PN if only LID was known
    if (typeof lidMappingApi.getPNForLID === 'function') {
      const lidCandidates = [sock.user?.lid, sock.authState?.creds?.me?.lid, sock.user?.id, sock.authState?.creds?.me?.id].filter(
        (j): j is string => Boolean(j && isLidJid(j))
      );
      for (const lidRaw of lidCandidates) {
        const lidClean = cleanJidUser(lidRaw);
        if (!lidClean || lidToPnUserMap.has(lidClean)) continue;
        try {
          const lookedUpPn = await Promise.race([
            lidMappingApi.getPNForLID(`${lidClean}@lid`),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
          ]);
          if (lookedUpPn) {
            rememberLidPnPair(`${lidClean}@lid`, lookedUpPn);
            const pnClean = normalizePhoneDigits(cleanJidUser(lookedUpPn)) || cleanJidUser(lookedUpPn);
            if (pnClean) {
              botUsers.add(pnClean);
              botNormalized.add(`${pnClean}@s.whatsapp.net`);
            }
          }
        } catch {}
      }
    }
  }

  expandIdSetWithLidMaps(botUsers, botNormalized);
  return { botUsers, botNormalized };
}

function learnGroupParticipantsLidPn(meta: any) {
  if (!meta || !Array.isArray(meta.participants)) return;
  for (const p of meta.participants) {
    if (!p) continue;
    const lidCand = p.lid || (isLidJid(p.id) ? p.id : '');
    const pnCand = p.phoneNumber || p.pn || (isPnJid(p.id) ? p.id : p.jid && isPnJid(p.jid) ? p.jid : '');
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
    if (cu) {
      candidateUsers.add(cu);
      if (!isLidJid(cand)) {
        const pnDigits = normalizePhoneDigits(cu);
        if (pnDigits) candidateUsers.add(pnDigits);
      }
    }
  }
  expandIdSetWithLidMaps(candidateUsers);

  for (const ck of candidateKeys) {
    if (db.restrictedUsers[ck]) {
      return { key: ck, restriction: db.restrictedUsers[ck] };
    }
  }

  // Fallback: match stored altJid or clean user digits (including LID <-> PN mappings) in the same group
  for (const [storedKey, entry] of Object.entries(db.restrictedUsers)) {
    if (entry.groupId !== groupId) continue;
    const entryUsers = new Set<string>();
    for (const raw of [entry.senderJid, entry.altJid, entry.senderPhone]) {
      if (!raw) continue;
      const cu = cleanJidUser(raw);
      if (cu) {
        entryUsers.add(cu);
        if (!isLidJid(raw)) {
          const pnDigits = normalizePhoneDigits(cu);
          if (pnDigits) entryUsers.add(pnDigits);
        }
      }
    }
    expandIdSetWithLidMaps(entryUsers);
    for (const u of entryUsers) {
      if (candidateUsers.has(u)) {
        return { key: storedKey, restriction: entry };
      }
    }
  }

  return null;
}

const recentExtendedMsgIds = new Map<string, number>();
const expiringRestrictionKeys = new Set<string>();

function formatRestrictionExpirySummary(user: RestrictedUser): string {
  const baseMins = Math.max(
    1,
    Number(user.durationMinutes || Math.round((user.expiresAt - user.restrictedAt) / 60000) || 10)
  );
  const addedMins = Math.max(0, Number(user.addedMinutesCount || 0));
  const totalMins = baseMins + addedMins;
  if (addedMins > 0) {
    return `${totalMins} মিনিটের (মূল ${baseMins} মি. + ${addedMins} মি. জরিমানা)`;
  }
  return `${baseMins} মিনিটের`;
}

function liftExpiredRestriction(
  key: string,
  restriction: RestrictedUser,
  sockGetter?: () => WASocket | null
) {
  if (!db.restrictedUsers?.[key]) return;
  delete db.restrictedUsers[key];
  saveDatabase();

  if (expiringRestrictionKeys.has(key)) return;
  expiringRestrictionKeys.add(key);
  setTimeout(() => expiringRestrictionKeys.delete(key), 30000);

  const durationLabel = formatRestrictionExpirySummary(restriction);
  addActivityLog({
    groupId: restriction.groupId,
    groupName: restriction.groupName || getKnownGroupSubjectFallback(restriction.groupId),
    senderJid: restriction.senderJid,
    senderPhone: restriction.senderPhone,
    action: 'unmuted',
    reason: `সাময়িক রেস্ট্রিকশনের মেয়াদ শেষ হয়েছে (${durationLabel} — Auto Lifted)`,
  });

  const activeGetter = sockGetter || globalSocketGetter;
  if (activeGetter) {
    const sock = activeGetter();
    if (sock && sock.authState?.creds?.registered) {
      const settings = getSettings();
      if (!settings.silentModeration) {
        safeSendMessage(sock, restriction.groupId, {
          text: `🔔 *মেসেজিং বিরতি সমাপ্ত*\n\n👤 @${restriction.senderPhone}\n✅ আপনার ${durationLabel} সাময়িক নীরবতার সময় শেষ হয়েছে। এখন থেকে পুনরায় গ্রুপে মেসেজ পাঠাতে পারবেন।`,
          mentions: [restriction.senderJid],
        }).catch(() => {});
      }
    }
  }
}

export async function sendOneTimeBlockExtensionNotice(
  sock: WASocket | null,
  params: {
    groupId: string;
    senderJid: string;
    senderAltJid?: string;
    senderPhone: string;
    remainingMs: number;
  }
): Promise<boolean> {
  if (!sock || !sock.authState?.creds?.registered) return false;
  const settings = getSettings();
  if (settings.silentModeration) return false;

  const remainingMins = Math.max(1, Math.ceil((params.remainingMs || 60000) / 60000));
  const mentions = Array.from(
    new Set([normalizeJid(params.senderJid), params.senderAltJid ? normalizeJid(params.senderAltJid) : ''].filter(Boolean))
  );
  const hideName = Boolean(settings.hideNameOnDelete);
  return await safeSendMessage(sock, params.groupId, {
    text: hideName
      ? `⏳ *ব্লক সময় বৃদ্ধি নোটিশ*\n\n🚫 আপনি বর্তমানে মেসেজ ব্লক অবস্থায় আছেন! ব্লক অবস্থায় কোনো মেসেজ বা স্টিকার পাঠালে সেটি অটো-ডিলিট হবে এবং **প্রতিটি মেসেজে ব্লকের সময় +১ মিনিট করে যোগ হবে**।\n⏱️ বর্তমান বাকি সময়: প্রায় ${remainingMins} মিনিট\n\n📌 *(এই সতর্কবার্তাটি শুধু একবারই দেওয়া হলো — এরপর থেকে প্রতি মেসেজে নীরবে +১ মিনিট করে যোগ হতে থাকবে)*`
      : `⏳ *ব্লক সময় বৃদ্ধি নোটিশ*\n\n👤 @${params.senderPhone}\n🚫 আপনি বর্তমানে মেসেজ ব্লক অবস্থায় আছেন! ব্লক অবস্থায় কোনো মেসেজ বা স্টিকার পাঠালে সেটি অটো-ডিলিট হবে এবং **প্রতিটি মেসেজে ব্লকের সময় +১ মিনিট করে যোগ হবে**।\n⏱️ বর্তমান বাকি সময়: প্রায় ${remainingMins} মিনিট\n\n📌 *(এই সতর্কবার্তাটি শুধু একবারই দেওয়া হলো — এরপর থেকে প্রতি মেসেজে নীরবে +১ মিনিট করে যোগ হতে থাকবে)*`,
    ...(hideName ? {} : { mentions }),
  });
}

export function extendRestrictionBySeconds(
  groupId: string,
  senderJid: string,
  extraJids: string[] = [],
  addSeconds: number = 60,
  messageId?: string,
  opts?: { isStickerBurst?: boolean }
): {
  extended: boolean;
  expiresAt: number;
  remainingMs: number;
  addedMinutesCount: number;
  shouldSendOneTimeNotice: boolean;
} {
  if (!db.restrictedUsers) {
    return { extended: false, expiresAt: 0, remainingMs: 0, addedMinutesCount: 0, shouldSendOneTimeNotice: false };
  }
  const found = findRestrictionEntry(groupId, senderJid, extraJids);
  if (!found) {
    return { extended: false, expiresAt: 0, remainingMs: 0, addedMinutesCount: 0, shouldSendOneTimeNotice: false };
  }

  const now = Date.now();
  if (found.restriction.expiresAt <= now) {
    return {
      extended: false,
      expiresAt: found.restriction.expiresAt,
      remainingMs: 0,
      addedMinutesCount: found.restriction.addedMinutesCount || 0,
      shouldSendOneTimeNotice: false,
    };
  }

  if (messageId) {
    const dedupKey = `${groupId}:${messageId}`;
    const prevTs = recentExtendedMsgIds.get(dedupKey);
    if (prevTs && now - prevTs < 10 * 60 * 1000) {
      return {
        extended: false,
        expiresAt: found.restriction.expiresAt,
        remainingMs: Math.max(0, found.restriction.expiresAt - now),
        addedMinutesCount: found.restriction.addedMinutesCount || 0,
        shouldSendOneTimeNotice: false,
      };
    }
    recentExtendedMsgIds.set(dedupKey, now);
    if (recentExtendedMsgIds.size > 1200) {
      for (const [k, ts] of recentExtendedMsgIds.entries()) {
        if (now - ts > 10 * 60 * 1000) recentExtendedMsgIds.delete(k);
      }
    }
  }

  const addMs = Math.max(1000, Math.round(addSeconds * 1000));
  const maxCap = now + 24 * 60 * 60 * 1000;
  found.restriction.expiresAt = Math.min(maxCap, found.restriction.expiresAt + addMs);
  found.restriction.violationCount = (found.restriction.violationCount || 1) + 1;
  found.restriction.addedMinutesCount = (found.restriction.addedMinutesCount || 0) + Math.max(1, Math.round(addSeconds / 60));

  let shouldSendOneTimeNotice = false;
  if (!found.restriction.extensionNoticeSentAt) {
    // Wait 2s only for rapid initial sticker bursts so we don't clash with the initial spam alert,
    // while sending immediately for any follow-up message or manual block attempt.
    const isSameInstantSpamBurst = Boolean(opts?.isStickerBurst) && now - found.restriction.restrictedAt < 2000;
    if (!isSameInstantSpamBurst) {
      found.restriction.extensionNoticeSentAt = now;
      shouldSendOneTimeNotice = true;
    }
  }

  saveDatabase();

  return {
    extended: true,
    expiresAt: found.restriction.expiresAt,
    remainingMs: Math.max(0, found.restriction.expiresAt - now),
    addedMinutesCount: found.restriction.addedMinutesCount,
    shouldSendOneTimeNotice,
  };
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
    liftExpiredRestriction(key, restriction);
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
  const cleanDur = Math.max(1, Math.round(Number(durationMinutes || 10)));
  const expiresAt = now + cleanDur * 60 * 1000;
  const canonical = resolveCanonicalUserIdSync(senderJid, altJid);
  const key = getRestrictedUserKey(groupId, canonical || senderJid);

  let prevCount = db.restrictedUsers[key]?.violationCount || 0;
  // Remove any stale LID/PN duplicate restriction entries for the same member in this group
  for (let i = 0; i < 4; i++) {
    const existing = findRestrictionEntry(groupId, senderJid, [altJid || '', canonical].filter(Boolean));
    if (!existing) break;
    prevCount = Math.max(prevCount, existing.restriction.violationCount || 0);
    delete db.restrictedUsers[existing.key];
  }

  const restriction: RestrictedUser = {
    groupId,
    groupName,
    senderJid: normalizeJid(canonical || senderJid),
    altJid: altJid ? normalizeJid(altJid) : normalizeJid(senderJid) !== normalizeJid(canonical || senderJid) ? normalizeJid(senderJid) : undefined,
    senderPhone,
    restrictedAt: now,
    expiresAt,
    durationMinutes: cleanDur,
    addedMinutesCount: 0,
    extensionNoticeSentAt: undefined,
    reason,
    violationCount: prevCount + 1,
  };

  db.restrictedUsers[key] = restriction;
  db.stats.individualMutesTriggered = (db.stats.individualMutesTriggered || 0) + 1;
  saveDatabase();

  addActivityLog({
    groupId,
    groupName,
    senderJid: restriction.senderJid,
    senderPhone,
    action: 'restricted',
    reason: `Individual Temporary Mute (${cleanDur} মিনিট): ${reason}`,
    details: `${cleanDur} মিনিটের জন্য গ্রুপের সকল নতুন মেসেজ স্বয়ংক্রিয়ভাবে মুছে দেওয়া হবে`,
  });

  return restriction;
}

export function unrestrictUser(
  groupId: string,
  senderJid: string,
  extraJids: string[] = [],
  quotedMsg?: any
): boolean {
  if (!db.restrictedUsers) return false;

  let removedAny = false;
  let lastRestriction: RestrictedUser | null = null;
  for (let i = 0; i < 4; i++) {
    const found = findRestrictionEntry(groupId, senderJid, extraJids);
    if (!found) break;
    lastRestriction = found.restriction;
    delete db.restrictedUsers[found.key];
    removedAny = true;
  }

  if (removedAny && lastRestriction) {
    saveDatabase();

    addActivityLog({
      groupId,
      groupName: lastRestriction.groupName || getKnownGroupSubjectFallback(groupId),
      senderJid: lastRestriction.senderJid,
      senderPhone: lastRestriction.senderPhone,
      action: 'unmuted',
      reason: 'সাময়িক মেসেজ ব্লক তুলে নেওয়া হয়েছে (Manual Unblock)',
    });

    if (globalSocketGetter) {
      const sock = globalSocketGetter();
      const settings = getSettings();
      if (sock && sock.authState?.creds?.registered && !settings.silentModeration) {
        const hideName = Boolean(settings.hideNameOnDelete);
        safeSendMessage(
          sock,
          groupId,
          {
            text: hideName
              ? `✅ *মেসেজ ব্লক প্রত্যাহার*\n\nসদস্য এখন থেকে আবার স্বাভাবিকভাবে গ্রুপে মেসেজ পাঠাতে পারবেন।`
              : `✅ *মেসেজ ব্লক প্রত্যাহার*\n\n👤 @${lastRestriction.senderPhone}\nএখন থেকে আপনি আবার স্বাভাবিকভাবে গ্রুপে মেসেজ পাঠাতে পারবেন।`,
            ...(hideName ? {} : { mentions: [lastRestriction.senderJid] }),
          },
          quotedMsg ? { quoted: quotedMsg } : undefined
        ).catch(() => {});
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
      liftExpiredRestriction(key, user);
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

  setInterval(() => {
    if (!db.restrictedUsers) return;
    const now = Date.now();
    for (const [key, user] of Object.entries(db.restrictedUsers)) {
      if (now >= user.expiresAt) {
        console.log(`[Individual Mute] Restriction expired for @${user.senderPhone} in ${user.groupName}. Auto-lifted.`);
        liftExpiredRestriction(key, user, sockGetter || globalSocketGetter || undefined);
      }
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

    const sentMsg = await sock.sendMessage(jid, content, options);

    if (jid.endsWith('@g.us') && !content?.delete) {
      const outText = String(content?.text || content?.caption || '').trim();
      if (outText) {
        captureBotOutgoingGroupMessage({
          groupId: jid,
          groupName: getCachedGroupMetadataSync(jid)?.subject,
          messageId: sentMsg?.key?.id || undefined,
          senderJid: sock?.user?.id,
          text: outText,
        });
      }
    }

    if (shouldShowTyping) {
      sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    if (!options?.isRecoveryNotice) {
      for (const transientCat of ['wa_send_429', 'wa_send_500', 'wa_send_502', 'wa_send_503', 'wa_send_504']) {
        if (activeProblemsMap.has(transientCat)) {
          resolveServerProblem(transientCat, {
            details: 'WhatsApp মেসেজ ডেলিভারি ও সার্ভার রেসপন্স এখন সম্পূর্ণ স্বাভাবিক রয়েছে।',
            thanksNote: 'ধন্যবাদ বস! সাময়িক সার্ভার জট কেটে গেছে এবং মেসেজ পাঠানো স্বাভাবিক হয়েছে।',
            sock,
          }).catch(() => {});
        }
      }
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

export function getAuthorizedServerAdminDigitsList(): string[] {
  const settings = getSettings();
  const primary = normalizePhoneDigits(
    settings.bossAdminNumber ?? DEFAULT_SETTINGS.bossAdminNumber ?? '8801632222592'
  );
  const secondary = normalizePhoneDigits(
    settings.secondAdminNumber ?? DEFAULT_SETTINGS.secondAdminNumber ?? '8801346561627'
  );
  const list: string[] = [];
  if (primary && primary.length >= 10) list.push(primary);
  if (secondary && secondary.length >= 10 && !list.includes(secondary)) list.push(secondary);
  return list.length > 0 ? list : ['8801632222592', '8801346561627'];
}

function extractQuotedContextInfo(realMsg: any, rawMsg?: any): any {
  const inspectObj = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return null;
    const directContainers = [
      obj?.extendedTextMessage?.contextInfo,
      obj?.imageMessage?.contextInfo,
      obj?.videoMessage?.contextInfo,
      obj?.audioMessage?.contextInfo,
      obj?.documentMessage?.contextInfo,
      obj?.stickerMessage?.contextInfo,
      obj?.contextInfo,
    ];
    for (const c of directContainers) {
      if (c?.stanzaId) return c;
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val) && (val as any)?.contextInfo?.stanzaId) {
        return (val as any).contextInfo;
      }
    }
    return null;
  };

  const hit = inspectObj(realMsg);
  if (hit) return hit;

  if (rawMsg?.message && rawMsg.message !== realMsg) {
    let cursor: any = rawMsg.message;
    for (let depth = 0; depth < 6 && cursor && typeof cursor === 'object'; depth++) {
      const nestedHit = inspectObj(cursor);
      if (nestedHit) return nestedHit;
      cursor =
        cursor?.ephemeralMessage?.message ||
        cursor?.groupMentionedMessage?.message ||
        cursor?.associatedChildMessage?.message ||
        cursor?.documentWithCaptionMessage?.message ||
        cursor?.editedMessage?.message ||
        cursor?.viewOnceMessage?.message ||
        cursor?.viewOnceMessageV2?.message ||
        null;
    }
  }
  return null;
}

function isAdminReplyDeleteCommand(text: string): boolean {
  const cleaned = (text || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned.length > 50) return false;
  const noPunct = cleaned.replace(/[!.,।?~`'"()]+$/g, '').replace(/^[!./]+/, '').trim();
  if (!noPunct) return false;

  const exactOrShortRx =
    /^(?:(?:এই|এইটা|এটা|ওটা|ওইটা|মেসেজ|মেসেজটা|ভয়েস|ভয়েস|ভয়েসটা|ভয়েসটা|অডিও|স্টিকার|ছবি|ভিডিও|লিংক|প্লিজ|please|pls|bhai|vai|bro|eta|oita|msg|message|voice|audio|sticker|photo|video|link|this|it)\s+)*(?:রিমুভ|রিমুব|রিমিউভ|ডিলিট|মুছে দাও|মুছে ফেলো|মুছে ফেল|মুছো|remove|rmv|rimuv|rimub|delete|dlt|del)(?:\s+(?:কর|করো|করেন|করে দাও|দাও|ফেল|ফেলো|প্লিজ|koro|kor|koren|kore dao|dao|please|pls|it|this|now))?$/iu;

  return exactOrShortRx.test(noPunct);
}

async function isAuthorizedServerAdminSender(
  sock: WASocket,
  groupId: string,
  senderJid: string,
  senderAltJid?: string,
  rawMsg?: proto.IWebMessageInfo
): Promise<{ authorized: boolean; adminPhone?: string }> {
  const authorizedDigits = getAuthorizedServerAdminDigitsList();
  const candidates = new Set<string>();

  const addCandidate = (raw?: string | null) => {
    if (!raw) return;
    const cu = cleanJidUser(raw);
    if (cu) candidates.add(cu);
    if (!isLidJid(raw)) {
      const nu = normalizePhoneDigits(cu || raw);
      if (nu) candidates.add(nu);
    }
  };

  addCandidate(senderJid);
  addCandidate(senderAltJid);
  addCandidate((rawMsg?.key as any)?.participantPn);

  for (const c of Array.from(candidates)) {
    const mappedPn = lidToPnUserMap.get(c);
    if (mappedPn) {
      candidates.add(mappedPn);
      const nu = normalizePhoneDigits(mappedPn);
      if (nu) candidates.add(nu);
    }
    const mappedLid = pnToLidUserMap.get(c);
    if (mappedLid) candidates.add(mappedLid);
  }

  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
  if (isLidJid(senderJid) && typeof lidMappingApi?.getPNForLID === 'function') {
    try {
      const lookedUpPn = await lidMappingApi.getPNForLID(senderJid);
      if (lookedUpPn) {
        rememberLidPnPair(senderJid, lookedUpPn);
        addCandidate(lookedUpPn);
      }
    } catch {}
  }

  const matchDigits = () => {
    for (const auth of authorizedDigits) {
      if (candidates.has(auth)) return auth;
      const authLid = pnToLidUserMap.get(auth);
      if (authLid && candidates.has(authLid)) return auth;
    }
    return null;
  };

  const quickHit = matchDigits();
  if (quickHit) return { authorized: true, adminPhone: quickHit };

  // Fallback: inspect group metadata (refresh once if sender wasn't mapped yet)
  let meta = await getGroupMeta(sock, groupId, false).catch(() => null);
  learnGroupParticipantsLidPn(meta);
  const checkMeta = (m: any) => {
    const parts: any[] = Array.isArray(m?.participants) ? m.participants : [];
    for (const p of parts) {
      const pJids = [p.id, p.lid, p.phoneNumber].filter(Boolean) as string[];
      const matchesSender = pJids.some((j) => {
        const cu = cleanJidUser(j);
        const nu = !isLidJid(j) ? normalizePhoneDigits(cu) : '';
        return candidates.has(cu) || (nu && candidates.has(nu));
      });
      if (matchesSender) {
        for (const j of pJids) addCandidate(j);
      }
    }
    return matchDigits();
  };

  let metaHit = checkMeta(meta);
  if (!metaHit) {
    meta = await getGroupMeta(sock, groupId, true).catch(() => null);
    learnGroupParticipantsLidPn(meta);
    metaHit = checkMeta(meta);
  }

  if (metaHit) return { authorized: true, adminPhone: metaHit };
  return { authorized: false };
}

type ServerAdminCommandAction =
  | { type: 'remove_msg' }
  | { type: 'kick' }
  | { type: 'black'; durationMinutes: number }
  | { type: 'unblock' }
  | { type: 'rules' }
  | { type: 'warn' }
  | { type: 'resetwarn'; allInGroup: boolean }
  | { type: 'lock'; durationMinutes?: number }
  | { type: 'unlock' }
  | { type: 'promote' }
  | { type: 'demote' }
  | { type: 'tagall'; customText: string }
  | { type: 'toggle'; key: keyof ModerationSettings; label: string; value: boolean }
  | { type: 'master_notices'; enable: boolean }
  | { type: 'status' }
  | { type: 'help' };

function normalizeCommandDigits(input: string): string {
  const bnMap: Record<string, string> = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };
  return (input || '').replace(/[০-৯]/g, (d) => bnMap[d] || d);
}

function extractInlinePhoneNumbers(text: string): string[] {
  const normalized = normalizeCommandDigits(text || '');
  const results: string[] = [];
  const matches = normalized.matchAll(/(?:\+?88)?01[3-9][\d\s-]{7,10}\d|\+?[1-9][\d\s-]{9,15}\d/g);
  for (const m of matches) {
    const digits = normalizePhoneDigits(m[0]);
    if (digits.length >= 10 && digits.length <= 15 && !results.includes(digits)) {
      results.push(digits);
    }
  }
  return results;
}

function parseServerAdminGroupCommand(
  text: string,
  hasQuotedMessage: boolean,
  hasMentions = false
): ServerAdminCommandAction | null {
  const rawNormalized = normalizeCommandDigits(text || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim();
  if (!rawNormalized || rawNormalized.length > 220) return null;

  const hasExplicitPrefix = /^[.!\/]/.test(rawNormalized);
  const withoutPrefix = rawNormalized.replace(/^[.!\/]+/, '').trim();
  if (!withoutPrefix) return null;

  // Handle tagall early so custom announcement text after keyword is preserved
  const tagallMatch = withoutPrefix.match(/^(?:tagall|hidetag|mention\s*all|সবাইকে\s*মেনশন|ট্যাগঅল|ট্যাগ\s*অল)(?:\s+([\s\S]+))?$/iu);
  if (tagallMatch) {
    return { type: 'tagall', customText: (tagallMatch[1] || '').trim() };
  }

  // Strip @mentions (e.g., @8801712345678, @User) and trailing punctuation for strict command keyword matching
  const withoutMentions = withoutPrefix
    .replace(/@\+?[\d][\d\s-]{6,17}\d/g, ' ')
    .replace(/@[^\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract standalone phone numbers (10+ digits) cleanly before checking short numbers (duration)
  const withoutPhones = withoutMentions
    .replace(/(?:\+?88)?01[3-9][\d\s-]{7,10}\d|\+?[1-9][\d\s-]{9,15}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract optional minute duration like "15", "30m", "20 min", "১০ মিনিট"
  let parsedMinutes: number | undefined;
  const durMatch = withoutPhones.match(/\b(\d{1,3})\s*(?:m|min|mins|minute|minutes|মি|মিনিট)?\b/iu);
  if (durMatch) {
    const val = Number(durMatch[1]);
    if (Number.isFinite(val) && val >= 1 && val <= 180) {
      parsedMinutes = val;
    }
  }

  const cmdCore = withoutPhones
    .replace(/\b\d{1,3}\s*(?:m|min|mins|minute|minutes|মি|মিনিট)?\b/giu, ' ')
    .replace(/[!.,।?~`'"()]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Fallback check for @Display Name with spaces (e.g., "@Md Karim কিক" or "কিক @Md Karim")
  const matchCmdString = (candidate: string): ServerAdminCommandAction | null => {
    if (!candidate) return null;

    // 1. Reply-to-delete message/voice ("রিমুভ" / "remove" / "ডিলিট")
    if (hasQuotedMessage && isAdminReplyDeleteCommand(candidate)) {
      return { type: 'remove_msg' };
    }

    const optTargetPrefix = '(?:(?:কে|রে|এর|টাকে|টারে|ওকে|একে|তাকে|মেম্বারকে|এইটাকে|এরে|please|pls|bhai|vai)\\s+)*';

    // 2. Kick member ("কিক", "kick", "kickout", "ban", "ব্যান", "বের করো")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:kick|kickout|kick\\s*out|ban|কিক|ব্যান|বের\\s*করো?|গ্রুপ\\s*থেকে\\s*বের\\s*করো?)(?:\\s+(?:কর|করো|করেন|দাও|করে\\s*দাও|please|pls|him|her|this|now))?$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'kick' };
    }

    // 3. Block / Black / Mute member ("black", "ব্ল্যাক", "block", "ব্লক", "mute", "মিউট")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:black|blak|block|blok|mute|ব্ল্যাক|ব্লাক|ব্লক|মিউট)(?:\\s+(?:কর|করো|করেন|দাও|করে\\s*দাও|please|pls|him|her|now|for))?$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'black', durationMinutes: parsedMinutes ?? 10 };
    }

    // 4. Unblock / Unmute member ("unblock", "আনব্লক", "unblack", "unmute", "আনমিউট")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:unblock|unblok|unblack|unblak|unmute|আনব্লক|আনব্ল্যাক|আনব্লাক|আনমিউট|ব্লক\\s*খোলো?|ব্লক\\s*সরাও|মিউট\\s*খোলো?)(?:\\s+(?:কর|করো|করেন|দাও|করে\\s*দাও|please|pls|him|her|now))?$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'unblock' };
    }

    // 5. Group Rules ("rules", "রোলস", "রুলস", "নিয়ম", "গ্রুপ রুলস")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:group\\s*)?(?:rules|rule|grouprules|রুলস|রোলস|রোল|নিয়ম|নিয়ম|নিয়মাবলী|নিয়মাবলী|গ্রুপ\\s*রুলস|গ্রুপ\\s*রোলস|গ্রুপের\\s*নিয়ম|গ্রুপের\\s*নিয়ম)(?:\\s+(?:দাও|দেও|দেখাও|পাঠাও|send|show))?$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'rules' };
    }

    // 6. Reset Warning ("resetwarn", "unwarn", "clearwarn", "ওয়ার্ন রিসেট", "সতর্কতা রিসেট")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:reset\\s*warn|resetwarn|unwarn|clear\\s*warn|clearwarn|ওয়ার্ন\\s*রিসেট|ওয়ার্ন\\s*রিসেট|রিসেট\\s*ওয়ার্ন|রিসেট\\s*ওয়ার্ন|সতর্কতা\\s*রিসেট|রিসেট\\s*সতর্কতা)(?:\\s+(?:all|সব|সবার|করো?))?$`,
        'iu'
      ).test(candidate)
    ) {
      const allInGroup = /\b(?:all|সব|সবার)\b/iu.test(candidate);
      return { type: 'resetwarn', allInGroup };
    }

    // 7. Warn member ("warn", "ওয়ার্ন", "ওয়ার্ন", "সতর্ক")
    if (
      new RegExp(
        `^${optTargetPrefix}(?:warn|warning|ওয়ার্ন|ওয়ার্ন|ওয়ার্নিং|ওয়ার্নিং|সতর্ক|সতর্কতা)(?:\\s+(?:কর|করো|দাও))?$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'warn' };
    }

    // 8. Lock / Unlock Group
    if (/^(?:group\s*)?(?:lock|লক|গ্রুপ\s*লক|গ্রুপ\s*বন্ধ(?:\s*করো?)?|close\s*group)$/iu.test(candidate)) {
      return { type: 'lock', durationMinutes: parsedMinutes };
    }
    if (/^(?:group\s*)?(?:unlock|আনলক|গ্রুপ\s*আনলক|গ্রুপ\s*খোলো|গ্রুপ\s*খুলো|open\s*group)$/iu.test(candidate)) {
      return { type: 'unlock' };
    }

    // 9. Promote / Demote Group Admin
    if (
      new RegExp(
        `^${optTargetPrefix}(?:promote|make\\s*admin|অ্যাডমিন\\s*বানাও|এডমিন\\s*বানাও|এডমিন\\s*দাও|অ্যাডমিন\\s*দাও)$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'promote' };
    }
    if (
      new RegExp(
        `^${optTargetPrefix}(?:demote|unadmin|remove\\s*admin|অ্যাডমিন\\s*সরাও|এডমিন\\s*সরাও|অ্যাডমিন\\s*রিমুভ|এডমিন\\s*রিমুভ)$`,
        'iu'
      ).test(candidate)
    ) {
      return { type: 'demote' };
    }

    return null;
  };

  if (cmdCore) {
    const directMatch = matchCmdString(cmdCore);
    if (directMatch) return directMatch;

    // 9b. One-Tap All Notices ON/OFF ("notice on/off", "নোটিশ অন/অফ")
    const masterNoticeMatch = cmdCore.match(
      /^(?:notice|notices|allnotice|allnotices|নোটিশ|সব\s*নোটিশ)\s+(on|off|অন|অফ|চালু|বন্ধ|enable|disable)$/iu
    );
    if (masterNoticeMatch) {
      const stateToken = masterNoticeMatch[1].toLowerCase();
      const enable = ['on', 'অন', 'চালু', 'enable'].includes(stateToken);
      return { type: 'master_notices', enable };
    }

    // 10. Quick Feature Toggles ("antisticker on/off", "স্টিকার অফ", "antilink on/off", "লিংক অন", etc.)
    const toggleMatch = cmdCore.match(
      /^(antisticker|sticker|স্টিকার|antilink|link|লিংক|antibadword|badword|গালি|antivoice|voice|ভয়েস|ভয়েস|antiviewonce|viewonce|ভিউওয়ান্স|welcome|ওয়েলকাম|ওয়েলকাম|silent|সাইলেন্ট|hidename|নাম|maya|মায়া|মায়া)\s+(on|off|অন|অফ|চালু|বন্ধ|enable|disable)$/iu
    );
    if (toggleMatch) {
      const targetFeature = toggleMatch[1].toLowerCase();
      const stateToken = toggleMatch[2].toLowerCase();
      const enable = ['on', 'অন', 'চালু', 'enable'].includes(stateToken);
      const featureMap: Record<string, { key: keyof ModerationSettings; label: string }> = {
        antisticker: { key: 'antiSticker', label: 'Anti-Sticker' },
        sticker: { key: 'antiSticker', label: 'Anti-Sticker' },
        স্টিকার: { key: 'antiSticker', label: 'Anti-Sticker' },
        antilink: { key: 'antiLink', label: 'Anti-Link' },
        link: { key: 'antiLink', label: 'Anti-Link' },
        লিংক: { key: 'antiLink', label: 'Anti-Link' },
        antibadword: { key: 'antiBadword', label: 'Anti-Badword' },
        badword: { key: 'antiBadword', label: 'Anti-Badword' },
        গালি: { key: 'antiBadword', label: 'Anti-Badword' },
        antivoice: { key: 'voiceModerationEnabled', label: 'Voice AI Moderation' },
        voice: { key: 'voiceModerationEnabled', label: 'Voice AI Moderation' },
        ভয়েস: { key: 'voiceModerationEnabled', label: 'Voice AI Moderation' },
        ভয়েস: { key: 'voiceModerationEnabled', label: 'Voice AI Moderation' },
        antiviewonce: { key: 'antiViewOnce', label: 'Anti-View Once' },
        viewonce: { key: 'antiViewOnce', label: 'Anti-View Once' },
        ভিউওয়ান্স: { key: 'antiViewOnce', label: 'Anti-View Once' },
        welcome: { key: 'autoWelcome', label: 'Auto Welcome' },
        ওয়েলকাম: { key: 'autoWelcome', label: 'Auto Welcome' },
        ওয়েলকাম: { key: 'autoWelcome', label: 'Auto Welcome' },
        silent: { key: 'silentModeration', label: 'Silent Moderation' },
        সাইলেন্ট: { key: 'silentModeration', label: 'Silent Moderation' },
        hidename: { key: 'hideNameOnDelete', label: 'Hide Name on Delete' },
        নাম: { key: 'hideNameOnDelete', label: 'Hide Name on Delete' },
        maya: { key: 'mayaGroupReply', label: 'Maya Group AI Reply' },
        মায়া: { key: 'mayaGroupReply', label: 'Maya Group AI Reply' },
        মায়া: { key: 'mayaGroupReply', label: 'Maya Group AI Reply' },
      };
      const mapped = featureMap[targetFeature];
      if (mapped) {
        return { type: 'toggle', key: mapped.key, label: mapped.label, value: enable };
      }
    }

    // 11. Status & Help
    if (/^(?:status|bot\s*status|স্ট্যাটাস|বট\s*স্ট্যাটাস|group\s*status)$/iu.test(cmdCore)) {
      return { type: 'status' };
    }
    if (
      /^(?:help|commands|command|cmd|cmds|menu|কমান্ড|হেল্প|মেনু|সব\s*কমান্ড|অ্যাডমিন\s*কমান্ড|এডমিন\s*কমান্ড|কমান্ড\s*লিস্ট|তালিকা)$/iu.test(
        cmdCore
      ) ||
      (hasExplicitPrefix && cmdCore === '?')
    ) {
      return { type: 'help' };
    }
  }

  // If message has an explicit @mention and short length (<= 80 chars), check edge tokens even if @Display Name had spaces
  if (hasMentions && withoutPrefix.length <= 80 && cmdCore) {
    const tokens = cmdCore.split(' ').filter(Boolean);
    if (tokens.length > 1) {
      const edgeCandidates = [
        tokens[0],
        tokens[tokens.length - 1],
        tokens.slice(0, 2).join(' '),
        tokens.slice(-2).join(' '),
      ];
      for (const edge of edgeCandidates) {
        const edgeMatch = matchCmdString(edge);
        if (edgeMatch) return edgeMatch;
      }
    }
  }

  return null;
}

interface ResolvedCommandTarget {
  jid: string;
  altJid?: string;
  phone: string;
  isGroupAdmin: boolean;
  isServerAdmin: boolean;
  isBot: boolean;
  candidateJids: string[];
}

async function resolveCommandTargetMembers(
  sock: WASocket,
  groupId: string,
  realMsg: any,
  rawMsg: proto.IWebMessageInfo,
  messageText: string,
  quotedCtx: any
): Promise<ResolvedCommandTarget[]> {
  const rawTargets: string[] = [];
  const mentions = collectMentionedJidsFromMessage(realMsg, rawMsg);
  for (const m of mentions) {
    if (m && !rawTargets.includes(m)) rawTargets.push(m);
  }
  if (rawTargets.length === 0 && quotedCtx?.participant) {
    rawTargets.push(String(quotedCtx.participant));
  }
  if (rawTargets.length === 0) {
    const phones = extractInlinePhoneNumbers(messageText);
    for (const p of phones) {
      rawTargets.push(`${p}@s.whatsapp.net`);
    }
  }
  if (rawTargets.length === 0) return [];

  const meta = await getGroupMeta(sock, groupId, false).catch(() => null);
  learnGroupParticipantsLidPn(meta);
  const participants: any[] = Array.isArray(meta?.participants) ? meta.participants : [];
  const serverAdminDigits = new Set(getAuthorizedServerAdminDigitsList());
  const { botUsers } = collectKnownBotUsersSync(sock);

  const resolved: ResolvedCommandTarget[] = [];
  const seenKeys = new Set<string>();

  for (const rawTarget of rawTargets) {
    const cu = cleanJidUser(rawTarget);
    const norm = normalizeJid(rawTarget);
    const digits = !isLidJid(rawTarget) ? normalizePhoneDigits(cu) : '';
    const cands = new Set<string>([cu, digits].filter(Boolean));
    expandIdSetWithLidMaps(cands);

    let matchedPart: any = null;
    for (const p of participants) {
      const pJids = [p.id, p.lid, p.phoneNumber, p.pn, p.jid].filter(Boolean) as string[];
      const hit = pJids.some((pj) => {
        const pcu = cleanJidUser(pj);
        const pnu = !isLidJid(pj) ? normalizePhoneDigits(pcu) : '';
        return cands.has(pcu) || (pnu && cands.has(pnu));
      });
      if (hit) {
        matchedPart = p;
        for (const pj of pJids) {
          const pcu = cleanJidUser(pj);
          const pnu = !isLidJid(pj) ? normalizePhoneDigits(pcu) : '';
          if (pcu) cands.add(pcu);
          if (pnu) cands.add(pnu);
        }
        break;
      }
    }

    const primaryJid = normalizeJid(matchedPart?.id || norm);
    if (!primaryJid || seenKeys.has(primaryJid)) continue;
    seenKeys.add(primaryJid);

    const altRaw =
      matchedPart?.phoneNumber ||
      matchedPart?.pn ||
      (isLidJid(primaryJid) && lidToPnUserMap.get(cleanJidUser(primaryJid))
        ? `${lidToPnUserMap.get(cleanJidUser(primaryJid))}@s.whatsapp.net`
        : matchedPart?.lid || '');
    const altJid = altRaw && normalizeJid(altRaw) !== primaryJid ? normalizeJid(altRaw) : undefined;
    if (altJid) rememberLidPnPair(primaryJid, altJid);

    const mappedPn = isLidJid(primaryJid) ? lidToPnUserMap.get(cleanJidUser(primaryJid)) : '';
    const phone =
      (altJid && isPnJid(altJid) ? cleanJidUser(altJid) : '') ||
      mappedPn ||
      cleanJidUser(primaryJid) ||
      'member';

    const isGroupAdmin = Boolean(
      matchedPart &&
        (matchedPart.admin === 'admin' ||
          matchedPart.admin === 'superadmin' ||
          matchedPart.isAdmin ||
          matchedPart.isSuperAdmin)
    );
    const isServerAdmin = Array.from(cands).some((c) => serverAdminDigits.has(normalizePhoneDigits(c)));
    const isBot = Array.from(cands).some((c) => botUsers.has(c));

    const candidateJids = Array.from(
      new Set(
        [
          primaryJid,
          altJid,
          matchedPart?.id ? normalizeJid(matchedPart.id) : '',
          matchedPart?.lid ? normalizeJid(matchedPart.lid) : '',
          matchedPart?.phoneNumber ? normalizeJid(matchedPart.phoneNumber) : '',
        ].filter((x): x is string => Boolean(x))
      )
    );

    resolved.push({
      jid: primaryJid,
      altJid,
      phone,
      isGroupAdmin,
      isServerAdmin,
      isBot,
      candidateJids,
    });
  }

  return resolved;
}

async function executeServerAdminGroupCommand(
  sock: WASocket,
  ctx: {
    cmd: ServerAdminCommandAction;
    groupId: string;
    groupSubject: string;
    senderJid: string;
    senderAltJid?: string;
    adminPhone: string;
    msg: proto.IWebMessageInfo;
    realMsg: any;
    messageText: string;
    quotedCtx: any;
    isBotAdmin: boolean;
    metaKnown: boolean;
  }
): Promise<void> {
  const { cmd, groupId, groupSubject, senderJid, senderAltJid, adminPhone, msg, realMsg, messageText, quotedCtx } = ctx;
  const settings = getSettings();

  const { botUsers } = collectKnownBotUsersSync(sock);
  const quotedParticipantRaw = quotedCtx?.participant || '';
  const isQuotedFromBot = Boolean(quotedParticipantRaw && botUsers.has(cleanJidUser(quotedParticipantRaw)));
  const quotedTargetStub = quotedCtx?.stanzaId
    ? ({
        key: {
          remoteJid: groupId,
          fromMe: isQuotedFromBot,
          id: quotedCtx.stanzaId,
          ...(quotedParticipantRaw ? { participant: quotedParticipantRaw } : {}),
        },
        message: quotedCtx.quotedMessage || { conversation: '' },
      } as proto.IWebMessageInfo)
    : null;
  const replyTargetQuote = quotedTargetStub || (msg as any);

  const ensureFreshBotAdmin = async (): Promise<boolean> => {
    if (ctx.metaKnown && ctx.isBotAdmin) return true;
    const refreshed = await checkPermissions(sock, groupId, senderJid, true, senderAltJid);
    return refreshed.isBotAdmin;
  };

  if (cmd.type === 'remove_msg' && quotedCtx?.stanzaId) {
    const botCanDelete = await ensureFreshBotAdmin();
    const quotedKey: proto.IMessageKey = {
      remoteJid: groupId,
      fromMe: isQuotedFromBot,
      id: quotedCtx.stanzaId,
      ...(quotedParticipantRaw ? { participant: quotedParticipantRaw } : {}),
    };

    const deleted = await deleteMessageSafely(
      sock,
      groupId,
      { key: quotedKey } as proto.IWebMessageInfo,
      quotedParticipantRaw || undefined,
      botCanDelete
    );

    if (deleted) {
      db.stats.deletedMessages++;
      saveDatabase();
      markInboxMessageDeleted(
        groupId,
        quotedCtx.stanzaId,
        'server_admin_reply',
        `সার্ভার অ্যাডমিন (@${adminPhone}) রিপ্লাই কমান্ডের মাধ্যমে ডিলিট করেছেন`
      ).catch(() => {});
      addActivityLog({
        groupId,
        groupName: groupSubject,
        senderJid,
        senderPhone: adminPhone,
        action: 'deleted',
        reason: `সার্ভার অ্যাডমিন (@${adminPhone}) রিপ্লাই রিমুভ কমান্ড`,
        details: `রিপ্লাই করা মেসেজ/ভয়েস (${quotedCtx.stanzaId}) সাথে সাথে ডিলিট করা হয়েছে`,
      });
      sock.sendMessage(groupId, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } else {
      addActivityLog({
        groupId,
        groupName: groupSubject,
        senderJid,
        senderPhone: adminPhone,
        action: 'error',
        reason: botCanDelete
          ? 'রিপ্লাই রিমুভ কমান্ড ব্যর্থ (মেসেজ পাওয়া যায়নি বা পুরোনো)'
          : 'রিপ্লাই রিমুভ কমান্ড ব্যর্থ (বট গ্রুপের Admin নয়)',
        details: `টার্গেট: ${quotedCtx.stanzaId}`,
      });
    }
    return;
  }

  if (cmd.type === 'kick') {
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '⚠️ কিক করার জন্য মেম্বারের মেসেজে রিপ্লাই দিয়ে বা `@mention` দিয়ে লিখুন: `কিক` অথবা `kick`' },
        { quoted: msg as any }
      );
      return;
    }

    const botCanKick = await ensureFreshBotAdmin();
    if (!botCanKick) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '❌ বট এই গ্রুপের Admin না থাকায় মেম্বার কিক করা সম্ভব হয়নি।' },
        { quoted: replyTargetQuote }
      );
      return;
    }

    for (const target of targets) {
      if (target.isBot || target.isServerAdmin) {
        await safeSendMessage(
          sock,
          groupId,
          {
            text: `🛡️ @${target.phone} সার্ভার অ্যাডমিন/বট হওয়ায় কিক করা যাবে না।`,
            mentions: [target.jid],
          },
          { quoted: replyTargetQuote }
        );
        continue;
      }

      let kickedOk = false;
      let lastStatus = '';
      for (const jidCand of target.candidateJids) {
        try {
          const res: any = await sock.groupParticipantsUpdate(groupId, [jidCand], 'remove');
          const status = Array.isArray(res) ? String(res[0]?.status || '200') : '200';
          lastStatus = status;
          if (status === '200' || status === '207') {
            kickedOk = true;
            break;
          }
        } catch (err: any) {
          lastStatus = err?.message || String(err);
        }
      }

      if (kickedOk) {
        db.stats.kickedMembers++;
        delete db.warnings[`${groupId}:${target.jid}`];
        saveDatabase();
        sock.sendMessage(groupId, { react: { text: '✅', key: msg.key } }).catch(() => {});
        if (!settings.silentModeration) {
          const hideName = Boolean(settings.hideNameOnDelete);
          await safeSendMessage(
            sock,
            groupId,
            {
              text: hideName
                ? `🚫 *অ্যাডমিন কমান্ড (Kick)*\nগ্রুপ থেকে সদস্যকে রিমুভ করা হয়েছে।`
                : `🚫 *অ্যাডমিন কমান্ড (Kick)*\n👤 @${target.phone} কে গ্রুপ থেকে রিমুভ করা হয়েছে।`,
              ...(hideName ? {} : { mentions: [target.jid] }),
            },
            { quoted: replyTargetQuote }
          );
        }
        addActivityLog({
          groupId,
          groupName: groupSubject,
          senderJid: target.jid,
          senderPhone: target.phone,
          action: 'kicked',
          reason: `সার্ভার অ্যাডমিন (@${adminPhone}) কিক কমান্ড`,
          details: `@${target.phone} কে গ্রুপ থেকে রিমুভ করা হয়েছে`,
        });
      } else {
        await safeSendMessage(
          sock,
          groupId,
          {
            text: `❌ @${target.phone} কে কিক করা যায়নি (Status: ${lastStatus || 'Unknown'})। তিনি গ্রুপ ক্রিয়েটর হতে পারেন।`,
            mentions: [target.jid],
          },
          { quoted: replyTargetQuote }
        );
      }
    }
    return;
  }

  if (cmd.type === 'black') {
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '⚠️ ব্লক করার জন্য মেম্বারের মেসেজে রিপ্লাই দিয়ে বা `@mention` করে লিখুন: `black` বা `black 30`' },
        { quoted: msg as any }
      );
      return;
    }

    for (const target of targets) {
      if (target.isBot || target.isServerAdmin) {
        await safeSendMessage(
          sock,
          groupId,
          { text: `🛡️ @${target.phone} সার্ভার অ্যাডমিন/বট হওয়ায় ব্লক করা যাবে না।`, mentions: [target.jid] },
          { quoted: replyTargetQuote }
        );
        continue;
      }

      const res = await manualBlockMember(sock, {
        groupId,
        memberJid: target.jid,
        altJid: target.altJid,
        memberPhone: target.phone,
        durationMinutes: cmd.durationMinutes,
        quotedMsg: replyTargetQuote,
      });

      if (res.success) {
        sock.sendMessage(groupId, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } else {
        await safeSendMessage(
          sock,
          groupId,
          { text: `❌ ${res.error || 'ব্লক করা যায়নি।'}`, mentions: [target.jid] },
          { quoted: replyTargetQuote }
        );
      }
    }
    return;
  }

  if (cmd.type === 'unblock') {
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '⚠️ আনব্লক করার জন্য মেম্বারের মেসেজে রিপ্লাই দিয়ে বা `@mention` করে লিখুন: `unblock`' },
        { quoted: msg as any }
      );
      return;
    }

    for (const target of targets) {
      const removed = unrestrictUser(groupId, target.jid, target.candidateJids, replyTargetQuote);
      if (removed) {
        sock.sendMessage(groupId, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } else {
        await safeSendMessage(
          sock,
          groupId,
          { text: `ℹ️ @${target.phone} বর্তমানে কোনো ব্লক/মিউট তালিকায় নেই।`, mentions: [target.jid] },
          { quoted: replyTargetQuote }
        );
      }
    }
    return;
  }

  if (cmd.type === 'rules') {
    const meta = await getGroupMeta(sock, groupId, false).catch(() => null);
    const memberCount = meta?.participants?.length || 0;
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    const customRules = (settings.newMemberInboxRulesNotice || '').trim();

    if (targets.length > 0) {
      const t = targets[0];
      const rulesText = customRules
        ? customRules
            .replace(/\{user\}/gi, `@${t.phone}`)
            .replace(/\{group\}/gi, groupSubject)
            .replace(/\{memberCount\}/gi, String(memberCount || ''))
        : `📜 *${groupSubject} — গ্রুপ রুলস নোটিশ*\n\n👤 প্রিয় @${t.phone}, অনুগ্রহ করে গ্রুপের নিয়মাবলী মেনে চলুন:\n\n১। গ্রুপে কোনো ধরনের গালিগালাজ, অশালীন কথা বা অশ্লীল ভয়েস মেসেজ দেওয়া নিষেধ।\n২। অতিরিক্ত স্টিকার স্প্যাম ও অননুমোদিত লিংক শেয়ার করবেন না।\n৩। সবার সাথে ভদ্র, সম্মানজনক ও বন্ধুত্বপূর্ণ আচরণ বজায় রাখুন।\n৪। নিয়ম ভঙ্গ করলে বট স্বয়ংক্রিয়ভাবে সতর্কবার্তা, মিউট বা রিমুভ করবে।\n\n🤝 নিয়ম মেনে গ্রুপে থাকার জন্য ধন্যবাদ!`;

      await safeSendMessage(
        sock,
        groupId,
        { text: rulesText, mentions: [t.jid] },
        { quoted: replyTargetQuote }
      );
      if (!t.isBot) {
        const dmTarget = t.altJid && isPnJid(t.altJid) ? t.altJid : t.jid;
        safeSendMessage(sock, dmTarget, { text: rulesText }).catch(() => {});
      }
    } else {
      const rulesText = customRules
        ? customRules
            .replace(/\{user\}/gi, 'সকল সদস্যবৃন্দ')
            .replace(/\{group\}/gi, groupSubject)
            .replace(/\{memberCount\}/gi, String(memberCount || ''))
        : `📜 *${groupSubject} — গ্রুপ রুলস ও নিয়মাবলী*\n\n১। গ্রুপে কোনো ধরনের গালিগালাজ, অশালীন কথা বা অশ্লীল ভয়েস মেসেজ দেওয়া সম্পূর্ণ নিষেধ।\n২। অতিরিক্ত স্টিকার স্প্যাম ও অননুমোদিত লিংক শেয়ার করবেন না।\n৩। সবার সাথে ভদ্র, সম্মানজনক ও বন্ধুত্বপূর্ণ আচরণ বজায় রাখুন।\n৪। নিয়ম ভঙ্গ করলে বট স্বয়ংক্রিয়ভাবে সতর্কবার্তা (১/২/৩), ব্লক বা রিমুভ করবে।\n\n🛡️ নিয়ম মেনে চলার জন্য ধন্যবাদ!`;

      await safeSendMessage(sock, groupId, { text: rulesText }, { quoted: replyTargetQuote });
    }
    sock.sendMessage(groupId, { react: { text: '📜', key: msg.key } }).catch(() => {});
    return;
  }

  if (cmd.type === 'warn') {
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '⚠️ ওয়ার্ন দেওয়ার জন্য মেম্বারের মেসেজে রিপ্লাই দিয়ে বা `@mention` করে লিখুন: `warn`' },
        { quoted: msg as any }
      );
      return;
    }

    for (const target of targets) {
      if (target.isBot || target.isServerAdmin) continue;
      const warningKey = `${groupId}:${target.jid}`;
      if (!db.warnings[warningKey]) {
        db.warnings[warningKey] = {
          count: 0,
          lastViolation: Date.now(),
          violations: [],
          groupId,
          groupName: groupSubject,
          senderJid: target.jid,
          senderPhone: target.phone,
        };
      }
      db.warnings[warningKey].count++;
      db.warnings[warningKey].lastViolation = Date.now();
      db.warnings[warningKey].violations.push({
        timestamp: Date.now(),
        reason: `অ্যাডমিন (@${adminPhone}) ম্যানুয়াল ওয়ার্নিং`,
      });
      db.stats.warningsGiven++;
      saveDatabase();

      const count = db.warnings[warningKey].count;
      const hideName = Boolean(settings.hideNameOnDelete);
      if (count >= 3 && settings.autoKick3Warnings && !target.isGroupAdmin && (await ensureFreshBotAdmin())) {
        if (!settings.silentModeration) {
          await safeSendMessage(
            sock,
            groupId,
            {
              text: hideName
                ? `🚨 [৩য় সতর্কতা — অটো কিক]\n৩টি সতর্কবার্তা অতিক্রম করায় সদস্যকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`
                : `🚨 [৩য় সতর্কতা — অটো কিক]\n@${target.phone} ৩টি সতর্কবার্তা অতিক্রম করায় গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
              ...(hideName ? {} : { mentions: [target.jid] }),
            },
            { quoted: replyTargetQuote }
          );
        }
        for (const cand of target.candidateJids) {
          try {
            const kickRes: any = await sock.groupParticipantsUpdate(groupId, [cand], 'remove');
            const st = Array.isArray(kickRes) ? String(kickRes[0]?.status || '200') : '200';
            if (st === '200' || st === '207') {
              db.stats.kickedMembers++;
              delete db.warnings[warningKey];
              saveDatabase();
              break;
            }
          } catch {}
        }
      } else if (!settings.silentModeration) {
        await safeSendMessage(
          sock,
          groupId,
          {
            text: hideName
              ? `⚠️ [অ্যাডমিন সতর্কবার্তা ${count}/3]\nনিয়ম ভঙ্গের কারণে সতর্ক করা হলো। অনুগ্রহ করে গ্রুপের শৃঙ্খলা মেনে চলুন।`
              : `⚠️ [অ্যাডমিন সতর্কবার্তা ${count}/3]\nসদস্য @${target.phone}, নিয়ম ভঙ্গের কারণে আপনাকে সতর্ক করা হলো। অনুগ্রহ করে গ্রুপের শৃঙ্খলা মেনে চলুন।`,
            ...(hideName ? {} : { mentions: [target.jid] }),
          },
          { quoted: replyTargetQuote }
        );
      }
      addActivityLog({
        groupId,
        groupName: groupSubject,
        senderJid: target.jid,
        senderPhone: target.phone,
        action: 'warned',
        reason: `সার্ভার অ্যাডমিন (@${adminPhone}) ওয়ার্ন কমান্ড (${count}/3)`,
        warningCount: count,
      });
    }
    sock.sendMessage(groupId, { react: { text: '⚠️', key: msg.key } }).catch(() => {});
    return;
  }

  if (cmd.type === 'resetwarn') {
    if (cmd.allInGroup) {
      let cleared = 0;
      for (const [k, w] of Object.entries(db.warnings || {})) {
        if (w?.groupId === groupId || k.startsWith(`${groupId}:`)) {
          delete db.warnings[k];
          cleared++;
        }
      }
      saveDatabase();
      await safeSendMessage(
        sock,
        groupId,
        { text: `✅ এই গ্রুপের মোট ${cleared}টি ওয়ার্নিং রেকর্ড রিসেট করা হয়েছে।` },
        { quoted: replyTargetQuote }
      );
      return;
    }

    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '⚠️ ওয়ার্ন রিসেট করতে রিপ্লাই/`@mention` করে লিখুন `resetwarn` অথবা গ্রুপের সবার জন্য `resetwarn all`' },
        { quoted: msg as any }
      );
      return;
    }

    for (const target of targets) {
      let deletedCount = 0;
      for (const [k, w] of Object.entries(db.warnings || {})) {
        if (
          (w?.groupId === groupId || k.startsWith(`${groupId}:`)) &&
          (k === `${groupId}:${target.jid}` ||
            target.candidateJids.some((c) => k.endsWith(`:${c}`) || w?.senderJid === c))
        ) {
          delete db.warnings[k];
          deletedCount++;
        }
      }
      if (deletedCount > 0) saveDatabase();
      await safeSendMessage(
        sock,
        groupId,
        {
          text:
            deletedCount > 0
              ? `✅ @${target.phone}-এর সতর্কতা (Warning) রিসেট করে ০ করা হয়েছে।`
              : `ℹ️ @${target.phone}-এর কোনো সক্রিয় সতর্কতা নেই।`,
          mentions: [target.jid],
        },
        { quoted: replyTargetQuote }
      );
    }
    return;
  }

  if (cmd.type === 'lock') {
    if (!(await ensureFreshBotAdmin())) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '❌ বট গ্রুপের Admin না থাকায় গ্রুপ লক করা যায়নি।' },
        { quoted: msg as any }
      );
      return;
    }
    await sock.groupSettingUpdate(groupId, 'announcement');
    if (cmd.durationMinutes) {
      db.groupLocks[groupId] = {
        groupId,
        groupName: groupSubject,
        lockedUntil: Date.now() + cmd.durationMinutes * 60 * 1000,
        originalSetting: 'not_announcement',
        reason: `অ্যাডমিন (@${adminPhone}) লক কমান্ড (${cmd.durationMinutes} মিনিট)`,
      };
      saveDatabase();
    }
    addActivityLog({
      groupId,
      groupName: groupSubject,
      senderJid,
      senderPhone: adminPhone,
      action: 'locked',
      reason: `সার্ভার অ্যাডমিন (@${adminPhone}) গ্রুপ লক কমান্ড`,
    });
    await safeSendMessage(
      sock,
      groupId,
      {
        text: cmd.durationMinutes
          ? `🔒 *গ্রুপ লক করা হয়েছে (${cmd.durationMinutes} মিনিট)*\nশুধুমাত্র অ্যাডমিনরা এখন মেসেজ পাঠাতে পারবেন।`
          : '🔒 *গ্রুপ লক করা হয়েছে*\nশুধুমাত্র অ্যাডমিনরা এখন মেসেজ পাঠাতে পারবেন। আনলক করতে লিখুন `unlock`।',
      },
      { quoted: replyTargetQuote }
    );
    return;
  }

  if (cmd.type === 'unlock') {
    if (!(await ensureFreshBotAdmin())) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '❌ বট গ্রুপের Admin না থাকায় গ্রুপ আনলক করা যায়নি।' },
        { quoted: replyTargetQuote }
      );
      return;
    }
    await sock.groupSettingUpdate(groupId, 'not_announcement');
    delete db.groupLocks[groupId];
    delete db.nightLockedGroups[groupId];
    saveDatabase();
    addActivityLog({
      groupId,
      groupName: groupSubject,
      senderJid,
      senderPhone: adminPhone,
      action: 'unlocked',
      reason: `সার্ভার অ্যাডমিন (@${adminPhone}) গ্রুপ আনলক কমান্ড`,
    });
    await safeSendMessage(
      sock,
      groupId,
      {
        text: '🔓 *গ্রুপ আনলক করা হয়েছে*\nএখন সবাই স্বাভাবিকভাবে গ্রুপে মেসেজ পাঠাতে পারবেন।',
      },
      { quoted: replyTargetQuote }
    );
    return;
  }

  if (cmd.type === 'promote' || cmd.type === 'demote') {
    const targets = await resolveCommandTargetMembers(sock, groupId, realMsg, msg, messageText, quotedCtx);
    if (targets.length === 0) {
      await safeSendMessage(
        sock,
        groupId,
        { text: `⚠️ মেম্বারের মেসেজে রিপ্লাই দিয়ে বা \`@mention\` করে লিখুন: \`${cmd.type}\`` },
        { quoted: msg as any }
      );
      return;
    }
    if (!(await ensureFreshBotAdmin())) {
      await safeSendMessage(
        sock,
        groupId,
        { text: '❌ বট গ্রুপের Admin না থাকায় রোল পরিবর্তন করা যায়নি।' },
        { quoted: replyTargetQuote }
      );
      return;
    }
    for (const target of targets) {
      if (cmd.type === 'demote' && (target.isBot || target.isServerAdmin)) {
        await safeSendMessage(
          sock,
          groupId,
          { text: `🛡️ @${target.phone} সার্ভার অ্যাডমিন/বট হওয়ায় ডিমোট করা যাবে না।`, mentions: [target.jid] },
          { quoted: replyTargetQuote }
        );
        continue;
      }
      try {
        await sock.groupParticipantsUpdate(groupId, [target.jid], cmd.type);
        delete groupMetaCache[groupId];
        sock.sendMessage(groupId, { react: { text: '✅', key: msg.key } }).catch(() => {});
        await safeSendMessage(
          sock,
          groupId,
          {
            text:
              cmd.type === 'promote'
                ? `👑 @${target.phone} কে গ্রুপ অ্যাডমিন (Admin) বানানো হয়েছে।`
                : `⬇️ @${target.phone}-এর গ্রুপ অ্যাডমিন দায়িত্ব সরিয়ে নেওয়া হয়েছে।`,
            mentions: [target.jid],
          },
          { quoted: replyTargetQuote }
        );
      } catch (err: any) {
        await safeSendMessage(
          sock,
          groupId,
          { text: `❌ ব্যর্থ হয়েছে: ${err?.message || 'Permission error'}`, mentions: [target.jid] },
          { quoted: replyTargetQuote }
        );
      }
    }
    return;
  }

  if (cmd.type === 'tagall') {
    const meta = await getGroupMeta(sock, groupId, false).catch(() => null);
    const participants: any[] = Array.isArray(meta?.participants) ? meta.participants : [];
    const mentionJids = participants
      .map((p) => normalizeJid(p?.id || p?.jid || ''))
      .filter((j) => j && !botUsers.has(cleanJidUser(j)));
    if (mentionJids.length === 0) return;

    const textBody = cmd.customText
      ? `📢 *অ্যাডমিন ঘোষণা*\n\n${cmd.customText}`
      : `📢 *${groupSubject} — সবার দৃষ্টি আকর্ষণ করা হচ্ছে!*`;
    await safeSendMessage(
      sock,
      groupId,
      {
        text: textBody,
        mentions: mentionJids,
      },
      quotedTargetStub ? { quoted: quotedTargetStub } : undefined
    );
    sock.sendMessage(groupId, { react: { text: '📢', key: msg.key } }).catch(() => {});
    return;
  }

  if (cmd.type === 'master_notices') {
    if (cmd.enable) {
      updateSettings({
        silentModeration: false,
        autoWelcome: true,
        newMemberInboxRulesEnabled: true,
        nightModeNotify: true,
        adminMentionReplyEnabled: true,
        autoSalamReplyEnabled: true,
        botReply: true,
        keywordAutoReplyEnabled: true,
      });
    } else {
      updateSettings({
        silentModeration: true,
        autoWelcome: false,
        newMemberInboxRulesEnabled: false,
        nightModeNotify: false,
        adminMentionReplyEnabled: false,
        autoSalamReplyEnabled: false,
        botReply: false,
        keywordAutoReplyEnabled: false,
      });
    }
    await safeSendMessage(
      sock,
      groupId,
      {
        text: cmd.enable
          ? '✅ *সব নোটিশ সিস্টেম* এক বাটনে *ON (চালু)* করা হয়েছে।'
          : '⛔ *সব নোটিশ সিস্টেম* এক বাটনে *OFF (বন্ধ)* করা হয়েছে — এখন শুধু নীরবে রিমুভ হবে এবং নাম হাইড থাকবে।',
      },
      { quoted: replyTargetQuote }
    );
    return;
  }

  if (cmd.type === 'toggle') {
    updateSettings({ [cmd.key]: cmd.value } as Partial<ModerationSettings>);
    if (cmd.key === 'hideNameOnDelete') {
      void syncBotProfileNamePrivacy(sock).catch(() => {});
    }
    await safeSendMessage(
      sock,
      groupId,
      {
        text: `${cmd.value ? '✅' : '⛔'} *${cmd.label}* এখন *${cmd.value ? 'ON (চালু)' : 'OFF (বন্ধ)'}* করা হয়েছে।`,
      },
      { quoted: replyTargetQuote }
    );
    return;
  }

  if (cmd.type === 'status') {
    const groupWarnings = Object.entries(db.warnings || {}).filter(
      ([k, w]) => w?.count > 0 && (w.groupId === groupId || k.startsWith(`${groupId}:`))
    ).length;
    const groupMuted = getActiveRestrictedUsers().filter((u) => u.groupId === groupId).length;
    const botAdminNow = await ensureFreshBotAdmin();
    await safeSendMessage(
      sock,
      groupId,
      {
        text:
          `🛡️ *${groupSubject} — লাইভ বট স্ট্যাটাস*\n\n` +
          `• বট অ্যাডমিন: ${botAdminNow ? '✅ হ্যাঁ (Full Control)' : '❌ না (Admin দিন)'}\n` +
          `• Anti-Sticker: ${settings.antiSticker ? 'ON' : 'OFF'}\n` +
          `• Anti-Link: ${settings.antiLink ? 'ON' : 'OFF'}\n` +
          `• Anti-Badword: ${settings.antiBadword ? 'ON' : 'OFF'}\n` +
          `• Voice AI: ${settings.voiceModerationEnabled !== false ? 'ON' : 'OFF'}\n` +
          `• সক্রিয় ওয়ার্নিং: ${groupWarnings} জন\n` +
          `• ব্লক/মিউট অবস্থায়: ${groupMuted} জন`,
      },
      { quoted: replyTargetQuote }
    );
    return;
  }

  if (cmd.type === 'help') {
    const menuText =
      `╔════════════════════════╗\n` +
      `   ⚡ *WAGuard অ্যাডমিন কমান্ড মেনু*\n` +
      `╚════════════════════════╝\n` +
      `🛡️ _শুধুমাত্র অনুমোদিত ২ জন সার্ভার অ্যাডমিনের জন্য_\n\n` +
      `╭─ 👤 *মেম্বার অ্যাকশন* _(রিপ্লাই বা @mention)_\n` +
      `│ 🚫 *কিক / kick* — মেম্বারকে গ্রুপ থেকে রিমুভ করবে\n` +
      `│ 🔇 *black [মিনিট] / block* — সাময়িক ব্লক/মিউট (ডিফল্ট ১০ মি.)\n` +
      `│ 🔊 *unblock / আনব্লক* — ব্লক/মিউট সাথে সাথে তুলে নেবে\n` +
      `│ ⚠️ *warn* — সদস্যকে ওয়ার্নিং (১/২/৩) দেবে\n` +
      `│ 🔄 *resetwarn* / *resetwarn all* — ওয়ার্নিং রিসেট করবে\n` +
      `│ 👑 *promote* / ⬇️ *demote* — অ্যাডমিন বানাবে বা সরাবে\n` +
      `╰────────────────────────\n\n` +
      `╭─ 💬 *মেসেজ ও রুলস কন্ট্রোল*\n` +
      `│ 🗑️ *রিমুভ / remove / ডিলিট* — যেকোনো মেসেজ/ভয়েসে রিপ্লাই দিলে ডিলিট\n` +
      `│ 📜 *rules / রুলস* — গ্রুপের নিয়মাবলী দেখাবে _(রিপ্লাই/@ করলে তাকে ট্যাগ+ইনবক্স)_\n` +
      `╰────────────────────────\n\n` +
      `╭─ 🔒 *গ্রুপ লক ও ঘোষণা*\n` +
      `│ 🔒 *lock [মিনিট]* — গ্রুপ শুধু অ্যাডমিনদের জন্য লক করবে\n` +
      `│ 🔓 *unlock* — সবার জন্য গ্রুপ আনলক করবে\n` +
      `│ 📢 *tagall [বার্তা]* — গ্রুপের সবাইকে একসাথে মেনশন করবে\n` +
      `╰────────────────────────\n\n` +
      `╭─ ⚙️ *সিকিউরিটি অন/অফ ও তথ্য*\n` +
      `│ 🔹 *antisticker on/off* — স্টিকার প্রোটেকশন\n` +
      `│ 🔹 *antilink on/off* — লিংক প্রোটেকশন\n` +
      `│ 🔹 *antibadword on/off* — গালিগালাজ প্রোটেকশন\n` +
      `│ 🔹 *antivoice on/off* — ভয়েস AI প্রোটেকশন\n` +
      `│ 🔹 *silent on/off* — সাইলেন্ট মোড\n` +
      `│ 📊 *status* — গ্রুপের লাইভ সিকিউরিটি স্ট্যাটাস\n` +
      `╰────────────────────────\n\n` +
      `💡 _টিপস: যেকোনো মেসেজে রিপ্লাই করে লিখলে অ্যাকশন ঠিক ওই মেসেজ/সদস্যের ওপরই হবে!_`;

    await safeSendMessage(sock, groupId, { text: menuText }, { quoted: replyTargetQuote });
    sock.sendMessage(groupId, { react: { text: '📋', key: msg.key } }).catch(() => {});
  }
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
  bossPhoneDigits: string | string[],
  rawMsg?: any
): Promise<{ adminJid: string; adminTag: string; isBoss: boolean } | null> {
  const rawMentions: string[] = collectMentionedJidsFromMessage(realMsg, rawMsg);
  const ctxMentionSet = new Set(rawMentions.map((j) => normalizeJid(j)));

  // Also detect inline numeric mentions like @+8801632222592, @+8801346561627, @01346561627, @+880 1346-561627
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

  const rawBossList = Array.isArray(bossPhoneDigits) ? bossPhoneDigits : [bossPhoneDigits];
  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
  const bossEntries: Array<{ digits: string; lidUser: string }> = [];

  for (const rawBoss of rawBossList) {
    const cleanBossDigits = normalizePhoneDigits(rawBoss);
    if (!cleanBossDigits) continue;
    if (bossEntries.some((b) => b.digits === cleanBossDigits)) continue;
    const bossPnJid = `${cleanBossDigits}@s.whatsapp.net`;
    let bossLidUser = pnToLidUserMap.get(cleanBossDigits) || '';
    if (!bossLidUser && typeof lidMappingApi?.getLIDForPN === 'function') {
      try {
        const lookedUpLid = await lidMappingApi.getLIDForPN(bossPnJid);
        if (lookedUpLid) {
          rememberLidPnPair(lookedUpLid, bossPnJid);
          bossLidUser = cleanJidUser(lookedUpLid);
        }
      } catch {}
    }
    bossEntries.push({ digits: cleanBossDigits, lidUser: bossLidUser });
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
      for (const entry of bossEntries) {
        if (!entry.lidUser && resolvedUsers.has(entry.digits)) {
          const lidPart = pJids.find((j) => isLidJid(j));
          if (lidPart) entry.lidUser = cleanJidUser(lidPart);
        }
      }
    }

    const isSenderSelf = Array.from(resolvedUsers).some((u) => senderUsers.has(u));
    if (isSenderSelf) continue;

    const matchedBoss = bossEntries.find(
      (b) => resolvedUsers.has(b.digits) || (b.lidUser && resolvedUsers.has(b.lidUser))
    );
    const isBoss = Boolean(matchedBoss);

    const isBotSelf = Array.from(resolvedUsers).some((u) => botUsers.has(u));
    // Never trigger on mentioning a non-boss bot account (e.g. standalone Maya AI bot),
    // but DO allow Server Admin Mention Reply even if the bot session uses a Server Admin's own WhatsApp number!
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
        : matchedBoss?.lidUser && (meta as any)?.addressingMode === 'lid'
          ? `${matchedBoss.lidUser}@lid`
          : normalizeJid(mentionedJid);

    const hit = {
      adminJid: replyMentionJid,
      adminTag: cleanJidUser(replyMentionJid) || mentionedUser,
      isBoss,
    };

    if (isBoss) {
      return hit; // Prioritize Boss/Server Admin match immediately
    }
    if (!firstAdminHit) {
      firstAdminHit = hit;
    }
  }

  return firstAdminHit;
}

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

function buildServerRecoveryText(recovery: QueuedServerRecovery): string {
  const timeStr = new Date(recovery.resolvedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    `✅ *[WAGuard সার্ভার ও সিস্টেম রিকভারি]*\n\n` +
    `ধন্যবাদ বস! 🙏 সার্ভারে আগে যে সমস্যাটি ছিল তা এখন পুরোপুরি ঠিক হয়ে গেছে:\n\n` +
    `✨ সমাধান হয়েছে: ${recovery.title}\n` +
    `📝 বিবরণ: ${recovery.details}\n` +
    `🕒 সময়: ${timeStr}\n\n` +
    `🛡️ ${recovery.thanksNote}\n` +
    `সব সিস্টেম এখন ১০০% স্বাভাবিকভাবে কাজ করছে! 💚`
  );
}

let isFlushingServerNotices = false;

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
    const tracked = activeProblemsMap.get(problem.category);
    if (tracked) {
      tracked.notifiedBoss = true;
      savePersistedActiveProblems();
    }
    addActivityLog(
      {
        groupId: 'SYSTEM',
        groupName: 'Server Health Monitor',
        senderJid: resolveBossAdminJid(),
        senderPhone: cleanJidUser(resolveBossAdminJid()),
        action: 'error',
        reason: `সার্ভার সমস্যা নোটিশ পাঠানো হয়েছে: ${problem.title}`,
        details: problem.details,
      },
      { skipSave: problem.category === 'db_save_error' }
    );
  }
  return deliveredAny;
}

async function deliverServerRecoveryNotice(sock: WASocket, recovery: QueuedServerRecovery): Promise<boolean> {
  const settings = getSettings();
  if (settings.serverErrorNoticeEnabled === false) return false;
  if (!sock?.user || !sock?.authState?.creds?.registered) return false;
  const ws = (sock as any).ws;
  if (ws && typeof ws.isOpen === 'boolean' && !ws.isOpen) return false;

  const targetMode = settings.serverErrorNoticeTarget || 'boss_inbox';
  const text = buildServerRecoveryText(recovery);
  let deliveredAny = false;

  if (targetMode === 'boss_inbox' || targetMode === 'both') {
    const bossJid = resolveBossAdminJid();
    const ok = await safeSendMessage(sock, bossJid, { text }, { isRecoveryNotice: true });
    if (ok) deliveredAny = true;
  }

  if (targetMode === 'groups' || targetMode === 'both') {
    const groupIds = Object.keys(groupMetaCache).slice(0, 5);
    for (const gid of groupIds) {
      const ok = await safeSendMessage(sock, gid, { text }, { isRecoveryNotice: true });
      if (ok) deliveredAny = true;
    }
  }

  if (deliveredAny) {
    addActivityLog({
      groupId: 'SYSTEM',
      groupName: 'Server Health Monitor',
      senderJid: resolveBossAdminJid(),
      senderPhone: cleanJidUser(resolveBossAdminJid()),
      action: 'replied',
      reason: `সমস্যা সমাধান হওয়ায় বসকে ধন্যবাদ ও রিকভারি নোটিশ পাঠানো হয়েছে: ${recovery.title}`,
      details: recovery.details,
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
  const prevTracked = activeProblemsMap.get(params.category);
  const alreadyNotifiedActive = Boolean(prevTracked?.notifiedBoss && now - prevTracked.reportedAt < 4 * 60 * 60 * 1000);

  activeProblemsMap.set(params.category, {
    category: params.category,
    title: params.title,
    details: params.details,
    suggestion: params.suggestion,
    reportedAt: prevTracked?.reportedAt || now,
    notifiedBoss: prevTracked?.notifiedBoss || false,
  });
  savePersistedActiveProblems();

  // Do NOT repeatedly spam Boss DM or activity error logs for an ongoing unresolved problem already notified!
  if (alreadyNotifiedActive) {
    return false;
  }

  const lastAt = lastServerProblemAlertAt.get(params.category) || 0;
  const cooldownMs = params.urgent ? 10 * 60 * 1000 : 20 * 60 * 1000;
  if (now - lastAt < cooldownMs) {
    return false;
  }
  lastServerProblemAlertAt.set(params.category, now);

  try {
    recordWebServerProblemEvent({
      category: params.category,
      title: params.title,
      details: params.details,
      suggestion: params.suggestion,
      account: params.category.startsWith('wa_') ? 'primary' : 'server',
      source: params.category.startsWith('wa_') ? 'network' : 'web_server',
    });
  } catch {}

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

export async function resolveServerProblem(
  category: string,
  opts?: {
    details?: string;
    thanksNote?: string;
    sock?: WASocket | null;
    forceNotifyIfUnrecordedTitle?: string;
  }
): Promise<boolean> {
  const existing = activeProblemsMap.get(category);
  const pendingIdx = pendingServerProblems.findIndex((p) => p.category === category);
  if (pendingIdx >= 0) {
    pendingServerProblems.splice(pendingIdx, 1);
  }

  if (!existing && !opts?.forceNotifyIfUnrecordedTitle) {
    return false;
  }

  const wasNotified = Boolean(existing?.notifiedBoss || opts?.forceNotifyIfUnrecordedTitle);
  const title = existing?.title || opts?.forceNotifyIfUnrecordedTitle || 'সার্ভার ও সিস্টেম সমস্যা';
  const reportedAt = existing?.reportedAt || Date.now();

  if (existing) {
    activeProblemsMap.delete(category);
    savePersistedActiveProblems();
  }

  if (!wasNotified) {
    return false;
  }

  const settings = getSettings();
  if (settings.serverErrorNoticeEnabled === false) return false;

  const now = Date.now();
  const lastRecAt = lastServerRecoveryAlertAt.get(category) || 0;
  if (now - lastRecAt < 60 * 1000) {
    return false;
  }
  lastServerRecoveryAlertAt.set(category, now);

  const recovery: QueuedServerRecovery = {
    category,
    title,
    details: opts?.details || 'সার্ভারের এই সমস্যাটি এখন সম্পূর্ণভাবে সমাধান হয়ে গেছে।',
    thanksNote:
      opts?.thanksNote ||
      'ধন্যবাদ বস! আপনার সাপোর্ট ও সমাধানের জন্য বট আবার নির্বিঘ্নে কাজ চালিয়ে যাচ্ছে।',
    reportedAt,
    resolvedAt: now,
  };

  const targetSock = opts?.sock || (globalSocketGetter ? globalSocketGetter() : null);
  if (targetSock) {
    const sent = await deliverServerRecoveryNotice(targetSock, recovery);
    if (sent) return true;
  }

  if (!pendingServerRecoveries.some((r) => r.category === category)) {
    pendingServerRecoveries.push(recovery);
    savePersistedActiveProblems();
  }
  return false;
}

export async function resolveAdminPermissionProblemsForGroup(
  groupId: string,
  groupName: string,
  sock?: WASocket | null
) {
  const categories = [`sticker_no_perm_${groupId}`, `no_admin_${groupId}`, `sticker_perm_fail_${groupId}`];
  for (const cat of categories) {
    if (activeProblemsMap.has(cat)) {
      await resolveServerProblem(cat, {
        details: `"${groupName}" গ্রুপে বটের Admin Permission পাওয়া গেছে ও মডারেশন/স্টিকার ডিলিট সচল হয়েছে।`,
        thanksNote: `ধন্যবাদ বস! "${groupName}" গ্রুপে অ্যাডমিন পারমিশন নিশ্চিত হওয়ায় স্বয়ংক্রিয় নিরাপত্তা এখন পুরোপুরি চালু।`,
        sock,
      });
    }
  }
}

export async function flushPendingServerNotices(sock: WASocket | null) {
  if (!sock || isFlushingServerNotices) return;
  isFlushingServerNotices = true;
  try {
    while (pendingServerProblems.length > 0) {
      const next = pendingServerProblems.shift()!;
      const tracked = activeProblemsMap.get(next.category);
      if (tracked?.notifiedBoss && Date.now() - tracked.reportedAt < 4 * 60 * 60 * 1000) {
        continue;
      }
      const ok = await deliverServerNotice(sock, next);
      if (!ok) {
        if (!pendingServerProblems.some((p) => p.category === next.category)) {
          pendingServerProblems.unshift(next);
        }
        break;
      }
    }
    let flushedRecovery = false;
    while (pendingServerRecoveries.length > 0) {
      const nextRec = pendingServerRecoveries.shift()!;
      const ok = await deliverServerRecoveryNotice(sock, nextRec);
      if (!ok) {
        if (!pendingServerRecoveries.some((r) => r.category === nextRec.category)) {
          pendingServerRecoveries.unshift(nextRec);
        }
        break;
      }
      flushedRecovery = true;
    }
    if (flushedRecovery) {
      savePersistedActiveProblems();
    }
  } finally {
    isFlushingServerNotices = false;
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
      } else if (memMb < 390 && activeProblemsMap.has('high_memory')) {
        await resolveServerProblem('high_memory', {
          details: `সার্ভারের মেমোরি (RAM) এখন স্বাভাবিক পর্যায়ে ফিরেছে (বর্তমান ব্যবহার: ${memMb} MB)।`,
          thanksNote: 'ধন্যবাদ বস! সার্ভারের লোড কমে এখন একদম ফ্রি ও দ্রুতগতিতে চলছে।',
          sock,
        });
      }

      // Check runtime stability after crash/rejection alerts (> 2 minutes clean)
      const now = Date.now();
      for (const crashCat of ['unhandled_rejection', 'uncaught_exception']) {
        const trackedCrash = activeProblemsMap.get(crashCat);
        if (trackedCrash && now - trackedCrash.reportedAt > 2 * 60 * 1000) {
          await resolveServerProblem(crashCat, {
            details: 'সার্ভার কোনো নতুন ত্রুটি ছাড়াই একটানা স্থিতিশীলভাবে সচল রয়েছে।',
            thanksNote: 'ধন্যবাদ বস! সার্ভার প্রসেস এখন পুরোপুরি সুস্থ ও নির্বিঘ্ন অবস্থায় আছে।',
            sock,
          });
        }
      }

      // Check if previously disconnected or permission-blocked issues are now healthy
      if (sock?.user && sock?.authState?.creds?.registered && ((sock as any).ws?.isOpen ?? true)) {
        for (const connCat of ['wa_disconnect_drop', 'wa_extended_outage']) {
          if (activeProblemsMap.has(connCat)) {
            await resolveServerProblem(connCat, {
              details: 'WhatsApp সংযোগ পুনরায় অনলাইনে ফিরেছে এবং স্থিতিশীলভাবে কাজ করছে।',
              thanksNote: 'ধন্যবাদ বস! সার্ভার ও কানেকশন ঠিক থাকায় বট আবার পুরোপুরি অ্যাক্টিভ।',
              sock,
            });
          }
        }

        for (const tracked of Array.from(activeProblemsMap.values())) {
          const match = tracked.category.match(/^(?:sticker_no_perm_|no_admin_|sticker_perm_fail_)(.+)$/);
          if (match) {
            const gid = match[1];
            const meta = groupMetaCache[gid]?.meta;
            if (meta && isBotGroupAdminFromMeta(sock, meta)) {
              await resolveAdminPermissionProblemsForGroup(gid, meta.subject || getKnownGroupSubjectFallback(gid), sock);
            }
          }
        }
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
const inFlightMetaFetches = new Map<string, Promise<any>>();
let lastAllGroupsFallbackAt = 0;

function getKnownGroupSubjectFallback(groupId: string): string {
  const cachedSubj = groupMetaCache[groupId]?.meta?.subject;
  if (cachedSubj) return cachedSubj;
  for (const act of Object.values(db.memberActivity || {})) {
    if (act.groupId === groupId && act.groupName && act.groupName !== 'WhatsApp Group') {
      return act.groupName;
    }
  }
  for (const warn of Object.values(db.warnings || {})) {
    if (warn.groupId === groupId && warn.groupName && warn.groupName !== 'WhatsApp Group') {
      return warn.groupName;
    }
  }
  return 'WhatsApp Group';
}

export async function getGroupMeta(sock: WASocket, groupId: string, forceRefresh = false) {
  const cached = groupMetaCache[groupId];
  const now = Date.now();
  // Fast path: serve fresh cache within 5 minutes (0ms latency for instant sticker/profanity removal)
  if (!forceRefresh && cached?.meta?.participants?.length > 0 && now - cached.fetchedAt < 300000) {
    learnGroupParticipantsLidPn(cached.meta);
    return cached.meta;
  }
  // Stale-while-revalidate: if older cache exists, return immediately & refresh silently in background
  if (!forceRefresh && cached?.meta?.participants?.length > 0) {
    learnGroupParticipantsLidPn(cached.meta);
    if (!inFlightMetaFetches.has(groupId)) {
      const p = sock.groupMetadata(groupId)
        .then((freshMeta) => {
          if (freshMeta) {
            groupMetaCache[groupId] = { meta: freshMeta, fetchedAt: Date.now() };
            learnGroupParticipantsLidPn(freshMeta);
          }
          return freshMeta;
        })
        .catch(() => null)
        .finally(() => {
          inFlightMetaFetches.delete(groupId);
        });
      inFlightMetaFetches.set(groupId, p);
    }
    return cached.meta;
  }

  const existingFetch = inFlightMetaFetches.get(groupId);
  if (existingFetch) {
    const res = await existingFetch;
    if (res) return res;
  }

  const fetchPromise = (async () => {
    try {
      const meta = await sock.groupMetadata(groupId);
      if (meta) {
        groupMetaCache[groupId] = { meta, fetchedAt: Date.now() };
        learnGroupParticipantsLidPn(meta);
        return meta;
      }
    } catch (err: any) {
      // Quick retry once after short pause if no cache is present yet
      if (!cached?.meta) {
        await new Promise((r) => setTimeout(r, 350));
        try {
          const retryMeta = await sock.groupMetadata(groupId);
          if (retryMeta) {
            groupMetaCache[groupId] = { meta: retryMeta, fetchedAt: Date.now() };
            learnGroupParticipantsLidPn(retryMeta);
            return retryMeta;
          }
        } catch {}
      }
      console.error(`Failed to fetch metadata for group ${groupId}:`, err?.message || err);
    }

    // Fallback to groupFetchAllParticipating when single groupMetadata query fails
    if (Date.now() - lastAllGroupsFallbackAt > 25000) {
      lastAllGroupsFallbackAt = Date.now();
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        primeGroupMetaCache(allGroups);
        if (groupMetaCache[groupId]?.meta) {
          return groupMetaCache[groupId].meta;
        }
      } catch {}
    }

    return cached ? cached.meta : null;
  })();

  inFlightMetaFetches.set(groupId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightMetaFetches.delete(groupId);
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

export function upsertCachedGroupMeta(updates: any[]) {
  if (!Array.isArray(updates)) return;
  const now = Date.now();
  for (const u of updates) {
    const groupId = u?.id;
    if (!groupId || !groupId.endsWith('@g.us')) continue;
    const prevMeta = groupMetaCache[groupId]?.meta || {};
    const mergedMeta = {
      ...prevMeta,
      ...u,
      participants: Array.isArray(u.participants) && u.participants.length > 0 ? u.participants : prevMeta.participants,
    };
    groupMetaCache[groupId] = { meta: mergedMeta, fetchedAt: now };
    learnGroupParticipantsLidPn(mergedMeta);
  }
}

export function getCachedGroupMetadataSync(groupId: string): any | undefined {
  return groupMetaCache[groupId]?.meta;
}

export function getAllCachedGroupMetasSync(): any[] {
  return Object.values(groupMetaCache)
    .map((entry) => entry?.meta)
    .filter((m) => m?.id && String(m.id).endsWith('@g.us'));
}

export function removeCachedGroupMeta(groupId: string) {
  if (groupId && groupMetaCache[groupId]) {
    delete groupMetaCache[groupId];
  }
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

const recentNewMemberRulesSent = new Map<string, number>();

export async function handleGroupParticipantsUpdate(
  sock: WASocket,
  update: { id: string; participants: any[]; action: string }
) {
  try {
    const groupId = update?.id;
    if (!groupId || !groupId.endsWith('@g.us')) return;

    // Always invalidate cache when members or admin roles change so moderation stays accurate
    delete groupMetaCache[groupId];

    if (update.action === 'promote') {
      const hasPermAlert =
        activeProblemsMap.has(`sticker_no_perm_${groupId}`) ||
        activeProblemsMap.has(`no_admin_${groupId}`) ||
        activeProblemsMap.has(`sticker_perm_fail_${groupId}`);
      if (hasPermAlert) {
        await resolveBotIdentitySet(sock).catch(() => {});
        const freshMeta = await getGroupMeta(sock, groupId, true).catch(() => null);
        if (freshMeta && isBotGroupAdminFromMeta(sock, freshMeta)) {
          await resolveAdminPermissionProblemsForGroup(groupId, freshMeta.subject || getKnownGroupSubjectFallback(groupId), sock);
        }
      }
      return;
    }

    if (update.action !== 'add' || !Array.isArray(update.participants) || update.participants.length === 0) {
      return;
    }

    const settings = getSettings();
    const welcomeEnabled = Boolean(settings.autoWelcome);
    const inboxRulesEnabled = settings.newMemberInboxRulesEnabled !== false;
    if (!welcomeEnabled && !inboxRulesEnabled) {
      return;
    }

    const meta = await getGroupMeta(sock, groupId, true);
    const groupSubject = meta?.subject || 'আমাদের গ্রুপ';
    const memberCount = meta?.participants?.length || 0;

    // Build bot identity set so we don't welcome or DM the bot itself
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
    const addedMembers: Array<{
      groupMentionJid: string;
      dmJid: string;
      displayNum: string;
      participantUser: string;
    }> = [];

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
      let resolvedPhone = '';
      const metaMatch = meta?.participants?.find(
        (p: any) =>
          cleanJidUser(p.id) === participantUser ||
          cleanJidUser(p.lid) === participantUser ||
          cleanJidUser(p.phoneNumber) === participantUser
      );
      if (typeof rawParticipant === 'object' && rawParticipant?.phoneNumber) {
        resolvedPhone = cleanJidUser(rawParticipant.phoneNumber);
        displayNum = resolvedPhone || displayNum;
      } else if (metaMatch?.phoneNumber) {
        resolvedPhone = cleanJidUser(metaMatch.phoneNumber);
        displayNum = resolvedPhone || displayNum;
      }

      const dmJid = resolvedPhone ? normalizeJid(`${resolvedPhone}@s.whatsapp.net`) : normalized;

      if (!mentions.includes(normalized)) {
        mentions.push(normalized);
        mentionLabels.push(`@${displayNum}`);
        addedMembers.push({
          groupMentionJid: normalized,
          dmJid,
          displayNum,
          participantUser,
        });
      }
    }

    if (mentions.length === 0) return;

    const userTagString = mentionLabels.join(', ');

    if (welcomeEnabled) {
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
    }

    // Send Group Rules Notice to New Member's Private Inbox + Short @Mention Notice in Group
    if (inboxRulesEnabled && addedMembers.length > 0) {
      const now = Date.now();
      for (const [k, ts] of recentNewMemberRulesSent.entries()) {
        if (now - ts > 60_000) recentNewMemberRulesSent.delete(k);
      }

      const customRulesTemplate = (settings.newMemberInboxRulesNotice || '').trim();
      const dmSucceeded: typeof addedMembers = [];

      for (const member of addedMembers) {
        const dedupeKey = `${groupId}:${member.participantUser}`;
        const prevTs = recentNewMemberRulesSent.get(dedupeKey);
        if (prevTs && now - prevTs < 30_000) continue;
        recentNewMemberRulesSent.set(dedupeKey, now);

        const memberTag = `@${member.displayNum}`;
        const inboxRulesText = customRulesTemplate
          ? customRulesTemplate
              .replace(/\{user\}/gi, memberTag)
              .replace(/\{group\}/gi, groupSubject)
              .replace(/\{memberCount\}/gi, String(memberCount || ''))
          : `📜 *${groupSubject} — গ্রুপ রুলস নোটিশ*\n\nআসসালামু আলাইকুম ${memberTag},\n*${groupSubject}* গ্রুপে যুক্ত হওয়ার জন্য আপনাকে স্বাগতম! 🌸\n\n📌 *গুরুত্বপূর্ণ নিয়মাবলী:*\n১। গ্রুপে কোনো ধরনের গালিগালাজ, অশালীন কথা বা ভয়েস মেসেজ দেওয়া নিষেধ।\n২। অতিরিক্ত স্টিকার স্প্যাম ও অননুমোদিত লিংক শেয়ার করবেন না।\n৩। সবার সাথে ভদ্র, সম্মানজনক ও বন্ধুত্বপূর্ণ আচরণ বজায় রাখুন।\n৪। নিয়ম ভঙ্গ করলে বট স্বয়ংক্রিয়ভাবে সতর্কবার্তা, মিউট বা রিমুভ করবে।\n\n🤝 নিয়ম মেনে গ্রুপে থাকার জন্য ধন্যবাদ!`;

        let dmSent = await safeSendMessage(sock, member.dmJid, {
          text: inboxRulesText,
        });

        if (!dmSent && member.dmJid !== member.groupMentionJid) {
          dmSent = await safeSendMessage(sock, member.groupMentionJid, {
            text: inboxRulesText,
          });
        }

        if (dmSent) {
          dmSucceeded.push(member);
        } else {
          addActivityLog({
            groupId,
            groupName: groupSubject,
            senderJid: member.groupMentionJid,
            senderPhone: member.displayNum,
            action: 'error',
            reason: 'নতুন সদস্যের ইনবক্সে গ্রুপ রুলস পাঠানো যায়নি (DM ব্লক/প্রাইভেসি)',
            details: `@${member.displayNum} এর ইনবক্সে রুলস পাঠানো সম্ভব হয়নি`,
          });
        }

        if (addedMembers.length > 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      if (dmSucceeded.length > 0) {
        if (welcomeEnabled) {
          await new Promise((r) => setTimeout(r, 350));
        }
        const dmTags = dmSucceeded.map((m) => `@${m.displayNum}`).join(', ');
        const dmMentions = dmSucceeded.map((m) => m.groupMentionJid);
        const customGroupNotice = (settings.newMemberGroupNoticeText || '').trim();
        const shortGroupNotice = customGroupNotice
          ? customGroupNotice.replace(/\{user\}/gi, dmTags).replace(/\{group\}/gi, groupSubject)
          : `📩 ${dmTags}, *${groupSubject}* গ্রুপের রুলস নোটিশ আপনার ইনবক্সে দেওয়া হলো। দয়া করে ইনবক্স চেক করুন!`;

        const groupNoticeSent = await safeSendMessage(sock, groupId, {
          text: shortGroupNotice,
          mentions: dmMentions,
        });

        if (groupNoticeSent) {
          addActivityLog({
            groupId,
            groupName: groupSubject,
            senderJid: dmSucceeded[0].groupMentionJid,
            senderPhone: dmSucceeded[0].displayNum,
            action: 'replied',
            reason: 'নতুন সদস্যের ইনবক্সে গ্রুপ রুলস ও গ্রুপে মেনশন নোটিশ পাঠানো হয়েছে',
            details: `${dmTags} এর ইনবক্সে রুলস পাঠানো হয়েছে`,
          });
        }
      }
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
  metaKnown: boolean;
  groupSubject: string;
  matchedSenderId?: string;
}> {
  try {
    const meta = await getGroupMeta(sock, groupId, forceRefresh);
    if (!meta || !Array.isArray(meta.participants) || meta.participants.length === 0) {
      return {
        isSenderAdmin: false,
        isBotAdmin: false,
        metaKnown: false,
        groupSubject: meta?.subject || getKnownGroupSubjectFallback(groupId),
      };
    }

    learnGroupParticipantsLidPn(meta);

    const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
    const { botUsers, botNormalized } = await resolveBotIdentitySet(sock);

    const senderCandidates = new Set(
      [cleanJidUser(senderJid), cleanJidUser(senderAltJid)].filter(Boolean)
    );
    const senderNormalized = new Set(
      [senderJid ? normalizeJid(senderJid) : '', senderAltJid ? normalizeJid(senderAltJid) : ''].filter(Boolean)
    );
    if (isLidJid(senderJid) && lidMappingApi?.getPNForLID && !lidToPnUserMap.has(cleanJidUser(senderJid))) {
      try {
        const pn = await Promise.race([
          lidMappingApi.getPNForLID(senderJid),
          new Promise<null>((r) => setTimeout(() => r(null), 1000)),
        ]);
        if (pn) rememberLidPnPair(senderJid, pn);
      } catch {}
    } else if (senderJid && !isLidJid(senderJid) && lidMappingApi?.getLIDForPN) {
      const pnClean = normalizePhoneDigits(cleanJidUser(senderJid)) || cleanJidUser(senderJid);
      if (pnClean && /^\d{6,16}$/.test(pnClean) && !pnToLidUserMap.has(pnClean)) {
        try {
          const lid = await Promise.race([
            lidMappingApi.getLIDForPN(`${pnClean}@s.whatsapp.net`),
            new Promise<null>((r) => setTimeout(() => r(null), 1000)),
          ]);
          if (lid) rememberLidPnPair(lid, `${pnClean}@s.whatsapp.net`);
        } catch {}
      }
    }
    expandIdSetWithLidMaps(senderCandidates, senderNormalized);

    let isSenderAdmin = false;
    let isBotAdmin = false;
    let matchedSenderId: string | undefined;
    const unresolvedAdminLidParticipants: Array<{ id: string; p: any }> = [];

    for (const p of meta.participants) {
      const pAny = p as any;
      const pAllJids = [p.id, pAny.jid, pAny.lid, pAny.phoneNumber, pAny.pn].filter(Boolean) as string[];
      const pCleanSet = new Set<string>();
      const pNormSet = new Set<string>();
      for (const j of pAllJids) {
        const cu = cleanJidUser(j);
        if (cu) pCleanSet.add(cu);
        const norm = normalizeJid(j);
        if (norm) pNormSet.add(norm);
        if (!isLidJid(j)) {
          const pnDigits = normalizePhoneDigits(cu);
          if (pnDigits) pCleanSet.add(pnDigits);
        }
      }
      expandIdSetWithLidMaps(pCleanSet, pNormSet);

      const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);

      const matchesSender =
        Array.from(pCleanSet).some((c) => senderCandidates.has(c)) ||
        Array.from(pNormSet).some((n) => senderNormalized.has(n));

      if (matchesSender) {
        matchedSenderId = p.id;
        if (isAdmin) {
          isSenderAdmin = true;
        }
      }

      const matchesBot =
        Array.from(pCleanSet).some((c) => botUsers.has(c)) ||
        Array.from(pNormSet).some((n) => botNormalized.has(n));

      if (matchesBot && isAdmin) {
        isBotAdmin = true;
      } else if (isAdmin && !isBotAdmin && p.id && isLidJid(p.id) && !pAny.phoneNumber && !pAny.pn) {
        unresolvedAdminLidParticipants.push({ id: p.id, p });
      }
    }

    // Check group creator/owner metadata as additional proof of admin rights
    if (!isBotAdmin) {
      const ownerCands = [meta.owner, meta.ownerPn].filter(Boolean) as string[];
      for (const ow of ownerCands) {
        const cu = cleanJidUser(ow);
        const nu = !isLidJid(ow) ? normalizePhoneDigits(cu) : '';
        if (botUsers.has(cu) || (nu && botUsers.has(nu)) || botNormalized.has(normalizeJid(ow))) {
          isBotAdmin = true;
          break;
        }
      }
    }

    // Last-resort Baileys v7 check: resolve @lid -> @s.whatsapp.net ONLY for admin participants if bot wasn't matched yet (parallel & cached)
    if (!isBotAdmin && unresolvedAdminLidParticipants.length > 0 && typeof lidMappingApi?.getPNForLID === 'function') {
      const batch = unresolvedAdminLidParticipants.slice(0, 30);
      await Promise.allSettled(
        batch.map(async (adminEntry) => {
          const lidUser = cleanJidUser(adminEntry.id);
          if (lidUser && lidToPnUserMap.has(lidUser)) {
            const cachedPn = lidToPnUserMap.get(lidUser)!;
            if (botUsers.has(cachedPn)) isBotAdmin = true;
            return;
          }
          try {
            const lookedUpPn = await Promise.race([
              lidMappingApi.getPNForLID(adminEntry.id),
              new Promise<null>((r) => setTimeout(() => r(null), 600)),
            ]);
            if (lookedUpPn) {
              rememberLidPnPair(adminEntry.id, lookedUpPn);
              const pnClean = cleanJidUser(lookedUpPn);
              const pnNorm = normalizePhoneDigits(pnClean);
              if ((pnClean && botUsers.has(pnClean)) || (pnNorm && botUsers.has(pnNorm))) {
                isBotAdmin = true;
              }
            }
          } catch {}
        })
      );
    }

    if (isBotAdmin) {
      resolveAdminPermissionProblemsForGroup(groupId, meta.subject || getKnownGroupSubjectFallback(groupId), sock).catch(() => {});
    }

    return {
      isSenderAdmin,
      isBotAdmin,
      metaKnown: true,
      groupSubject: meta.subject || getKnownGroupSubjectFallback(groupId),
      matchedSenderId,
    };
  } catch (err: any) {
    console.error('[checkPermissions error]:', err.message);
    return {
      isSenderAdmin: false,
      isBotAdmin: false,
      metaKnown: false,
      groupSubject: getKnownGroupSubjectFallback(groupId),
    };
  }
}

function isValidUserParticipantJid(jid?: string | null): boolean {
  if (!jid) return false;
  const str = String(jid).trim();
  if (!str || str === 'BOT' || str === 'unknown') return false;
  const lower = str.toLowerCase();
  if (lower.endsWith('@g.us') || lower === 'status@broadcast') return false;
  return lower.includes('@lid') || lower.includes('@s.whatsapp.net') || lower.includes('@c.us');
}

export async function resolveAllGroupParticipantJids(
  sock: WASocket,
  groupId: string,
  senderJid?: string | null,
  senderAltJid?: string | null,
  rawParticipant?: string | null
): Promise<{
  isSenderBot: boolean;
  addressingMode: 'lid' | 'pn';
  matchedSenderId?: string;
  candidates: string[];
}> {
  const meta = await getGroupMeta(sock, groupId, false).catch(() => null);
  if (meta) {
    learnGroupParticipantsLidPn(meta);
  }
  const addressingMode: 'lid' | 'pn' = (meta as any)?.addressingMode === 'pn' ? 'pn' : 'lid';
  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
  const { botUsers, botNormalized } = await resolveBotIdentitySet(sock);

  const cleanInputs = [rawParticipant, senderJid, senderAltJid]
    .map((j) => String(j || '').trim())
    .filter((j) => isValidUserParticipantJid(j));

  rememberLidPnPair(rawParticipant || senderJid, senderAltJid);

  const userCleanSet = new Set<string>();
  const normSet = new Set<string>();

  for (const j of cleanInputs) {
    const cu = cleanJidUser(j);
    if (cu) userCleanSet.add(cu);
    const norm = normalizeJid(j);
    if (norm) normSet.add(norm);
    if (!isLidJid(j)) {
      const pnDigits = normalizePhoneDigits(cu);
      if (pnDigits) userCleanSet.add(pnDigits);
    }
  }

  // Bidirectional Signal LID/PN lookup so even left-group or historical senders resolve both formats
  for (const j of cleanInputs) {
    const cu = cleanJidUser(j);
    if (!cu) continue;
    if (isLidJid(j)) {
      if (!lidToPnUserMap.has(cu) && typeof lidMappingApi?.getPNForLID === 'function') {
        try {
          const pn = await Promise.race([
            lidMappingApi.getPNForLID(normalizeJid(j)),
            new Promise<null>((r) => setTimeout(() => r(null), 900)),
          ]);
          if (pn) rememberLidPnPair(j, pn);
        } catch {}
      }
    } else if (isPnJid(j)) {
      const pnDigits = normalizePhoneDigits(cu) || cu;
      if (pnDigits && !pnToLidUserMap.has(pnDigits) && typeof lidMappingApi?.getLIDForPN === 'function') {
        try {
          const lid = await Promise.race([
            lidMappingApi.getLIDForPN(`${pnDigits}@s.whatsapp.net`),
            new Promise<null>((r) => setTimeout(() => r(null), 900)),
          ]);
          if (lid) rememberLidPnPair(lid, `${pnDigits}@s.whatsapp.net`);
        } catch {}
      }
    }
  }

  expandIdSetWithLidMaps(userCleanSet, normSet);

  let isSenderBot =
    String(senderJid || '').trim() === 'BOT' ||
    Array.from(userCleanSet).some((u) => botUsers.has(u)) ||
    Array.from(normSet).some((n) => botNormalized.has(n));

  let matchedSenderId: string | undefined;
  let matchedLidJid = '';
  let matchedPnJid = '';

  if (meta?.participants && Array.isArray(meta.participants)) {
    for (const p of meta.participants) {
      if (!p) continue;
      const pAny = p as any;
      const pAllJids = [p.id, pAny.jid, pAny.lid, pAny.phoneNumber, pAny.pn].filter((j): j is string =>
        Boolean(j && isValidUserParticipantJid(String(j)))
      );
      const pCleanSet = new Set<string>();
      const pNormSet = new Set<string>();
      for (const j of pAllJids) {
        const cu = cleanJidUser(j);
        if (cu) pCleanSet.add(cu);
        const norm = normalizeJid(j);
        if (norm) pNormSet.add(norm);
        if (!isLidJid(j)) {
          const pnDigits = normalizePhoneDigits(cu);
          if (pnDigits) pCleanSet.add(pnDigits);
        }
      }
      expandIdSetWithLidMaps(pCleanSet, pNormSet);

      const matches =
        Array.from(pCleanSet).some((c) => userCleanSet.has(c)) ||
        Array.from(pNormSet).some((n) => normSet.has(n));

      if (matches) {
        matchedSenderId = isValidUserParticipantJid(p.id) ? normalizeJid(p.id) : undefined;
        if (!isSenderBot) {
          isSenderBot =
            Array.from(pCleanSet).some((c) => botUsers.has(c)) ||
            Array.from(pNormSet).some((n) => botNormalized.has(n));
        }
        for (const j of pAllJids) {
          const norm = normalizeJid(j);
          if (isLidJid(norm) && !matchedLidJid) matchedLidJid = norm;
          else if (isPnJid(norm) && !matchedPnJid) matchedPnJid = norm;
        }
        for (const norm of pNormSet) {
          if (isLidJid(norm) && !matchedLidJid) matchedLidJid = norm;
          else if (isPnJid(norm) && !matchedPnJid) matchedPnJid = norm;
        }
        break;
      }
    }
  }

  for (const norm of normSet) {
    if (isLidJid(norm) && !matchedLidJid) matchedLidJid = norm;
    else if (isPnJid(norm) && !matchedPnJid) matchedPnJid = norm;
  }

  const normalizedRaw = isValidUserParticipantJid(rawParticipant) ? normalizeJid(String(rawParticipant)) : '';
  const orderedRawCandidates =
    addressingMode === 'lid'
      ? [
          matchedSenderId && isLidJid(matchedSenderId) ? matchedSenderId : '',
          matchedLidJid,
          normalizedRaw,
          matchedSenderId || '',
          matchedPnJid,
          ...Array.from(normSet),
        ]
      : [
          matchedSenderId && isPnJid(matchedSenderId) ? matchedSenderId : '',
          matchedPnJid,
          normalizedRaw,
          matchedSenderId || '',
          matchedLidJid,
          ...Array.from(normSet),
        ];

  const candidates: string[] = [];
  for (const c of orderedRawCandidates) {
    if (isValidUserParticipantJid(c) && !candidates.includes(c)) {
      candidates.push(c);
    }
  }

  return {
    isSenderBot,
    addressingMode,
    matchedSenderId,
    candidates,
  };
}

/**
 * Bulletproof Baileys v7 Group Message Revoke (handles PN + LID addressing modes)
 * Strict Permission Check: Never falsely returns true when bot lacks Admin delete permissions.
 */
export async function deleteMessageSafely(
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

  if (key.fromMe) {
    try {
      await Promise.race([
        sock.sendMessage(
          remoteJid,
          {
            delete: {
              remoteJid,
              fromMe: true,
              id: key.id,
            },
          },
          { useCachedGroupMetadata: true }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Delete ACK timeout (10s)')), 10000)),
      ]);
      return true;
    } catch (err: any) {
      console.error('[Delete Own Message FAILED]:', err?.message || err);
      return false;
    }
  }

  const rawParticipant = key.participant || (msg as any).participant || '';
  const altParticipant = (key as any).participantAlt || '';
  const resolved = await resolveAllGroupParticipantJids(sock, remoteJid, rawParticipant, altParticipant, rawParticipant);

  if (resolved.isSenderBot) {
    try {
      await Promise.race([
        sock.sendMessage(
          remoteJid,
          {
            delete: {
              remoteJid,
              fromMe: true,
              id: key.id,
            },
          },
          { useCachedGroupMetadata: true }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Delete ACK timeout (10s)')), 10000)),
      ]);
      return true;
    } catch {}
  }

  const participantCandidates: string[] = [];
  for (const cand of [
    matchedSenderId && isValidUserParticipantJid(matchedSenderId) ? normalizeJid(matchedSenderId) : '',
    ...resolved.candidates,
  ]) {
    if (cand && !participantCandidates.includes(cand)) {
      participantCandidates.push(cand);
    }
  }

  let lastErr: any = null;
  for (const participant of participantCandidates) {
    try {
      await Promise.race([
        sock.sendMessage(
          remoteJid,
          {
            delete: {
              remoteJid,
              fromMe: false,
              id: key.id,
              participant,
            },
          },
          { useCachedGroupMetadata: true }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Delete ACK timeout (10s)')), 10000)),
      ]);
      return true;
    } catch (err: any) {
      lastErr = err;
      const errMsg = String(err?.message || '');
      const status = Number(err?.output?.statusCode || err?.status || 0);
      if (
        status === 401 ||
        status === 403 ||
        status === 429 ||
        /connection closed|not connected|socket|closed/i.test(errMsg)
      ) {
        console.error('[Delete Message FAILED fast]:', errMsg);
        return false;
      }
    }
  }

  try {
    await Promise.race([
      sock.sendMessage(remoteJid, { delete: key }, { useCachedGroupMetadata: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Delete ACK timeout (10s)')), 10000)),
    ]);
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

  const hideName = Boolean(settings.hideNameOnDelete);

  if (warningCount === 1 && !settings.silentModeration && canSendNotice) {
    lastAntiStickerNoticeAt.set(throttleKey, now);
    await safeSendMessage(sock, groupId, {
      text: hideName
        ? `⚠️ [সতর্কবার্তা ১/৩]\nগ্রুপে স্টিকার পাঠানো নিষিদ্ধ! নিয়ম ভঙ্গকারী স্টিকারটি মুছে দেওয়া হয়েছে। সবাইকে নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`
        : `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${senderPhone}, গ্রুপে স্টিকার পাঠানো নিষিদ্ধ!\nআপনার স্টিকারটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
      ...(hideName ? {} : { mentions: [senderJid] }),
    });
  } else if (warningCount === 2 && !settings.silentModeration && canSendNotice) {
    lastAntiStickerNoticeAt.set(throttleKey, now);
    await safeSendMessage(sock, groupId, {
      text: hideName
        ? `⚠️ [সতর্কবার্তা ২/৩]\nগ্রুপে স্টিকার পাঠানো নিষিদ্ধ! নিয়ম ভঙ্গকারী স্টিকারটি মুছে দেওয়া হয়েছে। পরবর্তী নিয়মলঙ্ঘনে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`
        : `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${senderPhone}, এটি আপনার দ্বিতীয় সতর্কতা (স্টিকার পাঠানো নিষিদ্ধ)!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
      ...(hideName ? {} : { mentions: [senderJid] }),
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
          text: hideName
            ? `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\n৩ বার স্টিকার নিয়ম লঙ্ঘন করায় নিরাপত্তার স্বার্থে সদস্যকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`
            : `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${senderPhone} ৩ বার স্টিকার নিয়ম লঙ্ঘন করেছেন।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
          ...(hideName ? {} : { mentions: [senderJid] }),
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

export type VoiceModerationEnqueueFn = (params: {
  sock: WASocket;
  msg: proto.IWebMessageInfo;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderAltJid?: string;
  canonicalSender: string;
  senderPhone: string;
  senderName: string;
  isSenderAdmin: boolean;
  isBotAdmin: boolean;
  metaKnown: boolean;
}) => void;

let registeredVoiceModerationEnqueue: VoiceModerationEnqueueFn | null = null;

export function registerVoiceModerationHook(fn: VoiceModerationEnqueueFn) {
  registeredVoiceModerationEnqueue = fn;
}

export async function applyVoiceAbusePenalty(
  sock: WASocket,
  params: {
    groupId: string;
    groupName: string;
    senderJid: string;
    canonicalSender: string;
    senderAltJid?: string;
    senderPhone: string;
    deleteSuccessful: boolean;
    isBotAdmin: boolean;
    matchedWords: string[];
    detectedLanguage: string;
  }
) {
  const {
    groupId,
    groupName,
    senderJid,
    canonicalSender,
    senderAltJid,
    senderPhone,
    deleteSuccessful,
    isBotAdmin,
    matchedWords,
    detectedLanguage,
  } = params;
  const settings = getSettings();

  if (deleteSuccessful) {
    db.stats.deletedMessages++;
  }

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

  const noticeReason = 'ভয়েস মেসেজে অশালীন ভাষা বা গালি ব্যবহার নিষিদ্ধ';
  db.warnings[warningKey].groupId = groupId;
  db.warnings[warningKey].groupName = groupName;
  db.warnings[warningKey].senderJid = canonicalSender;
  db.warnings[warningKey].senderPhone = senderPhone;
  db.warnings[warningKey].count++;
  db.warnings[warningKey].lastViolation = Date.now();
  db.warnings[warningKey].violations.push({
    timestamp: Date.now(),
    reason: noticeReason,
  });
  db.stats.warningsGiven++;
  saveDatabase();

  const warningCount = db.warnings[warningKey].count;
  const hideName = Boolean(settings.hideNameOnDelete);

  if (warningCount === 1 && !settings.silentModeration) {
    await safeSendMessage(sock, groupId, {
      text: hideName
        ? `⚠️ [সতর্কবার্তা ১/৩]\n${noticeReason}!\n${
            deleteSuccessful
              ? 'অশালীন ভয়েস মেসেজটি মুছে দেওয়া হয়েছে।'
              : !isBotAdmin
                ? '⚠️ অ্যাডমিন পারমিশন না থাকায় ভয়েস মেসেজটি মুছে ফেলা যায়নি।'
                : '⚠️ ভয়েস মেসেজটি মুছে ফেলা সম্ভব হয়নি।'
          }`
        : `⚠️ [সতর্কবার্তা ১/৩ — Voice Guard]\nসদস্য @${senderPhone}, ${noticeReason}!\n${
            deleteSuccessful
              ? 'আপনার ভয়েস মেসেজটি মুছে দেওয়া হয়েছে।'
              : !isBotAdmin
                ? '⚠️ বটের অ্যাডমিন পারমিশন না থাকায় ভয়েস মেসেজটি মুছে ফেলা যায়নি।'
                : '⚠️ ভয়েস মেসেজটি মুছে ফেলা সম্ভব হয়নি।'
          }`,
      ...(hideName ? {} : { mentions: [senderJid] }),
    });
  } else if (warningCount === 2 && !settings.silentModeration) {
    await safeSendMessage(sock, groupId, {
      text: hideName
        ? `⚠️ [সতর্কবার্তা ২/৩]\n${noticeReason}!\nপরবর্তী নিয়মভঙ্গে গ্রুপ থেকে স্বয়ংক্রিয়ভাবে রিমুভ (Kick) করা হবে!`
        : `⚠️ [সতর্কবার্তা ২/৩ — Voice Guard]\nসদস্য @${senderPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${noticeReason})!\nপরবর্তী নিয়মভঙ্গে আপনাকে গ্রুপ থেকে স্বয়ংক্রিয়ভাবে রিমুভ (Kick) করা হবে!`,
      ...(hideName ? {} : { mentions: [senderJid] }),
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

      if (!settings.silentModeration) {
        await safeSendMessage(sock, groupId, {
          text: hideName
            ? `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\n৩ বার নিয়ম লঙ্ঘন করায় (${noticeReason}) নিরাপত্তার স্বার্থে সদস্যকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`
            : `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা — Voice Guard]\nসদস্য @${senderPhone} ৩ বার নিয়ম লঙ্ঘন করেছেন (${noticeReason})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
          ...(hideName ? {} : { mentions: [senderJid] }),
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
    action: warningCount >= 3 && settings.autoKick3Warnings ? 'kicked' : deleteSuccessful ? 'deleted' : 'warned',
    reason: `Offline Voice Anti-Abuse (${actionMap[warningCount] || 'সতর্কতা'})${deleteSuccessful ? '' : ' [Delete Failed]'}`,
    details: `Language: ${detectedLanguage} | Matched: ${matchedWords.slice(0, 3).join(', ')}`,
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
          if (!getSettings().silentModeration) {
            await safeSendMessage(sock, groupId, {
              text: '✅ [WAGuard Security]\n১০ মিনিটের লক মেয়াদ শেষ হয়েছে। গ্রুপটি পুনরায় সকল সদস্যের মেসেজ পাঠানোর জন্য উন্মুক্ত করা হলো। সবাইকে নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।',
            });
          }

          addActivityLog({
            groupId,
            groupName: lock.groupName || getKnownGroupSubjectFallback(groupId),
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

export function isBotGroupAdminFromMeta(sock: WASocket | null | undefined, meta: any): boolean {
  if (!meta) return false;
  learnGroupParticipantsLidPn(meta);
  const { botUsers, botNormalized } = collectKnownBotUsersSync(sock);

  const ownerCands = [meta.owner, meta.ownerPn].filter(Boolean) as string[];
  for (const ow of ownerCands) {
    const cu = cleanJidUser(ow);
    const nu = !isLidJid(ow) ? normalizePhoneDigits(cu) : '';
    if (botUsers.has(cu) || (nu && botUsers.has(nu)) || botNormalized.has(normalizeJid(ow))) {
      return true;
    }
  }

  if (!Array.isArray(meta.participants)) return false;
  for (const p of meta.participants) {
    const pAny = p as any;
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);
    if (!isAdmin) continue;
    const rawJids = [p.id, pAny.jid, pAny.lid, pAny.phoneNumber, pAny.pn].filter(Boolean) as string[];
    const pSet = new Set<string>();
    for (const j of rawJids) {
      const cu = cleanJidUser(j);
      if (cu) pSet.add(cu);
      if (!isLidJid(j)) {
        const pn = normalizePhoneDigits(cu);
        if (pn) pSet.add(pn);
      }
    }
    expandIdSetWithLidMaps(pSet);
    if (Array.from(pSet).some((c) => botUsers.has(c))) return true;
  }
  return false;
}

export async function applyNightModeManually(sock: WASocket | null, lock: boolean): Promise<{ affected: number }> {
  if (!sock || !sock.authState?.creds?.registered) {
    return { affected: 0 };
  }
  await resolveBotIdentitySet(sock).catch(() => {});
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
        if (settings.nightModeNotify !== false && !settings.silentModeration) {
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
        if (settings.nightModeNotify !== false && !settings.silentModeration) {
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
  requestedGroupId?: string,
  options?: {
    forceRefresh?: boolean;
    fallbackGroups?: Array<{ id: string; name: string; participants?: number; isBotAdmin?: boolean }>;
  }
): Promise<{
  connected: boolean;
  groups: Array<{ id: string; name: string; participants: number; isBotAdmin: boolean }>;
  selectedGroupId: string;
  selectedGroupName: string;
  isBotAdmin: boolean;
  members: GroupMemberDirectoryItem[];
}> {
  const isSocketReady = Boolean(sock && sock.authState?.creds?.registered);
  const forceRefresh = Boolean(options?.forceRefresh);

  // 1. Seed mergedGroupsMap from cached group metadata & any server fallback group list
  const mergedGroupsMap: Record<string, any> = {};
  let newestCacheTs = 0;

  for (const [gid, entry] of Object.entries(groupMetaCache)) {
    if (gid && gid.endsWith('@g.us') && entry?.meta) {
      mergedGroupsMap[gid] = entry.meta;
      if (entry.fetchedAt > newestCacheTs) newestCacheTs = entry.fetchedAt;
    }
  }

  for (const fg of options?.fallbackGroups || []) {
    if (!fg?.id || !fg.id.endsWith('@g.us')) continue;
    if (!mergedGroupsMap[fg.id]) {
      mergedGroupsMap[fg.id] = {
        id: fg.id,
        subject: fg.name || 'WhatsApp Group',
        participants: [],
        _fallbackCount: Number(fg.participants || 0),
        _fallbackBotAdmin: Boolean(fg.isBotAdmin),
      };
    } else if (!mergedGroupsMap[fg.id].subject && fg.name) {
      mergedGroupsMap[fg.id].subject = fg.name;
    }
  }

  if (!isSocketReady && Object.keys(mergedGroupsMap).length === 0) {
    return {
      connected: false,
      groups: [],
      selectedGroupId: '',
      selectedGroupName: '',
      isBotAdmin: false,
      members: [],
    };
  }

  if (isSocketReady && sock) {
    await Promise.race([
      resolveBotIdentitySet(sock).catch(() => {}),
      new Promise<void>((r) => setTimeout(r, 2500)),
    ]);

    const hasCachedGroups = Object.keys(mergedGroupsMap).length > 0;
    const isCacheStale = Date.now() - newestCacheTs > 120000;
    const shouldFetchAll = forceRefresh || !hasCachedGroups || isCacheStale;

    if (shouldFetchAll) {
      const timeoutMs = hasCachedGroups && !forceRefresh ? 6000 : 14000;
      const fetchedGroups = await Promise.race([
        sock.groupFetchAllParticipating().catch(() => ({} as Record<string, any>)),
        new Promise<Record<string, any>>((r) => setTimeout(() => r({}), timeoutMs)),
      ]);
      if (fetchedGroups && Object.keys(fetchedGroups).length > 0) {
        primeGroupMetaCache(fetchedGroups);
        for (const [gid, gMeta] of Object.entries(fetchedGroups)) {
          if (gid && gid.endsWith('@g.us') && gMeta) {
            mergedGroupsMap[gid] = gMeta;
          }
        }
      }
    }
  }

  const groups = Object.values(mergedGroupsMap)
    .filter((g: any) => g?.id && String(g.id).endsWith('@g.us'))
    .map((g: any) => ({
      id: String(g.id),
      name: String(g.subject || getKnownGroupSubjectFallback(String(g.id)) || 'WhatsApp Group'),
      participants:
        Array.isArray(g.participants) && g.participants.length > 0
          ? g.participants.length
          : Number(g._fallbackCount || 0),
      isBotAdmin:
        isSocketReady && sock && Array.isArray(g.participants) && g.participants.length > 0
          ? isBotGroupAdminFromMeta(sock, g)
          : Boolean(g._fallbackBotAdmin),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (groups.length === 0) {
    return {
      connected: isSocketReady,
      groups: [],
      selectedGroupId: '',
      selectedGroupName: '',
      isBotAdmin: false,
      members: [],
    };
  }

  const cleanRequested = requestedGroupId ? String(requestedGroupId).trim() : '';
  const hasRequestedGroup = Boolean(cleanRequested && groups.some((g) => g.id === cleanRequested));
  const selectedGroupId = hasRequestedGroup ? cleanRequested : groups[0].id;

  let meta: any = mergedGroupsMap[selectedGroupId] || groupMetaCache[selectedGroupId]?.meta;
  const needsSelectedMetaFetch =
    isSocketReady &&
    sock &&
    (forceRefresh || !Array.isArray(meta?.participants) || meta.participants.length === 0);

  if (needsSelectedMetaFetch && sock) {
    const freshMeta = await Promise.race([
      getGroupMeta(sock, selectedGroupId, Boolean(forceRefresh)).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (freshMeta && Array.isArray(freshMeta.participants) && freshMeta.participants.length > 0) {
      meta = freshMeta;
      // Update participant count in group list
      const idx = groups.findIndex((g) => g.id === selectedGroupId);
      if (idx >= 0) {
        groups[idx].participants = freshMeta.participants.length;
        groups[idx].isBotAdmin = isBotGroupAdminFromMeta(sock, freshMeta);
      }
    }
  }

  const selectedGroupEntry = groups.find((g) => g.id === selectedGroupId);
  const selectedGroupName =
    meta?.subject || selectedGroupEntry?.name || getKnownGroupSubjectFallback(selectedGroupId) || 'WhatsApp Group';
  const isBotAdmin =
    isSocketReady && sock && Array.isArray(meta?.participants) && meta.participants.length > 0
      ? isBotGroupAdminFromMeta(sock, meta)
      : Boolean(selectedGroupEntry?.isBotAdmin);

  const botIds = new Set(
    [sock?.user?.id, sock?.user?.lid, sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid]
      .filter(Boolean)
      .map((j) => cleanJidUser(String(j)))
  );
  expandIdSetWithLidMaps(botIds);

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

  // Build participant source list: live/cached meta participants, or fallback from recorded group activity & active restrictions
  let rawParticipants: any[] = Array.isArray(meta?.participants) ? [...meta.participants] : [];
  if (rawParticipants.length === 0) {
    const seenFallbackUsers = new Set<string>();
    for (const act of Object.values(db.memberActivity || {})) {
      if (act.groupId !== selectedGroupId || !act.senderJid) continue;
      const cu = cleanJidUser(act.senderJid);
      if (!cu || seenFallbackUsers.has(cu)) continue;
      seenFallbackUsers.add(cu);
      rawParticipants.push({
        id: act.senderJid,
        phoneNumber: act.senderPhone && /^\d{10,15}$/.test(act.senderPhone) ? `${act.senderPhone}@s.whatsapp.net` : undefined,
        notify: act.name,
        admin: null,
      });
    }
    for (const r of activeRestrictions) {
      const cu = cleanJidUser(r.senderJid);
      if (!cu || seenFallbackUsers.has(cu)) continue;
      seenFallbackUsers.add(cu);
      rawParticipants.push({
        id: r.senderJid,
        phoneNumber: r.altJid || (r.senderPhone && /^\d{10,15}$/.test(r.senderPhone) ? `${r.senderPhone}@s.whatsapp.net` : undefined),
        admin: null,
      });
    }
  }

  // Batch resolve up to 35 unresolved @lid -> PN via Baileys signalRepository if available
  const lidMappingApi = (sock as any)?.signalRepository?.lidMapping;
  if (isSocketReady && typeof lidMappingApi?.getPNForLID === 'function') {
    const unresolvedLids = rawParticipants
      .map((p: any) => String(p?.id || p?.lid || ''))
      .filter((jid) => isLidJid(jid) && !lidToPnUserMap.has(cleanJidUser(jid)))
      .slice(0, 35);
    if (unresolvedLids.length > 0) {
      await Promise.race([
        Promise.allSettled(
          unresolvedLids.map(async (lidJid) => {
            try {
              const pn = await lidMappingApi.getPNForLID(lidJid);
              if (pn) rememberLidPnPair(lidJid, pn);
            } catch {}
          })
        ),
        new Promise<void>((r) => setTimeout(r, 1500)),
      ]);
    }
  }

  const members: GroupMemberDirectoryItem[] = rawParticipants
    .map((p: any) => {
      const primaryRaw = p.id || p.jid || p.lid || p.phoneNumber || '';
      const jid = normalizeJid(primaryRaw);
      if (!jid) return null;

      const cleanId = cleanJidUser(jid);
      const mappedPn = isLidJid(jid) ? lidToPnUserMap.get(cleanId) : '';
      const mappedLid = !isLidJid(jid) ? pnToLidUserMap.get(cleanId) : '';

      const rawAlt =
        p.phoneNumber ||
        p.pn ||
        (p.lid && normalizeJid(p.lid) !== jid ? p.lid : '') ||
        (mappedPn ? `${mappedPn}@s.whatsapp.net` : mappedLid ? `${mappedLid}@lid` : '');
      const altJid = rawAlt ? normalizeJid(rawAlt) : '';
      const cleanAlt = cleanJidUser(altJid);
      if (jid && altJid) rememberLidPnPair(jid, altJid);

      const act = activityByClean[cleanId] || (cleanAlt ? activityByClean[cleanAlt] : undefined);

      let phone = cleanAlt || cleanId;
      if (isPnJid(jid)) {
        phone = cleanId;
      } else if (p.phoneNumber || p.pn) {
        phone = cleanJidUser(p.phoneNumber || p.pn) || phone;
      } else if (mappedPn) {
        phone = mappedPn;
      } else if (act?.senderPhone && /^\d{10,15}$/.test(act.senderPhone)) {
        phone = act.senderPhone;
      }

      const resolvedName = (
        p.notify ||
        p.name ||
        p.verifiedName ||
        contactNamesCache[jid] ||
        contactNamesCache[cleanId] ||
        (altJid ? contactNamesCache[altJid] : '') ||
        (cleanAlt ? contactNamesCache[cleanAlt] : '') ||
        (phone ? contactNamesCache[phone] : '') ||
        act?.name ||
        ''
      ).trim();

      const role: 'superadmin' | 'admin' | 'member' =
        p.admin === 'superadmin' || p.isSuperAdmin
          ? 'superadmin'
          : p.admin === 'admin' || p.isAdmin
          ? 'admin'
          : 'member';

      const idSet = new Set<string>([cleanId, cleanAlt, phone].filter(Boolean));
      expandIdSetWithLidMaps(idSet);
      const isSelf = Array.from(idSet).some((u) => botIds.has(u));

      const matchedRestriction = activeRestrictions.find((r) => {
        const rUsers = new Set<string>(
          [cleanJidUser(r.senderJid), cleanJidUser(r.altJid), cleanJidUser(r.senderPhone)].filter(Boolean)
        );
        expandIdSetWithLidMaps(rUsers);
        return Array.from(idSet).some((u) => rUsers.has(u));
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
    })
    .filter((item): item is GroupMemberDirectoryItem => Boolean(item));

  // Sort: Blocked first, then non-admin members alphabetically, then admins last
  members.sort((a, b) => {
    if (a.isBlocked !== b.isBlocked) return a.isBlocked ? -1 : 1;
    if ((a.role === 'member') !== (b.role === 'member')) return a.role === 'member' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    connected: isSocketReady || groups.length > 0,
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
    quotedMsg?: any;
  }
): Promise<{
  success: boolean;
  error?: string;
  noticeSent: boolean;
  restriction?: RestrictedUser & { remainingSeconds: number; remainingText: string };
}> {
  const { groupId, memberJid, memberPhone } = params;
  let altJid = params.altJid;
  const durationMinutes = Math.max(1, Math.min(180, Number(params.durationMinutes || 10)));

  if (!groupId || !memberJid) {
    return { success: false, error: 'গ্রুপ এবং মেম্বার নির্বাচন করুন।', noticeSent: false };
  }

  const cleanMemberId = cleanJidUser(memberJid);
  if (!altJid) {
    const mappedPn = isLidJid(memberJid) ? lidToPnUserMap.get(cleanMemberId) : '';
    const mappedLid = !isLidJid(memberJid) ? pnToLidUserMap.get(cleanMemberId) : '';
    if (mappedPn) altJid = `${mappedPn}@s.whatsapp.net`;
    else if (mappedLid) altJid = `${mappedLid}@lid`;
  }
  if (memberJid && altJid) {
    rememberLidPnPair(memberJid, altJid);
  }

  let groupName = getKnownGroupSubjectFallback(groupId);
  let isTargetAdmin = false;
  const meta =
    sock && sock.authState?.creds?.registered
      ? await Promise.race([
          getGroupMeta(sock, groupId, false).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ])
      : getCachedGroupMetadataSync(groupId);

  if (meta?.subject) groupName = meta.subject;

  const targetCleans = new Set(
    [cleanJidUser(memberJid), cleanJidUser(altJid), cleanJidUser(memberPhone)].filter(Boolean)
  );
  expandIdSetWithLidMaps(targetCleans);

  for (const p of meta?.participants || []) {
    const pAny = p as any;
    const pCleans = [p.id, pAny.jid, pAny.lid, pAny.phoneNumber, pAny.pn]
      .filter(Boolean)
      .map((j) => cleanJidUser(String(j)));
    if (pCleans.some((c) => targetCleans.has(c))) {
      if (!altJid && (pAny.phoneNumber || pAny.pn || pAny.lid)) {
        const candAlt = normalizeJid(String(pAny.phoneNumber || pAny.pn || pAny.lid));
        if (candAlt && candAlt !== normalizeJid(memberJid)) {
          altJid = candAlt;
          rememberLidPnPair(memberJid, altJid);
        }
      }
      if (p.admin === 'admin' || p.admin === 'superadmin' || pAny.isAdmin || pAny.isSuperAdmin) {
        isTargetAdmin = true;
      }
      break;
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

  const mappedPn = isLidJid(memberJid) ? lidToPnUserMap.get(cleanMemberId) : '';
  const cleanPhone =
    mappedPn ||
    (altJid && isPnJid(altJid) ? cleanJidUser(altJid) : '') ||
    (memberPhone || '').replace(/[^\d]/g, '') ||
    cleanJidUser(altJid) ||
    cleanMemberId ||
    'member';

  const savedRestriction = restrictUser(
    groupId,
    groupName,
    memberJid,
    cleanPhone,
    durationMinutes,
    `সাময়িক নীরবতা (${durationMinutes} মিনিট ডিসিপ্লিনারি ব্লক)`,
    altJid
  );

  let noticeSent = false;
  if (sock && sock.authState?.creds?.registered && !settings.silentModeration) {
    const hideName = Boolean(settings.hideNameOnDelete);
    const rawTemplate = (params.customNotice ?? settings.manualBlockNotice ?? '').trim();
    const template = rawTemplate || DEFAULT_MANUAL_MEMBER_BLOCK_NOTICE;
    // Strip any accidental {admin} placeholder so no admin name can ever appear in the notice
    const noticeText = template
      .replace(/\{\{?admin\}?\}/gi, '')
      .replace(/@?\{\{?user\}?\}/gi, hideName ? 'নিয়ম ভঙ্গকারী সদস্য' : `@${cleanPhone}`)
      .replace(/\{\{?minutes\}?\}/gi, String(durationMinutes));

    const mentions = hideName
      ? []
      : Array.from(
          new Set([normalizeJid(memberJid), altJid ? normalizeJid(altJid) : ''].filter(Boolean))
        );
    const sent = await safeSendMessage(
      sock,
      groupId,
      {
        text: noticeText,
        ...(mentions.length > 0 ? { mentions } : {}),
      },
      params.quotedMsg ? { quoted: params.quotedMsg } : undefined
    );
    noticeSent = Boolean(sent);
  }

  const remainingSeconds = Math.max(1, Math.ceil((savedRestriction.expiresAt - Date.now()) / 1000));
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;

  return {
    success: true,
    noticeSent,
    restriction: {
      ...savedRestriction,
      remainingSeconds,
      remainingText,
    },
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
  const { isSenderAdmin, isBotAdmin, metaKnown, groupSubject, matchedSenderId } = await checkPermissions(
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

  // -------------------------------------------------------------
  // STRICT 2-SERVER-ADMIN GROUP COMMAND SYSTEM
  // (kick, black/block, unblock, rules, warn, resetwarn, lock, unlock, promote, demote, tagall, toggles, remove, status, help)
  // ONLY the two authorized server admin numbers can run these commands from the group!
  // Other group admins & normal members CANNOT execute them.
  // -------------------------------------------------------------
  const quotedCtx = extractQuotedContextInfo(realMsg, msg);
  const hasMentions = collectMentionedJidsFromMessage(realMsg, msg).length > 0;
  const serverAdminCmd = messageText
    ? parseServerAdminGroupCommand(messageText, Boolean(quotedCtx?.stanzaId), hasMentions)
    : null;
  if (serverAdminCmd) {
    const authCheck = await isAuthorizedServerAdminSender(sock, remoteJid, senderJid, senderAltJid, msg);
    if (authCheck.authorized) {
      await executeServerAdminGroupCommand(sock, {
        cmd: serverAdminCmd,
        groupId: remoteJid,
        groupSubject,
        senderJid,
        senderAltJid,
        adminPhone: authCheck.adminPhone || cleanPhone,
        msg,
        realMsg,
        messageText,
        quotedCtx,
        isBotAdmin,
        metaKnown,
      });
      return;
    }
    // Non-authorized senders (even other group admins!) cannot trigger these commands.
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
      const extendedRes = extendRestrictionBySeconds(
        remoteJid,
        canonicalSender,
        [senderJid, senderAltJid, cleanPhone].filter(Boolean),
        60,
        msg.key?.id || undefined
      );
      const remainingSec = Math.round((extendedRes.remainingMs || restrictionCheck.remainingMs) / 1000);
      console.log(`[Individual Mute ACTIVE] Intercepted message from restricted user @${cleanPhone} in "${groupSubject}". Added +1m penalty, auto-deleting (${remainingSec}s remaining)...`);

      const deleted = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId, metaKnown ? isBotAdmin : undefined);
      if (deleted) {
        db.stats.deletedMessages++;
        db.stats.restrictedMessagesBlocked = (db.stats.restrictedMessagesBlocked || 0) + 1;
        saveDatabase();
        if (msg.key?.id) {
          markInboxMessageDeleted(
            remoteJid,
            msg.key.id,
            'moderation_engine',
            'রেস্ট্রিক্টেড ইউজারের মেসেজ অটো ডিলিট (+১ মিনিট যোগ)'
          ).catch(() => {});
        }
      } else if (metaKnown && !isBotAdmin) {
        console.warn(`[Individual Mute Warn] Bot lacks admin delete permission in "${groupSubject}".`);
      }

      if (extendedRes.shouldSendOneTimeNotice) {
        sendOneTimeBlockExtensionNotice(sock, {
          groupId: remoteJid,
          senderJid,
          senderAltJid,
          senderPhone: cleanPhone,
          remainingMs: extendedRes.remainingMs || restrictionCheck.remainingMs,
        }).catch(() => {});
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
          if (msg.key?.id) {
            markInboxMessageDeleted(
              remoteJid,
              msg.key.id,
              'moderation_engine',
              'স্টিকার স্প্যাম অটো ডিলিট'
            ).catch(() => {});
          }
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
          const hideName = Boolean(settings.hideNameOnDelete);
          await safeSendMessage(sock, remoteJid, {
            text: hideName
              ? `🚨 Security Alert\n\n⚠️ অতিরিক্ত স্টিকার পাঠানোর কারণে Anti-Spam Protection কার্যকর করা হয়েছে।\n\n🔒 Temporary Messaging Restriction Activated\n\n⏳ Restriction Duration: ${durationMins} Minutes\n\n📌 এই সময়ে স্প্যামকারীর নতুন মেসেজ স্বয়ংক্রিয়ভাবে মুছে ফেলার চেষ্টা করা হবে।\n\n🛡️ গ্রুপের অন্য সদস্যরা স্বাভাবিকভাবে মেসেজ করতে পারবেন।`
              : `🚨 WAGuard Security Alert\n\n⚠️ @${cleanPhone} অতিরিক্ত স্টিকার পাঠানোর কারণে Anti-Spam Protection-এর আওতায় এসেছে।\n\n🔒 Temporary Messaging Restriction Activated\n\n⏳ Restriction Duration: ${durationMins} Minutes\n\n📌 এই সময়ে ওই সদস্যের পাঠানো নতুন মেসেজ স্বয়ংক্রিয়ভাবে মুছে ফেলার চেষ্টা করা হবে।\n\n🛡️ গ্রুপের অন্য সদস্যরা স্বাভাবিকভাবে মেসেজ করতে পারবেন।`,
            ...(hideName ? {} : { mentions: [senderJid] }),
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

  // Offline AI Voice Anti-Abuse Queue (100% Local Whisper.cpp, Zero Paid API)
  if (
    !violationType &&
    realMsg.audioMessage &&
    settings.voiceModerationEnabled !== false &&
    registeredVoiceModerationEnqueue
  ) {
    registeredVoiceModerationEnqueue({
      sock,
      msg,
      groupId: remoteJid,
      groupName: groupSubject,
      senderJid,
      senderAltJid,
      canonicalSender,
      senderPhone: cleanPhone,
      senderName: msg.pushName || cleanPhone || 'User',
      isSenderAdmin,
      isBotAdmin,
      metaKnown,
    });
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
    console.log(`[Moderation Triggered] ${violationType} in ${groupSubject} by @${cleanPhone} (isBotAdmin=${isBotAdmin}, metaKnown=${metaKnown})`);

    // Step 1: Real Message Delete Operation (PN + LID compatible; allow attempt when metadata wasn't fetched)
    const deleteSuccessful = await deleteMessageSafely(sock, remoteJid, msg, matchedSenderId, metaKnown ? isBotAdmin : undefined);
    if (deleteSuccessful) {
      db.stats.deletedMessages++;
      if (msg.key?.id) {
        markInboxMessageDeleted(
          remoteJid,
          msg.key.id,
          'moderation_engine',
          noticeReason || violationType || 'নিয়ম ভঙ্গ মডারেশন ডিলিট'
        ).catch(() => {});
      }
    } else if (metaKnown && !isBotAdmin) {
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
    const hideName = Boolean(settings.hideNameOnDelete);

    // Feature 10: THREE WARNING AUTO KICK (Always enforce kick even if silentModeration is enabled)
    if (warningCount === 1 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: hideName
          ? `⚠️ [সতর্কবার্তা ১/৩]\nগ্রুপে ${noticeReason}!\n${
              deleteSuccessful
                ? 'নিয়ম ভঙ্গকারী মেসেজটি মুছে দেওয়া হয়েছে।'
                : !isBotAdmin
                  ? '⚠️ বটের মেসেজ ডিলিট পারমিশন (Admin) না থাকায় মেসেজটি মুছে ফেলা যায়নি।'
                  : 'মেসেজটি মুছে ফেলার চেষ্টা করা হয়েছে।'
            } সবাইকে নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`
          : `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${noticeReason}!\n${
              deleteSuccessful
                ? 'আপনার মেসেজটি মুছে দেওয়া হয়েছে।'
                : !isBotAdmin
                  ? '⚠️ বটের মেসেজ ডিলিট পারমিশন (Admin) না থাকায় মেসেজটি মুছে ফেলা যায়নি।'
                  : 'মেসেজটি মুছে ফেলার চেষ্টা করা হয়েছে।'
            } নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
        ...(hideName ? {} : { mentions: [senderJid] }),
      });
    } else if (warningCount === 2 && !settings.silentModeration) {
      await safeSendMessage(sock, remoteJid, {
        text: hideName
          ? `⚠️ [সতর্কবার্তা ২/৩]\nগ্রুপে ${noticeReason}!\nপরবর্তী নিয়মলঙ্ঘনে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`
          : `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${noticeReason})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
        ...(hideName ? {} : { mentions: [senderJid] }),
      });
    } else if (warningCount >= 3 && settings.autoKick3Warnings) {
      const freshPerms = await checkPermissions(sock, remoteJid, senderJid, true, senderAltJid);
      if (freshPerms.isSenderAdmin) {
        if (!settings.silentModeration) {
          await safeSendMessage(sock, remoteJid, {
            text: hideName
              ? `🛡️ [অ্যাডমিন সুরক্ষা Notice]\n৩টি সতর্কতা অতিক্রম হয়েছে (${noticeReason})। তবে গ্রুপ অ্যাডমিন হওয়ায় তাকে কিক করা সম্ভব নয়।`
              : `🛡️ [অ্যাডমিন সুরক্ষা Notice]\nসদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন। তবে তিনি একজন গ্রুপ অ্যাডমিন হওয়ায় তাকে কিক করা সম্ভব নয়।`,
            ...(hideName ? {} : { mentions: [senderJid] }),
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
            text: hideName
              ? `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\n৩ বার গ্রুপের নিয়ম লঙ্ঘন করায় (${noticeReason}) নিরাপত্তার স্বার্থে সদস্যকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`
              : `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${noticeReason})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ করা হচ্ছে!`,
            ...(hideName ? {} : { mentions: [senderJid] }),
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
    const bossDigitsList = getAuthorizedServerAdminDigitsList();
    const targetMode = settings.adminMentionReplyTarget === 'boss_only' ? 'boss_only' : 'all_admins';
    const adminHit = await findMentionedAdminInMessage(
      sock,
      remoteJid,
      realMsg,
      messageText,
      senderJid,
      senderAltJid,
      targetMode,
      bossDigitsList,
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
