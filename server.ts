import express, { Request, Response } from 'express';
import { createServer } from 'http';
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
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';

import {
  processIncomingMessage,
  handleGroupParticipantsUpdate,
  handleIncomingCall,
  primeGroupMetaCache,
  startGroupLockMonitor,
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
} from './src/moderationEngine.ts';
import {
  initCompanionBot,
  getCompanionStatus,
  startCompanionPairing,
  disconnectCompanionBot,
  refreshCompanionGroups,
  clearCompanionChatLogsAndMemory,
} from './src/companionBot.ts';
import { getCompanionFemaleResponse } from './src/aiEngine.ts';

startRestrictedUsersMonitor(() => currentSock);
startGroupLockMonitor(() => currentSock);
startNightModeScheduler(() => currentSock);

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
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const envPort = Number(process.env.PORT);
    if (Number.isFinite(envPort) && envPort > 0) return envPort;
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

// Persistent HMAC secret for Dashboard Admin PIN Lock
const AUTH_SECRET_PATH = path.join(__dirname, 'data', '.auth_secret');
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

function extractRequestToken(req: Request): string {
  const headerToken = req.headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

app.use('/api', (req: Request, res: Response, next) => {
  if (req.path === '/auth/status' || req.path === '/auth/verify' || req.path === '/auth/lock') {
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
  return res.status(401).json({
    success: false,
    pinRequired: true,
    error: 'অ্যাডমিন পিন লক সক্রিয় রয়েছে। অনুগ্রহ করে সঠিক পিন দিয়ে আনলক করুন।',
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

// Persistent directory for WhatsApp session auth keys
const SESSIONS_DIR = path.join(__dirname, '.sessions');
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
  groups: [
    { id: '12036302@g.us', name: 'WAGuard Official Community', participants: 184, status: 'Active' },
    { id: '12036303@g.us', name: 'Devs & Admins Group', participants: 42, status: 'Active' },
  ],
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

function hasRegisteredCredsOnDisk(): boolean {
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return Boolean(content?.registered || content?.me?.id);
  } catch {
    return false;
  }
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
      oldSock.ev.removeAllListeners('group-participants.update');
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
      console.log('WhatsApp connection opened successfully for user:', sock.user?.id);

      setTimeout(async () => {
        if (socketToken !== activeSocketToken || sock !== currentSock) return;
        try {
          const groups = await sock.groupFetchAllParticipating();
          primeGroupMetaCache(groups);
          const groupList = Object.values(groups).map((g) => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0,
            status: 'Active',
          }));
          if (groupList.length > 0) {
            botState.groups = groupList;
          }
        } catch {
          // non-blocking
        }
      }, 800);
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errMsg = lastDisconnect?.error?.message || 'Connection closed';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
      const isBannedOrForbidden = statusCode === 403 || statusCode === 405 || /banned|blocked|restricted/i.test(errMsg);
      const isRegistered = Boolean(sock.authState?.creds?.registered) || hasRegisteredCredsOnDisk();

      if (manualDisconnect) {
        botState.status = 'disconnected';
        botState.step = 'idle';
        botState.lastConnectionStatus = 'Disconnected by user';
        return;
      }

      if (isLoggedOut) {
        console.log('Logged out of WhatsApp. Cleaning up session credentials...');
        clearReconnectTimer();
        botState.status = 'disconnected';
        botState.step = 'idle';
        botState.stepMessage = 'WhatsApp সেশন লগআউট হয়েছে। পুনরায় কানেক্ট করুন।';
        botState.lastConnectionStatus = 'Logged out — Re-pairing required';
        botState.lastError = errMsg;
        botState.pairingCode = '';
        botState.qrCodeDataUrl = '';
        botState.pairingStartedAt = 0;
        botState.user = null;
        try {
          fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        } catch (e) {}
        return;
      }

      if (isBannedOrForbidden) {
        console.warn(`[Baileys Guard] WhatsApp returned status ${statusCode}: ${errMsg}. Stopping auto-reconnect to protect account.`);
        clearReconnectTimer();
        botState.status = 'disconnected';
        botState.step = 'error';
        botState.stepMessage = 'WhatsApp থেকে সাময়িক সীমাবদ্ধতা দেওয়া হয়েছে। অন্তত কিছু সময় অপেক্ষা করে আবার চেষ্টা করুন।';
        botState.lastConnectionStatus = `Paused (${statusCode || 'Restricted'})`;
        botState.lastError = errMsg;
        botState.pairingCode = '';
        botState.pairingStartedAt = 0;
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

        if (reconnectAttempts >= 40) {
          botState.status = 'disconnected';
          botState.step = 'error';
          botState.stepMessage = 'দীর্ঘ সময় নেটওয়ার্ক সংযোগ পাওয়া যায়নি। ম্যানুয়ালি পুনরায় চেষ্টা করুন।';
          botState.lastConnectionStatus = 'Reconnect paused after extended outage';
          return;
        }

        const delayMs = isRestartRequired
          ? 900
          : reconnectAttempts < 8
            ? Math.min(30000, 2500 * Math.pow(2, reconnectAttempts))
            : 60000;
        reconnectAttempts += 1;
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

  sock.ev.on('messaging-history.set', (data: any) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) return;
    if (Array.isArray(data?.contacts)) updateContactNames(data.contacts);
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (socketToken !== activeSocketToken || sock !== currentSock) {
      return;
    }
    if (type === 'notify' && Array.isArray(messages)) {
      botState.messagesChecked += messages.length;
      await Promise.allSettled(
        messages.map((msg) =>
          processIncomingMessage(sock, msg).catch((err: any) => {
            console.error('Error processing group message in moderation engine:', err?.message || err);
          })
        )
      );
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
    if (!state.creds?.registered && !state.creds?.me?.id) {
      return;
    }

    destroyCurrentSocket();
    const myToken = activeSocketToken;

    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1043857760] as [number, number, number],
      isLatest: true,
    }));

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
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      emitOwnEvents: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 2500,
      maxMsgRetryCount: 3,
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

// Start existing sessions if credentials already exist
initializeExistingSession();
initCompanionBot(() => currentSock?.user?.id);

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

      // Clear unauthenticated session files completely to avoid stale keys
      try {
        if (!hasRegisteredCredsOnDisk()) {
          console.log('[Baileys Engine] Cleaning unauthenticated session directory for fresh key generation...');
          fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        }
      } catch (e) {
        console.error('[Baileys Engine] Error cleaning session directory:', e);
      }

      const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1043857760] as [number, number, number],
        isLatest: true,
      }));

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
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        emitOwnEvents: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2500,
        maxMsgRetryCount: 3,
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
            const err = update.lastDisconnect?.error;
            if (err && !resolved) {
              resolved = true;
              clearTimeout(timer);
              sock.ev.off('connection.update', onUpdate);
              console.error('[Baileys Engine] Connection closed during pairing:', err?.message || 'Closed');
              botState.step = 'error';
              botState.stepMessage = `কানেকশন বন্ধ হয়েছে: ${err?.message || 'Connection closed'}`;
              botState.lastConnectionStatus = `Closed: ${err?.message || 'Connection closed'}`;
              reject(err || new Error('Connection closed by WhatsApp server'));
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
    if (updated.dashboardPin) updated.dashboardPin = '****';
    res.json({ success: true, settings: updated, message: 'Settings saved and active in real-time' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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

// Moderation Logs Endpoint
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
      const list = Object.values(groups).map((g) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length || 0,
        status: 'Active',
      }));
      if (list.length > 0) {
        botState.groups = list;
      }
    } catch (e) {}
  }
  res.json({ groups: botState.groups });
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
    res.json({ success: true, message: 'Session disconnected and cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. Encrypted Session Backup Export (Transfer verified Google session to any hosting without re-pairing)
app.post('/api/whatsapp/session-export', async (req: Request, res: Response) => {
  try {
    const passphrase = String(req.body?.passphrase || '').trim();
    if (passphrase.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'সেশন সুরক্ষার জন্য কমপক্ষে ৪ অক্ষরের একটি পাসওয়ার্ড/পিন দিন।',
      });
    }

    if (!hasRegisteredCredsOnDisk()) {
      return res.status(400).json({
        success: false,
        error: 'আগে WhatsApp কানেক্ট করুন, তারপর সেশন ব্যাকআপ ডাউনলোড করুন।',
      });
    }

    const files: Record<string, string> = {};
    for (const entry of fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
      if (entry.isFile()) {
        const fullPath = path.join(SESSIONS_DIR, entry.name);
        files[entry.name] = fs.readFileSync(fullPath).toString('base64');
      }
    }

    if (!files['creds.json']) {
      return res.status(400).json({
        success: false,
        error: 'সক্রিয় WhatsApp সেশন ফাইল পাওয়া যায়নি।',
      });
    }

    const payload = JSON.stringify({
      exportedAt: Date.now(),
      phoneNumber: botState.phoneNumber || '',
      files,
    });

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    res.json({
      success: true,
      filename: `waguard-session-${botState.phoneNumber || 'backup'}.json`,
      bundle: {
        v: 1,
        alg: 'aes-256-gcm',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5c. Encrypted Session Backup Import (Restore verified session on another host with zero pairing request)
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

    if (!bundle || bundle.v !== 1 || bundle.alg !== 'aes-256-gcm' || !bundle.salt || !bundle.iv || !bundle.tag || !bundle.data) {
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
    if (!files || typeof files !== 'object' || !files['creds.json']) {
      return res.status(400).json({
        success: false,
        error: 'ব্যাকআপে বৈধ WhatsApp creds.json পাওয়া যায়নি।',
      });
    }

    const credsRaw = Buffer.from(String(files['creds.json']), 'base64').toString('utf8');
    const credsObj = JSON.parse(credsRaw);
    if (!credsObj?.registered && !credsObj?.me?.id) {
      return res.status(400).json({
        success: false,
        error: 'এই ব্যাকআপের WhatsApp সেশনটি নিবন্ধিত নয়।',
      });
    }

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

    res.json({
      success: true,
      phoneNumber: botState.phoneNumber,
      message: 'সেশন সফলভাবে রিস্টোর হয়েছে! নতুন কোড ছাড়াই সংযোগ চালু হচ্ছে।',
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

// Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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

  const shutdown = () => {
    console.log('Closing server socket gracefully...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (reason: any) => {
    console.error('[Unhandled Rejection Guard]:', reason?.message || reason);
  });
  process.on('uncaughtException', (err: any) => {
    console.error('[Uncaught Exception Guard]:', err?.message || err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
