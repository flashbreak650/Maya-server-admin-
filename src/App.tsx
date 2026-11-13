import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { HELP_ITEMS } from './helpData.ts';
import { HelpModal } from './components/HelpModal.tsx';


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
  autoKick3Warnings: boolean;
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
  mayaReplyMode: 'group' | 'inbox' | 'off';
  // AI Key Pool
  aiKeys?: AiKey[];
  aiAutoRotate?: boolean;
  aiProviderPriority?: ('gemini' | 'groq' | 'openrouter')[];
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

export default function App() {
  const [activePage, setActivePage] = useState<'home' | 'security' | 'maya' | 'integrations' | 'pairing' | 'groups'>('home');
  const [isStaticHost] = useState(() => {
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
    return isCapacitor || window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev');
  });
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
    
    antiStickerSpamTitle: isBn ? 'Anti-Sticker Spam (১০ মিনিট গ্রুপ লক)' : 'Anti-Sticker Spam (Auto 10m Group Lock)',
    antiStickerSpamDesc: isBn ? '৫ সেকেন্ডে ৩টি বা বেশি Sticker পাঠালে মেসেজ ডিলিট ও পুরো গ্রুপ ১০ মিনিটের জন্য লক হবে।' : '3+ stickers in 5 seconds locks group for 10 minutes.',
    antiStickerTitle: isBn ? 'Anti-Sticker (সকল স্টিকার নিষিদ্ধ)' : 'Anti-Sticker (All Stickers)',
    antiStickerDesc: isBn ? 'গ্রুপে যেকোনো WhatsApp Sticker সঙ্গে সঙ্গে ডিলিট ও সতর্ক করবে।' : 'Deletes all stickers sent in groups immediately.',
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
    silentModTitle: isBn ? 'Silent Moderation (নিঃশব্দ মডারেশন)' : 'Silent Moderation',
    silentModDesc: isBn ? 'মেসেজ ডিলিট করার পর গ্রুপে কোনো সতর্কবার্তা (Warning Message) পাঠাবে না।' : 'Disable bot warning messages after deleting a violation.',

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
    autoKick3Warnings: true,
    botReply: true,
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
    silentModeration: false,
    mayaReplyMode: 'group',
  });
  const [customBadwordsText, setCustomBadwordsText] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<any[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  // Live countdown timer for active restricted users dashboard
  useEffect(() => {
    const timer = setInterval(() => {
      setRestrictedUsers((prev) => {
        if (!prev || prev.length === 0) return prev;
        const now = Date.now();
        const updated = prev
          .filter((u) => u.expiresAt > now)
          .map((u) => {
            const remainingSec = Math.max(0, Math.ceil((u.expiresAt - now) / 1000));
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const remainingText = mins > 0 ? `${mins} মি. ${secs} সে.` : `${secs} সেকেন্ড`;
            return { ...u, remainingSeconds: remainingSec, remainingText };
          });
        return updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Groups
  const [groups, setGroups] = useState<GroupItem[]>([
    { id: '12036302@g.us', name: 'WAGuard Official Community', participants: 184, status: 'Active' },
    { id: '12036303@g.us', name: 'Devs & Admins Group', participants: 42, status: 'Active' },
  ]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);

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

  const callApi = async (path: string, method = 'GET', body?: any) => {
    let base = baileysUrl.trim();
    if (base && base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = base ? `${base}${cleanPath}` : cleanPath;
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
             throw new Error(isBn ? 'ব্যাকএন্ড কানেক্ট করা নেই! ইনটিগ্রেশন পেজে গিয়ে সার্ভার URL সেভ করুন।' : 'Backend disconnected! Set your Server URL in Integrations.');
          }
          throw new Error(`HTTP ${res.status}: Endpoint unavailable`);
        }
        return { success: false, raw: rawText };
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
          headers: { 'Content-Type': 'application/json' },
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
        prev.user?.id !== merged.user?.id ||
        prev.user?.name !== merged.user?.name;

      if (changed) {
        setLiveStatus(merged);
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
      const data = await callApi('/api/dashboard');
      if (data.overview) {
        setOverview(data.overview);
      }
      if (data.moderation?.settings) {
        const s = data.moderation.settings;
        setSettings(s);
        setCustomBadwordsText((s.customBadwords || []).join(', '));
        if (s.geminiApiKey) setGeminiKey(s.geminiApiKey);
        if (s.groqApiKey) setGroqKey(s.groqApiKey);
        if (s.openrouterApiKey) setOpenrouterKey(s.openrouterApiKey);
        if (s.geminiModel) setGeminiModel(s.geminiModel);
      }
      await checkStatus();
    } catch {
      // non-blocking
    }
  };

  const loadModerationData = async () => {
    setIsLogsLoading(true);
    try {
      const [settingsRes, logsRes, restrictedRes] = await Promise.all([
        callApi('/api/moderation/settings'),
        callApi('/api/moderation/logs?limit=50'),
        callApi('/api/moderation/restricted-users'),
      ]);
      if (settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings(s);
        setCustomBadwordsText((s.customBadwords || []).join(', '));
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
      showNotification(isBn ? 'সেটিংস ও লগ প্রস্তুত' : 'Settings & Logs Synced');
    } catch (err: any) {
      showNotification((isBn ? 'ডাটা লোড ত্রুটি: ' : 'Failed to load data: ') + err.message);
    } finally {
      setIsLogsLoading(false);
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




  const updateSettingToggle = async (key: keyof ModerationSettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await callApi('/api/moderation/settings', 'POST', { [key]: value });
      showNotification(isBn ? `সফলভাবে সেভ হয়েছে` : `Settings updated successfully`);
    } catch (err: any) {
      showNotification((isBn ? 'সেভ করতে ব্যর্থ: ' : 'Save failed: ') + err.message);
      setSettings(settings);
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

  const loadGroups = async () => {
    setIsGroupsLoading(true);
    try {
      const data = await callApi('/api/groups');
      if (data.groups && Array.isArray(data.groups)) {
        setGroups(data.groups);
      }
    } catch {
      // non-blocking
    } finally {
      setIsGroupsLoading(false);
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

  // Setup controlled adaptive live status polling (pauses in background & prevents overlapping polls)
  useEffect(() => {
    let mounted = true;
    loadDashboard();

    const scheduleNext = () => {
      if (!mounted) return;
      const isActivelyPairing =
        liveStatusRef.current.status === 'pairing' ||
        liveStatusRef.current.status === 'connecting' ||
        activePageRef.current === 'pairing';
      const delay = isActivelyPairing ? 3000 : 15000;

      pollIntervalRef.current = setTimeout(async () => {
        if (!mounted) return;
        if (document.visibilityState !== 'hidden') {
          await checkStatus();
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        checkStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="shell">
      {/* Toast Notification */}
      {showToast && <div className="toast block">{toastMessage}</div>}

      {/* Compact Header */}
      <header className="header">
        <div className="brand">
          <div className="brandmark">
            <ShieldCheck size={20} />
          </div>
          <div className="brandname">
            WA<span>Guard</span>
          </div>
        </div>
        <div className="header-right">
          <div
            className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap shrink-0 rounded-md ${
              liveStatus.online
                ? 'bg-[#e9f7ef] text-[#108255]'
                : liveStatus.status === 'pairing'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${
                liveStatus.online ? 'bg-[#108255]' : liveStatus.status === 'pairing' ? 'bg-amber-500' : 'bg-gray-400'
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
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[10px] sm:text-xs font-extrabold transition-colors cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
            onClick={toggleUiLang}
            title={isBn ? 'Switch UI to English' : 'বাংলায় পরিবর্তন করুন'}
          >
            <Globe size={11} className="text-emerald-700 shrink-0" />
            <span>{isBn ? 'English' : 'বাংলা'}</span>
          </button>

          <button
            className="iconbutton"
            onClick={() => {
              if (activePage === 'home') loadDashboard();
              else if (activePage === 'security') loadModerationData();
              else if (activePage === 'groups') loadGroups();
              else checkStatus();
            }}
            title={t.refresh}
          >
            <RefreshCw size={15} />
          </button>
          <div className="avatar text-xs font-bold">W</div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="side-label">{t.mainMenu}</div>
          <button
            className={`nav ${activePage === 'home' ? 'active' : ''}`}
            onClick={() => setActivePage('home')}
          >
            <LayoutDashboard size={16} /> {t.home}
          </button>
          <button
            className={`nav ${activePage === 'security' ? 'active' : ''}`}
            onClick={() => {
              setActivePage('security');
              loadModerationData();
            }}
          >
            <ShieldCheck size={16} /> {t.security}
          </button>
          <button
            className={`nav ${activePage === 'maya' ? 'active' : ''}`}
            onClick={() => {
              setActivePage('maya');
              loadModerationData();
            }}
          >
            <Heart size={16} /> {t.maya}
          </button>
          <button
            className={`nav ${activePage === 'integrations' ? 'active' : ''}`}
            onClick={() => setActivePage('integrations')}
          >
            <Plug size={16} /> {t.integrations}
          </button>
          <button
            className={`nav ${activePage === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setActivePage('groups');
              loadGroups();
            }}
          >
            <Users size={16} /> {t.groups}
          </button>
          <button
            className={`nav ${activePage === 'pairing' ? 'active' : ''}`}
            onClick={() => setActivePage('pairing')}
          >
            <Smartphone size={16} /> {t.connect}
          </button>

          <div className="side-bottom">
            <div className="flex items-center gap-1.5">
              <Radio size={16} className="text-[#087f55]" />
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
                  <h1>{t.overviewTitle}</h1>
                  <p>{t.overviewDesc}</p>
                </div>
                <button className="btn outline" onClick={loadDashboard}>
                  <RefreshCw size={13} />
                  <span className="btn-text">{t.refresh}</span>
                </button>
              </div>

              {/* Static Host Backend Warning */}
              {isStaticHost && !baileysUrl && (
                <div className="mb-5 p-4  border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-3 shadow-sm">
                  <div className="w-8 h-8  bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                    <Plug size={18} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">ব্যাকএন্ড সার্ভার কানেক্ট করা নেই!</h4>
                    <p className="text-xs mt-1 leading-relaxed opacity-90">
                      এই অ্যাপটি সরাসরি আপনার <b>Google Cloud Run</b> অথবা ফোনের <b>Termux (127.0.0.1:3000)</b> সার্ভারের সাথে কাজ করে। ফ্রি Render লিংক WhatsApp ব্যান ঝুঁকি বাড়ায়—তাই <b>Integrations</b> পেজে আপনার Google Cloud Run বা লোকাল সার্ভার লিংক সেভ করুন।
                    </p>
                    <button 
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white text-[10px] font-bold  hover:bg-rose-700 transition-colors"
                      onClick={() => setActivePage('integrations')}
                    >
                      কানেক্ট ব্যাকএন্ড
                    </button>
                  </div>
                </div>
              )}

              {/* CATEGORY 0: OVERVIEW & QUICK STATS */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5  bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">System 0</span>
                 </div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight opacity-90">{isBn ? 'ড্যাশবোর্ড ওভারভিউ' : 'Dashboard Overview & Stats'}</h2>
              </div>

              {/* Compact Stats */}
              <div className="stats">
                <div className="stat">
                  <div className="stat-top">
                    <small>{t.messagesChecked}</small>
                    <div className="symbol sg">
                      <MessagesSquare size={16} />
                    </div>
                  </div>
                  <h2>{overview.messagesChecked}</h2>
                  <p>{t.realtimeEngine}</p>
                </div>
                <div className="stat">
                  <div className="stat-top">
                    <small>{t.warnings}</small>
                    <div className="symbol so">
                      <AlertTriangle size={16} />
                    </div>
                  </div>
                  <h2>{overview.warnings}</h2>
                  <p>{t.activeWarnings}</p>
                </div>
                <div className="stat">
                  <div className="stat-top">
                    <small>{t.blockedItems}</small>
                    <div className="symbol sr">
                      <Ban size={16} />
                    </div>
                  </div>
                  <h2>{overview.blockedWords}</h2>
                  <p>{t.deletedViolations}</p>
                </div>
                <div className="stat">
                  <div className="stat-top">
                    <small>{t.activeGroups}</small>
                    <div className="symbol sb">
                      <Users size={16} />
                    </div>
                  </div>
                  <h2>{overview.groups || groups.length}</h2>
                  <p>{t.protectedGroups}</p>
                </div>
              </div>

              {/* Hero Status Card */}
              <div className="grid2 !mt-5">
                <div className="hero">
                  <div className="hero-content">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-white">{t.botConnTitle}</h3>
                      {renderInfoBtn('botConnection')}
                    </div>
                    <p className="text-xs mt-1">
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
                      <span>{liveStatus.stepMessage}</span>
                    </div>

                    <div className="hero-actions">
                      {liveStatus.online ? (
                        <button
                          className="btn bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={handleDisconnect}
                        >
                          <LogOut size={13} /> {t.disconnectWa}
                        </button>
                      ) : (
                        <button className="btn" onClick={() => setActivePage('pairing')}>
                          <LinkIcon size={13} /> {t.connectWa}
                        </button>
                      )}
                      <button className="btn bg-white/20 text-white" onClick={loadDashboard}>
                        <RefreshCw size={13} /> {t.syncStatus}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="card-head">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3>{t.groupSecTitle}</h3>
                        {renderInfoBtn('adminShield')}
                      </div>
                      <p>Active Moderation Shield</p>
                    </div>
                    <div className="symbol sp">
                      <ShieldCheck size={16} />
                    </div>
                  </div>
                  <p className="hint text-xs leading-relaxed">
                    {t.groupSecDesc}
                  </p>
                  <button
                    className="btn soft full"
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      setActivePage('security');
                      loadModerationData();
                    }}
                  >
                    {t.manageRulesBtn} <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* SECURITY & MODERATION PAGE */}
          {activePage === 'security' && (
            <section className="page active" id="security">
              <div className="page-head">
                <div>
                  <h1>{t.securityTitle}</h1>
                  <p>{t.securitySub}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn outline" onClick={loadModerationData} disabled={isLogsLoading}>
                    <RefreshCw size={13} className={isLogsLoading ? 'animate-spin' : ''} />
                    <span className="btn-text">{t.refreshRules}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button className="btn danger" onClick={resetAllWarnings}>
                      <RotateCcw size={13} />
                      <span className="btn-text">{t.resetWarningsBtn}</span>
                    </button>
                    {renderInfoBtn('warningManagement')}
                  </div>
                </div>
              </div>

              {/* CATEGORY A: SECURITY & PROTECTION */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5  bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">System A</span>
                 </div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight opacity-90">{isBn ? 'সিকিউরিটি ও সুরক্ষা' : 'Security & Protection System'}</h2>
              </div>
              
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-extrabold text-[13px]">{t.sec1Title}</h3>
                      {renderInfoBtn('adminShield')}
                    </div>
                    <p>{t.sec1Sub}</p>
                  </div>
                  <div className="symbol sg">
                    <ShieldAlert size={16} />
                  </div>
                </div>

                {/* Admin Shield Toggle */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.adminShieldTitle}
                        <span className={`badge ${settings.adminShield ? 'badge-green' : 'badge-amber'}`}>
                          {settings.adminShield ? 'ON' : 'OFF'}
                        </span>
                        {renderInfoBtn('adminShield')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.autoKickTitle}
                        <span className={`badge ${settings.autoKick3Warnings ? 'badge-green' : 'badge-amber'}`}>
                          {settings.autoKick3Warnings ? 'ACTIVE' : 'OFF'}
                        </span>
                        {renderInfoBtn('autoKick3Warnings')}
                      </span>
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
              </div>



              {/* CATEGORY B: ANTI-SPAM PROTECTION */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <span className="badge badge-amber !text-[10px] !px-3 !py-1 ! font-black tracking-widest uppercase shadow-sm">System B</span>
                 <h2 className="text-sm font-black text-slate-700 mt-1 uppercase tracking-tight opacity-80">{isBn ? 'অ্যান্টি-স্প্যাম সুরক্ষা' : 'Anti-Spam Protection System'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-extrabold text-[13px]">{t.sec2Title}</h3>
                      {renderInfoBtn('antiStickerSpam')}
                    </div>
                    <p>{t.sec2Sub}</p>
                  </div>
                  <div className="symbol so">
                    <Lock size={16} />
                  </div>
                </div>

                {/* Anti-Sticker Spam */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiStickerSpamTitle}
                        <span className={`badge ${settings.antiStickerSpam ? 'badge-green' : 'badge-amber'}`}>
                          {settings.antiStickerSpam ? 'ACTIVE' : 'OFF'}
                        </span>
                        {renderInfoBtn('antiStickerSpam')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiStickerTitle}
                        <span className={`badge ${settings.antiSticker ? 'badge-red' : 'badge-blue'}`}>
                          {settings.antiSticker ? 'BLOCKED' : 'ALLOWED'}
                        </span>
                        {renderInfoBtn('antiSticker')}
                      </span>
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

                {/* Anti-GIF */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiGifTitle}
                        <span className={`badge ${settings.antiGif ? 'badge-green' : 'badge-amber'}`}>
                          {settings.antiGif ? 'BLOCKED' : 'ALLOWED'}
                        </span>
                        {renderInfoBtn('antiGif')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiVideoTitle}
                        <span className={`badge ${settings.antiVideo ? 'badge-red' : 'badge-blue'}`}>
                          {settings.antiVideo ? 'BLOCKED' : 'ALLOWED'}
                        </span>
                        {renderInfoBtn('antiVideo')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiImageTitle}
                        <span className={`badge ${settings.antiImage ? 'badge-red' : 'badge-blue'}`}>
                          {settings.antiImage ? 'BLOCKED' : 'ALLOWED'}
                        </span>
                        {renderInfoBtn('antiImage')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiViewOnceTitle}
                        <span className={`badge ${settings.antiViewOnce ? 'badge-green' : 'badge-amber'}`}>
                          {settings.antiViewOnce ? 'BLOCKED' : 'ALLOWED'}
                        </span>
                        {renderInfoBtn('antiViewOnce')}
                      </span>
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

              {/* ACTIVE RESTRICTED USERS DASHBOARD CARD */}
              <div className="card mt-4 border-amber-500/30 bg-amber-500/5">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-[13px] text-amber-900">
                        {isBn ? 'সক্রিয় সাময়িক রেস্ট্রিকশনপ্রাপ্ত সদস্য (Active Restricted Users)' : 'Active Restricted Users Dashboard'}
                      </h3>
                      <span className="badge badge-amber">{restrictedUsers.length}</span>
                      {renderInfoBtn('antiStickerSpam')}
                    </div>
                    <p className="text-xs text-amber-800/80">
                      {isBn ? 'অতিরিক্ত স্টিকার স্প্যাম করার কারণে ১০ মিনিটের জন্য মেসেজিং রেস্ট্রিকশনে থাকা সদস্যবৃন্দ' : 'Members temporarily restricted for 10 minutes due to sticker spam'}
                    </p>
                  </div>
                  <div className="symbol so">
                    <UserX size={16} />
                  </div>
                </div>

                <div className="tablewrap mt-3">
                  <table>
                    <thead>
                      <tr>
                        <th>{isBn ? 'সদস্যের নাম / নম্বর' : 'MEMBER'}</th>
                        <th>{isBn ? 'গ্রুপ নাম' : 'GROUP'}</th>
                        <th>{isBn ? 'কারণ' : 'REASON'}</th>
                        <th>{isBn ? 'শুরু সময়' : 'START TIME'}</th>
                        <th>{isBn ? 'অবশিষ্ট সময় (LIVE)' : 'REMAINING'}</th>
                        <th>{isBn ? 'স্ট্যাটাস' : 'STATUS'}</th>
                        <th>{isBn ? 'অ্যাকশন' : 'ACTION'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restrictedUsers.length > 0 ? (
                        restrictedUsers.map((user) => (
                          <tr key={`${user.groupId}:${user.senderJid}`}>
                            <td className="font-mono text-xs font-bold text-slate-800 whitespace-nowrap">
                              @{user.senderPhone}
                            </td>
                            <td className="text-xs font-medium text-slate-700">
                              {user.groupName || 'Protected Group'}
                            </td>
                            <td className="text-xs text-rose-700 font-medium">
                              {user.reason || 'Sticker Spam'}
                            </td>
                            <td className="text-[10px] text-slate-500 whitespace-nowrap">
                              {new Date(user.restrictedAt).toLocaleTimeString()}
                            </td>
                            <td className="whitespace-nowrap font-mono text-xs font-bold text-amber-700">
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 border border-amber-300">
                                <Clock size={11} className="animate-spin text-amber-600" />
                                {user.remainingText || `${Math.ceil((user.expiresAt - Date.now()) / 1000)}s`}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-red">
                                Restricted
                              </span>
                            </td>
                            <td>
                              <button
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                                onClick={() => handleManualUnmute(user.groupId, user.senderJid)}
                              >
                                {isBn ? 'Unrestrict' : 'Unrestrict'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty py-4 text-xs text-slate-500 text-center">
                            {isBn ? 'বর্তমানে কোনো সদস্য রেস্ট্রিকশন তালিকায় নেই।' : 'No members currently restricted.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CATEGORY C: MESSAGE MODERATION */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5  bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">System C</span>
                 </div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight opacity-90">{isBn ? 'মেসেজ মডারেশন' : 'Message Moderation Engine'}</h2>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-extrabold text-[13px]">{t.sec3Title}</h3>
                      {renderInfoBtn('antiBadword')}
                    </div>
                    <p>{t.sec3Sub}</p>
                  </div>
                  <div className="symbol sr">
                    <Ban size={16} />
                  </div>
                </div>


                {/* Anti-Badword */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiBadwordTitle}
                        <span className={`badge ${settings.antiBadword ? 'badge-green' : 'badge-amber'}`}>
                          {settings.antiBadword ? 'ACTIVE' : 'OFF'}
                        </span>
                        {renderInfoBtn('antiBadword')}
                      </span>
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
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.antiLinkTitle}
                        <span className={`badge ${settings.antiLink ? 'badge-green' : 'badge-amber'}`}>
                          {settings.antiLink ? 'BLOCKED' : 'OFF'}
                        </span>
                        {renderInfoBtn('antiLink')}
                      </span>
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

                {/* AI Badword Detection */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.aiBadwordTitle}
                        <span className={`badge ${settings.aiBadwordDetection ? 'badge-green' : 'badge-amber'}`}>
                          {settings.aiBadwordDetection ? 'ACTIVE' : 'OFF'}
                        </span>
                        {renderInfoBtn('antiBadword')}
                      </span>
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

                {/* Silent Moderation */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.silentModTitle}
                        <span className={`badge ${settings.silentModeration ? 'badge-red' : 'badge-blue'}`}>
                          {settings.silentModeration ? 'SILENT' : 'LOUD'}
                        </span>
                        {renderInfoBtn('warningManagement')}
                      </span>
                    </h4>
                    <p>{t.silentModDesc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.silentModeration}
                      onChange={(e) => updateSettingToggle('silentModeration', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Bot Mention / Name Calling Reply */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t.botReplyTitle}
                        <span className={`badge ${settings.botReply ? 'badge-green' : 'badge-amber'}`}>
                          {settings.botReply ? 'ACTIVE' : 'OFF'}
                        </span>
                        {renderInfoBtn('botReply')}
                      </span>
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

                {/* Custom Badword List Editor */}
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="mb-0">{t.customBadwordsLabel}</label>
                    {renderInfoBtn('customBadwords')}
                  </div>
                  <p className="hint" style={{ marginBottom: '6px' }}>
                    {t.customBadwordsHint}
                  </p>
                  <textarea
                    className="field"
                    style={{ height: '60px', padding: '6px 10px', resize: 'vertical' }}
                    value={customBadwordsText}
                    onChange={(e) => setCustomBadwordsText(e.target.value)}
                    placeholder="badword1, badword2, ..."
                  />
                  <div className="form-actions mt-2">
                    <button className="btn primary" onClick={saveCustomBadwords}>
                      <Save size={13} /> {t.saveBadwordsBtn}
                    </button>
                  </div>
                </div>
              </div>

              {/* CATEGORY E: LOGS & STATUS */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5  bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">System E</span>
                 </div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight opacity-90">{isBn ? 'লগ ও সিস্টেম স্ট্যাটাস' : 'Logs & System Status'}</h2>
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
                  <div className="flex gap-2">
                    <button className="btn outline" onClick={loadModerationData}>
                      <RefreshCw size={13} /> {t.refreshRules}
                    </button>
                    <button className="btn danger" onClick={clearLogs}>
                      <Trash2 size={13} /> {t.clearLogsBtn}
                    </button>
                  </div>
                </div>

                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TIME</th>
                        <th>GROUP</th>
                        <th>SENDER</th>
                        <th>ACTION</th>
                        <th>REASON / DETAILS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.length > 0 ? (
                        activityLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '10px', color: '#64748b' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td>
                              <b>{log.groupName || log.groupId}</b>
                            </td>
                            <td>
                              <span className="font-mono text-xs text-gray-700">
                                {log.senderPhone ? `@${log.senderPhone}` : log.senderJid}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  log.action === 'kicked' || log.action === 'restricted'
                                    ? 'badge-red'
                                    : log.action === 'locked'
                                    ? 'badge-amber'
                                    : log.action === 'warned'
                                    ? 'badge-amber'
                                    : log.action === 'error'
                                    ? 'badge-red'
                                    : log.action === 'replied'
                                    ? 'badge-blue'
                                    : log.action === 'unmuted'
                                    ? 'badge-green'
                                    : 'badge-green'
                                }`}
                              >
                                {log.action.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ fontSize: '11px' }}>
                              <span className="font-semibold text-gray-800">{log.reason}</span>
                              {log.details && (
                                <p className="text-[10px] text-gray-500 mt-0.5">{log.details}</p>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="empty">
                            {t.noLogsMsg}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* MAYA AI PAGE */}
          {activePage === 'maya' && (
            <section className="page active" id="maya">
              <div className="page-head">
                <div>
                  <h1>{t.mayaTitle}</h1>
                  <p>{t.mayaSub}</p>
                </div>
                <button className="btn outline" onClick={loadModerationData}>
                  <RefreshCw size={13} />
                  <span className="btn-text">{t.refreshRules}</span>
                </button>
              </div>

              {/* CATEGORY D: MAYA AI COMPANION */}
              <div className="category-system-header mt-8 mb-4 px-1">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5  bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
                    <span className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em]">System D</span>
                 </div>
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight opacity-90">{isBn ? 'মায়া এআই ইঞ্জিন' : 'Maya AI Core & Companion'}</h2>
              </div>

              <div className="grid2">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>{t.mayaCoreTitle}</h3>
                      <p>{t.mayaCoreSub}</p>
                    </div>
                    <div className="symbol sp">
                      <Heart size={16} />
                    </div>
                  </div>

                  {/* Master AI Engine Switch */}
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.mayaEngineTitle}
                          <span className={`badge ${settings.mayaAiEnabled ? 'badge-green' : 'badge-amber'}`}>{settings.mayaAiEnabled ? 'ACTIVE' : 'OFF'}</span>
                          {renderInfoBtn('mayaEngine')}
                        </span>
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
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.privateInboxAiTitle}
                          <span className={`badge ${settings.mayaPrivateReply ? 'badge-green' : 'badge-amber'}`}>{settings.mayaPrivateReply ? 'ACTIVE' : 'OFF'}</span>
                          {renderInfoBtn('mayaPrivateReply')}
                        </span>
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
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.groupAiTitle}
                          <span className={`badge ${settings.mayaGroupReply ? 'badge-green' : 'badge-amber'}`}>{settings.mayaGroupReply ? 'ACTIVE' : 'OFF'}</span>
                          {renderInfoBtn('mayaGroupReply')}
                        </span>
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
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.romanticTitle}
                          <span className={`badge ${settings.mayaRomantic ? 'badge-green' : 'badge-amber'}`}>{settings.mayaRomantic ? 'ON' : 'OFF'}</span>
                          {renderInfoBtn('mayaRomantic')}
                        </span>
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
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.funnyTitle}
                          <span className={`badge ${settings.mayaFunny ? 'badge-green' : 'badge-amber'}`}>{settings.mayaFunny ? 'ON' : 'OFF'}</span>
                          {renderInfoBtn('mayaFunny')}
                        </span>
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
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t.autoPartTitle}
                          <span className={`badge ${settings.mayaAutoParticipate ? 'badge-green' : 'badge-amber'}`}>{settings.mayaAutoParticipate ? 'ON' : 'OFF'}</span>
                          {renderInfoBtn('mayaAutoParticipate')}
                        </span>
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
                <div className="hint mt-2 p-2.5 bg-slate-50  border border-slate-200">
                  💡 {isBn ? 'মেসেজ পাঠিয়ে মায়ার রোমান্টিক উত্তর দেখুন।' : 'Send a message to see Maya\'s reply.'}
                </div>
              </div>
            </section>
          )}

          {/* PAIRING / CONNECT PAGE */}
          {activePage === 'pairing' && (
            <section className="page active" id="pairing">
              <div className="page-head">
                <div>
                  <h1>{t.connectTitle}</h1>
                  <p>{t.connectSub}</p>
                </div>
              </div>

              {liveStatus.online ? (
                <div className="card max-w-xl mx-auto overflow-hidden border border-emerald-200 bg-gradient-to-b from-emerald-50/90 via-white to-slate-50 p-6  shadow-sm">
                  {/* Connected Header Banner */}
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11  bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                        <ShieldCheck size={22} />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="text-slate-900 text-base font-extrabold tracking-tight">
                            {isBn ? 'WhatsApp একাউন্ট সফলভাবে যুক্ত' : 'WhatsApp Linked Successfully'}
                          </h3>
                          <span className="flex items-center gap-1 px-2 py-0.5  bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5  bg-emerald-600"></span>
                            Live
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          {isBn ? 'Real Baileys Sockets মডারেশন ইঞ্জিন সক্রিয় আছে' : 'Real Baileys Socket Moderation Engine Active'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Account Info Box */}
                  <div className="bg-white  border border-emerald-100 p-4 shadow-2xs text-left mb-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10  bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                          🌺
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                            {isBn ? 'সংযুক্ত হোয়াটসঅ্যাপ একাউন্ট' : 'CONNECTED WHATSAPP ACCOUNT'}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                            {liveStatus.user?.name || '🌺 Maya Ai 🌺'}
                          </h4>
                          <p className="text-xs font-mono text-emerald-700 font-medium">
                            {liveStatus.phoneNumber || liveStatus.user?.id?.split(':')[0] || '8801838489457'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1  bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                          ✓ Verified Socket
                        </span>
                      </div>
                    </div>

                    {/* Metric Chips inside the card */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 p-2  border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">{isBn ? 'সার্ভার স্টেট' : 'Server State'}</span>
                        <span className="text-xs font-bold text-emerald-700">Online</span>
                      </div>
                      <div className="bg-slate-50 p-2  border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">{isBn ? 'অটো মডারেশন' : 'Auto Moderation'}</span>
                        <span className="text-xs font-bold text-slate-800">24/7 Active</span>
                      </div>
                      <div className="bg-slate-50 p-2  border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">{isBn ? 'মায়া AI' : 'Maya AI'}</span>
                        <span className="text-xs font-bold text-teal-700">Ready</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button className="btn primary px-4 py-2 text-xs font-bold shadow-sm" onClick={() => setActivePage('home')}>
                      <LayoutDashboard size={14} /> {isBn ? 'ড্যাশবোর্ডে যান' : 'Go to Dashboard'}
                    </button>
                    <button className="btn outline px-4 py-2 text-xs font-semibold" onClick={checkStatus}>
                      <RefreshCw size={14} /> {isBn ? 'স্ট্যাটাস রিফ্রেশ' : 'Sync Status'}
                    </button>
                    <button className="btn danger px-4 py-2 text-xs font-semibold" onClick={handleDisconnect}>
                      <LogOut size={14} /> {isBn ? 'ডিসকানেক্ট করুন' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card max-w-lg mx-auto text-center">
                  <div className="symbol sg mx-auto mb-3 w-12 h-12">
                    <Smartphone size={22} />
                  </div>
                  <h3 className="text-base font-extrabold">{t.linkDeviceHead}</h3>
                  <p className="hint text-xs mt-1">
                    {t.phoneInputHint}
                  </p>

                  <div className="mode-switcher flex justify-center gap-2 my-3">
                    <button
                      className={`mode-btn ${pairingMode === 'code' ? 'active' : ''}`}
                      onClick={() => setPairingMode('code')}
                    >
                      <KeyRound size={13} /> {t.eightDigitCode}
                    </button>
                    <button
                      className={`mode-btn ${pairingMode === 'qr' ? 'active' : ''}`}
                      onClick={() => setPairingMode('qr')}
                    >
                      <QrIcon size={13} /> {t.qrCodeLabel}
                    </button>
                  </div>

                  <div className="form-group text-left mt-3">
                    <label>{t.phoneInputLabel}</label>
                    <input
                      className="field font-mono"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="8801XXXXXXXXX"
                      type="tel"
                    />
                  </div>

                  {pairingError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5  text-left my-2">
                      {pairingError}
                    </div>
                  )}

                  <button
                    className={`btn primary full mt-2 ${isPairingLoading ? 'is-loading' : ''}`}
                    onClick={() => handleStartPairing(false)}
                    disabled={isPairingLoading}
                  >
                    <KeyRound size={13} /> {t.genPairCodeBtn}
                  </button>

                  {/* Connection Status, Connecting Indicator & Last Connection Status */}
                  <div className="mt-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-left space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-slate-600">{isBn ? 'কানেকশন স্ট্যাটাস:' : 'Connection Status:'}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold text-[10px] ${
                          liveStatus.status === 'pairing'
                            ? 'bg-emerald-100 text-emerald-800'
                            : liveStatus.status === 'connecting' || isPairingLoading
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {(isPairingLoading || liveStatus.status === 'connecting' || liveStatus.status === 'pairing') && (
                          <RefreshCw size={10} className="animate-spin shrink-0" />
                        )}
                        {isPairingLoading || liveStatus.status === 'connecting'
                          ? isBn ? 'সংযোগ হচ্ছে (Connecting...)' : 'Connecting...'
                          : liveStatus.status === 'pairing'
                          ? isBn ? 'পেয়ারিং সক্রিয় (Pairing Active)' : 'Pairing Active'
                          : isBn ? 'ডিসকানেক্টেড' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-600 leading-relaxed">
                      <span className="font-semibold text-slate-700">{isBn ? 'সর্বশেষ স্ট্যাটাস:' : 'Last Connection Status:'}</span>{' '}
                      {liveStatus.lastConnectionStatus || liveStatus.stepMessage}
                    </div>
                  </div>

                  {/* Display generated code or QR */}
                  {(liveStatus.pairingCode || liveStatus.qrCode) && (
                    <div className="info text-left mt-3">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span>OFFICIAL PAIRING CODE</span>
                        <span className="bg-emerald-200 text-emerald-900 text-[10px] px-2 py-0.5 ">Active</span>
                      </div>

                      {pairingMode === 'code' ? (
                        <>
                          <h2 className="text-2xl font-mono font-extrabold tracking-widest text-emerald-700 text-center my-3">
                            {liveStatus.pairingCode}
                          </h2>
                          <div className="flex justify-center gap-2">
                            <button className="btn soft" onClick={copyToClipboard}>
                              <Copy size={13} /> {isCopied ? (isBn ? 'কপি হয়েছে!' : 'Copied!') : t.copyCodeBtn}
                            </button>
                            <button
                              className="btn outline"
                              onClick={() => handleStartPairing(true)}
                              disabled={isPairingLoading}
                            >
                              <RefreshCw size={13} /> {t.getNewCodeBtn}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="my-3 text-center">
                          {liveStatus.qrCode ? (
                            <img
                              src={liveStatus.qrCode}
                              alt="WhatsApp QR Code"
                              className="w-48 h-48 mx-auto  border border-gray-200 p-1 bg-white shadow-xs"
                            />
                          ) : (
                            <p className="text-xs text-gray-500 py-4">QR Loading...</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* GROUPS PAGE */}
          {activePage === 'groups' && (
            <section className="page active" id="groups">
              <div className="page-head">
                <div>
                  <h1>{t.groupsTitle}</h1>
                  <p>{t.groupsSub}</p>
                </div>
                <button
                  className={`btn primary ${isGroupsLoading ? 'is-loading' : ''}`}
                  onClick={loadGroups}
                >
                  <RefreshCw size={13} />
                  <span className="btn-text">{t.refresh}</span>
                </button>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Connected Groups</h3>
                    <p>Group details from live WhatsApp session</p>
                  </div>
                  <div className="symbol sb">
                    <Users size={16} />
                  </div>
                </div>

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
                        groups.map((g) => (
                          <tr key={g.id}>
                            <td>
                              <b>{g.name}</b>
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">{g.id}</p>
                            </td>
                            <td>{g.participants} members</td>
                            <td>
                              <span className="status-tag good">
                                <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                {t.protectedBadge}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="empty">
                            No groups found
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
                  <h1>AI Control Center</h1>
                  <p>Manage API key rotation, provider failover, and system health.</p>
                </div>
              </div>

              <div className="grid2 !mb-6">
                 {/* AI System Health Card */}
                 <div className="card !bg-emerald-700 !text-white border-0 shadow-xl overflow-hidden relative">
                    <div className="absolute top-[-20px] right-[-20px] opacity-10 rotate-12">
                       <Cpu size={120} />
                    </div>
                    <div className="card-head !border-emerald-600/30">
                       <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white/20 ">
                             <ShieldCheck size={18} className="text-white" />
                          </div>
                          <div>
                             <h3 className="!text-white font-bold">AI System Health</h3>
                             <p className="!text-emerald-100 text-[10px]">Real-time key pool monitoring</p>
                          </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mt-4">
                       <div className="text-center p-2 bg-white/10 ">
                          <div className="text-xl font-black">{settings.aiKeys?.length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-70 tracking-widest">Pool</div>
                          <div className="text-[7px] font-bold opacity-50 mt-0.5">(মোট কি)</div>
                       </div>
                       <div className="text-center p-2 bg-white/20  border border-white/20">
                          <div className="text-xl font-black">{settings.aiKeys?.filter(k => k.status === 'active').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-90 tracking-widest">Active</div>
                          <div className="text-[7px] font-bold opacity-60 mt-0.5">(সচল)</div>
                       </div>
                       <div className="text-center p-2 bg-amber-500/30  border border-amber-400/30">
                          <div className="text-xl font-black">{settings.aiKeys?.filter(k => k.status === 'exhausted' || k.status === 'cooldown').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-90 tracking-widest">Busy</div>
                          <div className="text-[7px] font-bold opacity-60 mt-0.5">(কোটা শেষ)</div>
                       </div>
                       <div className="text-center p-2 bg-rose-500/30  border border-rose-400/30">
                          <div className="text-xl font-black">{settings.aiKeys?.filter(k => k.status === 'invalid').length || 0}</div>
                          <div className="text-[8px] font-bold uppercase opacity-90 tracking-widest">Faulty</div>
                          <div className="text-[7px] font-bold opacity-60 mt-0.5">(ভুল কি)</div>
                       </div>
                    </div>

                    <div className="mt-5 p-2.5 bg-black/20  border border-white/10 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2  ${settings.aiAutoRotate ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                          <span className="text-[10px] font-bold">Auto-Rotation: <span className={settings.aiAutoRotate ? 'text-emerald-300' : 'text-slate-300'}>{settings.aiAutoRotate ? 'ACTIVE (চালু)' : 'OFF (বন্ধ)'}</span></span>
                       </div>
                       {(() => {
                          const activeKey = (settings.aiKeys || [])
                            .filter(k => k.status === 'active')
                            .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
                          return activeKey ? (
                             <div className="text-right">
                                <div className="text-[8px] opacity-50 font-bold uppercase tracking-tighter line-clamp-1">Current Engine</div>
                                <div className="text-[9px] font-mono bg-white/10 px-2 py-0.5 text-white/80">{activeKey.provider.toUpperCase()} #{activeKey.label.split(' ')[0]}</div>
                             </div>
                          ) : (
                             <span className="text-[9px] font-mono opacity-60">LEGACY MODE</span>
                          );
                       })()}
                    </div>
                 </div>

                 {/* System Incident Logs */}
                 <div className="card">
                    <div className="card-head">
                       <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-rose-50 ">
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
                             <div key={k.id} className="p-2.5 bg-slate-50  border border-slate-200 flex items-start gap-3 group hover:border-rose-200 transition-colors">
                                <div className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter shrink-0 mt-0.5 shadow-sm ${
                                   k.provider === 'gemini' ? 'bg-emerald-100 text-emerald-700' :
                                   k.provider === 'groq' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                   {k.provider}
                                </div>
                                <div className="flex-1 min-w-0">
                                   <div className="text-[10px] font-extrabold text-slate-700 flex items-center gap-1.5">
                                      {k.label}
                                      <span className="w-1 h-1  bg-slate-300" />
                                      <span className="text-[8px] font-bold text-rose-500 uppercase tracking-tight">System Error</span>
                                   </div>
                                   <div className="text-[10px] text-slate-500 leading-relaxed font-mono bg-white/50 p-1.5 mt-1 border border-slate-100 break-words line-clamp-3 group-hover:line-clamp-none transition-all">
                                      {k.lastError}
                                   </div>
                                </div>
                             </div>
                          ))
                       ) : (
                          <div className="h-[140px] flex flex-col items-center justify-center text-slate-300 gap-3">
                             <div className="w-12 h-12 bg-slate-50  flex items-center justify-center border border-slate-100">
                                <CheckCircle2 size={24} className="opacity-20 text-emerald-500" />
                             </div>
                             <div className="text-center">
                                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">System Normal</span>
                                <span className="text-[9px] text-slate-300">No AI failures or failover events recorded.</span>
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
                  <div className="bg-[#f2f8f5] p-3  border border-emerald-100">
                    <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                                    <div className={`w-2 h-2  ${
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
                  <div className="p-4 bg-emerald-50/50  border border-emerald-100">
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
                             <div key={p} className="flex items-center justify-between p-2 bg-white border border-slate-200  shadow-sm">
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-bold w-4">#{i+1}</span>
                                  <div className={`w-2 h-2  ${
                                    p === 'gemini' ? 'bg-indigo-500' : p === 'groq' ? 'bg-orange-500' : 'bg-blue-500'
                                  }`} />
                                  <span className="text-[11px] font-bold capitalize">{p}</span>
                               </div>
                               <div className="flex gap-1">
                                  <button 
                                    type="button"
                                    className="p-1.5 hover:bg-slate-100 text-slate-500 disabled:opacity-20 transition-colors" 
                                    onClick={() => moveProviderUp(i)}
                                    disabled={i === 0}
                                    title="Move Up"
                                  >
                                     <ChevronUp size={14} />
                                  </button>
                                  <button 
                                    type="button"
                                    className="p-1.5 hover:bg-slate-100 text-slate-500 disabled:opacity-20 transition-colors" 
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
                     <div className="flex items-center justify-between p-3 bg-slate-50  border border-slate-200">
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
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="badge badge-blue text-[9px] font-bold">CATEGORY F</span>
                      <span className="text-[10px] text-gray-500 font-semibold">{isBn ? 'সার্ভার ও সিস্টেম সংযোগ' : 'Server & System Status'}</span>
                    </div>
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
              <div className="card border border-emerald-300 bg-emerald-50/70">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-white  border border-emerald-200">
                      <b>✅ 1. Relative Asset Path:</b> <code>base: &#39;./&#39;</code> কনফিগার করা হয়েছে।
                    </div>
                    <div className="p-2 bg-white  border border-emerald-200">
                      <b>✅ 2. Trailing Slash Enforcer:</b> <code>index.html</code> এ স্বয়ংক্রিয় রিডাইরেক্ট কোড যুক্ত।
                    </div>
                    <div className="p-2 bg-white  border border-emerald-200">
                      <b>✅ 3. Jekyll Bypass:</b> <code>.nojekyll</code> ফাইল যুক্ত যাতে কোনো ফাইল মিসিং না হয়।
                    </div>
                    <div className="p-2 bg-white  border border-emerald-200">
                      <b>✅ 4. SPA 404 Routing:</b> <code>404.html</code> দেওয়া হয়েছে যাতে রিফ্রেশে পেজ না হারায়।
                    </div>
                  </div>

                  <p className="pt-1">
                    <b>💡 গুরুত্বপূর্ণ নোট (Anti-Ban টিপস):</b> ফ্রি Render (`onrender.com`) সার্ভার প্রতি ১৫ মিনিটে স্লিপ করে এবং শেয়ার্ড IP থেকে বারবার সেশন রিসেট করায় WhatsApp টেম্পোরারি ব্যান দেয়। ২৪/৭ নিরাপদ ও ব্যান-মুক্ত সংযোগের জন্য প্রজেক্টটি <b>Google Cloud Run</b>-এ (রিপোতে থাকা `Dockerfile` দিয়ে) অথবা নিজের ফোনের <b>Termux</b> (`http://127.0.0.1:3000`)-এ চালিয়ে উপরের <b>Baileys Socket Server URL</b> বক্সে সেভ করুন।
                  </p>

                  <div className="p-2.5 bg-white  border border-emerald-200 font-mono text-[11px] text-gray-800">
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
          onClick={() => setActivePage('home')}
        >
          <LayoutDashboard size={16} /> {t.home}
        </button>
        <button
          className={activePage === 'security' ? 'active' : ''}
          onClick={() => {
            setActivePage('security');
            loadModerationData();
          }}
        >
          <ShieldCheck size={16} /> {t.security}
        </button>
        <button
          className={activePage === 'maya' ? 'active' : ''}
          onClick={() => {
            setActivePage('maya');
            loadModerationData();
          }}
        >
          <Heart size={16} /> {t.maya}
        </button>
        <button
          className={activePage === 'integrations' ? 'active' : ''}
          onClick={() => setActivePage('integrations')}
        >
          <Plug size={16} /> {t.integrations}
        </button>
        <button
          className={activePage === 'pairing' ? 'active' : ''}
          onClick={() => setActivePage('pairing')}
        >
          <Smartphone size={16} /> {t.connect}
        </button>
        <button
          className={activePage === 'groups' ? 'active' : ''}
          onClick={() => {
            setActivePage('groups');
            loadGroups();
          }}
        >
          <Users size={16} /> {t.groups}
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
    </div>
  );
}
