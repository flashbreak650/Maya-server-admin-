import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  LayoutDashboard,
  Plug,
  Users,
  Smartphone,
  MessagesSquare,
  AlertTriangle,
  Ban,
  Link as LinkIcon,
  Bot,
  ArrowRight,
  Sparkles,
  Save,
  Send,
  Activity,
  MessageCircle,
  Zap,
  Cpu,
  Database,
  Server,
  RotateCcw,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
  CheckCircle2,
  Check,
  QrCode as QrIcon,
  LogOut,
  Radio,
  Trash2,
  Lock,
  FileText,
  AlertOctagon,
  Image as ImageIcon,
  Film,
  Smile,
  ShieldAlert,
  Heart,
  MessageSquareHeart,
  CalendarClock,
  Coins,
  Globe,
  UserX,
  VolumeX,
  Clock,
  ChevronUp,
  ChevronDown,
  Info,
  Download,
  Upload,
  ArrowLeft,
  Moon,
  PhoneOff,
  ScanEye,
  Trophy,
  Hash,
  HardDrive,
  Inbox,
  AudioLines,
  Wifi,
} from 'lucide-react';
import { HELP_ITEMS } from './helpData.ts';
import { HelpModal } from './components/HelpModal.tsx';
import {
  PageId,
  KeywordTriggerItem,
  CallLogViewItem,
  MemberActivityViewItem,
  NightModeStatusView,
  GroupMemberDirectoryViewItem,
  CompanionStatusView,
  AdminLockScreen,
  HomeFeatureHub,
  WarningsPage,
  BlocksPage,
  MemberBlockPage,
  LogsPage,
  NightModePage,
  AntiCallPage,
  AiVisionPage,
  ActivityRankPage,
  KeywordsPage,
  PinLockPage,
  CompanionBotPage,
} from './components/FeaturePages.tsx';
import { SecurityToolPage, SecurityToolId } from './components/SecurityToolPages.tsx';
import {
  StorageCleanupPage,
  formatBytesHuman,
  type StorageCleanupOverview,
} from './components/StorageCleanupPage.tsx';
import {
  GroupInboxPage,
} from './components/GroupInboxPage.tsx';
import {
  VoiceModerationPage,
  type VoiceModerationOverview,
} from './components/VoiceModerationPage.tsx';
import { AiMascotOverlay } from './components/AiMascotOverlay.tsx';
import { WAGuardLogo } from './components/WAGuardLogo.tsx';

interface LatestDisconnectInfo {
  id: string;
  sourceLabelBn?: string;
  sourceLabelEn?: string;
  statusCode?: string | number;
  titleBn: string;
  titleEn: string;
  causeBn: string;
  causeEn: string;
  solutionBn?: string;
  solutionEn?: string;
  resolvedAt?: number | null;
}

interface GroupItem {
  id: string;
  name: string;
  participants: number;
  status: string;
}

interface LiveStatusData {
  status: 'disconnected' | 'connecting' | 'pairing' | 'connected';
  step: 'idle' | 'initializing' | 'waiting_for_phone' | 'connected' | 'error';
  stepMessage: string;
  lastConnectionStatus?: string;
  online: boolean;
  phoneNumber?: string;
  pairingCode?: string;
  qrCode?: string;
  remainingSeconds: number;
  user?: any;
  lastError?: string | null;
  reconnectAttempts?: number;
  latestDisconnect?: LatestDisconnectInfo | null;
}

interface ModerationSettings {
  adminShield: boolean;
  antiSticker: boolean;
  antiStickerSpam: boolean;
  antiGif: boolean;
  antiVideo: boolean;
  antiImage: boolean;
  antiViewOnce: boolean;
  antiBadword: boolean;
  antiLink: boolean;
  allowCarromLinks?: boolean;
  autoKick3Warnings: boolean;
  autoWelcome: boolean;
  welcomeMessage?: string;
  newMemberInboxRulesEnabled?: boolean;
  newMemberInboxRulesNotice?: string;
  newMemberGroupNoticeText?: string;
  botReply: boolean;
  customBadwords: string[];
  // Maya AI Settings
  mayaAiEnabled: boolean;
  mayaPrivateReply: boolean;
  mayaGroupReply: boolean;
  aiProvider: 'gemini' | 'groq' | 'openrouter' | 'auto';
  geminiModel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  mayaRomantic: boolean;
  mayaFunny: boolean;
  mayaAutoParticipate: boolean;
  mayaReplyCooldown: number;
  mayaReplyFrequency: number;
  mayaLanguage: string;
  mayaMemoryLimit: number;
  aiBadwordDetection: boolean;
  silentModeration: boolean;
  hideNameOnDelete?: boolean;
  silentAllPresetMigratedV1?: boolean;
  mayaReplyMode: 'group' | 'inbox' | 'off';
  // AI Key Pool
  aiKeys?: AiKey[];
  aiAutoRotate?: boolean;
  aiProviderPriority?: ('gemini' | 'groq' | 'openrouter')[];
  // Feature #1-#6 Settings
  dashboardPinEnabled?: boolean;
  nightModeEnabled?: boolean;
  nightLockStart?: string;
  nightLockEnd?: string;
  nightModeTimezone?: string;
  nightModeNotify?: boolean;
  antiCallEnabled?: boolean;
  antiCallMessage?: string;
  antiCallAutoBlockCount?: number;
  mayaVoiceEnabled?: boolean;
  mayaVisionEnabled?: boolean;
  antiNsfwImage?: boolean;
  activityTrackingEnabled?: boolean;
  keywordAutoReplyEnabled?: boolean;
  keywordTriggers?: KeywordTriggerItem[];
  individualMuteEnabled?: boolean;
  individualMuteStickerLimit?: number;
  individualMuteTimeWindow?: number;
  individualMuteDurationMinutes?: number;
  stickerDeleteMaxRetries?: number;
  stickerQueueConcurrency?: number;
  manualBlockNotice?: string;
  autoSalamReplyEnabled?: boolean;
  botTypingEnabled?: boolean;
  leaderboardCleanOnly?: boolean;
  adminMentionReplyEnabled?: boolean;
  adminMentionReplyTarget?: 'all_admins' | 'boss_only';
  adminMentionReplyMessage?: string;
  bossAdminNumber?: string;
  secondAdminNumber?: string;
  bossFightAlertEnabled?: boolean;
  bossFightMinPeople?: number;
  bossFightWindowMinutes?: number;
  serverErrorNoticeEnabled?: boolean;
  serverErrorNoticeTarget?: 'boss_inbox' | 'groups' | 'both';
  // Secondary Female AI Companion Account
  companionEnabled?: boolean;
  companionName?: string;
  companionInboxReply?: boolean;
  companionGroupReply?: boolean;
  companionGroupMode?: 'smart_auto' | 'mention_or_reply' | 'all';
  companionRomanticLevel?: 'sweet' | 'romantic' | 'balanced';
  companionStrictAccuracy?: boolean;
  companionCooldownSec?: number;
  companionAllowedGroups?: string[];
  companionCustomBio?: string;
  voiceModerationEnabled?: boolean;
  voiceUseGeminiApi?: boolean;
  voiceDetectBangla?: boolean;
  voiceDetectSylheti?: boolean;
  voiceDetectEnglish?: boolean;
  voiceDetectBanglish?: boolean;
  voiceReviewUnclearEnabled?: boolean;
  voiceAutoSelectModel?: boolean;
  voiceProfanitySensitivity?: 'low' | 'medium' | 'high';
  voiceAllowedWords?: string[];
  voiceBlockedWords?: string[];
  voiceWhisperModel?: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';
}

export interface AiKey {
  id: string;
  key: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  label: string;
  status: 'active' | 'exhausted' | 'invalid' | 'cooldown';
  cooldownUntil: number;
  lastUsed: number;
  totalRequests: number;
  failureCount: number;
  lastError?: string;
}

interface ActivityLog {
  id: string;
  timestamp: number;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  action: 'deleted' | 'warned' | 'kicked' | 'locked' | 'unlocked' | 'error' | 'replied' | 'restricted' | 'unmuted';
  reason: string;
  details?: string;
  warningCount?: number;
}

interface ActiveWarningItem {
  key: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  count: number;
  maxWarnings: number;
  lastViolation: number;
  violations: Array<{ timestamp: number; reason: string }>;
}

interface ActiveGroupLockItem {
  groupId: string;
  groupName: string;
  lockedUntil: number;
  originalSetting: string;
  reason: string;
  remainingSeconds: number;
  remainingText: string;
}

export default function App() {
  const [isStaticHost] = useState(() => {
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
    return isCapacitor || window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev');
  });
  const [activePage, setActivePage] = useState<PageId>('home');
  const [homeToolSearch, setHomeToolSearch] = useState('');
  const [uiLang, setUiLang] = useState<'bn' | 'en'>((localStorage.getItem('wg_ui_lang') as 'bn' | 'en') || 'bn');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<any>(null);
  const [activeHelpId, setActiveHelpId] = useState<string | null>(null);

  const openHelp = (id: string) => setActiveHelpId(id);
  const closeHelp = () => setActiveHelpId(null);

  const renderInfoBtn = (id: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openHelp(id);
      }}
      className="inline-flex items-center justify-center w-6 h-6 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 transition-colors cursor-pointer shrink-0"
      title={isBn ? 'বিস্তারিত জানুন' : 'Help & Info'}
    >
      <Info size={12} className="stroke-[3]" />
    </button>
  );

  const toggleUiLang = () => {
    const nextLang = uiLang === 'bn' ? 'en' : 'bn';
    setUiLang(nextLang);
    localStorage.setItem('wg_ui_lang', nextLang);
    showNotification(nextLang === 'bn' ? 'ভাষা বাংলা সিলেক্ট করা হয়েছে' : 'Language switched to English');
  };

  const isBn = uiLang === 'bn';

  // Comprehensive Translation Dictionary
  const t = {
    // Nav
    home: isBn ? 'হোম' : 'Home',
    security: isBn ? 'সিকিউরিটি' : 'Security',
    maya: isBn ? 'মায়া AI' : 'Maya AI',
    integrations: isBn ? 'API কি' : 'API Keys',
    groups: isBn ? 'গ্রুপ' : 'Groups',
    connect: isBn ? 'কানেক্ট' : 'Connect',
    mainMenu: isBn ? 'প্রধান মেনু' : 'MAIN MENU',

    // Status Tags & Pills
    connected: isBn ? 'অনলাইন ও কানেক্টেড' : 'Online & Connected',
    pairingActive: isBn ? 'পেয়ারিং চালু আছে' : 'Pairing Active',
    disconnected: isBn ? 'ডিসকানেক্টেড' : 'Disconnected',
    realPortConnected: isBn ? 'সরাসরি সকেট লাইভ কানেক্টেড' : 'Live Socket Connected',
    realPortReady: isBn ? 'সরাসরি WhatsApp সার্ভার রেডি' : 'WhatsApp Server Ready',

    // Action Buttons
    refresh: isBn ? 'রিফ্রেশ' : 'Refresh',
    syncStatus: isBn ? 'সিঙ্ক স্ট্যাটাস' : 'Sync Status',
    disconnectWa: isBn ? 'ডিসকানেক্ট WhatsApp' : 'Disconnect WhatsApp',
    connectWa: isBn ? 'কানেক্ট WhatsApp (৮-ডিজিট)' : 'Connect WhatsApp (8-Digit)',

    // Home Overview
    overviewTitle: isBn ? 'Overview Dashboard' : 'Overview Dashboard',
    overviewDesc: isBn ? 'লাইভ ক্লাউড মনিটরিং সেন্টার ও WhatsApp মডারেশন।' : 'Real-time cloud monitoring & WhatsApp live moderation.',
    messagesChecked: isBn ? 'পরীক্ষাকৃত মেসেজ' : 'Messages Checked',
    warnings: isBn ? 'সতর্কবার্তা' : 'Warnings',
    blockedItems: isBn ? 'ব্লককৃত মেসেজ' : 'Blocked Items',
    activeGroups: isBn ? 'সক্রিয় গ্রুপ' : 'Active Groups',
    realtimeEngine: isBn ? 'লাইভ ইঞ্জিন' : 'Real-time Engine',
    activeWarnings: isBn ? 'সক্রিয় ওয়ার্নিং' : 'Active Warnings',
    deletedViolations: isBn ? 'মুছে ফেলা ভায়োলেশন' : 'Deleted Violations',
    protectedGroups: isBn ? 'সুরক্ষিত গ্রুপ' : 'Protected Groups',
    
    // Bot Connection Card
    botConnTitle: isBn ? 'WhatsApp বট কানেকশন' : 'WhatsApp Bot Connection',
    botConnDescConnected: (user: string) => isBn ? `আপনার WhatsApp অ্যাকাউন্ট (${user}) সফলভাবে যুক্ত রয়েছে!` : `Your WhatsApp account (${user}) is connected and active!`,
    botConnDescDisconnected: isBn ? 'Real-time online pairing এবং অফিশিয়াল ৮-ডিজিট কোড প্রসেস (REAL BAILEYS).' : 'Real-time online pairing and official 8-digit code process.',
    groupSecTitle: isBn ? 'গ্রুপ সিকিউরিটি স্ট্যাটাস' : 'Group Security Status',
    groupSecDesc: isBn ? '🛡️ Admin Shield, Anti-Badword, Anti-Link, 3-Warning Auto-Kick এবং Anti-Sticker Spam রিয়েল-টাইমে সক্রিয় আছে।' : '🛡️ Admin Shield, Anti-Badword, Anti-Link, 3-Warning Auto-Kick and Anti-Sticker Spam active.',
    manageRulesBtn: isBn ? 'সিকিউরিটি রুলস নিয়ন্ত্রণ' : 'Manage Security Rules',

    // Security Page
    securityTitle: isBn ? 'গ্রুপ সিকিউরিটি ও মডারেশন' : 'Group Security & Moderation',
    securitySub: isBn ? 'রিয়েল-টাইম গ্রুপ সুরক্ষা, অ্যান্টি-স্প্যাম, গালি ফিল্টার ও অটো-কিক ইঞ্জিন।' : 'Real-time group protection, anti-spam, badword filter & auto-kick engine.',
    refreshRules: isBn ? 'রুলস রিফ্রেশ' : 'Refresh Rules',
    resetWarningsBtn: isBn ? 'সকল Warning রিসেট' : 'Reset All Warnings',

    // Security Cards
    sec1Title: isBn ? '১. অ্যাডমিন সিকিউরিটি শিল্ড ও অটো-কিক' : '1. Admin Security Shield & Auto-Kick System',
    sec1Sub: isBn ? 'গ্রুপ অ্যাডমিনদের নিরাপত্তা ও ৩ সতর্কতা কিক নিয়মাবলী' : 'Group admin protection & 3-warning auto-kick rules',
    adminShieldTitle: isBn ? 'Admin Security Shield (অ্যাডমিন সুরক্ষা)' : 'Admin Security Shield',
    adminShieldDesc: isBn ? 'সক্রিয় থাকলে কোনো Group Admin-কে কখনো Kick বা Warning দেবে না এবং তাদের মেসেজ ডিলিট করবে না।' : 'When active, never kick, warn, or delete messages from Group Admins.',
    autoKickTitle: isBn ? 'Three Warning Auto Kick (৩ স্ট্রাইক কিক)' : 'Three Warning Auto Kick',
    autoKickDesc: isBn ? '১ম ও ২য় বার Warning, ৩য় বার বাস্তবে কিক। বট অ্যাডমিন হলে সদস্যকে বাস্তবে Kick করবে।' : 'Warning 1, Warning 2, and real Kick on 3rd violation when bot is admin.',

    sec2Title: isBn ? '২. মিডিয়া ফিল্টার ও অ্যান্টি-স্প্যাম লক' : '2. Media Restrictions & Anti-Spam Lock',
    sec2Sub: isBn ? 'স্টিকার স্প্যাম, জিআইএফ, ভিডিও, ছবি ও ভিউ ওয়ান্স মডারেশন' : 'Sticker spam, GIF, video, photo & view-once moderation',
    
    antiStickerSpamTitle: isBn ? 'Anti-Sticker Spam (দ্রুত স্প্যাম সুরক্ষা)' : 'Anti-Sticker Spam (High-Priority Queue)',
    antiStickerSpamDesc: isBn ? 'নির্ধারিত সময়ের মধ্যে অতিরিক্ত Sticker পাঠালে High-Priority Queue-তে সঙ্গে সঙ্গে ডিলিট ও স্প্যামারকে সাময়িক ব্লক করবে।' : 'Rapid sticker bursts are queued immediately, deleted in parallel, and restrict only the spammer.',
    antiStickerTitle: isBn ? 'Anti-Sticker (সকল স্টিকার নিষিদ্ধ)' : 'Anti-Sticker (All Stickers)',
    antiStickerDesc: isBn ? 'গ্রুপে যেকোনো WhatsApp Sticker সঙ্গে সঙ্গে Queue হয়ে ডিলিট ও সতর্ক করবে।' : 'Deletes all stickers sent in groups via high-priority queue.',
    antiGifTitle: isBn ? 'Anti-GIF (জিআইএফ ডিলিট)' : 'Anti-GIF (Animated GIF & Video GIFs)',
    antiGifDesc: isBn ? 'যেকোনো GIF এবং Animated GIF Video ডিলিট করবে।' : 'Deletes all GIFs and animated media.',
    antiVideoTitle: isBn ? 'Anti-Video (ভিডিও ডিলিট)' : 'Anti-Video',
    antiVideoDesc: isBn ? 'গ্রুপে যেকোনো Video Message ডিলিট করবে।' : 'Deletes video messages.',
    antiImageTitle: isBn ? 'Anti-Image / Photo (ছবি ডিলিট)' : 'Anti-Image / Photo',
    antiImageDesc: isBn ? 'গ্রুপে যেকোনো Photo বা Image ডিলিট করবে।' : 'Deletes photo messages.',
    antiViewOnceTitle: isBn ? 'Anti-View Once (ভিউ ওয়ান্স ডিলিট)' : 'Anti-View Once',
    antiViewOnceDesc: isBn ? 'View Once Photo এবং View Once Video ডিলিট ও সতর্ক করবে।' : 'Deletes View Once photos and videos.',

    sec3Title: isBn ? '৩. বহুভাষিক গালি ও লিংক ফিল্টার' : '3. Multilingual Badword & Link Detection',
    sec3Sub: isBn ? 'বাংলা, সিলেটি, Banglish, Hindi, English, Arabic গালি ফিল্টার' : 'Bengali, Sylheti, Banglish, Hindi, English, Arabic profanity filter',
    antiBadwordTitle: isBn ? 'Advanced Multilingual Anti-Badword' : 'Advanced Multilingual Anti-Badword',
    antiBadwordDesc: isBn ? 'বাংলা, সিলেটি, Banglish, English, Hindi, Arabic গালি ও স্পেস দিয়ে লেখা শব্দও ডিলিট করবে।' : 'Detects profanity across languages including spaced & leetspeak variants.',
    antiLinkTitle: isBn ? 'Anti-Link (সকল লিংক ও গ্রুপ ইনভাইট)' : 'Anti-Link (All URLs & WhatsApp Invites)',
    antiLinkDesc: isBn ? 'Website URL, WhatsApp Invites, Telegram, Facebook, YouTube লিংক মুছে ফেলবে।' : 'Deletes URLs, group invite links, and social media links.',
    botReplyTitle: isBn ? 'Bot Reply System (ইনবক্সে অটো-উত্তর)' : 'Bot Reply System (Private DM Reply)',
    botReplyDesc: isBn ? 'সক্রিয় থাকলে গ্রুপে মেম্বাররা বটের নাম বললেও বট গ্রুপে মেসেজ না দিয়ে সরাসরি ওই মেম্বারের ইনবক্সে (DM) মেসেজ করবে।' : 'When enabled, mentions/tags in group will cause Maya to reply privately in the member\'s DM instead of group.',
    customBadwordsLabel: isBn ? 'Custom Badword List (কাস্টম নিষিদ্ধ শব্দের তালিকা)' : 'Custom Badword List',
    customBadwordsHint: isBn ? 'কমা (,) দিয়ে আলাদা করে শব্দ লিখুন।' : 'Separate words with commas.',
    saveBadwordsBtn: isBn ? 'কাস্টম ব্যাডওয়ার্ড সেভ' : 'Save Custom Badwords',

    // New Moderation & AI
    aiBadwordTitle: isBn ? 'Gemini AI Badword Detector (এআই গালি শনাক্তকারী)' : 'Gemini AI Badword Detector',
    aiBadwordDesc: isBn ? 'লিস্টে নেই এমন গালি বা আপত্তিকর কথা জিমিনি এআই এর মাধ্যমে খুঁজে বের করে ডিলিট করবে।' : 'Uses Gemini AI to detect complex badwords not in the custom list.',
    silentModTitle: isBn ? 'ডিলিট ও ওয়ার্নিং নোটিশ (Warning Notice)' : 'Delete Warning Notices',
    silentModDesc: isBn ? 'চালু থাকলে মেসেজ ডিলিটের পর গ্রুপে সতর্কবার্তা পাঠাবে; বন্ধ থাকলে নীরবে ডিলিট করবে।' : 'Send group warning notices after deleting a violation (turn OFF for silent delete).',

    // Activity Logs
    activityTitle: isBn ? 'লাইভ মডারেশন অ্যাক্টিভিটি লগ' : 'Real-Time Moderation Activity Log',
    activitySub: isBn ? 'গ্রুপে ঘটা সকল ডিলিট, ওয়ার্নিং, কিক ও লকের লাইভ রেকর্ড' : 'Live logs of deletes, warnings, kicks & locks',
    clearLogsBtn: isBn ? 'লগ ক্লিয়ার' : 'Clear Logs',
    noLogsMsg: isBn ? 'কোনো কার্যকলাপের লগ এখনো পাওয়া যায়নি। নতুন মেসেজ আসলে তা এখানে প্রদর্শিত হবে।' : 'No activity recorded yet. New events will appear here.',

    // Maya AI Page
    mayaTitle: isBn ? 'Maya AI — Advanced Romantic Personality' : 'Maya AI — Advanced Romantic Personality',
    mayaSub: isBn ? 'মায়া (Maya) বটের মিষ্টি পারসোনালিটি, রোমান্টিক ভাব ও স্বয়ংক্রিয় উত্তর নিয়ন্ত্রণ করুন।' : 'Control Maya\'s personality, romantic tone, and AI auto-responses.',
    mayaCoreTitle: isBn ? 'Maya AI Core Configuration' : 'Maya AI Core Configuration',
    mayaCoreSub: isBn ? 'বট পারসোনালিটি ও রিপ্লাই ইঞ্জিন নিয়ন্ত্রণ' : 'Control bot personality & reply engine',
    mayaEngineTitle: isBn ? 'Maya AI Engine' : 'Maya AI Engine State',
    mayaEngineDesc: isBn ? 'Gemini ও ক্লাউড এআই এর মাধ্যমে মায়ার স্মার্ট পারসোনালিটি সক্রিয় করুন।' : 'Enable Maya\'s smart real AI personality via Gemini & Groq.',
    privateInboxAiTitle: isBn ? 'Private Inbox AI (ব্যক্তিগত ইনবক্স এআই)' : 'Private Inbox AI (1-on-1 Personal Chats)',
    privateInboxAiDesc: isBn ? 'WhatsApp এর ব্যক্তিগত ইনবক্সে যেকেউ মেসেজ দিলে এআই মায়া সরাসরি মানুষের মতো উত্তর দেবে।' : 'Auto-replies dynamically to private individual WhatsApp chats.',
    groupAiTitle: isBn ? 'Group AI (গ্রুপ মেসেজ এআই)' : 'Group AI (Community Messages)',
    groupAiDesc: isBn ? 'গ্রুপে সদস্যদের কথোপকথনে এআই মায়া প্রাসঙ্গিকভাবে অংশ নিয়ে উত্তর দেবে।' : 'Auto-replies dynamically to group conversations.',
    aiProviderLabel: isBn ? 'AI ব্রেইন ইঞ্জিন' : 'AI Brain Engine Provider',
    romanticTitle: isBn ? 'Romantic Mode (রোমান্টিক মোড)' : 'Romantic Mode',
    romanticDesc: isBn ? 'মায়াকে আরও রোমান্টিক, মিষ্টি ও যত্নশীল করে তুলুন। ❤️' : 'Make Maya sweet, caring, and romantic. ❤️',
    funnyTitle: isBn ? 'Funny & Mischievous (দুষ্টুমি ও হাসি-ঠাট্টা)' : 'Funny & Mischievous',
    funnyDesc: isBn ? 'মায়াকে হাসিখুশি ও সিগনেচার ফানি রিপ্লাইয়ে অভ্যস্ত করুন। 🙈' : 'Enable playful, witty, and sassy responses. 🙈',
    autoPartTitle: isBn ? 'Auto Participation (গ্রুপে স্বয়ংক্রিয় কথা বলা)' : 'Auto Group Participation',
    autoPartDesc: isBn ? 'মায়া গ্রুপের কথা শুনে নিজে থেকেও মাঝে মাঝে কথা বলবে।' : 'Maya occasionally replies in group chats autonomously.',
    testMayaTitle: isBn ? 'Test Maya AI (চ্যাট প্রিভিউ)' : 'Test Maya AI (Live Preview)',
    testMayaSub: isBn ? 'মায়ার সাথে কথা বলে রিপ্লাই পরীক্ষা করুন।' : 'Chat directly with Maya to test her personality.',
    testMayaPlaceholder: isBn ? 'মায়াকে কিছু বলুন...' : 'Say something to Maya...',
    sendBtn: isBn ? 'পাঠান' : 'Send',

    // Connect Page
    connectTitle: isBn ? 'WhatsApp Connect Device' : 'WhatsApp Connect Device',
    connectSub: isBn ? 'অফিশিয়াল ৮-ডিজিট কোড দিয়ে ফোন যুক্ত করুন (REAL BAILEYS).' : 'Link your WhatsApp using real official 8-digit pairing code.',
    linkDeviceHead: isBn ? 'Link WhatsApp Device' : 'Link WhatsApp Device',
    eightDigitCode: isBn ? '৮-ডিজিট কোড' : '8-Digit Code',
    qrCodeLabel: isBn ? 'কিউআর কোড' : 'QR Code',
    phoneInputLabel: isBn ? 'WhatsApp Phone Number' : 'WhatsApp Phone Number',
    phoneInputHint: isBn ? 'নম্বরের শুরুতে ৮৮ না দিলে স্বয়ংক্রিয়ভাবে ৮৮ যোগ হবে (যেমন: 017XXXXXXXX -> 88017XXXXXXXX)।' : 'Auto-adds country code 88 if missing (e.g. 017XXXXXXXX -> 88017XXXXXXXX).',
    genPairCodeBtn: isBn ? 'Generate Real Pairing Code (কোড নিন)' : 'Generate Real Pairing Code',
    connectedTitle: isBn ? 'অভিনন্দন! আপনার WhatsApp সফলভাবে যুক্ত হয়েছে!' : 'Congratulations! WhatsApp Linked Successfully!',
    alreadyConnectedSub: (user: string) => isBn ? `কানেক্টেড একাউন্ট: ${user}` : `Connected Account: ${user}`,
    copyCodeBtn: isBn ? 'Copy Code' : 'Copy Code',
    getNewCodeBtn: isBn ? 'নতুন কোড নিন' : 'Get New Code',

    // Groups Page
    groupsTitle: isBn ? 'Group Management' : 'Group Management',
    groupsSub: isBn ? 'সংযুক্ত WhatsApp গ্রুপের বিবরণ ও সুরক্ষা স্ট্যাটাস।' : 'View cloud connected groups & real protection status.',
    groupNameCol: isBn ? 'গ্রুপ নাম' : 'GROUP NAME',
    membersCol: isBn ? 'সদস্য সংখ্যা' : 'MEMBERS',
    statusCol: isBn ? 'মডারেশন স্ট্যাটাস' : 'MODERATION STATUS',
    protectedBadge: isBn ? 'WAGuard দ্বারা সুরক্ষিত' : 'Protected by WAGuard',
  };

  // Live WhatsApp Connection State (restores active pairing across remount/refresh if still valid)
  const [liveStatus, setLiveStatus] = useState<LiveStatusData>(() => {
    try {
      const saved = sessionStorage.getItem('wg_active_pairing');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.pairingCode && parsed?.startedAt && Date.now() - parsed.startedAt < 120000) {
          return {
            status: 'pairing',
            step: 'waiting_for_phone',
            stepMessage: 'রিয়েল কোড প্রস্তুত! আপনার ফোনের WhatsApp থেকে কোডটি এন্টার করুন।',
            lastConnectionStatus: 'Pairing code active — waiting for confirmation',
            online: false,
            phoneNumber: parsed.phoneNumber || '',
            pairingCode: parsed.pairingCode,
            qrCode: parsed.qrCode || '',
            remainingSeconds: Math.max(0, 120 - Math.floor((Date.now() - parsed.startedAt) / 1000)),
          };
        }
      }
    } catch {}
    return {
      status: 'disconnected',
      step: 'idle',
      stepMessage: isBn ? 'WhatsApp সংযোগের জন্য প্রস্তুত' : 'Ready to connect WhatsApp',
      lastConnectionStatus: isBn ? 'সংযোগের জন্য প্রস্তুত' : 'Ready to connect',
      online: false,
      remainingSeconds: 0,
    };
  });

  // Pairing inputs & presentation
  const [phoneNumber, setPhoneNumber] = useState(localStorage.getItem('wg_phone') || '');
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [pairingMode, setPairingMode] = useState<'code' | 'qr'>('code');
  const [sessionPassphrase, setSessionPassphrase] = useState('');
  const [isTransferringSession, setIsTransferringSession] = useState(false);
  const [showSessionPasteBox, setShowSessionPasteBox] = useState(false);
  const [sessionPasteText, setSessionPasteText] = useState('');
  const sessionFileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionCardRef = useRef<HTMLDivElement | null>(null);

  const openSessionBackupSection = () => {
    navigateToPage('pairing');
    setTimeout(() => {
      sessionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  // Stats
  const [overview, setOverview] = useState({
    messagesChecked: 0,
    warnings: 0,
    blockedWords: 0,
    groups: 0,
    kickedMembers: 0,
    groupLocksTriggered: 0,
  });

  // Moderation Settings
  const [settings, setSettings] = useState<ModerationSettings>({
    adminShield: true,
    antiSticker: false,
    antiStickerSpam: true,
    antiGif: true,
    antiVideo: false,
    antiImage: false,
    antiViewOnce: true,
    antiBadword: true,
    antiLink: true,
    allowCarromLinks: true,
    autoKick3Warnings: true,
    autoWelcome: false,
    welcomeMessage: '',
    newMemberInboxRulesEnabled: false,
    newMemberInboxRulesNotice: '',
    newMemberGroupNoticeText: '',
    botReply: false,
    customBadwords: [],
    mayaAiEnabled: true,
    mayaPrivateReply: true,
    mayaGroupReply: true,
    aiProvider: 'auto',
    geminiApiKey: '',
    groqApiKey: '',
    openrouterApiKey: '',
    mayaRomantic: true,
    mayaFunny: true,
    mayaAutoParticipate: true,
    mayaReplyCooldown: 10,
    mayaReplyFrequency: 100,
    mayaLanguage: 'auto',
    mayaMemoryLimit: 20,
    aiBadwordDetection: true,
    silentModeration: true,
    hideNameOnDelete: true,
    silentAllPresetMigratedV1: true,
    mayaReplyMode: 'group',
    dashboardPinEnabled: false,
    nightModeEnabled: false,
    nightLockStart: '00:00',
    nightLockEnd: '06:00',
    nightModeTimezone: 'Asia/Dhaka',
    nightModeNotify: false,
    antiCallEnabled: false,
    antiCallMessage: '📵 দুঃখিত! এটি একটি অটোমেটেড WhatsApp সিকিউরিটি বট। অনুগ্রহ করে কল না করে মেসেজ পাঠান।',
    antiCallAutoBlockCount: 3,
    mayaVoiceEnabled: true,
    mayaVisionEnabled: true,
    antiNsfwImage: false,
    activityTrackingEnabled: true,
    keywordAutoReplyEnabled: false,
    keywordTriggers: [],
    individualMuteEnabled: true,
    individualMuteStickerLimit: 3,
    individualMuteTimeWindow: 5,
    individualMuteDurationMinutes: 10,
    stickerDeleteMaxRetries: 4,
    stickerQueueConcurrency: 5,
    manualBlockNotice: '',
    autoSalamReplyEnabled: false,
    botTypingEnabled: true,
    leaderboardCleanOnly: true,
    adminMentionReplyEnabled: false,
    adminMentionReplyTarget: 'all_admins',
    adminMentionReplyMessage: '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।',
    bossAdminNumber: '8801632222592',
    secondAdminNumber: '8801346561627',
    bossFightAlertEnabled: true,
    bossFightMinPeople: 3,
    bossFightWindowMinutes: 5,
    serverErrorNoticeEnabled: true,
    serverErrorNoticeTarget: 'boss_inbox',
    voiceModerationEnabled: true,
    voiceUseGeminiApi: true,
    voiceDetectBangla: true,
    voiceDetectSylheti: true,
    voiceDetectEnglish: true,
    voiceDetectBanglish: true,
    voiceReviewUnclearEnabled: true,
    voiceAutoSelectModel: false,
    voiceProfanitySensitivity: 'medium',
    voiceAllowedWords: [],
    voiceBlockedWords: [],
    voiceWhisperModel: 'base-q5_1',
  });
  const [customBadwordsText, setCustomBadwordsText] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<any[]>([]);
  const [activeWarnings, setActiveWarnings] = useState<ActiveWarningItem[]>([]);
  const [groupLocks, setGroupLocks] = useState<ActiveGroupLockItem[]>([]);
  const [stickerQueue, setStickerQueue] = useState<{
    pendingCount: number;
    processingCount: number;
    inFlightWorkers: number;
    isRateLimited: boolean;
    rateLimitRemainingSec: number;
    stats: {
      totalEnqueued: number;
      totalVerifiedDeleted: number;
      totalRetried: number;
      totalFailed: number;
      totalFailedNoPermission: number;
      totalDuplicatePrevented: number;
      totalRecoveredOnRestart: number;
    };
    permissionDeniedGroups: Array<{ groupId: string; groupName: string; detectedAt: number; blockedStickerCount: number }>;
    pendingItems: Array<any>;
    recentHistory: Array<any>;
    accumulatedStickers?: {
      totalCount: number;
      groups: Array<{ groupId: string; groupName: string; count: number }>;
      unverifiedBulkCount?: number;
      unverifiedGroups?: Array<{ groupId: string; groupName: string; count: number }>;
    };
  } | null>(null);
  const [purgingStickers, setPurgingStickers] = useState(false);
  const [purgeTargetGroupId, setPurgeTargetGroupId] = useState<string>('ALL');
  const [logFilter, setLogFilter] = useState<'all' | 'warned' | 'blocks' | 'deleted' | 'error'>('all');
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  // Feature #1-#6 States
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const isPinLockedRef = useRef(false);

  const [nightStatus, setNightStatus] = useState<NightModeStatusView | null>(null);
  const [callLogs, setCallLogs] = useState<CallLogViewItem[]>([]);
  const [keywords, setKeywords] = useState<KeywordTriggerItem[]>([]);
  const [activityReport, setActivityReport] = useState<{
    groups: Array<{ id: string; name: string; members: number; totalMessages: number }>;
    topActive: MemberActivityViewItem[];
    ghostMembers: MemberActivityViewItem[];
    totalTracked: number;
    totalMessages: number;
  }>({
    groups: [],
    topActive: [],
    ghostMembers: [],
    totalTracked: 0,
    totalMessages: 0,
  });
  const [activityGroupFilter, setActivityGroupFilter] = useState('all');
  const [activityGhostDays, setActivityGhostDays] = useState(7);

  // Group Members 10-Min Block Directory State
  const [memberDirLoading, setMemberDirLoading] = useState(false);
  const [memberDirGroups, setMemberDirGroups] = useState<
    Array<{ id: string; name: string; participants: number; isBotAdmin: boolean }>
  >([]);
  const [memberDirGroupId, setMemberDirGroupId] = useState('');
  const [memberDirIsBotAdmin, setMemberDirIsBotAdmin] = useState(false);
  const [memberDirMembers, setMemberDirMembers] = useState<GroupMemberDirectoryViewItem[]>([]);
  const [defaultManualBlockNotice, setDefaultManualBlockNotice] = useState('');
  const [blockingMemberJid, setBlockingMemberJid] = useState<string | null>(null);
  const memberLoadSeqRef = useRef(0);

  // Secondary Female AI Companion Account State
  const [companionStatus, setCompanionStatus] = useState<CompanionStatusView>({
    status: 'disconnected',
    step: 'idle',
    stepMessage: isBn ? 'দ্বিতীয় AI অ্যাকাউন্ট সংযোগের জন্য প্রস্তুত' : 'Ready to connect 2nd account',
    online: false,
    remainingSeconds: 0,
    repliesSent: 0,
    inboxReplies: 0,
    groupReplies: 0,
    groups: [],
    recentChats: [],
  });
  const [isCompanionPairing, setIsCompanionPairing] = useState(false);
  const [companionPairingError, setCompanionPairingError] = useState<string | null>(null);
  const companionStatusRef = useRef(companionStatus);
  companionStatusRef.current = companionStatus;

  const warningsCardRef = useRef<HTMLDivElement | null>(null);
  const blocksCardRef = useRef<HTMLDivElement | null>(null);
  const logsCardRef = useRef<HTMLDivElement | null>(null);
  const rulesCardRef = useRef<HTMLDivElement | null>(null);

  const jumpToSecuritySection = (
    target: 'warnings' | 'blocks' | 'logs' | 'rules',
    nextLogFilter?: 'all' | 'warned' | 'blocks' | 'deleted' | 'error'
  ) => {
    if (nextLogFilter) setLogFilter(nextLogFilter);
    setActivePage('security');
    setTimeout(() => {
      const refMap = {
        warnings: warningsCardRef,
        blocks: blocksCardRef,
        logs: logsCardRef,
        rules: rulesCardRef,
      };
      refMap[target].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  // Live countdown timer for active restricted users & 10-min group locks
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setRestrictedUsers((prev) => {
        if (!prev || prev.length === 0) return prev;
        return prev
          .filter((u) => u.expiresAt > now)
          .map((u) => {
            const remainingSec = Math.max(0, Math.ceil((u.expiresAt - now) / 1000));
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;
            return { ...u, remainingSeconds: remainingSec, remainingText };
          });
      });
      setGroupLocks((prev) => {
        if (!prev || prev.length === 0) return prev;
        return prev
          .filter((g) => g.lockedUntil > now)
          .map((g) => {
            const remainingSec = Math.max(0, Math.ceil((g.lockedUntil - now) / 1000));
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;
            return { ...g, remainingSeconds: remainingSec, remainingText };
          });
      });
      setMemberDirMembers((prev) => {
        if (!prev || prev.length === 0 || !prev.some((m) => m.isBlocked)) return prev;
        return prev.map((m) => {
          if (!m.isBlocked) return m;
          const nextSec = Math.max(0, (m.remainingSeconds || 0) - 1);
          if (nextSec <= 0) {
            return { ...m, isBlocked: false, remainingSeconds: 0, remainingText: '' };
          }
          const mins = Math.floor(nextSec / 60);
          const secs = nextSec % 60;
          const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;
          return { ...m, remainingSeconds: nextSec, remainingText };
        });
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Groups & Real-Time Group Inbox State
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [inboxSelectedGroupId, setInboxSelectedGroupId] = useState<string | null>(null);
  const [inboxInitialDeletedOnly, setInboxInitialDeletedOnly] = useState<boolean>(false);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [selectedGroupForLeave, setSelectedGroupForLeave] = useState<GroupItem | null>(null);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ dataDir: string; persistentVolumeDetected: boolean } | null>(null);
  const [storageOverview, setStorageOverview] = useState<StorageCleanupOverview | null>(null);
  const [isStorageLoading, setIsStorageLoading] = useState(false);
  const [cleanupRunningMode, setCleanupRunningMode] = useState<string | null>(null);
  const [voiceOverview, setVoiceOverview] = useState<VoiceModerationOverview | null>(null);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);

  // Configuration settings
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('wg_gemini_key') || '');
  const [geminiModel, setGeminiModel] = useState(() => {
    const saved = localStorage.getItem('wg_gemini_model');
    if (!saved || saved === 'gemini-flash-latest' || saved === 'gemini-3.1-flash-lite' || saved.includes('3.8') || saved === 'gemini-2.0-flash-exp' || saved.includes('1.5')) {
      return 'gemini-3.8-flash';
    }
    return saved;
  });
  const [waToken, setWaToken] = useState(localStorage.getItem('wg_watoken') || '');
  const [phoneId, setPhoneId] = useState(localStorage.getItem('wg_phoneid') || '');
  const [wabaId, setWabaId] = useState(localStorage.getItem('wg_wabaid') || '');
  const [groqKey, setGroqKey] = useState(localStorage.getItem('wg_groq_key') || '');
  const [openrouterKey, setOpenrouterKey] = useState(localStorage.getItem('wg_openrouter_key') || '');
  const [supabaseUrl, setSupabaseUrl] = useState(localStorage.getItem('wg_supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(localStorage.getItem('wg_supabase_key') || '');
  const [baileysUrl, setBaileysUrl] = useState(
    () => localStorage.getItem('wg_server') || (import.meta as any).env?.VITE_API_BASE_URL || ''
  );

  // AI Brain Management State
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newKeyProvider, setNewKeyProvider] = useState<'gemini' | 'groq' | 'openrouter'>('gemini');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isTestingKey, setIsTestingKey] = useState<string | null>(null);

  // Password visibility
  const [showGemini, setShowGemini] = useState(false);
  const [showWaToken, setShowWaToken] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);

  const pollIntervalRef = useRef<any>(null);
  const statusInFlightRef = useRef(false);
  const pairingLockRef = useRef(false);
  const activePageRef = useRef(activePage);
  const homeScrollYRef = useRef<number>(0);
  const restoreHomeScrollRef = useRef<boolean>(false);
  const liveStatusRef = useRef(liveStatus);
  const baileysUrlRef = useRef(baileysUrl);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    liveStatusRef.current = liveStatus;
  }, [liveStatus]);

  useEffect(() => {
    baileysUrlRef.current = baileysUrl;
  }, [baileysUrl]);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setShowToast(false), 3200);
  };

  useEffect(() => {
    isPinLockedRef.current = isPinLocked;
  }, [isPinLocked]);

  const callApi = async (path: string, method = 'GET', body?: any) => {
    let base = baileysUrl.trim();
    if (base && base.endsWith('/')) {
      base = base.slice(0, -1);
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = base ? `${base}${cleanPath}` : cleanPath;
    const adminToken = localStorage.getItem('wg_admin_token') || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(adminToken ? { 'x-admin-token': adminToken } : {}),
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!res.ok) {
          if (res.status === 404 && isStaticHost && !baileysUrl) {
            throw new Error(
              isBn
                ? 'ব্যাকএন্ড কানেক্ট করা নেই! ইনটিগ্রেশন পেজে গিয়ে সার্ভার URL সেভ করুন।'
                : 'Backend disconnected! Set your Server URL in Integrations.'
            );
          }
          throw new Error(`HTTP ${res.status}: Endpoint unavailable`);
        }
        return { success: false, raw: rawText };
      }

      if (res.status === 401 && data?.pinRequired) {
        setIsPinLocked(true);
        throw new Error(data.error || 'PIN Required');
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err: any) {
      if (base && (err.name === 'TypeError' || String(err.message).includes('Failed to fetch'))) {
        console.warn(`Fetch to custom server ${base} failed (${err.message}). Falling back to local app server...`);
        const fallbackRes = await fetch(cleanPath, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'same-origin',
        });
        const fallbackText = await fallbackRes.text();
        let fallbackData: any = {};
        try {
          fallbackData = fallbackText ? JSON.parse(fallbackText) : {};
        } catch {
          throw new Error(`HTTP ${fallbackRes.status}`);
        }
        if (fallbackRes.status === 401 && fallbackData?.pinRequired) {
          setIsPinLocked(true);
          throw new Error(fallbackData.error || 'PIN Required');
        }
        if (!fallbackRes.ok) {
          throw new Error(fallbackData.error || `HTTP ${fallbackRes.status}`);
        }
        return fallbackData;
      }
      throw err;
    }
  };

  // Poll live status from WhatsApp backend without unnecessary re-renders or wiping active pairing codes
  const checkStatus = async () => {
    if (statusInFlightRef.current || pairingLockRef.current) return;
    if (isStaticHost && !baileysUrlRef.current.trim()) return;

    statusInFlightRef.current = true;
    try {
      const data: LiveStatusData = await callApi('/api/whatsapp/status');
      const prev = liveStatusRef.current;

      if (data.online) {
        try {
          sessionStorage.removeItem('wg_active_pairing');
        } catch {}
        setPairingError(null);
      }

      // Guard: if a valid pairing code is still active (< 120s) in sessionStorage, do not wipe it on a transient disconnected poll
      let merged = data;
      if (!data.online && !data.pairingCode && data.status === 'disconnected' && !data.lastError) {
        try {
          const saved = sessionStorage.getItem('wg_active_pairing');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.pairingCode && parsed?.startedAt && Date.now() - parsed.startedAt < 120000) {
              merged = {
                ...data,
                status: 'pairing',
                step: 'waiting_for_phone',
                pairingCode: parsed.pairingCode,
                qrCode: parsed.qrCode || prev.qrCode,
                phoneNumber: parsed.phoneNumber || prev.phoneNumber,
                stepMessage: prev.stepMessage || data.stepMessage,
                lastConnectionStatus: prev.lastConnectionStatus || 'Pairing code active — waiting for phone confirmation',
              };
            } else {
              sessionStorage.removeItem('wg_active_pairing');
            }
          }
        } catch {}
      }

      // Only trigger React state update when meaningful connection fields change (prevents periodic re-render wobble)
      const changed =
        prev.status !== merged.status ||
        prev.step !== merged.step ||
        prev.stepMessage !== merged.stepMessage ||
        prev.lastConnectionStatus !== merged.lastConnectionStatus ||
        prev.online !== merged.online ||
        prev.pairingCode !== merged.pairingCode ||
        prev.qrCode !== merged.qrCode ||
        prev.phoneNumber !== merged.phoneNumber ||
        prev.lastError !== merged.lastError ||
        prev.latestDisconnect?.id !== merged.latestDisconnect?.id ||
        prev.latestDisconnect?.resolvedAt !== merged.latestDisconnect?.resolvedAt ||
        prev.user?.id !== merged.user?.id ||
        prev.user?.name !== merged.user?.name;

      if (changed) {
        setLiveStatus(merged);
        if (!prev.online && merged.online) {
          void loadGroups({ silent: true });
        }
      }
    } catch {
      // non-blocking: keep current state intact on transient network failure
    } finally {
      statusInFlightRef.current = false;
    }
  };

  const loadDashboard = async () => {
    if (isStaticHost && !baileysUrlRef.current.trim()) return;
    try {
      const [data, warningsRes, locksRes, restrictedRes, logsRes, queueRes] = await Promise.all([
        callApi('/api/dashboard'),
        callApi('/api/moderation/warnings').catch(() => null),
        callApi('/api/moderation/group-locks').catch(() => null),
        callApi('/api/moderation/restricted-users').catch(() => null),
        callApi('/api/moderation/logs?limit=50').catch(() => null),
        callApi('/api/moderation/sticker-queue').catch(() => null),
      ]);
      if (data.overview) {
        setOverview(data.overview);
      }
      if (data.storageInfo) {
        setStorageInfo(data.storageInfo);
      }
      if (data.moderation?.settings) {
        const s = data.moderation.settings;
        setSettings(s);
        setCustomBadwordsText((s.customBadwords || []).join(', '));
        if (s.keywordTriggers) setKeywords(s.keywordTriggers);
        if (s.geminiApiKey) setGeminiKey(s.geminiApiKey);
        if (s.groqApiKey) setGroqKey(s.groqApiKey);
        if (s.openrouterApiKey) setOpenrouterKey(s.openrouterApiKey);
        if (s.geminiModel) setGeminiModel(s.geminiModel);
      }
      if (warningsRes?.warnings) setActiveWarnings(warningsRes.warnings);
      if (locksRes?.groupLocks) setGroupLocks(locksRes.groupLocks);
      if (restrictedRes?.restrictedUsers) setRestrictedUsers(restrictedRes.restrictedUsers);
      if (logsRes?.logs) setActivityLogs(logsRes.logs);
      if (queueRes?.success) setStickerQueue(queueRes);
      await Promise.all([
        checkStatus(),
        loadGroups().catch(() => {}),
        loadCompanionStatus().catch(() => {}),
        loadNightMode().catch(() => {}),
        loadCalls().catch(() => {}),
        loadKeywords().catch(() => {}),
        loadStorageOverview().catch(() => {}),
      ]);
    } catch {
      // non-blocking
    }
  };

  const loadStorageOverview = async () => {
    setIsStorageLoading(true);
    try {
      const res = await callApi('/api/server/storage');
      if (res?.snapshot) {
        setStorageOverview({
          snapshot: res.snapshot,
          settings: res.settings,
          scheduler: res.scheduler,
          alerts: res.alerts || [],
          history: res.history || [],
        });
      }
    } catch {
      // non-blocking
    } finally {
      setIsStorageLoading(false);
    }
  };

  const handleRunServerCleanup = async (mode: 'cache' | 'temp' | 'logs' | 'duplicates' | 'full') => {
    setCleanupRunningMode(mode);
    try {
      const res = await callApi('/api/server/cleanup/run', 'POST', { mode });
      if (res?.overview?.snapshot) {
        setStorageOverview(res.overview);
      } else {
        await loadStorageOverview();
      }
      showNotification(res?.message || (isBn ? 'নিরাপদ সার্ভার ক্লিনআপ সম্পন্ন হয়েছে!' : 'Safe server cleanup completed!'));
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিনআপ ব্যর্থ: ' : 'Cleanup failed: ') + err.message);
    } finally {
      setCleanupRunningMode(null);
    }
  };

  const handleSaveCleanupSettings = async (patch: {
    autoCleanupEnabled?: boolean;
    dailyTempCleanupEnabled?: boolean;
    preserveErrorLogs?: boolean;
    cacheIntervalHours?: number;
    debugLogRetentionDays?: number;
    autoHistoryCleanupEnabled?: boolean;
    historyRetentionHours?: number;
  }) => {
    try {
      const res = await callApi('/api/server/cleanup/settings', 'POST', patch);
      if (res?.overview?.snapshot) {
        setStorageOverview(res.overview);
      }
      showNotification(res?.message || (isBn ? 'অটো ক্লিনআপ সেটিংস সেভ হয়েছে!' : 'Cleanup settings saved!'));
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleClearAllHistoriesNow = async () => {
    try {
      const res = await callApi('/api/server/cleanup/clear-histories', 'POST');
      if (res?.overview?.snapshot) {
        setStorageOverview(res.overview);
      }
      await loadModerationData();
      showNotification(res?.message || (isBn ? 'স্টিকার, ওয়ার্নিং ও রিমুভ হিস্ট্রি ক্লিয়ার হয়েছে!' : 'All histories cleared!'));
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিয়ার ব্যর্থ: ' : 'Clear failed: ') + err.message);
    }
  };

  const handleClearStorageAlerts = async () => {
    try {
      const res = await callApi('/api/server/cleanup/clear-alerts', 'POST');
      if (res?.overview?.snapshot) {
        setStorageOverview(res.overview);
      } else {
        await loadStorageOverview();
      }
      showNotification(res?.message || (isBn ? 'স্টোরেজ সতর্কবার্তা লগ ক্লিয়ার করা হয়েছে!' : 'Storage alerts cleared!'));
    } catch (err: any) {
      showNotification((isBn ? 'ব্যর্থ: ' : 'Failed: ') + err.message);
    }
  };

  const loadVoiceOverview = async () => {
    setIsVoiceLoading(true);
    try {
      const res = await callApi('/api/voice-moderation/overview?limit=100');
      if (res?.success) {
        setVoiceOverview(res);
      }
    } catch {
      // non-blocking
    } finally {
      setIsVoiceLoading(false);
    }
  };

  const handleSaveVoiceSettings = async (patch: Record<string, any>) => {
    try {
      const res = await callApi('/api/voice-moderation/settings', 'POST', patch);
      if (res?.overview) {
        setVoiceOverview(res.overview);
      }
      setSettings((prev) => ({ ...prev, ...patch }));
      showNotification(res?.message || (isBn ? 'ভয়েস অ্যান্টি-অ্যাবিউজ সেটিংস সেভ হয়েছে!' : 'Voice moderation settings saved!'));
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleEnsureVoiceModel = async (modelId: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1') => {
    try {
      const res = await callApi('/api/voice-moderation/model/ensure', 'POST', { modelId });
      if (res?.overview) setVoiceOverview(res.overview);
      showNotification(res?.message || (isBn ? 'মডেল প্রস্তুত করা হচ্ছে...' : 'Preparing offline model...'));
    } catch (err: any) {
      showNotification((isBn ? 'মডেল ডাউনলোড ব্যর্থ: ' : 'Model download failed: ') + err.message);
    }
  };

  const handleRetryVoiceQueue = async () => {
    try {
      const res = await callApi('/api/voice-moderation/queue/retry', 'POST');
      if (res?.overview) setVoiceOverview(res.overview);
      showNotification(res?.message || (isBn ? 'কিউ পুনরায় চালু হয়েছে' : 'Queue retried'));
    } catch (err: any) {
      showNotification((isBn ? 'রিট্রাই ব্যর্থ: ' : 'Retry failed: ') + err.message);
    }
  };

  const handleClearVoiceHistory = async () => {
    try {
      const res = await callApi('/api/voice-moderation/history/clear', 'POST');
      if (res?.overview) setVoiceOverview(res.overview);
      showNotification(res?.message || (isBn ? 'ভয়েস হিস্ট্রি ক্লিয়ার হয়েছে' : 'Voice history cleared'));
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিয়ার ব্যর্থ: ' : 'Clear failed: ') + err.message);
    }
  };

  const handleTestVoiceAudio = async (payload: any) => {
    return callApi('/api/voice-moderation/test', 'POST', payload);
  };

  const handleResolveVoiceReview = async (
    recordId: string,
    decision: 'delete' | 'approve_clean' | 'dismiss',
    addWord?: string
  ) => {
    try {
      const res = await callApi(`/api/voice-moderation/review/${encodeURIComponent(recordId)}`, 'POST', {
        decision,
        addWord,
      });
      if (res?.overview) setVoiceOverview(res.overview);
      showNotification(res?.message || (isBn ? 'রিভিউ সিদ্ধান্ত সম্পন্ন হয়েছে।' : 'Review action completed.'));
    } catch (err: any) {
      showNotification((isBn ? 'রিভিউ অ্যাকশন ব্যর্থ: ' : 'Review failed: ') + err.message);
    }
  };

  const loadNightMode = async () => {
    try {
      const res = await callApi('/api/moderation/night-mode');
      if (res?.status) setNightStatus(res.status);
    } catch {}
  };

  const handleSaveNightSettings = async (patch: any) => {
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      await loadNightMode();
      showNotification(isBn ? 'নাইট মোড সময়সূচি সেভ হয়েছে!' : 'Night Mode schedule saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleToggleNightNow = async (lock: boolean) => {
    try {
      const res = await callApi('/api/moderation/night-mode/toggle-now', 'POST', { lock });
      if (res?.status) setNightStatus(res.status);
      showNotification(
        res?.message ||
          (lock
            ? isBn
              ? `${res?.affected || 0}টি গ্রুপ লক করা হয়েছে`
              : `${res?.affected || 0} groups locked`
            : isBn
            ? `${res?.affected || 0}টি গ্রুপ আনলক করা হয়েছে`
            : `${res?.affected || 0} groups unlocked`)
      );
    } catch (err: any) {
      showNotification((isBn ? 'নাইট লক ব্যর্থ: ' : 'Night toggle failed: ') + err.message);
    }
  };

  const loadCalls = async () => {
    try {
      const res = await callApi('/api/moderation/calls');
      if (Array.isArray(res?.calls)) setCallLogs(res.calls);
    } catch {}
  };

  const handleSaveAntiCall = async (patch: any) => {
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      showNotification(isBn ? 'অ্যান্টি-কল সেটিংস সেভ হয়েছে!' : 'Anti-Call settings saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleClearCalls = async () => {
    try {
      await callApi('/api/moderation/calls/clear', 'POST');
      setCallLogs([]);
      showNotification(isBn ? 'কল লগ ক্লিয়ার হয়েছে!' : 'Call logs cleared!');
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিয়ার ব্যর্থ: ' : 'Clear failed: ') + err.message);
    }
  };

  const loadActivityRank = async (groupId = activityGroupFilter, ghostDays = activityGhostDays) => {
    try {
      const res = await callApi(
        `/api/moderation/activity-rank?groupId=${encodeURIComponent(groupId)}&ghostDays=${ghostDays}`
      );
      if (res?.success) {
        setActivityReport({
          groups: res.groups || [],
          topActive: res.topActive || [],
          ghostMembers: res.ghostMembers || [],
          totalTracked: res.totalTracked || 0,
          totalMessages: res.totalMessages || 0,
        });
      }
    } catch {}
  };

  const handleResetActivityRank = async () => {
    try {
      await callApi('/api/moderation/activity-rank/reset', 'POST', {
        groupId: activityGroupFilter,
      });
      await loadActivityRank(activityGroupFilter, activityGhostDays);
      showNotification(isBn ? 'অ্যাক্টিভিটি ডেটা রিসেট হয়েছে!' : 'Activity data reset!');
    } catch (err: any) {
      showNotification((isBn ? 'রিসেট ব্যর্থ: ' : 'Reset failed: ') + err.message);
    }
  };

  const loadKeywords = async () => {
    try {
      const res = await callApi('/api/moderation/keywords');
      const list = res?.keywords || res?.triggers;
      if (Array.isArray(list)) setKeywords(list);
    } catch {}
  };

  const handleAddKeyword = async (keyword: string, reply: string, matchType: 'exact' | 'contains') => {
    try {
      const res = await callApi('/api/moderation/keywords/add', 'POST', { keyword, reply, matchType });
      const list = res?.keywords || res?.triggers;
      if (Array.isArray(list)) setKeywords(list);
      showNotification(isBn ? 'নতুন কীওয়ার্ড রুল সেভ হয়েছে!' : 'Keyword trigger saved!');
    } catch (err: any) {
      showNotification((isBn ? 'যোগ করতে ব্যর্থ: ' : 'Add failed: ') + err.message);
    }
  };

  const handleToggleKeyword = async (id: string) => {
    try {
      const res = await callApi('/api/moderation/keywords/toggle', 'POST', { id });
      const list = res?.keywords || res?.triggers;
      if (Array.isArray(list)) setKeywords(list);
    } catch (err: any) {
      showNotification((isBn ? 'আপডেট ব্যর্থ: ' : 'Toggle failed: ') + err.message);
    }
  };

  const handleRemoveKeyword = async (id: string) => {
    try {
      const res = await callApi('/api/moderation/keywords/remove', 'POST', { id });
      const list = res?.keywords || res?.triggers;
      if (Array.isArray(list)) setKeywords(list);
      showNotification(isBn ? 'কীওয়ার্ড রুল ডিলিট হয়েছে!' : 'Keyword deleted!');
    } catch (err: any) {
      showNotification((isBn ? 'ডিলিট ব্যর্থ: ' : 'Delete failed: ') + err.message);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsVerifyingPin(true);
    try {
      const res = await callApi('/api/auth/verify', 'POST', { pin: pinInput });
      if (res?.token) {
        localStorage.setItem('wg_admin_token', res.token);
      }
      setPinInput('');
      setIsPinLocked(false);
      await loadDashboard();
    } catch (err: any) {
      setAuthError(err.message || (isBn ? 'পিন সঠিক নয়' : 'Invalid PIN'));
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleUpdatePin = async (enabled: boolean, newPin: string) => {
    try {
      const res = await callApi('/api/auth/update-pin', 'POST', { enabled, newPin });
      if (res?.token) {
        localStorage.setItem('wg_admin_token', res.token);
      } else if (!enabled) {
        localStorage.removeItem('wg_admin_token');
      }
      setSettings((prev) => ({ ...prev, dashboardPinEnabled: Boolean(res?.pinEnabled) }));
      showNotification(
        enabled
          ? isBn
            ? 'অ্যাডমিন পিন লক চালু হয়েছে!'
            : 'Admin PIN Lock enabled!'
          : isBn
          ? 'অ্যাডমিন পিন লক বন্ধ করা হয়েছে'
          : 'Admin PIN Lock disabled'
      );
    } catch (err: any) {
      showNotification((isBn ? 'পিন আপডেট ব্যর্থ: ' : 'PIN update failed: ') + err.message);
    }
  };

  const handleLockNow = async () => {
    try {
      await callApi('/api/auth/lock', 'POST');
    } catch {}
    localStorage.removeItem('wg_admin_token');
    setIsPinLocked(true);
  };

  const loadGroupMembers = async (requestedGroupId?: string, forceRefresh = false) => {
    const seq = ++memberLoadSeqRef.current;
    setMemberDirLoading(true);
    try {
      const gid = requestedGroupId !== undefined ? requestedGroupId : memberDirGroupId;
      const params = new URLSearchParams();
      if (gid) params.set('groupId', gid);
      if (forceRefresh) params.set('refresh', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await callApi(`/api/moderation/group-members${qs}`);
      if (seq !== memberLoadSeqRef.current) return;
      if (res?.success) {
        const nextGroups = Array.isArray(res.groups) ? res.groups : [];
        setMemberDirGroups(nextGroups);
        setMemberDirGroupId(res.selectedGroupId || nextGroups[0]?.id || '');
        setMemberDirIsBotAdmin(Boolean(res.isBotAdmin));
        setMemberDirMembers(Array.isArray(res.members) ? res.members : []);
        if (res.defaultNotice) setDefaultManualBlockNotice(res.defaultNotice);
      }
    } catch (err: any) {
      if (seq === memberLoadSeqRef.current) {
        showNotification((isBn ? 'মেম্বার লোড ব্যর্থ: ' : 'Failed to load members: ') + err.message);
      }
    } finally {
      if (seq === memberLoadSeqRef.current) {
        setMemberDirLoading(false);
      }
    }
  };

  useEffect(() => {
    if (activePage === 'memberblock' && liveStatus.online && memberDirGroups.length === 0 && !memberDirLoading) {
      loadGroupMembers(memberDirGroupId || undefined, false);
    }
  }, [activePage, liveStatus.online]);

  const handleBlockMemberFromList = async (
    member: GroupMemberDirectoryViewItem,
    durationMinutes: number,
    customNotice: string
  ) => {
    const targetGroupId = memberDirGroupId || memberDirGroups[0]?.id || '';
    if (!targetGroupId) {
      showNotification(isBn ? 'প্রথমে একটি গ্রুপ সিলেক্ট করুন।' : 'Please select a group first.');
      return;
    }
    setBlockingMemberJid(member.jid);
    try {
      const res = await callApi('/api/moderation/member-block', 'POST', {
        groupId: targetGroupId,
        memberJid: member.jid,
        altJid: member.altJid,
        memberPhone: member.phone,
        durationMinutes,
        customNotice,
      });
      if (res?.success) {
        if (Array.isArray(res.restrictedUsers)) {
          setRestrictedUsers(res.restrictedUsers);
        }
        const totalSec = Number(res.restriction?.remainingSeconds || Math.max(60, durationMinutes * 60));
        const remText = res.restriction?.remainingText || `${durationMinutes} মি. 0 সে.`;
        setMemberDirMembers((prev) =>
          prev.map((m) =>
            m.jid === member.jid
              ? {
                  ...m,
                  isBlocked: true,
                  remainingSeconds: totalSec,
                  remainingText: remText,
                }
              : m
          )
        );
        showNotification(
          res.message ||
            (isBn
              ? `${member.name}-কে ${durationMinutes} মিনিটের জন্য ব্লক করা হয়েছে এবং ভিন্ন নোটিশ পাঠানো হয়েছে!`
              : `Blocked ${member.name} for ${durationMinutes}m!`)
        );
      }
    } catch (err: any) {
      showNotification((isBn ? 'ব্লক ব্যর্থ: ' : 'Block failed: ') + err.message);
    } finally {
      setBlockingMemberJid(null);
    }
  };

  const handleUnblockMemberFromList = async (groupId: string, memberJid: string) => {
    setBlockingMemberJid(memberJid);
    try {
      const res = await callApi('/api/moderation/unmute', 'POST', { groupId, senderJid: memberJid });
      if (res?.success) {
        if (Array.isArray(res.restrictedUsers)) {
          setRestrictedUsers(res.restrictedUsers);
        }
        setMemberDirMembers((prev) =>
          prev.map((m) =>
            m.jid === memberJid ? { ...m, isBlocked: false, remainingSeconds: 0, remainingText: '' } : m
          )
        );
        showNotification(isBn ? 'মেম্বারের ১০ মিনিটের ব্লক তুলে নেওয়া হয়েছে!' : 'Member unblocked!');
      }
    } catch (err: any) {
      showNotification((isBn ? 'আনব্লক ব্যর্থ: ' : 'Unblock failed: ') + err.message);
    } finally {
      setBlockingMemberJid(null);
    }
  };

  const handleSaveManualBlockNotice = async (notice: string) => {
    try {
      const res = await callApi('/api/moderation/settings', 'POST', { manualBlockNotice: notice });
      if (res?.settings) setSettings(res.settings);
      showNotification(isBn ? 'ভিন্ন নোটিশ টেমপ্লেট সেভ হয়েছে!' : 'Distinct notice template saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const loadCompanionStatus = async () => {
    try {
      const res = await callApi('/api/companion/status');
      if (res?.success) {
        setCompanionStatus(res);
      }
    } catch {}
  };

  const handlePairCompanion = async (phone: string) => {
    setIsCompanionPairing(true);
    setCompanionPairingError(null);
    try {
      const res = await callApi('/api/companion/pair', 'POST', { phoneNumber: phone });
      if (res?.status) setCompanionStatus(res.status);
      else await loadCompanionStatus();
      showNotification(
        res?.alreadyConnected
          ? isBn
            ? '২য় AI অ্যাকাউন্ট ইতিমধ্যেই কানেক্টেড!'
            : '2nd account already connected!'
          : isBn
          ? '২য় অ্যাকাউন্টের ৮-ডিজিট কোড তৈরি হয়েছে!'
          : '2nd account pairing code ready!'
      );
    } catch (err: any) {
      setCompanionPairingError(err?.message || 'Pairing failed');
      showNotification((isBn ? 'পেয়ারিং ব্যর্থ: ' : 'Pairing failed: ') + err.message);
    } finally {
      setIsCompanionPairing(false);
    }
  };

  const handleDisconnectCompanion = async () => {
    try {
      const res = await callApi('/api/companion/disconnect', 'POST');
      if (res?.status) setCompanionStatus(res.status);
      showNotification(res?.message || (isBn ? '২য় অ্যাকাউন্ট ডিসকানেক্ট হয়েছে' : '2nd account disconnected'));
    } catch (err: any) {
      showNotification((isBn ? 'ডিসকানেক্ট ব্যর্থ: ' : 'Disconnect failed: ') + err.message);
    }
  };

  const handleSaveCompanionSettings = async (patch: Record<string, any>) => {
    try {
      const res = await callApi('/api/companion/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      showNotification(res?.message || (isBn ? '২য় AI সেটিংস সেভ হয়েছে!' : '2nd AI settings saved!'));
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleTestCompanionChat = async (
    text: string,
    channel: 'inbox' | 'group',
    draft: Record<string, any>
  ) => {
    const res = await callApi('/api/companion/test', 'POST', {
      text,
      settings: { ...draft, channel },
    });
    return {
      reply: res.reply,
      provider: res.provider,
      latencyMs: res.latencyMs,
    };
  };

  const handleClearCompanionMemory = async () => {
    try {
      const res = await callApi('/api/companion/clear-memory', 'POST');
      if (res?.status) setCompanionStatus(res.status);
      showNotification(isBn ? '২য় অ্যাকাউন্টের মেমোরি ও লগ ক্লিয়ার হয়েছে' : 'Memory cleared');
    } catch (err: any) {
      showNotification(err.message);
    }
  };

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (activePage === 'home') {
      if (restoreHomeScrollRef.current) {
        const savedY = homeScrollYRef.current;
        restoreHomeScrollRef.current = false;
        window.scrollTo({ top: savedY, behavior: 'auto' });
        const raf = requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'auto' }));
        const timer = setTimeout(() => window.scrollTo({ top: savedY, behavior: 'auto' }), 45);
        return () => {
          cancelAnimationFrame(raf);
          clearTimeout(timer);
        };
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activePage]);

  const navigateToPage = (page: PageId) => {
    const prevPage = activePageRef.current;
    if (typeof window !== 'undefined' && prevPage === 'home' && page !== 'home') {
      homeScrollYRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    }

    if (page === 'home') {
      if (prevPage !== 'home') {
        restoreHomeScrollRef.current = true;
      } else {
        restoreHomeScrollRef.current = false;
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      restoreHomeScrollRef.current = false;
    }

    setActivePage(page);

    if (page === 'home') loadDashboard();
    else if (page === 'security' || page.startsWith('sec_') || page === 'warnings' || page === 'blocks' || page === 'logs') loadModerationData();
    else if (page === 'memberblock') loadGroupMembers();
    else if (page === 'nightmode') loadNightMode();
    else if (page === 'anticall') loadCalls();
    else if (page === 'activity') loadActivityRank();
    else if (page === 'keywords') loadKeywords();
    else if (page === 'groups' || page === 'inbox') loadGroups();
    else if (page === 'maya') loadModerationData();
    else if (page === 'companion') {
      loadCompanionStatus();
      loadModerationData();
    } else if (page === 'storagecleanup') {
      loadStorageOverview();
    } else if (page === 'voicemod') {
      loadVoiceOverview();
    }
  };

  const loadModerationData = async () => {
    setIsLogsLoading(true);
    try {
      const [settingsRes, logsRes, restrictedRes, warningsRes, locksRes, queueRes] = await Promise.all([
        callApi('/api/moderation/settings'),
        callApi('/api/moderation/logs?limit=50'),
        callApi('/api/moderation/restricted-users'),
        callApi('/api/moderation/warnings').catch(() => null),
        callApi('/api/moderation/group-locks').catch(() => null),
        callApi('/api/moderation/sticker-queue').catch(() => null),
      ]);
      if (settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings(s);
        setCustomBadwordsText((s.customBadwords || []).join(', '));
        if (s.keywordTriggers) setKeywords(s.keywordTriggers);
        if (s.geminiApiKey) setGeminiKey(s.geminiApiKey);
        if (s.groqApiKey) setGroqKey(s.groqApiKey);
        if (s.openrouterApiKey) setOpenrouterKey(s.openrouterApiKey);
        if (s.geminiModel) setGeminiModel(s.geminiModel);
      }
      if (logsRes.logs) {
        setActivityLogs(logsRes.logs);
      }
      if (restrictedRes && restrictedRes.restrictedUsers) {
        setRestrictedUsers(restrictedRes.restrictedUsers);
      }
      if (warningsRes && warningsRes.warnings) {
        setActiveWarnings(warningsRes.warnings);
      }
      if (locksRes && locksRes.groupLocks) {
        setGroupLocks(locksRes.groupLocks);
      }
      if (queueRes?.success) {
        setStickerQueue(queueRes);
      }
      showNotification(isBn ? 'সেটিংস, ওয়ার্নিং ও স্টিকার কিউ আপডেট হয়েছে' : 'Settings, Logs & Queue Synced');
    } catch (err: any) {
      showNotification((isBn ? 'ডাটা লোড ত্রুটি: ' : 'Failed to load data: ') + err.message);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const handleRefreshStickerQueue = async () => {
    try {
      const res = await callApi('/api/moderation/sticker-queue');
      if (res?.success) setStickerQueue(res);
    } catch {}
  };

  const handleSaveStickerSpamConfig = async () => {
    const patch = {
      individualMuteTimeWindow: Math.max(1, Math.min(120, Number(settings.individualMuteTimeWindow ?? 5))),
      individualMuteStickerLimit: Math.max(2, Math.min(100, Number(settings.individualMuteStickerLimit ?? 3))),
      individualMuteDurationMinutes: Math.max(1, Math.min(180, Number(settings.individualMuteDurationMinutes ?? 10))),
      stickerDeleteMaxRetries: Math.max(1, Math.min(10, Number(settings.stickerDeleteMaxRetries ?? 4))),
      stickerQueueConcurrency: Math.max(1, Math.min(10, Number(settings.stickerQueueConcurrency ?? 5))),
    };
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      await handleRefreshStickerQueue();
      showNotification(isBn ? 'স্টিকার স্প্যাম টাইম উইন্ডো ও কিউ সেটিংস সেভ হয়েছে!' : 'Sticker Anti-Spam config saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleRetryFailedStickers = async () => {
    try {
      const res = await callApi('/api/moderation/sticker-queue/retry-failed', 'POST');
      if (res?.queue) setStickerQueue(res.queue);
      showNotification(res?.message || (isBn ? 'পুনরায় কিউ করা হয়েছে' : 'Requeued failed items'));
    } catch (err: any) {
      showNotification((isBn ? 'রিস্টার্ট ব্যর্থ: ' : 'Retry failed: ') + err.message);
    }
  };

  const handleClearStickerQueueHistory = async () => {
    try {
      const res = await callApi('/api/moderation/sticker-queue/clear-history', 'POST');
      if (res?.queue) setStickerQueue(res.queue);
      showNotification(isBn ? 'কিউ হিস্ট্রি পরিষ্কার হয়েছে' : 'Queue history cleared');
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিয়ার ব্যর্থ: ' : 'Clear failed: ') + err.message);
    }
  };

  const handlePurgeGroupStickers = async (groupId?: string, includeUnverified?: boolean) => {
    if (purgingStickers) return;
    setPurgingStickers(true);
    try {
      const target = groupId && groupId !== 'ALL' ? groupId : undefined;
      const res = await callApi('/api/moderation/sticker-queue/purge-group-stickers', 'POST', {
        groupId: target,
        includeUnverified: Boolean(includeUnverified),
      });
      if (res?.queue) setStickerQueue(res.queue);
      showNotification(res?.message || (isBn ? 'স্টিকার রিমুভ শুরু হয়েছে!' : 'Bulk sticker purge started!'));
      setTimeout(() => {
        handleRefreshStickerQueue();
      }, 2200);
    } catch (err: any) {
      showNotification((isBn ? 'রিমুভ ব্যর্থ: ' : 'Purge failed: ') + err.message);
    } finally {
      setPurgingStickers(false);
    }
  };

  const handleSaveBossAndNoticeConfig = async () => {
    const patch = {
      bossAdminNumber: String(settings.bossAdminNumber || '8801632222592').trim(),
      secondAdminNumber: String(settings.secondAdminNumber ?? '8801346561627').trim(),
      bossFightAlertEnabled: settings.bossFightAlertEnabled !== false,
      bossFightMinPeople: Math.max(2, Math.min(10, Number(settings.bossFightMinPeople ?? 3))),
      bossFightWindowMinutes: Math.max(1, Math.min(30, Number(settings.bossFightWindowMinutes ?? 5))),
      serverErrorNoticeEnabled: settings.serverErrorNoticeEnabled !== false,
      serverErrorNoticeTarget: settings.serverErrorNoticeTarget || 'boss_inbox',
    };
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      showNotification(isBn ? 'বস অ্যালার্ট ও সার্ভার নোটিশ সেটিংস সেভ হয়েছে!' : 'Boss & Server Alert settings saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleSaveAdminMentionConfig = async () => {
    const patch = {
      adminMentionReplyEnabled: settings.adminMentionReplyEnabled !== false,
      adminMentionReplyTarget: settings.adminMentionReplyTarget === 'boss_only' ? 'boss_only' : 'all_admins',
      adminMentionReplyMessage: String(settings.adminMentionReplyMessage || '').trim(),
      bossAdminNumber: String(settings.bossAdminNumber || '8801632222592').trim(),
      secondAdminNumber: String(settings.secondAdminNumber ?? '8801346561627').trim(),
    };
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      showNotification(isBn ? 'অ্যাডমিন মেনশন রিপ্লাই সেটিংস সেভ হয়েছে!' : 'Admin Mention Reply settings saved!');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleSaveNewMemberRulesConfig = async () => {
    const patch = {
      newMemberInboxRulesEnabled: settings.newMemberInboxRulesEnabled !== false,
      newMemberInboxRulesNotice: String(settings.newMemberInboxRulesNotice || '').trim(),
      newMemberGroupNoticeText: String(settings.newMemberGroupNoticeText || '').trim(),
    };
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) setSettings(res.settings);
      showNotification(
        isBn
          ? 'নতুন মেম্বার ইনবক্স রুলস ও মেনশন নোটিশ সার্ভারে সেভ হয়েছে!'
          : 'New member inbox rules notice saved to server!'
      );
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const handleTestBossAlert = async () => {
    try {
      const res = await callApi('/api/moderation/test-boss-alert', 'POST');
      showNotification(res?.message || (isBn ? 'বস ইনবক্সে টেস্ট মেসেজ পাঠানো হয়েছে!' : 'Boss inbox test alert sent!'));
    } catch (err: any) {
      showNotification((isBn ? 'টেস্ট ব্যর্থ: ' : 'Test failed: ') + err.message);
    }
  };

  const handleManualUnmute = async (groupId: string, senderJid: string) => {
    try {
      const res = await callApi('/api/moderation/unmute', 'POST', { groupId, senderJid });
      if (res.success) {
        showNotification(isBn ? 'সদস্যের রেস্ট্রিকশন তুলে দেওয়া হয়েছে!' : 'User unmuted successfully!');
        if (res.restrictedUsers) {
          setRestrictedUsers(res.restrictedUsers);
        } else {
          loadModerationData();
        }
      }
    } catch (err: any) {
      showNotification((isBn ? 'Unrestrict ব্যর্থ: ' : 'Unrestrict failed: ') + err.message);
    }
  };

  const handleResetSingleWarning = async (warningKey: string) => {
    try {
      const res = await callApi('/api/moderation/reset-warning', 'POST', { key: warningKey });
      if (res.success) {
        if (res.warnings) setActiveWarnings(res.warnings);
        showNotification(isBn ? 'সদস্যের ওয়ার্নিং রিসেট করা হয়েছে!' : 'Member warning reset!');
      }
    } catch (err: any) {
      showNotification((isBn ? 'রিসেট ব্যর্থ: ' : 'Reset failed: ') + err.message);
    }
  };

  const handleUnlockGroup = async (groupId: string) => {
    try {
      const res = await callApi('/api/moderation/unlock-group', 'POST', { groupId });
      if (res.success) {
        if (res.groupLocks) setGroupLocks(res.groupLocks);
        showNotification(isBn ? 'গ্রুপ আনলক করা হয়েছে!' : 'Group unlocked!');
        loadModerationData();
      }
    } catch (err: any) {
      showNotification((isBn ? 'আনলক ব্যর্থ: ' : 'Unlock failed: ') + err.message);
    }
  };




  const updateSettingToggle = async (key: keyof ModerationSettings, value: any) => {
    let previousValue: any;
    setSettings((prev) => {
      previousValue = prev[key];
      return { ...prev, [key]: value };
    });
    try {
      const res = await callApi('/api/moderation/settings', 'POST', { [key]: value });
      if (res?.settings) {
        setSettings(res.settings);
      }
      showNotification(isBn ? `সফলভাবে সেভ হয়েছে` : `Settings updated successfully`);
    } catch (err: any) {
      showNotification((isBn ? 'সেভ করতে ব্যর্থ: ' : 'Save failed: ') + err.message);
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
    }
  };

  const updateMultipleSettings = async (patch: Partial<ModerationSettings>) => {
    let previousSnapshot: ModerationSettings | null = null;
    setSettings((prev) => {
      previousSnapshot = prev;
      return { ...prev, ...patch };
    });
    try {
      const res = await callApi('/api/moderation/settings', 'POST', patch);
      if (res?.settings) {
        setSettings(res.settings);
      }
      showNotification(isBn ? 'সব সেটিংস সফলভাবে সেভ হয়েছে' : 'All settings updated successfully');
    } catch (err: any) {
      showNotification((isBn ? 'সেভ করতে ব্যর্থ: ' : 'Save failed: ') + err.message);
      if (previousSnapshot) setSettings(previousSnapshot);
    }
  };

  const areAllNoticesOff = Boolean(
    settings.silentModeration &&
      !settings.autoWelcome &&
      !settings.newMemberInboxRulesEnabled &&
      !settings.adminMentionReplyEnabled &&
      !settings.autoSalamReplyEnabled &&
      !settings.botReply &&
      !settings.nightModeNotify &&
      !settings.keywordAutoReplyEnabled
  );

  const handleToggleAllNoticesOneButton = (enableNotices: boolean) => {
    if (enableNotices) {
      updateMultipleSettings({
        silentModeration: false,
        autoWelcome: true,
        newMemberInboxRulesEnabled: true,
        nightModeNotify: true,
        adminMentionReplyEnabled: true,
        autoSalamReplyEnabled: true,
        botReply: true,
        keywordAutoReplyEnabled: true,
      });
    } else {
      updateMultipleSettings({
        silentModeration: true,
        autoWelcome: false,
        newMemberInboxRulesEnabled: false,
        nightModeNotify: false,
        adminMentionReplyEnabled: false,
        autoSalamReplyEnabled: false,
        botReply: false,
        keywordAutoReplyEnabled: false,
      });
    }
  };

  const handleAddAiKey = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!newKeyInput.trim()) {
      showNotification(isBn ? 'দয়া করে এপিআই কি লিখুন' : 'Please enter an API key');
      return;
    }
    setIsAddingKey(true);
    try {
      const res = await callApi('/api/moderation/ai-keys/add', 'POST', {
        key: newKeyInput.trim(),
        provider: newKeyProvider,
        label: newKeyLabel.trim()
      });
      if (res.success) {
        if (res.keys) {
          setSettings(prev => ({ ...prev, aiKeys: res.keys }));
        } else if (res.key) {
          setSettings(prev => ({
            ...prev,
            aiKeys: [...(prev.aiKeys || []).filter(k => k.id !== res.key.id), res.key]
          }));
        }
        setNewKeyInput('');
        setNewKeyLabel('');
        showNotification(isBn ? 'নতুন এপিআই কি যুক্ত হয়েছে!' : 'New API key added successfully!');
      }
    } catch (err: any) {
      showNotification((isBn ? 'যোগ করতে ব্যর্থ: ' : 'Add failed: ') + err.message);
    } finally {
      setIsAddingKey(false);
    }
  };

  const handleRemoveAiKey = async (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    try {
      const res = await callApi('/api/moderation/ai-keys/remove', 'POST', { id });
      if (res.keys) {
        setSettings(prev => ({ ...prev, aiKeys: res.keys }));
      } else {
        setSettings(prev => ({
          ...prev,
          aiKeys: (prev.aiKeys || []).filter(k => k.id !== id)
        }));
      }
      showNotification(isBn ? 'কি-টি রিমুভ করা হয়েছে' : 'Key removed successfully');
    } catch (err: any) {
      showNotification((isBn ? 'রিমুভ ব্যর্থ: ' : 'Remove failed: ') + err.message);
    }
  };

  const handleResetAiKeys = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    try {
      const res = await callApi('/api/moderation/ai-keys/reset', 'POST');
      if (res.keys) {
        setSettings(prev => ({ ...prev, aiKeys: res.keys }));
      }
      showNotification(isBn ? 'সব কি রিসেট করা হয়েছে' : 'All keys reset successfully');
    } catch (err: any) {
      showNotification((isBn ? 'রিসেট ব্যর্থ: ' : 'Reset failed: ') + err.message);
    }
  };

  const handleTestAiKey = async (key: AiKey, e?: React.MouseEvent) => {
     e?.preventDefault();
     setIsTestingKey(key.id);
     showNotification(isBn ? `${key.label} টেস্ট করা হচ্ছে...` : `Testing ${key.label}...`);
     try {
        const res = await callApi('/api/maya/test', 'POST', {
           text: 'Ping',
           settings: {
              ...settings,
              aiProvider: key.provider,
              testKeyId: key.id
           }
        });
        if (res.success) {
           showNotification(isBn ? 'টেস্ট সফল হয়েছে!' : 'Test successful!');
           loadModerationData();
        }
     } catch (err: any) {
        showNotification((isBn ? 'টেস্ট ব্যর্থ: ' : 'Test failed: ') + err.message);
        loadModerationData();
     } finally {
        setIsTestingKey(null);
     }
  };

  const moveProviderUp = (index: number) => {
    if (index === 0) return;
    const priority = [...(settings.aiProviderPriority || ['gemini', 'groq', 'openrouter'])];
    const temp = priority[index];
    priority[index] = priority[index - 1];
    priority[index - 1] = temp;
    updateSettingToggle('aiProviderPriority', priority);
  };

  const moveProviderDown = (index: number) => {
    const priority = [...(settings.aiProviderPriority || ['gemini', 'groq', 'openrouter'])];
    if (index === priority.length - 1) return;
    const temp = priority[index];
    priority[index] = priority[index + 1];
    priority[index + 1] = temp;
    updateSettingToggle('aiProviderPriority', priority);
  };

  const saveCustomBadwords = async () => {
    const list = customBadwordsText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await callApi('/api/moderation/settings', 'POST', { customBadwords: list });
      setSettings((prev) => ({ ...prev, customBadwords: list }));
      showNotification(isBn ? `কাস্টম ব্যাডওয়ার্ড সেভ হয়েছে (${list.length} টি)` : `Badwords Saved (${list.length} words)`);
    } catch (err: any) {
      showNotification((isBn ? 'সংরক্ষণ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const resetAllWarnings = async () => {
    try {
      await callApi('/api/moderation/reset-warnings', 'POST');
      setActiveWarnings([]);
      showNotification(isBn ? 'সকল Warning রিসেট করা হয়েছে!' : 'All warnings reset successfully!');
      loadDashboard();
    } catch (err: any) {
      showNotification((isBn ? 'রিসেট ব্যর্থ: ' : 'Reset failed: ') + err.message);
    }
  };

  const clearLogs = async () => {
    try {
      await callApi('/api/moderation/clear-logs', 'POST');
      setActivityLogs([]);
      showNotification(isBn ? 'অ্যাক্টিভিটি লগ ক্লিয়ার করা হয়েছে!' : 'Activity logs cleared!');
    } catch (err: any) {
      showNotification((isBn ? 'ক্লিয়ার ব্যর্থ: ' : 'Clear failed: ') + err.message);
    }
  };

  const loadGroups = async (opts?: { silent?: boolean } | any) => {
    const isSilent = Boolean(opts && typeof opts === 'object' && 'silent' in opts && opts.silent === true);
    if (!isSilent) setIsGroupsLoading(true);
    try {
      const data = await callApi('/api/groups');
      if (data.groups && Array.isArray(data.groups)) {
        setGroups(data.groups);
        setOverview((prev) => ({ ...prev, groups: data.groups.length }));
      }
    } catch {
      // non-blocking
    } finally {
      if (!isSilent) setIsGroupsLoading(false);
    }
  };

  const openGroupInbox = (groupId: string, initialTab?: 'all' | 'deleted') => {
    setInboxSelectedGroupId(groupId);
    setInboxInitialDeletedOnly(initialTab === 'deleted');
    navigateToPage('inbox');
  };

  const handleLeaveGroupFromServer = async (group: GroupItem) => {
    if (!group?.id || leavingGroupId) return;
    setLeavingGroupId(group.id);
    try {
      const res = await callApi('/api/groups/leave', 'POST', { groupId: group.id });
      if (Array.isArray(res?.groups)) {
        setGroups(res.groups);
      } else {
        setGroups((prev) => prev.filter((item) => item.id !== group.id));
      }
      setSelectedGroupForLeave(null);
      showNotification(
        res?.message ||
          (isBn ? `"${group.name}" গ্রুপ থেকে সফলভাবে লিভ নেওয়া হয়েছে!` : `Left group "${group.name}" successfully!`)
      );
    } catch (err: any) {
      showNotification((isBn ? 'গ্রুপ লিভ ব্যর্থ: ' : 'Leave group failed: ') + err.message);
    } finally {
      setLeavingGroupId(null);
    }
  };

  // Start real WhatsApp pairing flow (protected against double-clicks & redundant calls)
  const handleStartPairing = async (forceNew = false) => {
    if (pairingLockRef.current) return;

    let clean = phoneNumber.replace(/\D/g, '');
    if (clean.startsWith('1') && clean.length === 10) {
      clean = '880' + clean;
    } else if (clean.startsWith('01') && clean.length === 11) {
      clean = '88' + clean;
    }

    if (clean.length < 10) {
      setPairingError(isBn ? 'সঠিক আন্তর্জাতিক ফোন নম্বর লিখুন (e.g. 88017XXXXXXXX)' : 'Enter valid phone number (e.g. 88017XXXXXXXX)');
      showNotification(isBn ? 'সঠিক ফোন নম্বর দিন' : 'Enter valid phone number');
      return;
    }

    localStorage.setItem('wg_phone', clean);
    pairingLockRef.current = true;
    setIsPairingLoading(true);
    setPairingError(null);
    setLiveStatus((prev) => ({
      ...prev,
      status: prev.pairingCode ? prev.status : 'connecting',
      step: prev.pairingCode ? prev.step : 'initializing',
      lastConnectionStatus: isBn ? 'WhatsApp সার্ভারের সাথে সংযোগ হচ্ছে...' : 'Connecting to WhatsApp server...',
    }));
    showNotification(isBn ? 'WhatsApp সার্ভার থেকে অফিশিয়াল ৮-ডিজিট কোড রিকোয়েস্ট করা হচ্ছে...' : 'Requesting 8-digit code from WhatsApp server...');

    try {
      const res = await callApi('/api/whatsapp/pair', 'POST', { phoneNumber: clean, forceNew });
      if (res.pairingCode) {
        const startedAt = Date.now();
        try {
          sessionStorage.setItem(
            'wg_active_pairing',
            JSON.stringify({
              pairingCode: res.pairingCode,
              qrCode: res.qrCode || '',
              phoneNumber: clean,
              startedAt,
            })
          );
        } catch {}

        setLiveStatus((prev) => ({
          ...prev,
          status: 'pairing',
          step: 'waiting_for_phone',
          stepMessage: isBn
            ? 'রিয়েল কোড প্রস্তুত! আপনার ফোনের WhatsApp থেকে কোডটি এন্টার করুন।'
            : 'Real pairing code ready! Enter it in WhatsApp on your phone.',
          lastConnectionStatus: res.alreadyPairing
            ? 'Active pairing code reused'
            : 'Pairing code generated — waiting for confirmation',
          online: false,
          phoneNumber: clean,
          pairingCode: res.pairingCode,
          qrCode: res.qrCode || prev.qrCode || '',
          remainingSeconds: 120,
          lastError: null,
        }));
        showNotification(
          res.alreadyPairing
            ? isBn ? 'চলমান পেয়ারিং কোডটিই সক্রিয় রয়েছে!' : 'Active pairing code reused!'
            : isBn ? 'রিয়েল WhatsApp পেয়ারিং কোড তৈরি হয়েছে!' : 'Real pairing code generated!'
        );
      } else if (res.alreadyConnected) {
        try {
          sessionStorage.removeItem('wg_active_pairing');
        } catch {}
        showNotification(isBn ? 'ইতিমধ্যে WhatsApp কানেক্টেড রয়েছে!' : 'WhatsApp is already connected!');
        pairingLockRef.current = false;
        await checkStatus();
      }
    } catch (err: any) {
      const msg = err.message || (isBn ? 'WhatsApp সার্ভারের সাথে সংযোগে সমস্যা হয়েছে' : 'Connection error');
      setPairingError(msg);
      setLiveStatus((prev) => ({
        ...prev,
        lastConnectionStatus: `Error: ${msg}`,
      }));
      showNotification(msg);
    } finally {
      pairingLockRef.current = false;
      setIsPairingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      sessionStorage.removeItem('wg_active_pairing');
    } catch {}
    try {
      await callApi('/api/whatsapp/disconnect', 'POST');
      setLiveStatus({
        status: 'disconnected',
        step: 'idle',
        stepMessage: isBn ? 'WhatsApp সেশন ডিসকানেক্ট করা হয়েছে' : 'Disconnected session',
        lastConnectionStatus: 'Disconnected by user',
        online: false,
        pairingCode: '',
        qrCode: '',
        remainingSeconds: 0,
      });
      showNotification(isBn ? 'WhatsApp সেশন ডিসকানেক্ট করা হয়েছে' : 'Disconnected session');
    } catch {
      showNotification(isBn ? 'ডিসকানেক্ট সম্পন্ন হয়েছে' : 'Disconnected');
    }
  };

  const copyToClipboard = async () => {
    if (!liveStatus.pairingCode) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(liveStatus.pairingCode);
      } else {
        const el = document.createElement('textarea');
        el.value = liveStatus.pairingCode;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setIsCopied(true);
      showNotification(isBn ? 'কোড কপি হয়েছে!' : 'Code copied!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      showNotification('Copy failed');
    }
  };

  const handleExportSession = async (copyOnly = false) => {
    const pass = sessionPassphrase.trim();
    if (pass.length < 4) {
      showNotification(isBn ? 'আগে কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড/পিন দিন' : 'Enter at least a 4-char passphrase first');
      return;
    }
    setIsTransferringSession(true);
    try {
      const res = await callApi('/api/whatsapp/session-export', 'POST', { passphrase: pass });
      if (!res?.success || !res?.bundle) {
        showNotification(res?.error || (isBn ? 'সেশন এক্সপোর্ট ব্যর্থ হয়েছে' : 'Session export failed'));
        return;
      }
      const jsonStr = JSON.stringify(res.bundle, null, 2);
      const summaryBn = res.hasPrimarySession
        ? 'WhatsApp সেশন ও সব ON/OFF সেটিংস ব্যাকআপ'
        : 'সব ON/OFF সেটিংস ব্যাকআপ';
      if (copyOnly) {
        try {
          await navigator.clipboard.writeText(jsonStr);
          showNotification(isBn ? `${summaryBn} কোড কপি হয়েছে! নিরাপদ জায়গায় সেভ করে রাখুন।` : 'Encrypted full backup copied to clipboard!');
        } catch {
          setSessionPasteText(jsonStr);
          setShowSessionPasteBox(true);
          showNotification(isBn ? 'নিচের বক্স থেকে ব্যাকআপ কোড কপি করে নিন।' : 'Copy the backup text from the box below.');
        }
        return;
      }
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'waguard-full-backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotification(isBn ? `${summaryBn} ফাইল ডাউনলোড হয়েছে!` : 'Full backup file downloaded!');
    } catch (err: any) {
      showNotification(err?.message || (isBn ? 'ব্যাকআপ ডাউনলোড ব্যর্থ — "ব্যাকআপ কপি" বাটন ব্যবহার করুন' : 'Export failed — try Copy Backup'));
    } finally {
      setIsTransferringSession(false);
    }
  };

  const restoreSessionFromJsonText = async (text: string) => {
    const pass = sessionPassphrase.trim();
    if (pass.length < 4) {
      showNotification(isBn ? 'রিস্টোর করতে একই ৪+ অক্ষরের পাসওয়ার্ড/পিন দিন' : 'Enter the 4+ char passphrase first');
      return;
    }
    setIsTransferringSession(true);
    try {
      const bundle = JSON.parse(text.trim());
      const res = await callApi('/api/whatsapp/session-import', 'POST', { passphrase: pass, bundle });
      if (!res?.success) {
        showNotification(res?.error || (isBn ? 'সেশন রিস্টোর ব্যর্থ হয়েছে' : 'Session import failed'));
        return;
      }
      if (res.settings) {
        setSettings(res.settings);
        setCustomBadwordsText((res.settings.customBadwords || []).join(', '));
      }
      setSessionPasteText('');
      setShowSessionPasteBox(false);
      showNotification(res.message || (isBn ? 'সেশন ও সেটিংস রিস্টোর সম্পন্ন!' : 'Backup restored!'));
      await Promise.all([checkStatus(), loadDashboard()]);
    } catch (err: any) {
      showNotification(err?.message || (isBn ? 'ব্যাকআপ ডাটা সঠিক নয়' : 'Invalid backup data'));
    } finally {
      setIsTransferringSession(false);
    }
  };

  const handleImportSession = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      await restoreSessionFromJsonText(text);
    } finally {
      if (sessionFileInputRef.current) sessionFileInputRef.current.value = '';
    }
  };

  const saveConfig = async (type: string) => {
    try {
      if (type === 'gemini') {
        const safeModel = geminiModel === 'gemini-flash-latest' ? 'gemini-3.1-flash-lite' : geminiModel;
        localStorage.setItem('wg_gemini_key', geminiKey);
        localStorage.setItem('wg_gemini_model', safeModel);
        await callApi('/api/moderation/settings', 'POST', { geminiApiKey: geminiKey, geminiModel: safeModel });
        if (geminiKey.trim() && !geminiKey.includes('...')) {
          await callApi('/api/moderation/ai-keys/add', 'POST', {
            key: geminiKey.trim(),
            provider: 'gemini',
            label: 'Gemini Main 1'
          }).catch(() => {});
        }
        showNotification(isBn ? 'Gemini এপিআই কি সার্ভারে সেভ হয়েছে!' : 'Gemini Config Saved to Backend!');
        loadModerationData();
      } else if (type === 'groq') {
        localStorage.setItem('wg_groq_key', groqKey);
        await callApi('/api/moderation/settings', 'POST', { groqApiKey: groqKey });
        if (groqKey.trim() && !groqKey.includes('...')) {
          await callApi('/api/moderation/ai-keys/add', 'POST', {
            key: groqKey.trim(),
            provider: 'groq',
            label: 'Groq Main 1'
          }).catch(() => {});
        }
        showNotification(isBn ? 'Groq এপিআই কি সার্ভারে সেভ হয়েছে!' : 'Groq API Key Saved to Backend!');
        loadModerationData();
      } else if (type === 'openrouter') {
        localStorage.setItem('wg_openrouter_key', openrouterKey);
        await callApi('/api/moderation/settings', 'POST', { openrouterApiKey: openrouterKey });
        if (openrouterKey.trim() && !openrouterKey.includes('...')) {
          await callApi('/api/moderation/ai-keys/add', 'POST', {
            key: openrouterKey.trim(),
            provider: 'openrouter',
            label: 'OpenRouter Main 1'
          }).catch(() => {});
        }
        showNotification(isBn ? 'OpenRouter এপিআই কি সার্ভারে সেভ হয়েছে!' : 'OpenRouter API Key Saved to Backend!');
        loadModerationData();
      } else if (type === 'supabase') {
        localStorage.setItem('wg_supabase_url', supabaseUrl);
        localStorage.setItem('wg_supabase_key', supabaseKey);
        showNotification('Supabase Credentials Saved!');
      } else if (type === 'meta') {
        localStorage.setItem('wg_watoken', waToken);
        localStorage.setItem('wg_phoneid', phoneId);
        localStorage.setItem('wg_wabaid', wabaId);
        showNotification('Meta Config Saved!');
      }
    } catch (err: any) {
      showNotification((isBn ? 'সেভ ব্যর্থ: ' : 'Save failed: ') + err.message);
    }
  };

  const testAI = async () => {
    const testInputEl = document.getElementById('mayaTestInput') as HTMLInputElement;
    const testInput = testInputEl?.value?.trim();

    if (activePage === 'maya' && testInput) {
       showNotification(isBn ? 'মায়ার উত্তরের জন্য অপেক্ষা করুন...' : 'Waiting for Maya response...');
       try {
         const res = await callApi('/api/maya/test', 'POST', { 
           text: testInput,
           settings: {
             ...settings,
             geminiModel: geminiModel === 'gemini-flash-latest' ? 'gemini-3.1-flash-lite' : geminiModel,
           }
         });
         
         const hintEl = testInputEl.parentElement?.nextElementSibling;
         if (hintEl) {
            const providerTag = res.provider ? ` [${res.provider.toUpperCase()} - ${res.latencyMs || 0}ms]` : '';
            const keyInfo = res.keyLabel ? `<span class="opacity-60"> via ${res.keyLabel}</span>` : '';
            const errorInfo = (res.provider === 'fallback' || res.provider === 'none') && res.error ? `<div class="mt-1 text-[9px] text-rose-500 font-mono">Debug: ${res.error}</div>` : '';
            hintEl.innerHTML = `<div><b>Maya${providerTag}:</b> ${res.reply}${keyInfo}</div>${errorInfo}`;
            hintEl.classList.remove('italic', 'text-gray-600');
            hintEl.classList.add('text-emerald-800');
         }
         showNotification(isBn ? `মায়া উত্তর দিয়েছে! (${res.provider || 'AI'})` : `Maya replied! (${res.provider || 'AI'})`);
         testInputEl.value = '';
       } catch (err: any) {
         showNotification('Maya Test Error: ' + err.message);
       }
       return;
    }

    try {
      const res = await callApi('/api/ai/test', 'POST');
      showNotification(res.message || 'AI Moderation Active');
    } catch {
      showNotification('Gemini AI Engine Active');
    }
  };

  const saveBaileysConfig = () => {
    const val = baileysUrl.trim().replace(/\/+$/, '');
    if (val) {
      try {
        new URL(val);
        localStorage.setItem('wg_server', val);
        showNotification('Baileys Server URL Saved!');
      } catch {
        showNotification(isBn ? 'সঠিক Server URL দিন (https://...)' : 'Invalid URL');
      }
    } else {
      localStorage.removeItem('wg_server');
      showNotification(isBn ? 'বিল্ট-ইন রিয়েল সার্ভার মোড সক্রিয়' : 'Built-in Server Active');
    }
  };

  const resetBaileysConfig = () => {
    localStorage.removeItem('wg_server');
    setBaileysUrl('');
    showNotification('Baileys URL Reset Done');
  };

  const getHelpStatus = (id: string | null): { text?: string; isActive?: boolean } => {
    if (!id) return {};
    switch (id) {
      case 'adminShield':
        return { text: settings.adminShield ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.adminShield };
      case 'autoKick3Warnings':
        return { text: settings.autoKick3Warnings ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.autoKick3Warnings };
      case 'antiStickerSpam':
        return { text: settings.antiStickerSpam ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.antiStickerSpam };
      case 'antiSticker':
        return { text: settings.antiSticker ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiSticker };
      case 'antiGif':
        return { text: settings.antiGif ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiGif };
      case 'antiVideo':
        return { text: settings.antiVideo ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiVideo };
      case 'antiImage':
        return { text: settings.antiImage ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiImage };
      case 'antiViewOnce':
        return { text: settings.antiViewOnce ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiViewOnce };
      case 'antiBadword':
        return { text: settings.antiBadword ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.antiBadword };
      case 'antiLink':
        return { text: settings.antiLink ? 'BLOCKED (নিষিদ্ধ)' : 'ALLOWED (অনুমোদিত)', isActive: settings.antiLink };
      case 'botReply':
        return { text: settings.botReply ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.botReply };
      case 'salamProtection':
        return { text: '100% PROTECTED (সুরক্ষিত)', isActive: true };
      case 'mayaEngine':
        return { text: settings.mayaAiEnabled ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.mayaAiEnabled };
      case 'mayaPrivateReply':
        return { text: settings.mayaPrivateReply ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.mayaPrivateReply };
      case 'mayaGroupReply':
        return { text: settings.mayaGroupReply ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.mayaGroupReply };
      case 'mayaRomantic':
        return { text: settings.mayaRomantic ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.mayaRomantic };
      case 'mayaFunny':
        return { text: settings.mayaFunny ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)', isActive: settings.mayaFunny };
      case 'botConnection':
        return { text: liveStatus.online ? 'ONLINE (কানেক্টেড)' : 'DISCONNECTED (সংযোগ নেই)', isActive: liveStatus.online };
      default:
        return { text: 'MONITORED (সক্রিয়)', isActive: true };
    }
  };

  // Setup controlled adaptive live status polling (pauses in background & when PIN-locked)
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const authStatus = await callApi('/api/auth/status');
        if (authStatus?.pinEnabled && !authStatus?.authenticated) {
          if (mounted) setIsPinLocked(true);
          return;
        }
      } catch {}
      if (mounted) await loadDashboard();
    };
    init();

    const scheduleNext = () => {
      if (!mounted) return;
      const isActivelyPairing =
        liveStatusRef.current.status === 'pairing' ||
        liveStatusRef.current.status === 'connecting' ||
        companionStatusRef.current.status === 'pairing' ||
        companionStatusRef.current.status === 'connecting' ||
        activePageRef.current === 'pairing' ||
        activePageRef.current === 'companion';
      const delay = isActivelyPairing ? 3000 : activePageRef.current === 'groups' ? 10000 : 15000;

      pollIntervalRef.current = setTimeout(async () => {
        if (!mounted) return;
        if (document.visibilityState !== 'hidden' && !isPinLockedRef.current) {
          await checkStatus();
          if (activePageRef.current === 'groups') {
            await loadGroups({ silent: true });
          }
          if (
            activePageRef.current === 'companion' ||
            companionStatusRef.current.status === 'pairing' ||
            companionStatusRef.current.status === 'connecting'
          ) {
            await loadCompanionStatus();
          }
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted && !isPinLockedRef.current) {
        checkStatus();
        if (activePageRef.current === 'groups') {
          loadGroups({ silent: true });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (isPinLocked) {
    return (
      <AdminLockScreen
        isBn={isBn}
        pinInput={pinInput}
        setPinInput={setPinInput}
        authError={authError}
        isVerifying={isVerifyingPin}
        onSubmit={handleVerifyPin}
      />
    );
  }

  return (
    <div className="shell">
      {/* Toast Notification */}
      {showToast && <div className="toast block">{toastMessage}</div>}

      {/* Clean Frosted Header */}
      <header className="header">
        <div className="brand">
          <div className="brandmark">
            <WAGuardLogo variant="mark" className="w-[19px] h-[19px]" />
          </div>
          <div className="min-w-0">
            <div className="brandname">
              WA<span>Guard</span>
            </div>
            <div className="text-[8.5px] font-bold tracking-[0.12em] uppercase text-[#64748b] leading-none mt-0.5 hidden sm:block">
              WHATSAPP BOT CONTROL
            </div>
          </div>
        </div>
        <div className="header-right">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold whitespace-nowrap shrink-0 rounded-lg border ${
              liveStatus.online
                ? 'bg-[#e8f8f0] text-[#07774e] border-emerald-200/80'
                : liveStatus.status === 'pairing'
                ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                : 'bg-slate-100/90 text-slate-600 border-slate-200/80'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                liveStatus.online ? 'bg-[#10b975]' : liveStatus.status === 'pairing' ? 'bg-amber-500' : 'bg-slate-400'
              }`}
            ></span>
            <span>
              {liveStatus.online
                ? t.connected
                : liveStatus.status === 'pairing'
                ? t.pairingActive
                : t.disconnected}
            </span>
          </div>

          {/* Bengali / English Language Switcher Button */}
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 text-[10px] font-extrabold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            onClick={toggleUiLang}
            title={isBn ? 'Switch UI to English' : 'বাংলায় পরিবর্তন করুন'}
          >
            <Globe size={11} className="text-emerald-700 shrink-0" />
            <span>{isBn ? 'English' : 'বাংলা'}</span>
          </button>

          <button
            className="iconbutton"
            onClick={() => navigateToPage(activePage)}
            title={t.refresh}
          >
            <RefreshCw size={14} />
          </button>
          <div className="avatar text-[10.5px] font-extrabold">WG</div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="side-label">{t.mainMenu}</div>
          <button className={`nav ${activePage === 'home' ? 'active' : ''}`} onClick={() => navigateToPage('home')}>
            <LayoutDashboard size={15} /> {t.home}
          </button>
          <button className={`nav ${activePage === 'inbox' ? 'active' : ''}`} onClick={() => navigateToPage('inbox')}>
            <Inbox size={15} /> {isBn ? 'গ্রুপ ইনবক্স' : 'Group Inbox'}
          </button>
          <button className={`nav ${activePage === 'security' ? 'active' : ''}`} onClick={() => navigateToPage('security')}>
            <ShieldCheck size={15} /> {t.security}
          </button>
          <button className={`nav ${activePage === 'warnings' ? 'active' : ''}`} onClick={() => navigateToPage('warnings')}>
            <AlertTriangle size={15} /> {isBn ? 'সতর্কবার্তা' : 'Warnings'}
          </button>
          <button className={`nav ${activePage === 'blocks' ? 'active' : ''}`} onClick={() => navigateToPage('blocks')}>
            <Lock size={15} /> {isBn ? '১০ মি. ব্লক' : '10M Blocks'}
          </button>
          <button className={`nav ${activePage === 'memberblock' ? 'active' : ''}`} onClick={() => navigateToPage('memberblock')}>
            <UserX size={15} /> {isBn ? 'মেম্বার লিস্ট ব্লক' : 'Member Block'}
          </button>
          <button className={`nav ${activePage === 'logs' ? 'active' : ''}`} onClick={() => navigateToPage('logs')}>
            <Activity size={15} /> {isBn ? 'লাইভ লগ' : 'Live Logs'}
          </button>

          <div className="side-label mt-3">{isBn ? 'স্মার্ট ফিচার' : 'SMART FEATURES'}</div>
          <button className={`nav ${activePage === 'nightmode' ? 'active' : ''}`} onClick={() => navigateToPage('nightmode')}>
            <Moon size={15} /> {isBn ? 'নাইট মোড' : 'Night Mode'}
          </button>
          <button className={`nav ${activePage === 'anticall' ? 'active' : ''}`} onClick={() => navigateToPage('anticall')}>
            <PhoneOff size={15} /> {isBn ? 'অ্যান্টি-কল' : 'Anti-Call'}
          </button>
          <button className={`nav ${activePage === 'aivision' ? 'active' : ''}`} onClick={() => navigateToPage('aivision')}>
            <ScanEye size={15} /> {isBn ? 'ভয়েস ও ছবি AI' : 'Voice & Vision'}
          </button>
          <button className={`nav ${activePage === 'voicemod' ? 'active' : ''}`} onClick={() => navigateToPage('voicemod')}>
            <AudioLines size={15} /> {isBn ? 'ভয়েস গালি গার্ড' : 'Voice Abuse AI'}
          </button>
          <button className={`nav ${activePage === 'activity' ? 'active' : ''}`} onClick={() => navigateToPage('activity')}>
            <Trophy size={15} /> {isBn ? 'অ্যাক্টিভিটি র‍্যাংক' : 'Activity Rank'}
          </button>
          <button className={`nav ${activePage === 'keywords' ? 'active' : ''}`} onClick={() => navigateToPage('keywords')}>
            <Hash size={15} /> {isBn ? 'কীওয়ার্ড উত্তর' : 'Keywords'}
          </button>
          <button className={`nav ${activePage === 'pinlock' ? 'active' : ''}`} onClick={() => navigateToPage('pinlock')}>
            <KeyRound size={15} /> {isBn ? 'অ্যাডমিন পিন' : 'Admin PIN'}
          </button>

          <div className="side-label mt-3">{isBn ? 'সিস্টেম ও বট' : 'SYSTEM & BOT'}</div>
          <button className={`nav ${activePage === 'maya' ? 'active' : ''}`} onClick={() => navigateToPage('maya')}>
            <Heart size={15} /> {t.maya}
          </button>
          <button className={`nav ${activePage === 'companion' ? 'active' : ''}`} onClick={() => navigateToPage('companion')}>
            <Sparkles size={15} /> {isBn ? '২য় AI অ্যাকাউন্ট' : '2nd Female AI'}
          </button>
          <button className={`nav ${activePage === 'integrations' ? 'active' : ''}`} onClick={() => navigateToPage('integrations')}>
            <Plug size={15} /> {t.integrations}
          </button>
          <button className={`nav ${activePage === 'storagecleanup' ? 'active' : ''}`} onClick={() => navigateToPage('storagecleanup')}>
            <HardDrive size={15} /> {isBn ? 'স্টোরেজ ও ক্লিনআপ' : 'Storage Cleanup'}
          </button>
          <button className={`nav ${activePage === 'groups' ? 'active' : ''}`} onClick={() => navigateToPage('groups')}>
            <Users size={15} /> {t.groups}
          </button>
          <button className={`nav ${activePage === 'pairing' ? 'active' : ''}`} onClick={() => navigateToPage('pairing')}>
            <Smartphone size={15} /> {t.connect}
          </button>

          <div className="side-bottom">
            <div className="flex items-center gap-2">
              <Radio size={15} className="text-[#087f55] shrink-0" />
              <strong>REAL BAILEYS</strong>
            </div>
            <p className="mt-1 text-[10px]">
              {liveStatus.online ? t.realPortConnected : t.realPortReady}
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="main">
          {/* HOME PAGE */}
          {activePage === 'home' && (
            <section className="page active" id="home">
              <div className="page-head">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.09em] uppercase text-[#64748b] mb-0.5">
                    {isBn ? 'স্বাগতম' : 'WELCOME BACK'}
                  </div>
                  <h1>{t.overviewTitle}</h1>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] hidden sm:inline">
                    {isBn ? 'লাইভ ওভারভিউ' : 'LIVE OVERVIEW'}
                  </span>
                  <button className="btn outline" onClick={loadDashboard}>
                    <RefreshCw size={12} />
                    <span className="btn-text">{t.refresh}</span>
                  </button>
                </div>
              </div>

              {/* Static Host Backend Warning */}
              {isStaticHost && !baileysUrl && (
                <div className="mb-4 p-3.5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-2.5 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                    <Plug size={16} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-xs">ব্যাকএন্ড সার্ভার কানেক্ট করা নেই!</h4>
                    <p className="text-[11px] mt-0.5 leading-relaxed opacity-90">
                      এই অ্যাপটি সরাসরি আপনার <b>Google Cloud Run</b> অথবা ফোনের <b>Termux (127.0.0.1:3000)</b> সার্ভারের সাথে কাজ করে। ফ্রি Render লিংক WhatsApp ব্যান ঝুঁকি বাড়ায়—তাই <b>Integrations</b> পেজে আপনার Google Cloud Run বা লোকাল সার্ভার লিংক সেভ করুন।
                    </p>
                    <button
                      className="mt-2.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors"
                      onClick={() => navigateToPage('integrations')}
                    >
                      কানেক্ট ব্যাকএন্ড
                    </button>
                  </div>
                </div>
              )}

              {/* Compact Low-Height Emerald Hero Card (Full Width, No Security Card on Home) */}
              <div className="hero flex items-center justify-between gap-2.5 sm:gap-4">
                <div className="hero-content flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/25 text-[8.5px] font-bold tracking-wide uppercase">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background: liveStatus.online ? '#86efac' : liveStatus.status === 'pairing' ? '#fde047' : '#facc15',
                        }}
                      />
                      <span>
                        {liveStatus.online
                          ? t.connected
                          : liveStatus.status === 'pairing'
                          ? t.pairingActive
                          : t.disconnected}
                      </span>
                    </div>
                    {renderInfoBtn('botConnection')}
                  </div>

                  <h3 className="text-white mt-1.5">{t.botConnTitle}</h3>
                  <p className="line-clamp-2">
                    {liveStatus.online
                      ? t.botConnDescConnected(liveStatus.user?.name || liveStatus.phoneNumber || 'Connected')
                      : t.botConnDescDisconnected}
                  </p>

                  <div className="hero-status">
                    <span
                      className="dot"
                      style={{
                        background: liveStatus.online ? '#4ade80' : liveStatus.status === 'pairing' ? '#facc15' : '#e2e8f0',
                      }}
                    ></span>
                    <span className="truncate">{liveStatus.stepMessage}</span>
                  </div>

                  <div className="hero-actions">
                    {liveStatus.online ? (
                      <>
                        <button
                          className="btn bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={handleDisconnect}
                        >
                          <LogOut size={11} /> {t.disconnectWa}
                        </button>
                        <button
                          className="btn bg-white/20 text-white"
                          onClick={openSessionBackupSection}
                        >
                          <Download size={11} /> {isBn ? 'ব্যাকআপ' : 'Backup'}
                        </button>
                      </>
                    ) : (
                      <button className="btn" onClick={() => navigateToPage('pairing')}>
                        <LinkIcon size={11} /> {t.connectWa}
                      </button>
                    )}
                    <button className="btn bg-white/20 text-white" onClick={loadDashboard}>
                      <RefreshCw size={11} /> {t.syncStatus}
                    </button>
                  </div>

                  {!liveStatus.online && (liveStatus.latestDisconnect || liveStatus.lastError) && (
                    <div className="mt-1.5 px-2 py-1 rounded-lg bg-black/20 border border-white/15 text-left text-[9.5px] leading-tight text-white/95 truncate">
                      <span className="font-extrabold text-amber-200 mr-1">
                        {isBn ? 'কারণ:' : 'Cause:'}
                      </span>
                      <span>
                        {liveStatus.latestDisconnect
                          ? isBn
                            ? liveStatus.latestDisconnect.titleBn
                            : liveStatus.latestDisconnect.titleEn
                          : liveStatus.lastError}
                      </span>
                    </div>
                  )}
                </div>

                {/* Friendly WAGuard Shield Bot Emblem Graphic (Visible on BOTH Mobile and Desktop) */}
                <div className="flex flex-col items-center justify-center shrink-0 relative z-10 pointer-events-none select-none" aria-hidden="true">
                  <WAGuardLogo
                    variant="bot"
                    className="w-[64px] h-[64px] sm:w-[82px] sm:h-[82px] drop-shadow-[0_4px_10px_rgba(6,78,52,0.24)]"
                  />
                  <span className="mt-1 text-[8px] font-extrabold tracking-[0.16em] text-white/90 uppercase">
                    AI GUARD
                  </span>
                </div>
              </div>

              {/* Server Statistics Header & 4-Card KPI Grid */}
              <div className="flex items-center justify-between gap-2 mt-4 mb-2.5 px-0.5">
                <h2 className="text-[13.5px] sm:text-[15px] font-extrabold text-[#0f291e] tracking-tight">
                  {isBn ? 'সার্ভার পরিসংখ্যান' : 'Server statistics'}
                </h2>
                <span className="text-[10.5px] font-semibold text-[#64748b]">
                  {isBn ? 'রিয়েল-টাইম ব্যাকএন্ড ডাটা' : 'Verified backend data'}
                </span>
              </div>

              {/* Compact 4-Card Stats (Matching Demo Image Layout: Icon top-left, Value, Label) */}
              <div className="stats">
                <div className="stat">
                  <div className="symbol sg">
                    <MessagesSquare size={16} />
                  </div>
                  <h2>{overview.messagesChecked}</h2>
                  <small>{t.messagesChecked}</small>
                  <p>{t.realtimeEngine}</p>
                </div>
                <div className="stat">
                  <div className="symbol so">
                    <AlertTriangle size={16} />
                  </div>
                  <h2>{overview.warnings}</h2>
                  <small>{t.warnings}</small>
                  <p>{t.activeWarnings}</p>
                </div>
                <div className="stat">
                  <div className="symbol sr">
                    <Ban size={16} />
                  </div>
                  <h2>{overview.blockedWords}</h2>
                  <small>{t.blockedItems}</small>
                  <p>{t.deletedViolations}</p>
                </div>
                <div className="stat">
                  <div className="symbol sb">
                    <Users size={16} />
                  </div>
                  <h2>{overview.groups || groups.length}</h2>
                  <small>{t.activeGroups}</small>
                  <p>{t.protectedGroups}</p>
                </div>
              </div>

              {/* Every Feature & Security Tool Separate Button Cards Hub on Home Page */}
              <HomeFeatureHub
                isBn={isBn}
                settings={settings}
                activeWarningsCount={activeWarnings.length}
                blocksCount={restrictedUsers.length + groupLocks.length}
                logsCount={activityLogs.length}
                groupsCount={overview.groups || groups.length}
                callsCount={callLogs.length}
                keywordsCount={keywords.length}
                nightStatus={nightStatus}
                isConnected={liveStatus.online}
                companionOnline={companionStatus.online}
                storageUsedPercent={storageOverview?.snapshot?.disk?.usedPercent}
                storageRecoveredLabel={
                  storageOverview?.scheduler?.totalRecoveredBytes
                    ? `+${formatBytesHuman(storageOverview.scheduler.totalRecoveredBytes)}`
                    : undefined
                }
                searchQuery={homeToolSearch}
                setSearchQuery={setHomeToolSearch}
                onNavigate={navigateToPage}
                onOpenSessionBackup={openSessionBackupSection}
              />
            </section>
          )}

          {/* DEDICATED INDIVIDUAL SECURITY TOOL PAGES */}
          {activePage.startsWith('sec_') && (
            <SecurityToolPage
              toolId={activePage as SecurityToolId}
              isBn={isBn}
              t={t}
              settings={settings}
              setSettings={setSettings}
              customBadwordsText={customBadwordsText}
              setCustomBadwordsText={setCustomBadwordsText}
              stickerQueue={stickerQueue}
              groups={groups}
              purgingStickers={purgingStickers}
              activeWarningsCount={activeWarnings.length}
              onBack={() => navigateToPage('home')}
              onNavigate={navigateToPage}
              onUpdateToggle={(key, val) => updateSettingToggle(key as keyof ModerationSettings, val)}
              onUpdateMultipleSettings={(patch) => updateMultipleSettings(patch as Partial<ModerationSettings>)}
              onSaveBadwords={saveCustomBadwords}
              onSaveStickerSpamConfig={handleSaveStickerSpamConfig}
              onRefreshStickerQueue={handleRefreshStickerQueue}
              onRetryFailedStickers={handleRetryFailedStickers}
              onClearStickerQueueHistory={handleClearStickerQueueHistory}
              onPurgeGroupStickers={handlePurgeGroupStickers}
              onSaveAdminMentionConfig={handleSaveAdminMentionConfig}
              onSaveBossAndNoticeConfig={handleSaveBossAndNoticeConfig}
              onSaveNewMemberRulesConfig={handleSaveNewMemberRulesConfig}
              onTestBossAlert={handleTestBossAlert}
              renderInfoBtn={renderInfoBtn}
            />
          )}

          {/* DEDICATED FEATURE PAGES */}
          {activePage === 'warnings' && (
            <WarningsPage
              isBn={isBn}
              activeWarnings={activeWarnings}
              isLoading={isLogsLoading}
              onBack={() => navigateToPage('home')}
              onRefresh={loadModerationData}
              onResetSingle={handleResetSingleWarning}
              onResetAll={resetAllWarnings}
              onGoToLogs={() => {
                setLogFilter('warned');
                navigateToPage('logs');
              }}
            />
          )}

          {activePage === 'blocks' && (
            <BlocksPage
              isBn={isBn}
              groupLocks={groupLocks}
              restrictedUsers={restrictedUsers}
              activityLogs={activityLogs}
              isLoading={isLogsLoading}
              onBack={() => navigateToPage('home')}
              onRefresh={loadModerationData}
              onUnlockGroup={handleUnlockGroup}
              onManualUnmute={handleManualUnmute}
              onGoToLogs={() => {
                setLogFilter('blocks');
                navigateToPage('logs');
              }}
            />
          )}

          {activePage === 'memberblock' && (
            <MemberBlockPage
              isBn={isBn}
              isConnected={liveStatus.online || memberDirGroups.length > 0}
              isLoading={memberDirLoading}
              groups={memberDirGroups}
              selectedGroupId={memberDirGroupId}
              isBotAdmin={memberDirIsBotAdmin}
              members={memberDirMembers}
              adminShieldEnabled={settings.adminShield}
              noticeTemplate={settings.manualBlockNotice || ''}
              defaultNotice={defaultManualBlockNotice}
              blockingJid={blockingMemberJid}
              onSelectGroup={(gid) => {
                setMemberDirGroupId(gid);
                loadGroupMembers(gid, false);
              }}
              onRefresh={() => loadGroupMembers(memberDirGroupId, true)}
              onBlockMember={handleBlockMemberFromList}
              onUnblockMember={handleUnblockMemberFromList}
              onSaveNoticeTemplate={handleSaveManualBlockNotice}
              onGoConnect={() => navigateToPage('pairing')}
              onBack={() => navigateToPage('home')}
            />
          )}

          {activePage === 'logs' && (
            <LogsPage
              isBn={isBn}
              activityLogs={activityLogs}
              logFilter={logFilter}
              setLogFilter={setLogFilter}
              onBack={() => navigateToPage('home')}
              onRefresh={loadModerationData}
              onClearLogs={clearLogs}
            />
          )}

          {activePage === 'nightmode' && (
            <NightModePage
              isBn={isBn}
              settings={settings}
              nightStatus={nightStatus}
              onBack={() => navigateToPage('home')}
              onRefresh={loadNightMode}
              onSaveNightSettings={handleSaveNightSettings}
              onToggleNow={handleToggleNightNow}
            />
          )}

          {activePage === 'anticall' && (
            <AntiCallPage
              isBn={isBn}
              settings={settings}
              callLogs={callLogs}
              onBack={() => navigateToPage('home')}
              onRefresh={loadCalls}
              onSaveAntiCall={handleSaveAntiCall}
              onClearCalls={handleClearCalls}
            />
          )}

          {activePage === 'aivision' && (
            <AiVisionPage
              isBn={isBn}
              settings={settings}
              onBack={() => navigateToPage('home')}
              onToggle={(key, val) => updateSettingToggle(key as keyof ModerationSettings, val)}
              onGoToKeys={() => navigateToPage('integrations')}
            />
          )}

          {activePage === 'activity' && (
            <ActivityRankPage
              isBn={isBn}
              settings={settings}
              report={activityReport}
              selectedGroup={activityGroupFilter}
              setSelectedGroup={(g) => {
                setActivityGroupFilter(g);
                loadActivityRank(g, activityGhostDays);
              }}
              ghostDays={activityGhostDays}
              setGhostDays={(d) => {
                setActivityGhostDays(d);
                loadActivityRank(activityGroupFilter, d);
              }}
              onBack={() => navigateToPage('home')}
              onRefresh={() => loadActivityRank(activityGroupFilter, activityGhostDays)}
              onResetActivity={handleResetActivityRank}
              onToggleTracking={(v) => updateSettingToggle('activityTrackingEnabled', v)}
            />
          )}

          {activePage === 'keywords' && (
            <KeywordsPage
              isBn={isBn}
              settings={settings}
              keywords={keywords}
              onBack={() => navigateToPage('home')}
              onToggleMaster={(v) => updateSettingToggle('keywordAutoReplyEnabled', v)}
              onAddKeyword={handleAddKeyword}
              onToggleKeyword={handleToggleKeyword}
              onRemoveKeyword={handleRemoveKeyword}
            />
          )}

          {activePage === 'pinlock' && (
            <PinLockPage
              isBn={isBn}
              pinEnabled={Boolean(settings.dashboardPinEnabled)}
              onBack={() => navigateToPage('home')}
              onUpdatePin={handleUpdatePin}
              onLockNow={handleLockNow}
            />
          )}

          {activePage === 'companion' && (
            <CompanionBotPage
              isBn={isBn}
              status={companionStatus}
              settings={settings}
              isPairing={isCompanionPairing}
              pairingError={companionPairingError}
              onPair={handlePairCompanion}
              onDisconnect={handleDisconnectCompanion}
              onRefresh={loadCompanionStatus}
              onSaveSettings={handleSaveCompanionSettings}
              onTestChat={handleTestCompanionChat}
              onClearMemory={handleClearCompanionMemory}
              onBack={() => navigateToPage('home')}
            />
          )}

          {activePage === 'storagecleanup' && (
            <StorageCleanupPage
              isBn={isBn}
              overview={storageOverview}
              isLoading={isStorageLoading}
              runningMode={cleanupRunningMode}
              onBack={() => navigateToPage('home')}
              onRefresh={loadStorageOverview}
              onRunCleanup={handleRunServerCleanup}
              onSaveSettings={handleSaveCleanupSettings}
              onClearHistoriesNow={handleClearAllHistoriesNow}
              onClearAlerts={handleClearStorageAlerts}
            />
          )}

          {activePage === 'voicemod' && (
            <VoiceModerationPage
              isBn={isBn}
              overview={voiceOverview}
              isLoading={isVoiceLoading}
              apiBaseUrl={baileysUrl}
              onBack={() => navigateToPage('home')}
              onRefresh={loadVoiceOverview}
              onSaveSettings={handleSaveVoiceSettings}
              onEnsureModel={handleEnsureVoiceModel}
              onRetryQueue={handleRetryVoiceQueue}
              onClearHistory={handleClearVoiceHistory}
              onTestAudio={handleTestVoiceAudio}
              onResolveReview={handleResolveVoiceReview}
            />
          )}

          {activePage === 'inbox' && (
            <GroupInboxPage
              isBn={isBn}
              isConnected={liveStatus.online}
              apiBaseUrl={baileysUrl}
              adminToken={localStorage.getItem('wg_admin_token') || ''}
              initialGroupId={inboxSelectedGroupId}
              initialDeletedOnly={inboxInitialDeletedOnly}
              callApi={callApi}
              showNotification={showNotification}
              onLeaveGroup={async (gid, gname) => {
                await handleLeaveGroupFromServer({
                  id: gid,
                  name: gname,
                  participants: 0,
                  status: 'Active',
                });
              }}
              onBack={() => navigateToPage('home')}
            />
          )}

          {/* SECURITY & MODERATION PAGE */}
          {activePage === 'security' && (
            <section className="page active" id="security">
              <div className="page-head">
                <div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="sub-back-btn mb-2 cursor-pointer"
                  >
                    <ArrowLeft size={12} className="text-[#087f55]" /> {isBn ? 'হোম পেজ' : 'Home'}
                  </button>
                  <h1>{t.securityTitle}</h1>
                  <p>{t.securitySub}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn outline" onClick={loadModerationData} disabled={isLogsLoading}>
                    <RefreshCw size={12} className={isLogsLoading ? 'animate-spin' : ''} />
                    <span className="btn-text">{t.refreshRules}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button className="btn danger" onClick={resetAllWarnings}>
                      <RotateCcw size={12} />
                      <span className="btn-text">{t.resetWarningsBtn}</span>
                    </button>
                    {renderInfoBtn('warningManagement')}
                  </div>
                </div>
              </div>

              {/* Quick Navigation Cards on Security Page */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                <button
                  type="button"
                  onClick={() => jumpToSecuritySection('warnings')}
                  className="text-left p-3 bg-white border border-emerald-950/[0.065] rounded-[16px] shadow-[0_2px_10px_rgba(10,56,36,0.03)] hover:border-amber-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-7 h-7 rounded-[8px] bg-amber-50 text-amber-600 flex items-center justify-center">
                      <AlertTriangle size={14} />
                    </span>
                    <span className="text-[13px] font-extrabold text-amber-700 tabular-nums">{activeWarnings.length}</span>
                  </div>
                  <div className="text-[11.5px] font-extrabold text-[#0f291e]">
                    {isBn ? 'সতর্কবার্তা (Warnings)' : 'Active Warnings'}
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-0.5 truncate">
                    {isBn ? 'সদস্যদের ১/৩, ২/৩ ওয়ার্নিং' : 'Member strike counters'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => jumpToSecuritySection('blocks')}
                  className="text-left p-3 bg-white border border-emerald-950/[0.065] rounded-[16px] shadow-[0_2px_10px_rgba(10,56,36,0.03)] hover:border-rose-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-7 h-7 rounded-[8px] bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Lock size={14} />
                    </span>
                    <span className="text-[13px] font-extrabold text-rose-600 tabular-nums">{restrictedUsers.length + groupLocks.length}</span>
                  </div>
                  <div className="text-[11.5px] font-extrabold text-[#0f291e]">
                    {isBn ? '১০ মি. ব্লক ও লক' : '10-Min Blocks'}
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-0.5 truncate">
                    {isBn ? 'গ্রুপ লক ও মিউট তালিকা' : 'Timers & unblock'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => jumpToSecuritySection('logs')}
                  className="text-left p-3 bg-white border border-emerald-950/[0.065] rounded-[16px] shadow-[0_2px_10px_rgba(10,56,36,0.03)] hover:border-sky-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-7 h-7 rounded-[8px] bg-sky-50 text-sky-600 flex items-center justify-center">
                      <Activity size={14} />
                    </span>
                    <span className="text-[13px] font-extrabold text-sky-700 tabular-nums">{activityLogs.length}</span>
                  </div>
                  <div className="text-[11.5px] font-extrabold text-[#0f291e]">
                    {isBn ? 'মডারেশন লগ' : 'Moderation Logs'}
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-0.5 truncate">
                    {isBn ? 'ব্লক ও ডিলিটের ইতিহাস' : 'Filter by category'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => jumpToSecuritySection('rules')}
                  className="text-left p-3 bg-white border border-emerald-950/[0.065] rounded-[16px] shadow-[0_2px_10px_rgba(10,56,36,0.03)] hover:border-emerald-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-7 h-7 rounded-[8px] bg-[#e9f7f0] text-[#087f55] flex items-center justify-center">
                      <ShieldCheck size={14} />
                    </span>
                    <span className="text-[11px] font-extrabold text-[#087f55]">ON</span>
                  </div>
                  <div className="text-[11.5px] font-extrabold text-[#0f291e]">
                    {isBn ? 'সিকিউরিটি রুলস' : 'Security Rules'}
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-0.5 truncate">
                    {isBn ? 'স্টিকার, লিংক ও গালি ফিল্টার' : 'Toggle protection rules'}
                  </p>
                </button>
              </div>

              {/* SECURITY & PROTECTION */}
              <div ref={rulesCardRef} className="category-system-header mt-4 mb-2 px-0.5">
                 <h2>{isBn ? 'সিকিউরিটি ও সুরক্ষা সেটিংস' : 'Security & Protection'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3>{t.sec1Title}</h3>
                      {renderInfoBtn('adminShield')}
                    </div>
                    <p>{t.sec1Sub}</p>
                  </div>
                  <div className="symbol sg">
                    <ShieldAlert size={15} />
                  </div>
                </div>

                {/* Admin Shield Toggle */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.adminShieldTitle}</span>
                      {renderInfoBtn('adminShield')}
                    </h4>
                    <p>{t.adminShieldDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.adminShield}
                      onChange={(e) => updateSettingToggle('adminShield', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* 3 Warning Auto Kick */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.autoKickTitle}</span>
                      {renderInfoBtn('autoKick3Warnings')}
                    </h4>
                    <p>{t.autoKickDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.autoKick3Warnings}
                      onChange={(e) => updateSettingToggle('autoKick3Warnings', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Auto Welcome New Member with @Mention */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'অটো ওয়েলকাম মেসেজ (@Mention)' : 'Auto Welcome New Members (@Mention)'}</h4>
                    <p>
                      {isBn
                        ? 'গ্রুপে নতুন কোনো সদস্য যুক্ত হলে বট স্বয়ংক্রিয়ভাবে @মেনশন দিয়ে ওয়েলকাম জানাবে।'
                        : 'Automatically greet newly added group members with @mention.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.autoWelcome !== false}
                      onChange={(e) => updateSettingToggle('autoWelcome', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {settings.autoWelcome !== false && (
                  <div className="subpanel-soft">
                    <label className="block text-[10px] font-bold text-[#334155] mb-1.5">
                      {isBn
                        ? 'কাস্টম ওয়েলকাম মেসেজ ({user} ও {group} সাপোর্টেড)'
                        : 'Custom Welcome Template (supports {user} & {group})'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        className="field flex-1"
                        value={settings.welcomeMessage || ''}
                        onChange={(e) => setSettings((prev) => ({ ...prev, welcomeMessage: e.target.value }))}
                        placeholder={
                          isBn
                            ? 'ফাঁকা রাখলে ডিফল্ট সুন্দর বাংলা ওয়েলকাম পাঠাবে...'
                            : 'Leave blank for default welcome message...'
                        }
                      />
                      <button
                        type="button"
                        className="btn soft shrink-0"
                        onClick={() => updateSettingToggle('welcomeMessage', settings.welcomeMessage || '')}
                      >
                        <Save size={12} /> {isBn ? 'সেভ' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* New Member Inbox Rules + Group Short Mention */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'নতুন মেম্বার ইনবক্স রুলস ও মেনশন নোটিশ' : 'New Member Inbox Rules Notice'}</h4>
                    <p>
                      {isBn
                        ? 'নতুন সদস্য এড হলে তার ইনবক্সে গ্রুপ রুলস দেবে এবং গ্রুপে @মেনশন দিয়ে ছোট্ট করে জানাবে।'
                        : 'DMs group rules to new members and sends a short @mention notice in group.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateToPage('sec_inbox_rules')}
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-[#087f55] hover:underline cursor-pointer"
                    >
                      <span>{isBn ? 'ইনবক্স রুলস ও নোটিশ পরিবর্তন করুন' : 'Edit Rules & Group Notice'}</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.newMemberInboxRulesEnabled !== false}
                      onChange={(e) => updateSettingToggle('newMemberInboxRulesEnabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="policy-box">
                  <h4>{isBn ? 'ডিফল্ট ভায়োলেশন পলিসি' : 'Default violation policy'}</h4>
                  <div className="space-y-0.5 text-[10.5px]">
                    <div>{isBn ? '১ম বার ভঙ্গ · প্রথম সতর্কবার্তা (Warning)' : '1st violation · Warning'}</div>
                    <div>{isBn ? '২য় বার ভঙ্গ · চূড়ান্ত সতর্কবার্তা (Final warning)' : '2nd violation · Final warning'}</div>
                    <div>{isBn ? '৩য় বার ভঙ্গ · অটো কিক (শুধু বট অ্যাডমিন হলে)' : '3rd violation · Auto Kick (only with admin permission)'}</div>
                  </div>
                </div>
              </div>



              {/* ANTI-SPAM PROTECTION */}
              <div className="category-system-header mt-5 mb-2 px-0.5">
                 <h2>{isBn ? 'অ্যান্টি-স্প্যাম ও মিডিয়া সুরক্ষা' : 'Anti-Spam & Media Protection'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3>{t.sec2Title}</h3>
                      {renderInfoBtn('antiStickerSpam')}
                    </div>
                    <p>{t.sec2Sub}</p>
                  </div>
                  <div className="symbol so">
                    <Lock size={15} />
                  </div>
                </div>

                {/* Anti-Sticker Spam */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiStickerSpamTitle}</span>
                      {renderInfoBtn('antiStickerSpam')}
                    </h4>
                    <p>{t.antiStickerSpamDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiStickerSpam}
                      onChange={(e) => updateSettingToggle('antiStickerSpam', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Anti-Sticker */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiStickerTitle}</span>
                      {renderInfoBtn('antiSticker')}
                    </h4>
                    <p>{t.antiStickerDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiSticker}
                      onChange={(e) => updateSettingToggle('antiSticker', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Configurable Sticker Spam Thresholds & High-Priority Queue Monitor */}
                <div className="subpanel-soft space-y-2.5 my-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-[11.5px] font-extrabold text-[#0f291e] flex items-center gap-1.5 flex-wrap">
                        <span>{isBn ? '⚡ স্টিকার স্প্যাম কনফিগ ও লাইভ কিউ' : '⚡ Sticker Spam Window & Queue'}</span>
                      </h4>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {isBn
                          ? '৫× স্পিড বা একসঙ্গে ১০০+ স্টিকার এলেও প্রতিটি Unique Message ID কিউয়ে সংরক্ষণ ও প্যারালাল ডিলিট হবে।'
                          : 'Captures bursts up to 100+ stickers synchronously, deduplicates Message IDs, and deletes in parallel.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="btn outline" onClick={handleRefreshStickerQueue}>
                        <RefreshCw size={11} /> {isBn ? 'কিউ সিংক' : 'Sync'}
                      </button>
                      <button type="button" className="btn primary" onClick={handleSaveStickerSpamConfig}>
                        <Save size={11} /> {isBn ? 'সেভ করুন' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'সময়সীমা (সেকেন্ড)' : 'Time Window (sec)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={settings.individualMuteTimeWindow ?? 5}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, individualMuteTimeWindow: Number(e.target.value || 5) }))
                        }
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'স্টিকার লিমিট (সংখ্যা)' : 'Sticker Limit'}
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={100}
                        value={settings.individualMuteStickerLimit ?? 3}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, individualMuteStickerLimit: Number(e.target.value || 3) }))
                        }
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'ব্লক সময় (মিনিট)' : 'Block Duration (min)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={settings.individualMuteDurationMinutes ?? 10}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, individualMuteDurationMinutes: Number(e.target.value || 10) }))
                        }
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'প্যারালাল / রিট্রাই' : 'Parallel / Retries'}
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          title="Parallel Workers"
                          value={settings.stickerQueueConcurrency ?? 5}
                          onChange={(e) =>
                            setSettings((prev) => ({ ...prev, stickerQueueConcurrency: Number(e.target.value || 5) }))
                          }
                          className="w-1/2 px-1.5 py-1 border border-slate-300 rounded text-xs font-bold"
                        />
                        <input
                          type="number"
                          min={1}
                          max={10}
                          title="Max Retries"
                          value={settings.stickerDeleteMaxRetries ?? 4}
                          onChange={(e) =>
                            setSettings((prev) => ({ ...prev, stickerDeleteMaxRetries: Number(e.target.value || 4) }))
                          }
                          className="w-1/2 px-1.5 py-1 border border-slate-300 rounded text-xs font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {stickerQueue && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'পেন্ডিং কিউ' : 'Pending'}</div>
                          <div className="text-xs font-black text-amber-600">{stickerQueue.pendingCount}</div>
                        </div>
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ভেরিফায়েড ডিলিট' : 'Verified Del'}</div>
                          <div className="text-xs font-black text-emerald-700">{stickerQueue.stats.totalVerifiedDeleted}</div>
                        </div>
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'রিট্রাই' : 'Retried'}</div>
                          <div className="text-xs font-black text-blue-600">{stickerQueue.stats.totalRetried}</div>
                        </div>
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ডুপ্লিকেট ব্লক' : 'Deduped'}</div>
                          <div className="text-xs font-black text-slate-700">{stickerQueue.stats.totalDuplicatePrevented}</div>
                        </div>
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'পারমিশন নেই' : 'No Admin'}</div>
                          <div className="text-xs font-black text-rose-600">{stickerQueue.stats.totalFailedNoPermission}</div>
                        </div>
                        <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ব্যর্থ' : 'Failed'}</div>
                          <div className="text-xs font-black text-rose-700">{stickerQueue.stats.totalFailed}</div>
                        </div>
                      </div>

                      {stickerQueue.permissionDeniedGroups && stickerQueue.permissionDeniedGroups.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[10.5px] text-rose-800 space-y-1">
                          <div className="font-extrabold">
                            ⚠️ {isBn ? 'নিচের গ্রুপে বটের Sticker Delete Permission (Admin) নেই:' : 'Bot lacks Admin Delete Permission in:'}
                          </div>
                          {stickerQueue.permissionDeniedGroups.map((g) => (
                            <div key={g.groupId} className="font-medium">
                              • {g.groupName} ({g.blockedStickerCount}টি ডিলিট আটকে আছে — বটকে Admin বানান)
                            </div>
                          ))}
                        </div>
                      )}

                      {(stickerQueue.stats.totalFailed > 0 || stickerQueue.stats.totalFailedNoPermission > 0 || stickerQueue.recentHistory.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn soft" onClick={handleRetryFailedStickers}>
                            <RotateCcw size={11} /> {isBn ? 'ব্যর্থ স্টিকার রিট্রাই করুন' : 'Retry Failed Stickers'}
                          </button>
                          <button type="button" className="btn outline" onClick={handleClearStickerQueueHistory}>
                            <Trash2 size={11} /> {isBn ? 'হিস্ট্রি ক্লিয়ার' : 'Clear History'}
                          </button>
                        </div>
                      )}

                      <div className="pt-2 border-t border-emerald-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-extrabold text-slate-900">
                            {isBn ? 'এক ক্লিকে গ্রুপের আগের জমে থাকা সব স্টিকার রিমুভ' : '1-Click Remove Previous Accumulated Stickers'}
                          </div>
                          <div className="text-[10px] text-slate-600">
                            {(() => {
                              const activeCount = stickerQueue?.accumulatedStickers?.totalCount ?? 0;
                              const unverifiedCount = stickerQueue?.accumulatedStickers?.unverifiedBulkCount ?? 0;
                              if (activeCount > 0) {
                                return isBn
                                  ? `সার্ভার ও গ্রুপে শনাক্তকৃত অ-ডিলিটেড স্টিকার: ${activeCount}টি`
                                  : `Detected accumulated stickers: ${activeCount}`;
                              }
                              if (unverifiedCount > 0) {
                                return isBn
                                  ? `WhatsApp গ্রুপে রিট্রাইযোগ্য আগের স্টিকার: ${unverifiedCount}টি (সার্ভার থেকে হিডেন ছিল)`
                                  : `Pending WhatsApp group re-purge: ${unverifiedCount} stickers`;
                              }
                              return isBn
                                ? `সার্ভারে শনাক্তকৃত অ-ডিলিটেড স্টিকার: 0টি`
                                : `Detected accumulated stickers: 0`;
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <select
                            value={purgeTargetGroupId}
                            onChange={(e) => setPurgeTargetGroupId(e.target.value)}
                            className="px-2 py-1 border border-slate-300 rounded-lg bg-white text-[11px] font-bold text-slate-800 max-w-[160px]"
                          >
                            <option value="ALL">{isBn ? 'সব গ্রুপ একসাথে' : 'All Groups'}</option>
                            {(stickerQueue?.accumulatedStickers?.groups?.length
                              ? stickerQueue.accumulatedStickers.groups
                              : stickerQueue?.accumulatedStickers?.unverifiedGroups?.length
                              ? stickerQueue.accumulatedStickers.unverifiedGroups
                              : groups.map((g) => ({ groupId: g.id, groupName: g.name, count: 0 }))
                            ).map((g) => (
                              <option key={g.groupId} value={g.groupId}>
                                {g.groupName} {g.count > 0 ? `(${g.count})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={purgingStickers}
                            onClick={() =>
                              handlePurgeGroupStickers(
                                purgeTargetGroupId,
                                (stickerQueue?.accumulatedStickers?.totalCount ?? 0) === 0 &&
                                  (stickerQueue?.accumulatedStickers?.unverifiedBulkCount ?? 0) > 0
                              )
                            }
                            className="btn danger"
                          >
                            <Trash2 size={11} />{' '}
                            {purgingStickers
                              ? isBn
                                ? 'রিমুভ হচ্ছে...'
                                : 'Removing...'
                              : (stickerQueue?.accumulatedStickers?.totalCount ?? 0) === 0 &&
                                (stickerQueue?.accumulatedStickers?.unverifiedBulkCount ?? 0) > 0
                              ? isBn
                                ? 'গ্রুপ থেকে পুনরায় রিমুভ'
                                : 'Re-Purge in WhatsApp'
                              : isBn
                              ? 'সব স্টিকার রিমুভ (১ ক্লিক)'
                              : 'Purge All Stickers'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Anti-GIF */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiGifTitle}</span>
                      {renderInfoBtn('antiGif')}
                    </h4>
                    <p>{t.antiGifDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiGif}
                      onChange={(e) => updateSettingToggle('antiGif', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Anti-Video */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiVideoTitle}</span>
                      {renderInfoBtn('antiVideo')}
                    </h4>
                    <p>{t.antiVideoDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiVideo}
                      onChange={(e) => updateSettingToggle('antiVideo', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Anti-Image */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiImageTitle}</span>
                      {renderInfoBtn('antiImage')}
                    </h4>
                    <p>{t.antiImageDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiImage}
                      onChange={(e) => updateSettingToggle('antiImage', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Anti-View Once */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiViewOnceTitle}</span>
                      {renderInfoBtn('antiViewOnce')}
                    </h4>
                    <p>{t.antiViewOnceDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiViewOnce}
                      onChange={(e) => updateSettingToggle('antiViewOnce', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {/* DEDICATED ACTIVE WARNINGS CARD (Mobile-First Card Grid) */}
              <div ref={warningsCardRef} className="card mt-4 border-amber-300 bg-white">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-[13px] text-amber-900">
                        {isBn ? 'সক্রিয় সতর্কবার্তা তালিকা (Active Member Warnings)' : 'Active Member Warnings'}
                      </h3>
                      <span className="badge badge-amber">{activeWarnings.length}</span>
                      {renderInfoBtn('warningManagement')}
                    </div>
                    <p>
                      {isBn
                        ? 'প্রতিটি সদস্যের ১/৩, ২/৩ ও ৩/৩ ওয়ার্নিং এবং কোন নিয়ম ভঙ্গের কারণে ওয়ার্নিং হয়েছে তা এখানে দেখা যাবে।'
                        : 'Live 1/3, 2/3, 3/3 strike details per member across protected groups.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn outline" onClick={loadModerationData} disabled={isLogsLoading}>
                      <RefreshCw size={12} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
                    </button>
                    <button className="btn danger" onClick={resetAllWarnings}>
                      <RotateCcw size={12} /> {isBn ? 'সব রিসেট' : 'Reset All'}
                    </button>
                  </div>
                </div>

                {activeWarnings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                    {activeWarnings.map((w) => (
                      <div
                        key={w.key}
                        className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-extrabold text-slate-900 break-all">
                                @{w.senderPhone}
                              </span>
                              <span
                                className={`badge ${
                                  w.count >= 3 ? 'badge-red' : 'badge-amber'
                                }`}
                              >
                                {isBn ? `সতর্কতা ${w.count}/${w.maxWarnings}` : `Strike ${w.count}/${w.maxWarnings}`}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-slate-700 mt-1 break-words">
                              {isBn ? 'গ্রুপ:' : 'Group:'} {w.groupName}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {isBn ? 'সর্বশেষ:' : 'Last:'} {new Date(w.lastViolation).toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn outline shrink-0"
                            onClick={() => handleResetSingleWarning(w.key)}
                          >
                            <RotateCcw size={12} /> {isBn ? 'রিসেট' : 'Reset'}
                          </button>
                        </div>

                        {w.violations && w.violations.length > 0 && (
                          <div className="pt-2 border-t border-amber-200/70 space-y-1">
                            {w.violations.map((v, idx) => (
                              <div key={idx} className="text-[11px] text-slate-700 flex items-start justify-between gap-2">
                                <span className="font-medium break-words">• {v.reason}</span>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {new Date(v.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                    <p className="text-xs text-slate-600">
                      {isBn
                        ? 'বর্তমানে কোনো সদস্যের পেন্ডিং ওয়ার্নিং (১/৩ বা ২/৩) নেই। কেউ নিয়ম ভঙ্গ করলে সাথে সাথে এখানে কার্ড আকারে দেখাবে।'
                        : 'No active pending warnings right now.'}
                    </p>
                    <button
                      type="button"
                      className="btn soft"
                      onClick={() => jumpToSecuritySection('logs', 'warned')}
                    >
                      <AlertTriangle size={12} /> {isBn ? 'পূর্বের ওয়ার্নিং লগ দেখুন' : 'View Warning History'}
                    </button>
                  </div>
                )}
              </div>

              {/* DEDICATED 10-MINUTE GROUP LOCKS & RESTRICTED MEMBERS CARDS */}
              <div ref={blocksCardRef} className="card mt-4 border-rose-300/70 bg-white">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-[13px] text-rose-900">
                        {isBn ? '১০ মিনিট গ্রুপ ব্লক ও সদস্য রেস্ট্রিকশন তথ্য' : '10-Minute Group Locks & Member Blocks'}
                      </h3>
                      <span className="badge badge-red">{restrictedUsers.length + groupLocks.length}</span>
                      {renderInfoBtn('antiStickerSpam')}
                    </div>
                    <p>
                      {isBn
                        ? 'স্টিকার স্প্যাম বা নিয়ম ভঙ্গের কারণে কোন গ্রুপ লক হয়েছে বা কোন সদস্য ১০ মিনিটের ব্লক খেয়েছে তার পূর্ণাঙ্গ তথ্য ও লাইভ টাইমার।'
                        : 'Live timers, blocked group/member details, manual unlock buttons, and 10-min block history.'}
                    </p>
                  </div>
                  <button className="btn outline" onClick={loadModerationData} disabled={isLogsLoading}>
                    <RefreshCw size={12} /> {isBn ? 'আপডেট' : 'Refresh'}
                  </button>
                </div>

                {/* Part 1: Active 10-Minute Whole Group Locks */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Lock size={13} className="text-rose-600" />
                      {isBn ? 'সক্রিয় ১০ মিনিট গ্রুপ লক (Group Locks)' : 'Active 10-Min Group Locks'}
                    </span>
                    <span className="badge badge-amber">{groupLocks.length}</span>
                  </div>

                  {groupLocks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4">
                      {groupLocks.map((lock) => (
                        <div
                          key={lock.groupId}
                          className="p-3 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-xs font-extrabold text-slate-900 break-words">
                                {lock.groupName}
                              </h4>
                              <p className="text-[11px] text-rose-700 font-semibold mt-0.5 break-words">
                                {lock.reason}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-mono font-bold shrink-0">
                              <Clock size={11} /> {lock.remainingText}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200/70">
                            <span className="text-[10px] text-slate-500">
                              {isBn ? 'লক শেষ:' : 'Ends:'} {new Date(lock.lockedUntil).toLocaleTimeString()}
                            </span>
                            <button
                              type="button"
                              className="btn primary"
                              onClick={() => handleUnlockGroup(lock.groupId)}
                            >
                              <CheckCircle2 size={12} /> {isBn ? 'এখনই আনলক করুন' : 'Unlock Group'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 mb-4">
                      {isBn ? 'বর্তমানে কোনো সম্পূর্ণ গ্রুপ ১০ মিনিটের লকে নেই।' : 'No groups are currently locked.'}
                    </div>
                  )}
                </div>

                {/* Part 2: Active 10-Minute Restricted Members (Mobile Card Grid instead of cramped table) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <UserX size={13} className="text-amber-600" />
                      {isBn ? 'সক্রিয় ১০ মিনিট সদস্য ব্লক (Restricted Members)' : 'Active 10-Min Member Restrictions'}
                    </span>
                    <span className="badge badge-red">{restrictedUsers.length}</span>
                  </div>

                  {restrictedUsers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {restrictedUsers.map((user) => (
                        <div
                          key={`${user.groupId}:${user.senderJid}`}
                          className="p-3 rounded-xl border border-amber-300 bg-amber-50/60 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-extrabold text-slate-900 break-all">
                                  @{user.senderPhone}
                                </span>
                                <span className="badge badge-red">10-Min Block</span>
                              </div>
                              <p className="text-[11px] font-bold text-slate-700 mt-1 break-words">
                                {isBn ? 'গ্রুপ:' : 'Group:'} {user.groupName || 'Protected Group'}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-mono font-bold border border-amber-300 shrink-0">
                              <Clock size={11} />
                              {user.remainingText || `${Math.ceil((user.expiresAt - Date.now()) / 1000)}s`}
                            </span>
                          </div>

                          <p className="text-[11px] text-rose-700 font-semibold break-words">
                            {isBn ? 'কারণ:' : 'Reason:'} {user.reason || 'Sticker Spam'}
                          </p>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/80 flex-wrap">
                            <span className="text-[10px] text-slate-600">
                              {isBn ? 'শুরু:' : 'Start:'} {new Date(user.restrictedAt).toLocaleTimeString()} • {isBn ? 'বার:' : 'Count:'} {user.violationCount || 1}
                            </span>
                            <button
                              type="button"
                              className="btn primary"
                              onClick={() => handleManualUnmute(user.groupId, user.senderJid)}
                            >
                              <CheckCircle2 size={12} /> {isBn ? 'ব্লক তুলুন (Unrestrict)' : 'Unrestrict'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      {isBn ? 'এই মুহূর্তে কোনো সদস্য ১০ মিনিটের ব্লকে নেই।' : 'No members currently restricted.'}
                    </div>
                  )}
                </div>

                {/* Part 3: Recent 10-Minute Block History (so info stays visible even after 10 mins expire!) */}
                {(() => {
                  const blockHistory = activityLogs
                    .filter((l) => l.action === 'restricted' || l.action === 'locked' || l.action === 'unmuted' || l.action === 'unlocked')
                    .slice(0, 8);
                  if (blockHistory.length === 0) return null;
                  return (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold text-slate-700">
                          {isBn ? 'সাম্প্রতিক ১০ মিনিট ব্লকের ইতিহাস' : 'Recent 10-Min Block History'}
                        </span>
                        <button
                          type="button"
                          className="text-[11px] font-bold text-emerald-700 cursor-pointer"
                          onClick={() => jumpToSecuritySection('logs', 'blocks')}
                        >
                          {isBn ? 'সব দেখুন →' : 'View All →'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {blockHistory.map((item) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`badge ${item.action === 'unmuted' || item.action === 'unlocked' ? 'badge-green' : 'badge-red'}`}>
                                  {item.action === 'restricted'
                                    ? isBn ? '১০ মি. ব্লক' : '10M BLOCK'
                                    : item.action === 'locked'
                                    ? isBn ? 'গ্রুপ লক' : 'GROUP LOCK'
                                    : isBn ? 'আনব্লক/আনলক' : 'UNLOCKED'}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-800">
                                  @{item.senderPhone || item.senderJid}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500">
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-700 break-words">
                              {item.groupName || 'Protected Group'} — {item.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* MESSAGE MODERATION */}
              <div className="category-system-header mt-5 mb-2 px-0.5">
                 <h2>{isBn ? 'মেসেজ ও রিপ্লাই মডারেশন' : 'Message & Reply Moderation'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3>{t.sec3Title}</h3>
                      {renderInfoBtn('antiBadword')}
                    </div>
                    <p>{t.sec3Sub}</p>
                  </div>
                  <div className="symbol sr">
                    <Ban size={15} />
                  </div>
                </div>

                {/* Anti-Badword */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiBadwordTitle}</span>
                      {renderInfoBtn('antiBadword')}
                    </h4>
                    <p>{t.antiBadwordDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiBadword}
                      onChange={(e) => updateSettingToggle('antiBadword', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Anti-Link */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.antiLinkTitle}</span>
                      {renderInfoBtn('antiLink')}
                    </h4>
                    <p>{t.antiLinkDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.antiLink}
                      onChange={(e) => updateSettingToggle('antiLink', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Carrom Pool Link Allowlist */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'Carrom Pool লিংক অনুমোদিত (carrom.co)' : 'Allow Carrom Pool Links (carrom.co)'}</h4>
                    <p>
                      {isBn
                        ? 'শুধু Carrom Pool রুম ইনভাইট লিংক নিরাপদ থাকবে — বাকি সব লিংক ডিলিট ও ওয়ার্নিং হবে।'
                        : 'Keeps official Carrom Pool invite links safe while deleting other URLs.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.allowCarromLinks !== false}
                      onChange={(e) => updateSettingToggle('allowCarromLinks', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* AI Badword Detection */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.aiBadwordTitle}</span>
                      {renderInfoBtn('antiBadword')}
                    </h4>
                    <p>{t.aiBadwordDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.aiBadwordDetection}
                      onChange={(e) => updateSettingToggle('aiBadwordDetection', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Offline AI Voice Anti-Abuse */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{isBn ? 'অফলাইন ভয়েস গালি গার্ড (Voice AI)' : 'Voice Anti-Abuse Filter'}</span>
                      {renderInfoBtn('voiceModerationEnabled')}
                    </h4>
                    <p>
                      {isBn
                        ? 'ভয়েস মেসেজ শুনে বাংলা/ইংরেজি গালি থাকলে অটো ডিলিট করবে — ভালো ভয়েস অক্ষত রাখবে।'
                        : 'Detects & deletes abusive group voice messages while keeping clean speech safe.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateToPage('voicemod')}
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-[#087f55] hover:underline cursor-pointer"
                    >
                      <span>{isBn ? 'ভয়েস সেটিংস ও টেস্টার খুলুন' : 'Open Voice Settings & Tester'}</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.voiceModerationEnabled !== false}
                      onChange={(e) => updateSettingToggle('voiceModerationEnabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Master All Notices ON/OFF (Single Button) */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>
                        {isBn
                          ? 'সব নোটিশ সিস্টেম (এক বাটনে ON / OFF)'
                          : 'All Notices System (One-Button ON / OFF)'}
                      </span>
                    </h4>
                    <p>
                      {isBn
                        ? 'অফ থাকলে সব নোটিশ বন্ধ থাকবে — শুধু নীরবে রিমুভ হবে এবং নাম হাইড থাকবে। অন করলে সব নোটিশ একসাথে চালু হবে।'
                        : 'OFF silences all notices (silent remove + hidden name); ON enables all group notices together.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={!areAllNoticesOff}
                      onChange={(e) => handleToggleAllNoticesOneButton(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Delete Warning Notices (OFF = Silent Delete, ON = Send Warning) */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.silentModTitle}</span>
                      {renderInfoBtn('warningManagement')}
                    </h4>
                    <p>{t.silentModDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={!settings.silentModeration}
                      onChange={(e) => updateSettingToggle('silentModeration', !e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Hide Bot & Sender Name on Delete */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>
                        {isBn
                          ? 'মেসেজ রিমুভে বট ও মেম্বারের নাম লুকান (Hide Name)'
                          : 'Hide Bot & Member Name on Remove'}
                      </span>
                    </h4>
                    <p>
                      {isBn
                        ? 'চালু থাকলে বটের WhatsApp প্রোফাইল নাম অদৃশ্য (Blank) হবে এবং কোনো নোটিশে বট বা মেম্বারের নাম/@মেনশন দেখাবে না।'
                        : 'Sets bot PushName to invisible blank and hides bot/member names from any group notices.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.hideNameOnDelete)}
                      onChange={(e) => updateSettingToggle('hideNameOnDelete', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Bot Mention / Name Calling Reply */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span>{t.botReplyTitle}</span>
                      {renderInfoBtn('botReply')}
                    </h4>
                    <p>{t.botReplyDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.botReply}
                      onChange={(e) => updateSettingToggle('botReply', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Auto Salam Reply (Zero API) */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'অটো সালাম উত্তর (API ছাড়া)' : 'Auto Salam Reply (Zero API)'}</h4>
                    <p>
                      {isBn
                        ? 'গ্রুপে কেউ সালাম দিলে স্বয়ংক্রিয়ভাবে ভদ্র সালামের উত্তর দেবে।'
                        : 'Automatically replies to Salam in groups with zero AI API key.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.autoSalamReplyEnabled !== false}
                      onChange={(e) => updateSettingToggle('autoSalamReplyEnabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Bot Typing Indicator */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'বট টাইপিং ইন্ডিকেটর (Typing...)' : 'Bot Typing Indicator'}</h4>
                    <p>
                      {isBn
                        ? 'উত্তর বা সতর্কবার্তা পাঠানোর আগে WhatsApp-এ "typing..." দেখাবে।'
                        : 'Displays live WhatsApp typing indicator before sending replies.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.botTypingEnabled !== false}
                      onChange={(e) => updateSettingToggle('botTypingEnabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Admin Mention Auto-Reply (Zero API) */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>{isBn ? 'অ্যাডমিন মেনশন অটো রিপ্লাই' : 'Admin Mention Auto-Reply'}</h4>
                    <p>
                      {isBn
                        ? 'কেউ অ্যাডমিনকে @মেনশন করলে বট স্বয়ংক্রিয়ভাবে ভদ্র উত্তর দেবে।'
                        : 'Responds automatically when someone @mentions an admin.'}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.adminMentionReplyEnabled !== false}
                      onChange={(e) => updateSettingToggle('adminMentionReplyEnabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {settings.adminMentionReplyEnabled !== false && (
                  <div className="subpanel-soft space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-[#0f291e]">
                        {isBn ? 'অ্যাডমিন মেনশন রিপ্লাই কাস্টমাইজ করুন' : 'Customize Admin Mention Reply'}
                      </span>
                      <button type="button" className="btn primary" onClick={handleSaveAdminMentionConfig}>
                        <Save size={11} /> {isBn ? 'সেভ' : 'Save'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9.5px] font-bold text-[#526359] mb-1">
                          {isBn ? 'কাকে মেনশন করলে' : 'Trigger Target'}
                        </label>
                        <select
                          value={settings.adminMentionReplyTarget === 'boss_only' ? 'boss_only' : 'all_admins'}
                          onChange={(e) => {
                            const nextTarget = e.target.value === 'boss_only' ? 'boss_only' : 'all_admins';
                            updateSettingToggle('adminMentionReplyTarget', nextTarget as any);
                          }}
                          className="field !bg-white"
                        >
                          <option value="all_admins">{isBn ? 'যেকোনো গ্রুপ অ্যাডমিন' : 'Any Group Admin'}</option>
                          <option value="boss_only">{isBn ? 'শুধু বস অ্যাডমিন' : 'Boss Admin Only'}</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[9.5px] font-bold text-[#526359] mb-1">
                          {isBn
                            ? 'রিপ্লাই মেসেজ ({{admin}} ও {{user}} ব্যবহার করা যাবে)'
                            : 'Auto-Reply Message ({{admin}}, {{user}})'}
                        </label>
                        <textarea
                          rows={2}
                          value={
                            settings.adminMentionReplyMessage ??
                            '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।'
                          }
                          onChange={(e) =>
                            setSettings((prev) => ({ ...prev, adminMentionReplyMessage: e.target.value }))
                          }
                          className="w-full px-2.5 py-1.5 border border-emerald-950/[0.1] rounded-[9px] text-[11px] bg-white outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Badword List Editor */}
                <div className="subpanel-soft">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <label className="text-[11px] font-bold text-[#0f291e] mb-0">{t.customBadwordsLabel}</label>
                    {renderInfoBtn('customBadwords')}
                  </div>
                  <p className="hint mb-2">{t.customBadwordsHint}</p>
                  <textarea
                    className="w-full px-2.5 py-1.5 border border-emerald-950/[0.1] rounded-[9px] text-[11px] bg-white outline-none focus:border-emerald-500"
                    rows={2}
                    value={customBadwordsText}
                    onChange={(e) => setCustomBadwordsText(e.target.value)}
                    placeholder="badword1, badword2, ..."
                  />
                  <div className="form-actions mt-2">
                    <button className="btn primary" onClick={saveCustomBadwords}>
                      <Save size={12} /> {t.saveBadwordsBtn}
                    </button>
                  </div>
                </div>

                {/* Boss Admin Fight Alert & Zero-API Server Health Notice */}
                <div className="subpanel-soft space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-[11.5px] font-extrabold text-[#0f291e] flex items-center gap-1.5 flex-wrap">
                        <span>{isBn ? 'বস অ্যাডমিন ইনবক্স অ্যালার্ট ও সার্ভার নোটিশ' : 'Boss Inbox Fight Alert & Server Notice'}</span>
                      </h4>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {isBn
                          ? 'গ্রুপে ৩+ জন গালি/ঝগড়া করলে বা সার্ভারে কোনো সমস্যা হলে শুধু নিচের এক অ্যাডমিন ইনবক্সে (বস) অটো নক দেবে।'
                          : 'Alerts single Boss Admin inbox on multi-member fights or server problems without AI API.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="btn outline" onClick={handleTestBossAlert}>
                        <Send size={11} /> {isBn ? 'বস টেস্ট' : 'Test Boss'}
                      </button>
                      <button type="button" className="btn primary" onClick={handleSaveBossAndNoticeConfig}>
                        <Save size={11} /> {isBn ? 'সেভ করুন' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'প্রধান বস অ্যাডমিন নম্বর' : 'Primary Boss Admin Number'}
                      </label>
                      <input
                        type="text"
                        value={settings.bossAdminNumber ?? '8801632222592'}
                        onChange={(e) => setSettings((prev) => ({ ...prev, bossAdminNumber: e.target.value }))}
                        placeholder="8801632222592"
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? '২য় সার্ভার অ্যাডমিন (মেনশন + রিমুভ)' : '2nd Server Admin (Mention + Remove)'}
                      </label>
                      <input
                        type="text"
                        value={settings.secondAdminNumber ?? '8801346561627'}
                        onChange={(e) => setSettings((prev) => ({ ...prev, secondAdminNumber: e.target.value }))}
                        placeholder="8801346561627"
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9.5px] font-bold text-slate-500 mb-1">
                        {isBn ? 'সার্ভার সমস্যা হলে কোথায় নোটিশ যাবে' : 'Server Problem Notice Target'}
                      </label>
                      <select
                        value={settings.serverErrorNoticeTarget || 'boss_inbox'}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            serverErrorNoticeTarget: e.target.value as 'boss_inbox' | 'groups' | 'both',
                          }))
                        }
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold bg-white"
                      >
                        <option value="boss_inbox">{isBn ? 'শুধু বস অ্যাডমিনের ইনবক্সে' : 'Boss Inbox Only'}</option>
                        <option value="groups">{isBn ? 'সক্রিয় গ্রুপগুলোতে' : 'Active Groups'}</option>
                        <option value="both">{isBn ? 'বস ইনবক্স + গ্রুপ উভয় জায়গায়' : 'Both Boss & Groups'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-700">{isBn ? 'ঝগড়া অ্যালার্ট' : 'Fight Alert'}</span>
                      <input
                        type="checkbox"
                        checked={settings.bossFightAlertEnabled !== false}
                        onChange={(e) => setSettings((prev) => ({ ...prev, bossFightAlertEnabled: e.target.checked }))}
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-700">{isBn ? 'সার্ভার নোটিশ' : 'Server Notice'}</span>
                      <input
                        type="checkbox"
                        checked={settings.serverErrorNoticeEnabled !== false}
                        onChange={(e) => setSettings((prev) => ({ ...prev, serverErrorNoticeEnabled: e.target.checked }))}
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                        {isBn ? 'কতজন গালি/ঝগড়া করলে' : 'Min Offenders'}
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={settings.bossFightMinPeople ?? 3}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, bossFightMinPeople: Number(e.target.value || 3) }))
                        }
                        className="w-full px-1.5 py-0.5 border border-slate-300 rounded text-xs font-bold"
                      />
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                        {isBn ? 'সময় উইন্ডো (মিনিট)' : 'Window (min)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.bossFightWindowMinutes ?? 5}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, bossFightWindowMinutes: Number(e.target.value || 5) }))
                        }
                        className="w-full px-1.5 py-0.5 border border-slate-300 rounded text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* LOGS & STATUS */}
              <div ref={logsCardRef} className="category-system-header mt-7 mb-3 px-1">
                 <h2 className="text-sm sm:text-base font-extrabold text-[#0f291e] tracking-tight">{isBn ? 'লগ ও অ্যাক্টিভিটি' : 'Logs & Activity'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-extrabold text-[13px]">{t.activityTitle}</h3>
                      {renderInfoBtn('activityLogs')}
                    </div>
                    <p>{t.activitySub}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn outline" onClick={loadModerationData}>
                      <RefreshCw size={13} /> {t.refreshRules}
                    </button>
                    <button className="btn danger" onClick={clearLogs}>
                      <Trash2 size={13} /> {t.clearLogsBtn}
                    </button>
                  </div>
                </div>

                {/* Separate Filter Button Cards for Mobile */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { id: 'all', label: isBn ? `সবগুলো (${activityLogs.length})` : `All (${activityLogs.length})` },
                    {
                      id: 'warned',
                      label: isBn
                        ? `⚠️ ওয়ার্নিং (${activityLogs.filter((l) => l.action === 'warned').length})`
                        : `Warnings (${activityLogs.filter((l) => l.action === 'warned').length})`,
                    },
                    {
                      id: 'blocks',
                      label: isBn
                        ? `🔒 ১০ মি. ব্লক (${activityLogs.filter((l) => l.action === 'restricted' || l.action === 'locked' || l.action === 'unmuted' || l.action === 'unlocked').length})`
                        : `10M Blocks (${activityLogs.filter((l) => l.action === 'restricted' || l.action === 'locked' || l.action === 'unmuted' || l.action === 'unlocked').length})`,
                    },
                    {
                      id: 'deleted',
                      label: isBn
                        ? `🗑️ ডিলিট ও কিক (${activityLogs.filter((l) => l.action === 'deleted' || l.action === 'kicked').length})`
                        : `Deletes/Kicks (${activityLogs.filter((l) => l.action === 'deleted' || l.action === 'kicked').length})`,
                    },
                    {
                      id: 'error',
                      label: isBn
                        ? `❌ এরর (${activityLogs.filter((l) => l.action === 'error').length})`
                        : `Errors (${activityLogs.filter((l) => l.action === 'error').length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLogFilter(tab.id as any)}
                      className={`btn ${logFilter === tab.id ? 'primary' : 'outline'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Mobile-First Card List (No horizontal cutoff on narrow screens) */}
                {(() => {
                  const filteredLogs = activityLogs.filter((log) => {
                    if (logFilter === 'all') return true;
                    if (logFilter === 'warned') return log.action === 'warned';
                    if (logFilter === 'blocks') {
                      return (
                        log.action === 'restricted' ||
                        log.action === 'locked' ||
                        log.action === 'unmuted' ||
                        log.action === 'unlocked'
                      );
                    }
                    if (logFilter === 'deleted') return log.action === 'deleted' || log.action === 'kicked';
                    if (logFilter === 'error') return log.action === 'error';
                    return true;
                  });

                  if (filteredLogs.length === 0) {
                    return (
                      <div className="empty py-6">
                        {t.noLogsMsg}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2.5">
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`badge ${
                                  log.action === 'kicked' || log.action === 'restricted' || log.action === 'error'
                                    ? 'badge-red'
                                    : log.action === 'locked' || log.action === 'warned'
                                    ? 'badge-amber'
                                    : log.action === 'replied'
                                    ? 'badge-blue'
                                    : 'badge-green'
                                }`}
                              >
                                {log.action.toUpperCase()}
                              </span>
                              {typeof log.warningCount === 'number' && log.warningCount > 0 && (
                                <span className="badge badge-amber">
                                  {isBn ? `সতর্কতা ${log.warningCount}/3` : `${log.warningCount}/3`}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                            <span className="font-bold text-slate-900 break-words">
                              {log.groupName || log.groupId}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-emerald-700 break-all">
                              {log.senderPhone ? `@${log.senderPhone}` : log.senderJid}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-800 font-semibold break-words">
                            {log.reason}
                          </div>
                          {log.details && (
                            <p className="text-[10px] text-slate-500 leading-relaxed break-words">
                              {log.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

          {/* MAYA AI PAGE */}
          {activePage === 'maya' && (
            <section className="page active" id="maya">
              <div className="page-head">
                <div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="sub-back-btn mb-2 cursor-pointer"
                  >
                    <ArrowLeft size={12} className="text-[#087f55]" /> {isBn ? 'হোম পেজ' : 'Home'}
                  </button>
                  <h1>{t.mayaTitle}</h1>
                  <p>{t.mayaSub}</p>
                </div>
                <button className="btn outline" onClick={loadModerationData}>
                  <RefreshCw size={12} />
                  <span className="btn-text">{t.refreshRules}</span>
                </button>
              </div>

              {/* MAYA AI COMPANION */}
              <div className="category-system-header mt-4 mb-2 px-0.5">
                 <h2>{isBn ? 'মায়া এআই সেটিংস' : 'Maya AI Core & Companion'}</h2>
              </div>

              <div className="grid2">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>{t.mayaCoreTitle}</h3>
                      <p>{t.mayaCoreSub}</p>
                    </div>
                    <div className="symbol sp">
                      <Heart size={15} />
                    </div>
                  </div>

                  {/* Master AI Engine Switch */}
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.mayaEngineTitle}</span>
                        {renderInfoBtn('mayaEngine')}
                      </h4>
                      <p>{t.mayaEngineDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaAiEnabled}
                        onChange={(e) => updateSettingToggle('mayaAiEnabled', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {/* Private Inbox AI Toggle */}
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.privateInboxAiTitle}</span>
                        {renderInfoBtn('mayaPrivateReply')}
                      </h4>
                      <p>{t.privateInboxAiDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaPrivateReply}
                        onChange={(e) => updateSettingToggle('mayaPrivateReply', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {/* Group AI Toggle */}
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.groupAiTitle}</span>
                        {renderInfoBtn('mayaGroupReply')}
                      </h4>
                      <p>{t.groupAiDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaGroupReply}
                        onChange={(e) => updateSettingToggle('mayaGroupReply', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.romanticTitle}</span>
                        {renderInfoBtn('mayaRomantic')}
                      </h4>
                      <p>{t.romanticDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaRomantic}
                        onChange={(e) => updateSettingToggle('mayaRomantic', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.funnyTitle}</span>
                        {renderInfoBtn('mayaFunny')}
                      </h4>
                      <p>{t.funnyDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaFunny}
                        onChange={(e) => updateSettingToggle('mayaFunny', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span>{t.autoPartTitle}</span>
                        {renderInfoBtn('mayaAutoParticipate')}
                      </h4>
                      <p>{t.autoPartDesc}</p>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.mayaAutoParticipate}
                        onChange={(e) => updateSettingToggle('mayaAutoParticipate', e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="policy-box">
                    <h4>{isBn ? 'মায়া AI স্মার্ট আচরণ' : 'Maya AI Smart Policy'}</h4>
                    <div>
                      {isBn
                        ? 'গ্রুপে শুধুমাত্র @মেনশন, রিপ্লাই বা মায়া নামে ডাকলে তবেই উত্তর দেবে — ইনবক্সে সবসময় মিষ্টি ও বুদ্ধিমতী ভাষায় চ্যাট করবে।'
                        : 'Responds cleanly when tagged in groups and stays attentive in private DMs.'}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Timing & Intelligence Settings</h3>
                      <p>Control frequency & conversation memory</p>
                    </div>
                    <div className="symbol so">
                      <CalendarClock size={16} />
                    </div>
                  </div>

                  {/* AI Provider Selector */}
                  <div className="form-group">
                    <label>{t.aiProviderLabel}</label>
                    <select
                      className="field font-medium"
                      value={settings.aiProvider || 'auto'}
                      onChange={(e) => updateSettingToggle('aiProvider', e.target.value)}
                    >
                      <option value="auto">Auto (Gemini &rarr; Groq &rarr; OpenRouter Fallback)</option>
                      <option value="gemini">Google Gemini AI (Official Primary)</option>
                      <option value="groq">Groq Cloud AI (High-Speed Llama 3.3)</option>
                      <option value="openrouter">OpenRouter AI (Multi-Model Gateway)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Reply Frequency ({settings.mayaReplyFrequency}%)</label>
                    <input
                      type="range"
                      className="w-full"
                      min="1"
                      max="100"
                      value={settings.mayaReplyFrequency}
                      onChange={(e) => updateSettingToggle('mayaReplyFrequency', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Memory Limit ({settings.mayaMemoryLimit} msgs)</label>
                    <input
                      type="range"
                      className="w-full"
                      min="5"
                      max="50"
                      step="5"
                      value={settings.mayaMemoryLimit}
                      onChange={(e) => updateSettingToggle('mayaMemoryLimit', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Language</label>
                    <select
                      className="field"
                      value={settings.mayaLanguage}
                      onChange={(e) => updateSettingToggle('mayaLanguage', e.target.value)}
                    >
                      <option value="auto">Automatic (Smart Detection)</option>
                      <option value="bn">Bengali Only (বাংলা)</option>
                      <option value="en">English Only</option>
                      <option value="banglish">Banglish (Roman Bengali)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Test Maya AI Card */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t.testMayaTitle}</h3>
                    <p>{t.testMayaSub}</p>
                  </div>
                  <div className="symbol sp">
                    <MessageSquareHeart size={16} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="field"
                    id="mayaTestInput"
                    placeholder={t.testMayaPlaceholder}
                    onKeyDown={(e) => e.key === 'Enter' && testAI()}
                  />
                  <button className="btn primary" onClick={testAI}>
                    {t.sendBtn}
                  </button>
                </div>
                <div className="hint mt-2.5 p-3 rounded-xl bg-[#f4f8f5] border border-emerald-950/[0.08]">
                  {isBn ? 'মেসেজ পাঠিয়ে মায়ার রোমান্টিক উত্তর দেখুন।' : 'Send a message to see Maya\'s reply.'}
                </div>
              </div>
            </section>
          )}

          {/* PAIRING / CONNECT PAGE */}
          {activePage === 'pairing' && (
            <section className="page active" id="pairing">
              <div className="page-head">
                <div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="sub-back-btn mb-2 cursor-pointer"
                  >
                    <ArrowLeft size={12} className="text-[#087f55]" /> {isBn ? 'হোম পেজ' : 'Home'}
                  </button>
                  <h1>{t.connectTitle}</h1>
                  <p>{t.connectSub}</p>
                </div>
                <button
                  type="button"
                  onClick={checkStatus}
                  className="btn outline"
                >
                  <RefreshCw size={12} />
                  <span className="btn-text">{t.refresh}</span>
                </button>
              </div>

              {liveStatus.online ? (
                <>
                  {/* Unified Emerald Hero Banner (Matching Home Server Hero) */}
                  <div className="hero flex items-center justify-between gap-3 sm:gap-5">
                    <div className="hero-content flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-extrabold tracking-[0.08em] uppercase text-emerald-100">
                        <span className="w-2 h-2 rounded-full bg-[#86efac] shrink-0" />
                        <span>{isBn ? 'লাইভ সকেট · Real Baileys Engine' : 'Live Socket · Real Baileys Engine'}</span>
                      </div>
                      <h3 className="text-white text-[16px] sm:text-[18px] mt-1.5">
                        {isBn ? 'WhatsApp একাউন্ট সফলভাবে যুক্ত' : 'WhatsApp Linked Successfully'}
                      </h3>
                      <p className="text-emerald-50/90 mt-0.5">
                        {isBn
                          ? 'Real Baileys Sockets মডারেশন ও সুরক্ষা ইঞ্জিন সক্রিয় আছে।'
                          : 'Real Baileys Socket moderation & protection engine is active.'}
                      </p>
                      <div className="hero-status">
                        <span className="dot" style={{ background: '#4ade80' }} />
                        <span className="truncate font-mono tabular-nums">
                          {(liveStatus.user?.name || 'Maya Ai').trim()} · {liveStatus.phoneNumber || liveStatus.user?.id?.split(':')[0] || 'Connected'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center shrink-0 relative z-10 pointer-events-none select-none" aria-hidden="true">
                      <WAGuardLogo
                        variant="bot"
                        className="w-[64px] h-[64px] sm:w-[80px] sm:h-[80px] drop-shadow-[0_6px_14px_rgba(6,78,52,0.28)]"
                      />
                      <span className="mt-1 text-[8px] font-extrabold tracking-[0.16em] text-white/90 uppercase">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  {/* Single-Elevation 3-Card Telemetry Strip (Matching Home .stats) */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mb-2.5">
                    <div className="stat">
                      <div className="symbol sg">
                        <Wifi size={15} />
                      </div>
                      <h2 className="text-[15px] sm:text-[18px] text-[#087f55]">Online</h2>
                      <small>{isBn ? 'সার্ভার স্টেট' : 'Server State'}</small>
                      <p className="hidden sm:block">Real Baileys Socket</p>
                    </div>
                    <div className="stat">
                      <div className="symbol sb">
                        <ShieldCheck size={15} />
                      </div>
                      <h2 className="text-[15px] sm:text-[18px]">24/7</h2>
                      <small>{isBn ? 'অটো মডারেশন' : 'Auto Moderation'}</small>
                      <p className="hidden sm:block">{isBn ? 'সক্রিয় প্রহরী' : 'Active Guard'}</p>
                    </div>
                    <div className="stat">
                      <div className="symbol sp">
                        <Sparkles size={15} />
                      </div>
                      <h2 className="text-[15px] sm:text-[18px] text-[#087f55]">Ready</h2>
                      <small>{isBn ? 'মায়া AI' : 'Maya AI'}</small>
                      <p className="hidden sm:block">{isBn ? 'স্মার্ট রিপ্লাই প্রস্তুত' : 'Smart Reply Ready'}</p>
                    </div>
                  </div>

                  {/* Connected Account Profile & Tactile Controls Card */}
                  <div className="card">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <WAGuardLogo
                          variant="device"
                          className="w-12 h-12 shrink-0 rounded-[13px] shadow-[0_6px_16px_rgba(8,127,85,0.18)]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#64748b]">
                            <span>{isBn ? 'সংযুক্ত হোয়াটসঅ্যাপ একাউন্ট' : 'Connected WhatsApp Account'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#087f55] inline-flex items-center gap-1">
                              <CheckCircle2 size={11} className="shrink-0" />
                              {isBn ? 'Verified Socket' : 'Verified Socket'}
                            </span>
                          </div>
                          <h3 className="text-[15px] sm:text-base font-extrabold text-[#0f291e] truncate mt-0.5 tracking-tight">
                            {liveStatus.user?.name || 'Maya Ai'}
                          </h3>
                          <p className="text-xs font-mono font-bold text-[#087f55] tabular-nums break-all mt-0.5">
                            {liveStatus.phoneNumber || liveStatus.user?.id?.split(':')[0] || '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-emerald-950/[0.06] grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => navigateToPage('home')}
                        className="min-h-[44px] px-4 py-2.5 rounded-[12px] bg-gradient-to-r from-[#098a5c] to-[#07734c] hover:from-[#077850] hover:to-[#066341] text-white text-xs font-extrabold shadow-[0_4px_14px_rgba(8,127,85,0.22)] flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 active:scale-[0.985] cursor-pointer"
                      >
                        <LayoutDashboard size={15} className="shrink-0" />
                        <span>{isBn ? 'ড্যাশবোর্ডে যান' : 'Go to Dashboard'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => sessionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className="min-h-[44px] px-4 py-2.5 rounded-[12px] bg-[#e8f8f0] hover:bg-[#daf3e6] text-[#065f3e] border border-emerald-700/15 text-xs font-extrabold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 active:scale-[0.985] cursor-pointer"
                      >
                        <Download size={15} className="shrink-0" />
                        <span>{isBn ? 'সেশন ব্যাকআপ' : 'Backup Session'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={checkStatus}
                        className="min-h-[44px] px-4 py-2.5 rounded-[12px] bg-white hover:bg-[#f6fbf8] text-[#0f291e] border border-emerald-950/12 hover:border-emerald-600/35 shadow-[0_1px_3px_rgba(10,56,36,0.03)] text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 active:scale-[0.985] cursor-pointer"
                      >
                        <RefreshCw size={15} className="shrink-0 text-[#087f55]" />
                        <span>{isBn ? 'স্ট্যাটাস রিফ্রেশ' : 'Sync Status'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="min-h-[44px] px-4 py-2.5 rounded-[12px] bg-[#fff1f2] hover:bg-[#ffe4e6] text-[#be123c] border border-rose-600/18 text-xs font-extrabold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 active:scale-[0.985] cursor-pointer"
                      >
                        <LogOut size={15} className="shrink-0" />
                        <span>{isBn ? 'ডিসকানেক্ট করুন' : 'Disconnect'}</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card">
                  <div className="card-head">
                    <div className="flex items-center gap-3 min-w-0">
                      <WAGuardLogo
                        variant="device"
                        className="w-11 h-11 shrink-0 rounded-[12px] shadow-[0_4px_12px_rgba(8,127,85,0.16)]"
                      />
                      <div className="min-w-0">
                        <h3>{t.linkDeviceHead}</h3>
                        <p>{t.phoneInputHint}</p>
                      </div>
                    </div>
                    <div className="mode-switcher shrink-0">
                      <button
                        type="button"
                        className={`mode-btn ${pairingMode === 'code' ? 'active' : ''}`}
                        onClick={() => setPairingMode('code')}
                      >
                        <KeyRound size={13} /> {t.eightDigitCode}
                      </button>
                      <button
                        type="button"
                        className={`mode-btn ${pairingMode === 'qr' ? 'active' : ''}`}
                        onClick={() => setPairingMode('qr')}
                      >
                        <QrIcon size={13} /> {t.qrCodeLabel}
                      </button>
                    </div>
                  </div>

                  <div className="form-group text-left mt-3">
                    <label>{t.phoneInputLabel}</label>
                    <input
                      className="field font-mono tabular-nums min-h-[42px] text-xs sm:text-sm"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="8801XXXXXXXXX"
                      type="tel"
                    />
                  </div>

                  {pairingError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium leading-relaxed text-left my-2.5">
                      {pairingError}
                    </div>
                  )}

                  <button
                    type="button"
                    className={`min-h-[44px] w-full px-4 py-2.5 rounded-[12px] bg-gradient-to-r from-[#098a5c] to-[#07734c] hover:from-[#077850] hover:to-[#066341] disabled:opacity-60 text-white text-xs font-extrabold shadow-[0_4px_14px_rgba(8,127,85,0.22)] flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 active:scale-[0.985] cursor-pointer ${isPairingLoading ? 'opacity-80 pointer-events-none' : ''}`}
                    onClick={() => handleStartPairing(false)}
                    disabled={isPairingLoading}
                  >
                    {isPairingLoading ? (
                      <RefreshCw size={15} className="animate-spin shrink-0" />
                    ) : (
                      <KeyRound size={15} className="shrink-0" />
                    )}
                    <span>{t.genPairCodeBtn}</span>
                  </button>

                  {/* Clean Hairline Connection Status Strip */}
                  <div className="mt-4 pt-3.5 border-t border-emerald-950/[0.06] space-y-2 text-left">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#334155]">
                        {isBn ? 'কানেকশন স্ট্যাটাস' : 'Connection Status'}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 font-extrabold text-[11px] ${
                          liveStatus.status === 'pairing'
                            ? 'text-[#087f55]'
                            : liveStatus.status === 'connecting' || isPairingLoading
                            ? 'text-amber-700'
                            : 'text-[#64748b]'
                        }`}
                      >
                        {(isPairingLoading || liveStatus.status === 'connecting' || liveStatus.status === 'pairing') && (
                          <RefreshCw size={11} className="animate-spin shrink-0" />
                        )}
                        {isPairingLoading || liveStatus.status === 'connecting'
                          ? isBn ? 'সংযোগ হচ্ছে...' : 'Connecting...'
                          : liveStatus.status === 'pairing'
                          ? isBn ? 'পেয়ারিং সক্রিয়' : 'Pairing Active'
                          : isBn ? 'ডিসকানেক্টেড' : 'Disconnected'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#5f7368] leading-relaxed">
                      <span className="font-bold text-[#0f291e]">{isBn ? 'সর্বশেষ স্ট্যাটাস:' : 'Last Status:'}</span>{' '}
                      {liveStatus.lastConnectionStatus || liveStatus.stepMessage}
                    </p>
                    {liveStatus.latestDisconnect && !liveStatus.online && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900 space-y-1">
                        <div className="font-extrabold">
                          {isBn ? 'ডিসকানেক্টের কারণ: ' : 'Cause: '}
                          {isBn ? liveStatus.latestDisconnect.titleBn : liveStatus.latestDisconnect.titleEn}
                        </div>
                        <p className="opacity-90 leading-relaxed">
                          {isBn ? liveStatus.latestDisconnect.causeBn : liveStatus.latestDisconnect.causeEn}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Display generated code or QR */}
                  {(liveStatus.pairingCode || liveStatus.qrCode) && (
                    <div className="mt-4 pt-4 border-t border-emerald-950/[0.06] text-left">
                      <div className="flex justify-between items-center text-xs font-extrabold text-[#0f291e]">
                        <span>{isBn ? 'অফিশিয়াল পেয়ারিং কোড' : 'Official Pairing Code'}</span>
                        <span className="text-[#087f55] font-bold">Active</span>
                      </div>

                      {pairingMode === 'code' ? (
                        <div className="mt-2.5 p-4 rounded-2xl bg-[#f4faf6] border border-emerald-950/[0.08] text-center">
                          <h2 className="text-2xl sm:text-3xl font-mono font-extrabold tracking-[0.22em] text-[#087f55] tabular-nums my-2">
                            {liveStatus.pairingCode}
                          </h2>
                          <div className="grid grid-cols-2 gap-2.5 mt-3">
                            <button
                              type="button"
                              onClick={copyToClipboard}
                              className="min-h-[42px] px-3.5 py-2 rounded-[11px] bg-[#e8f8f0] hover:bg-[#daf3e6] text-[#065f3e] border border-emerald-700/15 text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <Copy size={14} /> {isCopied ? (isBn ? 'কপি হয়েছে!' : 'Copied!') : t.copyCodeBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartPairing(true)}
                              disabled={isPairingLoading}
                              className="min-h-[42px] px-3.5 py-2 rounded-[11px] bg-white hover:bg-[#f6fbf8] text-[#0f291e] border border-emerald-950/12 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                            >
                              <RefreshCw size={14} /> {t.getNewCodeBtn}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="my-3 text-center">
                          {liveStatus.qrCode ? (
                            <img
                              src={liveStatus.qrCode}
                              alt="WhatsApp QR Code"
                              className="w-48 h-48 mx-auto rounded-2xl border border-emerald-950/[0.08] p-2 bg-white shadow-sm"
                            />
                          ) : (
                            <p className="text-xs text-slate-500 py-4">QR Loading...</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Encrypted Full State Backup Card (Primary WhatsApp + 2nd Account + All ON/OFF Settings) */}
              <div ref={sessionCardRef} className="card mt-3">
                <div className="card-head">
                  <div>
                    <h3>{isBn ? 'সেশন ও সব সেটিংস ব্যাকআপ (Full Backup & Restore)' : 'Full Session & Settings Backup'}</h3>
                    <p>
                      {isBn
                        ? 'এখানে WhatsApp সেশন (প্রাইমারি + ২য় অ্যাকাউন্ট) এবং আপনার চালু/বন্ধ (ON/OFF) করা সব সেটিংস পাসওয়ার্ড দিয়ে ডাউনলোড বা কপি করে রাখতে পারবেন—সার্ভার আপডেট করলে এক ক্লিকেই রিস্টোর হবে।'
                        : 'Export both WhatsApp sessions and all your ON/OFF settings encrypted with your PIN, and restore cleanly after any redeploy.'}
                    </p>
                  </div>
                  <div className="symbol sg">
                    <Lock size={16} />
                  </div>
                </div>

                {storageInfo && (
                  <div
                    className={`mt-2.5 px-3.5 py-2.5 rounded-xl text-[11px] leading-relaxed border ${
                      storageInfo.persistentVolumeDetected
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {storageInfo.persistentVolumeDetected ? (
                      <span>
                        {isBn
                          ? `Persistent Volume সক্রিয় রয়েছে (${storageInfo.dataDir}) — নতুন কোড পুশ করলেও WhatsApp ও সেটিংস ডিসকানেক্ট/রিসেট হবে না।`
                          : `Persistent Volume active (${storageInfo.dataDir}) — sessions and settings persist across redeploys.`}
                      </span>
                    ) : (
                      <span>
                        {isBn
                          ? `স্থায়ী ডিস্ক ছাড়া অস্থায়ী কন্টেইনারে চলছে। Railway/Render-এ '/app/data' Volume মাউন্ট করলে (বা WAGUARD_DATA_DIR সেট করলে) কোড আপডেটে আর কখনোই ডিসকানেক্ট বা সেটিংস রিসেট হবে না; নতুবা আপডেটের আগে এখান থেকে ব্যাকআপ নিয়ে রাখুন।`
                          : `No Persistent Volume env detected (${storageInfo.dataDir}). Mount a persistent disk at /app/data or download a full backup before pushing updates.`}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3.5 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#334155] mb-1.5">
                      {isBn ? 'ব্যাকআপ পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)' : 'Backup Passphrase / PIN (min 4 chars)'}
                    </label>
                    <input
                      type="password"
                      value={sessionPassphrase}
                      onChange={(e) => setSessionPassphrase(e.target.value)}
                      placeholder={isBn ? 'যেমন: 1234 বা গোপন পাসওয়ার্ড' : 'e.g. secret123'}
                      className="field min-h-[40px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      className="min-h-[42px] px-4 py-2 rounded-[11px] bg-gradient-to-r from-[#098a5c] to-[#07734c] hover:from-[#077850] hover:to-[#066341] disabled:opacity-60 text-white text-xs font-extrabold shadow-[0_3px_10px_rgba(8,127,85,0.18)] flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer"
                      onClick={() => handleExportSession(false)}
                      disabled={isTransferringSession}
                    >
                      <Download size={14} className="shrink-0" />
                      <span>{isBn ? 'ব্যাকআপ ফাইল ডাউনলোড' : 'Download Session Backup'}</span>
                    </button>

                    <button
                      type="button"
                      className="min-h-[42px] px-4 py-2 rounded-[11px] bg-[#e8f8f0] hover:bg-[#daf3e6] disabled:opacity-60 text-[#065f3e] border border-emerald-700/15 text-xs font-extrabold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer"
                      onClick={() => handleExportSession(true)}
                      disabled={isTransferringSession}
                    >
                      <Copy size={14} className="shrink-0" />
                      <span>{isBn ? 'ব্যাকআপ কোড কপি' : 'Copy Backup Text'}</span>
                    </button>

                    <button
                      type="button"
                      className="min-h-[42px] px-4 py-2 rounded-[11px] bg-white hover:bg-[#f6fbf8] disabled:opacity-60 text-[#0f291e] border border-emerald-950/12 hover:border-emerald-600/35 text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer"
                      onClick={() => sessionFileInputRef.current?.click()}
                      disabled={isTransferringSession}
                    >
                      <Upload size={14} className="shrink-0 text-[#087f55]" />
                      <span>{isBn ? 'ফাইল থেকে রিস্টোর' : 'Restore Session File'}</span>
                    </button>

                    <button
                      type="button"
                      className="min-h-[42px] px-4 py-2 rounded-[11px] bg-white hover:bg-[#f6fbf8] disabled:opacity-60 text-[#0f291e] border border-emerald-950/12 hover:border-emerald-600/35 text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer"
                      onClick={() => setShowSessionPasteBox((prev) => !prev)}
                      disabled={isTransferringSession}
                    >
                      <FileText size={14} className="shrink-0 text-[#087f55]" />
                      <span>{isBn ? 'পেস্ট করে রিস্টোর' : 'Restore by Paste'}</span>
                    </button>

                    <input
                      ref={sessionFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => handleImportSession(e.target.files?.[0])}
                    />
                  </div>

                  {showSessionPasteBox && (
                    <div className="mt-2 p-3.5 rounded-2xl bg-[#f4f8f5] border border-emerald-950/[0.08] space-y-2.5">
                      <label className="block text-[11px] font-bold text-[#0f291e]">
                        {isBn ? 'কপি করা ব্যাকআপ JSON এখানে পেস্ট করুন:' : 'Paste Encrypted Backup JSON:'}
                      </label>
                      <textarea
                        rows={4}
                        value={sessionPasteText}
                        onChange={(e) => setSessionPasteText(e.target.value)}
                        placeholder='{"version":1,"alg":"aes-256-gcm",...}'
                        className="w-full p-2.5 rounded-xl border border-emerald-950/[0.1] text-[11px] font-mono outline-none focus:border-emerald-500 bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="min-h-[38px] px-4 py-2 rounded-[10px] bg-gradient-to-r from-[#098a5c] to-[#07734c] text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                          onClick={() => restoreSessionFromJsonText(sessionPasteText)}
                          disabled={isTransferringSession || !sessionPasteText.trim()}
                        >
                          <Check size={13} /> {isBn ? 'সেশন রিস্টোর করুন' : 'Restore Now'}
                        </button>
                        <button
                          type="button"
                          className="min-h-[38px] px-4 py-2 rounded-[10px] bg-white border border-emerald-950/12 text-[#0f291e] text-xs font-bold cursor-pointer"
                          onClick={() => setShowSessionPasteBox(false)}
                        >
                          {isBn ? 'বাতিল' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* GROUPS PAGE */}
          {activePage === 'groups' && (
            <section className="page active" id="groups">
              <div className="page-head">
                <div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="sub-back-btn mb-2 cursor-pointer"
                  >
                    <ArrowLeft size={12} className="text-[#087f55]" /> {isBn ? 'হোম পেজ' : 'Home'}
                  </button>
                  <h1>{t.groupsTitle}</h1>
                  <p>{t.groupsSub}</p>
                </div>
                <button
                  className={`btn primary ${isGroupsLoading ? 'is-loading' : ''}`}
                  onClick={loadGroups}
                >
                  <RefreshCw size={12} />
                  <span className="btn-text">{t.refresh}</span>
                </button>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{isBn ? 'কানেক্টেড গ্রুপসমূহ' : 'Connected Groups'}</h3>
                    <p>
                      {isBn
                        ? 'যেকোনো গ্রুপের ওপর ক্লিক করলে সার্ভার থেকে সেই গ্রুপ লিভ নেওয়ার অপশন ওপেন হবে।'
                        : 'Click any group below to open the Leave Group from Server option.'}
                    </p>
                  </div>
                  <div className="symbol sb">
                    <Users size={16} />
                  </div>
                </div>

                {selectedGroupForLeave && (
                  <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-rose-950 truncate">
                        {isBn
                          ? `"${selectedGroupForLeave.name}" গ্রুপ থেকে লিভ নিতে চান?`
                          : `Leave "${selectedGroupForLeave.name}" from server?`}
                      </div>
                      <div className="text-[11px] text-rose-800 mt-0.5 tabular-nums">
                        {isBn
                          ? `সদস্য: ${selectedGroupForLeave.participants} জন · আইডি: ${selectedGroupForLeave.id}`
                          : `${selectedGroupForLeave.participants} members · ${selectedGroupForLeave.id}`}
                      </div>
                      <p className="text-[11px] text-rose-700 mt-1">
                        {isBn
                          ? 'লিভ নিলে বট সার্ভার থেকে এই গ্রুপ ত্যাগ করবে। বাকি গ্রুপ, ডাটাবেজ ও সেশন অপরিবর্তিত থাকবে।'
                          : 'The bot will leave this WhatsApp group from the server. Other groups, database, and session stay intact.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(leavingGroupId)}
                        onClick={() => handleLeaveGroupFromServer(selectedGroupForLeave)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <LogOut size={13} />
                        <span>
                          {leavingGroupId === selectedGroupForLeave.id
                            ? isBn
                              ? 'লিভ নিচ্ছে...'
                              : 'Leaving...'
                            : isBn
                            ? 'সার্ভার থেকে লিভ নিন'
                            : 'Leave Group'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(leavingGroupId)}
                        onClick={() => setSelectedGroupForLeave(null)}
                        className="inline-flex items-center min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        {isBn ? 'বাতিল' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.groupNameCol}</th>
                        <th>{t.membersCol}</th>
                        <th>{t.statusCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.length > 0 ? (
                        groups.map((g) => {
                          const isSelected = selectedGroupForLeave?.id === g.id;
                          return (
                            <tr
                              key={g.id}
                              onMouseDown={() => {
                                const t = setTimeout(() => {
                                  openGroupInbox(g.id);
                                  showNotification(isBn ? '৫ সেকেন্ড হোল্ড করায় গ্রুপ ইনবক্স ওপেন হলো!' : 'Group inbox opened via 5s hold!');
                                }, 5000);
                                (window as any).__waguard_hold_timer = t;
                              }}
                              onMouseUp={() => {
                                if ((window as any).__waguard_hold_timer) {
                                  clearTimeout((window as any).__waguard_hold_timer);
                                  (window as any).__waguard_hold_timer = null;
                                }
                              }}
                              onMouseLeave={() => {
                                if ((window as any).__waguard_hold_timer) {
                                  clearTimeout((window as any).__waguard_hold_timer);
                                  (window as any).__waguard_hold_timer = null;
                                }
                              }}
                              onTouchStart={() => {
                                const t = setTimeout(() => {
                                  openGroupInbox(g.id);
                                  showNotification(isBn ? '৫ সেকেন্ড হোল্ড করায় গ্রুপ ইনবক্স ওপেন হলো!' : 'Group inbox opened via 5s hold!');
                                }, 5000);
                                (window as any).__waguard_hold_timer = t;
                              }}
                              onTouchEnd={() => {
                                if ((window as any).__waguard_hold_timer) {
                                  clearTimeout((window as any).__waguard_hold_timer);
                                  (window as any).__waguard_hold_timer = null;
                                }
                              }}
                              onClick={() => setSelectedGroupForLeave(isSelected ? null : g)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-rose-50/70' : 'hover:bg-slate-50'
                              }`}
                              title={isBn ? 'ক্লিক করে লিভ অপশন · ৫ সেকেন্ড ধরে রাখলে ইনবক্স খুলবে' : 'Click for settings · Hold for 5s to open inbox'}
                            >
                              <td>
                                <b>{g.name}</b>
                                <p className="text-[10px] text-gray-500 font-mono mt-0.5 tabular-nums">{g.id}</p>
                              </td>
                              <td className="tabular-nums">{g.participants} {isBn ? 'সদস্য' : 'members'}</td>
                              <td>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="status-tag good">
                                      <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                      {t.protectedBadge}
                                    </span>
                                    <span className="text-[11px] font-bold text-rose-600 whitespace-nowrap">
                                      {isSelected ? (isBn ? 'নিশ্চিত করুন' : 'Selected') : isBn ? 'লিভ অপশন' : 'Leave'}
                                    </span>
                                  </div>
                                </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="empty">
                            {isBn ? 'কোনো গ্রুপ পাওয়া যায়নি' : 'No groups found'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* API & INTEGRATIONS PAGE */}
          {activePage === 'integrations' && (
            <section className="page active" id="integrations">
              <div className="page-head">
                <div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="sub-back-btn mb-2 cursor-pointer"
                  >
                    <ArrowLeft size={12} className="text-[#087f55]" /> {isBn ? 'হোম পেজ' : 'Home'}
                  </button>
                  <h1>{isBn ? 'AI কন্ট্রোল সেন্টার' : 'AI Control Center'}</h1>
                  <p>Manage Gemini, Groq & OpenRouter failover and server synchronization.</p>
                </div>
              </div>

              <div className="grid2 !mb-6">
                 {/* AI System Health Card */}
                 <div className="card !bg-gradient-to-br !from-[#087f55] !via-[#0d9566] !to-[#14b378] !text-white border-0 shadow-[0_14px_34px_rgba(8,127,85,0.22)] overflow-hidden relative">
                    <div className="absolute top-[-20px] right-[-20px] opacity-10 rotate-12 pointer-events-none">
                       <Cpu size={120} />
                    </div>
                    <div className="card-head !border-white/15">
                       <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                             <ShieldCheck size={18} className="text-white" />
                          </div>
                          <div>
                             <h3 className="!text-white font-bold">AI System Health</h3>
                             <p className="!text-emerald-100 text-[10px]">Real-time key pool monitoring</p>
                          </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mt-4">
                       <div className="text-center p-2.5 rounded-xl bg-white/12">
                          <div className="text-xl font-black tabular-nums">{settings.aiKeys?.length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-75 tracking-widest">Pool</div>
                          <div className="text-[7px] font-bold opacity-60 mt-0.5">(মোট কি)</div>
                       </div>
                       <div className="text-center p-2.5 rounded-xl bg-white/20 border border-white/20">
                          <div className="text-xl font-black tabular-nums">{settings.aiKeys?.filter(k => k.status === 'active').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-95 tracking-widest">Active</div>
                          <div className="text-[7px] font-bold opacity-65 mt-0.5">(সচল)</div>
                       </div>
                       <div className="text-center p-2.5 rounded-xl bg-amber-500/30 border border-amber-400/30">
                          <div className="text-xl font-black tabular-nums">{settings.aiKeys?.filter(k => k.status === 'exhausted' || k.status === 'cooldown').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-95 tracking-widest">Busy</div>
                          <div className="text-[7px] font-bold opacity-65 mt-0.5">(কোটা শেষ)</div>
                       </div>
                       <div className="text-center p-2.5 rounded-xl bg-rose-500/30 border border-rose-400/30">
                          <div className="text-xl font-black tabular-nums">{settings.aiKeys?.filter(k => k.status === 'invalid').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-95 tracking-widest">Faulty</div>
                          <div className="text-[7px] font-bold opacity-65 mt-0.5">(ভুল কি)</div>
                       </div>
                    </div>

                    <div className="mt-5 p-3 rounded-xl bg-black/20 border border-white/10 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${settings.aiAutoRotate ? 'bg-emerald-300' : 'bg-slate-400'}`} />
                          <span className="text-[10px] font-bold">Auto-Rotation: <span className={settings.aiAutoRotate ? 'text-emerald-200' : 'text-slate-300'}>{settings.aiAutoRotate ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)'}</span></span>
                       </div>
                       {(() => {
                          const activeKey = (settings.aiKeys || [])
                            .filter(k => k.status === 'active')
                            .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
                          return activeKey ? (
                             <div className="text-right">
                                <div className="text-[8px] opacity-60 font-bold uppercase tracking-tighter line-clamp-1">Current Engine</div>
                                <div className="text-[9px] font-mono bg-white/15 px-2 py-0.5 rounded-md text-white/90">{activeKey.provider.toUpperCase()} #{activeKey.label.split(' ')[0]}</div>
                             </div>
                          ) : (
                             <span className="text-[9px] font-mono opacity-65">LEGACY MODE</span>
                          );
                       })()}
                    </div>
                 </div>

                 {/* System Incident Logs */}
                 <div className="card">
                    <div className="card-head">
                       <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-rose-50">
                             <Zap size={18} className="text-rose-500" />
                          </div>
                          <div>
                             <h3 className="font-bold">System Incident Logs</h3>
                             <p className="text-[10px]">Failover events and error diagnostics</p>
                          </div>
                       </div>
                       <button className="iconbutton sm" onClick={loadModerationData} title="Refresh logs">
                          <RefreshCw size={13} />
                       </button>
                    </div>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar mt-2">
                       {(settings.aiKeys || []).some(k => k.lastError) ? (
                          settings.aiKeys?.filter(k => k.lastError).map(k => (
                             <div key={k.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 group hover:border-rose-200 transition-colors">
                                <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter shrink-0 mt-0.5 shadow-sm ${
                                   k.provider === 'gemini' ? 'bg-emerald-100 text-emerald-700' :
                                   k.provider === 'groq' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                   {k.provider}
                                </div>
                                <div className="flex-1 min-w-0">
                                   <div className="text-[10px] font-extrabold text-slate-700 flex items-center gap-1.5">
                                      {k.label}
                                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                                      <span className="text-[8px] font-bold text-rose-500 uppercase tracking-tight">System Error</span>
                                   </div>
                                   <div className="text-[10px] text-slate-500 leading-relaxed font-mono bg-white/80 rounded-lg p-1.5 mt-1 border border-slate-100 break-words line-clamp-3 group-hover:line-clamp-none transition-all">
                                      {k.lastError}
                                   </div>
                                </div>
                             </div>
                          ))
                       ) : (
                          <div className="h-[140px] flex flex-col items-center justify-center text-slate-300 gap-3">
                             <div className="w-12 h-12 rounded-2xl bg-[#f4f8f5] flex items-center justify-center border border-emerald-950/[0.06]">
                                <CheckCircle2 size={24} className="opacity-35 text-emerald-600" />
                             </div>
                             <div className="text-center">
                                <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">System Normal</span>
                                <span className="text-[9.5px] text-slate-400">No AI failures or failover events recorded.</span>
                             </div>
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* AI BRAIN CENTER - KEY ROTATION & FAILOVER */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3 className="flex items-center gap-2">
                      <Cpu size={18} className="text-indigo-600" />
                      Maya AI Brain Center
                    </h3>
                    <p>Advanced API Key Rotation & Provider Failover System</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn outline sm" onClick={(e) => handleResetAiKeys(e)} title="Reset all key stats">
                       <RotateCcw size={12} />
                    </button>
                    <div className={`badge ${settings.aiAutoRotate ? 'badge-green' : 'badge-gray'}`}>
                      {settings.aiAutoRotate ? 'AUTO-ROTATE ON' : 'ROTATION OFF'}
                    </div>
                  </div>
                </div>

                {/* Key Management Area */}
                <div className="space-y-4">
                  <div className="bg-[#f4f8f5] p-3.5 rounded-2xl border border-emerald-950/[0.08]">
                    <h4 className="text-[11px] font-bold text-[#087f55] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <Database size={12} />
                      Maya AI Key Pool ({settings.aiKeys?.length || 0})
                    </h4>
                    
                    <div className="tablewrap !mt-0 !bg-white">
                      <table className="!text-[11px]">
                        <thead>
                          <tr>
                            <th>Provider / Label</th>
                            <th>Status</th>
                            <th className="hidden sm:table-cell">Usage / Stats</th>
                            <th>Rate</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(settings.aiKeys || []).length > 0 ? (
                            settings.aiKeys?.map((k) => (
                              <tr key={k.id}>
                                <td>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                      k.provider === 'gemini' ? 'bg-emerald-500' :
                                      k.provider === 'groq' ? 'bg-orange-500' : 'bg-blue-500'
                                    }`} />
                                    <div>
                                      <div className="font-bold">{k.label}</div>
                                      <div className="text-[9px] font-mono text-slate-400">{k.key}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="flex flex-col gap-1">
                                    <span className={`badge !text-[9px] ${
                                      k.status === 'active' ? 'badge-green' :
                                      k.status === 'exhausted' ? 'badge-amber' :
                                      k.status === 'invalid' ? 'badge-red' : 'badge-blue'
                                    }`}>
                                      {(k.status || 'active').toUpperCase()}
                                    </span>
                                    {k.cooldownUntil && k.cooldownUntil > Date.now() ? (
                                      <span className="text-[8px] text-slate-500 flex items-center gap-0.5">
                                        <Clock size={8} /> {Math.ceil((k.cooldownUntil - Date.now()) / 60000)}m
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="hidden sm:table-cell">
                                  <div className="flex flex-col text-[10px]">
                                    <span>Total: <b>{k.totalRequests || 0}</b></span>
                                    <span className={(k.failureCount || 0) > 0 ? 'text-rose-500' : 'text-slate-400'}>
                                      Fails: {k.failureCount || 0}
                                    </span>
                                  </div>
                                </td>
                                <td className="font-mono text-[9px] font-bold text-emerald-600">
                                   {(k.totalRequests || 0) > 0 
                                     ? Math.round((((k.totalRequests || 0) - (k.failureCount || 0)) / (k.totalRequests || 1)) * 100) + '%'
                                     : '--'}
                                </td>
                                <td>
                                  <div className="flex gap-1">
                                     <button 
                                       type="button"
                                       className={`iconbutton !w-7 !h-7 ${isTestingKey === k.id ? 'is-loading' : ''}`} 
                                       onClick={(e) => handleTestAiKey(k, e)}
                                       title="Test this specific key"
                                     >
                                        <Activity size={12} />
                                     </button>
                                     <button 
                                       type="button"
                                       className="iconbutton danger !w-7 !h-7" 
                                       onClick={(e) => handleRemoveAiKey(k.id, e)}
                                       title="Delete key"
                                     >
                                       <Trash2 size={13} />
                                     </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="empty py-8 text-slate-400 italic">
                                No API keys in pool. Maya is using default environment keys.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Add Key Form */}
                  <div className="p-4 rounded-2xl bg-[#f4f8f5] border border-emerald-950/[0.08]">
                    <h4 className="text-xs font-bold text-emerald-900 mb-3 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-emerald-600" />
                      অ্যাডভান্সড কী ম্যানেজমেন্ট (নতুন কী যুক্ত করুন)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3">
                        <label className="text-[9px] font-bold text-emerald-700 block mb-1 uppercase tracking-tighter">AI Provider (এআই প্রোভাইডার)</label>
                        <select 
                          className="field !text-xs" 
                          value={newKeyProvider} 
                          onChange={e => setNewKeyProvider(e.target.value as any)}
                        >
                          <option value="gemini">Google Gemini AI</option>
                          <option value="groq">Groq Cloud AI</option>
                          <option value="openrouter">OpenRouter AI</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-[9px] font-bold text-emerald-700 block mb-1 uppercase tracking-tighter">Key Label (কি-এর নাম/লেবেল)</label>
                        <input 
                          type="text" 
                          className="field !text-xs" 
                          placeholder="Ex: Maya Main 1 (মেইন কি ১)" 
                          value={newKeyLabel}
                          onChange={e => setNewKeyLabel(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAiKey(e);
                            }
                          }}
                        />
                        <div className="text-[8px] text-emerald-600/50 mt-0.5 flex items-center gap-1 font-bold">
                           <Info size={8} /> Just a nickname for your reference.
                        </div>
                      </div>
                      <div className="md:col-span-4">
                        <label className="text-[9px] font-bold text-emerald-700 block mb-1 uppercase tracking-tighter">Official API Key (এপিআই কি পেস্ট করুন)</label>
                        <input 
                          type="password" 
                          className="field !text-xs" 
                          placeholder="Paste API Key here..." 
                          value={newKeyInput}
                          onChange={e => setNewKeyInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAiKey(e);
                            }
                          }}
                        />
                      </div>
                      <div className="md:col-span-2 flex flex-col justify-end">
                        <button 
                          type="button"
                          className={`btn primary full !text-[10px] !py-2.5 ${isAddingKey ? 'is-loading' : ''}`} 
                          onClick={(e) => handleAddAiKey(e)}
                          disabled={isAddingKey || !newKeyInput}
                        >
                          <span className="spinner"></span>
                          <span className="btn-icon-holder"><Save size={12} /> ADD KEY</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-emerald-600/70 mt-2 italic">* আপনার এপিআই কি সার্ভারে এনক্রিপ্টেড অবস্থায় সেভ করা হয়।</p>
                  </div>

                  {/* failover settings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                     <div className="form-group !mb-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Provider Failover Priority</label>
                        <div className="flex flex-col gap-1.5 mt-2">
                           {(settings.aiProviderPriority || ['gemini', 'groq', 'openrouter']).map((p, i) => (
                             <div key={p} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-emerald-950/[0.08] shadow-xs">
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-bold w-4">#{i+1}</span>
                                  <div className={`w-2 h-2 rounded-full ${
                                    p === 'gemini' ? 'bg-indigo-500' : p === 'groq' ? 'bg-orange-500' : 'bg-blue-500'
                                  }`} />
                                  <span className="text-[11px] font-bold capitalize">{p}</span>
                               </div>
                               <div className="flex gap-1">
                                  <button 
                                    type="button"
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-20 transition-colors" 
                                    onClick={() => moveProviderUp(i)}
                                    disabled={i === 0}
                                    title="Move Up"
                                  >
                                     <ChevronUp size={14} />
                                  </button>
                                  <button 
                                    type="button"
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-20 transition-colors" 
                                    onClick={() => moveProviderDown(i)}
                                    disabled={i === (settings.aiProviderPriority || []).length - 1}
                                    title="Move Down"
                                  >
                                     <ChevronDown size={14} />
                                  </button>
                               </div>
                             </div>
                           ))}
                        </div>
                        <p className="hint !mt-2">Failed keys automatically rotate. Failed providers trigger failover in this order.</p>
                     </div>
                     <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#f4f8f5] border border-emerald-950/[0.08]">
                        <div>
                           <h4 className="text-[11px] font-bold">Auto-Rotation</h4>
                           <p className="text-[9px] text-slate-500">Enable smart key rotation on 429 errors</p>
                        </div>
                        <label className="switch scale-90">
                           <input 
                             type="checkbox" 
                             checked={settings.aiAutoRotate ?? true} 
                             onChange={e => updateSettingToggle('aiAutoRotate', e.target.checked)}
                           />
                           <span className="slider"></span>
                        </label>
                     </div>
                  </div>
                </div>
              </div>

              {/* INDIVIDUAL AI PROVIDER API KEY CONFIGURATION CARDS */}
              {/* 1. Google Gemini AI Card */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3 className="flex items-center gap-2">
                      <Sparkles size={18} className="text-emerald-600" />
                      Google Gemini AI (Official Model Engine)
                    </h3>
                    <p>Primary AI brain engine for Maya personality</p>
                  </div>
                  <div className="symbol sg">
                    <Sparkles size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Gemini Model Version (এআই মডেল সিলেক্ট করুন)</label>
                  <select
                    className="field"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                  >
                    <option value="gemini-3.8-flash">Google Gemini 3.8 Flash (Recommended)</option>
                    <option value="gemini-flash-latest">Google Gemini Flash Latest</option>
                    <option value="gemini-3.1-flash-lite">Google Gemini 3.1 Flash Lite</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Official Gemini API Key (এপিআই কি)</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showGemini ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowGemini(!showGemini)}
                    >
                      {showGemini ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="hint">Get your free Gemini API key from Google AI Studio</p>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={() => saveConfig('gemini')}>
                    <Save size={13} /> Save Gemini API Key
                  </button>
                  <button type="button" className="btn outline" onClick={testAI}>
                    <Activity size={13} /> Test Gemini AI Connection
                  </button>
                </div>
              </div>

              {/* 2. Groq Cloud AI Card */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3 className="flex items-center gap-2">
                      <Zap size={18} className="text-orange-500" />
                      Groq Cloud AI (Ultra-Fast Failover Engine)
                    </h3>
                    <p>Llama 3.3 70B & Gemma 2 9B failover provider</p>
                  </div>
                  <div className="symbol so">
                    <Zap size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Groq API Key (এপিআই কি)</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showGroq ? 'text' : 'password'}
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      placeholder="gsk_..."
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowGroq(!showGroq)}
                    >
                      {showGroq ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="hint">Get your free Groq API key from console.groq.com</p>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={() => saveConfig('groq')}>
                    <Save size={13} /> Save Groq API Key
                  </button>
                </div>
              </div>

              {/* 3. OpenRouter AI Card */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3 className="flex items-center gap-2">
                      <Globe size={18} className="text-blue-500" />
                      OpenRouter AI (Multi-Model Failover Engine)
                    </h3>
                    <p>Backup multi-model LLM provider</p>
                  </div>
                  <div className="symbol sb">
                    <Globe size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>OpenRouter API Key (এপিআই কি)</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showOpenrouter ? 'text' : 'password'}
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-..."
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowOpenrouter(!showOpenrouter)}
                    >
                      {showOpenrouter ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="hint">Get your OpenRouter API key from openrouter.ai</p>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={() => saveConfig('openrouter')}>
                    <Save size={13} /> Save OpenRouter API Key
                  </button>
                </div>
              </div>

              {/* Supabase Database & Auth */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Supabase Cloud Database (SUPABASE_URL & SUPABASE_ANON_KEY)</h3>
                    <p>Cloud Postgres persistence & user auth storage</p>
                  </div>
                  <div className="symbol sp">
                    <Database size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>SUPABASE_URL</label>
                  <input
                    className="field"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                  />
                </div>
                <div className="form-group">
                  <label>SUPABASE_ANON_KEY (SUPABASE_KEY)</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showSupabase ? 'text' : 'password'}
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowSupabase(!showSupabase)}
                    >
                      {showSupabase ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={() => saveConfig('supabase')}>
                    <Save size={13} /> Save Supabase Credentials
                  </button>
                </div>
              </div>

              {/* Baileys Server URL */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <span className="text-[10px] text-[#087f55] font-bold uppercase tracking-wider block mb-0.5">
                      {isBn ? 'সার্ভার ও সিস্টেম সংযোগ' : 'Server & System Status'}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-[13px]">Baileys Socket Server URL</h3>
                      {renderInfoBtn('serverConnection')}
                    </div>
                    <p>Connect to live backend server</p>
                  </div>
                  <div className="symbol sb">
                    <Server size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Custom Baileys Server URL (Optional)</label>
                  <input
                    className="field"
                    value={baileysUrl}
                    onChange={(e) => setBaileysUrl(e.target.value)}
                    placeholder="https://your-server.com"
                  />
                  <p className="hint">Leave empty to use built-in server</p>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={saveBaileysConfig}>
                    <Save size={13} /> Save URL
                  </button>
                  <button type="button" className="btn outline" onClick={resetBaileysConfig}>
                    <RotateCcw size={13} /> Reset to Default
                  </button>
                </div>
              </div>

              {/* GitHub Pages Deployment Card */}
              <div className="card border border-emerald-200/80 bg-[#f4fbf7]">
                <div className="card-head">
                  <div>
                    <h3 className="text-emerald-950 font-bold">GitHub Pages Deployment (Blank Screen 100% Fixed)</h3>
                    <p className="text-emerald-800 text-xs">গিটহাব পেজেসে ডিপ্লয় করলে কোনো হোয়াইট/ব্ল্যাঙ্ক পেজ আসবে না</p>
                  </div>
                  <div className="symbol sg">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <div className="text-xs text-emerald-950 leading-relaxed space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                      <b>1. Relative Asset Path:</b> <code>base: &#39;./&#39;</code> কনফিগার করা হয়েছে।
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                      <b>2. Trailing Slash Enforcer:</b> <code>index.html</code> এ স্বয়ংক্রিয় রিডাইরেক্ট কোড যুক্ত।
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                      <b>3. Jekyll Bypass:</b> <code>.nojekyll</code> ফাইল যুক্ত যাতে কোনো ফাইল মিসিং না হয়।
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                      <b>4. SPA 404 Routing:</b> <code>404.html</code> দেওয়া হয়েছে যাতে রিফ্রেশে পেজ না হারায়।
                    </div>
                  </div>

                  <p className="pt-1">
                    <b>গুরুত্বপূর্ণ নোট (Anti-Ban টিপস):</b> ফ্রি Render (`onrender.com`) সার্ভার প্রতি ১৫ মিনিটে স্লিপ করে এবং শেয়ার্ড IP থেকে বারবার সেশন রিসেট করায় WhatsApp টেম্পোরারি ব্যান দেয়। ২৪/৭ নিরাপদ ও ব্যান-মুক্ত সংযোগের জন্য প্রজেক্টটি <b>Google Cloud Run</b>-এ (রিপোতে থাকা `Dockerfile` দিয়ে) অথবা নিজের ফোনের <b>Termux</b> (`http://127.0.0.1:3000`)-এ চালিয়ে উপরের <b>Baileys Socket Server URL</b> বক্সে সেভ করুন।
                  </p>

                  <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80 font-mono text-[11px] text-gray-800">
                    npm run build &nbsp;&nbsp;&mdash; Generates GitHub Pages ready build in <b>dist/</b>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        <button
          className={activePage === 'home' ? 'active' : ''}
          onClick={() => navigateToPage('home')}
        >
          <LayoutDashboard size={16} /> {t.home}
        </button>
        <button
          className={activePage === 'security' ? 'active' : ''}
          onClick={() => navigateToPage('security')}
        >
          <ShieldCheck size={16} /> {t.security}
        </button>
        <button
          className={activePage === 'inbox' ? 'active' : ''}
          onClick={() => navigateToPage('inbox')}
        >
          <Inbox size={16} /> {isBn ? 'ইনবক্স' : 'Inbox'}
        </button>
        <button
          className={activePage === 'maya' ? 'active' : ''}
          onClick={() => navigateToPage('maya')}
        >
          <Heart size={16} /> {t.maya}
        </button>
        <button
          className={activePage === 'pairing' ? 'active' : ''}
          onClick={() => navigateToPage('pairing')}
        >
          <Smartphone size={16} /> {t.connect}
        </button>
      </nav>

      {/* Function Help Modal with 7-point structured documentation */}
      <HelpModal
        helpItem={activeHelpId ? HELP_ITEMS[activeHelpId] : null}
        isOpen={Boolean(activeHelpId)}
        onClose={closeHelp}
        isBn={isBn}
        currentStatusText={getHelpStatus(activeHelpId).text}
        isStatusActive={getHelpStatus(activeHelpId).isActive}
      />

      {/* Interactive Cute Demon AI Mascot Overlay */}
      <AiMascotOverlay />
    </div>
  );
}
