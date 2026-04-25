import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getCachedSession, supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useAppData } from '../context/AppDataContext';
import UserAvatar from '../components/UserAvatar';
import BrandMark from '../components/BrandMark';
import DashboardCallPopup from '../components/DashboardCallPopup';
import NotificationFeed from '../components/NotificationFeed';
import { CallManagerProvider } from '../context/CallManagerContext';
import { appApi } from '../lib/api';
import { useEscapeKey } from '../lib/useEscapeKey';
import { getAuthUserDisplayName, getAuthUserProfilePictureUrl } from '../lib/userProfile';
import { getDefaultNotificationPreferences, getUnreadNotificationCount } from '../lib/notifications';
import { playNotificationChime } from '../lib/soundManager';
import {
  MessageSquare, 
  Users, 
  Megaphone, 
  FileText, 
  Zap, 
  GitMerge, 
  Phone, 
  Settings, 
  Activity,
  Search,
  Bell,
  Menu,
  Home,
  Link2,
  ChevronDown,
  ChevronRight,
  LogOut,
  HelpCircle,
  Code,
  Puzzle,
  List,
  Package,
  Store,
  UserCircle,
  AlertTriangle,
  Mail,
  Webhook,
  X,
} from 'lucide-react';

const HELP_CENTER_URL = 'https://www.connektly.in/help/';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'connektly-sidebar-collapsed';

type NavIcon = typeof Home;

type SidebarChildItem = {
  icon: NavIcon;
  label: string;
  path: string;
  activePaths?: string[];
  activePrefixes?: string[];
};

type SidebarLinkItem = {
  id: string;
  type: 'link';
  icon: NavIcon;
  label: string;
  path: string;
  activePaths?: string[];
  activePrefixes?: string[];
};

type SidebarDropdownItem = {
  id: string;
  type: 'dropdown';
  icon: NavIcon;
  label: string;
  isOpen: boolean;
  toggle: () => void;
  children: SidebarChildItem[];
};

type SidebarItem = SidebarLinkItem | SidebarDropdownItem;

function isSidebarRouteActive(
  pathname: string,
  path: string,
  activePaths: string[] = [],
  activePrefixes: string[] = [],
) {
  if ([path, ...activePaths].includes(pathname)) {
    return true;
  }

  return activePrefixes.some((prefix) => pathname.startsWith(prefix));
}

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }

  const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);

  if (storedValue !== null) {
    return storedValue === 'true';
  }

  return window.innerWidth < 1280;
}

export default function DashboardLayout() {
  const { bootstrap, setBootstrap } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [activeCollapsedDropdown, setActiveCollapsedDropdown] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCommerceOpen, setIsCommerceOpen] = useState(() => location.pathname.startsWith('/dashboard/commerce'));
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/automations') ||
      location.pathname === '/dashboard/flows',
  );
  const [isEmailsOpen, setIsEmailsOpen] = useState(() => location.pathname.startsWith('/dashboard/emails'));
  const [isChannelsOpen, setIsChannelsOpen] = useState(
    () =>
      location.pathname.startsWith('/dashboard/channels') ||
      location.pathname === '/dashboard/channel-status',
  );
  const [isDeveloperOpen, setIsDeveloperOpen] = useState(() =>
    location.pathname.startsWith('/dashboard/developer'),
  );
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const previousLatestNotificationIdRef = useRef<string | null>(null);
  const showFinishOnboardingCta = Boolean(bootstrap?.profile?.onboardingCompleted && !bootstrap?.channel);
  const displayName = bootstrap?.profile?.fullName || getAuthUserDisplayName(user) || 'User';
  const displaySecondaryText = user?.email || bootstrap?.profile?.companyName || 'Workspace';
  const displayProfilePictureUrl =
    bootstrap?.profile?.profilePictureUrl || getAuthUserProfilePictureUrl(user);
  const notifications = bootstrap?.notifications || [];
  const notificationPreferences =
    bootstrap?.notificationPreferences ||
    getDefaultNotificationPreferences(bootstrap?.profile?.userId || user?.id || '');
  const unreadNotificationCount = useMemo(
    () => getUnreadNotificationCount(notifications),
    [notifications],
  );

  useEffect(() => {
    // Get initial session
    getCachedSession().then((session) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isDesktopSidebarCollapsed));
  }, [isDesktopSidebarCollapsed]);

  useEffect(() => {
    setActiveCollapsedDropdown(null);
  }, [isDesktopSidebarCollapsed, location.pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setIsNotificationsOpen(false);
    setIsAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (notificationsRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsNotificationsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsAccountMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    const latestNotification = notifications[0];

    if (!latestNotification) {
      previousLatestNotificationIdRef.current = null;
      return;
    }

    if (!previousLatestNotificationIdRef.current) {
      previousLatestNotificationIdRef.current = latestNotification.id;
      return;
    }

    if (previousLatestNotificationIdRef.current !== latestNotification.id) {
      previousLatestNotificationIdRef.current = latestNotification.id;

      if (!latestNotification.isRead) {
        playNotificationChime(notificationPreferences);
      }
    }
  }, [notificationPreferences, notifications]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const toggleDesktopSidebar = () => {
    setIsDesktopSidebarCollapsed((previousValue) => !previousValue);
  };

  const markNotificationReadLocally = (notificationId?: string | null) => {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notifications: current.notifications.map((notification) =>
          !notificationId || notification.id === notificationId
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

  const handleNotificationSelect = async (notification: (typeof notifications)[number]) => {
    if (!notification.isRead) {
      markNotificationReadLocally(notification.id);
      void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
    }

    setIsNotificationsOpen(false);

    if (notification.targetPath) {
      navigate(notification.targetPath);
      return;
    }

    navigate('/dashboard/notifications');
  };

  const handleMarkNotificationRead = (notification: (typeof notifications)[number]) => {
    if (notification.isRead) {
      return;
    }

    markNotificationReadLocally(notification.id);
    void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
  };

  const handleMarkAllNotificationsRead = async () => {
    markNotificationReadLocally(null);
    await appApi.markNotificationsRead({ markAll: true });
  };

  useEscapeKey(
    Boolean(
      isSignOutModalOpen ||
        isMobileMenuOpen ||
        isAccountMenuOpen ||
        isNotificationsOpen ||
        activeCollapsedDropdown,
    ),
    () => {
      if (isSignOutModalOpen) {
        setIsSignOutModalOpen(false);
        return;
      }

      if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        return;
      }

      if (isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
        return;
      }

      if (isNotificationsOpen) {
        setIsNotificationsOpen(false);
        return;
      }

      if (activeCollapsedDropdown) {
        setActiveCollapsedDropdown(null);
      }
    },
  );

  const isNavItemActive = (item: Pick<SidebarLinkItem, 'path' | 'activePaths' | 'activePrefixes'>) =>
    isSidebarRouteActive(location.pathname, item.path, item.activePaths, item.activePrefixes);

  const navStructure: SidebarItem[] = [
    { id: 'home', type: 'link', icon: Home, label: 'Home', path: '/dashboard/home' },
    {
      id: 'lead-list',
      type: 'link',
      icon: List,
      label: 'Lead List',
      path: '/dashboard/leads',
      activePaths: ['/dashboard/crm/leads'],
    },
    { id: 'inbox', type: 'link', icon: MessageSquare, label: 'Inbox', path: '/dashboard/inbox' },
    { id: 'calls', type: 'link', icon: Phone, label: 'WhatsApp Calls', path: '/dashboard/calls' },
    { id: 'contacts', type: 'link', icon: Users, label: 'Contacts', path: '/dashboard/contacts' },
    { id: 'templates', type: 'link', icon: FileText, label: 'Templates', path: '/dashboard/templates' },
    {
      id: 'campaigns',
      type: 'link',
      icon: Megaphone,
      label: 'Campaigns',
      path: '/dashboard/campaigns',
      activePaths: ['/dashboard/broadcasts'],
    },
    {
      id: 'automations',
      type: 'dropdown',
      icon: Zap,
      label: 'Automations',
      isOpen: isAutomationsOpen,
      toggle: () => setIsAutomationsOpen((current) => !current),
      children: [
        {
          icon: GitMerge,
          label: 'Flows',
          path: '/dashboard/automations/flows',
          activePaths: ['/dashboard/flows'],
        },
        {
          icon: Zap,
          label: 'Triggers',
          path: '/dashboard/automations/triggers',
          activePaths: ['/dashboard/automations'],
        },
      ],
    },
    { id: 'profile', type: 'link', icon: UserCircle, label: 'Business Profile', path: '/dashboard/profile' },
    {
      id: 'commerce',
      type: 'dropdown',
      icon: Store,
      label: 'Commerce Manager',
      isOpen: isCommerceOpen,
      toggle: () => setIsCommerceOpen((current) => !current),
      children: [
        {
          icon: Package,
          label: 'Catalog',
          path: '/dashboard/commerce/catalog',
          activePaths: ['/dashboard/commerce'],
        },
      ],
    },
    {
      id: 'emails',
      type: 'dropdown',
      icon: Mail,
      label: 'Emails',
      isOpen: isEmailsOpen,
      toggle: () => setIsEmailsOpen((current) => !current),
      children: [
        {
          icon: Mail,
          label: 'Inbox',
          path: '/dashboard/emails/inbox',
          activePaths: ['/dashboard/emails'],
        },
        {
          icon: FileText,
          label: 'Template Builder',
          path: '/dashboard/emails/template-builder',
        },
      ],
    },
    {
      id: 'channels',
      type: 'dropdown',
      icon: Activity,
      label: 'Channels',
      isOpen: isChannelsOpen,
      toggle: () => setIsChannelsOpen((current) => !current),
      children: [
        {
          icon: MessageSquare,
          label: 'Meta Channels',
          path: '/dashboard/channels/meta',
          activePaths: ['/dashboard/channels', '/dashboard/channel-status'],
        },
        {
          icon: Link2,
          label: 'Other Channels',
          path: '/dashboard/channels/other',
        },
      ],
    },
    {
      id: 'integrations',
      type: 'link',
      icon: Puzzle,
      label: 'Integrations',
      path: '/dashboard/integrations',
    },
    {
      id: 'developer',
      type: 'dropdown',
      icon: Code,
      label: 'Developer Tools',
      isOpen: isDeveloperOpen,
      toggle: () => setIsDeveloperOpen((current) => !current),
      children: [
        {
          icon: Code,
          label: 'API',
          path: '/dashboard/developer/api',
          activePaths: ['/dashboard/developer'],
        },
        {
          icon: Webhook,
          label: 'Webhook',
          path: '/dashboard/developer/webhook',
        },
      ],
    },
    { id: 'help', type: 'link', icon: HelpCircle, label: 'Help and Support', path: HELP_CENTER_URL },
  ];

  return (
    <CallManagerProvider>
      <div className="flex h-[100dvh] bg-[#f3f4f6] overflow-hidden font-sans">
      {/* Sidebar (Dark Theme) */}
      <aside
        className={`hidden md:flex flex-col bg-[#111827] text-gray-400 transition-[width] duration-300 z-20 ${
          isDesktopSidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div
          className={`h-16 flex items-center justify-between border-b border-gray-800 shrink-0 ${
            isDesktopSidebarCollapsed ? 'px-3' : 'px-4'
          }`}
        >
          <div className="flex items-center min-w-0">
            <BrandMark className="h-8 w-8 shrink-0" />
            {!isDesktopSidebarCollapsed ? (
              <span className="ml-3 truncate text-white font-bold text-xl tracking-tight">Connektly</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          <nav className="space-y-1 px-3">
            {navStructure.map((item) => {
              if (item.type === 'link') {
                const isExternalLink = item.path.startsWith('http');
                const isActive = isExternalLink ? false : isNavItemActive(item);

                if (isExternalLink) {
                  return (
                    <a
                      key={item.id}
                      href={item.path}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setActiveCollapsedDropdown(null)}
                      className={`flex items-center px-3 py-3 rounded-xl transition-colors group relative hover:bg-gray-800 hover:text-white ${
                        isDesktopSidebarCollapsed ? 'justify-center' : ''
                      }`}
                      title={item.label}
                    >
                      <item.icon className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-white" />
                      {!isDesktopSidebarCollapsed ? (
                        <span className="ml-3 text-sm font-medium whitespace-nowrap">
                          {item.label}
                        </span>
                      ) : null}
                      {isDesktopSidebarCollapsed ? (
                        <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {item.label}
                        </div>
                      ) : null}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.id}
                    to={item.path!}
                    onClick={() => setActiveCollapsedDropdown(null)}
                    className={`flex items-center px-3 py-3 rounded-xl transition-colors group relative ${
                      isActive 
                        ? 'bg-[#5b45ff] text-white' 
                        : 'hover:bg-gray-800 hover:text-white'
                    } ${
                      isDesktopSidebarCollapsed ? 'justify-center' : ''
                    }`}
                    title={item.label}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                    {!isDesktopSidebarCollapsed ? (
                      <span className="ml-3 text-sm font-medium whitespace-nowrap">
                        {item.label}
                      </span>
                    ) : null}
                    {isDesktopSidebarCollapsed ? (
                      <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {item.label}
                      </div>
                    ) : null}
                  </NavLink>
                );
              }

              if (item.type === 'dropdown') {
                const isChildActive = item.children.some((child) => isNavItemActive(child));
                const isCollapsedFlyoutOpen = isDesktopSidebarCollapsed && activeCollapsedDropdown === item.id;
                const shouldHighlightDropdownTrigger = isDesktopSidebarCollapsed
                  ? isChildActive || isCollapsedFlyoutOpen
                  : Boolean(isChildActive && !item.isOpen);
                
                return (
                  <div key={item.id} className="space-y-1 relative">
                    <button
                      onClick={() => {
                        if (isDesktopSidebarCollapsed) {
                          setActiveCollapsedDropdown((currentValue) => currentValue === item.id ? null : item.id);
                          return;
                        }

                        item.toggle();
                      }}
                      className={`w-full flex items-center px-3 py-3 rounded-xl transition-colors group relative ${
                        shouldHighlightDropdownTrigger
                          ? 'bg-gray-800 text-white' 
                          : 'hover:bg-gray-800 hover:text-white'
                      } ${
                        isDesktopSidebarCollapsed ? 'justify-center' : 'justify-between'
                      }`}
                      title={item.label}
                    >
                      <div className="flex items-center">
                        <item.icon className={`w-5 h-5 shrink-0 ${isChildActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                        {!isDesktopSidebarCollapsed ? (
                          <span className="ml-3 text-sm font-medium whitespace-nowrap">
                            {item.label}
                          </span>
                        ) : null}
                      </div>
                      {!isDesktopSidebarCollapsed ? (
                        item.isOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        )
                      ) : null}
                      {isDesktopSidebarCollapsed ? (
                        <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {item.label}
                        </div>
                      ) : null}
                    </button>

                    <AnimatePresence>
                      {!isDesktopSidebarCollapsed && item.isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-11 pr-3 py-1 space-y-1">
                            {item.children.map((child, childIndex) => {
                              const isActive = isNavItemActive(child);
                              return (
                                <NavLink
                                  key={childIndex}
                                  to={child.path}
                                  className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm ${
                                    isActive 
                                      ? 'bg-[#5b45ff] text-white font-medium' 
                                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                  }`}
                                >
                                  <child.icon className={`w-4 h-4 mr-3 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                  <span className="truncate">{child.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {isCollapsedFlyoutOpen ? (
                        <motion.div
                          initial={{ opacity: 0, x: -8, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -8, scale: 0.98 }}
                          className="absolute left-full top-0 z-50 ml-3 w-64 rounded-2xl border border-gray-800 bg-[#111827] p-2 shadow-2xl"
                        >
                          <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                            {item.label}
                          </div>
                          <div className="space-y-1">
                            {item.children.map((child, childIndex) => {
                              const isActive = isNavItemActive(child);
                              return (
                                <NavLink
                                  key={childIndex}
                                  to={child.path}
                                  onClick={() => setActiveCollapsedDropdown(null)}
                                  className={`flex items-center px-3 py-2.5 rounded-xl transition-colors text-sm ${
                                    isActive
                                      ? 'bg-[#5b45ff] text-white font-medium'
                                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                  }`}
                                >
                                  <child.icon className={`w-4 h-4 mr-3 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                  <span className="truncate">{child.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              }
              return null;
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-800 space-y-1 shrink-0">
          <NavLink
            to="/dashboard/settings"
            onClick={() => setActiveCollapsedDropdown(null)}
            className={`flex items-center px-3 py-3 rounded-xl hover:bg-gray-800 hover:text-white transition-colors group relative ${
              isDesktopSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-white" />
            {!isDesktopSidebarCollapsed ? <span className="ml-3 text-sm font-medium">Settings</span> : null}
            {isDesktopSidebarCollapsed ? (
              <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Settings
              </div>
            ) : null}
          </NavLink>
          <button
            onClick={() => setIsSignOutModalOpen(true)}
            className={`w-full flex items-center px-3 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors group relative text-gray-400 ${
              isDesktopSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Sign out"
          >
            <LogOut className="w-5 h-5 shrink-0 group-hover:text-red-500" />
            {!isDesktopSidebarCollapsed ? <span className="ml-3 text-sm font-medium">Sign out</span> : null}
            {isDesktopSidebarCollapsed ? (
              <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Sign out
              </div>
            ) : null}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header (Dark Theme) */}
        <header className="h-16 bg-[#111827] border-b border-gray-800 flex items-center justify-between px-3 sm:px-6 z-10 shrink-0">
          <div className="flex min-w-0 items-center flex-1">
            <button 
              className="md:hidden p-2 mr-2 text-gray-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="max-w-md w-full hidden sm:block relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search here..." 
                className="w-full bg-gray-800 text-white placeholder-gray-500 border-none rounded-lg pl-10 pr-4 py-2 focus:ring-1 focus:ring-[#5b45ff] focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  setIsNotificationsOpen((current) => !current);
                }}
                className="text-gray-400 hover:text-white transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-[#5b45ff] text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-[#111827]">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                ) : null}
              </button>

              <AnimatePresence>
                {isNotificationsOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute right-0 top-full z-40 mt-3 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
                  >
                    <div className="border-b border-gray-100 px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Notifications</p>
                          <h3 className="mt-1 text-lg font-bold text-gray-900">Recent activity</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleMarkAllNotificationsRead()}
                          disabled={unreadNotificationCount === 0}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mark all read
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto bg-[#f8fafc] p-4">
                      <NotificationFeed
                        notifications={notifications.slice(0, 8)}
                        compact
                        onSelect={handleNotificationSelect}
                        onMarkRead={handleMarkNotificationRead}
                        emptyTitle="No recent notifications"
                        emptyDescription="New activity will appear here as your workspace updates."
                      />
                    </div>

                    <div className="border-t border-gray-100 bg-white px-5 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          navigate('/dashboard/notifications');
                        }}
                        className="w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937]"
                      >
                        View all notifications
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            
            <div className="relative border-l border-gray-800 pl-3 sm:pl-4" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setIsAccountMenuOpen((current) => !current);
                }}
                className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-gray-800/80"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white leading-tight">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500 truncate max-w-[150px]">
                    {displaySecondaryText}
                  </p>
                </div>
                <UserAvatar
                  name={displayName}
                  imageUrl={displayProfilePictureUrl}
                  className="h-8 w-8 border border-gray-700 shadow-sm"
                  initialsClassName="text-xs font-bold"
                />
                <ChevronDown
                  className={`hidden h-4 w-4 text-gray-500 transition sm:block ${
                    isAccountMenuOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {isAccountMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute right-0 top-full z-40 mt-3 w-[260px] overflow-hidden rounded-[26px] border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
                  >
                    <div className="border-b border-gray-100 bg-[#f8fafc] px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Account</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{displayName}</p>
                      <p className="mt-1 truncate text-sm text-gray-500">{displaySecondaryText}</p>
                    </div>

                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          navigate('/dashboard/settings');
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Settings className="h-4 w-4 text-gray-400" />
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          setIsSignOutModalOpen(true);
                        }}
                        className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4 text-red-500" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Content Scrollable Area */}
        <main className="flex-1 overflow-auto bg-[#f3f4f6] p-3 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          {showFinishOnboardingCta ? (
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">WhatsApp is still disconnected.</p>
                <p className="text-sm text-amber-800">
                  Finish onboarding to connect your real WhatsApp account and unlock live inbox, templates, and channel status.
                </p>
              </div>
              <button
                onClick={() => navigate('/onboarding/channel-connection')}
                className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-950"
              >
                Finish onboarding
              </button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              aria-label="Close mobile menu"
            />

            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative z-10 flex h-full w-[min(88vw,22rem)] flex-col bg-[#111827] text-gray-300 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandMark className="h-9 w-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">Connektly</p>
                    <p className="truncate text-xs text-gray-500">{displaySecondaryText}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-800 hover:text-white"
                  aria-label="Close mobile menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-gray-800 px-4 py-4">
                <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 px-3 py-3">
                  <UserAvatar
                    name={displayName}
                    imageUrl={displayProfilePictureUrl}
                    className="h-10 w-10 border border-gray-700"
                    initialsClassName="text-sm font-bold"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                    <p className="truncate text-xs text-gray-500">{user?.email || displaySecondaryText}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
                <nav className="space-y-1">
                  {navStructure.map((item) => {
                    if (item.type === 'link') {
                      const isExternalLink = item.path.startsWith('http');
                      const isActive = isExternalLink ? false : isNavItemActive(item);

                      if (isExternalLink) {
                        return (
                          <a
                            key={item.id}
                            href={item.path}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
                          >
                            <item.icon className="h-5 w-5 shrink-0 text-gray-400" />
                            <span className="truncate">{item.label}</span>
                          </a>
                        );
                      }

                      return (
                        <NavLink
                          key={item.id}
                          to={item.path!}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                            isActive
                              ? 'bg-[#5b45ff] text-white'
                              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      );
                    }

                    if (item.type === 'dropdown') {
                      const isChildActive = item.children.some((child) => isNavItemActive(child));

                      return (
                        <div key={item.id} className="space-y-1">
                          <button
                            type="button"
                            onClick={item.toggle}
                            className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium transition ${
                              isChildActive
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <item.icon className="h-5 w-5 shrink-0 text-gray-400" />
                              <span className="truncate">{item.label}</span>
                            </span>
                            {item.isOpen ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                            )}
                          </button>

                          <AnimatePresence initial={false}>
                            {item.isOpen ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-1 pl-4">
                                  {item.children.map((child) => {
                                    const isActive = isNavItemActive(child);

                                    return (
                                      <NavLink
                                        key={child.path}
                                        to={child.path}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                                          isActive
                                            ? 'bg-[#5b45ff] text-white'
                                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}
                                      >
                                        <child.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                        <span className="truncate">{child.label}</span>
                                      </NavLink>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    return null;
                  })}
                </nav>
              </div>

              <div className="space-y-1 border-t border-gray-800 p-3">
                <NavLink
                  to="/dashboard/settings"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
                >
                  <Settings className="h-5 w-5 shrink-0 text-gray-400" />
                  <span>Settings</span>
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsSignOutModalOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Sign Out Confirmation Modal */}
      <AnimatePresence>
        {isSignOutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSignOutModalOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative z-10 p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Sign out</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to sign out of your account? You will need to log in again to access your dashboard.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsSignOutModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSignOut}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                >
                  Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <DashboardCallPopup />
    </div>
    </CallManagerProvider>
  );
}
