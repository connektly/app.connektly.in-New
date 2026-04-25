import { clientConfig } from './config';
import { getCachedSession, supabase } from './supabase';
import type {
  ContactUpdateInput,
  ContactUpsertInput,
  ConnectInstagramBusinessLoginInput,
  ConnectMessengerManualInput,
  ConnectMessengerPageLoginInput,
  CreateBillingSubscriptionInput,
  CreateBillingSubscriptionResponse,
  ConversationMessage,
  ConversationThread,
  CreateTemplateInput,
  DashboardBootstrap,
  EmailCampaign,
  EmailCampaignSendInput,
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  EmailMessage,
  EmailTemplate,
  EmailTemplateSaveInput,
  BillingQuoteInput,
  BillingQuoteResponse,
  EmbeddedMetaConnectionInput,
  InstagramConnectableAccount,
  InboxInsightsFilters,
  InboxInsightsResponse,
  InstagramConnectionOptionsInput,
  MessengerConnectablePage,
  MessengerConnectionOptionsInput,
  ManualMetaConnectionInput,
  MetaLeadCaptureSetupInput,
  MetaLeadCaptureSetupResponse,
  NotificationPreferences,
  NotificationPreferencesUpdateInput,
  MetaTemplate,
  ProfileUpsertInput,
  InviteWorkspaceUserInput,
  WhatsAppBlockedUsersMutationResponse,
  WhatsAppBlockedUsersResponse,
  WhatsAppCallManageInput,
  WhatsAppCallManageResponse,
  WhatsAppCallPermissionResponse,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  SendWhatsAppMessageInput,
  VerifyBillingSubscriptionInput,
  WhatsAppPaymentConfiguration,
  WhatsAppPaymentConfigurationCreateInput,
  WhatsAppPaymentConfigurationEndpointInput,
  WhatsAppPaymentConfigurationOAuthLinkInput,
  WhatsAppPaymentConfigurationOAuthResponse,
  WhatsAppPaymentsSetupResponse,
  WhatsAppBusinessProfile,
  WhatsAppBusinessActivitiesFilters,
  WhatsAppBusinessActivitiesResponse,
  WhatsAppBusinessProfileUpdateInput,
  WhatsAppConversationalAutomationConfig,
  WhatsAppConversationalAutomationUpdateInput,
  WorkspaceTeamMember,
  WhatsAppCommerceSettings,
  WhatsAppCommerceSettingsUpdateInput,
} from './types';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getAuthHeaders() {
  const session = await getCachedSession();
  const token = session?.access_token;

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${clientConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json();
      throw new ApiError(payload.error || fallbackMessage, response.status);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(fallbackMessage, response.status);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function apiBlobRequest(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string | null; contentType: string | null }> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${clientConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json();
      throw new ApiError(payload.error || fallbackMessage, response.status);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(fallbackMessage, response.status);
    }
  }

  const disposition = response.headers.get('content-disposition');
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);

  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || null,
    contentType: response.headers.get('content-type'),
  };
}

export const appApi = {
  getBootstrap() {
    return apiRequest<DashboardBootstrap>('/bootstrap');
  },
  saveProfile(payload: ProfileUpsertInput) {
    return apiRequest<{ profile: DashboardBootstrap['profile'] }>('/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async uploadProfilePhoto(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/profile/photo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        throw new ApiError(payload.error || fallbackMessage, response.status);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError(fallbackMessage, response.status);
      }
    }

    return response.json() as Promise<{ profile: DashboardBootstrap['profile'] }>;
  },
  async uploadCompanyLogo(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/profile/company-logo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        throw new ApiError(payload.error || fallbackMessage, response.status);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError(fallbackMessage, response.status);
      }
    }

    return response.json() as Promise<{ profile: DashboardBootstrap['profile'] }>;
  },
  getTeamMembers() {
    return apiRequest<{ members: WorkspaceTeamMember[] }>('/team/members');
  },
  inviteTeamMember(payload: InviteWorkspaceUserInput) {
    return apiRequest<{ member: WorkspaceTeamMember; inviteSent: boolean }>('/team/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBillingQuote(payload: BillingQuoteInput) {
    return apiRequest<BillingQuoteResponse>('/billing/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createBillingSubscription(payload: CreateBillingSubscriptionInput) {
    return apiRequest<CreateBillingSubscriptionResponse>('/billing/subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  verifyBillingSubscription(payload: VerifyBillingSubscriptionInput) {
    return apiRequest<{ profile: DashboardBootstrap['profile'] }>('/billing/subscription/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMetaManually(payload: ManualMetaConnectionInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/connect/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMetaEmbedded(payload: EmbeddedMetaConnectionInput) {
    return apiRequest<{ channel: DashboardBootstrap['channel'] }>('/meta/connect/embedded', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  disconnectMetaChannel() {
    return apiRequest<{ ok: true }>('/meta/channel', {
      method: 'DELETE',
    });
  },
  getInstagramConnectionOptions(payload: InstagramConnectionOptionsInput) {
    return apiRequest<{ accounts: InstagramConnectableAccount[] }>('/instagram/connect/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectInstagramBusinessLogin(payload: ConnectInstagramBusinessLoginInput) {
    return apiRequest<{ channel: DashboardBootstrap['instagramChannel'] }>(
      '/instagram/connect/business-login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  disconnectInstagramChannel() {
    return apiRequest<{ ok: true }>('/instagram/channel', {
      method: 'DELETE',
    });
  },
  getMessengerConnectionOptions(payload: MessengerConnectionOptionsInput) {
    return apiRequest<{ pages: MessengerConnectablePage[] }>('/messenger/connect/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectMessengerPageLogin(payload: ConnectMessengerPageLoginInput) {
    return apiRequest<{ channel: DashboardBootstrap['messengerChannel'] }>(
      '/messenger/connect/facebook-login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  connectMessengerManually(payload: ConnectMessengerManualInput) {
    return apiRequest<{ channel: DashboardBootstrap['messengerChannel'] }>(
      '/messenger/connect/manual',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  disconnectMessengerChannel() {
    return apiRequest<{ ok: true }>('/messenger/channel', {
      method: 'DELETE',
    });
  },
  syncTemplates() {
    return apiRequest<{ templates: MetaTemplate[] }>('/meta/templates/sync', {
      method: 'POST',
    });
  },
  createTemplate(payload: CreateTemplateInput) {
    return apiRequest<{ template: MetaTemplate }>('/meta/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  duplicateTemplate(templateId: string) {
    return apiRequest<{ template: MetaTemplate }>(`/meta/templates/${templateId}/duplicate`, {
      method: 'POST',
    });
  },
  deleteTemplate(templateId: string) {
    return apiRequest<void>(`/meta/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
  getMessages(threadId: string, options?: { markRead?: boolean }) {
    const markRead = options?.markRead ?? true;
    const query = markRead ? '' : '?markRead=false';

    return apiRequest<{
      thread: DashboardBootstrap['conversations'][number];
      messages: ConversationMessage[];
    }>(`/conversations/${threadId}${query}`, {
      cache: 'no-store',
    });
  },
  sendTextMessage(threadId: string, payload: SendTextMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages/text`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendMediaMessage(threadId: string, payload: SendMediaMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages/media`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendWhatsAppMessage(threadId: string, payload: SendWhatsAppMessageInput) {
    return apiRequest<{ ok: true; thread: ConversationThread; message: ConversationMessage }>(
      `/conversations/${threadId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  sendTemplateMessage(payload: SendTemplateMessageInput) {
    return apiRequest<{ ok: true; threadId: string; thread: ConversationThread; message: ConversationMessage }>(
      '/conversations/template-message',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  startConversation(payload: SendTemplateMessageInput & { contactName?: string }) {
    return apiRequest<{ ok: true; threadId: string; thread: ConversationThread; message: ConversationMessage }>(
      '/conversations/start',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  createContact(payload: ContactUpsertInput) {
    return apiRequest<{ contact: DashboardBootstrap['conversations'][number] }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateContact(threadId: string, payload: ContactUpdateInput) {
    return apiRequest<{ contact: DashboardBootstrap['conversations'][number] }>(`/contacts/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteContact(threadId: string) {
    return apiRequest<void>(`/contacts/${threadId}`, {
      method: 'DELETE',
    });
  },
  getEmailConnection() {
    return apiRequest<{ connection: EmailConnectionSummary | null }>('/email/connection', {
      cache: 'no-store',
    });
  },
  verifyEmailConnection(payload: EmailConnectionUpsertInput) {
    return apiRequest<EmailConnectionVerifyResponse>('/email/connection/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveEmailConnection(payload: EmailConnectionUpsertInput) {
    return apiRequest<{ connection: EmailConnectionSummary }>('/email/connection', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteEmailConnection() {
    return apiRequest<{ ok: true }>('/email/connection', {
      method: 'DELETE',
    });
  },
  getEmailInbox() {
    return apiRequest<{ messages: EmailMessage[] }>('/email/inbox', {
      cache: 'no-store',
    });
  },
  getEmailTemplates() {
    return apiRequest<{ templates: EmailTemplate[] }>('/email/templates', {
      cache: 'no-store',
    });
  },
  saveEmailTemplate(payload: EmailTemplateSaveInput) {
    return apiRequest<{ template: EmailTemplate }>('/email/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteEmailTemplate(templateId: string) {
    return apiRequest<{ ok: true }>(`/email/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
  getEmailCampaigns() {
    return apiRequest<{ campaigns: EmailCampaign[] }>('/email/campaigns', {
      cache: 'no-store',
    });
  },
  sendEmailCampaign(payload: EmailCampaignSendInput) {
    return apiRequest<{ campaign: EmailCampaign }>('/email/campaigns/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  markNotificationsRead(payload: { notificationId?: string; markAll?: boolean }) {
    return apiRequest<{ ok: true }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  saveNotificationPreferences(payload: NotificationPreferencesUpdateInput) {
    return apiRequest<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBusinessProfile() {
    return apiRequest<{ profile: WhatsAppBusinessProfile }>('/meta/business-profile');
  },
  getWhatsAppCommerceSettings() {
    return apiRequest<{ settings: WhatsAppCommerceSettings }>('/meta/commerce-settings', {
      cache: 'no-store',
    });
  },
  updateWhatsAppCommerceSettings(payload: WhatsAppCommerceSettingsUpdateInput) {
    return apiRequest<{ settings: WhatsAppCommerceSettings }>('/meta/commerce-settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getConversationalAutomation() {
    return apiRequest<{ config: WhatsAppConversationalAutomationConfig }>('/meta/conversational-automation');
  },
  updateConversationalAutomation(payload: WhatsAppConversationalAutomationUpdateInput) {
    return apiRequest<{ config: WhatsAppConversationalAutomationConfig }>('/meta/conversational-automation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCallPermissions(userWaId: string) {
    const query = new URLSearchParams({
      userWaId,
    });

    return apiRequest<WhatsAppCallPermissionResponse>(`/calls/permissions?${query.toString()}`);
  },
  getBlockedUsers() {
    return apiRequest<WhatsAppBlockedUsersResponse>('/whatsapp/blocked-users', {
      cache: 'no-store',
    });
  },
  blockUsers(users: string[]) {
    return apiRequest<WhatsAppBlockedUsersMutationResponse>('/whatsapp/blocked-users', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  },
  unblockUsers(users: string[]) {
    return apiRequest<WhatsAppBlockedUsersMutationResponse>('/whatsapp/blocked-users', {
      method: 'DELETE',
      body: JSON.stringify({ users }),
    });
  },
  manageCall(payload: WhatsAppCallManageInput) {
    return apiRequest<WhatsAppCallManageResponse>('/calls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getInboxInsights(filters: InboxInsightsFilters) {
    const query = new URLSearchParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
      channel: filters.channel,
    });

    return apiRequest<InboxInsightsResponse>(`/insights/inbox?${query.toString()}`);
  },
  getMetaLeadCaptureSetup() {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture');
  },
  saveMetaLeadCaptureSetup(payload: MetaLeadCaptureSetupInput) {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  subscribeMetaLeadCapturePages() {
    return apiRequest<MetaLeadCaptureSetupResponse>('/integrations/meta-lead-capture/subscribe-pages', {
      method: 'POST',
    });
  },
  getWhatsAppPaymentsSetup() {
    return apiRequest<WhatsAppPaymentsSetupResponse>('/integrations/whatsapp-payments', {
      cache: 'no-store',
    });
  },
  getWhatsAppBusinessActivities(filters: WhatsAppBusinessActivitiesFilters) {
    const query = new URLSearchParams();

    if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
      query.set('limit', String(filters.limit));
    }

    if (filters.after) {
      query.set('after', filters.after);
    }

    if (filters.before) {
      query.set('before', filters.before);
    }

    if (filters.since) {
      query.set('since', filters.since);
    }

    if (filters.until) {
      query.set('until', filters.until);
    }

    if (Array.isArray(filters.activityType) && filters.activityType.length > 0) {
      query.set('activityType', filters.activityType.join(','));
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return apiRequest<WhatsAppBusinessActivitiesResponse>(`/developer/whatsapp-activities${suffix}`, {
      cache: 'no-store',
    });
  },
  getWhatsAppPaymentConfiguration(configurationName: string) {
    return apiRequest<{ configuration: WhatsAppPaymentConfiguration }>(
      `/integrations/whatsapp-payments/${encodeURIComponent(configurationName)}`,
      {
        cache: 'no-store',
      },
    );
  },
  createWhatsAppPaymentConfiguration(payload: WhatsAppPaymentConfigurationCreateInput) {
    return apiRequest<{ configuration: WhatsAppPaymentConfiguration; oauth: WhatsAppPaymentConfigurationOAuthResponse | null }>(
      '/integrations/whatsapp-payments',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  updateWhatsAppPaymentConfigurationDataEndpoint(
    configurationName: string,
    payload: WhatsAppPaymentConfigurationEndpointInput,
  ) {
    return apiRequest<{ configuration: WhatsAppPaymentConfiguration }>(
      `/integrations/whatsapp-payments/${encodeURIComponent(configurationName)}/data-endpoint`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  regenerateWhatsAppPaymentConfigurationOAuthLink(
    configurationName: string,
    payload: WhatsAppPaymentConfigurationOAuthLinkInput,
  ) {
    return apiRequest<{ oauth: WhatsAppPaymentConfigurationOAuthResponse }>(
      `/integrations/whatsapp-payments/${encodeURIComponent(configurationName)}/oauth-link`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  deleteWhatsAppPaymentConfiguration(configurationName: string) {
    return apiRequest<{ ok: true }>(`/integrations/whatsapp-payments/${encodeURIComponent(configurationName)}`, {
      method: 'DELETE',
    });
  },
  updateBusinessProfile(payload: WhatsAppBusinessProfileUpdateInput) {
    return apiRequest<{ profile: WhatsAppBusinessProfile }>('/meta/business-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async uploadBusinessProfilePhoto(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/meta/business-profile/photo`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        throw new ApiError(payload.error || fallbackMessage, response.status);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError(fallbackMessage, response.status);
      }
    }

    return response.json() as Promise<{ profile: WhatsAppBusinessProfile }>;
  },
  async uploadMedia(file: File) {
    const authHeaders = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${clientConfig.apiBaseUrl}/media/upload`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        throw new ApiError(payload.error || fallbackMessage, response.status);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError(fallbackMessage, response.status);
      }
    }

    return response.json() as Promise<{
      mediaId: string;
      mediaType: SendMediaMessageInput['mediaType'];
      fileName: string;
      mimeType: string;
    }>;
  },
  downloadMedia(mediaId: string, fileName?: string) {
    const query = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    return apiBlobRequest(`/media/${mediaId}${query}`);
  },
};

export { ApiError };
