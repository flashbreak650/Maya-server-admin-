import React from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FileText,
  HardDrive,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';

export interface CleanupReportView {
  id: string;
  timestamp: number;
  mode: 'cache' | 'temp' | 'logs' | 'duplicates' | 'full';
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

export interface StorageAlertView {
  id: string;
  timestamp: number;
  level: 'normal' | 'notice_70' | 'warning_85' | 'critical_95';
  thresholdPercent: number;
  usedPercent: number;
  messageBn: string;
  messageEn: string;
  bossNotified: boolean;
}

export interface StorageCleanupOverview {
  snapshot: {
    measuredAt: number;
    dataDir: string;
    persistentVolumeDetected: boolean;
    disk: {
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      availableBytes: number;
      usedPercent: number;
      alertLevel: 'normal' | 'notice_70' | 'warning_85' | 'critical_95';
    };
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
    };
    breakdown: {
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
    };
    totalReclaimableBytes: number;
    protectedSummary: {
      databaseIntact: boolean;
      primarySessionIntact: boolean;
      companionSessionIntact: boolean;
      stickerQueueIntact: boolean;
      errorLogsPreserved: boolean;
    };
  };
  settings: {
    autoCleanupEnabled: boolean;
    cacheIntervalHours: number;
    dailyTempCleanupEnabled: boolean;
    debugLogRetentionDays: number;
    preserveErrorLogs: boolean;
    autoHistoryCleanupEnabled?: boolean;
    historyRetentionHours?: number;
    alertThresholds: [number, number, number];
  };
  scheduler: {
    running: boolean;
    cleanupInProgress: boolean;
    lastCleanupAt: number;
    lastCacheCleanupAt: number;
    lastDailyCleanupAt: number;
    lastLogMaintenanceAt: number;
    lastHistoryCleanupAt?: number;
    nextCacheCleanupAt: number;
    nextDailyCleanupAt: number;
    totalRecoveredBytes: number;
    totalFilesCleaned: number;
    lastAlertLevel: string;
  };
  alerts: StorageAlertView[];
  history: CleanupReportView[];
}

export function formatBytesHuman(bytes?: number): string {
  const b = Number(bytes || 0);
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDateTime(ts?: number, isBn?: boolean): string {
  if (!ts || ts <= 0) return isBn ? 'এখনো চালানো হয়নি' : 'Not yet run';
  return new Date(ts).toLocaleString(isBn ? 'bn-BD' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatModeLabel(mode: CleanupReportView['mode'], trigger: 'auto' | 'manual', isBn: boolean): string {
  const prefix = trigger === 'auto' ? (isBn ? 'অটো' : 'Auto') : isBn ? 'ম্যানুয়াল' : 'Manual';
  switch (mode) {
    case 'cache':
      return `${prefix} · ${isBn ? 'ক্যাশ ক্লিনআপ' : 'Cache Cleanup'}`;
    case 'temp':
      return `${prefix} · ${isBn ? 'টেম্প ও মিডিয়া' : 'Temp & Media'}`;
    case 'logs':
      return `${prefix} · ${isBn ? 'ডিবাগ লগ আর্কাইভ' : 'Debug Log Archive'}`;
    case 'duplicates':
      return `${prefix} · ${isBn ? 'ডুপ্লিকেট ফাইল' : 'Duplicate Temp Files'}`;
    default:
      return `${prefix} · ${isBn ? 'সম্পূর্ণ অপ্টিমাইজেশন' : 'Full Safe Cleanup'}`;
  }
}

interface StorageCleanupPageProps {
  isBn: boolean;
  overview: StorageCleanupOverview | null;
  isLoading: boolean;
  runningMode: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onRunCleanup: (mode: 'cache' | 'temp' | 'logs' | 'duplicates' | 'full') => void;
  onSaveSettings: (patch: {
    autoCleanupEnabled?: boolean;
    dailyTempCleanupEnabled?: boolean;
    preserveErrorLogs?: boolean;
    cacheIntervalHours?: number;
    debugLogRetentionDays?: number;
    autoHistoryCleanupEnabled?: boolean;
    historyRetentionHours?: number;
  }) => void;
  onClearHistoriesNow?: () => void;
}

export function StorageCleanupPage({
  isBn,
  overview,
  isLoading,
  runningMode,
  onBack,
  onRefresh,
  onRunCleanup,
  onSaveSettings,
  onClearHistoriesNow,
}: StorageCleanupPageProps) {
  const [autoEnabled, setAutoEnabled] = React.useState(true);
  const [dailyTempEnabled, setDailyTempEnabled] = React.useState(true);
  const [preserveErrors, setPreserveErrors] = React.useState(true);
  const [cacheHours, setCacheHours] = React.useState(3);
  const [logRetentionDays, setLogRetentionDays] = React.useState(7);
  const [autoHistoryClear, setAutoHistoryClear] = React.useState(true);
  const [historyRetentionHours, setHistoryRetentionHours] = React.useState(24);

  React.useEffect(() => {
    if (overview?.settings) {
      setAutoEnabled(Boolean(overview.settings.autoCleanupEnabled));
      setDailyTempEnabled(Boolean(overview.settings.dailyTempCleanupEnabled));
      setPreserveErrors(Boolean(overview.settings.preserveErrorLogs));
      setCacheHours(Number(overview.settings.cacheIntervalHours || 3));
      setLogRetentionDays(Number(overview.settings.debugLogRetentionDays || 7));
      setAutoHistoryClear(overview.settings.autoHistoryCleanupEnabled !== false);
      setHistoryRetentionHours(Number(overview.settings.historyRetentionHours || 24));
    }
  }, [
    overview?.settings?.autoCleanupEnabled,
    overview?.settings?.dailyTempCleanupEnabled,
    overview?.settings?.preserveErrorLogs,
    overview?.settings?.cacheIntervalHours,
    overview?.settings?.debugLogRetentionDays,
    overview?.settings?.autoHistoryCleanupEnabled,
    overview?.settings?.historyRetentionHours,
  ]);

  const snap = overview?.snapshot;
  const sched = overview?.scheduler;
  const disk = snap?.disk;
  const mem = snap?.memory;
  const bd = snap?.breakdown;
  const usedPct = disk?.usedPercent ?? 0;

  const progressColor =
    usedPct >= 95
      ? 'bg-rose-600'
      : usedPct >= 85
      ? 'bg-amber-600'
      : usedPct >= 70
      ? 'bg-amber-500'
      : 'bg-[#087f55]';

  const statusText =
    usedPct >= 95
      ? isBn
        ? 'সংকটজনক (≥95%)'
        : 'Critical (≥95%)'
      : usedPct >= 85
      ? isBn
        ? 'উচ্চ ব্যবহার (≥85%)'
        : 'High Warning (≥85%)'
      : usedPct >= 70
      ? isBn
        ? 'সতর্ক সীমা (≥70%)'
        : 'Notice (≥70%)'
      : isBn
      ? 'স্বাভাবিক ও সুস্থ'
      : 'Healthy';

  const statusColor =
    usedPct >= 95
      ? 'text-rose-700'
      : usedPct >= 85
      ? 'text-amber-700'
      : usedPct >= 70
      ? 'text-amber-700'
      : 'text-emerald-700';

  const cleanableRows = bd
    ? [
        {
          label: isBn ? 'অস্থায়ী ক্যাশ (Server & App Cache)' : 'App & Runtime Disk Cache',
          count: bd.cleanableCacheFiles,
          bytes: bd.cleanableCacheBytes,
          policy: isBn ? 'প্রতি ৩ ঘণ্টায় অটো ক্লিন' : 'Auto every 3h',
          isProtected: false,
        },
        {
          label: isBn ? 'টেম্পোরারি ফাইল (Temp Artifacts)' : 'Temporary System Artifacts',
          count: bd.tempFilesCount,
          bytes: bd.tempFilesBytes,
          policy: isBn ? 'প্রতিদিন অটো ক্লিন' : 'Daily auto cleanup',
          isProtected: false,
        },
        {
          label: isBn ? 'টেম্পোরারি মিডিয়া (Temp Media)' : 'Temporary Media Files',
          count: bd.tempMediaFiles,
          bytes: bd.tempMediaBytes,
          policy: isBn ? 'অব্যবহৃত হলে পরিষ্কার' : 'Cleaned when unused',
          isProtected: false,
        },
        {
          label: isBn ? 'ডুপ্লিকেট টেম্প ফাইল (Exact SHA-256)' : 'Duplicate Temporary Files (SHA-256)',
          count: bd.duplicateTempFiles,
          bytes: bd.duplicateTempBytes,
          policy: isBn ? 'নতুন কপি রেখে বাকিগুলো রিমুভ' : 'Keeps newest, removes dupes',
          isProtected: false,
        },
        {
          label: isBn
            ? `ডিবাগ লগ (${bd.archivableDebugLogsCount}টি ৭+ দিনের পুরোনো)`
            : `Debug Logs (${bd.archivableDebugLogsCount} > 7d old)`,
          count: bd.debugLogsCount,
          bytes: bd.debugLogsBytes,
          policy: isBn ? '৭+ দিন পর Gzip আর্কাইভ' : 'Compressed archive > 7d',
          isProtected: false,
        },
        {
          label: isBn ? 'গুরুত্বপূর্ণ এরর লগ (Important Error Logs)' : 'Important Error Logs',
          count: bd.protectedErrorLogsCount,
          bytes: bd.protectedErrorLogsBytes,
          policy: isBn ? 'সুরক্ষিত — কখনোই ডিলিট হবে না' : 'Preserved — never deleted',
          isProtected: true,
        },
        {
          label: isBn ? 'বট ডাটাবেজ, ওয়ার্নিং ও পেন্ডিং কিউ' : 'Database, Warnings, Bans & Queue',
          count: null,
          bytes: bd.protectedDatabaseBytes,
          policy: isBn ? '১০০% সুরক্ষিত (কখনোই ডিলিট নয়)' : '100% Protected',
          isProtected: true,
        },
        {
          label: isBn ? 'WhatsApp ক্রেডেনশিয়াল ও সেশন' : 'WhatsApp Auth Sessions & Creds',
          count: null,
          bytes: bd.protectedSessionsBytes,
          policy: isBn ? '১০০% সুরক্ষিত (ডিসকানেক্ট মুক্ত)' : '100% Protected',
          isProtected: true,
        },
      ]
    : [];

  return (
    <section className="page active" id="storagecleanup">
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

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || Boolean(runningMode)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-xs font-bold text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>{isBn ? 'স্টোরেজ রিফ্রেশ' : 'Refresh Monitor'}</span>
          </button>
        </div>

        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
          {isBn ? 'সার্ভার স্টোরেজ মনিটর ও অটো ক্লিনআপ' : 'Server Storage Monitor & Auto Cleanup'}
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          {isBn
            ? 'ডাটাবেজ ও WhatsApp সেশন সম্পূর্ণ সুরক্ষিত রেখে প্রতি ৩ ঘণ্টায় ক্যাশ, প্রতিদিন টেম্প ফাইল, ডুপ্লিকেট ও ৭ দিনের পুরোনো ডিবাগ লগ নিরাপদভাবে অপ্টিমাইজ করে।'
            : 'Safely cleans cache every 3h, daily temporary/duplicate files, and archives debug logs older than 7 days without touching WhatsApp auth, database, or active queues.'}
        </p>
      </div>

      {/* Primary KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
            <span>{isBn ? 'ডিস্ক ব্যবহার' : 'Disk Usage'}</span>
            <HardDrive size={14} className="text-slate-400" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums">
            {disk ? `${usedPct.toFixed(1)}%` : '—'}
          </div>
          <div className={`text-[11px] font-bold mt-0.5 ${statusColor}`}>{statusText}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
            <span>{isBn ? 'মোট রিকভার স্টোরেজ' : 'Recovered Storage'}</span>
            <Sparkles size={14} className="text-emerald-600" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-emerald-700 tabular-nums">
            {formatBytesHuman(sched?.totalRecoveredBytes)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn
              ? `${sched?.totalFilesCleaned || 0}টি ফাইল/লগ অপ্টিমাইজ`
              : `${sched?.totalFilesCleaned || 0} items cleaned`}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
            <span>{isBn ? 'সর্বশেষ ক্লিনআপ' : 'Last Cleanup Time'}</span>
            <Clock size={14} className="text-slate-400" />
          </div>
          <div className="text-sm sm:text-base font-extrabold text-slate-900 tabular-nums leading-snug">
            {formatDateTime(sched?.lastCleanupAt, isBn)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn
              ? `পরবর্তী ক্যাশ: ${formatDateTime(sched?.nextCacheCleanupAt, true)}`
              : `Next cache: ${formatDateTime(sched?.nextCacheCleanupAt, false)}`}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
            <span>{isBn ? 'সার্ভার র‍্যাম ও সুরক্ষা' : 'Memory & Data Guard'}</span>
            <ShieldCheck size={14} className="text-emerald-600" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums">
            {mem ? `${mem.rssMb} MB` : '—'}
          </div>
          <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
            {isBn ? 'DB ও WA সেশন ১০০% সুরক্ষিত' : 'DB & WA Creds Protected'}
          </div>
        </div>
      </div>

      {/* Disk Usage Gauge + Manual Cleanup Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'লাইভ সার্ভার স্টোরেজ মনিটর (৭০% / ৮৫% / ৯৫% অ্যালার্ট)' : 'Live Storage Monitor (70% / 85% / 95% Alerts)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {disk
                ? isBn
                  ? `ব্যবহৃত: ${formatBytesHuman(disk.usedBytes)} / মোট: ${formatBytesHuman(disk.totalBytes)} · খালি আছে: ${formatBytesHuman(disk.freeBytes)} · পরিষ্কারযোগ্য: ${formatBytesHuman(snap?.totalReclaimableBytes)}`
                  : `Used: ${formatBytesHuman(disk.usedBytes)} / Total: ${formatBytesHuman(disk.totalBytes)} · Free: ${formatBytesHuman(disk.freeBytes)} · Reclaimable: ${formatBytesHuman(snap?.totalReclaimableBytes)}`
                : isBn
                ? 'স্টোরেজ তথ্য লোড হচ্ছে...'
                : 'Loading storage metrics...'}
            </p>
          </div>

          <button
            type="button"
            disabled={Boolean(runningMode)}
            onClick={() => onRunCleanup('full')}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#087f55] hover:bg-[#066c49] disabled:opacity-60 text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Trash2 size={14} />
            <span>
              {runningMode === 'full'
                ? isBn
                  ? 'ক্লিনআপ চলছে...'
                  : 'Cleaning...'
                : isBn
                ? 'এখনই সম্পূর্ণ ক্লিনআপ চালান'
                : 'Run Full Cleanup Now'}
            </span>
          </button>
        </div>

        {/* Visual Usage Bar with Threshold Ticks */}
        <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${Math.min(100, Math.max(usedPct > 0 ? 1.5 : 0, usedPct))}%` }}
          />
          <div className="absolute top-0 bottom-0 left-[70%] w-px bg-amber-500/70" title="70% Notice" />
          <div className="absolute top-0 bottom-0 left-[85%] w-px bg-orange-600/80" title="85% Warning" />
          <div className="absolute top-0 bottom-0 left-[95%] w-px bg-rose-700" title="95% Critical" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-slate-500 tabular-nums">
          <span>
            {snap
              ? `${isBn ? 'সার্ভার ডাটা পথ' : 'Data Path'}: ${snap.dataDir} · ${
                  snap.persistentVolumeDetected
                    ? isBn
                      ? 'Persistent Volume সক্রিয়'
                      : 'Persistent Volume Active'
                    : isBn
                    ? 'স্ট্যান্ডার্ড কন্টেইনার ডিস্ক'
                    : 'Container Disk'
                }`
              : ''}
          </span>
          <span>
            {isBn ? 'সতর্ক সীমা: ৭০% নোটিশ · ৮৫% সতর্কতা · ৯৫% জরুরি অ্যালার্ট' : 'Alerts at: 70% Notice · 85% Warning · 95% Critical'}
          </span>
        </div>

        {/* Targeted Action Buttons */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(runningMode)}
            onClick={() => onRunCleanup('cache')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw size={13} className={runningMode === 'cache' ? 'animate-spin text-emerald-700' : 'text-emerald-700'} />
            <span>{isBn ? 'ক্যাশ ও র‍্যাম অপ্টিমাইজ' : 'Clean Cache Only'}</span>
          </button>

          <button
            type="button"
            disabled={Boolean(runningMode)}
            onClick={() => onRunCleanup('temp')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Copy size={13} className="text-amber-700" />
            <span>{isBn ? 'টেম্প ও ডুপ্লিকেট ফাইল' : 'Clean Temp & Duplicates'}</span>
          </button>

          <button
            type="button"
            disabled={Boolean(runningMode)}
            onClick={() => onRunCleanup('logs')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Archive size={13} className="text-blue-700" />
            <span>{isBn ? '৭+ দিনের ডিবাগ লগ আর্কাইভ' : 'Archive 7d+ Debug Logs'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Section: Storage Breakdown + Auto-Scheduler Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {isBn ? 'ডিরেক্টরি অনুযায়ী স্টোরেজ ও সুরক্ষা বিশ্লেষণ' : 'Storage Breakdown & Safety Guard'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isBn
                  ? 'প্রতিটি ফোল্ডার পরিষ্কারের আগে ব্যবহার যাচাই হয় এবং গুরুত্বপূর্ণ ডাটা স্পর্শ করা হয় না।'
                  : 'Every directory is verified before cleanup; critical bot stores are strictly excluded.'}
              </p>
            </div>
            <Database size={16} className="text-slate-400 shrink-0" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                  <th className="py-2 pr-3 font-bold">{isBn ? 'ক্যাটাগরি' : 'Category'}</th>
                  <th className="py-2 px-3 font-bold">{isBn ? 'নীতি / অবস্থা' : 'Policy'}</th>
                  <th className="py-2 px-3 font-bold text-right tabular-nums">{isBn ? 'ফাইল' : 'Files'}</th>
                  <th className="py-2 pl-3 font-bold text-right tabular-nums">{isBn ? 'সাইজ' : 'Size'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cleanableRows.map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{row.label}</td>
                    <td className={`py-2.5 px-3 text-[11px] font-semibold ${row.isProtected ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {row.policy}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                      {row.count === null ? '—' : row.count}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-slate-900">
                      {formatBytesHuman(row.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auto Cleanup Scheduler Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 mb-1">
              {isBn ? 'অটো ক্লিনআপ শিডিউলার' : 'Auto Cleanup Scheduler'}
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">
              {isBn
                ? 'সার্ভার রিস্টার্ট হলেও শিডিউল স্বয়ংক্রিয়ভাবে চলবে ও হোয়াটসঅ্যাপ সংযোগ অটুট রাখবে।'
                : 'Schedule persists across server restarts with zero WhatsApp downtime.'}
            </p>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">
                  {isBn ? 'অটোমেটিক ক্লিনআপ সিস্টেম' : 'Auto Cleanup System'}
                </span>
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#087f55]"
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">
                  {isBn ? 'দৈনিক টেম্প ও ডুপ্লিকেট ক্লিনআপ' : 'Daily Temp & Duplicates'}
                </span>
                <input
                  type="checkbox"
                  checked={dailyTempEnabled}
                  onChange={(e) => setDailyTempEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#087f55]"
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">
                  {isBn ? 'গুরুত্বপূর্ণ এরর লগ সংরক্ষণ' : 'Preserve Important Error Logs'}
                </span>
                <input
                  type="checkbox"
                  checked={preserveErrors}
                  onChange={(e) => setPreserveErrors(e.target.checked)}
                  className="w-4 h-4 accent-[#087f55]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {isBn ? 'ক্যাশ ইন্টারভাল (ঘণ্টা)' : 'Cache Interval (hr)'}
                  </label>
                  <select
                    value={cacheHours}
                    onChange={(e) => setCacheHours(Number(e.target.value))}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value={1}>1h</option>
                    <option value={3}>3h (Default)</option>
                    <option value={6}>6h</option>
                    <option value={12}>12h</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {isBn ? 'ডিবাগ লগ মেয়াদ (দিন)' : 'Debug Log Days'}
                  </label>
                  <select
                    value={logRetentionDays}
                    onChange={(e) => setLogRetentionDays(Number(e.target.value))}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (Default)</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700">
                    {isBn ? 'স্টিকার, ওয়ার্নিং ও রিমুভ হিস্ট্রি অটো-ক্লিয়ার' : 'Auto-Clear Sticker, Warning & Remove History'}
                  </span>
                  <input
                    type="checkbox"
                    checked={autoHistoryClear}
                    onChange={(e) => setAutoHistoryClear(e.target.checked)}
                    className="w-4 h-4 accent-[#087f55]"
                  />
                </label>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    {isBn ? 'হিস্ট্রি কতক্ষণ পর অটো ক্লিয়ার হবে' : 'Clear Histories Older Than'}
                  </label>
                  <select
                    value={historyRetentionHours}
                    onChange={(e) => setHistoryRetentionHours(Number(e.target.value))}
                    className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value={1}>{isBn ? '১ ঘণ্টা পর' : '1 Hour'}</option>
                    <option value={3}>{isBn ? '৩ ঘণ্টা পর' : '3 Hours'}</option>
                    <option value={6}>{isBn ? '৬ ঘণ্টা পর' : '6 Hours'}</option>
                    <option value={12}>{isBn ? '১২ ঘণ্টা পর' : '12 Hours'}</option>
                    <option value={24}>{isBn ? '২৪ ঘণ্টা (ডিফল্ট)' : '24 Hours (Default)'}</option>
                    <option value={72}>{isBn ? '৩ দিন পর' : '72 Hours'}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() =>
                onSaveSettings({
                  autoCleanupEnabled: autoEnabled,
                  dailyTempCleanupEnabled: dailyTempEnabled,
                  preserveErrorLogs: preserveErrors,
                  cacheIntervalHours: cacheHours,
                  debugLogRetentionDays: logRetentionDays,
                  autoHistoryCleanupEnabled: autoHistoryClear,
                  historyRetentionHours,
                })
              }
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save size={13} />
              <span>{isBn ? 'শিডিউল সেটিংস সেভ করুন' : 'Save Scheduler Settings'}</span>
            </button>
            {onClearHistoriesNow && (
              <button
                type="button"
                onClick={onClearHistoriesNow}
                className="w-full min-h-[38px] px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{isBn ? 'এখনই সব হিস্ট্রি ক্লিয়ার (স্টিকার + ওয়ার্নিং + রিমুভ)' : 'Clear Sticker, Warning & Remove History Now'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Safety Guarantee Notice */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 mb-4 flex items-start gap-2.5">
        <CheckCircle2 size={16} className="text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-950 leading-relaxed">
          <span className="font-extrabold">
            {isBn ? 'বিশেষ ডাটা সুরক্ষা গ্যারান্টি: ' : 'Strict Data Protection Guarantee: '}
          </span>
          {isBn
            ? 'ডাটাবেজ ফাইল, WhatsApp সেশন ও ক্রেডেনশিয়াল, পেন্ডিং মেসেজ কিউ, গ্রুপ সুরক্ষা সেটিংস এবং গুরুত্বপূর্ণ এরর লগ সুরক্ষিত রেখে শুধু নির্ধারিত মেয়াদের পুরোনো স্টিকার, ওয়ার্নিং ও রিমুভ হিস্ট্রি অটো-ক্লিয়ার করা হয়।'
            : 'Core settings, WhatsApp auth credentials, pending queues, and important error logs stay protected while expired sticker, warning, and remove histories auto-clear on schedule.'}
        </div>
      </div>

      {/* Storage Threshold Alerts (70%, 85%, 95%) */}
      {overview?.alerts && overview.alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle size={15} className="text-amber-600" />
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'স্টোরেজ সতর্কবার্তা লগ (৭০% / ৮৫% / ৯৫%)' : 'Storage Threshold Alert Log (70% / 85% / 95%)'}
            </h3>
          </div>
          <div className="space-y-2">
            {overview.alerts.slice(0, 8).map((al) => (
              <div key={al.id} className="py-2 border-b border-slate-100 last:border-b-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <span className="font-semibold text-slate-800">{isBn ? al.messageBn : al.messageEn}</span>
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                  {formatDateTime(al.timestamp, isBn)} ·{' '}
                  {al.bossNotified ? (isBn ? 'বস ইনবক্সে পাঠানো হয়েছে' : 'Admin alerted') : isBn ? 'সিস্টেম রেকর্ড' : 'Logged'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup History & Before/After Reports */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBn ? 'ক্লিনআপ হিস্ট্রি ও রিপোর্ট (আগে এবং পরে)' : 'Cleanup History & Before/After Reports'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {isBn
                ? 'প্রতিটি ক্লিনআপের আগে-পরের স্টোরেজ, উদ্ধারকৃত জায়গা ও সুরক্ষিত ফাইলের প্রমাণপত্র'
                : 'Audit trail showing before/after storage, recovered bytes, and protected files preserved.'}
            </p>
          </div>
          <FileText size={15} className="text-slate-400 shrink-0" />
        </div>

        {!overview?.history || overview.history.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs font-semibold text-slate-500">
              {isBn
                ? 'এখনো কোনো ক্লিনআপ রিপোর্ট রেকর্ড হয়নি। উপরের বাটন থেকে প্রথম নিরাপদ ক্লিনআপ চালান অথবা প্রতি ৩ ঘণ্টায় অটোমেটিক চলবে।'
                : 'No cleanup reports recorded yet. Run your first safe cleanup above or wait for the 3-hour scheduler.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                  <th className="py-2 pr-3 font-bold">{isBn ? 'সময় ও ধরন' : 'Time & Type'}</th>
                  <th className="py-2 px-3 font-bold">{isBn ? 'বিবরণ' : 'Summary'}</th>
                  <th className="py-2 px-3 font-bold text-right tabular-nums">{isBn ? 'আগে → পরে (ম্যানেজড)' : 'Before → After'}</th>
                  <th className="py-2 pl-3 font-bold text-right tabular-nums">{isBn ? 'রিকভার' : 'Recovered'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.history.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 align-top">
                      <div className="font-bold text-slate-900">{formatModeLabel(rep.mode, rep.trigger, isBn)}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {formatDateTime(rep.timestamp, isBn)} · {rep.durationMs}ms
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top text-slate-700">
                      <div>{isBn ? rep.summaryBn : rep.summaryEn}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {isBn
                          ? `ফাইল: ${rep.filesDeleted} · ডুপ্লিকেট: ${rep.duplicatesRemoved} · আর্কাইভ: ${rep.logsArchived} · সুরক্ষিত স্কিপ: ${rep.skippedProtectedCount}`
                          : `Files: ${rep.filesDeleted} · Dupes: ${rep.duplicatesRemoved} · Archived: ${rep.logsArchived} · Protected skipped: ${rep.skippedProtectedCount}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top text-right tabular-nums text-slate-600 whitespace-nowrap">
                      {formatBytesHuman(rep.beforeManagedBytes)} → {formatBytesHuman(rep.afterManagedBytes)}
                    </td>
                    <td className="py-2.5 pl-3 align-top text-right font-extrabold tabular-nums text-emerald-700 whitespace-nowrap">
                      +{formatBytesHuman(rep.recoveredBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
