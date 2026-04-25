import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationFeed from '../../components/NotificationFeed';
import { appApi } from '../../lib/api';
import { getUnreadNotificationCount } from '../../lib/notifications';
import { useAppData } from '../../context/AppDataContext';
import type { UserNotification } from '../../lib/types';

type FilterMode = 'all' | 'unread';

export default function Notifications() {
  const { bootstrap, setBootstrap } = useAppData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const notifications = bootstrap?.notifications || [];
  const unreadCount = getUnreadNotificationCount(notifications);

  const filteredNotifications = useMemo(() => {
    return filter === 'unread'
      ? notifications.filter((notification) => !notification.isRead)
      : notifications;
  }, [filter, notifications]);

  const markReadLocally = (targetId?: string | null) => {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notifications: current.notifications.map((notification) =>
          !targetId || notification.id === targetId
            ? {
                ...notification,
                isRead: true,
                readAt: notification.readAt || new Date().toISOString(),
              }
            : notification,
        ),
      };
    });
  };

  const handleSelect = async (notification: UserNotification) => {
    if (!notification.isRead) {
      markReadLocally(notification.id);
      void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
    }

    if (notification.targetPath) {
      navigate(notification.targetPath);
    }
  };

  const handleMarkRead = (notification: UserNotification) => {
    markReadLocally(notification.id);
    void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
  };

  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAllRead(true);
      markReadLocally(null);
      await appApi.markNotificationsRead({ markAll: true });
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-400">Notification Center</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Stay on top of template reviews, missed calls, new leads, and workspace activity in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={isMarkingAllRead || unreadCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-[#111827] to-[#1f2937] p-5 text-white shadow-sm">
          <p className="text-sm font-medium text-white/70">Total notifications</p>
          <p className="mt-4 text-4xl font-bold">{notifications.length}</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-[#5b45ff] to-[#4430df] p-5 text-white shadow-sm">
          <p className="text-sm font-medium text-white/70">Unread</p>
          <p className="mt-4 text-4xl font-bold">{unreadCount}</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <Filter className="h-4 w-4" />
            Filter
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {([
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ] as Array<{ value: FilterMode; label: string }>).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  filter === option.value
                    ? 'bg-[#5b45ff] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <NotificationFeed
        notifications={filteredNotifications}
        onSelect={handleSelect}
        onMarkRead={handleMarkRead}
        emptyTitle="No notifications match this view"
        emptyDescription="Try switching filters or check back after new activity."
      />

      {notifications.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
          <Bell className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">
            Notification activity will start appearing here as leads, calls, templates, and team events come in.
          </p>
        </div>
      ) : null}
    </div>
  );
}
