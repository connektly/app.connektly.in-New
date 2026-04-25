import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Link2,
  Loader2,
  Package,
  PlusCircle,
  Store,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { appApi } from '../../lib/api';
import type { WhatsAppCommerceSettings } from '../../lib/types';

const CATALOGS_STORAGE_KEY = 'connektly-commerce-catalogs';
const CURRENCY_OPTIONS = ['INR', 'USD', 'AED', 'EUR', 'GBP'] as const;

type CatalogOrigin = 'created' | 'linked';
type CatalogStatus = 'Draft' | 'Linked';

interface CommerceCatalog {
  id: string;
  catalogId: string;
  name: string;
  currency: string;
  notes: string | null;
  origin: CatalogOrigin;
  status: CatalogStatus;
  url: string | null;
  wabaId: string | null;
  wabaName: string | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateCatalogFormState {
  name: string;
  currency: string;
  notes: string;
  linkToCurrentWaba: boolean;
}

interface LinkCatalogFormState {
  catalogId: string;
  name: string;
  currency: string;
  url: string;
}

function getInitialCatalogs() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CATALOGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CommerceCatalog[]) : [];
  } catch {
    return [];
  }
}

function createCatalogCode() {
  return `CAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not linked';
  }

  return new Date(value).toLocaleString();
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  toneClassName,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  toneClassName: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClassName}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: CatalogStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        status === 'Linked'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[#5b45ff]' : 'bg-gray-300'
        } disabled:cursor-not-allowed disabled:opacity-60`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function Catalog() {
  const { bootstrap, businessProfile } = useAppData();
  const [catalogs, setCatalogs] = useState<CommerceCatalog[]>(getInitialCatalogs);
  const [createForm, setCreateForm] = useState<CreateCatalogFormState>({
    name: '',
    currency: 'INR',
    notes: '',
    linkToCurrentWaba: true,
  });
  const [linkForm, setLinkForm] = useState<LinkCatalogFormState>({
    catalogId: '',
    name: '',
    currency: 'INR',
    url: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commerceSettings, setCommerceSettings] = useState<WhatsAppCommerceSettings | null>(null);
  const [commerceDraft, setCommerceDraft] = useState({
    isCartEnabled: false,
    isCatalogVisible: false,
  });
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [commerceNotice, setCommerceNotice] = useState<string | null>(null);
  const [isCommerceLoading, setIsCommerceLoading] = useState(false);
  const [isSavingCommerce, setIsSavingCommerce] = useState(false);

  const connectedPhoneNumberId =
    bootstrap?.channel?.phoneNumberId || businessProfile?.phoneNumberId || null;
  const connectedWabaId = bootstrap?.channel?.wabaId || businessProfile?.wabaId || null;
  const connectedWabaName =
    bootstrap?.channel?.businessAccountName ||
    businessProfile?.businessAccountName ||
    bootstrap?.profile?.companyName ||
    null;

  const linkedCatalogCount = useMemo(
    () => catalogs.filter((catalog) => catalog.status === 'Linked').length,
    [catalogs],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CATALOGS_STORAGE_KEY, JSON.stringify(catalogs));
  }, [catalogs]);

  useEffect(() => {
    if (!connectedPhoneNumberId) {
      setCommerceSettings(null);
      setCommerceDraft({
        isCartEnabled: false,
        isCatalogVisible: false,
      });
      setCommerceError(null);
      setCommerceNotice(null);
      setIsCommerceLoading(false);
      return;
    }

    let isCancelled = false;
    setIsCommerceLoading(true);
    setCommerceError(null);

    void appApi
      .getWhatsAppCommerceSettings()
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setCommerceSettings(response.settings);
        setCommerceDraft({
          isCartEnabled: response.settings.isCartEnabled,
          isCatalogVisible: response.settings.isCatalogVisible,
        });
      })
      .catch((nextError) => {
        if (isCancelled) {
          return;
        }

        setCommerceError(
          nextError instanceof Error ? nextError.message : 'Failed to load WhatsApp commerce settings.',
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCommerceLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [connectedPhoneNumberId]);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const resetCommerceMessages = () => {
    setCommerceError(null);
    setCommerceNotice(null);
  };

  const hasCommerceChanges =
    Boolean(commerceSettings) &&
    (commerceDraft.isCartEnabled !== commerceSettings?.isCartEnabled ||
      commerceDraft.isCatalogVisible !== commerceSettings?.isCatalogVisible);

  const handleSaveCommerceSettings = async () => {
    if (!connectedPhoneNumberId) {
      setCommerceError('Connect your WhatsApp Business Account first to manage commerce settings.');
      return;
    }

    resetCommerceMessages();
    setIsSavingCommerce(true);

    try {
      const response = await appApi.updateWhatsAppCommerceSettings({
        isCartEnabled: commerceDraft.isCartEnabled,
        isCatalogVisible: commerceDraft.isCatalogVisible,
      });

      setCommerceSettings(response.settings);
      setCommerceDraft({
        isCartEnabled: response.settings.isCartEnabled,
        isCatalogVisible: response.settings.isCatalogVisible,
      });
      setCommerceNotice('WhatsApp commerce settings updated successfully.');
    } catch (nextError) {
      setCommerceError(
        nextError instanceof Error ? nextError.message : 'Failed to update WhatsApp commerce settings.',
      );
    } finally {
      setIsSavingCommerce(false);
    }
  };

  const handleCreateCatalog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();

    const name = createForm.name.trim();
    const notes = createForm.notes.trim();

    if (!name) {
      setError('Enter a catalog name before creating it.');
      return;
    }

    const shouldLink = Boolean(createForm.linkToCurrentWaba && connectedWabaId && connectedWabaName);
    const now = new Date().toISOString();

    const nextCatalog: CommerceCatalog = {
      id: crypto.randomUUID(),
      catalogId: createCatalogCode(),
      name,
      currency: createForm.currency,
      notes: notes || null,
      origin: 'created',
      status: shouldLink ? 'Linked' : 'Draft',
      url: null,
      wabaId: shouldLink ? connectedWabaId : null,
      wabaName: shouldLink ? connectedWabaName : null,
      linkedAt: shouldLink ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    setCatalogs((current) => [nextCatalog, ...current]);
    setCreateForm((current) => ({
      ...current,
      name: '',
      notes: '',
    }));
    setNotice(
      shouldLink
        ? 'Catalog created and linked to your WhatsApp Business Account.'
        : 'Catalog created. You can link it to your WhatsApp Business Account whenever you are ready.',
    );
  };

  const handleLinkExistingCatalog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();

    if (!connectedWabaId || !connectedWabaName) {
      setError('Connect your WhatsApp Business Account first so an existing catalog can be linked.');
      return;
    }

    const catalogId = linkForm.catalogId.trim();
    const name = linkForm.name.trim();
    const url = linkForm.url.trim();

    if (!catalogId || !name) {
      setError('Enter both the existing catalog ID and catalog name.');
      return;
    }

    const duplicate = catalogs.some(
      (catalog) => catalog.catalogId.toLowerCase() === catalogId.toLowerCase(),
    );

    if (duplicate) {
      setError('That catalog ID is already in this workspace list.');
      return;
    }

    const now = new Date().toISOString();

    const nextCatalog: CommerceCatalog = {
      id: crypto.randomUUID(),
      catalogId,
      name,
      currency: linkForm.currency,
      notes: null,
      origin: 'linked',
      status: 'Linked',
      url: url || null,
      wabaId: connectedWabaId,
      wabaName: connectedWabaName,
      linkedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    setCatalogs((current) => [nextCatalog, ...current]);
    setLinkForm({
      catalogId: '',
      name: '',
      currency: 'INR',
      url: '',
    });
    setNotice('Existing catalog linked to your WhatsApp Business Account.');
  };

  const handleRemoveCatalog = (catalogId: string) => {
    resetMessages();
    setCatalogs((current) => current.filter((catalog) => catalog.id !== catalogId));
    setNotice('Catalog removed from this workspace view.');
  };

  const handleUnlinkCatalog = (catalogId: string) => {
    resetMessages();
    setCatalogs((current) =>
      current.map((catalog) =>
        catalog.id === catalogId
          ? {
              ...catalog,
              status: 'Draft',
              wabaId: null,
              wabaName: null,
              linkedAt: null,
              updatedAt: new Date().toISOString(),
            }
          : catalog,
      ),
    );
    setNotice('Catalog unlinked from the WhatsApp Business Account.');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a fresh catalog for commerce workflows or link an existing catalog to your WhatsApp Business Account.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {!connectedWabaId ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 text-amber-900 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">WhatsApp Business Account not connected</p>
              <p className="mt-1 text-sm text-amber-800">
                You can still create catalogs now, but linking them to WhatsApp requires an active channel connection first.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/channels"
            className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-950"
          >
            Open Channels
          </Link>
        </div>
      ) : null}

      <SectionCard
        title="WhatsApp Commerce Settings"
        description="Live settings from Meta for the connected WhatsApp phone number. Use these to control whether catalog browsing and cart behavior are available in WhatsApp."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {commerceError ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {commerceError}
              </div>
            ) : null}

            {commerceNotice ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {commerceNotice}
              </div>
            ) : null}

            <ToggleRow
              title="Show catalog in WhatsApp"
              description="Makes your linked catalog visible inside the WhatsApp commerce experience for this phone number."
              checked={commerceDraft.isCatalogVisible}
              disabled={isCommerceLoading || isSavingCommerce || !connectedPhoneNumberId}
              onToggle={() =>
                setCommerceDraft((current) => ({
                  ...current,
                  isCatalogVisible: !current.isCatalogVisible,
                }))
              }
            />

            <ToggleRow
              title="Enable cart in WhatsApp"
              description="Lets customers add items to a cart while interacting with your catalog on WhatsApp."
              checked={commerceDraft.isCartEnabled}
              disabled={isCommerceLoading || isSavingCommerce || !connectedPhoneNumberId}
              onToggle={() =>
                setCommerceDraft((current) => ({
                  ...current,
                  isCartEnabled: !current.isCartEnabled,
                }))
              }
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveCommerceSettings()}
                disabled={!connectedPhoneNumberId || isCommerceLoading || isSavingCommerce || !hasCommerceChanges}
                className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCommerce || isCommerceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                Save Commerce Settings
              </button>

              {commerceSettings ? (
                <button
                  type="button"
                  onClick={() =>
                    setCommerceDraft({
                      isCartEnabled: commerceSettings.isCartEnabled,
                      isCatalogVisible: commerceSettings.isCatalogVisible,
                    })
                  }
                  disabled={isCommerceLoading || isSavingCommerce || !hasCommerceChanges}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Changes
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connected target</p>
            <p className="mt-3 text-lg font-bold text-gray-900">{connectedWabaName || 'No WhatsApp Business Account connected'}</p>
            <p className="mt-1 break-all text-sm text-gray-500">{connectedPhoneNumberId || 'Phone number unavailable'}</p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Catalog visibility</p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {commerceDraft.isCatalogVisible ? 'Visible in WhatsApp' : 'Hidden in WhatsApp'}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Cart status</p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {commerceDraft.isCartEnabled ? 'Cart enabled' : 'Cart disabled'}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Meta settings id</p>
                <p className="mt-2 break-all text-sm font-medium text-gray-900">{commerceSettings?.id || 'Available after first fetch'}</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Store}
          label="Total catalogs"
          value={String(catalogs.length)}
          toneClassName="bg-[#eff5ff] text-[#2364ff]"
        />
        <StatCard
          icon={Link2}
          label="Linked to WhatsApp"
          value={String(linkedCatalogCount)}
          toneClassName="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          icon={Building2}
          label="Active business account"
          value={connectedWabaName || 'Not connected'}
          toneClassName="bg-amber-50 text-amber-700"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Create Catalog"
          description="Spin up a new catalog in the workspace and optionally link it to the currently connected WhatsApp Business Account."
        >
          <form className="space-y-4" onSubmit={handleCreateCatalog}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Catalog Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Summer Collection 2026"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Default Currency</label>
                <select
                  value={createForm.currency}
                  onChange={(event) => setCreateForm((current) => ({ ...current, currency: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Link target</p>
                <p className="mt-2 text-sm font-medium text-gray-900">{connectedWabaName || 'No WhatsApp Business Account connected'}</p>
                <p className="mt-1 text-xs text-gray-500">{connectedWabaId || 'Connect a channel to unlock direct linking'}</p>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={createForm.notes}
                onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional notes about products, region, or campaign usage"
                rows={4}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createForm.linkToCurrentWaba}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, linkToCurrentWaba: event.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
              />
              <span>
                Link this new catalog to the current WhatsApp Business Account right away.
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8]"
            >
              <PlusCircle className="h-4 w-4" />
              Create Catalog
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="Link Existing Catalog"
          description="Attach an existing catalog to the WhatsApp Business Account that is active in this workspace."
        >
          <form className="space-y-4" onSubmit={handleLinkExistingCatalog}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Existing Catalog ID</label>
                <input
                  type="text"
                  value={linkForm.catalogId}
                  onChange={(event) => setLinkForm((current) => ({ ...current, catalogId: event.target.value }))}
                  placeholder="123456789012345"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Catalog Name</label>
                <input
                  type="text"
                  value={linkForm.name}
                  onChange={(event) => setLinkForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Main Product Catalog"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Currency</label>
                <select
                  value={linkForm.currency}
                  onChange={(event) => setLinkForm((current) => ({ ...current, currency: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Catalog URL</label>
                <input
                  type="url"
                  value={linkForm.url}
                  onChange={(event) => setLinkForm((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Linking to</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{connectedWabaName || 'No WhatsApp Business Account connected'}</p>
              <p className="mt-1 break-all text-xs text-gray-500">{connectedWabaId || 'Connect your WhatsApp channel first'}</p>
            </div>

            <button
              type="submit"
              disabled={!connectedWabaId}
              className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 className="h-4 w-4" />
              Link Existing Catalog
            </button>
          </form>
        </SectionCard>
      </div>

      <SectionCard
        title="Workspace Catalogs"
        description="Track the catalogs created in Connektly or linked from outside, along with their WhatsApp Business Account status."
      >
        {catalogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Catalog</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Currency</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">WhatsApp Business Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {catalogs.map((catalog) => (
                  <tr key={catalog.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-semibold text-gray-900">{catalog.name}</p>
                      <p className="mt-1 text-xs text-gray-500">ID: {catalog.catalogId}</p>
                      <p className="mt-1 text-xs text-gray-500">Updated {formatDateTime(catalog.updatedAt)}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">
                      {catalog.origin === 'created' ? 'Created here' : 'Existing catalog'}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">{catalog.currency}</td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-medium text-gray-900">{catalog.wabaName || 'Not linked yet'}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">{catalog.wabaId || 'No WABA attached'}</p>
                      <p className="mt-1 text-xs text-gray-500">Linked: {formatDateTime(catalog.linkedAt)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={catalog.status} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {catalog.url ? (
                          <a
                            href={catalog.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Open
                          </a>
                        ) : null}
                        {catalog.status === 'Linked' ? (
                          <button
                            type="button"
                            onClick={() => handleUnlinkCatalog(catalog.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                          >
                            <Unplug className="h-3.5 w-3.5" />
                            Unlink
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveCatalog(catalog.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900">No catalogs yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Create a new catalog or link an existing one to start managing commerce assets for your WhatsApp Business Account.
            </p>
          </div>
        )}
      </SectionCard>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Current WhatsApp link target</h2>
            <p className="mt-1 text-sm text-gray-500">
              Catalog links on this page use the WhatsApp Business Account currently connected to the workspace.
            </p>
          </div>
          <Link
            to="/dashboard/channels"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Manage Channels
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Business account</p>
            <p className="mt-2 text-sm font-medium text-gray-900">{connectedWabaName || 'Not connected'}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">WABA ID</p>
            <p className="mt-2 break-all text-sm font-medium text-gray-900">{connectedWabaId || 'Unavailable'}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Phone number</p>
            <p className="mt-2 text-sm font-medium text-gray-900">{bootstrap?.channel?.displayPhoneNumber || 'Unavailable'}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
