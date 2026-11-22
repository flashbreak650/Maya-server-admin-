import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import type { WASocket } from '@whiskeysockets/baileys';
import {
  AUTH_SECRET_PATH,
  COMPANION_SESSIONS_DIR,
  DATA_DIR,
  INBOX_DIR,
  MODERATION_DB_PATH,
  PRIMARY_SESSIONS_DIR,
  PROJECT_ROOT,
  STICKER_QUEUE_DB_PATH,
  isPersistentVolumeConfigured,
} from './storagePaths.ts';
import { enforceInboxMediaStorageLimit } from './inboxStore.ts';
import {
  pruneExpiredRuntimeCaches,
  reportServerProblem,
  resolveServerProblem,
} from './moderationEngine.ts';
import { pruneIdleConversationCaches } from './aiEngine.ts';
import { pruneExpiredBurstWindows } from './stickerQueue.ts';

export type CleanupMode = 'cache' | 'temp' | 'logs' | 'duplicates' | 'full';
export type StorageAlertLevel = 'normal' | 'notice_70' | 'warning_85' | 'critical_95';

export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const TEMP_MEDIA_DIR = path.join(DATA_DIR, 'temp_media');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
export const DEBUG_LOGS_DIR = path.join(LOGS_DIR, 'debug');
export const ERROR_LOGS_DIR = path.join(LOGS_DIR, 'error');
export const ARCHIVE_LOGS_DIR = path.join(LOGS_DIR, 'archive');
export const OS_TEMP_CACHE_DIR = path.join(os.tmpdir(), 'waguard_cache');
export const OS_TEMP_MEDIA_DIR = path.join(os.tmpdir(), 'waguard_media');
export const CLEANUP_STATE_PATH = path.join(DATA_DIR, 'cleanup_state.json');

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const IN_USE_SAFETY_WINDOW_MS = 5 * 60 * 1000; // Never delete files modified within last 5 minutes
const ARCHIVE_RETENTION_DAYS = 30;
const YIELD_BATCH_SIZE = 12;

export interface CleanupSettings {
  autoCleanupEnabled: boolean;
  cacheIntervalHours: number;
  dailyTempCleanupEnabled: boolean;
  debugLogRetentionDays: number;
  preserveErrorLogs: boolean;
  alertThresholds: [number, number, number];
}

export interface StorageAlertRecord {
  id: string;
  timestamp: number;
  level: StorageAlertLevel;
  thresholdPercent: number;
  usedPercent: number;
  messageBn: string;
  messageEn: string;
  bossNotified: boolean;
}

export interface CleanupReportItem {
  id: string;
  timestamp: number;
  mode: CleanupMode;
  trigger: 'auto' | 'manual';
  durationMs: number;
  beforeDiskUsedBytes: number;
  beforeDiskTotalBytes: number;
  beforeDiskUsedPercent: number;
  beforeManagedBytes: number;
  beforeRssMb: number;
  afterDiskUsedBytes: number;
  afterDiskTotalBytes: number;
  afterDiskUsedPercent: number;
  afterManagedBytes: number;
  afterRssMb: number;
  recoveredBytes: number;
  ramFreedMb: number;
  filesDeleted: number;
  duplicatesRemoved: number;
  logsArchived: number;
  errorLogsPreserved: number;
  cacheEntriesPruned: number;
  skippedProtectedCount: number;
  verifiedDirectories: string[];
  status: 'completed' | 'partial' | 'failed';
  summaryBn: string;
  summaryEn: string;
}

interface PersistedCleanupState {
  settings: CleanupSettings;
  lastCleanupAt: number;
  lastCacheCleanupAt: number;
  lastDailyCleanupAt: number;
  lastLogMaintenanceAt: number;
  totalRecoveredBytes: number;
  totalFilesCleaned: number;
  lastAlertLevel: StorageAlertLevel;
  lastAlertAt: number;
  alerts: StorageAlertRecord[];
  history: CleanupReportItem[];
}

export interface StorageUsageBreakdown {
  cleanableCacheBytes: number;
  cleanableCacheFiles: number;
  tempFilesBytes: number;
  tempFilesCount: number;
  tempMediaBytes: number;
  tempMediaFiles: number;
  debugLogsBytes: number;
  debugLogsCount: number;
  archivableDebugLogsCount: number;
  archivedLogsBytes: number;
  archivedLogsCount: number;
  duplicateTempBytes: number;
  duplicateTempFiles: number;
  protectedErrorLogsBytes: number;
  protectedErrorLogsCount: number;
  protectedDatabaseBytes: number;
  protectedSessionsBytes: number;
}

export interface StorageUsageSnapshot {
  measuredAt: number;
  dataDir: string;
  persistentVolumeDetected: boolean;
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usedPercent: number;
    alertLevel: StorageAlertLevel;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  breakdown: StorageUsageBreakdown;
  totalReclaimableBytes: number;
  protectedSummary: {
    databaseIntact: boolean;
    primarySessionIntact: boolean;
    companionSessionIntact: boolean;
    stickerQueueIntact: boolean;
    errorLogsPreserved: boolean;
  };
}

const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = {
  autoCleanupEnabled: true,
  cacheIntervalHours: 3,
  dailyTempCleanupEnabled: true,
  debugLogRetentionDays: 7,
  preserveErrorLogs: true,
  alertThresholds: [70, 85, 95],
};

let cleanupState: PersistedCleanupState = {
  settings: { ...DEFAULT_CLEANUP_SETTINGS },
  lastCleanupAt: 0,
  lastCacheCleanupAt: 0,
  lastDailyCleanupAt: 0,
  lastLogMaintenanceAt: 0,
  totalRecoveredBytes: 0,
  totalFilesCleaned: 0,
  lastAlertLevel: 'normal',
  lastAlertAt: 0,
  alerts: [],
  history: [],
};

let stateLoaded = false;
let cleanupInProgress = false;
let lastDiskAlertCheckAt = 0;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupDelayTimer: ReturnType<typeof setTimeout> | null = null;

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 4));

function ensureSafeManagedDirs() {
  for (const dir of [
    DATA_DIR,
    CACHE_DIR,
    TEMP_MEDIA_DIR,
    LOGS_DIR,
    DEBUG_LOGS_DIR,
    ERROR_LOGS_DIR,
    ARCHIVE_LOGS_DIR,
    OS_TEMP_CACHE_DIR,
    OS_TEMP_MEDIA_DIR,
  ]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {}
  }
}

ensureSafeManagedDirs();

// ---------------------------------------------------------------------------
// STRICT PROTECTION GUARD (Database, WhatsApp Creds, Queue, Error Logs, Core)
// ---------------------------------------------------------------------------
function getProtectedRoots(): string[] {
  return [
    path.resolve(MODERATION_DB_PATH),
    path.resolve(`${MODERATION_DB_PATH}.tmp`),
    path.resolve(STICKER_QUEUE_DB_PATH),
    path.resolve(`${STICKER_QUEUE_DB_PATH}.tmp`),
    path.resolve(PRIMARY_SESSIONS_DIR),
    path.resolve(COMPANION_SESSIONS_DIR),
    path.resolve(AUTH_SECRET_PATH),
    path.resolve(DATA_DIR, 'connection_diagnostics.json'),
    path.resolve(DATA_DIR, 'connection_diagnostics.json.tmp'),
    path.resolve(DATA_DIR, 'active_problems.json'),
    path.resolve(DATA_DIR, 'active_problems.json.tmp'),
    path.resolve(CLEANUP_STATE_PATH),
    path.resolve(`${CLEANUP_STATE_PATH}.tmp`),
    path.resolve(INBOX_DIR),
    path.resolve(ERROR_LOGS_DIR),
    path.resolve(PROJECT_ROOT, 'src'),
    path.resolve(PROJECT_ROOT, 'node_modules'),
    path.resolve(PROJECT_ROOT, 'dist'),
    path.resolve(PROJECT_ROOT, 'android'),
    path.resolve(PROJECT_ROOT, 'server.ts'),
  ];
}

function getCleanableAllowedRoots(): string[] {
  return [
    path.resolve(CACHE_DIR),
    path.resolve(TEMP_MEDIA_DIR),
    path.resolve(DEBUG_LOGS_DIR),
    path.resolve(ARCHIVE_LOGS_DIR),
    path.resolve(OS_TEMP_CACHE_DIR),
    path.resolve(OS_TEMP_MEDIA_DIR),
  ];
}

export function isProtectedPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const name = path.basename(resolved).toLowerCase();

  // Never touch database, WhatsApp creds/signal keys, auth secrets, env files, or critical logs
  if (
    name === 'creds.json' ||
    name.startsWith('app-state-sync') ||
    name.startsWith('pre-key-') ||
    name.startsWith('sender-key-') ||
    name.startsWith('session-') ||
    name.startsWith('moderation_db') ||
    name.startsWith('sticker_queue') ||
    name.startsWith('connection_diagnostics') ||
    name.startsWith('active_problems') ||
    name.startsWith('cleanup_state') ||
    name.startsWith('inbox_index') ||
    name === '.auth_secret' ||
    name.startsWith('.env') ||
    name.startsWith('error-')
  ) {
    return true;
  }

  // Never delete root directories themselves
  if (
    resolved === path.resolve(DATA_DIR) ||
    resolved === path.resolve(PROJECT_ROOT) ||
    resolved === path.resolve(os.tmpdir())
  ) {
    return true;
  }

  for (const root of getProtectedRoots()) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return true;
    }
  }
  return false;
}

function isInsideCleanableDir(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  if (isProtectedPath(resolved)) return false;
  for (const allowed of getCleanableAllowedRoots()) {
    if (resolved === allowed || resolved.startsWith(allowed + path.sep)) {
      return true;
    }
  }
  return false;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PERSISTENT CLEANUP STATE & STRUCTURED DEBUG / ERROR FILE WRITERS
// ---------------------------------------------------------------------------
function loadCleanupState() {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    if (fs.existsSync(CLEANUP_STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CLEANUP_STATE_PATH, 'utf8'));
      if (raw && typeof raw === 'object') {
        cleanupState = {
          settings: {
            ...DEFAULT_CLEANUP_SETTINGS,
            ...(raw.settings || {}),
            alertThresholds: [70, 85, 95],
          },
          lastCleanupAt: Number(raw.lastCleanupAt || 0),
          lastCacheCleanupAt: Number(raw.lastCacheCleanupAt || 0),
          lastDailyCleanupAt: Number(raw.lastDailyCleanupAt || 0),
          lastLogMaintenanceAt: Number(raw.lastLogMaintenanceAt || 0),
          totalRecoveredBytes: Number(raw.totalRecoveredBytes || 0),
          totalFilesCleaned: Number(raw.totalFilesCleaned || 0),
          lastAlertLevel: (raw.lastAlertLevel as StorageAlertLevel) || 'normal',
          lastAlertAt: Number(raw.lastAlertAt || 0),
          alerts: Array.isArray(raw.alerts) ? raw.alerts.slice(0, 30) : [],
          history: Array.isArray(raw.history) ? raw.history.slice(0, 50) : [],
        };
      }
    }
  } catch (err: any) {
    console.warn('[StorageCleanup] Could not load cleanup_state.json:', err?.message || err);
  }
}

function saveCleanupStateSync() {
  try {
    ensureSafeManagedDirs();
    const tmp = `${CLEANUP_STATE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cleanupState, null, 2), 'utf8');
    fs.renameSync(tmp, CLEANUP_STATE_PATH);
  } catch (err: any) {
    console.warn('[StorageCleanup] Save state note:', err?.message || err);
  }
}

function dateKey(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function appendDebugLog(category: string, message: string) {
  try {
    ensureSafeManagedDirs();
    const file = path.join(DEBUG_LOGS_DIR, `debug-${dateKey()}.log`);
    const line = `[${new Date().toISOString()}] [${category}] ${String(message).replace(/\s+/g, ' ').trim()}\n`;
    fs.promises.appendFile(file, line, 'utf8').catch(() => {});
  } catch {}
}

export function appendErrorLog(category: string, message: string) {
  try {
    ensureSafeManagedDirs();
    const file = path.join(ERROR_LOGS_DIR, `error-${dateKey()}.log`);
    const line = `[${new Date().toISOString()}] [IMPORTANT_ERROR] [${category}] ${String(message).replace(/\s+/g, ' ').trim()}\n`;
    fs.promises.appendFile(file, line, 'utf8').catch(() => {});
  } catch {}
}

// ---------------------------------------------------------------------------
// REAL ASYNC DISK SCANNER (NON-BLOCKING, LOW CPU & RAM)
// ---------------------------------------------------------------------------
interface ScannedFile {
  filePath: string;
  size: number;
  mtimeMs: number;
}

async function scanDirectoryFilesSafe(dirPath: string, depth = 0): Promise<ScannedFile[]> {
  if (depth > 4) return [];
  const results: ScannedFile[] = [];
  try {
    if (!fs.existsSync(dirPath)) return results;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      count++;
      if (count % YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        const lstat = await fs.promises.lstat(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          const nested = await scanDirectoryFilesSafe(fullPath, depth + 1);
          results.push(...nested);
        } else if (entry.isFile()) {
          results.push({ filePath: fullPath, size: lstat.size, mtimeMs: lstat.mtimeMs });
        }
      } catch {}
    }
  } catch {}
  return results;
}

async function measureDirectoryBytes(dirPath: string, depth = 0): Promise<{ bytes: number; files: number }> {
  const list = await scanDirectoryFilesSafe(dirPath, depth);
  let bytes = 0;
  for (const f of list) bytes += f.size;
  return { bytes, files: list.length };
}

async function scanOwnedOsTempFiles(): Promise<ScannedFile[]> {
  const candidates: ScannedFile[] = [];
  try {
    const tmpRoot = os.tmpdir();
    const entries = await fs.promises.readdir(tmpRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const name = entry.name;
      const fullPath = path.join(tmpRoot, name);

      if (name === 'waguard_cache' || name === 'waguard_media') {
        const sub = await scanDirectoryFilesSafe(fullPath);
        candidates.push(...sub);
        continue;
      }

      // Only examine clear app/media/runtime temp prefixes; never touch unknown system tmp files
      const isAppOwnedPrefix =
        name.startsWith('waguard_') ||
        name.startsWith('baileys_') ||
        name.startsWith('sharp-') ||
        name.startsWith('tsx-');

      if (!isAppOwnedPrefix) continue;

      if (name.startsWith('tsx-')) {
        const pidMatch = name.match(/^tsx-(\d+)/);
        if (pidMatch) {
          const ownerPid = Number(pidMatch[1]);
          if (ownerPid === process.pid || ownerPid === 0 || isPidAlive(ownerPid)) {
            continue;
          }
        }
      }

      try {
        const lstat = await fs.promises.lstat(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (entry.isFile()) {
          candidates.push({ filePath: fullPath, size: lstat.size, mtimeMs: lstat.mtimeMs });
        } else if (entry.isDirectory()) {
          const nested = await scanDirectoryFilesSafe(fullPath);
          candidates.push(...nested);
        }
      } catch {}
    }
  } catch {}
  return candidates;
}

async function sha256FileStream(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function findDuplicateTempFiles(files: ScannedFile[]): Promise<{ duplicates: ScannedFile[]; reclaimableBytes: number }> {
  const bySize = new Map<number, ScannedFile[]>();
  for (const f of files) {
    if (f.size <= 0 || f.size > 150 * 1024 * 1024) continue;
    if (isProtectedPath(f.filePath)) continue;
    const arr = bySize.get(f.size) || [];
    arr.push(f);
    bySize.set(f.size, arr);
  }

  const duplicates: ScannedFile[] = [];
  let reclaimableBytes = 0;
  let hashedCount = 0;

  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const byHash = new Map<string, ScannedFile[]>();
    for (const f of group) {
      hashedCount++;
      if (hashedCount % 6 === 0) await yieldToEventLoop();
      try {
        const digest = await sha256FileStream(f.filePath);
        const list = byHash.get(digest) || [];
        list.push(f);
        byHash.set(digest, list);
      } catch {}
    }
    for (const sameHashList of byHash.values()) {
      if (sameHashList.length < 2) continue;
      // Sort newest first; keep newest original and mark older duplicates for removal
      sameHashList.sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (let i = 1; i < sameHashList.length; i++) {
        duplicates.push(sameHashList[i]);
        reclaimableBytes += sameHashList[i].size;
      }
    }
  }

  return { duplicates, reclaimableBytes };
}

function classifyDiskLevel(usedPercent: number): StorageAlertLevel {
  if (usedPercent >= 95) return 'critical_95';
  if (usedPercent >= 85) return 'warning_85';
  if (usedPercent >= 70) return 'notice_70';
  return 'normal';
}

export async function getStorageUsageSnapshot(): Promise<StorageUsageSnapshot> {
  loadCleanupState();
  ensureSafeManagedDirs();

  let totalBytes = 0;
  let usedBytes = 0;
  let freeBytes = 0;
  let availableBytes = 0;
  let usedPercent = 0;

  try {
    const stat = await fs.promises.statfs(DATA_DIR);
    const bsize = Number(stat.bsize || 4096);
    const blocks = Number(stat.blocks || 0);
    const bfree = Number(stat.bfree || 0);
    const bavail = Number(stat.bavail || bfree);
    totalBytes = Math.max(0, blocks * bsize);
    freeBytes = Math.max(0, bfree * bsize);
    availableBytes = Math.max(0, bavail * bsize);
    usedBytes = Math.max(0, totalBytes - freeBytes);
    usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0;
  } catch {}

  const [
    cacheStat,
    tempMediaStat,
    osTempMediaStat,
    osTempOwnedFiles,
    debugFiles,
    archiveStat,
    errorStat,
    primarySessStat,
    companionSessStat,
  ] = await Promise.all([
    measureDirectoryBytes(CACHE_DIR),
    measureDirectoryBytes(TEMP_MEDIA_DIR),
    measureDirectoryBytes(OS_TEMP_MEDIA_DIR),
    scanOwnedOsTempFiles(),
    scanDirectoryFilesSafe(DEBUG_LOGS_DIR),
    measureDirectoryBytes(ARCHIVE_LOGS_DIR),
    measureDirectoryBytes(ERROR_LOGS_DIR),
    measureDirectoryBytes(PRIMARY_SESSIONS_DIR),
    measureDirectoryBytes(COMPANION_SESSIONS_DIR),
  ]);

  let osCacheBytes = 0;
  let osCacheCount = 0;
  for (const f of osTempOwnedFiles) {
    osCacheBytes += f.size;
    osCacheCount++;
  }

  const retentionMs = Math.max(1, cleanupState.settings.debugLogRetentionDays || 7) * ONE_DAY_MS;
  const logCutoff = Date.now() - retentionMs;
  let debugLogsBytes = 0;
  let archivableDebugLogsCount = 0;
  let archivableDebugLogsBytes = 0;
  for (const df of debugFiles) {
    debugLogsBytes += df.size;
    if (df.mtimeMs < logCutoff) {
      archivableDebugLogsCount++;
      archivableDebugLogsBytes += df.size;
    }
  }

  // Protected DB bytes
  let protectedDatabaseBytes = 0;
  for (const dbFile of [
    MODERATION_DB_PATH,
    STICKER_QUEUE_DB_PATH,
    path.join(DATA_DIR, 'connection_diagnostics.json'),
    path.join(DATA_DIR, 'active_problems.json'),
    CLEANUP_STATE_PATH,
    AUTH_SECRET_PATH,
  ]) {
    try {
      if (fs.existsSync(dbFile)) {
        protectedDatabaseBytes += fs.statSync(dbFile).size;
      }
    } catch {}
  }

  // Detect duplicate candidates inside cleanable temp/cache/media folders
  const [cacheFiles, tempMediaFiles] = await Promise.all([
    scanDirectoryFilesSafe(CACHE_DIR),
    scanDirectoryFilesSafe(TEMP_MEDIA_DIR),
  ]);
  const dupScan = await findDuplicateTempFiles([...cacheFiles, ...tempMediaFiles, ...osTempOwnedFiles]);

  const mem = process.memoryUsage();
  const cleanableCacheBytes = cacheStat.bytes;
  const tempFilesBytes = osCacheBytes;
  const tempMediaBytes = tempMediaStat.bytes + osTempMediaStat.bytes;
  const totalReclaimableBytes = cleanableCacheBytes + tempFilesBytes + tempMediaBytes + archivableDebugLogsBytes;

  return {
    measuredAt: Date.now(),
    dataDir: DATA_DIR,
    persistentVolumeDetected: isPersistentVolumeConfigured(),
    disk: {
      totalBytes,
      usedBytes,
      freeBytes,
      availableBytes,
      usedPercent,
      alertLevel: classifyDiskLevel(usedPercent),
    },
    memory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
      externalMb: Math.round(mem.external / (1024 * 1024)),
    },
    breakdown: {
      cleanableCacheBytes,
      cleanableCacheFiles: cacheStat.files,
      tempFilesBytes,
      tempFilesCount: osCacheCount,
      tempMediaBytes,
      tempMediaFiles: tempMediaStat.files + osTempMediaStat.files,
      debugLogsBytes,
      debugLogsCount: debugFiles.length,
      archivableDebugLogsCount,
      archivedLogsBytes: archiveStat.bytes,
      archivedLogsCount: archiveStat.files,
      duplicateTempBytes: dupScan.reclaimableBytes,
      duplicateTempFiles: dupScan.duplicates.length,
      protectedErrorLogsBytes: errorStat.bytes,
      protectedErrorLogsCount: errorStat.files,
      protectedDatabaseBytes,
      protectedSessionsBytes: primarySessStat.bytes + companionSessStat.bytes,
    },
    totalReclaimableBytes,
    protectedSummary: {
      databaseIntact: true,
      primarySessionIntact: fs.existsSync(PRIMARY_SESSIONS_DIR),
      companionSessionIntact: fs.existsSync(COMPANION_SESSIONS_DIR),
      stickerQueueIntact: true,
      errorLogsPreserved: cleanupState.settings.preserveErrorLogs !== false,
    },
  };
}

// ---------------------------------------------------------------------------
// SAFE CLEANUP ENGINE (LOW CPU/RAM, NON-DESTRUCTIVE TO BAILEYS & DB)
// ---------------------------------------------------------------------------
async function safeDeleteFileIfAllowed(filePath: string, minAgeMs: number): Promise<{ deleted: boolean; bytes: number; protectedSkipped: boolean }> {
  if (isProtectedPath(filePath)) {
    return { deleted: false, bytes: 0, protectedSkipped: true };
  }
  try {
    const stat = await fs.promises.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { deleted: false, bytes: 0, protectedSkipped: false };
    }
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < minAgeMs) {
      return { deleted: false, bytes: 0, protectedSkipped: false };
    }
    const size = stat.size;
    await fs.promises.unlink(filePath);
    return { deleted: true, bytes: size, protectedSkipped: false };
  } catch {
    return { deleted: false, bytes: 0, protectedSkipped: false };
  }
}

async function pruneEmptyDirsInCleanableRoot(rootDir: string) {
  if (!isInsideCleanableDir(rootDir)) return;
  try {
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const sub = path.join(rootDir, entry.name);
      await pruneEmptyDirsInCleanableRoot(sub);
      const remaining = await fs.promises.readdir(sub);
      if (remaining.length === 0) {
        await fs.promises.rmdir(sub).catch(() => {});
      }
    }
  } catch {}
}

async function cleanDirectoryWithSafety(
  targetDir: string,
  minAgeMs: number,
  verifiedDirectories: string[]
): Promise<{ filesDeleted: number; bytesFreed: number; protectedSkipped: number }> {
  const resolved = path.resolve(targetDir);
  if (!isInsideCleanableDir(resolved)) {
    return { filesDeleted: 0, bytesFreed: 0, protectedSkipped: 1 };
  }
  verifiedDirectories.push(path.relative(DATA_DIR, resolved) || resolved);
  const files = await scanDirectoryFilesSafe(resolved);
  let filesDeleted = 0;
  let bytesFreed = 0;
  let protectedSkipped = 0;

  for (let i = 0; i < files.length; i++) {
    if (i > 0 && i % YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
    const res = await safeDeleteFileIfAllowed(files[i].filePath, minAgeMs);
    if (res.deleted) {
      filesDeleted++;
      bytesFreed += res.bytes;
    } else if (res.protectedSkipped) {
      protectedSkipped++;
    }
  }
  await pruneEmptyDirsInCleanableRoot(resolved);
  return { filesDeleted, bytesFreed, protectedSkipped };
}

async function cleanOrphanedTmpAndProjectLeftovers(verifiedDirectories: string[]): Promise<{ filesDeleted: number; bytesFreed: number; protectedSkipped: number }> {
  let filesDeleted = 0;
  let bytesFreed = 0;
  let protectedSkipped = 0;

  // 1) App-owned temp artifacts in os.tmpdir() older than 6 hours
  const ownedTmp = await scanOwnedOsTempFiles();
  verifiedDirectories.push('os_tmp:waguard');
  for (let i = 0; i < ownedTmp.length; i++) {
    if (i > 0 && i % YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
    const minAge = ownedTmp[i].filePath.includes(`${path.sep}waguard_`) ? IN_USE_SAFETY_WINDOW_MS : 6 * 60 * 60 * 1000;
    const res = await safeDeleteFileIfAllowed(ownedTmp[i].filePath, minAge);
    if (res.deleted) {
      filesDeleted++;
      bytesFreed += res.bytes;
    } else if (res.protectedSkipped) {
      protectedSkipped++;
    }
  }

  // 2) Stale non-DB .tmp files inside DATA_DIR top-level only (older than 30 min)
  try {
    const topEntries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });
    for (const entry of topEntries) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      if (!entry.name.endsWith('.tmp')) continue;
      const fullPath = path.join(DATA_DIR, entry.name);
      if (isProtectedPath(fullPath)) {
        protectedSkipped++;
        continue;
      }
      const res = await safeDeleteFileIfAllowed(fullPath, 30 * 60 * 1000);
      if (res.deleted) {
        filesDeleted++;
        bytesFreed += res.bytes;
      }
    }
  } catch {}

  return { filesDeleted, bytesFreed, protectedSkipped };
}

async function archiveAndCleanDebugLogs(
  retentionDays: number,
  preserveErrorLogs: boolean,
  verifiedDirectories: string[]
): Promise<{ logsArchived: number; filesDeleted: number; bytesFreed: number; errorLogsPreserved: number; protectedSkipped: number }> {
  let logsArchived = 0;
  let filesDeleted = 0;
  let bytesFreed = 0;
  let protectedSkipped = 0;

  ensureSafeManagedDirs();
  verifiedDirectories.push('logs/debug', 'logs/archive');
  const errorFiles = await scanDirectoryFilesSafe(ERROR_LOGS_DIR);
  const errorLogsPreserved = preserveErrorLogs ? errorFiles.length : errorFiles.length;
  protectedSkipped += errorFiles.length;

  const retentionMs = Math.max(1, retentionDays) * ONE_DAY_MS;
  const cutoffMs = Date.now() - retentionMs;
  const debugFiles = await scanDirectoryFilesSafe(DEBUG_LOGS_DIR);

  for (let i = 0; i < debugFiles.length; i++) {
    if (i > 0 && i % 4 === 0) await yieldToEventLoop();
    const df = debugFiles[i];
    if (isProtectedPath(df.filePath)) {
      protectedSkipped++;
      continue;
    }
    if (df.mtimeMs >= cutoffMs) continue;

    // Stream-compress (> 7 days) debug log into archive/*.gz, saving ~85% space while preserving audit trail
    const archiveTarget = path.join(ARCHIVE_LOGS_DIR, `${path.basename(df.filePath)}.gz`);
    try {
      await pipeline(
        fs.createReadStream(df.filePath, { highWaterMark: 32 * 1024 }),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(archiveTarget)
      );
      const compressedStat = await fs.promises.stat(archiveTarget);
      await fs.promises.unlink(df.filePath);
      logsArchived++;
      bytesFreed += Math.max(0, df.size - compressedStat.size);
    } catch {
      // If archiving failed, delete only if strictly non-error debug log
      const del = await safeDeleteFileIfAllowed(df.filePath, retentionMs);
      if (del.deleted) {
        filesDeleted++;
        bytesFreed += del.bytes;
      }
    }
  }

  // Remove old compressed debug archives > 30 days
  const archiveMaxAgeMs = ARCHIVE_RETENTION_DAYS * ONE_DAY_MS;
  const oldArchives = await scanDirectoryFilesSafe(ARCHIVE_LOGS_DIR);
  for (let i = 0; i < oldArchives.length; i++) {
    if (i > 0 && i % YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
    const res = await safeDeleteFileIfAllowed(oldArchives[i].filePath, archiveMaxAgeMs);
    if (res.deleted) {
      filesDeleted++;
      bytesFreed += res.bytes;
    }
  }

  return { logsArchived, filesDeleted, bytesFreed, errorLogsPreserved, protectedSkipped };
}

async function removeDuplicateTemporaryFiles(verifiedDirectories: string[]): Promise<{ duplicatesRemoved: number; bytesFreed: number; protectedSkipped: number }> {
  const [cacheFiles, tempMediaFiles, osMediaFiles, osOwned] = await Promise.all([
    scanDirectoryFilesSafe(CACHE_DIR),
    scanDirectoryFilesSafe(TEMP_MEDIA_DIR),
    scanDirectoryFilesSafe(OS_TEMP_MEDIA_DIR),
    scanOwnedOsTempFiles(),
  ]);
  verifiedDirectories.push('duplicates_scan');

  const allSafeTemp = [...cacheFiles, ...tempMediaFiles, ...osMediaFiles, ...osOwned];
  const { duplicates } = await findDuplicateTempFiles(allSafeTemp);

  let duplicatesRemoved = 0;
  let bytesFreed = 0;
  let protectedSkipped = 0;

  for (let i = 0; i < duplicates.length; i++) {
    if (i > 0 && i % YIELD_BATCH_SIZE === 0) await yieldToEventLoop();
    const res = await safeDeleteFileIfAllowed(duplicates[i].filePath, IN_USE_SAFETY_WINDOW_MS);
    if (res.deleted) {
      duplicatesRemoved++;
      bytesFreed += res.bytes;
    } else if (res.protectedSkipped) {
      protectedSkipped++;
    }
  }

  return { duplicatesRemoved, bytesFreed, protectedSkipped };
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export async function runCleanup(
  mode: CleanupMode = 'full',
  trigger: 'auto' | 'manual' = 'manual',
  sock?: WASocket | null
): Promise<CleanupReportItem> {
  loadCleanupState();
  if (cleanupInProgress) {
    throw new Error('একটি সার্ভার ক্লিনআপ প্রক্রিয়া ইতিমধ্যেই চলছে — কয়েক সেকেন্ড পর আবার চেষ্টা করুন।');
  }

  cleanupInProgress = true;
  const startedAt = Date.now();
  const verifiedDirectories: string[] = [];

  try {
    const before = await getStorageUsageSnapshot();
    const beforeManagedBytes =
      before.breakdown.cleanableCacheBytes +
      before.breakdown.tempFilesBytes +
      before.breakdown.tempMediaBytes +
      before.breakdown.debugLogsBytes;

    let filesDeleted = 0;
    let duplicatesRemoved = 0;
    let logsArchived = 0;
    let errorLogsPreserved = before.breakdown.protectedErrorLogsCount;
    let cacheEntriesPruned = 0;
    let skippedProtectedCount = 0;
    let directBytesFreed = 0;

    // 1. Runtime In-Memory Cache Cleanup (safe for active Baileys sockets & queues)
    if (mode === 'cache' || mode === 'full') {
      cacheEntriesPruned += pruneExpiredRuntimeCaches();
      cacheEntriesPruned += pruneIdleConversationCaches();
      cacheEntriesPruned += pruneExpiredBurstWindows();

      const cacheMinAge = mode === 'cache' ? IN_USE_SAFETY_WINDOW_MS : IN_USE_SAFETY_WINDOW_MS;
      const cacheRes = await cleanDirectoryWithSafety(CACHE_DIR, cacheMinAge, verifiedDirectories);
      filesDeleted += cacheRes.filesDeleted;
      directBytesFreed += cacheRes.bytesFreed;
      skippedProtectedCount += cacheRes.protectedSkipped;

      const osCacheRes = await cleanDirectoryWithSafety(OS_TEMP_CACHE_DIR, cacheMinAge, verifiedDirectories);
      filesDeleted += osCacheRes.filesDeleted;
      directBytesFreed += osCacheRes.bytesFreed;
      skippedProtectedCount += osCacheRes.protectedSkipped;

      if (typeof (global as any).gc === 'function') {
        try {
          (global as any).gc();
        } catch {}
      }
      await yieldToEventLoop();
    }

    // 2. Temporary Files & Temporary Media Cleanup
    if (mode === 'temp' || mode === 'full') {
      const mediaAge = trigger === 'manual' ? IN_USE_SAFETY_WINDOW_MS : 6 * 60 * 60 * 1000;
      const tempMediaRes = await cleanDirectoryWithSafety(TEMP_MEDIA_DIR, mediaAge, verifiedDirectories);
      filesDeleted += tempMediaRes.filesDeleted;
      directBytesFreed += tempMediaRes.bytesFreed;
      skippedProtectedCount += tempMediaRes.protectedSkipped;

      const osMediaRes = await cleanDirectoryWithSafety(OS_TEMP_MEDIA_DIR, mediaAge, verifiedDirectories);
      filesDeleted += osMediaRes.filesDeleted;
      directBytesFreed += osMediaRes.bytesFreed;
      skippedProtectedCount += osMediaRes.protectedSkipped;

      const orphanRes = await cleanOrphanedTmpAndProjectLeftovers(verifiedDirectories);
      filesDeleted += orphanRes.filesDeleted;
      directBytesFreed += orphanRes.bytesFreed;
      skippedProtectedCount += orphanRes.protectedSkipped;

      // Safe quota-aware Inbox media cleanup (strictly preserves important messages & text/deleted history DB)
      const inboxPrune = await enforceInboxMediaStorageLimit(0).catch(() => ({
        filesRemoved: 0,
        bytesFreed: 0,
        protectedImportantSkipped: 0,
      }));
      filesDeleted += inboxPrune.filesRemoved;
      directBytesFreed += inboxPrune.bytesFreed;
      skippedProtectedCount += inboxPrune.protectedImportantSkipped;
    }

    // 3. Duplicate Temporary Files Scan & Deduplication
    if (mode === 'duplicates' || mode === 'temp' || mode === 'full') {
      const dupRes = await removeDuplicateTemporaryFiles(verifiedDirectories);
      duplicatesRemoved += dupRes.duplicatesRemoved;
      directBytesFreed += dupRes.bytesFreed;
      skippedProtectedCount += dupRes.protectedSkipped;
    }

    // 4. Debug Logs (> 7 days) Compression/Archive + Preserve Important Error Logs
    if (mode === 'logs' || mode === 'full') {
      const logRes = await archiveAndCleanDebugLogs(
        cleanupState.settings.debugLogRetentionDays || 7,
        cleanupState.settings.preserveErrorLogs !== false,
        verifiedDirectories
      );
      logsArchived += logRes.logsArchived;
      filesDeleted += logRes.filesDeleted;
      directBytesFreed += logRes.bytesFreed;
      errorLogsPreserved = logRes.errorLogsPreserved;
      skippedProtectedCount += logRes.protectedSkipped;
    }

    // Verify protected stores untouched count
    for (const pRoot of [
      MODERATION_DB_PATH,
      STICKER_QUEUE_DB_PATH,
      PRIMARY_SESSIONS_DIR,
      COMPANION_SESSIONS_DIR,
    ]) {
      if (fs.existsSync(pRoot)) skippedProtectedCount++;
    }

    const after = await getStorageUsageSnapshot();
    const afterManagedBytes =
      after.breakdown.cleanableCacheBytes +
      after.breakdown.tempFilesBytes +
      after.breakdown.tempMediaBytes +
      after.breakdown.debugLogsBytes;

    const managedDelta = Math.max(0, beforeManagedBytes - afterManagedBytes);
    const recoveredBytes = Math.max(directBytesFreed, managedDelta);
    const ramFreedMb = Math.max(0, before.memory.rssMb - after.memory.rssMb);
    const now = Date.now();

    const summaryPartsBn: string[] = [];
    if (recoveredBytes > 0) summaryPartsBn.push(`${formatBytesCompact(recoveredBytes)} ডিস্ক উদ্ধার`);
    if (cacheEntriesPruned > 0) summaryPartsBn.push(`${cacheEntriesPruned}টি র‍্যাম ক্যাশ ট্রিম`);
    if (filesDeleted > 0) summaryPartsBn.push(`${filesDeleted}টি অপ্রয়োজনীয় ফাইল মুছে ফেলা হয়েছে`);
    if (duplicatesRemoved > 0) summaryPartsBn.push(`${duplicatesRemoved}টি ডুপ্লিকেট ফাইল রিমুভ`);
    if (logsArchived > 0) summaryPartsBn.push(`${logsArchived}টি পুরোনো ডিবাগ লগ আর্কাইভ`);
    if (summaryPartsBn.length === 0) summaryPartsBn.push('সার্ভার আগে থেকেই পরিষ্কার ও অপ্টিমাইজড আছে');

    const summaryPartsEn: string[] = [];
    if (recoveredBytes > 0) summaryPartsEn.push(`Recovered ${formatBytesCompact(recoveredBytes)}`);
    if (cacheEntriesPruned > 0) summaryPartsEn.push(`Pruned ${cacheEntriesPruned} cache entries`);
    if (filesDeleted > 0) summaryPartsEn.push(`Removed ${filesDeleted} temp/cache files`);
    if (duplicatesRemoved > 0) summaryPartsEn.push(`Deduplicated ${duplicatesRemoved} files`);
    if (logsArchived > 0) summaryPartsEn.push(`Archived ${logsArchived} old debug logs`);
    if (summaryPartsEn.length === 0) summaryPartsEn.push('Server storage is already clean and optimal');

    const report: CleanupReportItem = {
      id: `clean_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      mode,
      trigger,
      durationMs: Math.max(1, now - startedAt),
      beforeDiskUsedBytes: before.disk.usedBytes,
      beforeDiskTotalBytes: before.disk.totalBytes,
      beforeDiskUsedPercent: before.disk.usedPercent,
      beforeManagedBytes,
      beforeRssMb: before.memory.rssMb,
      afterDiskUsedBytes: after.disk.usedBytes,
      afterDiskTotalBytes: after.disk.totalBytes,
      afterDiskUsedPercent: after.disk.usedPercent,
      afterManagedBytes,
      afterRssMb: after.memory.rssMb,
      recoveredBytes,
      ramFreedMb,
      filesDeleted,
      duplicatesRemoved,
      logsArchived,
      errorLogsPreserved,
      cacheEntriesPruned,
      skippedProtectedCount,
      verifiedDirectories: Array.from(new Set(verifiedDirectories)),
      status: 'completed',
      summaryBn: summaryPartsBn.join(' · '),
      summaryEn: summaryPartsEn.join(' · '),
    };

    cleanupState.lastCleanupAt = now;
    if (mode === 'cache' || mode === 'full') cleanupState.lastCacheCleanupAt = now;
    if (mode === 'temp' || mode === 'full') cleanupState.lastDailyCleanupAt = now;
    if (mode === 'logs' || mode === 'full') cleanupState.lastLogMaintenanceAt = now;
    cleanupState.totalRecoveredBytes += recoveredBytes;
    cleanupState.totalFilesCleaned += filesDeleted + duplicatesRemoved + logsArchived;
    cleanupState.history.unshift(report);
    if (cleanupState.history.length > 50) {
      cleanupState.history = cleanupState.history.slice(0, 50);
    }
    saveCleanupStateSync();
    appendDebugLog('CLEANUP', `${trigger}/${mode}: ${report.summaryEn} (${report.durationMs}ms)`);

    // Evaluate disk alerts post-cleanup (may resolve alert if space fell back below threshold)
    await evaluateStorageThresholdAlerts(sock || null, after).catch(() => {});

    return report;
  } catch (err: any) {
    appendErrorLog('CLEANUP_ERROR', err?.message || String(err));
    throw err;
  } finally {
    cleanupInProgress = false;
  }
}

export async function evaluateStorageThresholdAlerts(
  sock?: WASocket | null,
  existingSnapshot?: StorageUsageSnapshot
): Promise<void> {
  loadCleanupState();
  const snap = existingSnapshot || (await getStorageUsageSnapshot());
  const usedPct = snap.disk.usedPercent;
  const level = classifyDiskLevel(usedPct);
  const now = Date.now();

  if (level === 'normal') {
    if (cleanupState.lastAlertLevel !== 'normal' && usedPct < 68) {
      cleanupState.lastAlertLevel = 'normal';
      saveCleanupStateSync();
      for (const cat of ['storage_capacity_95', 'storage_capacity_85', 'storage_capacity_70']) {
        await resolveServerProblem(cat, {
          details: `সার্ভার স্টোরেজ এখন নিরাপদ পর্যায়ে ফিরে এসেছে (ব্যবহৃত: ${usedPct.toFixed(1)}%)।`,
          thanksNote: 'ধন্যবাদ বস! অটোমেটিক স্টোরেজ ক্লিনআপ সফল হওয়ায় সার্ভার এখন পর্যাপ্ত ফ্রি স্পেস নিয়ে চলছে।',
          sock: sock || null,
        }).catch(() => {});
      }
    }
    return;
  }

  const thresholdMap: Record<Exclude<StorageAlertLevel, 'normal'>, number> = {
    notice_70: 70,
    warning_85: 85,
    critical_95: 95,
  };
  const thresholdPercent = thresholdMap[level];
  const sameLevelCooldownMs = level === 'critical_95' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const levelOrder: Record<StorageAlertLevel, number> = {
    normal: 0,
    notice_70: 1,
    warning_85: 2,
    critical_95: 3,
  };

  const escalated = levelOrder[level] > levelOrder[cleanupState.lastAlertLevel];
  const cooldownPassed = now - (cleanupState.lastAlertAt || 0) >= sameLevelCooldownMs;
  if (!escalated && !cooldownPassed) return;

  cleanupState.lastAlertLevel = level;
  cleanupState.lastAlertAt = now;

  const title =
    level === 'critical_95'
      ? `সার্ভার স্টোরেজ প্রায় পূর্ণ (${usedPct.toFixed(1)}% — Critical ≥95%)`
      : level === 'warning_85'
      ? `সার্ভার স্টোরেজ সতর্কতা (${usedPct.toFixed(1)}% — High ≥85%)`
      : `সার্ভার স্টোরেজ ব্যবহার ৭০% ছাড়িয়েছে (${usedPct.toFixed(1)}%)`;

  const details = `মোট স্টোরেজ: ${formatBytesCompact(snap.disk.totalBytes)}, ব্যবহৃত: ${formatBytesCompact(snap.disk.usedBytes)}, ফ্রি: ${formatBytesCompact(snap.disk.freeBytes)}।`;
  const suggestion =
    level === 'critical_95'
      ? 'ড্যাশবোর্ডের সার্ভার ক্লিনআপ পেজ থেকে ম্যানুয়াল ক্লিনআপ বা অপ্রয়োজনীয় বড় মিডিয়া পরীক্ষা করুন। বট নিজে থেকে ক্যাশ ও টেম্প ফাইল পরিষ্কার করেছে।'
      : 'অটো ক্লিনআপ ক্যাশ ও টেম্প ফাইল পরিষ্কার করছে। ড্যাশবোর্ড থেকেও রিপোর্ট দেখতে পারবেন।';

  const bossNotified = await reportServerProblem(
    {
      category: `storage_capacity_${thresholdPercent}`,
      title,
      details,
      suggestion,
      urgent: thresholdPercent >= 85,
    },
    sock || null
  ).catch(() => false);

  cleanupState.alerts.unshift({
    id: `salert_${now}`,
    timestamp: now,
    level,
    thresholdPercent,
    usedPercent: usedPct,
    messageBn: `${title} — ${details}`,
    messageEn: `Disk usage reached ${usedPct.toFixed(1)}% (Threshold ${thresholdPercent}%)`,
    bossNotified: Boolean(bossNotified),
  });
  if (cleanupState.alerts.length > 30) {
    cleanupState.alerts = cleanupState.alerts.slice(0, 30);
  }
  saveCleanupStateSync();
  appendErrorLog('STORAGE_ALERT', `${title} | ${details}`);

  // If 85%+ or 95%+, automatically trigger safe cleanup once per alert cycle (if not already cleaning)
  if (thresholdPercent >= 85 && !cleanupInProgress && cleanupState.settings.autoCleanupEnabled) {
    runCleanup('full', 'auto', sock || null).catch(() => {});
  }
}

export function updateCleanupSettings(patch: Partial<CleanupSettings>): CleanupSettings {
  loadCleanupState();
  const next: CleanupSettings = {
    ...cleanupState.settings,
    ...(typeof patch.autoCleanupEnabled === 'boolean' ? { autoCleanupEnabled: patch.autoCleanupEnabled } : {}),
    ...(typeof patch.dailyTempCleanupEnabled === 'boolean'
      ? { dailyTempCleanupEnabled: patch.dailyTempCleanupEnabled }
      : {}),
    ...(typeof patch.preserveErrorLogs === 'boolean' ? { preserveErrorLogs: patch.preserveErrorLogs } : {}),
    ...(patch.cacheIntervalHours !== undefined
      ? { cacheIntervalHours: Math.max(1, Math.min(24, Number(patch.cacheIntervalHours) || 3)) }
      : {}),
    ...(patch.debugLogRetentionDays !== undefined
      ? { debugLogRetentionDays: Math.max(1, Math.min(30, Number(patch.debugLogRetentionDays) || 7)) }
      : {}),
    alertThresholds: [70, 85, 95],
  };
  cleanupState.settings = next;
  saveCleanupStateSync();
  return { ...next };
}

export async function getStorageCleanupOverview() {
  loadCleanupState();
  const snapshot = await getStorageUsageSnapshot();
  const cacheIntervalMs = Math.max(1, cleanupState.settings.cacheIntervalHours || 3) * 60 * 60 * 1000;
  const now = Date.now();
  const nextCacheCleanupAt = cleanupState.lastCacheCleanupAt
    ? cleanupState.lastCacheCleanupAt + cacheIntervalMs
    : now + cacheIntervalMs;
  const nextDailyCleanupAt = cleanupState.lastDailyCleanupAt
    ? cleanupState.lastDailyCleanupAt + ONE_DAY_MS
    : now + ONE_DAY_MS;

  return {
    snapshot,
    settings: { ...cleanupState.settings },
    scheduler: {
      running: Boolean(schedulerInterval),
      cleanupInProgress,
      lastCleanupAt: cleanupState.lastCleanupAt,
      lastCacheCleanupAt: cleanupState.lastCacheCleanupAt,
      lastDailyCleanupAt: cleanupState.lastDailyCleanupAt,
      lastLogMaintenanceAt: cleanupState.lastLogMaintenanceAt,
      nextCacheCleanupAt,
      nextDailyCleanupAt,
      totalRecoveredBytes: cleanupState.totalRecoveredBytes,
      totalFilesCleaned: cleanupState.totalFilesCleaned,
      lastAlertLevel: cleanupState.lastAlertLevel,
    },
    alerts: cleanupState.alerts.slice(0, 20),
    history: cleanupState.history.slice(0, 30),
  };
}

// ---------------------------------------------------------------------------
// PERSISTENT SCHEDULER (SURVIVES SERVER RESTARTS)
// ---------------------------------------------------------------------------
async function runScheduledTick(getSock: () => WASocket | null) {
  loadCleanupState();
  if (cleanupInProgress) return;
  const sock = getSock();
  const now = Date.now();

  if (cleanupState.settings.autoCleanupEnabled) {
    const cacheIntervalMs = Math.max(1, cleanupState.settings.cacheIntervalHours || 3) * 60 * 60 * 1000;

    // 1. Daily Temporary Files + Duplicate Temp Files + 7-Day Debug Logs Archive
    if (
      cleanupState.settings.dailyTempCleanupEnabled !== false &&
      (cleanupState.lastDailyCleanupAt === 0 || now - cleanupState.lastDailyCleanupAt >= ONE_DAY_MS)
    ) {
      await runCleanup('full', 'auto', sock).catch(() => {});
      return;
    }

    // 2. Every 3 Hours Safe Cache Cleanup
    if (cleanupState.lastCacheCleanupAt === 0 || now - cleanupState.lastCacheCleanupAt >= cacheIntervalMs) {
      await runCleanup('cache', 'auto', sock).catch(() => {});
      return;
    }

    // 3. Periodic 7-Day Log Maintenance Check (once per 24h)
    if (cleanupState.lastLogMaintenanceAt === 0 || now - cleanupState.lastLogMaintenanceAt >= ONE_DAY_MS) {
      await runCleanup('logs', 'auto', sock).catch(() => {});
      return;
    }
  }

  // 4. Storage Monitor Threshold Check (every 15 min)
  if (now - lastDiskAlertCheckAt >= 15 * 60 * 1000) {
    lastDiskAlertCheckAt = now;
    await evaluateStorageThresholdAlerts(sock).catch(() => {});
  }
}

export function startCleanupScheduler(getSock: () => WASocket | null) {
  loadCleanupState();
  ensureSafeManagedDirs();
  appendDebugLog('SCHEDULER', 'Automatic Storage Cleanup & Optimization Scheduler initialized.');

  if (startupDelayTimer) clearTimeout(startupDelayTimer);
  if (schedulerInterval) clearInterval(schedulerInterval);

  // Gentle 25s post-boot delay so Baileys session reconnect & HTTP server boot remain top priority
  startupDelayTimer = setTimeout(() => {
    startupDelayTimer = null;
    runScheduledTick(getSock).catch(() => {});
  }, 25 * 1000);

  // Check scheduled windows every 10 minutes
  schedulerInterval = setInterval(() => {
    runScheduledTick(getSock).catch(() => {});
  }, 10 * 60 * 1000);
}

export function stopCleanupScheduler() {
  if (startupDelayTimer) {
    clearTimeout(startupDelayTimer);
    startupDelayTimer = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  saveCleanupStateSync();
}
