import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appApi, ApiError } from '../lib/api';
import { mapCallLogRecord, mapCallSessionRecord, removeCallSession, upsertCallLog, upsertCallSession } from '../lib/calls';
import { mapConversationThreadRecord, removeConversationThread, upsertConversationThread } from '../lib/conversations';
import { areInboxInsightsFiltersEqual, getTodayInboxInsightsFilters } from '../lib/insights';
import {
  getDefaultNotificationPreferences,
  mapNotificationPreferencesRecord,
  mapNotificationRecord,
  removeNotification,
  upsertNotification,
} from '../lib/notifications';
import { getCachedSession, supabase } from '../lib/supabase';
import type {
  DashboardBootstrap,
  InboxInsightsResponse,
  WhatsAppBusinessProfile,
} from '../lib/types';

const BUSINESS_PROFILE_POLL_INTERVAL_MS = 45_000;

function syncBootstrapChannelFromBusinessProfile(
  current: DashboardBootstrap | null,
  businessProfile: WhatsAppBusinessProfile | null,
) {
  if (!current?.channel || !businessProfile) {
    return current;
  }

  if (current.channel.phoneNumberId !== businessProfile.phoneNumberId) {
    return current;
  }

  return {
    ...current,
    channel: {
      ...current.channel,
      displayPhoneNumber: businessProfile.displayPhoneNumber,
      verifiedName: businessProfile.verifiedName,
      qualityRating: businessProfile.qualityRating,
      messagingLimitTier: businessProfile.messagingLimitTier,
      businessAccountName: businessProfile.businessAccountName,
      phoneNumberId: businessProfile.phoneNumberId,
      wabaId: businessProfile.wabaId,
    },
  };
}

interface AppDataContextValue {
  bootstrap: DashboardBootstrap | null;
  businessProfile: WhatsAppBusinessProfile | null;
  defaultInboxInsights: InboxInsightsResponse | null;
  isDefaultInboxInsightsLoading: boolean;
  isBusinessProfileLoading: boolean;
  businessProfileError: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshBusinessProfile: (options?: { silent?: boolean }) => Promise<WhatsAppBusinessProfile | null>;
  refreshDefaultInboxInsights: (
    options?: { force?: boolean },
  ) => Promise<InboxInsightsResponse | null>;
  setBootstrap: (updater: (current: DashboardBootstrap | null) => DashboardBootstrap | null) => void;
  setBusinessProfile: (
    updater: (current: WhatsAppBusinessProfile | null) => WhatsAppBusinessProfile | null,
  ) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrapState] = useState<DashboardBootstrap | null>(null);
  const [businessProfile, setBusinessProfileState] = useState<WhatsAppBusinessProfile | null>(null);
  const [defaultInboxInsights, setDefaultInboxInsights] = useState<InboxInsightsResponse | null>(null);
  const [defaultInboxInsightsPhoneNumberId, setDefaultInboxInsightsPhoneNumberId] = useState<string | null>(null);
  const [isDefaultInboxInsightsLoading, setIsDefaultInboxInsightsLoading] = useState(false);
  const [isBusinessProfileLoading, setIsBusinessProfileLoading] = useState(false);
  const [businessProfileError, setBusinessProfileError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeChannelPhoneNumberIdRef = useRef<string | null>(null);
  const defaultInboxInsightsPromiseRef = useRef<Promise<InboxInsightsResponse | null> | null>(null);
  const activeChannelPhoneNumberId = bootstrap?.channel?.phoneNumberId ?? null;

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const session = await getCachedSession();

      if (!session) {
        startTransition(() => {
          setBootstrapState(null);
          setIsLoading(false);
        });
        return;
      }

      const next = await appApi.getBootstrap();
      startTransition(() => {
        setBootstrapState(next);
        setIsLoading(false);
      });
    } catch (error) {
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Failed to load workspace data.';

      startTransition(() => {
        setError(message);
        setIsLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    activeChannelPhoneNumberIdRef.current = activeChannelPhoneNumberId;
  }, [activeChannelPhoneNumberId]);

  const refreshBusinessProfile = useCallback(
    async (options?: { silent?: boolean }) => {
      const channelPhoneNumberId = activeChannelPhoneNumberIdRef.current;

      if (!channelPhoneNumberId) {
        startTransition(() => {
          setBusinessProfileState(null);
          setBusinessProfileError(null);
          setIsBusinessProfileLoading(false);
        });
        return null;
      }

      if (!options?.silent) {
        startTransition(() => {
          setIsBusinessProfileLoading(true);
          setBusinessProfileError(null);
        });
      }

      try {
        const response = await appApi.getBusinessProfile();

        if (response.profile.phoneNumberId !== activeChannelPhoneNumberIdRef.current) {
          return null;
        }

        startTransition(() => {
          setBusinessProfileState(response.profile);
          setBusinessProfileError(null);
        });

        return response.profile;
      } catch (error) {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : 'Failed to load business profile.';

        if (!options?.silent) {
          startTransition(() => {
            setBusinessProfileError(message);
          });
        }

        return null;
      } finally {
        if (!options?.silent) {
          startTransition(() => {
            setIsBusinessProfileLoading(false);
          });
        }
      }
    },
    [],
  );

  const refreshDefaultInboxInsights = useCallback(
    async (options?: { force?: boolean }) => {
      const channelPhoneNumberId = activeChannelPhoneNumberIdRef.current;

      if (!channelPhoneNumberId) {
        defaultInboxInsightsPromiseRef.current = null;
        startTransition(() => {
          setDefaultInboxInsights(null);
          setDefaultInboxInsightsPhoneNumberId(null);
          setIsDefaultInboxInsightsLoading(false);
        });
        return null;
      }

      const expectedFilters = getTodayInboxInsightsFilters();

      if (
        !options?.force &&
        defaultInboxInsights &&
        defaultInboxInsightsPhoneNumberId === channelPhoneNumberId &&
        areInboxInsightsFiltersEqual(defaultInboxInsights.filters, expectedFilters)
      ) {
        return defaultInboxInsights;
      }

      if (defaultInboxInsightsPromiseRef.current) {
        return defaultInboxInsightsPromiseRef.current;
      }

      startTransition(() => {
        setIsDefaultInboxInsightsLoading(true);
      });

      const requestPhoneNumberId = channelPhoneNumberId;
      const requestPromise = (async () => {
        try {
          const response = await appApi.getInboxInsights(expectedFilters);

          if (requestPhoneNumberId !== activeChannelPhoneNumberIdRef.current) {
            return null;
          }

          startTransition(() => {
            setDefaultInboxInsights(response);
            setDefaultInboxInsightsPhoneNumberId(requestPhoneNumberId);
          });

          return response;
        } catch {
          return null;
        } finally {
          if (requestPhoneNumberId === activeChannelPhoneNumberIdRef.current) {
            startTransition(() => {
              setIsDefaultInboxInsightsLoading(false);
            });
          }
          defaultInboxInsightsPromiseRef.current = null;
        }
      })();

      defaultInboxInsightsPromiseRef.current = requestPromise;
      return requestPromise;
    },
    [defaultInboxInsights, defaultInboxInsightsPhoneNumberId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeChannelPhoneNumberId) {
      defaultInboxInsightsPromiseRef.current = null;
      startTransition(() => {
        setBusinessProfileState(null);
        setBusinessProfileError(null);
        setIsBusinessProfileLoading(false);
        setDefaultInboxInsights(null);
        setDefaultInboxInsightsPhoneNumberId(null);
        setIsDefaultInboxInsightsLoading(false);
      });
      return;
    }

    if (!businessProfile) {
      void refreshBusinessProfile();
      return;
    }

    if (businessProfile.phoneNumberId !== activeChannelPhoneNumberId) {
      startTransition(() => {
        setBusinessProfileState(null);
        setBusinessProfileError(null);
      });
      void refreshBusinessProfile();
    }
  }, [activeChannelPhoneNumberId, businessProfile, refreshBusinessProfile]);

  useEffect(() => {
    if (
      activeChannelPhoneNumberId &&
      defaultInboxInsightsPhoneNumberId &&
      defaultInboxInsightsPhoneNumberId !== activeChannelPhoneNumberId
    ) {
      defaultInboxInsightsPromiseRef.current = null;
      startTransition(() => {
        setDefaultInboxInsights(null);
        setDefaultInboxInsightsPhoneNumberId(null);
        setIsDefaultInboxInsightsLoading(false);
      });
    }
  }, [activeChannelPhoneNumberId, defaultInboxInsightsPhoneNumberId]);

  useEffect(() => {
    if (!activeChannelPhoneNumberId) {
      return;
    }

    const expectedFilters = getTodayInboxInsightsFilters();

    if (
      defaultInboxInsights &&
      defaultInboxInsightsPhoneNumberId === activeChannelPhoneNumberId &&
      areInboxInsightsFiltersEqual(defaultInboxInsights.filters, expectedFilters)
    ) {
      return;
    }

    void refreshDefaultInboxInsights();
  }, [
    activeChannelPhoneNumberId,
    defaultInboxInsights,
    defaultInboxInsightsPhoneNumberId,
    refreshDefaultInboxInsights,
  ]);

  useEffect(() => {
    if (!activeChannelPhoneNumberId) {
      return;
    }

    const refreshSilently = () => {
      void refreshBusinessProfile({ silent: true });
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    }, BUSINESS_PROFILE_POLL_INTERVAL_MS);

    const handleWindowFocus = () => {
      refreshSilently();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeChannelPhoneNumberId, refreshBusinessProfile]);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToConversationThreads = async () => {
      const session = await getCachedSession();

      if (isCancelled || !session) {
        return;
      }

      channel = supabase
        .channel(`conversation-threads:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_threads',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            startTransition(() => {
              setBootstrapState((current) => {
                if (!current) {
                  return current;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedId =
                    payload.old && typeof payload.old === 'object' && 'id' in payload.old
                      ? String(payload.old.id)
                      : null;

                  if (!deletedId) {
                    return current;
                  }

                  return {
                    ...current,
                    conversations: removeConversationThread(current.conversations, deletedId),
                  };
                }

                if (!payload.new || Array.isArray(payload.new)) {
                  return current;
                }

                const thread = mapConversationThreadRecord(payload.new as Record<string, unknown>);

                return {
                  ...current,
                  conversations: upsertConversationThread(current.conversations, thread),
                };
              });
            });
          },
        )
        .subscribe();
    };

    void subscribeToConversationThreads();

    return () => {
      isCancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToCalls = async () => {
      const session = await getCachedSession();

      if (isCancelled || !session) {
        return;
      }

      channel = supabase
        .channel(`calls:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_logs',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            startTransition(() => {
              setBootstrapState((current) => {
                if (!current) {
                  return current;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedId =
                    payload.old && typeof payload.old === 'object' && 'id' in payload.old
                      ? String(payload.old.id)
                      : null;

                  if (!deletedId) {
                    return current;
                  }

                  return {
                    ...current,
                    callHistory: current.callHistory.filter((entry) => entry.id !== deletedId),
                  };
                }

                if (!payload.new || Array.isArray(payload.new)) {
                  return current;
                }

                const callLog = mapCallLogRecord(payload.new as Record<string, unknown>);

                return {
                  ...current,
                  callHistory: upsertCallLog(current.callHistory, callLog),
                };
              });
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_sessions',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            startTransition(() => {
              setBootstrapState((current) => {
                if (!current) {
                  return current;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedId =
                    payload.old && typeof payload.old === 'object' && 'id' in payload.old
                      ? String(payload.old.id)
                      : null;

                  if (!deletedId) {
                    return current;
                  }

                  return {
                    ...current,
                    callSessions: removeCallSession(current.callSessions, deletedId),
                  };
                }

                if (!payload.new || Array.isArray(payload.new)) {
                  return current;
                }

                const nextSession = mapCallSessionRecord(payload.new as Record<string, unknown>);

                return {
                  ...current,
                  callSessions: upsertCallSession(current.callSessions, nextSession),
                };
              });
            });
          },
        )
        .subscribe();
    };

    void subscribeToCalls();

    return () => {
      isCancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToNotifications = async () => {
      const session = await getCachedSession();

      if (isCancelled || !session) {
        return;
      }

      channel = supabase
        .channel(`notifications:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            startTransition(() => {
              setBootstrapState((current) => {
                if (!current) {
                  return current;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedId =
                    payload.old && typeof payload.old === 'object' && 'id' in payload.old
                      ? String(payload.old.id)
                      : null;

                  if (!deletedId) {
                    return current;
                  }

                  return {
                    ...current,
                    notifications: removeNotification(current.notifications, deletedId),
                  };
                }

                if (!payload.new || Array.isArray(payload.new)) {
                  return current;
                }

                const notification = mapNotificationRecord(payload.new as Record<string, unknown>);

                return {
                  ...current,
                  notifications: upsertNotification(current.notifications, notification),
                };
              });
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notification_preferences',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            startTransition(() => {
              setBootstrapState((current) => {
                if (!current) {
                  return current;
                }

                if (payload.eventType === 'DELETE') {
                  return {
                    ...current,
                    notificationPreferences: getDefaultNotificationPreferences(session.user.id),
                  };
                }

                if (!payload.new || Array.isArray(payload.new)) {
                  return current;
                }

                return {
                  ...current,
                  notificationPreferences: mapNotificationPreferencesRecord(
                    payload.new as Record<string, unknown>,
                  ),
                };
              });
            });
          },
        )
        .subscribe();
    };

    void subscribeToNotifications();

    return () => {
      isCancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    if (!businessProfile) {
      return;
    }

    startTransition(() => {
      setBootstrapState((current) => syncBootstrapChannelFromBusinessProfile(current, businessProfile));
    });
  }, [businessProfile]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      bootstrap,
      businessProfile,
      defaultInboxInsights,
      isDefaultInboxInsightsLoading,
      isBusinessProfileLoading,
      businessProfileError,
      isLoading,
      error,
      refresh,
      refreshBusinessProfile,
      refreshDefaultInboxInsights,
      setBootstrap: (updater) => {
        startTransition(() => {
          setBootstrapState((current) => updater(current));
        });
      },
      setBusinessProfile: (updater) => {
        startTransition(() => {
          setBusinessProfileState((current) => updater(current));
        });
      },
    }),
    [
      bootstrap,
      businessProfile,
      businessProfileError,
      defaultInboxInsights,
      error,
      isDefaultInboxInsightsLoading,
      isBusinessProfileLoading,
      isLoading,
      refresh,
      refreshBusinessProfile,
      refreshDefaultInboxInsights,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider.');
  }

  return context;
}
