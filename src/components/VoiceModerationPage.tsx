import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  Ban,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  FileAudio,
  Languages,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';

export interface VoiceModerationRecordView {
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
  scriptSummary: string;
  isProfane: boolean;
  confidenceScore: number;
  matchedWords: string[];
  matchedCategories: string[];
  contextReason: string;
  action: 'deleted' | 'kept' | 'delete_failed' | 'error';
  status: 'profane_deleted' | 'clean' | 'no_admin_permission' | 'delete_failed' | 'skipped_admin' | 'failed';
  deletedFromWhatsapp: boolean;
  attempts: number;
  processingMs: number;
  modelUsed: string;
  errorMessage?: string;
}

export interface VoiceModerationOverview {
  engine: {
    offlineReady: boolean;
    whisperBinaryFound: boolean;
    whisperBinaryPath: string;
    ffmpegFound: boolean;
    activeModelId: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';
    activeModelReady: boolean;
    tempAudioFilesCount: number;
    tempAudioBytes: number;
    zeroPaidApi: boolean;
  };
  hardware: {
    cpuCores: number;
    totalRamMb: number;
    freeRamMb: number;
    diskFreeGb: number;
    diskTotalGb: number;
    platform: string;
  };
  models: Array<{
    id: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';
    fileName: string;
    sizeLabel: string;
    ramEstimateMb: number;
    labelBn: string;
    labelEn: string;
    recommended: boolean;
    ready: boolean;
    actualSizeMb: number;
    downloading: boolean;
    progressPercent: number;
    downloadError: string | null;
  }>;
  queue: {
    activeJobId: string | null;
    activeGroupName: string | null;
    pendingCount: number;
    retryingCount: number;
    isProcessing: boolean;
  };
  settings: {
    voiceModerationEnabled: boolean;
    voiceDetectBangla: boolean;
    voiceDetectEnglish: boolean;
    voiceDetectBanglish: boolean;
    voiceProfanitySensitivity: 'low' | 'medium' | 'high';
    voiceAllowedWords: string[];
    voiceBlockedWords: string[];
    voiceWhisperModel: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1';
  };
  stats: {
    totalProcessed: number;
    profaneDetected: number;
    deletedCount: number;
    cleanCount: number;
    failedCount: number;
    skippedDuplicates: number;
    avgProcessingMs: number;
    dedupeTrackedCount: number;
  };
  history: VoiceModerationRecordView[];
}

interface VoiceModerationPageProps {
  isBn: boolean;
  overview: VoiceModerationOverview | null;
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
  onSaveSettings: (patch: Partial<VoiceModerationOverview['settings']>) => Promise<void>;
  onEnsureModel: (modelId: 'tiny-q5_1' | 'base-q5_1' | 'small-q5_1') => Promise<void>;
  onRetryQueue: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  onTestAudio: (payload: {
    audioBase64: string;
    fileName: string;
    mimeType: string;
    config?: {
      detectBangla: boolean;
      detectEnglish: boolean;
      detectBanglish: boolean;
      sensitivity: 'low' | 'medium' | 'high';
      allowedWords: string[];
      blockedWords: string[];
    };
  }) => Promise<any>;
}

export function VoiceModerationPage({
  isBn,
  overview,
  isLoading,
  onBack,
  onRefresh,
  onSaveSettings,
  onEnsureModel,
  onRetryQueue,
  onClearHistory,
  onTestAudio,
}: VoiceModerationPageProps) {
  const s = overview?.settings;

  const [enabled, setEnabled] = useState(s?.voiceModerationEnabled ?? true);
  const [detectBangla, setDetectBangla] = useState(s?.voiceDetectBangla ?? true);
  const [detectEnglish, setDetectEnglish] = useState(s?.voiceDetectEnglish ?? true);
  const [detectBanglish, setDetectBanglish] = useState(s?.voiceDetectBanglish ?? true);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>(s?.voiceProfanitySensitivity || 'medium');
  const [modelId, setModelId] = useState<'tiny-q5_1' | 'base-q5_1' | 'small-q5_1'>(s?.voiceWhisperModel || 'base-q5_1');
  const [allowedWords, setAllowedWords] = useState<string[]>(s?.voiceAllowedWords || []);
  const [blockedWords, setBlockedWords] = useState<string[]>(s?.voiceBlockedWords || []);
  const [newAllowedWord, setNewAllowedWord] = useState('');
  const [newBlockedWord, setNewBlockedWord] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [historyFilter, setHistoryFilter] = useState<'all' | 'deleted' | 'clean' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Audio Test Lab State
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!overview?.settings) return;
    setEnabled(overview.settings.voiceModerationEnabled);
    setDetectBangla(overview.settings.voiceDetectBangla);
    setDetectEnglish(overview.settings.voiceDetectEnglish);
    setDetectBanglish(overview.settings.voiceDetectBanglish);
    setSensitivity(overview.settings.voiceProfanitySensitivity);
    setModelId(overview.settings.voiceWhisperModel);
    setAllowedWords(overview.settings.voiceAllowedWords || []);
    setBlockedWords(overview.settings.voiceBlockedWords || []);
  }, [overview]);

  // Poll automatically while any model download is in progress
  const anyDownloading = overview?.models?.some((m) => m.downloading);
  useEffect(() => {
    if (!anyDownloading) return;
    const t = setInterval(() => {
      onRefresh();
    }, 2500);
    return () => clearInterval(t);
  }, [anyDownloading, onRefresh]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveSettings({
        voiceModerationEnabled: enabled,
        voiceDetectBangla: detectBangla,
        voiceDetectEnglish: detectEnglish,
        voiceDetectBanglish: detectBanglish,
        voiceProfanitySensitivity: sensitivity,
        voiceWhisperModel: modelId,
        voiceAllowedWords: allowedWords,
        voiceBlockedWords: blockedWords,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addAllowed = () => {
    const clean = newAllowedWord.trim();
    if (clean.length < 2) return;
    if (!allowedWords.some((w) => w.toLowerCase() === clean.toLowerCase())) {
      setAllowedWords((prev) => [...prev, clean]);
    }
    setNewAllowedWord('');
  };

  const addBlocked = () => {
    const clean = newBlockedWord.trim();
    if (clean.length < 2) return;
    if (!blockedWords.some((w) => w.toLowerCase() === clean.toLowerCase())) {
      setBlockedWords((prev) => [...prev, clean]);
    }
    setNewBlockedWord('');
  };

  const runRealAudioFileTest = async (blobOrFile: Blob, fileName: string, mimeType: string) => {
    setIsTestingAudio(true);
    setTestError(null);
    setTestResult(null);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Audio file read error'));
        reader.readAsDataURL(blobOrFile);
      });
      const res = await onTestAudio({
        audioBase64: base64,
        fileName,
        mimeType,
        config: {
          detectBangla,
          detectEnglish,
          detectBanglish,
          sensitivity,
          allowedWords,
          blockedWords,
        },
      });
      setTestResult(res);
    } catch (err: any) {
      setTestError(err?.message || 'অডিও টেস্ট ব্যর্থ হয়েছে');
    } finally {
      setIsTestingAudio(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    runRealAudioFileTest(file, file.name, file.type || 'audio/ogg');
    e.target.value = '';
  };

  const toggleMicRecording = async () => {
    if (isRecording) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 64) {
          const ext = (recorder.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
          runRealAudioFileTest(blob, `mic_recording.${ext}`, recorder.mimeType || 'audio/webm');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setTestError(isBn ? 'মাইক্রোফোন পারমিশন পাওয়া যায়নি বা সাপোর্টেড নয়।' : err?.message || 'Microphone unavailable');
    }
  };

  const filteredHistory = (overview?.history || []).filter((item) => {
    if (historyFilter === 'deleted' && item.status !== 'profane_deleted') return false;
    if (historyFilter === 'clean' && item.status !== 'clean' && item.status !== 'skipped_admin') return false;
    if (
      historyFilter === 'failed' &&
      item.status !== 'failed' &&
      item.status !== 'delete_failed' &&
      item.status !== 'no_admin_permission'
    ) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${item.groupName} ${item.senderName} ${item.senderPhone} ${item.transcript} ${item.matchedWords.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const engineReady = Boolean(overview?.engine.offlineReady);

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="mb-2 pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} className="text-emerald-700" />
            <span>{isBn ? 'হোম পেজ' : 'Back Home'}</span>
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <AudioLines size={19} className="text-emerald-700" />
              <span>{isBn ? 'অফলাইন ভয়েস AI অ্যান্টি-অ্যাবিউজ' : 'Offline AI Voice Anti-Abuse'}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500">
              {isBn
                ? 'Whisper.cpp ওপেন-সোর্স অফলাইন মডেল · পেইড API বা কী ছাড়াই গ্রুপ ভয়েস মেসেজে গালি শনাক্ত ও ডিলিট'
                : 'Local Whisper.cpp STT · Zero Paid APIs · Auto-deletes abusive WhatsApp voice notes'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={isLoading}
            className="btn text-xs font-bold"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn primary text-xs font-extrabold"
          >
            <Save size={13} />
            <span>{isSaving ? (isBn ? 'সেভ হচ্ছে...' : 'Saving...') : isBn ? 'সেটিংস সেভ' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-3.5">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>{isBn ? 'মোট ভয়েস স্ক্যান' : 'Voice Scanned'}</span>
            <Volume2 size={14} className="text-emerald-700" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {overview?.stats.totalProcessed ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn
              ? `${overview?.stats.skippedDuplicates ?? 0} ডুপ্লিকেট স্কিপ`
              : `${overview?.stats.skippedDuplicates ?? 0} dupes skipped`}
          </div>
        </div>

        <div className="card p-3.5">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>{isBn ? 'গালি ডিলিট হয়েছে' : 'Abuse Deleted'}</span>
            <Ban size={14} className="text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1 tabular-nums">
            {overview?.stats.deletedCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {isBn
              ? `${overview?.stats.profaneDetected ?? 0}টি শনাক্ত হয়েছে`
              : `${overview?.stats.profaneDetected ?? 0} flagged total`}
          </div>
        </div>

        <div className="card p-3.5">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>{isBn ? 'পরিষ্কার ও অক্ষত' : 'Clean & Kept'}</span>
            <CheckCircle2 size={14} className="text-emerald-700" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            {overview?.stats.cleanCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isBn ? 'নিরাপদ ভয়েস নোট অক্ষত' : 'Safe clips untouched'}
          </div>
        </div>

        <div className="card p-3.5">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>{isBn ? 'গড় প্রসেসিং ও কিউ' : 'Avg Speed & Queue'}</span>
            <Clock size={14} className="text-sky-700" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {overview?.stats.avgProcessingMs ? `${(overview.stats.avgProcessingMs / 1000).toFixed(1)}s` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {overview?.queue.isProcessing
              ? isBn
                ? `প্রসেস চলছে (${overview.queue.pendingCount} অপেক্ষমাণ)`
                : `Running (${overview.queue.pendingCount} queued)`
              : isBn
                ? `কিউ খালি · টেম্প ফাইল ${overview?.engine.tempAudioFilesCount ?? 0}`
                : `Idle · Temp files ${overview?.engine.tempAudioFilesCount ?? 0}`}
          </div>
        </div>
      </div>

      {/* Main Grid: Settings + Offline Engine Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Admin Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-emerald-700" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  {isBn ? 'ভয়েস অ্যান্টি-অ্যাবিউজ অ্যাডমিন কন্ট্রোল' : 'Voice Protection Controls'}
                </h2>
              </div>
              <span
                className={`text-[10px] font-extrabold px-2 py-1 rounded-md border ${
                  enabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {enabled ? (isBn ? 'চালু (সক্রিয়)' : 'ACTIVE') : isBn ? 'বন্ধ' : 'OFF'}
              </span>
            </div>

            {/* Master Switch */}
            <div className="toggle-row">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  {isBn ? 'Voice Protection (মাস্টার সুইচ)' : 'Voice Protection (Master ON/OFF)'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isBn
                    ? 'গ্রুপে ইনকামিং ভয়েস মেসেজ অফলাইনে শুনে গালি থাকলে অটো ডিলিট করবে'
                    : 'Automatically transcribes group voice notes offline and deletes abusive audio'}
                </div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="slider" />
              </label>
            </div>

            {/* Language Toggles */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                <Languages size={15} className="text-emerald-700" />
                <span>{isBn ? 'শনাক্তকরণ ভাষা নির্বাচন' : 'Language Detection Modules'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{isBn ? 'বাংলা (Bangla)' : 'Bangla Detection'}</div>
                    <div className="text-[10px] text-slate-500">{isBn ? 'বাংলা লিপি ও গালি' : 'Bengali script slurs'}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={detectBangla}
                    onChange={(e) => setDetectBangla(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{isBn ? 'ইংরেজি (English)' : 'English Detection'}</div>
                    <div className="text-[10px] text-slate-500">{isBn ? 'ইংরেজি গালি ও স্ল্যাং' : 'English profanity'}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={detectEnglish}
                    onChange={(e) => setDetectEnglish(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{isBn ? 'বাংলিশ (Banglish)' : 'Banglish Detection'}</div>
                    <div className="text-[10px] text-slate-500">{isBn ? 'রোমান হরফে বাংলা গালি' : 'Phonetic Banglish'}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={detectBanglish}
                    onChange={(e) => setDetectBanglish(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                </label>
              </div>
            </div>

            {/* Profanity Sensitivity */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-extrabold text-slate-800">
                {isBn ? 'Profanity Sensitivity (সংবেদনশীলতা)' : 'Profanity Sensitivity'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'low' as const,
                    title: isBn ? 'কম (Strict Severe)' : 'Low',
                    desc: isBn ? 'শুধু তীব্র গালিতে ডিলিট' : 'Severe slurs only',
                  },
                  {
                    id: 'medium' as const,
                    title: isBn ? 'মাঝারি (প্রস্তাবিত)' : 'Medium (Rec)',
                    desc: isBn ? 'ব্যালেন্সড ও কনটেক্সট-সচেতন' : 'Balanced & context-aware',
                  },
                  {
                    id: 'high' as const,
                    title: isBn ? 'বেশি (কঠোর)' : 'High (Strict)',
                    desc: isBn ? 'মৃদু গালি ও স্ল্যাংও ধরবে' : 'Catches mild slurs too',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSensitivity(opt.id)}
                    className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      sensitivity === opt.id
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{opt.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Allowed Words & Blocked Words */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Allowed Words */}
              <div className="p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 space-y-2">
                <div className="text-xs font-extrabold text-emerald-900">
                  {isBn ? 'অনুমোদিত শব্দ (Allowed Words)' : 'Allowed Words (Whitelist)'}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newAllowedWord}
                    onChange={(e) => setNewAllowedWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAllowed();
                      }
                    }}
                    placeholder={isBn ? 'যেমন: বালতি, ভালো...' : 'Word to always allow...'}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={addAllowed}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>{isBn ? 'যোগ' : 'Add'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {allowedWords.length === 0 ? (
                    <span className="text-[11px] text-slate-400">
                      {isBn ? 'কোনো কাস্টম হোয়াইটলিস্ট শব্দ নেই' : 'No custom allowed words'}
                    </span>
                  ) : (
                    allowedWords.map((w) => (
                      <span
                        key={w}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[11px] font-semibold text-emerald-900"
                      >
                        {w}
                        <button
                          type="button"
                          onClick={() => setAllowedWords((prev) => prev.filter((x) => x !== w))}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Blocked Words */}
              <div className="p-3 rounded-xl border border-rose-200/80 bg-rose-50/30 space-y-2">
                <div className="text-xs font-extrabold text-rose-900">
                  {isBn ? 'অতিরিক্ত নিষিদ্ধ শব্দ (Blocked Words)' : 'Custom Blocked Words'}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newBlockedWord}
                    onChange={(e) => setNewBlockedWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBlocked();
                      }
                    }}
                    placeholder={isBn ? 'যেমন: চিটার, বাটপার...' : 'Custom word to block...'}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:border-rose-600"
                  />
                  <button
                    type="button"
                    onClick={addBlocked}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>{isBn ? 'যোগ' : 'Add'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {blockedWords.length === 0 ? (
                    <span className="text-[11px] text-slate-400">
                      {isBn ? 'ডিফল্ট বাংলা+ইংরেজি ডিকশনারি চালু আছে' : 'Using built-in dictionaries'}
                    </span>
                  ) : (
                    blockedWords.map((w) => (
                      <span
                        key={w}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-semibold text-rose-900"
                      >
                        {w}
                        <button
                          type="button"
                          onClick={() => setBlockedWords((prev) => prev.filter((x) => x !== w))}
                          className="text-slate-400 hover:text-rose-700 cursor-pointer"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Hardware Spec & Offline Whisper.cpp Model Manager */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-emerald-700" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  {isBn ? 'সার্ভার হার্ডওয়্যার ও অফলাইন ইঞ্জিন' : 'Hardware & Offline STT Engine'}
                </h2>
              </div>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                  engineReady
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {engineReady ? (isBn ? 'অফলাইন প্রস্তুত' : 'Engine Ready') : isBn ? 'প্রস্তুতি চলছে' : 'Preparing'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[10px] font-bold text-slate-500">{isBn ? 'CPU ও RAM' : 'Server CPU & RAM'}</div>
                <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                  {overview?.hardware.cpuCores ?? 2} vCPU ·{' '}
                  {overview ? `${(overview.hardware.totalRamMb / 1024).toFixed(1)} GB` : '4.0 GB'}
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {isBn
                    ? `ফ্রি RAM: ${overview?.hardware.freeRamMb ?? 0} MB`
                    : `Free RAM: ${overview?.hardware.freeRamMb ?? 0} MB`}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[10px] font-bold text-slate-500">{isBn ? 'ডিস্ক ও বাইনারি' : 'Disk & Binaries'}</div>
                <div className="font-extrabold text-slate-900 mt-0.5 tabular-nums">
                  {overview?.hardware.diskFreeGb ?? 0} GB {isBn ? 'ফ্রি' : 'free'}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  whisper.cpp {overview?.engine.whisperBinaryFound ? '✓' : '✗'} · ffmpeg{' '}
                  {overview?.engine.ffmpegFound ? '✓' : '✗'}
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-900 font-semibold flex items-start gap-2">
              <Sparkles size={14} className="text-emerald-700 shrink-0 mt-0.5" />
              <span>
                {isBn
                  ? '১০০% ফ্রি ও অফলাইন: কোনো Gemini/OpenAI/Groq পেইড API বা কী ব্যবহার করা হয় না। সব অডিও লোকাল whisper.cpp দিয়ে প্রসেস হয়ে টেম্প ফাইল সাথে সাথে মুছে ফেলা হয়।'
                  : '100% Zero-API Offline: Uses quantized open-source Whisper.cpp directly on your server with automatic immediate temp audio deletion.'}
              </span>
            </div>

            {/* Whisper Quantized Model Picker */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-extrabold text-slate-800">
                {isBn ? 'অফলাইন Whisper.cpp মডেল নির্বাচন' : 'Offline Whisper Model'}
              </div>
              {(overview?.models || []).map((m) => {
                const selected = modelId === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setModelId(m.id)}
                    className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50/60'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={selected}
                            onChange={() => setModelId(m.id)}
                            className="accent-emerald-700"
                          />
                          <span className="truncate">{isBn ? m.labelBn : m.labelEn}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 pl-5 tabular-nums">
                          {m.fileName} · {m.sizeLabel} · ~{m.ramEstimateMb} MB RAM
                        </div>
                      </div>
                      <div className="shrink-0">
                        {m.ready ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {isBn ? `প্রস্তুত (${m.actualSizeMb} MB)` : 'Ready'}
                          </span>
                        ) : m.downloading ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 tabular-nums">
                            {m.progressPercent}%
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onEnsureModel(m.id);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download size={11} />
                            <span>{isBn ? 'ডাউনলোড' : 'Get'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {m.downloadError && (
                      <div className="text-[10px] text-rose-600 mt-1 pl-5">{m.downloadError}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Offline Audio Test Sandbox */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <FileAudio size={16} className="text-emerald-700" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  {isBn ? 'রিয়েল অফলাইন অডিও টেস্টার' : 'Real Offline Audio Tester'}
                </h2>
              </div>
              <span className="text-[10px] font-bold text-slate-500">whisper.cpp</span>
            </div>

            <p className="text-[11px] text-slate-500">
              {isBn
                ? 'যেকোনো .ogg / .mp3 / .wav / .m4a ভয়েস ক্লিপ আপলোড করুন অথবা সরাসরি মাইক্রোফোন দিয়ে রেকর্ড করে অফলাইন ডিটেকশন যাচাই করুন।'
                : 'Upload a real audio clip or record via microphone to verify local Whisper.cpp transcription & profanity filtering.'}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav,.webm"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isTestingAudio || isRecording}
                onClick={() => fileInputRef.current?.click()}
                className="btn text-xs font-bold flex-1 justify-center"
              >
                <Upload size={13} />
                <span>{isBn ? 'অডিও ফাইল আপলোড' : 'Upload Audio'}</span>
              </button>

              <button
                type="button"
                disabled={isTestingAudio}
                onClick={toggleMicRecording}
                className={`btn text-xs font-bold flex-1 justify-center ${
                  isRecording ? 'bg-rose-600 text-white border-rose-600' : ''
                }`}
              >
                {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
                <span>
                  {isRecording
                    ? isBn
                      ? 'রেকর্ডিং থামুন'
                      : 'Stop & Test'
                    : isBn
                      ? 'ভয়েস রেকর্ড টেস্ট'
                      : 'Record Voice'}
                </span>
              </button>
            </div>

            {isTestingAudio && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" />
                <span>
                  {isBn ? 'whisper.cpp অফলাইনে অডিও ট্রান্সক্রাইব ও বিশ্লেষণ করছে...' : 'Transcribing offline...'}
                </span>
              </div>
            )}

            {testError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {testError}
              </div>
            )}

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  testResult.analysis?.isProfane
                    ? 'bg-rose-50/70 border-rose-200'
                    : 'bg-emerald-50/70 border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between font-extrabold">
                  <span className={testResult.analysis?.isProfane ? 'text-rose-800' : 'text-emerald-800'}>
                    {testResult.analysis?.isProfane
                      ? isBn
                        ? '🚨 গালি শনাক্ত — ডিলিট সিদ্ধান্ত'
                        : '🚨 Profanity Detected — Would Delete'
                      : isBn
                        ? '✅ নিরাপদ — অক্ষত রাখা হবে'
                        : '✅ Clean — Kept Intact'}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-600">
                    {testResult.processingMs} ms · {testResult.detectedLanguage}
                  </span>
                </div>
                <div className="text-[11px] text-slate-800 bg-white/80 p-2 rounded-lg border border-slate-200/70">
                  <strong>{isBn ? 'ট্রান্সক্রিপ্ট:' : 'Transcript:'}</strong>{' '}
                  {testResult.transcript || (isBn ? '[নীরব / শব্দ পাওয়া যায়নি]' : '[Empty/Silence]')}
                </div>
                <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    <strong>Confidence:</strong> {testResult.analysis?.confidenceScore ?? 0}%
                  </span>
                  {testResult.analysis?.matchedWords?.length > 0 && (
                    <span className="text-rose-700 font-bold">
                      {isBn ? 'শনাক্ত শব্দ:' : 'Matched:'} {testResult.analysis.matchedWords.join(', ')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">{testResult.analysis?.contextReason}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Moderation History */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert size={16} className="text-emerald-700" />
              <span>{isBn ? 'ভয়েস মডারেশন হিস্ট্রি (লাইভ অডিট)' : 'Voice Moderation History'}</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              {isBn
                ? 'প্রতিটি ইনকামিং ভয়েস মেসেজের ট্রান্সক্রিপশন, কনফিডেন্স ও ডিলিট স্ট্যাটাস (ডুপ্লিকেট সুরক্ষিত)'
                : 'Audit log of transcribed group voice notes, confidence scores, and verified WhatsApp actions'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(overview?.queue.retryingCount ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => onRetryQueue()}
                className="btn text-xs font-bold"
              >
                <RotateCcw size={13} />
                <span>{isBn ? `রিট্রাই (${overview?.queue.retryingCount})` : 'Retry Queue'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onClearHistory()}
              className="btn text-xs font-bold text-rose-700"
            >
              <Trash2 size={13} />
              <span>{isBn ? 'হিস্ট্রি ক্লিয়ার' : 'Clear History'}</span>
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all' as const, label: isBn ? 'সবগুলো' : 'All' },
              { id: 'deleted' as const, label: isBn ? 'ডিলিট হয়েছে' : 'Deleted' },
              { id: 'clean' as const, label: isBn ? 'পরিষ্কার ও অক্ষত' : 'Clean' },
              { id: 'failed' as const, label: isBn ? 'ব্যর্থ / পারমিশন নেই' : 'Failed / No Admin' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                  historyFilter === tab.id
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBn ? 'গ্রুপ, প্রেরক বা টেক্সট খুঁজুন...' : 'Search group, sender, text...'}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 text-xs outline-none"
            />
          </div>
        </div>

        {/* History Items */}
        {filteredHistory.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            {isBn
              ? 'এখনো কোনো ভয়েস মডারেশন রেকর্ড জমা হয়নি। গ্রুপে ভয়েস মেসেজ এলে বা উপরের টেস্টার দিয়ে যাচাই করলে এখানে দেখাবে।'
              : 'No voice moderation records yet.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredHistory.map((rec) => {
              const badge =
                rec.status === 'profane_deleted'
                  ? { cls: 'bg-rose-50 text-rose-800 border-rose-200', label: isBn ? 'গালি · ডিলিট হয়েছে' : 'Abuse Deleted' }
                  : rec.status === 'no_admin_permission'
                    ? {
                        cls: 'bg-amber-50 text-amber-800 border-amber-200',
                        label: isBn ? 'অ্যাডমিন পারমিশন নেই' : 'No Admin Permission',
                      }
                    : rec.status === 'delete_failed' || rec.status === 'failed'
                      ? { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: isBn ? 'ব্যর্থ' : 'Failed' }
                      : rec.status === 'skipped_admin'
                        ? { cls: 'bg-sky-50 text-sky-800 border-sky-200', label: isBn ? 'অ্যাডমিন শিল্ড' : 'Admin Shield' }
                        : { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: isBn ? 'পরিষ্কার · অক্ষত' : 'Clean · Kept' };

              return (
                <div key={rec.id} className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-extrabold text-slate-900">{rec.senderName || rec.senderPhone}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-700">{rec.groupName}</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {rec.audioDurationSec > 0 ? `${rec.audioDurationSec}s` : ''} · {rec.detectedLanguage} ·{' '}
                        {(rec.processingMs / 1000).toFixed(1)}s STT
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(rec.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {rec.transcript && (
                    <div className="text-xs text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                      {rec.transcript}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>{rec.contextReason}</span>
                    {rec.matchedWords.length > 0 && (
                      <span className="text-rose-700 font-bold">
                        {isBn ? 'শনাক্ত:' : 'Matched:'} {rec.matchedWords.join(', ')} ({rec.confidenceScore}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
