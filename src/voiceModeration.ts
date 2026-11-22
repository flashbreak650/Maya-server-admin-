import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pino from 'pino';
import ffmpegStatic from 'ffmpeg-static';
import { downloadMediaMessage, type proto, type WASocket } from '@whiskeysockets/baileys';
import {
  VOICE_MODERATION_DB_PATH,
  VOICE_STT_MODELS_DIR,
  VOICE_TEMP_AUDIO_DIR,
  WHISPER_BINARY_PATH,
} from './storagePaths.ts';
import {
  analyzeVoiceTranscriptProfanity,
  type ProfanitySensitivity,
  type VoiceProfanityAnalysis,
} from './voiceProfanity.ts';
import {
  applyVoiceAbusePenalty,
  checkPermissions,
  deleteMessageSafely,
  getSettings,
  registerVoiceModerationHook,
  reportServerProblem,
} from './moderationEngine.ts';
import { markInboxMessageDeleted } from './inboxStore.ts';

const execFileAsync = promisify(execFile);
const silentBaileysLogger = pino({ level: 'silent' });

export type WhisperModelId = 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';

export interface WhisperModelMeta {
  id: WhisperModelId;
  fileName: string;
  url: string;
  sizeBytesApprox: number;
  sizeLabel: string;
  ramEstimateMb: number;
  labelBn: string;
  labelEn: string;
  recommended: boolean;
}

export const WHISPER_MODELS: Record<WhisperModelId, WhisperModelMeta> = {
  'tiny-q5_1': {
    id: 'tiny-q5_1',
    fileName: 'ggml-tiny-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin',
    sizeBytesApprox: 32_200_000,
    sizeLabel: '31 MB',
    ramEstimateMb: 125,
    labelBn: 'Tiny (q5_1) — অতি দ্রুত, সর্বনিম্ন RAM',
    labelEn: 'Tiny (q5_1) — Ultra Fast, Minimal RAM',
    recommended: false,
  },
  'base-q5_1': {
    id: 'base-q5_1',
    fileName: 'ggml-base-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    sizeBytesApprox: 59_700_000,
    sizeLabel: '57 MB',
    ramEstimateMb: 210,
    labelBn: 'Base (q5_1) — ব্যালেন্সড ও প্রস্তাবিত (বাংলা + ইংরেজি)',
    labelEn: 'Base (q5_1) — Balanced & Recommended (Bangla + English)',
    recommended: true,
  },
  'small-q5_1': {
    id: 'small-q5_1',
    fileName: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    sizeBytesApprox: 190_000_000,
    sizeLabel: '182 MB',
    ramEstimateMb: 480,
    labelBn: 'Small (q5_1) — সর্বোচ্চ নির্ভুলতা (বেশি CPU/RAM)',
    labelEn: 'Small (q5_1) — Highest Accuracy (Higher CPU/RAM)',
    recommended: false,
  },
};

export type VoiceModerationOutcomeStatus =
  | 'profane_deleted'
  | 'clean'
  | 'no_admin_permission'
  | 'delete_failed'
  | 'skipped_admin'
  | 'failed';

export interface VoiceModerationRecord {
  id: string;
  dedupeKey: string;
  messageId: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  senderName: string;
  timestamp: number;
  audioDurationSec: number;
  transcript: string;
  detectedLanguage: string;
  scriptSummary: string;
  isProfane: boolean;
  confidenceScore: number;
  matchedWords: string[];
  matchedCategories: string[];
  contextReason: string;
  action: 'deleted' | 'kept' | 'delete_failed' | 'error';
  status: VoiceModerationOutcomeStatus;
  deletedFromWhatsapp: boolean;
  attempts: number;
  processingMs: number;
  modelUsed: string;
  errorMessage?: string;
}

interface VoiceModerationDB {
  history: VoiceModerationRecord[];
  processedIds: string[];
  stats: {
    totalProcessed: number;
    profaneDetected: number;
    deletedCount: number;
    cleanCount: number;
    failedCount: number;
    skippedDuplicates: number;
    totalProcessingMs: number;
  };
}

interface QueuedVoiceJob {
  id: string;
  dedupeKey: string;
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
  attempts: number;
  maxAttempts: number;
  enqueuedAt: number;
  nextRetryAt: number;
  lastError?: string;
}

const DEFAULT_DB: VoiceModerationDB = {
  history: [],
  processedIds: [],
  stats: {
    totalProcessed: 0,
    profaneDetected: 0,
    deletedCount: 0,
    cleanCount: 0,
    failedCount: 0,
    skippedDuplicates: 0,
    totalProcessingMs: 0,
  },
};

let db: VoiceModerationDB = structuredClone(DEFAULT_DB);
const processedSet = new Set<string>();
const activeDedupeKeys = new Set<string>();
const pendingQueue: QueuedVoiceJob[] = [];
const failedRetryQueue: QueuedVoiceJob[] = [];
let activeJob: QueuedVoiceJob | null = null;
let isWorkerRunning = false;
let retrySweepTimer: ReturnType<typeof setInterval> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let socketGetterRef: (() => WASocket | null) | null = null;

const activeModelDownloads = new Map<WhisperModelId, Promise<boolean>>();
const modelDownloadProgress = new Map<
  WhisperModelId,
  { downloading: boolean; progressPercent: number; error: string | null }
>();

function ensureDirectories() {
  for (const dir of [VOICE_STT_MODELS_DIR, VOICE_TEMP_AUDIO_DIR, path.dirname(VOICE_MODERATION_DB_PATH)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function loadDB() {
  ensureDirectories();
  try {
    if (fs.existsSync(VOICE_MODERATION_DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(VOICE_MODERATION_DB_PATH, 'utf8'));
      db = {
        history: Array.isArray(raw?.history) ? raw.history.slice(-300) : [],
        processedIds: Array.isArray(raw?.processedIds) ? raw.processedIds.slice(-5000) : [],
        stats: {
          totalProcessed: Number(raw?.stats?.totalProcessed || 0),
          profaneDetected: Number(raw?.stats?.profaneDetected || 0),
          deletedCount: Number(raw?.stats?.deletedCount || 0),
          cleanCount: Number(raw?.stats?.cleanCount || 0),
          failedCount: Number(raw?.stats?.failedCount || 0),
          skippedDuplicates: Number(raw?.stats?.skippedDuplicates || 0),
          totalProcessingMs: Number(raw?.stats?.totalProcessingMs || 0),
        },
      };
      processedSet.clear();
      for (const key of db.processedIds) {
        if (typeof key === 'string' && key) processedSet.add(key);
      }
    }
  } catch (err: any) {
    console.warn('[VoiceModeration DB Load Warning]:', err?.message || err);
  }
}

export function flushVoiceModerationSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    ensureDirectories();
    const tmp = `${VOICE_MODERATION_DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, VOICE_MODERATION_DB_PATH);
  } catch (err: any) {
    console.warn('[VoiceModeration DB Save Warning]:', err?.message || err);
  }
}

function scheduleSaveDB() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushVoiceModerationSync();
  }, 600);
}

function markProcessedId(dedupeKey: string) {
  if (!dedupeKey || processedSet.has(dedupeKey)) return;
  processedSet.add(dedupeKey);
  db.processedIds.push(dedupeKey);
  if (db.processedIds.length > 5000) {
    const dropped = db.processedIds.splice(0, db.processedIds.length - 5000);
    for (const d of dropped) processedSet.delete(d);
  }
}

function appendHistoryRecord(record: VoiceModerationRecord) {
  db.history.push(record);
  if (db.history.length > 300) {
    db.history = db.history.slice(-300);
  }
  db.stats.totalProcessed++;
  db.stats.totalProcessingMs += Math.max(0, record.processingMs);
  if (record.isProfane) {
    db.stats.profaneDetected++;
    if (record.deletedFromWhatsapp) db.stats.deletedCount++;
    else if (record.status === 'delete_failed' || record.status === 'no_admin_permission') db.stats.failedCount++;
  } else if (record.status === 'clean') {
    db.stats.cleanCount++;
  } else if (record.status === 'failed') {
    db.stats.failedCount++;
  }
  scheduleSaveDB();
}

export function resolveWhisperBinaryPath(): string | null {
  const candidates = [
    WHISPER_BINARY_PATH,
    '/usr/local/bin/whisper-cli',
    '/usr/bin/whisper-cli',
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      }
    } catch {}
  }
  return null;
}

export function resolveFfmpegBinaryPath(): string | null {
  const candidates = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    typeof ffmpegStatic === 'string' ? ffmpegStatic : '',
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      }
    } catch {}
  }
  return null;
}

export function getActiveModelId(): WhisperModelId {
  const s = getSettings();
  const id = s.voiceWhisperModel || 'base-q5_1';
  return id in WHISPER_MODELS ? (id as WhisperModelId) : 'base-q5_1';
}

export function getModelFilePath(modelId: WhisperModelId): string {
  const meta = WHISPER_MODELS[modelId] || WHISPER_MODELS['base-q5_1'];
  return path.join(VOICE_STT_MODELS_DIR, meta.fileName);
}

export function isModelReady(modelId: WhisperModelId): boolean {
  try {
    const filePath = getModelFilePath(modelId);
    if (!fs.existsSync(filePath)) return false;
    const size = fs.statSync(filePath).size;
    return size > 15_000_000;
  } catch {
    return false;
  }
}

function downloadFileWithRedirects(url: string, destTmpPath: string, modelId: WhisperModelId, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Too many HTTP redirects while downloading Whisper model'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'WAGuard-VoiceGuard/1.0',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          downloadFileWithRedirects(nextUrl, destTmpPath, modelId, redirects + 1).then(resolve).catch(reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status} downloading ${modelId}`));
          return;
        }

        const totalBytes = Number(res.headers['content-length'] || 0) || WHISPER_MODELS[modelId].sizeBytesApprox;
        let received = 0;
        const out = fs.createWriteStream(destTmpPath);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          const pct = Math.min(99, Math.max(1, Math.round((received / totalBytes) * 100)));
          modelDownloadProgress.set(modelId, { downloading: true, progressPercent: pct, error: null });
        });
        res.on('error', (err) => {
          out.destroy();
          reject(err);
        });
        out.on('error', (err) => {
          res.destroy();
          reject(err);
        });
        out.on('finish', () => {
          out.close(() => resolve());
        });
        res.pipe(out);
      }
    );
    req.setTimeout(120000, () => {
      req.destroy(new Error('Model download timeout'));
    });
    req.on('error', reject);
  });
}

export async function ensureWhisperModel(modelId?: WhisperModelId): Promise<boolean> {
  const targetId = modelId && modelId in WHISPER_MODELS ? modelId : getActiveModelId();
  if (isModelReady(targetId)) {
    modelDownloadProgress.set(targetId, { downloading: false, progressPercent: 100, error: null });
    return true;
  }

  const inFlight = activeModelDownloads.get(targetId);
  if (inFlight) return inFlight;

  const task = (async () => {
    ensureDirectories();
    const meta = WHISPER_MODELS[targetId];
    const finalPath = getModelFilePath(targetId);
    const tmpPath = `${finalPath}.download.tmp`;
    modelDownloadProgress.set(targetId, { downloading: true, progressPercent: 1, error: null });
    console.log(`[VoiceModeration] Downloading offline Whisper model ${meta.fileName} (${meta.sizeLabel})...`);
    try {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      await downloadFileWithRedirects(meta.url, tmpPath, targetId);
      const stat = fs.statSync(tmpPath);
      if (stat.size < 15_000_000) {
        throw new Error(`Downloaded model file unexpectedly small (${stat.size} bytes)`);
      }
      fs.renameSync(tmpPath, finalPath);
      modelDownloadProgress.set(targetId, { downloading: false, progressPercent: 100, error: null });
      console.log(`[VoiceModeration] Offline Whisper model ready: ${finalPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[VoiceModeration] Model download error (${targetId}):`, msg);
      modelDownloadProgress.set(targetId, { downloading: false, progressPercent: 0, error: msg });
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
      return false;
    } finally {
      activeModelDownloads.delete(targetId);
    }
  })();

  activeModelDownloads.set(targetId, task);
  return task;
}

export function getHardwareSpecs() {
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();
  const cpuCores = Math.max(1, os.cpus()?.length || 2);
  let diskFreeBytes = 0;
  let diskTotalBytes = 0;
  try {
    const st = (fs as any).statfsSync ? (fs as any).statfsSync(VOICE_STT_MODELS_DIR) : null;
    if (st) {
      diskTotalBytes = Number(st.bsize) * Number(st.blocks);
      diskFreeBytes = Number(st.bsize) * Number(st.bavail);
    }
  } catch {}
  return {
    cpuCores,
    totalRamMb: Math.round(totalRamBytes / (1024 * 1024)),
    freeRamMb: Math.round(freeRamBytes / (1024 * 1024)),
    diskFreeGb: Number((diskFreeBytes / (1024 * 1024 * 1024)).toFixed(1)),
    diskTotalGb: Number((diskTotalBytes / (1024 * 1024 * 1024)).toFixed(1)),
    platform: `${os.platform()}/${os.arch()}`,
  };
}

function getExtFromMimeOrName(mime?: string | null, fileName?: string | null): string {
  const cleanName = (fileName || '').toLowerCase();
  const extMatch = cleanName.match(/\.([a-z0-9]{2,5})$/);
  if (extMatch) return extMatch[1];
  const m = (mime || '').toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  if (m.includes('amr')) return 'amr';
  return 'ogg';
}

function inspectWav16kPcm(wavPath: string): { durationSec: number; rms: number; isLikelySilence: boolean } {
  try {
    const buf = fs.readFileSync(wavPath);
    // Find 'data' chunk offset safely (standard WAV is 44 bytes, ffmpeg sometimes inserts LIST/INFO chunks)
    let dataOffset = 44;
    let dataSize = Math.max(0, buf.length - 44);
    let idx = 12;
    while (idx + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', idx, idx + 4);
      const chunkSize = buf.readUInt32LE(idx + 4);
      if (chunkId === 'data') {
        dataOffset = idx + 8;
        dataSize = Math.min(chunkSize, buf.length - dataOffset);
        break;
      }
      idx += 8 + chunkSize + (chunkSize % 2);
    }

    const totalSamples = Math.floor(dataSize / 2);
    const durationSec = Number((totalSamples / 16000).toFixed(2));
    if (totalSamples < 800) {
      return { durationSec, rms: 0, isLikelySilence: true };
    }

    let sumSq = 0;
    const step = totalSamples > 64000 ? Math.floor(totalSamples / 64000) : 1;
    let counted = 0;
    for (let i = 0; i < totalSamples; i += step) {
      const sample = buf.readInt16LE(dataOffset + i * 2) / 32768;
      sumSq += sample * sample;
      counted++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, counted));
    const isLikelySilence = durationSec < 0.35 || rms < 0.0022;
    return { durationSec, rms: Number(rms.toFixed(5)), isLikelySilence };
  } catch {
    return { durationSec: 0, rms: 0.05, isLikelySilence: false };
  }
}

async function runWhisperOnWav(
  whisperBin: string,
  modelPath: string,
  wavPath: string,
  outPrefix: string,
  language: 'auto' | 'bn' | 'en'
): Promise<{ transcript: string; language: string; avgTokenProb?: number }> {
  const cpuCount = Math.min(4, Math.max(1, os.cpus()?.length || 2));
  const args = [
    '-m',
    modelPath,
    '-l',
    language,
    '-t',
    String(cpuCount),
    '-bs',
    '1',
    '-bo',
    '1',
    '-nf',
    '-oj',
    '-of',
    outPrefix,
    '-np',
    wavPath,
  ];

  await execFileAsync(whisperBin, args, {
    timeout: 55000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const jsonPath = `${outPrefix}.json`;
  if (!fs.existsSync(jsonPath)) {
    return { transcript: '', language };
  }
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const detectedLang = String(parsed?.result?.language || language || 'unknown').toLowerCase();
  const segments = Array.isArray(parsed?.transcription) ? parsed.transcription : [];
  const transcript = segments
    .map((s: any) => String(s?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  // Compute average token probability if present in detailed output
  let probSum = 0;
  let probCount = 0;
  for (const seg of segments) {
    if (Array.isArray(seg?.tokens)) {
      for (const tok of seg.tokens) {
        if (typeof tok?.p === 'number' && Number.isFinite(tok.p)) {
          probSum += tok.p;
          probCount++;
        }
      }
    }
  }
  const avgTokenProb = probCount > 0 ? Number((probSum / probCount).toFixed(3)) : undefined;

  return {
    transcript,
    language: detectedLang,
    avgTokenProb,
  };
}

function getEffectiveProfanityConfig(override?: Partial<{
  detectBangla: boolean;
  detectEnglish: boolean;
  detectBanglish: boolean;
  sensitivity: ProfanitySensitivity;
  allowedWords: string[];
  blockedWords: string[];
}>) {
  const s = getSettings();
  return {
    detectBangla: override?.detectBangla ?? s.voiceDetectBangla !== false,
    detectEnglish: override?.detectEnglish ?? s.voiceDetectEnglish !== false,
    detectBanglish: override?.detectBanglish ?? s.voiceDetectBanglish !== false,
    sensitivity: (override?.sensitivity || s.voiceProfanitySensitivity || 'medium') as ProfanitySensitivity,
    allowedWords: override?.allowedWords ?? (Array.isArray(s.voiceAllowedWords) ? s.voiceAllowedWords : []),
    blockedWords: override?.blockedWords ?? (Array.isArray(s.voiceBlockedWords) ? s.voiceBlockedWords : []),
  };
}

async function transcribeAndAnalyzeAudioBuffer(
  audioBuffer: Buffer,
  extHint: string,
  jobTag: string,
  overrideConfig?: Parameters<typeof getEffectiveProfanityConfig>[0]
): Promise<{
  durationSec: number;
  transcript: string;
  detectedLanguage: string;
  avgTokenProb?: number;
  analysis: VoiceProfanityAnalysis;
  modelUsed: WhisperModelId;
}> {
  const ffmpegBin = resolveFfmpegBinaryPath();
  if (!ffmpegBin) {
    throw new Error('FFmpeg বাইনারি পাওয়া যায়নি (অডিও কনভার্সন সম্ভব নয়)');
  }
  const whisperBin = resolveWhisperBinaryPath();
  if (!whisperBin) {
    throw new Error('whisper.cpp বাইনারি পাওয়া যায়নি');
  }

  let modelId = getActiveModelId();
  if (!isModelReady(modelId)) {
    const ok = await ensureWhisperModel(modelId);
    if (!ok) {
      // Fallback to any ready local model on disk before failing
      const fallbackId = (['base-q5_1', 'tiny-q5_1', 'small-q5_1'] as WhisperModelId[]).find((id) => isModelReady(id));
      if (!fallbackId) {
        throw new Error(`অফলাইন Whisper মডেল (${WHISPER_MODELS[modelId].fileName}) প্রস্তুত নয় বা ডাউনলোড ব্যর্থ হয়েছে`);
      }
      modelId = fallbackId;
    }
  }
  const modelPath = getModelFilePath(modelId);

  ensureDirectories();
  const safeBase = `${jobTag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const inputPath = path.join(VOICE_TEMP_AUDIO_DIR, `${safeBase}.${extHint || 'ogg'}`);
  const wavPath = path.join(VOICE_TEMP_AUDIO_DIR, `${safeBase}.wav`);
  const outPrefix = path.join(VOICE_TEMP_AUDIO_DIR, `${safeBase}_out`);
  const outPrefixBn = path.join(VOICE_TEMP_AUDIO_DIR, `${safeBase}_bn`);

  const filesToCleanup = [inputPath, wavPath, `${outPrefix}.json`, `${outPrefixBn}.json`];

  try {
    fs.writeFileSync(inputPath, audioBuffer);
    await execFileAsync(
      ffmpegBin,
      ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-t', '90', wavPath],
      { timeout: 25000, maxBuffer: 2 * 1024 * 1024 }
    );

    const wavStats = inspectWav16kPcm(wavPath);
    const profanityConfig = getEffectiveProfanityConfig(overrideConfig);

    if (wavStats.isLikelySilence) {
      return {
        durationSec: wavStats.durationSec,
        transcript: '',
        detectedLanguage: 'silence',
        analysis: {
          cleanedTranscript: '',
          isHallucinationOrEmpty: true,
          isProfane: false,
          confidenceScore: 0,
          matchedWords: [],
          matchedCategories: [],
          contextReason: 'নীরব বা অত্যন্ত স্বল্প দৈর্ঘ্যের অডিও — পরিষ্কার হিসেবে রাখা হয়েছে',
          detectedScriptSummary: 'unknown',
        },
        modelUsed: modelId,
      };
    }

    const firstPass = await runWhisperOnWav(whisperBin, modelPath, wavPath, outPrefix, 'auto');
    let bestTranscript = firstPass.transcript;
    let bestLanguage = firstPass.language;
    let bestProb = firstPass.avgTokenProb;
    let bestAnalysis = analyzeVoiceTranscriptProfanity(bestTranscript, profanityConfig, bestProb);

    // Whisper base sometimes classifies short noisy Bangla speech as Hindi/Urdu/Arabic or hallucinates;
    // run a targeted Bangla forced-language check if Bangla detection is enabled and auto output was Hindi/Urdu/Arabic/empty.
    const needsBanglaCheck =
      profanityConfig.detectBangla &&
      !bestAnalysis.isProfane &&
      (['hi', 'ur', 'ar', 'ne', 'pa', 'sd', 'auto', 'unknown'].includes(bestLanguage) ||
        bestAnalysis.isHallucinationOrEmpty);

    if (needsBanglaCheck) {
      try {
        const bnPass = await runWhisperOnWav(whisperBin, modelPath, wavPath, outPrefixBn, 'bn');
        const bnAnalysis = analyzeVoiceTranscriptProfanity(bnPass.transcript, profanityConfig, bnPass.avgTokenProb);
        if (
          bnAnalysis.isProfane ||
          (bestAnalysis.isHallucinationOrEmpty && !bnAnalysis.isHallucinationOrEmpty && bnAnalysis.cleanedTranscript.length >= 2)
        ) {
          bestTranscript = bnPass.transcript;
          bestLanguage = 'bn';
          bestProb = bnPass.avgTokenProb;
          bestAnalysis = bnAnalysis;
        }
      } catch {}
    }

    return {
      durationSec: wavStats.durationSec,
      transcript: bestAnalysis.cleanedTranscript || bestTranscript,
      detectedLanguage: bestLanguage,
      avgTokenProb: bestProb,
      analysis: bestAnalysis,
      modelUsed: modelId,
    };
  } finally {
    // Requirement #12: Always remove temporary audio/json files immediately after processing
    for (const f of filesToCleanup) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }
}

function getTempVoiceFolderStats(): { fileCount: number; bytes: number } {
  try {
    if (!fs.existsSync(VOICE_TEMP_AUDIO_DIR)) return { fileCount: 0, bytes: 0 };
    const entries = fs.readdirSync(VOICE_TEMP_AUDIO_DIR);
    let bytes = 0;
    let count = 0;
    for (const name of entries) {
      try {
        const st = fs.statSync(path.join(VOICE_TEMP_AUDIO_DIR, name));
        if (st.isFile()) {
          bytes += st.size;
          count++;
        }
      } catch {}
    }
    return { fileCount: count, bytes };
  } catch {
    return { fileCount: 0, bytes: 0 };
  }
}

async function processVoiceJob(job: QueuedVoiceJob) {
  const startedAt = Date.now();
  const activeSock = socketGetterRef?.() || job.sock;
  const audioMsg = job.msg.message?.audioMessage || (job.msg.message as any)?.ephemeralMessage?.message?.audioMessage;
  const durationHint = Number(audioMsg?.seconds || 0);
  const mimeHint = audioMsg?.mimetype || 'audio/ogg; codecs=opus';

  try {
    if (!activeSock || !activeSock.authState?.creds?.registered) {
      throw new Error('WhatsApp সকেট সংযুক্ত নয়');
    }

    const mediaBuf = (await downloadMediaMessage(
      job.msg as any,
      'buffer',
      {},
      {
        logger: silentBaileysLogger as any,
        reuploadRequest: activeSock.updateMediaMessage,
      }
    )) as Buffer;

    if (!mediaBuf || !Buffer.isBuffer(mediaBuf) || mediaBuf.length < 32) {
      throw new Error('WhatsApp থেকে অডিও ডাউনলোড করা যায়নি বা অডিও ফাইল খালি');
    }

    const ext = getExtFromMimeOrName(mimeHint, null);
    const sttResult = await transcribeAndAnalyzeAudioBuffer(mediaBuf, ext, job.id);
    const audioDurationSec = sttResult.durationSec > 0 ? sttResult.durationSec : durationHint;
    const processingMs = Date.now() - startedAt;

    if (!sttResult.analysis.isProfane) {
      markProcessedId(job.dedupeKey);
      appendHistoryRecord({
        id: job.id,
        dedupeKey: job.dedupeKey,
        messageId: job.msg.key?.id || job.id,
        groupId: job.groupId,
        groupName: job.groupName,
        senderJid: job.senderJid,
        senderPhone: job.senderPhone,
        senderName: job.senderName,
        timestamp: Date.now(),
        audioDurationSec,
        transcript: sttResult.transcript || '[নীরব / অস্পষ্ট অডিও]',
        detectedLanguage: sttResult.detectedLanguage,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: false,
        confidenceScore: sttResult.analysis.confidenceScore,
        matchedWords: [],
        matchedCategories: [],
        contextReason: sttResult.analysis.contextReason,
        action: 'kept',
        status: 'clean',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
      });
      return;
    }

    // Profanity confirmed! Perform fresh permission verification before deleting
    const freshPerms = await checkPermissions(
      activeSock,
      job.groupId,
      job.senderJid,
      true,
      job.senderAltJid
    );
    const settings = getSettings();

    if (freshPerms.isSenderAdmin && settings.adminShield) {
      markProcessedId(job.dedupeKey);
      appendHistoryRecord({
        id: job.id,
        dedupeKey: job.dedupeKey,
        messageId: job.msg.key?.id || job.id,
        groupId: job.groupId,
        groupName: freshPerms.groupSubject || job.groupName,
        senderJid: job.senderJid,
        senderPhone: job.senderPhone,
        senderName: job.senderName,
        timestamp: Date.now(),
        audioDurationSec,
        transcript: sttResult.transcript,
        detectedLanguage: sttResult.detectedLanguage,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: true,
        confidenceScore: sttResult.analysis.confidenceScore,
        matchedWords: sttResult.analysis.matchedWords,
        matchedCategories: sttResult.analysis.matchedCategories,
        contextReason: `${sttResult.analysis.contextReason} · Admin Shield সক্রিয় থাকায় অক্ষত রাখা হয়েছে`,
        action: 'kept',
        status: 'skipped_admin',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
      });
      return;
    }

    if (!freshPerms.isBotAdmin) {
      markProcessedId(job.dedupeKey);
      const groupTitle = freshPerms.groupSubject || job.groupName;
      appendHistoryRecord({
        id: job.id,
        dedupeKey: job.dedupeKey,
        messageId: job.msg.key?.id || job.id,
        groupId: job.groupId,
        groupName: groupTitle,
        senderJid: job.senderJid,
        senderPhone: job.senderPhone,
        senderName: job.senderName,
        timestamp: Date.now(),
        audioDurationSec,
        transcript: sttResult.transcript,
        detectedLanguage: sttResult.detectedLanguage,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: true,
        confidenceScore: sttResult.analysis.confidenceScore,
        matchedWords: sttResult.analysis.matchedWords,
        matchedCategories: sttResult.analysis.matchedCategories,
        contextReason: `${sttResult.analysis.contextReason} · বটের Admin পারমিশন না থাকায় ডিলিট সম্ভব হয়নি`,
        action: 'delete_failed',
        status: 'no_admin_permission',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
      });
      reportServerProblem(
        {
          category: 'admin_permission',
          title: `বটের অ্যাডমিন পারমিশন নেই (${groupTitle})`,
          details: `ভয়েস মেসেজে গালি শনাক্ত হলেও বট গ্রুপ অ্যাডমিন না হওয়ায় মেসেজটি ডিলিট করা যায়নি।`,
          suggestion: `দয়া করে WhatsApp-এ "${groupTitle}" গ্রুপে গিয়ে MAYA বটকে Admin (অ্যাডমিন) বানান।`,
        },
        activeSock
      ).catch(() => {});
      return;
    }

    const deleteSuccessful = await deleteMessageSafely(
      activeSock,
      job.groupId,
      job.msg,
      freshPerms.matchedSenderId,
      freshPerms.isBotAdmin
    );

    if (deleteSuccessful && job.msg.key?.id) {
      markInboxMessageDeleted(
        job.groupId,
        job.msg.key.id,
        'waguard_voice_ai',
        `অফলাইন ভয়েস এআই দ্বারা অশালীন ভাষা শনাক্ত হওয়ায় মুছে ফেলা হয়েছে (${sttResult.analysis.matchedWords.slice(0, 3).join(', ')})`
      ).catch(() => {});
    }

    await applyVoiceAbusePenalty(activeSock, {
      groupId: job.groupId,
      groupName: freshPerms.groupSubject || job.groupName,
      senderJid: job.senderJid,
      canonicalSender: job.canonicalSender,
      senderAltJid: job.senderAltJid,
      senderPhone: job.senderPhone,
      deleteSuccessful,
      isBotAdmin: freshPerms.isBotAdmin,
      matchedWords: sttResult.analysis.matchedWords,
      detectedLanguage: sttResult.detectedLanguage,
    });

    markProcessedId(job.dedupeKey);
    appendHistoryRecord({
      id: job.id,
      dedupeKey: job.dedupeKey,
      messageId: job.msg.key?.id || job.id,
      groupId: job.groupId,
      groupName: freshPerms.groupSubject || job.groupName,
      senderJid: job.senderJid,
      senderPhone: job.senderPhone,
      senderName: job.senderName,
      timestamp: Date.now(),
      audioDurationSec,
      transcript: sttResult.transcript,
      detectedLanguage: sttResult.detectedLanguage,
      scriptSummary: sttResult.analysis.detectedScriptSummary,
      isProfane: true,
      confidenceScore: sttResult.analysis.confidenceScore,
      matchedWords: sttResult.analysis.matchedWords,
      matchedCategories: sttResult.analysis.matchedCategories,
      contextReason: sttResult.analysis.contextReason,
      action: deleteSuccessful ? 'deleted' : 'delete_failed',
      status: deleteSuccessful ? 'profane_deleted' : 'delete_failed',
      deletedFromWhatsapp: deleteSuccessful,
      attempts: job.attempts + 1,
      processingMs,
      modelUsed: sttResult.modelUsed,
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    job.attempts++;
    job.lastError = errMsg;
    if (job.attempts < job.maxAttempts) {
      const backoffMs = job.attempts === 1 ? 2500 : 6000;
      job.nextRetryAt = Date.now() + backoffMs;
      failedRetryQueue.push(job);
      console.warn(
        `[VoiceModeration] Retry scheduled (${job.attempts}/${job.maxAttempts}) for ${job.dedupeKey}: ${errMsg}`
      );
      return;
    }

    markProcessedId(job.dedupeKey);
    appendHistoryRecord({
      id: job.id,
      dedupeKey: job.dedupeKey,
      messageId: job.msg.key?.id || job.id,
      groupId: job.groupId,
      groupName: job.groupName,
      senderJid: job.senderJid,
      senderPhone: job.senderPhone,
      senderName: job.senderName,
      timestamp: Date.now(),
      audioDurationSec: durationHint,
      transcript: '',
      detectedLanguage: 'unknown',
      scriptSummary: 'unknown',
      isProfane: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      contextReason: `প্রসেসিং ব্যর্থ: ${errMsg}`,
      action: 'error',
      status: 'failed',
      deletedFromWhatsapp: false,
      attempts: job.attempts,
      processingMs: Date.now() - startedAt,
      modelUsed: getActiveModelId(),
      errorMessage: errMsg,
    });
  } finally {
    activeDedupeKeys.delete(job.dedupeKey);
  }
}

async function runQueueWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  try {
    while (pendingQueue.length > 0) {
      const next = pendingQueue.shift();
      if (!next) break;
      activeJob = next;
      try {
        await processVoiceJob(next);
      } finally {
        activeJob = null;
      }
      // Small yield between serial transcriptions to keep Baileys heartbeat & HTTP server snappy
      await new Promise((r) => setTimeout(r, 80));
    }
  } finally {
    isWorkerRunning = false;
  }
}

function enqueueIncomingVoiceMessage(params: {
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
}) {
  const settings = getSettings();
  if (settings.voiceModerationEnabled === false) return;
  if (params.isSenderAdmin && settings.adminShield) return;

  const msgId = params.msg.key?.id;
  if (!msgId || !params.groupId) return;

  const dedupeKey = `${params.groupId}:${msgId}`;
  if (processedSet.has(dedupeKey) || activeDedupeKeys.has(dedupeKey)) {
    db.stats.skippedDuplicates++;
    scheduleSaveDB();
    return;
  }

  // Flood guard to prevent unbounded memory growth under mass voice spam
  if (pendingQueue.length >= 25) {
    console.warn(`[VoiceModeration] Queue saturated (${pendingQueue.length}), skipping overflow clip ${dedupeKey}`);
    return;
  }

  activeDedupeKeys.add(dedupeKey);
  pendingQueue.push({
    id: `vm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    dedupeKey,
    sock: params.sock,
    msg: params.msg,
    groupId: params.groupId,
    groupName: params.groupName,
    senderJid: params.senderJid,
    senderAltJid: params.senderAltJid,
    canonicalSender: params.canonicalSender,
    senderPhone: params.senderPhone,
    senderName: params.senderName,
    isSenderAdmin: params.isSenderAdmin,
    isBotAdmin: params.isBotAdmin,
    metaKnown: params.metaKnown,
    attempts: 0,
    maxAttempts: 3,
    enqueuedAt: Date.now(),
    nextRetryAt: Date.now(),
  });

  runQueueWorker().catch((err) => {
    console.error('[VoiceModeration Worker Error]:', err?.message || err);
  });
}

export function initVoiceModeration(socketGetter: () => WASocket | null) {
  socketGetterRef = socketGetter;
  if (!initialized) {
    initialized = true;
    loadDB();
    registerVoiceModerationHook(enqueueIncomingVoiceMessage);

    // Ensure selected quantized Whisper model is present (non-blocking background check)
    const activeModel = getActiveModelId();
    if (!isModelReady(activeModel)) {
      ensureWhisperModel(activeModel).catch(() => {});
    }

    retrySweepTimer = setInterval(() => {
      if (failedRetryQueue.length === 0) return;
      const now = Date.now();
      const due: QueuedVoiceJob[] = [];
      for (let i = failedRetryQueue.length - 1; i >= 0; i--) {
        if (failedRetryQueue[i].nextRetryAt <= now) {
          due.push(failedRetryQueue[i]);
          failedRetryQueue.splice(i, 1);
        }
      }
      if (due.length > 0) {
        pendingQueue.push(...due.reverse());
        runQueueWorker().catch(() => {});
      }
    }, 1500);
    retrySweepTimer.unref?.();
  }
}

export function retryFailedVoiceJobsNow(): number {
  if (failedRetryQueue.length === 0) return 0;
  const count = failedRetryQueue.length;
  while (failedRetryQueue.length > 0) {
    const job = failedRetryQueue.shift();
    if (job) {
      job.nextRetryAt = Date.now();
      pendingQueue.push(job);
    }
  }
  runQueueWorker().catch(() => {});
  return count;
}

export function clearVoiceModerationHistory(): boolean {
  db.history = [];
  db.stats = {
    totalProcessed: 0,
    profaneDetected: 0,
    deletedCount: 0,
    cleanCount: 0,
    failedCount: 0,
    skippedDuplicates: 0,
    totalProcessingMs: 0,
  };
  flushVoiceModerationSync();
  return true;
}

export function pruneExpiredVoiceHistory(maxAgeMs: number): number {
  const cutoff = Date.now() - Math.max(60 * 1000, maxAgeMs);
  if (!Array.isArray(db.history) || db.history.length === 0) return 0;
  const before = db.history.length;
  db.history = db.history.filter((rec) => (rec?.timestamp || 0) >= cutoff);
  const removed = before - db.history.length;
  if (removed > 0) {
    scheduleSaveDB();
  }
  return removed;
}

export async function testAudioBufferOffline(params: {
  audioBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
  overrideConfig?: {
    detectBangla?: boolean;
    detectEnglish?: boolean;
    detectBanglish?: boolean;
    sensitivity?: ProfanitySensitivity;
    allowedWords?: string[];
    blockedWords?: string[];
  };
}) {
  const startedAt = Date.now();
  const ext = getExtFromMimeOrName(params.mimeType, params.fileName);
  const res = await transcribeAndAnalyzeAudioBuffer(
    params.audioBuffer,
    ext,
    'manual_test',
    params.overrideConfig
  );
  return {
    success: true,
    durationSec: res.durationSec,
    transcript: res.transcript,
    detectedLanguage: res.detectedLanguage,
    avgTokenProb: res.avgTokenProb,
    modelUsed: res.modelUsed,
    processingMs: Date.now() - startedAt,
    analysis: res.analysis,
  };
}

export function getVoiceModerationOverview(historyLimit = 100) {
  const settings = getSettings();
  const activeModelId = getActiveModelId();
  const whisperBin = resolveWhisperBinaryPath();
  const ffmpegBin = resolveFfmpegBinaryPath();
  const hardware = getHardwareSpecs();
  const tempFolder = getTempVoiceFolderStats();

  const models = (Object.keys(WHISPER_MODELS) as WhisperModelId[]).map((id) => {
    const meta = WHISPER_MODELS[id];
    const ready = isModelReady(id);
    const dl = modelDownloadProgress.get(id);
    let actualSizeMb = 0;
    if (ready) {
      try {
        actualSizeMb = Number((fs.statSync(getModelFilePath(id)).size / (1024 * 1024)).toFixed(1));
      } catch {}
    }
    return {
      ...meta,
      ready,
      actualSizeMb,
      downloading: Boolean(dl?.downloading),
      progressPercent: ready ? 100 : dl?.progressPercent || 0,
      downloadError: dl?.error || null,
    };
  });

  const avgProcessingMs =
    db.stats.totalProcessed > 0 ? Math.round(db.stats.totalProcessingMs / db.stats.totalProcessed) : 0;

  return {
    engine: {
      offlineReady: Boolean(whisperBin && ffmpegBin && isModelReady(activeModelId)),
      whisperBinaryFound: Boolean(whisperBin),
      whisperBinaryPath: whisperBin || WHISPER_BINARY_PATH,
      ffmpegFound: Boolean(ffmpegBin),
      activeModelId,
      activeModelReady: isModelReady(activeModelId),
      tempAudioFilesCount: tempFolder.fileCount,
      tempAudioBytes: tempFolder.bytes,
      zeroPaidApi: true,
    },
    hardware,
    models,
    queue: {
      activeJobId: activeJob?.id || null,
      activeGroupName: activeJob?.groupName || null,
      pendingCount: pendingQueue.length,
      retryingCount: failedRetryQueue.length,
      isProcessing: Boolean(activeJob),
    },
    settings: {
      voiceModerationEnabled: settings.voiceModerationEnabled !== false,
      voiceDetectBangla: settings.voiceDetectBangla !== false,
      voiceDetectEnglish: settings.voiceDetectEnglish !== false,
      voiceDetectBanglish: settings.voiceDetectBanglish !== false,
      voiceProfanitySensitivity: (settings.voiceProfanitySensitivity || 'medium') as ProfanitySensitivity,
      voiceAllowedWords: Array.isArray(settings.voiceAllowedWords) ? settings.voiceAllowedWords : [],
      voiceBlockedWords: Array.isArray(settings.voiceBlockedWords) ? settings.voiceBlockedWords : [],
      voiceWhisperModel: activeModelId,
    },
    stats: {
      ...db.stats,
      avgProcessingMs,
      dedupeTrackedCount: processedSet.size,
    },
    history: db.history.slice(-historyLimit).reverse(),
  };
}
