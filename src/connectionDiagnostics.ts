import fs from 'fs';
import os from 'os';
import path from 'path';
import { DATA_DIR, isPersistentVolumeConfigured } from './storagePaths.ts';

export type DiagnosticSource =
  | 'whatsapp'
  | 'web_server'
  | 'network'
  | 'session_conflict'
  | 'manual';

export type DiagnosticAccount = 'primary' | 'companion' | 'server' | 'web';

export interface ConnectionDiagnosticEvent {
  id: string;
  timestamp: number;
  resolvedAt?: number;
  downtimeSec?: number;
  occurrences: number;
  account: DiagnosticAccount;
  source: DiagnosticSource;
  sourceLabelBn: string;
  sourceLabelEn: string;
  statusCode?: string | number;
  reasonKey: string;
  titleBn: string;
  titleEn: string;
  causeBn: string;
  causeEn: string;
  solutionBn: string;
  solutionEn: string;
  rawError: string;
  autoReconnecting: boolean;
  phoneNumber?: string;
}

interface DiagnosticsDiskState {
  wasPrimaryConnected: boolean;
  wasCompanionConnected: boolean;
  lastCleanShutdown: boolean;
  lastBootAt: number;
  lastShutdownAt: number;
  events: ConnectionDiagnosticEvent[];
}

const DIAGNOSTICS_DB_PATH = path.join(DATA_DIR, 'connection_diagnostics.json');
const MAX_EVENTS = 80;
const serverStartedAt = Date.now();

let state: DiagnosticsDiskState = {
  wasPrimaryConnected: false,
  wasCompanionConnected: false,
  lastCleanShutdown: true,
  lastBootAt: serverStartedAt,
  lastShutdownAt: 0,
  events: [],
};

let initialized = false;

function loadDiagnosticsFromDisk() {
  if (initialized) return;
  initialized = true;
  try {
    if (fs.existsSync(DIAGNOSTICS_DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DIAGNOSTICS_DB_PATH, 'utf8'));
      if (raw && typeof raw === 'object') {
        state = {
          wasPrimaryConnected: Boolean(raw.wasPrimaryConnected),
          wasCompanionConnected: Boolean(raw.wasCompanionConnected),
          lastCleanShutdown: raw.lastCleanShutdown !== false,
          lastBootAt: Number(raw.lastBootAt || 0),
          lastShutdownAt: Number(raw.lastShutdownAt || 0),
          events: Array.isArray(raw.events) ? raw.events.slice(0, MAX_EVENTS) : [],
        };
      }
    }
  } catch (err: any) {
    console.warn('[Diagnostics] Could not read connection_diagnostics.json:', err?.message || err);
  }
}

let diagWriteTimer: ReturnType<typeof setTimeout> | null = null;
let diagWriteInFlight = false;
let diagWritePending = false;

function writeDiagnosticsSyncNow() {
  const payload = JSON.stringify(state);
  const tmpPath = `${DIAGNOSTICS_DB_PATH}.tmp`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, DIAGNOSTICS_DB_PATH);
  } catch (err: any) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    try {
      fs.writeFileSync(DIAGNOSTICS_DB_PATH, payload, 'utf8');
    } catch {
      console.warn('[Diagnostics] Save note:', err?.message || err);
    }
  }
}

async function writeDiagnosticsAsyncNow() {
  if (diagWriteInFlight) {
    diagWritePending = true;
    return;
  }
  diagWriteInFlight = true;
  const payload = JSON.stringify(state);
  const tmpPath = `${DIAGNOSTICS_DB_PATH}.tmp`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    await fs.promises.writeFile(tmpPath, payload, 'utf8');
    await fs.promises.rename(tmpPath, DIAGNOSTICS_DB_PATH);
  } catch (err: any) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      try {
        await fs.promises.writeFile(DIAGNOSTICS_DB_PATH, payload, 'utf8');
      } catch {}
    } else {
      console.warn('[Diagnostics] Async save note:', err?.message || err);
    }
  } finally {
    diagWriteInFlight = false;
    if (diagWritePending) {
      diagWritePending = false;
      scheduleDiagnosticsSave();
    }
  }
}

function scheduleDiagnosticsSave() {
  if (diagWriteTimer) return;
  diagWriteTimer = setTimeout(() => {
    diagWriteTimer = null;
    void writeDiagnosticsAsyncNow();
  }, 500);
}

export function flushDiagnosticsSync() {
  if (diagWriteTimer) {
    clearTimeout(diagWriteTimer);
    diagWriteTimer = null;
  }
  loadDiagnosticsFromDisk();
  writeDiagnosticsSyncNow();
}

function sourceLabels(source: DiagnosticSource): { bn: string; en: string } {
  switch (source) {
    case 'whatsapp':
      return { bn: 'WhatsApp সমস্যা', en: 'WhatsApp Issue' };
    case 'session_conflict':
      return { bn: 'অন্য ডিভাইস কনফ্লিক্ট', en: 'Session Conflict' };
    case 'network':
      return { bn: 'নেটওয়ার্ক / ইন্টারনেট', en: 'Network Drop' };
    case 'web_server':
      return { bn: 'ওয়েব / সার্ভার সমস্যা', en: 'Web & Server' };
    case 'manual':
      return { bn: 'ম্যানুয়াল ডিসকানেক্ট', en: 'Manual Action' };
  }
}

export interface ClassifiedDisconnect {
  source: DiagnosticSource;
  statusCode?: string | number;
  reasonKey: string;
  titleBn: string;
  titleEn: string;
  causeBn: string;
  causeEn: string;
  solutionBn: string;
  solutionEn: string;
}

export function classifyDisconnectReason(params: {
  statusCode?: number | string;
  errMsg?: string;
  manual?: boolean;
  isPairing?: boolean;
}): ClassifiedDisconnect {
  const codeNum = Number(params.statusCode);
  const code = Number.isFinite(codeNum) && codeNum > 0 ? codeNum : params.statusCode;
  const raw = String(params.errMsg || '').trim();
  const lower = raw.toLowerCase();

  if (params.manual) {
    return {
      source: 'manual',
      statusCode: 'MANUAL',
      reasonKey: 'manual_disconnect',
      titleBn: 'অ্যাডমিন নিজে ডিসকানেক্ট করেছেন',
      titleEn: 'Disconnected manually by admin',
      causeBn: 'ড্যাশবোর্ড থেকে Disconnect / Logout বাটন চাপায় WhatsApp সেশন বন্ধ করা হয়েছে।',
      causeEn: 'Session was closed via the dashboard Disconnect action.',
      solutionBn: 'আবার চালু করতে Connect পেজ থেকে ৮-ডিজিট কোড বা QR স্ক্যান করে যুক্ত করুন।',
      solutionEn: 'Re-link from the Connect page using 8-digit pairing code or QR.',
    };
  }

  if (codeNum === 401 || /logged.?out|unauthorized|device_removed|401/.test(lower)) {
    return {
      source: 'whatsapp',
      statusCode: 401,
      reasonKey: 'wa_logged_out_401',
      titleBn: 'WhatsApp থেকে লগআউট / ডিভাইস রিমুভ (401)',
      titleEn: 'WhatsApp Logged Out / Unlinked (401)',
      causeBn:
        'আপনার ফোনের WhatsApp Linked Devices তালিকা থেকে ডিভাইসটি রিমুভ করা হয়েছে, অথবা অসম্পূর্ণ পেয়ারিং সেশন বাতিল হয়েছে।',
      causeEn:
        'The linked device was removed from the WhatsApp mobile app or session credentials expired.',
      solutionBn:
        'Connect পেজে গিয়ে ফোন নম্বর দিয়ে নতুন ৮-ডিজিট কোড বা QR স্ক্যান করে পুনরায় যুক্ত করুন।',
      solutionEn: 'Open Connect page and re-link your WhatsApp with an 8-digit code or QR.',
    };
  }

  if (codeNum === 440 || /replaced|conflict|stream:error.*conflict/.test(lower)) {
    return {
      source: 'session_conflict',
      statusCode: 440,
      reasonKey: 'session_conflict_440',
      titleBn: 'অন্য জায়গায় একই সেশন চালু হওয়ায় ডিসকানেক্ট (440)',
      titleEn: 'Session Replaced by Another Instance (440)',
      causeBn:
        'একই WhatsApp সেশন দুইটি জায়গায় (যেমন পুরোনো ও নতুন সার্ভার deploy বা আরেকটি ট্যাব/হোস্টিং) একসাথে চালু হওয়ায় WhatsApp সংযোগ কেটে দিয়েছে।',
      causeEn:
        'Two servers or instances attempted to use the exact same WhatsApp session simultaneously.',
      solutionBn:
        'পুরোনো সার্ভার বা ডুপ্লিকেট প্রসেস বন্ধ করুন এবং ৩০ সেকেন্ড পর পুনরায় কানেক্ট করুন।',
      solutionEn: 'Ensure only one server instance is running this session, then reconnect.',
    };
  }

  if (codeNum === 403 || codeNum === 405 || codeNum === 406 || /banned|blocked|restricted|forbidden/.test(lower)) {
    return {
      source: 'whatsapp',
      statusCode: code || 405,
      reasonKey: `wa_restricted_${code || 'forbidden'}`,
      titleBn: `WhatsApp সংযোগ প্রত্যাখ্যান/সীমাবদ্ধ করেছে (${code || 405})`,
      titleEn: `WhatsApp Rejected / Restricted Connection (${code || 405})`,
      causeBn: params.isPairing
        ? 'ঘন ঘন পেয়ারিং কোড চাওয়া, সার্ভার IP-তে WhatsApp-এর সাময়িক ব্লক অথবা নম্বরটিতে সাময়িক রেস্ট্রিকশন থাকায় পেয়ারিং বন্ধ হয়েছে।'
        : 'WhatsApp এই নম্বর বা সার্ভার IP-তে সাময়িক সীমাবদ্ধতা দিয়েছে — অটো-রিকানেক্ট থামানো হয়েছে অ্যাকাউন্ট বাঁচাতে।',
      causeEn:
        'WhatsApp blocked/restricted this handshake (often from repeated pairing requests or shared datacenter IPs).',
      solutionBn:
        '১৫-৩০ মিনিট অপেক্ষা করুন, ফোনের WhatsApp ঠিক আছে কিনা দেখুন এবং প্রয়োজনে QR কোড ব্যবহার করুন।',
      solutionEn: 'Wait 15–30 minutes, check WhatsApp on your phone, or try QR scan.',
    };
  }

  if (codeNum === 429 || /rate.?limit|too many/.test(lower)) {
    return {
      source: 'whatsapp',
      statusCode: 429,
      reasonKey: 'wa_rate_limit_429',
      titleBn: 'WhatsApp রেট-লিমিট (Code 429 — অতিরিক্ত চাপ)',
      titleEn: 'WhatsApp Rate Limited (429)',
      causeBn: 'খুব কম সময়ে বেশি রিকোয়েস্ট পাঠানোয় WhatsApp সাময়িকভাবে থামিয়ে দিয়েছে।',
      causeEn: 'Too many requests were sent to WhatsApp servers in a short burst.',
      solutionBn: '১-৫ মিনিট অপেক্ষা করুন, বট নিজে থেকেই আবার সংযোগ নেবে।',
      solutionEn: 'Wait 1–5 minutes for automatic cooldown recovery.',
    };
  }

  if (
    /enotfound|eai_again|econnrefused|econnreset|etimedout|ehostunreach|enetunreach|socket hang up|websocket|dns|fetch failed|network/.test(
      lower
    )
  ) {
    return {
      source: 'network',
      statusCode: code || 'NET',
      reasonKey: 'network_socket_drop',
      titleBn: 'সার্ভার / ইন্টারনেট নেটওয়ার্ক সংযোগ বিচ্ছিন্ন',
      titleEn: 'Server Network / WebSocket Drop',
      causeBn: `সার্ভার ও WhatsApp-এর মাঝের নেটওয়ার্ক বা WebSocket লাইন ড্রপ হয়েছে (${raw || 'Network failure'})।`,
      causeEn: `The WebSocket or network connection between server and WhatsApp dropped (${raw || 'Network failure'}).`,
      solutionBn: 'হোস্টিং ইন্টারনেট/DNS ঠিক থাকলে বট স্বয়ংক্রিয়ভাবে কয়েক সেকেন্ডেই রিকানেক্ট করবে।',
      solutionEn: 'Bot auto-reconnects automatically once network connectivity stabilizes.',
    };
  }

  if (codeNum === 408 || /timed out|timeout/.test(lower)) {
    return {
      source: 'network',
      statusCode: code || 408,
      reasonKey: 'wa_timeout_408',
      titleBn: 'WhatsApp সার্ভার রেসপন্স টাইমআউট (408)',
      titleEn: 'WhatsApp Handshake / Ping Timeout (408)',
      causeBn: 'নির্ধারিত সময়ের মধ্যে WhatsApp সার্ভার থেকে ping/keep-alive উত্তর আসেনি।',
      causeEn: 'WhatsApp server did not reply to keep-alive / handshake in time.',
      solutionBn: 'বট স্বয়ংক্রিয়ভাবে নতুন সকেট খুলে রিকানেক্টের চেষ্টা করছে।',
      solutionEn: 'Bot automatically re-establishes the socket connection.',
    };
  }

  if (codeNum === 515) {
    return {
      source: 'whatsapp',
      statusCode: 515,
      reasonKey: 'wa_stream_restart_515',
      titleBn: 'WhatsApp স্ট্রিম রিস্টার্ট নির্দেশ (515)',
      titleEn: 'WhatsApp Stream Restart Required (515)',
      causeBn: 'WhatsApp সার্ভার সকেট রিস্টার্ট করতে বলেছে (সাধারণত পেয়ারিং বা স্ট্রিম সিঙ্ক এর পর হয়)।',
      causeEn: 'WhatsApp requested a clean socket stream restart.',
      solutionBn: 'স্বয়ংক্রিয়ভাবে রিকানেক্ট সম্পন্ন হবে — কয়েক সেকেন্ড অপেক্ষা করুন।',
      solutionEn: 'Handled automatically by the bot within a couple seconds.',
    };
  }

  if (codeNum === 428 || codeNum === 500 || codeNum === 502 || codeNum === 503 || codeNum === 504 || /stream error|connection closed|closed/.test(lower)) {
    return {
      source: 'whatsapp',
      statusCode: code || 500,
      reasonKey: `wa_stream_close_${code || 'closed'}`,
      titleBn: `WhatsApp ওয়েব স্ট্রিম বিচ্ছিন্ন (${code || 'Closed'})`,
      titleEn: `WhatsApp Web Stream Closed (${code || 'Closed'})`,
      causeBn: `WhatsApp সার্ভার সেশন স্ট্রিম বন্ধ করেছে (${raw || 'Connection closed'})।`,
      causeEn: `WhatsApp closed the active WebSocket stream (${raw || 'Connection closed'}).`,
      solutionBn: 'বট স্বয়ংক্রিয়ভাবে পুনঃসংযোগ চেষ্টা করছে।',
      solutionEn: 'Bot retries connection automatically.',
    };
  }

  return {
    source: 'web_server',
    statusCode: code || 'ERR',
    reasonKey: 'unknown_disconnect',
    titleBn: `সংযোগ বিচ্ছিন্ন (${code ? `Code ${code}` : 'Unknown'})`,
    titleEn: `Connection Closed (${code ? `Code ${code}` : 'Unknown'})`,
    causeBn: raw ? `সার্ভার/WhatsApp এরর: ${raw}` : 'অজানা কারণে WhatsApp সংযোগ বিচ্ছিন্ন হয়েছে।',
    causeEn: raw ? `Connection error: ${raw}` : 'WhatsApp socket closed unexpectedly.',
    solutionBn: 'স্ট্যাটাস রিকানেক্ট না হলে Connect পেজ থেকে সংযোগ পরীক্ষা করুন।',
    solutionEn: 'Check Connect page or run live health check if it does not recover.',
  };
}

function appendEvent(evt: Omit<ConnectionDiagnosticEvent, 'id' | 'occurrences' | 'sourceLabelBn' | 'sourceLabelEn'>): ConnectionDiagnosticEvent {
  loadDiagnosticsFromDisk();
  const labels = sourceLabels(evt.source);
  const now = evt.timestamp || Date.now();

  // Coalesce identical consecutive unresolved events within 25 seconds
  const latest = state.events[0];
  if (
    latest &&
    latest.account === evt.account &&
    latest.reasonKey === evt.reasonKey &&
    !latest.resolvedAt &&
    now - latest.timestamp < 25000
  ) {
    latest.timestamp = now;
    latest.occurrences = (latest.occurrences || 1) + 1;
    latest.rawError = evt.rawError || latest.rawError;
    latest.autoReconnecting = evt.autoReconnecting;
    scheduleDiagnosticsSave();
    return latest;
  }

  const created: ConnectionDiagnosticEvent = {
    ...evt,
    id: `diag_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    occurrences: 1,
    sourceLabelBn: labels.bn,
    sourceLabelEn: labels.en,
  };

  state.events.unshift(created);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(0, MAX_EVENTS);
  }
  scheduleDiagnosticsSave();
  return created;
}

export function initConnectionDiagnosticsOnBoot() {
  loadDiagnosticsFromDisk();
  const now = Date.now();

  if ((state.wasPrimaryConnected || state.wasCompanionConnected) && !state.lastCleanShutdown) {
    appendEvent({
      timestamp: now,
      account: 'server',
      source: 'web_server',
      statusCode: 'REBOOT',
      reasonKey: 'unexpected_server_restart',
      titleBn: 'সার্ভার / কন্টেইনার হঠাৎ রিস্টার্ট হয়েছিল',
      titleEn: 'Unexpected Server / Container Restart',
      causeBn:
        'WhatsApp চালু থাকা অবস্থায় ওয়েব সার্ভার প্রসেস হঠাৎ বন্ধ বা রিস্টার্ট হয়েছিল (যেমন Railway deploy, মেমোরি লিমিট বা সার্ভার ক্র্যাশ)।',
      causeEn:
        'The backend server stopped or rebooted without graceful shutdown while WhatsApp was active.',
      solutionBn:
        'সেভ করা সেশন থাকলে বট নিজে থেকেই আবার কানেক্ট করবে। নিয়মিত হলে RAM ও Persistent Volume (/app/data) চেক করুন।',
      solutionEn:
        'Saved sessions auto-restore on boot. Verify persistent volume (/app/data) and memory if this repeats.',
      rawError: 'Previous run exited without SIGTERM/SIGINT graceful shutdown',
      autoReconnecting: true,
    });
  }

  state.lastBootAt = now;
  state.lastCleanShutdown = false;
  flushDiagnosticsSync();
}

export function recordGracefulServerShutdown(signal = 'SIGTERM') {
  loadDiagnosticsFromDisk();
  const now = Date.now();
  if (state.wasPrimaryConnected || state.wasCompanionConnected) {
    appendEvent({
      timestamp: now,
      account: 'server',
      source: 'web_server',
      statusCode: signal,
      reasonKey: `graceful_shutdown_${signal.toLowerCase()}`,
      titleBn: `সার্ভার আপডেট বা রিস্টার্ট হয়েছে (${signal})`,
      titleEn: `Server Restarted / Redeployed (${signal})`,
      causeBn:
        'নতুন কোড ডিপ্লয়, Railway রিস্টার্ট অথবা মেইনটেনেন্সের কারণে সার্ভার বন্ধ হয়ে পুনরায় চালু হয়েছে।',
      causeEn: `Server received ${signal} shutdown signal (deploy or maintenance restart).`,
      solutionBn:
        '/app/data Volume যুক্ত থাকলে সেশন অটো-রিকানেক্ট হবে।',
      solutionEn: 'Session restores automatically when persistent storage is mounted.',
      rawError: `Process received ${signal}`,
      autoReconnecting: true,
    });
  }
  state.lastCleanShutdown = true;
  state.lastShutdownAt = now;
  flushDiagnosticsSync();
}

export function recordConnectionOpen(account: 'primary' | 'companion', userJid?: string) {
  loadDiagnosticsFromDisk();
  const now = Date.now();
  if (account === 'primary') state.wasPrimaryConnected = true;
  else state.wasCompanionConnected = true;
  state.lastCleanShutdown = false;

  // Mark recent unresolved events for this account (or server reboot) as resolved
  for (const evt of state.events) {
    if (!evt.resolvedAt && (evt.account === account || evt.account === 'server')) {
      evt.resolvedAt = now;
      evt.downtimeSec = Math.max(1, Math.round((now - evt.timestamp) / 1000));
      evt.autoReconnecting = false;
    }
  }
  if (userJid) {
    const latest = state.events[0];
    if (latest && latest.account === account && !latest.phoneNumber) {
      latest.phoneNumber = userJid.split(':')[0].split('@')[0];
    }
  }
  scheduleDiagnosticsSave();
}

export function recordDisconnectEvent(params: {
  account: 'primary' | 'companion';
  statusCode?: number | string;
  errMsg?: string;
  manual?: boolean;
  isPairing?: boolean;
  autoReconnecting: boolean;
  phoneNumber?: string;
}): ConnectionDiagnosticEvent {
  loadDiagnosticsFromDisk();
  if (params.manual) {
    if (params.account === 'primary') state.wasPrimaryConnected = false;
    else state.wasCompanionConnected = false;
  }

  const classified = classifyDisconnectReason({
    statusCode: params.statusCode,
    errMsg: params.errMsg,
    manual: params.manual,
    isPairing: params.isPairing,
  });

  return appendEvent({
    timestamp: Date.now(),
    account: params.account,
    source: classified.source,
    statusCode: classified.statusCode,
    reasonKey: classified.reasonKey,
    titleBn: classified.titleBn,
    titleEn: classified.titleEn,
    causeBn: classified.causeBn,
    causeEn: classified.causeEn,
    solutionBn: classified.solutionBn,
    solutionEn: classified.solutionEn,
    rawError: String(params.errMsg || classified.reasonKey),
    autoReconnecting: params.autoReconnecting,
    phoneNumber: params.phoneNumber,
  });
}

export function recordWebServerProblemEvent(params: {
  category: string;
  title: string;
  details: string;
  suggestion?: string;
  account?: DiagnosticAccount;
  source?: DiagnosticSource;
  statusCode?: string | number;
}): ConnectionDiagnosticEvent {
  return appendEvent({
    timestamp: Date.now(),
    account: params.account || 'server',
    source: params.source || 'web_server',
    statusCode: params.statusCode || params.category.toUpperCase(),
    reasonKey: `srv_${params.category}`,
    titleBn: params.title,
    titleEn: params.title,
    causeBn: params.details,
    causeEn: params.details,
    solutionBn:
      params.suggestion ||
      'সার্ভার হেলথ ও কানেকশন স্ট্যাটাস যাচাই করুন এবং প্রয়োজনে Connect/Integrations চেক করুন।',
    solutionEn: params.suggestion || 'Verify server health and WhatsApp connection status.',
    rawError: params.details,
    autoReconnecting: false,
  });
}

export function getLatestDisconnectForAccount(account: 'primary' | 'companion'): ConnectionDiagnosticEvent | null {
  loadDiagnosticsFromDisk();
  return state.events.find((e) => e.account === account || e.account === 'server') || null;
}

export function clearConnectionDiagnostics() {
  loadDiagnosticsFromDisk();
  state.events = [];
  flushDiagnosticsSync();
}

export function getConnectionDiagnosticsSummary() {
  loadDiagnosticsFromDisk();
  const mem = process.memoryUsage();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  return {
    server: {
      startedAt: serverStartedAt,
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
      hostname: os.hostname(),
      pid: process.pid,
      memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      dataDir: DATA_DIR,
      persistentVolume: isPersistentVolumeConfigured(),
      lastBootAt: state.lastBootAt,
      lastShutdownAt: state.lastShutdownAt,
    },
    events: state.events,
    latestPrimaryDisconnect: state.events.find((e) => e.account === 'primary' || e.account === 'server') || null,
    latestCompanionDisconnect: state.events.find((e) => e.account === 'companion') || null,
    stats: {
      totalEvents: state.events.length,
      whatsappCount: state.events.filter((e) => e.source === 'whatsapp').length,
      webServerCount: state.events.filter((e) => e.source === 'web_server').length,
      networkCount: state.events.filter((e) => e.source === 'network').length,
      conflictCount: state.events.filter((e) => e.source === 'session_conflict').length,
      unresolvedCount: state.events.filter((e) => !e.resolvedAt && e.source !== 'manual').length,
      last24hCount: state.events.filter((e) => e.timestamp >= dayAgo).length,
    },
  };
}
