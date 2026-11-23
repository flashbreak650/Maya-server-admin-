import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Ban,
  BellRing,
  Bot,
  EyeOff,
  Link as LinkIcon,
  MessageSquareHeart,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { PageId } from './FeaturePages.tsx';

export type SecurityToolId =
  | 'sec_links'
  | 'sec_shield'
  | 'sec_welcome'
  | 'sec_stickers'
  | 'sec_media'
  | 'sec_badwords'
  | 'sec_mention'
  | 'sec_replies'
  | 'sec_bossalert';

interface SecurityToolPageProps {
  toolId: SecurityToolId;
  isBn: boolean;
  t: any;
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  customBadwordsText: string;
  setCustomBadwordsText: (v: string) => void;
  stickerQueue: any;
  activeWarningsCount: number;
  onBack: () => void;
  onNavigate: (page: PageId) => void;
  onUpdateToggle: (key: string, val: any) => void;
  onSaveBadwords: () => void;
  onSaveStickerSpamConfig: () => void;
  onRefreshStickerQueue: () => void;
  onRetryFailedStickers: () => void;
  onClearStickerQueueHistory: () => void;
  onSaveAdminMentionConfig: () => void;
  onSaveBossAndNoticeConfig: () => void;
  onTestBossAlert: () => void;
  renderInfoBtn: (id: string) => React.ReactNode;
}

const TOOL_META: Record<
  SecurityToolId,
  {
    titleBn: string;
    titleEn: string;
    subBn: string;
    subEn: string;
  }
> = {
  sec_links: {
    titleBn: 'অ্যান্টি-লিংক ও Carrom Pool লিংক টুল',
    titleEn: 'Anti-Link & Carrom Pool Link Tool',
    subBn: 'গ্রুপের সব বাজে/স্প্যাম লিংক বন্ধ রাখুন — এবং চাইলে শুধু Carrom Pool রুম লিংক (carrom.co) চালু রাখুন।',
    subEn: 'Block unwanted URLs while optionally allowing Carrom Pool invite links (carrom.co).',
  },
  sec_shield: {
    titleBn: 'অ্যাডমিন শিল্ড ও ৩-স্ট্রাইক অটো কিক',
    titleEn: 'Admin Shield & 3-Strike Auto Kick',
    subBn: 'গ্রুপ অ্যাডমিনদের সুরক্ষা এবং ৩ বার নিয়ম ভঙ্গ করলে অটো-কিক নিয়ন্ত্রণ করুন।',
    subEn: 'Protect group admins from bot penalties and configure 3-warning auto-kick.',
  },
  sec_welcome: {
    titleBn: 'অটো ওয়েলকাম মেসেজ (@Mention)',
    titleEn: 'Auto Welcome New Members (@Mention)',
    subBn: 'গ্রুপে নতুন কেউ যুক্ত হলে অটো @মেনশন দিয়ে ওয়েলকাম জানানো ও কাস্টম মেসেজ সেট করুন।',
    subEn: 'Automatically greet newly added members with @mention and custom template.',
  },
  sec_stickers: {
    titleBn: 'অ্যান্টি-স্টিকার ও হাই-প্রায়োরিটি স্প্যাম কিউ',
    titleEn: 'Anti-Sticker & Spam Queue Control',
    subBn: 'একসাথে অতিরিক্ত স্টিকার পাঠালে ১০ মি. ব্লক, সব স্টিকার ডিলিট এবং লাইভ কিউ মনিটর করুন।',
    subEn: 'Configure burst sticker limits, block duration, all-sticker block, and live deletion queue.',
  },
  sec_media: {
    titleBn: 'ভিউ-ওয়ান্স, GIF, ভিডিও ও ছবি ব্লক',
    titleEn: 'Anti-View Once, GIF, Video & Photo',
    subBn: 'গ্রুপে View Once মিডিয়া, GIF, ভিডিও বা সাধারণ ছবি পাঠানো আলাদাভাবে চালু বা বন্ধ করুন।',
    subEn: 'Toggle blocking rules for View Once media, GIFs, videos, and photos.',
  },
  sec_badwords: {
    titleBn: 'অ্যান্টি-গালি ও কাস্টম শব্দ ফিল্টার',
    titleEn: 'Anti-Badword & Custom Slur Filter',
    subBn: 'বাংলা, বাংলিশ, হিন্দি ও ইংরেজি গালি অটো ডিলিট এবং নিজের কাস্টম নিষিদ্ধ শব্দ যোগ করুন।',
    subEn: 'Multilingual profanity filter, AI badword check, and custom blocked words editor.',
  },
  sec_mention: {
    titleBn: 'বস ও অ্যাডমিন মেনশন অটো রিপ্লাই',
    titleEn: 'Boss & Admin Mention Auto-Reply',
    subBn: 'কেউ বস অ্যাডমিন (+8801632222592) বা গ্রুপ অ্যাডমিনকে @মেনশন করলে বট কী উত্তর দেবে তা সেট করুন।',
    subEn: 'Configure automatic reply when someone @mentions Boss Admin or any group admin.',
  },
  sec_replies: {
    titleBn: 'অটো সালাম, টাইপিং ও সাইলেন্ট মোড',
    titleEn: 'Auto Salam, Typing & Silent Mode',
    subBn: 'API ছাড়াই অটো সালামের উত্তর, বটের Typing... ইন্ডিকেটর, সাইলেন্ট মোড ও মায়া মেনশন রিপ্লাই।',
    subEn: 'Manage Zero-API Salam replies, typing presence, silent moderation, and Maya AI triggers.',
  },
  sec_bossalert: {
    titleBn: 'বস ইনবক্স অ্যালার্ট ও সার্ভার নোটিশ',
    titleEn: 'Boss Inbox Fight Alert & Server Notice',
    subBn: 'গ্রুপে ঝগড়া/গালি বা সার্ভারে সমস্যা হলে সরাসরি বস ইনবক্সে সতর্কবার্তা পাঠানোর সেটিংস।',
    subEn: 'Single Boss Admin inbox alert for heated group fights and server health warnings.',
  },
};

export function SecurityToolPage({
  toolId,
  isBn,
  t,
  settings,
  setSettings,
  customBadwordsText,
  setCustomBadwordsText,
  stickerQueue,
  activeWarningsCount,
  onBack,
  onNavigate,
  onUpdateToggle,
  onSaveBadwords,
  onSaveStickerSpamConfig,
  onRefreshStickerQueue,
  onRetryFailedStickers,
  onClearStickerQueueHistory,
  onSaveAdminMentionConfig,
  onSaveBossAndNoticeConfig,
  onTestBossAlert,
  renderInfoBtn,
}: SecurityToolPageProps) {
  const meta = TOOL_META[toolId];

  return (
    <section className="page active" id={toolId}>
      <div className="mb-3 pb-2.5 border-b border-emerald-950/[0.06]">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="sub-back-btn"
          >
            <ArrowLeft size={12} className="text-[#087f55]" />
            <span>{isBn ? 'হোম পেজ' : 'Back Home'}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('security')}
            className="btn soft"
          >
            <ShieldCheck size={12} />
            <span>{isBn ? 'সব সিকিউরিটি রুলস' : 'All Security Rules'}</span>
          </button>
        </div>

        <h1 className="text-[15px] sm:text-[17px] font-extrabold text-[#0f291e] tracking-tight leading-snug">
          {isBn ? meta.titleBn : meta.titleEn}
        </h1>
        <p className="text-[10.5px] sm:text-[11px] text-[#5f7368] mt-0.5 leading-relaxed">
          {isBn ? meta.subBn : meta.subEn}
        </p>
      </div>

      {/* 1. ANTI-LINK & CARROM POOL TOOL */}
      {toolId === 'sec_links' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'লিংক নিয়ন্ত্রণ ও Carrom Pool অনুমোদন' : 'Link Protection & Carrom Pool Allowlist'}
              </h3>
              <p>
                {isBn
                  ? 'এখানে এক জায়গা থেকেই Anti-Link ও Carrom Pool লিংক নিয়ন্ত্রণ করুন।'
                  : 'Single unified control for Anti-Link and Carrom Pool invite links.'}
              </p>
            </div>
            <div className="symbol sg">
              <LinkIcon size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiLinkTitle}
                  {renderInfoBtn('antiLink')}
                </span>
              </h4>
              <p>{t.antiLinkDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiLink)}
                onChange={(e) => onUpdateToggle('antiLink', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                {isBn ? 'Carrom Pool লিংক চালু (carrom.co রিমুভ হবে না)' : 'Allow Carrom Pool Links (carrom.co)'}
              </h4>
              <p>
                {isBn
                  ? 'চালু থাকলে শুধু Carrom Pool রুম ইনভাইট লিংক (https://carrom.co/?party=...) গ্রুপে থাকবে।'
                  : 'Keeps official Carrom Pool match links (carrom.co) safe while still removing all other links.'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.allowCarromLinks !== false}
                onChange={(e) => onUpdateToggle('allowCarromLinks', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="policy-box">
            <h4>{isBn ? 'লিংক প্রোটেকশন পলিসি' : 'Link Protection Policy'}</h4>
            <p>
              {isBn
                ? '• Carrom Pool ম্যাচের রুম লিংক (carrom.co) ডিলিট হবে না ও কোনো ওয়ার্নিং পাবে না\n• অন্য যেকোনো ওয়েবসাইট, টেলিগ্রাম, ইউটিউব, ফেসবুক বা হোয়াটসঅ্যাপ লিংক সাথে সাথে ডিলিট হবে'
                : 'Allows only verified carrom.co host URLs while blocking all other domains.'}
            </p>
          </div>
        </div>
      )}

      {/* 2. ADMIN SHIELD & 3-STRIKE AUTO KICK */}
      {toolId === 'sec_shield' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">{t.sec1Title}</h3>
              <p>{t.sec1Sub}</p>
            </div>
            <div className="symbol sg">
              <ShieldAlert size={16} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.adminShieldTitle}
                  {renderInfoBtn('adminShield')}
                </span>
              </h4>
              <p>{t.adminShieldDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.adminShield)}
                onChange={(e) => onUpdateToggle('adminShield', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.autoKickTitle}
                  {renderInfoBtn('autoKick3Warnings')}
                </span>
              </h4>
              <p>{t.autoKickDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.autoKick3Warnings)}
                onChange={(e) => onUpdateToggle('autoKick3Warnings', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="policy-box">
            <h4>{isBn ? 'ডিফল্ট ভায়োলেশন পলিসি' : 'Default violation policy'}</h4>
            <p>
              {isBn
                ? '১ম ভায়োলেশন · সতর্কবার্তা · ২য় ভায়োলেশন · চূড়ান্ত সতর্কতা · ৩য় ভায়োলেশন · অটো কিক (অ্যাডমিন পারমিশন সহ)'
                : '1st violation · Warning · 2nd violation · Final warning · 3rd violation · Auto Kick'}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-emerald-950/[0.06] flex flex-wrap gap-2">
            <button type="button" className="btn soft" onClick={() => onNavigate('warnings')}>
              {isBn ? `সক্রিয় সতর্কবার্তা (${activeWarningsCount})` : `Active Warnings (${activeWarningsCount})`}
            </button>
            <button type="button" className="btn outline" onClick={() => onNavigate('logs')}>
              {isBn ? 'লাইভ লগ দেখুন' : 'View Live Logs'}
            </button>
          </div>
        </div>
      )}

      {/* 3. AUTO WELCOME MESSAGE */}
      {toolId === 'sec_welcome' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'নতুন সদস্য ওয়েলকাম সিস্টেম' : 'New Member Auto Welcome'}
              </h3>
              <p>
                {isBn
                  ? 'নতুন মেম্বার গ্রুপে এলেই বট অটো মেনশন দিয়ে স্বাগত জানাবে।'
                  : 'Greets new members automatically when they join any protected group.'}
              </p>
            </div>
            <div className="symbol sg">
              <Sparkles size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                {isBn ? 'অটো ওয়েলকাম মেসেজ (@Mention সহ)' : 'Auto Welcome New Members (@Mention)'}
              </h4>
              <p>
                {isBn
                  ? 'গ্রুপে নতুন কোনো সদস্য যুক্ত হলে বট স্বয়ংক্রিয়ভাবে @মেনশন দিয়ে সুন্দর ওয়েলকাম জানাবে।'
                  : 'Automatically greet newly added group members with @mention.'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.autoWelcome !== false}
                onChange={(e) => onUpdateToggle('autoWelcome', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          {settings.autoWelcome !== false && (
            <div className="subpanel-soft mt-3">
              <label className="block text-[10.5px] font-bold text-[#0f291e] mb-1.5">
                {isBn
                  ? 'কাস্টম ওয়েলকাম মেসেজ (ঐচ্ছিক — {user} ও {group} ব্যবহার করতে পারেন)'
                  : 'Custom Welcome Template (optional — supports {user} & {group})'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  className="field flex-1"
                  value={settings.welcomeMessage || ''}
                  onChange={(e) => setSettings((prev: any) => ({ ...prev, welcomeMessage: e.target.value }))}
                  placeholder={
                    isBn
                      ? 'ফাঁকা রাখলে ডিফল্ট সুন্দর বাংলা ওয়েলকাম পাঠাবে...'
                      : 'Leave blank for default welcome message...'
                  }
                />
                <button
                  type="button"
                  className="btn primary shrink-0"
                  onClick={() => onUpdateToggle('welcomeMessage', settings.welcomeMessage || '')}
                >
                  <Save size={12} /> {isBn ? 'সেভ করুন' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. ANTI-STICKER & HIGH-PRIORITY QUEUE */}
      {toolId === 'sec_stickers' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'অ্যান্টি-স্টিকার ও হাই-স্পিড স্প্যাম কিউ' : 'Anti-Sticker & Burst Spam Queue'}
              </h3>
              <p>
                {isBn
                  ? 'ঘন ঘন স্টিকার দিলে ১০ মিনিটের জন্য শুধু ওই সদস্যের মেসেজ অটো ডিলিট ও ব্লক।'
                  : 'High-speed sticker flood interception with per-member 10-min auto block.'}
              </p>
            </div>
            <div className="symbol so">
              <ShieldCheck size={16} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiStickerSpamTitle}
                  {renderInfoBtn('antiStickerSpam')}
                </span>
              </h4>
              <p>{t.antiStickerSpamDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiStickerSpam)}
                onChange={(e) => onUpdateToggle('antiStickerSpam', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiStickerTitle}
                  {renderInfoBtn('antiSticker')}
                </span>
              </h4>
              <p>{t.antiStickerDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiSticker)}
                onChange={(e) => onUpdateToggle('antiSticker', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="subpanel-soft mt-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 className="text-[11.5px] font-extrabold text-[#0f291e]">
                  {isBn ? 'হাই-প্রায়োরিটি স্টিকার স্প্যাম কনফিগ ও লাইভ কিউ' : 'Sticker Spam Window & Queue'}
                </h4>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" className="btn outline" onClick={onRefreshStickerQueue}>
                  <RefreshCw size={11} /> {isBn ? 'কিউ সিংক' : 'Sync'}
                </button>
                <button type="button" className="btn primary" onClick={onSaveStickerSpamConfig}>
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
                    setSettings((prev: any) => ({ ...prev, individualMuteTimeWindow: Number(e.target.value || 5) }))
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
                    setSettings((prev: any) => ({ ...prev, individualMuteStickerLimit: Number(e.target.value || 3) }))
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
                    setSettings((prev: any) => ({ ...prev, individualMuteDurationMinutes: Number(e.target.value || 10) }))
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
                    value={settings.stickerQueueConcurrency ?? 5}
                    onChange={(e) =>
                      setSettings((prev: any) => ({ ...prev, stickerQueueConcurrency: Number(e.target.value || 5) }))
                    }
                    className="w-1/2 px-1.5 py-1 border border-slate-300 rounded text-xs font-bold"
                  />
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.stickerDeleteMaxRetries ?? 4}
                    onChange={(e) =>
                      setSettings((prev: any) => ({ ...prev, stickerDeleteMaxRetries: Number(e.target.value || 4) }))
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
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'পেন্ডিং' : 'Pending'}</div>
                    <div className="text-xs font-black text-amber-600">{stickerQueue.pendingCount}</div>
                  </div>
                  <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ডিলিট' : 'Deleted'}</div>
                    <div className="text-xs font-black text-emerald-700">{stickerQueue.stats.totalVerifiedDeleted}</div>
                  </div>
                  <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'রিট্রাই' : 'Retried'}</div>
                    <div className="text-xs font-black text-blue-600">{stickerQueue.stats.totalRetried}</div>
                  </div>
                  <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ডুপ্লিকেট' : 'Deduped'}</div>
                    <div className="text-xs font-black text-slate-700">{stickerQueue.stats.totalDuplicatePrevented}</div>
                  </div>
                  <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'অ্যাডমিন নেই' : 'No Admin'}</div>
                    <div className="text-xs font-black text-rose-600">{stickerQueue.stats.totalFailedNoPermission}</div>
                  </div>
                  <div className="bg-white px-2 py-1.5 rounded border border-slate-200">
                    <div className="text-[9px] text-slate-500 font-semibold">{isBn ? 'ব্যর্থ' : 'Failed'}</div>
                    <div className="text-xs font-black text-rose-700">{stickerQueue.stats.totalFailed}</div>
                  </div>
                </div>

                {(stickerQueue.stats.totalFailed > 0 ||
                  stickerQueue.stats.totalFailedNoPermission > 0 ||
                  stickerQueue.recentHistory?.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="btn soft" onClick={onRetryFailedStickers}>
                      <RotateCcw size={11} /> {isBn ? 'ব্যর্থ স্টিকার রিট্রাই করুন' : 'Retry Failed Stickers'}
                    </button>
                    <button type="button" className="btn outline" onClick={onClearStickerQueueHistory}>
                      <Trash2 size={11} /> {isBn ? 'হিস্ট্রি ক্লিয়ার' : 'Clear History'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MEDIA & VIEW-ONCE GUARD */}
      {toolId === 'sec_media' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'মিডিয়া ও ভিউ-ওয়ান্স ব্লক নিয়ম' : 'Media & View-Once Filtering'}
              </h3>
              <p>
                {isBn
                  ? 'কোন ধরনের মিডিয়া গ্রুপে নিষিদ্ধ থাকবে তা এখান থেকে নিয়ন্ত্রণ করুন।'
                  : 'Control individual filters for View-Once, GIF, Video, and Image messages.'}
              </p>
            </div>
            <div className="symbol sr">
              <EyeOff size={16} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiViewOnceTitle}
                  {renderInfoBtn('antiViewOnce')}
                </span>
              </h4>
              <p>{t.antiViewOnceDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiViewOnce)}
                onChange={(e) => onUpdateToggle('antiViewOnce', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiGifTitle}
                  {renderInfoBtn('antiGif')}
                </span>
              </h4>
              <p>{t.antiGifDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiGif)}
                onChange={(e) => onUpdateToggle('antiGif', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiVideoTitle}
                  {renderInfoBtn('antiVideo')}
                </span>
              </h4>
              <p>{t.antiVideoDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiVideo)}
                onChange={(e) => onUpdateToggle('antiVideo', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiImageTitle}
                  {renderInfoBtn('antiImage')}
                </span>
              </h4>
              <p>{t.antiImageDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiImage)}
                onChange={(e) => onUpdateToggle('antiImage', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      )}

      {/* 6. ANTI-BADWORD & CUSTOM WORDS */}
      {toolId === 'sec_badwords' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'অ্যান্টি-গালি ও কাস্টম শব্দ ফিল্টার' : 'Profanity & Custom Badwords Filter'}
              </h3>
              <p>
                {isBn
                  ? '৬ ভাষার গালি অটো ডিলিট ও আপনার নিজস্ব নিষিদ্ধ শব্দের তালিকা।'
                  : 'Built-in 6-language profanity filter plus your own custom blocked word list.'}
              </p>
            </div>
            <div className="symbol sr">
              <Ban size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.antiBadwordTitle}
                  {renderInfoBtn('antiBadword')}
                </span>
              </h4>
              <p>{t.antiBadwordDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.antiBadword)}
                onChange={(e) => onUpdateToggle('antiBadword', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>{t.aiBadwordTitle}</h4>
              <p>{t.aiBadwordDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.aiBadwordDetection)}
                onChange={(e) => onUpdateToggle('aiBadwordDetection', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  <AudioLines size={13} className="text-[#087f55]" />
                  {isBn ? 'অফলাইন ভয়েস গালি গার্ড (Voice Anti-Abuse)' : 'Offline Voice Anti-Abuse (Whisper.cpp)'}
                  {renderInfoBtn('voiceModerationEnabled')}
                </span>
              </h4>
              <p>
                {isBn
                  ? 'পেইড API ছাড়াই গ্রুপের ভয়েস মেসেজ শুনে বাংলা/ইংরেজি গালি থাকলে অটো ডিলিট করবে।'
                  : 'Transcribes incoming group voice notes offline via Whisper.cpp and deletes profanity.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('voicemod')}
                className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-[#087f55] hover:underline cursor-pointer"
              >
                <span>{isBn ? 'ভয়েস সেটিংস ও হিস্ট্রি খুলুন' : 'Open Voice Guard Settings'}</span>
                <ArrowRight size={11} />
              </button>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.voiceModerationEnabled !== false}
                onChange={(e) => onUpdateToggle('voiceModerationEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="subpanel-soft mt-3">
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[11px] font-bold text-[#0f291e] mb-0">{t.customBadwordsLabel}</label>
              {renderInfoBtn('customBadwords')}
            </div>
            <p className="text-[10px] text-[#5f7368] mb-2">{t.customBadwordsHint}</p>
            <textarea
              className="field"
              style={{ height: '78px', padding: '8px 10px', resize: 'vertical' }}
              value={customBadwordsText}
              onChange={(e) => setCustomBadwordsText(e.target.value)}
              placeholder="badword1, badword2, ..."
            />
            <div className="mt-2">
              <button type="button" className="btn primary" onClick={onSaveBadwords}>
                <Save size={12} /> {t.saveBadwordsBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. BOSS & ADMIN MENTION AUTO-REPLY */}
      {toolId === 'sec_mention' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'বস ও অ্যাডমিন মেনশন অটো রিপ্লাই (API ছাড়া)' : 'Boss / Admin Mention Auto-Reply'}
              </h3>
              <p>
                {isBn
                  ? 'গ্রুপে বস (+8801632222592) বা অ্যাডমিনকে @মেনশন করলে বট সাথে সাথে ভদ্র রিপ্লাই দেবে।'
                  : 'Automatically replies in group when someone @mentions Boss Admin or group admins.'}
              </p>
            </div>
            <div className="symbol sg">
              <MessageSquareHeart size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                {isBn ? 'অ্যাডমিনকে মেনশন করলে অটো রিপ্লাই' : 'Admin Mention Auto-Reply (Zero API)'}
              </h4>
              <p>
                {isBn
                  ? 'শুধু বস অ্যাডমিন বা যেকোনো গ্রুপ অ্যাডমিনকে @মেনশন করলেই বট উত্তর দেবে।'
                  : 'Triggers automatically on Boss Admin or any group admin mention.'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.adminMentionReplyEnabled !== false}
                onChange={(e) => onUpdateToggle('adminMentionReplyEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          {settings.adminMentionReplyEnabled !== false && (
            <div className="subpanel-soft mt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-[#0f291e]">
                  {isBn ? 'অ্যাডমিন মেনশন রিপ্লাই কাস্টমাইজ করুন' : 'Customize Admin Mention Reply'}
                </span>
                <button type="button" className="btn primary" onClick={onSaveAdminMentionConfig}>
                  <Save size={11} /> {isBn ? 'সেভ করুন' : 'Save'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                  <label className="block text-[9.5px] font-bold text-[#5f7368] mb-1">
                    {isBn ? 'কাকে মেনশন করলে বলবে' : 'Trigger Target'}
                  </label>
                  <select
                    value={settings.adminMentionReplyTarget === 'boss_only' ? 'boss_only' : 'all_admins'}
                    onChange={(e) => {
                      const nextTarget = e.target.value === 'boss_only' ? 'boss_only' : 'all_admins';
                      onUpdateToggle('adminMentionReplyTarget', nextTarget);
                    }}
                    className="field"
                  >
                    <option value="all_admins">{isBn ? 'যেকোনো গ্রুপ অ্যাডমিন' : 'Any Group Admin'}</option>
                    <option value="boss_only">{isBn ? 'শুধু বস অ্যাডমিনকে' : 'Boss Admin Only'}</option>
                  </select>
                </div>
                <div className="sm:col-span-2 bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                  <label className="block text-[9.5px] font-bold text-[#5f7368] mb-1">
                    {isBn
                      ? 'মেনশন করলে বট যা লিখবে ({{admin}} = অ্যাডমিন, {{user}} = যে মেনশন করেছে)'
                      : 'Auto-Reply Message ({{admin}} = admin, {{user}} = sender)'}
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.adminMentionReplyMessage ??
                      '🛡️ সম্মানিত @{{admin}}, সদস্য @{{user}} আপনাকে মেনশন করেছেন। অ্যাডমিন বর্তমানে ব্যস্ত থাকতে পারেন — অনুগ্রহ করে একটু অপেক্ষা করুন, সময় পেলে উত্তর দেবেন।'
                    }
                    onChange={(e) =>
                      setSettings((prev: any) => ({ ...prev, adminMentionReplyMessage: e.target.value }))
                    }
                    className="w-full px-2 py-1.5 border border-emerald-950/[0.1] rounded-lg text-[11px] outline-none focus:border-[#087f55]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. AUTO SALAM, TYPING & SILENT MODERATION */}
      {toolId === 'sec_replies' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'সালাম, টাইপিং ও সাইলেন্ট কন্ট্রোল' : 'Auto Salam, Typing & Silent Controls'}
              </h3>
              <p>
                {isBn
                  ? 'বটের আচরণ, সালামের অটো উত্তর ও সাইলেন্ট মডারেশন এখান থেকে চালু/বন্ধ করুন।'
                  : 'Configure automatic Salam reply, WhatsApp typing presence, silent moderation & Maya triggers.'}
              </p>
            </div>
            <div className="symbol sb">
              <Bot size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                {isBn ? 'অটো সালাম উত্তর (গ্রুপে শুধু সালামের জবাব)' : 'Auto Salam Reply (Zero API)'}
              </h4>
              <p>
                {isBn
                  ? 'গ্রুপে কেউ সালাম দিলে কোনো AI API ছাড়াই স্বয়ংক্রিয়ভাবে সালামের উত্তর দেবে।'
                  : 'Automatically replies to Salam in groups with zero AI API key required.'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.autoSalamReplyEnabled !== false}
                onChange={(e) => onUpdateToggle('autoSalamReplyEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                {isBn ? 'বট টাইপিং ইন্ডিকেটর (Typing...)' : 'Bot Typing Indicator'}
              </h4>
              <p>
                {isBn
                  ? 'বট কোনো উত্তর বা সতর্কবার্তা লেখার আগে WhatsApp-এ "typing..." দেখাবে।'
                  : 'Displays live WhatsApp typing indicator before sending replies or warnings.'}
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.botTypingEnabled !== false}
                onChange={(e) => onUpdateToggle('botTypingEnabled', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.silentModTitle}
                  {renderInfoBtn('warningManagement')}
                </span>
              </h4>
              <p>{t.silentModDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.silentModeration)}
                onChange={(e) => onUpdateToggle('silentModeration', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.botReplyTitle}
                  {renderInfoBtn('botReply')}
                </span>
              </h4>
              <p>{t.botReplyDesc}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.botReply)}
                onChange={(e) => onUpdateToggle('botReply', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      )}

      {/* 9. BOSS INBOX FIGHT ALERT & SERVER NOTICE */}
      {toolId === 'sec_bossalert' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="font-extrabold text-[13px]">
                {isBn ? 'বস ইনবক্স অ্যালার্ট ও অটো সার্ভার নোটিশ' : 'Boss Inbox Fight Alert & Server Notice'}
              </h3>
              <p>
                {isBn
                  ? 'গ্রুপে ৩+ জন ঝগড়া/গালি দিলে বা সার্ভারে সমস্যা হলে আপনার বস ইনবক্সে সাথে সাথে অ্যালার্ট পাঠাবে।'
                  : 'Sends instant Boss inbox alerts for group fights or server issues without AI API.'}
              </p>
            </div>
            <div className="symbol so">
              <BellRing size={15} />
            </div>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>{isBn ? 'গ্রুপ ঝগড়া ও গালি অ্যালার্ট' : 'Group Fight Inbox Alert'}</h4>
              <p>{isBn ? 'একাধিক সদস্য একসাথে গালি বা ঝগড়া শুরু করলে সাথে সাথে বস ইনবক্সে জানাবে।' : 'Instant Boss alert when heated group arguments start.'}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.bossFightAlertEnabled !== false}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, bossFightAlertEnabled: e.target.checked }))
                }
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div className="toggle-info">
              <h4>{isBn ? 'অটো সার্ভার হেলথ নোটিশ' : 'Auto Server Health Notice'}</h4>
              <p>{isBn ? 'সার্ভারে ডিসকানেক্ট বা মেমোরি সমস্যা দেখা দিলে স্বয়ংক্রিয় সতর্কবার্তা পাঠাবে।' : 'Automatic notification on server issues or disconnections.'}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.serverErrorNoticeEnabled !== false}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, serverErrorNoticeEnabled: e.target.checked }))
                }
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="subpanel-soft mt-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                <label className="block text-[9.5px] font-bold text-[#5f7368] mb-1">
                  {isBn ? 'শুধুমাত্র এই একজন বস অ্যাডমিন নম্বর' : 'Single Boss Admin WhatsApp Number'}
                </label>
                <input
                  type="text"
                  value={settings.bossAdminNumber ?? '8801632222592'}
                  onChange={(e) => setSettings((prev: any) => ({ ...prev, bossAdminNumber: e.target.value }))}
                  placeholder="8801632222592"
                  className="field font-mono font-bold"
                />
              </div>
              <div className="bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                <label className="block text-[9.5px] font-bold text-[#5f7368] mb-1">
                  {isBn ? 'সার্ভার সমস্যা হলে কোথায় নোটিশ যাবে' : 'Server Problem Notice Target'}
                </label>
                <select
                  value={settings.serverErrorNoticeTarget || 'boss_inbox'}
                  onChange={(e) =>
                    setSettings((prev: any) => ({
                      ...prev,
                      serverErrorNoticeTarget: e.target.value as 'boss_inbox' | 'groups' | 'both',
                    }))
                  }
                  className="field font-bold"
                >
                  <option value="boss_inbox">{isBn ? 'শুধু বস অ্যাডমিনের ইনবক্সে' : 'Boss Inbox Only'}</option>
                  <option value="groups">{isBn ? 'সক্রিয় গ্রুপগুলোতে' : 'Active Groups'}</option>
                  <option value="both">{isBn ? 'বস ইনবক্স + গ্রুপ উভয় জায়গায়' : 'Both Boss & Groups'}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                <label className="block text-[9.5px] font-bold text-[#5f7368] mb-0.5">
                  {isBn ? 'কতজন গালি/ঝগড়া করলে' : 'Min Offenders'}
                </label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={settings.bossFightMinPeople ?? 3}
                  onChange={(e) =>
                    setSettings((prev: any) => ({ ...prev, bossFightMinPeople: Number(e.target.value || 3) }))
                  }
                  className="field font-bold"
                />
              </div>
              <div className="bg-white p-2 rounded-[10px] border border-emerald-950/[0.08]">
                <label className="block text-[9.5px] font-bold text-[#5f7368] mb-0.5">
                  {isBn ? 'সময় উইন্ডো (মিনিট)' : 'Window (min)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.bossFightWindowMinutes ?? 5}
                  onChange={(e) =>
                    setSettings((prev: any) => ({ ...prev, bossFightWindowMinutes: Number(e.target.value || 5) }))
                  }
                  className="field font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button type="button" className="btn outline" onClick={onTestBossAlert}>
                <Send size={11} /> {isBn ? 'বস টেস্ট' : 'Test Boss'}
              </button>
              <button type="button" className="btn primary" onClick={onSaveBossAndNoticeConfig}>
                <Save size={11} /> {isBn ? 'সেভ করুন' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
