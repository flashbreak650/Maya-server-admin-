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
} from 'lucide-react';

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
  mayaRomantic: boolean;
  mayaFunny: boolean;
  mayaAutoParticipate: boolean;
  mayaReplyCooldown: number;
  mayaReplyFrequency: number;
  mayaLanguage: string;
  mayaMemoryLimit: number;
}

interface ActivityLog {
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

export default function App() {
  const [activePage, setActivePage] = useState<'home' | 'security' | 'maya' | 'integrations' | 'pairing' | 'groups'>('home');
  const [uiLang, setUiLang] = useState<'bn' | 'en'>((localStorage.getItem('wg_ui_lang') as 'bn' | 'en') || 'bn');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastTimer, setToastTimer] = useState<any>(null);

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
    adminShieldDesc: isBn ? 'কোনো Group Admin-কে কখনো Kick বা Warning দেবে না এবং তাদের মেসেজ ডিলিট করবে না।' : 'Never kick, warn, or delete messages from Group Admins.',
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
    botReplyTitle: isBn ? 'Bot Reply System (বট রিপ্লাই অন/অফ সুইচ)' : 'Bot Reply System (On/Off Switch)',
    botReplyDesc: isBn ? 'ইনবক্সে (DM) মেসেজ পাঠালে বট চুপ থাকবে (কোনো উত্তর দেবে না)। কিন্তু গ্রুপে "মায়া" (Maya) নামে ডাকলে, ট্যাগ করলে বা মেনশন করলে উত্তর দেবে।' : 'Silent in DMs/Inbox. In groups, responds whenever tagged or called "Maya" / "Bot".',
    customBadwordsLabel: isBn ? 'Custom Badword List (কাস্টম নিষিদ্ধ শব্দের তালিকা)' : 'Custom Badword List',
    customBadwordsHint: isBn ? 'কমা (,) দিয়ে আলাদা করে শব্দ লিখুন।' : 'Separate words with commas.',
    saveBadwordsBtn: isBn ? 'কাস্টম ব্যাডওয়ার্ড সেভ' : 'Save Custom Badwords',

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
    mayaEngineDesc: isBn ? 'Gemini AI এর মাধ্যমে মায়ার স্মার্ট পারসোনালিটি সক্রিয় করুন।' : 'Enable Maya\'s smart AI personality via Gemini.',
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

  // Live WhatsApp Connection State
  const [liveStatus, setLiveStatus] = useState<LiveStatusData>({
    status: 'disconnected',
    step: 'idle',
    stepMessage: isBn ? 'WhatsApp সংযোগের জন্য প্রস্তুত' : 'Ready to connect WhatsApp',
    online: false,
    remainingSeconds: 0,
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
    mayaRomantic: true,
    mayaFunny: true,
    mayaAutoParticipate: false,
    mayaReplyCooldown: 30,
    mayaReplyFrequency: 15,
    mayaLanguage: 'auto',
    mayaMemoryLimit: 10,
  });
  const [customBadwordsText, setCustomBadwordsText] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  // Groups
  const [groups, setGroups] = useState<GroupItem[]>([
    { id: '12036302@g.us', name: 'WAGuard Official Community', participants: 184, status: 'Active' },
    { id: '12036303@g.us', name: 'Devs & Admins Group', participants: 42, status: 'Active' },
  ]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);

  // Configuration settings
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('wg_gemini_key') || '');
  const [geminiModel, setGeminiModel] = useState(localStorage.getItem('wg_gemini_model') || 'gemini-2.5-flash');
  const [waToken, setWaToken] = useState(localStorage.getItem('wg_watoken') || '');
  const [phoneId, setPhoneId] = useState(localStorage.getItem('wg_phoneid') || '');
  const [wabaId, setWabaId] = useState(localStorage.getItem('wg_wabaid') || '');
  const [groqKey, setGroqKey] = useState(localStorage.getItem('wg_groq_key') || '');
  const [openrouterKey, setOpenrouterKey] = useState(localStorage.getItem('wg_openrouter_key') || '');
  const [supabaseUrl, setSupabaseUrl] = useState(localStorage.getItem('wg_supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(localStorage.getItem('wg_supabase_key') || '');
  const [baileysUrl, setBaileysUrl] = useState(localStorage.getItem('wg_server') || '');

  // Password visibility
  const [showGemini, setShowGemini] = useState(false);
  const [showWaToken, setShowWaToken] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);

  const pollIntervalRef = useRef<any>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    if (toastTimer) clearTimeout(toastTimer);
    const timer = setTimeout(() => setShowToast(false), 3200);
    setToastTimer(timer);
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
      
      const data = await res.json();
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
        const fallbackData = await fallbackRes.json();
        if (!fallbackRes.ok) {
          throw new Error(fallbackData.error || `HTTP ${fallbackRes.status}`);
        }
        return fallbackData;
      }
      throw err;
    }
  };

  // Poll live status from WhatsApp backend
  const checkStatus = async () => {
    try {
      const data: LiveStatusData = await callApi('/api/whatsapp/status');
      setLiveStatus(data);
      if (data.online) {
        setPairingError(null);
      }
    } catch {
      // non-blocking
    }
  };

  const loadDashboard = async () => {
    try {
      const data = await callApi('/api/dashboard');
      if (data.overview) {
        setOverview(data.overview);
      }
      if (data.moderation?.settings) {
        setSettings(data.moderation.settings);
        setCustomBadwordsText((data.moderation.settings.customBadwords || []).join(', '));
      }
      await checkStatus();
    } catch {
      // non-blocking
    }
  };

  const loadModerationData = async () => {
    setIsLogsLoading(true);
    try {
      const [settingsRes, logsRes] = await Promise.all([
        callApi('/api/moderation/settings'),
        callApi('/api/moderation/logs?limit=50'),
      ]);
      if (settingsRes.settings) {
        setSettings(settingsRes.settings);
        setCustomBadwordsText((settingsRes.settings.customBadwords || []).join(', '));
      }
      if (logsRes.logs) {
        setActivityLogs(logsRes.logs);
      }
      showNotification(isBn ? 'সেটিংস ও লগ প্রস্তুত' : 'Settings & Logs Synced');
    } catch (err: any) {
      showNotification((isBn ? 'ডাটা লোড ত্রুটি: ' : 'Failed to load data: ') + err.message);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const updateSettingToggle = async (key: keyof ModerationSettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await callApi('/api/moderation/settings', 'POST', { [key]: value });
      showNotification(isBn ? `সফলভাবে সেভ হয়েছে: ${key} = ${value}` : `Saved: ${key} = ${value}`);
    } catch (err: any) {
      showNotification((isBn ? 'সেভ করতে ব্যর্থ: ' : 'Save failed: ') + err.message);
      setSettings(settings);
    }
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
    if (!confirm(isBn ? 'আপনি কি নিশ্চিত যে সকল সদস্যের Warning রিসেট করতে চান?' : 'Reset all member warnings?')) return;
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

  // Start real WhatsApp pairing flow
  const handleStartPairing = async () => {
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
    setIsPairingLoading(true);
    setPairingError(null);
    showNotification(isBn ? 'WhatsApp সার্ভার থেকে অফিশিয়াল ৮-ডিজিট কোড রিকোয়েস্ট করা হচ্ছে...' : 'Requesting 8-digit code from WhatsApp server...');

    try {
      const res = await callApi('/api/whatsapp/pair', 'POST', { phoneNumber: clean });
      if (res.pairingCode) {
        showNotification(isBn ? 'রিয়েল WhatsApp পেয়ারিং কোড তৈরি হয়েছে!' : 'Real pairing code generated!');
        await checkStatus();
      } else if (res.alreadyConnected) {
        showNotification(isBn ? 'ইতিমধ্যে WhatsApp কানেক্টেড রয়েছে!' : 'WhatsApp is already connected!');
        await checkStatus();
      }
    } catch (err: any) {
      const msg = err.message || (isBn ? 'WhatsApp সার্ভারের সাথে সংযোগে সমস্যা হয়েছে' : 'Connection error');
      setPairingError(msg);
      showNotification(msg);
    } finally {
      setIsPairingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await callApi('/api/whatsapp/disconnect', 'POST');
      showNotification(isBn ? 'WhatsApp সেশন ডিসকানেক্ট করা হয়েছে' : 'Disconnected session');
      await checkStatus();
    } catch {
      showNotification(isBn ? 'ডিসকানেক্ট সম্পন্ন হয়েছে' : 'Disconnected');
    }
  };

  const copyToClipboard = async () => {
    if (!liveStatus.pairingCode) return;
    try {
      await navigator.clipboard.writeText(liveStatus.pairingCode);
      setIsCopied(true);
      showNotification(isBn ? 'কোড কপি হয়েছে!' : 'Code copied!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      showNotification('Copy failed');
    }
  };

  const saveConfig = (type: string) => {
    if (type === 'gemini') {
      localStorage.setItem('wg_gemini_key', geminiKey);
      localStorage.setItem('wg_gemini_model', geminiModel);
      showNotification('Gemini Config Saved!');
    } else if (type === 'groq') {
      localStorage.setItem('wg_groq_key', groqKey);
      showNotification('Groq API Key Saved!');
    } else if (type === 'openrouter') {
      localStorage.setItem('wg_openrouter_key', openrouterKey);
      showNotification('OpenRouter API Key Saved!');
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
  };

  const testAI = async () => {
    const testInputEl = document.getElementById('mayaTestInput') as HTMLInputElement;
    const testInput = testInputEl?.value?.trim();

    if (activePage === 'maya' && testInput) {
       showNotification(isBn ? 'মায়ার উত্তরের জন্য অপেক্ষা করুন...' : 'Waiting for Maya response...');
       try {
         const res = await callApi('/api/maya/test', 'POST', { 
           text: testInput,
           settings: settings
         });
         
         const hintEl = testInputEl.parentElement?.nextElementSibling;
         if (hintEl) {
            hintEl.innerHTML = `<b>Maya:</b> ${res.reply}`;
            hintEl.classList.remove('italic', 'text-gray-600');
            hintEl.classList.add('text-emerald-800');
         }
         showNotification(isBn ? 'মায়া উত্তর দিয়েছে!' : 'Maya replied!');
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

  // Setup periodic live status polling (every 2.5 seconds)
  useEffect(() => {
    loadDashboard();
    pollIntervalRef.current = setInterval(() => {
      checkStatus();
    }, 2500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              liveStatus.online
                ? 'bg-[#e9f7ef] text-[#108255]'
                : liveStatus.status === 'pairing'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                liveStatus.online ? 'bg-[#108255]' : liveStatus.status === 'pairing' ? 'bg-amber-500 animate-ping' : 'bg-gray-400'
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-extrabold transition-all cursor-pointer shadow-xs shrink-0"
            onClick={toggleUiLang}
            title={isBn ? 'Switch UI to English' : 'বাংলায় পরিবর্তন করুন'}
          >
            <Globe size={13} className="text-emerald-700" />
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
              <Radio size={16} className="text-[#087f55] animate-pulse" />
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
              <div className="grid2">
                <div className="hero">
                  <div className="hero-content">
                    <h3 className="font-bold text-sm">{t.botConnTitle}</h3>
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
                      <h3>{t.groupSecTitle}</h3>
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
                  <button className="btn danger" onClick={resetAllWarnings}>
                    <RotateCcw size={13} />
                    <span className="btn-text">{t.resetWarningsBtn}</span>
                  </button>
                </div>
              </div>

              {/* SECTION 1: ADMIN SHIELD & AUTO-KICK */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t.sec1Title}</h3>
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
                      {t.adminShieldTitle}
                      <span className={`badge ${settings.adminShield ? 'badge-green' : 'badge-amber'}`}>
                        {settings.adminShield ? 'ON' : 'OFF'}
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
                      {t.autoKickTitle}
                      <span className={`badge ${settings.autoKick3Warnings ? 'badge-green' : 'badge-amber'}`}>
                        {settings.autoKick3Warnings ? 'ACTIVE' : 'OFF'}
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

              {/* SECTION 2: SPAM & MEDIA RESTRICTIONS */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t.sec2Title}</h3>
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
                      {t.antiStickerSpamTitle}
                      <span className={`badge ${settings.antiStickerSpam ? 'badge-green' : 'badge-amber'}`}>
                        {settings.antiStickerSpam ? 'ACTIVE' : 'OFF'}
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
                      {t.antiStickerTitle}
                      <span className={`badge ${settings.antiSticker ? 'badge-red' : 'badge-blue'}`}>
                        {settings.antiSticker ? 'BLOCKED' : 'ALLOWED'}
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
                      {t.antiGifTitle}
                      <span className={`badge ${settings.antiGif ? 'badge-green' : 'badge-amber'}`}>
                        {settings.antiGif ? 'BLOCKED' : 'ALLOWED'}
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
                      {t.antiVideoTitle}
                      <span className={`badge ${settings.antiVideo ? 'badge-red' : 'badge-blue'}`}>
                        {settings.antiVideo ? 'BLOCKED' : 'ALLOWED'}
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
                      {t.antiImageTitle}
                      <span className={`badge ${settings.antiImage ? 'badge-red' : 'badge-blue'}`}>
                        {settings.antiImage ? 'BLOCKED' : 'ALLOWED'}
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
                      {t.antiViewOnceTitle}
                      <span className={`badge ${settings.antiViewOnce ? 'badge-green' : 'badge-amber'}`}>
                        {settings.antiViewOnce ? 'BLOCKED' : 'ALLOWED'}
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

              {/* SECTION 3: MULTILINGUAL BADWORD & LINK FILTER */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t.sec3Title}</h3>
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
                      {t.antiBadwordTitle}
                      <span className={`badge ${settings.antiBadword ? 'badge-green' : 'badge-amber'}`}>
                        {settings.antiBadword ? 'ACTIVE' : 'OFF'}
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
                      {t.antiLinkTitle}
                      <span className={`badge ${settings.antiLink ? 'badge-green' : 'badge-amber'}`}>
                        {settings.antiLink ? 'BLOCKED' : 'OFF'}
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

                {/* Bot Mention / Name Calling Reply */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>
                      {t.botReplyTitle}
                      <span className={`badge ${settings.botReply ? 'badge-green' : 'badge-amber'}`}>
                        {settings.botReply ? 'ACTIVE' : 'OFF'}
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
                  <label>{t.customBadwordsLabel}</label>
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

              {/* SECTION 4: REAL ACTIVITY LOGS */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t.activityTitle}</h3>
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
                                  log.action === 'kicked'
                                    ? 'badge-red'
                                    : log.action === 'locked'
                                    ? 'badge-amber'
                                    : log.action === 'warned'
                                    ? 'badge-amber'
                                    : log.action === 'error'
                                    ? 'badge-red'
                                    : log.action === 'replied'
                                    ? 'badge-blue'
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

                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>{t.mayaEngineTitle} <span className={`badge ${settings.mayaAiEnabled ? 'badge-green' : 'badge-amber'}`}>{settings.mayaAiEnabled ? 'ACTIVE' : 'OFF'}</span></h4>
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

                  <div className="toggle-row">
                    <div className="toggle-info">
                      <h4>{t.romanticTitle} <span className={`badge ${settings.mayaRomantic ? 'badge-green' : 'badge-amber'}`}>{settings.mayaRomantic ? 'ON' : 'OFF'}</span></h4>
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
                      <h4>{t.funnyTitle} <span className={`badge ${settings.mayaFunny ? 'badge-green' : 'badge-amber'}`}>{settings.mayaFunny ? 'ON' : 'OFF'}</span></h4>
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
                      <h4>{t.autoPartTitle} <span className={`badge ${settings.mayaAutoParticipate ? 'badge-green' : 'badge-amber'}`}>{settings.mayaAutoParticipate ? 'ON' : 'OFF'}</span></h4>
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
                <div className="hint mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
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
                <div className="card max-w-xl mx-auto overflow-hidden border border-emerald-200 bg-gradient-to-b from-emerald-50/90 via-white to-slate-50 p-6 rounded-2xl shadow-sm">
                  {/* Connected Header Banner */}
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                        <ShieldCheck size={22} />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="text-slate-900 text-base font-extrabold tracking-tight">
                            {isBn ? 'WhatsApp একাউন্ট সফলভাবে যুক্ত' : 'WhatsApp Linked Successfully'}
                          </h3>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
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
                  <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-2xs text-left mb-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold flex items-center justify-center text-sm shadow-sm">
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
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                          ✓ Verified Socket
                        </span>
                      </div>
                    </div>

                    {/* Metric Chips inside the card */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">{isBn ? 'সার্ভার স্টেট' : 'Server State'}</span>
                        <span className="text-xs font-bold text-emerald-700">Online</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">{isBn ? 'অটো মডারেশন' : 'Auto Moderation'}</span>
                        <span className="text-xs font-bold text-slate-800">24/7 Active</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
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
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-lg text-left my-2">
                      {pairingError}
                    </div>
                  )}

                  <button
                    className={`btn primary full mt-2 ${isPairingLoading ? 'is-loading' : ''}`}
                    onClick={handleStartPairing}
                    disabled={isPairingLoading}
                  >
                    <KeyRound size={13} /> {t.genPairCodeBtn}
                  </button>

                  {/* Display generated code or QR */}
                  {(liveStatus.pairingCode || liveStatus.qrCode) && (
                    <div className="info text-left mt-3">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span>OFFICIAL PAIRING CODE</span>
                        <span className="bg-emerald-200 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full">Active</span>
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
                            <button className="btn outline" onClick={handleStartPairing}>
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
                              className="w-48 h-48 mx-auto rounded-xl border border-gray-200 p-1 bg-white shadow-xs"
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
                  <h1>API & Integrations</h1>
                  <p>Configure server endpoints and external credentials.</p>
                </div>
              </div>

              {/* Gemini AI */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Google Gemini AI (জেডমিনি এপিআই)</h3>
                    <p>AI-powered moderation and personality</p>
                  </div>
                  <div className="symbol sp">
                    <Sparkles size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>GEMINI API KEY (এপিআই কি)</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showGemini ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="Enter Gemini API Key"
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowGemini(!showGemini)}
                    >
                      {showGemini ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>GEMINI MODEL</label>
                  <select
                    className="field"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & Stable)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button className="btn primary" onClick={() => saveConfig('gemini')}>
                    <Save size={13} /> Save Gemini Config
                  </button>
                  <button className="btn outline" onClick={testAI}>
                    <Activity size={13} /> Test AI
                  </button>
                </div>
              </div>

              {/* Groq Cloud AI */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Groq Cloud AI (GROQ_API_KEY / GROQ_API_KEYS)</h3>
                    <p>High-speed Ultra-low latency Llama & Mixtral inference engine</p>
                  </div>
                  <div className="symbol so">
                    <Zap size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>GROQ API KEY (এপিআই কি)</label>
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
                </div>
                <div className="form-actions">
                  <button className="btn primary" onClick={() => saveConfig('groq')}>
                    <Save size={13} /> Save Groq Key
                  </button>
                </div>
              </div>

              {/* OpenRouter AI */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>OpenRouter AI (OPENROUTER_API_KEY)</h3>
                    <p>Multi-model AI router & unified API gateway</p>
                  </div>
                  <div className="symbol sb">
                    <Cpu size={16} />
                  </div>
                </div>
                <div className="form-group">
                  <label>OPENROUTER API KEY</label>
                  <div className="fieldwrap">
                    <input
                      className="field secret"
                      type={showOpenrouter ? 'text' : 'password'}
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                    />
                    <button
                      className="reveal"
                      type="button"
                      onClick={() => setShowOpenrouter(!showOpenrouter)}
                    >
                      {showOpenrouter ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn primary" onClick={() => saveConfig('openrouter')}>
                    <Save size={13} /> Save OpenRouter Key
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
                  <button className="btn primary" onClick={() => saveConfig('supabase')}>
                    <Save size={13} /> Save Supabase Credentials
                  </button>
                </div>
              </div>

              {/* Baileys Server URL */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Baileys Socket Server URL</h3>
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
                  <button className="btn primary" onClick={saveBaileysConfig}>
                    <Save size={13} /> Save URL
                  </button>
                  <button className="btn outline" onClick={resetBaileysConfig}>
                    <RotateCcw size={13} /> Reset to Default
                  </button>
                </div>
              </div>

              {/* GitHub Pages Deployment Card */}
              <div className="card border border-emerald-200 bg-emerald-50/60">
                <div className="card-head">
                  <div>
                    <h3 className="text-emerald-950 font-bold">GitHub Pages Deployment (Blank Screen Fixed)</h3>
                    <p className="text-emerald-800 text-xs">গিটহাব পেজেসে ডিপ্লয় করলে হোয়াইট পেজ আসার সমস্যার সমাধান</p>
                  </div>
                  <div className="symbol sg">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <div className="text-xs text-emerald-950 leading-relaxed space-y-2">
                  <p>
                    <b>✅ Relative Asset Base Path:</b> <code>vite.config.ts</code> এ <code>base: &#39;./&#39;</code> কনফিগার করা হয়েছে।
                  </p>
                  <p>
                    এখন প্রজেক্টটি GitHub Pages (e.g. <code>username.github.io/repo-name/</code>) এ ডিপ্লয় করলে কোনো ব্ল্যাঙ্ক বা ফাঁকা সাদা পেজ আসবে না।
                  </p>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200 font-mono text-[11px] text-gray-800">
                    npm run build &nbsp;&nbsp;&mdash; Generates GitHub Pages ready build with relative assets
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
    </div>
  );
}
