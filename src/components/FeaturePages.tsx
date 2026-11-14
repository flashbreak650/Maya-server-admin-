import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  Ghost,
  Hash,
  Heart,
  KeyRound,
  Lock,
  Moon,
  PhoneOff,
  Plug,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Trophy,
  Unlock,
  UserX,
  Users,
} from 'lucide-react';

export type PageId =
  | 'home'
  | 'security'
  | 'warnings'
  | 'blocks'
  | 'logs'
  | 'nightmode'
  | 'anticall'
  | 'aivision'
  | 'activity'
  | 'keywords'
  | 'pinlock'
  | 'maya'
  | 'integrations'
  | 'pairing'
  | 'groups';

export interface KeywordTriggerItem {
  id: string;
  keyword: string;
  reply: string;
  matchType: 'exact' | 'contains';
  enabled: boolean;
  createdAt: number;
  hitCount?: number;
}

export interface CallLogViewItem {
  id: string;
  timestamp: number;
  callerJid: string;
  callerPhone: string;
  isVideo: boolean;
  status: string;
  blocked: boolean;
}

export interface MemberActivityViewItem {
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  name: string;
  messageCount: number;
  lastSeen: number;
  firstSeen: number;
  inactiveDays?: number;
}

export interface NightModeStatusView {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  notify: boolean;
  currentLocalTime: string;
  isNightWindowNow: boolean;
  lockedCount: number;
  lockedGroups: Array<{ groupId: string; groupName: string; lockedAt: number }>;
}

interface SubPageHeaderProps {
  title: string;
  subtitle: string;
  isBn: boolean;
  onBack: () => void;
  rightAction?: React.ReactNode;
}

function SubPageHeader({ title, subtitle, isBn, onBack, rightAction }: SubPageHeaderProps) {
  return (
    <div className="mb-4 pb-3 border-b border-slate-200">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} className="text-emerald-700" />
          <span>{isBn ? 'হোম পেজ' : 'Back Home'}</span>
        </button>
        {rightAction}
      </div>
      <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
        {title}
      </h1>
      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}

/* ============================================================================
 * FEATURE #1: ADMIN LOCK SCREEN MODAL OVERLAY
 * ========================================================================== */
export function AdminLockScreen({
  isBn,
  pinInput,
  setPinInput,
  authError,
  isVerifying,
  onSubmit,
}: {
  isBn: boolean;
  pinInput: string;
  setPinInput: (v: string) => void;
  authError: string | null;
  isVerifying: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [showPin, setShowPin] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[#f5f7f6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 mb-3">
            <Lock size={22} />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">
            {isBn ? 'WAGuard অ্যাডমিন লক' : 'WAGuard Admin Lock'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {isBn
              ? 'ড্যাশবোর্ডে প্রবেশ করতে আপনার গোপন পিন কোড দিন'
              : 'Enter your admin PIN to unlock the console'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
              {isBn ? 'অ্যাডমিন পিন / পাসওয়ার্ড' : 'Admin PIN / Password'}
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••••"
                autoFocus
                className="w-full min-h-[44px] px-3.5 pr-10 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none text-sm font-mono tracking-widest text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPin((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-500"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || !pinInput.trim()}
            className="w-full min-h-[44px] rounded-xl bg-[#087f55] hover:bg-[#066c49] disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Unlock size={15} />
            <span>{isVerifying ? (isBn ? 'যাচাই হচ্ছে...' : 'Unlocking...') : isBn ? 'আনলক করুন' : 'Unlock Dashboard'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * HOME PAGE: SEPARATE FEATURE BUTTON CARDS HUB (EVERY FEATURE HAS ITS OWN CARD)
 * ========================================================================== */
export function HomeFeatureHub({
  isBn,
  settings,
  activeWarningsCount,
  blocksCount,
  logsCount,
  groupsCount,
  callsCount,
  keywordsCount,
  nightStatus,
  isConnected,
  onNavigate,
  onOpenSessionBackup,
}: {
  isBn: boolean;
  settings: any;
  activeWarningsCount: number;
  blocksCount: number;
  logsCount: number;
  groupsCount: number;
  callsCount: number;
  keywordsCount: number;
  nightStatus: NightModeStatusView | null;
  isConnected: boolean;
  onNavigate: (page: PageId) => void;
  onOpenSessionBackup: () => void;
}) {
  const featureCards: Array<{
    id: PageId | 'backup';
    title: string;
    desc: string;
    statusText: string;
    isOn: boolean;
    iconBg: string;
    iconText: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    {
      id: 'security',
      title: isBn ? 'সিকিউরিটি রুলস' : 'Security Rules',
      desc: isBn ? 'স্টিকার, গালি, লিংক, ভিউ ওয়ান্স, ওয়েলকাম' : 'Anti-sticker, View-Once, Link & Welcome',
      statusText: settings.adminShield ? (isBn ? 'সুরক্ষা চালু' : 'Shield ON') : 'OFF',
      isOn: Boolean(settings.adminShield),
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-700',
      icon: <ShieldCheck size={18} />,
      onClick: () => onNavigate('security'),
    },
    {
      id: 'warnings',
      title: isBn ? 'সতর্কবার্তা (Warnings)' : 'Member Warnings',
      desc: isBn ? 'সদস্যদের ১/৩, ২/৩ ওয়ার্নিং তালিকা ও রিসেট' : 'Strike 1/3, 2/3 counters & reset',
      statusText: isBn ? `${activeWarningsCount} জন পেন্ডিং` : `${activeWarningsCount} active`,
      isOn: activeWarningsCount > 0,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-700',
      icon: <AlertTriangle size={18} />,
      onClick: () => onNavigate('warnings'),
    },
    {
      id: 'blocks',
      title: isBn ? '১০ মি. ব্লক ও লক' : '10-Min Blocks',
      desc: isBn ? 'স্প্যাম ব্লক টাইমার ও ম্যানুয়াল আনলক' : 'Live block timers & unblock',
      statusText: isBn ? `${blocksCount}টি চলমান` : `${blocksCount} active`,
      isOn: blocksCount > 0,
      iconBg: 'bg-rose-50',
      iconText: 'text-rose-700',
      icon: <Lock size={18} />,
      onClick: () => onNavigate('blocks'),
    },
    {
      id: 'logs',
      title: isBn ? 'লাইভ মডারেশন লগ' : 'Live Activity Logs',
      desc: isBn ? 'সকল ডিলিট, কিক ও লক হিস্ট্রি' : 'Filterable deletes, kicks & errors',
      statusText: isBn ? `${logsCount}টি রেকর্ড` : `${logsCount} events`,
      isOn: logsCount > 0,
      iconBg: 'bg-blue-50',
      iconText: 'text-blue-700',
      icon: <Activity size={18} />,
      onClick: () => onNavigate('logs'),
    },
    {
      id: 'nightmode',
      title: isBn ? 'শিডিউল নাইট মোড' : 'Scheduled Night Mode',
      desc: isBn ? 'নির্ধারিত রাতে গ্রুপ অটো লক ও সকালে আনলক' : 'Auto quiet-hours group lock',
      statusText: settings.nightModeEnabled
        ? `${settings.nightLockStart || '00:00'}–${settings.nightLockEnd || '06:00'}`
        : isBn
        ? 'বন্ধ আছে'
        : 'OFF',
      isOn: Boolean(settings.nightModeEnabled || nightStatus?.isNightWindowNow),
      iconBg: 'bg-indigo-50',
      iconText: 'text-indigo-700',
      icon: <Moon size={18} />,
      onClick: () => onNavigate('nightmode'),
    },
    {
      id: 'anticall',
      title: isBn ? 'অ্যান্টি-কল সুরক্ষা' : 'Anti-Call Shield',
      desc: isBn ? 'কল অটো-রিজেক্ট ও বারবার কলে অটো-ব্লক' : 'Auto-reject calls & repeat block',
      statusText: settings.antiCallEnabled
        ? isBn
          ? `চালু · ${callsCount} রিজেক্ট`
          : `Active · ${callsCount}`
        : isBn
        ? 'বন্ধ আছে'
        : 'OFF',
      isOn: Boolean(settings.antiCallEnabled),
      iconBg: 'bg-rose-50',
      iconText: 'text-rose-700',
      icon: <PhoneOff size={18} />,
      onClick: () => onNavigate('anticall'),
    },
    {
      id: 'aivision',
      title: isBn ? 'ভয়েস ও ছবি AI' : 'Maya Voice & Vision',
      desc: isBn ? 'ভয়েস নোট শোনা, ছবি দেখা ও Anti-NSFW' : 'Voice notes, images & NSFW guard',
      statusText:
        settings.mayaVoiceEnabled || settings.mayaVisionEnabled || settings.antiNsfwImage
          ? isBn
            ? 'Gemini AI চালু'
            : 'Multimodal ON'
          : isBn
          ? 'বন্ধ আছে'
          : 'OFF',
      isOn: Boolean(settings.mayaVoiceEnabled || settings.mayaVisionEnabled),
      iconBg: 'bg-teal-50',
      iconText: 'text-teal-700',
      icon: <ScanEye size={18} />,
      onClick: () => onNavigate('aivision'),
    },
    {
      id: 'activity',
      title: isBn ? 'অ্যাক্টিভিটি র‍্যাংক' : 'Activity & Ghosts',
      desc: isBn ? 'টপ অ্যাক্টিভ তালিকা, .top ও Ghost মেম্বার' : 'Top rank leaderboard & inactive list',
      statusText: settings.activityTrackingEnabled !== false ? (isBn ? 'ট্র্যাকিং চালু' : 'Tracking ON') : 'OFF',
      isOn: settings.activityTrackingEnabled !== false,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-700',
      icon: <Trophy size={18} />,
      onClick: () => onNavigate('activity'),
    },
    {
      id: 'keywords',
      title: isBn ? 'কীওয়ার্ড অটো-রিপ্লাই' : 'Keyword Auto-Reply',
      desc: isBn ? 'AI ছাড়াই ফিক্সড প্রশ্ন-উত্তর সিস্টেম' : 'Zero-cost instant keyword triggers',
      statusText: settings.keywordAutoReplyEnabled
        ? isBn
          ? `${keywordsCount}টি রুল চালু`
          : `${keywordsCount} triggers`
        : isBn
        ? 'বন্ধ আছে'
        : 'OFF',
      isOn: Boolean(settings.keywordAutoReplyEnabled),
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-700',
      icon: <Hash size={18} />,
      onClick: () => onNavigate('keywords'),
    },
    {
      id: 'pinlock',
      title: isBn ? 'অ্যাডমিন পিন লক' : 'Admin PIN Lock',
      desc: isBn ? 'পাবলিক লিংক গোপন পিন দিয়ে সুরক্ষিত রাখুন' : 'Protect dashboard with secret PIN',
      statusText: settings.dashboardPinEnabled ? (isBn ? 'লক সক্রিয়' : 'PIN Locked') : isBn ? 'সেট নেই' : 'Unlocked',
      isOn: Boolean(settings.dashboardPinEnabled),
      iconBg: 'bg-slate-100',
      iconText: 'text-slate-700',
      icon: <KeyRound size={18} />,
      onClick: () => onNavigate('pinlock'),
    },
    {
      id: 'maya',
      title: isBn ? 'মায়া AI চ্যাট ও মুড' : 'Maya AI Companion',
      desc: isBn ? 'রোমান্টিক, ফানি মুড, ভাষা ও টেস্ট চ্যাট' : 'Personality, language & sandbox',
      statusText: settings.mayaAiEnabled ? (isBn ? 'সক্রিয়' : 'Active') : 'OFF',
      isOn: Boolean(settings.mayaAiEnabled),
      iconBg: 'bg-pink-50',
      iconText: 'text-pink-700',
      icon: <Heart size={18} />,
      onClick: () => onNavigate('maya'),
    },
    {
      id: 'integrations',
      title: isBn ? 'API কী ও সার্ভার' : 'API Keys & Server',
      desc: isBn ? 'Gemini, Groq, OpenRouter কী রোটেশন' : 'Key pool rotation & server URL',
      statusText: isBn ? `${settings.aiKeys?.length || 0}টি কী সেভ` : `${settings.aiKeys?.length || 0} keys`,
      isOn: (settings.aiKeys?.length || 0) > 0,
      iconBg: 'bg-sky-50',
      iconText: 'text-sky-700',
      icon: <Plug size={18} />,
      onClick: () => onNavigate('integrations'),
    },
    {
      id: 'groups',
      title: isBn ? 'কানেক্টেড গ্রুপ' : 'Connected Groups',
      desc: isBn ? 'বট যুক্ত সব গ্রুপ ও মেম্বার সংখ্যা দেখুন' : 'View protected WhatsApp groups',
      statusText: isBn ? `${groupsCount}টি গ্রুপ` : `${groupsCount} groups`,
      isOn: groupsCount > 0,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-700',
      icon: <Users size={18} />,
      onClick: () => onNavigate('groups'),
    },
    {
      id: 'pairing',
      title: isBn ? 'WhatsApp কানেক্ট' : 'Connect Device',
      desc: isBn ? '৮-ডিজিট পেয়ারিং কোড ও QR স্ক্যান' : '8-digit pairing code & QR link',
      statusText: isConnected ? (isBn ? 'কানেক্টেড' : 'Connected') : isBn ? 'সংযোগ দিন' : 'Link now',
      isOn: isConnected,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-700',
      icon: <Smartphone size={18} />,
      onClick: () => onNavigate('pairing'),
    },
    {
      id: 'backup',
      title: isBn ? 'সেশন ব্যাকআপ ও রিস্টোর' : 'Session Backup',
      desc: isBn ? 'কোড ছাড়াই অন্য হোস্টিংয়ে বট ট্রান্সফার' : 'Encrypted export & restore JSON',
      statusText: isBn ? 'AES-256 সুরক্ষা' : 'Zero-ban transfer',
      isOn: true,
      iconBg: 'bg-teal-50',
      iconText: 'text-teal-700',
      icon: <Download size={18} />,
      onClick: onOpenSessionBackup,
    },
  ];

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
            {isBn ? 'সব ফিচার কন্ট্রোল প্যানেল' : 'All Features & Control Pages'}
          </h2>
          <p className="text-[11px] text-slate-500">
            {isBn ? 'যেকোনো ফিচারে ট্যাপ করে তার আলাদা পেজে প্রবেশ করুন' : 'Tap any card to open its dedicated page'}
          </p>
        </div>
        <span className="text-[11px] font-bold text-emerald-700 tabular-nums shrink-0">
          {featureCards.length} {isBn ? 'টি ফিচার' : 'Features'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {featureCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            className="group text-left min-h-[116px] p-3.5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-400 active:scale-[0.98] transition-all flex flex-col justify-between cursor-pointer shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`w-9 h-9 rounded-xl ${card.iconBg} ${card.iconText} flex items-center justify-center shrink-0`}>
                  {card.icon}
                </span>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
              </div>
              <div className="text-xs sm:text-[13px] font-extrabold text-slate-900 leading-snug">
                {card.title}
              </div>
              <p className="text-[10.5px] text-slate-500 mt-1 leading-snug line-clamp-2">
                {card.desc}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10.5px] font-bold tabular-nums flex items-center justify-between gap-1">
              <span className={card.isOn ? 'text-emerald-700' : 'text-slate-400'}>{card.statusText}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * DEDICATED WARNINGS PAGE
 * ========================================================================== */
export function WarningsPage({
  isBn,
  activeWarnings,
  isLoading,
  onBack,
  onRefresh,
  onResetSingle,
  onResetAll,
  onGoToLogs,
}: {
  isBn: boolean;
  activeWarnings: any[];
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onResetSingle: (key: string) => void;
  onResetAll: () => void;
  onGoToLogs: () => void;
}) {
  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'সতর্কবার্তা (Member Warnings)' : 'Active Member Warnings'}
        subtitle={
          isBn
            ? 'প্রতিটি গ্রুপের সদস্যের ১/৩, ২/৩ ও ৩/৩ ওয়ার্নিং ও কারণের বিস্তারিত কার্ড'
            : 'Detailed 1/3, 2/3, 3/3 warning strikes across protected groups'
        }
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <div className="flex items-center gap-2">
            <button type="button" className="btn outline" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </button>
            <button type="button" className="btn danger" onClick={onResetAll}>
              <RotateCcw size={12} /> {isBn ? 'সব রিসেট' : 'Reset All'}
            </button>
          </div>
        }
      />

      {activeWarnings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeWarnings.map((w) => (
            <div key={w.key} className="p-4 rounded-2xl border border-amber-200 bg-white shadow-2xs flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-extrabold text-slate-900 break-all tabular-nums">
                      @{w.senderPhone}
                    </span>
                    <span className={`text-[11px] font-extrabold tabular-nums ${w.count >= 3 ? 'text-rose-600' : 'text-amber-700'}`}>
                      · {isBn ? `সতর্কতা ${w.count}/${w.maxWarnings}` : `Strike ${w.count}/${w.maxWarnings}`}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-1 break-words">
                    {w.groupName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isBn ? 'সর্বশেষ:' : 'Last:'} {new Date(w.lastViolation).toLocaleString()}
                  </p>
                </div>
                <button type="button" className="btn outline shrink-0" onClick={() => onResetSingle(w.key)}>
                  <RotateCcw size={12} /> {isBn ? 'রিসেট' : 'Reset'}
                </button>
              </div>
              {w.violations?.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                  {w.violations.map((v: any, idx: number) => (
                    <div key={idx} className="text-[11px] text-slate-700 flex items-start justify-between gap-2">
                      <span className="font-medium break-words">• {v.reason}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
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
        <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center space-y-3">
          <AlertTriangle size={28} className="mx-auto text-amber-500 opacity-70" />
          <p className="text-xs text-slate-600">
            {isBn
              ? 'বর্তমানে কোনো সদস্যের পেন্ডিং ওয়ার্নিং (১/৩ বা ২/৩) নেই।'
              : 'No pending active warnings right now.'}
          </p>
          <button type="button" className="btn soft" onClick={onGoToLogs}>
            {isBn ? 'পূর্বের ওয়ার্নিং লগ দেখুন' : 'View Warning History'}
          </button>
        </div>
      )}
    </section>
  );
}

/* ============================================================================
 * DEDICATED 10-MINUTE BLOCKS & LOCKS PAGE
 * ========================================================================== */
export function BlocksPage({
  isBn,
  groupLocks,
  restrictedUsers,
  activityLogs,
  isLoading,
  onBack,
  onRefresh,
  onUnlockGroup,
  onManualUnmute,
  onGoToLogs,
}: {
  isBn: boolean;
  groupLocks: any[];
  restrictedUsers: any[];
  activityLogs: any[];
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onUnlockGroup: (groupId: string) => void;
  onManualUnmute: (groupId: string, senderJid: string) => void;
  onGoToLogs: () => void;
}) {
  const blockHistory = activityLogs
    .filter((l) => l.action === 'restricted' || l.action === 'locked' || l.action === 'unmuted' || l.action === 'unlocked')
    .slice(0, 12);

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? '১০ মিনিট গ্রুপ ব্লক ও সদস্য রেস্ট্রিকশন' : '10-Min Blocks & Locks'}
        subtitle={
          isBn
            ? 'লাইভ কাউন্টডাউন টাইমার, ম্যানুয়াল আনলক এবং ১০ মিনিটের স্প্যাম ব্লকের ইতিহাস'
            : 'Live timers, manual unblock controls, and block history'
        }
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <button type="button" className="btn outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> {isBn ? 'আপডেট' : 'Refresh'}
          </button>
        }
      />

      <div className="space-y-4">
        {/* Group Locks */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <Lock size={14} className="text-rose-600" />
              {isBn ? 'সক্রিয় গ্রুপ লক (Group Locks)' : 'Active Group Locks'}
            </h3>
            <span className="text-xs font-extrabold text-rose-600 tabular-nums">{groupLocks.length}</span>
          </div>
          {groupLocks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {groupLocks.map((lock) => (
                <div key={lock.groupId} className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-extrabold text-slate-900 break-words">{lock.groupName}</h4>
                      <p className="text-[11px] text-rose-700 font-semibold mt-0.5 break-words">{lock.reason}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-mono font-bold tabular-nums shrink-0">
                      <Clock size={11} /> {lock.remainingText}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200/70">
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {isBn ? 'শেষ:' : 'Ends:'} {new Date(lock.lockedUntil).toLocaleTimeString()}
                    </span>
                    <button type="button" className="btn primary" onClick={() => onUnlockGroup(lock.groupId)}>
                      <CheckCircle2 size={12} /> {isBn ? 'আনলক করুন' : 'Unlock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border border-slate-100">
              {isBn ? 'এই মুহূর্তে কোনো সম্পূর্ণ গ্রুপ ১০ মিনিটের লকে নেই।' : 'No groups are currently locked.'}
            </p>
          )}
        </div>

        {/* Restricted Members */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <UserX size={14} className="text-amber-600" />
              {isBn ? 'সক্রিয় ১০ মিনিট সদস্য ব্লক (Restricted Members)' : 'Restricted Members'}
            </h3>
            <span className="text-xs font-extrabold text-amber-700 tabular-nums">{restrictedUsers.length}</span>
          </div>
          {restrictedUsers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {restrictedUsers.map((user) => (
                <div key={`${user.groupId}:${user.senderJid}`} className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-extrabold text-slate-900 break-all">@{user.senderPhone}</span>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5 break-words">{user.groupName}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-mono font-bold tabular-nums shrink-0">
                      <Clock size={11} /> {user.remainingText || '10m'}
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 font-semibold break-words">{user.reason}</p>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/70">
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {new Date(user.restrictedAt).toLocaleTimeString()} · {user.violationCount || 1}x
                    </span>
                    <button type="button" className="btn primary" onClick={() => onManualUnmute(user.groupId, user.senderJid)}>
                      <CheckCircle2 size={12} /> {isBn ? 'ব্লক তুলুন' : 'Unrestrict'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border border-slate-100">
              {isBn ? 'এই মুহূর্তে কোনো সদস্য ১০ মিনিটের ব্লকে নেই।' : 'No restricted members currently.'}
            </p>
          )}
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-slate-900">
              {isBn ? 'সাম্প্রতিক ১০ মিনিট ব্লকের ইতিহাস' : 'Recent Block History'}
            </h3>
            <button type="button" onClick={onGoToLogs} className="text-[11px] font-bold text-emerald-700 cursor-pointer">
              {isBn ? 'সব লগ দেখুন →' : 'All Logs →'}
            </button>
          </div>
          {blockHistory.length > 0 ? (
            <div className="space-y-2">
              {blockHistory.map((item) => (
                <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-bold text-slate-900">@{item.senderPhone || item.senderJid}</span>
                    <span className="text-slate-500 tabular-nums">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[11px] text-slate-700 font-semibold break-words">
                    {item.groupName || 'Protected Group'} — {item.reason}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{isBn ? 'কোনো ব্লক ইতিহাস পাওয়া যায়নি।' : 'No block history yet.'}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * DEDICATED LIVE LOGS PAGE
 * ========================================================================== */
export function LogsPage({
  isBn,
  activityLogs,
  logFilter,
  setLogFilter,
  onBack,
  onRefresh,
  onClearLogs,
}: {
  isBn: boolean;
  activityLogs: any[];
  logFilter: 'all' | 'warned' | 'blocks' | 'deleted' | 'error';
  setLogFilter: (v: 'all' | 'warned' | 'blocks' | 'deleted' | 'error') => void;
  onBack: () => void;
  onRefresh: () => void;
  onClearLogs: () => void;
}) {
  const filteredLogs = activityLogs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'warned') return log.action === 'warned';
    if (logFilter === 'blocks') {
      return log.action === 'restricted' || log.action === 'locked' || log.action === 'unmuted' || log.action === 'unlocked';
    }
    if (logFilter === 'deleted') return log.action === 'deleted' || log.action === 'kicked';
    if (logFilter === 'error') return log.action === 'error';
    return true;
  });

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'লাইভ মডারেশন অ্যাক্টিভিটি লগ' : 'Live Moderation Logs'}
        subtitle={isBn ? 'সব ডিলিট, ওয়ার্নিং, কিক, ব্লক ও রিপ্লাই রেকর্ড' : 'Complete event feed across groups & DM'}
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <div className="flex gap-2">
            <button type="button" className="btn outline" onClick={onRefresh}>
              <RefreshCw size={12} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </button>
            <button type="button" className="btn danger" onClick={onClearLogs}>
              <Trash2 size={12} /> {isBn ? 'ক্লিয়ার' : 'Clear'}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { id: 'all', label: isBn ? `সব (${activityLogs.length})` : `All (${activityLogs.length})` },
          { id: 'warned', label: isBn ? 'ওয়ার্নিং' : 'Warnings' },
          { id: 'blocks', label: isBn ? '১০ মি. ব্লক' : '10M Blocks' },
          { id: 'deleted', label: isBn ? 'ডিলিট ও কিক' : 'Deletes/Kicks' },
          { id: 'error', label: isBn ? 'এরর' : 'Errors' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLogFilter(tab.id as any)}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              logFilter === tab.id ? 'bg-[#087f55] text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500">
          {isBn ? 'এই ফিল্টারে কোনো লগ পাওয়া যায়নি।' : 'No matching activity logs.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLogs.map((log) => (
            <div key={log.id} className="p-3.5 rounded-2xl border border-slate-200 bg-white flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-extrabold text-emerald-700 uppercase">
                  {log.action}
                  {typeof log.warningCount === 'number' && log.warningCount > 0 ? ` · ${log.warningCount}/3` : ''}
                </span>
                <span className="text-slate-400 tabular-nums">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="font-bold text-slate-900 break-words">{log.groupName || log.groupId}</span>
                <span className="font-mono text-[11px] font-semibold text-slate-600 break-all">
                  {log.senderPhone ? `@${log.senderPhone}` : log.senderJid}
                </span>
              </div>
              <div className="text-[11px] text-slate-800 font-semibold break-words">{log.reason}</div>
              {log.details && <p className="text-[10.5px] text-slate-500 break-words">{log.details}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
 * FEATURE #2: SCHEDULED NIGHT MODE PAGE
 * ========================================================================== */
export function NightModePage({
  isBn,
  settings,
  nightStatus,
  onBack,
  onRefresh,
  onSaveNightSettings,
  onToggleNow,
}: {
  isBn: boolean;
  settings: any;
  nightStatus: NightModeStatusView | null;
  onBack: () => void;
  onRefresh: () => void;
  onSaveNightSettings: (patch: any) => void;
  onToggleNow: (lock: boolean) => void;
}) {
  const [start, setStart] = useState(settings.nightLockStart || '00:00');
  const [end, setEnd] = useState(settings.nightLockEnd || '06:00');
  const [timezone, setTimezone] = useState(settings.nightModeTimezone || 'Asia/Dhaka');

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'শিডিউল নাইট মোড (Auto Night Lock)' : 'Scheduled Night Mode'}
        subtitle={
          isBn
            ? 'রাতে নির্দিষ্ট সময়ে গ্রুপগুলো অটো লক (শুধু অ্যাডমিন) হবে এবং সকালে অটোমেটিক খুলে যাবে।'
            : 'Automatically lock groups during quiet hours and unlock every morning.'
        }
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <button type="button" className="btn outline" onClick={onRefresh}>
            <RefreshCw size={12} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {isBn ? 'অটো নাইট মোড চালু করুন' : 'Enable Auto Night Mode'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isBn ? 'বট অ্যাডমিন থাকা সব গ্রুপে প্রযোজ্য হবে' : 'Applies to groups where bot is Admin'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.nightModeEnabled)}
                onChange={(e) => onSaveNightSettings({ nightModeEnabled: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isBn ? 'লক শুরু (রাত)' : 'Lock Start'}
              </label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="field tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isBn ? 'আনলক সময় (সকাল)' : 'Unlock End'}
              </label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="field tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'টাইমজোন (Timezone)' : 'Timezone'}
            </label>
            <select className="field" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="Asia/Dhaka">Asia/Dhaka (বাংলাদেশ সময় +06:00)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (India +05:30)</option>
              <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia +03:00)</option>
              <option value="Asia/Dubai">Asia/Dubai (UAE +04:00)</option>
              <option value="UTC">UTC (+00:00)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-700">
              {isBn ? 'গ্রুপে শুভ রাত্রি / সুপ্রভাত মেসেজ পাঠাবে' : 'Send Night/Morning Notice in Group'}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.nightModeNotify !== false}
                onChange={(e) => onSaveNightSettings({ nightModeNotify: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => onSaveNightSettings({ nightLockStart: start, nightLockEnd: end, nightModeTimezone: timezone })}
            className="w-full min-h-[44px] rounded-xl bg-[#087f55] text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save size={14} /> {isBn ? 'সময়সূচি সেভ করুন' : 'Save Schedule'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'লাইভ স্ট্যাটাস ও ম্যানুয়াল কন্ট্রোল' : 'Live Status & Manual Control'}
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-700 tabular-nums">
              {nightStatus?.currentLocalTime || '--:--'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">{isBn ? 'বর্তমান অবস্থা:' : 'Current Window:'}</span>
              <span className={`font-bold ${nightStatus?.isNightWindowNow ? 'text-indigo-700' : 'text-emerald-700'}`}>
                {nightStatus?.isNightWindowNow
                  ? isBn
                    ? '🌙 নাইট মোড চলছে'
                    : 'Night Window Active'
                  : isBn
                  ? '☀️ দিনের সময় (উন্মুক্ত)'
                  : 'Daytime (Open)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{isBn ? 'নাইট লকে থাকা গ্রুপ:' : 'Night-Locked Groups:'}</span>
              <span className="font-extrabold text-slate-900 tabular-nums">{nightStatus?.lockedCount || 0}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onToggleNow(true)}
              className="min-h-[44px] px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Moon size={14} /> {isBn ? 'এখনই নাইট লক দিন' : 'Lock Now'}
            </button>
            <button
              type="button"
              onClick={() => onToggleNow(false)}
              className="min-h-[44px] px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sun size={14} /> {isBn ? 'সব আনলক করুন' : 'Unlock All'}
            </button>
          </div>

          {nightStatus && nightStatus.lockedGroups.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600">
                {isBn ? 'লক করা গ্রুপসমূহ:' : 'Currently Night-Locked:'}
              </span>
              {nightStatus.lockedGroups.map((g) => (
                <div key={g.groupId} className="p-2 rounded-lg bg-indigo-50 text-indigo-900 text-xs font-bold flex justify-between">
                  <span className="truncate">{g.groupName}</span>
                  <span className="text-[10px] font-mono tabular-nums shrink-0">
                    {new Date(g.lockedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * FEATURE #3: ANTI-CALL PROTECTION PAGE
 * ========================================================================== */
export function AntiCallPage({
  isBn,
  settings,
  callLogs,
  onBack,
  onRefresh,
  onSaveAntiCall,
  onClearCalls,
}: {
  isBn: boolean;
  settings: any;
  callLogs: CallLogViewItem[];
  onBack: () => void;
  onRefresh: () => void;
  onSaveAntiCall: (patch: any) => void;
  onClearCalls: () => void;
}) {
  const [msg, setMsg] = useState(
    settings.antiCallMessage || '📵 দুঃখিত! এটি একটি অটোমেটেড WhatsApp সিকিউরিটি বট। অনুগ্রহ করে কল না করে মেসেজ পাঠান।'
  );
  const [blockLimit, setBlockLimit] = useState<number>(Number(settings.antiCallAutoBlockCount ?? 3));

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'অ্যান্টি-কল সুরক্ষা (Anti-Call)' : 'Anti-Call Shield'}
        subtitle={
          isBn
            ? 'বট নম্বরে অডিও বা ভিডিও কল আসলে স্বয়ংক্রিয়ভাবে কাটবে, সতর্ক করবে এবং বারবার কল করলে ব্লক করবে।'
            : 'Automatically reject incoming calls, warn callers, and auto-block repeat callers.'
        }
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <div className="flex gap-2">
            <button type="button" className="btn outline" onClick={onRefresh}>
              <RefreshCw size={12} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </button>
            <button type="button" className="btn danger" onClick={onClearCalls}>
              <Trash2 size={12} /> {isBn ? 'লগ ক্লিয়ার' : 'Clear'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {isBn ? 'কল অটো-রিজেক্ট সক্রিয় করুন' : 'Enable Call Auto-Reject'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isBn ? 'যেকোনো ভয়েস/ভিডিও কল আসা মাত্রই কেটে দেবে' : 'Rejects voice & video calls immediately'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiCallEnabled)}
                onChange={(e) => onSaveAntiCall({ antiCallEnabled: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'কল করলে ইনবক্সে যাওয়ার সতর্কবার্তা' : 'Auto Warning Reply on Call'}
            </label>
            <textarea
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'কতবার কল করলে অটো-ব্লক হবে (০ = ব্লক করবে না)' : 'Auto-Block After N Calls (0 = off)'}
            </label>
            <select
              className="field"
              value={blockLimit}
              onChange={(e) => setBlockLimit(Number(e.target.value))}
            >
              <option value={0}>{isBn ? 'অটো-ব্লক বন্ধ (শুধু কল কাটবে)' : 'Off (Reject only)'}</option>
              <option value={2}>{isBn ? '২ বার কল করলে ব্লক' : 'Block after 2 calls'}</option>
              <option value={3}>{isBn ? '৩ বার কল করলে ব্লক (প্রস্তাবিত)' : 'Block after 3 calls (Recommended)'}</option>
              <option value={5}>{isBn ? '৫ বার কল করলে ব্লক' : 'Block after 5 calls'}</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onSaveAntiCall({ antiCallMessage: msg, antiCallAutoBlockCount: blockLimit })}
            className="w-full min-h-[44px] rounded-xl bg-[#087f55] text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save size={14} /> {isBn ? 'অ্যান্টি-কল সেটিং সেভ' : 'Save Anti-Call Settings'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'রিজেক্ট করা কলের ইতিহাস' : 'Rejected Call Logs'}
            </h3>
            <span className="text-xs font-extrabold text-rose-600 tabular-nums">{callLogs.length}</span>
          </div>
          {callLogs.length > 0 ? (
            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {callLogs.map((c) => (
                <div key={c.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-extrabold text-slate-900">@{c.callerPhone}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {c.isVideo ? (isBn ? 'ভিডিও কল' : 'Video Call') : isBn ? 'ভয়েস কল' : 'Voice Call'} ·{' '}
                      <span className={c.blocked ? 'text-rose-600 font-bold' : 'text-amber-700 font-bold'}>{c.status}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                    {new Date(c.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
              {isBn ? 'এখনো কোনো ইনকামিং কল রেকর্ড হয়নি।' : 'No rejected calls recorded yet.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * FEATURE #4: MAYA AI VOICE & VISION + ANTI-NSFW IMAGE PAGE
 * ========================================================================== */
export function AiVisionPage({
  isBn,
  settings,
  onBack,
  onToggle,
  onGoToKeys,
}: {
  isBn: boolean;
  settings: any;
  onBack: () => void;
  onToggle: (key: string, val: boolean) => void;
  onGoToKeys: () => void;
}) {
  const hasGeminiKey = Boolean(
    settings.geminiApiKey ||
      (settings.aiKeys || []).some((k: any) => k.provider === 'gemini' && k.status === 'active')
  );

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'Maya AI ভয়েস, ছবি ও Anti-NSFW' : 'Maya Multimodal Voice & Vision'}
        subtitle={
          isBn
            ? 'মায়া ভয়েস মেসেজ শুনে বাংলায় উত্তর দেবে, ছবি দেখে বুঝবে এবং গ্রুপের ১৮+/আপত্তিকর ছবি অটো ডিলিট করবে।'
            : 'Voice note understanding, image analysis, and AI-powered NSFW photo moderation.'
        }
        isBn={isBn}
        onBack={onBack}
      />

      {!hasGeminiKey && (
        <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-bold text-amber-900">
            {isBn
              ? 'ভয়েস ও ছবি প্রসেস করার জন্য কমপক্ষে একটি সচল Gemini API Key প্রয়োজন।'
              : 'At least one active Gemini API key is required for voice/image processing.'}
          </p>
          <button type="button" onClick={onGoToKeys} className="btn primary">
            <Plug size={12} /> {isBn ? 'API কী যোগ করুন' : 'Add Gemini Key'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
          <div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mb-3">
              <AudioLines size={20} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'ভয়েস মেসেজ শোনা ও উত্তর' : 'Voice Note Reader'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isBn
                ? 'ইনবক্সে কেউ ভয়েস নোট পাঠালে বা গ্রুপে মায়াকে রিপ্লাই/মেনশন করে ভয়েস দিলে মায়া অডিও শুনে উত্তর দেবে।'
                : 'Maya listens to WhatsApp audio voice notes via Gemini and replies naturally.'}
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className={`text-xs font-bold ${settings.mayaVoiceEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {settings.mayaVoiceEnabled ? (isBn ? 'সক্রিয়' : 'ACTIVE') : isBn ? 'বন্ধ' : 'OFF'}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.mayaVoiceEnabled)}
                onChange={(e) => onToggle('mayaVoiceEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
          <div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-3">
              <ScanEye size={20} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'ছবি দেখে বোঝা (Vision AI)' : 'Image Vision AI'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isBn
                ? 'ইনবক্সে ছবি পাঠালে বা গ্রুপে ছবির ক্যাপশনে "Maya/মায়া" লিখলে ছবি দেখে বিস্তারিত উত্তর দেবে।'
                : 'Reads screenshots, homework, memes, or photos and responds intelligently.'}
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className={`text-xs font-bold ${settings.mayaVisionEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {settings.mayaVisionEnabled ? (isBn ? 'সক্রিয়' : 'ACTIVE') : isBn ? 'বন্ধ' : 'OFF'}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.mayaVisionEnabled)}
                onChange={(e) => onToggle('mayaVisionEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
          <div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mb-3">
              <ShieldAlert size={20} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'AI Anti-NSFW ছবি ফিল্টার' : 'AI Anti-NSFW Filter'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isBn
                ? 'গ্রুপে কেউ অশ্লীল, ১৮+ বা আপত্তিকর ছবি পাঠালে AI সাথে সাথে শনাক্ত করে ডিলিট ও ওয়ার্নিং দেবে।'
                : 'Automatically scans group images and deletes explicit/NSFW photos.'}
            </p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className={`text-xs font-bold ${settings.antiNsfwImage ? 'text-rose-600' : 'text-slate-400'}`}>
              {settings.antiNsfwImage ? (isBn ? 'সুরক্ষা চালু' : 'BLOCKING') : isBn ? 'বন্ধ' : 'OFF'}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiNsfwImage)}
                onChange={(e) => onSaveAntiNsfwToggle(onToggle, e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function onSaveAntiNsfwToggle(onToggle: (key: string, val: boolean) => void, val: boolean) {
  onToggle('antiNsfwImage', val);
}

/* ============================================================================
 * FEATURE #5: ACTIVITY RANK & GHOST/INACTIVE MEMBERS PAGE
 * ========================================================================== */
export function ActivityRankPage({
  isBn,
  settings,
  report,
  selectedGroup,
  setSelectedGroup,
  ghostDays,
  setGhostDays,
  onBack,
  onRefresh,
  onResetActivity,
  onToggleTracking,
}: {
  isBn: boolean;
  settings: any;
  report: {
    groups: Array<{ id: string; name: string; members: number; totalMessages: number }>;
    topActive: MemberActivityViewItem[];
    ghostMembers: MemberActivityViewItem[];
    totalTracked: number;
    totalMessages: number;
  };
  selectedGroup: string;
  setSelectedGroup: (g: string) => void;
  ghostDays: number;
  setGhostDays: (d: number) => void;
  onBack: () => void;
  onRefresh: () => void;
  onResetActivity: () => void;
  onToggleTracking: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<'top' | 'ghost'>('top');

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'মেম্বার অ্যাক্টিভিটি র‍্যাংক ও Ghost তালিকা' : 'Member Activity Rank & Ghosts'}
        subtitle={
          isBn
            ? 'গ্রুপের সবচেয়ে অ্যাক্টিভ মেম্বার এবং দীর্ঘদিন চুপ থাকা (Ghost) মেম্বারদের তালিকা। গ্রুপে .top লিখলেও র‍্যাংক দেখাবে।'
            : 'Track active chatters, .top command leaderboard, and inactive ghost members.'
        }
        isBn={isBn}
        onBack={onBack}
        rightAction={
          <div className="flex gap-2">
            <button type="button" className="btn outline" onClick={onRefresh}>
              <RefreshCw size={12} /> {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </button>
            <button type="button" className="btn danger" onClick={onResetActivity}>
              <RotateCcw size={12} /> {isBn ? 'রিসেট' : 'Reset'}
            </button>
          </div>
        }
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-bold text-slate-700">
            {isBn ? 'মেম্বার অ্যাক্টিভিটি ট্র্যাকিং ও .top কমান্ড' : 'Activity Tracking & .top Command'}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.activityTrackingEnabled !== false}
              onChange={(e) => onToggleTracking(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[10.5px] font-bold text-slate-500 mb-1">
              {isBn ? 'গ্রুপ সিলেক্ট করুন' : 'Filter Group'}
            </label>
            <select
              className="field"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="all">{isBn ? 'সকল গ্রুপ' : 'All Groups'}</option>
              {report.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.members})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-slate-500 mb-1">
              {isBn ? 'Ghost (নিষ্ক্রিয়) দিনসীমা' : 'Inactive Threshold'}
            </label>
            <select
              className="field"
              value={ghostDays}
              onChange={(e) => setGhostDays(Number(e.target.value))}
            >
              <option value={3}>{isBn ? '৩+ দিন মেসেজ নেই' : '3+ days inactive'}</option>
              <option value={7}>{isBn ? '৭+ দিন মেসেজ নেই' : '7+ days inactive'}</option>
              <option value={14}>{isBn ? '১৪+ দিন মেসেজ নেই' : '14+ days inactive'}</option>
              <option value={30}>{isBn ? '৩০+ দিন মেসেজ নেই' : '30+ days inactive'}</option>
            </select>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-600 font-bold">{isBn ? 'মোট মেসেজ' : 'Total Msgs'}</span>
            <span className="text-base font-extrabold text-emerald-700 tabular-nums">{report.totalMessages}</span>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setTab('top')}
          className={`flex-1 min-h-[42px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
            tab === 'top' ? 'bg-[#087f55] text-white' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          <Trophy size={14} /> {isBn ? `টপ অ্যাক্টিভ (${report.topActive.length})` : `Top Active (${report.topActive.length})`}
        </button>
        <button
          type="button"
          onClick={() => setTab('ghost')}
          className={`flex-1 min-h-[42px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
            tab === 'ghost' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          <Ghost size={14} /> {isBn ? `Ghost মেম্বার (${report.ghostMembers.length})` : `Ghosts (${report.ghostMembers.length})`}
        </button>
      </div>

      {tab === 'top' ? (
        report.topActive.length > 0 ? (
          <div className="space-y-2">
            {report.topActive.map((m, idx) => (
              <div key={`${m.groupId}:${m.senderJid}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0 ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-800'
                        : idx === 1
                        ? 'bg-slate-200 text-slate-800'
                        : idx === 2
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-900 truncate">
                      {m.name} <span className="font-mono font-normal text-slate-500">@{m.senderPhone}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{m.groupName}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-extrabold text-emerald-700 tabular-nums">{m.messageCount}</div>
                  <div className="text-[10px] text-slate-400">{isBn ? 'মেসেজ' : 'msgs'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500">
            {isBn ? 'গ্রুপে মেসেজ আদান-প্রদান শুরু হলে এখানে অটোমেটিক র‍্যাংক তৈরি হবে।' : 'Activity rank builds as group members chat.'}
          </div>
        )
      ) : report.ghostMembers.length > 0 ? (
        <div className="space-y-2">
          {report.ghostMembers.map((m) => (
            <div key={`${m.groupId}:${m.senderJid}`} className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 truncate">
                  {m.name} <span className="font-mono font-normal text-slate-500">@{m.senderPhone}</span>
                </div>
                <div className="text-[11px] text-slate-500 truncate">{m.groupName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-extrabold text-rose-600 tabular-nums">
                  {m.inactiveDays || 0} {isBn ? 'দিন নীরব' : 'days silent'}
                </div>
                <div className="text-[10px] text-slate-400 tabular-nums">
                  {m.messageCount} {isBn ? 'মেসেজ' : 'msgs'}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500">
          {isBn ? 'এই সময়সীমার মধ্যে কোনো Ghost/নীরব মেম্বার পাওয়া যায়নি।' : 'No ghost members matched this threshold.'}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
 * FEATURE #6: KEYWORD AUTO-RESPONDER PAGE
 * ========================================================================== */
export function KeywordsPage({
  isBn,
  settings,
  keywords,
  onBack,
  onToggleMaster,
  onAddKeyword,
  onToggleKeyword,
  onRemoveKeyword,
}: {
  isBn: boolean;
  settings: any;
  keywords: KeywordTriggerItem[];
  onBack: () => void;
  onToggleMaster: (v: boolean) => void;
  onAddKeyword: (keyword: string, reply: string, matchType: 'exact' | 'contains') => void;
  onToggleKeyword: (id: string) => void;
  onRemoveKeyword: (id: string) => void;
}) {
  const [kw, setKw] = useState('');
  const [reply, setReply] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains'>('contains');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kw.trim() || !reply.trim()) return;
    onAddKeyword(kw.trim(), reply.trim(), matchType);
    setKw('');
    setReply('');
  };

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'কীওয়ার্ড অটো-রিপ্লাই (Fixed FAQ)' : 'Keyword Auto-Responder'}
        subtitle={
          isBn
            ? 'কোনো AI খরচ ছাড়াই নির্দিষ্ট শব্দ বা প্রশ্ন দেখলেই বট সাথে সাথে ফিক্সড উত্তর দেবে।'
            : 'Instant fixed auto-replies for rules, prices, links, or FAQs with zero AI cost.'
        }
        isBn={isBn}
        onBack={onBack}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {isBn ? 'কীওয়ার্ড অটো-রিপ্লাই চালু' : 'Enable Auto-Responder'}
              </h3>
              <p className="text-[11px] text-slate-500">{isBn ? 'গ্রুপ ও ইনবক্স উভয় জায়গায় কাজ করে' : 'Works in groups & DMs'}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.keywordAutoReplyEnabled)}
                onChange={(e) => onToggleMaster(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'ট্রিগার কীওয়ার্ড (কমা দিয়ে একাধিক শব্দ লিখতে পারেন)' : 'Trigger Keyword(s)'}
            </label>
            <input
              type="text"
              className="field"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder={isBn ? 'যেমন: দাম কত, price, নিয়ম, rules' : 'e.g. price, rules, help'}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'ম্যাচ করার ধরন' : 'Match Type'}
            </label>
            <select
              className="field"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as 'exact' | 'contains')}
            >
              <option value="contains">{isBn ? 'বাক্যের মধ্যে থাকলেই উত্তর দেবে (Contains)' : 'Contains anywhere'}</option>
              <option value="exact">{isBn ? 'হুবহু এক হলে উত্তর দেবে (Exact)' : 'Exact match only'}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isBn ? 'বট যে উত্তর দেবে' : 'Auto Reply Text'}
            </label>
            <textarea
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={isBn ? 'বটের ফিক্সড উত্তর এখানে লিখুন...' : 'Type the fixed reply...'}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={!kw.trim() || !reply.trim()}
            className="w-full min-h-[44px] rounded-xl bg-[#087f55] disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> {isBn ? 'নতুন কীওয়ার্ড যোগ করুন' : 'Add Auto-Reply Rule'}
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'সেভ করা কীওয়ার্ড রুলস' : 'Saved Keyword Rules'}
            </h3>
            <span className="text-xs font-extrabold text-emerald-700 tabular-nums">{keywords.length}</span>
          </div>

          {keywords.length > 0 ? (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
              {keywords.map((item) => (
                <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 break-words">
                        {item.keyword}
                      </div>
                      <div className="text-[10.5px] text-slate-500 mt-0.5 tabular-nums">
                        {item.matchType === 'exact' ? 'Exact' : 'Contains'} ·{' '}
                        {isBn ? `${item.hitCount || 0} বার উত্তর দিয়েছে` : `${item.hitCount || 0} hits`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleKeyword(item.id)}
                        className={`min-h-[32px] px-2.5 rounded-lg text-[10px] font-extrabold cursor-pointer ${
                          item.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Power size={11} className="inline mr-1" />
                        {item.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveKeyword(item.id)}
                        className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-100 break-words">
                    {item.reply}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
              {isBn ? 'এখনো কোনো কীওয়ার্ড রুল যোগ করা হয়নি।' : 'No keyword triggers added yet.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * FEATURE #1: ADMIN PIN LOCK SETTINGS PAGE
 * ========================================================================== */
export function PinLockPage({
  isBn,
  pinEnabled,
  onBack,
  onUpdatePin,
  onLockNow,
}: {
  isBn: boolean;
  pinEnabled: boolean;
  onBack: () => void;
  onUpdatePin: (enabled: boolean, newPin: string) => Promise<void>;
  onLockNow: () => void;
}) {
  const [newPin, setNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (enableState: boolean) => {
    setSaving(true);
    try {
      await onUpdatePin(enableState, newPin);
      setNewPin('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page active">
      <SubPageHeader
        title={isBn ? 'ড্যাশবোর্ড অ্যাডমিন পিন লক' : 'Admin Dashboard PIN Lock'}
        subtitle={
          isBn
            ? 'আপনার পাবলিক Railway ড্যাশবোর্ড লিংকে গোপন পিন/পাসওয়ার্ড দিয়ে সুরক্ষিত রাখুন যাতে অন্য কেউ সেটিংস বদলাতে না পারে।'
            : 'Protect your live Railway URL with a secret admin PIN.'
        }
        isBn={isBn}
        onBack={onBack}
      />

      <div className="max-w-lg bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'পিন লক স্ট্যাটাস' : 'PIN Protection Status'}
            </h3>
            <p className="text-xs mt-0.5 font-bold">
              <span className={pinEnabled ? 'text-emerald-700' : 'text-slate-500'}>
                {pinEnabled
                  ? isBn
                    ? '🔒 বর্তমানে পিন লক চালু আছে'
                    : 'Locked & Protected'
                  : isBn
                  ? '🔓 বর্তমানে পিন লক বন্ধ আছে'
                  : 'Currently Unlocked (No PIN)'}
              </span>
            </p>
          </div>
          {pinEnabled && (
            <button
              type="button"
              onClick={onLockNow}
              className="btn outline shrink-0"
            >
              <Lock size={13} /> {isBn ? 'এখনই লক করুন' : 'Lock Now'}
            </button>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
            {isBn
              ? pinEnabled
                ? 'নতুন পিন কোড দিন (পরিবর্তন করতে চাইলে)'
                : 'নতুন পিন কোড সেট করুন (কমপক্ষে ৪ অক্ষর)'
              : 'Set New Admin PIN (min 4 characters)'}
          </label>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder={isBn ? 'যেমন: 4580 বা গোপন কোড' : 'e.g. 4580'}
              className="w-full min-h-[44px] px-3.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPin((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-500"
            >
              {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={saving || (!pinEnabled && newPin.trim().length < 4)}
            onClick={() => handleSave(true)}
            className="min-h-[44px] px-4 rounded-xl bg-[#087f55] disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check size={14} /> {isBn ? 'পিন সেভ ও চালু করুন' : 'Save & Enable PIN'}
          </button>

          {pinEnabled && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="min-h-[44px] px-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Unlock size={14} /> {isBn ? 'পিন লক বন্ধ করুন' : 'Disable PIN Lock'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
