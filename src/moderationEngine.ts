import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { proto, WASocket } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'moderation_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface ModerationSettings {
  adminShield: boolean;
  antiSticker: boolean;
  antiStickerSpam: boolean;
  antiGif: boolean;
  antiVideo: boolean;
  antiImage: boolean;
  antiViewOnce: boolean;
  antiBadword: boolean;
  antiLink: boolean;
  autoKick3Warnings: boolean;
  botReply: boolean;
  customBadwords: string[];
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  action: 'deleted' | 'warned' | 'kicked' | 'locked' | 'unlocked' | 'error' | 'replied';
  reason: string;
  details?: string;
  warningCount?: number;
}

export interface UserWarning {
  count: number;
  lastViolation: number;
  violations: Array<{ timestamp: number; reason: string }>;
}

export interface GroupLock {
  groupId: string;
  lockedUntil: number;
  originalSetting: string;
  reason: string;
  timerActive?: boolean;
}

export interface ModerationDB {
  settings: ModerationSettings;
  warnings: Record<string, UserWarning>; // key: `${groupId}:${senderJid}`
  groupLocks: Record<string, GroupLock>; // key: groupId
  activityLogs: ActivityLog[];
  stats: {
    messagesChecked: number;
    warningsGiven: number;
    deletedMessages: number;
    kickedMembers: number;
    groupLocksTriggered: number;
  };
}

const DEFAULT_SETTINGS: ModerationSettings = {
  adminShield: true,
  antiSticker: false,
  antiStickerSpam: true,
  antiGif: true,
  antiVideo: false,
  antiImage: false,
  antiViewOnce: true,
  antiBadword: true,
  antiLink: true,
  autoKick3Warnings: true,
  botReply: true,
  customBadwords: [],
};

// In-memory runtime database
let db: ModerationDB = {
  settings: { ...DEFAULT_SETTINGS },
  warnings: {},
  groupLocks: {},
  activityLogs: [],
  stats: {
    messagesChecked: 0,
    warningsGiven: 0,
    deletedMessages: 0,
    kickedMembers: 0,
    groupLocksTriggered: 0,
  },
};

// Load database from disk
export function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      db = {
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        warnings: data.warnings || {},
        groupLocks: data.groupLocks || {},
        activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs.slice(-100) : [],
        stats: {
          messagesChecked: data.stats?.messagesChecked || 0,
          warningsGiven: data.stats?.warningsGiven || 0,
          deletedMessages: data.stats?.deletedMessages || 0,
          kickedMembers: data.stats?.kickedMembers || 0,
          groupLocksTriggered: data.stats?.groupLocksTriggered || 0,
        },
      };
      console.log('Moderation DB loaded successfully. Logs count:', db.activityLogs.length);
    } else {
      saveDatabase();
    }
  } catch (err: any) {
    console.error('Error loading moderation DB, using defaults:', err.message);
  }
}

// Atomic save database to disk
let saveTimeout: NodeJS.Timeout | null = null;
export function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const tmpPath = DB_PATH + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err: any) {
      console.error('Error saving moderation DB:', err.message);
    }
  }, 200);
}

// Initialize on start
loadDatabase();

// In-memory caches for fast processing
const processedMsgIds = new Set<string>();
const stickerTimestamps: Record<string, number[]> = {}; // key: `${groupId}:${senderJid}`
const groupMetaCache: Record<string, { meta: any; fetchedAt: number }> = {};

export function getSettings(): ModerationSettings {
  return { ...db.settings };
}

export function updateSettings(newSettings: Partial<ModerationSettings>): ModerationSettings {
  db.settings = { ...db.settings, ...newSettings };
  saveDatabase();
  return { ...db.settings };
}

export function getStats() {
  return { ...db.stats };
}

export function getActivityLogs(limit = 50): ActivityLog[] {
  return db.activityLogs.slice(-limit).reverse();
}

export function resetWarnings(): boolean {
  db.warnings = {};
  saveDatabase();
  return true;
}

export function clearActivityLogs(): boolean {
  db.activityLogs = [];
  saveDatabase();
  return true;
}

export function addActivityLog(log: Omit<ActivityLog, 'id' | 'timestamp'>) {
  const newLog: ActivityLog = {
    ...log,
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
  };
  db.activityLogs.push(newLog);
  if (db.activityLogs.length > 200) {
    db.activityLogs = db.activityLogs.slice(-200);
  }
  saveDatabase();
}

// -------------------------------------------------------------
// MULTILINGUAL ANTI-BADWORD MATCHING ENGINE
// -------------------------------------------------------------

// Comprehensive dictionary covering Bangla, Sylheti, Banglish, Hindi/Urdu, English, Arabic
const BENGALI_BADWORDS = [
  'খানকি', 'খানকির', 'মাগি', 'মাগির', 'বেশ্যা', 'বেশ্যার', 'রান্ডি', 'রান্ডির',
  'চুদা', 'চুদানি', 'চুদানির', 'চুদ', 'চোদা', 'চোদানি', 'চোদানির', 'মাদারচোদ',
  'মাদারচুদা', 'বাইনচোদ', 'বাইনচুদা', 'ভোনচোদ', 'কুত্তা', 'কুত্তার', 'কুত্তির',
  'শুয়োর', 'শুয়োরের', 'হারামি', 'হারামজাদা', 'হারামখোর', 'ভোদা', 'ভোদাই',
  'ধোন', 'লুচ্চা', 'লুচ্চামি', 'গুয়া', 'গুয়ার', 'গুদে', 'গুদ', 'বাল'
];

// Sylheti local slang
const SYLHETI_BADWORDS = [
  'ফুয়া', 'রান্দি', 'খাউয়াস', 'আওলাইন্না', 'মুতার', 'নাঙ্গট'
];

// Banglish (slang transliterated into English letters)
const BANGLISH_BADWORDS = [
  'khanki', 'khankir', 'magi', 'magir', 'besha', 'beshar', 'beshya',
  'randi', 'randir', 'raandi', 'choda', 'chudani', 'chuda', 'chudanir',
  'madarchod', 'madarchuda', 'bainchod', 'baimchod', 'bhenchod', 'behnchod',
  'harami', 'haramzada', 'kuttar baccha', 'shuorer baccha', 'bhoda', 'bhodai',
  'dhon', 'guya', 'gud', 'bal', 'chutia', 'chutiya', 'chod'
];

// Hindi / Urdu slang
const HINDI_URDU_BADWORDS = [
  'madarchod', 'bhenchod', 'behnchod', 'gaand', 'gandu', 'lund', 'lauda',
  'laude', 'lavde', 'raand', 'bsdk', 'bhosdike', 'chutiya', 'harami', 'kutte'
];

// English profanities
const ENGLISH_BADWORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches',
  'asshole', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'nigga'
];

// Arabic profanities
const ARABIC_BADWORDS = [
  'شرموطة', 'قحبة', 'كس', 'طيز', 'منيوك', 'ابن الكلب', 'عرص', 'زب'
];

// Safe words that contain small substrings like 'bal' or 'balti' and must NEVER be flagged
const SAFE_WHITELIST = new Set([
  'বালতি', 'বালিশ', 'বালক', 'বালিকা', 'বাল্য', 'বাল্যকাল', 'বালু', 'বাঙালি',
  'বাঙালী', 'ইকবাল', 'আবুল', 'সবল', 'দূর্বল', 'দুর্বল', 'বল', 'বলা', 'বলে',
  'বলুন', 'বলবেন', 'বলো', 'কথা', 'ভালো', 'চাল', 'ডাল', 'পাল', 'কাল', 'মালয়েশিয়া',
  'ball', 'balance', 'global', 'balcony', 'bald', 'iqbal', 'verbal', 'tribal',
  'herbal', 'football', 'basketball', 'baseball', 'shobhal'
]);

// Normalization function: strips accents, reduces repeated consecutive letters, decodes leetspeak
function normalizeText(raw: string): string {
  let str = raw.toLowerCase();

  // Leetspeak replacements
  str = str
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b');

  // Remove invisible and zero-width characters
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, '');

  return str;
}

// Fast badword match
export function checkBadwordViolation(text: string, customList: string[] = []): { isBad: boolean; matchedWord?: string } {
  if (!text || text.trim().length === 0) return { isBad: false };

  const normalized = normalizeText(text);

  // 1. Check custom badwords from dashboard
  for (const custom of customList) {
    const trimmed = custom.trim().toLowerCase();
    if (trimmed.length > 1 && normalized.includes(trimmed)) {
      return { isBad: true, matchedWord: trimmed };
    }
  }

  // Check spaced letters (e.g. "খ া ন কি" or "b a l" or "f u c k")
  const collapsedSpaced = normalized.replace(/\s+/g, '');

  // 2. Exact word tokens check
  // Tokenize by punctuation and whitespace
  const tokens = normalized.split(/[\s,.;:!?+=\-_/\\()\[\]{}|<>*~`'"@#$%^&]+/);

  const allWordLists = [
    ...BENGALI_BADWORDS,
    ...SYLHETI_BADWORDS,
    ...BANGLISH_BADWORDS,
    ...HINDI_URDU_BADWORDS,
    ...ENGLISH_BADWORDS,
    ...ARABIC_BADWORDS,
  ];

  for (const token of tokens) {
    if (!token || token.length < 2) continue;

    // Check if token is in whitelist
    if (SAFE_WHITELIST.has(token)) continue;

    for (const bad of allWordLists) {
      // For short words like 'bal' or 'গুদ', require exact token match
      if (bad.length <= 3) {
        if (token === bad) {
          return { isBad: true, matchedWord: bad };
        }
      } else {
        // For longer words, check exact match or starting with bad stem
        if (token === bad || token.startsWith(bad)) {
          return { isBad: true, matchedWord: bad };
        }
      }
    }
  }

  // 3. Check collapsed spaced words for dangerous words
  for (const bad of allWordLists) {
    if (bad.length >= 4) {
      if (collapsedSpaced.includes(bad)) {
        return { isBad: true, matchedWord: bad };
      }
    }
  }

  return { isBad: false };
}

// -------------------------------------------------------------
// ANTI-LINK DETECTION
// -------------------------------------------------------------
const LINK_REGEX = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|io|me|app|xyz|info|biz|top|bd|co|in|link|site|online|live|tv|cc|ly|to|gg|me|dev)[^\s]*|chat\.whatsapp\.com\/[a-zA-Z0-9]+|t\.me\/[a-zA-Z0-9_]+|wa\.me\/[0-9]+|facebook\.com\/[^\s]+|fb\.watch\/[^\s]+|youtu\.be\/[^\s]+|youtube\.com\/[^\s]+|tiktok\.com\/[^\s]+|instagram\.com\/[^\s]+/i;

export function checkLinkViolation(text: string): { isLink: boolean; matchedLink?: string } {
  if (!text) return { isLink: false };
  const match = text.match(LINK_REGEX);
  if (match) {
    return { isLink: true, matchedLink: match[0] };
  }
  return { isLink: false };
}

// -------------------------------------------------------------
// MESSAGE UNPACKER
// -------------------------------------------------------------
export function extractRealMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  if (!message) return null;
  if (message.ephemeralMessage?.message) return extractRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractRealMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return extractRealMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return extractRealMessage(message.documentWithCaptionMessage.message);
  return message;
}

export function extractMessageText(realMsg: proto.IMessage | null | undefined): string {
  if (!realMsg) return '';
  return (
    realMsg.conversation ||
    realMsg.extendedTextMessage?.text ||
    realMsg.imageMessage?.caption ||
    realMsg.videoMessage?.caption ||
    realMsg.documentMessage?.caption ||
    realMsg.buttonsResponseMessage?.selectedDisplayText ||
    realMsg.templateButtonReplyMessage?.selectedDisplayText ||
    realMsg.listResponseMessage?.title ||
    ''
  );
}

// Check if message is View Once
export function isViewOnceMessage(rawMsg: proto.IWebMessageInfo, realMsg: proto.IMessage | null | undefined): boolean {
  if (rawMsg.message?.viewOnceMessage || rawMsg.message?.viewOnceMessageV2 || rawMsg.message?.viewOnceMessageV2Extension) {
    return true;
  }
  if (realMsg?.imageMessage?.viewOnce || realMsg?.videoMessage?.viewOnce) {
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// GROUP ADMIN VERIFICATION
// -------------------------------------------------------------
export async function getGroupMeta(sock: WASocket, groupId: string) {
  const cached = groupMetaCache[groupId];
  const now = Date.now();
  if (cached && now - cached.fetchedAt < 30000) {
    return cached.meta;
  }
  try {
    const meta = await sock.groupMetadata(groupId);
    groupMetaCache[groupId] = { meta, fetchedAt: now };
    return meta;
  } catch (err: any) {
    console.error(`Failed to fetch metadata for group ${groupId}:`, err.message);
    return cached ? cached.meta : null;
  }
}

export async function checkPermissions(sock: WASocket, groupId: string, senderJid: string): Promise<{ isSenderAdmin: boolean; isBotAdmin: boolean; groupSubject: string }> {
  try {
    const meta = await getGroupMeta(sock, groupId);
    if (!meta || !meta.participants) {
      return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
    }

    const cleanSender = senderJid.split('@')[0].split(':')[0];
    const botJid = sock.user?.id || '';
    const cleanBot = botJid.split('@')[0].split(':')[0];

    let isSenderAdmin = false;
    let isBotAdmin = false;

    for (const p of meta.participants) {
      const pClean = p.id.split('@')[0].split(':')[0];
      const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';

      if (pClean === cleanSender && isAdmin) {
        isSenderAdmin = true;
      }
      if (pClean === cleanBot && isAdmin) {
        isBotAdmin = true;
      }
    }

    return {
      isSenderAdmin,
      isBotAdmin,
      groupSubject: meta.subject || 'WhatsApp Group',
    };
  } catch {
    return { isSenderAdmin: false, isBotAdmin: false, groupSubject: 'WhatsApp Group' };
  }
}

// -------------------------------------------------------------
// STICKER SPAM & 10-MINUTE GROUP LOCK SYSTEM
// -------------------------------------------------------------
export function recordStickerAndCheckSpam(groupId: string, senderJid: string): boolean {
  const key = `${groupId}:${senderJid}`;
  const now = Date.now();
  if (!stickerTimestamps[key]) {
    stickerTimestamps[key] = [];
  }

  // Keep timestamps within last 5 seconds (5000ms)
  stickerTimestamps[key] = stickerTimestamps[key].filter((t) => now - t <= 5000);
  stickerTimestamps[key].push(now);

  // If 3 or more stickers in 5 seconds -> Spam!
  return stickerTimestamps[key].length >= 3;
}

// Start group unlock timer monitor
export function startGroupLockMonitor(sockGetter: () => WASocket | null) {
  setInterval(async () => {
    const sock = sockGetter();
    if (!sock || !sock.authState?.creds?.registered) return;

    const now = Date.now();
    for (const [groupId, lock] of Object.entries(db.groupLocks)) {
      if (now >= lock.lockedUntil) {
        try {
          console.log(`Unlocking group ${groupId} after 10-minute spam timeout.`);
          await sock.groupSettingUpdate(groupId, 'not_announcement');
          await sock.sendMessage(groupId, {
            text: '✅ [WAGuard Security]\n১০ মিনিটের লক মেয়াদ শেষ হয়েছে। গ্রুপটি পুনরায় সকল সদস্যের মেসেজ পাঠানোর জন্য উন্মুক্ত করা হলো। সবাইকে নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।',
          });

          addActivityLog({
            groupId,
            groupName: 'Protected Group',
            senderJid: 'SYSTEM',
            senderPhone: 'SYSTEM',
            action: 'unlocked',
            reason: '১০ মিনিটের লক মেয়াদ শেষ হয়েছে। গ্রুপ আনলক করা হয়েছে।',
          });

          delete db.groupLocks[groupId];
          saveDatabase();
        } catch (err: any) {
          console.error(`Failed to unlock group ${groupId}:`, err.message);
          // If permission error or transient, remove lock to avoid endless retry
          delete db.groupLocks[groupId];
          saveDatabase();
        }
      }
    }
  }, 10000); // Check every 10 seconds
}

// -------------------------------------------------------------
// MAIN REAL-TIME MODERATION PROCESSING PIPELINE
// -------------------------------------------------------------
export async function processIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  if (!msg.key || !msg.message) return;

  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || !remoteJid.endsWith('@g.us')) {
    // Only moderate WhatsApp groups
    return;
  }

  // Ignore bot's own messages
  if (msg.key.fromMe) return;

  const msgId = msg.key.id;
  if (msgId && processedMsgIds.has(msgId)) {
    return; // Already processed
  }
  if (msgId) {
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > 2000) {
      const first = processedMsgIds.values().next().value;
      if (first) processedMsgIds.delete(first);
    }
  }

  // Update total messages checked
  db.stats.messagesChecked++;
  saveDatabase();

  const senderJid = msg.key.participant || msg.participant || '';
  if (!senderJid) return;

  const cleanPhone = senderJid.split('@')[0].split(':')[0];
  const settings = getSettings();

  // 1. Verify Admin Permissions
  const { isSenderAdmin, isBotAdmin, groupSubject } = await checkPermissions(sock, remoteJid, senderJid);

  // 1. FEATURE 1: ADMIN SECURITY SHIELD
  if (settings.adminShield && isSenderAdmin) {
    // Never moderate admins
    return;
  }

  const realMsg = extractRealMessage(msg.message);
  if (!realMsg) return;

  const isSticker = Boolean(realMsg.stickerMessage);
  const isGif = Boolean(realMsg.videoMessage?.gifPlayback || realMsg.imageMessage?.mimetype === 'image/gif' || realMsg.videoMessage?.mimetype === 'image/gif');
  const isVideo = Boolean(realMsg.videoMessage) && !isGif;
  const isImage = Boolean(realMsg.imageMessage) && !isGif;
  const isViewOnce = isViewOnceMessage(msg, realMsg);
  const messageText = extractMessageText(realMsg);

  // -------------------------------------------------------------
  // FEATURE 3: ANTI-STICKER SPAM (5s >= 3 stickers -> 10m Group Lock)
  // -------------------------------------------------------------
  if (settings.antiStickerSpam && isSticker) {
    const isSpam = recordStickerAndCheckSpam(remoteJid, senderJid);
    if (isSpam) {
      console.log(`[Anti-Sticker Spam] Detected 3+ stickers in 5s by @${cleanPhone} in ${groupSubject}`);

      // Delete the spam sticker
      try {
        await sock.sendMessage(remoteJid, { delete: msg.key });
        db.stats.deletedMessages++;
      } catch (err: any) {
        console.error('Failed to delete spam sticker:', err.message);
      }

      // Lock group to Announcement Mode (Only Admins can send)
      const lockDurationMs = 10 * 60 * 1000; // 10 minutes
      const lockedUntil = Date.now() + lockDurationMs;

      let lockSuccess = false;
      if (isBotAdmin) {
        try {
          await sock.groupSettingUpdate(remoteJid, 'announcement');
          lockSuccess = true;
          db.groupLocks[remoteJid] = {
            groupId: remoteJid,
            lockedUntil,
            originalSetting: 'not_announcement',
            reason: `Sticker spam by @${cleanPhone}`,
          };
          db.stats.groupLocksTriggered++;
          saveDatabase();

          await sock.sendMessage(remoteJid, {
            text: `⚠️ [WAGuard Anti-Sticker Spam Alert]\n🚫 সদস্য @${cleanPhone} কর্তৃক ৫ সেকেন্ডে অতিরিক্ত স্টিকার স্প্যাম শনাক্ত হয়েছে!\n🔒 পুরো গ্রুপটিকে ১০ মিনিটের জন্য Announcement Mode-এ লক করা হলো।\n⏰ শুধু অ্যাডমিন মেসেজ পাঠাতে পারবেন। ১০ মিনিট পর স্বয়ংক্রিয়ভাবে গ্রুপটি পুনরায় উন্মুক্ত হবে।`,
            mentions: [senderJid],
          });

          addActivityLog({
            groupId: remoteJid,
            groupName: groupSubject,
            senderJid,
            senderPhone: cleanPhone,
            action: 'locked',
            reason: '৫ সেকেন্ডে ৩+ স্টিকার স্প্যামের কারণে গ্রুপ ১০ মিনিট লক করা হয়েছে।',
          });
        } catch (err: any) {
          console.error('Failed to lock group:', err.message);
        }
      } else {
        await sock.sendMessage(remoteJid, {
          text: `⚠️ [WAGuard Alert] @${cleanPhone} স্টিকার স্প্যাম করেছেন! তবে WAGuard বট অ্যাডমিন না থাকায় গ্রুপটি লক করা সম্ভব হয়নি। দয়া করে বটকে অ্যাডমিন পারমিশন দিন।`,
          mentions: [senderJid],
        });
      }

      return;
    }
  }

  // -------------------------------------------------------------
  // RULE EVALUATION ENGINE (Fast Local Moderation)
  // -------------------------------------------------------------
  let violationType: string | null = null;
  let violationDetails = '';

  // Feature 2: ANTI-STICKER
  if (settings.antiSticker && isSticker) {
    violationType = 'Anti-Sticker';
    violationDetails = 'স্টিকার পাঠানো নিষিদ্ধ';
  }
  // Feature 4: ANTI-GIF
  else if (settings.antiGif && isGif) {
    violationType = 'Anti-GIF';
    violationDetails = 'GIF এবং এনিমেটেড ভিডিও পাঠানো নিষিদ্ধ';
  }
  // Feature 5: ANTI-VIDEO
  else if (settings.antiVideo && isVideo) {
    violationType = 'Anti-Video';
    violationDetails = 'ভিডিও পাঠানো নিষিদ্ধ';
  }
  // Feature 6: ANTI-IMAGE
  else if (settings.antiImage && isImage) {
    violationType = 'Anti-Image';
    violationDetails = 'ছবি বা ফটো পাঠানো নিষিদ্ধ';
  }
  // Feature 7: ANTI-VIEW ONCE
  else if (settings.antiViewOnce && isViewOnce) {
    violationType = 'Anti-View Once';
    violationDetails = 'View Once মিডিয়া পাঠানো নিষিদ্ধ';
  }
  // Feature 9: ANTI-LINK
  else if (settings.antiLink && messageText) {
    const linkCheck = checkLinkViolation(messageText);
    if (linkCheck.isLink) {
      violationType = 'Anti-Link';
      violationDetails = `লিংক পাঠানো নিষিদ্ধ (${linkCheck.matchedLink})`;
    }
  }
  // Feature 8: ADVANCED MULTILINGUAL ANTI-BADWORD
  if (!violationType && settings.antiBadword && messageText) {
    const badwordCheck = checkBadwordViolation(messageText, settings.customBadwords);
    if (badwordCheck.isBad) {
      violationType = 'Anti-Badword';
      violationDetails = `অপমানজনক বা গালি শব্দ শনাক্ত হয়েছে (${badwordCheck.matchedWord})`;
    }
  }

  // -------------------------------------------------------------
  // VIOLATION ENFORCEMENT (Delete -> Warning -> Auto Kick on 3rd)
  // -------------------------------------------------------------
  if (violationType) {
    console.log(`[Moderation Triggered] ${violationType} in ${groupSubject} by @${cleanPhone}`);

    // Step 1: Real Message Delete Operation
    let deleteSuccessful = false;
    try {
      await sock.sendMessage(remoteJid, { delete: msg.key });
      deleteSuccessful = true;
      db.stats.deletedMessages++;
    } catch (err: any) {
      console.error('Failed to delete violating message:', err.message);
    }

    // Step 2: Warning Counter per Member per Group
    const warningKey = `${remoteJid}:${senderJid}`;
    if (!db.warnings[warningKey]) {
      db.warnings[warningKey] = {
        count: 0,
        lastViolation: Date.now(),
        violations: [],
      };
    }

    db.warnings[warningKey].count++;
    db.warnings[warningKey].lastViolation = Date.now();
    db.warnings[warningKey].violations.push({
      timestamp: Date.now(),
      reason: violationDetails,
    });
    db.stats.warningsGiven++;
    saveDatabase();

    const warningCount = db.warnings[warningKey].count;

    // Feature 10: THREE WARNING AUTO KICK
    if (warningCount === 1) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ [সতর্কবার্তা ১/৩]\nসদস্য @${cleanPhone}, গ্রুপে ${violationDetails}!\nআপনার মেসেজটি মুছে দেওয়া হয়েছে। নিয়ম মেনে চলার অনুরোধ করা হচ্ছে।`,
        mentions: [senderJid],
      });

      addActivityLog({
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid,
        senderPhone: cleanPhone,
        action: 'warned',
        reason: `${violationType} (১ম সতর্কতা)`,
        details: violationDetails,
        warningCount: 1,
      });
    } else if (warningCount === 2) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ [সতর্কবার্তা ২/৩]\nসদস্য @${cleanPhone}, এটি আপনার দ্বিতীয় সতর্কতা (${violationDetails})!\nপরবর্তী আরেকটি নিয়মলঙ্ঘনে আপনাকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে রিমুভ (Kick) করা হবে!`,
        mentions: [senderJid],
      });

      addActivityLog({
        groupId: remoteJid,
        groupName: groupSubject,
        senderJid,
        senderPhone: cleanPhone,
        action: 'warned',
        reason: `${violationType} (২য় সতর্কতা)`,
        details: violationDetails,
        warningCount: 2,
      });
    } else if (warningCount >= 3) {
      // 3rd Warning -> Final Warning & Auto Kick
      if (settings.autoKick3Warnings) {
        if (isBotAdmin) {
          try {
            await sock.sendMessage(remoteJid, {
              text: `🚨 [চূড়ান্ত অ্যাকশন - ৩য় সতর্কতা]\nসদস্য @${cleanPhone} ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})।\nনিরাপত্তার স্বার্থে তাকে গ্রুপ থেকে রিমুভ (Kick) করা হচ্ছে!`,
              mentions: [senderJid],
            });

            // Real participant removal
            const kickResult = await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
            console.log(`Real Kick result for @${cleanPhone}:`, kickResult);

            db.stats.kickedMembers++;
            delete db.warnings[warningKey];
            saveDatabase();

            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'kicked',
              reason: `৩ বার সতর্কতা অতিক্রান্ত (${violationType})`,
              details: 'সদস্যকে গ্রুপ থেকে সফলভাবে রিমুভ করা হয়েছে।',
              warningCount: 3,
            });
          } catch (kickErr: any) {
            console.error('Failed to kick member:', kickErr.message);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ [ত্রুটি] সদস্য @${cleanPhone} ৩টি সতর্কতা অতিক্রম করেছেন, কিন্তু WhatsApp সিস্টেমে কিক করার সময় ত্রুটি দেখা দিয়েছে (${kickErr.message})।`,
              mentions: [senderJid],
            });
            addActivityLog({
              groupId: remoteJid,
              groupName: groupSubject,
              senderJid,
              senderPhone: cleanPhone,
              action: 'error',
              reason: `Kick Failed: ${kickErr.message}`,
              warningCount: 3,
            });
          }
        } else {
          // Bot is NOT admin - show REAL error, do not fake success!
          await sock.sendMessage(remoteJid, {
            text: `⚠️ [সতর্কবার্তা ৩/৩ - অ্যাডমিন আবশ্যক]\nসদস্য @${cleanPhone} ৩টি নিয়ম লঙ্ঘন করেছেন! কিন্তু WAGuard বট এই গ্রুপের অ্যাডমিন না হওয়ায় সদস্যকে বাস্তবে কিক করা সম্ভব হয়নি। দয়া করে গ্রুপ অ্যাডমিন বটকে অ্যাডমিন পারমিশন দিন।`,
            mentions: [senderJid],
          });

          addActivityLog({
            groupId: remoteJid,
            groupName: groupSubject,
            senderJid,
            senderPhone: cleanPhone,
            action: 'error',
            reason: 'Bot is not group admin; cannot kick member.',
            warningCount: 3,
          });
        }
      } else {
        await sock.sendMessage(remoteJid, {
          text: `🚨 [সতর্কবার্তা ৩/৩]\nসদস্য @${cleanPhone}, আপনি ৩ বার গ্রুপের নিয়ম লঙ্ঘন করেছেন (${violationDetails})। দয়া করে গ্রুপের নিয়ম মেনে চলুন।`,
          mentions: [senderJid],
        });
      }
    }

    return; // Message handled and penalized
  }

  // -------------------------------------------------------------
  // BOT MENTION & NAME CALLING REPLY (মায়া, মায়ান, WAGuard, Bot Tag)
  // -------------------------------------------------------------
  if (settings.botReply && messageText) {
    const lower = messageText.toLowerCase();
    const botJid = sock.user?.id || '';
    const cleanBot = botJid.split('@')[0].split(':')[0];

    const isMentioned =
      msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botJid) ||
      lower.includes('@' + cleanBot) ||
      lower.includes('waguard') ||
      lower.includes('মায়া') ||
      lower.includes('মায়ান') ||
      lower.includes('বট') ||
      lower.includes('bot');

    if (isMentioned) {
      console.log(`Bot called/mentioned in ${groupSubject} by @${cleanPhone}`);
      const replies = [
        `🤖 আসসালামু আলাইকুম @${cleanPhone}! আমি WAGuard - আপনার গ্রুপের সার্বক্ষণিক রিয়েল সিকিউরিটি গার্ড। গ্রুপে স্প্যাম, গালি ও ক্ষতিকর লিংক প্রতিরোধে আমি সক্রিয় আছি। কোনো সাহায্য প্রয়োজন?`,
        `👋 হ্যালো @${cleanPhone}! আমি WAGuard সিকিউরিটি বট। আমি এই গ্রুপের সকল মেসেজ মনিটর ও সুরক্ষিত রাখছি। সবাইকে নিয়ম মেনে চলার অনুরোধ করছি।`,
        `🛡️ আসসালামু আলাইকুম! আমি মায়া ও মায়ান AI ইঞ্জিনের সমন্বয়ে তৈরি WAGuard। গ্রুপটি সম্পূর্ণ নিরাপদ রয়েছে।`,
      ];
      const replyText = replies[Math.floor(Math.random() * replies.length)];

      try {
        await sock.sendMessage(remoteJid, {
          text: replyText,
          mentions: [senderJid],
        });

        addActivityLog({
          groupId: remoteJid,
          groupName: groupSubject,
          senderJid,
          senderPhone: cleanPhone,
          action: 'replied',
          reason: 'বট মেনশন বা নাম ধরে ডাকার রেসপন্স',
          details: messageText.slice(0, 60),
        });
      } catch (err: any) {
        console.error('Failed to reply to bot mention:', err.message);
      }
    }
  }
}
