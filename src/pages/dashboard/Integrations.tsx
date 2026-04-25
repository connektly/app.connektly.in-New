import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Wallet,
  Webhook,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { clientConfig, hasEmbeddedSignupConfig } from '../../lib/config';
import { beginEmbeddedSignup } from '../../lib/meta-sdk';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type {
  MetaLeadCaptureSetupResponse,
  EmailConnectionSummary,
  WhatsAppPaymentConfiguration,
  WhatsAppPaymentConfigurationCreateInput,
  WhatsAppPaymentConfigurationOAuthResponse,
  WhatsAppPaymentsSetupResponse,
} from '../../lib/types';

interface WebhookFormState {
  appId: string;
  pageIds: string;
  formIds: string;
  accessToken: string;
}

interface WhatsAppPaymentsFormState {
  configurationName: string;
  purposeCode: string;
  merchantCategoryCode: string;
  providerName: WhatsAppPaymentConfigurationCreateInput['providerName'];
  providerMid: string;
  merchantVpa: string;
  redirectUrl: string;
  dataEndpointUrl: string;
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function joinList(values: string[]) {
  return values.join('\n');
}

function buildWebhookForm(setup: MetaLeadCaptureSetupResponse | null) {
  return {
    appId: setup?.config.appId || clientConfig.meta.appId || '',
    pageIds: joinList(setup?.config.pageIds || []),
    formIds: joinList(setup?.config.formIds || []),
    accessToken: '',
  } satisfies WebhookFormState;
}

function getDefaultPaymentsRedirectUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}/dashboard/integrations?integration=whatsapp-payments`;
}

function buildWhatsAppPaymentsForm(): WhatsAppPaymentsFormState {
  return {
    configurationName: '',
    purposeCode: '00',
    merchantCategoryCode: '0000',
    providerName: 'razorpay',
    providerMid: '',
    merchantVpa: '',
    redirectUrl: getDefaultPaymentsRedirectUrl(),
    dataEndpointUrl: '',
  };
}

function isPaymentConfigurationActive(status: string | null | undefined) {
  return (status || '').trim().toLowerCase() === 'active';
}

function supportsOAuth(providerName: string | null | undefined) {
  return (providerName || '').trim().toLowerCase() !== 'upi_vpa';
}

function formatUnixTimestamp(value: number | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getPaymentStatusClassName(status: string | null | undefined) {
  const normalized = (status || '').trim().toLowerCase();

  if (normalized === 'active') {
    return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  }

  if (normalized.includes('needs')) {
    return 'border border-amber-100 bg-amber-50 text-amber-700';
  }

  return 'border border-gray-200 bg-gray-50 text-gray-700';
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function IntegrationCard({
  title,
  description,
  accentClassName,
  icon,
  connected,
  actionLabel,
  onClick,
}: {
  title: string;
  description: string;
  accentClassName: string;
  icon: ReactNode;
  connected: boolean;
  actionLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[200px] flex-col rounded-[24px] border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${accentClassName}`}>
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {connected ? (
              <span className="mt-1.5 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Connected
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-300 transition group-hover:bg-gray-100 group-hover:text-gray-500">
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">{description}</p>
      <div className="mt-4">
        {connected ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Connected
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl bg-[#d9e8ff] px-3.5 py-2 text-sm font-medium text-[#1f4ed8] transition group-hover:bg-[#c9ddff]">
            {actionLabel || 'Connect'}
          </div>
        )}
      </div>
    </button>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bootstrap, refresh } = useAppData();
  const [metaSetup, setMetaSetup] = useState<MetaLeadCaptureSetupResponse | null>(null);
  const [paymentsSetup, setPaymentsSetup] = useState<WhatsAppPaymentsSetupResponse | null>(null);
  const [emailConnection, setEmailConnection] = useState<EmailConnectionSummary | null>(null);
  const [isMetaSetupLoading, setIsMetaSetupLoading] = useState(true);
  const [isPaymentsSetupLoading, setIsPaymentsSetupLoading] = useState(true);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isWhatsAppPaymentsModalOpen, setIsWhatsAppPaymentsModalOpen] = useState(false);
  const [metaModalMode, setMetaModalMode] = useState<'options' | 'webhook'>('options');
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>(() => buildWebhookForm(null));
  const [whatsAppPaymentsForm, setWhatsAppPaymentsForm] = useState<WhatsAppPaymentsFormState>(() =>
    buildWhatsAppPaymentsForm(),
  );
  const [selectedPaymentConfigurationName, setSelectedPaymentConfigurationName] = useState<string | null>(null);
  const [selectedPaymentConfiguration, setSelectedPaymentConfiguration] =
    useState<WhatsAppPaymentConfiguration | null>(null);
  const [selectedPaymentDataEndpointUrl, setSelectedPaymentDataEndpointUrl] = useState('');
  const [paymentOAuthLinks, setPaymentOAuthLinks] = useState<Record<string, WhatsAppPaymentConfigurationOAuthResponse>>({});
  const [isPaymentConfigurationLoading, setIsPaymentConfigurationLoading] = useState(false);
  const [paymentsBusyKey, setPaymentsBusyKey] = useState<string | null>(null);
  const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'callback' | 'token' | null>(null);

  const loadMetaSetup = async () => {
    try {
      setIsMetaSetupLoading(true);
      const response = await appApi.getMetaLeadCaptureSetup();
      setMetaSetup(response);
      setWebhookForm((current) => ({
        ...buildWebhookForm(response),
        accessToken: '',
        appId: current.appId || response.config.appId || clientConfig.meta.appId || '',
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta Lead Capture setup.');
    } finally {
      setIsMetaSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadMetaSetup();
  }, []);

  const loadWhatsAppPaymentsSetup = async () => {
    try {
      setIsPaymentsSetupLoading(true);
      const response = await appApi.getWhatsAppPaymentsSetup();
      setPaymentsSetup(response);

      if (!selectedPaymentConfigurationName && response.configurations[0]) {
        setSelectedPaymentConfigurationName(response.configurations[0].configurationName);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load WhatsApp Payments.');
    } finally {
      setIsPaymentsSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadWhatsAppPaymentsSetup();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadEmailConnection = async () => {
      try {
        const response = await appApi.getEmailConnection();

        if (!cancelled) {
          setEmailConnection(response.connection);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load email integration.');
        }
      }
    };

    void loadEmailConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const integration = searchParams.get('integration');
    if (integration === 'meta-lead-capture') {
      setIsMetaModalOpen(true);
      setMetaModalMode('options');
      return;
    }

    if (integration === 'whatsapp-payments') {
      setIsWhatsAppPaymentsModalOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!paymentsSetup) {
      return;
    }

    if (
      selectedPaymentConfigurationName &&
      paymentsSetup.configurations.some(
        (configuration) =>
          configuration.configurationName === selectedPaymentConfigurationName,
      )
    ) {
      return;
    }

    setSelectedPaymentConfigurationName(
      paymentsSetup.configurations[0]?.configurationName || null,
    );
  }, [paymentsSetup, selectedPaymentConfigurationName]);

  const metaLeadCaptureConnected = useMemo(() => {
    if (!metaSetup) {
      return false;
    }

    return Boolean(
      metaSetup.config.verifiedAt &&
        metaSetup.config.pageIds.length &&
        metaSetup.config.accessTokenLast4 &&
        metaSetup.config.status === 'ready',
    );
  }, [metaSetup]);

  const allLeadPagesSubscribed = useMemo(() => {
    if (!metaSetup?.pageSubscriptions.length) {
      return false;
    }

    return metaSetup.pageSubscriptions.every((subscription) => subscription.subscribed);
  }, [metaSetup]);

  const whatsAppPaymentsConnected = useMemo(() => {
    if (!paymentsSetup) {
      return false;
    }

    return paymentsSetup.configurations.some((configuration) =>
      isPaymentConfigurationActive(configuration.status),
    );
  }, [paymentsSetup]);

  const closeMetaModal = () => {
    setIsMetaModalOpen(false);
    setMetaModalMode('options');
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('integration');
      return next;
    });
  };

  const closeWhatsAppPaymentsModal = () => {
    setIsWhatsAppPaymentsModalOpen(false);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('integration');
      return next;
    });
  };

  const openMetaModal = () => {
    setIsMetaModalOpen(true);
    setMetaModalMode('options');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'meta-lead-capture');
      return next;
    });
  };

  const openWhatsAppPaymentsModal = () => {
    setIsWhatsAppPaymentsModalOpen(true);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'whatsapp-payments');
      return next;
    });
  };

  const copyText = async (value: string, field: 'callback' | 'token') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1600);
    } catch {
      return;
    }
  };

  const handleFacebookConnect = async () => {
    try {
      setIsConnectingFacebook(true);
      setError(null);
      setSuccess(null);

      const embeddedSession = await beginEmbeddedSignup();
      await appApi.connectMetaEmbedded({
        setupType: bootstrap?.channel?.setupType || 'coexistence',
        code: embeddedSession.code,
        wabaId: embeddedSession.wabaId,
        phoneNumberId: embeddedSession.phoneNumberId,
      });
      await refresh();
      await loadMetaSetup();
      setMetaModalMode('webhook');
      setSuccess('Facebook embedded onboarding completed. Finish the webhook setup below to start capturing leads.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Facebook connection failed.');
    } finally {
      setIsConnectingFacebook(false);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      setIsSavingWebhook(true);
      setError(null);
      setSuccess(null);

      const pageIds = splitList(webhookForm.pageIds);
      const formIds = splitList(webhookForm.formIds);
      const hasToken = Boolean(webhookForm.accessToken.trim() || metaSetup?.config.accessTokenLast4);

      let response = await appApi.saveMetaLeadCaptureSetup({
        appId: webhookForm.appId.trim() || clientConfig.meta.appId || null,
        pageIds,
        formIds,
        accessToken: webhookForm.accessToken.trim() || undefined,
        defaultOwnerName: bootstrap?.profile?.fullName || null,
        defaultLabels: ['meta lead'],
        autoCreateLeads: true,
      });

      if (pageIds.length && hasToken) {
        response = await appApi.subscribeMetaLeadCapturePages();
      }

      setMetaSetup(response);
      setWebhookForm((current) => ({
        ...buildWebhookForm(response),
        accessToken: '',
        appId: current.appId || response.config.appId || clientConfig.meta.appId || '',
      }));
      setSuccess('Meta Lead Capture webhook setup saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save the webhook setup.');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  useEffect(() => {
    if (!selectedPaymentConfigurationName || !isWhatsAppPaymentsModalOpen || !paymentsSetup?.hasChannel) {
      setSelectedPaymentConfiguration(null);
      setSelectedPaymentDataEndpointUrl('');
      return;
    }

    let cancelled = false;

    const loadConfiguration = async () => {
      try {
        setIsPaymentConfigurationLoading(true);
        const response = await appApi.getWhatsAppPaymentConfiguration(selectedPaymentConfigurationName);

        if (cancelled) {
          return;
        }

        setSelectedPaymentConfiguration(response.configuration);
        setSelectedPaymentDataEndpointUrl(response.configuration.dataEndpointUrl || '');
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load the payment configuration.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsPaymentConfigurationLoading(false);
        }
      }
    };

    void loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, [isWhatsAppPaymentsModalOpen, paymentsSetup?.hasChannel, selectedPaymentConfigurationName]);

  const handleRefreshWhatsAppPayments = async () => {
    setError(null);
    setSuccess(null);
    await loadWhatsAppPaymentsSetup();
  };

  const handleCreateWhatsAppPaymentConfiguration = async () => {
    try {
      setPaymentsBusyKey('create-payment-config');
      setError(null);
      setSuccess(null);
      const response = await appApi.createWhatsAppPaymentConfiguration(whatsAppPaymentsForm);

      setPaymentsSetup((current) =>
        current
          ? {
              ...current,
              configurations: [
                response.configuration,
                ...current.configurations.filter(
                  (configuration) =>
                    configuration.configurationName !== response.configuration.configurationName,
                ),
              ],
            }
          : current,
      );
      setSelectedPaymentConfigurationName(response.configuration.configurationName);
      setSelectedPaymentConfiguration(response.configuration);
      setSelectedPaymentDataEndpointUrl(response.configuration.dataEndpointUrl || '');
      setWhatsAppPaymentsForm(buildWhatsAppPaymentsForm());

      if (response.oauth?.oauthUrl) {
        setPaymentOAuthLinks((current) => ({
          ...current,
          [response.configuration.configurationName]: response.oauth!,
        }));
        setSuccess('Payment configuration created. Open the onboarding link to finish connecting the gateway.');
      } else {
        setSuccess('Payment configuration created.');
      }

      await loadWhatsAppPaymentsSetup();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to create the payment configuration.',
      );
    } finally {
      setPaymentsBusyKey(null);
    }
  };

  const handleUpdateSelectedPaymentDataEndpoint = async () => {
    if (!selectedPaymentConfigurationName) {
      return;
    }

    try {
      setPaymentsBusyKey(`endpoint:${selectedPaymentConfigurationName}`);
      setError(null);
      setSuccess(null);
      const response = await appApi.updateWhatsAppPaymentConfigurationDataEndpoint(
        selectedPaymentConfigurationName,
        {
          dataEndpointUrl: selectedPaymentDataEndpointUrl,
        },
      );

      setSelectedPaymentConfiguration(response.configuration);
      setPaymentsSetup((current) =>
        current
          ? {
              ...current,
              configurations: current.configurations.map((configuration) =>
                configuration.configurationName === response.configuration.configurationName
                  ? response.configuration
                  : configuration,
              ),
            }
          : current,
      );
      setSuccess('Data endpoint updated.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to update the data endpoint.',
      );
    } finally {
      setPaymentsBusyKey(null);
    }
  };

  const handleRegenerateSelectedPaymentOAuthLink = async () => {
    if (!selectedPaymentConfigurationName) {
      return;
    }

    try {
      setPaymentsBusyKey(`oauth:${selectedPaymentConfigurationName}`);
      setError(null);
      setSuccess(null);
      const response = await appApi.regenerateWhatsAppPaymentConfigurationOAuthLink(
        selectedPaymentConfigurationName,
        {
          redirectUrl: whatsAppPaymentsForm.redirectUrl,
        },
      );

      setPaymentOAuthLinks((current) => ({
        ...current,
        [selectedPaymentConfigurationName]: response.oauth,
      }));
      setSuccess('A new onboarding link is ready.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to generate a new onboarding link.',
      );
    } finally {
      setPaymentsBusyKey(null);
    }
  };

  const handleDeleteSelectedPaymentConfiguration = async () => {
    if (!selectedPaymentConfigurationName) {
      return;
    }

    const confirmed = window.confirm(
      `Delete payment configuration "${selectedPaymentConfigurationName}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setPaymentsBusyKey(`delete:${selectedPaymentConfigurationName}`);
      setError(null);
      setSuccess(null);
      await appApi.deleteWhatsAppPaymentConfiguration(selectedPaymentConfigurationName);

      setPaymentsSetup((current) =>
        current
          ? {
              ...current,
              configurations: current.configurations.filter(
                (configuration) =>
                  configuration.configurationName !== selectedPaymentConfigurationName,
              ),
            }
          : current,
      );
      setPaymentOAuthLinks((current) => {
        const next = { ...current };
        delete next[selectedPaymentConfigurationName];
        return next;
      });
      setSelectedPaymentConfiguration(null);
      setSelectedPaymentDataEndpointUrl('');
      setSelectedPaymentConfigurationName((current) => {
        const remaining = paymentsSetup?.configurations.filter(
          (configuration) => configuration.configurationName !== current,
        );
        return remaining?.[0]?.configurationName || null;
      });
      setSuccess('Payment configuration deleted.');
      await loadWhatsAppPaymentsSetup();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to delete the payment configuration.',
      );
    } finally {
      setPaymentsBusyKey(null);
    }
  };

  const cards = [
    {
      id: 'meta-lead-capture',
      title: 'Meta Lead Capture',
      description:
        'Capture Facebook and Meta lead form submissions in real time and push them straight into CRM with webhook-driven lead sync.',
      accentClassName: 'bg-[#eef4ff] text-[#2563eb]',
      icon: <Webhook className="h-7 w-7" />,
      connected: metaLeadCaptureConnected,
      actionLabel: 'Connect',
      onClick: openMetaModal,
    },
    {
      id: 'whatsapp-payments',
      title: 'WhatsApp Payments',
      description:
        'Create payment configurations, connect gateways, add data endpoints, and manage payment onboarding for order details on WhatsApp.',
      accentClassName: 'bg-[#eef8e8] text-[#15803d]',
      icon: <Wallet className="h-7 w-7" />,
      connected: whatsAppPaymentsConnected,
      actionLabel: 'Connect',
      onClick: openWhatsAppPaymentsModal,
    },
    {
      id: 'whatsapp-cloud-api',
      title: 'WhatsApp Cloud API',
      description:
        'Connect your production WhatsApp Business number for live inbox, templates, campaigns, calls, and business profile sync.',
      accentClassName: 'bg-[#e8f9ef] text-[#16a34a]',
      icon: <MessageCircle className="h-7 w-7" />,
      connected: Boolean(bootstrap?.channel),
      actionLabel: 'Connect',
      onClick: () => navigate(bootstrap?.channel ? '/dashboard/channels' : '/onboarding/channel-connection'),
    },
    {
      id: 'instagram-business',
      title: 'Instagram Business Login',
      description:
        'Attach your Instagram Business account to receive direct messages, unify inbox operations, and keep channel details synced.',
      accentClassName: 'bg-[#fff1f7] text-[#db2777]',
      icon: <Instagram className="h-7 w-7" />,
      connected: Boolean(bootstrap?.instagramChannel),
      actionLabel: 'Connect',
      onClick: () => navigate('/dashboard/channels'),
    },
    {
      id: 'messenger-platform',
      title: 'Messenger Platform',
      description:
        'Connect a Facebook Page, store its Page access token securely, and subscribe the Page to Messenger webhook fields for future inbox work.',
      accentClassName: 'bg-[#eef4ff] text-[#2563eb]',
      icon: <Facebook className="h-7 w-7" />,
      connected: Boolean(bootstrap?.messengerChannel),
      actionLabel: 'Connect',
      onClick: () => navigate('/dashboard/channels'),
    },
    {
      id: 'email-integration',
      title: 'Email Integration',
      description:
        'Connect your team inbox over SMTP and IMAP to sync incoming mail, save email templates, and send campaigns to multiple recipients.',
      accentClassName: 'bg-[#fff7ed] text-[#ea580c]',
      icon: <Mail className="h-7 w-7" />,
      connected: Boolean(emailConnection),
      actionLabel: 'Connect',
      onClick: () => navigate(emailConnection ? '/dashboard/emails' : '/dashboard/emails?setup=1'),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect and manage the channels and lead sources your workspace depends on.
          </p>
        </div>
      </div>

      {error && !isMetaModalOpen && !isWhatsAppPaymentsModalOpen ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ id, ...card }) => (
          <div key={id}>
            <IntegrationCard {...card} />
          </div>
        ))}
      </div>

      {isWhatsAppPaymentsModalOpen ? (
        <ModalShell
          title="WhatsApp Payments"
          subtitle="Create payment configurations, link gateways, and manage payment onboarding for your WhatsApp Business Account."
          onClose={closeWhatsAppPaymentsModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            {isPaymentsSetupLoading && !paymentsSetup ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-[28px] border border-gray-200 bg-[#fcfcfd]">
                <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
              </div>
            ) : !bootstrap?.channel || !paymentsSetup?.hasChannel ? (
              <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfd] p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2563eb]">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Connect WhatsApp first</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-600">
                      WhatsApp Payments are created against your WhatsApp Business Account. Connect your WhatsApp Business number first, then return here to create payment configurations.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard/channels')}
                      className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
                    >
                      Open Channels
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[28px] border border-gray-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">WABA ID</p>
                    <p className="mt-4 break-all text-sm font-medium text-gray-900">{paymentsSetup.wabaId || 'Not available'}</p>
                  </div>
                  <div className="rounded-[28px] border border-gray-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Configurations</p>
                    <p className="mt-4 text-4xl font-bold text-gray-900">{paymentsSetup.configurations.length}</p>
                    <p className="mt-2 text-sm text-gray-500">Payment setups currently available on this WhatsApp Business Account.</p>
                  </div>
                  <div className="rounded-[28px] border border-gray-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Active</p>
                    <p className="mt-4 text-4xl font-bold text-gray-900">
                      {paymentsSetup.configurations.filter((configuration) => isPaymentConfigurationActive(configuration.status)).length}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">Configurations ready to use inside order details messages.</p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfd] p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Create configuration</p>
                      <h3 className="mt-2 text-2xl font-bold text-gray-900">Add a new payment configuration</h3>
                      <p className="mt-2 max-w-3xl text-sm text-gray-500">
                        Create one configuration per payment setup. Payment gateways use OAuth onboarding, while UPI uses the merchant VPA directly.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRefreshWhatsAppPayments()}
                      disabled={isPaymentsSetupLoading}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      {isPaymentsSetupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Refresh
                    </button>
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Configuration name</span>
                      <input
                        type="text"
                        value={whatsAppPaymentsForm.configurationName}
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) => ({
                            ...current,
                            configurationName: event.target.value,
                          }))
                        }
                        placeholder="my-payment-config"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Provider</span>
                      <select
                        value={whatsAppPaymentsForm.providerName}
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) => ({
                            ...current,
                            providerName: event.target.value as WhatsAppPaymentsFormState['providerName'],
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      >
                        <option value="razorpay">Razorpay</option>
                        <option value="payu">PayU</option>
                        <option value="zaakpay">Zaakpay</option>
                        <option value="upi_vpa">UPI (VPA)</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Purpose code</span>
                      <input
                        type="text"
                        value={whatsAppPaymentsForm.purposeCode}
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) => ({
                            ...current,
                            purposeCode: event.target.value,
                          }))
                        }
                        placeholder="00"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Merchant category code</span>
                      <input
                        type="text"
                        value={whatsAppPaymentsForm.merchantCategoryCode}
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) => ({
                            ...current,
                            merchantCategoryCode: event.target.value,
                          }))
                        }
                        placeholder="0000"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">
                        {whatsAppPaymentsForm.providerName === 'upi_vpa' ? 'Merchant UPI ID' : 'Gateway merchant ID'}
                      </span>
                      <input
                        type="text"
                        value={
                          whatsAppPaymentsForm.providerName === 'upi_vpa'
                            ? whatsAppPaymentsForm.merchantVpa
                            : whatsAppPaymentsForm.providerMid
                        }
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) =>
                            current.providerName === 'upi_vpa'
                              ? {
                                  ...current,
                                  merchantVpa: event.target.value,
                                }
                              : {
                                  ...current,
                                  providerMid: event.target.value,
                                },
                          )
                        }
                        placeholder={
                          whatsAppPaymentsForm.providerName === 'upi_vpa'
                            ? 'merchant@upi'
                            : 'Optional merchant ID'
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">
                        {whatsAppPaymentsForm.providerName === 'upi_vpa' ? 'Data endpoint URL' : 'Redirect URL'}
                      </span>
                      <input
                        type="url"
                        value={
                          whatsAppPaymentsForm.providerName === 'upi_vpa'
                            ? whatsAppPaymentsForm.dataEndpointUrl
                            : whatsAppPaymentsForm.redirectUrl
                        }
                        onChange={(event) =>
                          setWhatsAppPaymentsForm((current) =>
                            current.providerName === 'upi_vpa'
                              ? {
                                  ...current,
                                  dataEndpointUrl: event.target.value,
                                }
                              : {
                                  ...current,
                                  redirectUrl: event.target.value,
                                },
                          )
                        }
                        placeholder={
                          whatsAppPaymentsForm.providerName === 'upi_vpa'
                            ? 'https://your-domain.com/payments/data'
                            : 'https://your-domain.com/redirect'
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    {whatsAppPaymentsForm.providerName !== 'upi_vpa' ? (
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Data endpoint URL</span>
                        <input
                          type="url"
                          value={whatsAppPaymentsForm.dataEndpointUrl}
                          onChange={(event) =>
                            setWhatsAppPaymentsForm((current) => ({
                              ...current,
                              dataEndpointUrl: event.target.value,
                            }))
                          }
                          placeholder="Optional. Used for shipping, coupons, and inventory."
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleCreateWhatsAppPaymentConfiguration()}
                      disabled={paymentsBusyKey === 'create-payment-config'}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60"
                    >
                      {paymentsBusyKey === 'create-payment-config' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create payment configuration
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="rounded-[28px] border border-gray-200 bg-white p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Configurations</p>
                        <h3 className="mt-2 text-2xl font-bold text-gray-900">Existing setups</h3>
                      </div>
                      {isPaymentsSetupLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#5b45ff]" /> : null}
                    </div>

                    <div className="mt-5 space-y-3">
                      {paymentsSetup.configurations.length ? (
                        paymentsSetup.configurations.map((configuration) => (
                          <button
                            key={configuration.configurationName}
                            type="button"
                            onClick={() => setSelectedPaymentConfigurationName(configuration.configurationName)}
                            className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                              selectedPaymentConfigurationName === configuration.configurationName
                                ? 'border-[#5b45ff] bg-[#f5f3ff]'
                                : 'border-gray-200 bg-[#fcfcfd] hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-gray-900">{configuration.configurationName}</p>
                                <p className="mt-1 text-sm text-gray-500">
                                  {(configuration.providerName || 'Provider not returned').toUpperCase()}
                                </p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getPaymentStatusClassName(configuration.status)}`}>
                                {configuration.status || 'Unknown'}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                              <p>MCC: {configuration.merchantCategoryCode?.code || 'Not available'}</p>
                              <p>Purpose: {configuration.purposeCode?.code || 'Not available'}</p>
                              <p>MID: {configuration.providerMid || 'Not available'}</p>
                              <p>Updated: {formatUnixTimestamp(configuration.updatedTimestamp)}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-gray-200 bg-[#fcfcfd] px-5 py-10 text-center text-sm text-gray-500">
                          No payment configurations yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-gray-200 bg-white p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Selected configuration</p>
                        <h3 className="mt-2 text-2xl font-bold text-gray-900">
                          {selectedPaymentConfiguration?.configurationName || 'Choose a configuration'}
                        </h3>
                      </div>
                      {isPaymentConfigurationLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#5b45ff]" /> : null}
                    </div>

                    {selectedPaymentConfiguration ? (
                      <div className="mt-6 space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Provider</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">{selectedPaymentConfiguration.providerName || 'Not available'}</p>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Status</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">{selectedPaymentConfiguration.status || 'Unknown'}</p>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Created</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">{formatUnixTimestamp(selectedPaymentConfiguration.createdTimestamp)}</p>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Updated</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">{formatUnixTimestamp(selectedPaymentConfiguration.updatedTimestamp)}</p>
                          </div>
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Data endpoint URL</span>
                          <input
                            type="url"
                            value={selectedPaymentDataEndpointUrl}
                            onChange={(event) => setSelectedPaymentDataEndpointUrl(event.target.value)}
                            placeholder="https://your-domain.com/payments/data"
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                          <p className="mt-2 text-xs text-gray-500">
                            Use this endpoint for shipping, coupons, and real-time inventory decisions.
                          </p>
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void handleUpdateSelectedPaymentDataEndpoint()}
                            disabled={paymentsBusyKey === `endpoint:${selectedPaymentConfiguration.configurationName}`}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                          >
                            {paymentsBusyKey === `endpoint:${selectedPaymentConfiguration.configurationName}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                            Update data endpoint
                          </button>

                          {supportsOAuth(selectedPaymentConfiguration.providerName) ? (
                            <button
                              type="button"
                              onClick={() => void handleRegenerateSelectedPaymentOAuthLink()}
                              disabled={paymentsBusyKey === `oauth:${selectedPaymentConfiguration.configurationName}`}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9e8ff] bg-[#eef4ff] px-4 py-3 text-sm font-medium text-[#1f4ed8] transition hover:bg-[#e3eeff] disabled:opacity-60"
                            >
                              {paymentsBusyKey === `oauth:${selectedPaymentConfiguration.configurationName}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                              Regenerate OAuth link
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-3 text-sm text-gray-500">
                              UPI configurations do not need OAuth.
                            </div>
                          )}
                        </div>

                        {paymentOAuthLinks[selectedPaymentConfiguration.configurationName]?.oauthUrl ? (
                          <div className="rounded-2xl border border-[#d9e8ff] bg-[#f5f9ff] p-4">
                            <p className="text-sm font-medium text-gray-900">Onboarding link ready</p>
                            <p className="mt-2 break-all text-sm text-gray-600">
                              {paymentOAuthLinks[selectedPaymentConfiguration.configurationName].oauthUrl}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <a
                                href={paymentOAuthLinks[selectedPaymentConfiguration.configurationName].oauthUrl || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4a35e8]"
                              >
                                <Link2 className="h-4 w-4" />
                                Open onboarding
                              </a>
                              <span className="inline-flex items-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-medium text-gray-600">
                                Expires {formatUnixTimestamp(paymentOAuthLinks[selectedPaymentConfiguration.configurationName].expiration)}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void handleDeleteSelectedPaymentConfiguration()}
                          disabled={paymentsBusyKey === `delete:${selectedPaymentConfiguration.configurationName}`}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {paymentsBusyKey === `delete:${selectedPaymentConfiguration.configurationName}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete configuration
                        </button>
                      </div>
                    ) : (
                      <div className="mt-6 rounded-[24px] border border-dashed border-gray-200 bg-[#fcfcfd] px-5 py-12 text-center text-sm text-gray-500">
                        Choose a configuration from the list to manage it here.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-gray-200 bg-white p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Recent webhook updates</p>
                  <h3 className="mt-2 text-2xl font-bold text-gray-900">Payment configuration update events</h3>
                  <div className="mt-5 space-y-3">
                    {paymentsSetup.recentEvents.length ? (
                      paymentsSetup.recentEvents.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-gray-200 bg-[#fcfcfd] px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {event.configurationName || 'Unnamed configuration'}
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                Provider: {event.providerName || 'Not returned'}{event.providerMid ? ` • MID ${event.providerMid}` : ''}
                              </p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getPaymentStatusClassName(event.status)}`}>
                              {event.status || 'Updated'}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-gray-500">
                            Created: {formatUnixTimestamp(event.createdTimestamp)} • Updated: {formatUnixTimestamp(event.updatedTimestamp)} • Received: {new Date(event.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-gray-200 bg-[#fcfcfd] px-5 py-10 text-center text-sm text-gray-500">
                        No payment configuration webhook updates yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      ) : null}

      {isMetaModalOpen ? (
        <ModalShell
          title="Meta Lead Capture"
          subtitle="Choose how you want to connect Meta lead capture inside Connektly."
          onClose={closeMetaModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={handleFacebookConnect}
                disabled={isConnectingFacebook || !hasEmbeddedSignupConfig}
                className="rounded-[28px] border border-gray-200 bg-[#f8fbff] p-6 text-left shadow-sm transition hover:border-[#bfd5ff] hover:bg-[#f1f7ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Connect with Facebook</p>
                    <p className="text-sm text-gray-500">Launch embedded onboarding</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-gray-600">
                  Use the existing Meta embedded onboarding flow to attach your Meta environment first, then finish webhook capture setup here.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#d9e8ff] px-4 py-3 text-sm font-medium text-[#1f4ed8]">
                  {isConnectingFacebook ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {hasEmbeddedSignupConfig ? 'Connect with Facebook' : 'Embedded onboarding unavailable'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMetaModalMode('webhook')}
                className="rounded-[28px] border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111827] text-white">
                    <Webhook className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Connect via webhook</p>
                    <p className="text-sm text-gray-500">Paste callback details into Meta</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-gray-600">
                  Configure callback URL, verify token, app ID, page ID, and form mapping for direct Meta lead capture sync.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                  <Webhook className="h-4 w-4" /> Open webhook setup
                </div>
              </button>
            </div>

            {metaModalMode === 'webhook' ? (
              <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfd] p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Webhook setup</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">Connect Meta Lead Capture via webhook</h3>
                    <p className="mt-2 max-w-3xl text-sm text-gray-500">
                      Paste these details into Meta, then save your IDs below. The page access token remains required so Connektly can retrieve lead fields after each webhook hits the server.
                    </p>
                  </div>
                  {isMetaSetupLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#5b45ff]" /> : null}
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Webhook callback URL</p>
                    <p className="mt-3 break-all text-sm font-medium text-gray-900">{metaSetup?.config.callbackUrl || 'Loading...'}</p>
                    {metaSetup?.config.callbackUrl ? (
                      <button
                        type="button"
                        onClick={() => void copyText(metaSetup.config.callbackUrl, 'callback')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Copy className="h-3.5 w-3.5" /> {copiedField === 'callback' ? 'Copied' : 'Copy URL'}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Webhook verify token</p>
                    <p className="mt-3 break-all text-sm font-medium text-gray-900">{metaSetup?.config.verifyToken || 'Loading...'}</p>
                    {metaSetup?.config.verifyToken ? (
                      <button
                        type="button"
                        onClick={() => void copyText(metaSetup.config.verifyToken, 'token')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Copy className="h-3.5 w-3.5" /> {copiedField === 'token' ? 'Copied' : 'Copy token'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta App ID</span>
                    <input
                      type="text"
                      value={webhookForm.appId}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, appId: event.target.value }))}
                      placeholder="Meta app ID"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta Page ID</span>
                    <textarea
                      value={webhookForm.pageIds}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, pageIds: event.target.value }))}
                      rows={3}
                      placeholder={'One Page ID per line\n123456789012345'}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta Form ID</span>
                    <textarea
                      value={webhookForm.formIds}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, formIds: event.target.value }))}
                      rows={3}
                      placeholder={'Optional. Leave blank to accept all forms.\n987654321098765'}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Facebook Page Access Token</span>
                    <input
                      type="password"
                      value={webhookForm.accessToken}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, accessToken: event.target.value }))}
                      placeholder={
                        metaSetup?.config.accessTokenLast4
                          ? `Saved token ending in ${metaSetup.config.accessTokenLast4}. Enter a new one only if you want to replace it.`
                          : 'Required to retrieve lead fields after webhook delivery'
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Meta-side checklist</p>
                    <p className="mt-2">1. Add the `Webhooks` product in Meta App Dashboard.</p>
                    <p className="mt-1">2. Subscribe the app to the `Page` object and enable `leadgen`.</p>
                    <p className="mt-1">3. Use the callback URL and verify token shown above.</p>
                    <p className="mt-1">4. Grant page and form access in Leads Access Manager.</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Current status</p>
                    <p className="mt-2">Webhook verified: <span className="font-semibold text-gray-900">{metaSetup?.config.verifiedAt ? 'Yes' : 'Pending'}</span></p>
                    <p className="mt-2">Page subscriptions active: <span className="font-semibold text-gray-900">{allLeadPagesSubscribed ? 'Yes' : 'Pending'}</span></p>
                    <p className="mt-2">Last lead sync: <span className="font-semibold text-gray-900">{metaSetup?.config.lastLeadSyncedAt ? new Date(metaSetup.config.lastLeadSyncedAt).toLocaleString() : 'Not available'}</span></p>
                  </div>
                </div>

                {metaSetup?.pageSubscriptions.length ? (
                  <div className="mt-6 grid gap-3">
                    {metaSetup.pageSubscriptions.map((subscription) => (
                      <div key={subscription.pageId} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-mono text-xs text-gray-700">{subscription.pageId}</p>
                            <p className="mt-1 text-gray-500">
                              {subscription.errorMessage
                                ? subscription.errorMessage
                                : subscription.subscribedFields.length
                                  ? `Subscribed fields: ${subscription.subscribedFields.join(', ')}`
                                  : 'No subscribed fields returned yet.'}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              subscription.subscribed
                                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                                : 'border border-amber-100 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {subscription.subscribed ? 'Connected' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setMetaModalMode('options')}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveWebhook()}
                    disabled={isSavingWebhook}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60"
                  >
                    {isSavingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                    Save webhook setup
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
