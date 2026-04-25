import {
  Bell,
  CheckCircle2,
  PhoneMissed,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { UserNotification } from '../lib/types';

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'Just now';
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, secondsPerUnit] of ranges) {
    if (Math.abs(diffSeconds) >= secondsPerUnit) {
      return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }

  return formatter.format(diffSeconds, 'second');
}

function getNotificationTone(notification: UserNotification) {
  switch (notification.type) {
    case 'template_approved':
      return {
        icon: CheckCircle2,
        iconClassName: 'text-emerald-600',
        badgeClassName: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
        label: 'Approved',
      };
    case 'template_rejected':
      return {
        icon: XCircle,
        iconClassName: 'text-red-600',
        badgeClassName: 'bg-red-50 text-red-700 border border-red-100',
        label: 'Rejected',
      };
    case 'missed_call':
      return {
        icon: PhoneMissed,
        iconClassName: 'text-amber-600',
        badgeClassName: 'bg-amber-50 text-amber-700 border border-amber-100',
        label: 'Missed call',
      };
    case 'team_member_joined':
      return {
        icon: UserPlus,
        iconClassName: 'text-sky-600',
        badgeClassName: 'bg-sky-50 text-sky-700 border border-sky-100',
        label: 'User joined',
      };
    default:
      return {
        icon: Bell,
        iconClassName: 'text-[#5b45ff]',
        badgeClassName: 'bg-violet-50 text-violet-700 border border-violet-100',
        label: 'New lead',
      };
  }
}

export default function NotificationFeed({
  notifications,
  onSelect,
  onMarkRead,
  compact = false,
  emptyTitle = 'No notifications yet',
  emptyDescription = 'New activity will appear here.',
}: {
  notifications: UserNotification[];
  onSelect?: (notification: UserNotification) => void;
  onMarkRead?: (notification: UserNotification) => void;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (notifications.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <Bell className="mx-auto h-10 w-10 text-gray-300" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">{emptyTitle}</h3>
        <p className="mt-2 text-sm text-gray-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => {
        const tone = getNotificationTone(notification);
        const Icon = tone.icon;

        return (
          <div
            key={notification.id}
            onClick={() => onSelect?.(notification)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.(notification);
              }
            }}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
              notification.isRead
                ? 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                : 'border-violet-200 bg-violet-50/70 hover:border-violet-300 hover:bg-violet-50'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
                <Icon className={`h-5 w-5 ${tone.iconClassName}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badgeClassName}`}>
                    {tone.label}
                  </span>
                  {!notification.isRead ? (
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#5b45ff]" />
                  ) : null}
                  <span className="text-xs text-gray-400">{formatRelativeTime(notification.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-gray-900">{notification.title}</p>
                <p className="mt-1 text-sm leading-6 text-gray-500">{notification.body}</p>
                {!compact && notification.targetPath ? (
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                    Tap to open
                  </p>
                ) : null}
              </div>
              {onMarkRead && !notification.isRead ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkRead(notification);
                  }}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Mark read
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
