import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Image,
  Link as LinkIcon,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Share2,
  ShieldCheck,
  Store,
  UserCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import type { DashboardBootstrap, WhatsAppBusinessProfile } from '../../lib/types';

interface BusinessProfileFormState {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  website1: string;
  website2: string;
}

const EMPTY_FORM_STATE: BusinessProfileFormState = {
  about: '',
  address: '',
  description: '',
  email: '',
  vertical: '',
  website1: '',
  website2: '',
};

const BUSINESS_CATEGORY_OPTIONS = [
  { label: 'Automative', value: 'AUTOMOTIVE' },
  { label: 'Beauty, spa nd salon', value: 'BEAUTY_SPA_AND_SALON' },
  { label: 'Clothing', value: 'CLOTHING' },
  { label: 'Education', value: 'EDUCATION' },
  { label: 'Entertainment', value: 'ENTERTAINMENT' },
  { label: 'Online gambling and gaming', value: 'ONLINE_GAMBLING_AND_GAMING' },
  {
    label: 'Non-online gambling and gaming (e.g. brick and mortar)',
    value: 'NON_ONLINE_GAMBLING_AND_GAMING',
  },
  { label: 'Event planning and service', value: 'EVENT_PLANNING_AND_SERVICE' },
  { label: 'Matrimonial Service', value: 'MATRIMONIAL_SERVICE' },
  { label: 'Finance and Banking', value: 'FINANCE_AND_BANKING' },
  { label: 'Food and groceries', value: 'FOOD_AND_GROCERIES' },
  { label: 'Alcoholic drinks', value: 'ALCOHOLIC_DRINKS' },
  { label: 'Public service', value: 'PUBLIC_SERVICE' },
  { label: 'Hotel and lodging', value: 'HOTEL_AND_LODGING' },
  { label: 'Medical and health', value: 'MEDICAL_AND_HEALTH' },
  { label: 'Over-the-counter medicine', value: 'OVER_THE_COUNTER_MEDICINE' },
  { label: 'Charity', value: 'CHARITY' },
  { label: 'Professional services', value: 'PROFESSIONAL_SERVICES' },
  { label: 'Shopping and retail', value: 'SHOPPING_AND_RETAIL' },
  { label: 'Travel and transportation', value: 'TRAVEL_AND_TRANSPORTATION' },
  { label: 'Restaurant', value: 'RESTAURANT' },
  { label: 'Other', value: 'OTHER' },
] as const;

function mapForm(profile: WhatsAppBusinessProfile | null): BusinessProfileFormState {
  return {
    about: profile?.about || '',
    address: profile?.address || '',
    description: profile?.description || '',
    email: profile?.email || '',
    vertical: profile?.vertical || '',
    website1: profile?.websites[0] || '',
    website2: profile?.websites[1] || '',
  };
}

function formatVerticalLabel(value: string | null | undefined) {
  return (value || '')
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategoryToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function findCategoryOption(value: string | null | undefined) {
  const normalized = normalizeCategoryToken(value);

  if (!normalized) {
    return null;
  }

  return (
    BUSINESS_CATEGORY_OPTIONS.find(
      (option) =>
        normalizeCategoryToken(option.value) === normalized ||
        normalizeCategoryToken(option.label) === normalized,
    ) || null
  );
}

function getCategoryLabel(value: string | null | undefined) {
  return findCategoryOption(value)?.label || formatVerticalLabel(value) || 'Category not set yet';
}

function getDisplayNameStatusMeta(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase();

  if (!normalized) {
    return {
      label: 'Not available',
      badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-600',
    };
  }

  if (normalized.includes('REJECT')) {
    return {
      label: 'Rejected',
      badgeClassName: 'border border-red-200 bg-red-50 text-red-700',
    };
  }

  if (normalized.includes('PENDING') || normalized.includes('REVIEW')) {
    return {
      label: 'Under review',
      badgeClassName: 'border border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (normalized.includes('APPROVED') || normalized.includes('AVAILABLE')) {
    return {
      label: 'Approved',
      badgeClassName: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  return {
    label: formatVerticalLabel(normalized),
    badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-700',
  };
}

function getInitials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join('') || 'BP'
  );
}

function getPreviewName(
  businessProfile: WhatsAppBusinessProfile | null,
  bootstrap: DashboardBootstrap,
) {
  return (
    businessProfile?.verifiedName ||
    businessProfile?.businessAccountName ||
    bootstrap.channel?.verifiedName ||
    bootstrap.profile?.companyName ||
    'Business Profile'
  );
}

function PreviewDetailRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-[14px] leading-6 text-slate-700">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

function BusinessProfileSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <LoadingBlock className="h-4 w-36" />
              <LoadingBlock className="h-10 w-64" />
              <LoadingBlock className="h-4 w-80 max-w-full" />
            </div>
            <LoadingBlock className="h-11 w-40" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <LoadingBlock className="h-24 w-full" />
            <LoadingBlock className="h-24 w-full" />
            <LoadingBlock className="h-24 w-full" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <LoadingBlock className="h-[220px] w-full" />
            <LoadingBlock className="h-[220px] w-full" />
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-28 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-24 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-12 w-full" />
            </div>
            <div className="space-y-2">
              <LoadingBlock className="h-4 w-24" />
              <LoadingBlock className="h-12 w-full" />
            </div>
          </div>

          <div className="flex justify-end">
            <LoadingBlock className="h-12 w-32" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[30px] bg-[#edf2f7] p-3 shadow-inner">
          <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between px-4 py-3">
              <LoadingBlock className="h-5 w-5 rounded-full" />
              <LoadingBlock className="h-5 w-5 rounded-full" />
            </div>
            <div className="px-5 pb-5 text-center">
              <LoadingBlock className="mx-auto h-20 w-20 rounded-full" />
              <LoadingBlock className="mx-auto mt-4 h-8 w-40" />
              <LoadingBlock className="mx-auto mt-3 h-5 w-32" />
              <LoadingBlock className="mx-auto mt-4 h-12 w-24" />
            </div>
            <div className="space-y-4 border-t border-slate-200 bg-slate-50/80 px-4 py-4">
              <LoadingBlock className="h-16 w-full" />
              <LoadingBlock className="h-6 w-32" />
              <LoadingBlock className="h-6 w-44" />
              <LoadingBlock className="h-6 w-52" />
            </div>
          </div>
          <LoadingBlock className="mx-auto mt-3 h-4 w-48" />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <LoadingBlock className="h-4 w-28" />
          <LoadingBlock className="mt-4 h-36 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function BusinessProfile() {
  const {
    bootstrap,
    businessProfile,
    isBusinessProfileLoading,
    businessProfileError,
    refreshBusinessProfile,
    setBusinessProfile,
  } = useAppData();
  const [form, setForm] = useState<BusinessProfileFormState>(() => mapForm(businessProfile));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const serverForm = useMemo(() => mapForm(businessProfile), [businessProfile]);

  useEffect(() => {
    if (!businessProfile) {
      if (!isBusinessProfileLoading) {
        setForm(EMPTY_FORM_STATE);
        setIsDirty(false);
      }
      return;
    }

    if (!isDirty) {
      setForm(serverForm);
    }
  }, [businessProfile, isBusinessProfileLoading, isDirty, serverForm]);

  useEffect(() => {
    if (!avatarPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <UserCircle className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900">Connect WhatsApp first</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            The Business Profile page works on your connected WhatsApp Business phone number. Connect the channel first, then this page will stay synced with the live Meta profile.
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

  const handleFieldChange = (field: keyof BusinessProfileFormState, value: string) => {
    setIsDirty(true);
    setError(null);
    setSuccess(null);
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSync = async () => {
    setError(null);
    setSuccess(null);

    const nextProfile = await refreshBusinessProfile();

    if (!nextProfile) {
      return;
    }

    setAvatarPreviewUrl(nextProfile.profilePictureUrl || null);
    setSuccess(
      isDirty
        ? 'Latest Meta data synced in the background. Your unsaved edits were preserved.'
        : 'Business profile synced from Meta.',
    );
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Profile photo must be a PNG or JPEG image.');
      setSuccess(null);
      input.value = '';
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUploadingPhoto(true);
    setAvatarPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadBusinessProfilePhoto(file);
      setBusinessProfile(() => response.profile);
      setAvatarPreviewUrl(response.profile.profilePictureUrl || null);
      setSuccess('Profile photo updated in Meta.');
    } catch (uploadError) {
      setAvatarPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to update profile photo.');
    } finally {
      setIsUploadingPhoto(false);
      input.value = '';
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.updateBusinessProfile({
        about: form.about,
        address: form.address,
        description: form.description,
        email: form.email,
        vertical: findCategoryOption(form.vertical)?.value || form.vertical,
        websites: [form.website1, form.website2].map((value) => value.trim()).filter(Boolean),
      });

      setBusinessProfile(() => response.profile);
      setForm(mapForm(response.profile));
      setAvatarPreviewUrl(response.profile.profilePictureUrl || null);
      setIsDirty(false);
      setSuccess('Business profile updated in Meta.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save business profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const categoryOptions = (() => {
    const matchedOption = findCategoryOption(form.vertical);

    if (!form.vertical.trim() || matchedOption) {
      return BUSINESS_CATEGORY_OPTIONS;
    }

    return [
      {
        label: `${formatVerticalLabel(form.vertical)} (Current)`,
        value: form.vertical,
      },
      ...BUSINESS_CATEGORY_OPTIONS,
    ];
  })();

  const previewName = getPreviewName(businessProfile, bootstrap);
  const previewPhone =
    businessProfile?.displayPhoneNumber ||
    bootstrap.channel.displayPhoneNumber ||
    bootstrap.channel.phoneNumberId;
  const previewSummary =
    form.description.trim() ||
    form.about.trim() ||
    'Add a business description to show customers what you do before they start a chat.';
  const previewCategory = getCategoryLabel(form.vertical || bootstrap.profile?.industry || '');
  const previewEmail = form.email.trim();
  const previewAddress = form.address.trim();
  const previewWebsites = [form.website1, form.website2].map((value) => value.trim()).filter(Boolean);
  const previewAvatarUrl = avatarPreviewUrl || businessProfile?.profilePictureUrl;
  const activeError = error || businessProfileError;
  const showSkeleton = isBusinessProfileLoading && !businessProfile;
  const displayNameStatus = getDisplayNameStatusMeta(businessProfile?.displayNameStatus);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Profile</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            This page stays synced in the background, so the profile opens with warm data and the preview updates live while you edit.
          </p>
        </div>
        <button
          onClick={() => void handleSync()}
          disabled={isBusinessProfileLoading || isSaving || isUploadingPhoto}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isBusinessProfileLoading ? 'animate-spin' : ''}`} />
          Sync now
        </button>
      </div>

      {activeError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{activeError}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      ) : null}

      {showSkeleton ? (
        <BusinessProfileSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-6">
                <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Profile picture</p>
                    <div className="mt-4 flex flex-col items-center text-center">
                      {previewAvatarUrl ? (
                        <img
                          src={previewAvatarUrl}
                          alt={previewName}
                          className="h-24 w-24 rounded-full object-cover shadow-md"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#5b45ff] to-[#25D366] text-2xl font-bold text-white shadow-md">
                          {getInitials(previewName)}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto || isSaving}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                      >
                        <Image className={`h-4 w-4 ${isUploadingPhoto ? 'animate-pulse' : ''}`} />
                        {isUploadingPhoto ? 'Uploading...' : 'Change photo'}
                      </button>
                      <p className="mt-3 text-xs leading-5 text-gray-500">
                        Upload a PNG or JPEG image for your live WhatsApp Business profile.
                      </p>
                    </div>

                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Display name</p>
                        <h3 className="mt-2 text-xl font-semibold text-gray-900">{previewName}</h3>
                        <p className="mt-2 text-sm text-gray-500">
                          Approval status comes from Meta for the public name shown to customers.
                        </p>
                      </div>
                      <span
                        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${displayNameStatus.badgeClassName}`}
                      >
                        {displayNameStatus.label}
                      </span>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Ensure that your name follows WhatsApp&apos;s{' '}
                      <a
                        href="https://www.facebook.com/business/help/338047025165344"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#5b45ff] hover:underline"
                      >
                        Naming guidelines
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      .
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
                    <select
                      value={form.vertical}
                      onChange={(event) => handleFieldChange('vertical', event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    >
                      <option value="">Select a category</option>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(event) => handleFieldChange('description', event.target.value)}
                      rows={4}
                      placeholder="Describe the business in the same way you want it to appear in WhatsApp."
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">About (Status)</label>
                    <input
                      type="text"
                      value={form.about}
                      onChange={(event) => handleFieldChange('about', event.target.value)}
                      placeholder="Short line customers see about your business"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => handleFieldChange('email', event.target.value)}
                      placeholder="hello@yourbrand.com"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Address</label>
                    <textarea
                      value={form.address}
                      onChange={(event) => handleFieldChange('address', event.target.value)}
                      rows={3}
                      placeholder="Add the business address customers should see."
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Website 1</label>
                    <div className="relative">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        value={form.website1}
                        onChange={(event) => handleFieldChange('website1', event.target.value)}
                        placeholder="https://example.com"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Website 2</label>
                    <div className="relative">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        value={form.website2}
                        onChange={(event) => handleFieldChange('website2', event.target.value)}
                        placeholder="https://another-link.com"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-500">
                    {isDirty ? 'Unsaved changes in progress.' : 'Everything in sync with the last saved profile.'}
                  </p>
                  <button
                    onClick={() => void handleSave()}
                    disabled={isSaving || isBusinessProfileLoading || isUploadingPhoto}
                    className="rounded-xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8] disabled:opacity-60"
                  >
                    {isSaving ? 'Saving...' : 'Save to Meta'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[30px] bg-[#edf2f7] p-3 shadow-inner">
              <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between px-4 py-3 text-slate-500">
                  <ArrowLeft className="h-5 w-5" />
                  <MoreVertical className="h-5 w-5" />
                </div>

                <div className="px-5 pb-5 text-center">
                  {previewAvatarUrl ? (
                    <img
                      src={previewAvatarUrl}
                      alt={previewName}
                      className="mx-auto h-20 w-20 rounded-full object-cover shadow-lg"
                    />
                  ) : (
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#5b45ff] to-[#25D366] text-xl font-bold text-white shadow-lg">
                      {getInitials(previewName)}
                    </div>
                  )}

                  <h2 className="mt-4 text-[28px] font-bold tracking-tight text-slate-900">{previewName}</h2>
                  <p className="mt-2 text-base font-medium text-slate-700">{previewPhone}</p>

                  <div className="mt-4 flex justify-center">
                    <div className="inline-flex flex-col items-center rounded-2xl border border-slate-200 px-5 py-3 text-slate-700 shadow-sm">
                      <Share2 className="h-5 w-5" />
                      <span className="mt-1 text-sm font-medium">Share</span>
                    </div>
                  </div>

                  {form.about.trim() ? (
                    <p className="mx-auto mt-4 max-w-[230px] text-sm text-slate-500">{form.about.trim()}</p>
                  ) : null}
                </div>

                <div className="space-y-4 border-t border-slate-200 bg-slate-50/80 px-4 py-4">
                  <PreviewDetailRow icon={Store}>
                    <p>{previewSummary}</p>
                  </PreviewDetailRow>
                  <PreviewDetailRow icon={Building2}>
                    <p>{previewCategory}</p>
                  </PreviewDetailRow>
                  {previewEmail ? (
                    <PreviewDetailRow icon={Mail}>
                      <p className="break-all text-[#2563eb]">{previewEmail}</p>
                    </PreviewDetailRow>
                  ) : null}
                  {previewWebsites.map((website) => (
                    <div key={website}>
                      <PreviewDetailRow icon={Globe}>
                        <p className="break-all text-[#2563eb]">{website}</p>
                      </PreviewDetailRow>
                    </div>
                  ))}
                  {previewAddress ? (
                    <PreviewDetailRow icon={MapPin}>
                      <p>{previewAddress}</p>
                    </PreviewDetailRow>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-slate-500">
                This preview updates instantly while you edit and may look slightly different across devices.
              </p>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Connection snapshot</p>
              <div className="mt-4 space-y-4 text-sm text-gray-600">
                <div className="flex items-start gap-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 text-[#25D366]" />
                  <div>
                    <p className="font-medium text-gray-900">{previewPhone}</p>
                    <p>Connected phone number</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">{displayNameStatus.label}</p>
                    <p>Display name approval status</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Store className="mt-0.5 h-4 w-4 text-violet-500" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {businessProfile?.businessAccountName || bootstrap.channel.businessAccountName || 'Business account'}
                    </p>
                    <p>WhatsApp Business account</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
