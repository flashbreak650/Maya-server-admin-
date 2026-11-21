import fs from 'fs';
import { jidNormalizedUser, type proto, type WASocket } from '@whiskeysockets/baileys';
import {
  addActivityLog,
  applyVerifiedAntiStickerViolation,
  checkPermissions,
  collectKnownBotUsersSync,
  getCachedGroupMetadataSync,
  getGroupAdminJidsFromCachedMeta,
  getGroupMeta,
  getSettings,
  incrementMessagesChecked,
  incrementVerifiedDeletedStat,
  isBotGroupAdminFromMeta,
  isUserRestricted,
  normalizeJid,
  recordStickerContactAndActivity,
  rememberLidPnPair,
  reportServerProblem,
  resolveAdminPermissionProblemsForGroup,
  resolveServerProblem,
  restrictUser,
  safeSendMessage,
} from './moderationEngine.ts';
import { DATA_DIR, STICKER_QUEUE_DB_PATH } from './storagePaths.ts';

const QUEUE_DB_PATH = STICKER_QUEUE_DB_PATH;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export type StickerPolicy = 'restricted_user' | 'sticker_spam' | 'anti_sticker';
export type StickerTaskStatus =
  | 'pending'
  | 'processing'
  | 'deleted'
  | 'failed_no_permission'
  | 'failed';

export interface StickerQueueItem {
  uniqueKey: string; // `${groupId}:${messageId}`
  messageId: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderAltJid?: string;
  matchedSenderId?: string;
  senderPhone: string;
  fromMe: boolean;
  policy: StickerPolicy;
  priority: number; // 1 = critical burst/restricted, 2 = antiSticker
  status: StickerTaskStatus;
  attempts: number;
  maxRetries: number;
  nextRetryAt: number;
  enqueuedAt: number;
  lastAttemptAt?: number;
  completedAt?: number;
  lastError?: string;
}

export interface PermissionDeniedGroupInfo {
  groupId: string;
  groupName: string;
  detectedAt: number;
  blockedStickerCount: number;
}

export interface StickerQueueStats {
  totalEnqueued: number;
  totalVerifiedDeleted: number;
  totalRetried: number;
  totalFailed: number;
  totalFailedNoPermission: number;
  totalDuplicatePrevented: number;
  totalRecoveredOnRestart: number;
}

interface PersistedStickerQueue {
  activeItems: StickerQueueItem[];
  recentHistory: StickerQueueItem[];
  recentCompletedKeys: string[];
  permissionDeniedGroups: Record<string, PermissionDeniedGroupInfo>;
  stats: StickerQueueStats;
}

export interface DetectedStickerMeta {
  messageId: string;
  remoteJid: string;
  senderJid: string;
  senderAltJid: string;
  senderPhone: string;
  fromMe: boolean;
  pushName?: string | null;
  stickerKind: 'sticker' | 'lottie_sticker' | 'sticker_pack';
  receivedAt: number;
}

interface BurstWindowEntry {
  timestamp: number;
  uniqueKey: string;
  meta: DetectedStickerMeta;
}

// Runtime Queue State
const activeMap = new Map<string, StickerQueueItem>(); // pending + processing
const completedKeys = new Set<string>(); // duplicate-prevention cache
let recentHistory: StickerQueueItem[] = [];
let permissionDeniedGroups: Record<string, PermissionDeniedGroupInfo> = {};
let queueStats: StickerQueueStats = {
  totalEnqueued: 0,
  totalVerifiedDeleted: 0,
  totalRetried: 0,
  totalFailed: 0,
  totalFailedNoPermission: 0,
  totalDuplicatePrevented: 0,
  totalRecoveredOnRestart: 0,
};

// Burst Tracking & Throttles (Synchronous for 0ms race-free capture)
const burstWindowMap = new Map<string, BurstWindowEntry[]>();
const lastSpamAlertAt = new Map<string, number>();
const lastNoPermAlertAt = new Map<string, number>();
const groupAdminRefreshAt = new Map<string, number>();
const inFlightGroupMetaPromises = new Map<string, Promise<any>>();

let sockGetterFn: (() => WASocket | null) | null = null;
let inFlightWorkers = 0;
let rateLimitBackoffUntil = 0;
let retryWakeTimer: ReturnType<typeof setTimeout> | null = null;
let saveQueueTimer: ReturnType<typeof setTimeout> | null = null;
let isPumpScheduled = false;

function cleanUserDigits(jid?: string | null): string {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].trim();
}

function getBurstKey(groupId: string, senderJid: string, senderAltJid?: string): string {
  const canonical = normalizeJid(senderAltJid || senderJid);
  return `${groupId}:${cleanUserDigits(canonical) || canonical}`;
}

function makeUniqueKey(groupId: string, messageId: string): string {
  return `${groupId}:${messageId}`;
}

// -------------------------------------------------------------
// ATOMIC DISK PERSISTENCE & RESTART RECOVERY
// -------------------------------------------------------------
function buildPersistedSnapshot(): PersistedStickerQueue {
  return {
    activeItems: Array.from(activeMap.values()),
    recentHistory: recentHistory.slice(-150),
    recentCompletedKeys: Array.from(completedKeys).slice(-2000),
    permissionDeniedGroups,
    stats: queueStats,
  };
}

export function flushStickerQueueSync() {
  if (saveQueueTimer) {
    clearTimeout(saveQueueTimer);
    saveQueueTimer = null;
  }
  try {
    const tmpPath = QUEUE_DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(buildPersistedSnapshot(), null, 2), 'utf-8');
    fs.renameSync(tmpPath, QUEUE_DB_PATH);
  } catch (err: any) {
    console.error('[StickerQueue Persist Error]:', err?.message || err);
  }
}

function scheduleSaveQueue(immediate = false) {
  if (immediate) {
    flushStickerQueueSync();
    return;
  }
  if (saveQueueTimer) return;
  saveQueueTimer = setTimeout(() => {
    saveQueueTimer = null;
    flushStickerQueueSync();
  }, 60);
}

function loadPersistedQueue() {
  try {
    if (!fs.existsSync(QUEUE_DB_PATH)) {
      flushStickerQueueSync();
      return;
    }
    const raw = JSON.parse(fs.readFileSync(QUEUE_DB_PATH, 'utf-8')) as Partial<PersistedStickerQueue>;
    if (Array.isArray(raw.recentCompletedKeys)) {
      for (const k of raw.recentCompletedKeys) {
        if (typeof k === 'string' && k) completedKeys.add(k);
      }
    }
    if (Array.isArray(raw.recentHistory)) {
      recentHistory = raw.recentHistory.slice(-150);
    }
    if (raw.permissionDeniedGroups && typeof raw.permissionDeniedGroups === 'object') {
      permissionDeniedGroups = raw.permissionDeniedGroups;
    }
    if (raw.stats) {
      queueStats = {
        totalEnqueued: Number(raw.stats.totalEnqueued || 0),
        totalVerifiedDeleted: Number(raw.stats.totalVerifiedDeleted || 0),
        totalRetried: Number(raw.stats.totalRetried || 0),
        totalFailed: Number(raw.stats.totalFailed || 0),
        totalFailedNoPermission: Number(raw.stats.totalFailedNoPermission || 0),
        totalDuplicatePrevented: Number(raw.stats.totalDuplicatePrevented || 0),
        totalRecoveredOnRestart: Number(raw.stats.totalRecoveredOnRestart || 0),
      };
    }
    if (Array.isArray(raw.activeItems)) {
      let recovered = 0;
      const now = Date.now();
      for (const item of raw.activeItems) {
        if (!item?.uniqueKey || !item?.messageId || !item?.groupId) continue;
        if (completedKeys.has(item.uniqueKey)) continue;
        activeMap.set(item.uniqueKey, {
          ...item,
          status: 'pending', // Recover interrupted 'processing' -> 'pending'
          nextRetryAt: now,
        });
        recovered++;
      }
      if (recovered > 0) {
        queueStats.totalRecoveredOnRestart += recovered;
        console.log(`[StickerQueue Recovery] Recovered ${recovered} pending sticker moderation task(s) from disk after restart.`);
      }
    }
  } catch (err: any) {
    console.error('[StickerQueue Load Error]:', err?.message || err);
  }
}

// -------------------------------------------------------------
// FAST SYNCHRONOUS STICKER DETECTOR (<1ms, ZERO AI/NETWORK)
// -------------------------------------------------------------
export function inspectIncomingSticker(msg: proto.IWebMessageInfo): DetectedStickerMeta | null {
  if (!msg?.key?.id || !msg?.key?.remoteJid || !msg?.message) return null;
  if (msg.key.fromMe) return null;

  const remoteJid = msg.key.remoteJid;
  if (!remoteJid.endsWith('@g.us')) return null;

  const rawMsg: any = msg.message;
  if (rawMsg.protocolMessage || rawMsg.reactionMessage || rawMsg.pollUpdateMessage) {
    return null;
  }

  let cursor: any = rawMsg;
  let stickerKind: 'sticker' | 'lottie_sticker' | 'sticker_pack' | null = null;

  for (let depth = 0; depth < 8 && cursor; depth++) {
    if (cursor.stickerMessage) {
      stickerKind = 'sticker';
      break;
    }
    if (cursor.lottieStickerMessage) {
      stickerKind = 'lottie_sticker';
      break;
    }
    if (cursor.stickerPackMessage) {
      stickerKind = 'sticker_pack';
      break;
    }
    const nextCursor =
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
      cursor.questionReplyMessage?.message ||
      cursor.questionMessage?.message;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  if (!stickerKind) return null;

  const senderJid = msg.key.participant || (msg as any).participant || '';
  if (!senderJid) return null;
  const senderAltJid = String((msg.key as any).participantAlt || '');
  const senderPhone = cleanUserDigits(senderAltJid || senderJid) || 'member';

  return {
    messageId: msg.key.id,
    remoteJid,
    senderJid,
    senderAltJid,
    senderPhone,
    fromMe: Boolean(msg.key.fromMe),
    pushName: msg.pushName,
    stickerKind,
    receivedAt: Date.now(),
  };
}

// -------------------------------------------------------------
// QUEUE ENQUEUE & DEDUPLICATION
// -------------------------------------------------------------
function pushHistoryRecord(item: StickerQueueItem) {
  recentHistory.push(item);
  if (recentHistory.length > 150) {
    recentHistory = recentHistory.slice(-150);
  }
}

function recordCompletedKey(uniqueKey: string) {
  completedKeys.add(uniqueKey);
  if (completedKeys.size > 10000) {
    const first = completedKeys.values().next().value;
    if (first) completedKeys.delete(first);
  }
}

export function enqueueStickerTask(params: {
  meta: DetectedStickerMeta;
  groupName: string;
  policy: StickerPolicy;
  priority: number;
  matchedSenderId?: string;
}): boolean {
  const { meta, groupName, policy, priority, matchedSenderId } = params;
  const uniqueKey = makeUniqueKey(meta.remoteJid, meta.messageId);

  // Deduplicate active queue and already-processed/deleted stickers
  if (activeMap.has(uniqueKey) || completedKeys.has(uniqueKey)) {
    queueStats.totalDuplicatePrevented += 1;
    return false;
  }

  const settings = getSettings();
  const maxRetries = Math.max(1, Math.min(10, Number(settings.stickerDeleteMaxRetries ?? 4)));

  const item: StickerQueueItem = {
    uniqueKey,
    messageId: meta.messageId,
    groupId: meta.remoteJid,
    groupName: groupName || 'WhatsApp Group',
    senderJid: meta.senderJid,
    senderAltJid: meta.senderAltJid || undefined,
    matchedSenderId,
    senderPhone: meta.senderPhone,
    fromMe: meta.fromMe,
    policy,
    priority,
    status: 'pending',
    attempts: 0,
    maxRetries,
    nextRetryAt: Date.now(),
    enqueuedAt: Date.now(),
  };

  activeMap.set(uniqueKey, item);
  queueStats.totalEnqueued += 1;
  scheduleSaveQueue(false);
  schedulePump();
  return true;
}

function checkCachedSenderAdminSync(
  meta: any,
  senderJid: string,
  senderAltJid?: string
): { known: boolean; isSenderAdmin: boolean; isBotAdmin: boolean; groupSubject: string; matchedSenderId?: string } {
  if (!meta?.participants || !Array.isArray(meta.participants) || meta.participants.length === 0) {
    return { known: false, isSenderAdmin: false, isBotAdmin: false, groupSubject: meta?.subject || 'WhatsApp Group' };
  }
  const sock = sockGetterFn ? sockGetterFn() : null;
  const senderCands = new Set([cleanUserDigits(senderJid), cleanUserDigits(senderAltJid)].filter(Boolean));
  const { botUsers } = collectKnownBotUsersSync(sock);

  let isSenderAdmin = false;
  let isBotAdmin = isBotGroupAdminFromMeta(sock, meta);
  let matchedSenderId: string | undefined;

  for (const p of meta.participants) {
    const pAny = p as any;
    const pCleans = [p.id, pAny.jid, pAny.lid, pAny.phoneNumber, pAny.pn]
      .filter(Boolean)
      .map((j) => cleanUserDigits(String(j)));
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || Boolean(pAny.isAdmin) || Boolean(pAny.isSuperAdmin);
    if (pCleans.some((c) => senderCands.has(c))) {
      matchedSenderId = p.id;
      if (isAdmin) isSenderAdmin = true;
    }
    if (isAdmin && pCleans.some((c) => botUsers.has(c))) {
      isBotAdmin = true;
    }
  }

  return {
    known: true,
    isSenderAdmin,
    isBotAdmin,
    groupSubject: meta.subject || 'WhatsApp Group',
    matchedSenderId,
  };
}

/**
 * High-Speed Synchronous Sticker Ingestion Path
 * Called directly from Baileys `messages.upsert` BEFORE any AI / Badword / Slow DB work.
 */
export function handleIncomingStickerFastPath(sock: WASocket, msg: proto.IWebMessageInfo): boolean {
  const detected = inspectIncomingSticker(msg);
  if (!detected) return false;
  if (detected.senderAltJid) {
    rememberLidPnPair(detected.senderJid, detected.senderAltJid);
  }

  const uniqueKey = makeUniqueKey(detected.remoteJid, detected.messageId);
  if (activeMap.has(uniqueKey) || completedKeys.has(uniqueKey)) {
    queueStats.totalDuplicatePrevented += 1;
    return true; // Sticker already tracked — no duplicate processing
  }

  incrementMessagesChecked(1);

  const settings = getSettings();
  const cachedMeta = getCachedGroupMetadataSync(detected.remoteJid);
  const cachedPerms = checkCachedSenderAdminSync(cachedMeta, detected.senderJid, detected.senderAltJid);
  const groupName = cachedPerms.groupSubject || 'WhatsApp Group';

  // Track contact name & activity synchronously/non-blocking
  recordStickerContactAndActivity(
    detected.remoteJid,
    groupName,
    detected.senderJid,
    detected.senderAltJid,
    detected.senderPhone,
    detected.pushName
  );

  // Warm metadata once in background if missing (never blocks sticker queuing!)
  if (!cachedPerms.known && !inFlightGroupMetaPromises.has(detected.remoteJid)) {
    const p = getGroupMeta(sock, detected.remoteJid, false).finally(() => {
      inFlightGroupMetaPromises.delete(detected.remoteJid);
    });
    inFlightGroupMetaPromises.set(detected.remoteJid, p);
  }

  // Admin Shield fast skip if known admin
  if (cachedPerms.known && cachedPerms.isSenderAdmin && settings.adminShield) {
    return true;
  }

  const canonicalSender = cachedPerms.matchedSenderId || normalizeJid(detected.senderJid);

  // Priority 1a: Sender is ALREADY restricted — enqueue immediately with zero delay
  const restrictionCheck = isUserRestricted(
    detected.remoteJid,
    canonicalSender,
    [detected.senderJid, detected.senderAltJid, detected.senderPhone].filter(Boolean)
  );
  if (restrictionCheck.restricted) {
    enqueueStickerTask({
      meta: detected,
      groupName,
      policy: 'restricted_user',
      priority: 1,
      matchedSenderId: cachedPerms.matchedSenderId,
    });
    return true;
  }

  // Priority 1b: Anti-Sticker Spam (Configurable Time Window + Message Limit)
  const spamEnabled = Boolean(settings.antiStickerSpam || settings.individualMuteEnabled);
  if (spamEnabled) {
    const windowSec = Math.max(1, Math.min(120, Number(settings.individualMuteTimeWindow ?? 5)));
    const stickerLimit = Math.max(2, Math.min(100, Number(settings.individualMuteStickerLimit ?? 3)));
    const durationMins = Math.max(1, Math.min(180, Number(settings.individualMuteDurationMinutes ?? 10)));
    const windowMs = windowSec * 1000;

    const burstKey = getBurstKey(detected.remoteJid, detected.senderJid, detected.senderAltJid);
    const now = Date.now();
    const existing = (burstWindowMap.get(burstKey) || []).filter((e) => now - e.timestamp <= windowMs);
    existing.push({ timestamp: now, uniqueKey, meta: detected });
    burstWindowMap.set(burstKey, existing);

    if (existing.length >= stickerLimit) {
      // Spam Threshold Tripped!
      // 1. Synchronously activate individual mute BEFORE yielding so remaining burst items (#limit+1..#100) hit Priority 1a
      restrictUser(
        detected.remoteJid,
        groupName,
        canonicalSender,
        detected.senderPhone,
        durationMins,
        `${windowSec} সেকেন্ডে ${stickerLimit}টি+ স্টিকার পাঠানো (Sticker Spam)`,
        detected.senderAltJid || undefined
      );

      // 2. Flush ALL buffered stickers inside this active spam burst window (#1..#limit-1 AND #limit) into High-Priority Queue!
      for (const entry of existing) {
        enqueueStickerTask({
          meta: entry.meta,
          groupName,
          policy: 'sticker_spam',
          priority: 1,
          matchedSenderId: cachedPerms.matchedSenderId,
        });
      }
      burstWindowMap.delete(burstKey);

      // 3. Notify group once per burst (never spam 100 alerts for 100 stickers)
      const lastAlert = lastSpamAlertAt.get(burstKey) || 0;
      if (!settings.silentModeration && now - lastAlert > 15000) {
        lastSpamAlertAt.set(burstKey, now);
        safeSendMessage(sock, detected.remoteJid, {
          text: `🚨 WAGuard Security Alert\n\n⚠️ @${detected.senderPhone} অতিরিক্ত স্টিকার পাঠানোর কারণে Anti-Spam Protection-এর আওতায় এসেছে।\n\n🔒 Temporary Messaging Restriction Activated (${durationMins} মিনিট)\n🛡️ স্প্যাম করা স্টিকারগুলো High-Priority Queue থেকে স্বয়ংক্রিয়ভাবে মুছে ফেলা হচ্ছে।`,
          mentions: [detected.senderJid],
        }).catch(() => {});
      }

      return true;
    }

    // If antiSticker (all stickers forbidden) is ALSO enabled, enqueue this sticker immediately too!
    if (settings.antiSticker) {
      enqueueStickerTask({
        meta: detected,
        groupName,
        policy: 'anti_sticker',
        priority: 2,
        matchedSenderId: cachedPerms.matchedSenderId,
      });
    }
    return true;
  }

  // Priority 2: Strict Anti-Sticker (All stickers forbidden)
  if (settings.antiSticker) {
    enqueueStickerTask({
      meta: detected,
      groupName,
      policy: 'anti_sticker',
      priority: 2,
      matchedSenderId: cachedPerms.matchedSenderId,
    });
    return true;
  }

  // Stickers allowed & user not spamming
  return true;
}

// -------------------------------------------------------------
// PARALLEL WORKER EXECUTION & VERIFIED WHATSAPP DELETE
// -------------------------------------------------------------
async function notifyGroupAdminsNoDeletePermission(
  sock: WASocket,
  groupId: string,
  groupName: string
) {
  const existingDenied = permissionDeniedGroups[groupId];
  permissionDeniedGroups[groupId] = {
    groupId,
    groupName,
    detectedAt: Date.now(),
    blockedStickerCount: (existingDenied?.blockedStickerCount || 0) + 1,
  };
  scheduleSaveQueue(false);

  const now = Date.now();
  const lastAlert = lastNoPermAlertAt.get(groupId) || 0;
  if (now - lastAlert < 5 * 60 * 1000) {
    return; // Throttled: max 1 Admin permission alert every 5 minutes per group
  }
  lastNoPermAlertAt.set(groupId, now);

  addActivityLog({
    groupId,
    groupName,
    senderJid: 'SYSTEM',
    senderPhone: 'PERMISSION',
    action: 'error',
    reason: 'বটের Sticker Delete Permission নেই (বট গ্রুপ অ্যাডমিন নয়)',
    details: 'স্টিকার স্প্যাম ডিলিট করার জন্য অনুগ্রহ করে বট নম্বরটিকে গ্রুপের Admin বানান।',
  });

  const adminJids = getGroupAdminJidsFromCachedMeta(groupId);
  const adminMentionsText = adminJids.length > 0
    ? `\n👮 অ্যাডমিন দৃষ্টি আকর্ষণ: ${adminJids.slice(0, 6).map((j) => `@${cleanUserDigits(j)}`).join(' ')}`
    : '';

  await safeSendMessage(sock, groupId, {
    text: `⚠️ *[WAGuard Security — Delete Permission প্রয়োজন]*\n\nএই গ্রুপে স্প্যাম স্টিকার শনাক্ত হয়েছে, কিন্তু **বট নম্বরটি বর্তমানে গ্রুপ অ্যাডমিন (Admin) নয়**।\nতাই স্টিকারগুলো ডিলিট করা সম্ভব হচ্ছে না!${adminMentionsText}\n\n✅ সমাধান: গ্রুপের যেকোনো অ্যাডমিন অনুগ্রহ করে বটটিকে **Admin** বানিয়ে দিন, তাহলে Queue-তে থাকা স্টিকারগুলোও স্বয়ংক্রিয়ভাবে মুছে যাবে।`,
    mentions: adminJids.slice(0, 6),
  }).catch(() => {});

  reportServerProblem(
    {
      category: `sticker_no_perm_${groupId}`,
      title: 'স্টিকার ডিলিট করার Admin Permission নেই',
      details: `"${groupName}" গ্রুপে স্প্যাম স্টিকার এসেছে, কিন্তু বট গ্রুপ Admin না থাকায় ডিলিট আটকে আছে।`,
      suggestion: `"${groupName}" গ্রুপে বট নম্বরটিকে Admin বানান।`,
    },
    sock
  ).catch(() => {});
}

async function getVerifiedGroupPermsForWorker(
  sock: WASocket,
  item: StickerQueueItem
): Promise<{ isSenderAdmin: boolean; isBotAdmin: boolean; metaKnown: boolean; groupSubject: string; matchedSenderId?: string }> {
  // Single deduplicated group metadata check during concurrent sticker bursts
  const inflight = inFlightGroupMetaPromises.get(item.groupId);
  if (inflight) {
    await inflight.catch(() => null);
  }

  let perms = await checkPermissions(sock, item.groupId, item.senderJid, false, item.senderAltJid);
  if (!perms.metaKnown || !perms.isBotAdmin) {
    const lastRefresh = groupAdminRefreshAt.get(item.groupId) || 0;
    const throttleMs = perms.metaKnown ? 20000 : 5000;
    if (Date.now() - lastRefresh > throttleMs) {
      groupAdminRefreshAt.set(item.groupId, Date.now());
      const p = checkPermissions(sock, item.groupId, item.senderJid, true, item.senderAltJid);
      inFlightGroupMetaPromises.set(item.groupId, p);
      try {
        perms = await p;
      } finally {
        inFlightGroupMetaPromises.delete(item.groupId);
      }
    }
  }
  return perms;
}

async function executeRealWhatsAppDelete(
  sock: WASocket,
  item: StickerQueueItem,
  matchedSenderId?: string
): Promise<void> {
  const candidates: string[] = [];
  for (const cand of [
    item.senderJid ? jidNormalizedUser(item.senderJid) : '',
    matchedSenderId ? jidNormalizedUser(matchedSenderId) : '',
    item.senderAltJid ? jidNormalizedUser(item.senderAltJid) : '',
    item.senderJid,
  ]) {
    if (cand && !candidates.includes(cand)) {
      candidates.push(cand);
    }
  }

  let lastError: any = null;
  for (const participant of candidates) {
    try {
      await Promise.race([
        sock.sendMessage(item.groupId, {
          delete: {
            remoteJid: item.groupId,
            fromMe: item.fromMe,
            id: item.messageId,
            participant,
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp delete ACK timeout (15s)')), 15000)),
      ]);
      return; // Genuine revoke stanza accepted by Baileys/WhatsApp
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to send WhatsApp delete stanza');
}

function classifyDeleteError(err: any): {
  kind: 'rate_limit' | 'connection' | 'permission' | 'server' | 'unknown';
  message: string;
} {
  const statusCode = Number(err?.output?.statusCode || err?.status || 0);
  const msg = String(err?.message || err || 'Unknown delete error');
  if (statusCode === 429 || /rate.?limit|overlimit|too many|resource.?exhausted/i.test(msg)) {
    return { kind: 'rate_limit', message: msg };
  }
  if (statusCode === 401 || statusCode === 403 || /not.?admin|forbidden|not-authorized|unauthorized/i.test(msg)) {
    return { kind: 'permission', message: msg };
  }
  if (/connection closed|not connected|socket|closed|epipe|econnreset|etimedout/i.test(msg)) {
    return { kind: 'connection', message: msg };
  }
  if (statusCode >= 500 || /timeout|timed out|internal|unavailable/i.test(msg)) {
    return { kind: 'server', message: msg };
  }
  return { kind: 'unknown', message: msg };
}

function isSocketReadyForDelete(sock: WASocket | null): sock is WASocket {
  if (!sock || !sock.user || !sock.authState?.creds?.registered) return false;
  const ws = (sock as any).ws;
  if (ws && typeof ws.isOpen === 'boolean' && !ws.isOpen) return false;
  return true;
}

async function processStickerTask(item: StickerQueueItem) {
  const sock = sockGetterFn ? sockGetterFn() : null;
  if (!isSocketReadyForDelete(sock)) {
    // Pause gracefully without wasting retry attempts until WhatsApp socket reconnects
    item.status = 'pending';
    item.nextRetryAt = Date.now() + 2500;
    scheduleSaveQueue(false);
    scheduleRetryWake(2600);
    return;
  }

  try {
    const perms = await getVerifiedGroupPermsForWorker(sock, item);
    item.groupName = perms.groupSubject || item.groupName;
    const settings = getSettings();

    // Respect Admin Shield if group metadata wasn't cached when enqueued
    if (settings.adminShield && perms.isSenderAdmin) {
      activeMap.delete(item.uniqueKey);
      recordCompletedKey(item.uniqueKey);
      scheduleSaveQueue(false);
      return;
    }

    // Strict Bot Admin Delete Permission Verification:
    // ONLY refuse delete & trigger "No Admin Permission" notice when group metadata WAS verified (metaKnown === true)
    // AND confirms bot is NOT admin (prevents false alerts when groupMetadata temporarily failed or during LID sync).
    if (perms.metaKnown && !perms.isBotAdmin && !item.fromMe) {
      item.status = 'failed_no_permission';
      item.lastError = 'বট এই গ্রুপের অ্যাডমিন (Admin) না থাকায় স্টিকার ডিলিট করা সম্ভব হয়নি';
      item.lastAttemptAt = Date.now();
      item.completedAt = Date.now();
      activeMap.delete(item.uniqueKey);
      queueStats.totalFailedNoPermission += 1;
      pushHistoryRecord({ ...item });
      scheduleSaveQueue(false);
      await notifyGroupAdminsNoDeletePermission(sock, item.groupId, item.groupName);
      return;
    }

    // Clear stale permission warning if bot IS now admin & send Boss thank-you recovery notice
    const hadDeniedBefore = Boolean(permissionDeniedGroups[item.groupId]);
    if (hadDeniedBefore) {
      delete permissionDeniedGroups[item.groupId];
    }

    item.attempts += 1;
    item.lastAttemptAt = Date.now();

    await executeRealWhatsAppDelete(sock, item, perms.matchedSenderId || item.matchedSenderId);

    // REAL VERIFIED DELETE SUCCEEDED
    item.status = 'deleted';
    item.lastError = undefined;
    item.completedAt = Date.now();
    activeMap.delete(item.uniqueKey);
    recordCompletedKey(item.uniqueKey);
    queueStats.totalVerifiedDeleted += 1;
    pushHistoryRecord({ ...item });
    incrementVerifiedDeletedStat(item.policy === 'restricted_user');
    scheduleSaveQueue(false);

    if (hadDeniedBefore) {
      resolveServerProblem(`sticker_no_perm_${item.groupId}`, {
        details: `"${item.groupName}" গ্রুপে বট এখন সঠিকভাবে স্টিকার ডিলিট করতে পারছে।`,
        thanksNote: `ধন্যবাদ বস! "${item.groupName}" গ্রুপের স্টিকার ডিলিট পারমিশন ঠিক হয়ে গেছে এবং স্প্যাম স্টিকার মুছে ফেলা হয়েছে।`,
        sock,
        forceNotifyIfUnrecordedTitle: 'স্টিকার ডিলিট করার Admin Permission',
      }).catch(() => {});
    }
    resolveAdminPermissionProblemsForGroup(item.groupId, item.groupName, sock).catch(() => {});
    if (rateLimitBackoffUntil <= Date.now()) {
      resolveServerProblem('sticker_rate_limit', {
        details: `"${item.groupName}" গ্রুপে স্টিকার ডিলিট রেট-লিমিট কেটে গিয়ে স্বাভাবিক গতিতে চলছে।`,
        thanksNote: 'ধন্যবাদ বস! স্টিকার মডারেটর এখন আবার পুরো গতিতে কাজ করছে।',
        sock,
      }).catch(() => {});
    }

    if (item.policy === 'anti_sticker') {
      const canonicalSender = perms.matchedSenderId || normalizeJid(item.senderJid);
      await applyVerifiedAntiStickerViolation(sock, {
        groupId: item.groupId,
        groupName: item.groupName,
        senderJid: item.senderJid,
        canonicalSender,
        senderAltJid: item.senderAltJid,
        senderPhone: item.senderPhone,
      });
    }
  } catch (err: any) {
    const classified = classifyDeleteError(err);

    if (classified.kind === 'permission') {
      item.status = 'failed_no_permission';
      item.lastError = `Permission Denied: ${classified.message}`;
      item.completedAt = Date.now();
      activeMap.delete(item.uniqueKey);
      queueStats.totalFailedNoPermission += 1;
      pushHistoryRecord({ ...item });
      scheduleSaveQueue(false);
      await notifyGroupAdminsNoDeletePermission(sock, item.groupId, item.groupName);
      return;
    }

    if (classified.kind === 'connection') {
      // Connection dropped mid-delete: roll back attempt counter so offline downtime never drops pending stickers
      item.attempts = Math.max(0, item.attempts - 1);
      item.status = 'pending';
      item.lastError = `Waiting for socket reconnect (${classified.message})`;
      item.nextRetryAt = Date.now() + 2500;
      scheduleSaveQueue(false);
      scheduleRetryWake(2600);
      return;
    }

    if (classified.kind === 'rate_limit') {
      rateLimitBackoffUntil = Math.max(rateLimitBackoffUntil, Date.now() + 3000 * Math.min(3, item.attempts));
      reportServerProblem(
        {
          category: 'sticker_rate_limit',
          title: 'WhatsApp স্টিকার ডিলিট Rate Limit (429)',
          details: `"${item.groupName}" গ্রুপে দ্রুত ডিলিট করার সময় WhatsApp সাময়িক Rate Limit দিয়েছে (${classified.message})।`,
          suggestion: 'বট স্বয়ংক্রিয়ভাবে ব্যাকঅফ ও প্যারালাল গতি কমিয়ে রিট্রাই করছে।',
        },
        sock
      ).catch(() => {});
    }

    if (item.attempts < item.maxRetries) {
      const baseMs = classified.kind === 'rate_limit' ? 2800 : 750;
      const jitter = Math.floor(Math.random() * 250);
      const delayMs = Math.min(15000, baseMs * Math.pow(2, item.attempts - 1) + jitter);
      item.status = 'pending';
      item.lastError = `Retry ${item.attempts}/${item.maxRetries}: ${classified.message}`;
      item.nextRetryAt = Date.now() + delayMs;
      queueStats.totalRetried += 1;
      scheduleSaveQueue(false);
      scheduleRetryWake(delayMs + 50);
    } else {
      // Failed after all retries — NEVER claim deleted!
      item.status = 'failed';
      item.lastError = `Delete failed after ${item.attempts} attempts: ${classified.message}`;
      item.completedAt = Date.now();
      activeMap.delete(item.uniqueKey);
      queueStats.totalFailed += 1;
      pushHistoryRecord({ ...item });
      scheduleSaveQueue(false);

      addActivityLog({
        groupId: item.groupId,
        groupName: item.groupName,
        senderJid: item.senderJid,
        senderPhone: item.senderPhone,
        action: 'error',
        reason: `স্টিকার ডিলিট ব্যর্থ (${item.attempts} বার চেষ্টা করা হয়েছে)`,
        details: classified.message,
      });

      reportServerProblem(
        {
          category: `sticker_perm_fail_${item.groupId}`,
          title: 'স্টিকার ডিলিট বারবার ব্যর্থ হয়েছে',
          details: `"${item.groupName}" গ্রুপে ${item.attempts} বার চেষ্টা করেও ডিলিট করা যায়নি (${classified.message})।`,
          suggestion: 'ড্যাশবোর্ডের Security পেজ থেকে "ব্যর্থ স্টিকার রিট্রাই" করে দেখতে পারেন।',
        },
        sock
      ).catch(() => {});
    }
  }
}

function scheduleRetryWake(delayMs: number) {
  if (retryWakeTimer) {
    clearTimeout(retryWakeTimer);
  }
  retryWakeTimer = setTimeout(() => {
    retryWakeTimer = null;
    schedulePump();
  }, Math.max(100, delayMs));
}

function schedulePump() {
  if (isPumpScheduled) return;
  isPumpScheduled = true;
  queueMicrotask(() => {
    isPumpScheduled = false;
    pumpQueue();
  });
}

function pumpQueue() {
  if (activeMap.size === 0) return;

  const sock = sockGetterFn ? sockGetterFn() : null;
  if (!isSocketReadyForDelete(sock)) {
    scheduleRetryWake(2000);
    return;
  }

  const settings = getSettings();
  const configuredConcurrency = Math.max(1, Math.min(10, Number(settings.stickerQueueConcurrency ?? 5)));
  const now = Date.now();
  const maxParallel = rateLimitBackoffUntil > now ? Math.min(2, configuredConcurrency) : configuredConcurrency;

  if (inFlightWorkers >= maxParallel) return;

  // Gather eligible pending tasks ordered by priority ASC, then arrival time ASC
  const readyTasks: StickerQueueItem[] = [];
  let soonestNextRetry = Infinity;

  for (const item of activeMap.values()) {
    if (item.status !== 'pending') continue;
    if (item.nextRetryAt <= now) {
      readyTasks.push(item);
    } else if (item.nextRetryAt < soonestNextRetry) {
      soonestNextRetry = item.nextRetryAt;
    }
  }

  readyTasks.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);

  for (const task of readyTasks) {
    if (inFlightWorkers >= maxParallel) break;
    task.status = 'processing';
    inFlightWorkers += 1;

    processStickerTask(task)
      .catch((err) => {
        console.error('[StickerQueue Worker Error]:', err?.message || err);
      })
      .finally(() => {
        inFlightWorkers = Math.max(0, inFlightWorkers - 1);
        schedulePump();
      });
  }

  if (soonestNextRetry < Infinity) {
    scheduleRetryWake(Math.max(150, soonestNextRetry - now));
  }
}

// -------------------------------------------------------------
// PUBLIC LIFECYCLE & ADMIN PANEL API HELPERS
// -------------------------------------------------------------
let safetyInterval: ReturnType<typeof setInterval> | null = null;

export function initStickerQueue(getSock: () => WASocket | null) {
  sockGetterFn = getSock;
  loadPersistedQueue();
  schedulePump();

  if (safetyInterval) {
    clearInterval(safetyInterval);
  }
  // Safety background monitor in case delayed timers or reconnects need a nudge
  safetyInterval = setInterval(() => {
    if (activeMap.size > 0) {
      schedulePump();
    }
  }, 4000);
}

export function notifyStickerQueueSocketReady() {
  const now = Date.now();
  for (const item of activeMap.values()) {
    if (item.status === 'pending' && item.nextRetryAt > now + 2000) {
      item.nextRetryAt = now;
    }
  }
  schedulePump();
}

export function getStickerQueueStatus() {
  const settings = getSettings();
  const pendingItems: StickerQueueItem[] = [];
  let processingCount = 0;

  for (const item of activeMap.values()) {
    if (item.status === 'processing') processingCount++;
    pendingItems.push(item);
  }

  pendingItems.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);

  return {
    pendingCount: pendingItems.length,
    processingCount,
    inFlightWorkers,
    isRateLimited: rateLimitBackoffUntil > Date.now(),
    rateLimitRemainingSec: Math.max(0, Math.ceil((rateLimitBackoffUntil - Date.now()) / 1000)),
    stats: { ...queueStats },
    config: {
      antiSticker: Boolean(settings.antiSticker),
      antiStickerSpam: Boolean(settings.antiStickerSpam || settings.individualMuteEnabled),
      timeWindowSec: Number(settings.individualMuteTimeWindow ?? 5),
      stickerLimit: Number(settings.individualMuteStickerLimit ?? 3),
      muteMinutes: Number(settings.individualMuteDurationMinutes ?? 10),
      maxRetries: Number(settings.stickerDeleteMaxRetries ?? 4),
      concurrency: Number(settings.stickerQueueConcurrency ?? 5),
    },
    permissionDeniedGroups: Object.values(permissionDeniedGroups),
    pendingItems: pendingItems.slice(0, 50),
    recentHistory: [...recentHistory].reverse().slice(0, 40),
  };
}

export function retryFailedStickerQueue(): { requeuedCount: number } {
  let requeuedCount = 0;
  const now = Date.now();
  const remainingHistory: StickerQueueItem[] = [];

  for (const item of recentHistory) {
    if ((item.status === 'failed' || item.status === 'failed_no_permission') && !activeMap.has(item.uniqueKey) && !completedKeys.has(item.uniqueKey)) {
      const resetItem: StickerQueueItem = {
        ...item,
        status: 'pending',
        attempts: 0,
        nextRetryAt: now,
        lastError: undefined,
        completedAt: undefined,
      };
      activeMap.set(resetItem.uniqueKey, resetItem);
      requeuedCount++;
    } else {
      remainingHistory.push(item);
    }
  }

  recentHistory = remainingHistory;
  if (requeuedCount > 0) {
    scheduleSaveQueue(true);
    schedulePump();
  }
  return { requeuedCount };
}

export function clearStickerQueueHistory(): { cleared: boolean } {
  recentHistory = [];
  permissionDeniedGroups = {};
  scheduleSaveQueue(true);
  return { cleared: true };
}
