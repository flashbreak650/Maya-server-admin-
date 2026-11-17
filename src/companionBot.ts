import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers,
  type proto,
  type WASocket,
} from '@whiskeysockets/baileys';
import { getSettings } from './moderationEngine.ts';
import {
  clearCompanionMemory,
  getCompanionFemaleResponse,
  getCompanionMultimodalResponse,
} from './aiEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPANION_SESSIONS_DIR = path.join(__dirname, '..', '.sessions_companion');

if (!fs.existsSync(COMPANION_SESSIONS_DIR)) {
  fs.mkdirSync(COMPANION_SESSIONS_DIR, { recursive: true });
}

export interface CompanionRecentChat {
  id: string;
  chatJid: string;
  chatName: string;
  senderName: string;
  isGroup: boolean;
  userText: string;
  botReply: string;
  provider: string;
  timestamp: number;
}

export interface CompanionBotState {
  status: 'disconnected' | 'connecting' | 'pairing' | 'connected';
  step: 'idle' | 'initializing' | 'waiting_for_phone' | 'connected' | 'error';
  stepMessage: string;
  lastConnectionStatus: string;
  phoneNumber: string;
  pairingCode: string;
  qrCodeDataUrl: string;
  pairingStartedAt: number;
  user: any;
  repliesSent: number;
  inboxReplies: number;
  groupReplies: number;
  groups: Array<{ id: string; name: string; participants: number }>;
  recentChats: CompanionRecentChat[];
  lastError: string | null;
}

const companionState: CompanionBotState = {
  status: 'disconnected',
  step: 'idle',
  stepMessage: 'দ্বিতীয় AI অ্যাকাউন্ট সংযোগের জন্য প্রস্তুত',
  lastConnectionStatus: 'Ready to connect 2nd account',
  phoneNumber: '',
  pairingCode: '',
  qrCodeDataUrl: '',
  pairingStartedAt: 0,
  user: null,
  repliesSent: 0,
  inboxReplies: 0,
  groupReplies: 0,
  groups: [],
  recentChats: [],
  lastError: null,
};

let companionSock: WASocket | null = null;
let activeCompanionToken = 0;
let companionReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isRestoringCompanion = false;
let pairingInFlight: Promise<{ pairingCode: string; qrCode: string }> | null = null;
let pairingInFlightPhone = '';
let manualDisconnect = false;
let reconnectAttempts = 0;
let lastPairingRequestAt = 0;
let primaryJidGetter: () => string | undefined = () => undefined;

const logger = pino({ level: 'silent' });
const processedMsgIds = new Set<string>();
const lastReplyAtByChat = new Map<string, number>();
const inFlightChats = new Set<string>();
const groupSubjectCache = new Map<string, string>();
let recentGlobalReplyTimestamps: number[] = [];

function checkAndRecordGlobalAntiBanQuota(): boolean {
  const now = Date.now();
  recentGlobalReplyTimestamps = recentGlobalReplyTimestamps.filter((ts) => now - ts < 3600_000);
  const lastMinuteCount = recentGlobalReplyTimestamps.filter((ts) => now - ts < 60_000).length;
  if (lastMinuteCount >= 8 || recentGlobalReplyTimestamps.length >= 40) {
    return false;
  }
  return true;
}

function clearCompanionReconnectTimer() {
  if (companionReconnectTimer) {
    clearTimeout(companionReconnectTimer);
    companionReconnectTimer = null;
  }
}

function isVerifiedCompanionCreds(creds: any): boolean {
  return Boolean(creds?.registered || (creds?.me?.id && creds?.account));
}

function hasRegisteredCompanionCreds(): boolean {
  try {
    const credsPath = path.join(COMPANION_SESSIONS_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return isVerifiedCompanionCreds(content);
  } catch {
    return false;
  }
}

function wipeCompanionSessionsDir() {
  try {
    fs.rmSync(COMPANION_SESSIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(COMPANION_SESSIONS_DIR, { recursive: true });
  } catch {}
}

async function resolveCompanionWaVersion(): Promise<[number, number, number]> {
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

function destroyCompanionSocket() {
  clearCompanionReconnectTimer();
  activeCompanionToken += 1;
  if (companionSock) {
    const old = companionSock;
    companionSock = null;
    try {
      old.ev.removeAllListeners('connection.update');
      old.ev.removeAllListeners('creds.update');
      old.ev.removeAllListeners('messages.upsert');
      old.end(undefined);
    } catch {
      // ignore cleanup error
    }
  }
}

function scheduleCompanionReconnect(delayMs: number) {
  if (manualDisconnect || companionReconnectTimer) return;
  companionReconnectTimer = setTimeout(() => {
    companionReconnectTimer = null;
    if (!manualDisconnect && !pairingInFlight) {
      restoreCompanionSession().catch(() => {});
    }
  }, delayMs);
}

function cleanPhoneDigits(jidOrPhone?: string): string {
  if (!jidOrPhone) return '';
  return String(jidOrPhone).split(':')[0].split('@')[0].replace(/\D/g, '');
}

function formatAndValidatePhone(inputPhone: string): { valid: boolean; cleanPhone: string; error?: string } {
  if (!inputPhone) {
    return { valid: false, cleanPhone: '', error: 'দ্বিতীয় অ্যাকাউন্টের ফোন নম্বর লিখুন (যেমন: 017XXXXXXXX)' };
  }
  let clean = String(inputPhone).replace(/\D/g, '');
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (clean.startsWith('1') && clean.length === 10) clean = '880' + clean;
  else if (clean.startsWith('01') && clean.length === 11) clean = '88' + clean;
  if (clean.length < 10 || clean.length > 15) {
    return {
      valid: false,
      cleanPhone: clean,
      error: 'সঠিক আন্তর্জাতিক ফোন নম্বর দিন (যেমন: 88017XXXXXXXX বা 017XXXXXXXX)',
    };
  }
  return { valid: true, cleanPhone: clean };
}

function unwrapMessageContent(content: proto.IMessage | null | undefined): proto.IMessage | undefined {
  if (!content) return undefined;
  let current: any = content;
  for (let i = 0; i < 4; i++) {
    if (current?.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current?.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current?.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current?.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else if (current?.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current as proto.IMessage;
}

function isLikelyQuestionOrGreeting(text: string, botDisplayName: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  if (lower.includes('?')) return true;

  const firstWordOfBot = botDisplayName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)[0];
  if (firstWordOfBot && firstWordOfBot.length >= 2 && lower.includes(firstWordOfBot)) {
    return true;
  }

  const conversationalHints = [
    'কেমন আছ',
    'কেমন আছেন',
    'কি করো',
    'কী করো',
    'কি খবর',
    'কী খবর',
    'সালাম',
    'assalamu',
    'salam',
    'hello',
    'hi ',
    'hey',
    'হ্যালো',
    'হাই',
    'ভালোবাসি',
    'love you',
    'miss you',
    'মিস করি',
    'মিস করছি',
    'বলো',
    'বলতো',
    'বলোতো',
    'শুনো',
    'জানু',
    'জান ',
    'সোনা',
    'বাবু',
    'কেন',
    'কিভাবে',
    'কীভাবে',
    'কোথায়',
    'কখন',
    'কত',
    'কোনটা',
    'ব্যাখ্যা',
    'মানে কি',
    'ki koro',
    'kemon acho',
    'kmn acho',
    'kmn aso',
  ];
  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'হাই' || lower === 'হ্যালো') {
    return true;
  }
  return conversationalHints.some((hint) => lower.includes(hint));
}

async function handleCompanionIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  const settings = getSettings();
  if (settings.companionEnabled === false) return;

  const msgId = msg.key?.id;
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || !msgId) return;
  if (msg.key?.fromMe) return;
  if (
    remoteJid === 'status@broadcast' ||
    remoteJid.endsWith('@broadcast') ||
    remoteJid.endsWith('@newsletter')
  ) {
    return;
  }

  if (processedMsgIds.has(msgId)) return;
  processedMsgIds.add(msgId);
  if (processedMsgIds.size > 1000) {
    const first = processedMsgIds.values().next().value;
    if (first) processedMsgIds.delete(first);
  }

  const isGroup = remoteJid.endsWith('@g.us');
  if (!isGroup && settings.companionInboxReply === false) return;
  if (isGroup && settings.companionGroupReply === false) return;

  // Optional per-group allowlist
  if (isGroup && Array.isArray(settings.companionAllowedGroups) && settings.companionAllowedGroups.length > 0) {
    if (!settings.companionAllowedGroups.includes(remoteJid)) return;
  }

  const rawSenderJid = isGroup ? msg.key?.participant || remoteJid : remoteJid;
  const senderPhone = cleanPhoneDigits(rawSenderJid);
  const myPhone = cleanPhoneDigits(sock.user?.id);
  const myLidPhone = cleanPhoneDigits((sock.user as any)?.lid);
  const primaryBotPhone = cleanPhoneDigits(primaryJidGetter());

  // Prevent bot-to-bot ping-pong loop between Primary Security Bot & Secondary Companion Bot
  if (senderPhone && (senderPhone === myPhone || senderPhone === myLidPhone || (primaryBotPhone && senderPhone === primaryBotPhone))) {
    return;
  }

  const unwrapped = unwrapMessageContent(msg.message);
  if (!unwrapped) return;

  // Ignore reaction/protocol/sticker/poll-update/call spam cleanly (Companion ONLY chats)
  if (
    unwrapped.reactionMessage ||
    unwrapped.protocolMessage ||
    unwrapped.stickerMessage ||
    unwrapped.pollUpdateMessage
  ) {
    return;
  }

  const textBody = (
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage?.caption ||
    unwrapped.videoMessage?.caption ||
    ''
  ).trim();

  const hasAudio = Boolean(unwrapped.audioMessage);
  const hasImage = Boolean(unwrapped.imageMessage);

  // Skip empty messages unless it's an image/audio in inbox or addressed in group
  if (!textBody && !hasAudio && !hasImage) return;

  // Ignore primary bot moderation alert style messages
  if (
    textBody &&
    /^(⚠️\s*\*?সতর্কবার্তা|🔕\s*\*?সাময়িক|🌙|🚫\s*\*?নাইট|🔒)/.test(textBody)
  ) {
    return;
  }

  const botName = (settings.companionName || 'নিলা (Nila)').trim();

  // Check Group reply rules
  if (isGroup) {
    const mode = settings.companionGroupMode || 'smart_auto';
    const ctxInfo = unwrapped.extendedTextMessage?.contextInfo || unwrapped.imageMessage?.contextInfo;
    const mentionedJids: string[] = Array.isArray(ctxInfo?.mentionedJid) ? ctxInfo.mentionedJid : [];
    const quotedParticipant = ctxInfo?.participant ? cleanPhoneDigits(ctxInfo.participant) : '';

    const isTagged = mentionedJids.some((mj) => {
      const p = cleanPhoneDigits(mj);
      return p && (p === myPhone || p === myLidPhone);
    });
    const isRepliedToMe = Boolean(
      quotedParticipant && (quotedParticipant === myPhone || quotedParticipant === myLidPhone)
    );
    const isAddressed = isTagged || isRepliedToMe;

    if (mode === 'mention_or_reply') {
      if (!isAddressed && !isLikelyQuestionOrGreeting(textBody, botName).valueOf()) {
        // Strict check for mention_or_reply: require tag, quote-reply, or calling her exact first name
        const firstWord = botName.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/)[0];
        const calledByName = Boolean(firstWord && firstWord.length >= 2 && textBody.toLowerCase().includes(firstWord));
        if (!calledByName) return;
      } else if (!isAddressed) {
        const firstWord = botName.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/)[0];
        const calledByName = Boolean(firstWord && firstWord.length >= 2 && textBody.toLowerCase().includes(firstWord));
        if (!calledByName) return;
      }
    } else if (mode === 'smart_auto') {
      if (!isAddressed) {
        // In smart_auto, skip ultra-short noise ("ok", "hmm", "👍", single emoji) or random media without caption
        if (!textBody && (hasImage || hasAudio)) return;
        if (textBody.length < 3) return;
        if (!isLikelyQuestionOrGreeting(textBody, botName) && textBody.split(/\s+/).length < 3) {
          return;
        }
      }
    }
    // For audio/image in group mode 'all', skip media without text unless addressed
    if (!isAddressed && !textBody && mode !== 'all') return;
  }

  // Cooldown & concurrency protection per chat
  const minCooldownMs = Math.max(isGroup ? 3000 : 2000, (settings.companionCooldownSec ?? 6) * 1000);
  const lastAt = lastReplyAtByChat.get(remoteJid) || 0;
  if (Date.now() - lastAt < minCooldownMs) {
    // Still allow direct mention/reply in group after 2s
    if (!isGroup || Date.now() - lastAt < 2000) return;
  }
  if (inFlightChats.has(remoteJid)) return;
  if (!checkAndRecordGlobalAntiBanQuota()) {
    console.warn('[Companion Anti-Ban Guard] Global reply rate cap reached temporarily to protect account.');
    return;
  }

  inFlightChats.add(remoteJid);
  try {
    let chatName = msg.pushName || senderPhone || 'Friend';
    if (isGroup) {
      let cachedSubject = groupSubjectCache.get(remoteJid);
      if (!cachedSubject) {
        try {
          const meta = await sock.groupMetadata(remoteJid);
          if (meta?.subject) {
            cachedSubject = meta.subject;
            groupSubjectCache.set(remoteJid, meta.subject);
          }
        } catch {
          // non-blocking
        }
      }
      chatName = cachedSubject || 'WhatsApp Group';
    }

    const userName = msg.pushName || senderPhone || 'বন্ধু';
    const memoryKey = `companion:${remoteJid}:${isGroup ? senderPhone : 'dm'}`;

    try {
      await sock.sendPresenceUpdate('composing', remoteJid);
    } catch {}

    const aiOptions = {
      companionName: botName,
      romanticLevel: settings.companionRomanticLevel || 'romantic',
      strictAccuracy: settings.companionStrictAccuracy !== false,
      customBio: settings.companionCustomBio || '',
      isPrivate: !isGroup,
      aiProvider: settings.aiProvider || 'auto',
      geminiModel: 'gemini-4-hydrogen',
      memoryLimit: 12,
    };

    let result;
    if ((hasAudio || hasImage) && !textBody) {
      try {
        const buffer = await downloadMediaMessage(msg as any, 'buffer', {});
        const mime = hasAudio
          ? unwrapped.audioMessage?.mimetype || 'audio/ogg; codecs=opus'
          : unwrapped.imageMessage?.mimetype || 'image/jpeg';
        result = await getCompanionMultimodalResponse(
          buffer as Buffer,
          mime,
          textBody,
          hasAudio ? 'audio' : 'image',
          senderPhone,
          userName,
          chatName,
          memoryKey,
          aiOptions
        );
      } catch {
        result = { reply: '', provider: 'none' as const, latencyMs: 0, error: 'Media download failed' };
      }
    } else if (hasImage && textBody) {
      try {
        const buffer = await downloadMediaMessage(msg as any, 'buffer', {});
        const mime = unwrapped.imageMessage?.mimetype || 'image/jpeg';
        result = await getCompanionMultimodalResponse(
          buffer as Buffer,
          mime,
          textBody,
          'image',
          senderPhone,
          userName,
          chatName,
          memoryKey,
          aiOptions
        );
      } catch {
        result = await getCompanionFemaleResponse(
          textBody,
          senderPhone,
          userName,
          chatName,
          memoryKey,
          aiOptions
        );
      }
    } else {
      result = await getCompanionFemaleResponse(
        textBody,
        senderPhone,
        userName,
        chatName,
        memoryKey,
        aiOptions
      );
    }

    if (!result?.reply || result.provider === 'none') {
      try {
        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch {}
      return;
    }

    // Human-like reading/typing pause (1.4s - 2.2s) to protect WhatsApp account from bot-speed detection
    const naturalDelayMs = 1400 + Math.floor(Math.random() * 800);
    await new Promise((r) => setTimeout(r, naturalDelayMs));
    await sock.sendMessage(remoteJid, { text: result.reply }, { quoted: msg as any });
    try {
      await sock.sendPresenceUpdate('paused', remoteJid);
    } catch {}

    const sentNow = Date.now();
    lastReplyAtByChat.set(remoteJid, sentNow);
    recentGlobalReplyTimestamps.push(sentNow);
    companionState.repliesSent += 1;
    if (isGroup) companionState.groupReplies += 1;
    else companionState.inboxReplies += 1;

    companionState.recentChats.unshift({
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      chatJid: remoteJid,
      chatName,
      senderName: userName,
      isGroup,
      userText: textBody || (hasAudio ? '[ভয়েস নোট]' : '[ছবি]'),
      botReply: result.reply,
      provider: result.provider,
      timestamp: Date.now(),
    });
    if (companionState.recentChats.length > 15) {
      companionState.recentChats = companionState.recentChats.slice(0, 15);
    }
  } catch (err: any) {
    console.warn('[Companion Bot Error]:', err?.message || err);
  } finally {
    inFlightChats.delete(remoteJid);
  }
}

function setupCompanionSocketEvents(sock: WASocket, socketToken: number) {
  sock.ev.on('connection.update', async (update) => {
    if (socketToken !== activeCompanionToken || sock !== companionSock) return;

    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        companionState.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 5 });
      } catch {}
    }

    if (connection === 'connecting') {
      if (companionState.status !== 'pairing') {
        companionState.status = 'connecting';
        companionState.step = 'initializing';
        companionState.stepMessage = 'দ্বিতীয় WhatsApp অ্যাকাউন্ট সার্ভারের সাথে সংযোগ হচ্ছে...';
        companionState.lastConnectionStatus = 'Connecting companion account...';
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      clearCompanionReconnectTimer();
      companionState.status = 'connected';
      companionState.step = 'connected';
      companionState.stepMessage = 'দ্বিতীয় Female AI অ্যাকাউন্ট সফলভাবে কানেক্ট হয়েছে!';
      companionState.lastConnectionStatus = 'Connected & Ready to Chat';
      companionState.user = sock.user;
      if (sock.user?.id && !companionState.phoneNumber) {
        companionState.phoneNumber = cleanPhoneDigits(sock.user.id);
      }
      companionState.lastError = null;
      companionState.pairingCode = '';
      companionState.qrCodeDataUrl = '';
      companionState.pairingStartedAt = 0;

      setTimeout(async () => {
        if (socketToken !== activeCompanionToken || sock !== companionSock) return;
        await refreshCompanionGroups().catch(() => {});
      }, 900);
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errMsg = lastDisconnect?.error?.message || 'Connection closed';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
      const isBanned = statusCode === 403 || statusCode === 405 || /banned|blocked|restricted/i.test(errMsg);
      const isRegistered = isVerifiedCompanionCreds(sock.authState?.creds) || hasRegisteredCompanionCreds();

      if (manualDisconnect) {
        companionState.status = 'disconnected';
        companionState.step = 'idle';
        companionState.lastConnectionStatus = 'Disconnected by admin';
        return;
      }

      if (isLoggedOut) {
        clearCompanionReconnectTimer();
        companionState.status = 'disconnected';
        companionState.step = 'idle';
        companionState.stepMessage = 'দ্বিতীয় অ্যাকাউন্ট লগআউট বা অসম্পূর্ণ সেশন ছিল। পুনরায় কানেক্ট করুন।';
        companionState.lastConnectionStatus = 'Logged out (401) — Re-pairing required';
        companionState.lastError = errMsg;
        companionState.pairingCode = '';
        companionState.qrCodeDataUrl = '';
        companionState.pairingStartedAt = 0;
        companionState.user = null;
        wipeCompanionSessionsDir();
        return;
      }

      if (isBanned) {
        clearCompanionReconnectTimer();
        if (!isRegistered) wipeCompanionSessionsDir();
        companionState.status = 'disconnected';
        companionState.step = 'error';
        companionState.stepMessage =
          statusCode === 405
            ? 'WhatsApp সার্ভার হ্যান্ডশেক প্রত্যাখ্যান করেছে (405 Connection Failure)। কিছুক্ষণ অপেক্ষা করে চেষ্টা করুন অথবা নম্বর স্ট্যাটাস চেক করুন।'
            : `WhatsApp থেকে সাময়িক সীমাবদ্ধতা দেওয়া হয়েছে (${statusCode || 'Restricted'})। কিছুক্ষণ অপেক্ষা করে চেষ্টা করুন।`;
        companionState.lastConnectionStatus = `Closed (${statusCode || 'Restricted'}): ${errMsg}`;
        companionState.lastError = errMsg;
        companionState.pairingCode = '';
        companionState.pairingStartedAt = 0;
        return;
      }

      if (isReplaced) {
        clearCompanionReconnectTimer();
        companionState.status = 'disconnected';
        companionState.step = 'error';
        companionState.stepMessage = 'অন্য জায়গায় একই সেশন চালু হওয়ায় সংযোগ বিচ্ছিন্ন হয়েছে।';
        companionState.lastConnectionStatus = 'Replaced by another session (440)';
        companionState.lastError = errMsg;
        return;
      }

      if (isRestartRequired || isRegistered) {
        companionState.status = 'connecting';
        companionState.step = 'initializing';
        companionState.stepMessage = isRestartRequired
          ? 'পেয়ারিং ভেরিফাই সম্পন্ন! দ্বিতীয় অ্যাকাউন্ট কানেক্ট হচ্ছে...'
          : 'পুনঃসংযোগ চেষ্টা চলছে...';
        companionState.lastConnectionStatus = isRestartRequired
          ? 'Pairing verified — connecting...'
          : `Reconnecting (${reconnectAttempts + 1})...`;
        companionState.lastError = null;

        if (reconnectAttempts >= 35) {
          companionState.status = 'disconnected';
          companionState.step = 'error';
          companionState.stepMessage = 'নেটওয়ার্ক পাওয়া যায়নি। পুনরায় কানেক্ট করুন।';
          return;
        }
        const delayMs = isRestartRequired ? 900 : Math.min(30000, 2500 * Math.pow(2, Math.min(4, reconnectAttempts)));
        reconnectAttempts += 1;
        scheduleCompanionReconnect(delayMs);
        return;
      }

      const elapsedSec =
        companionState.pairingStartedAt > 0 ? (Date.now() - companionState.pairingStartedAt) / 1000 : 999;
      if (companionState.status === 'pairing' && companionState.pairingCode && elapsedSec < 120 && statusCode !== 408 && statusCode !== 401) {
        companionState.lastError = errMsg;
        return;
      }

      companionState.status = 'disconnected';
      companionState.step = 'idle';
      companionState.pairingCode = '';
      companionState.qrCodeDataUrl = '';
      companionState.pairingStartedAt = 0;
      companionState.stepMessage = 'সংযোগ বিচ্ছিন্ন হয়েছে। পুনরায় নতুন কোড নিন।';
      companionState.lastConnectionStatus = `Disconnected (${errMsg})`;
      companionState.lastError = errMsg;
    }
  });

  // Zero-moderation: ONLY listen to messages.upsert for friendly Inbox & Group replies
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (socketToken !== activeCompanionToken || sock !== companionSock) return;
    if (type === 'notify' && Array.isArray(messages)) {
      await Promise.allSettled(
        messages.map((msg) => handleCompanionIncomingMessage(sock, msg))
      );
    }
  });
}

async function restoreCompanionSession() {
  if (isRestoringCompanion || manualDisconnect || pairingInFlight) return;
  isRestoringCompanion = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(COMPANION_SESSIONS_DIR);
    if (!isVerifiedCompanionCreds(state.creds)) {
      if (state.creds?.me?.id || fs.readdirSync(COMPANION_SESSIONS_DIR).length > 0) {
        wipeCompanionSessionsDir();
      }
      return;
    }

    destroyCompanionSocket();
    const myToken = activeCompanionToken;
    const version = await resolveCompanionWaVersion();

    companionState.status = 'connecting';
    companionState.step = 'initializing';
    companionState.stepMessage = 'সংরক্ষিত দ্বিতীয় অ্যাকাউন্ট সেশন চালু হচ্ছে...';
    companionState.lastConnectionStatus = 'Restoring 2nd account session...';

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu('Chrome'),
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

    companionSock = sock;
    sock.ev.on('creds.update', async () => {
      if (myToken === activeCompanionToken) await saveCreds();
    });
    setupCompanionSocketEvents(sock, myToken);
  } catch (err: any) {
    companionState.lastConnectionStatus = `Companion restore note: ${err?.message || err}`;
  } finally {
    isRestoringCompanion = false;
  }
}

export function initCompanionBot(getPrimaryJid: () => string | undefined) {
  primaryJidGetter = getPrimaryJid;
  restoreCompanionSession().catch(() => {});
}

export async function refreshCompanionGroups() {
  if (!companionSock || companionState.status !== 'connected') {
    return companionState.groups;
  }
  try {
    const groups = await companionSock.groupFetchAllParticipating();
    const list = Object.values(groups).map((g) => {
      if (g.subject) groupSubjectCache.set(g.id, g.subject);
      return {
        id: g.id,
        name: g.subject || 'WhatsApp Group',
        participants: g.participants?.length || 0,
      };
    });
    companionState.groups = list;
    return list;
  } catch {
    return companionState.groups;
  }
}

export function getCompanionStatus() {
  const elapsed =
    companionState.pairingStartedAt > 0 ? Math.floor((Date.now() - companionState.pairingStartedAt) / 1000) : 0;
  const remainingSeconds = companionState.pairingStartedAt > 0 ? Math.max(0, 120 - elapsed) : 0;
  return {
    status: companionState.status,
    step: companionState.step,
    stepMessage: companionState.stepMessage,
    lastConnectionStatus: companionState.lastConnectionStatus,
    online: companionState.status === 'connected',
    phoneNumber: companionState.phoneNumber,
    pairingCode: companionState.pairingCode,
    qrCode: companionState.qrCodeDataUrl,
    remainingSeconds,
    user: companionState.user,
    repliesSent: companionState.repliesSent,
    inboxReplies: companionState.inboxReplies,
    groupReplies: companionState.groupReplies,
    groups: companionState.groups,
    recentChats: companionState.recentChats,
    lastError: companionState.lastError,
  };
}

export async function startCompanionPairing(phoneInput: string): Promise<{ pairingCode: string; qrCode: string; phoneNumber: string }> {
  const validation = formatAndValidatePhone(phoneInput);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const cleanPhone = validation.cleanPhone;

  // Prevent accidentally linking the exact same active number as Primary Security Bot
  const primaryDigits = cleanPhoneDigits(primaryJidGetter());
  if (primaryDigits && primaryDigits === cleanPhone) {
    throw new Error('এই নম্বরটি ইতোমধ্যেই প্রাইমারি সিকিউরিটি বটে যুক্ত! দ্বিতীয় অ্যাকাউন্টের জন্য আপনার অন্য আরেকটি WhatsApp নম্বর দিন।');
  }

  if (companionSock?.authState?.creds?.registered && companionState.status === 'connected') {
    return { pairingCode: '', qrCode: '', phoneNumber: companionState.phoneNumber || cleanPhone };
  }

  if (pairingInFlight && pairingInFlightPhone === cleanPhone) {
    const res = await pairingInFlight;
    return { ...res, phoneNumber: cleanPhone };
  }

  const msSinceLast = Date.now() - lastPairingRequestAt;
  if (lastPairingRequestAt > 0 && msSinceLast < 90000) {
    if (companionState.pairingCode && companionState.phoneNumber === cleanPhone) {
      return { pairingCode: companionState.pairingCode, qrCode: companionState.qrCodeDataUrl, phoneNumber: cleanPhone };
    }
    const waitSec = Math.ceil((90000 - msSinceLast) / 1000);
    throw new Error(`WhatsApp অ্যান্টি-ব্যান নিরাপত্তার জন্য ${waitSec} সেকেন্ড অপেক্ষা করে আবার চেষ্টা করুন (ঘন ঘন কোড নিলে নম্বর ব্যান হতে পারে)।`);
  }

  pairingInFlightPhone = cleanPhone;
  pairingInFlight = (async () => {
    try {
      manualDisconnect = false;
      reconnectAttempts = 0;
      lastPairingRequestAt = Date.now();

      destroyCompanionSocket();
      const myToken = activeCompanionToken;

      wipeCompanionSessionsDir();

      const { state, saveCreds } = await useMultiFileAuthState(COMPANION_SESSIONS_DIR);
      const version = await resolveCompanionWaVersion();

      companionState.status = 'connecting';
      companionState.step = 'initializing';
      companionState.stepMessage = 'দ্বিতীয় অ্যাকাউন্ট WhatsApp সার্ভারের সাথে সংযোগ হচ্ছে...';
      companionState.lastConnectionStatus = 'Connecting companion socket...';
      companionState.phoneNumber = cleanPhone;
      companionState.lastError = null;

      const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.ubuntu('Chrome'),
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

      companionSock = sock;
      sock.ev.on('creds.update', async () => {
        if (myToken === activeCompanionToken) await saveCreds();
      });
      setupCompanionSocketEvents(sock, myToken);

      return await new Promise<{ pairingCode: string; qrCode: string }>((resolve, reject) => {
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            sock.ev.off('connection.update', onUpdate);
            companionState.step = 'error';
            companionState.stepMessage = 'WhatsApp সার্ভার টাইমআউট হয়েছে। পুনরায় চেষ্টা করুন।';
            reject(new Error('Companion WhatsApp handshake timeout.'));
          }
        }, 35000);

        const onUpdate = async (update: any) => {
          if (resolved || myToken !== activeCompanionToken || sock !== companionSock) return;

          if (update.qr) {
            resolved = true;
            clearTimeout(timer);
            sock.ev.off('connection.update', onUpdate);
            try {
              await new Promise((r) => setTimeout(r, 900));
              if (myToken !== activeCompanionToken || sock !== companionSock) {
                return reject(new Error('Companion socket superseded'));
              }
              const rawCode = await sock.requestPairingCode(cleanPhone);
              console.log(`[Companion Baileys] 8-digit pairing code generated for ${cleanPhone}: ${rawCode}`);
              const formatted =
                rawCode.length === 8 && !rawCode.includes('-')
                  ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
                  : rawCode;
              const qrUrl = await QRCode.toDataURL(update.qr, { margin: 2, scale: 5 }).catch(() => '');

              companionState.status = 'pairing';
              companionState.step = 'waiting_for_phone';
              companionState.stepMessage = '২য় অ্যাকাউন্টের কোড প্রস্তুত! ফোনে কোডটি এন্টার করুন।';
              companionState.lastConnectionStatus = 'Companion pairing code active';
              companionState.pairingCode = formatted;
              companionState.qrCodeDataUrl = qrUrl;
              companionState.pairingStartedAt = Date.now();
              companionState.lastError = null;
              resolve({ pairingCode: formatted, qrCode: qrUrl });
            } catch (err: any) {
              companionState.step = 'error';
              companionState.stepMessage = `কোড ত্রুটি: ${err?.message || 'Error'}`;
              reject(err);
            }
          } else if (update.connection === 'close') {
            const err = update.lastDisconnect?.error as any;
            if (err && !resolved) {
              resolved = true;
              clearTimeout(timer);
              sock.ev.off('connection.update', onUpdate);
              const statusCode = err?.output?.statusCode;
              wipeCompanionSessionsDir();
              if (statusCode !== 403 && statusCode !== 429) {
                lastPairingRequestAt = 0;
              }
              const friendly =
                statusCode === 401
                  ? 'পুরোনো অসম্পূর্ণ সেশন রিসেট করা হয়েছে — আবার কোড নিন।'
                  : statusCode === 405
                    ? 'WhatsApp সার্ভার হ্যান্ডশেক প্রত্যাখ্যান করেছে (405 Connection Failure)। কিছুক্ষণ অপেক্ষা করে চেষ্টা করুন।'
                    : `WhatsApp সংযোগ বিচ্ছিন্ন (Code ${statusCode || 'Err'}): ${err?.message || 'Connection Failure'}`;
              companionState.status = 'disconnected';
              companionState.step = 'error';
              companionState.stepMessage = friendly;
              companionState.lastConnectionStatus = `Closed (${statusCode || 'Err'}): ${err?.message || 'Connection Failure'}`;
              companionState.lastError = friendly;
              reject(new Error(friendly));
            }
          }
        };

        sock.ev.on('connection.update', onUpdate);
      });
    } finally {
      pairingInFlight = null;
      pairingInFlightPhone = '';
    }
  })();

  const result = await pairingInFlight;
  return { ...result, phoneNumber: cleanPhone };
}

export async function disconnectCompanionBot() {
  manualDisconnect = true;
  clearCompanionReconnectTimer();
  reconnectAttempts = 0;
  lastPairingRequestAt = 0;
  if (companionSock) {
    const s = companionSock;
    try {
      await s.logout().catch(() => {});
    } catch {}
    destroyCompanionSocket();
  }
  fs.rmSync(COMPANION_SESSIONS_DIR, { recursive: true, force: true });
  fs.mkdirSync(COMPANION_SESSIONS_DIR, { recursive: true });
  companionState.status = 'disconnected';
  companionState.step = 'idle';
  companionState.stepMessage = 'দ্বিতীয় AI অ্যাকাউন্ট ডিসকানেক্ট করা হয়েছে';
  companionState.lastConnectionStatus = 'Disconnected';
  companionState.pairingCode = '';
  companionState.qrCodeDataUrl = '';
  companionState.pairingStartedAt = 0;
  companionState.phoneNumber = '';
  companionState.user = null;
  companionState.groups = [];
  companionState.lastError = null;
}

export function clearCompanionChatLogsAndMemory() {
  clearCompanionMemory();
  companionState.recentChats = [];
}

export function getCompanionOwnJid(): string | undefined {
  return companionSock?.user?.id;
}
