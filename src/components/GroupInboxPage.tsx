import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Contact2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  Info,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Mic,
  MoreVertical,
  Music,
  Paperclip,
  Pause,
  Pin,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Star,
  Trash2,
  Users,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type InboxMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'audio'
  | 'sticker'
  | 'document'
  | 'location'
  | 'contact'
  | 'deleted'
  | 'unknown';

export interface InboxMediaInfo {
  status: 'pending' | 'saved' | 'unavailable' | 'too_large' | 'pruned_for_space';
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  isPtt?: boolean;
  isAnimated?: boolean;
  isGif?: boolean;
  pageCount?: number;
  unavailableReason?: string;
  mediaUrl?: string;
  downloadUrl?: string;
}

export interface InboxMessageRecord {
  id: string;
  groupId: string;
  groupName: string;
  senderJid: string;
  senderPhone: string;
  senderName: string;
  fromMe: boolean;
  timestamp: number;
  messageType: InboxMessageType;
  rawMessageKind: string;
  text: string;
  quotedMessage?: {
    id?: string;
    senderName?: string;
    senderPhone?: string;
    text?: string;
    messageType?: string;
  };
  media?: InboxMediaInfo;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    url?: string;
    isLive?: boolean;
  };
  contacts?: Array<{
    displayName: string;
    phone?: string;
    org?: string;
  }>;
  isDeleted: boolean;
  deletedAt?: number;
  deletedBy?: string;
  deletionReason?: string;
  editedAt?: number;
  isImportant: boolean;
  source: 'live' | 'history_sync' | 'bot_outgoing';
}

export interface InboxGroupSummary {
  id: string;
  name: string;
  participants: number;
  isBotAdmin?: boolean;
  avatarStatus?: 'ready' | 'none';
  avatarUrl?: string;
  lastMessageId?: string;
  lastMessageText?: string;
  lastMessageType?: InboxMessageType;
  lastMessageSender?: string;
  lastMessageAt?: number;
  totalStoredMessages: number;
  deletedCount: number;
  mediaCount: number;
  importantCount: number;
  connected?: boolean;
}

export interface InboxStorageStats {
  totalGroups: number;
  totalMessages: number;
  totalDeletedMessages: number;
  totalImportantMessages: number;
  totalMediaFiles: number;
  mediaUsedBytes: number;
  mediaLimitBytes: number;
  mediaUsedPercent: number;
  messagesDbBytes: number;
  avatarsBytes: number;
}

function formatBytesHuman(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDurationClock(sec?: number): string {
  const total = Math.max(0, Math.round(sec || 0));
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function formatShortTime(ts?: number, isBn = true): string {
  if (!ts || ts <= 0) return isBn ? '—' : '—';
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getMessageTypeLabel(type: InboxMessageType, isBn: boolean): string {
  switch (type) {
    case 'text':
      return isBn ? 'টেক্সট' : 'Text';
    case 'image':
      return isBn ? 'ছবি' : 'Image';
    case 'video':
      return isBn ? 'ভিডিও' : 'Video';
    case 'voice':
      return isBn ? 'ভয়েস নোট' : 'Voice';
    case 'audio':
      return isBn ? 'অডিও' : 'Audio';
    case 'sticker':
      return isBn ? 'স্টিকার' : 'Sticker';
    case 'document':
      return isBn ? 'ডকুমেন্ট' : 'Document';
    case 'location':
      return isBn ? 'লোকেশন' : 'Location';
    case 'contact':
      return isBn ? 'কনট্যাক্ট' : 'Contact';
    case 'deleted':
      return isBn ? 'ডিলিটেড' : 'Deleted';
    default:
      return isBn ? 'মেসেজ' : 'Message';
  }
}

function buildApiMediaUrl(pathOrUrl: string | undefined, apiBaseUrl: string): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = apiBaseUrl.trim().replace(/\/+$/, '');
  const rel = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return base ? `${base}${rel}` : rel;
}

function sanitizeSafeExternalUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function GroupAvatarBadge({
  name,
  avatarUrl,
  apiBaseUrl,
  sizeClass = 'w-10 h-10',
}: {
  name: string;
  avatarUrl?: string;
  apiBaseUrl: string;
  sizeClass?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const resolved = buildApiMediaUrl(avatarUrl, apiBaseUrl);
  const initials = (name || 'WA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || 'WA';

  if (resolved && !imgFailed) {
    return (
      <img
        src={resolved}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-white/20 bg-emerald-800 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0 border border-white/20`}
    >
      {initials}
    </div>
  );
}

function isLikelySafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(ua);
}

// Track active playing audio globally inside the page so playing a new note pauses the previous one
let activeInboxAudioEl: HTMLAudioElement | null = null;

function VoiceAudioPlayer({
  src,
  downloadUrl,
  declaredDurationSec,
  isVoice,
  fileName,
}: {
  src: string;
  downloadUrl?: string;
  declaredDurationSec?: number;
  isVoice: boolean;
  fileName?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAfterFallbackRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(declaredDurationSec || 0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [useMp3Fallback, setUseMp3Fallback] = useState<boolean>(() => isLikelySafariBrowser());
  const [playError, setPlayError] = useState<string | null>(null);

  const mp3Src = useMemo(() => {
    if (!src) return '';
    return src.includes('?') ? `${src}&format=mp3` : `${src}?format=mp3`;
  }, [src]);

  const effectiveSrc = useMp3Fallback ? mp3Src : src;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!autoPlayAfterFallbackRef.current) return;
    const el = audioRef.current;
    if (!el || !effectiveSrc) return;
    autoPlayAfterFallbackRef.current = false;
    setIsBuffering(true);
    try {
      el.load();
      el.playbackRate = speed;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setPlaying(true);
          setIsBuffering(false);
          setPlayError(null);
        }).catch(() => {
          setPlaying(false);
          setIsBuffering(false);
          setPlayError('অডিও প্লে করা যায়নি — ডাউনলোড করে শুনুন');
        });
      }
    } catch {
      setPlaying(false);
      setIsBuffering(false);
      setPlayError('অডিও প্লে করা যায়নি');
    }
  }, [effectiveSrc, speed]);

  const pauseOthers = (currentEl: HTMLAudioElement) => {
    if (activeInboxAudioEl && activeInboxAudioEl !== currentEl && !activeInboxAudioEl.paused) {
      try {
        activeInboxAudioEl.pause();
      } catch {}
    }
    activeInboxAudioEl = currentEl;
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      setPlayError(null);
      pauseOthers(el);
      setIsBuffering(true);
      try {
        if (el.readyState === 0) {
          el.load();
        }
        el.playbackRate = speed;
        await el.play();
        setPlaying(true);
        setIsBuffering(false);
      } catch (err: any) {
        if (!useMp3Fallback) {
          autoPlayAfterFallbackRef.current = true;
          setUseMp3Fallback(true);
          return;
        }
        setPlaying(false);
        setIsBuffering(false);
        setPlayError(err?.name === 'NotAllowedError' ? 'ব্রাউজার অডিও ব্লক করেছে' : 'অডিও প্লে ব্যর্থ — ডাউনলোড করে শুনুন');
      }
    } else {
      el.pause();
      setPlaying(false);
      setIsBuffering(false);
    }
  };

  const cycleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const displayDuration = duration > 0 ? duration : declaredDurationSec || 0;
  const maxSec = displayDuration > 0 ? displayDuration : 1;
  const effectiveDownloadUrl =
    downloadUrl || (src ? `${src}${src.includes('?') ? '&' : '?'}download=1` : '');

  return (
    <div className="p-2 rounded-xl bg-black/5 max-w-xs space-y-1">
      <audio
        ref={audioRef}
        src={effectiveSrc}
        preload="none"
        playsInline
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onPlaying={() => {
          setIsBuffering(false);
          setPlaying(true);
          setPlayError(null);
        }}
        onPause={() => {
          setPlaying(false);
          setIsBuffering(false);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setIsBuffering(false);
          setCurrentTime(0);
        }}
        onError={() => {
          if (!useMp3Fallback) {
            if (playing || isBuffering) autoPlayAfterFallbackRef.current = true;
            setUseMp3Fallback(true);
          } else {
            setPlaying(false);
            setIsBuffering(false);
            setPlayError('অডিও লোড ব্যর্থ — ডাউনলোড করুন');
          }
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
        >
          {isBuffering ? (
            <Loader2 size={15} className="animate-spin" />
          ) : playing ? (
            <Pause size={15} />
          ) : (
            <Play size={15} className="ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
            <span>{isVoice ? 'Voice Note' : fileName || 'Audio'}</span>
            <span className="tabular-nums">
              {formatDurationClock(currentTime)} / {formatDurationClock(displayDuration)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxSec}
            step={0.1}
            value={Math.min(currentTime, maxSec)}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (audioRef.current && Number.isFinite(val)) {
                audioRef.current.currentTime = val;
                setCurrentTime(val);
              }
            }}
            className="w-full accent-emerald-600 h-1 cursor-pointer"
          />
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          className="px-1.5 py-0.5 rounded bg-white/70 border border-slate-300 text-[10px] font-bold text-slate-800 tabular-nums cursor-pointer"
        >
          {speed}x
        </button>

        {effectiveDownloadUrl && (
          <a
            href={effectiveDownloadUrl}
            download={fileName || (isVoice ? 'voice_note.ogg' : 'audio_clip.ogg')}
            title="Download voice audio"
            className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <Download size={13} />
          </a>
        )}
      </div>

      {playError && (
        <div className="text-[10px] font-semibold text-rose-700 px-1">
          {playError}
        </div>
      )}
    </div>
  );
}

export interface GroupInboxPageProps {
  isBn: boolean;
  isConnected: boolean;
  apiBaseUrl: string;
  adminToken: string;
  initialGroupId?: string | null;
  initialDeletedOnly?: boolean;
  callApi: (path: string, method?: string, body?: any) => Promise<any>;
  showNotification: (msg: string) => void;
  onLeaveGroup: (groupId: string, groupName: string) => Promise<void> | void;
  onBack: () => void;
}

export function GroupInboxPage({
  isBn,
  isConnected,
  apiBaseUrl,
  adminToken,
  initialGroupId = null,
  initialDeletedOnly = false,
  callApi,
  showNotification,
  onLeaveGroup,
  onBack,
}: GroupInboxPageProps) {
  const [groups, setGroups] = useState<InboxGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroupId || '');
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [messages, setMessages] = useState<InboxMessageRecord[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalMatching, setTotalMatching] = useState(0);
  const [nextCursor, setNextCursor] = useState<{ beforeTimestamp: number; beforeId: string } | null>(null);

  const [tabMode, setTabMode] = useState<'all' | 'deleted'>(initialDeletedOnly ? 'deleted' : 'all');
  const [composerText, setComposerText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [purgingStickers, setPurgingStickers] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const [imageViewer, setImageViewer] = useState<{ src: string; downloadUrl?: string; title: string; caption?: string } | null>(null);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [docPreview, setDocPreview] = useState<{
    src: string;
    downloadUrl?: string;
    fileName: string;
    mimeType: string;
    textContent?: string;
    isPdf?: boolean;
  } | null>(null);

  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const selectedGroupIdRef = useRef(selectedGroupId);
  const tabModeRef = useRef(tabMode);
  const callApiRef = useRef(callApi);
  const showNotificationRef = useRef(showNotification);
  const hasMoreRef = useRef(hasMore);
  const loadingOlderRef = useRef(loadingOlder);
  const messagesLoadingRef = useRef(messagesLoading);
  const nextCursorRef = useRef(nextCursor);
  const isNearBottomRef = useRef(true);
  const initialScrollKeyRef = useRef('');

  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);

  useEffect(() => {
    selectedGroupIdRef.current = selectedGroupId;
  }, [selectedGroupId]);

  useEffect(() => {
    tabModeRef.current = tabMode;
  }, [tabMode]);

  useEffect(() => {
    callApiRef.current = callApi;
  }, [callApi]);

  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    messagesLoadingRef.current = messagesLoading;
  }, [messagesLoading]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    if (initialGroupId) setSelectedGroupId(initialGroupId);
    setTabMode(initialDeletedOnly ? 'deleted' : 'all');
  }, [initialGroupId, initialDeletedOnly]);

  const loadInboxGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await callApiRef.current('/api/inbox/groups');
      if (Array.isArray(res?.groups)) {
        setGroups(res.groups);
        setSelectedGroupId((prev) => {
          if (prev && res.groups.some((g: InboxGroupSummary) => g.id === prev)) return prev;
          if (initialGroupId && res.groups.some((g: InboxGroupSummary) => g.id === initialGroupId)) return initialGroupId;
          return res.groups[0]?.id || '';
        });
      }
    } catch (err: any) {
      showNotificationRef.current(err.message);
    } finally {
      setGroupsLoading(false);
    }
  }, [initialGroupId]);

  useEffect(() => {
    loadInboxGroups();
  }, [loadInboxGroups]);

  const loadMessages = useCallback(
    async (
      groupId: string,
      opts?: {
        appendOlder?: boolean;
        cursor?: { beforeTimestamp: number; beforeId: string } | null;
        forceScrollBottom?: boolean;
      }
    ) => {
      if (!groupId) {
        setMessages([]);
        return;
      }
      const appendOlder = Boolean(opts?.appendOlder);
      if (appendOlder && loadingOlderRef.current) return;

      const prevScrollHeight = messageStreamRef.current?.scrollHeight || 0;
      const prevScrollTop = messageStreamRef.current?.scrollTop || 0;

      if (appendOlder) {
        loadingOlderRef.current = true;
        setLoadingOlder(true);
      } else {
        messagesLoadingRef.current = true;
        setMessagesLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', '40');
        if (tabModeRef.current === 'deleted') params.set('deletedOnly', '1');
        if (appendOlder && opts?.cursor) {
          params.set('beforeTimestamp', String(opts.cursor.beforeTimestamp));
          params.set('beforeId', opts.cursor.beforeId);
        }

        const res = await callApiRef.current(
          `/api/inbox/groups/${encodeURIComponent(groupId)}/messages?${params.toString()}`
        );
        const pageItems: InboxMessageRecord[] = Array.isArray(res?.messages) ? res.messages : [];
        setHasMore(Boolean(res?.hasMore));
        hasMoreRef.current = Boolean(res?.hasMore);
        setTotalMatching(Number(res?.totalMatching || pageItems.length));
        setNextCursor(res?.nextCursor || null);
        nextCursorRef.current = res?.nextCursor || null;

        if (appendOlder) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...pageItems.filter((m) => !seen.has(m.id)), ...prev].sort((a, b) => a.timestamp - b.timestamp);
          });
          requestAnimationFrame(() => {
            const el = messageStreamRef.current;
            if (el) {
              const delta = el.scrollHeight - prevScrollHeight;
              el.scrollTop = Math.max(0, prevScrollTop + delta);
            }
          });
        } else {
          const loadKey = `${groupId}:${tabModeRef.current}`;
          const isInitialForGroup = initialScrollKeyRef.current !== loadKey;
          setMessages(pageItems);

          if (isInitialForGroup || opts?.forceScrollBottom) {
            initialScrollKeyRef.current = loadKey;
            isNearBottomRef.current = true;
            setShowJumpToBottom(false);
            setUnreadBelowCount(0);
            requestAnimationFrame(() => {
              const el = messageStreamRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            });
          }
        }
      } catch (err: any) {
        showNotificationRef.current(err.message);
      } finally {
        if (appendOlder) {
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        } else {
          messagesLoadingRef.current = false;
          setMessagesLoading(false);
        }
      }
    },
    []
  );

  // Load initial messages ONLY when selected group or tab mode actually changes
  useEffect(() => {
    if (!selectedGroupId) return;
    initialScrollKeyRef.current = '';
    setShowJumpToBottom(false);
    setUnreadBelowCount(0);
    isNearBottomRef.current = true;
    const t = setTimeout(() => loadMessages(selectedGroupId, { forceScrollBottom: true }), 80);
    return () => clearTimeout(t);
  }, [selectedGroupId, tabMode, loadMessages]);

  const handleStreamScroll = useCallback(() => {
    const el = messageStreamRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 140;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(distanceFromBottom > 180);
    if (nearBottom) {
      setUnreadBelowCount(0);
    }

    // Automatically load older messages when scrolling near the top without jumping scroll position
    if (
      el.scrollTop <= 70 &&
      hasMoreRef.current &&
      !loadingOlderRef.current &&
      !messagesLoadingRef.current &&
      nextCursorRef.current &&
      selectedGroupIdRef.current
    ) {
      loadMessages(selectedGroupIdRef.current, {
        appendOlder: true,
        cursor: nextCursorRef.current,
      });
    }
  }, [loadMessages]);

  const jumpToBottom = useCallback(() => {
    const el = messageStreamRef.current;
    if (!el) return;
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    setUnreadBelowCount(0);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // WebSocket
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ws: WebSocket | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      try {
        const base = apiBaseUrl.trim();
        const wsUrl = base && /^https?:\/\//i.test(base)
          ? `${base.replace(/^http/i, 'ws')}/ws/inbox`
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/inbox`;
        ws = new WebSocket(wsUrl);
      } catch {
        retryTimer = setTimeout(connect, 2000);
        return;
      }

      ws.onopen = () => {
        setWsConnected(true);
        if (adminToken) {
          try {
            ws?.send(JSON.stringify({ type: 'auth', token: adminToken }));
          } catch {}
        }
      };

      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(String(ev.data || ''));
          if (payload?.type === 'inbox:ready') {
            setWsConnected(true);
            return;
          }
          if (
            (payload?.type === 'inbox:message_new' || payload?.type === 'inbox:message_updated') &&
            payload.message &&
            payload.groupId === selectedGroupIdRef.current
          ) {
            const incoming = payload.message as InboxMessageRecord;
            const isUpdateEvent = payload.type === 'inbox:message_updated';

            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === incoming.id);
              if (idx >= 0) {
                // Keep exact scroll position when updating an existing message (e.g., media downloaded)
                return prev.map((m, i) => (i === idx ? incoming : m));
              }
              if (tabModeRef.current === 'deleted' && !incoming.isDeleted) return prev;
              const next = [...prev, incoming].sort((a, b) => a.timestamp - b.timestamp);

              if (!isUpdateEvent) {
                if (isNearBottomRef.current) {
                  requestAnimationFrame(() => {
                    const el = messageStreamRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                  });
                } else {
                  setUnreadBelowCount((c) => c + 1);
                }
              }
              return next;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => setWsConnected(false);
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws?.close(); } catch {}
    };
  }, [adminToken, apiBaseUrl]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = composerText.trim();
    if (!text || !selectedGroupId || sendingMessage) return;
    setSendingMessage(true);
    try {
      await callApiRef.current('/api/moderation/send', 'POST', {
        groupId: selectedGroupId,
        text,
      });
      setComposerText('');
      setTimeout(() => loadMessages(selectedGroupId, { forceScrollBottom: true }), 350);
    } catch (err: any) {
      showNotificationRef.current(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleToggleImportant = async (msg: InboxMessageRecord) => {
    try {
      const res = await callApi('/api/inbox/messages/important', 'POST', {
        groupId: msg.groupId,
        messageId: msg.id,
        important: !msg.isImportant,
      });
      if (res?.message) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? res.message : m)));
      }
      showNotification(isBn ? 'গুরুত্বপূর্ণ স্ট্যাটাস আপডেট হয়েছে' : 'Important status updated');
    } catch (err: any) {
      showNotification(err.message);
    }
  };

  const handlePurgeGroupStickers = async () => {
    if (!selectedGroup?.id || purgingStickers) return;
    setPurgingStickers(true);
    try {
      const res = await callApi('/api/moderation/sticker-queue/purge-group-stickers', 'POST', {
        groupId: selectedGroup.id,
      });
      showNotification(
        res?.message || (isBn ? 'WhatsApp গ্রুপ ও সার্ভার থেকে পুরোনো স্টিকার রিমুভ শুরু হয়েছে!' : 'Bulk sticker cleanup started!')
      );
      setTimeout(() => {
        loadInboxGroups();
        loadMessages(selectedGroup.id);
      }, 2200);
    } catch (err: any) {
      showNotification(err?.message || (isBn ? 'স্টিকার রিমুভ ব্যর্থ হয়েছে' : 'Sticker cleanup failed'));
    } finally {
      setPurgingStickers(false);
    }
  };

  const handleOpenDocPreview = async (msg: InboxMessageRecord) => {
    const src = buildApiMediaUrl(msg.media?.mediaUrl, apiBaseUrl);
    const downloadUrl = buildApiMediaUrl(msg.media?.downloadUrl, apiBaseUrl);
    const mime = (msg.media?.mimeType || 'application/octet-stream').toLowerCase();
    const fileName = msg.media?.fileName || 'Document';
    const isPdf = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    const isTextLike =
      mime.startsWith('text/') ||
      mime.includes('json') ||
      /\.(txt|csv|json|log|md|xml|yaml|yml)$/i.test(fileName);

    let textContent: string | undefined;
    if (isTextLike && src) {
      try {
        const resp = await fetch(src);
        if (resp.ok) textContent = (await resp.text()).slice(0, 20000);
      } catch {}
    }

    setDocPreview({ src, downloadUrl, fileName, mimeType: mime, isPdf, textContent });
  };

  return (
    <section className="page active" id="inbox">
      <div className="flex flex-col h-[85vh] min-h-[620px] max-h-[900px] bg-[#efeae2] rounded-3xl border border-slate-300 shadow-xl overflow-hidden relative">
        {/* WhatsApp Chat Wallpaper Subtle Pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {!selectedGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center z-10">
            <Inbox size={40} className="text-emerald-800/40 mb-3 animate-bounce" />
            <h3 className="text-base font-extrabold text-slate-900">
              {isBn ? 'রিয়েল-টাইম WhatsApp গ্রুপ ইনবক্স' : 'WhatsApp Group Inbox'}
            </h3>
            <p className="text-xs text-slate-600 mt-1 max-w-sm leading-relaxed">
              {isBn
                ? 'কানেক্টেড গ্রুপ পেজে যে কোনো গ্রুপের ওপর ৫ সেকেন্ড ক্লিক করে ধরে রাখলে সেই গ্রুপের ইনবক্স এখানে ওপেন হবে।'
                : 'Hold/click and hold for 5 seconds on any group in the Connected Groups page to open its inbox here.'}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md"
            >
              {isBn ? 'ফিরে যান' : 'Go Back'}
            </button>
          </div>
        ) : (
          <>
            {/* 1. WhatsApp Chat Header */}
            <div className="px-3.5 py-2.5 bg-[#005c4b] text-white flex items-center justify-between gap-3 z-20 shadow-md">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={onBack}
                  className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>

                <GroupAvatarBadge
                  name={selectedGroup.name}
                  avatarUrl={selectedGroup.avatarUrl}
                  apiBaseUrl={apiBaseUrl}
                  sizeClass="w-10 h-10"
                />

                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-white truncate max-w-[210px] sm:max-w-md">
                    {selectedGroup.name}
                  </h3>
                  <div className="text-[11px] text-emerald-100/90 truncate tabular-nums">
                    {selectedGroup.participants} {isBn ? 'সদস্য অনলাইনে সক্রিয়' : 'members'} ·{' '}
                    {wsConnected ? (isBn ? 'রিয়েল-টাইম কানেক্টেড' : 'Live') : 'Syncing'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={purgingStickers}
                  onClick={handlePurgeGroupStickers}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-extrabold border bg-amber-500/90 hover:bg-amber-500 text-white border-amber-300/60 cursor-pointer flex items-center gap-1 disabled:opacity-60"
                  title={isBn ? 'এই গ্রুপের জমে থাকা আগের সব স্টিকার ১ ক্লিকে রিমুভ করুন' : 'Remove all previous stickers from this group in 1 click'}
                >
                  {purgingStickers ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  <span className="hidden sm:inline">{isBn ? 'সব স্টিকার রিমুভ' : 'Purge Stickers'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTabMode((m) => (m === 'all' ? 'deleted' : 'all'))}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border cursor-pointer ${
                    tabMode === 'deleted'
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-white/20 text-white border-white/25 hover:bg-white/30'
                  }`}
                  title="Toggle Deleted History"
                >
                  <Trash2 size={13} className="inline mr-1" />
                  {selectedGroup.deletedCount}
                </button>

                <button
                  type="button"
                  onClick={loadInboxGroups}
                  className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                  title="Refresh"
                >
                  <RefreshCw size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => onLeaveGroup(selectedGroup.id, selectedGroup.name)}
                  className="w-9 h-9 rounded-full hover:bg-rose-600/70 flex items-center justify-center text-white cursor-pointer"
                  title="Leave Group from Server"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>

            {/* 2. Pinned Message Section */}
            <div className="px-4 py-2 bg-[#f8f9fa] border-b border-slate-200 text-xs flex items-center gap-2.5 z-10">
              <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                <Pin size={13} className="rotate-45" />
              </span>
              <div className="truncate text-slate-700 font-medium">
                <span className="font-extrabold text-slate-900 mr-1.5">WA Guard Security Notice:</span>
                <span>{isBn ? 'গ্রুপের সকল সদস্যের জন্য মডারেশন ও স্প্যাম প্রোটেকশন সক্রিয় রয়েছে।' : 'Group moderation & anti-spam active.'}</span>
              </div>
            </div>

            {/* 3. Chat Messages Scrollable Stream */}
            <div
              ref={messageStreamRef}
              onScroll={handleStreamScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3 z-10 custom-scrollbar relative"
            >
              {hasMore && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={() => loadMessages(selectedGroup.id, { appendOlder: true, cursor: nextCursor })}
                    className="px-3 py-1 bg-white/90 border border-slate-300 text-xs font-bold text-emerald-800 rounded-full shadow-xs cursor-pointer"
                  >
                    {loadingOlder ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
                    {isBn ? 'আরও পুরোনো মেসেজ লোড করুন' : 'Load older messages'}
                  </button>
                </div>
              )}

              {messagesLoading && messages.length === 0 ? (
                <div className="py-20 text-center text-xs font-bold text-slate-500 flex flex-col items-center gap-2">
                  <Loader2 size={24} className="animate-spin text-emerald-700" />
                  <span>{isBn ? 'ইনবক্স মেসেজ লোড হচ্ছে...' : 'Loading inbox messages...'}</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 px-4 text-center bg-white/90 rounded-2xl border border-slate-200 max-w-sm mx-auto shadow-sm">
                  <Inbox size={30} className="mx-auto text-emerald-800/40 mb-2" />
                  <div className="text-xs font-extrabold text-slate-900">
                    {tabMode === 'deleted'
                      ? isBn
                        ? 'কোনো ডিলিটেড মেসেজ নেই'
                        : 'No deleted messages'
                      : isBn
                      ? 'কোনো মেসেজ জমা হয়নি'
                      : 'No messages captured yet'}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isBn
                      ? 'বট সংযুক্ত থাকার পর থেকে আগত মেসেজ এখানে সংরক্ষিত হবে।'
                      : 'Live incoming messages will appear here automatically.'}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOut = Boolean(msg.fromMe);
                  const mediaUrl = buildApiMediaUrl(msg.media?.mediaUrl, apiBaseUrl);
                  const downloadUrl = buildApiMediaUrl(msg.media?.downloadUrl, apiBaseUrl);

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`relative max-w-[85%] sm:max-w-[70%] p-2.5 rounded-2xl shadow-xs text-xs ${
                          msg.isDeleted
                            ? 'bg-rose-50 border border-rose-200 text-rose-950'
                            : isOut
                            ? 'bg-[#d9fdd3] text-slate-950 rounded-tr-xs'
                            : 'bg-white text-slate-950 rounded-tl-xs'
                        }`}
                      >
                        {!isOut && (
                          <div className="text-[11px] font-extrabold text-emerald-800 mb-0.5 flex items-center justify-between gap-2">
                            <span>{msg.senderName}</span>
                            <span className="text-[9px] font-mono opacity-70">@{msg.senderPhone}</span>
                          </div>
                        )}

                        {msg.quotedMessage && (
                          <div className="mb-1.5 p-2 rounded-xl bg-black/5 border-l-3 border-emerald-600 text-[10.5px] text-slate-700">
                            <div className="font-bold">{msg.quotedMessage.senderName || 'Replied'}</div>
                            <div className="truncate">{msg.quotedMessage.text || '[Media]'}</div>
                          </div>
                        )}

                        {msg.isDeleted && (
                          <div className="mb-1 text-[11px] font-bold text-rose-700 flex items-center gap-1">
                            <Trash2 size={12} />
                            <span>{msg.deletionReason || (isBn ? 'মেসেজ ডিলিট করা হয়েছে' : 'Deleted message')}</span>
                          </div>
                        )}

                        {msg.messageType === 'image' && mediaUrl && (
                          <div className="mb-1.5 rounded-xl overflow-hidden bg-black/10">
                            <button
                              type="button"
                              onClick={() =>
                                setImageViewer({
                                  src: mediaUrl,
                                  downloadUrl,
                                  title: msg.senderName,
                                  caption: msg.text,
                                })
                              }
                              className="block cursor-pointer"
                            >
                              <img src={mediaUrl} alt="Media" referrerPolicy="no-referrer" className="max-h-64 object-cover w-full" />
                            </button>
                          </div>
                        )}

                        {msg.messageType === 'sticker' && mediaUrl && (
                          <div className="mb-1.5 p-1">
                            <img src={mediaUrl} alt="Sticker" referrerPolicy="no-referrer" className="w-28 h-28 object-contain" />
                          </div>
                        )}

                        {msg.messageType === 'video' && mediaUrl && (
                          <div className="mb-1.5 rounded-xl overflow-hidden bg-black">
                            <video src={mediaUrl} controls preload="metadata" className="max-h-60 w-full" />
                          </div>
                        )}

                        {(msg.messageType === 'voice' || msg.messageType === 'audio') && (
                          <div className="mb-1.5">
                            {mediaUrl ? (
                              <VoiceAudioPlayer
                                src={mediaUrl}
                                downloadUrl={downloadUrl}
                                declaredDurationSec={msg.media?.durationSec}
                                isVoice={msg.messageType === 'voice'}
                                fileName={msg.media?.fileName}
                              />
                            ) : (
                              <div className="p-2.5 rounded-xl bg-black/5 max-w-xs flex items-center gap-2 text-[11px] text-slate-600">
                                <Mic size={14} className="text-emerald-700 shrink-0" />
                                <span>
                                  {msg.media?.status === 'pending'
                                    ? isBn
                                      ? 'ভয়েস অডিও ডাউনলোড হচ্ছে...'
                                      : 'Downloading voice audio...'
                                    : msg.media?.unavailableReason ||
                                      (isBn ? 'ভয়েস অডিও পাওয়া যায়নি' : 'Voice audio unavailable')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {msg.messageType === 'document' && (
                          <div className="mb-1.5 p-2.5 rounded-xl bg-black/5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={18} className="text-emerald-700 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold truncate">{msg.media?.fileName || 'Document'}</div>
                                <div className="text-[10px] text-slate-500">{msg.media?.fileSize ? formatBytesHuman(msg.media.fileSize) : ''}</div>
                              </div>
                            </div>
                            {downloadUrl && (
                              <a href={downloadUrl} download className="p-1.5 bg-emerald-600 text-white rounded-lg shrink-0">
                                <Download size={13} />
                              </a>
                            )}
                          </div>
                        )}

                        {msg.text && (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>
                        )}

                        <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-slate-500 tabular-nums">
                          <span>{formatFullTimestamp(msg.timestamp)}</span>
                          {isOut && <CheckCheck size={12} className="text-emerald-600" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {showJumpToBottom && (
              <button
                type="button"
                onClick={jumpToBottom}
                className="absolute right-4 bottom-20 z-30 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#005c4b] hover:bg-emerald-800 text-white text-[11px] font-extrabold shadow-lg border border-white/20 cursor-pointer"
              >
                <ArrowDown size={14} />
                <span>
                  {unreadBelowCount > 0
                    ? isBn
                      ? `নিচে যান (${unreadBelowCount})`
                      : `Jump down (${unreadBelowCount})`
                    : isBn
                      ? 'নিচে যান'
                      : 'Latest'}
                </span>
              </button>
            )}

            {/* 7. Bottom Message Composer */}
            <form onSubmit={handleSendMessage} className="p-2.5 bg-[#f0f2f5] border-t border-slate-300 flex items-center gap-2 z-20">
              <button
                type="button"
                onClick={() => showNotification(isBn ? 'ইমোজি প্যানেল' : 'Emoji picker')}
                className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
              >
                <Smile size={20} />
              </button>

              <button
                type="button"
                onClick={() => showNotification(isBn ? 'অ্যাটাচমেন্ট অপশন' : 'Attachment')}
                className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
              >
                <Paperclip size={18} />
              </button>

              <input
                type="text"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={isBn ? 'একটি মেসেজ লিখুন...' : 'Type a message...'}
                className="flex-1 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />

              {composerText.trim() ? (
                <button
                  type="submit"
                  disabled={sendingMessage}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
                >
                  {sendingMessage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => showNotification(isBn ? 'ভয়েস রেকর্ডিং চালু' : 'Voice recording')}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
                >
                  <Mic size={16} />
                </button>
              )}
            </form>
          </>
        )}
      </div>

      {imageViewer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setImageViewer(null)}>
          <div className="p-3 flex justify-between items-center bg-black/60 text-white border-b border-white/10" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs font-bold">{imageViewer.title}</span>
            <button type="button" onClick={() => setImageViewer(null)} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={imageViewer.src} alt="" referrerPolicy="no-referrer" className="max-h-[85vh] max-w-full object-contain" />
          </div>
        </div>
      )}

      {docPreview && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => setDocPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex justify-between items-center bg-slate-100">
              <span className="text-xs font-extrabold">{docPreview.fileName}</span>
              <button type="button" onClick={() => setDocPreview(null)} className="p-1 rounded-lg hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 bg-slate-50 max-h-[70vh] overflow-auto">
              {docPreview.textContent ? (
                <pre className="text-xs font-mono whitespace-pre-wrap">{docPreview.textContent}</pre>
              ) : (
                <iframe title={docPreview.fileName} src={docPreview.src} className="w-full h-96 bg-white border" />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
