import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Send,
  Smile,
  Star,
  Tag,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { canStartCallFromPermissionStatus, normalizeCallPermissionStatus } from '../../lib/call-permissions';
import {
  mapConversationMessageRecord,
  mergeConversationMessages,
  removeConversationMessage,
  replaceConversationMessage,
  upsertConversationMessage,
  upsertConversationThread,
} from '../../lib/conversations';
import { useAppData } from '../../context/AppDataContext';
import { useCallManager } from '../../context/CallManagerContext';
import { getCachedSession, supabase } from '../../lib/supabase';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type {
  ConversationMessage,
  ConversationThread,
  MetaTemplate,
  SendMediaMessageInput,
  WhatsAppBlockedUser,
} from '../../lib/types';

const EMOJI_CHOICES = ['😀', '😂', '😍', '🙏', '🔥', '🎉', '👍', '❤️', '✨', '🤝', '📦', '🚀'];
const AUTO_SCROLL_THRESHOLD_PX = 96;
const MEDIA_PREVIEW_MIN_ZOOM = 1;
const MEDIA_PREVIEW_MAX_ZOOM = 3;
const MEDIA_PREVIEW_ZOOM_STEP = 0.25;

interface PendingAttachment {
  mediaId: string;
  mediaType: SendMediaMessageInput['mediaType'];
  fileName: string;
  mimeType: string;
  previewUrl: string | null;
}

type InboxThreadFilter = 'all' | 'unread' | 'starred';
type InboxChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'messenger';

const STARRED_THREADS_STORAGE_KEY = 'connektly-inbox-starred-threads';
const ACTIVE_THREAD_POLL_INTERVAL_MS = 600;
const THREAD_FILTER_OPTIONS: Array<{ id: InboxThreadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
];
const CHANNEL_FILTER_OPTIONS: Array<{ id: InboxChannelFilter; label: string }> = [
  { id: 'all', label: 'All Channels' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
];

function getThreadChannel(): Exclude<InboxChannelFilter, 'all'> {
  return 'whatsapp';
}

function getThreadWaId(thread: ConversationThread | null) {
  return thread?.contactWaId || thread?.displayPhone || '';
}

function getEmptyThreadMessage({
  channelFilter,
  threadFilter,
  hasWhatsAppChannel,
}: {
  channelFilter: InboxChannelFilter;
  threadFilter: InboxThreadFilter;
  hasWhatsAppChannel: boolean;
}) {
  if (channelFilter === 'instagram') {
    return 'Instagram inbox is not wired into this workspace yet.';
  }

  if (channelFilter === 'messenger') {
    return 'Messenger inbox is not wired into this workspace yet.';
  }

  if (!hasWhatsAppChannel) {
    return 'Connect WhatsApp first so inbound webhook traffic can create real conversations here.';
  }

  if (threadFilter === 'unread') {
    return 'No unread conversations match the current filters.';
  }

  if (threadFilter === 'starred') {
    return 'No starred conversations match the current filters.';
  }

  return 'No conversations match the current filters yet.';
}

function getMediaPayload(raw: Record<string, unknown>) {
  const type = typeof raw.type === 'string' ? raw.type : null;

  if (!type || !['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    return null;
  }

  const payload = raw[type] as { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined;

  if (!payload?.id) {
    return null;
  }

  return {
    mediaId: payload.id,
    mediaType: type,
    mimeType: payload.mime_type || null,
    fileName: payload.filename || null,
    caption: payload.caption || null,
  };
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return [];
  }

  const components = raw.components;

  return Array.isArray(components)
    ? components.filter((component): component is Record<string, unknown> => Boolean(component) && typeof component === 'object' && !Array.isArray(component))
    : [];
}

function normalizeTemplateSnapshot(
  raw: Record<string, unknown> | null | undefined,
  fallback?: { name?: string | null; language?: string | null },
) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallback?.name) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallback?.name || null,
    language: typeof raw?.language === 'string' ? raw.language : fallback?.language || null,
    components,
  };
}

function getTemplateTextComponent(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  type: 'HEADER' | 'BODY' | 'FOOTER',
) {
  if (!snapshot) {
    return null;
  }

  return snapshot.components.find((component) => component.type === type) || null;
}

function getTemplateButtons(snapshot: ReturnType<typeof normalizeTemplateSnapshot>) {
  if (!snapshot) {
    return [];
  }

  const buttonsComponent = snapshot.components.find((component) => component.type === 'BUTTONS');
  const buttons = buttonsComponent?.buttons;

  return Array.isArray(buttons)
    ? buttons.filter((button): button is Record<string, unknown> => Boolean(button) && typeof button === 'object' && !Array.isArray(button))
    : [];
}

function getTemplatePreviewText(snapshot: ReturnType<typeof normalizeTemplateSnapshot>, fallbackName?: string | null) {
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';

  if (bodyText) {
    return bodyText.replace(/\s+/g, ' ').slice(0, 140);
  }

  if (headerText) {
    return headerText.replace(/\s+/g, ' ').slice(0, 140);
  }

  return fallbackName ? `Template: ${fallbackName}` : 'Template message';
}

function resolveTemplateSnapshot(message: ConversationMessage, templates: MetaTemplate[]) {
  const fromMessage = normalizeTemplateSnapshot(
    message.raw.template_snapshot as Record<string, unknown> | undefined,
    { name: message.templateName, language: null },
  );

  if (fromMessage) {
    return fromMessage;
  }

  if (!message.templateName) {
    return null;
  }

  const template = templates.find((entry) => entry.name === message.templateName) || null;

  if (!template) {
    return null;
  }

  return normalizeTemplateSnapshot(template.raw, {
    name: template.name,
    language: template.language,
  });
}

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
}

function clampMediaPreviewZoom(value: number) {
  return Math.min(MEDIA_PREVIEW_MAX_ZOOM, Math.max(MEDIA_PREVIEW_MIN_ZOOM, value));
}

function getContactCardLines(contact: Record<string, unknown>) {
  const lines: string[] = [];
  const phones = Array.isArray(contact.phones)
    ? contact.phones.filter(
        (phone): phone is { phone?: string; wa_id?: string; type?: string } =>
          Boolean(phone) && typeof phone === 'object' && !Array.isArray(phone),
      )
    : [];
  const emails = Array.isArray(contact.emails)
    ? contact.emails.filter(
        (email): email is { email?: string } =>
          Boolean(email) && typeof email === 'object' && !Array.isArray(email),
      )
    : [];
  const organization =
    contact.org && typeof contact.org === 'object' && !Array.isArray(contact.org)
      ? (contact.org as { company?: string })
      : null;

  const primaryPhone = phones[0]?.phone || phones[0]?.wa_id || null;
  const secondaryPhone =
    phones[0]?.phone && phones[0]?.wa_id && phones[0]?.phone !== phones[0]?.wa_id ? phones[0].wa_id : null;
  const email = emails[0]?.email || null;

  if (primaryPhone) {
    lines.push(primaryPhone);
  }

  if (secondaryPhone) {
    lines.push(`WhatsApp: ${secondaryPhone}`);
  }

  if (email) {
    lines.push(email);
  }

  if (organization?.company) {
    lines.push(organization.company);
  }

  return lines.length > 0 ? lines : ['Contact details shared'];
}

function getVisibleMessageBody(message: ConversationMessage, media: ReturnType<typeof getMediaPayload>) {
  if (message.messageType === 'call_summary') {
    return null;
  }

  const body = typeof message.body === 'string' ? message.body.trim() : '';

  if (!body) {
    return null;
  }

  if (!media) {
    return body;
  }

  if (media.caption) {
    return body;
  }

  const normalizedBody = body.toLowerCase();

  if (
    normalizedBody === 'image attachment' ||
    normalizedBody === 'video attachment' ||
    normalizedBody === 'audio attachment' ||
    normalizedBody === 'document attachment' ||
    normalizedBody === 'sticker'
  ) {
    return null;
  }

  if (media.mediaType === 'document' && media.fileName && body === media.fileName) {
    return null;
  }

  return body;
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatCallDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getCallSummaryStateLabel(value: unknown) {
  switch (value) {
    case 'incoming':
      return 'Incoming';
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'ongoing':
      return 'Ongoing';
    case 'ending':
      return 'Ending';
    case 'ended':
      return 'Ended';
    case 'rejected':
      return 'Rejected';
    case 'missed':
      return 'Missed';
    case 'failed':
      return 'Failed';
    default:
      return 'Call';
  }
}

function getCallSummaryPayload(message: ConversationMessage) {
  if (message.messageType !== 'call_summary') {
    return null;
  }

  const payload =
    message.raw.call_summary &&
    typeof message.raw.call_summary === 'object' &&
    !Array.isArray(message.raw.call_summary)
      ? (message.raw.call_summary as Record<string, unknown>)
      : null;

  if (!payload) {
    return null;
  }

  return {
    callId: typeof payload.call_id === 'string' ? payload.call_id : null,
    direction: payload.direction === 'incoming' ? 'incoming' : 'outgoing',
    state: getCallSummaryStateLabel(payload.state),
    startedAt: typeof payload.started_at === 'string' ? payload.started_at : null,
    durationSeconds:
      typeof payload.duration_seconds === 'number'
        ? payload.duration_seconds
        : Number(payload.duration_seconds || 0),
    phone:
      typeof payload.phone === 'string'
        ? payload.phone
        : message.recipientWaId || message.senderWaId || null,
  };
}

function CallSummaryCard({
  message,
  isOutbound,
  isPending,
}: {
  message: ConversationMessage;
  isOutbound: boolean;
  isPending: boolean;
}) {
  const summary = getCallSummaryPayload(message);

  if (!summary) {
    return null;
  }

  const directionMeta =
    summary.direction === 'incoming'
      ? {
          label: 'Incoming',
          icon: summary.state === 'Missed' ? PhoneMissed : PhoneIncoming,
          accent: isOutbound ? 'bg-white/16 text-white' : 'bg-emerald-50 text-emerald-600',
        }
      : {
          label: 'Outgoing',
          icon: PhoneOutgoing,
          accent: isOutbound ? 'bg-white/16 text-white' : 'bg-violet-50 text-violet-600',
        };
  const StateIcon = directionMeta.icon;
  const stateTone =
    summary.state === 'Missed' || summary.state === 'Failed' || summary.state === 'Rejected'
      ? isOutbound
        ? 'bg-white/12 text-white'
        : 'bg-rose-50 text-rose-700'
      : isOutbound
        ? 'bg-white/12 text-white'
        : 'bg-emerald-50 text-emerald-700';
  const cardSurfaceClassName = isOutbound
    ? isPending
      ? 'border-white/20 bg-[#dce8ff] text-[#29446e]'
      : 'border-white/10 bg-white/10 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-900';
  const cardBodyTextClassName = isOutbound ? (isPending ? 'text-[#4d6690]' : 'text-white/72') : 'text-slate-500';
  const detailClassName = isOutbound
    ? isPending
      ? 'border-[#bfd2ff] bg-[#edf3ff] text-[#29446e]'
      : 'border-white/10 bg-white/10 text-white'
    : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`w-[min(100%,360px)] rounded-[24px] border p-4 ${cardSurfaceClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${directionMeta.accent}`}>
            <StateIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">WhatsApp Call</p>
            <p className="mt-1 text-[15px] font-semibold">{summary.direction === 'incoming' ? 'Incoming call' : 'Outgoing call'}</p>
          </div>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${stateTone}`}>{summary.state}</span>
      </div>

      {summary.phone ? <p className={`mt-4 text-sm ${cardBodyTextClassName}`}>{summary.phone}</p> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className={`rounded-2xl border px-3 py-3 ${detailClassName}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">Direction</p>
          <p className="mt-1.5 text-sm font-semibold">{directionMeta.label}</p>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${detailClassName}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">Call Time</p>
          <p className="mt-1.5 text-sm font-semibold">{formatCallDateTime(summary.startedAt)}</p>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${detailClassName}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">Duration</p>
          <p className="mt-1.5 text-sm font-semibold">{formatCallDuration(summary.durationSeconds)}</p>
        </div>
      </div>
    </div>
  );
}

function createClientTempId() {
  return globalThis.crypto?.randomUUID?.() || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createOptimisticThread(thread: ConversationThread, previewText: string, createdAt: string): ConversationThread {
  return {
    ...thread,
    status: 'In progress',
    lastMessageText: previewText,
    lastMessageAt: createdAt,
    unreadCount: 0,
  };
}

function createOptimisticMessage({
  clientTempId,
  threadId,
  messageType,
  body,
  currentUserName,
  senderWaId,
  recipientWaId,
  createdAt,
  raw,
  templateName,
}: {
  clientTempId: string;
  threadId: string;
  messageType: string;
  body: string | null;
  currentUserName: string;
  senderWaId: string | null;
  recipientWaId: string;
  createdAt: string;
  raw?: Record<string, unknown>;
  templateName?: string | null;
}): ConversationMessage {
  return {
    id: clientTempId,
    threadId,
    waMessageId: null,
    direction: 'outbound',
    messageType,
    body,
    senderName: currentUserName,
    senderWaId,
    recipientWaId,
    templateName: templateName || null,
    status: 'sending',
    createdAt,
    raw: {
      client_temp_id: clientTempId,
      ...(raw || {}),
    },
  };
}

function areMessagesEquivalent(left: ConversationMessage[], right: ConversationMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const next = right[index];

    return (
      message.id === next.id &&
      message.status === next.status &&
      message.body === next.body &&
      message.createdAt === next.createdAt
    );
  });
}

function areThreadsEquivalent(left: ConversationThread, right: ConversationThread) {
  return (
    left.id === right.id &&
    left.contactWaId === right.contactWaId &&
    left.contactName === right.contactName &&
    left.displayPhone === right.displayPhone &&
    left.email === right.email &&
    left.source === right.source &&
    left.remark === right.remark &&
    left.avatarUrl === right.avatarUrl &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.ownerName === right.ownerName &&
    left.lastMessageText === right.lastMessageText &&
    left.lastMessageAt === right.lastMessageAt &&
    left.unreadCount === right.unreadCount &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.labels.length === right.labels.length &&
    left.labels.every((label, index) => label === right.labels[index])
  );
}

function RichText({ value }: { value: string }) {
  const lines = value.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        );
      }

      if (part.startsWith('_') && part.endsWith('_')) {
        return (
          <em key={`${part}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function MessageMediaAttachment({ message }: { message: ConversationMessage }) {
  const media = useMemo(() => getMediaPayload(message.raw), [message.raw]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(MEDIA_PREVIEW_MIN_ZOOM);

  useEffect(() => {
    if (!media || !['image', 'video', 'audio', 'sticker'].includes(media.mediaType)) {
      return;
    }

    let cancelled = false;
    let currentUrl: string | null = null;

    const loadMedia = async () => {
      try {
        setIsLoading(true);
        setDownloadError(null);
        const response = await appApi.downloadMedia(media.mediaId, media.fileName || undefined);
        currentUrl = URL.createObjectURL(response.blob);

        if (!cancelled) {
          setBlobUrl(currentUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setDownloadError(error instanceof Error ? error.message : 'Failed to load media.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMedia();

    return () => {
      cancelled = true;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [media]);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
        setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewOpen]);

  if (!media) {
    return null;
  }

  const canOpenPreview = Boolean(blobUrl) && ['image', 'video', 'sticker'].includes(media.mediaType);

  const openPreview = () => {
    if (!canOpenPreview) {
      return;
    }

    setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
    setIsPreviewOpen(true);
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
  };

  const handleDownload = async () => {
    try {
      setDownloadError(null);
      const response = await appApi.downloadMedia(media.mediaId, media.fileName || undefined);
      const url = URL.createObjectURL(response.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.filename || media.fileName || `${media.mediaType}-attachment`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Failed to download media.');
    }
  };

  return (
    <>
      <div className="space-y-2">
        {media.mediaType === 'image' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
            >
              <img src={blobUrl} alt={media.fileName || 'Image attachment'} className="max-h-72 rounded-2xl object-cover" />
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading image...' : 'Image unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'sticker' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="inline-flex max-w-[220px] overflow-hidden rounded-2xl bg-white/80 p-2 focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
            >
              <img src={blobUrl} alt={media.fileName || 'Sticker'} className="max-h-40 w-full object-contain" />
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading sticker...' : 'Sticker unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'video' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
              aria-label="Open video preview"
            >
              <video className="max-h-72 rounded-2xl" muted playsInline preload="metadata">
                <source src={blobUrl} type={media.mimeType || undefined} />
              </video>
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading video...' : 'Video unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'audio' ? (
          blobUrl ? (
            <audio controls className="w-full">
              <source src={blobUrl} type={media.mimeType || undefined} />
            </audio>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-4 text-sm text-gray-500">{isLoading ? 'Loading audio...' : 'Audio unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'document' ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-gray-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{media.fileName || `${media.mediaType} attachment`}</p>
                <p className="text-xs text-gray-500">{media.mimeType || media.mediaType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="rounded-lg bg-gray-100 p-2 text-gray-700 hover:bg-gray-200"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {['image', 'video', 'audio', 'sticker'].includes(media.mediaType) ? (
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        ) : null}

        {downloadError ? <p className="text-xs text-red-600">{downloadError}</p> : null}
      </div>

      <AnimatePresence>
        {isPreviewOpen && blobUrl && canOpenPreview ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-8">
            <button type="button" onClick={closePreview} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" aria-label="Close media preview" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{media.fileName || `${media.mediaType} preview`}</p>
                  <p className="text-xs text-slate-400">{media.mimeType || media.mediaType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((currentZoom) => clampMediaPreviewZoom(currentZoom - MEDIA_PREVIEW_ZOOM_STEP))}
                    disabled={previewZoom <= MEDIA_PREVIEW_MIN_ZOOM}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((currentZoom) => clampMediaPreviewZoom(currentZoom + MEDIA_PREVIEW_ZOOM_STEP))}
                    disabled={previewZoom >= MEDIA_PREVIEW_MAX_ZOOM}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closePreview}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="scrollbar-hide flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/60 px-4 py-6">
                <div className="flex min-h-full min-w-full items-center justify-center">
                  {media.mediaType === 'video' ? (
                    <video
                      controls
                      autoPlay
                      className="max-h-full max-w-full rounded-[1.5rem] transition-transform duration-200"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center' }}
                    >
                      <source src={blobUrl} type={media.mimeType || undefined} />
                    </video>
                  ) : (
                    <img
                      src={blobUrl}
                      alt={media.fileName || `${media.mediaType} preview`}
                      className="max-h-full max-w-full rounded-[1.5rem] object-contain transition-transform duration-200"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center' }}
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-300">
                <span>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function MessageDetails({ message }: { message: ConversationMessage }) {
  const type = message.messageType;

  if (type === 'location') {
    const location = message.raw.location as { latitude?: number; longitude?: number; name?: string; address?: string } | undefined;
    return (
      <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">
        <p className="font-medium">{location?.name || 'Shared location'}</p>
        <p>{location?.address || `${location?.latitude || ''}, ${location?.longitude || ''}`}</p>
      </div>
    );
  }

  if (type === 'contacts') {
    const contacts =
      (message.raw.contacts as Array<Record<string, unknown>> | undefined)?.filter(
        (contact): contact is Record<string, unknown> => Boolean(contact) && typeof contact === 'object' && !Array.isArray(contact),
      ) || [];
    return (
      <div className="space-y-2">
        {contacts.map((contact, index) => {
          const contactName = ((contact.name as { formatted_name?: string } | undefined)?.formatted_name || 'Shared contact') as string;

          return (
            <div key={`${contactName}-${index}`} className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">
              <p className="font-medium">{contactName}</p>
              {getContactCardLines(contact).map((line, lineIndex) => (
                <p key={`${line}-${lineIndex}`}>{line}</p>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'button') {
    const button = message.raw.button as { text?: string } | undefined;
    return <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">Reply: {button?.text || message.body}</div>;
  }

  if (type === 'interactive') {
    const interactive = message.raw.interactive as
      | { button_reply?: { title?: string }; list_reply?: { title?: string; description?: string } }
      | undefined;
    const title =
      interactive?.button_reply?.title ||
      interactive?.list_reply?.title ||
      interactive?.list_reply?.description ||
      message.body;
    return <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">Interactive reply: {title}</div>;
  }

  return null;
}

function TemplateMessageCard({
  snapshot,
  isOutbound,
  isPending,
}: {
  snapshot: NonNullable<ReturnType<typeof normalizeTemplateSnapshot>>;
  isOutbound: boolean;
  isPending: boolean;
}) {
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const footerComponent = getTemplateTextComponent(snapshot, 'FOOTER');
  const buttons = getTemplateButtons(snapshot);
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text : null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text : null;
  const footerText = typeof footerComponent?.text === 'string' ? footerComponent.text : null;
  const mediaHeaderLabel =
    headerComponent && typeof headerComponent.format === 'string' && headerComponent.format !== 'TEXT'
      ? `${headerComponent.format.toLowerCase()} header`
      : null;

  return (
    <div className="w-[min(100%,340px)]">
      {mediaHeaderLabel ? (
        <div
          className={`mb-3 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isOutbound
              ? isPending
                ? 'bg-[#bfd2ff] text-[#4d669f]'
                : 'bg-white/12 text-white/75'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {mediaHeaderLabel}
        </div>
      ) : null}

      <div className="space-y-4">
        {headerText ? (
          <div
            className={`text-[15px] font-semibold leading-6 ${
              isOutbound ? (isPending ? 'text-[#274574]' : 'text-white') : 'text-slate-900'
            }`}
          >
            <RichText value={headerText} />
          </div>
        ) : null}

        {bodyText ? (
          <div
            className={`text-[15px] leading-7 ${
              isOutbound ? (isPending ? 'text-[#3c5b8c]' : 'text-white/95') : 'text-slate-800'
            }`}
          >
            <RichText value={bodyText} />
          </div>
        ) : null}

        {footerText ? (
          <div
            className={`text-[13px] italic leading-6 ${
              isOutbound ? (isPending ? 'text-[#6e87b7]' : 'text-white/60') : 'text-slate-400'
            }`}
          >
            <RichText value={footerText} />
          </div>
        ) : null}
      </div>

      {buttons.length > 0 ? (
        <div
          className={`mt-4 border-t pt-3 ${
            isOutbound ? (isPending ? 'border-[#b8ceff]' : 'border-white/15') : 'border-slate-200/90'
          }`}
        >
          <div className="space-y-1">
            {buttons.map((button, index) => {
              const text = typeof button.text === 'string' ? button.text : `Action ${index + 1}`;
              const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY';

              if (type === 'URL') {
                const href = typeof button.url === 'string' ? button.url : '#';

                return (
                  <a
                    key={`${text}-${index}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[14px] font-medium transition-colors ${
                      isOutbound
                        ? isPending
                          ? 'text-[#355ea1] hover:bg-[#d3e1ff]'
                          : 'text-white/90 hover:bg-white/10'
                        : 'text-[#2b7de9] hover:bg-slate-100/80'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    <span>{text}</span>
                  </a>
                );
              }

              return (
                <div
                  key={`${text}-${index}`}
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[14px] font-medium ${
                    isOutbound ? (isPending ? 'text-[#355ea1]' : 'text-white/90') : 'text-[#2b7de9]'
                  }`}
                >
                  <CornerDownLeft className="h-4 w-4" />
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  currentUserName,
  contactName,
  templates,
}: {
  message: ConversationMessage;
  currentUserName: string;
  contactName: string;
  templates: MetaTemplate[];
}) {
  const isOutbound = message.direction === 'outbound';
  const isPending = isOutbound && message.status === 'sending';
  const media = getMediaPayload(message.raw);
  const visibleMessageBody = getVisibleMessageBody(message, media);
  const templateSnapshot = message.messageType === 'template' ? resolveTemplateSnapshot(message, templates) : null;
  const callSummary = getCallSummaryPayload(message);
  const usesTemplateCard = Boolean(templateSnapshot);
  const usesCallSummaryCard = Boolean(callSummary);
  const fallbackCallSummaryText = message.messageType === 'call_summary' && !callSummary ? message.body : null;

  return (
    <div className={`flex gap-3 max-w-[85%] ${isOutbound ? 'ml-auto flex-row-reverse' : ''}`}>
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
        {(isOutbound ? currentUserName : contactName).charAt(0).toUpperCase()}
      </div>
      <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
        <div
          className={`space-y-3 px-4 py-3 rounded-2xl shadow-sm ${
            isOutbound
              ? isPending
                ? 'rounded-tr-none border border-[#bfd2ff] bg-[#e8f0ff] text-[#355385]'
                : 'bg-[#2563eb] text-white rounded-tr-none'
              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
          }`}
        >
          {usesTemplateCard && templateSnapshot ? (
            <TemplateMessageCard snapshot={templateSnapshot} isOutbound={isOutbound} isPending={isPending} />
          ) : null}
          {!usesTemplateCard && usesCallSummaryCard ? (
            <CallSummaryCard message={message} isOutbound={isOutbound} isPending={isPending} />
          ) : null}
          {!usesTemplateCard && !usesCallSummaryCard && media ? <MessageMediaAttachment message={message} /> : null}
          {!usesTemplateCard && !usesCallSummaryCard && visibleMessageBody ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              <RichText value={visibleMessageBody} />
            </div>
          ) : null}
          {!usesTemplateCard && !usesCallSummaryCard && fallbackCallSummaryText ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              <RichText value={fallbackCallSummaryText} />
            </div>
          ) : null}
          {!usesTemplateCard && !usesCallSummaryCard && !message.body && !media ? <div className="text-sm">{message.messageType}</div> : null}
          {!usesTemplateCard && !usesCallSummaryCard ? <MessageDetails message={message} /> : null}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {isPending ? 'Sending…' : new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export default function Inbox() {
  const { bootstrap, setBootstrap } = useAppData();
  const { startOutgoingCall } = useCallManager();
  const [threadFilter, setThreadFilter] = useState<InboxThreadFilter>('all');
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );
  const [mobileView, setMobileView] = useState<'threads' | 'chat'>('threads');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<InboxChannelFilter>('all');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatOption, setNewChatOption] = useState<'existing' | 'manual'>('existing');
  const [selectedContact, setSelectedContact] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [composerTemplateId, setComposerTemplateId] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [isComposerActionsOpen, setIsComposerActionsOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isTemplateTrayOpen, setIsTemplateTrayOpen] = useState(false);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<WhatsAppBlockedUser[]>([]);
  const [isBlockedUsersLoading, setIsBlockedUsersLoading] = useState(false);
  const [blockedUsersError, setBlockedUsersError] = useState<string | null>(null);
  const [blockActionWaId, setBlockActionWaId] = useState<string | null>(null);
  const [starredThreadIds, setStarredThreadIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STARRED_THREADS_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const deferredQuery = useDeferredValue(searchQuery);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const templateTrayRef = useRef<HTMLDivElement | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const conversations = bootstrap?.conversations || [];
  const templates = bootstrap?.templates || [];
  const currentUserName = bootstrap?.profile?.fullName || 'User';
  const currentUserWaId = bootstrap?.channel?.phoneNumberId || null;
  const starredThreadIdSet = useMemo(() => new Set(starredThreadIds), [starredThreadIds]);
  const activeThread = conversations.find((thread) => thread.id === selectedThreadId) || null;
  const activeThreadIsStarred = activeThread ? starredThreadIdSet.has(activeThread.id) : false;
  const canUseWhatsAppActions = channelFilter === 'all' || channelFilter === 'whatsapp';
  const activeThreadWaId = getThreadWaId(activeThread);
  const blockedUserWaIdSet = useMemo(
    () => new Set(blockedUsers.map((user) => user.waId)),
    [blockedUsers],
  );
  const activeThreadIsBlocked = Boolean(activeThreadWaId && blockedUserWaIdSet.has(activeThreadWaId));

  useEscapeKey(
    Boolean(isNewChatModalOpen || (isMobileViewport && isContactPanelOpen) || isEmojiOpen || isComposerActionsOpen),
    () => {
      if (isNewChatModalOpen) {
        setIsNewChatModalOpen(false);
        return;
      }

      if (isEmojiOpen) {
        setIsEmojiOpen(false);
        return;
      }

      if (isComposerActionsOpen) {
        setIsComposerActionsOpen(false);
        return;
      }

      if (isMobileViewport && isContactPanelOpen) {
        setIsContactPanelOpen(false);
      }
    },
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewportMode = () => {
      const nextIsMobileViewport = window.innerWidth < 1024;
      setIsMobileViewport(nextIsMobileViewport);

      if (nextIsMobileViewport) {
        setIsContactPanelOpen(false);
      }
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    return () => {
      window.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    if (!bootstrap?.channel) {
      setBlockedUsers([]);
      setBlockedUsersError(null);
      setIsBlockedUsersLoading(false);
      return;
    }

    let cancelled = false;

    const loadBlockedUsers = async () => {
      try {
        setIsBlockedUsersLoading(true);
        setBlockedUsersError(null);
        const response = await appApi.getBlockedUsers();

        if (!cancelled) {
          setBlockedUsers(response.data);
        }
      } catch (nextError) {
        if (!cancelled) {
          setBlockedUsersError(
            nextError instanceof Error ? nextError.message : 'Failed to load blocked WhatsApp users.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsBlockedUsersLoading(false);
        }
      }
    };

    void loadBlockedUsers();

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.channel]);

  const scrollMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    const viewport = messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });
  };

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    shouldStickToBottomRef.current = isNearBottom(viewport);
  };

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });
  }, [selectedThreadId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STARRED_THREADS_STORAGE_KEY, JSON.stringify(starredThreadIds));
  }, [starredThreadIds]);

  useEffect(() => {
    if (!isTemplateTrayOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!templateTrayRef.current?.contains(event.target as Node)) {
        setIsTemplateTrayOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTemplateTrayOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTemplateTrayOpen]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }

    let isCancelled = false;

    const loadMessages = async () => {
      try {
        setIsBusy('messages');
        const response = await appApi.getMessages(selectedThreadId, { markRead: true });

        if (!isCancelled) {
          setMessages((current) => {
            const mergedMessages = mergeConversationMessages(current, response.messages);
            return areMessagesEquivalent(current, mergedMessages) ? current : mergedMessages;
          });
          setBootstrap((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              conversations: upsertConversationThread(current.conversations, response.thread),
            };
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setError(error instanceof Error ? error.message : 'Failed to load conversation messages.');
        }
      } finally {
        if (!isCancelled) {
          setIsBusy(null);
        }
      }
    };

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToMessages = async () => {
      const session = await getCachedSession();

      if (isCancelled || !session) {
        return;
      }

      channel = supabase
        .channel(`conversation-messages:${selectedThreadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_messages',
            filter: `thread_id=eq.${selectedThreadId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deletedId =
                payload.old && typeof payload.old === 'object' && 'id' in payload.old
                  ? String(payload.old.id)
                  : null;

              if (deletedId) {
                setMessages((current) => removeConversationMessage(current, deletedId));
              }

              return;
            }

            if (!payload.new || Array.isArray(payload.new)) {
              return;
            }

            const message = mapConversationMessageRecord(payload.new as Record<string, unknown>);
            setMessages((current) => upsertConversationMessage(current, message));

            setBootstrap((current) => {
              if (!current) {
                return current;
              }

              const thread = current.conversations.find((item) => item.id === selectedThreadId);

              if (!thread) {
                return current;
              }

              return {
                ...current,
                conversations: upsertConversationThread(current.conversations, {
                  ...thread,
                  lastMessageText: message.body || thread.lastMessageText,
                  lastMessageAt: message.createdAt,
                  unreadCount: 0,
                }),
              };
            });
          },
        )
        .subscribe();
    };

    void subscribeToMessages();

    return () => {
      isCancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    let isCancelled = false;
    let isSyncing = false;

    const syncActiveThread = async () => {
      if (isSyncing) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      isSyncing = true;

      try {
        const response = await appApi.getMessages(selectedThreadId, { markRead: false });

        if (isCancelled) {
          return;
        }

        setMessages((current) => {
          const mergedMessages = mergeConversationMessages(current, response.messages);
          return areMessagesEquivalent(current, mergedMessages) ? current : mergedMessages;
        });
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          const existingThread = current.conversations.find((thread) => thread.id === response.thread.id);

          if (existingThread && areThreadsEquivalent(existingThread, response.thread)) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
      } catch {
        return;
      } finally {
        isSyncing = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void syncActiveThread();
    }, ACTIVE_THREAD_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || !shouldStickToBottomRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });
  }, [messages, selectedThreadId]);

  useEffect(() => {
    const content = messagesContentRef.current;

    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!shouldStickToBottomRef.current) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollMessagesToBottom();
      });
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [selectedThreadId]);

  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [attachment]);

  const filteredThreads = useMemo(() => {
    return conversations.filter((thread) => {
      const threadChannel = getThreadChannel();

      if (channelFilter !== 'all' && threadChannel !== channelFilter) {
        return false;
      }

      if (threadFilter === 'unread' && thread.unreadCount === 0) {
        return false;
      }

      if (threadFilter === 'starred' && !starredThreadIdSet.has(thread.id)) {
        return false;
      }

      if (!deferredQuery.trim()) {
        return true;
      }

      const haystack = `${thread.contactName || ''} ${thread.lastMessageText || ''} ${thread.displayPhone || ''}`.toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    });
  }, [channelFilter, conversations, deferredQuery, starredThreadIdSet, threadFilter]);

  useEffect(() => {
    if (filteredThreads.length === 0) {
      if (selectedThreadId !== null) {
        setSelectedThreadId(null);
      }
      setMobileView('threads');
      return;
    }

    if (!selectedThreadId || !filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

  const openThread = (threadId: string) => {
    setSelectedThreadId(threadId);

    if (isMobileViewport) {
      setMobileView('chat');
    }
  };

  const returnToThreadList = () => {
    setMobileView('threads');
    setIsContactPanelOpen(false);
  };

  const toggleStarThread = (threadId: string) => {
    setStarredThreadIds((current) =>
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId],
    );
  };

  const clearAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleComposerActions = () => {
    setIsComposerActionsOpen((current) => {
      const next = !current;

      if (!next) {
        setIsEmojiOpen(false);
        setIsTemplateTrayOpen(false);
      }

      return next;
    });
  };

  const handleTextFormatting = (wrapper: '*' | '_') => {
    const element = textareaRef.current;

    if (!element) {
      setMessageInput((current) => `${current}${wrapper}${wrapper}`);
      return;
    }

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const selected = messageInput.slice(start, end);
    const nextValue = `${messageInput.slice(0, start)}${wrapper}${selected}${wrapper}${messageInput.slice(end)}`;
    setMessageInput(nextValue);

    window.requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + 1, end + 1);
    });
  };

  const handleEmojiInsert = (emoji: string) => {
    setMessageInput((current) => `${current}${emoji}`);
    setIsEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const handleAttachmentPicked = async (file: File) => {
    try {
      setError(null);
      setIsBusy('upload');
      const previewUrl =
        file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
          ? URL.createObjectURL(file)
          : null;

      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      const uploaded = await appApi.uploadMedia(file);
      setAttachment({
        mediaId: uploaded.mediaId,
        mediaType: uploaded.mediaType,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        previewUrl,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload attachment.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleStartCallFromInbox = async () => {
    if (!bootstrap?.channel) {
      setError('Connect your WhatsApp channel before starting a call.');
      return;
    }

    if (!activeThread) {
      return;
    }

    const targetWaId = activeThread.contactWaId || activeThread.displayPhone;

    if (!targetWaId) {
      setError('No WhatsApp number is available for this contact.');
      return;
    }

    if (blockedUserWaIdSet.has(targetWaId)) {
      setError('This WhatsApp user is blocked. Unblock the user before placing a call.');
      return;
    }

    try {
      setIsBusy('call');
      setError(null);

      const permissionResponse = await appApi.getCallPermissions(targetWaId);
      const permissionStatus = normalizeCallPermissionStatus(permissionResponse.permission.status);

      if (!canStartCallFromPermissionStatus(permissionStatus)) {
        setError(
          permissionStatus === 'no_permission'
            ? 'This contact cannot be called right now.'
            : `This contact cannot be called right now. Current permission status: ${permissionStatus || 'unavailable'}.`,
        );
        return;
      }

      await startOutgoingCall(targetWaId, `inbox:${activeThread.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start the WhatsApp call.');
    } finally {
      setIsBusy((current) => (current === 'call' ? null : current));
    }
  };

  const handleSend = async () => {
    if (!activeThread) {
      return;
    }

    if (activeThreadIsBlocked) {
      setError('This WhatsApp user is blocked. Unblock the user before sending a message.');
      return;
    }

    const to = activeThread.displayPhone || activeThread.contactWaId;
    const trimmedBody = messageInput.trim();
    const pendingAttachment = attachment;

    if (!pendingAttachment && !trimmedBody) {
      return;
    }

    const createdAt = new Date().toISOString();
    const clientTempId = createClientTempId();
    const previewText = pendingAttachment
      ? trimmedBody || pendingAttachment.fileName || `${pendingAttachment.mediaType} attachment`
      : trimmedBody;
    const optimisticThread = createOptimisticThread(activeThread, previewText, createdAt);
    const optimisticMessage = createOptimisticMessage({
      clientTempId,
      threadId: activeThread.id,
      messageType: pendingAttachment?.mediaType || 'text',
      body: previewText || null,
      currentUserName,
      senderWaId: currentUserWaId,
      recipientWaId: to,
      createdAt,
      templateName: null,
      raw: pendingAttachment
        ? {
            type: pendingAttachment.mediaType,
            [pendingAttachment.mediaType]: {
              id: pendingAttachment.mediaId,
              mime_type: pendingAttachment.mimeType,
              filename: pendingAttachment.fileName,
              caption: trimmedBody || null,
            },
          }
        : {},
    });

    try {
      setIsBusy('send');
      setError(null);
      setMessages((current) => upsertConversationMessage(current, optimisticMessage));
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, optimisticThread),
        };
      });

      if (pendingAttachment) {
        const response = await appApi.sendMediaMessage(activeThread.id, {
          to,
          mediaId: pendingAttachment.mediaId,
          mediaType: pendingAttachment.mediaType,
          caption: trimmedBody || undefined,
          fileName: pendingAttachment.fileName,
          mimeType: pendingAttachment.mimeType,
          clientTempId,
        });
        if (selectedThreadIdRef.current === activeThread.id) {
          setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
        }
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
        setMessageInput('');
        clearAttachment();
      } else {
        setMessageInput('');

        const response = await appApi.sendTextMessage(activeThread.id, {
          body: trimmedBody,
          to,
          clientTempId,
        });
        if (selectedThreadIdRef.current === activeThread.id) {
          setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
        }
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
      }
    } catch (error) {
      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => removeConversationMessage(current, optimisticMessage.id));
      }

      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, activeThread),
        };
      });

      if (!pendingAttachment) {
        setMessageInput(trimmedBody);
      }

      setError(error instanceof Error ? error.message : 'Failed to send the message.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleToggleActiveThreadBlock = async (shouldBlock: boolean) => {
    if (!activeThreadWaId) {
      return;
    }

    try {
      setBlockActionWaId(activeThreadWaId);
      setBlockedUsersError(null);
      setError(null);

      if (shouldBlock) {
        await appApi.blockUsers([activeThreadWaId]);
        setBlockedUsers((current) =>
          current.some((entry) => entry.waId === activeThreadWaId)
            ? current
            : [...current, { waId: activeThreadWaId, messagingProduct: 'whatsapp' }],
        );
        return;
      }

      await appApi.unblockUsers([activeThreadWaId]);
      setBlockedUsers((current) => current.filter((entry) => entry.waId !== activeThreadWaId));
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : 'Failed to update the WhatsApp block list.';
      setBlockedUsersError(message);
      setError(message);
    } finally {
      setBlockActionWaId(null);
    }
  };

  const handleSendTemplateInConversation = async () => {
    const selectedTemplate = templates.find((template) => template.id === composerTemplateId);

    if (!activeThread || !selectedTemplate) {
      return;
    }

    const to = activeThread.displayPhone || activeThread.contactWaId;
    const createdAt = new Date().toISOString();
    const clientTempId = createClientTempId();
    const templateSnapshot = normalizeTemplateSnapshot(selectedTemplate.raw, {
      name: selectedTemplate.name,
      language: selectedTemplate.language,
    });
    const previewText = getTemplatePreviewText(templateSnapshot, selectedTemplate.name);
    const optimisticMessage = createOptimisticMessage({
      clientTempId,
      threadId: activeThread.id,
      messageType: 'template',
      body: previewText,
      currentUserName,
      senderWaId: currentUserWaId,
      recipientWaId: to,
      createdAt,
      templateName: selectedTemplate.name,
      raw: templateSnapshot ? { template_snapshot: templateSnapshot } : {},
    });
    const optimisticThread = createOptimisticThread(activeThread, previewText, createdAt);

    try {
      setIsBusy('template');
      setError(null);
      setMessages((current) => upsertConversationMessage(current, optimisticMessage));
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, optimisticThread),
        };
      });

      const response = await appApi.sendTemplateMessage({
        to,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        clientTempId,
      });

      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
      }
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, response.thread),
        };
      });
      setComposerTemplateId('');
      setIsTemplateTrayOpen(false);
    } catch (error) {
      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => removeConversationMessage(current, optimisticMessage.id));
      }

      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, activeThread),
        };
      });
      setError(error instanceof Error ? error.message : 'Failed to send template.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleStartConversation = async () => {
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    const destination = newChatOption === 'existing' ? selectedContact : manualNumber.trim();

    if (!selectedTemplate || !destination) {
      return;
    }

    try {
      setIsBusy('start');
      setError(null);
      const response = await appApi.startConversation({
        to: destination,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        contactName: newChatOption === 'manual' ? manualName.trim() : undefined,
        clientTempId: createClientTempId(),
      });
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, response.thread),
        };
      });
      setMessages([response.message]);
      setIsNewChatModalOpen(false);
      setSelectedContact('');
      setManualName('');
      setManualNumber('');
      setSelectedTemplateId('');
      openThread(response.threadId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start the new conversation.');
    } finally {
      setIsBusy(null);
    }
  };

  const activeContactName = activeThread?.contactName || activeThread?.displayPhone || 'Contact';

  const renderAttachmentChip = (): ReactNode => {
    if (!attachment) {
      return null;
    }

    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#d6dce7] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p>
          <p className="text-xs text-slate-500">
            {attachment.mediaType} • {attachment.mimeType}
          </p>
        </div>
        <button
          onClick={clearAttachment}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const composerIconButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d6dce7] bg-white text-slate-600 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';
  const composerChipButtonClass =
    'inline-flex h-10 items-center justify-center rounded-2xl border border-[#d6dce7] bg-white px-4 text-sm font-semibold text-slate-600 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:flex-row">
      <div
        className={`${
          isMobileViewport && mobileView !== 'threads' ? 'hidden' : 'flex'
        } w-full shrink-0 flex-col border-b border-gray-200 bg-white lg:w-80 lg:border-b-0 lg:border-r`}
      >
        <div className="p-4 border-b border-gray-100">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">Inbox</h2>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                disabled={!canUseWhatsAppActions}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition-all hover:bg-[#4a35e8] sm:w-auto"
              >
                <Plus className="w-4 h-4" /> New chat
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] text-sm"
            />
          </div>
        </div>

        <div className="space-y-3 border-b border-gray-100 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {CHANNEL_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setChannelFilter(option.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  channelFilter === option.id
                    ? 'bg-[#5b45ff] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {THREAD_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setThreadFilter(option.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  threadFilter === option.id
                    ? 'bg-blue-50 text-[#2563eb]'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {filteredThreads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => openThread(thread.id)}
              className={`p-4 border-b border-gray-50 cursor-pointer transition-colors flex gap-3 ${
                selectedThreadId === thread.id ? 'bg-blue-50/50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center font-semibold">
                {(thread.contactName || thread.displayPhone || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">{thread.contactName || thread.displayPhone || thread.contactWaId}</h4>
                  <div className="ml-2 flex items-center gap-2 shrink-0">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleStarThread(thread.id);
                      }}
                      className="rounded-lg p-1 text-gray-300 hover:bg-gray-100 hover:text-amber-400"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          starredThreadIdSet.has(thread.id) ? 'fill-amber-400 text-amber-400' : ''
                        }`}
                      />
                    </button>
                    <span className="text-xs text-gray-400">
                      {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate">{thread.lastMessageText || 'No messages yet'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[10px] font-medium text-[#25D366]">
                    WhatsApp
                  </span>
                  {thread.unreadCount > 0 ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-[#2563eb]">
                      {thread.unreadCount} unread
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {filteredThreads.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              {getEmptyThreadMessage({
                channelFilter,
                threadFilter,
                hasWhatsAppChannel: Boolean(bootstrap?.channel),
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`${
          isMobileViewport && mobileView === 'threads' ? 'hidden' : 'flex'
        } min-w-0 flex-1 flex-col bg-[#f8f9fa]`}
      >
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 shrink-0 sm:px-6 lg:flex-nowrap lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            {isMobileViewport ? (
              <button
                type="button"
                onClick={returnToThreadList}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 lg:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">
                {activeThread?.contactName || activeThread?.displayPhone || 'Select a conversation'}
              </h2>
              {isMobileViewport && activeThread?.displayPhone ? (
                <p className="truncate text-xs text-gray-500">{activeThread.displayPhone}</p>
              ) : null}
            </div>
            {activeThread ? (
              <button
                onClick={() => toggleStarThread(activeThread.id)}
                className="rounded-lg p-2 text-gray-300 hover:bg-gray-100 hover:text-amber-400"
              >
                <Star className={`h-4 w-4 ${activeThreadIsStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {activeThread ? (
              <button
                onClick={() => void handleToggleActiveThreadBlock(!activeThreadIsBlocked)}
                disabled={!activeThreadWaId || blockActionWaId === activeThreadWaId}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  activeThreadIsBlocked
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                {blockActionWaId === activeThreadWaId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : activeThreadIsBlocked ? (
                  'Unblock'
                ) : (
                  'Block'
                )}
              </button>
            ) : null}
            <button
              onClick={() => void handleStartCallFromInbox()}
              disabled={!activeThread || isBusy === 'call' || activeThreadIsBlocked}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy === 'call' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsContactPanelOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              {isContactPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              <span>{isMobileViewport ? 'Details' : isContactPanelOpen ? 'Hide details' : 'Show details'}</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{error}</div>
        ) : null}

        {activeThreadIsBlocked ? (
          <div className="mx-4 mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">
            This WhatsApp user is currently blocked. Unblock the user to send messages or place a call.
          </div>
        ) : null}

        <div
          ref={messagesViewportRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto scrollbar-hide p-4 sm:p-6"
        >
          <div ref={messagesContentRef} className="space-y-6">
            {messages.map((message) => (
              <div key={message.id}>
              <MessageBubble
                message={message}
                currentUserName={currentUserName}
                contactName={activeContactName}
                templates={templates}
              />
              </div>
            ))}

            {isBusy === 'messages' ? (
              <div className="text-sm text-gray-500">Loading messages...</div>
            ) : null}

            {selectedThreadId && messages.length === 0 && isBusy !== 'messages' ? (
              <div className="text-sm text-gray-500">No messages recorded for this conversation yet.</div>
            ) : null}
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-200 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleAttachmentPicked(file);
              }
            }}
          />

          <div className="relative">
            <AnimatePresence initial={false}>
              {isComposerActionsOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="mb-3 flex flex-wrap items-center gap-2"
                >
                  <button
                    onClick={() => setIsEmojiOpen((current) => !current)}
                    disabled={!activeThread || activeThreadIsBlocked}
                    className={composerIconButtonClass}
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeThread || activeThreadIsBlocked || isBusy === 'upload'}
                    className={composerIconButtonClass}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsTemplateTrayOpen((current) => !current)}
                    disabled={!activeThread || activeThreadIsBlocked || templates.length === 0}
                    className={`${composerChipButtonClass} ${isTemplateTrayOpen ? 'border-[#c9d4e8] bg-slate-50 text-slate-900' : ''}`}
                  >
                    Templates
                  </button>
                  <button disabled className={`${composerChipButtonClass} text-slate-400 hover:bg-white hover:text-slate-400`}>
                    Catalog
                  </button>
                  <button
                    onClick={() => handleTextFormatting('*')}
                    disabled={!activeThread || activeThreadIsBlocked}
                    className={composerIconButtonClass}
                  >
                    <span className="text-base font-semibold">B</span>
                  </button>
                  <button
                    onClick={() => handleTextFormatting('_')}
                    disabled={!activeThread || activeThreadIsBlocked}
                    className={composerIconButtonClass}
                  >
                    <span className="text-base italic">I</span>
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {isEmojiOpen ? (
              <div className="absolute bottom-full left-0 z-20 mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
                <div className="grid grid-cols-6 gap-2">
                  {EMOJI_CHOICES.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleEmojiInsert(emoji)}
                      className="rounded-lg p-2 text-xl hover:bg-gray-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isTemplateTrayOpen ? (
              <div ref={templateTrayRef} className="absolute bottom-full left-0 z-20 mb-3 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:left-28">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">Send approved template</p>
                  <button
                    type="button"
                    onClick={() => setIsTemplateTrayOpen(false)}
                    className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close template selector"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <select
                  value={composerTemplateId}
                  onChange={(event) => setComposerTemplateId(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#5b45ff]"
                >
                  <option value="">Choose a template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.language})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleSendTemplateInConversation()}
                  disabled={!composerTemplateId || isBusy === 'template'}
                  className="mt-3 w-full rounded-xl bg-[#5b45ff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4a35e8] disabled:opacity-60"
                >
                  {isBusy === 'template' ? 'Sending...' : 'Send template'}
                </button>
              </div>
            ) : null}

            {renderAttachmentChip()}

            <div className="flex items-center gap-3 rounded-[26px] border border-[#d6dce7] bg-[#f6f8fb] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-colors focus-within:border-[#cbd5e1]">
              <button
                onClick={toggleComposerActions}
                disabled={!activeThread || activeThreadIsBlocked}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                  isComposerActionsOpen
                    ? 'border-[#0d8d60] bg-[#12c07a] text-white shadow-[0_12px_24px_rgba(18,192,122,0.24)]'
                    : 'border-transparent bg-transparent text-slate-500 hover:bg-white hover:text-slate-800'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isComposerActionsOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </button>

              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  activeThread
                    ? activeThreadIsBlocked
                      ? 'This user is blocked on WhatsApp'
                      : 'Type a message...'
                    : 'Select a conversation first'
                }
                disabled={!activeThread || activeThreadIsBlocked}
                className="min-h-[42px] max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              />

              <button
                onClick={() => void handleSend()}
                disabled={!activeThread || activeThreadIsBlocked || (!messageInput.trim() && !attachment) || isBusy === 'send' || isBusy === 'upload'}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isContactPanelOpen ? (
          isMobileViewport ? (
            <div className="fixed inset-0 z-40 lg:hidden">
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsContactPanelOpen(false)}
                className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
                aria-label="Close contact details"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-hidden border-l border-gray-200 bg-white"
              >
                <div className="h-full overflow-y-auto scrollbar-hide">
                  <div className="flex items-center justify-between border-b border-gray-100 p-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Contact details</p>
                      <h3 className="mt-1 text-lg font-bold text-gray-900">{activeThread?.contactName || activeThread?.displayPhone || 'Contact'}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsContactPanelOpen(false)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="mb-6 border-b border-gray-100 pb-6 text-center">
                      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#25D366]/10 text-3xl font-bold text-[#25D366]">
                        {(activeThread?.contactName || activeThread?.displayPhone || 'U').charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm text-gray-500">WhatsApp conversation</p>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Contact Info</h3>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-sm text-gray-700">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span>{activeThread?.displayPhone || activeThread?.contactWaId || 'No phone available'}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-700">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span>No email synced</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">WhatsApp Controls</h3>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-500">Block status</span>
                            <span className={`font-medium ${activeThreadIsBlocked ? 'text-red-600' : 'text-emerald-600'}`}>
                              {activeThreadIsBlocked ? 'Blocked' : 'Active'}
                            </span>
                          </div>
                          <button
                            onClick={() => void handleToggleActiveThreadBlock(!activeThreadIsBlocked)}
                            disabled={!activeThreadWaId || blockActionWaId === activeThreadWaId}
                            className={`mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              activeThreadIsBlocked
                                ? 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                                : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                            }`}
                          >
                            {blockActionWaId === activeThreadWaId
                              ? 'Updating...'
                              : activeThreadIsBlocked
                                ? 'Unblock user'
                                : 'Block user'}
                          </button>
                          {blockedUsersError ? (
                            <p className="mt-3 text-xs leading-5 text-red-600">{blockedUsersError}</p>
                          ) : null}
                          {isBlockedUsersLoading ? (
                            <p className="mt-3 text-xs leading-5 text-gray-500">Loading block status...</p>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Labels</h3>
                        <div className="flex flex-wrap gap-2">
                          {(activeThread?.labels || []).length > 0 ? (
                            activeThread?.labels.map((label) => (
                              <span key={label} className="flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                <Tag className="w-3 h-3" /> {label}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">No labels yet</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">CRM Properties</h3>
                        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Source</span>
                            <span className="font-medium text-gray-900">WhatsApp</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Status</span>
                            <span className="font-medium text-gray-900">{activeThread?.status || 'New'}</span>
                          </div>
                          <div className="flex justify-between gap-3 text-sm">
                            <span className="text-gray-500">Owner</span>
                            <span className="text-right font-medium text-gray-900">{activeThread?.ownerName || bootstrap?.profile?.fullName || 'Unassigned'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="hidden shrink-0 overflow-hidden border-l border-gray-200 bg-white lg:block"
          >
            <div className="h-full w-80 flex flex-col overflow-y-auto scrollbar-hide">
              <div className="p-6 border-b border-gray-100 text-center">
                <div className="w-24 h-24 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
                  {(activeThread?.contactName || activeThread?.displayPhone || 'U').charAt(0).toUpperCase()}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{activeThread?.contactName || activeThread?.displayPhone || 'No contact selected'}</h2>
                <p className="text-sm text-gray-500">WhatsApp conversation</p>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Contact Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{activeThread?.displayPhone || activeThread?.contactWaId || 'No phone available'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span>No email synced</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">WhatsApp Controls</h3>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-500">Block status</span>
                      <span className={`font-medium ${activeThreadIsBlocked ? 'text-red-600' : 'text-emerald-600'}`}>
                        {activeThreadIsBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </div>
                    <button
                      onClick={() => void handleToggleActiveThreadBlock(!activeThreadIsBlocked)}
                      disabled={!activeThreadWaId || blockActionWaId === activeThreadWaId}
                      className={`mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        activeThreadIsBlocked
                          ? 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                          : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                      }`}
                    >
                      {blockActionWaId === activeThreadWaId
                        ? 'Updating...'
                        : activeThreadIsBlocked
                          ? 'Unblock user'
                          : 'Block user'}
                    </button>
                    {blockedUsersError ? (
                      <p className="mt-3 text-xs leading-5 text-red-600">{blockedUsersError}</p>
                    ) : null}
                    {isBlockedUsersLoading ? (
                      <p className="mt-3 text-xs leading-5 text-gray-500">Loading block status…</p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Labels</h3>
                  <div className="flex flex-wrap gap-2">
                    {(activeThread?.labels || []).length > 0 ? (
                      activeThread?.labels.map((label) => (
                        <span key={label} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100 flex items-center gap-1">
                          <Tag className="w-3 h-3" /> {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">No labels yet</span>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">CRM Properties</h3>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Source</span>
                      <span className="font-medium text-gray-900">WhatsApp</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className="font-medium text-gray-900">{activeThread?.status || 'New'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Owner</span>
                      <span className="font-medium text-gray-900">{activeThread?.ownerName || bootstrap?.profile?.fullName || 'Unassigned'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          )
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isNewChatModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewChatModalOpen(false)} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />

            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold text-gray-900">Start New Chat</h3>
                <button onClick={() => setIsNewChatModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto scrollbar-hide">
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                  <button
                    onClick={() => setNewChatOption('existing')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newChatOption === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Existing Contact
                  </button>
                  <button
                    onClick={() => setNewChatOption('manual')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newChatOption === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Manual Entry
                  </button>
                </div>

                <div className="space-y-5">
                  {newChatOption === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Contact</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                          value={selectedContact}
                          onChange={(event) => setSelectedContact(event.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] outline-none text-sm appearance-none"
                        >
                          <option value="" disabled>
                            Choose a contact...
                          </option>
                          {conversations.map((thread) => (
                            <option key={thread.id} value={thread.displayPhone || thread.contactWaId}>
                              {thread.contactName || thread.displayPhone || thread.contactWaId}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            placeholder="e.g. John Doe"
                            value={manualName}
                            onChange={(event) => setManualName(event.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] outline-none text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="tel"
                            placeholder="e.g. +1 234 567 8900"
                            value={manualNumber}
                            onChange={(event) => setManualNumber(event.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] outline-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Approved Template</label>
                    <div className="relative">
                      <MessageSquareText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        value={selectedTemplateId}
                        onChange={(event) => setSelectedTemplateId(event.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#5b45ff] focus:border-[#5b45ff] outline-none text-sm appearance-none"
                      >
                        <option value="" disabled>
                          Choose a template...
                        </option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.language})
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Only approved templates should be used to start a new conversation outside the customer service window.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0">
                <div className="mb-4 text-sm text-gray-600 bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
                  Looking to contact people in bulk? Wire the campaigns flow next and use the{' '}
                  <Link to="/dashboard/campaigns" className="text-blue-600 font-bold hover:underline" onClick={() => setIsNewChatModalOpen(false)}>
                    Campaigns
                  </Link>{' '}
                  route for that flow.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsNewChatModalOpen(false)} className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleStartConversation()}
                    disabled={
                      isBusy === 'start' ||
                      !selectedTemplateId ||
                      (newChatOption === 'existing' ? !selectedContact : !manualNumber.trim())
                    }
                    className="flex-1 py-2.5 bg-[#5b45ff] hover:bg-[#4a35e8] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#5b45ff]/30 disabled:opacity-60"
                  >
                    {isBusy === 'start' ? 'Starting...' : 'Start Chat'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
