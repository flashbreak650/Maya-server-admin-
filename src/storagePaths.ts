import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveUnifiedDataDir(): string {
  const envDir = (
    process.env.WAGUARD_DATA_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    process.env.RENDER_DISK_PATH ||
    ''
  ).trim();
  const target = envDir ? path.resolve(envDir) : path.join(PROJECT_ROOT, 'data');
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
}

export const DATA_DIR = resolveUnifiedDataDir();
export const MODERATION_DB_PATH = path.join(DATA_DIR, 'moderation_db.json');
export const STICKER_QUEUE_DB_PATH = path.join(DATA_DIR, 'sticker_queue.json');
export const PRIMARY_SESSIONS_DIR = path.join(DATA_DIR, 'sessions_primary');
export const COMPANION_SESSIONS_DIR = path.join(DATA_DIR, 'sessions_companion');
export const AUTH_SECRET_PATH = path.join(DATA_DIR, '.auth_secret');

export function isPersistentVolumeConfigured(): boolean {
  return Boolean(
    (process.env.WAGUARD_DATA_DIR || '').trim() ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim() ||
    (process.env.RENDER_DISK_PATH || '').trim()
  );
}

function ensureAndMigrateDir(legacyDir: string, targetDir: string, requiredMarkerFile: string) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  try {
    const targetHasMarker = fs.existsSync(path.join(targetDir, requiredMarkerFile));
    const legacyHasMarker = fs.existsSync(path.join(legacyDir, requiredMarkerFile));
    if (!targetHasMarker && legacyHasMarker) {
      for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
        if (entry.isFile()) {
          const srcFile = path.join(legacyDir, entry.name);
          const dstFile = path.join(targetDir, entry.name);
          if (!fs.existsSync(dstFile)) {
            fs.copyFileSync(srcFile, dstFile);
          }
        }
      }
      console.log(`[Storage Migration] Migrated ${requiredMarkerFile} bundle -> ${targetDir}`);
    }
  } catch (err: any) {
    console.warn('[Storage Migration Note]:', err?.message || err);
  }
}

// Migrate any legacy root .sessions / .sessions_companion / data files into the unified DATA_DIR automatically
ensureAndMigrateDir(path.join(PROJECT_ROOT, '.sessions'), PRIMARY_SESSIONS_DIR, 'creds.json');
ensureAndMigrateDir(path.join(PROJECT_ROOT, '.sessions_companion'), COMPANION_SESSIONS_DIR, 'creds.json');
ensureAndMigrateDir(path.join(PROJECT_ROOT, 'data'), DATA_DIR, 'moderation_db.json');
