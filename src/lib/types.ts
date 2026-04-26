import type {
  BillingCycle,
  BillingPlanCode,
  BillingStatus,
  BillingSummary,
} from './billing';

export type SetupType = 'exclusive' | 'coexistence';
export type ChannelConnectionMethod = 'embedded_signup' | 'manual';
export type InstagramConnectionMethod = 'business_login';
export type MessengerConnectionMethod = 'facebook_login' | 'manual';

export interface AppProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  profilePictureUrl: string | null;
  companyLogoUrl: string | null;
  countryCode: string | null;
  phone: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  industry: string | null;
  selectedPlan: string | null;
  billingCycle: BillingCycle | null;
  billingStatus: BillingStatus | null;
  trialEndsAt: string | null;
  couponCode: string | null;
  razorpaySubscriptionId: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceUserRole = 'Owner' | 'Admin' | 'Manager' | 'Agent';
export type WorkspaceUserStatus = 'active' | 'invited';

export interface WorkspaceTeamMember {
  id: string;
  workspaceOwnerUserId: string;
  memberUserId: string | null;
  fullName: string | null;
  email: string;
  role: WorkspaceUserRole;
  status: WorkspaceUserStatus;
  invitedAt: string;
  acceptedAt: string | null;
  isOwner: boolean;
}

export type NotificationType =
  | 'template_approved'
  | 'template_rejected'
  | 'missed_call'
  | 'lead_created'
  | 'team_member_joined';

export type NotificationSoundPreset = 'classic' | 'soft' | 'pulse';

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  soundEnabled: boolean;
  callSoundEnabled: boolean;
  soundPreset: NotificationSoundPreset;
  volume: number;
  templateReviewEnabled: boolean;
  missedCallEnabled: boolean;
  leadEnabled: boolean;
  teamJoinedEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferencesUpdateInput {
  enabled?: boolean;
  soundEnabled?: boolean;
  callSoundEnabled?: boolean;
  soundPreset?: NotificationSoundPreset;
  volume?: number;
  templateReviewEnabled?: boolean;
  missedCallEnabled?: boolean;
  leadEnabled?: boolean;
  teamJoinedEnabled?: boolean;
}

export interface MetaChannelConnection {
  id: string;
  userId: string;
  setupType: SetupType | null;
  connectionMethod: ChannelConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  accessTokenLast4: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface InstagramChannelConnection {
  id: string;
  userId: string;
  connectionMethod: InstagramConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
  pageId: string;
  pageName: string | null;
  userAccessTokenLast4: string | null;
  pageAccessTokenLast4: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface InstagramConnectableAccount {
  pageId: string;
  pageName: string | null;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
}

export interface MessengerChannelConnection {
  id: string;
  userId: string;
  connectionMethod: MessengerConnectionMethod;
  status: 'connected' | 'pending' | 'error' | 'disconnected';
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  pageAccessTokenLast4: string | null;
  webhookFields: string[];
  webhookSubscribed: boolean;
  webhookLastError: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface MessengerConnectablePage {
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  canSendMessages: boolean;
  canManageWebhooks: boolean;
}

export interface MetaTemplate {
  id: string;
  metaTemplateId: string | null;
  name: string;
  category: string | null;
  language: string;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
}

export interface ConversationThread {
  id: string;
  contactWaId: string;
  contactName: string | null;
  displayPhone: string | null;
  email: string | null;
  source: string | null;
  remark: string | null;
  avatarUrl: string | null;
  status: 'New' | 'In progress' | 'Waiting' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  labels: string[];
  ownerName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  waMessageId: string | null;
  direction: 'inbound' | 'outbound';
  messageType: string;
  body: string | null;
  senderName: string | null;
  senderWaId: string | null;
  recipientWaId: string | null;
  templateName: string | null;
  status: string | null;
  createdAt: string;
  raw: Record<string, unknown>;
}

export interface CreditLedgerItem {
  id: string;
  createdAt: string;
  description: string;
  type: 'addition' | 'deduction';
  amount: number;
  currency: string;
}

export interface CallLog {
  id: string;
  callId: string | null;
  name: string | null;
  phone: string;
  type: 'incoming' | 'outgoing' | 'missed';
  createdAt: string;
  durationSeconds: number;
}

export type WhatsAppCallDirection = 'incoming' | 'outgoing';
export type WhatsAppCallState =
  | 'incoming'
  | 'dialing'
  | 'ringing'
  | 'connecting'
  | 'ongoing'
  | 'ending'
  | 'ended'
  | 'rejected'
  | 'missed'
  | 'failed';
export type WhatsAppCallPermissionStatus = 'granted' | 'pending' | 'denied' | 'expired' | string;
export type WhatsAppCallPermissionActionName =
  | 'start_call'
  | 'send_call_permission_request'
  | string;
export type WhatsAppCallManageAction =
  | 'connect'
  | 'pre_accept'
  | 'accept'
  | 'reject'
  | 'terminate';

export interface WhatsAppCallActionLimit {
  timePeriod: string;
  currentUsage: number;
  maxAllowed: number;
  limitExpirationTime: number | null;
}

export interface WhatsAppCallPermissionAction {
  actionName: WhatsAppCallPermissionActionName;
  canPerformAction: boolean;
  limits: WhatsAppCallActionLimit[];
}

export interface WhatsAppCallPermission {
  status: WhatsAppCallPermissionStatus;
  expirationTime: number | null;
}

export interface WhatsAppCallPermissionResponse {
  messagingProduct: string;
  permission: WhatsAppCallPermission;
  actions: WhatsAppCallPermissionAction[];
}

export interface WhatsAppCallSession {
  sdpType: 'offer' | 'answer';
  sdp: string;
}

export interface WhatsAppCallSessionRecord {
  id: string;
  callId: string;
  contactWaId: string | null;
  contactName: string | null;
  displayPhone: string | null;
  direction: WhatsAppCallDirection;
  state: WhatsAppCallState;
  startedAt: string;
  connectedAt: string | null;
  updatedAt: string;
  endedAt: string | null;
  offerSdp: string | null;
  answerSdp: string | null;
  bizOpaqueCallbackData: string | null;
  lastEvent: string | null;
  raw: Record<string, unknown>;
}

export interface WhatsAppCallManageInput {
  to?: string;
  callId?: string;
  action: WhatsAppCallManageAction;
  session?: WhatsAppCallSession;
  bizOpaqueCallbackData?: string;
}

export interface WhatsAppCallManageResponse {
  messagingProduct: string | null;
  callId: string | null;
  callIds: string[];
  success: boolean;
  callLog?: CallLog;
  callSession?: WhatsAppCallSessionRecord;
}

export interface WhatsAppBlockedUser {
  messagingProduct: string | null;
  waId: string;
}

export interface WhatsAppBlockedUsersPaging {
  after: string | null;
  before: string | null;
}

export interface WhatsAppBlockedUsersResponse {
  data: WhatsAppBlockedUser[];
  paging: WhatsAppBlockedUsersPaging | null;
}

export interface WhatsAppBlockedUserOperation {
  input: string | null;
  waId: string | null;
}

export interface WhatsAppBlockedUsersMutationResponse {
  messagingProduct: string | null;
  users: WhatsAppBlockedUserOperation[];
}

export interface DashboardBootstrap {
  profile: AppProfile | null;
  channel: MetaChannelConnection | null;
  instagramChannel: InstagramChannelConnection | null;
  messengerChannel: MessengerChannelConnection | null;
  templates: MetaTemplate[];
  conversations: ConversationThread[];
  notifications: UserNotification[];
  notificationPreferences: NotificationPreferences;
  credits: {
    balance: number;
    currency: string;
    ledger: CreditLedgerItem[];
  };
  callHistory: CallLog[];
  callSessions: WhatsAppCallSessionRecord[];
}

export type EmailConnectionStatus = 'connected' | 'pending' | 'error';

export interface EmailConnectionSummary {
  userId: string;
  displayName: string;
  emailAddress: string;
  authUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  status: EmailConnectionStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailConnectionUpsertInput {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export interface EmailConnectionCheckResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export interface EmailConnectionVerifyResponse {
  smtp: EmailConnectionCheckResult;
  imap: EmailConnectionCheckResult;
  canConnect: boolean;
}

export interface EmailMessage {
  id: string;
  folder: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  to: string[];
  receivedAt: string | null;
  htmlBody: string | null;
  textBody: string | null;
  previewText: string;
  isUnread: boolean;
}

export type EmailTemplateEditorMode = 'rich' | 'html';

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  editorMode: EmailTemplateEditorMode;
  htmlContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateSaveInput {
  name: string;
  subject: string;
  editorMode: EmailTemplateEditorMode;
  htmlContent: string;
}

export interface EmailRecipient {
  email: string;
  name?: string | null;
}

export type EmailCampaignAudienceSource = 'contacts' | 'custom';
export type EmailCampaignStatus = 'sent' | 'partial' | 'failed';

export interface EmailCampaign {
  id: string;
  userId: string;
  templateId: string | null;
  templateName: string | null;
  campaignName: string;
  subject: string;
  htmlContent: string;
  audienceSource: EmailCampaignAudienceSource;
  recipientCount: number;
  status: EmailCampaignStatus;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignSendInput {
  templateId: string;
  campaignName: string;
  audienceSource: EmailCampaignAudienceSource;
  recipients: EmailRecipient[];
}

export interface ContactUpsertInput {
  contactWaId: string;
  contactName?: string;
  displayPhone?: string;
  email?: string;
  source?: string;
  remark?: string;
  avatarUrl?: string;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  ownerName?: string;
}

export interface ContactUpdateInput {
  contactName?: string;
  displayPhone?: string;
  email?: string;
  source?: string;
  remark?: string;
  avatarUrl?: string;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  ownerName?: string;
}

export interface WhatsAppBusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  displayNameStatus: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  phoneNumberId: string;
  wabaId: string;
}

export interface WhatsAppBusinessProfileUpdateInput {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profilePictureHandle?: string;
  websites?: string[];
  vertical?: string;
}

export interface WhatsAppCommerceSettings {
  id: string | null;
  phoneNumberId: string;
  isCartEnabled: boolean;
  isCatalogVisible: boolean;
}

export interface WhatsAppCommerceSettingsUpdateInput {
  isCartEnabled?: boolean;
  isCatalogVisible?: boolean;
}

export interface WhatsAppAutomationCommand {
  commandName: string;
  commandDescription: string;
}

export interface WhatsAppConversationalAutomationConfig {
  userId: string;
  metaChannelId: string | null;
  phoneNumberId: string | null;
  enableWelcomeMessage: boolean;
  prompts: string[];
  commands: WhatsAppAutomationCommand[];
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversationalAutomationUpdateInput {
  enableWelcomeMessage?: boolean;
  prompts?: string[];
  commands?: WhatsAppAutomationCommand[];
}

export type InboxInsightsChannel = 'all' | 'whatsapp' | 'instagram' | 'messenger';
export type InboxInsightsPeriod = 'today' | '7d' | '30d' | 'custom';

export interface InboxInsightsFilters {
  startDate: string;
  endDate: string;
  channel: InboxInsightsChannel;
}

export interface InboxInsightsResponse {
  filters: InboxInsightsFilters;
  isChannelSupported: boolean;
  lastUpdatedAt: string;
  messagingLimit: {
    consumed: number;
    total: number | null;
    tier: string | null;
  };
  messagingQuality: string | null;
  totals: {
    sent: number;
    delivered: number;
    received: number;
  };
  outcomes: {
    read: number;
    replied: number;
    failed: number;
  };
}

export interface MetaLeadCaptureConfig {
  userId: string;
  metaChannelId: string | null;
  status: 'draft' | 'ready' | 'error';
  appId: string | null;
  pageIds: string[];
  formIds: string[];
  accessTokenLast4: string | null;
  verifyToken: string;
  verifiedAt: string | null;
  callbackUrl: string;
  defaultOwnerName: string | null;
  defaultLabels: string[];
  autoCreateLeads: boolean;
  lastWebhookAt: string | null;
  lastLeadSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaLeadCaptureEvent {
  id: string;
  userId: string;
  pageId: string | null;
  formId: string | null;
  leadId: string | null;
  eventTime: string | null;
  processingStatus: 'received' | 'processed' | 'skipped' | 'error';
  errorMessage: string | null;
  raw: Record<string, unknown>;
  createdAt: string;
}

export interface MetaLeadCapturePageSubscription {
  pageId: string;
  appId: string | null;
  appName: string | null;
  subscribed: boolean;
  subscribedFields: string[];
  errorMessage: string | null;
}

export interface MetaLeadCaptureSetupInput {
  status?: MetaLeadCaptureConfig['status'];
  appId?: string | null;
  pageIds?: string[];
  formIds?: string[];
  accessToken?: string;
  defaultOwnerName?: string | null;
  defaultLabels?: string[];
  autoCreateLeads?: boolean;
  regenerateVerifyToken?: boolean;
}

export interface MetaLeadCaptureSetupResponse {
  config: MetaLeadCaptureConfig;
  recentEvents: MetaLeadCaptureEvent[];
  pageSubscriptions: MetaLeadCapturePageSubscription[];
}

export interface WhatsAppPaymentCodeDetail {
  code: string | null;
  description: string | null;
}

export interface WhatsAppPaymentConfiguration {
  configurationName: string;
  merchantCategoryCode: WhatsAppPaymentCodeDetail | null;
  purposeCode: WhatsAppPaymentCodeDetail | null;
  status: string | null;
  providerMid: string | null;
  providerName: string | null;
  merchantVpa: string | null;
  dataEndpointUrl: string | null;
  createdTimestamp: number | null;
  updatedTimestamp: number | null;
}

export interface WhatsAppPaymentConfigurationEvent {
  id: string;
  userId: string;
  configurationName: string | null;
  providerName: string | null;
  providerMid: string | null;
  status: string | null;
  createdTimestamp: number | null;
  updatedTimestamp: number | null;
  raw: Record<string, unknown>;
  createdAt: string;
}

export interface WhatsAppPaymentsSetupResponse {
  hasChannel: boolean;
  wabaId: string | null;
  configurations: WhatsAppPaymentConfiguration[];
  recentEvents: WhatsAppPaymentConfigurationEvent[];
}

export type WhatsAppBusinessActivityType =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_DELETED'
  | 'PHONE_NUMBER_ADDED'
  | 'PHONE_NUMBER_REMOVED'
  | 'PHONE_NUMBER_VERIFIED'
  | 'USER_ADDED'
  | 'USER_REMOVED'
  | 'USER_ROLE_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'TEMPLATE_DELETED'
  | 'WEBHOOK_CONFIGURED'
  | 'API_ACCESS_GRANTED'
  | 'API_ACCESS_REVOKED'
  | 'BILLING_UPDATED'
  | 'COMPLIANCE_ACTION'
  | 'SECURITY_EVENT';

export type WhatsAppBusinessActorType = 'USER' | 'SYSTEM' | 'API' | 'ADMIN' | 'AUTOMATED_PROCESS';

export interface WhatsAppBusinessAccountActivity {
  id: string;
  activityType: WhatsAppBusinessActivityType | string;
  timestamp: string;
  actorType: WhatsAppBusinessActorType | string;
  actorId: string | null;
  actorName: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WhatsAppBusinessActivitiesFilters {
  limit?: number;
  after?: string;
  before?: string;
  since?: string;
  until?: string;
  activityType?: string[];
}

export interface WhatsAppBusinessActivitiesResponse {
  wabaId: string;
  activities: WhatsAppBusinessAccountActivity[];
  paging: {
    before: string | null;
    after: string | null;
    previous: string | null;
    next: string | null;
  };
  fetchedAt: string;
}

export interface WhatsAppPaymentConfigurationCreateInput {
  configurationName: string;
  purposeCode: string;
  merchantCategoryCode: string;
  providerName: 'razorpay' | 'payu' | 'zaakpay' | 'upi_vpa';
  providerMid?: string;
  merchantVpa?: string;
  redirectUrl?: string;
  dataEndpointUrl?: string;
}

export interface WhatsAppPaymentConfigurationOAuthResponse {
  success: boolean;
  oauthUrl: string | null;
  expiration: number | null;
}

export interface WhatsAppPaymentConfigurationEndpointInput {
  dataEndpointUrl: string;
}

export interface WhatsAppPaymentConfigurationOAuthLinkInput {
  redirectUrl: string;
}

export interface ProfileUpsertInput {
  fullName?: string | null;
  profilePictureUrl?: string | null;
  companyLogoUrl?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  industry?: string | null;
  selectedPlan?: string;
  billingCycle?: BillingCycle | null;
  billingStatus?: BillingStatus | null;
  trialEndsAt?: string | null;
  couponCode?: string | null;
  razorpaySubscriptionId?: string | null;
  onboardingCompleted?: boolean;
}

export interface InviteWorkspaceUserInput {
  fullName: string;
  email: string;
  role: Exclude<WorkspaceUserRole, 'Owner'>;
}

export interface BillingQuoteInput {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string;
}

export interface BillingQuoteResponse {
  quote: BillingSummary;
}

export interface CreateBillingSubscriptionInput {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string;
}

export interface CreateBillingSubscriptionResponse {
  keyId: string;
  subscriptionId: string;
  businessName: string;
  businessLogoUrl: string | null;
  quote: BillingSummary;
}

export interface VerifyBillingSubscriptionInput {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}

export interface ManualMetaConnectionInput {
  setupType: SetupType;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}

export interface EmbeddedMetaConnectionInput {
  setupType: SetupType;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  redirectUri?: string;
}

export interface InstagramConnectionOptionsInput {
  longLivedToken?: string | null;
  accessToken?: string;
}

export interface ConnectInstagramBusinessLoginInput {
  longLivedToken?: string | null;
  accessToken?: string;
  pageId?: string;
}

export interface MessengerConnectionOptionsInput {
  accessToken: string;
}

export interface ConnectMessengerPageLoginInput {
  accessToken: string;
  pageId?: string;
}

export interface ConnectMessengerManualInput {
  pageId: string;
  pageAccessToken: string;
}

export interface WhatsAppMessageContextInput {
  message_id?: string;
}

export interface WhatsAppMediaObjectInput {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppMessageHeaderObject {
  type: 'text' | 'video' | 'image' | 'document';
  text?: string;
  sub_text?: string;
  document?: WhatsAppMediaObjectInput;
  image?: WhatsAppMediaObjectInput;
  video?: WhatsAppMediaObjectInput;
}

export interface WhatsAppMessageBodyObject {
  text: string;
}

export interface WhatsAppMessageFooterObject {
  text: string;
}

export interface WhatsAppInteractiveObject {
  type:
    | 'button'
    | 'call_permission_request'
    | 'catalog_message'
    | 'list'
    | 'product'
    | 'product_list'
    | 'flow';
  header?: WhatsAppMessageHeaderObject;
  body?: WhatsAppMessageBodyObject;
  footer?: WhatsAppMessageFooterObject;
  action: Record<string, unknown>;
}

export interface WhatsAppContactAddressObject {
  city?: string;
  country?: string;
  country_code?: string;
  state?: string;
  street?: string;
  type?: 'HOME' | 'WORK';
  zip?: string;
}

export interface WhatsAppContactEmailObject {
  email: string;
  type?: 'HOME' | 'WORK';
}

export interface WhatsAppContactNameObject {
  first_name?: string;
  formatted_name?: string;
  last_name?: string;
  middle_name?: string;
  prefix?: string;
  suffix?: string;
}

export interface WhatsAppContactOrganizationObject {
  company?: string;
  department?: string;
  title?: string;
}

export interface WhatsAppContactPhoneObject {
  phone: string;
  type?: 'HOME' | 'WORK';
  wa_id?: string;
}

export interface WhatsAppContactUrlObject {
  type?: 'HOME' | 'WORK';
  url: string;
}

export interface WhatsAppContactObject {
  addresses?: WhatsAppContactAddressObject[];
  birthday?: string;
  emails?: WhatsAppContactEmailObject[];
  name?: WhatsAppContactNameObject;
  org?: WhatsAppContactOrganizationObject;
  phones?: WhatsAppContactPhoneObject[];
  urls?: WhatsAppContactUrlObject[];
}

export interface WhatsAppLocationObject {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppReactionObject {
  message_id: string;
  emoji: string;
}

export interface WhatsAppTemplateObject {
  name: string;
  language: {
    code: string;
  };
  components?: Array<Record<string, unknown>>;
}

export interface WhatsAppBaseMessagePayload {
  messaging_product?: 'whatsapp';
  recipient_type?: 'individual' | 'group';
  to: string;
  context?: WhatsAppMessageContextInput;
}

export interface WhatsAppTextMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'text';
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface WhatsAppAudioMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'audio';
  audio: WhatsAppMediaObjectInput;
}

export interface WhatsAppVideoMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'video';
  video: WhatsAppMediaObjectInput;
}

export interface WhatsAppDocumentMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'document';
  document: WhatsAppMediaObjectInput;
}

export interface WhatsAppImageMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'image';
  image: WhatsAppMediaObjectInput;
}

export interface WhatsAppStickerMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'sticker';
  sticker: WhatsAppMediaObjectInput;
}

export interface WhatsAppLocationMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'location';
  location: WhatsAppLocationObject;
}

export interface WhatsAppReactionMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'reaction';
  reaction: WhatsAppReactionObject;
}

export interface WhatsAppInteractiveMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'interactive';
  interactive: WhatsAppInteractiveObject;
}

export interface WhatsAppTemplateMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'template';
  template: WhatsAppTemplateObject;
}

export interface WhatsAppContactsMessagePayload extends WhatsAppBaseMessagePayload {
  type: 'contacts';
  contacts: WhatsAppContactObject[];
}

export type WhatsAppMessagePayload =
  | WhatsAppAudioMessagePayload
  | WhatsAppContactsMessagePayload
  | WhatsAppDocumentMessagePayload
  | WhatsAppImageMessagePayload
  | WhatsAppInteractiveMessagePayload
  | WhatsAppLocationMessagePayload
  | WhatsAppReactionMessagePayload
  | WhatsAppStickerMessagePayload
  | WhatsAppTemplateMessagePayload
  | WhatsAppTextMessagePayload
  | WhatsAppVideoMessagePayload;

export interface SendWhatsAppMessageInput {
  clientTempId?: string;
  message: WhatsAppMessagePayload;
}

export interface SendTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
  replyToMessageId?: string;
  clientTempId?: string;
}

export interface SendMediaMessageInput {
  to: string;
  mediaId?: string;
  mediaLink?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
  mimeType?: string;
  replyToMessageId?: string;
  clientTempId?: string;
}

export interface SendTemplateMessageInput {
  to: string;
  templateName: string;
  language: string;
  components?: Array<Record<string, unknown>>;
  replyToMessageId?: string;
  clientTempId?: string;
}

export interface CreateTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  headerMediaSampleUrl?: string;
  body: string;
  footer?: string;
  buttons?: Array<
    | {
        type: 'QUICK_REPLY';
        text: string;
      }
    | {
        type: 'URL';
        text: string;
        url: string;
      }
  >;
}
