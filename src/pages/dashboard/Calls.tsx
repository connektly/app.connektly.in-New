import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clock,
  History,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { canStartCallFromPermissionStatus, normalizeCallPermissionStatus } from '../../lib/call-permissions';
import { useAppData } from '../../context/AppDataContext';
import { useCallManager } from '../../context/CallManagerContext';
import { normalizeContactIdentity } from '../../lib/phone';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type { ConversationThread, WhatsAppCallSessionRecord, WhatsAppCallState } from '../../lib/types';

function buildContactLabel(thread: ConversationThread) {
  const primary = thread.contactName || thread.displayPhone || thread.contactWaId;
  const secondaryCandidate =
    thread.displayPhone && thread.displayPhone !== primary ? thread.displayPhone : thread.contactWaId;
  const primaryIdentity = normalizeContactIdentity(primary);
  const secondaryIdentity = normalizeContactIdentity(secondaryCandidate);
  const secondary =
    secondaryCandidate && primaryIdentity && secondaryIdentity && primaryIdentity === secondaryIdentity
      ? null
      : secondaryCandidate;

  return secondary ? `${primary} | ${secondary}` : primary;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getCallStateMeta(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return {
        label: 'Incoming',
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'dialing':
      return {
        label: 'Dialing',
        className: 'border border-violet-200 bg-violet-50 text-violet-700',
      };
    case 'ringing':
      return {
        label: 'Ringing',
        className: 'border border-blue-200 bg-blue-50 text-blue-700',
      };
    case 'connecting':
      return {
        label: 'Connecting',
        className: 'border border-sky-200 bg-sky-50 text-sky-700',
      };
    case 'ongoing':
      return {
        label: 'Ongoing',
        className: 'border border-green-200 bg-green-50 text-green-700',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'border border-red-200 bg-red-50 text-red-700',
      };
    case 'missed':
      return {
        label: 'Missed',
        className: 'border border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'border border-orange-200 bg-orange-50 text-orange-700',
      };
    case 'ended':
      return {
        label: 'Ended',
        className: 'border border-slate-200 bg-slate-100 text-slate-700',
      };
    case 'ending':
      return {
        label: 'Ending',
        className: 'border border-slate-200 bg-slate-50 text-slate-700',
      };
    default:
      return {
        label: state,
        className: 'border border-slate-200 bg-slate-50 text-slate-700',
      };
  }
}

function getDirectionMeta(direction: 'incoming' | 'outgoing' | 'missed') {
  switch (direction) {
    case 'incoming':
      return {
        icon: PhoneIncoming,
        label: 'Incoming',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
      };
    case 'missed':
      return {
        icon: PhoneMissed,
        label: 'Missed',
        color: 'text-rose-600',
        bg: 'bg-rose-50',
      };
    default:
      return {
        icon: PhoneOutgoing,
        label: 'Outgoing',
        color: 'text-violet-600',
        bg: 'bg-violet-50',
      };
  }
}

function getDurationFromSession(session: WhatsAppCallSessionRecord) {
  if (!session.connectedAt || !session.endedAt) {
    return 0;
  }

  const connectedAtMs = Date.parse(session.connectedAt);
  const endedAtMs = Date.parse(session.endedAt);

  if (!Number.isFinite(connectedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < connectedAtMs) {
    return 0;
  }

  return Math.round((endedAtMs - connectedAtMs) / 1000);
}

export default function Calls() {
  const { bootstrap } = useAppData();
  const { startOutgoingCall, isCallActionPending } = useCallManager();
  const callHistory = bootstrap?.callHistory || [];
  const callSessions = bootstrap?.callSessions || [];
  const conversations = bootstrap?.conversations || [];
  const [isNewCallModalOpen, setIsNewCallModalOpen] = useState(false);
  const [callMode, setCallMode] = useState<'contact' | 'manual'>('contact');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);

  const summary = {
    total: callHistory.length,
    incoming: callHistory.filter((call) => call.type === 'incoming').length,
    outgoing: callHistory.filter((call) => call.type === 'outgoing').length,
    missed: callHistory.filter((call) => call.type === 'missed').length,
  };

  const stats = [
    { label: 'Total Calls', value: summary.total, icon: Phone, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Incoming Calls', value: summary.incoming, icon: PhoneIncoming, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Outgoing Calls', value: summary.outgoing, icon: PhoneOutgoing, color: 'text-violet-500', bg: 'bg-violet-50' },
    { label: 'Missed Calls', value: summary.missed, icon: PhoneMissed, color: 'text-rose-500', bg: 'bg-rose-50' },
  ];

  const contactOptions = useMemo(() => {
    const seen = new Set<string>();

    return conversations.flatMap((thread) => {
      const waId = (thread.contactWaId || thread.displayPhone || '').trim();

      if (!waId || seen.has(waId)) {
        return [];
      }

      seen.add(waId);

      return [
        {
          id: thread.id,
          waId,
          label: buildContactLabel(thread),
          contactName: thread.contactName,
        },
      ];
    });
  }, [conversations]);

  const historyEntries = useMemo(() => {
    const sessionByCallId = new Map<string, WhatsAppCallSessionRecord>(
      callSessions.map((session) => [session.callId, session]),
    );
    const linkedCallIds = new Set<string>();

    const sessionEntries = callSessions.map((session) => {
      const matchingLog = callHistory.find((entry) => entry.callId && entry.callId === session.callId) || null;

      if (matchingLog?.callId) {
        linkedCallIds.add(matchingLog.callId);
      }

      const durationSeconds = matchingLog?.durationSeconds || getDurationFromSession(session);
      const stateMeta = getCallStateMeta(session.state);
      const directionMeta = getDirectionMeta(
        session.direction === 'incoming'
          ? session.state === 'missed' || session.state === 'rejected'
            ? 'missed'
            : 'incoming'
          : 'outgoing',
      );

      return {
        key: `session:${session.id}`,
        title: session.contactName || matchingLog?.name || session.displayPhone || session.contactWaId || 'Unknown contact',
        phone: session.displayPhone || session.contactWaId || matchingLog?.phone || 'Unknown number',
        startedAt: session.startedAt,
        connectedAt: session.connectedAt,
        updatedAt: session.updatedAt,
        durationSeconds,
        callId: session.callId,
        lastEvent: session.lastEvent,
        stateLabel: stateMeta.label,
        stateClassName: stateMeta.className,
        directionLabel: directionMeta.label,
        directionIcon: directionMeta.icon,
        directionColor: directionMeta.color,
        directionBg: directionMeta.bg,
      };
    });

    const orphanLogEntries = callHistory
      .filter((entry) => !entry.callId || !linkedCallIds.has(entry.callId))
      .map((entry) => {
        const linkedSession = entry.callId ? sessionByCallId.get(entry.callId) || null : null;
        const inferredState: WhatsAppCallState =
          linkedSession?.state ||
          (entry.type === 'missed' ? 'missed' : entry.type === 'incoming' ? 'ended' : 'ended');
        const stateMeta = getCallStateMeta(inferredState);
        const directionMeta = getDirectionMeta(entry.type);

        return {
          key: `log:${entry.id}`,
          title: entry.name || entry.phone,
          phone: entry.phone,
          startedAt: entry.createdAt,
          connectedAt: linkedSession?.connectedAt || null,
          updatedAt: linkedSession?.updatedAt || entry.createdAt,
          durationSeconds: entry.durationSeconds,
          callId: entry.callId,
          lastEvent: linkedSession?.lastEvent || null,
          stateLabel: stateMeta.label,
          stateClassName: stateMeta.className,
          directionLabel: directionMeta.label,
          directionIcon: directionMeta.icon,
          directionColor: directionMeta.color,
          directionBg: directionMeta.bg,
        };
      });

    return [...sessionEntries, ...orphanLogEntries].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }, [callHistory, callSessions]);

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Phone className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900">Connect WhatsApp first</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            The calling console uses your connected WhatsApp Business phone number. Connect the channel first, then permission checks and call actions can be sent through the Graph API.
          </p>
          <Link
            to="/onboarding/channel-connection"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8]"
          >
            Open channel setup
          </Link>
        </div>
      </div>
    );
  }

  const resetNewCallModal = () => {
    setCallMode('contact');
    setSelectedThreadId('');
    setManualNumber('');
    setModalError(null);
  };

  const openNewCallModal = () => {
    setSuccess(null);
    setModalError(null);
    setIsNewCallModalOpen(true);
  };

  const closeNewCallModal = () => {
    setIsNewCallModalOpen(false);
    resetNewCallModal();
  };

  useEscapeKey(isNewCallModalOpen, closeNewCallModal);

  const handleStartCall = async () => {
    const selectedContact = contactOptions.find((entry) => entry.id === selectedThreadId) || null;
    const targetWaId = (callMode === 'contact' ? selectedContact?.waId || '' : manualNumber).trim();

    if (!targetWaId) {
      setModalError(
        callMode === 'contact'
          ? 'Choose a contact before starting the call.'
          : 'Enter a WhatsApp number before starting the call.',
      );
      return;
    }

    try {
      setIsCheckingPermission(true);
      setModalError(null);
      setSuccess(null);

      const permissionResponse = await appApi.getCallPermissions(targetWaId);
      const permissionStatus = normalizeCallPermissionStatus(permissionResponse.permission.status);

      if (!canStartCallFromPermissionStatus(permissionStatus)) {
        setModalError(
          permissionStatus === 'no_permission'
            ? 'This contact cannot be called right now.'
            : `This contact cannot be called right now. Current permission status: ${permissionStatus || 'unavailable'}.`,
        );
        return;
      }

      await startOutgoingCall(targetWaId);

      setSuccess(
        `Calling ${selectedContact?.contactName || selectedContact?.waId || targetWaId}.`,
      );
      closeNewCallModal();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to start the WhatsApp call.');
    } finally {
      setIsCheckingPermission(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Calls</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review recent call activity and start a new WhatsApp call from one place.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewCallModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8]"
        >
          <Plus className="h-4 w-4" /> New WhatsApp Call
        </button>
      </div>

      {success ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-gray-400">
              <History className="h-4 w-4" />
              Call History
            </div>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Recent call logs</h2>
            <p className="mt-2 text-sm text-gray-500">
              Every call record shows the direction, started time, and duration.
            </p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Connected number:{' '}
            <span className="font-medium text-gray-900">
              {bootstrap.channel.displayPhoneNumber || bootstrap.channel.phoneNumberId}
            </span>
          </div>
        </div>

        {historyEntries.length > 0 ? (
          <div className="mt-6 space-y-4">
            {historyEntries.map((entry) => (
              <div
                key={entry.key}
                className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 transition-colors hover:border-gray-300"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${entry.directionBg} ${entry.directionColor}`}>
                      <entry.directionIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.stateClassName}`}>
                          {entry.stateLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{entry.phone}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Direction</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">{entry.directionLabel}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Call Time</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">{formatDateTime(entry.startedAt)}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Call Duration</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">{formatDuration(entry.durationSeconds)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-6 py-10 text-center">
            <Phone className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No call logs yet</h3>
            <p className="mt-2 text-sm text-gray-500">
              Start a WhatsApp call and the history will show the full log here.
            </p>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {isNewCallModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeNewCallModal}
              className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.96 }}
              className="relative z-10 w-full max-w-xl rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">Actions</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">New WhatsApp Call</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Choose an existing contact or type a number manually. We will check permission automatically before calling.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeNewCallModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 inline-flex rounded-2xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setCallMode('contact')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    callMode === 'contact' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Choose contact
                </button>
                <button
                  type="button"
                  onClick={() => setCallMode('manual')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    callMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Type number
                </button>
              </div>

              <div className="mt-5">
                {callMode === 'contact' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Contact</label>
                    <select
                      value={selectedThreadId}
                      onChange={(event) => setSelectedThreadId(event.target.value)}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    >
                      <option value="">Select a contact</option>
                      {contactOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">WhatsApp number</label>
                    <input
                      type="text"
                      value={manualNumber}
                      onChange={(event) => setManualNumber(event.target.value)}
                      placeholder="919999999999"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>
                )}
              </div>

              {modalError ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Call permission is checked automatically when you tap <span className="font-medium text-gray-900">Call Now</span>.
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeNewCallModal}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartCall()}
                  disabled={isCheckingPermission || isCallActionPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8] disabled:opacity-60"
                >
                  {isCheckingPermission || isCallActionPending ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Checking permission...
                    </>
                  ) : (
                    'Call Now'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
