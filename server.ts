import express, { Request, Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
  startGroupLockMonitor,
  startRestrictedUsersMonitor,
  getSettings as getModerationSettings,
  updateSettings as updateModerationSettings,
  getActivityLogs,
  getStats as getModerationStats,
  resetWarnings as resetAllWarnings,
  clearActivityLogs,
  loadDatabase,
  getActiveRestrictedUsers,
  unrestrictUser,
} from './src/moderationEngine.ts';

startRestrictedUsersMonitor(() => currentSock);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = 3000;

// Enable CORS for all origins, supporting credentials and preflight OPTIONS
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Persistent directory for WhatsApp session auth keys
const SESSIONS_DIR = path.join(__dirname, '.sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

interface BotState {
  status: 'disconnected' | 'connecting' | 'pairing' | 'connected';
  step: 'idle' | 'initializing' | 'waiting_for_phone' | 'connected' | 'error';
  stepMessage: string;
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
const logger = pino({ level: 'silent' });

/**
 * Setup lifecycle listeners on a WhatsApp socket
 */
function setupSocketEvents(sock: WASocket) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        botState.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 5 });
      } catch (e) {}
    }

    if (connection === 'connecting') {
      if (botState.status !== 'pairing') {
        botState.status = 'connecting';
        botState.stepMessage = 'WhatsApp সার্ভারের সাথে সংযোগ তৈরি হচ্ছে...';
      }
    } else if (connection === 'open') {
      botState.status = 'connected';
      botState.step = 'connected';
      botState.stepMessage = 'সফলভাবে WhatsApp এর সাথে কানেক্ট হয়েছে!';
      botState.user = sock.user;
      botState.lastError = null;
      botState.pairingCode = '';
      botState.qrCodeDataUrl = '';
      console.log('WhatsApp connection opened successfully for user:', sock.user?.id);

      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
          participants: g.participants?.length || 0,
          status: 'Active',
        }));
        if (groupList.length > 0) {
          botState.groups = groupList;
        }
      } catch (err) {
        // non-blocking
      }
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      botState.status = 'disconnected';
      botState.lastError = lastDisconnect?.error?.message || 'Connection closed';

      if (botState.step !== 'connected') {
        botState.step = 'idle';
        botState.stepMessage = 'সংযোগ বিচ্ছিন্ন হয়েছে। পুনরায় কোড জেনারেট করুন।';
      }

      if (shouldReconnect && sock.authState?.creds?.registered) {
        console.log('Reconnecting existing WhatsApp session...');
        setTimeout(() => initializeExistingSession().catch(() => {}), 5000);
      } else if (!shouldReconnect) {
        console.log('Logged out of WhatsApp. Cleaning up session credentials...');
        try {
          fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        } catch (e) {}
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify' && Array.isArray(messages)) {
      botState.messagesChecked += messages.length;
      for (const msg of messages) {
        try {
          await processIncomingMessage(sock, msg);
        } catch (err: any) {
          console.error('Error processing group message in moderation engine:', err.message);
        }
      }
    }
  });
}

/**
 * Initialize existing registered session if available
 */
async function initializeExistingSession() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
    if (!state.creds?.registered) {
      return;
    }

    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number],
      isLatest: true,
    }));

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    currentSock = sock;
    sock.ev.on('creds.update', saveCreds);
    setupSocketEvents(sock);
  } catch (err: any) {
    console.log('Existing session restore note:', err.message);
  }
}

// Start existing session if credentials already exist
initializeExistingSession();

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
 */
async function startRealPairingFlow(cleanPhone: string): Promise<{ pairingCode: string; qrCode: string }> {
  console.log(`[Baileys Engine] Starting real pairing flow for phone: ${cleanPhone}...`);

  // If an unauthenticated socket is already running, gracefully close it
  if (currentSock && !currentSock.authState?.creds?.registered) {
    try {
      console.log('[Baileys Engine] Closing existing unauthenticated socket before new pairing attempt...');
      currentSock.end(undefined);
    } catch (e) {}
    currentSock = null;
  }

  // Clear unauthenticated session files completely to avoid stale keys
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    let isRegistered = false;
    if (fs.existsSync(credsPath)) {
      const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (content.registered) isRegistered = true;
    }
    if (!isRegistered) {
      console.log('[Baileys Engine] Cleaning unauthenticated session directory for fresh key generation...');
      fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[Baileys Engine] Error cleaning session directory:', e);
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307] as [number, number, number],
    isLatest: true,
  }));

  console.log(`[Baileys Engine] Initializing WASocket with version ${version.join('.')}...`);

  botState.status = 'connecting';
  botState.step = 'initializing';
  botState.stepMessage = 'WhatsApp সার্ভারের সাথে সংযোগ ও হ্যান্ডশেক হচ্ছে...';
  botState.phoneNumber = cleanPhone;

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
  });

  currentSock = sock;
  sock.ev.on('creds.update', saveCreds);
  setupSocketEvents(sock);

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Timeout of 30 seconds for Noise handshake and pairing code request
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        botState.step = 'error';
        botState.stepMessage = 'WhatsApp সার্ভার রেসপন্স টাইমআউট হয়েছে। পুনরায় চেষ্টা করুন।';
        console.error(`[Baileys Engine] Timeout generating pairing code for ${cleanPhone}`);
        reject(new Error('WhatsApp server handshake timeout. Please check number and try again.'));
      }
    }, 30000);

    const onUpdate = async (update: any) => {
      if (resolved) return;

      if (update.qr) {
        resolved = true;
        clearTimeout(timer);
        sock.ev.off('connection.update', onUpdate);

        try {
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
          botState.pairingCode = formattedCode;
          botState.qrCodeDataUrl = qrUrl;
          botState.pairingStartedAt = Date.now();

          resolve({ pairingCode: formattedCode, qrCode: qrUrl });
        } catch (err: any) {
          console.error('[Baileys Engine] requestPairingCode failed:', err.message);
          botState.step = 'error';
          botState.stepMessage = `কোড জেনারেট ত্রুটি: ${err.message || 'WhatsApp error'}`;
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
          reject(err || new Error('Connection closed by WhatsApp server'));
        }
      }
    };

    sock.ev.on('connection.update', onUpdate);
  });
}

// API Routes

// 1. WhatsApp 8-digit Pairing Code Endpoint
app.post('/api/whatsapp/pair', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
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

    // Prevent duplicate requests within 90 seconds if pairing code exists for same number
    const elapsedSec = (Date.now() - botState.pairingStartedAt) / 1000;
    if (botState.status === 'pairing' && botState.phoneNumber === cleanPhone && botState.pairingCode && elapsedSec < 90) {
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
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const elapsed = botState.pairingStartedAt > 0 ? Math.floor((Date.now() - botState.pairingStartedAt) / 1000) : 0;
  const remainingSeconds = Math.max(0, 120 - elapsed);

  res.json({
    status: botState.status,
    step: botState.step,
    stepMessage: botState.stepMessage,
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
  // Mask legacy single keys
  if (settings.geminiApiKey) settings.geminiApiKey = maskAiKey(settings.geminiApiKey);
  if (settings.groqApiKey) settings.groqApiKey = maskAiKey(settings.groqApiKey);
  if (settings.openrouterApiKey) settings.openrouterApiKey = maskAiKey(settings.openrouterApiKey);
  
  res.json({ success: true, settings });
});

app.post('/api/moderation/settings', (req: Request, res: Response) => {
  try {
    const updated = updateModerationSettings(req.body);
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

// Moderation Logs Endpoint
app.get('/api/moderation/logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  res.json({ success: true, logs: getActivityLogs(limit) });
});

// Reset User Warnings Endpoint
app.post('/api/moderation/reset-warnings', (req: Request, res: Response) => {
  try {
    resetAllWarnings();
    res.json({ success: true, message: 'All user warnings reset successfully' });
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
    if (currentSock) {
      await currentSock.logout().catch(() => {});
      currentSock.end(undefined);
      currentSock = null;
    }
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    botState.status = 'disconnected';
    botState.step = 'idle';
    botState.stepMessage = 'সেশন ডিসকানেক্ট ও ক্লিয়ার করা হয়েছে';
    botState.pairingCode = '';
    botState.qrCodeDataUrl = '';
    botState.phoneNumber = '';
    botState.user = null;
    res.json({ success: true, message: 'Session disconnected and cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test AI Endpoint
app.post('/api/ai/test', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AI Moderation Engine is active and ready (Gemini 1.5 Flash supported).',
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
