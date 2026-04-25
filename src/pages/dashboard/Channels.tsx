import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronRight,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  Power,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { beginInstagramBusinessLogin, beginMessengerPageLogin } from '../../lib/meta-sdk';
import { hasInstagramBusinessLoginConfig, hasMessengerLoginConfig } from '../../lib/config';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type { InstagramConnectableAccount, MessengerConnectablePage } from '../../lib/types';

type ChannelId = 'whatsapp' | 'instagram' | 'messenger';

type ChannelListItem = {
  id: ChannelId;
  name: string;
  shortStatus: string;
  connected: boolean;
  icon: typeof MessageCircle;
  iconClassName: string;
  description: string;
};

type StatusRow = {
  label: string;
  account: string;
  detail?: string;
  statusText: string;
  statusTone: string;
};

type InstagramSelectionState = {
  accessToken: string;
  longLivedToken: string | null;
  accounts: InstagramConnectableAccount[];
};

type MessengerSelectionState = {
  accessToken: string;
  pages: MessengerConnectablePage[];
};

function getQualityMeta(qualityRating: string | null) {
  switch ((qualityRating || '').toLowerCase()) {
    case 'green':
    case 'high':
      return {
        label: 'High Quality',
        tone: 'text-green-700 bg-green-50 border-green-200',
      };
    case 'yellow':
    case 'medium':
      return {
        label: 'Medium Quality',
        tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      };
    case 'red':
    case 'low':
      return {
        label: 'Low Quality',
        tone: 'text-red-700 bg-red-50 border-red-200',
      };
    default:
      return {
        label: qualityRating || 'Unknown',
        tone: 'text-gray-700 bg-gray-50 border-gray-200',
      };
  }
}

function getDisplayNameApproval(verifiedName: string | null, isConnected: boolean) {
  if (!isConnected) {
    return {
      label: 'Not connected',
      tone: 'text-gray-700 bg-gray-50 border-gray-200',
    };
  }

  if (verifiedName) {
    return {
      label: 'Approved',
      tone: 'text-green-700 bg-green-50 border-green-200',
    };
  }

  return {
    label: 'Pending / not returned yet',
    tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };
}

function getMessengerPermissionStatus(pageTasks: string[]) {
  if (pageTasks.length === 0) {
    return {
      label: 'Task visibility unavailable',
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
      detail:
        'Meta did not return Page task visibility from this endpoint. Use the webhook subscription result below as the readiness signal.',
    };
  }

  const hasMessagingTask = pageTasks.some((task) => task === 'MESSAGE' || task === 'MESSAGING');
  const hasModerationTask = pageTasks.includes('MODERATE');

  if (hasMessagingTask && hasModerationTask) {
    return {
      label: 'Ready',
      tone: 'text-green-700 bg-green-50 border-green-200',
      detail: 'This Page can send messages and manage Messenger webhook subscriptions.',
    };
  }

  if (hasMessagingTask || hasModerationTask) {
    return {
      label: 'Partial access',
      tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      detail:
        'Messenger is connected, but Meta did not return the full Page task set needed for both messaging and webhook management.',
    };
  }

  return {
    label: 'Limited access',
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    detail:
      'Meta did not return the Page tasks required for Messenger sends or webhook subscription management.',
  };
}

function ChannelListButton({
  item,
  isActive,
  onClick,
}: {
  item: ChannelListItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
        isActive
          ? 'border-[#2364ff] bg-[#eff5ff] text-[#0f2e82] shadow-sm'
          : 'border-transparent bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${item.iconClassName}`}>
        <item.icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-base font-semibold ${isActive ? 'text-[#0f2e82]' : 'text-gray-900'}`}>
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-sm text-gray-500">{item.shortStatus}</p>
      </div>

      <div className="flex items-center gap-2">
        {item.connected ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2364ff] text-white">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <ChevronRight className={`h-4 w-4 ${isActive ? 'text-[#2364ff]' : 'text-gray-300'}`} />
      </div>
    </button>
  );
}

function StatusTable({
  rows,
  isQualityTable = false,
}: {
  rows: StatusRow[];
  isQualityTable?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)] border-b border-gray-200 bg-[#eef2f8] px-5 py-4 text-sm font-bold text-gray-900">
        <p>Account</p>
        <p>Status</p>
      </div>

      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-1 gap-4 border-b border-gray-100 px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)]"
        >
          <div>
            <p className="text-lg font-semibold text-gray-900">{row.label}</p>
            <p className="mt-2 text-sm font-medium text-gray-700">{row.account}</p>
            {row.detail ? <p className="mt-1 text-sm leading-6 text-gray-500">{row.detail}</p> : null}
          </div>

          <div className="flex items-start md:justify-start">
            <div className={`inline-flex max-w-full rounded-full border px-3 py-1.5 text-sm font-semibold ${row.statusTone}`}>
              {row.statusText}
            </div>
          </div>
        </div>
      ))}

      {isQualityTable ? (
        <div className="border-t border-gray-100 bg-white px-5 py-5 text-sm leading-6 text-gray-600">
          <p>
            <span className="font-semibold text-green-700">Green: High Quality</span>{' '}
            Indicates strong message performance, minimal user complaints, and high user interaction (replies/clicks).
          </p>
          <p className="mt-2">
            <span className="font-semibold text-yellow-700">Yellow: Medium Quality</span>{' '}
            Suggests moderate performance, with some user feedback indicating low engagement or minor complaints.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-red-700">Red: Low Quality</span>{' '}
            Indicates poor performance and high user dissatisfaction (spam-like behavior, frequent blocks).
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function Channels() {
  const location = useLocation();
  const { bootstrap, refresh } = useAppData();
  const [selectedChannelId, setSelectedChannelId] = useState<ChannelId>('whatsapp');
  const [isWhatsAppDisconnecting, setIsWhatsAppDisconnecting] = useState(false);
  const [isInstagramConnecting, setIsInstagramConnecting] = useState(false);
  const [isInstagramDisconnecting, setIsInstagramDisconnecting] = useState(false);
  const [isSavingInstagramSelection, setIsSavingInstagramSelection] = useState(false);
  const [instagramSelection, setInstagramSelection] = useState<InstagramSelectionState | null>(null);
  const [isMessengerConnecting, setIsMessengerConnecting] = useState(false);
  const [isMessengerDisconnecting, setIsMessengerDisconnecting] = useState(false);
  const [isSavingMessengerSelection, setIsSavingMessengerSelection] = useState(false);
  const [messengerSelection, setMessengerSelection] = useState<MessengerSelectionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const channelsView = location.pathname.endsWith('/other') ? 'other' : 'meta';

  const whatsappChannel = bootstrap?.channel || null;
  const instagramChannel = bootstrap?.instagramChannel || null;
  const messengerChannel = bootstrap?.messengerChannel || null;
  const isWhatsAppConnected = Boolean(whatsappChannel);
  const isInstagramConnected = Boolean(instagramChannel);
  const isMessengerConnected = Boolean(messengerChannel);
  const displayNameApproval = getDisplayNameApproval(
    whatsappChannel?.verifiedName || null,
    isWhatsAppConnected,
  );
  const quality = getQualityMeta(whatsappChannel?.qualityRating || null);
  const messengerPermissionStatus = getMessengerPermissionStatus(messengerChannel?.pageTasks || []);

  const channels = useMemo<ChannelListItem[]>(
    () => [
      {
        id: 'whatsapp',
        name: 'WhatsApp Business API',
        shortStatus: isWhatsAppConnected
          ? whatsappChannel?.displayPhoneNumber || 'Connected'
          : 'Not connected',
        connected: isWhatsAppConnected,
        icon: MessageCircle,
        iconClassName: 'bg-[#e9fbf0] text-[#25D366]',
        description: 'Manage the live WhatsApp Business account connected to this workspace.',
      },
      {
        id: 'instagram',
        name: 'Instagram',
        shortStatus: isInstagramConnected
          ? `@${instagramChannel?.instagramUsername || instagramChannel?.instagramAccountId}`
          : 'Not connected',
        connected: isInstagramConnected,
        icon: Instagram,
        iconClassName: 'bg-pink-50 text-pink-600',
        description: isInstagramConnected
          ? 'Instagram is connected through Meta Business Login and linked to the selected Facebook Page.'
          : 'Connect an Instagram Professional account and its linked Facebook Page through Meta Business Login.',
      },
      {
        id: 'messenger',
        name: 'Facebook Messenger',
        shortStatus: isMessengerConnected
          ? messengerChannel?.pageName || messengerChannel?.pageId || 'Connected'
          : 'Not connected',
        connected: isMessengerConnected,
        icon: Facebook,
        iconClassName: 'bg-blue-50 text-blue-600',
        description: isMessengerConnected
          ? 'Messenger is connected to the selected Facebook Page and the Page token is stored on the server.'
          : 'Connect a Facebook Page through Meta Login so this workspace can start the Messenger Platform setup.',
      },
    ],
    [
      instagramChannel,
      isInstagramConnected,
      isMessengerConnected,
      isWhatsAppConnected,
      messengerChannel,
      whatsappChannel,
    ],
  );

  const selectedChannel = channels.find((entry) => entry.id === selectedChannelId) || channels[0];

  const whatsappRows: StatusRow[] = [
    {
      label: 'Account Connection',
      account:
        whatsappChannel?.displayPhoneNumber ||
        whatsappChannel?.phoneNumberId ||
        'No WhatsApp number connected',
      detail: whatsappChannel?.businessAccountName
        ? `Business account: ${whatsappChannel.businessAccountName}`
        : 'Connect a real Meta WhatsApp account to load live channel details.',
      statusText: isWhatsAppConnected ? 'Connected' : 'Disconnected',
      statusTone: isWhatsAppConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'WhatsApp Display Name',
      account: whatsappChannel?.verifiedName || 'Display name not returned yet',
      detail: 'Shows approval status and the current display name returned by Meta.',
      statusText: displayNameApproval.label,
      statusTone: displayNameApproval.tone,
    },
    {
      label: 'Message Limit',
      account: whatsappChannel?.messagingLimitTier || 'Unknown',
      detail: 'Shows the current messaging tier for the connected WhatsApp account.',
      statusText: whatsappChannel?.messagingLimitTier || 'Unknown',
      statusTone: 'text-[#0f2e82] bg-[#eff5ff] border-[#cdddff]',
    },
  ];

  const qualityRows: StatusRow[] = [
    {
      label: 'Quality Rating',
      account: quality.label,
      detail: 'Current WhatsApp account quality rating returned by Meta.',
      statusText: quality.label,
      statusTone: quality.tone,
    },
  ];

  const instagramRows: StatusRow[] = isInstagramConnected
    ? [
        {
          label: 'Account Connection',
          account:
            instagramChannel?.instagramUsername
              ? `@${instagramChannel.instagramUsername}`
              : instagramChannel?.instagramAccountId || 'Instagram account connected',
          detail: instagramChannel?.instagramName
            ? `Display name: ${instagramChannel.instagramName}`
            : `Instagram account ID: ${instagramChannel?.instagramAccountId}`,
          statusText: 'Connected',
          statusTone: 'text-green-700 bg-green-50 border-green-200',
        },
        {
          label: 'Connected Facebook Page',
          account: instagramChannel?.pageName || instagramChannel?.pageId || 'Page connected',
          detail: `Page ID: ${instagramChannel?.pageId}`,
          statusText: 'Connected',
          statusTone: 'text-[#0f2e82] bg-[#eff5ff] border-[#cdddff]',
        },
        {
          label: 'Connection Method',
          account: 'Meta Business Login',
          detail:
            'The workspace stores both the Instagram user token and the linked Page token for later channel actions.',
          statusText: 'Live',
          statusTone: 'text-pink-700 bg-pink-50 border-pink-200',
        },
      ]
    : [
        {
          label: 'Account Connection',
          account: 'Instagram is not connected to this workspace.',
          detail: 'Connect a Professional Instagram account that is linked to a Facebook Page.',
          statusText: 'Not connected',
          statusTone: 'text-gray-700 bg-gray-50 border-gray-200',
        },
        {
          label: 'Connection Flow',
          account: hasInstagramBusinessLoginConfig
            ? 'Meta Business Login is configured for this workspace.'
            : 'Instagram Business Login is not configured yet.',
          detail: hasInstagramBusinessLoginConfig
            ? 'The Connect button will open Meta in a popup and return the linked Instagram/Page accounts.'
            : 'Add the Instagram App ID and Config ID to enable this channel.',
          statusText: hasInstagramBusinessLoginConfig ? 'Ready' : 'Blocked',
          statusTone: hasInstagramBusinessLoginConfig
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ];

  const messengerRows: StatusRow[] = isMessengerConnected
    ? [
        {
          label: 'Page Connection',
          account: messengerChannel?.pageName || messengerChannel?.pageId || 'Facebook Page connected',
          detail: `Page ID: ${messengerChannel?.pageId}`,
          statusText: 'Connected',
          statusTone: 'text-green-700 bg-green-50 border-green-200',
        },
        {
          label: 'Page Tasks',
          account:
            messengerChannel?.pageTasks.length
              ? messengerChannel.pageTasks.join(', ')
              : 'Meta did not return Page task visibility.',
          detail: messengerPermissionStatus.detail,
          statusText: messengerPermissionStatus.label,
          statusTone: messengerPermissionStatus.tone,
        },
        {
          label: 'Webhook Subscription',
          account: messengerChannel?.webhookSubscribed
            ? messengerChannel.webhookFields.join(', ')
            : 'Messenger webhook subscription is not confirmed yet.',
          detail:
            messengerChannel?.webhookLastError ||
            'The Page is connected, but Meta did not confirm the Messenger webhook subscription.',
          statusText: messengerChannel?.webhookSubscribed ? 'Subscribed' : 'Needs attention',
          statusTone: messengerChannel?.webhookSubscribed
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ]
    : [
        {
          label: 'Page Connection',
          account: 'Messenger is not connected to this workspace.',
          detail: 'Connect a Facebook Page to start the Messenger Platform setup for this workspace.',
          statusText: 'Not connected',
          statusTone: 'text-gray-700 bg-gray-50 border-gray-200',
        },
        {
          label: 'Connection Flow',
          account: hasMessengerLoginConfig
            ? 'Meta Login is configured for Facebook Page selection.'
            : 'Messenger login is not configured yet.',
          detail: hasMessengerLoginConfig
            ? 'The Connect button will open Meta, return the Pages you can manage, and save the selected Page token on the server.'
            : 'Set VITE_META_APP_ID to enable the Messenger login flow.',
          statusText: hasMessengerLoginConfig ? 'Ready' : 'Blocked',
          statusTone: hasMessengerLoginConfig
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ];

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  useEscapeKey(Boolean(instagramSelection), () => setInstagramSelection(null));
  useEscapeKey(Boolean(messengerSelection), () => setMessengerSelection(null));

  if (channelsView === 'other') {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-[2rem] border border-gray-200 bg-white px-8 py-10 shadow-sm">
          <div className="max-w-3xl">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#2364ff]">
              <Link2 className="h-7 w-7" />
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Other Channels</h1>
            <p className="mt-3 text-base leading-7 text-gray-600">
              This section is reserved for non-Meta channel connections. Meta Channels remain available right
              now for WhatsApp, Instagram, and Messenger.
            </p>
            <div className="mt-6">
              <Link
                to="/dashboard/channels/meta"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9]"
              >
                <ChevronRight className="h-4 w-4" />
                Open Meta Channels
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleDisconnectWhatsApp = async () => {
    if (!whatsappChannel) {
      return;
    }

    const confirmed = window.confirm(
      `Disconnect the WhatsApp channel${
        whatsappChannel.displayPhoneNumber ? ` (${whatsappChannel.displayPhoneNumber})` : ''
      }?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsWhatsAppDisconnecting(true);
      clearMessages();
      await appApi.disconnectMetaChannel();
      await refresh();
      setSuccess('WhatsApp channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the WhatsApp channel.',
      );
    } finally {
      setIsWhatsAppDisconnecting(false);
    }
  };

  const handleInstagramConnect = async () => {
    try {
      setIsInstagramConnecting(true);
      clearMessages();
      const session = await beginInstagramBusinessLogin();
      const { accounts } = await appApi.getInstagramConnectionOptions({
        accessToken: session.accessToken,
        longLivedToken: session.longLivedToken,
      });

      if (accounts.length === 1) {
        await appApi.connectInstagramBusinessLogin({
          accessToken: session.accessToken,
          longLivedToken: session.longLivedToken,
          pageId: accounts[0].pageId,
        });
        await refresh();
        setSuccess('Instagram channel connected.');
        setSelectedChannelId('instagram');
        return;
      }

      setInstagramSelection({
        accessToken: session.accessToken,
        longLivedToken: session.longLivedToken,
        accounts,
      });
      setSelectedChannelId('instagram');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to connect the Instagram channel.',
      );
    } finally {
      setIsInstagramConnecting(false);
    }
  };

  const handleInstagramSelection = async (pageId: string) => {
    if (!instagramSelection) {
      return;
    }

    try {
      setIsSavingInstagramSelection(true);
      clearMessages();
      await appApi.connectInstagramBusinessLogin({
        accessToken: instagramSelection.accessToken,
        longLivedToken: instagramSelection.longLivedToken,
        pageId,
      });
      await refresh();
      setInstagramSelection(null);
      setSuccess('Instagram channel connected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save the Instagram channel.',
      );
    } finally {
      setIsSavingInstagramSelection(false);
    }
  };

  const handleDisconnectInstagram = async () => {
    if (!instagramChannel) {
      return;
    }

    const confirmed = window.confirm(
      `Disconnect the Instagram channel${
        instagramChannel.instagramUsername ? ` (@${instagramChannel.instagramUsername})` : ''
      }?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsInstagramDisconnecting(true);
      clearMessages();
      await appApi.disconnectInstagramChannel();
      await refresh();
      setSuccess('Instagram channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the Instagram channel.',
      );
    } finally {
      setIsInstagramDisconnecting(false);
    }
  };

  const handleMessengerConnect = async () => {
    try {
      setIsMessengerConnecting(true);
      clearMessages();
      const session = await beginMessengerPageLogin();
      const { pages } = await appApi.getMessengerConnectionOptions({
        accessToken: session.accessToken,
      });

      if (pages.length === 1) {
        await appApi.connectMessengerPageLogin({
          accessToken: session.accessToken,
          pageId: pages[0].pageId,
        });
        await refresh();
        setSuccess('Messenger channel connected.');
        setSelectedChannelId('messenger');
        return;
      }

      setMessengerSelection({
        accessToken: session.accessToken,
        pages,
      });
      setSelectedChannelId('messenger');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to connect the Messenger channel.',
      );
    } finally {
      setIsMessengerConnecting(false);
    }
  };

  const handleMessengerSelection = async (pageId: string) => {
    if (!messengerSelection) {
      return;
    }

    try {
      setIsSavingMessengerSelection(true);
      clearMessages();
      await appApi.connectMessengerPageLogin({
        accessToken: messengerSelection.accessToken,
        pageId,
      });
      await refresh();
      setMessengerSelection(null);
      setSuccess('Messenger channel connected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save the Messenger channel.',
      );
    } finally {
      setIsSavingMessengerSelection(false);
    }
  };

  const handleDisconnectMessenger = async () => {
    if (!messengerChannel) {
      return;
    }

    const confirmed = window.confirm(
      `Disconnect the Messenger channel${
        messengerChannel.pageName ? ` (${messengerChannel.pageName})` : ''
      }?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsMessengerDisconnecting(true);
      clearMessages();
      await appApi.disconnectMessengerChannel();
      await refresh();
      setSuccess('Messenger channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the Messenger channel.',
      );
    } finally {
      setIsMessengerDisconnecting(false);
    }
  };

  const renderPrimaryAction = () => {
    if (selectedChannel.id === 'whatsapp') {
      return isWhatsAppConnected ? (
        <button
          onClick={() => void handleDisconnectWhatsApp()}
          disabled={isWhatsAppDisconnecting}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
        >
          <Power className="h-4 w-4" />
          {isWhatsAppDisconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : (
        <Link
          to="/onboarding/channel-connection"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9]"
        >
          <Link2 className="h-4 w-4" />
          Connect
        </Link>
      );
    }

    if (selectedChannel.id === 'instagram') {
      return isInstagramConnected ? (
        <button
          onClick={() => void handleDisconnectInstagram()}
          disabled={isInstagramDisconnecting}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
        >
          <Power className="h-4 w-4" />
          {isInstagramDisconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleInstagramConnect()}
          disabled={isInstagramConnecting || !hasInstagramBusinessLoginConfig}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isInstagramConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {hasInstagramBusinessLoginConfig ? 'Connect' : 'Instagram login not configured'}
        </button>
      );
    }

    return isMessengerConnected ? (
      <button
        onClick={() => void handleDisconnectMessenger()}
        disabled={isMessengerDisconnecting}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
      >
        <Power className="h-4 w-4" />
        {isMessengerDisconnecting ? 'Disconnecting...' : 'Disconnect'}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void handleMessengerConnect()}
        disabled={isMessengerConnecting || !hasMessengerLoginConfig}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isMessengerConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        {hasMessengerLoginConfig ? 'Connect' : 'Messenger login not configured'}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Meta Channels</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a Meta channel from the list to review its connection status and live account details.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <motion.aside
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-[2rem] border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="space-y-2">
            {channels.map((item) => (
              <div key={item.id}>
                <ChannelListButton
                  item={item}
                  isActive={item.id === selectedChannel.id}
                  onClick={() => setSelectedChannelId(item.id)}
                />
              </div>
            ))}
          </div>
        </motion.aside>

        <motion.section
          key={selectedChannel.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="rounded-[2rem] border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${selectedChannel.iconClassName}`}>
                  <selectedChannel.icon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedChannel.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">{selectedChannel.description}</p>
                </div>
              </div>

              <div>{renderPrimaryAction()}</div>
            </div>
          </div>

          {selectedChannel.id === 'whatsapp' ? (
            <>
              <StatusTable rows={whatsappRows} />
              <StatusTable rows={qualityRows} isQualityTable />
            </>
          ) : null}

          {selectedChannel.id === 'instagram' ? <StatusTable rows={instagramRows} /> : null}
          {selectedChannel.id === 'messenger' ? <StatusTable rows={messengerRows} /> : null}

          {selectedChannel.id === 'messenger' ? (
            <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500">
              Messenger connection is now wired for Facebook Page selection, Page token storage, and webhook subscription.
              Inbox ingestion and message sending still need the next implementation pass.
            </div>
          ) : null}
        </motion.section>
      </div>

      {instagramSelection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Choose Instagram account</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Meta returned multiple Instagram/Page pairs. Select the one you want to connect to this workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInstagramSelection(null)}
                disabled={isSavingInstagramSelection}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {instagramSelection.accounts.map((account) => (
                <button
                  key={account.pageId}
                  type="button"
                  onClick={() => void handleInstagramSelection(account.pageId)}
                  disabled={isSavingInstagramSelection}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#2364ff] hover:bg-[#f7faff] disabled:opacity-60"
                >
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {account.instagramUsername
                        ? `@${account.instagramUsername}`
                        : account.instagramName || account.instagramAccountId}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {account.pageName || 'Connected Facebook Page'} · Page ID {account.pageId}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2364ff]">
                    {isSavingInstagramSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Connect
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {messengerSelection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Choose Facebook Page</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Meta returned multiple Pages. Select the Facebook Page you want to connect to Messenger in this workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMessengerSelection(null)}
                disabled={isSavingMessengerSelection}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {messengerSelection.pages.map((page) => (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => void handleMessengerSelection(page.pageId)}
                  disabled={isSavingMessengerSelection}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#2364ff] hover:bg-[#f7faff] disabled:opacity-60"
                >
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {page.pageName || page.pageId}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Page ID {page.pageId}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                      {page.pageTasks.length
                        ? `Tasks ${page.pageTasks.join(', ')}`
                        : 'Task visibility unavailable'}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2364ff]">
                    {isSavingMessengerSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Connect
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
