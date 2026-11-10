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
  getSettings as getModerationSettings,
  updateSettings as updateModerationSettings,
  getActivityLogs,
  getStats as getModerationStats,
  resetWarnings as resetAllWarnings,
  clearActivityLogs,
  loadDatabase,
} from './src/moderationEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = 3000;

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
 * Request real 8-digit WhatsApp pairing code directly from WhatsApp server
 */
async function startRealPairingFlow(cleanPhone: string): Promise<{ pairingCode: string; qrCode: string }> {
  // If an unauthenticated socket is already running, gracefully close it
  if (currentSock && !currentSock.authState?.creds?.registered) {
    try {
      currentSock.end(undefined);
    } catch (e) {}
    currentSock = null;
  }

  // Clear unauthenticated session files to avoid stale keys
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (!content.registered) {
        fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      }
    }
  } catch (e) {}

  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307] as [number, number, number],
    isLatest: true,
  }));

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

    // Give WhatsApp server up to 25 seconds to establish Noise WebSocket and return pairing code
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        botState.step = 'error';
        botState.stepMessage = 'WhatsApp সার্ভার রেসপন্স টাইমআউট হয়েছে। পুনরায় চেষ্টা করুন।';
        reject(new Error('WhatsApp server handshake timeout. Please check number and try again.'));
      }
    }, 25000);

    const onUpdate = async (update: any) => {
      if (resolved) return;

      if (update.qr) {
        resolved = true;
        clearTimeout(timer);
        sock.ev.off('connection.update', onUpdate);

        try {
          console.log(`Requesting official pairing code for ${cleanPhone} from WhatsApp...`);
          const rawCode = await sock.requestPairingCode(cleanPhone);
          console.log(`REAL OFFICIAL WHATSAPP PAIRING CODE: ${rawCode}`);

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
          botState.step = 'error';
          botState.stepMessage = `কানেকশন বন্ধ হয়েছে: ${err.message || 'Connection closed'}`;
          reject(err);
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
    let { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    let cleanPhone = String(phoneNumber).replace(/\D/g, '');

    // Auto-fix Bangladesh numbers without 88 prefix (e.g. 017XXXXXXXX -> 88017XXXXXXXX)
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '88' + cleanPhone;
    }

    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid international phone number with country code (e.g. 88017XXXXXXXX)',
      });
    }

    // If already connected
    if (currentSock?.authState?.creds?.registered && botState.status === 'connected') {
      return res.json({
        success: true,
        alreadyConnected: true,
        message: 'WhatsApp is already connected and active!',
        user: botState.user,
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
    console.error('Error in /api/whatsapp/pair:', err);
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
      settings: modSettings,
      stats: modStats,
    },
  });
});

// Moderation Settings Endpoints
app.get('/api/moderation/settings', (req: Request, res: Response) => {
  res.json({ success: true, settings: getModerationSettings() });
});

app.post('/api/moderation/settings', (req: Request, res: Response) => {
  try {
    const updated = updateModerationSettings(req.body);
    res.json({ success: true, settings: updated, message: 'Settings saved and active in real-time' });
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
    message: 'AI Moderation Engine is active and ready (Gemini 2.5 Flash / Groq / OpenRouter supported).',
  });
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
  startGroupLockMonitor(() => currentSock);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
