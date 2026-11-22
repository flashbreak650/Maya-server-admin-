import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';

import {
  processIncomingMessage,
  handleGroupParticipantsUpdate,
  handleIncomingCall,
  primeGroupMetaCache,
  rememberLidPnPair,
  resolveBotIdentitySet,
  startGroupLockMonitor,
  upsertCachedGroupMeta,
  startNightModeScheduler,
  startRestrictedUsersMonitor,
  getSettings as getModerationSettings,
  updateSettings as updateModerationSettings,
  getActivityLogs,
  getStats as getModerationStats,
  resetWarnings as resetAllWarnings,
  resetSingleWarning,
  getActiveWarnings,
  getActiveGroupLocks,
  unlockGroupManually,
  clearActivityLogs,
  loadDatabase,
  getActiveRestrictedUsers,
  unrestrictUser,
  getNightModeStatus,
  applyNightModeManually,
  getCallLogs,
  clearCallLogs,
  resetCallCounts,
  getMemberActivityReport,
  resetMemberActivity,
  getKeywordTriggers,
  addKeywordTrigger,
  toggleKeywordTrigger,
  removeKeywordTrigger,
  updateContactNames,
  getGroupMembersForBlockPage,
  manualBlockMember,
  DEFAULT_MANUAL_MEMBER_BLOCK_NOTICE,
  getCachedGroupMetadataSync,
  startServerHealthMonitor,
  flushPendingServerNotices,
  reportServerProblem,
  resolveAdminPermissionProblemsForGroup,
  resolveServerProblem,
  isBotGroupAdminFromMeta,
  sendTestBossAndServerNotice,
  flushDatabaseSync,
  addActivityLog,
} from './src/moderationEngine.ts';
import {
  initStickerQueue,
  handleIncomingStickerFastPath,
  notifyStickerQueueSocketReady,
  getStickerQueueStatus,
  retryFailedStickerQueue,
  clearStickerQueueHistory,
  flushStickerQueueSync,
} from './src/stickerQueue.ts';
import {
  initCompanionBot,
  getCompanionStatus,
  startCompanionPairing,
  disconnectCompanionBot,
  refreshCompanionGroups,
  clearCompanionChatLogsAndMemory,
  exportCompanionSessionFiles,
  importCompanionSessionFiles,
} from './src/companionBot.ts';
import { getCompanionFemaleResponse } from './src/aiEngine.ts';
import {
  AUTH_SECRET_PATH,
  DATA_DIR,
  PRIMARY_SESSIONS_DIR,
  isPersistentVolumeConfigured,
} from './src/storagePaths.ts';
import {
  flushDiagnosticsSync,
  getLatestDisconnectForAccount,
  initConnectionDiagnosticsOnBoot,
  recordConnectionOpen,
  recordDisconnectEvent,
  recordGracefulServerShutdown,
} from './src/connectionDiagnostics.ts';
import {
  appendDebugLog,
  appendErrorLog,
  clearAllHistoriesNow,
  getStorageCleanupOverview,
  runCleanup,
  startCleanupScheduler,
  stopCleanupScheduler,
  updateCleanupSettings,
  type CleanupMode,
} from './src/storageCleanup.ts';
import {
  captureIncomingGroupMessages,
  enforceInboxMediaStorageLimit,
  flushInboxStoreSync,
  getInboxGroupsList,
  getInboxSettings,
  getInboxStorageStats,
  markGroupLeftInInbox,
  markInboxMessageDeleted,
  queryGroupInboxMessages,
  resolveSafeGroupAvatarFile,
  resolveSafeInboxMediaFile,
  subscribeInboxEvents,
  syncConnectedGroupsToInbox,
  toggleMessageImportant,
  updateInboxSettings,
  type InboxGroupSummary,
  type InboxMessageRecord,
} from './src/inboxStore.ts';
import {
  clearVoiceModerationHistory,
  ensureWhisperModel,
  flushVoiceModerationSync,
  getVoiceModerationOverview,
  initVoiceModeration,
  retryFailedVoiceJobsNow,
  testAudioBufferOffline,
  WHISPER_MODELS,
  type WhisperModelId,
} from './src/voiceModeration.ts';

initConnectionDiagnosticsOnBoot();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
function resolvePort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const cliPort = Number(process.argv[portArgIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  const isDevNginxProxy =
    process.env.NODE_ENV !== 'production' &&
    Boolean(process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT);
  if (!isDevNginxProxy && process.env.PORT) {
    const envPort = Number(process.env.PORT);
    if (Number.isFinite(envPort) && envPort > 0) return envPort;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const defaultPort = Number(process.env.DEFAULT_APP_PORT);
    if (Number.isFinite(defaultPort) && defaultPort > 0) return defaultPort;
  }
  return 3000;
}

const PORT = resolvePort();

// Enable CORS for all origins, supporting credentials and preflight OPTIONS
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-admin-token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '15mb' }));

// Persistent HMAC secret stored inside unified DATA_DIR
function getAuthSecret(): string {
  try {
    if (fs.existsSync(AUTH_SECRET_PATH)) {
      const s = fs.readFileSync(AUTH_SECRET_PATH, 'utf8').trim();
      if (s.length >= 32) return s;
    }
    const created = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(AUTH_SECRET_PATH), { recursive: true });
    fs.writeFileSync(AUTH_SECRET_PATH, created, 'utf8');
    return created;
  } catch {
    return 'waguard_fallback_auth_secret_key_2026';
  }
}
const AUTH_SECRET = getAuthSecret();

function signAdminToken(pin: string): string {
  const issuedAt = Date.now();
  const pinDigest = crypto.createHash('sha256').update(pin).digest('hex').slice(0, 12);
  const payload = `${issuedAt}.${pinDigest}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string | undefined, activePin: string): boolean {
  if (!token || !activePin) return false;
  const parts = String(token).trim().split('.');
  if (parts.length !== 3) return false;
  const [issuedAtStr, pinDigest, sig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 7 * 24 * 60 * 60 * 1000) return false;
  const expectedPinDigest = crypto.createHash('sha256').update(activePin).digest('hex').slice(0, 12);
  if (pinDigest !== expectedPinDigest) return false;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${issuedAtStr}.${pinDigest}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

function signMediaToken(resourceKey: string): string {
  const exp = Date.now() + 6 * 60 * 60 * 1000; // 6 hours
  const payload = `${exp}.${resourceKey}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${exp}.${sig}`;
}

function verifyMediaToken(token: string | undefined, resourceKey: string): boolean {
  if (!token || !resourceKey) return false;
  const parts = String(token).trim().split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${expStr}.${resourceKey}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

function attachSignedAvatarUrl<T extends InboxGroupSummary>(group: T): T & { avatarUrl?: string } {
  if (group.avatarStatus === 'ready') {
    const mt = signMediaToken(`avatar:${group.id}`);
    return {
      ...group,
      avatarUrl: `/api/inbox/avatar/${encodeURIComponent(group.id)}?mt=${encodeURIComponent(mt)}`,
    };
  }
  return group;
}

function attachSignedMediaUrls(msg: InboxMessageRecord): InboxMessageRecord & {
  media?: InboxMessageRecord['media'] & { mediaUrl?: string; downloadUrl?: string };
} {
  if (!msg.media || msg.media.status !== 'saved') return msg;
  const mt = signMediaToken(`media:${msg.groupId}:${msg.id}`);
  const base = `/api/inbox/media/${encodeURIComponent(msg.groupId)}/${encodeURIComponent(msg.id)}?mt=${encodeURIComponent(mt)}`;
  return {
    ...msg,
    media: {
      ...msg.media,
      mediaUrl: base,
      downloadUrl: `${base}&download=1`,
    },
  };
}

function extractRequestToken(req: Request): string {
  const headerToken = req.headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, status: 'healthy', port: PORT });
});

app.use('/api', (req: Request, res: Response, next) => {
  if (req.path === '/health' || req.path === '/auth/status' || req.path === '/auth/verify' || req.path === '/auth/lock') {
    return next();
  }
  const settings = getModerationSettings();
  if (!settings.dashboardPinEnabled || !settings.dashboardPin) {
    return next();
  }
  const token = extractRequestToken(req);
  if (verifyAdminToken(token, settings.dashboardPin)) {
    return next();
  }
  if (req.method === 'GET') {
    const mediaMatch = req.path.match(/^\/inbox\/media\/([^/]+)\/([^/]+)$/);
    if (mediaMatch) {
      const gId = decodeURIComponent(mediaMatch[1]);
      const mId = decodeURIComponent(mediaMatch[2]);
      const mt = typeof req.query.mt === 'string' ? req.query.mt : '';
      if (verifyMediaToken(mt, `media:${gId}:${mId}`)) {
        return next();
      }
    }
    const avatarMatch = req.path.match(/^\/inbox\/avatar\/([^/]+)$/);
    if (avatarMatch) {
      const gId = decodeURIComponent(avatarMatch[1]);
      const mt = typeof req.query.mt === 'string' ? req.query.mt : '';
      if (verifyMediaToken(mt, `avatar:${gId}`)) {
        return next();
      }
    }
  }
  return res.status(401).json({
    success: false,
    pinRequired: true,
    error: 'অ্যাডমিন পিন লক সক্রিয় রয়েছে। অনুগ্রহ করে সঠিক পিন দিয়ে আনলক করুন।',
  });
});

const SERVER_BOOTED_AT = Date.now();

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    status: 'healthy',
    port: PORT,
    bootedAt: SERVER_BOOTED_AT,
    features: {
      voiceModeration: true,
      autoHistoryCleanup: true,
    },
  });
});

app.get('/api/auth/status', (req: Request, res: Response) => {
  const settings = getModerationSettings();
  const pinEnabled = Boolean(settings.dashboardPinEnabled && settings.dashboardPin);
  const authenticated = !pinEnabled || verifyAdminToken(extractRequestToken(req), settings.dashboardPin);
  res.json({
    success: true,
    pinEnabled,
    authenticated,
  });
});

app.post('/api/auth/verify', (req: Request, res: Response) => {
  const settings = getModerationSettings();
  const pin = String(req.body?.pin || '').trim();
  if (!settings.dashboardPinEnabled || !settings.dashboardPin) {
    return res.json({ success: true, token: '' });
  }
  if (!pin || pin !== settings.dashboardPin) {
    return res.status(401).json({
      success: false,
      error: 'ভুল পিন কোড দিয়েছেন! সঠিক অ্যাডমিন পিন দিন।',
    });
  }
  const token = signAdminToken(settings.dashboardPin);
  return res.json({ success: true, token });
});

app.post('/api/auth/lock', (_req: Request, res: Response) => {
  res.json({ success: true });
});

app.post('/api/auth/update-pin', (req: Request, res: Response) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const newPin = typeof req.body?.newPin === 'string' ? req.body.newPin.trim() : '';
    const current = getModerationSettings();

    if (enabled && !newPin && !current.dashboardPin) {
      return res.status(400).json({
        success: false,
        error: 'পিন লক চালু করতে কমপক্ষে ৪ অক্ষরের একটি পিন/পাসওয়ার্ড দিন।',
      });
    }

    if (newPin && newPin.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'অ্যাডমিন পিন কমপক্ষে ৪ অক্ষরের হতে হবে।',
      });
    }

    const patch: any = { dashboardPinEnabled: enabled };
    if (newPin) {
      patch.dashboardPin = newPin;
    }
    const updated = updateModerationSettings(patch);
    const activePin = updated.dashboardPin || '';
    const token = enabled && activePin ? signAdminToken(activePin) : '';

    res.json({
      success: true,
      pinEnabled: Boolean(updated.dashboardPinEnabled && activePin),
      token,
      message: enabled ? 'অ্যাডমিন পিন লক চালু ও সেভ হয়েছে!' : 'অ্যাডমিন পিন লক বন্ধ করা হয়েছে।',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Persistent directory for WhatsApp session auth keys (inside unified DATA_DIR)
const SESSIONS_DIR = PRIMARY_SESSIONS_DIR;
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

interface BotState {
  status: 'disconnected' | 'connecting' | 'pairing' | 'connected';
  step: 'idle' | 'initializing' | 'waiting_for_phone' | 'connected' | 'error';
  stepMessage: string;
  lastConnectionStatus: string;
  phoneNumber: string;
  pairingCode: string;
  qrCodeDataUrl: string;
  pairingStartedAt: number;
  user: any;
  messagesChecked: number;
  warnings: number;
  blockedWords: number;
  groups: Array<{ id: string; name: string; participants: number; status: string }>;
  lastError: string | null;
}

const botState: BotState = {
  status: 'disconnected',
  step: 'idle',
  stepMessage: 'WhatsApp সংযোগের জন্য প্রস্তুত',
  lastConnectionStatus: 'Ready to connect',
  phoneNumber: '',
  pairingCode: '',
  qrCodeDataUrl: '',
  pairingStartedAt: 0,
  user: null,
  messagesChecked: 142,
  warnings: 3,
  blockedWords: 18,
  groups: [] as Array<{ id: string; name: string; participants: number; status: string }>,
  lastError: null,
};

let currentSock: WASocket | null = null;
let activeSocketToken = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isRestoringSession = false;
let pairingInFlightPromise: Promise<{ pairingCode: string; qrCode: string }> | null = null;
let pairingInFlightPhone = '';
let manualDisconnect = false;
let reconnectAttempts = 0;
let lastPairingRequestAt = 0;
const logger = pino({ level: 'silent' });

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function isVerifiedCreds(creds: any): boolean {
  return Boolean(creds?.registered || (creds?.me?.id && creds?.account));
}

function hasRegisteredCredsOnDisk(): boolean {
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return isVerifiedCreds(content);
  } catch {
    return false;
  }
}

function wipePrimarySessionsDir(reason: string) {
  try {
    console.log(`[Baileys Engine] Cleaning session directory (${reason})...`);
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch (e) {
    console.error('[Baileys Engine] Error cleaning session directory:', e);
  }
}

async function resolveLatestWaVersion(): Promise<[number, number, number]> {
  try {
    const waWeb = await fetchLatestWaWebVersion({});
    if (Array.isArray(waWeb?.version) && waWeb.version.length === 3) {
      return waWeb.version as [number, number, number];
    }
  } catch {}
  try {
    const fallback = await fetchLatestBaileysVersion();
    if (Array.isArray(fallback?.version) && fallback.version.length === 3) {
      return fallback.version as [number, number, number];
    }
  } catch {}
  return [2, 3000, 1054933766];
}

function formatPairingFailureMessage(statusCode?: number, errMsg?: string): string {
  if (statusCode === 401) {
    return 'পুরোনো অসম্পূর্ণ সেশন ছিল, অটো-রিসেট করা হয়েছে। এখন আবার "Generate Real Pairing Code" চাপুন।';
  }
  if (statusCode === 405) {
    return 'WhatsApp সার্ভার সংযোগ প্রত্যাখ্যান করেছে (405 Connection Failure)। সাধারণত ঘন ঘন কোড রিকোয়েস্ট, বর্তমান ক্লাউড সার্ভার IP-তে WhatsApp-এর সাময়িক ব্লক অথবা নম্বরটি রেস্ট্রিক্টেড হলে এটি হয় — QR কোড দিয়ে স্ক্যান করুন অথবা কিছুক্ষণ পর অন্য নম্বর/সার্ভার থেকে চেষ্টা করুন।';
  }
  if (statusCode === 403 || statusCode === 406) {
    return `WhatsApp এই অ্যাকাউন্ট/ডিভাইসে সাময়িক সীমাবদ্ধতা দিয়েছে (Code ${statusCode})। ফোনের WhatsApp অ্যাপ খুলে অ্যাকাউন্টটি ঠিক আছে কিনা দেখুন।`;
  }
  return `WhatsApp সংযোগ বিচ্ছিন্ন হয়েছে${statusCode ? ` (Code ${statusCode})` : ''}: ${errMsg || 'Connection Failure'}`;
}

function destroyCurrentSocket() {
  clearReconnectTimer();
  activeSocketToken += 1;
  if (currentSock) {
    const oldSock = currentSock;
    currentSock = null;
    try {
      oldSock.ev.removeAllListeners('connection.update');
      oldSock.ev.removeAllListeners('creds.update');
      oldSock.ev.removeAllListeners('messages.upsert');
      oldSock.ev.removeAllListeners('messages.update');
      oldSock.ev.removeAllListeners('group-participants.update');
      oldSock.ev.removeAllListeners('groups.upsert');
      oldSock.ev.removeAllListeners('groups.update');
      oldSock.ev.removeAllListeners('call');
      oldSock.ev.removeAllListeners('contacts.upsert');
      oldSock.ev.removeAllListeners('contacts.update');
      oldSock.ev.removeAllListeners('messaging-history.set');
      oldSock.end(undefined);
    } catch {
      // ignore cleanup error
    }
  }
}

function scheduleControlledReconnect(delayMs: number) {
  if (manualDisconnect) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualDisconnect && !pairingInFlightPromise) {
      initializeExistingSession().catch(() => {});
    }
  }, delayMs);
}

/**
 * Setup lifecycle listeners on a WhatsApp socket (strictly bound to socketToken)
 */
function setupSocketEvents(sock: WASocket, socketToken: number) {
  sock.ev.on('connection.update', async (update) => {
    // Ignore stale events from any previously closed/replaced socket
    if (socketToken !== activeSocketToken || sock !== currentSock) {
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        botState.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 5 });
      } catch (e) {}
    }

    if (connection === 'connecting') {
      if (botState.status !== 'pairing') {
        botState.status = 'connecting';
        botState.step = 'initializing';
        botState.stepMessage = 'WhatsApp সার্ভারের সাথে সংযোগ তৈরি হচ্ছে...';
        botState.lastConnectionStatus = 'Connecting to WhatsApp...';
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      clearReconnectTimer();
      botState.status = 'connected';
      botState.step = 'connected';
      botState.stepMessage = 'সফলভাবে WhatsApp এর সাথে কানেক্ট হয়েছে!';
      botState.lastConnectionStatus = 'Connected & Active';
      botState.user = sock.user;
      if (sock.user?.id && !botState.phoneNumber) {
        botState.phoneNumber = sock.user.id.split(':')[0].split('@')[0];
      }
      botState.lastError = null;
      botState.pairingCode = '';
      botState.qrCodeDataUrl = '';
      botState.pairingStartedAt = 0;
      recordConnectionOpen('primary', sock.user?.id);
      console.log('WhatsApp connection opened successfully for user:', sock.user?.id);
      void resolveBotIdentitySet(sock).catch(() => {});
      notifyStickerQueueSocketReady();

      setTimeout(async () => {
        if (socketToken !== activeSocketToken || sock !== currentSock) return;
        try {
          await resolveBotIdentitySet(sock).catch(() => {});
          const groups = await sock.groupFetchAllParticipating();
          primeGroupMetaCache(groups);
          notifyStickerQueueSocketReady();

          await resolveServerProblem('wa_disconnect_drop', {
            details: 'WhatsApp বট পুনরায় সফলভাবে সার্ভারের সাথে কানেক্ট হয়েছে।',
            thanksNote: 'ধন্যবাদ বস! কানেকশন ফিরে আসায় সব গ্রুপের নিরাপত্তা আবার ১০০% চালু হয়েছে।',
            sock,
          });
          await resolveServerProblem('wa_extended_outage', {
            details: 'দীর্ঘ সংযোগ বিচ্ছিন্নতার পর WhatsApp সেশন আবার পুরোপুরি অনলাইনে ফিরেছে।',
            thanksNote: 'ধন্যবাদ বস! সার্ভার সাপোর্ট ও নেটওয়ার্ক ঠিক হওয়ায় বট আবার কাজ শুরু করেছে।',
            sock,
          });
          for (const g of Object.values(groups)) {
            if (g?.id && isBotGroupAdminFromMeta(sock, g)) {
              await resolveAdminPermissionProblemsForGroup(g.id, g.subject || 'WhatsApp Group', sock);
            }
          }

          await flushPendingServerNotices(sock);
          const groupList = Object.values(groups).map((g) => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0,
            status: 'Active',
          }));
          if (groupList.length > 0) {
            botState.groups = groupList;
          }
          syncConnectedGroupsToInbox(
            sock,
            groupList.map((g) => ({
              id: g.id,
              name: g.name,
              participants: g.participants,
              isBotAdmin: isBotGroupAdminFromMeta(sock, groups[g.id]),
            }))
          ).catch(() => {});
        } catch {
          // non-blocking
        }
      }, 200);
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errMsg = lastDisconnect?.error?.message || 'Connection closed';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
      const isBannedOrForbidden = statusCode === 403 || statusCode === 405 || /banned|blocked|restricted/i.test(errMsg);
      const isRegistered = isVerifiedCreds(sock.authState?.creds) || hasRegisteredCredsOnDisk();

      if (manualDisconnect) {
        botState.status = 'disconnected';
        botState.step = 'idle';
        botState.lastConnectionStatus = 'Disconnected by user';
        return;
      }

      if (isLoggedOut) {
        console.log('Logged out or unverified 401 on WhatsApp. Cleaning up session credentials...');
        clearReconnectTimer();
        botState.status = 'disconnected';
        botState.step = 'idle';
        botState.stepMessage = pairingInFlightPromise
          ? formatPairingFailureMessage(401, errMsg)
          : 'WhatsApp সেশন লগআউট হয়েছে। পুনরায় কানেক্ট করুন।';
        botState.lastConnectionStatus = 'Logged out (401) — Re-pairing ready';
        botState.lastError = errMsg;
        botState.pairingCode = '';
        botState.qrCodeDataUrl = '';
        botState.pairingStartedAt = 0;
        botState.user = null;
        wipePrimarySessionsDir('401 logged out / invalid creds');
        recordDisconnectEvent({
          account: 'primary',
          statusCode: 401,
          errMsg,
          isPairing: Boolean(pairingInFlightPromise),
          autoReconnecting: false,
          phoneNumber: botState.phoneNumber,
        });
        return;
      }

      if (isBannedOrForbidden) {
        console.warn(`[Baileys Guard] WhatsApp returned status ${statusCode}: ${errMsg}. Stopping auto-reconnect to protect account.`);
        clearReconnectTimer();
        if (!isRegistered) {
          wipePrimarySessionsDir(`unregistered failure ${statusCode || 'restricted'}`);
        }
        botState.status = 'disconnected';
        botState.step = 'error';
        botState.stepMessage = formatPairingFailureMessage(statusCode, errMsg);
        botState.lastConnectionStatus = `Closed (${statusCode || 'Restricted'}): ${errMsg}`;
        botState.lastError = errMsg;
        botState.pairingCode = '';
        botState.pairingStartedAt = 0;
        recordDisconnectEvent({
          account: 'primary',
          statusCode: statusCode || 405,
          errMsg,
          isPairing: Boolean(pairingInFlightPromise),
          autoReconnecting: false,
          phoneNumber: botState.phoneNumber,
        });
        return;
      }

      if (isConnectionReplaced) {
        console.warn('[Baileys Guard] Connection replaced by another session (440). Pausing auto-reconnect to avoid conflict.');
        clearReconnectTimer();
        botState.status = 'disconnected';
        botState.step = 'error';
        botState.stepMessage = 'অন্য আরেকটি ডিভাইস/সার্ভারে একই সেশন চালু হওয়ায় সংযোগ বিচ্ছিন্ন হয়েছে।';
        botState.lastConnectionStatus = 'Replaced by another session (440)';
        botState.lastError = errMsg;
        recordDisconnectEvent({
          account: 'primary',
          statusCode: 440,
          errMsg,
          autoReconnecting: false,
          phoneNumber: botState.phoneNumber,
        });
        return;
      }

      // After user enters pairing code on phone, WhatsApp closes socket with 515 (restartRequired)
      if (isRestartRequired || isRegistered) {
        botState.status = 'connecting';
        botState.step = 'initializing';
        botState.stepMessage = isRestartRequired
          ? 'পেয়ারিং ভেরিফাই সম্পন্ন! চূড়ান্ত WhatsApp সংযোগ স্থাপন হচ্ছে...'
          : 'নেটওয়ার্ক পুনরুদ্ধার হচ্ছে, পুনরায় সংযোগ চেষ্টা চলছে...';
        botState.lastConnectionStatus = isRestartRequired
          ? 'Pairing verified — connecting...'
          : `Reconnecting (attempt ${reconnectAttempts + 1})...`;
        botState.lastError = null;

        if (!isRestartRequired && reconnectAttempts === 0) {
          recordDisconnectEvent({
            account: 'primary',
            statusCode,
            errMsg,
            autoReconnecting: true,
            phoneNumber: botState.phoneNumber,
          });
        }

        if (reconnectAttempts >= 40) {
          botState.status = 'disconnected';
          botState.step = 'error';
          botState.stepMessage = 'দীর্ঘ সময় নেটওয়ার্ক সংযোগ পাওয়া যায়নি। ম্যানুয়ালি পুনরায় চেষ্টা করুন।';
          botState.lastConnectionStatus = 'Reconnect paused after extended outage';
          recordDisconnectEvent({
            account: 'primary',
            statusCode: statusCode || 'TIMEOUT',
            errMsg: `${errMsg} (paused after 40 reconnect attempts)`,
            autoReconnecting: false,
            phoneNumber: botState.phoneNumber,
          });
          reportServerProblem({
            category: 'wa_extended_outage',
            title: 'WhatsApp দীর্ঘ সময় ডিসকানেক্ট ছিল',
            details: `নেটওয়ার্ক বা সার্ভার সমস্যার কারণে বট ${reconnectAttempts} বার রিকানেক্টের চেষ্টা করেছে।`,
            suggestion: 'অ্যাপের Connect পেজ থেকে সংযোগ পরীক্ষা করুন।',
          });
          return;
        }

        const delayMs = isRestartRequired
          ? 900
          : reconnectAttempts < 8
            ? Math.min(30000, 2500 * Math.pow(2, reconnectAttempts))
            : 60000;
        reconnectAttempts += 1;
        if (isRegistered && !isRestartRequired && reconnectAttempts === 3) {
          reportServerProblem({
            category: 'wa_disconnect_drop',
            title: 'WhatsApp কানেকশন সাময়িক বিচ্ছিন্ন হয়েছিল',
            details: `সার্ভার/নেটওয়ার্ক সমস্যার কারণে সংযোগ পড়ে গিয়েছিল (Code: ${statusCode || 'unknown'}, ${errMsg})।`,
            suggestion: 'বট স্বয়ংক্রিয়ভাবে রিকানেক্ট হয়েছে/চেষ্টা করছে।',
          });
        }
        console.log(`[Baileys Engine] Controlled reconnect scheduled in ${delayMs}ms (statusCode=${statusCode}, attempt=${reconnectAttempts})`);
        scheduleControlledReconnect(delayMs);
        return;
      }

      // If pairing code is still fresh (< 120s), DO NOT erase the displayed code on transient drop
      const elapsedSec = botState.pairingStartedAt > 0 ? (Date.now() - botState.pairingStartedAt) / 1000 : 999;
      if (botState.status === 'pairing' && botState.pairingCode && elapsedSec < 120) {
        botState.lastError = errMsg;
        botState.lastConnectionStatus = 'Pairing code active — waiting for phone confirmation';
        botState.stepMessage = 'কোডটি ফোনে এন্টার করুন (সেশন চলমান)...';
        return;
      }

      botState.status = 'disconnected';
      botState.step = 'idle';
      botState.stepMessage = 'সংযোগ বিচ্ছিন্ন হয়েছে। পুনরায় কোড জেনারেট করুন।';
      botState.lastConnectionStatus = `Disconnected (${errMsg})`;
      botState.lastError = errMsg;
      recordDisconnectEvent({
        account: 'primary',
        statusCode,
        errMsg,
        autoReconnecting: false,
        phoneNumber: botState.phoneNumber,
      });
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) {
      return;
    }
    try {
      await handleGroupParticipantsUpdate(sock, update);
    } catch (err: any) {
      console.error('Error in group-participants.update handler:', err?.message || err);
    }
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    updateContactNames(contacts as any[]);
  });

  sock.ev.on('contacts.update', (contacts) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    updateContactNames(contacts as any[]);
  });

  sock.ev.on('lid-mapping.update', (mapping: any) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    if (mapping?.lid && mapping?.pn) {
      rememberLidPnPair(mapping.lid, mapping.pn);
    }
  });

  sock.ev.on('groups.upsert', (groups: any[]) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    upsertCachedGroupMeta(groups);
    const items = (groups || [])
      .filter((g) => g?.id && String(g.id).endsWith('@g.us'))
      .map((g) => ({
        id: g.id,
        name: g.subject || 'WhatsApp Group',
        participants: Array.isArray(g.participants) ? g.participants.length : 0,
        isBotAdmin: isBotGroupAdminFromMeta(sock, g),
      }));
    if (items.length > 0) {
      syncConnectedGroupsToInbox(sock, items).catch(() => {});
    }
  });

  sock.ev.on('groups.update', (updates: any[]) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    upsertCachedGroupMeta(updates);
    const items = (updates || [])
      .filter((g) => g?.id && String(g.id).endsWith('@g.us') && g.subject)
      .map((g) => {
        const cached = getCachedGroupMetadataSync(g.id);
        return {
          id: g.id,
          name: g.subject,
          participants: Array.isArray(cached?.participants) ? cached.participants.length : 0,
          isBotAdmin: cached ? isBotGroupAdminFromMeta(sock, cached) : undefined,
        };
      });
    if (items.length > 0) {
      syncConnectedGroupsToInbox(sock, items).catch(() => {});
    }
  });

  sock.ev.on('messaging-history.set', (data: any) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    if (Array.isArray(data?.contacts)) updateContactNames(data.contacts);
    if (Array.isArray(data?.lidPnMappings)) {
      for (const m of data.lidPnMappings) {
        if (m?.lid && m?.pn) rememberLidPnPair(m.lid, m.pn);
      }
    }
    if (Array.isArray(data?.messages) && data.messages.length > 0) {
      captureIncomingGroupMessages(sock, data.messages, 'history_sync').catch((err: any) => {
        console.warn('[Inbox History Sync Note]:', err?.message || err);
      });
    }
  });

  sock.ev.on('call', async (calls) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) {
      return;
    }
    if (Array.isArray(calls)) {
      for (const call of calls) {
        await handleIncomingCall(sock, call).catch((err: any) => {
          console.error('Error in call handler:', err?.message || err);
        });
      }
    }
  });

  sock.ev.on('messages.update', async (updates: any[]) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    if (!Array.isArray(updates)) return;
    for (const u of updates) {
      const remoteJid = u?.key?.remoteJid;
      const messageId = u?.key?.id;
      if (!remoteJid || !messageId || !remoteJid.endsWith('@g.us')) continue;
      const stub = u?.update?.messageStubType;
      const protoType = u?.update?.message?.protocolMessage?.type;
      if (stub === 1 || stub === 68 || protoType === 0) {
        await markInboxMessageDeleted(
          remoteJid,
          messageId,
          'sender_revoke',
          'প্রেরক WhatsApp থেকে মেসেজটি মুছে দিয়েছেন (Deleted for Everyone)'
        ).catch(() => {});
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) {
      return;
    }
    if ((type === 'notify' || type === 'append') && Array.isArray(messages)) {
      // Capture every WhatsApp group message & media (text, image, video, voice, audio, sticker, document, location, contact, revoke) BEFORE fast-path filter
      captureIncomingGroupMessages(sock, messages, type === 'append' ? 'history_sync' : 'live').catch((err: any) => {
        console.warn('[Inbox Capture Note]:', err?.message || err);
      });
    }
    if (type === 'notify' && Array.isArray(messages)) {
      botState.messagesChecked += messages.length;

      // High-Priority Fast Path: synchronously detect & queue ALL group stickers in <1ms before any AI/media/DB wait
      const nonStickerMessages: any[] = [];
      for (const msg of messages) {
        try {
          if (handleIncomingStickerFastPath(sock, msg)) {
            continue;
          }
        } catch (stickerErr: any) {
          console.error('[Sticker Fast-Path Error]:', stickerErr?.message || stickerErr);
        }
        nonStickerMessages.push(msg);
      }

      if (nonStickerMessages.length > 0) {
        await Promise.allSettled(
          nonStickerMessages.map((msg) =>
            processIncomingMessage(sock, msg).catch((err: any) => {
              console.error('Error processing group message in moderation engine:', err?.message || err);
            })
          )
        );
      }
    }
  });
}

/**
 * Initialize existing registered session if available (protected by single-instance lock)
 */
async function initializeExistingSession() {
  if (isRestoringSession || manualDisconnect || pairingInFlightPromise) {
    return;
  }
  isRestoringSession = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
    if (!isVerifiedCreds(state.creds)) {
      if (state.creds?.me?.id || fs.readdirSync(SESSIONS_DIR).length > 0) {
        wipePrimarySessionsDir('half-paired unregistered startup cleanup');
      }
      return;
    }

    destroyCurrentSocket();
    const myToken = activeSocketToken;

    const version = await resolveLatestWaVersion();

    botState.status = 'connecting';
    botState.step = 'initializing';
    botState.stepMessage = 'সংরক্ষিত WhatsApp সেশন পুনঃসংযোগ হচ্ছে...';
    botState.lastConnectionStatus = 'Restoring saved session...';

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.windows('Chrome'),
      countryCode: 'BD',
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      emitOwnEvents: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 2500,
      maxMsgRetryCount: 3,
      cachedGroupMetadata: async (jid: string) => getCachedGroupMetadataSync(jid),
    });

    currentSock = sock;
    sock.ev.on('creds.update', async () => {
      if (myToken === activeSocketToken) {
        await saveCreds();
      }
    });
    setupSocketEvents(sock, myToken);
  } catch (err: any) {
    console.log('Existing session restore note:', err.message);
    botState.lastConnectionStatus = `Session restore paused: ${err.message}`;
  } finally {
    isRestoringSession = false;
  }
}

// WhatsApp session startup runs asynchronously after HTTP server binds port (see server.listen below)

/**
 * Format and validate international phone number
 */
function formatAndValidatePhone(inputPhone: string): { valid: boolean; cleanPhone: string; error?: string } {
  if (!inputPhone) {
    return { valid: false, cleanPhone: '', error: 'ফোন নম্বর প্রদান করুন (যেমন: 88017XXXXXXXX)' };
  }
  let clean = String(inputPhone).replace(/\D/g, '');
  if (clean.startsWith('00')) {
    clean = clean.slice(2);
  }
  if (clean.startsWith('1') && clean.length === 10) {
    clean = '880' + clean;
  } else if (clean.startsWith('01') && clean.length === 11) {
    clean = '88' + clean;
  }
  if (clean.length < 10 || clean.length > 15) {
    return {
      valid: false,
      cleanPhone: clean,
      error: 'আন্তর্জাতিক কান্ট্রি কোডসহ সঠিক ফোন নম্বর প্রদান করুন (যেমন: 88017XXXXXXXX, ১০-১৫ ডিজিট)',
    };
  }
  return { valid: true, cleanPhone: clean };
}

/**
 * Request real 8-digit WhatsApp pairing code directly from WhatsApp server
 * Protected against duplicate concurrent requests & rate-limit spam
 */
async function startRealPairingFlow(cleanPhone: string): Promise<{ pairingCode: string; qrCode: string }> {
  if (pairingInFlightPromise && pairingInFlightPhone === cleanPhone) {
    console.log(`[Baileys Engine] Reusing in-flight pairing promise for ${cleanPhone}`);
    return pairingInFlightPromise;
  }

  // Server-side anti-ban guard: prevent spamming WhatsApp requestPairingCode within 30s
  const msSinceLastReq = Date.now() - lastPairingRequestAt;
  if (lastPairingRequestAt > 0 && msSinceLastReq < 30000) {
    const waitSec = Math.ceil((30000 - msSinceLastReq) / 1000);
    if (botState.pairingCode && botState.phoneNumber === cleanPhone) {
      return { pairingCode: botState.pairingCode, qrCode: botState.qrCodeDataUrl };
    }
    throw new Error(`WhatsApp নিরাপত্তা সীমার জন্য ${waitSec} সেকেন্ড অপেক্ষা করে আবার চেষ্টা করুন।`);
  }

  pairingInFlightPhone = cleanPhone;
  pairingInFlightPromise = (async () => {
    try {
      manualDisconnect = false;
      reconnectAttempts = 0;
      lastPairingRequestAt = Date.now();
      console.log(`[Baileys Engine] Starting real pairing flow for phone: ${cleanPhone}...`);

      // Always cleanly destroy any previous unauthenticated/old socket first (prevents multi-socket conflicts)
      destroyCurrentSocket();
      const myToken = activeSocketToken;

      // Always start pairing from clean unregistered keys so half-paired creds.me never triggers login 401/405
      wipePrimarySessionsDir('fresh pairing request');

      const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
      const version = await resolveLatestWaVersion();

      console.log(`[Baileys Engine] Initializing WASocket with version ${version.join('.')}...`);

      botState.status = 'connecting';
      botState.step = 'initializing';
      botState.stepMessage = 'WhatsApp সার্ভারের সাথে সংযোগ ও হ্যান্ডশেক হচ্ছে...';
      botState.lastConnectionStatus = 'Connecting to WhatsApp server...';
      botState.phoneNumber = cleanPhone;
      botState.lastError = null;

      const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.windows('Chrome'),
        countryCode: cleanPhone.startsWith('880') ? 'BD' : 'US',
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        emitOwnEvents: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2500,
        maxMsgRetryCount: 3,
        cachedGroupMetadata: async (jid: string) => getCachedGroupMetadataSync(jid),
      });

      currentSock = sock;
      sock.ev.on('creds.update', async () => {
        if (myToken === activeSocketToken) {
          await saveCreds();
        }
      });
      setupSocketEvents(sock, myToken);

      return await new Promise<{ pairingCode: string; qrCode: string }>((resolve, reject) => {
        let resolved = false;

        // Timeout of 35 seconds for Noise handshake and pairing code request
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            sock.ev.off('connection.update', onUpdate);
            botState.step = 'error';
            botState.stepMessage = 'WhatsApp সার্ভার রেসপন্স টাইমআউট হয়েছে। পুনরায় চেষ্টা করুন।';
            botState.lastConnectionStatus = 'Handshake timeout';
            console.error(`[Baileys Engine] Timeout generating pairing code for ${cleanPhone}`);
            reject(new Error('WhatsApp server handshake timeout. Please check number and try again.'));
          }
        }, 35000);

        const onUpdate = async (update: any) => {
          if (resolved || myToken !== activeSocketToken || sock !== currentSock) return;

          if (update.qr) {
            resolved = true;
            clearTimeout(timer);
            sock.ev.off('connection.update', onUpdate);

            try {
              // Small human-like pause after Noise handshake before requesting pairing code
              await new Promise((r) => setTimeout(r, 600));
              if (myToken !== activeSocketToken || sock !== currentSock) {
                return reject(new Error('Socket superseded before pairing request'));
              }

              console.log(`[Baileys Engine] Noise handshake successful. Requesting pairing code for ${cleanPhone}...`);
              const rawCode = await sock.requestPairingCode(cleanPhone);
              console.log(`[Baileys Engine] SUCCESS! Real WhatsApp pairing code generated: ${rawCode}`);

              const formattedCode =
                rawCode.length === 8 && !rawCode.includes('-')
                  ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
                  : rawCode;

              const qrUrl = await QRCode.toDataURL(update.qr, { margin: 2, scale: 5 }).catch(() => '');

              botState.status = 'pairing';
              botState.step = 'waiting_for_phone';
              botState.stepMessage = 'রিয়েল কোড প্রস্তুত! আপনার ফোনের WhatsApp থেকে কোডটি এন্টার করুন।';
              botState.lastConnectionStatus = 'Pairing code active — waiting for confirmation';
              botState.pairingCode = formattedCode;
              botState.qrCodeDataUrl = qrUrl;
              botState.pairingStartedAt = Date.now();
              botState.lastError = null;

              resolve({ pairingCode: formattedCode, qrCode: qrUrl });
            } catch (err: any) {
              console.error('[Baileys Engine] requestPairingCode failed:', err.message);
              botState.step = 'error';
              botState.stepMessage = `কোড জেনারেট ত্রুটি: ${err.message || 'WhatsApp error'}`;
              botState.lastConnectionStatus = `Error: ${err.message || 'Pairing failed'}`;
              reject(err);
            }
          } else if (update.connection === 'close') {
            const err = update.lastDisconnect?.error as any;
            if (err && !resolved) {
              resolved = true;
              clearTimeout(timer);
              sock.ev.off('connection.update', onUpdate);
              const statusCode = err?.output?.statusCode;
              const reason = err?.data?.reason || statusCode;
              const friendly = formatPairingFailureMessage(statusCode, err?.message);
              console.error('[Baileys Engine] Connection closed during pairing:', {
                statusCode,
                reason,
                message: err?.message || 'Closed',
                data: err?.data,
              });
              wipePrimarySessionsDir(`pairing close (${statusCode || 'unknown'})`);
              if (statusCode !== 403 && statusCode !== 429) {
                lastPairingRequestAt = 0;
              }
              botState.status = 'disconnected';
              botState.step = 'error';
              botState.stepMessage = friendly;
              botState.lastConnectionStatus = `Closed (${statusCode || 'Err'}): ${err?.message || 'Connection Failure'}`;
              botState.lastError = friendly;
              recordDisconnectEvent({
                account: 'primary',
                statusCode,
                errMsg: err?.message || 'Pairing Connection Failure',
                isPairing: true,
                autoReconnecting: false,
                phoneNumber: cleanPhone,
              });
              reject(new Error(friendly));
            }
          }
        };

        sock.ev.on('connection.update', onUpdate);
      });
    } finally {
      pairingInFlightPromise = null;
      pairingInFlightPhone = '';
    }
  })();

  return pairingInFlightPromise;
}

// API Routes

// 1. WhatsApp 8-digit Pairing Code Endpoint
app.post('/api/whatsapp/pair', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, forceNew } = req.body;
    console.log('[API /api/whatsapp/pair] Received request for phone:', phoneNumber);

    const validation = formatAndValidatePhone(phoneNumber);
    if (!validation.valid) {
      console.warn('[API /api/whatsapp/pair] Validation failed:', validation.error);
      return res.status(400).json({ success: false, error: validation.error });
    }

    const cleanPhone = validation.cleanPhone;

    // If already connected
    if (currentSock?.authState?.creds?.registered && botState.status === 'connected') {
      return res.json({
        success: true,
        alreadyConnected: true,
        message: 'WhatsApp is already connected and active!',
        user: botState.user,
      });
    }

    // Prevent duplicate requests within 120 seconds if active pairing code already exists for same number
    const elapsedSec = botState.pairingStartedAt > 0 ? (Date.now() - botState.pairingStartedAt) / 1000 : 999;
    if (
      botState.status === 'pairing' &&
      botState.phoneNumber === cleanPhone &&
      botState.pairingCode &&
      elapsedSec < 120 &&
      (!forceNew || elapsedSec < 30)
    ) {
      console.log(`[API /api/whatsapp/pair] Returning existing active pairing code for ${cleanPhone}`);
      return res.json({
        success: true,
        phoneNumber: cleanPhone,
        pairingCode: botState.pairingCode,
        qrCode: botState.qrCodeDataUrl,
        alreadyPairing: true,
        instructions: [
          '১. আপনার ফোনের WhatsApp অ্যাপ ওপেন করুন',
          '২. উপরে ৩ ডট মেনু > Linked Devices এ যান',
          '৩. "Link a Device" বাটনে চাপুন',
          '৪. নিচে "Link with phone number instead" চাপুন',
          `৫. এই ৮-ডিজিটের অফিশিয়াল কোডটি লিখুন: ${botState.pairingCode}`,
        ],
      });
    }

    const result = await startRealPairingFlow(cleanPhone);

    return res.json({
      success: true,
      phoneNumber: cleanPhone,
      pairingCode: result.pairingCode,
      qrCode: result.qrCode,
      instructions: [
        '১. আপনার ফোনের WhatsApp অ্যাপ ওপেন করুন',
        '২. উপরে ৩ ডট মেনু > Linked Devices এ যান',
        '৩. "Link a Device" বাটনে চাপুন',
        '৪. নিচে "Link with phone number instead" চাপুন',
        `৫. এই ৮-ডিজিটের অফিশিয়াল কোডটি লিখুন: ${result.pairingCode}`,
      ],
    });
  } catch (err: any) {
    console.error('[API /api/whatsapp/pair] Error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate genuine WhatsApp pairing code from server',
    });
  }
});

// 2. Real-time Live Status Endpoint (for instant frontend synchronization)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, status: botState.status, online: botState.status === 'connected', uptimeSec: Math.round(process.uptime()) });
});

app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const elapsed = botState.pairingStartedAt > 0 ? Math.floor((Date.now() - botState.pairingStartedAt) / 1000) : 0;
  const remainingSeconds = botState.pairingStartedAt > 0 ? Math.max(0, 120 - elapsed) : 0;

  res.json({
    status: botState.status,
    step: botState.step,
    stepMessage: botState.stepMessage,
    lastConnectionStatus: botState.lastConnectionStatus,
    online: botState.status === 'connected',
    phoneNumber: botState.phoneNumber,
    pairingCode: botState.pairingCode,
    qrCode: botState.qrCodeDataUrl,
    remainingSeconds,
    user: botState.user,
    lastError: botState.lastError,
    reconnectAttempts,
    latestDisconnect: getLatestDisconnectForAccount('primary'),
  });
});

// 3. Dashboard Status Endpoint
app.get('/api/dashboard', (req: Request, res: Response) => {
  const modStats = getModerationStats();
  const modSettings = getModerationSettings();

  res.json({
    connection: {
      status: botState.status,
      online: botState.status === 'connected',
      pairing: botState.status === 'pairing',
      phoneNumber: botState.phoneNumber,
      pairingCode: botState.pairingCode,
      user: botState.user,
      lastError: botState.lastError,
      step: botState.step,
      stepMessage: botState.stepMessage,
      lastConnectionStatus: botState.lastConnectionStatus,
      reconnectAttempts,
      latestDisconnect: getLatestDisconnectForAccount('primary'),
    },
    overview: {
      messagesChecked: modStats.messagesChecked || botState.messagesChecked,
      warnings: modStats.warningsGiven || botState.warnings,
      blockedWords: modStats.deletedMessages || botState.blockedWords,
      groups: botState.groups.length,
      kickedMembers: modStats.kickedMembers,
      groupLocksTriggered: modStats.groupLocksTriggered,
    },
    moderation: {
      settings: {
        ...modSettings,
        dashboardPin: modSettings.dashboardPin ? '****' : '',
        aiKeys: (modSettings.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) }))
      },
      stats: modStats,
      restrictedUsers: getActiveRestrictedUsers(),
    },
    storageInfo: {
      dataDir: DATA_DIR,
      persistentVolumeDetected: isPersistentVolumeConfigured(),
    },
  });
});

// Moderation Settings Endpoints
app.get('/api/moderation/settings', (req: Request, res: Response) => {
  const settings = getModerationSettings();
  if (settings.aiKeys) {
    settings.aiKeys = settings.aiKeys.map(k => ({ ...k, key: maskAiKey(k.key) }));
  }
  // Mask sensitive keys & PIN
  if (settings.geminiApiKey) settings.geminiApiKey = maskAiKey(settings.geminiApiKey);
  if (settings.groqApiKey) settings.groqApiKey = maskAiKey(settings.groqApiKey);
  if (settings.openrouterApiKey) settings.openrouterApiKey = maskAiKey(settings.openrouterApiKey);
  if (settings.dashboardPin) settings.dashboardPin = '****';

  res.json({ success: true, settings });
});

app.post('/api/moderation/settings', (req: Request, res: Response) => {
  try {
    const updated = updateModerationSettings(req.body);
    const safeCopy = {
      ...updated,
      dashboardPin: updated.dashboardPin ? '****' : '',
      aiKeys: (updated.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) })),
      geminiApiKey: updated.geminiApiKey ? maskAiKey(updated.geminiApiKey) : '',
      groqApiKey: updated.groqApiKey ? maskAiKey(updated.groqApiKey) : '',
      openrouterApiKey: updated.openrouterApiKey ? maskAiKey(updated.openrouterApiKey) : '',
    };
    res.json({ success: true, settings: safeCopy, message: 'Settings saved and active in real-time' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/moderation/test-boss-alert', async (_req: Request, res: Response) => {
  try {
    const result = await sendTestBossAndServerNotice(currentSock);
    if (!result.bossSent) {
      return res.status(400).json({
        success: false,
        error: 'বটের WhatsApp অ্যাকাউন্ট বর্তমানে কানেক্টেড নয়। কানেক্ট করে আবার চেষ্টা করুন।',
        targetJid: result.targetJid,
      });
    }
    res.json({
      success: true,
      targetJid: result.targetJid,
      message: `বস অ্যাডমিন (+${result.targetJid.split('@')[0]})-এর ইনবক্সে টেস্ট মেসেজ পাঠানো হয়েছে!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Test failed' });
  }
});

// Individual Temporary Mute (Restricted Users) Endpoints
app.get('/api/moderation/restricted-users', (req: Request, res: Response) => {
  res.json({ success: true, restrictedUsers: getActiveRestrictedUsers() });
});

app.post('/api/moderation/unmute', (req: Request, res: Response) => {
  try {
    const { groupId, senderJid } = req.body;
    if (!groupId || !senderJid) {
      return res.status(400).json({ success: false, error: 'groupId and senderJid are required' });
    }
    const unmuted = unrestrictUser(groupId, senderJid);
    res.json({
      success: true,
      unmuted,
      message: unmuted ? 'সদস্যের রেস্ট্রিকশন তুলে দেওয়া হয়েছে (Unmuted successfully)' : 'সদস্য রেস্ট্রিকশন তালিকায় পাওয়া যায়নি বা ইতিমধ্যে মেয়াদ শেষ হয়েছে',
      restrictedUsers: getActiveRestrictedUsers(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Group Member Directory & Anonymous 10-Min Manual Block Endpoints
app.get('/api/moderation/group-members', async (req: Request, res: Response) => {
  try {
    const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
    const data = await getGroupMembersForBlockPage(currentSock, groupId);
    res.json({
      success: true,
      defaultNotice: DEFAULT_MANUAL_MEMBER_BLOCK_NOTICE,
      ...data,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/moderation/member-block', async (req: Request, res: Response) => {
  try {
    const { groupId, memberJid, altJid, memberPhone, durationMinutes, customNotice } = req.body || {};
    const result = await manualBlockMember(currentSock, {
      groupId: String(groupId || ''),
      memberJid: String(memberJid || ''),
      altJid: altJid ? String(altJid) : undefined,
      memberPhone: memberPhone ? String(memberPhone) : undefined,
      durationMinutes: Number(durationMinutes || 10),
      customNotice: typeof customNotice === 'string' ? customNotice : undefined,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'ব্লক করা যায়নি।' });
    }
    res.json({
      success: true,
      noticeSent: result.noticeSent,
      restriction: result.restriction,
      restrictedUsers: getActiveRestrictedUsers(),
      message: result.noticeSent
        ? 'সদস্যকে ১০ মিনিটের জন্য ব্লক করা হয়েছে এবং আলাদা নোটিশ পাঠানো হয়েছে!'
        : 'সদস্যকে ১০ মিনিটের জন্য ব্লক করা হয়েছে!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Moderation Logs & High-Priority Sticker Queue Endpoints
app.get('/api/moderation/sticker-queue', (_req: Request, res: Response) => {
  res.json({ success: true, ...getStickerQueueStatus() });
});

app.post('/api/moderation/sticker-queue/retry-failed', (_req: Request, res: Response) => {
  try {
    const result = retryFailedStickerQueue();
    res.json({
      success: true,
      ...result,
      queue: getStickerQueueStatus(),
      message:
        result.requeuedCount > 0
          ? `${result.requeuedCount}টি ব্যর্থ স্টিকার পুনরায় High-Priority Queue-তে যুক্ত হয়েছে!`
          : 'পুনরায় চেষ্টা করার মতো কোনো ব্যর্থ স্টিকার নেই।',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/moderation/sticker-queue/clear-history', (_req: Request, res: Response) => {
  try {
    clearStickerQueueHistory();
    res.json({ success: true, queue: getStickerQueueStatus(), message: 'স্টিকার কিউ হিস্ট্রি পরিষ্কার করা হয়েছে।' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/moderation/logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  res.json({ success: true, logs: getActivityLogs(limit) });
});

const resolveKnownGroupName = (groupId: string, currentName?: string): string => {
  if (currentName && currentName !== 'Protected Group') return currentName;
  const found = botState.groups.find((g) => g.id === groupId);
  return found?.name || currentName || 'Protected Group';
};

// Active User Warnings & Single Reset Endpoints
app.get('/api/moderation/warnings', (req: Request, res: Response) => {
  const warnings = getActiveWarnings().map((w) => ({
    ...w,
    groupName: resolveKnownGroupName(w.groupId, w.groupName),
  }));
  res.json({ success: true, warnings });
});

app.post('/api/moderation/reset-warning', (req: Request, res: Response) => {
  try {
    const key = String(req.body?.key || '').trim();
    if (!key) {
      return res.status(400).json({ success: false, error: 'warning key is required' });
    }
    const removed = resetSingleWarning(key);
    const warnings = getActiveWarnings().map((w) => ({
      ...w,
      groupName: resolveKnownGroupName(w.groupId, w.groupName),
    }));
    res.json({
      success: true,
      removed,
      warnings,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Active 10-Min Group Locks & Manual Unlock Endpoints
app.get('/api/moderation/group-locks', (req: Request, res: Response) => {
  const groupLocks = getActiveGroupLocks().map((g) => ({
    ...g,
    groupName: resolveKnownGroupName(g.groupId, g.groupName),
  }));
  res.json({ success: true, groupLocks });
});

app.post('/api/moderation/unlock-group', async (req: Request, res: Response) => {
  try {
    const groupId = String(req.body?.groupId || '').trim();
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId is required' });
    }
    const unlocked = await unlockGroupManually(currentSock, groupId);
    const groupLocks = getActiveGroupLocks().map((g) => ({
      ...g,
      groupName: resolveKnownGroupName(g.groupId, g.groupName),
    }));
    res.json({
      success: true,
      unlocked,
      groupLocks,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset User Warnings Endpoint
app.post('/api/moderation/reset-warnings', (req: Request, res: Response) => {
  try {
    resetAllWarnings();
    res.json({ success: true, message: 'All user warnings reset successfully', warnings: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Logs Endpoint
app.post('/api/moderation/clear-logs', (req: Request, res: Response) => {
  try {
    clearActivityLogs();
    res.json({ success: true, message: 'Activity logs cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Groups List Endpoint
app.get('/api/groups', async (req: Request, res: Response) => {
  if (currentSock && botState.status === 'connected') {
    try {
      const groups = await currentSock.groupFetchAllParticipating();
      primeGroupMetaCache(groups);
      const list = Object.values(groups).map((g) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length || 0,
        status: 'Active',
      }));
      botState.groups = list;
      await syncConnectedGroupsToInbox(
        currentSock,
        list.map((g) => ({
          id: g.id,
          name: g.name,
          participants: g.participants,
          isBotAdmin: isBotGroupAdminFromMeta(currentSock, groups[g.id]),
        }))
      ).catch(() => {});
    } catch (e) {}
  }
  const inboxGroups = getInboxGroupsList();
  const inboxMap = new Map(inboxGroups.map((ig) => [ig.id, attachSignedAvatarUrl(ig)]));
  const enriched = botState.groups.map((g) => ({
    ...g,
    ...(inboxMap.get(g.id) || {}),
  }));
  res.json({ groups: enriched, inboxGroups: inboxGroups.map(attachSignedAvatarUrl) });
});

// 4b. Leave Any Connected WhatsApp Group from Server
app.post('/api/groups/leave', async (req: Request, res: Response) => {
  try {
    const groupId = String(req.body?.groupId || '').trim();
    if (!groupId || !/^[0-9A-Za-z._-]+@g\.us$/.test(groupId)) {
      return res.status(400).json({
        success: false,
        error: 'সঠিক গ্রুপ আইডি (@g.us) পাওয়া যায়নি।',
      });
    }

    if (!currentSock || botState.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'বটের WhatsApp বর্তমানে কানেক্টেড নয়! আগে কানেক্ট করে চেষ্টা করুন।',
      });
    }

    const groupName = resolveKnownGroupName(
      groupId,
      getCachedGroupMetadataSync(groupId)?.subject || botState.groups.find((g) => g.id === groupId)?.name
    );

    await currentSock.groupLeave(groupId);
    botState.groups = botState.groups.filter((g) => g.id !== groupId);
    markGroupLeftInInbox(groupId);
    await resolveAdminPermissionProblemsForGroup(groupId, groupName, currentSock).catch(() => {});

    try {
      const freshGroups = await currentSock.groupFetchAllParticipating();
      botState.groups = Object.values(freshGroups).map((g) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length || 0,
        status: 'Active',
      }));
    } catch {}

    addActivityLog({
      groupId,
      groupName,
      senderJid: currentSock.user?.id || 'BOT',
      senderPhone: currentSock.user?.id?.split(':')[0]?.split('@')[0] || 'BOT',
      action: 'unlocked',
      reason: 'অ্যাডমিন প্যানেল থেকে সার্ভার বট গ্রুপ লিভ নিয়েছে',
      details: `${groupName} (${groupId})`,
    });
    appendDebugLog('GROUP_LEAVE', `Bot left group ${groupName} (${groupId}) via Admin Panel`);

    res.json({
      success: true,
      leftGroupId: groupId,
      leftGroupName: groupName,
      groups: botState.groups,
      message: `"${groupName}" গ্রুপ থেকে বট সফলভাবে লিভ নিয়েছে!`,
    });
  } catch (err: any) {
    appendErrorLog('GROUP_LEAVE_FAILED', err?.message || String(err));
    res.status(500).json({
      success: false,
      error: err?.message || 'গ্রুপ থেকে লিভ নেওয়া যায়নি! অনুগ্রহ করে আবার চেষ্টা করুন।',
    });
  }
});

// 5. Disconnect / Reset Session Endpoint
app.post('/api/whatsapp/disconnect', async (req: Request, res: Response) => {
  try {
    manualDisconnect = true;
    clearReconnectTimer();
    reconnectAttempts = 0;
    lastPairingRequestAt = 0;
    if (currentSock) {
      const sockToLogout = currentSock;
      try {
        await sockToLogout.logout().catch(() => {});
      } catch {}
      destroyCurrentSocket();
    }
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    botState.status = 'disconnected';
    botState.step = 'idle';
    botState.stepMessage = 'সেশন ডিসকানেক্ট ও ক্লিয়ার করা হয়েছে';
    botState.lastConnectionStatus = 'Disconnected by user';
    botState.pairingCode = '';
    botState.qrCodeDataUrl = '';
    botState.pairingStartedAt = 0;
    botState.phoneNumber = '';
    botState.user = null;
    botState.lastError = null;
    recordDisconnectEvent({
      account: 'primary',
      manual: true,
      errMsg: 'Disconnected manually by user',
      autoReconnecting: false,
    });
    res.json({ success: true, message: 'Session disconnected and cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. Encrypted Full State Backup Export (Primary WhatsApp + Companion Account + All ON/OFF Settings)
app.post('/api/whatsapp/session-export', async (req: Request, res: Response) => {
  try {
    const passphrase = String(req.body?.passphrase || '').trim();
    if (passphrase.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'সেশন ও সেটিংস সুরক্ষার জন্য কমপক্ষে ৪ অক্ষরের একটি পাসওয়ার্ড/পিন দিন।',
      });
    }

    const files: Record<string, string> = {};
    if (hasRegisteredCredsOnDisk()) {
      for (const entry of fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
        if (entry.isFile()) {
          const fullPath = path.join(SESSIONS_DIR, entry.name);
          files[entry.name] = fs.readFileSync(fullPath).toString('base64');
        }
      }
    }

    const companionFiles = exportCompanionSessionFiles();
    const moderationSettings = getModerationSettings();

    const payload = JSON.stringify({
      exportedAt: Date.now(),
      phoneNumber: botState.phoneNumber || '',
      files,
      companionFiles,
      moderationSettings,
    });

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const hasPrimarySession = Boolean(files['creds.json']);
    const hasCompanionSession = Boolean(companionFiles['creds.json']);

    res.json({
      success: true,
      filename: `waguard-full-backup-${botState.phoneNumber || 'settings'}.json`,
      bundle: {
        v: 2,
        alg: 'aes-256-gcm',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      },
      hasPrimarySession,
      hasCompanionSession,
      includesSettings: true,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5c. Encrypted Full State Backup Import (Supports v1 session-only & v2 full state: Primary + Companion + All Settings)
app.post('/api/whatsapp/session-import', async (req: Request, res: Response) => {
  try {
    const passphrase = String(req.body?.passphrase || '').trim();
    const bundle = req.body?.bundle;

    if (passphrase.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'ব্যাকআপ আনলক করতে কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড/পিন দিন।',
      });
    }

    if (
      !bundle ||
      (bundle.v !== 1 && bundle.v !== 2) ||
      bundle.alg !== 'aes-256-gcm' ||
      !bundle.salt ||
      !bundle.iv ||
      !bundle.tag ||
      !bundle.data
    ) {
      return res.status(400).json({
        success: false,
        error: 'ব্যাকআপ ফাইলের ফরম্যাট সঠিক নয়।',
      });
    }

    let decryptedText = '';
    try {
      const salt = Buffer.from(bundle.salt, 'base64');
      const iv = Buffer.from(bundle.iv, 'base64');
      const tag = Buffer.from(bundle.tag, 'base64');
      const encrypted = Buffer.from(bundle.data, 'base64');
      const key = crypto.scryptSync(passphrase, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      decryptedText = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return res.status(400).json({
        success: false,
        error: 'পাসওয়ার্ড ভুল হয়েছে অথবা ব্যাকআপ ফাইল নষ্ট হয়ে গেছে।',
      });
    }

    const parsed = JSON.parse(decryptedText);
    const files = parsed?.files;
    const companionFiles = parsed?.companionFiles;
    const incomingSettings = parsed?.moderationSettings;

    let restoredSettingsPayload: any = null;
    if (incomingSettings && typeof incomingSettings === 'object') {
      const updated = updateModerationSettings(incomingSettings);
      restoredSettingsPayload = {
        ...updated,
        dashboardPin: updated.dashboardPin ? '****' : '',
        aiKeys: (updated.aiKeys || []).map((k) => ({ ...k, key: maskAiKey(k.key) })),
        geminiApiKey: updated.geminiApiKey ? maskAiKey(updated.geminiApiKey) : '',
        groqApiKey: updated.groqApiKey ? maskAiKey(updated.groqApiKey) : '',
        openrouterApiKey: updated.openrouterApiKey ? maskAiKey(updated.openrouterApiKey) : '',
      };
    }

    let restoredPrimary = false;
    if (files && typeof files === 'object' && files['creds.json']) {
      const credsRaw = Buffer.from(String(files['creds.json']), 'base64').toString('utf8');
      const credsObj = JSON.parse(credsRaw);
      if (!isVerifiedCreds(credsObj)) {
        if (bundle.v === 1) {
          return res.status(400).json({
            success: false,
            error: 'এই ব্যাকআপের WhatsApp সেশনটি পূর্ণ নিবন্ধিত নয়।',
          });
        }
      } else {
        clearReconnectTimer();
        manualDisconnect = false;
        reconnectAttempts = 0;
        destroyCurrentSocket();

        fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });

        for (const [rawName, b64] of Object.entries(files)) {
          const safeName = path.basename(rawName);
          if (!safeName || safeName === '.' || safeName === '..') continue;
          fs.writeFileSync(path.join(SESSIONS_DIR, safeName), Buffer.from(String(b64), 'base64'));
        }

        botState.phoneNumber = parsed.phoneNumber || '';
        botState.pairingCode = '';
        botState.qrCodeDataUrl = '';
        botState.pairingStartedAt = 0;
        botState.lastError = null;
        botState.status = 'connecting';
        botState.step = 'initializing';
        botState.stepMessage = 'ব্যাকআপ সেশন রিস্টোর সম্পন্ন! সরাসরি WhatsApp-এ সংযোগ হচ্ছে...';
        botState.lastConnectionStatus = 'Restoring transferred session...';

        initializeExistingSession().catch((err) => {
          console.error('[Session Import] Restore connect error:', err?.message || err);
        });
        restoredPrimary = true;
      }
    } else if (bundle.v === 1) {
      return res.status(400).json({
        success: false,
        error: 'ব্যাকআপে বৈধ WhatsApp creds.json পাওয়া যায়নি।',
      });
    }

    let restoredCompanion = false;
    if (companionFiles && typeof companionFiles === 'object' && companionFiles['creds.json']) {
      restoredCompanion = await importCompanionSessionFiles(companionFiles);
    }

    if (!restoredPrimary && !restoredCompanion && !restoredSettingsPayload) {
      return res.status(400).json({
        success: false,
        error: 'ব্যাকআপ ফাইলে রিস্টোর করার মতো কোনো বৈধ সেশন বা সেটিংস পাওয়া যায়নি।',
      });
    }

    res.json({
      success: true,
      phoneNumber: botState.phoneNumber,
      restoredPrimary,
      restoredCompanion,
      restoredSettings: Boolean(restoredSettingsPayload),
      settings: restoredSettingsPayload,
      message: restoredPrimary
        ? 'WhatsApp সেশন ও সব সেটিংস সফলভাবে রিস্টোর হয়েছে! নতুন কোড ছাড়াই সংযোগ চালু হচ্ছে।'
        : 'সব ON/OFF সেটিংস সফলভাবে রিস্টোর হয়েছে!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 2: Night Mode Status & Manual Trigger
app.get('/api/moderation/night-mode', (_req: Request, res: Response) => {
  res.json({ success: true, status: getNightModeStatus() });
});

app.post('/api/moderation/night-mode/toggle-now', async (req: Request, res: Response) => {
  try {
    const lock = Boolean(req.body?.lock);
    const result = await applyNightModeManually(currentSock, lock);
    res.json({
      success: true,
      affected: result.affected,
      status: getNightModeStatus(),
      message: lock
        ? `${result.affected}টি গ্রুপে নাইট লক চালু করা হয়েছে!`
        : `${result.affected}টি গ্রুপ নাইট লক থেকে আনলক করা হয়েছে!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 3: Anti-Call Logs & Reset
app.get('/api/moderation/calls', (_req: Request, res: Response) => {
  res.json({ success: true, calls: getCallLogs(60) });
});

app.post('/api/moderation/calls/clear', (_req: Request, res: Response) => {
  clearCallLogs();
  resetCallCounts();
  res.json({ success: true, calls: [], message: 'কল লগ ও কাউন্টার ক্লিয়ার করা হয়েছে।' });
});

// Feature 5: Member Activity Rank & Ghost/Inactive List
app.get('/api/moderation/activity-rank', (req: Request, res: Response) => {
  const groupId = req.query.groupId ? String(req.query.groupId) : 'all';
  const ghostDays = req.query.ghostDays ? Math.max(1, parseInt(String(req.query.ghostDays), 10) || 7) : 7;
  const report = getMemberActivityReport(groupId, ghostDays);
  report.groups = report.groups.map((g) => ({
    ...g,
    name: resolveKnownGroupName(g.id, g.name),
  }));
  res.json({ success: true, ...report });
});

app.post('/api/moderation/activity-rank/reset', (req: Request, res: Response) => {
  const groupId = req.body?.groupId ? String(req.body.groupId) : 'all';
  resetMemberActivity(groupId);
  res.json({ success: true, ...getMemberActivityReport('all', 7) });
});

// Feature 6: Keyword Auto-Responder CRUD
app.get('/api/moderation/keywords', (_req: Request, res: Response) => {
  res.json({ success: true, keywords: getKeywordTriggers() });
});

app.post('/api/moderation/keywords/add', (req: Request, res: Response) => {
  const keyword = String(req.body?.keyword || '').trim();
  const reply = String(req.body?.reply || '').trim();
  const matchType = req.body?.matchType === 'exact' ? 'exact' : 'contains';
  if (!keyword || !reply) {
    return res.status(400).json({ success: false, error: 'কীওয়ার্ড এবং উত্তর দুটিই লিখুন।' });
  }
  const keywords = addKeywordTrigger(keyword, reply, matchType);
  res.json({ success: true, keywords });
});

app.post('/api/moderation/keywords/toggle', (req: Request, res: Response) => {
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });
  const keywords = toggleKeywordTrigger(id);
  res.json({ success: true, keywords });
});

app.post('/api/moderation/keywords/remove', (req: Request, res: Response) => {
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });
  const keywords = removeKeywordTrigger(id);
  res.json({ success: true, keywords });
});

// 6. Test AI Endpoint
app.post('/api/ai/test', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AI Moderation Engine is active and ready (Gemini Flash Multimodal supported).',
  });
});

// 7. AI Key Management & Masking
const maskAiKey = (key: string) => {
  if (!key) return '';
  if (key.length <= 10) return '****';
  return key.substring(0, 6) + '...' + key.substring(key.length - 4);
};

app.get('/api/moderation/ai-keys', (req: Request, res: Response) => {
  const settings = getModerationSettings();
  const maskedKeys = (settings.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) }));
  res.json({ success: true, keys: maskedKeys });
});

app.post('/api/moderation/ai-keys/add', (req: Request, res: Response) => {
  const { key, provider, label } = req.body;
  if (!key || !provider) return res.status(400).json({ error: 'Key and provider are required' });

  const settings = getModerationSettings();
  const keys = settings.aiKeys || [];
  
  const newKey = {
    id: 'key_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    key,
    provider,
    label: label || `${provider} Key ${keys.length + 1}`,
    status: 'active' as const,
    cooldownUntil: 0,
    lastUsed: 0,
    totalRequests: 0,
    failureCount: 0
  };

  const updatedSettings = updateModerationSettings({ aiKeys: [...keys, newKey] });
  const maskedKeys = (updatedSettings.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) }));
  res.json({ success: true, key: { ...newKey, key: maskAiKey(newKey.key) }, keys: maskedKeys });
});

app.post('/api/moderation/ai-keys/remove', (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Key ID is required' });

  const settings = getModerationSettings();
  const keys = (settings.aiKeys || []).filter(k => k.id !== id);
  const updatedSettings = updateModerationSettings({ aiKeys: keys });
  const maskedKeys = (updatedSettings.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) }));
  res.json({ success: true, keys: maskedKeys });
});

app.post('/api/moderation/ai-keys/reset', (req: Request, res: Response) => {
  const settings = getModerationSettings();
  const keys = (settings.aiKeys || []).map(k => ({
    ...k,
    status: 'active' as const,
    failureCount: 0,
    totalRequests: 0,
    lastError: undefined,
    cooldownUntil: 0
  }));
  const updatedSettings = updateModerationSettings({ aiKeys: keys });
  const maskedKeys = (updatedSettings.aiKeys || []).map(k => ({ ...k, key: maskAiKey(k.key) }));
  res.json({ success: true, keys: maskedKeys });
});

// Maya AI Test Endpoint
app.post('/api/maya/test', async (req: Request, res: Response) => {
  try {
    const { text, settings: mayaSettings } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const currentSettings = getModerationSettings();
    const { getMayaResponse } = await import('./src/aiEngine.ts');
    
    const aiResult = await getMayaResponse(
      text,
      'ADMIN',
      'Dashboard Admin',
      'Dashboard Test Sandbox',
      'ADMIN:SANDBOX',
      {
        romantic: mayaSettings?.mayaRomantic ?? currentSettings.mayaRomantic ?? true,
        funny: mayaSettings?.mayaFunny ?? currentSettings.mayaFunny ?? true,
        language: mayaSettings?.mayaLanguage ?? currentSettings.mayaLanguage ?? 'auto',
        memoryLimit: mayaSettings?.mayaMemoryLimit ?? currentSettings.mayaMemoryLimit ?? 10,
        aiProvider: mayaSettings?.aiProvider ?? currentSettings.aiProvider ?? 'auto',
        geminiModel: mayaSettings?.geminiModel || currentSettings.geminiModel || 'gemini-3.1-flash-lite',
        isPrivate: true,
      }
    );

    res.json({
      success: true,
      reply: aiResult.reply,
      provider: aiResult.provider,
      latencyMs: aiResult.latencyMs,
      error: aiResult.error,
      keyLabel: aiResult.keyLabel
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Secondary Female AI Companion Account Endpoints (Pure Chat: Inbox & Groups, Zero Moderation)
app.get('/api/companion/status', (_req: Request, res: Response) => {
  res.json({ success: true, ...getCompanionStatus() });
});

app.post('/api/companion/pair', async (req: Request, res: Response) => {
  try {
    const phone = String(req.body?.phoneNumber || '').trim();
    const result = await startCompanionPairing(phone);
    res.json({
      success: true,
      phoneNumber: result.phoneNumber,
      pairingCode: result.pairingCode,
      qrCode: result.qrCode,
      alreadyConnected: !result.pairingCode && getCompanionStatus().online,
      status: getCompanionStatus(),
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Pairing failed' });
  }
});

app.post('/api/companion/disconnect', async (_req: Request, res: Response) => {
  try {
    await disconnectCompanionBot();
    res.json({ success: true, status: getCompanionStatus(), message: 'দ্বিতীয় AI অ্যাকাউন্ট ডিসকানেক্ট করা হয়েছে।' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Disconnect failed' });
  }
});

app.get('/api/companion/groups', async (_req: Request, res: Response) => {
  const groups = await refreshCompanionGroups();
  res.json({ success: true, groups });
});

app.post('/api/companion/settings', (req: Request, res: Response) => {
  try {
    const allowedKeys = [
      'companionEnabled',
      'companionName',
      'companionInboxReply',
      'companionGroupReply',
      'companionGroupMode',
      'companionRomanticLevel',
      'companionStrictAccuracy',
      'companionCooldownSec',
      'companionAllowedGroups',
      'companionCustomBio',
    ];
    const patch: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (req.body && key in req.body) {
        patch[key] = req.body[key];
      }
    }
    const updated = updateModerationSettings(patch);
    res.json({ success: true, settings: updated, message: '২য় AI অ্যাকাউন্টের সেটিংস সেভ হয়েছে!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Save failed' });
  }
});

app.post('/api/companion/clear-memory', (_req: Request, res: Response) => {
  clearCompanionChatLogsAndMemory();
  res.json({ success: true, status: getCompanionStatus(), message: 'চ্যাট মেমোরি ও রিসেন্ট লগ ক্লিয়ার হয়েছে।' });
});

app.post('/api/companion/test', async (req: Request, res: Response) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'মেসেজ লিখুন।' });

    const s = getModerationSettings();
    const override = req.body?.settings || {};
    const result = await getCompanionFemaleResponse(
      text,
      'ADMIN_TEST',
      'জানু / অ্যাডমিন',
      override.channel === 'group' ? 'Test WhatsApp Group' : 'Private DM',
      'COMPANION:TEST_SANDBOX',
      {
        companionName: override.companionName ?? s.companionName ?? 'নিলা (Nila)',
        romanticLevel: override.companionRomanticLevel ?? s.companionRomanticLevel ?? 'romantic',
        strictAccuracy: override.companionStrictAccuracy ?? s.companionStrictAccuracy ?? true,
        customBio: override.companionCustomBio ?? s.companionCustomBio ?? '',
        isPrivate: override.channel !== 'group',
        aiProvider: s.aiProvider || 'auto',
        geminiModel: 'gemini-4-hydrogen',
        memoryLimit: 12,
      }
    );

    res.json({
      success: true,
      reply:
        result.reply ||
        'আমার AI চাবি সক্রিয় নেই। দয়া করে ড্যাশবোর্ডের API Keys পেজ থেকে একটি Gemini বা Groq Key যুক্ত করুন 🌸',
      provider: result.provider,
      latencyMs: result.latencyMs,
      error: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Test failed' });
  }
});

// Automatic Server Storage Monitor & Safe Cleanup API Endpoints (Protected by /api Admin PIN Middleware)
app.get('/api/server/storage', async (_req: Request, res: Response) => {
  try {
    const overview = await getStorageCleanupOverview();
    res.json({ success: true, ...overview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not inspect server storage' });
  }
});

app.post('/api/server/cleanup/run', async (req: Request, res: Response) => {
  try {
    const requestedMode = String(req.body?.mode || 'full').trim().toLowerCase();
    const allowedModes: CleanupMode[] = ['cache', 'temp', 'logs', 'duplicates', 'full'];
    const mode: CleanupMode = allowedModes.includes(requestedMode as CleanupMode)
      ? (requestedMode as CleanupMode)
      : 'full';
    const report = await runCleanup(mode, 'manual', currentSock);
    const overview = await getStorageCleanupOverview();
    res.json({
      success: true,
      report,
      overview,
      message: report.summaryBn,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Cleanup failed' });
  }
});

app.post('/api/server/cleanup/settings', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updated = updateCleanupSettings({
      autoCleanupEnabled: typeof body.autoCleanupEnabled === 'boolean' ? body.autoCleanupEnabled : undefined,
      dailyTempCleanupEnabled:
        typeof body.dailyTempCleanupEnabled === 'boolean' ? body.dailyTempCleanupEnabled : undefined,
      preserveErrorLogs: typeof body.preserveErrorLogs === 'boolean' ? body.preserveErrorLogs : undefined,
      cacheIntervalHours: body.cacheIntervalHours !== undefined ? Number(body.cacheIntervalHours) : undefined,
      debugLogRetentionDays: body.debugLogRetentionDays !== undefined ? Number(body.debugLogRetentionDays) : undefined,
      autoHistoryCleanupEnabled:
        typeof body.autoHistoryCleanupEnabled === 'boolean' ? body.autoHistoryCleanupEnabled : undefined,
      historyRetentionHours:
        body.historyRetentionHours !== undefined ? Number(body.historyRetentionHours) : undefined,
    });
    const overview = await getStorageCleanupOverview();
    res.json({
      success: true,
      settings: updated,
      overview,
      message: 'সার্ভার অটো ক্লিনআপ ও হিস্ট্রি অটো-ক্লিয়ার সেটিংস সেভ হয়েছে!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not save cleanup settings' });
  }
});

app.post('/api/server/cleanup/clear-histories', async (_req: Request, res: Response) => {
  try {
    const cleared = clearAllHistoriesNow();
    const overview = await getStorageCleanupOverview();
    res.json({
      success: true,
      cleared,
      overview,
      message: `স্টিকার (${cleared.stickerHistoryCleared}), ওয়ার্নিং (${cleared.warningsCleared}) ও রিমুভ/অ্যাক্টিভিটি (${cleared.activityLogsCleared}) হিস্ট্রি ক্লিয়ার করা হয়েছে!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not clear histories' });
  }
});

// -----------------------------------------------------------------------------
// OFFLINE AI VOICE ANTI-ABUSE ENDPOINTS (Zero Paid API, Whisper.cpp)
// -----------------------------------------------------------------------------

app.get('/api/voice-moderation/overview', (req: Request, res: Response) => {
  try {
    const limit = Math.min(300, Math.max(10, Number(req.query.limit || 100)));
    const overview = getVoiceModerationOverview(limit);
    res.json({ success: true, ...overview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not load voice moderation overview' });
  }
});

app.post('/api/voice-moderation/settings', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const patch: Record<string, any> = {};

    if (typeof body.voiceModerationEnabled === 'boolean') patch.voiceModerationEnabled = body.voiceModerationEnabled;
    if (typeof body.voiceDetectBangla === 'boolean') patch.voiceDetectBangla = body.voiceDetectBangla;
    if (typeof body.voiceDetectEnglish === 'boolean') patch.voiceDetectEnglish = body.voiceDetectEnglish;
    if (typeof body.voiceDetectBanglish === 'boolean') patch.voiceDetectBanglish = body.voiceDetectBanglish;
    if (body.voiceProfanitySensitivity === 'low' || body.voiceProfanitySensitivity === 'medium' || body.voiceProfanitySensitivity === 'high') {
      patch.voiceProfanitySensitivity = body.voiceProfanitySensitivity;
    }
    if (Array.isArray(body.voiceAllowedWords)) {
      patch.voiceAllowedWords = body.voiceAllowedWords
        .map((w: any) => String(w || '').trim())
        .filter((w: string) => w.length >= 2)
        .slice(0, 300);
    }
    if (Array.isArray(body.voiceBlockedWords)) {
      patch.voiceBlockedWords = body.voiceBlockedWords
        .map((w: any) => String(w || '').trim())
        .filter((w: string) => w.length >= 2)
        .slice(0, 300);
    }
    if (typeof body.voiceWhisperModel === 'string' && body.voiceWhisperModel in WHISPER_MODELS) {
      patch.voiceWhisperModel = body.voiceWhisperModel as WhisperModelId;
      ensureWhisperModel(body.voiceWhisperModel as WhisperModelId).catch(() => {});
    }

    updateModerationSettings(patch);
    const overview = getVoiceModerationOverview(100);
    res.json({
      success: true,
      overview,
      message: 'অফলাইন ভয়েস এআই অ্যান্টি-অ্যাবিউজ সেটিংস সেভ হয়েছে!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not save voice moderation settings' });
  }
});

app.post('/api/voice-moderation/model/ensure', async (req: Request, res: Response) => {
  try {
    const modelIdRaw = String(req.body?.modelId || 'base-q5_1');
    if (!(modelIdRaw in WHISPER_MODELS)) {
      return res.status(400).json({ success: false, error: 'অবৈধ মডেল আইডি।' });
    }
    const modelId = modelIdRaw as WhisperModelId;
    ensureWhisperModel(modelId).catch(() => {});
    res.json({
      success: true,
      overview: getVoiceModerationOverview(100),
      message: `${WHISPER_MODELS[modelId].fileName} অফলাইন মডেল প্রস্তুত করা হচ্ছে...`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Model preparation failed' });
  }
});

app.post('/api/voice-moderation/history/clear', (_req: Request, res: Response) => {
  try {
    clearVoiceModerationHistory();
    res.json({
      success: true,
      overview: getVoiceModerationOverview(100),
      message: 'ভয়েস মডারেশন হিস্ট্রি পরিষ্কার করা হয়েছে।',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not clear voice history' });
  }
});

app.post('/api/voice-moderation/queue/retry', (_req: Request, res: Response) => {
  try {
    const retried = retryFailedVoiceJobsNow();
    res.json({
      success: true,
      retried,
      overview: getVoiceModerationOverview(100),
      message: retried > 0 ? `${retried}টি পেন্ডিং ভয়েস জব পুনরায় কিউ করা হয়েছে।` : 'কোনো রিট্রাইযোগ্য জব নেই।',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Retry failed' });
  }
});

app.post('/api/voice-moderation/test', async (req: Request, res: Response) => {
  try {
    const audioBase64 = String(req.body?.audioBase64 || '').trim();
    const fileName = String(req.body?.fileName || 'voice_test.ogg');
    const mimeType = String(req.body?.mimeType || 'audio/ogg');
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'অডিও ফাইল বা রেকর্ডিং প্রদান করুন।' });
    }

    const rawBase64 = audioBase64.includes('base64,') ? audioBase64.split('base64,')[1] : audioBase64;
    const buffer = Buffer.from(rawBase64, 'base64');
    if (!buffer || buffer.length < 32 || buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'অডিও সাইজ ৩২ বাইট থেকে ১০ MB এর মধ্যে হতে হবে।' });
    }

    const result = await testAudioBufferOffline({
      audioBuffer: buffer,
      fileName,
      mimeType,
      overrideConfig: req.body?.config || undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Offline STT test failed' });
  }
});

// -----------------------------------------------------------------------------
// GROUP INBOX SYSTEM ENDPOINTS (Real-time Messages, Media Streaming & Limits)
// -----------------------------------------------------------------------------

app.get('/api/inbox/groups', async (_req: Request, res: Response) => {
  try {
    if (currentSock && botState.status === 'connected') {
      try {
        const groups = await currentSock.groupFetchAllParticipating();
        primeGroupMetaCache(groups);
        const list = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
          participants: g.participants?.length || 0,
          status: 'Active',
        }));
        botState.groups = list;
        await syncConnectedGroupsToInbox(
          currentSock,
          list.map((g) => ({
            id: g.id,
            name: g.name,
            participants: g.participants,
            isBotAdmin: isBotGroupAdminFromMeta(currentSock, groups[g.id]),
          }))
        );
      } catch {}
    }

    const groups = getInboxGroupsList().map(attachSignedAvatarUrl);
    res.json({
      success: true,
      online: botState.status === 'connected',
      groups,
      storage: getInboxStorageStats(),
      settings: getInboxSettings(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load inbox groups' });
  }
});

app.get('/api/inbox/groups/:groupId/messages', (req: Request, res: Response) => {
  try {
    const groupId = decodeURIComponent(String(req.params.groupId || '')).trim();
    if (!groupId || !/^[0-9A-Za-z._-]+@g\.us$/.test(groupId)) {
      return res.status(400).json({ success: false, error: 'সঠিক গ্রুপ আইডি (@g.us) প্রয়োজন।' });
    }

    const limit = Number(req.query.limit || 35);
    const beforeTimestamp = req.query.beforeTimestamp ? Number(req.query.beforeTimestamp) : undefined;
    const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : undefined;
    const sender = typeof req.query.sender === 'string' ? req.query.sender : undefined;
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const typeFilter = (typeof req.query.type === 'string' ? req.query.type : 'all') as any;
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const deletedOnly = req.query.deletedOnly === '1' || req.query.deletedOnly === 'true';

    const result = queryGroupInboxMessages({
      groupId,
      limit,
      beforeTimestamp,
      beforeId,
      sender,
      query,
      typeFilter,
      dateFrom,
      dateTo,
      deletedOnly,
    });

    res.json({
      success: true,
      group: result.group ? attachSignedAvatarUrl(result.group) : null,
      messages: result.messages.map(attachSignedMediaUrls),
      hasMore: result.hasMore,
      totalMatching: result.totalMatching,
      nextCursor: result.nextCursor,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load group inbox messages' });
  }
});

app.post('/api/inbox/messages/important', (req: Request, res: Response) => {
  try {
    const groupId = String(req.body?.groupId || '').trim();
    const messageId = String(req.body?.messageId || '').trim();
    const important = typeof req.body?.important === 'boolean' ? req.body.important : undefined;
    if (!groupId || !/^[0-9A-Za-z._-]+@g\.us$/.test(groupId) || !messageId) {
      return res.status(400).json({ success: false, error: 'সঠিক groupId ও messageId প্রয়োজন।' });
    }
    const updated = toggleMessageImportant(groupId, messageId, important);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'মেসেজটি ইনবক্স ডাটাবেজে পাওয়া যায়নি।' });
    }
    res.json({
      success: true,
      message: attachSignedMediaUrls(updated),
      storage: getInboxStorageStats(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not update important flag' });
  }
});

app.get('/api/inbox/media/:groupId/:messageId', (req: Request, res: Response) => {
  try {
    const groupId = decodeURIComponent(String(req.params.groupId || '')).trim();
    const messageId = decodeURIComponent(String(req.params.messageId || '')).trim();
    if (!groupId || !/^[0-9A-Za-z._-]+@g\.us$/.test(groupId) || !messageId) {
      return res.status(400).json({ success: false, error: 'Invalid media identifier' });
    }

    const found = resolveSafeInboxMediaFile(groupId, messageId);
    if (!found) {
      return res.status(404).json({ success: false, error: 'মিডিয়া ফাইলটি পাওয়া যায়নি বা পরিষ্কার করা হয়েছে।' });
    }

    const { filePath, record } = found;
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const rawMime = (record.media?.mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const isActiveContent =
      rawMime.includes('html') ||
      rawMime.includes('svg') ||
      rawMime.includes('xml') ||
      rawMime.includes('javascript') ||
      rawMime.includes('ecmascript');
    const forceDownload = req.query.download === '1' || req.query.download === 'true' || isActiveContent;

    const safeDownloadName = (record.media?.fileName || `waguard_${messageId.slice(0, 12)}${path.extname(filePath)}`)
      .replace(/["\r\n\\/]/g, '_');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', isActiveContent ? 'application/octet-stream' : rawMime || 'application/octet-stream');
    if (forceDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"`);
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
      const [startRaw, endRaw] = rangeHeader.replace(/^bytes=/, '').split('-');
      const start = startRaw ? Number(startRaw) : 0;
      const end = endRaw ? Math.min(totalSize - 1, Number(endRaw)) : totalSize - 1;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        start >= totalSize ||
        end < start
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(totalSize));
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Media read error' });
  }
});

app.get('/api/inbox/avatar/:groupId', (req: Request, res: Response) => {
  try {
    const groupId = decodeURIComponent(String(req.params.groupId || '')).trim();
    if (!groupId || !/^[0-9A-Za-z._-]+@g\.us$/.test(groupId)) {
      return res.status(400).end();
    }
    const avatarPath = resolveSafeGroupAvatarFile(groupId);
    if (!avatarPath) {
      return res.status(404).end();
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', 'image/jpeg');
    fs.createReadStream(avatarPath).pipe(res);
  } catch {
    res.status(404).end();
  }
});

app.get('/api/inbox/storage', (_req: Request, res: Response) => {
  res.json({
    success: true,
    storage: getInboxStorageStats(),
    settings: getInboxSettings(),
  });
});

app.post('/api/inbox/storage/settings', (req: Request, res: Response) => {
  try {
    const settings = updateInboxSettings(req.body || {});
    res.json({
      success: true,
      settings,
      storage: getInboxStorageStats(),
      message: 'ইনবক্স মিডিয়া স্টোরেজ লিমিট সেভ হয়েছে!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not update inbox storage settings' });
  }
});

app.post('/api/inbox/storage/cleanup', async (req: Request, res: Response) => {
  try {
    const forcePrunePercent = req.body?.forcePrunePercent !== undefined ? Number(req.body.forcePrunePercent) : 20;
    const result = await enforceInboxMediaStorageLimit(
      Number.isFinite(forcePrunePercent) && forcePrunePercent > 0 ? forcePrunePercent : 20
    );
    res.json({
      success: true,
      result,
      storage: getInboxStorageStats(),
      message:
        result.filesRemoved > 0
          ? `${result.filesRemoved}টি পুরোনো নন-ইম্পর্ট্যান্ট মিডিয়া ফাইল পরিষ্কার করা হয়েছে (${result.protectedImportantSkipped}টি গুরুত্বপূর্ণ ফাইল সুরক্ষিত রাখা হয়েছে)।`
          : 'কোনো অপ্রয়োজনীয় নন-ইম্পর্ট্যান্ট মিডিয়া পরিষ্কারের দরকার হয়নি।',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Inbox media cleanup failed' });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  const distDir = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const hasBuiltDist = fs.existsSync(distIndexPath);
  const isHostedProdEnv =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.FLY_APP_NAME) ||
    (Boolean(process.env.K_SERVICE) && !process.env.NGINX_PORT);
  const isProd = isHostedProdEnv && (hasBuiltDist || process.env.NODE_ENV === 'production');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      if (fs.existsSync(distIndexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.sendFile(distIndexPath);
      }
      return res.status(200).send('WAGuard Server Running');
    });
  }

  // Start group unlock timer monitor (resumes 10-minute locks even after restart)
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server Warning] Port ${PORT} is currently busy, retrying binding in 1.5s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, '0.0.0.0');
      }, 1500);
    } else {
      console.error('[Server Error]:', err);
    }
  });

  const inboxWss = new WebSocketServer({ server, path: '/ws/inbox' });
  const wsSubscriptions = new Map<WebSocket, () => void>();

  inboxWss.on('connection', (ws: WebSocket) => {
    const settings = getModerationSettings();
    const pinRequired = Boolean(settings.dashboardPinEnabled && settings.dashboardPin);
    let authenticated = !pinRequired;
    let authTimeout: ReturnType<typeof setTimeout> | null = null;

    const attachSubscription = () => {
      if (wsSubscriptions.has(ws)) return;
      const unsub = subscribeInboxEvents((ev) => {
        if (ws.readyState !== 1) return;
        try {
          const payload = {
            ...ev,
            ...(ev.message ? { message: attachSignedMediaUrls(ev.message) } : {}),
            ...(ev.groupSummary ? { groupSummary: attachSignedAvatarUrl(ev.groupSummary) } : {}),
          };
          ws.send(JSON.stringify(payload));
        } catch {}
      });
      wsSubscriptions.set(ws, unsub);
      try {
        ws.send(JSON.stringify({ type: 'inbox:ready', storage: getInboxStorageStats(), timestamp: Date.now() }));
      } catch {}
    };

    if (authenticated) {
      attachSubscription();
    } else {
      authTimeout = setTimeout(() => {
        if (!authenticated && ws.readyState === 1) {
          try {
            ws.send(JSON.stringify({ type: 'inbox:auth_error', error: 'Authentication timeout' }));
          } catch {}
          ws.close(4001, 'Auth timeout');
        }
      }, 6000);
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw || ''));
        if (msg?.type === 'auth') {
          const curSettings = getModerationSettings();
          if (!curSettings.dashboardPinEnabled || !curSettings.dashboardPin || verifyAdminToken(msg.token, curSettings.dashboardPin)) {
            authenticated = true;
            if (authTimeout) {
              clearTimeout(authTimeout);
              authTimeout = null;
            }
            attachSubscription();
          } else {
            ws.send(JSON.stringify({ type: 'inbox:auth_error', error: 'Invalid admin token' }));
            ws.close(4001, 'Unauthorized');
          }
        } else if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {}
    });

    ws.on('close', () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
      const unsub = wsSubscriptions.get(ws);
      if (unsub) {
        unsub();
        wsSubscriptions.delete(ws);
      }
    });
  });

  const wsHeartbeat = setInterval(() => {
    for (const client of inboxWss.clients) {
      if (client.readyState === 1) {
        try {
          client.ping();
        } catch {}
      }
    }
  }, 30000);
  wsHeartbeat.unref?.();

  const shutdown = (signal = 'SIGTERM') => {
    console.log(`Flushing pending moderation DB, inbox, diagnostics & sticker queues and closing server gracefully (${signal})...`);
    stopCleanupScheduler();
    recordGracefulServerShutdown(signal);
    flushDiagnosticsSync();
    flushDatabaseSync();
    flushStickerQueueSync();
    flushInboxStoreSync();
    flushVoiceModerationSync();
    clearInterval(wsHeartbeat);
    try {
      inboxWss.close();
    } catch {}
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message || String(reason);
    console.error('[Unhandled Rejection Guard]:', msg);
    appendErrorLog('UNHANDLED_REJECTION', msg);
    reportServerProblem(
      {
        category: 'unhandled_rejection',
        title: 'সার্ভার প্রসেস এরর (Unhandled Promise Rejection)',
        details: msg,
        suggestion: 'সার্ভার ক্র্যাশ না করে চলমান রয়েছে, তবে সমস্যাটি অব্যাহত থাকলে রিস্টার্ট করুন।',
      },
      currentSock
    ).catch(() => {});
  });
  process.on('uncaughtException', (err: any) => {
    const msg = err?.message || String(err);
    console.error('[Uncaught Exception Guard]:', msg);
    appendErrorLog('UNCAUGHT_EXCEPTION', msg);
    reportServerProblem(
      {
        category: 'uncaught_exception',
        title: 'সার্ভার রানটাইম এরর (Uncaught Exception)',
        details: msg,
        suggestion: 'সার্ভার লগ ও কানেকশন স্ট্যাটাস যাচাই করুন।',
      },
      currentSock
    ).catch(() => {});
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
    appendDebugLog('SERVER', `Server listening on port ${PORT}`);
    startRestrictedUsersMonitor(() => currentSock);
    startGroupLockMonitor(() => currentSock);
    startNightModeScheduler(() => currentSock);
    initStickerQueue(() => currentSock);
    startServerHealthMonitor(() => currentSock);
    startCleanupScheduler(() => currentSock);
    initVoiceModeration(() => currentSock);
    initializeExistingSession().catch((err: any) => {
      console.error('[Startup Session Restore Warning]:', err?.message || err);
    });
    try {
      initCompanionBot(() => currentSock?.user?.id);
    } catch (err: any) {
      console.error('[Startup Companion Init Warning]:', err?.message || err);
    }
  });
}

startServer();
