import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  downloadMediaMessage,
  jidNormalizedUser,
  type proto,
  type WASocket,
} from '@whiskeysockets/baileys';
import {
  INBOX_AVATARS_DIR,
  INBOX_DIR,
  INBOX_MEDIA_DIR,
} from './storagePaths.ts';

export const INBOX_MESSAGES_DIR = path.join(INBOX_DIR, 'messages');
export const INBOX_INDEX_PATH = path.join(INBOX_DIR, 'inbox_index.json');

const MAX_SINGLE_MEDIA_BYTES = 25 * 1024 * 1024; // 25 MB per binary media safeguard
const AVATAR_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_PENDING_MEDIA_QUEUE = 120;
const MEDIA_CONCURRENCY = 2;

export type InboxMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'audio'
  | 'sticker'
  | 'document'
  | 'location'
  | 'contact'
  | 'deleted'
  | 'unknown';

export interface InboxMediaInfo {
  status: 'pending' | 'saved' | 'unavailable' | 'too_large' | 'pruned_for_space';
  relPath?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  isPtt?: boolean;
  isAnimated?: boolean;
  isGif?: boolean;
  pageCount?: number;
  sha256?: string;
  unavailableReason?: string;
}

export interface InboxLocationInfo {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string;
  isLive?: boolean;
}

export interface InboxContactCard {
  displayName: string;
  phone?: string;
  org?: string;
}

export interface InboxQuotedPreview {
  id?: string;
  senderName?: string;
  senderPhone?: string;
  text?: string;
  messageType?: string;
}

export interface InboxMessageRecord {
  id: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderAltJid?: string;
  rawParticipant?: string;
  senderPhone: string;
  senderName: string;
  fromMe: boolean;
  timestamp: number;
  messageType: InboxMessageType;
  rawMessageKind: string;
  text: string;
  quotedMessage?: InboxQuotedPreview;
  media?: InboxMediaInfo;
  location?: InboxLocationInfo;
  contacts?: InboxContactCard[];
  isDeleted: boolean;
  deletedAt?: number;
  deletedBy?: string;
  deletionReason?: string;
  deletionVerified?: boolean;
  editedAt?: number;
  isImportant: boolean;
  source: 'live' | 'history_sync' | 'bot_outgoing';
}

export interface InboxGroupSummary {
  id: string;
  name: string;
  participants: number;
  isBotAdmin?: boolean;
  avatarRelPath?: string;
  avatarFetchedAt?: number;
  avatarStatus?: 'ready' | 'none';
  lastMessageId?: string;
  lastMessageText?: string;
  lastMessageType?: InboxMessageType;
  lastMessageSender?: string;
  lastMessageAt?: number;
  totalStoredMessages: number;
  deletedCount: number;
  mediaCount: number;
  importantCount: number;
  connected?: boolean;
}

export interface InboxStorageSettings {
  mediaStorageLimitMb: number;
  autoPruneOldNonImportantMedia: boolean;
  maxMessagesPerGroup: number;
}

export interface InboxStorageStats {
  totalGroups: number;
  totalMessages: number;
  totalDeletedMessages: number;
  totalImportantMessages: number;
  totalMediaFiles: number;
  mediaUsedBytes: number;
  mediaLimitBytes: number;
  mediaUsedPercent: number;
  messagesDbBytes: number;
  avatarsBytes: number;
}

export interface InboxRealtimeEvent {
  type:
    | 'inbox:message_new'
    | 'inbox:message_updated'
    | 'inbox:message_removed'
    | 'inbox:group_updated'
    | 'inbox:storage_updated';
  groupId?: string;
  messageId?: string;
  message?: InboxMessageRecord;
  groupSummary?: InboxGroupSummary;
  stats?: InboxStorageStats;
  timestamp: number;
}

interface PersistedInboxIndex {
  settings: InboxStorageSettings;
  groups: Record<string, InboxGroupSummary>;
}

const DEFAULT_INBOX_SETTINGS: InboxStorageSettings = {
  mediaStorageLimitMb: 250,
  autoPruneOldNonImportantMedia: true,
  maxMessagesPerGroup: 2500,
};

let indexLoaded = false;
let inboxIndex: PersistedInboxIndex = {
  settings: { ...DEFAULT_INBOX_SETTINGS },
  groups: {},
};

const groupMessagesMap = new Map<string, InboxMessageRecord[]>();
const dirtyMessageGroups = new Set<string>();
const messageFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let indexFlushTimer: ReturnType<typeof setTimeout> | null = null;
let indexWriteInFlight = false;
let indexWritePendingAgain = false;
const groupWriteInFlight = new Set<string>();
const groupWritePendingAgain = new Set<string>();

let cachedDiskStatAt = 0;
let cachedDiskTotalBytes = 0;
let cachedDiskFreeBytes = Number.MAX_SAFE_INTEGER;

function refreshDiskStatsCached(force = false) {
  const now = Date.now();
  if (!force && now - cachedDiskStatAt < 8000) return;
  cachedDiskStatAt = now;
  try {
    const stat = fs.statfsSync(INBOX_DIR);
    const bsize = Number(stat.bsize || 4096);
    cachedDiskTotalBytes = Math.max(0, Number(stat.blocks || 0) * bsize);
    cachedDiskFreeBytes = Math.max(0, Number(stat.bavail ?? stat.bfree ?? 0) * bsize);
  } catch {}
}

export function getInboxEffectiveMediaLimitBytes(): number {
  loadInboxIndex();
  refreshDiskStatsCached();
  const configuredBytes = (inboxIndex.settings.mediaStorageLimitMb || 250) * 1024 * 1024;
  const isSmallContainer = cachedDiskTotalBytes > 0 && cachedDiskTotalBytes <= 1.5 * 1024 * 1024 * 1024;
  if (cachedDiskFreeBytes < 15 * 1024 * 1024) {
    return Math.min(configuredBytes, 2 * 1024 * 1024);
  }
  if (isSmallContainer || cachedDiskFreeBytes < 60 * 1024 * 1024) {
    return Math.min(configuredBytes, 8 * 1024 * 1024);
  }
  return configuredBytes;
}

export function isInboxDiskLow(minFreeMb = 12): boolean {
  refreshDiskStatsCached();
  return cachedDiskFreeBytes < minFreeMb * 1024 * 1024;
}

type EventListener = (evt: InboxRealtimeEvent) => void;
const eventListeners = new Set<EventListener>();

type IdentityResolverFn = (params: {
  groupId: string;
  senderJid?: string;
  senderAltJid?: string;
  pushName?: string | null;
}) => {
  groupName?: string;
  senderPhone?: string;
  senderName?: string;
};

let externalIdentityResolver: IdentityResolverFn | null = null;

export function setInboxIdentityResolver(fn: IdentityResolverFn) {
  externalIdentityResolver = fn;
}

function ensureInboxDirs() {
  for (const dir of [INBOX_DIR, INBOX_MESSAGES_DIR, INBOX_MEDIA_DIR, INBOX_AVATARS_DIR]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {}
  }
}

ensureInboxDirs();

function hashGroupId(groupId: string): string {
  return crypto.createHash('sha1').update(groupId).digest('hex').slice(0, 20);
}

function getGroupMessagesFilePath(groupId: string): string {
  return path.join(INBOX_MESSAGES_DIR, `${hashGroupId(groupId)}.json`);
}

function cleanJidUser(jid?: string | null): string {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].trim();
}

function safeNormalizeJid(jid?: string | null): string {
  if (!jid) return '';
  try {
    return jidNormalizedUser(String(jid));
  } catch {
    return String(jid);
  }
}

function loadInboxIndex() {
  if (indexLoaded) return;
  indexLoaded = true;
  ensureInboxDirs();
  try {
    if (fs.existsSync(INBOX_INDEX_PATH)) {
      const raw = JSON.parse(fs.readFileSync(INBOX_INDEX_PATH, 'utf8'));
      if (raw && typeof raw === 'object') {
        inboxIndex = {
          settings: {
            ...DEFAULT_INBOX_SETTINGS,
            ...(raw.settings || {}),
            mediaStorageLimitMb: Math.max(
              50,
              Math.min(2048, Number(raw.settings?.mediaStorageLimitMb ?? DEFAULT_INBOX_SETTINGS.mediaStorageLimitMb))
            ),
            maxMessagesPerGroup: Math.max(
              200,
              Math.min(10000, Number(raw.settings?.maxMessagesPerGroup ?? DEFAULT_INBOX_SETTINGS.maxMessagesPerGroup))
            ),
          },
          groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        };
      }
    }
  } catch (err: any) {
    console.warn('[InboxStore] Index load note:', err?.message || err);
  }
}

async function writeCompactJsonSafeAsync(targetPath: string, payloadStr: string) {
  const tmp = `${targetPath}.tmp`;
  try {
    await fs.promises.writeFile(tmp, payloadStr, 'utf8');
    await fs.promises.rename(tmp, targetPath);
  } catch (err: any) {
    await fs.promises.unlink(tmp).catch(() => {});
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      await fs.promises.writeFile(targetPath, payloadStr, 'utf8');
    } else {
      throw err;
    }
  }
}

function writeCompactJsonSafeSync(targetPath: string, payloadStr: string) {
  const tmp = `${targetPath}.tmp`;
  try {
    fs.writeFileSync(tmp, payloadStr, 'utf8');
    fs.renameSync(tmp, targetPath);
  } catch (err: any) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      fs.writeFileSync(targetPath, payloadStr, 'utf8');
    } else {
      throw err;
    }
  }
}

function saveInboxIndexSync() {
  try {
    ensureInboxDirs();
    writeCompactJsonSafeSync(INBOX_INDEX_PATH, JSON.stringify(inboxIndex));
  } catch (err: any) {
    console.warn('[InboxStore] Index save error:', err?.message || err);
  }
}

async function saveInboxIndexAsync() {
  if (indexWriteInFlight) {
    indexWritePendingAgain = true;
    return;
  }
  indexWriteInFlight = true;
  try {
    ensureInboxDirs();
    await writeCompactJsonSafeAsync(INBOX_INDEX_PATH, JSON.stringify(inboxIndex));
  } catch (err: any) {
    console.warn('[InboxStore] Index async save error:', err?.message || err);
  } finally {
    indexWriteInFlight = false;
    if (indexWritePendingAgain) {
      indexWritePendingAgain = false;
      scheduleSaveIndex();
    }
  }
}

function scheduleSaveIndex() {
  if (indexFlushTimer) return;
  indexFlushTimer = setTimeout(() => {
    indexFlushTimer = null;
    void saveInboxIndexAsync();
  }, 1000);
}

function loadGroupMessages(groupId: string): InboxMessageRecord[] {
  loadInboxIndex();
  const cached = groupMessagesMap.get(groupId);
  if (cached) return cached;

  const filePath = getGroupMessagesFilePath(groupId);
  let records: InboxMessageRecord[] = [];
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) {
        records = parsed;
      }
    }
  } catch (err: any) {
    console.warn(`[InboxStore] Group file load error (${groupId}):`, err?.message || err);
  }
  records.sort((a, b) => a.timestamp - b.timestamp);
  groupMessagesMap.set(groupId, records);
  return records;
}

function saveGroupMessagesSync(groupId: string) {
  const list = groupMessagesMap.get(groupId);
  if (!list) return;
  try {
    ensureInboxDirs();
    writeCompactJsonSafeSync(getGroupMessagesFilePath(groupId), JSON.stringify(list));
    dirtyMessageGroups.delete(groupId);
  } catch (err: any) {
    console.warn(`[InboxStore] Save group messages error (${groupId}):`, err?.message || err);
  }
}

async function saveGroupMessagesAsync(groupId: string) {
  const list = groupMessagesMap.get(groupId);
  if (!list) return;
  if (groupWriteInFlight.has(groupId)) {
    groupWritePendingAgain.add(groupId);
    return;
  }
  groupWriteInFlight.add(groupId);
  try {
    ensureInboxDirs();
    await writeCompactJsonSafeAsync(getGroupMessagesFilePath(groupId), JSON.stringify(list));
    dirtyMessageGroups.delete(groupId);
  } catch (err: any) {
    console.warn(`[InboxStore] Async save group messages error (${groupId}):`, err?.message || err);
  } finally {
    groupWriteInFlight.delete(groupId);
    if (groupWritePendingAgain.has(groupId)) {
      groupWritePendingAgain.delete(groupId);
      scheduleSaveGroupMessages(groupId);
    }
  }
}

function scheduleSaveGroupMessages(groupId: string) {
  dirtyMessageGroups.add(groupId);
  if (messageFlushTimers.has(groupId)) return;
  const t = setTimeout(() => {
    messageFlushTimers.delete(groupId);
    void saveGroupMessagesAsync(groupId);
  }, 1000);
  messageFlushTimers.set(groupId, t);
}

export function flushInboxStoreSync() {
  loadInboxIndex();
  if (indexFlushTimer) {
    clearTimeout(indexFlushTimer);
    indexFlushTimer = null;
  }
  saveInboxIndexSync();
  for (const [gid, timer] of messageFlushTimers.entries()) {
    clearTimeout(timer);
    messageFlushTimers.delete(gid);
    saveGroupMessagesSync(gid);
  }
  for (const gid of Array.from(dirtyMessageGroups)) {
    saveGroupMessagesSync(gid);
  }
}

export function subscribeInboxEvents(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

function emitInboxEvent(evt: InboxRealtimeEvent) {
  for (const listener of eventListeners) {
    try {
      listener(evt);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// CONTENT UNWRAPPING & TYPE EXTRACTION
// ---------------------------------------------------------------------------
function unwrapBaileysMessageContent(rawMsg: any): { content: any; isViewOnce: boolean; isEdited: boolean } {
  let cur = rawMsg;
  let isViewOnce = false;
  let isEdited = false;

  for (let depth = 0; depth < 6 && cur && typeof cur === 'object'; depth++) {
    if (cur.ephemeralMessage?.message) {
      cur = cur.ephemeralMessage.message;
      continue;
    }
    if (cur.viewOnceMessage?.message) {
      isViewOnce = true;
      cur = cur.viewOnceMessage.message;
      continue;
    }
    if (cur.viewOnceMessageV2?.message) {
      isViewOnce = true;
      cur = cur.viewOnceMessageV2.message;
      continue;
    }
    if (cur.viewOnceMessageV2Extension?.message) {
      isViewOnce = true;
      cur = cur.viewOnceMessageV2Extension.message;
      continue;
    }
    if (cur.documentWithCaptionMessage?.message) {
      cur = cur.documentWithCaptionMessage.message;
      continue;
    }
    if (cur.editedMessage?.message) {
      isEdited = true;
      cur = cur.editedMessage.message;
      continue;
    }
    if (cur.groupStatusMentionMessage?.message) {
      cur = cur.groupStatusMentionMessage.message;
      continue;
    }
    break;
  }

  return { content: cur, isViewOnce, isEdited };
}

function parseVCard(vcard?: string | null, fallbackName?: string): InboxContactCard {
  const raw = String(vcard || '');
  let displayName = (fallbackName || '').trim();
  let phone = '';
  let org = '';

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('FN:') && !displayName) {
      displayName = line.slice(3).trim();
    } else if (upper.startsWith('ORG:') && !org) {
      org = line.slice(4).replace(/;+$/, '').trim();
    } else if (upper.startsWith('TEL') && !phone) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        phone = line.slice(idx + 1).trim();
      }
    } else if (upper.includes('WAID=') && !phone) {
      const m = line.match(/WAID=(\d+)/i);
      if (m) phone = `+${m[1]}`;
    }
  }

  return {
    displayName: displayName || phone || 'Contact',
    phone: phone || undefined,
    org: org || undefined,
  };
}

function extractQuotedPreview(content: any): InboxQuotedPreview | undefined {
  if (!content || typeof content !== 'object') return undefined;
  const ctxHolder =
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.audioMessage?.contextInfo ||
    content.stickerMessage?.contextInfo ||
    content.documentMessage?.contextInfo ||
    content.locationMessage?.contextInfo ||
    content.contactMessage?.contextInfo;

  if (!ctxHolder?.quotedMessage) return undefined;

  const { content: qContent } = unwrapBaileysMessageContent(ctxHolder.quotedMessage);
  const participant = ctxHolder.participant ? safeNormalizeJid(ctxHolder.participant) : '';
  const senderPhone = cleanJidUser(participant);

  let qType = 'text';
  let qText = '';

  if (qContent?.conversation) {
    qText = qContent.conversation;
  } else if (qContent?.extendedTextMessage?.text) {
    qText = qContent.extendedTextMessage.text;
  } else if (qContent?.imageMessage) {
    qType = 'image';
    qText = qContent.imageMessage.caption || '[ছবি / Image]';
  } else if (qContent?.videoMessage) {
    qType = 'video';
    qText = qContent.videoMessage.caption || '[ভিডিও / Video]';
  } else if (qContent?.audioMessage) {
    qType = qContent.audioMessage.ptt ? 'voice' : 'audio';
    qText = qContent.audioMessage.ptt ? '[ভয়েস মেসেজ]' : '[অডিও ফাইল]';
  } else if (qContent?.stickerMessage) {
    qType = 'sticker';
    qText = '[স্টিকার / Sticker]';
  } else if (qContent?.documentMessage) {
    qType = 'document';
    qText = qContent.documentMessage.fileName || '[ডকুমেন্ট]';
  } else if (qContent?.locationMessage || qContent?.liveLocationMessage) {
    qType = 'location';
    qText = '[লোকেশন]';
  } else if (qContent?.contactMessage || qContent?.contactsArrayMessage) {
    qType = 'contact';
    qText = '[কনট্যাক্ট]';
  }

  return {
    id: ctxHolder.stanzaId || undefined,
    senderPhone: senderPhone || undefined,
    senderName: senderPhone ? `@${senderPhone}` : undefined,
    text: qText.slice(0, 180),
    messageType: qType,
  };
}

function summarizeMessageForGroupList(msg: InboxMessageRecord): string {
  if (msg.isDeleted) {
    return msg.text ? `🗑️ [Deleted] ${msg.text}` : '🗑️ মেসেজটি ডিলিট করা হয়েছে';
  }
  switch (msg.messageType) {
    case 'image':
      return msg.text ? `🖼️ ছবি: ${msg.text}` : '🖼️ ছবি পাঠিয়েছেন';
    case 'video':
      return msg.text ? `🎬 ভিডিও: ${msg.text}` : '🎬 ভিডিও পাঠিয়েছেন';
    case 'voice':
      return `🎙️ ভয়েস মেসেজ${msg.media?.durationSec ? ` (${msg.media.durationSec}s)` : ''}`;
    case 'audio':
      return `🎵 অডিও ফাইল${msg.media?.fileName ? `: ${msg.media.fileName}` : ''}`;
    case 'sticker':
      return '✨ স্টিকার';
    case 'document':
      return `📄 ${msg.media?.fileName || 'ডকুমেন্ট'}`;
    case 'location':
      return `📍 ${msg.location?.name || msg.location?.address || 'লোকেশন শেয়ার'}`;
    case 'contact':
      return `👤 কনট্যাক্ট: ${msg.contacts?.[0]?.displayName || 'Contact'}`;
    default:
      return msg.text || '[মেসেজ]';
  }
}

function formatMessageTimestampMs(rawTs: any): number {
  const num = Number(rawTs || 0);
  if (!Number.isFinite(num) || num <= 0) return Date.now();
  return num < 10_000_000_000 ? num * 1000 : num;
}

function sanitizeExtFromMimeOrName(mimeType?: string, fileName?: string, fallbackType?: InboxMessageType): string {
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (ext && ext.length >= 2 && ext.length <= 8) return ext;
  }
  const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/3gpp': '.3gp',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/json': '.json',
    'application/zip': '.zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  };
  if (mimeMap[m]) return mimeMap[m];
  switch (fallbackType) {
    case 'image':
      return '.jpg';
    case 'video':
      return '.mp4';
    case 'voice':
    case 'audio':
      return '.ogg';
    case 'sticker':
      return '.webp';
    default:
      return '.bin';
  }
}

function updateGroupSummaryFromRecords(
  groupId: string,
  overrideMeta?: Partial<InboxGroupSummary>,
  persist = true
): InboxGroupSummary {
  loadInboxIndex();
  const records = loadGroupMessages(groupId);
  const prev = inboxIndex.groups[groupId] || {
    id: groupId,
    name: overrideMeta?.name || 'WhatsApp Group',
    participants: overrideMeta?.participants || 0,
    totalStoredMessages: 0,
    deletedCount: 0,
    mediaCount: 0,
    importantCount: 0,
  };

  let deletedCount = 0;
  let mediaCount = 0;
  let importantCount = 0;
  for (const r of records) {
    if (r.isDeleted) deletedCount++;
    if (r.media && r.media.status === 'saved') mediaCount++;
    if (r.isImportant) importantCount++;
  }

  const lastMsg = records.length > 0 ? records[records.length - 1] : undefined;

  const updated: InboxGroupSummary = {
    ...prev,
    ...overrideMeta,
    id: groupId,
    name:
      (overrideMeta?.name && overrideMeta.name !== 'WhatsApp Group' ? overrideMeta.name : '') ||
      (prev.name && prev.name !== 'WhatsApp Group' ? prev.name : '') ||
      lastMsg?.groupName ||
      'WhatsApp Group',
    totalStoredMessages: records.length,
    deletedCount,
    mediaCount,
    importantCount,
    lastMessageId: lastMsg?.id ?? prev.lastMessageId,
    lastMessageText: lastMsg ? summarizeMessageForGroupList(lastMsg) : prev.lastMessageText,
    lastMessageType: lastMsg?.messageType ?? prev.lastMessageType,
    lastMessageSender: lastMsg?.senderName || lastMsg?.senderPhone || prev.lastMessageSender,
    lastMessageAt: lastMsg?.timestamp ?? prev.lastMessageAt,
  };

  inboxIndex.groups[groupId] = updated;
  if (persist) {
    scheduleSaveIndex();
  }
  return updated;
}

// ---------------------------------------------------------------------------
// SAFE LOW-CPU ASYNC MEDIA DOWNLOAD QUEUE
// ---------------------------------------------------------------------------
interface PendingMediaTask {
  sock: WASocket;
  waMsg: proto.IWebMessageInfo;
  groupId: string;
  messageId: string;
  messageType: InboxMessageType;
  mimeType?: string;
  fileName?: string;
  declaredSize?: number;
}

const pendingMediaQueue: PendingMediaTask[] = [];
const queuedMediaKeys = new Set<string>();
let activeMediaWorkers = 0;

function enqueueMediaDownload(task: PendingMediaTask) {
  if (isInboxDiskLow(12)) return;
  if (task.messageType === 'sticker' && isInboxDiskLow(35)) return;
  const key = `${task.groupId}:${task.messageId}`;
  if (queuedMediaKeys.has(key)) return;
  if (pendingMediaQueue.length >= MAX_PENDING_MEDIA_QUEUE) {
    // Drop oldest queued task reference cleanly if flooded so memory stays bounded
    const dropped = pendingMediaQueue.shift();
    if (dropped) queuedMediaKeys.delete(`${dropped.groupId}:${dropped.messageId}`);
  }
  queuedMediaKeys.add(key);
  pendingMediaQueue.push(task);
  pumpMediaQueue();
}

function pumpMediaQueue() {
  while (activeMediaWorkers < MEDIA_CONCURRENCY && pendingMediaQueue.length > 0) {
    const task = pendingMediaQueue.shift()!;
    activeMediaWorkers++;
    processMediaDownloadTask(task)
      .catch(() => {})
      .finally(() => {
        queuedMediaKeys.delete(`${task.groupId}:${task.messageId}`);
        activeMediaWorkers = Math.max(0, activeMediaWorkers - 1);
        if (pendingMediaQueue.length > 0) {
          setTimeout(pumpMediaQueue, 35);
        }
      });
  }
}

async function processMediaDownloadTask(task: PendingMediaTask) {
  const { sock, waMsg, groupId, messageId, messageType, mimeType, fileName, declaredSize } = task;
  const records = loadGroupMessages(groupId);
  const record = records.find((r) => r.id === messageId);
  if (!record || !record.media) return;
  if (record.media.status === 'saved' && record.media.relPath) return;
  if (isInboxDiskLow(10)) {
    record.media = {
      ...record.media,
      status: 'pruned_for_space',
      unavailableReason: 'ডিস্ক স্পেস সংকট থাকায় মিডিয়া ডাউনলোড স্কিপ করা হয়েছে।',
    };
    scheduleSaveGroupMessages(groupId);
    return;
  }

  if (declaredSize && declaredSize > MAX_SINGLE_MEDIA_BYTES) {
    record.media = {
      ...record.media,
      status: 'too_large',
      fileSize: declaredSize,
      unavailableReason: 'ফাইলের সাইজ ২৫ MB সীমার বেশি হওয়ায় অটো ডাউনলোড সীমিত করা হয়েছে।',
    };
    scheduleSaveGroupMessages(groupId);
    const summary = updateGroupSummaryFromRecords(groupId);
    emitInboxEvent({ type: 'inbox:message_updated', groupId, message: record, groupSummary: summary, timestamp: Date.now() });
    return;
  }

  try {
    const buffer = (await Promise.race([
      downloadMediaMessage(
        waMsg as any,
        'buffer',
        {},
        {
          logger: {
            level: 'silent',
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {},
            child: () => ({}) as any,
          } as any,
          reuploadRequest: sock.updateMediaMessage,
        }
      ) as Promise<Buffer>,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000)),
    ])) as Buffer | null;

    if (!buffer || buffer.length === 0) {
      record.media = {
        ...record.media,
        status: 'unavailable',
        unavailableReason: 'WhatsApp থেকে এই মিডিয়ার বাইনারি ডেটা পাওয়া যায়নি।',
      };
      scheduleSaveGroupMessages(groupId);
      const summary = updateGroupSummaryFromRecords(groupId);
      emitInboxEvent({ type: 'inbox:message_updated', groupId, message: record, groupSummary: summary, timestamp: Date.now() });
      return;
    }

    if (buffer.length > MAX_SINGLE_MEDIA_BYTES) {
      record.media = {
        ...record.media,
        status: 'too_large',
        fileSize: buffer.length,
        unavailableReason: 'ফাইলের সাইজ ২৫ MB সীমার বেশি।',
      };
      scheduleSaveGroupMessages(groupId);
      const summary = updateGroupSummaryFromRecords(groupId);
      emitInboxEvent({ type: 'inbox:message_updated', groupId, message: record, groupSummary: summary, timestamp: Date.now() });
      return;
    }

    ensureInboxDirs();
    const groupHash = hashGroupId(groupId);
    const groupMediaDir = path.join(INBOX_MEDIA_DIR, groupHash);
    if (!fs.existsSync(groupMediaDir)) {
      fs.mkdirSync(groupMediaDir, { recursive: true });
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = sanitizeExtFromMimeOrName(mimeType, fileName, messageType);
    const safeMsgToken = messageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || sha256.slice(0, 12);
    const diskFilename = `${safeMsgToken}_${sha256.slice(0, 8)}${ext}`;
    const relPath = path.join(groupHash, diskFilename);
    const fullDiskPath = path.resolve(INBOX_MEDIA_DIR, relPath);

    if (!fullDiskPath.startsWith(path.resolve(INBOX_MEDIA_DIR) + path.sep)) {
      throw new Error('Unsafe target media path rejected');
    }

    const tmpFile = `${fullDiskPath}.tmp`;
    await fs.promises.writeFile(tmpFile, buffer);
    await fs.promises.rename(tmpFile, fullDiskPath);

    record.media = {
      ...record.media,
      status: 'saved',
      relPath: relPath.split(path.sep).join('/'),
      fileSize: buffer.length,
      sha256,
      unavailableReason: undefined,
    };

    scheduleSaveGroupMessages(groupId);
    const summary = updateGroupSummaryFromRecords(groupId);
    emitInboxEvent({ type: 'inbox:message_updated', groupId, message: record, groupSummary: summary, timestamp: Date.now() });

    // Enforce configured media storage limit cleanly
    await enforceInboxMediaStorageLimit().catch(() => {});
  } catch (err: any) {
    record.media = {
      ...record.media,
      status: 'unavailable',
      unavailableReason: 'মিডিয়া ডাউনলোড করা যায়নি (সম্ভবত WhatsApp সার্ভার থেকে মেয়াদোত্তীর্ণ)।',
    };
    scheduleSaveGroupMessages(groupId);
    const summary = updateGroupSummaryFromRecords(groupId);
    emitInboxEvent({ type: 'inbox:message_updated', groupId, message: record, groupSummary: summary, timestamp: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// CAPTURE INCOMING & HISTORY SYNC & OUTGOING MESSAGES
// ---------------------------------------------------------------------------
export async function captureIncomingGroupMessages(
  sock: WASocket | null,
  messages: proto.IWebMessageInfo[],
  source: 'live' | 'history_sync'
) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  loadInboxIndex();

  for (let idx = 0; idx < messages.length; idx++) {
    if (source === 'history_sync' && idx > 0 && idx % 15 === 0) {
      await new Promise((r) => setTimeout(r, 4));
    }

    const msg = messages[idx];
    const remoteJid = msg?.key?.remoteJid;
    const messageId = msg?.key?.id;
    if (!remoteJid || !messageId || !remoteJid.endsWith('@g.us')) continue;

    // Handle message stub revokes if present cleanly without content
    if (!msg.message) {
      const stubType = (msg as any).messageStubType;
      if (stubType === 1 || stubType === 68) {
        await markInboxMessageDeleted(
          remoteJid,
          messageId,
          'sender_revoke',
          'প্রেরক WhatsApp থেকে মেসেজটি মুছে দিয়েছেন (Revoked)'
        );
      }
      continue;
    }

    const rawTop: any = msg.message;

    // Check ProtocolMessage (REVOKE / MESSAGE_EDIT)
    const protoMsg = rawTop.protocolMessage;
    if (protoMsg) {
      // Type 0 = REVOKE
      if (protoMsg.type === 0 && protoMsg.key?.id) {
        await markInboxMessageDeleted(
          remoteJid,
          protoMsg.key.id,
          'sender_revoke',
          'প্রেরক WhatsApp থেকে মেসেজটি মুছে দিয়েছেন (Deleted for Everyone)'
        );
        continue;
      }
      // Type 14 = MESSAGE_EDIT
      if (protoMsg.type === 14 && protoMsg.key?.id && protoMsg.editedMessage) {
        const { content: editedContent } = unwrapBaileysMessageContent(protoMsg.editedMessage);
        const newText =
          editedContent?.conversation ||
          editedContent?.extendedTextMessage?.text ||
          editedContent?.imageMessage?.caption ||
          editedContent?.videoMessage?.caption ||
          '';
        if (newText) {
          applyMessageEdit(remoteJid, protoMsg.key.id, newText);
        }
        continue;
      }
      continue;
    }

    // Ignore internal protocol-only wrappers
    if (
      rawTop.senderKeyDistributionMessage &&
      Object.keys(rawTop).every((k) => k === 'senderKeyDistributionMessage' || k === 'messageContextInfo')
    ) {
      continue;
    }

    const { content, isViewOnce, isEdited } = unwrapBaileysMessageContent(rawTop);
    if (!content || typeof content !== 'object') continue;

    // Ignore reactions / poll updates unless real content
    const contentKeys = Object.keys(content).filter((k) => k !== 'messageContextInfo');
    if (contentKeys.length === 0) continue;

    const rawParticipant = String(msg.key?.participant || (msg as any).participant || '').trim();
    const rawSender = msg.key?.fromMe
      ? sock?.user?.id || sock?.user?.lid || 'BOT'
      : rawParticipant || 'unknown';
    const senderAltJid = String((msg.key as any)?.participantAlt || '').trim();
    const senderJid =
      rawSender === 'BOT' || rawSender === 'unknown' ? rawSender : safeNormalizeJid(rawSender);

    const resolved = externalIdentityResolver
      ? externalIdentityResolver({
          groupId: remoteJid,
          senderJid: senderJid !== 'BOT' && senderJid !== 'unknown' ? senderJid : undefined,
          senderAltJid,
          pushName: msg.pushName,
        })
      : {};

    const senderPhone =
      resolved.senderPhone ||
      cleanJidUser(senderAltJid) ||
      cleanJidUser(senderJid) ||
      'unknown';

    const senderName =
      resolved.senderName ||
      (msg.key?.fromMe ? sock?.user?.name || 'WAGuard Bot' : msg.pushName?.trim()) ||
      `@${senderPhone}`;

    const groupName =
      resolved.groupName ||
      inboxIndex.groups[remoteJid]?.name ||
      'WhatsApp Group';

    const timestamp = formatMessageTimestampMs(msg.messageTimestamp);
    const quotedMessage = extractQuotedPreview(content);

    let messageType: InboxMessageType = 'unknown';
    let rawMessageKind = contentKeys[0] || 'unknown';
    let text = '';
    let media: InboxMediaInfo | undefined;
    let location: InboxLocationInfo | undefined;
    let contacts: InboxContactCard[] | undefined;

    if (typeof content.conversation === 'string') {
      messageType = 'text';
      rawMessageKind = 'conversation';
      text = content.conversation;
    } else if (content.extendedTextMessage) {
      messageType = 'text';
      rawMessageKind = 'extendedTextMessage';
      text = String(content.extendedTextMessage.text || '');
    } else if (content.imageMessage) {
      messageType = 'image';
      rawMessageKind = isViewOnce ? 'viewOnceImage' : 'imageMessage';
      text = String(content.imageMessage.caption || '');
      const img = content.imageMessage;
      media = {
        status: source === 'history_sync' && !img.directPath && !img.url ? 'unavailable' : 'pending',
        mimeType: img.mimetype || 'image/jpeg',
        fileSize: Number(img.fileLength || 0) || undefined,
        width: Number(img.width || 0) || undefined,
        height: Number(img.height || 0) || undefined,
        unavailableReason:
          source === 'history_sync' && !img.directPath && !img.url
            ? 'পুরোনো হিস্ট্রি সিঙ্কে ছবির ফাইলটি সংযুক্ত ছিল না।'
            : undefined,
      };
    } else if (content.videoMessage) {
      messageType = 'video';
      rawMessageKind = content.videoMessage.gifPlayback ? 'gifVideoMessage' : 'videoMessage';
      text = String(content.videoMessage.caption || '');
      const vid = content.videoMessage;
      media = {
        status: source === 'history_sync' && !vid.directPath && !vid.url ? 'unavailable' : 'pending',
        mimeType: vid.mimetype || 'video/mp4',
        fileSize: Number(vid.fileLength || 0) || undefined,
        durationSec: Number(vid.seconds || 0) || undefined,
        width: Number(vid.width || 0) || undefined,
        height: Number(vid.height || 0) || undefined,
        isGif: Boolean(vid.gifPlayback),
        unavailableReason:
          source === 'history_sync' && !vid.directPath && !vid.url
            ? 'পুরোনো হিস্ট্রি সিঙ্কে ভিডিও ফাইল সংযুক্ত ছিল না।'
            : undefined,
      };
    } else if (content.audioMessage) {
      const aud = content.audioMessage;
      const isPtt = Boolean(aud.ptt);
      messageType = isPtt ? 'voice' : 'audio';
      rawMessageKind = isPtt ? 'voiceMessage' : 'audioMessage';
      media = {
        status: source === 'history_sync' && !aud.directPath && !aud.url ? 'unavailable' : 'pending',
        mimeType: aud.mimetype || 'audio/ogg; codecs=opus',
        fileSize: Number(aud.fileLength || 0) || undefined,
        durationSec: Number(aud.seconds || 0) || undefined,
        isPtt,
        unavailableReason:
          source === 'history_sync' && !aud.directPath && !aud.url
            ? 'পুরোনো হিস্ট্রি সিঙ্কে ভয়েস/অডিও ফাইল সংযুক্ত ছিল না।'
            : undefined,
      };
    } else if (content.stickerMessage) {
      const stk = content.stickerMessage;
      messageType = 'sticker';
      rawMessageKind = 'stickerMessage';
      media = {
        status: source === 'history_sync' && !stk.directPath && !stk.url ? 'unavailable' : 'pending',
        mimeType: stk.mimetype || 'image/webp',
        fileSize: Number(stk.fileLength || 0) || undefined,
        width: Number(stk.width || 0) || undefined,
        height: Number(stk.height || 0) || undefined,
        isAnimated: Boolean(stk.isAnimated || stk.isLottie),
        unavailableReason:
          source === 'history_sync' && !stk.directPath && !stk.url
            ? 'পুরোনো হিস্ট্রি সিঙ্কে স্টিকার ফাইল সংযুক্ত ছিল না।'
            : undefined,
      };
    } else if (content.lottieStickerMessage?.message?.stickerMessage) {
      const stk = content.lottieStickerMessage.message.stickerMessage;
      messageType = 'sticker';
      rawMessageKind = 'lottieStickerMessage';
      media = {
        status: 'pending',
        mimeType: stk.mimetype || 'image/webp',
        fileSize: Number(stk.fileLength || 0) || undefined,
        isAnimated: true,
      };
    } else if (content.documentMessage) {
      const doc = content.documentMessage;
      messageType = 'document';
      rawMessageKind = 'documentMessage';
      text = String(doc.caption || '');
      media = {
        status: source === 'history_sync' && !doc.directPath && !doc.url ? 'unavailable' : 'pending',
        mimeType: doc.mimetype || 'application/octet-stream',
        fileName: doc.fileName || doc.title || 'Document',
        fileSize: Number(doc.fileLength || 0) || undefined,
        pageCount: Number(doc.pageCount || 0) || undefined,
        unavailableReason:
          source === 'history_sync' && !doc.directPath && !doc.url
            ? 'পুরোনো হিস্ট্রি সিঙ্কে ডকুমেন্ট ফাইল সংযুক্ত ছিল না।'
            : undefined,
      };
    } else if (content.locationMessage) {
      const loc = content.locationMessage;
      messageType = 'location';
      rawMessageKind = 'locationMessage';
      location = {
        latitude: Number(loc.degreesLatitude || 0),
        longitude: Number(loc.degreesLongitude || 0),
        name: loc.name || undefined,
        address: loc.address || undefined,
        url: typeof loc.url === 'string' && /^https?:\/\//i.test(loc.url) ? loc.url : undefined,
        isLive: false,
      };
      text = [loc.name, loc.address].filter(Boolean).join(' — ');
    } else if (content.liveLocationMessage) {
      const loc = content.liveLocationMessage;
      messageType = 'location';
      rawMessageKind = 'liveLocationMessage';
      location = {
        latitude: Number(loc.degreesLatitude || 0),
        longitude: Number(loc.degreesLongitude || 0),
        name: 'Live Location',
        isLive: true,
      };
      text = String(loc.caption || 'Live Location Shared');
    } else if (content.contactMessage) {
      messageType = 'contact';
      rawMessageKind = 'contactMessage';
      const parsed = parseVCard(content.contactMessage.vcard, content.contactMessage.displayName);
      contacts = [parsed];
      text = parsed.displayName;
    } else if (content.contactsArrayMessage?.contacts) {
      messageType = 'contact';
      rawMessageKind = 'contactsArrayMessage';
      contacts = (content.contactsArrayMessage.contacts as any[])
        .slice(0, 20)
        .map((c) => parseVCard(c.vcard, c.displayName));
      text = contacts.map((c) => c.displayName).join(', ');
    } else if (content.reactionMessage) {
      // Do not pollute conversation feed with raw reaction packets
      continue;
    } else {
      // Unhandled protocol/other content — record honestly if readable text exists
      if (content.pollCreationMessage?.name) {
        messageType = 'text';
        rawMessageKind = 'pollCreationMessage';
        const opts = (content.pollCreationMessage.options || []).map((o: any) => `• ${o.optionName}`).join('\n');
        text = `📊 Poll: ${content.pollCreationMessage.name}${opts ? `\n${opts}` : ''}`;
      } else {
        continue;
      }
    }

    const records = loadGroupMessages(remoteJid);
    const existing = records.find((r) => r.id === messageId);
    if (existing) {
      // Idempotent duplicate guard
      if (isEdited && text && text !== existing.text) {
        existing.text = text;
        existing.editedAt = Date.now();
        scheduleSaveGroupMessages(remoteJid);
        const summary = updateGroupSummaryFromRecords(remoteJid);
        emitInboxEvent({
          type: 'inbox:message_updated',
          groupId: remoteJid,
          message: existing,
          groupSummary: summary,
          timestamp: Date.now(),
        });
      }
      continue;
    }

    const record: InboxMessageRecord = {
      id: messageId,
      groupId: remoteJid,
      groupName,
      senderJid,
      senderAltJid: senderAltJid || undefined,
      rawParticipant: rawParticipant || undefined,
      senderPhone,
      senderName,
      fromMe: Boolean(msg.key?.fromMe),
      timestamp,
      messageType,
      rawMessageKind,
      text,
      quotedMessage,
      media,
      location,
      contacts,
      isDeleted: false,
      editedAt: isEdited ? Date.now() : undefined,
      isImportant: false,
      source,
    };

    insertMessageOrdered(records, record);
    trimGroupMessagesIfOverCap(remoteJid, records);
    scheduleSaveGroupMessages(remoteJid);

    const summary = updateGroupSummaryFromRecords(remoteJid, {
      name: groupName !== 'WhatsApp Group' ? groupName : undefined,
      connected: true,
    });

    emitInboxEvent({
      type: 'inbox:message_new',
      groupId: remoteJid,
      message: record,
      groupSummary: summary,
      timestamp: Date.now(),
    });

    if (sock && media && media.status === 'pending') {
      enqueueMediaDownload({
        sock,
        waMsg: msg,
        groupId: remoteJid,
        messageId,
        messageType,
        mimeType: media.mimeType,
        fileName: media.fileName,
        declaredSize: media.fileSize,
      });
    }
  }
}

export function captureBotOutgoingGroupMessage(params: {
  groupId: string;
  groupName?: string;
  messageId?: string;
  senderJid?: string;
  text: string;
}) {
  const { groupId, messageId, senderJid, text } = params;
  if (!groupId || !groupId.endsWith('@g.us') || !text.trim()) return;
  loadInboxIndex();
  const id = messageId || `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const records = loadGroupMessages(groupId);
  if (records.some((r) => r.id === id)) return;

  const phone = cleanJidUser(senderJid) || 'WAGuard';
  const groupName = params.groupName || inboxIndex.groups[groupId]?.name || 'WhatsApp Group';

  const record: InboxMessageRecord = {
    id,
    groupId,
    groupName,
    senderJid: senderJid || 'BOT',
    senderPhone: phone,
    senderName: 'WAGuard / Maya Bot',
    fromMe: true,
    timestamp: Date.now(),
    messageType: 'text',
    rawMessageKind: 'botOutgoingMessage',
    text: text.trim(),
    isDeleted: false,
    isImportant: false,
    source: 'bot_outgoing',
  };

  insertMessageOrdered(records, record);
  trimGroupMessagesIfOverCap(groupId, records);
  scheduleSaveGroupMessages(groupId);
  const summary = updateGroupSummaryFromRecords(groupId, { connected: true });
  emitInboxEvent({
    type: 'inbox:message_new',
    groupId,
    message: record,
    groupSummary: summary,
    timestamp: Date.now(),
  });
}

function insertMessageOrdered(records: InboxMessageRecord[], record: InboxMessageRecord) {
  if (records.length === 0 || record.timestamp >= records[records.length - 1].timestamp) {
    records.push(record);
    return;
  }
  // Binary / reverse insertion for out-of-order history sync batches
  let idx = records.length - 1;
  while (idx >= 0 && records[idx].timestamp > record.timestamp) {
    idx--;
  }
  records.splice(idx + 1, 0, record);
}

function trimGroupMessagesIfOverCap(groupId: string, records: InboxMessageRecord[]) {
  const cap = inboxIndex.settings.maxMessagesPerGroup || 2500;
  if (records.length <= cap) return;
  // Preserve isImportant messages even when trimming oldest records beyond cap
  let idx = 0;
  while (records.length > cap && idx < records.length) {
    if (!records[idx].isImportant) {
      const removed = records.splice(idx, 1)[0];
      if (removed?.media?.relPath) {
        const full = path.resolve(INBOX_MEDIA_DIR, removed.media.relPath);
        if (full.startsWith(path.resolve(INBOX_MEDIA_DIR) + path.sep)) {
          fs.promises.unlink(full).catch(() => {});
        }
      }
    } else {
      idx++;
    }
  }
}

function applyMessageEdit(groupId: string, messageId: string, newText: string) {
  const records = loadGroupMessages(groupId);
  const target = records.find((r) => r.id === messageId);
  if (!target) return;
  target.text = newText;
  target.editedAt = Date.now();
  scheduleSaveGroupMessages(groupId);
  const summary = updateGroupSummaryFromRecords(groupId);
  emitInboxEvent({
    type: 'inbox:message_updated',
    groupId,
    message: target,
    groupSummary: summary,
    timestamp: Date.now(),
  });
}

export async function markInboxMessageDeleted(
  groupId: string,
  messageId: string,
  deletedBy: string,
  deletionReason: string,
  options?: { deleteLocalMedia?: boolean; markImportant?: boolean; deletionVerified?: boolean }
) {
  if (!groupId || !messageId || !groupId.endsWith('@g.us')) return;
  loadInboxIndex();
  const records = loadGroupMessages(groupId);
  const target = records.find((r) => r.id === messageId);

  if (target) {
    const nextVerified = options?.deletionVerified === true;
    if (
      target.isDeleted &&
      target.deletionReason === deletionReason &&
      (!nextVerified || target.deletionVerified === true)
    ) {
      return;
    }
    target.isDeleted = true;
    target.deletedAt = Date.now();
    target.deletedBy = deletedBy;
    target.deletionReason = deletionReason;
    if (typeof options?.deletionVerified === 'boolean') {
      target.deletionVerified = options.deletionVerified;
    } else if (deletedBy === 'sender_revoke' || deletedBy === 'moderation_engine' || deletedBy === 'sticker_queue') {
      target.deletionVerified = true;
    }

    if (options?.deleteLocalMedia && target.media?.relPath) {
      try {
        const baseDir = path.resolve(INBOX_MEDIA_DIR);
        const full = path.resolve(baseDir, target.media.relPath);
        if (full.startsWith(baseDir + path.sep) && fs.existsSync(full)) {
          await fs.promises.unlink(full).catch(() => {});
        }
      } catch {}
      target.media = {
        ...target.media,
        status: 'pruned_for_space',
        relPath: undefined,
        unavailableReason: 'স্টিকার রিমুভ ক্লিনআপ দ্বারা ফাইলটি মুছে ফেলা হয়েছে।',
      };
    }

    // Automatically protect moderation-deleted evidence as important audit (except sender revoke or bulk purge)
    if (typeof options?.markImportant === 'boolean') {
      target.isImportant = options.markImportant;
    } else if (deletedBy !== 'sender_revoke' && deletedBy !== 'sticker_bulk_purge') {
      target.isImportant = true;
    }

    scheduleSaveGroupMessages(groupId);
    const summary = updateGroupSummaryFromRecords(groupId);
    emitInboxEvent({
      type: 'inbox:message_updated',
      groupId,
      message: target,
      groupSummary: summary,
      timestamp: Date.now(),
    });
    return;
  }

  // If WhatsApp revoked a message that arrived before the bot connected, record an honest deleted entry (zero fabricated text)
  if (deletedBy === 'sender_revoke') {
    const groupName = inboxIndex.groups[groupId]?.name || 'WhatsApp Group';
    const placeholder: InboxMessageRecord = {
      id: messageId,
      groupId,
      groupName,
      senderJid: 'unknown',
      senderPhone: 'WhatsApp User',
      senderName: 'অজানা প্রেরক (পূর্বের মেসেজ)',
      fromMe: false,
      timestamp: Date.now(),
      messageType: 'deleted',
      rawMessageKind: 'protocolRevoke',
      text: 'এই মেসেজটি ডিলিট করা হয়েছে (বট যুক্ত হওয়ার আগের মেসেজ হওয়ায় মূল কনটেন্ট পাওয়া যায়নি)।',
      isDeleted: true,
      deletedAt: Date.now(),
      deletedBy,
      deletionReason,
      isImportant: false,
      source: 'live',
    };
    insertMessageOrdered(records, placeholder);
    scheduleSaveGroupMessages(groupId);
    const summary = updateGroupSummaryFromRecords(groupId);
    emitInboxEvent({
      type: 'inbox:message_new',
      groupId,
      message: placeholder,
      groupSummary: summary,
      timestamp: Date.now(),
    });
  }
}

export function toggleMessageImportant(groupId: string, messageId: string, important?: boolean): InboxMessageRecord | null {
  const records = loadGroupMessages(groupId);
  const target = records.find((r) => r.id === messageId);
  if (!target) return null;
  target.isImportant = typeof important === 'boolean' ? important : !target.isImportant;
  scheduleSaveGroupMessages(groupId);
  const summary = updateGroupSummaryFromRecords(groupId);
  emitInboxEvent({
    type: 'inbox:message_updated',
    groupId,
    message: target,
    groupSummary: summary,
    timestamp: Date.now(),
  });
  return target;
}

export function getInboxMessageById(groupId: string, messageId: string): InboxMessageRecord | null {
  if (!groupId || !messageId || !groupId.endsWith('@g.us')) return null;
  loadInboxIndex();
  const records = loadGroupMessages(groupId);
  return records.find((r) => r.id === messageId) || null;
}

export async function removeInboxMessageFromHistory(groupId: string, messageId: string): Promise<boolean> {
  if (!groupId || !messageId || !groupId.endsWith('@g.us')) return false;
  loadInboxIndex();
  const records = loadGroupMessages(groupId);
  const idx = records.findIndex((r) => r.id === messageId);
  if (idx < 0) return false;
  const [removed] = records.splice(idx, 1);

  if (removed?.media?.relPath) {
    try {
      const baseDir = path.resolve(INBOX_MEDIA_DIR);
      const full = path.resolve(baseDir, removed.media.relPath);
      if (full.startsWith(baseDir + path.sep) && fs.existsSync(full)) {
        await fs.promises.unlink(full).catch(() => {});
      }
    } catch {}
  }

  scheduleSaveGroupMessages(groupId);
  const summary = updateGroupSummaryFromRecords(groupId);
  emitInboxEvent({
    type: 'inbox:message_removed',
    groupId,
    messageId,
    groupSummary: summary,
    timestamp: Date.now(),
  });
  return true;
}

// ---------------------------------------------------------------------------
// GROUP LIST SYNC & REAL PROFILE AVATAR CACHE
// ---------------------------------------------------------------------------
let avatarFetchInFlight = false;

export async function syncConnectedGroupsToInbox(
  sock: WASocket | null,
  groupsInput: Record<string, any> | Array<{ id: string; name: string; participants: number; isBotAdmin?: boolean }>,
  options?: { isFullSnapshot?: boolean }
) {
  loadInboxIndex();
  const isFullSnapshot = options?.isFullSnapshot !== false;
  const list = Array.isArray(groupsInput)
    ? groupsInput
    : Object.values(groupsInput || {}).map((g: any) => ({
        id: g.id,
        name: g.subject || g.name || 'WhatsApp Group',
        participants: Array.isArray(g.participants) ? g.participants.length : Number(g.participants || 0),
        isBotAdmin: g.isBotAdmin,
      }));

  const connectedSet = new Set(list.map((g) => g.id));

  for (const g of list) {
    if (!g.id || !g.id.endsWith('@g.us')) continue;
    const existing = inboxIndex.groups[g.id];
    const resolvedParticipants =
      typeof g.participants === 'number' && g.participants > 0
        ? g.participants
        : existing?.participants || 0;
    const summary = updateGroupSummaryFromRecords(g.id, {
      name: g.name,
      participants: resolvedParticipants,
      isBotAdmin: typeof g.isBotAdmin === 'boolean' ? g.isBotAdmin : existing?.isBotAdmin,
      connected: true,
    });
    emitInboxEvent({ type: 'inbox:group_updated', groupId: g.id, groupSummary: summary, timestamp: Date.now() });
  }

  if (isFullSnapshot) {
    for (const [gid, existing] of Object.entries(inboxIndex.groups)) {
      if (!connectedSet.has(gid) && existing.connected) {
        existing.connected = false;
        scheduleSaveIndex();
        emitInboxEvent({
          type: 'inbox:group_updated',
          groupId: gid,
          groupSummary: existing,
          timestamp: Date.now(),
        });
      }
    }
  }

  if (sock && sock.authState?.creds?.registered && !avatarFetchInFlight) {
    avatarFetchInFlight = true;
    setImmediate(async () => {
      try {
        await refreshGroupAvatarsInBackground(sock, list.map((g) => g.id));
      } finally {
        avatarFetchInFlight = false;
      }
    });
  }
}

async function refreshGroupAvatarsInBackground(sock: WASocket, groupIds: string[]) {
  const now = Date.now();
  ensureInboxDirs();

  for (const groupId of groupIds) {
    const existing = inboxIndex.groups[groupId];
    const hasFreshAvatar =
      existing?.avatarFetchedAt &&
      now - existing.avatarFetchedAt < AVATAR_REFRESH_INTERVAL_MS &&
      (existing.avatarStatus === 'none' ||
        (existing.avatarRelPath && fs.existsSync(path.resolve(INBOX_AVATARS_DIR, existing.avatarRelPath))));

    if (hasFreshAvatar) continue;

    try {
      const picUrl = await Promise.race([
        sock.profilePictureUrl(groupId, 'image'),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 6000)),
      ]);

      if (!picUrl || typeof picUrl !== 'string' || !/^https?:\/\//i.test(picUrl)) {
        if (existing) {
          existing.avatarStatus = 'none';
          existing.avatarFetchedAt = Date.now();
          scheduleSaveIndex();
        }
        continue;
      }

      const res = await fetch(picUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const arrBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      if (buf.length === 0 || buf.length > 5 * 1024 * 1024) continue;

      const relName = `${hashGroupId(groupId)}.jpg`;
      const targetPath = path.resolve(INBOX_AVATARS_DIR, relName);
      if (!targetPath.startsWith(path.resolve(INBOX_AVATARS_DIR) + path.sep)) continue;

      const tmp = `${targetPath}.tmp`;
      await fs.promises.writeFile(tmp, buf);
      await fs.promises.rename(tmp, targetPath);

      const summary = updateGroupSummaryFromRecords(groupId, {
        avatarRelPath: relName,
        avatarStatus: 'ready',
        avatarFetchedAt: Date.now(),
      });
      emitInboxEvent({
        type: 'inbox:group_updated',
        groupId,
        groupSummary: summary,
        timestamp: Date.now(),
      });
    } catch {
      if (inboxIndex.groups[groupId]) {
        inboxIndex.groups[groupId].avatarStatus = 'none';
        inboxIndex.groups[groupId].avatarFetchedAt = Date.now();
        scheduleSaveIndex();
      }
    }

    await new Promise((r) => setTimeout(r, 250));
  }
}

export function getInboxGroupsList(): InboxGroupSummary[] {
  loadInboxIndex();
  const list = Object.values(inboxIndex.groups).map((g) => updateGroupSummaryFromRecords(g.id, undefined, false));
  // Sort: Connected groups first, then newest activity, then alphabetical
  list.sort((a, b) => {
    if (Boolean(a.connected) !== Boolean(b.connected)) return a.connected ? -1 : 1;
    const ta = a.lastMessageAt || 0;
    const tb = b.lastMessageAt || 0;
    if (ta !== tb) return tb - ta;
    return (a.name || '').localeCompare(b.name || '');
  });
  return list;
}

export function markGroupLeftInInbox(groupId: string) {
  loadInboxIndex();
  if (inboxIndex.groups[groupId]) {
    inboxIndex.groups[groupId].connected = false;
    scheduleSaveIndex();
    emitInboxEvent({
      type: 'inbox:group_updated',
      groupId,
      groupSummary: inboxIndex.groups[groupId],
      timestamp: Date.now(),
    });
  }
}

export function isInboxGroupConnected(groupId: string): boolean {
  loadInboxIndex();
  const entry = inboxIndex.groups[groupId];
  if (!entry) return true;
  return entry.connected !== false;
}

// ---------------------------------------------------------------------------
// PAGINATED QUERY, SEARCH & FILTERS
// ---------------------------------------------------------------------------
export interface InboxMessageQueryParams {
  groupId: string;
  limit?: number;
  beforeTimestamp?: number;
  beforeId?: string;
  sender?: string;
  query?: string;
  typeFilter?: 'all' | 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'location' | 'contact' | 'deleted' | 'important';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  deletedOnly?: boolean;
}

export function queryGroupInboxMessages(params: InboxMessageQueryParams): {
  group: InboxGroupSummary | null;
  messages: InboxMessageRecord[];
  hasMore: boolean;
  totalMatching: number;
  nextCursor: { beforeTimestamp: number; beforeId: string } | null;
} {
  loadInboxIndex();
  const { groupId } = params;
  const limit = Math.max(1, Math.min(100, Number(params.limit || 35)));
  const all = loadGroupMessages(groupId);
  const groupSummary = inboxIndex.groups[groupId] ? updateGroupSummaryFromRecords(groupId, undefined, false) : null;

  const senderNeedle = (params.sender || '').trim().toLowerCase();
  const textNeedle = (params.query || '').trim().toLowerCase();
  const typeFilter = params.typeFilter || 'all';

  let fromMs = 0;
  let toMs = Number.MAX_SAFE_INTEGER;
  if (params.dateFrom) {
    const parsedFrom = Date.parse(`${params.dateFrom}T00:00:00`);
    if (Number.isFinite(parsedFrom)) fromMs = parsedFrom;
  }
  if (params.dateTo) {
    const parsedTo = Date.parse(`${params.dateTo}T23:59:59.999`);
    if (Number.isFinite(parsedTo)) toMs = parsedTo;
  }

  const filtered = all.filter((m) => {
    if (params.deletedOnly || typeFilter === 'deleted') {
      if (!m.isDeleted) return false;
    } else if (typeFilter === 'important') {
      if (!m.isImportant) return false;
    } else if (typeFilter !== 'all') {
      if (typeFilter === 'audio') {
        if (m.messageType !== 'audio' && m.messageType !== 'voice') return false;
      } else if (m.messageType !== typeFilter) {
        return false;
      }
    }

    if (m.timestamp < fromMs || m.timestamp > toMs) return false;

    if (senderNeedle) {
      const sHay = `${m.senderName} ${m.senderPhone} ${m.senderJid}`.toLowerCase();
      if (!sHay.includes(senderNeedle)) return false;
    }

    if (textNeedle) {
      const hay = [
        m.text,
        m.senderName,
        m.senderPhone,
        m.media?.fileName || '',
        m.location?.name || '',
        m.location?.address || '',
        ...(m.contacts || []).map((c) => `${c.displayName} ${c.phone || ''}`),
        m.deletionReason || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(textNeedle)) return false;
    }

    return true;
  });

  const totalMatching = filtered.length;

  // Apply cursor (< beforeTimestamp) for loading older pages backward
  let sliceEnd = filtered.length;
  if (params.beforeTimestamp) {
    const bt = Number(params.beforeTimestamp);
    const bid = params.beforeId || '';
    sliceEnd = 0;
    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i];
      if (item.timestamp < bt || (item.timestamp === bt && bid && item.id === bid)) {
        if (item.id === bid && item.timestamp === bt) break;
        sliceEnd = i + 1;
      } else {
        break;
      }
    }
  }

  const startIdx = Math.max(0, sliceEnd - limit);
  const pageItems = filtered.slice(startIdx, sliceEnd);
  const hasMore = startIdx > 0;
  const oldestInPage = pageItems[0];

  return {
    group: groupSummary,
    messages: pageItems,
    hasMore,
    totalMatching,
    nextCursor:
      hasMore && oldestInPage
        ? { beforeTimestamp: oldestInPage.timestamp, beforeId: oldestInPage.id }
        : null,
  };
}

// ---------------------------------------------------------------------------
// SAFE MEDIA FILE RESOLUTION (STRICT CONFINEMENT)
// ---------------------------------------------------------------------------
export function resolveSafeInboxMediaFile(
  groupId: string,
  messageId: string
): { filePath: string; record: InboxMessageRecord } | null {
  if (!groupId || !messageId) return null;
  const records = loadGroupMessages(groupId);
  const record = records.find((r) => r.id === messageId);
  if (!record?.media?.relPath || record.media.status !== 'saved') return null;

  const baseDir = path.resolve(INBOX_MEDIA_DIR);
  const resolved = path.resolve(baseDir, record.media.relPath);
  if (!resolved.startsWith(baseDir + path.sep)) {
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return { filePath: resolved, record };
}

export function resolveSafeGroupAvatarFile(groupId: string): string | null {
  loadInboxIndex();
  const group = inboxIndex.groups[groupId];
  if (!group?.avatarRelPath || group.avatarStatus !== 'ready') return null;

  const baseDir = path.resolve(INBOX_AVATARS_DIR);
  const resolved = path.resolve(baseDir, group.avatarRelPath);
  if (!resolved.startsWith(baseDir + path.sep)) {
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// STORAGE MONITORING & SAFE PRUNING (NEVER TOUCHES IMPORTANT MESSAGES OR DB)
// ---------------------------------------------------------------------------
function measureFolderBytesSync(dirPath: string, depth = 0): { bytes: number; files: number } {
  if (depth > 3 || !fs.existsSync(dirPath)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = measureFolderBytesSync(full, depth + 1);
        bytes += sub.bytes;
        files += sub.files;
      } else if (entry.isFile()) {
        try {
          bytes += fs.statSync(full).size;
          files++;
        } catch {}
      }
    }
  } catch {}
  return { bytes, files };
}

export function getInboxStorageStats(): InboxStorageStats {
  loadInboxIndex();
  const mediaStat = measureFolderBytesSync(INBOX_MEDIA_DIR);
  const msgsStat = measureFolderBytesSync(INBOX_MESSAGES_DIR);
  const avatarsStat = measureFolderBytesSync(INBOX_AVATARS_DIR);
  let totalMessages = 0;
  let totalDeletedMessages = 0;
  let totalImportantMessages = 0;

  for (const gid of Object.keys(inboxIndex.groups)) {
    const g = updateGroupSummaryFromRecords(gid, undefined, false);
    totalMessages += g.totalStoredMessages;
    totalDeletedMessages += g.deletedCount;
    totalImportantMessages += g.importantCount;
  }

  const mediaLimitBytes = getInboxEffectiveMediaLimitBytes();
  const mediaUsedPercent =
    mediaLimitBytes > 0 ? Number(((mediaStat.bytes / mediaLimitBytes) * 100).toFixed(2)) : 0;

  return {
    totalGroups: Object.keys(inboxIndex.groups).length,
    totalMessages,
    totalDeletedMessages,
    totalImportantMessages,
    totalMediaFiles: mediaStat.files,
    mediaUsedBytes: mediaStat.bytes,
    mediaLimitBytes,
    mediaUsedPercent,
    messagesDbBytes: msgsStat.bytes + (fs.existsSync(INBOX_INDEX_PATH) ? fs.statSync(INBOX_INDEX_PATH).size : 0),
    avatarsBytes: avatarsStat.bytes,
  };
}

export function getInboxSettings(): InboxStorageSettings {
  loadInboxIndex();
  return { ...inboxIndex.settings };
}

export function updateInboxSettings(patch: Partial<InboxStorageSettings>): InboxStorageSettings {
  loadInboxIndex();
  inboxIndex.settings = {
    ...inboxIndex.settings,
    ...(patch.mediaStorageLimitMb !== undefined
      ? { mediaStorageLimitMb: Math.max(50, Math.min(2048, Math.round(Number(patch.mediaStorageLimitMb)))) }
      : {}),
    ...(typeof patch.autoPruneOldNonImportantMedia === 'boolean'
      ? { autoPruneOldNonImportantMedia: patch.autoPruneOldNonImportantMedia }
      : {}),
    ...(patch.maxMessagesPerGroup !== undefined
      ? { maxMessagesPerGroup: Math.max(200, Math.min(10000, Math.round(Number(patch.maxMessagesPerGroup)))) }
      : {}),
  };
  saveInboxIndexSync();
  return { ...inboxIndex.settings };
}

export async function enforceInboxMediaStorageLimit(
  forcePrunePercent = 0,
  targetMaxBytesOverride?: number
): Promise<{
  filesRemoved: number;
  bytesFreed: number;
  protectedImportantSkipped: number;
}> {
  loadInboxIndex();
  if (!inboxIndex.settings.autoPruneOldNonImportantMedia && forcePrunePercent <= 0 && targetMaxBytesOverride === undefined) {
    return { filesRemoved: 0, bytesFreed: 0, protectedImportantSkipped: 0 };
  }

  const limitBytes = getInboxEffectiveMediaLimitBytes();
  const initialMediaBytes = measureFolderBytesSync(INBOX_MEDIA_DIR).bytes;

  let targetMaxBytes =
    targetMaxBytesOverride !== undefined
      ? Math.max(0, targetMaxBytesOverride)
      : forcePrunePercent > 0
      ? Math.max(0, Math.floor(initialMediaBytes * (1 - Math.min(1, forcePrunePercent / 100))))
      : Math.floor(limitBytes * 0.85);
  if (forcePrunePercent <= 0 && targetMaxBytesOverride === undefined) {
    targetMaxBytes = Math.min(targetMaxBytes, Math.floor(limitBytes * 0.85));
  }

  // Collect all non-important saved media across groups, oldest first
  const candidates: Array<{ groupId: string; record: InboxMessageRecord; fullPath: string; size: number }> = [];
  const referencedFiles = new Set<string>();
  let protectedImportantSkipped = 0;
  const baseDir = path.resolve(INBOX_MEDIA_DIR);

  for (const gid of Object.keys(inboxIndex.groups)) {
    const records = loadGroupMessages(gid);
    for (const rec of records) {
      if (rec.media?.status === 'saved' && rec.media.relPath) {
        const fullPath = path.resolve(baseDir, rec.media.relPath);
        if (!fullPath.startsWith(baseDir + path.sep)) continue;
        referencedFiles.add(fullPath);
        if (rec.isImportant || rec.deletedBy === 'moderation_engine' || rec.deletedBy === 'sticker_queue') {
          protectedImportantSkipped++;
          continue;
        }
        candidates.push({
          groupId: gid,
          record: rec,
          fullPath,
          size: Number(rec.media.fileSize || 0),
        });
      }
    }
  }

  let currentBytes = initialMediaBytes;
  let filesRemoved = 0;
  let bytesFreed = 0;
  const affectedGroups = new Set<string>();

  // 1) Remove orphaned files & .tmp files inside INBOX_MEDIA_DIR that are no longer referenced
  try {
    const groupDirs = await fs.promises.readdir(baseDir, { withFileTypes: true });
    for (const gd of groupDirs) {
      if (gd.isFile() && gd.name.endsWith('.tmp')) {
        const p = path.join(baseDir, gd.name);
        try {
          const st = await fs.promises.stat(p);
          await fs.promises.unlink(p);
          currentBytes = Math.max(0, currentBytes - st.size);
          bytesFreed += st.size;
          filesRemoved++;
        } catch {}
        continue;
      }
      if (!gd.isDirectory()) continue;
      const subDir = path.join(baseDir, gd.name);
      const subFiles = await fs.promises.readdir(subDir, { withFileTypes: true }).catch(() => []);
      for (const sf of subFiles) {
        if (!sf.isFile()) continue;
        const fp = path.join(subDir, sf.name);
        if (sf.name.endsWith('.tmp') || (!referencedFiles.has(fp) && Date.now() - ((await fs.promises.stat(fp).catch(() => null))?.mtimeMs || Date.now()) > 120000)) {
          try {
            const st = await fs.promises.stat(fp);
            await fs.promises.unlink(fp);
            currentBytes = Math.max(0, currentBytes - st.size);
            bytesFreed += st.size;
            filesRemoved++;
          } catch {}
        }
      }
    }
  } catch {}

  if (forcePrunePercent <= 0 && targetMaxBytesOverride === undefined && currentBytes <= limitBytes) {
    return { filesRemoved, bytesFreed, protectedImportantSkipped };
  }

  candidates.sort((a, b) => a.record.timestamp - b.record.timestamp);

  for (const item of candidates) {
    if (currentBytes <= targetMaxBytes) break;
    try {
      let actualSize = item.size;
      if (fs.existsSync(item.fullPath)) {
        const st = await fs.promises.stat(item.fullPath);
        actualSize = st.size;
        await fs.promises.unlink(item.fullPath);
      }
      currentBytes = Math.max(0, currentBytes - actualSize);
      bytesFreed += actualSize;
      filesRemoved++;
      item.record.media = {
        ...item.record.media!,
        status: 'pruned_for_space',
        relPath: undefined,
        unavailableReason: 'স্টোরেজ লিমিট রক্ষার জন্য পুরোনো নন-ইম্পর্ট্যান্ট মিডিয়া ফাইলটি নিরাপদভাবে পরিষ্কার করা হয়েছে।',
      };
      affectedGroups.add(item.groupId);
    } catch {}
  }

  for (const gid of affectedGroups) {
    scheduleSaveGroupMessages(gid);
    updateGroupSummaryFromRecords(gid);
  }

  if (filesRemoved > 0) {
    emitInboxEvent({
      type: 'inbox:storage_updated',
      stats: getInboxStorageStats(),
      timestamp: Date.now(),
    });
  }

  return { filesRemoved, bytesFreed, protectedImportantSkipped };
}

export async function trimNonImportantInboxMessagesForSpace(maxPerGroup = 350): Promise<{ messagesTrimmed: number; bytesEstimateFreed: number }> {
  loadInboxIndex();
  const cap = Math.max(100, Math.round(maxPerGroup));
  let messagesTrimmed = 0;
  let bytesEstimateFreed = 0;
  for (const gid of Object.keys(inboxIndex.groups)) {
    const records = loadGroupMessages(gid);
    if (records.length <= cap) continue;
    let idx = 0;
    let trimmedHere = 0;
    while (records.length > cap && idx < records.length) {
      const r = records[idx];
      if (!r.isImportant && !r.isDeleted) {
        records.splice(idx, 1);
        messagesTrimmed++;
        trimmedHere++;
        bytesEstimateFreed += 350;
        if (r.media?.relPath) {
          const full = path.resolve(INBOX_MEDIA_DIR, r.media.relPath);
          if (full.startsWith(path.resolve(INBOX_MEDIA_DIR) + path.sep)) {
            await fs.promises.unlink(full).catch(() => {});
          }
        }
      } else {
        idx++;
      }
    }
    if (trimmedHere > 0) {
      saveGroupMessagesSync(gid);
      updateGroupSummaryFromRecords(gid);
    }
  }
  if (messagesTrimmed > 0) {
    saveInboxIndexSync();
  }
  return { messagesTrimmed, bytesEstimateFreed };
}

export function getRecentGroupVoiceClips(limit = 40, filterGroupId?: string): InboxMessageRecord[] {
  loadInboxIndex();
  const capped = Math.max(1, Math.min(120, Number(limit || 40)));
  const groupIds = filterGroupId
    ? [filterGroupId]
    : Object.keys(inboxIndex.groups);

  const clips: InboxMessageRecord[] = [];
  for (const gid of groupIds) {
    const records = loadGroupMessages(gid);
    for (const rec of records) {
      if (
        (rec.messageType === 'voice' || rec.messageType === 'audio') &&
        rec.media?.status === 'saved' &&
        rec.media.relPath
      ) {
        clips.push(rec);
      }
    }
  }

  clips.sort((a, b) => b.timestamp - a.timestamp);
  return clips.slice(0, capped);
}

export interface AccumulatedGroupStickerEntry {
  messageId: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderAltJid?: string;
  rawParticipant?: string;
  senderPhone: string;
  fromMe: boolean;
  timestamp: number;
  previouslyServerPurged?: boolean;
}

function isStickerInboxRecord(rec: InboxMessageRecord): boolean {
  return (
    rec.messageType === 'sticker' ||
    rec.rawMessageKind === 'stickerMessage' ||
    rec.rawMessageKind === 'lottieStickerMessage' ||
    rec.rawMessageKind === 'stickerPackMessage'
  );
}

function isUnverifiedServerPurgedSticker(rec: InboxMessageRecord, maxAgeMs = 14 * 24 * 60 * 60 * 1000): boolean {
  if (!rec.isDeleted || rec.deletedBy !== 'sticker_bulk_purge' || rec.deletionVerified === true) {
    return false;
  }
  const refTs = Number(rec.deletedAt || rec.timestamp || 0);
  return refTs === 0 || Date.now() - refTs <= maxAgeMs;
}

export function getAccumulatedStickerCountsSummary(): {
  totalCount: number;
  groups: Array<{ groupId: string; groupName: string; count: number }>;
  unverifiedBulkCount: number;
  unverifiedGroups: Array<{ groupId: string; groupName: string; count: number }>;
} {
  loadInboxIndex();
  const groups: Array<{ groupId: string; groupName: string; count: number }> = [];
  const unverifiedGroups: Array<{ groupId: string; groupName: string; count: number }> = [];
  let totalCount = 0;
  let unverifiedBulkCount = 0;

  for (const [gid, gInfo] of Object.entries(inboxIndex.groups)) {
    if (gInfo && gInfo.connected === false) continue;
    const records = loadGroupMessages(gid);
    let count = 0;
    let unverifiedCount = 0;
    for (const rec of records) {
      if (!isStickerInboxRecord(rec)) continue;
      if (!rec.isDeleted) {
        count++;
      } else if (isUnverifiedServerPurgedSticker(rec)) {
        unverifiedCount++;
      }
    }
    if (count > 0) {
      totalCount += count;
      groups.push({
        groupId: gid,
        groupName: gInfo?.name || 'WhatsApp Group',
        count,
      });
    }
    if (unverifiedCount > 0) {
      unverifiedBulkCount += unverifiedCount;
      unverifiedGroups.push({
        groupId: gid,
        groupName: gInfo?.name || 'WhatsApp Group',
        count: unverifiedCount,
      });
    }
  }

  groups.sort((a, b) => b.count - a.count);
  unverifiedGroups.sort((a, b) => b.count - a.count);
  return { totalCount, groups, unverifiedBulkCount, unverifiedGroups };
}

export function getAccumulatedStickersForPurge(
  targetGroupId?: string,
  limit = 600,
  opts?: { includeUnverifiedBulk?: boolean }
): {
  items: AccumulatedGroupStickerEntry[];
  groupsAffected: Array<{ groupId: string; groupName: string; count: number }>;
} {
  loadInboxIndex();
  const capped = Math.max(1, Math.min(2000, Number(limit || 600)));
  const cleanTarget = targetGroupId && targetGroupId !== 'ALL' ? String(targetGroupId).trim() : '';
  const groupIds = cleanTarget
    ? [cleanTarget]
    : Object.keys(inboxIndex.groups).filter((gid) => inboxIndex.groups[gid]?.connected !== false);
  const includeUnverified = Boolean(opts?.includeUnverifiedBulk);

  const items: AccumulatedGroupStickerEntry[] = [];
  const countsMap = new Map<string, { groupId: string; groupName: string; count: number }>();

  for (const gid of groupIds) {
    if (!gid.endsWith('@g.us')) continue;
    const records = loadGroupMessages(gid);
    const groupName = inboxIndex.groups[gid]?.name || 'WhatsApp Group';
    for (const rec of records) {
      if (!rec.id || !isStickerInboxRecord(rec)) continue;
      const isUnverifiedBulk = isUnverifiedServerPurgedSticker(rec);
      if (rec.isDeleted && !(includeUnverified && isUnverifiedBulk)) continue;

      const cleanSenderJid =
        rec.senderJid && !rec.senderJid.endsWith('@g.us') && rec.senderJid !== 'unknown'
          ? rec.senderJid
          : rec.rawParticipant && !rec.rawParticipant.endsWith('@g.us')
          ? rec.rawParticipant
          : rec.senderPhone && rec.senderPhone !== 'unknown' && rec.senderPhone !== 'member'
          ? `${rec.senderPhone}@s.whatsapp.net`
          : '';

      items.push({
        messageId: rec.id,
        groupId: gid,
        groupName: rec.groupName || groupName,
        senderJid: cleanSenderJid,
        senderAltJid: rec.senderAltJid,
        rawParticipant: rec.rawParticipant,
        senderPhone: rec.senderPhone || 'member',
        fromMe: Boolean(rec.fromMe),
        timestamp: Number(rec.timestamp || 0),
        previouslyServerPurged: rec.isDeleted && isUnverifiedBulk,
      });
      const prev = countsMap.get(gid);
      if (prev) {
        prev.count += 1;
      } else {
        countsMap.set(gid, { groupId: gid, groupName: rec.groupName || groupName, count: 1 });
      }
    }
  }

  // Delete newest stickers first so visible stickers disappear immediately
  items.sort((a, b) => b.timestamp - a.timestamp);
  return {
    items: items.slice(0, capped),
    groupsAffected: Array.from(countsMap.values()).sort((a, b) => b.count - a.count),
  };
}

loadInboxIndex();
