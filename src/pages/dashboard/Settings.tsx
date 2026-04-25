import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Copy,
  CreditCard,
  Globe,
  ImagePlus,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  TicketPercent,
  User,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { User as SupabaseUser, type Factor } from '@supabase/supabase-js';
import UserAvatar from '../../components/UserAvatar';
import { getCachedSession, supabase } from '../../lib/supabase';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { playNotificationChime, previewNotificationSound } from '../../lib/soundManager';
import {
  getAuthUserDisplayName,
  getAuthUserProfilePictureUrl,
  getAuthUserProviderLabel,
} from '../../lib/userProfile';
import type {
  InviteWorkspaceUserInput,
  NotificationPreferencesUpdateInput,
  WorkspaceTeamMember,
} from '../../lib/types';

const USER_ROLE_OPTIONS: Array<{
  value: InviteWorkspaceUserInput['role'];
  label: string;
  description: string;
}> = [
  { value: 'Admin', label: 'Admin', description: 'Full workspace access and team visibility.' },
  { value: 'Manager', label: 'Manager', description: 'Operational access to leads, inbox, and reports.' },
  { value: 'Agent', label: 'Agent', description: 'Day-to-day inbox and CRM execution access.' },
];

const SETTINGS_TAB_IDS = [
  'profile',
  'organization',
  'security',
  'team',
  'notifications',
  'subscription',
] as const;
type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

const NOTIFICATION_SOUND_OPTIONS = [
  { value: 'classic', label: 'Classic chime' },
  { value: 'soft', label: 'Soft tone' },
  { value: 'pulse', label: 'Pulse alert' },
] as const;

const ORGANIZATION_INDUSTRY_OPTIONS = [
  'Automative',
  'Beauty, spa nd salon',
  'Clothing',
  'Education',
  'Entertainment',
  'Online gambling and gaming',
  'Non-online gambling and gaming (e.g. brick and mortar)',
  'Event planning and service',
  'Matrimonial Service',
  'Finance and Banking',
  'Food and groceries',
  'Alcoholic drinks',
  'Public service',
  'Hotel and lodging',
  'Medical and health',
  'Over-the-counter medicine',
  'Charity',
  'Professional services',
  'Shopping and retail',
  'Travel and transportation',
  'Restaurant',
  'Other',
] as const;

const INITIAL_INVITE_FORM: InviteWorkspaceUserInput = {
  fullName: '',
  email: '',
  role: 'Admin',
};

type SecurityFactor = Factor<'totp' | 'phone' | 'webauthn', 'verified' | 'unverified'>;

interface PendingTotpEnrollment {
  factorId: string;
  friendlyName: string;
  qrCode: string;
  secret: string;
  uri: string;
  challengeId: string;
}

function formatAssuranceLevel(level: string | null) {
  if (level === 'aal2') {
    return 'Protected';
  }

  return 'Standard';
}

function getProfileIdentity(currentUser: SupabaseUser | null, fullName: string, email: string | null) {
  return {
    displayName:
      fullName.trim() ||
      getAuthUserDisplayName(currentUser) ||
      email ||
      'Workspace User',
    pictureUrl: getAuthUserProfilePictureUrl(currentUser),
  };
}

function SettingsModal({
  title,
  subtitle,
  onClose,
  children,
  size = 'default',
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className={`w-full ${size === 'wide' ? 'max-w-4xl' : 'max-w-xl'} max-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

function TeamRoleBadge({ role }: { role: WorkspaceTeamMember['role'] }) {
  const tone =
    role === 'Owner'
      ? 'bg-slate-900 text-white'
      : role === 'Admin'
        ? 'bg-violet-100 text-violet-700'
        : role === 'Manager'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-700';

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{role}</span>;
}

function TeamStatusBadge({ status }: { status: WorkspaceTeamMember['status'] }) {
  const tone =
    status === 'active'
      ? 'border border-green-200 bg-green-50 text-green-700'
      : 'border border-amber-200 bg-amber-50 text-amber-700';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status === 'active' ? 'Active' : 'Invite sent'}
    </span>
  );
}

function TeamInviteModal({
  form,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  form: InviteWorkspaceUserInput;
  isSubmitting: boolean;
  onChange: (field: keyof InviteWorkspaceUserInput, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5b45ff]">User Management</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Add User</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Invite a teammate with their name, email address, and assigned role.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={form.fullName}
              onChange={(event) => onChange('fullName', event.target.value)}
              placeholder="Enter full name"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange('email', event.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Role Assigned</span>
            <select
              value={form.role}
              onChange={(event) => onChange('role', event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            >
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          {USER_ROLE_OPTIONS.find((option) => option.value === form.role)?.description}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const normalizedRequestedTab: SettingsTabId = SETTINGS_TAB_IDS.includes((requestedTab as SettingsTabId) || 'profile')
    ? ((requestedTab as SettingsTabId) || 'profile')
    : 'profile';
  const { bootstrap, refresh, setBootstrap } = useAppData();
  const billingDateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const teamDateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const [activeTab, setActiveTab] = useState<SettingsTabId>(normalizedRequestedTab);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    companyName: '',
    companyWebsite: '',
    industry: '',
  });
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [companyLogoPreviewUrl, setCompanyLogoPreviewUrl] = useState<string | null>(null);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [isUploadingCompanyLogo, setIsUploadingCompanyLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileSecurityError, setProfileSecurityError] = useState<string | null>(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isResendingEmailChange, setIsResendingEmailChange] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordNonce, setPasswordNonce] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSendingPasswordCode, setIsSendingPasswordCode] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<SecurityFactor[]>([]);
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);
  const [mfaCurrentLevel, setMfaCurrentLevel] = useState<string | null>(null);
  const [mfaNextLevel, setMfaNextLevel] = useState<string | null>(null);
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [isSendingMfaNotice, setIsSendingMfaNotice] = useState(false);
  const [mfaNoticeSent, setMfaNoticeSent] = useState(false);
  const [mfaOtpCode, setMfaOtpCode] = useState('');
  const [isMfaOtpConfirmed, setIsMfaOtpConfirmed] = useState(false);
  const [mfaFriendlyName, setMfaFriendlyName] = useState('Connektly Authenticator');
  const [pendingTotpEnrollment, setPendingTotpEnrollment] = useState<PendingTotpEnrollment | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [teamMembers, setTeamMembers] = useState<WorkspaceTeamMember[] | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteWorkspaceUserInput>(INITIAL_INVITE_FORM);
  const [isInviting, setIsInviting] = useState(false);
  const [notificationSettingsForm, setNotificationSettingsForm] =
    useState<NotificationPreferencesUpdateInput>({
      enabled: true,
      soundEnabled: true,
      callSoundEnabled: true,
      soundPreset: 'classic',
      volume: 0.8,
      templateReviewEnabled: true,
      missedCallEnabled: true,
      leadEnabled: true,
      teamJoinedEnabled: true,
    });
  const [notificationSettingsNotice, setNotificationSettingsNotice] = useState<string | null>(null);
  const [notificationSettingsError, setNotificationSettingsError] = useState<string | null>(null);
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const companyLogoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getCachedSession().then((session) => {
      setCurrentUser(session?.user ?? null);
      setEmailDraft(session?.user?.new_email || session?.user?.email || '');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        setEmailDraft(session.user.new_email || session.user.email || '');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setForm({
      fullName: bootstrap?.profile?.fullName || getAuthUserDisplayName(currentUser) || '',
      phone: bootstrap?.profile?.phone || '',
      companyName: bootstrap?.profile?.companyName || '',
      companyWebsite: bootstrap?.profile?.companyWebsite || '',
      industry: bootstrap?.profile?.industry || '',
    });
  }, [
    bootstrap?.profile?.companyName,
    bootstrap?.profile?.companyWebsite,
    bootstrap?.profile?.fullName,
    bootstrap?.profile?.industry,
    bootstrap?.profile?.phone,
    currentUser,
  ]);

  useEffect(() => {
    if (!profilePhotoPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(profilePhotoPreviewUrl);
    };
  }, [profilePhotoPreviewUrl]);

  useEffect(() => {
    if (!companyLogoPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(companyLogoPreviewUrl);
    };
  }, [companyLogoPreviewUrl]);

  useEffect(() => {
    if (normalizedRequestedTab !== activeTab) {
      setActiveTab(normalizedRequestedTab);
    }
  }, [normalizedRequestedTab]);

  useEffect(() => {
    const currentQueryTab = searchParams.get('tab');

    if (currentQueryTab === activeTab) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('tab', activeTab);
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    const preferences = bootstrap?.notificationPreferences;

    if (!preferences) {
      return;
    }

    setNotificationSettingsForm({
      enabled: preferences.enabled,
      soundEnabled: preferences.soundEnabled,
      callSoundEnabled: preferences.callSoundEnabled,
      soundPreset: preferences.soundPreset,
      volume: preferences.volume,
      templateReviewEnabled: preferences.templateReviewEnabled,
      missedCallEnabled: preferences.missedCallEnabled,
      leadEnabled: preferences.leadEnabled,
      teamJoinedEnabled: preferences.teamJoinedEnabled,
    });
  }, [bootstrap?.notificationPreferences]);

  useEffect(() => {
    if (activeTab !== 'team' || teamMembers !== null) {
      return;
    }

    let isCancelled = false;

    const loadTeamMembers = async () => {
      try {
        setIsTeamLoading(true);
        setTeamError(null);
        const response = await appApi.getTeamMembers();
        if (!isCancelled) {
          setTeamMembers(response.members);
        }
      } catch (error) {
        if (!isCancelled) {
          setTeamError(error instanceof Error ? error.message : 'Failed to load workspace users.');
        }
      } finally {
        if (!isCancelled) {
          setIsTeamLoading(false);
        }
      }
    };

    void loadTeamMembers();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, teamMembers]);

  useEffect(() => {
    if (activeTab !== 'security') {
      return;
    }

    void refreshProfileSecurityState();
  }, [activeTab]);

  const tabs: Array<{ id: SettingsTabId; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile Management', icon: User },
    { id: 'organization', label: 'Organization Management', icon: Globe },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'team', label: 'User Management', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
  ];
  const emailAddress = currentUser?.email || bootstrap?.profile?.email || null;
  const { displayName, pictureUrl: authProfilePictureUrl } = getProfileIdentity(
    currentUser,
    form.fullName || bootstrap?.profile?.fullName || '',
    emailAddress,
  );
  const authProfileProviderLabel = getAuthUserProviderLabel(currentUser);
  const resolvedProfilePictureUrl =
    profilePhotoPreviewUrl || bootstrap?.profile?.profilePictureUrl || authProfilePictureUrl;
  const resolvedCompanyLogoUrl = companyLogoPreviewUrl || bootstrap?.profile?.companyLogoUrl || null;

  const handleProfilePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Profile picture must be a PNG or JPEG image.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile picture must be 5 MB or smaller.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    setError(null);
    setProfileNotice(null);
    setIsUploadingProfilePhoto(true);
    setProfilePhotoPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadProfilePhoto(file);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfilePhotoPreviewUrl(response.profile?.profilePictureUrl || null);
      setProfileNotice('Profile picture updated.');
    } catch (uploadError) {
      setProfilePhotoPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload profile picture.');
    } finally {
      setIsUploadingProfilePhoto(false);
      input.value = '';
    }
  };

  const handleCompanyLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Company logo must be a PNG or JPEG image.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Company logo must be 5 MB or smaller.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    setError(null);
    setProfileNotice(null);
    setIsUploadingCompanyLogo(true);
    setCompanyLogoPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadCompanyLogo(file);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setCompanyLogoPreviewUrl(response.profile?.companyLogoUrl || null);
      setProfileNotice('Company logo updated.');
    } catch (uploadError) {
      setCompanyLogoPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload company logo.');
    } finally {
      setIsUploadingCompanyLogo(false);
      input.value = '';
    }
  };

  const handleSaveProfileDetails = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        fullName: form.fullName,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfileNotice('Profile details updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrganizationDetails = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        companyName: form.companyName,
        companyWebsite: form.companyWebsite,
        industry: form.industry,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfileNotice('Organization details updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save organization details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePhone = async () => {
    try {
      setIsUpdatingPhone(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        phone: phoneDraft,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setForm((current) => ({
        ...current,
        phone: response.profile?.phone || '',
      }));
      setPhoneDraft(response.profile?.phone || '');
      setIsPhoneModalOpen(false);
      setProfileNotice('Contact number updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update contact number.');
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  const updateNotificationSetting = <K extends keyof NotificationPreferencesUpdateInput>(
    key: K,
    value: NotificationPreferencesUpdateInput[K],
  ) => {
    setNotificationSettingsNotice(null);
    setNotificationSettingsError(null);
    setNotificationSettingsForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveNotificationSettings = async () => {
    try {
      setIsSavingNotificationSettings(true);
      setNotificationSettingsError(null);
      setNotificationSettingsNotice(null);
      const response = await appApi.saveNotificationPreferences(notificationSettingsForm);
      setNotificationSettingsForm({
        enabled: response.preferences.enabled,
        soundEnabled: response.preferences.soundEnabled,
        callSoundEnabled: response.preferences.callSoundEnabled,
        soundPreset: response.preferences.soundPreset,
        volume: response.preferences.volume,
        templateReviewEnabled: response.preferences.templateReviewEnabled,
        missedCallEnabled: response.preferences.missedCallEnabled,
        leadEnabled: response.preferences.leadEnabled,
        teamJoinedEnabled: response.preferences.teamJoinedEnabled,
      });
      setNotificationSettingsNotice('Notification settings updated.');
      await refresh();
    } catch (error) {
      setNotificationSettingsError(
        error instanceof Error ? error.message : 'Failed to update notification settings.',
      );
    } finally {
      setIsSavingNotificationSettings(false);
    }
  };

  const refreshProfileSecurityState = async (options?: { quiet?: boolean }) => {
    try {
      if (!options?.quiet) {
        setIsSecurityLoading(true);
      }

      const [session, factorsResult, assuranceResult] = await Promise.all([
        getCachedSession(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      setCurrentUser(session?.user ?? null);
      setEmailDraft(session?.user?.new_email || session?.user?.email || '');
      setMfaFactors(
        ((factorsResult.data?.all as SecurityFactor[] | undefined) || []).filter((factor) =>
          factor.factor_type === 'totp' || factor.factor_type === 'phone' || factor.factor_type === 'webauthn',
        ),
      );
      setMfaCurrentLevel(assuranceResult.data?.currentLevel || null);
      setMfaNextLevel(assuranceResult.data?.nextLevel || null);
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to load profile security settings.',
      );
    } finally {
      if (!options?.quiet) {
        setIsSecurityLoading(false);
      }
    }
  };

  const handleRequestEmailChange = async () => {
    try {
      const nextEmail = emailDraft.trim().toLowerCase();
      if (!nextEmail) {
        throw new Error('Enter the email address you want to use.');
      }

      if (nextEmail === (currentUser?.email || '').toLowerCase()) {
        throw new Error('Enter a different email address to request a change.');
      }

      setIsUpdatingEmail(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { data, error } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: `${window.location.origin}/login` },
      );

      if (error) {
        throw error;
      }

      setCurrentUser(data.user ?? currentUser);
      setProfileNotice('Email change requested. Check your inbox to complete the update.');
      setIsEmailModalOpen(false);
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to request an email change.',
      );
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleResendEmailChange = async () => {
    try {
      if (!currentUser?.new_email) {
        throw new Error('There is no pending email change to resend.');
      }

      setIsResendingEmailChange(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.resend({
        type: 'email_change',
        email: currentUser.new_email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        throw error;
      }

      setProfileNotice('Confirmation email resent for the pending email change.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to resend the email change confirmation.',
      );
    } finally {
      setIsResendingEmailChange(false);
    }
  };

  const handleSendPasswordCode = async () => {
    try {
      setIsSendingPasswordCode(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        throw error;
      }

      setProfileNotice('A password change verification code has been sent to your email.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to send the password change code.',
      );
    } finally {
      setIsSendingPasswordCode(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!passwordNonce.trim()) {
        throw new Error('Enter the verification code sent to your email.');
      }

      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }

      if (newPassword !== confirmPassword) {
        throw new Error('The new password and confirmation password do not match.');
      }

      setIsUpdatingPassword(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        nonce: passwordNonce.trim(),
      });

      if (error) {
        throw error;
      }

      setPasswordNonce('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordModalOpen(false);
      setProfileNotice('Password updated successfully.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to update the password.',
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleStartMfaSetup = async () => {
    try {
      setIsSendingMfaNotice(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        throw error;
      }

      setMfaNoticeSent(true);
      setIsMfaOtpConfirmed(false);
      setMfaOtpCode('');
      setPendingTotpEnrollment(null);
      setProfileNotice('An 8-digit verification code has been sent to your email address.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to send the verification code email.',
      );
    } finally {
      setIsSendingMfaNotice(false);
    }
  };

  const handleConfirmMfaOtp = () => {
    const normalizedOtp = mfaOtpCode.trim();

    if (!/^\d{8}$/.test(normalizedOtp)) {
      setProfileSecurityError('Enter the 8-digit numeric code from your email.');
      return;
    }

    setProfileSecurityError(null);
    setIsMfaOtpConfirmed(true);
    setProfileNotice('OTP received. You can continue to authenticator setup.');
  };

  const handleGenerateTotp = async () => {
    try {
      if (!mfaNoticeSent) {
        throw new Error('Send the verification code email before generating the authenticator QR code.');
      }

      if (!isMfaOtpConfirmed) {
        throw new Error('Enter and confirm the 8-digit OTP before generating the authenticator QR code.');
      }

      setIsSettingUpMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);
      setPendingTotpEnrollment(null);

      const staleFactors = mfaFactors.filter(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      );
      for (const factor of staleFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) {
          throw error;
        }
      }

      const friendlyName = mfaFriendlyName.trim() || 'Connektly Authenticator';
      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (enrollError) {
        throw enrollError;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.id,
      });

      if (challengeError) {
        throw challengeError;
      }

      setPendingTotpEnrollment({
        factorId: enrollment.id,
        friendlyName,
        qrCode: enrollment.totp.qr_code,
        secret: enrollment.totp.secret,
        uri: enrollment.totp.uri,
        challengeId: challenge.id,
      });
      setProfileNotice('Scan the QR code with your authenticator app, then enter the 6-digit code.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to prepare MFA enrollment.',
      );
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleVerifyTotp = async () => {
    try {
      if (!pendingTotpEnrollment) {
        throw new Error('Generate a new authenticator QR code first.');
      }

      if (!mfaVerificationCode.trim()) {
        throw new Error('Enter the 6-digit code from your authenticator app.');
      }

      setIsSettingUpMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.mfa.verify({
        factorId: pendingTotpEnrollment.factorId,
        challengeId: pendingTotpEnrollment.challengeId,
        code: mfaVerificationCode.trim(),
      });

      if (error) {
        throw error;
      }

      setPendingTotpEnrollment(null);
      setMfaVerificationCode('');
      setMfaNoticeSent(false);
      setIsMfaModalOpen(false);
      setProfileNotice('Multi-factor authentication is now enabled.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to verify the authenticator code.',
      );
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleDisableMfa = async () => {
    const enabledFactors = mfaFactors.filter(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    );

    if (!enabledFactors.length) {
      setProfileSecurityError('No authenticator app is enabled on this account right now.');
      return;
    }

    if (!window.confirm('Disable multi-factor authentication for this account?')) {
      return;
    }

    try {
      setIsDisablingMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      for (const factor of enabledFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) {
          throw error;
        }
      }

      setPendingTotpEnrollment(null);
      setMfaVerificationCode('');
      setMfaNoticeSent(false);
      setIsMfaOtpConfirmed(false);
      setMfaOtpCode('');
      setIsMfaModalOpen(false);
      setProfileNotice('Multi-factor authentication has been disabled.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (disableError) {
      setProfileSecurityError(
        disableError instanceof Error ? disableError.message : 'Failed to disable MFA.',
      );
    } finally {
      setIsDisablingMfa(false);
    }
  };

  const handleCopyTotpSecret = async () => {
    try {
      if (!pendingTotpEnrollment) {
        return;
      }

      await navigator.clipboard.writeText(pendingTotpEnrollment.secret);
      setProfileNotice('Authenticator secret copied to the clipboard.');
    } catch {
      setProfileSecurityError('Failed to copy the authenticator secret.');
    }
  };

  const handleInviteFormChange = (field: keyof InviteWorkspaceUserInput, value: string) => {
    setInviteForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleOpenInviteModal = () => {
    setInviteForm(INITIAL_INVITE_FORM);
    setTeamError(null);
    setTeamSuccess(null);
    setIsInviteModalOpen(true);
  };

  const handleCloseInviteModal = () => {
    if (isInviting) {
      return;
    }

    setIsInviteModalOpen(false);
  };

  const handleInviteUser = async () => {
    try {
      setIsInviting(true);
      setTeamError(null);
      setTeamSuccess(null);

      await appApi.inviteTeamMember({
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        role: inviteForm.role,
      });

      const response = await appApi.getTeamMembers();
      setTeamMembers(response.members);
      setTeamSuccess(`Invite email sent to ${inviteForm.email.trim()}.`);
      setIsInviteModalOpen(false);
      setInviteForm(INITIAL_INVITE_FORM);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Failed to invite user.');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Workspace details now come from your saved profile and connected Meta channel.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 shrink-0">
          <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#5b45ff] text-white shadow-md shadow-[#5b45ff]/20'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-white' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {profileSecurityError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{profileSecurityError}</div>
                ) : null}

                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{profileNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Profile Picture</p>
                    <div className="mt-5 flex flex-col items-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
                      <UserAvatar
                        name={displayName}
                        imageUrl={resolvedProfilePictureUrl}
                        className="h-24 w-24 shadow-lg"
                        initialsClassName="text-3xl font-bold"
                      />
                      <p className="mt-4 text-base font-semibold text-gray-900">{displayName}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">
                        {authProfilePictureUrl && !bootstrap?.profile?.profilePictureUrl
                          ? `Your ${authProfileProviderLabel} profile photo is being used automatically.`
                          : 'Upload a PNG or JPEG image to personalize your workspace profile.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => profilePhotoInputRef.current?.click()}
                        disabled={isUploadingProfilePhoto}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isUploadingProfilePhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        Change Photo
                      </button>
                    </div>
                    <input
                      ref={profilePhotoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <label className="block flex-1">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Full Name</span>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                              type="text"
                              value={form.fullName}
                              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSaveProfileDetails()}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                          Save Full Name
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <Phone className="h-4 w-4 text-gray-400" />
                            Contact Number
                          </div>
                          <p className="mt-3 text-base font-semibold text-gray-900">{form.phone || 'No contact number added yet'}</p>
                          <p className="mt-1 text-sm text-gray-500">Keep this updated so your team can reach you on the right number.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneDraft(form.phone || bootstrap?.profile?.phone || '');
                            setIsPhoneModalOpen(true);
                            setError(null);
                          }}
                          className="shrink-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Change Contact Number
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <Mail className="h-4 w-4 text-gray-400" />
                            Email Address
                          </div>
                          <p className="mt-3 truncate text-base font-semibold text-gray-900">{currentUser?.email || bootstrap?.profile?.email || 'No email available'}</p>
                          <p className="mt-1 text-sm text-gray-500">This email is used for sign-in, account notices, and security confirmations.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEmailDraft(currentUser?.new_email || currentUser?.email || '');
                            setIsEmailModalOpen(true);
                            setProfileSecurityError(null);
                          }}
                          className="shrink-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Update Email Address
                        </button>
                      </div>
                      {currentUser?.new_email ? (
                        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-amber-900">Pending email change</p>
                              <p className="mt-1 text-xs text-amber-800">
                                Waiting for confirmation to switch this account to {currentUser.new_email}.
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isResendingEmailChange}
                              onClick={() => void handleResendEmailChange()}
                              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                            >
                              {isResendingEmailChange ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              Resend confirmation
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'organization' ? (
              <motion.div key="organization" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{profileNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Company Logo</p>
                    <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
                      {resolvedCompanyLogoUrl ? (
                        <img
                          src={resolvedCompanyLogoUrl}
                          alt="Company logo"
                          className="max-h-28 w-auto max-w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white text-gray-400">
                          <ImagePlus className="h-8 w-8" />
                        </div>
                      )}
                      <p className="mt-5 text-base font-semibold text-gray-900">
                        {resolvedCompanyLogoUrl ? 'Current company logo' : 'Upload your company logo'}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">Use a PNG or JPEG image up to 5 MB for your organization identity.</p>
                      <button
                        type="button"
                        onClick={() => companyLogoInputRef.current?.click()}
                        disabled={isUploadingCompanyLogo}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isUploadingCompanyLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {resolvedCompanyLogoUrl ? 'Change Logo' : 'Upload Logo'}
                      </button>
                    </div>
                    <input
                      ref={companyLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleCompanyLogoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                    <h3 className="text-lg font-bold text-gray-900">Organization Details</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      Add the core company information your workspace should use across the platform.
                    </p>

                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Company Name</span>
                        <input
                          type="text"
                          value={form.companyName}
                          onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          placeholder="Enter company name"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Company Website</span>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <input
                            type="url"
                            value={form.companyWebsite}
                            onChange={(event) => setForm((current) => ({ ...current, companyWebsite: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            placeholder="https://example.com"
                          />
                        </div>
                      </label>

                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Industry</span>
                        <select
                          value={form.industry}
                          onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        >
                          <option value="">Select an industry</option>
                          {ORGANIZATION_INDUSTRY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveOrganizationDetails()}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        Save Organization Details
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'security' ? (
              <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {profileSecurityError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{profileSecurityError}</div>
                ) : null}

                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{profileNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Account Security</p>
                          <h2 className="mt-2 text-2xl font-bold text-gray-900">Protect your account access</h2>
                          <p className="mt-3 text-sm leading-6 text-gray-500">
                            Update your password and manage multi-factor authentication from one place.
                          </p>
                        </div>
                        {isSecurityLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <KeyRound className="h-4 w-4 text-gray-400" />
                            Change Password
                          </div>
                          <p className="mt-3 text-sm leading-6 text-gray-500">
                            Request a verification code by email before setting a new password for this account.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordNonce('');
                            setNewPassword('');
                            setConfirmPassword('');
                            setIsPasswordModalOpen(true);
                            setProfileSecurityError(null);
                          }}
                          className="shrink-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Change Password
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <ShieldCheck className="h-4 w-4 text-gray-400" />
                            Multi-Factor Authentication
                          </div>
                          <p className="mt-3 text-sm leading-6 text-gray-500">
                            {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                              ? 'Authenticator app protection is active on this account.'
                              : 'Add an authenticator app for an extra security layer.'}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-gray-500">
                            Current protection: {formatAssuranceLevel(mfaCurrentLevel)}
                            {mfaNextLevel ? ` | Next: ${formatAssuranceLevel(mfaNextLevel)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setMfaNoticeSent(false);
                              setMfaOtpCode('');
                              setIsMfaOtpConfirmed(false);
                              setPendingTotpEnrollment(null);
                              setMfaVerificationCode('');
                              setMfaFriendlyName('Connektly Authenticator');
                              setIsMfaModalOpen(true);
                              setProfileSecurityError(null);
                            }}
                            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                              ? 'Manage MFA'
                              : 'Setup MFA'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              isDisablingMfa ||
                              !mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            }
                            onClick={() => void handleDisableMfa()}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDisablingMfa ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Disable MFA
                          </button>
                        </div>
                      </div>

                      {mfaFactors.filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified').length > 0 ? (
                        <div className="mt-5 space-y-3">
                          {mfaFactors
                            .filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            .map((factor) => (
                              <div key={factor.id} className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                                <div>
                                  <p className="text-sm font-semibold text-green-900">{factor.friendly_name || 'Authenticator app'}</p>
                                  <p className="mt-1 text-xs text-green-700">Verified TOTP factor</p>
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Enabled
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Security Summary</p>
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Login email</p>
                        <p className="mt-2 break-all text-sm font-semibold text-gray-900">{currentUser?.email || bootstrap?.profile?.email || 'Not available'}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Authenticator status</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            ? 'Enabled'
                            : 'Not enabled'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Protection level</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{formatAssuranceLevel(mfaCurrentLevel)}</p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-xs leading-6 text-gray-500">
                      Email confirmations, password reset codes, and MFA verification codes are sent automatically during each security step.
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'team' ? (
              <motion.div key="team" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5b45ff]">Workspace Users</p>
                      <h2 className="mt-2 text-2xl font-bold text-gray-900">User Management</h2>
                      <p className="mt-3 text-sm leading-6 text-gray-500">
                        Invite admins, managers, and agents into the workspace and assign the right level of access.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenInviteModal}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8]"
                    >
                      <Plus className="h-4 w-4" />
                      Add User
                    </button>
                  </div>
                </div>

                {teamError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{teamError}</div>
                ) : null}

                {teamSuccess ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{teamSuccess}</div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Total users</p>
                    <p className="mt-3 text-3xl font-bold text-gray-900">{teamMembers?.length ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Active users</p>
                    <p className="mt-3 text-3xl font-bold text-gray-900">
                      {teamMembers?.filter((member) => member.status === 'active').length ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Pending invites</p>
                    <p className="mt-3 text-3xl font-bold text-gray-900">
                      {teamMembers?.filter((member) => member.status === 'invited').length ?? 0}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Workspace user list</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        View owners and invited teammates with their assigned roles and invite status.
                      </p>
                    </div>
                    {isTeamLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
                  </div>
                  {isTeamLoading && !teamMembers ? (
                    <div className="space-y-3 p-6">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
                      ))}
                    </div>
                  ) : teamMembers && teamMembers.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Name', 'Email Address', 'Role Assigned', 'Status', 'Invite Date'].map((label) => (
                              <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {teamMembers.map((member) => (
                            <tr key={member.id} className="align-top">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${member.isOwner ? 'bg-slate-900 text-white' : 'bg-[#5b45ff]/10 text-[#5b45ff]'}`}>
                                    {(member.fullName || member.email || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">{member.fullName || 'Invited teammate'}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {member.isOwner ? 'Workspace owner' : member.status === 'active' ? 'Accepted invite' : 'Awaiting acceptance'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-sm text-gray-600">{member.email}</td>
                              <td className="px-6 py-5"><TeamRoleBadge role={member.role} /></td>
                              <td className="px-6 py-5"><TeamStatusBadge status={member.status} /></td>
                              <td className="px-6 py-5 text-sm text-gray-600">
                                {teamDateFormatter.format(new Date(member.invitedAt))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5b45ff]/10 text-[#5b45ff]">
                        <Users className="h-7 w-7" />
                      </div>
                      <h3 className="mt-5 text-lg font-bold text-gray-900">No invited users yet</h3>
                      <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                        Start by inviting your first teammate. They will receive an email invite and appear here with their assigned role.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenInviteModal}
                        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8]"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add User
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'notifications' ? (
              <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5b45ff]">Notifications</p>
                      <h2 className="mt-2 text-2xl font-bold text-gray-900">Control alerts and sounds</h2>
                      <p className="mt-3 text-sm leading-6 text-gray-500">
                        Decide which events should alert you, whether sounds should play, and how notification audio should feel.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">Unread right now:</span>{' '}
                      {bootstrap?.notifications?.filter((notification) => !notification.isRead).length || 0}
                    </div>
                  </div>
                </div>

                {notificationSettingsError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{notificationSettingsError}</div>
                ) : null}

                {notificationSettingsNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{notificationSettingsNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900">Core controls</h3>
                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        {([
                          {
                            key: 'enabled',
                            title: 'In-app notifications',
                            description: 'Show alerts in the header popup and notification list.',
                          },
                          {
                            key: 'soundEnabled',
                            title: 'Notification sounds',
                            description: 'Play a chime when new leads, template updates, or team events arrive.',
                          },
                          {
                            key: 'callSoundEnabled',
                            title: 'WhatsApp call sounds',
                            description: 'Play ringing and dialing sounds for active call popups.',
                          },
                        ] as Array<{
                          key: 'enabled' | 'soundEnabled' | 'callSoundEnabled';
                          title: string;
                          description: string;
                        }>).map((item) => {
                          const isEnabled = Boolean(notificationSettingsForm[item.key]);

                          return (
                            <div key={item.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-gray-500">{item.description}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => updateNotificationSetting(item.key, !isEnabled)}
                                  className={`inline-flex min-w-[92px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition ${
                                    isEnabled
                                      ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20'
                                      : 'bg-white text-gray-600 ring-1 ring-gray-200'
                                  }`}
                                >
                                  {isEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900">Event triggers</h3>
                      <p className="mt-2 text-sm text-gray-500">
                        Choose which events should create notifications in your workspace.
                      </p>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        {([
                          {
                            key: 'templateReviewEnabled',
                            title: 'Template approvals and rejections',
                            description: 'Get notified when a WhatsApp template is approved or rejected.',
                          },
                          {
                            key: 'missedCallEnabled',
                            title: 'Missed WhatsApp calls',
                            description: 'Receive an alert when a WhatsApp call ends as missed.',
                          },
                          {
                            key: 'leadEnabled',
                            title: 'New CRM leads',
                            description: 'See alerts when a new lead lands in your CRM from an integration.',
                          },
                          {
                            key: 'teamJoinedEnabled',
                            title: 'User joined workspace',
                            description: 'Know when an invited user accepts and joins the workspace.',
                          },
                        ] as Array<{
                          key:
                            | 'templateReviewEnabled'
                            | 'missedCallEnabled'
                            | 'leadEnabled'
                            | 'teamJoinedEnabled';
                          title: string;
                          description: string;
                        }>).map((item) => {
                          const isEnabled = Boolean(notificationSettingsForm[item.key]);
                          const disabledByMaster = notificationSettingsForm.enabled === false;

                          return (
                            <div key={item.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-gray-500">{item.description}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={disabledByMaster}
                                  onClick={() => updateNotificationSetting(item.key, !isEnabled)}
                                  className={`inline-flex min-w-[92px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition ${
                                    isEnabled
                                      ? 'bg-[#111827] text-white'
                                      : 'bg-white text-gray-600 ring-1 ring-gray-200'
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  {isEnabled ? 'On' : 'Off'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900">Sound style</h3>
                      <div className="mt-5 space-y-5">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Sound preset</span>
                          <select
                            value={notificationSettingsForm.soundPreset}
                            onChange={(event) =>
                              updateNotificationSetting(
                                'soundPreset',
                                event.target.value as NotificationPreferencesUpdateInput['soundPreset'],
                              )
                            }
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          >
                            {NOTIFICATION_SOUND_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
                            <span>Volume</span>
                            <span>{Math.round((notificationSettingsForm.volume || 0) * 100)}%</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={notificationSettingsForm.volume}
                            onChange={(event) =>
                              updateNotificationSetting('volume', Number(event.target.value))
                            }
                            className="mt-3 w-full accent-[#5b45ff]"
                          />
                        </label>

                        <div className="grid gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              previewNotificationSound('notification', {
                                soundPreset: notificationSettingsForm.soundPreset || 'classic',
                                volume: notificationSettingsForm.volume || 0.8,
                              })
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Volume2 className="h-4 w-4" />
                            Preview notification sound
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              previewNotificationSound('incoming_call', {
                                soundPreset: notificationSettingsForm.soundPreset || 'classic',
                                volume: notificationSettingsForm.volume || 0.8,
                              })
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Bell className="h-4 w-4" />
                            Preview call sound
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              playNotificationChime({
                                enabled: true,
                                soundEnabled: true,
                                soundPreset: notificationSettingsForm.soundPreset || 'classic',
                                volume: notificationSettingsForm.volume || 0.8,
                              })
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-white"
                          >
                            <Volume2 className="h-4 w-4" />
                            Test saved-style chime
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-4 text-sm leading-6 text-gray-500 shadow-sm">
                      Notification sounds follow the same preset and volume across the header popup and WhatsApp call alerts.
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveNotificationSettings()}
                    disabled={isSavingNotificationSettings}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSavingNotificationSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                    Save notification settings
                  </button>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'subscription' ? (
              <motion.div key="subscription" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="bg-gradient-to-br from-[#111827] to-[#1f2937] rounded-2xl p-8 text-white relative overflow-hidden shadow-lg">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#5b45ff] rounded-full blur-[80px] opacity-20 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-[#25D366] font-semibold tracking-wider uppercase text-sm mb-2">Current Plan</p>
                    <h2 className="text-3xl font-bold mb-2">{bootstrap?.profile?.selectedPlan || 'No active subscription'}</h2>
                    <p className="text-gray-400 text-sm max-w-md">
                      Billing state is now persisted against the workspace profile after Razorpay checkout verification.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Billing cycle</p>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.billingCycle === 'annual'
                        ? 'Annual'
                        : bootstrap?.profile?.billingCycle === 'monthly'
                          ? 'Monthly'
                          : 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      <CalendarDays className="w-4 h-4" />
                      Trial end
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.trialEndsAt
                        ? billingDateFormatter.format(new Date(bootstrap.profile.trialEndsAt))
                        : 'Not available'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Subscription status</p>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.billingStatus
                        ? bootstrap.profile.billingStatus.charAt(0).toUpperCase() + bootstrap.profile.billingStatus.slice(1)
                        : 'Inactive'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      <TicketPercent className="w-4 h-4" />
                      Coupon code
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.couponCode || 'None'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900">Stored billing metadata</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Razorpay subscription ID</p>
                      <p className="mt-2 break-all text-sm font-medium text-gray-900">
                        {bootstrap?.profile?.razorpaySubscriptionId || 'No Razorpay subscription has been verified yet.'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Workspace behavior</p>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        This record now drives onboarding access, billing cycle visibility, and the trial-state messaging in the product.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

          </AnimatePresence>
        </div>
      </div>

      {isPhoneModalOpen ? (
        <SettingsModal
          title="Change contact number"
          subtitle="Update the contact number shown in your profile."
          onClose={() => {
            if (isUpdatingPhone) {
              return;
            }

            setIsPhoneModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Contact number</span>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Enter contact number"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPhoneModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingPhone}
                onClick={() => void handleUpdatePhone()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Save contact number
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isEmailModalOpen ? (
        <SettingsModal
          title="Change email address"
          subtitle="Enter the new email address."
          onClose={() => {
            if (isUpdatingEmail) {
              return;
            }

            setIsEmailModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">New email address</span>
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="name@company.com"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingEmail}
                onClick={() => void handleRequestEmailChange()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send confirmation email
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isPasswordModalOpen ? (
        <SettingsModal
          title="Change password"
          subtitle="Request a verification code by email, then set your new password."
          onClose={() => {
            if (isSendingPasswordCode || isUpdatingPassword) {
              return;
            }

            setIsPasswordModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              We will email a verification code before your new password is saved.
            </div>
            <button
              type="button"
              disabled={isSendingPasswordCode}
              onClick={() => void handleSendPasswordCode()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-70"
            >
              {isSendingPasswordCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send verification code
            </button>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Email verification code</span>
              <input
                type="text"
                value={passwordNonce}
                onChange={(event) => setPasswordNonce(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Enter the code from your email"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Minimum 8 characters"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Re-enter the new password"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingPassword}
                onClick={() => void handleChangePassword()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Update password
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isMfaModalOpen ? (
        <SettingsModal
          title="Set up multi-factor authentication"
          subtitle="Request the email code, enter the 8-digit number, then connect an authenticator app."
          size="wide"
          onClose={() => {
            if (isSendingMfaNotice || isSettingUpMfa) {
              return;
            }

            setIsMfaModalOpen(false);
          }}
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Enter the 8-digit numeric code from your email before continuing.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Step 1. Request email code</p>
                <p className="mt-1 text-xs text-gray-500">We will send a one-time code to your current email address.</p>
              </div>
              <button
                type="button"
                disabled={isSendingMfaNotice}
                onClick={() => void handleStartMfaSetup()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white disabled:opacity-70"
              >
                {isSendingMfaNotice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {mfaNoticeSent ? 'Resend OTP' : 'Send OTP'}
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Step 2. Enter OTP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={mfaOtpCode}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 8);
                      setMfaOtpCode(digitsOnly);
                      if (isMfaOtpConfirmed) {
                        setIsMfaOtpConfirmed(false);
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    placeholder="8-digit OTP"
                  />
                  <p className="mt-2 text-xs text-gray-500">Only numeric 8-digit codes are accepted.</p>
                </label>
                <button
                  type="button"
                  onClick={handleConfirmMfaOtp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-white"
                >
                  {isMfaOtpConfirmed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <ShieldCheck className="h-4 w-4" />}
                  {isMfaOtpConfirmed ? 'OTP confirmed' : 'Confirm OTP'}
                </button>
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Authenticator label</span>
              <input
                type="text"
                value={mfaFriendlyName}
                onChange={(event) => setMfaFriendlyName(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Connektly Authenticator"
              />
            </label>
            <button
              type="button"
              disabled={isSettingUpMfa}
              onClick={() => void handleGenerateTotp()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
            >
              {isSettingUpMfa && !pendingTotpEnrollment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Continue to authenticator setup
            </button>
            {pendingTotpEnrollment ? (
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                  <div className="rounded-2xl border border-gray-200 bg-white p-3">
                    <img src={pendingTotpEnrollment.qrCode} alt="Authenticator QR code" className="mx-auto h-44 w-44" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Step 3. Scan the QR code</p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Use Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP-compatible app.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Manual secret</p>
                          <p className="mt-2 break-all text-sm font-medium text-gray-900">{pendingTotpEnrollment.secret}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyTotpSecret()}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Authenticator code</span>
                      <input
                        type="text"
                        value={mfaVerificationCode}
                        onChange={(event) => setMfaVerificationCode(event.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        placeholder="Enter the 6-digit code"
                      />
                    </label>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingTotpEnrollment(null);
                          setMfaVerificationCode('');
                        }}
                        className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Start over
                      </button>
                      <button
                        type="button"
                        disabled={isSettingUpMfa}
                        onClick={() => void handleVerifyTotp()}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                      >
                        {isSettingUpMfa ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                        Verify and enable MFA
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </SettingsModal>
      ) : null}

      {isInviteModalOpen ? (
        <TeamInviteModal
          form={inviteForm}
          isSubmitting={isInviting}
          onChange={handleInviteFormChange}
          onClose={handleCloseInviteModal}
          onSubmit={() => void handleInviteUser()}
        />
      ) : null}
    </div>
  );
}
