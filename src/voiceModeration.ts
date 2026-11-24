import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { execFile, execFileSync } from 'child_process';
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
  updateSettings,
} from './moderationEngine.ts';
import { markInboxMessageDeleted } from './inboxStore.ts';
import {
  analyzeVoiceForAbuse,
  type VoiceAbuseAnalysisResult,
} from './aiEngine.ts';

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
    labelBn: 'Base (q5_1) — ব্যালেন্সড ও প্রস্তাবিত (বাংলা + সিলেটি + ইংরেজি)',
    labelEn: 'Base (q5_1) — Balanced & Recommended (Bangla + Sylheti + English)',
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
  | 'needs_review'
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
  dialectDetected?: string;
  scriptSummary: string;
  isProfane: boolean;
  needsReview?: boolean;
  reviewStatus?: 'pending' | 'approved_clean' | 'deleted_confirmed' | 'dismissed';
  reviewReason?: string;
  confidenceScore: number;
  avgTokenProb?: number;
  matchedWords: string[];
  matchedCategories: string[];
  semanticSignals?: string[];
  contextReason: string;
  action: 'deleted' | 'kept' | 'delete_failed' | 'error' | 'review_queued';
  status: VoiceModerationOutcomeStatus;
  deletedFromWhatsapp: boolean;
  attempts: number;
  processingMs: number;
  modelUsed: string;
  dialectPassUsed?: 'auto' | 'bn_sylheti_pass' | 'dual_pass';
  errorMessage?: string;
}

interface PendingVoiceReviewMeta {
  recordId: string;
  groupId: string;
  groupName: string;
  msgKey: proto.IMessageKey;
  senderJid: string;
  canonicalSender: string;
  senderAltJid?: string;
  senderPhone: string;
  matchedWords: string[];
  detectedLanguage: string;
  createdAt: number;
}

interface VoiceModerationDB {
  history: VoiceModerationRecord[];
  processedIds: string[];
  pendingReviews: Record<string, PendingVoiceReviewMeta>;
  stats: {
    totalProcessed: number;
    profaneDetected: number;
    deletedCount: number;
    cleanCount: number;
    needsReviewCount: number;
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
  pendingReviews: {},
  stats: {
    totalProcessed: 0,
    profaneDetected: 0,
    deletedCount: 0,
    cleanCount: 0,
    needsReviewCount: 0,
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
let cachedFfmpegVersion: string | null = null;

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
      const loadedHistory: VoiceModerationRecord[] = Array.isArray(raw?.history) ? raw.history.slice(-300) : [];
      const rawReviews =
        raw?.pendingReviews && typeof raw.pendingReviews === 'object' ? raw.pendingReviews : {};
      const validIds = new Set(loadedHistory.map((r) => r.id));
      const trimmedReviews: Record<string, PendingVoiceReviewMeta> = {};
      for (const [k, v] of Object.entries(rawReviews)) {
        if (validIds.has(k) && v && typeof v === 'object') {
          trimmedReviews[k] = v as PendingVoiceReviewMeta;
        }
      }

      db = {
        history: loadedHistory,
        processedIds: Array.isArray(raw?.processedIds) ? raw.processedIds.slice(-5000) : [],
        pendingReviews: trimmedReviews,
        stats: {
          totalProcessed: Number(raw?.stats?.totalProcessed || 0),
          profaneDetected: Number(raw?.stats?.profaneDetected || 0),
          deletedCount: Number(raw?.stats?.deletedCount || 0),
          cleanCount: Number(raw?.stats?.cleanCount || 0),
          needsReviewCount: Number(raw?.stats?.needsReviewCount || 0),
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

let voiceSaveInFlight = false;
let voiceSavePending = false;

export function flushVoiceModerationSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const tmp = `${VOICE_MODERATION_DB_PATH}.tmp`;
  const payload = JSON.stringify(db);
  try {
    ensureDirectories();
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, VOICE_MODERATION_DB_PATH);
  } catch (err: any) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      try {
        fs.writeFileSync(VOICE_MODERATION_DB_PATH, payload, 'utf8');
        return;
      } catch {}
    }
    console.warn('[VoiceModeration DB Save Warning]:', err?.message || err);
  }
}

async function flushVoiceModerationAsync() {
  if (voiceSaveInFlight) {
    voiceSavePending = true;
    return;
  }
  voiceSaveInFlight = true;
  const tmp = `${VOICE_MODERATION_DB_PATH}.tmp`;
  const payload = JSON.stringify(db);
  try {
    ensureDirectories();
    await fs.promises.writeFile(tmp, payload, 'utf8');
    await fs.promises.rename(tmp, VOICE_MODERATION_DB_PATH);
  } catch (err: any) {
    await fs.promises.unlink(tmp).catch(() => {});
    if (err?.code === 'ENOSPC' || String(err?.message || '').includes('ENOSPC')) {
      await fs.promises.writeFile(VOICE_MODERATION_DB_PATH, payload, 'utf8').catch(() => {});
    } else {
      console.warn('[VoiceModeration DB Async Save Warning]:', err?.message || err);
    }
  } finally {
    voiceSaveInFlight = false;
    if (voiceSavePending) {
      voiceSavePending = false;
      scheduleSaveDB();
    }
  }
}

function scheduleSaveDB() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushVoiceModerationAsync();
  }, 900);
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
    const dropped = db.history.splice(0, db.history.length - 300);
    for (const d of dropped) {
      if (db.pendingReviews[d.id]) delete db.pendingReviews[d.id];
    }
  }
  db.stats.totalProcessed++;
  db.stats.totalProcessingMs += Math.max(0, record.processingMs);
  if (record.isProfane) {
    db.stats.profaneDetected++;
    if (record.deletedFromWhatsapp) db.stats.deletedCount++;
    else if (record.status === 'delete_failed' || record.status === 'no_admin_permission') db.stats.failedCount++;
  } else if (record.status === 'needs_review') {
    db.stats.needsReviewCount++;
  } else if (record.status === 'clean') {
    db.stats.cleanCount++;
  } else if (record.status === 'failed') {
    db.stats.failedCount++;
  }
  scheduleSaveDB();
}

export function resolveWhisperBinaryPath(): string | null {
  const candidates = [WHISPER_BINARY_PATH, '/usr/local/bin/whisper-cli', '/usr/bin/whisper-cli'];
  for (const p of candidates) {
    if (!p || !fs.existsSync(p)) continue;
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      try {
        fs.chmodSync(p, 0o755);
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }
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

function getFfmpegVersionLabel(): string {
  if (cachedFfmpegVersion !== null) return cachedFfmpegVersion;
  const bin = resolveFfmpegBinaryPath();
  if (!bin) {
    cachedFfmpegVersion = 'Not found';
    return cachedFfmpegVersion;
  }
  try {
    const out = execFileSync(bin, ['-version'], { encoding: 'utf8', timeout: 3000 });
    const firstLine = out.split(/\r?\n/)[0] || '';
    const m = firstLine.match(/ffmpeg version\s+([^\s]+)/i);
    cachedFfmpegVersion = m ? m[1] : 'Installed';
  } catch {
    cachedFfmpegVersion = 'Installed';
  }
  return cachedFfmpegVersion;
}

export function getRecommendedModelForHardware(): WhisperModelId {
  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  const cpuCores = Math.max(1, os.cpus()?.length || 2);
  if (totalRamMb <= 1150) return 'tiny-q5_1';
  if (totalRamMb >= 6000 && cpuCores >= 4) return 'small-q5_1';
  return 'base-q5_1';
}

export function getActiveModelId(): WhisperModelId {
  const s = getSettings();
  if (s.voiceAutoSelectModel) {
    return getRecommendedModelForHardware();
  }
  const id = s.voiceWhisperModel || 'base-q5_1';
  const chosen = id in WHISPER_MODELS ? (id as WhisperModelId) : 'base-q5_1';
  // Safety guard: avoid OOM on constrained containers if someone selected small on <1GB total RAM
  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  if (chosen === 'small-q5_1' && totalRamMb < 1100) {
    return 'tiny-q5_1';
  }
  return chosen;
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
          'User-Agent': 'WAGuard-VoiceGuard/2.0',
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
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
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
  const processRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  const cpuLoad1m = Number((os.loadavg?.()[0] || 0).toFixed(2));
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
    processRssMb,
    cpuLoad1m,
    diskFreeGb: Number((diskFreeBytes / (1024 * 1024 * 1024)).toFixed(1)),
    diskTotalGb: Number((diskTotalBytes / (1024 * 1024 * 1024)).toFixed(1)),
    platform: `${os.platform()}/${os.arch()}`,
    ffmpegVersion: getFfmpegVersionLabel(),
    recommendedModelId: getRecommendedModelForHardware(),
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
    const isLikelySilence = durationSec < 0.35 || rms < 0.0018;
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
  language: 'auto' | 'bn' | 'en',
  promptHint?: string
): Promise<{ transcript: string; language: string; avgTokenProb?: number }> {
  const cpuCores = Math.max(1, os.cpus()?.length || 2);
  const threads = cpuCores <= 2 ? cpuCores : Math.min(4, cpuCores - 1);
  const args = [
    '-m',
    modelPath,
    '-l',
    language,
    '-t',
    String(threads),
    '-bs',
    '1',
    '-bo',
    '1',
    '-nf',
    '-oj',
    '-of',
    outPrefix,
    '-np',
  ];
  if (promptHint) {
    args.push('--prompt', promptHint);
  }
  args.push(wavPath);

  await execFileAsync(whisperBin, args, {
    timeout: 60000,
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
  detectSylheti: boolean;
  detectEnglish: boolean;
  detectBanglish: boolean;
  sensitivity: ProfanitySensitivity;
  allowedWords: string[];
  blockedWords: string[];
  reviewUnclearEnabled: boolean;
}>) {
  const s = getSettings();
  return {
    detectBangla: override?.detectBangla ?? s.voiceDetectBangla !== false,
    detectSylheti: override?.detectSylheti ?? s.voiceDetectSylheti !== false,
    detectEnglish: override?.detectEnglish ?? s.voiceDetectEnglish !== false,
    detectBanglish: override?.detectBanglish ?? s.voiceDetectBanglish !== false,
    sensitivity: (override?.sensitivity || s.voiceProfanitySensitivity || 'medium') as ProfanitySensitivity,
    allowedWords: override?.allowedWords ?? (Array.isArray(s.voiceAllowedWords) ? s.voiceAllowedWords : []),
    blockedWords: override?.blockedWords ?? (Array.isArray(s.voiceBlockedWords) ? s.voiceBlockedWords : []),
    reviewUnclearEnabled: override?.reviewUnclearEnabled ?? s.voiceReviewUnclearEnabled !== false,
  };
}

async function convertAudioToConditionedWav(ffmpegBin: string, inputPath: string, wavPath: string) {
  // Normalize volume & filter background rumble/hiss for clearer Bangla/Sylheti recognition
  try {
    await execFileAsync(
      ffmpegBin,
      [
        '-y',
        '-i',
        inputPath,
        '-af',
        'highpass=f=85,lowpass=f=7600,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '-t',
        '90',
        wavPath,
      ],
      { timeout: 28000, maxBuffer: 2 * 1024 * 1024 }
    );
    if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 100) return;
  } catch {}

  await execFileAsync(
    ffmpegBin,
    ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-t', '90', wavPath],
    { timeout: 25000, maxBuffer: 2 * 1024 * 1024 }
  );
}

function normalizeAudioMimeType(mimeType?: string, extHint?: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (base.startsWith('audio/')) return base;
  const ext = (extHint || 'ogg').toLowerCase();
  if (ext === 'mp3' || ext === 'mpeg') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'webm') return 'audio/webm';
  return 'audio/ogg';
}

function mapLanguageToDialectAndScript(languageOrDialect: string): {
  detectedLanguage: string;
  dialectDetected: VoiceProfanityAnalysis['dialectDetected'];
  scriptSummary: VoiceProfanityAnalysis['detectedScriptSummary'];
} {
  const low = (languageOrDialect || '').toLowerCase();
  if (low.includes('sylhet') || low.includes('সিলেটি')) {
    return { detectedLanguage: 'bn', dialectDetected: 'sylheti', scriptSummary: 'bn' };
  }
  if (low.includes('banglish')) {
    return { detectedLanguage: 'bn', dialectDetected: 'banglish', scriptSummary: 'banglish' };
  }
  if (low.includes('bangla') || low.includes('bengali') || low === 'bn') {
    return { detectedLanguage: 'bn', dialectDetected: 'standard_bn', scriptSummary: 'bn' };
  }
  if (low.includes('english') || low === 'en') {
    return { detectedLanguage: 'en', dialectDetected: 'english', scriptSummary: 'en' };
  }
  return { detectedLanguage: low || 'unknown', dialectDetected: 'unknown', scriptSummary: 'unknown' };
}

function buildAnalysisFromGeminiAudioResult(
  gem: VoiceAbuseAnalysisResult,
  profanityConfig: ReturnType<typeof getEffectiveProfanityConfig>
): { analysis: VoiceProfanityAnalysis; detectedLanguage: string } {
  const transcript = gem.transcript || '';
  const localCheck = analyzeVoiceTranscriptProfanity(transcript, profanityConfig);
  const mappedLang = mapLanguageToDialectAndScript(gem.languageOrDialect);

  const hasCustomBlockedHit = localCheck.matchedCategories.includes('custom') && localCheck.isProfane;
  const confidencePct = Math.round(gem.confidence * 100);

  let isProfane = false;
  let needsReview = false;
  let reviewReason: string | undefined;

  if (hasCustomBlockedHit) {
    isProfane = true;
    needsReview = false;
  } else if (gem.action === 'DELETE' && gem.isAbusive && gem.confidence >= 0.75 && gem.severity !== 'LOW') {
    const normalizedTranscript = transcript.trim().toLowerCase();
    const isExplicitlyAllowedOnly =
      normalizedTranscript.length > 0 &&
      profanityConfig.allowedWords.some((w) => w.trim().toLowerCase() === normalizedTranscript);
    if (!isExplicitlyAllowedOnly) {
      isProfane = true;
    }
  } else if (gem.action === 'REVIEW' && profanityConfig.reviewUnclearEnabled !== false) {
    isProfane = false;
    needsReview = true;
    reviewReason = gem.reason || 'বর্ডারলাইন বা অনিশ্চিত ভয়েস কন্টেন্ট (Gemini অডিও রিভিউ)';
  }

  return {
    detectedLanguage: mappedLang.detectedLanguage,
    analysis: {
      cleanedTranscript: transcript || localCheck.cleanedTranscript,
      isHallucinationOrEmpty: !transcript && !isProfane && !needsReview,
      isProfane,
      needsReview,
      reviewReason,
      confidenceScore: Math.max(confidencePct, localCheck.confidenceScore),
      matchedWords:
        localCheck.matchedWords.length > 0
          ? localCheck.matchedWords
          : isProfane
          ? [gem.severity === 'HIGH' ? 'গুরুতর অশ্লীল বক্তব্য' : 'অশালীন বক্তব্য']
          : [],
      matchedCategories:
        localCheck.matchedCategories.length > 0
          ? localCheck.matchedCategories
          : isProfane
          ? ['semantic']
          : [],
      semanticSignals: [
        `Gemini Audio (${gem.languageOrDialect || 'auto'} · ${gem.severity})`,
        ...localCheck.semanticSignals,
      ].slice(0, 4),
      dialectDetected:
        localCheck.dialectDetected !== 'unknown' ? localCheck.dialectDetected : mappedLang.dialectDetected,
      contextReason: gem.reason || localCheck.contextReason,
      detectedScriptSummary:
        localCheck.detectedScriptSummary !== 'unknown' ? localCheck.detectedScriptSummary : mappedLang.scriptSummary,
    },
  };
}

async function transcribeAndAnalyzeAudioBuffer(
  audioBuffer: Buffer,
  extHint: string,
  jobTag: string,
  overrideConfig?: Parameters<typeof getEffectiveProfanityConfig>[0],
  mimeTypeHint?: string
): Promise<{
  durationSec: number;
  transcript: string;
  detectedLanguage: string;
  avgTokenProb?: number;
  analysis: VoiceProfanityAnalysis;
  modelUsed: string;
  dialectPassUsed: 'auto' | 'bn_sylheti_pass' | 'dual_pass';
}> {
  const voiceSettings = getSettings();
  const profanityConfig = getEffectiveProfanityConfig(overrideConfig);
  const normalizedMime = normalizeAudioMimeType(mimeTypeHint, extHint);

  const ffmpegBin = resolveFfmpegBinaryPath();
  const whisperBin = resolveWhisperBinaryPath();

  let modelId = getActiveModelId();
  let modelReady = Boolean(whisperBin && ffmpegBin);
  if (modelReady && !isModelReady(modelId)) {
    const ok = await ensureWhisperModel(modelId);
    if (!ok) {
      const fallbackId = (['base-q5_1', 'tiny-q5_1', 'small-q5_1'] as WhisperModelId[]).find((id) => isModelReady(id));
      if (fallbackId) {
        modelId = fallbackId;
      } else {
        modelReady = false;
      }
    }
  }

  // Hybrid fast path: if offline FFmpeg/Whisper binary or model isn't ready, use Gemini Audio directly when enabled
  if (!ffmpegBin || !whisperBin || !modelReady) {
    if (voiceSettings.voiceUseGeminiApi !== false) {
      const gem = await analyzeVoiceForAbuse(audioBuffer, normalizedMime);
      if (gem.languageOrDialect !== 'error') {
        const mapped = buildAnalysisFromGeminiAudioResult(gem, profanityConfig);
        return {
          durationSec: 0,
          transcript: gem.transcript,
          detectedLanguage: mapped.detectedLanguage,
          analysis: mapped.analysis,
          modelUsed: 'gemini-2.5-flash',
          dialectPassUsed: 'auto',
        };
      }
    }
    if (!ffmpegBin) {
      throw new Error('FFmpeg বাইনারি পাওয়া যায়নি (অডিও কনভার্সন সম্ভব নয়)');
    }
    if (!whisperBin) {
      throw new Error('whisper.cpp বাইনারি পাওয়া যায়নি');
    }
    throw new Error(`অফলাইন Whisper মডেল (${WHISPER_MODELS[modelId].fileName}) প্রস্তুত নয় বা ডাউনলোড ব্যর্থ হয়েছে`);
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
    await convertAudioToConditionedWav(ffmpegBin, inputPath, wavPath);

    const wavStats = inspectWav16kPcm(wavPath);

    if (wavStats.isLikelySilence) {
      return {
        durationSec: wavStats.durationSec,
        transcript: '',
        detectedLanguage: 'silence',
        analysis: {
          cleanedTranscript: '',
          isHallucinationOrEmpty: true,
          isProfane: false,
          needsReview: false,
          confidenceScore: 0,
          matchedWords: [],
          matchedCategories: [],
          semanticSignals: [],
          dialectDetected: 'unknown',
          contextReason: 'নীরব বা অত্যন্ত স্বল্প দৈর্ঘ্যের অডিও — পরিষ্কার হিসেবে রাখা হয়েছে',
          detectedScriptSummary: 'unknown',
        },
        modelUsed: modelId,
        dialectPassUsed: 'auto',
      };
    }

    let firstPass: { transcript: string; language: string; avgTokenProb?: number } | null = null;
    let firstPassFailed = false;
    try {
      firstPass = await runWhisperOnWav(whisperBin, modelPath, wavPath, outPrefix, 'auto');
    } catch {
      firstPassFailed = true;
    }

    let bestTranscript = firstPass?.transcript || '';
    let bestLanguage = firstPass?.language || 'unknown';
    let bestProb = firstPass?.avgTokenProb;
    let bestAnalysis = analyzeVoiceTranscriptProfanity(bestTranscript, profanityConfig, {
      avgTokenProb: bestProb,
      durationSec: wavStats.durationSec,
      rms: wavStats.rms,
    });
    let dialectPassUsed: 'auto' | 'bn_sylheti_pass' | 'dual_pass' = 'auto';

    // Hybrid Gemini multimodal audio verification/fallback:
    // Triggers when offline whisper failed/timed out, flagged profanity/review, hallucinated, or produced non-high-confidence Bangla
    const needsGeminiAudioCheck =
      firstPassFailed ||
      bestAnalysis.isProfane ||
      bestAnalysis.needsReview ||
      bestAnalysis.isHallucinationOrEmpty ||
      bestLanguage !== 'bn' ||
      (typeof bestProb === 'number' && bestProb < 0.78);

    if (voiceSettings.voiceUseGeminiApi !== false && needsGeminiAudioCheck) {
      const gem = await analyzeVoiceForAbuse(audioBuffer, normalizedMime);
      if (gem.languageOrDialect !== 'error') {
        const mapped = buildAnalysisFromGeminiAudioResult(gem, profanityConfig);
        return {
          durationSec: wavStats.durationSec,
          transcript: gem.transcript || bestAnalysis.cleanedTranscript || bestTranscript,
          detectedLanguage: mapped.detectedLanguage,
          avgTokenProb: bestProb,
          analysis: mapped.analysis,
          modelUsed: 'gemini-2.5-flash',
          dialectPassUsed: 'auto',
        };
      }
    }

    if (firstPassFailed && !bestTranscript) {
      throw new Error('whisper.cpp ট্রান্সক্রিপশন ব্যর্থ হয়েছে');
    }

    // Offline fallback: Dedicated Bangla & Sylheti dialect pass when auto-detect chose another language, low prob, or empty on real voice
    const bnOrSylhetiEnabled = profanityConfig.detectBangla || profanityConfig.detectSylheti !== false;
    const autoNotConfidentBn =
      bestLanguage !== 'bn' ||
      (typeof bestProb === 'number' && bestProb < 0.65) ||
      bestAnalysis.isHallucinationOrEmpty;

    if (bnOrSylhetiEnabled && !bestAnalysis.isProfane && autoNotConfidentBn) {
      try {
        const bnPass = await runWhisperOnWav(
          whisperBin,
          modelPath,
          wavPath,
          outPrefixBn,
          'bn',
          'বাংলা এবং সিলেটি কথোপকথন।'
        );
        const bnAnalysis = analyzeVoiceTranscriptProfanity(bnPass.transcript, profanityConfig, {
          avgTokenProb: bnPass.avgTokenProb,
          durationSec: wavStats.durationSec,
          rms: wavStats.rms,
        });

        dialectPassUsed = 'dual_pass';

        const bnMoreInformative =
          !bnAnalysis.isHallucinationOrEmpty &&
          (bestAnalysis.isHallucinationOrEmpty ||
            bnAnalysis.isProfane ||
            (bnAnalysis.needsReview && !bestAnalysis.needsReview) ||
            (['hi', 'ur', 'ar', 'ne', 'pa', 'sd', 'as', 'auto', 'unknown'].includes(bestLanguage) &&
              bnAnalysis.cleanedTranscript.length >= 2) ||
            (bnAnalysis.dialectDetected === 'sylheti' && bnAnalysis.confidenceScore >= bestAnalysis.confidenceScore));

        if (bnMoreInformative) {
          bestTranscript = bnPass.transcript;
          bestLanguage = 'bn';
          bestProb = bnPass.avgTokenProb;
          bestAnalysis = bnAnalysis;
          dialectPassUsed = bestAnalysis.dialectDetected === 'sylheti' ? 'bn_sylheti_pass' : 'dual_pass';
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
      dialectPassUsed,
    };
  } finally {
    // Always remove temporary audio/json conversion files immediately after processing
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

async function waitForMemoryHeadroom() {
  for (let i = 0; i < 3; i++) {
    const freeMb = os.freemem() / (1024 * 1024);
    if (freeMb >= 140) return;
    try {
      (global as any).gc?.();
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
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

    await waitForMemoryHeadroom();

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
    const sttResult = await transcribeAndAnalyzeAudioBuffer(mediaBuf, ext, job.id, undefined, mimeHint);
    const audioDurationSec = sttResult.durationSec > 0 ? sttResult.durationSec : durationHint;
    const processingMs = Date.now() - startedAt;

    // 1. Uncertain / Unclear Audio -> Route safely to Admin Review Queue (do NOT falsely delete!)
    if (!sttResult.analysis.isProfane && sttResult.analysis.needsReview) {
      markProcessedId(job.dedupeKey);
      if (job.msg.key?.id) {
        db.pendingReviews[job.id] = {
          recordId: job.id,
          groupId: job.groupId,
          groupName: job.groupName,
          msgKey: job.msg.key,
          senderJid: job.senderJid,
          canonicalSender: job.canonicalSender,
          senderAltJid: job.senderAltJid,
          senderPhone: job.senderPhone,
          matchedWords: sttResult.analysis.matchedWords,
          detectedLanguage: sttResult.detectedLanguage,
          createdAt: Date.now(),
        };
      }
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
        transcript: sttResult.transcript || '[অস্পষ্ট কণ্ঠস্বর — অ্যাডমিন রিভিউ প্রয়োজন]',
        detectedLanguage: sttResult.detectedLanguage,
        dialectDetected: sttResult.analysis.dialectDetected,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: false,
        needsReview: true,
        reviewStatus: 'pending',
        reviewReason: sttResult.analysis.reviewReason,
        confidenceScore: sttResult.analysis.confidenceScore,
        avgTokenProb: sttResult.avgTokenProb,
        matchedWords: sttResult.analysis.matchedWords,
        matchedCategories: sttResult.analysis.matchedCategories,
        semanticSignals: sttResult.analysis.semanticSignals,
        contextReason: sttResult.analysis.contextReason,
        action: 'review_queued',
        status: 'needs_review',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
        dialectPassUsed: sttResult.dialectPassUsed,
      });
      return;
    }

    // 2. Clean / Safe Speech -> Keep intact
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
        transcript: sttResult.transcript || '[নীরব / সাধারণ অডিও]',
        detectedLanguage: sttResult.detectedLanguage,
        dialectDetected: sttResult.analysis.dialectDetected,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: false,
        needsReview: false,
        confidenceScore: sttResult.analysis.confidenceScore,
        avgTokenProb: sttResult.avgTokenProb,
        matchedWords: [],
        matchedCategories: [],
        semanticSignals: sttResult.analysis.semanticSignals,
        contextReason: sttResult.analysis.contextReason,
        action: 'kept',
        status: 'clean',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
        dialectPassUsed: sttResult.dialectPassUsed,
      });
      return;
    }

    // 3. Profanity Confirmed! Perform fresh permission check before deleting
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
        dialectDetected: sttResult.analysis.dialectDetected,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: true,
        needsReview: false,
        confidenceScore: sttResult.analysis.confidenceScore,
        avgTokenProb: sttResult.avgTokenProb,
        matchedWords: sttResult.analysis.matchedWords,
        matchedCategories: sttResult.analysis.matchedCategories,
        semanticSignals: sttResult.analysis.semanticSignals,
        contextReason: `${sttResult.analysis.contextReason} · Admin Shield সক্রিয় থাকায় অক্ষত রাখা হয়েছে`,
        action: 'kept',
        status: 'skipped_admin',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
        dialectPassUsed: sttResult.dialectPassUsed,
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
        dialectDetected: sttResult.analysis.dialectDetected,
        scriptSummary: sttResult.analysis.detectedScriptSummary,
        isProfane: true,
        needsReview: false,
        confidenceScore: sttResult.analysis.confidenceScore,
        avgTokenProb: sttResult.avgTokenProb,
        matchedWords: sttResult.analysis.matchedWords,
        matchedCategories: sttResult.analysis.matchedCategories,
        semanticSignals: sttResult.analysis.semanticSignals,
        contextReason: `${sttResult.analysis.contextReason} · বটের Admin পারমিশন না থাকায় ডিলিট সম্ভব হয়নি`,
        action: 'delete_failed',
        status: 'no_admin_permission',
        deletedFromWhatsapp: false,
        attempts: job.attempts + 1,
        processingMs,
        modelUsed: sttResult.modelUsed,
        dialectPassUsed: sttResult.dialectPassUsed,
        errorMessage: 'বট গ্রুপের Admin নয়',
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
        `অফলাইন ভয়েস এআই দ্বারা অশালীন বক্তব্য শনাক্ত হওয়ায় মুছে ফেলা হয়েছে (${sttResult.analysis.matchedWords.slice(0, 3).join(', ')})`
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
      dialectDetected: sttResult.analysis.dialectDetected,
      scriptSummary: sttResult.analysis.detectedScriptSummary,
      isProfane: true,
      needsReview: false,
      confidenceScore: sttResult.analysis.confidenceScore,
      avgTokenProb: sttResult.avgTokenProb,
      matchedWords: sttResult.analysis.matchedWords,
      matchedCategories: sttResult.analysis.matchedCategories,
      semanticSignals: sttResult.analysis.semanticSignals,
      contextReason: sttResult.analysis.contextReason,
      action: deleteSuccessful ? 'deleted' : 'delete_failed',
      status: deleteSuccessful ? 'profane_deleted' : 'delete_failed',
      deletedFromWhatsapp: deleteSuccessful,
      attempts: job.attempts + 1,
      processingMs,
      modelUsed: sttResult.modelUsed,
      dialectPassUsed: sttResult.dialectPassUsed,
      errorMessage: deleteSuccessful ? undefined : 'WhatsApp মেসেজ ডিলিট ব্যর্থ (টাইম লিমিট বা কী/কানেকশন সমস্যা)',
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
      dialectDetected: 'unknown',
      scriptSummary: 'unknown',
      isProfane: false,
      needsReview: false,
      confidenceScore: 0,
      matchedWords: [],
      matchedCategories: [],
      semanticSignals: [],
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

  if (pendingQueue.length >= 35) {
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

export async function resolveVoiceReviewItem(
  recordId: string,
  decision: 'delete' | 'approve_clean' | 'dismiss',
  extra?: { addWord?: string }
): Promise<{ success: boolean; message: string; record?: VoiceModerationRecord }> {
  const rec = db.history.find((r) => r.id === recordId);
  if (!rec) {
    return { success: false, message: 'রিভিউ রেকর্ডটি খুঁজে পাওয়া যায়নি।' };
  }

  if (decision === 'approve_clean') {
    rec.needsReview = false;
    rec.reviewStatus = 'approved_clean';
    rec.status = 'clean';
    rec.action = 'kept';
    rec.contextReason = 'অ্যাডমিন রিভিউ দ্বারা নিরাপদ হিসেবে অনুমোদিত';
    db.stats.cleanCount++;
    delete db.pendingReviews[recordId];

    if (extra?.addWord && extra.addWord.trim().length >= 2) {
      const s = getSettings();
      const cur = Array.isArray(s.voiceAllowedWords) ? s.voiceAllowedWords : [];
      const w = extra.addWord.trim();
      if (!cur.some((x) => x.toLowerCase() === w.toLowerCase())) {
        updateSettings({ voiceAllowedWords: [...cur, w] });
      }
    }
    flushVoiceModerationSync();
    return { success: true, message: 'নিরাপদ হিসেবে অনুমোদন করা হয়েছে।', record: rec };
  }

  if (decision === 'dismiss') {
    rec.needsReview = false;
    rec.reviewStatus = 'dismissed';
    delete db.pendingReviews[recordId];
    flushVoiceModerationSync();
    return { success: true, message: 'রিভিউ কিউ থেকে সরানো হয়েছে।', record: rec };
  }

  // decision === 'delete' -> Execute real WhatsApp deletion using stored original message key
  const meta = db.pendingReviews[recordId];
  const sock = socketGetterRef?.();
  if (!sock || !sock.authState?.creds?.registered) {
    return { success: false, message: 'WhatsApp সকেট সংযুক্ত না থাকায় ডিলিট করা যাচ্ছে না।' };
  }
  if (!meta?.msgKey?.id) {
    return { success: false, message: 'মূল WhatsApp Message Key পাওয়া যায়নি (পুরোনো মেসেজ)।' };
  }

  const perms = await checkPermissions(sock, meta.groupId, meta.senderJid, true, meta.senderAltJid);
  if (!perms.isBotAdmin) {
    rec.status = 'no_admin_permission';
    rec.action = 'delete_failed';
    rec.needsReview = false;
    rec.reviewStatus = 'deleted_confirmed';
    rec.errorMessage = 'বট গ্রুপের Admin না থাকায় ডিলিট করা যায়নি';
    rec.contextReason = 'অ্যাডমিন ডিলিট নির্দেশ দিলেও বট গ্রুপ Admin নয়';
    delete db.pendingReviews[recordId];
    flushVoiceModerationSync();
    return { success: false, message: 'বটের গ্রুপ অ্যাডমিন পারমিশন না থাকায় ডিলিট করা যায়নি।', record: rec };
  }

  const syntheticMsg = { key: meta.msgKey } as proto.IWebMessageInfo;
  const ok = await deleteMessageSafely(sock, meta.groupId, syntheticMsg, perms.matchedSenderId, perms.isBotAdmin);

  rec.needsReview = false;
  rec.reviewStatus = 'deleted_confirmed';
  rec.isProfane = true;
  if (ok) {
    rec.status = 'profane_deleted';
    rec.action = 'deleted';
    rec.deletedFromWhatsapp = true;
    rec.contextReason = 'অ্যাডমিন রিভিউ থেকে নিশ্চিত করে WhatsApp থেকে ডিলিট করা হয়েছে';
    db.stats.profaneDetected++;
    db.stats.deletedCount++;
    markInboxMessageDeleted(
      meta.groupId,
      meta.msgKey.id,
      'waguard_voice_ai',
      'অ্যাডমিন রিভিউ দ্বারা অশালীন ভয়েস নোট মুছে ফেলা হয়েছে'
    ).catch(() => {});
    await applyVoiceAbusePenalty(sock, {
      groupId: meta.groupId,
      groupName: perms.groupSubject || meta.groupName,
      senderJid: meta.senderJid,
      canonicalSender: meta.canonicalSender,
      senderAltJid: meta.senderAltJid,
      senderPhone: meta.senderPhone,
      deleteSuccessful: true,
      isBotAdmin: true,
      matchedWords: rec.matchedWords,
      detectedLanguage: rec.detectedLanguage,
    });
  } else {
    rec.status = 'delete_failed';
    rec.action = 'delete_failed';
    rec.deletedFromWhatsapp = false;
    rec.errorMessage = 'WhatsApp ডিলিট প্রত্যাখ্যান করেছে (সম্ভবত মেসেজটি খুব পুরোনো বা আগেই মুছে ফেলা হয়েছে)';
    rec.contextReason = rec.errorMessage;
    db.stats.failedCount++;
  }

  if (extra?.addWord && extra.addWord.trim().length >= 2) {
    const s = getSettings();
    const cur = Array.isArray(s.voiceBlockedWords) ? s.voiceBlockedWords : [];
    const w = extra.addWord.trim();
    if (!cur.some((x) => x.toLowerCase() === w.toLowerCase())) {
      updateSettings({ voiceBlockedWords: [...cur, w] });
    }
  }

  delete db.pendingReviews[recordId];
  flushVoiceModerationSync();
  return {
    success: ok,
    message: ok ? 'মূল WhatsApp ভয়েস মেসেজটি ডিলিট করা হয়েছে!' : rec.errorMessage || 'ডিলিট ব্যর্থ হয়েছে।',
    record: rec,
  };
}

export function initVoiceModeration(socketGetter: () => WASocket | null) {
  socketGetterRef = socketGetter;
  if (!initialized) {
    initialized = true;
    loadDB();
    registerVoiceModerationHook(enqueueIncomingVoiceMessage);

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
  db.pendingReviews = {};
  db.stats = {
    totalProcessed: 0,
    profaneDetected: 0,
    deletedCount: 0,
    cleanCount: 0,
    needsReviewCount: 0,
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
  db.history = db.history.filter((rec) => {
    const keep = (rec?.timestamp || 0) >= cutoff;
    if (!keep && db.pendingReviews[rec.id]) {
      delete db.pendingReviews[rec.id];
    }
    return keep;
  });
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
    detectSylheti?: boolean;
    detectEnglish?: boolean;
    detectBanglish?: boolean;
    sensitivity?: ProfanitySensitivity;
    allowedWords?: string[];
    blockedWords?: string[];
    reviewUnclearEnabled?: boolean;
  };
}) {
  const startedAt = Date.now();
  const ext = getExtFromMimeOrName(params.mimeType, params.fileName);
  const res = await transcribeAndAnalyzeAudioBuffer(
    params.audioBuffer,
    ext,
    'manual_test',
    params.overrideConfig,
    params.mimeType
  );
  return {
    success: true,
    durationSec: res.durationSec,
    transcript: res.transcript,
    detectedLanguage: res.detectedLanguage,
    avgTokenProb: res.avgTokenProb,
    modelUsed: res.modelUsed,
    dialectPassUsed: res.dialectPassUsed,
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

  const pendingReviewCount = db.history.filter(
    (r) => r.status === 'needs_review' && (!r.reviewStatus || r.reviewStatus === 'pending')
  ).length;

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
      pendingReviewCount,
      isProcessing: Boolean(activeJob),
    },
    settings: {
      voiceModerationEnabled: settings.voiceModerationEnabled !== false,
      voiceDetectBangla: settings.voiceDetectBangla !== false,
      voiceDetectSylheti: settings.voiceDetectSylheti !== false,
      voiceDetectEnglish: settings.voiceDetectEnglish !== false,
      voiceDetectBanglish: settings.voiceDetectBanglish !== false,
      voiceProfanitySensitivity: (settings.voiceProfanitySensitivity || 'medium') as ProfanitySensitivity,
      voiceAllowedWords: Array.isArray(settings.voiceAllowedWords) ? settings.voiceAllowedWords : [],
      voiceBlockedWords: Array.isArray(settings.voiceBlockedWords) ? settings.voiceBlockedWords : [],
      voiceWhisperModel: (settings.voiceWhisperModel || activeModelId) as WhisperModelId,
      voiceReviewUnclearEnabled: settings.voiceReviewUnclearEnabled !== false,
      voiceAutoSelectModel: Boolean(settings.voiceAutoSelectModel),
    },
    stats: {
      ...db.stats,
      pendingReviewCount,
      avgProcessingMs,
      dedupeTrackedCount: processedSet.size,
    },
    history: db.history.slice(-historyLimit).reverse().map((rec) => ({
      ...rec,
      canDeleteFromReview: Boolean(db.pendingReviews[rec.id]),
    })),
  };
}
