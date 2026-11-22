import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
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
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Mic,
  MoreVertical,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
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

export interface InboxStorageSettings {
  mediaStorageLimitMb: number;
  autoPruneOldNonImportantMedia: boolean;
  maxMessagesPerGroup: number;
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
    return new Date(ts).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
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
  sizeClass = 'w-11 h-11',
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
        className={`${sizeClass} rounded-2xl object-cover border border-emerald-200 bg-emerald-50 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-black text-xs flex items-center justify-center shrink-0 border border-emerald-700/20`}
    >
      {initials}
    </div>
  );
}

// =============================================================================
// REUSABLE CONNECTED GROUPS LIST WITH TAP-TO-INBOX + LONG-PRESS CONTEXT MENU
// =============================================================================
export interface GroupListSectionProps {
  isBn: boolean;
  groups: InboxGroupSummary[];
  apiBaseUrl: string;
  isLoading?: boolean;
  isConnected?: boolean;
  compact?: boolean;
  selectedGroupId?: string;
  leavingGroupId?: string | null;
  onRefresh: () => void;
  onOpenInbox: (groupId: string, initialTab?: 'all' | 'deleted') => void;
  onLeaveGroup: (group: InboxGroupSummary) => Promise<void> | void;
}

export function GroupListSection({
  isBn,
  groups,
  apiBaseUrl,
  isLoading = false,
  isConnected = false,
  compact = false,
  selectedGroupId,
  leavingGroupId = null,
  onRefresh,
  onOpenInbox,
  onLeaveGroup,
}: GroupListSectionProps) {
  const [searchText, setSearchText] = useState('');
  const [contextGroup, setContextGroup] = useState<InboxGroupSummary | null>(null);
  const [confirmLeaveGroup, setConfirmLeaveGroup] = useState<InboxGroupSummary | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => () => clearPressTimer(), []);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.id || '').toLowerCase().includes(q) ||
        (g.lastMessageText || '').toLowerCase().includes(q)
    );
  }, [groups, searchText]);

  const handleTouchStart = (group: InboxGroupSummary, e: React.TouchEvent) => {
    const touch = e.touches[0];
    pointerStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    longPressTriggeredRef.current = false;
    clearPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setContextGroup(group);
    }, 480);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || !pointerStartRef.current) return;
    const dx = Math.abs(touch.clientX - pointerStartRef.current.x);
    const dy = Math.abs(touch.clientY - pointerStartRef.current.y);
    if (dx > 12 || dy > 12) {
      clearPressTimer();
    }
  };

  const handleMouseDown = (group: InboxGroupSummary, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTriggeredRef.current = false;
    clearPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setContextGroup(group);
    }, 520);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={
              isBn
                ? 'গ্রুপের নাম বা সর্বশেষ মেসেজ খুঁজুন... (Tap = Inbox, Long Press = Menu)'
                : 'Search group name or last message... (Tap = Inbox, Long Press = Menu)'
            }
            className="w-full min-h-[40px] pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin text-emerald-700' : 'text-emerald-700'} />
          <span>{isBn ? 'গ্রুপ সিঙ্ক' : 'Sync Groups'}</span>
        </button>
      </div>

      {confirmLeaveGroup && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-rose-950 truncate">
              {isBn
                ? `"${confirmLeaveGroup.name}" গ্রুপ থেকে সার্ভার বট লিভ নেবে?`
                : `Leave "${confirmLeaveGroup.name}" from server?`}
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5 leading-snug">
              {isBn
                ? 'বট গ্রুপটি ত্যাগ করবে, তবে সংরক্ষিত ইনবক্স মেসেজ ও বাকি গ্রুপের সেটিংস অক্ষত থাকবে।'
                : 'Bot will leave the WhatsApp group while preserving inbox records and other groups.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={Boolean(leavingGroupId)}
              onClick={async () => {
                const target = confirmLeaveGroup;
                setConfirmLeaveGroup(null);
                await onLeaveGroup(target);
              }}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-extrabold cursor-pointer whitespace-nowrap"
            >
              <LogOut size={13} />
              <span>{isBn ? 'নিশ্চিত লিভ' : 'Confirm Leave'}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmLeaveGroup(null)}
              className="inline-flex items-center min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <Inbox size={26} className="mx-auto text-emerald-700/50 mb-2" />
          <div className="text-xs font-extrabold text-slate-800">
            {isConnected
              ? isBn
                ? 'কোনো কানেক্টেড গ্রুপ পাওয়া যায়নি'
                : 'No matching connected groups found'
              : isBn
              ? 'WhatsApp এখনো কানেক্টেড নয়'
              : 'WhatsApp is not connected yet'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            {isConnected
              ? isBn
                ? 'বট যেসব WhatsApp গ্রুপে যুক্ত আছে সেগুলো এখানে সরাসরি প্রদর্শিত হবে।'
                : 'Groups joined by the bot appear here automatically.'
              : isBn
              ? 'WhatsApp পেয়ারিং সম্পন্ন হলে কানেক্টেড গ্রুপ এবং আসা রিয়েল-টাইম মেসেজ এখানে স্বয়ংক্রিয়ভাবে যুক্ত হবে।'
              : 'Once paired with WhatsApp, connected groups and real messages will sync here.'}
          </p>
        </div>
      ) : (
        <div
          className={
            compact
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'
              : 'flex flex-col gap-2'
          }
        >
          {filtered.map((g) => {
            const isSelected = selectedGroupId === g.id;
            return (
              <div
                key={g.id}
                role="button"
                tabIndex={0}
                onTouchStart={(e) => handleTouchStart(g, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={clearPressTimer}
                onTouchCancel={clearPressTimer}
                onMouseDown={(e) => handleMouseDown(g, e)}
                onMouseUp={clearPressTimer}
                onMouseLeave={clearPressTimer}
                onContextMenu={(e) => {
                  e.preventDefault();
                  clearPressTimer();
                  setContextGroup(g);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenInbox(g.id);
                  }
                }}
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  onOpenInbox(g.id);
                }}
                className={`select-none group relative p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  isSelected
                    ? 'bg-emerald-50/90 border-emerald-500 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-emerald-400 active:scale-[0.99]'
                }`}
              >
                <GroupAvatarBadge
                  name={g.name}
                  avatarUrl={g.avatarUrl}
                  apiBaseUrl={apiBaseUrl}
                  sizeClass="w-11 h-11"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate">
                      {g.name}
                    </h4>
                    <span className="text-[10.5px] font-bold text-slate-400 tabular-nums shrink-0">
                      {formatShortTime(g.lastMessageAt, isBn)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500 tabular-nums flex-wrap">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                      <Users size={11} /> {g.participants}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      {g.totalStoredMessages} {isBn ? 'মেসেজ' : 'msgs'}
                    </span>
                    {g.deletedCount > 0 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-rose-600 font-bold">
                          {g.deletedCount} {isBn ? 'ডিলিটেড' : 'del'}
                        </span>
                      </>
                    )}
                    {!g.connected && (
                      <span className="text-amber-700 font-bold">
                        · {isBn ? 'আর্কাইভ' : 'Archived'}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-600 mt-1.5 truncate leading-snug">
                    {g.lastMessageText ? (
                      <>
                        {g.lastMessageSender ? (
                          <span className="font-bold text-slate-800">{g.lastMessageSender}: </span>
                        ) : null}
                        {g.lastMessageText}
                      </>
                    ) : (
                      <span className="text-slate-400 italic">
                        {isBn ? 'বট যুক্ত হওয়ার পর নতুন মেসেজ এখানে জমা হবে' : 'Waiting for incoming or synced messages'}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextGroup(g);
                  }}
                  title={isBn ? 'গ্রুপ মেনু খুলুন' : 'Group Context Menu'}
                  className="w-8 h-8 rounded-xl hover:bg-emerald-100/70 flex items-center justify-center text-slate-400 hover:text-emerald-800 shrink-0 cursor-pointer"
                >
                  <MoreVertical size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Long-Press & Action Context Menu Modal */}
      {contextGroup && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-3"
          onClick={() => setContextGroup(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-emerald-50/60">
              <GroupAvatarBadge
                name={contextGroup.name}
                avatarUrl={contextGroup.avatarUrl}
                apiBaseUrl={apiBaseUrl}
                sizeClass="w-11 h-11"
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-slate-900 truncate">{contextGroup.name}</h4>
                <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                  {contextGroup.participants} {isBn ? 'সদস্য' : 'members'} · {contextGroup.totalStoredMessages}{' '}
                  {isBn ? 'মেসেজ সংরক্ষিত' : 'saved msgs'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContextGroup(null)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-2.5 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  const targetId = contextGroup.id;
                  setContextGroup(null);
                  onOpenInbox(targetId, 'all');
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl hover:bg-emerald-50 text-left flex items-center gap-3 text-xs font-extrabold text-slate-900 cursor-pointer"
              >
                <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Inbox size={16} />
                </span>
                <span>{isBn ? 'গ্রুপ ইনবক্স খুলুন' : 'Open Group Inbox'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetId = contextGroup.id;
                  setContextGroup(null);
                  onOpenInbox(targetId, 'deleted');
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl hover:bg-amber-50 text-left flex items-center justify-between gap-3 text-xs font-extrabold text-slate-900 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Trash2 size={16} />
                  </span>
                  <span>{isBn ? 'ডিলিটেড মেসেজ হিস্ট্রি' : 'Deleted Message History'}</span>
                </div>
                <span className="text-[11px] font-bold text-amber-700 tabular-nums">
                  {contextGroup.deletedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setContextGroup(null);
                  onRefresh();
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl hover:bg-slate-50 text-left flex items-center gap-3 text-xs font-extrabold text-slate-800 cursor-pointer"
              >
                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <RefreshCw size={16} />
                </span>
                <span>{isBn ? 'গ্রুপ তথ্য ও ছবি রিফ্রেশ করুন' : 'Refresh Group & Avatar'}</span>
              </button>

              {contextGroup.connected && (
                <button
                  type="button"
                  onClick={() => {
                    const target = contextGroup;
                    setContextGroup(null);
                    setConfirmLeaveGroup(target);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl hover:bg-rose-50 text-left flex items-center gap-3 text-xs font-extrabold text-rose-700 cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                    <LogOut size={16} />
                  </span>
                  <span>{isBn ? 'সার্ভার থেকে গ্রুপ লিভ নিন' : 'Leave Group from Server'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CUSTOM VOICE & AUDIO PLAYER (Duration, Scrub Seek Bar & Playback Speed 1x/1.5x/2x)
// =============================================================================
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
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(declaredDurationSec || 0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    setErrorMsg('');
    if (el.paused) {
      try {
        el.playbackRate = speed;
        await el.play();
        setPlaying(true);
      } catch {
        setErrorMsg('অডিও প্লে করা যায়নি');
      }
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const cycleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const maxSec = duration > 0 ? duration : 1;

  return (
    <div className="p-2.5 rounded-2xl bg-emerald-50/75 border border-emerald-200 max-w-md space-y-1.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setPlaying(false);
          setErrorMsg('অডিও ফাইলটি লোড করা যায়নি');
        }}
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-2xs"
          aria-label={playing ? 'Pause audio' : 'Play audio'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold text-emerald-950 mb-1">
            <span className="inline-flex items-center gap-1 truncate">
              {isVoice ? <Mic size={11} className="text-emerald-700" /> : <Music size={11} className="text-emerald-700" />}
              <span className="truncate">{isVoice ? 'Voice Message' : fileName || 'Audio File'}</span>
            </span>
            <span className="tabular-nums text-emerald-800 shrink-0">
              {formatDurationClock(currentTime)} / {formatDurationClock(duration || declaredDurationSec)}
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
            className="w-full accent-emerald-700 h-1.5 cursor-pointer"
          />
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          className="min-w-[40px] h-8 px-2 rounded-lg bg-white border border-emerald-200 hover:border-emerald-500 text-[11px] font-extrabold text-emerald-900 tabular-nums cursor-pointer shrink-0"
          title="Playback Speed"
        >
          {speed}x
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={fileName || 'audio'}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 flex items-center justify-center text-slate-600 hover:text-emerald-800 shrink-0"
            title="Download Audio"
          >
            <Download size={14} />
          </a>
        )}
      </div>

      {errorMsg && <div className="text-[10.5px] font-bold text-rose-600">{errorMsg}</div>}
    </div>
  );
}

// =============================================================================
// FULL GROUP INBOX PAGE (Conversation Stream, Filters, Pagination, Media Viewers)
// =============================================================================
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

  // Filters
  const [tabMode, setTabMode] = useState<'all' | 'deleted'>(initialDeletedOnly ? 'deleted' : 'all');
  const [senderSearch, setSenderSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilterBar, setShowFilterBar] = useState(false);

  // WebSocket live status
  const [wsConnected, setWsConnected] = useState(false);

  // Storage stats & settings
  const [storageStats, setStorageStats] = useState<InboxStorageStats | null>(null);
  const [storageSettings, setStorageSettings] = useState<InboxStorageSettings>({
    mediaStorageLimitMb: 250,
    autoPruneOldNonImportantMedia: true,
    maxMessagesPerGroup: 2500,
  });
  const [showStoragePanel, setShowStoragePanel] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);

  // Viewers (Image Full-Screen, Document Preview)
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

  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);

  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const selectedGroupIdRef = useRef(selectedGroupId);
  const tabModeRef = useRef(tabMode);
  const filtersRef = useRef({ senderSearch, querySearch, typeFilter, dateFrom, dateTo });

  useEffect(() => {
    selectedGroupIdRef.current = selectedGroupId;
  }, [selectedGroupId]);

  useEffect(() => {
    tabModeRef.current = tabMode;
  }, [tabMode]);

  useEffect(() => {
    filtersRef.current = { senderSearch, querySearch, typeFilter, dateFrom, dateTo };
  }, [senderSearch, querySearch, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (initialGroupId) {
      setSelectedGroupId(initialGroupId);
    }
    setTabMode(initialDeletedOnly ? 'deleted' : 'all');
  }, [initialGroupId, initialDeletedOnly]);

  const loadInboxGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await callApi('/api/inbox/groups');
      if (Array.isArray(res?.groups)) {
        setGroups(res.groups);
        setSelectedGroupId((prev) => {
          if (prev && res.groups.some((g: InboxGroupSummary) => g.id === prev)) return prev;
          if (initialGroupId && res.groups.some((g: InboxGroupSummary) => g.id === initialGroupId)) return initialGroupId;
          return res.groups[0]?.id || '';
        });
      }
      if (res?.storage) setStorageStats(res.storage);
      if (res?.settings) setStorageSettings(res.settings);
    } catch (err: any) {
      showNotification((isBn ? 'গ্রুপ ইনবক্স লোড ব্যর্থ: ' : 'Inbox load failed: ') + err.message);
    } finally {
      setGroupsLoading(false);
    }
  }, [callApi, initialGroupId, isBn, showNotification]);

  useEffect(() => {
    loadInboxGroups();
  }, [loadInboxGroups]);

  const loadMessages = useCallback(
    async (groupId: string, opts?: { appendOlder?: boolean; cursor?: { beforeTimestamp: number; beforeId: string } | null }) => {
      if (!groupId) {
        setMessages([]);
        return;
      }

      const appendOlder = Boolean(opts?.appendOlder);
      const prevScrollHeight = messageStreamRef.current?.scrollHeight || 0;
      const prevScrollTop = messageStreamRef.current?.scrollTop || 0;

      if (appendOlder) setLoadingOlder(true);
      else setMessagesLoading(true);

      try {
        const params = new URLSearchParams();
        params.set('limit', '35');
        if (tabMode === 'deleted') params.set('deletedOnly', '1');
        if (typeFilter !== 'all' && tabMode !== 'deleted') params.set('type', typeFilter);
        if (senderSearch.trim()) params.set('sender', senderSearch.trim());
        if (querySearch.trim()) params.set('query', querySearch.trim());
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        if (appendOlder && opts?.cursor) {
          params.set('beforeTimestamp', String(opts.cursor.beforeTimestamp));
          params.set('beforeId', opts.cursor.beforeId);
        }

        const res = await callApi(`/api/inbox/groups/${encodeURIComponent(groupId)}/messages?${params.toString()}`);
        const pageItems: InboxMessageRecord[] = Array.isArray(res?.messages) ? res.messages : [];
        setHasMore(Boolean(res?.hasMore));
        setTotalMatching(Number(res?.totalMatching || pageItems.length));
        setNextCursor(res?.nextCursor || null);

        if (appendOlder) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...pageItems.filter((m) => !seen.has(m.id)), ...prev];
            return merged.sort((a, b) => a.timestamp - b.timestamp);
          });
          requestAnimationFrame(() => {
            const el = messageStreamRef.current;
            if (el) {
              const delta = el.scrollHeight - prevScrollHeight;
              el.scrollTop = prevScrollTop + delta;
            }
          });
        } else {
          setMessages(pageItems);
          requestAnimationFrame(() => {
            const el = messageStreamRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        }
      } catch (err: any) {
        showNotification((isBn ? 'মেসেজ লোড সমস্যা: ' : 'Messages load error: ') + err.message);
      } finally {
        setMessagesLoading(false);
        setLoadingOlder(false);
      }
    },
    [callApi, dateFrom, dateTo, isBn, querySearch, senderSearch, showNotification, tabMode, typeFilter]
  );

  useEffect(() => {
    if (!selectedGroupId) return;
    const timer = setTimeout(() => {
      loadMessages(selectedGroupId);
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedGroupId, tabMode, typeFilter, senderSearch, querySearch, dateFrom, dateTo, loadMessages]);

  // Real-Time WebSocket connection to /ws/inbox
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ws: WebSocket | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1200;

    const resolveWsUrl = () => {
      const base = apiBaseUrl.trim();
      if (base && /^https?:\/\//i.test(base)) {
        const u = new URL(base);
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        u.pathname = '/ws/inbox';
        u.search = '';
        return u.toString();
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws/inbox`;
    };

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(resolveWsUrl());
      } catch {
        setWsConnected(false);
        retryTimer = setTimeout(connect, retryDelay);
        return;
      }

      ws.onopen = () => {
        retryDelay = 1200;
        if (adminToken) {
          try {
            ws?.send(JSON.stringify({ type: 'auth', token: adminToken }));
          } catch {}
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || ''));
          if (payload?.type === 'inbox:ready') {
            setWsConnected(true);
            if (payload.storage) setStorageStats(payload.storage);
            return;
          }
          if (payload?.type === 'inbox:auth_error') {
            setWsConnected(false);
            return;
          }
          if (payload?.type === 'inbox:storage_updated' && payload.stats) {
            setStorageStats(payload.stats);
            return;
          }
          if (payload?.groupSummary) {
            const sum = payload.groupSummary as InboxGroupSummary;
            setGroups((prev) => {
              const idx = prev.findIndex((g) => g.id === sum.id);
              const next = idx >= 0 ? prev.map((g, i) => (i === idx ? sum : g)) : [sum, ...prev];
              return [...next].sort((a, b) => {
                if (Boolean(a.connected) !== Boolean(b.connected)) return a.connected ? -1 : 1;
                const ta = a.lastMessageAt || 0;
                const tb = b.lastMessageAt || 0;
                if (ta !== tb) return tb - ta;
                return (a.name || '').localeCompare(b.name || '');
              });
            });
          }

          if (
            (payload?.type === 'inbox:message_new' || payload?.type === 'inbox:message_updated') &&
            payload.message &&
            payload.groupId === selectedGroupIdRef.current
          ) {
            const incoming = payload.message as InboxMessageRecord;
            const curTab = tabModeRef.current;
            const f = filtersRef.current;
            const hasStrictFilters = Boolean(
              f.senderSearch.trim() || f.querySearch.trim() || f.dateFrom || f.dateTo || (f.typeFilter !== 'all' && curTab !== 'deleted')
            );

            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.id === incoming.id);
              if (existingIdx >= 0) {
                return prev.map((m, i) => (i === existingIdx ? incoming : m));
              }
              if (curTab === 'deleted' && !incoming.isDeleted) return prev;
              if (hasStrictFilters) return prev;
              const next = [...prev, incoming].sort((a, b) => a.timestamp - b.timestamp);
              requestAnimationFrame(() => {
                const el = messageStreamRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 180) {
                  el.scrollTop = el.scrollHeight;
                }
              });
              return next;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(10000, retryDelay * 1.5);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {}
    };
  }, [adminToken, apiBaseUrl]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

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
      if (res?.storage) setStorageStats(res.storage);
      showNotification(
        !msg.isImportant
          ? isBn
            ? 'মেসেজটি গুরুত্বপূর্ণ (Important) হিসেবে সংরক্ষিত হয়েছে — অটো-ডিলিট হবে না।'
            : 'Marked important — protected from auto-cleanup.'
          : isBn
          ? 'Important চিহ্ন সরানো হয়েছে।'
          : 'Unmarked important.'
      );
    } catch (err: any) {
      showNotification(err.message);
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
        if (resp.ok) {
          const txt = await resp.text();
          textContent = txt.slice(0, 20000);
        }
      } catch {}
    }

    setDocPreview({
      src,
      downloadUrl,
      fileName,
      mimeType: mime,
      isPdf,
      textContent,
    });
  };

  const handleSaveStorageSettings = async () => {
    setStorageBusy(true);
    try {
      const res = await callApi('/api/inbox/storage/settings', 'POST', storageSettings);
      if (res?.settings) setStorageSettings(res.settings);
      if (res?.storage) setStorageStats(res.storage);
      showNotification(res?.message || (isBn ? 'স্টোরেজ লিমিট সেভ হয়েছে' : 'Storage settings saved'));
    } catch (err: any) {
      showNotification(err.message);
    } finally {
      setStorageBusy(false);
    }
  };

  const handlePruneInboxStorage = async () => {
    setStorageBusy(true);
    try {
      const res = await callApi('/api/inbox/storage/cleanup', 'POST', { forcePrunePercent: 25 });
      if (res?.storage) setStorageStats(res.storage);
      showNotification(res?.message || (isBn ? 'নন-ইম্পর্ট্যান্ট মিডিয়া পরিষ্কার সম্পন্ন হয়েছে' : 'Cleanup complete'));
      if (selectedGroupId) loadMessages(selectedGroupId);
    } catch (err: any) {
      showNotification(err.message);
    } finally {
      setStorageBusy(false);
    }
  };

  const renderTextWithSafeLinks = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/[^\s<>"']+)/gi);
    return (
      <p className="text-[13px] text-slate-900 leading-relaxed whitespace-pre-wrap break-words">
        {parts.map((part, idx) => {
          if (/^https?:\/\//i.test(part)) {
            const safeUrl = sanitizeSafeExternalUrl(part);
            if (safeUrl) {
              return (
                <a
                  key={idx}
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:text-emerald-900 underline break-all font-medium"
                >
                  {part}
                </a>
              );
            }
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        })}
      </p>
    );
  };

  const renderMessageContent = (msg: InboxMessageRecord) => {
    const mediaUrl = buildApiMediaUrl(msg.media?.mediaUrl, apiBaseUrl);
    const downloadUrl = buildApiMediaUrl(msg.media?.downloadUrl, apiBaseUrl);

    return (
      <div className="space-y-2">
        {msg.quotedMessage && (msg.quotedMessage.text || msg.quotedMessage.senderName) && (
          <div className="p-2 rounded-xl bg-emerald-50/80 border-l-4 border-emerald-600 text-[11px] text-slate-700">
            <div className="font-extrabold text-emerald-900">
              {msg.quotedMessage.senderName || msg.quotedMessage.senderPhone || 'Quoted Message'}
            </div>
            <div className="line-clamp-2 opacity-85 mt-0.5">
              {msg.quotedMessage.text || `[${msg.quotedMessage.messageType || 'Media'}]`}
            </div>
          </div>
        )}

        {/* IMAGE */}
        {msg.messageType === 'image' && (
          <div className="space-y-1.5">
            {msg.media?.status === 'saved' && mediaUrl ? (
              <div className="relative inline-block group/img">
                <button
                  type="button"
                  onClick={() => {
                    setImageZoomed(false);
                    setImageViewer({
                      src: mediaUrl,
                      downloadUrl,
                      title: `${msg.senderName} (${msg.senderPhone})`,
                      caption: msg.text,
                    });
                  }}
                  className="block rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:border-emerald-500 transition-colors"
                >
                  <img
                    src={mediaUrl}
                    alt={msg.text || 'Group Image'}
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-auto max-w-full object-contain"
                  />
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                {msg.media?.status === 'pending' ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-emerald-700 shrink-0" />
                    <span>{isBn ? 'ছবিটি সার্ভার স্টোরেজে ডাউনলোড হচ্ছে...' : 'Downloading image...'}</span>
                  </>
                ) : (
                  <>
                    <ImageIcon size={14} className="text-slate-400 shrink-0" />
                    <span>{msg.media?.unavailableReason || (isBn ? 'ছবির ফাইলটি উপলব্ধ নেই' : 'Image unavailable')}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* STICKER */}
        {msg.messageType === 'sticker' && (
          <div>
            {msg.media?.status === 'saved' && mediaUrl ? (
              <div className="inline-flex p-2 rounded-2xl bg-slate-50 border border-slate-200">
                <img
                  src={mediaUrl}
                  alt="WhatsApp Sticker"
                  referrerPolicy="no-referrer"
                  className="w-32 h-32 object-contain"
                />
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <Smile size={14} className="text-emerald-700" />
                <span>{msg.media?.unavailableReason || (isBn ? 'স্টিকার ডেটা পাওয়া যায়নি' : 'Sticker binary unavailable')}</span>
              </div>
            )}
          </div>
        )}

        {/* VIDEO */}
        {msg.messageType === 'video' && (
          <div className="space-y-1.5">
            {msg.media?.status === 'saved' && mediaUrl ? (
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-black max-w-md">
                <video
                  src={mediaUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-80 object-contain"
                />
                <div className="px-3 py-1.5 bg-slate-900 text-white/90 text-[10.5px] flex items-center justify-between gap-2 tabular-nums">
                  <span>
                    {msg.media.isGif ? 'GIF Video' : 'Video'}{' '}
                    {msg.media.durationSec ? `· ${formatDurationClock(msg.media.durationSec)}` : ''}{' '}
                    {msg.media.fileSize ? `· ${formatBytesHuman(msg.media.fileSize)}` : ''}
                  </span>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download
                      className="inline-flex items-center gap-1 text-emerald-300 hover:text-white font-bold"
                    >
                      <Download size={12} /> {isBn ? 'ডাউনলোড' : 'Download'}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                {msg.media?.status === 'pending' ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-emerald-700 shrink-0" />
                    <span>{isBn ? 'ভিডিও সার্ভার স্টোরেজে ডাউনলোড হচ্ছে...' : 'Downloading video...'}</span>
                  </>
                ) : (
                  <>
                    <Video size={14} className="text-slate-400 shrink-0" />
                    <span>{msg.media?.unavailableReason || (isBn ? 'ভিডিও ফাইলটি উপলব্ধ নেই' : 'Video unavailable')}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* VOICE OR AUDIO */}
        {(msg.messageType === 'voice' || msg.messageType === 'audio') && (
          <div>
            {msg.media?.status === 'saved' && mediaUrl ? (
              <VoiceAudioPlayer
                src={mediaUrl}
                downloadUrl={downloadUrl}
                declaredDurationSec={msg.media.durationSec}
                isVoice={msg.messageType === 'voice'}
                fileName={msg.media.fileName}
              />
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                <Mic size={14} className="text-slate-400 shrink-0" />
                <span>{msg.media?.unavailableReason || (isBn ? 'ভয়েস/অডিও ফাইল উপলব্ধ নেই' : 'Audio unavailable')}</span>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENT */}
        {msg.messageType === 'document' && (
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 max-w-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 truncate">
                  {msg.media?.fileName || 'Document'}
                </div>
                <div className="text-[10.5px] text-slate-500 tabular-nums mt-0.5">
                  {msg.media?.fileSize ? formatBytesHuman(msg.media.fileSize) : ''}{' '}
                  {msg.media?.pageCount ? `· ${msg.media.pageCount} pages` : ''}{' '}
                  {msg.media?.mimeType ? `· ${msg.media.mimeType.split(';')[0]}` : ''}
                </div>
                {msg.media?.status !== 'saved' && msg.media?.unavailableReason && (
                  <div className="text-[10.5px] text-amber-700 mt-1">{msg.media.unavailableReason}</div>
                )}
              </div>
            </div>

            {msg.media?.status === 'saved' && mediaUrl && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenDocPreview(msg)}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 text-[11px] font-bold text-slate-800 cursor-pointer"
                >
                  <Eye size={13} className="text-emerald-700" />
                  <span>{isBn ? 'প্রিভিউ' : 'Preview'}</span>
                </button>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={msg.media.fileName || 'document'}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold"
                  >
                    <Download size={13} />
                    <span>{isBn ? 'ডাউনলোড' : 'Save'}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* LOCATION */}
        {msg.messageType === 'location' && msg.location && (
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 max-w-md flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <MapPin size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-emerald-950">
                  {msg.location.name || (msg.location.isLive ? 'Live Location' : 'Shared Location')}
                </div>
                {msg.location.address && (
                  <div className="text-[11px] text-emerald-900 mt-0.5">{msg.location.address}</div>
                )}
                <div className="text-[10.5px] font-mono text-emerald-700 mt-1 tabular-nums">
                  {Number.isFinite(msg.location.latitude) && Number.isFinite(msg.location.longitude)
                    ? `${msg.location.latitude.toFixed(6)}, ${msg.location.longitude.toFixed(6)}`
                    : 'Coordinates unavailable'}
                </div>
              </div>
            </div>
            {Number.isFinite(msg.location.latitude) && Number.isFinite(msg.location.longitude) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${msg.location.latitude},${msg.location.longitude}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100 shrink-0"
              >
                <span>{isBn ? 'ম্যাপ' : 'Map'}</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* CONTACTS */}
        {msg.messageType === 'contact' && Array.isArray(msg.contacts) && msg.contacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
            {msg.contacts.map((c, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-2.5"
              >
                <span className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                  <Contact2 size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 truncate">{c.displayName}</div>
                  {c.phone && <div className="text-[11px] font-mono text-emerald-800 tabular-nums">{c.phone}</div>}
                  {c.org && <div className="text-[10px] text-slate-500 truncate">{c.org}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CAPTION OR TEXT BODY */}
        {msg.text && renderTextWithSafeLinks(msg.text)}
      </div>
    );
  };

  return (
    <section className="page active" id="inbox">
      {/* Header Bar */}
      <div className="page-head">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <ArrowLeft size={13} className="text-emerald-700" /> {isBn ? 'হোম পেজ' : 'Home'}
          </button>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1>{isBn ? 'রিয়েল-টাইম গ্রুপ ইনবক্স' : 'Real-Time Group Inbox'}</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10.5px] font-extrabold border ${
                wsConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Radio size={11} className={wsConnected ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} />
              {wsConnected ? (isBn ? 'Live Stream চালু' : 'Live Connected') : isBn ? 'পুল/পুনঃসংযোগ' : 'Reconnecting'}
            </span>
          </div>
          <p>
            {isBn
              ? 'সংযুক্ত WhatsApp গ্রুপের রিয়েল মেসেজ, মিডিয়া, ভয়েস নোট, স্টিকার ও ডিলিট হিস্ট্রি — কোনো ডেমো ডেটা নয়।'
              : 'Persisted WhatsApp group messages, media, voice notes, stickers & deleted history — zero fake data.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowStoragePanel((v) => !v)}
            className="btn outline"
          >
            <HardDrive size={13} className="text-emerald-700" />
            <span>
              {storageStats
                ? `${formatBytesHuman(storageStats.mediaUsedBytes)} / ${formatBytesHuman(storageStats.mediaLimitBytes)}`
                : isBn
                ? 'ইনবক্স স্টোরেজ'
                : 'Inbox Storage'}
            </span>
          </button>
          <button type="button" onClick={loadInboxGroups} className="btn primary">
            <RefreshCw size={13} className={groupsLoading ? 'animate-spin' : ''} />
            <span>{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Inbox Storage Limit & Protected Important Messages Panel */}
      {showStoragePanel && (
        <div className="card mb-4 border-emerald-200 bg-emerald-50/35">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-950">
                <ShieldCheck size={16} className="text-emerald-700" />
                <span>{isBn ? 'ইনবক্স মিডিয়া স্টোরেজ লিমিট ও নিরাপদ ক্লিনআপ' : 'Inbox Media Quota & Safe Pruning'}</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isBn
                  ? 'স্টোরেজ লিমিট পূর্ণ হলে শুধু পুরোনো অ-গুরুত্বপূর্ণ মিডিয়া সরানো হয়। গুরুত্বপূর্ণ (Star) মেসেজ এবং মডারেশন ডিলিট প্রমাণ কখনো অটো-ডিলিট হয় না।'
                  : 'Only old non-important media files are pruned above the limit. Starred and moderation-evidence messages are permanently protected.'}
              </p>
              {storageStats && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-700 tabular-nums pt-1">
                  <span>
                    {isBn ? 'মোট মেসেজ:' : 'Messages:'} {storageStats.totalMessages}
                  </span>
                  <span>
                    {isBn ? 'মিডিয়া ফাইল:' : 'Media Files:'} {storageStats.totalMediaFiles} ({storageStats.mediaUsedPercent}%)
                  </span>
                  <span className="text-amber-700">
                    ★ Important: {storageStats.totalImportantMessages}
                  </span>
                  <span className="text-rose-700">
                    {isBn ? 'ডিলিটেড হিস্ট্রি:' : 'Deleted Audit:'} {storageStats.totalDeletedMessages}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 bg-white px-2.5 py-2 rounded-xl border border-slate-200">
                <span>{isBn ? 'লিমিট (MB):' : 'Limit (MB):'}</span>
                <input
                  type="number"
                  min={50}
                  max={2048}
                  value={storageSettings.mediaStorageLimitMb}
                  onChange={(e) =>
                    setStorageSettings((s) => ({ ...s, mediaStorageLimitMb: Number(e.target.value || 250) }))
                  }
                  className="w-16 text-right font-mono font-extrabold text-emerald-800 focus:outline-none tabular-nums"
                />
              </label>

              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 bg-white px-2.5 py-2 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storageSettings.autoPruneOldNonImportantMedia}
                  onChange={(e) =>
                    setStorageSettings((s) => ({ ...s, autoPruneOldNonImportantMedia: e.target.checked }))
                  }
                />
                <span>{isBn ? 'অটো লিমিট গার্ড' : 'Auto Prune'}</span>
              </label>

              <button
                type="button"
                disabled={storageBusy}
                onClick={handleSaveStorageSettings}
                className="btn primary"
              >
                {isBn ? 'সেভ' : 'Save'}
              </button>

              <button
                type="button"
                disabled={storageBusy}
                onClick={handlePruneInboxStorage}
                className="btn outline"
              >
                {isBn ? 'পুরোনো মিডিয়া ক্লিন' : 'Clean Old Media'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Workspace: Group Sidebar + Active Conversation View */}
      <div className="grid grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)] gap-4 items-start">
        {/* LEFT PANE: Connected Group List (hidden on mobile when a group is open unless user taps All Groups) */}
        <div className={`card !mb-0 ${selectedGroupId ? 'hidden lg:block' : 'block'}`}>
          <div className="card-head">
            <div>
              <h3>{isBn ? 'কানেক্টেড গ্রুপ তালিকা' : 'WhatsApp Groups'}</h3>
              <p>
                {isBn
                  ? 'Tap করলে Inbox খুলবে · Long Press করলে Context Menu'
                  : 'Tap to open Inbox · Long press for Menu'}
              </p>
            </div>
            <span className="text-xs font-extrabold text-emerald-700 tabular-nums">
              {groups.length} {isBn ? 'টি' : 'groups'}
            </span>
          </div>

          <GroupListSection
            isBn={isBn}
            groups={groups}
            apiBaseUrl={apiBaseUrl}
            isLoading={groupsLoading}
            isConnected={isConnected}
            selectedGroupId={selectedGroupId}
            leavingGroupId={leavingGroupId}
            onRefresh={loadInboxGroups}
            onOpenInbox={(gid, initialTab) => {
              setSelectedGroupId(gid);
              setTabMode(initialTab || 'all');
            }}
            onLeaveGroup={async (g) => {
              setLeavingGroupId(g.id);
              try {
                await onLeaveGroup(g.id, g.name);
                await loadInboxGroups();
              } finally {
                setLeavingGroupId(null);
              }
            }}
          />
        </div>

        {/* RIGHT PANE: Conversation & Search/Filter View */}
        <div className={`card !mb-0 !p-0 overflow-hidden ${selectedGroupId ? 'block' : 'hidden lg:block'}`}>
          {!selectedGroup ? (
            <div className="p-10 text-center">
              <MessageSquare size={32} className="mx-auto text-emerald-700/40 mb-3" />
              <h3 className="text-sm font-extrabold text-slate-900">
                {isBn ? 'একটি WhatsApp গ্রুপ নির্বাচন করুন' : 'Select a WhatsApp Group'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                {isBn
                  ? 'বাম পাশের তালিকা থেকে যেকোনো কানেক্টেড গ্রুপে ক্লিক করুন—সেই গ্রুপের সব মেসেজ, ছবি, ভিডিও, ভয়েস নোট ও ডিলিটেড হিস্ট্রি দেখা যাবে।'
                  : 'Click any connected group to inspect live & synced messages, media, voice notes, and deleted history.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-[76vh] min-h-[540px] max-h-[820px]">
              {/* Conversation Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId('')}
                    className="lg:hidden w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0 cursor-pointer"
                    aria-label="Back to group list"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <GroupAvatarBadge
                    name={selectedGroup.name}
                    avatarUrl={selectedGroup.avatarUrl}
                    apiBaseUrl={apiBaseUrl}
                    sizeClass="w-10 h-10"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-extrabold text-slate-950 truncate max-w-[230px] sm:max-w-xs">
                        {selectedGroup.name}
                      </h3>
                      {selectedGroup.isBotAdmin && (
                        <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-lg">
                          Bot Admin
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums flex items-center gap-2 flex-wrap">
                      <span>
                        {selectedGroup.participants} {isBn ? 'সদস্য' : 'members'}
                      </span>
                      <span>·</span>
                      <span>
                        {totalMatching} {isBn ? 'ম্যাচিং মেসেজ' : 'matching'}
                      </span>
                      {selectedGroup.id && (
                        <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                          {selectedGroup.id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTabMode('all')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer ${
                      tabMode === 'all'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                    }`}
                  >
                    {isBn ? 'সব মেসেজ' : 'Inbox'} ({selectedGroup.totalStoredMessages})
                  </button>

                  <button
                    type="button"
                    onClick={() => setTabMode('deleted')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer inline-flex items-center gap-1.5 ${
                      tabMode === 'deleted'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    <Trash2 size={13} />
                    <span>
                      {isBn ? 'ডিলিটেড হিস্ট্রি' : 'Deleted'} ({selectedGroup.deletedCount})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFilterBar((v) => !v)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer inline-flex items-center gap-1.5 ${
                      showFilterBar || senderSearch || querySearch || dateFrom || dateTo || typeFilter !== 'all'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                    }`}
                  >
                    <Filter size={13} />
                    <span>{isBn ? 'সার্চ ও ফিল্টার' : 'Filter'}</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Drawer */}
              {showFilterBar && (
                <div className="p-3 border-b border-slate-200 bg-slate-50/85 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
                      <input
                        type="text"
                        value={senderSearch}
                        onChange={(e) => setSenderSearch(e.target.value)}
                        placeholder={isBn ? 'Sender নাম বা নম্বর...' : 'Search sender or ID...'}
                        className="w-full min-h-[38px] pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        value={querySearch}
                        onChange={(e) => setQuerySearch(e.target.value)}
                        placeholder={isBn ? 'মেসেজ বা ফাইল টেক্সট...' : 'Search message text...'}
                        className="w-full min-h-[38px] pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-emerald-700 shrink-0" />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        aria-label="Date From"
                        className="w-full min-h-[38px] px-2 py-1 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                      <span className="text-slate-400 text-xs">–</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        aria-label="Date To"
                        className="w-full min-h-[38px] px-2 py-1 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        disabled={tabMode === 'deleted'}
                        className="w-full min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        <option value="all">{isBn ? 'সব ধরন (All Types)' : 'All Message Types'}</option>
                        <option value="text">{isBn ? 'টেক্সট (Text)' : 'Text Messages'}</option>
                        <option value="image">{isBn ? 'ছবি (Image)' : 'Images'}</option>
                        <option value="video">{isBn ? 'ভিডিও (Video)' : 'Videos'}</option>
                        <option value="audio">{isBn ? 'ভয়েস ও অডিও (Audio)' : 'Voice & Audio'}</option>
                        <option value="sticker">{isBn ? 'স্টিকার (Sticker)' : 'Stickers'}</option>
                        <option value="document">{isBn ? 'ডকুমেন্ট (Document)' : 'Documents'}</option>
                        <option value="location">{isBn ? 'লোকেশন (Location)' : 'Locations'}</option>
                        <option value="contact">{isBn ? 'কনট্যাক্ট (Contact)' : 'Contacts'}</option>
                        <option value="important">{isBn ? 'গুরুত্বপূর্ণ (Starred)' : 'Starred / Important'}</option>
                      </select>

                      {(senderSearch || querySearch || dateFrom || dateTo || typeFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSenderSearch('');
                            setQuerySearch('');
                            setDateFrom('');
                            setDateTo('');
                            setTypeFilter('all');
                          }}
                          className="min-h-[38px] px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        >
                          {isBn ? 'রিসেট' : 'Reset'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Message Conversation Stream */}
              <div
                ref={messageStreamRef}
                className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#f3f8f5]"
              >
                {hasMore && (
                  <div className="flex justify-center pb-1">
                    <button
                      type="button"
                      disabled={loadingOlder}
                      onClick={() => loadMessages(selectedGroup.id, { appendOlder: true, cursor: nextCursor })}
                      className="inline-flex items-center gap-2 min-h-[38px] px-4 py-1.5 rounded-xl bg-white border border-emerald-200 hover:border-emerald-500 text-xs font-extrabold text-emerald-900 shadow-2xs cursor-pointer"
                    >
                      {loadingOlder ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      <span>{isBn ? 'আরও পুরোনো মেসেজ লোড করুন' : 'Load Older Messages'}</span>
                    </button>
                  </div>
                )}

                {messagesLoading && messages.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-slate-500 flex flex-col items-center gap-2">
                    <Loader2 size={22} className="animate-spin text-emerald-700" />
                    <span>{isBn ? 'গ্রুপের সংরক্ষিত মেসেজ লোড হচ্ছে...' : 'Loading persisted messages...'}</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 px-4 text-center bg-white rounded-2xl border border-slate-200 max-w-lg mx-auto">
                    <Inbox size={28} className="mx-auto text-emerald-700/40 mb-2" />
                    <div className="text-xs font-extrabold text-slate-900">
                      {tabMode === 'deleted'
                        ? isBn
                          ? 'এই গ্রুপে কোনো ডিলিটেড মেসেজ রেকর্ড নেই'
                          : 'No deleted message history in this group'
                        : isBn
                        ? 'এখনো কোনো মেসেজ পাওয়া যায়নি'
                        : 'No messages captured yet'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      {isBn
                        ? 'WhatsApp History Sync থেকে যতটুকু পাওয়া যায় এবং বট কানেক্ট থাকার পর গ্রুপে যে নতুন মেসেজ আসবে, শুধু সেই রিয়েল মেসেজ ও মিডিয়া এখানে স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।'
                        : 'Only genuine messages received via WhatsApp History Sync and live bot events are stored here — zero simulated data.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 sm:p-3.5 rounded-2xl border shadow-2xs transition-colors ${
                        msg.isDeleted
                          ? 'bg-rose-50/75 border-rose-200'
                          : msg.fromMe
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Message Header: Sender Name, WhatsApp ID/Phone, Message Type, Important Toggle */}
                      <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-950">{msg.senderName}</span>
                            <span className="text-[10.5px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md tabular-nums">
                              {msg.senderPhone}
                            </span>
                            {msg.fromMe && (
                              <span className="text-[10px] font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                <CheckCircle2 size={10} /> Bot
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                            {msg.senderJid}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {getMessageTypeLabel(msg.messageType, isBn)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleImportant(msg)}
                            title={
                              msg.isImportant
                                ? isBn
                                  ? 'Important থেকে সরান'
                                  : 'Unmark Important'
                                : isBn
                                ? 'Important হিসেবে প্রটেক্ট করুন'
                                : 'Protect as Important'
                            }
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                              msg.isImportant
                                ? 'bg-amber-50 border-amber-300 text-amber-600'
                                : 'bg-white border-slate-200 text-slate-400 hover:text-amber-600'
                            }`}
                          >
                            <Star size={13} className={msg.isImportant ? 'fill-amber-500 text-amber-500' : ''} />
                          </button>
                        </div>
                      </div>

                      {/* Deleted Status Callout */}
                      {msg.isDeleted && (
                        <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-rose-100/80 border border-rose-200 text-[11px] font-bold text-rose-900 flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {msg.deletionReason ||
                              (isBn ? 'এই মেসেজটি ডিলিট করা হয়েছে' : 'Message was deleted')}
                          </span>
                          {msg.deletedAt && (
                            <span className="text-[10px] font-mono tabular-nums text-rose-700">
                              {formatFullTimestamp(msg.deletedAt)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Message Content (Text + Rich Media) */}
                      {renderMessageContent(msg)}

                      {/* Footer Metadata: Timestamp + Source */}
                      <div className="mt-2 pt-1.5 border-t border-slate-100/80 flex items-center justify-between gap-2 text-[10px] text-slate-400 tabular-nums">
                        <span>{formatFullTimestamp(msg.timestamp)}</span>
                        <span>
                          {msg.editedAt ? (isBn ? 'এডিটেড · ' : 'Edited · ') : ''}
                          {msg.source === 'history_sync'
                            ? isBn
                              ? 'History Sync'
                              : 'History Sync'
                            : msg.source === 'bot_outgoing'
                            ? 'Bot Outgoing'
                            : 'Live'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULL-SCREEN IMAGE VIEWER MODAL */}
      {imageViewer && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => setImageViewer(null)}
        >
          <div
            className="p-3 sm:p-4 flex items-center justify-between gap-3 bg-black/60 text-white border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold truncate">{imageViewer.title}</div>
              {imageViewer.caption && (
                <div className="text-[11px] text-white/75 truncate mt-0.5">{imageViewer.caption}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setImageZoomed((z) => !z)}
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer"
                title={imageZoomed ? 'Zoom Out' : 'Zoom In'}
              >
                {imageZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
              </button>
              {imageViewer.downloadUrl && (
                <a
                  href={imageViewer.downloadUrl}
                  download
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-extrabold text-white"
                >
                  <Download size={14} />
                  <span>{isBn ? 'ডাউনলোড' : 'Download'}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-rose-600 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img
              src={imageViewer.src}
              alt={imageViewer.title}
              referrerPolicy="no-referrer"
              onClick={(e) => {
                e.stopPropagation();
                setImageZoomed((z) => !z);
              }}
              className={`rounded-lg transition-transform duration-200 cursor-zoom-in ${
                imageZoomed ? 'max-w-none scale-150 cursor-zoom-out' : 'max-h-[84vh] max-w-full object-contain'
              }`}
            />
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {docPreview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setDocPreview(null)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 sm:p-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <FileText size={17} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-950 truncate">{docPreview.fileName}</h4>
                  <p className="text-[10.5px] text-slate-500">{docPreview.mimeType}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {docPreview.downloadUrl && (
                  <a
                    href={docPreview.downloadUrl}
                    download={docPreview.fileName}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-extrabold text-white"
                  >
                    <Download size={14} />
                    <span>{isBn ? 'ডাউনলোড' : 'Download'}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setDocPreview(null)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-3">
              {docPreview.isPdf ? (
                <iframe
                  title={docPreview.fileName}
                  src={docPreview.src}
                  className="w-full h-[68vh] rounded-xl border border-slate-200 bg-white"
                />
              ) : docPreview.textContent !== undefined ? (
                <pre className="p-4 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-words overflow-auto max-h-[68vh]">
                  {docPreview.textContent}
                </pre>
              ) : (
                <div className="py-12 text-center space-y-3">
                  <FileText size={32} className="mx-auto text-emerald-700/50" />
                  <div className="text-xs font-extrabold text-slate-900">
                    {isBn
                      ? 'এই ডকুমেন্ট ফরম্যাটটি সরাসরি ডাউনলোড করে দেখতে হবে।'
                      : 'Download this document format to open locally.'}
                  </div>
                  {docPreview.downloadUrl && (
                    <a
                      href={docPreview.downloadUrl}
                      download={docPreview.fileName}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
                    >
                      <Download size={14} /> {isBn ? 'নিরাপদ ডাউনলোড' : 'Safe Download'}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
