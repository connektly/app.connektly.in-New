import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createClient, type User } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import {
  BILLING_CURRENCY,
  BILLING_DEFAULT_TRIAL_DAYS,
  buildBillingSummary,
  getBillingPlan,
  normalizeBillingCycle,
  normalizeBillingStatus,
  type BillingCouponDefinition,
  type BillingCycle,
  type BillingPlanCode,
} from './src/lib/billing';
import { normalizeSdpString } from './src/lib/sdp';
import type {
  BillingQuoteInput,
  CallLog,
  WhatsAppCallDirection,
  WhatsAppCallManageInput,
  WhatsAppCallManageResponse,
  WhatsAppCallPermissionResponse,
  WhatsAppCallSessionRecord,
  WhatsAppCallState,
  ContactUpdateInput,
  ContactUpsertInput,
  ConnectInstagramBusinessLoginInput,
  ConnectMessengerPageLoginInput,
  ConversationMessage,
  CreateTemplateInput,
  ConversationThread,
  DashboardBootstrap,
  EmailCampaign,
  EmailCampaignSendInput,
  EmailConnectionStatus,
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  EmailMessage,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateSaveInput,
  InviteWorkspaceUserInput,
  InboxInsightsChannel,
  InboxInsightsResponse,
  InstagramChannelConnection,
  InstagramConnectableAccount,
  MessengerChannelConnection,
  MessengerConnectablePage,
  MetaChannelConnection,
  MetaLeadCaptureConfig,
  MetaLeadCaptureEvent,
  MetaLeadCapturePageSubscription,
  MetaTemplate,
  NotificationPreferences,
  NotificationPreferencesUpdateInput,
  NotificationType,
  MetaLeadCaptureSetupInput,
  MetaLeadCaptureSetupResponse,
  ProfileUpsertInput,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  SendWhatsAppMessageInput,
  UserNotification,
  WhatsAppAutomationCommand,
  WhatsAppBusinessAccountActivity,
  WhatsAppBusinessActivitiesFilters,
  WhatsAppBusinessActivitiesResponse,
  WhatsAppBlockedUser,
  WhatsAppBlockedUsersMutationResponse,
  WhatsAppBlockedUsersResponse,
  WhatsAppPaymentConfiguration,
  WhatsAppPaymentConfigurationCreateInput,
  WhatsAppPaymentConfigurationEndpointInput,
  WhatsAppPaymentConfigurationEvent,
  WhatsAppPaymentConfigurationOAuthLinkInput,
  WhatsAppPaymentConfigurationOAuthResponse,
  WhatsAppPaymentsSetupResponse,
  WhatsAppBusinessProfile,
  WhatsAppCommerceSettings,
  WhatsAppCommerceSettingsUpdateInput,
  WhatsAppBusinessProfileUpdateInput,
  WhatsAppConversationalAutomationConfig,
  WhatsAppConversationalAutomationUpdateInput,
  WhatsAppMessagePayload,
  WorkspaceTeamMember,
} from './src/lib/types';

declare global {
  namespace Express {
    interface Request {
      authedUser?: User;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const graphVersion = process.env.META_GRAPH_VERSION || 'v24.0';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const metaAppId = process.env.META_APP_ID || '';
const metaAppSecret = process.env.META_APP_SECRET || '';
const instagramAppId = process.env.INSTAGRAM_APP_ID || '';
const instagramAppSecret = process.env.INSTAGRAM_APP_SECRET || '';
const metaRedirectUri = process.env.META_REDIRECT_URI || '';
const metaWebhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
const messengerWebhookVerifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN || metaWebhookVerifyToken;
const tokenEncryptionSecret = process.env.META_TOKEN_ENCRYPTION_KEY || '';
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpayBusinessName = process.env.RAZORPAY_BRAND_NAME || 'Connektly';
const razorpayBusinessLogoUrl = process.env.RAZORPAY_BRAND_LOGO_URL || '';
const razorpayTrialDays = Number(process.env.RAZORPAY_TRIAL_DAYS || BILLING_DEFAULT_TRIAL_DAYS);
const razorpayMonthlyTotalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY || 120);
const razorpayAnnualTotalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_ANNUAL || 10);
const APP_PROFILE_PICTURE_BUCKET = 'app-profile-pictures';
const MAX_APP_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const DEFAULT_MESSENGER_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_reads',
  'message_deliveries',
  'message_echoes',
] as const;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase server environment. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const encryptionKey = tokenEncryptionSecret
  ? crypto.createHash('sha256').update(tokenEncryptionSecret).digest()
  : null;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 64 * 1024 * 1024,
  },
});
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', frontendOrigin);
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json({ limit: '2mb' }));

interface RazorpayPlanEntity {
  id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  item: {
    amount: number;
    currency: string;
    name?: string;
    description?: string;
  };
  notes?: Record<string, string>;
}

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  plan_id: string;
  customer_id?: string;
  start_at?: number;
  charge_at?: number;
  notes?: Record<string, string>;
}

function requireRazorpayCredentials() {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error(
      'Razorpay is not configured on the API server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }
}

function normalizeCouponCode(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const next = value.trim().toUpperCase();
  return next || null;
}

function parseCouponValue(raw: unknown) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function parseRazorpayCoupons(raw: string | undefined) {
  const coupons = new Map<string, BillingCouponDefinition>();

  if (!raw?.trim()) {
    return coupons;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    for (const [couponCode, value] of Object.entries(parsed || {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const record = value as Record<string, unknown>;
      const normalizedCode = normalizeCouponCode(couponCode);
      const kind =
        record.kind === 'percent' || record.type === 'percent'
          ? 'percent'
          : record.kind === 'flat' || record.type === 'flat'
            ? 'flat'
            : null;
      const parsedValue = parseCouponValue(record.value);

      if (!normalizedCode || !kind || parsedValue === null || parsedValue <= 0) {
        continue;
      }

      coupons.set(normalizedCode, {
        code: normalizedCode,
        kind,
        value: parsedValue,
        description:
          typeof record.description === 'string' && record.description.trim()
            ? record.description.trim()
            : undefined,
      });
    }
  } catch (error) {
    console.error('Failed to parse RAZORPAY_COUPONS_JSON:', error);
  }

  return coupons;
}

const razorpayCoupons = parseRazorpayCoupons(process.env.RAZORPAY_COUPONS_JSON);

function getBillingTrialDays() {
  return Number.isFinite(razorpayTrialDays) && razorpayTrialDays >= 0
    ? Math.round(razorpayTrialDays)
    : BILLING_DEFAULT_TRIAL_DAYS;
}

function getRazorpaySubscriptionTotalCount(cycle: BillingCycle) {
  const raw = cycle === 'annual' ? razorpayAnnualTotalCount : razorpayMonthlyTotalCount;
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : cycle === 'annual' ? 10 : 120;
}

function resolveBillingCoupon(couponCode?: string | null) {
  const normalizedCode = normalizeCouponCode(couponCode);

  if (!normalizedCode) {
    return null;
  }

  const coupon = razorpayCoupons.get(normalizedCode);

  if (!coupon) {
    throw new Error('Invalid or expired coupon code.');
  }

  return coupon;
}

function getBillingQuote(input: BillingQuoteInput) {
  const plan = getBillingPlan(input.planCode as BillingPlanCode);

  if (!plan) {
    throw new Error('Unsupported plan selected.');
  }

  const billingCycle = normalizeBillingCycle(input.billingCycle as string);

  if (!billingCycle) {
    throw new Error('Billing cycle must be monthly or annual.');
  }

  const coupon = resolveBillingCoupon(input.couponCode);
  const quote = buildBillingSummary({
    planCode: plan.code,
    billingCycle,
    coupon,
    trialDays: getBillingTrialDays(),
  });

  return {
    plan,
    billingCycle,
    coupon,
    quote,
  };
}

function buildRazorpayCatalogKey(input: { planCode: BillingPlanCode; billingCycle: BillingCycle; couponCode?: string | null; totalAmount: number }) {
  const couponSegment = normalizeCouponCode(input.couponCode)?.toLowerCase() || 'standard';
  return `connektly_${input.planCode}_${input.billingCycle}_${couponSegment}_${input.totalAmount}`;
}

async function razorpayRequest<T>(pathname: string, init?: RequestInit) {
  requireRazorpayCredentials();

  const response = await fetch(`https://api.razorpay.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage =
      payload?.error?.description ||
      payload?.description ||
      payload?.message ||
      `Razorpay request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

async function fetchAllRazorpayPlans() {
  const plans: RazorpayPlanEntity[] = [];
  const count = 100;
  let skip = 0;

  while (true) {
    const response = await razorpayRequest<{ items: RazorpayPlanEntity[] }>(
      `/v1/plans?count=${count}&skip=${skip}`,
      {
        method: 'GET',
      },
    );

    plans.push(...(response.items || []));

    if ((response.items || []).length < count) {
      break;
    }

    skip += count;
  }

  return plans;
}

async function getOrCreateRazorpayPlan(input: {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string | null;
  quote: ReturnType<typeof getBillingQuote>['quote'];
}) {
  const catalogKey = buildRazorpayCatalogKey({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode,
    totalAmount: input.quote.totalAmount,
  });

  const existingPlans = await fetchAllRazorpayPlans();
  const existingPlan = existingPlans.find((plan) => plan.notes?.catalog_key === catalogKey);

  if (existingPlan) {
    return existingPlan;
  }

  return razorpayRequest<RazorpayPlanEntity>('/v1/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: input.billingCycle === 'annual' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: `${razorpayBusinessName} ${input.quote.planName}`,
        description: `${input.quote.planName} subscription billed ${input.quote.billingCycleLabel.toLowerCase()} with 18% GST included.`,
        amount: input.quote.totalAmount,
        currency: BILLING_CURRENCY,
      },
      notes: {
        catalog_key: catalogKey,
        plan_code: input.planCode,
        billing_cycle: input.billingCycle,
        coupon_code: normalizeCouponCode(input.couponCode) || '',
        base_amount: String(input.quote.baseAmount),
        discount_amount: String(input.quote.discountAmount),
        gst_amount: String(input.quote.gstAmount),
        total_amount: String(input.quote.totalAmount),
      },
    }),
  });
}

async function createRazorpaySubscription(input: {
  userId: string;
  userEmail: string | null | undefined;
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string | null;
}) {
  const { quote } = getBillingQuote({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode || undefined,
  });

  const plan = await getOrCreateRazorpayPlan({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode,
    quote,
  });

  const subscription = await razorpayRequest<RazorpaySubscriptionEntity>('/v1/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: plan.id,
      total_count: getRazorpaySubscriptionTotalCount(input.billingCycle),
      customer_notify: 0,
      start_at: Math.floor(new Date(quote.trialEndsAt).getTime() / 1000),
      notes: {
        user_id: input.userId,
        user_email: input.userEmail || '',
        plan_code: input.planCode,
        billing_cycle: input.billingCycle,
        coupon_code: normalizeCouponCode(input.couponCode) || '',
        trial_ends_at: quote.trialEndsAt,
        total_amount: String(quote.totalAmount),
      },
    }),
  });

  return {
    subscription,
    quote,
  };
}

async function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscriptionEntity>(`/v1/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
}

function verifyRazorpaySubscriptionSignature(args: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) {
  requireRazorpayCredentials();

  const expectedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${args.paymentId}|${args.subscriptionId}`)
    .digest('hex');

  if (expectedSignature !== args.signature) {
    throw new Error('Razorpay payment signature verification failed.');
  }
}

function resolvePersistedBillingStatus(subscription: RazorpaySubscriptionEntity, trialEndsAt: string | null) {
  const trialIsActive = Boolean(trialEndsAt && new Date(trialEndsAt).getTime() > Date.now());

  if (trialIsActive) {
    return 'trialing' as const;
  }

  if (subscription.status === 'active' || subscription.status === 'authenticated') {
    return 'active' as const;
  }

  if (subscription.status === 'halted' || subscription.status === 'cancelled' || subscription.status === 'completed') {
    return 'inactive' as const;
  }

  return 'inactive' as const;
}

function mapDbError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : error && typeof error === 'object' && 'error_description' in error && typeof error.error_description === 'string'
            ? error.error_description
            : error && typeof error === 'object' && 'details' in error && typeof error.details === 'string'
              ? error.details
              : JSON.stringify(error);
  const missingSchema =
    typeof message === 'string' &&
    (message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('Could not find the table'));

  if (missingSchema) {
    return 'Supabase tables are missing. Apply supabase/schema.sql before starting the API server.';
  }

  return message;
}

function isMissingSchemaError(error: unknown) {
  const message = mapDbError(error);
  return (
    message ===
    'Supabase tables are missing. Apply supabase/schema.sql before starting the API server.'
  );
}

function sendError(res: Response, status: number, error: unknown) {
  console.error('API error:', error);
  res.status(status).json({
    error: mapDbError(error),
  });
}

function encryptAccessToken(token: string) {
  if (!encryptionKey) {
    return token;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptAccessToken(value: string) {
  if (!value.startsWith('enc:') || !encryptionKey) {
    return value;
  }

  const [iv, tag, payload] = value.slice(4).split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }

  const token = header.slice('Bearer '.length);
  const {
    data: { user },
    error,
  } = await authSupabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid Supabase session.' });
    return;
  }

  await activatePendingWorkspaceMembership(user.id);
  req.authedUser = user;
  next();
}

async function activatePendingWorkspaceMembership(userId: string) {
  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .update({
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .eq('member_user_id', userId)
    .eq('status', 'invited')
    .select('*');

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  for (const row of data || []) {
    const membership = row as Record<string, unknown>;
    const ownerUserId = normalizeOptionalIdentifier(membership.workspace_owner_user_id);

    if (!ownerUserId || ownerUserId === userId) {
      continue;
    }

    const memberName =
      normalizeOptionalString(membership.full_name) ||
      normalizeOptionalString(membership.invited_email) ||
      'A team member';

    await createUserNotification({
      userId: ownerUserId,
      type: 'team_member_joined',
      title: 'A user joined your workspace',
      body: `${memberName} accepted the invite and now has access to the workspace.`,
      targetPath: '/dashboard/settings?tab=team',
      metadata: {
        memberUserId: normalizeOptionalIdentifier(membership.member_user_id),
        email: normalizeOptionalString(membership.invited_email),
        role: normalizeOptionalString(membership.role),
      },
      dedupeKey: `team-joined:${String(membership.id)}:${String(membership.accepted_at || '')}`,
    });
  }
}

function requireMetaAppCredentials() {
  if (!metaAppId || !metaAppSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured on the API server.');
  }
}

function last4(value: string) {
  return value.length >= 4 ? value.slice(-4) : value;
}

function toIsoTimestamp(raw: string | number | null | undefined) {
  if (!raw) {
    return null;
  }

  const numeric = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) * 1000 : Number(raw);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(value: string | null | undefined): ConversationThread['status'] {
  if (value === 'In progress' || value === 'Waiting' || value === 'Completed') {
    return value;
  }

  return 'New';
}

function normalizePriority(value: string | null | undefined): ConversationThread['priority'] {
  if (value === 'Low' || value === 'High') {
    return value;
  }

  return 'Medium';
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalIdentifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeOptionalString(value);
}

function getGraphPictureUrl(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const data = isRecord(value.data) ? (value.data as Record<string, unknown>) : null;
  return normalizeOptionalString(data?.url ?? value.url);
}

function isSupportedAppProfilePhotoMimeType(value: unknown) {
  return value === 'image/png' || value === 'image/jpeg';
}

function getAppProfilePhotoExtension(mimeType: string) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

function getStoragePublicUrl(bucket: string, objectPath: string) {
  const { data } = adminSupabase.storage.from(bucket).getPublicUrl(objectPath);
  return normalizeOptionalString(data.publicUrl);
}

function getAppProfilePhotoStoragePathFromUrl(value: unknown) {
  const publicUrl = normalizeOptionalString(value);

  if (!publicUrl || !supabaseUrl) {
    return null;
  }

  const normalizedSupabaseUrl = supabaseUrl.replace(/\/$/, '');
  const publicUrlPrefix = `${normalizedSupabaseUrl}/storage/v1/object/public/${APP_PROFILE_PICTURE_BUCKET}/`;

  if (!publicUrl.startsWith(publicUrlPrefix)) {
    return null;
  }

  return decodeURIComponent(publicUrl.slice(publicUrlPrefix.length));
}

async function deleteStoredAppProfilePhoto(value: unknown) {
  const objectPath = getAppProfilePhotoStoragePathFromUrl(value);

  if (!objectPath) {
    return;
  }

  const { error } = await adminSupabase.storage.from(APP_PROFILE_PICTURE_BUCKET).remove([objectPath]);

  if (error && !String(error.message || '').toLowerCase().includes('not found')) {
    throw error;
  }
}

async function uploadAppProfilePhoto(args: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  purpose?: 'profile-picture' | 'company-logo';
}) {
  const objectPath = `${args.userId}/${args.purpose || 'profile-picture'}/${crypto.randomUUID()}.${getAppProfilePhotoExtension(args.mimeType)}`;
  const { error } = await adminSupabase.storage
    .from(APP_PROFILE_PICTURE_BUCKET)
    .upload(objectPath, args.buffer, {
      contentType: args.mimeType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const publicUrl = getStoragePublicUrl(APP_PROFILE_PICTURE_BUCKET, objectPath);

  if (!publicUrl) {
    throw new Error('Failed to resolve the uploaded profile picture URL.');
  }

  return publicUrl;
}

function getFirstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWorkspaceUserRole(value: unknown): WorkspaceTeamMember['role'] {
  if (value === 'Owner' || value === 'Admin' || value === 'Manager') {
    return value;
  }

  return 'Agent';
}

function normalizeWorkspaceUserStatus(value: unknown): WorkspaceTeamMember['status'] {
  return value === 'active' ? 'active' : 'invited';
}

function normalizeNotificationType(value: unknown): NotificationType {
  switch (value) {
    case 'template_approved':
    case 'template_rejected':
    case 'missed_call':
    case 'lead_created':
    case 'team_member_joined':
      return value;
    default:
      return 'lead_created';
  }
}

function normalizeNotificationSoundPreset(
  value: unknown,
): NotificationPreferences['soundPreset'] {
  if (value === 'soft' || value === 'pulse') {
    return value;
  }

  return 'classic';
}

function normalizeBooleanPreference(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNotificationVolume(value: unknown, fallback = 0.8) {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Math.round(numericValue * 100) / 100));
}

function getDefaultNotificationPreferences(userId: string): NotificationPreferences {
  const now = new Date().toISOString();

  return {
    userId,
    enabled: true,
    soundEnabled: true,
    callSoundEnabled: true,
    soundPreset: 'classic',
    volume: 0.8,
    templateReviewEnabled: true,
    missedCallEnabled: true,
    leadEnabled: true,
    teamJoinedEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function notificationTypeToPreferenceKey(
  type: NotificationType,
): 'templateReviewEnabled' | 'missedCallEnabled' | 'leadEnabled' | 'teamJoinedEnabled' | null {
  switch (type) {
    case 'template_approved':
    case 'template_rejected':
      return 'templateReviewEnabled';
    case 'missed_call':
      return 'missedCallEnabled';
    case 'lead_created':
      return 'leadEnabled';
    case 'team_member_joined':
      return 'teamJoinedEnabled';
    default:
      return null;
  }
}

function shouldCreateNotification(
  preferences: NotificationPreferences,
  type: NotificationType,
) {
  if (!preferences.enabled) {
    return false;
  }

  const preferenceKey = notificationTypeToPreferenceKey(type);

  if (!preferenceKey) {
    return true;
  }

  return preferences[preferenceKey];
}

function normalizeEmailAddress(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function normalizeEmailPort(value: unknown, label: string) {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 65535) {
    throw new Error(`${label} must be a valid port number.`);
  }

  return numeric;
}

function normalizeEmailConnectionInput(input: EmailConnectionUpsertInput) {
  const displayName = normalizeEditableString(input.displayName);
  const emailAddress = normalizeEmailAddress(input.emailAddress);
  const authUser = normalizeEditableString(input.authUser);
  const password = typeof input.password === 'string' ? input.password.trim() : '';
  const smtpHost = normalizeEditableString(input.smtpHost);
  const imapHost = normalizeEditableString(input.imapHost);

  if (!displayName) {
    throw new Error('Display name is required.');
  }

  if (!emailAddress) {
    throw new Error('A valid email address is required.');
  }

  if (!authUser) {
    throw new Error('A valid SMTP/IMAP username is required.');
  }

  if (!password) {
    throw new Error('Password is required.');
  }

  if (!smtpHost) {
    throw new Error('SMTP host is required.');
  }

  if (!imapHost) {
    throw new Error('IMAP host is required.');
  }

  return {
    displayName,
    emailAddress,
    authUser,
    password,
    smtpHost,
    smtpPort: normalizeEmailPort(input.smtpPort, 'SMTP port'),
    smtpSecure: input.smtpSecure !== false,
    imapHost,
    imapPort: normalizeEmailPort(input.imapPort, 'IMAP port'),
    imapSecure: input.imapSecure !== false,
  };
}

function normalizeEmailTemplateEditorMode(value: unknown): EmailTemplate['editorMode'] {
  return value === 'html' ? 'html' : 'rich';
}

function normalizeEmailTemplateInput(input: EmailTemplateSaveInput) {
  const name = normalizeEditableString(input.name);
  const subject = normalizeEditableString(input.subject);
  const htmlContent = typeof input.htmlContent === 'string' ? input.htmlContent.trim() : '';

  if (!name) {
    throw new Error('Template name is required.');
  }

  if (!subject) {
    throw new Error('Email subject is required.');
  }

  if (!htmlContent) {
    throw new Error('Email template content cannot be empty.');
  }

  return {
    name,
    subject,
    editorMode: normalizeEmailTemplateEditorMode(input.editorMode),
    htmlContent,
  };
}

function normalizeEmailRecipients(value: unknown): EmailRecipient[] {
  if (!Array.isArray(value)) {
    throw new Error('At least one email recipient is required.');
  }

  const deduped = new Map<string, EmailRecipient>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const email = normalizeEmailAddress((entry as { email?: unknown }).email);

    if (!email) {
      continue;
    }

    const name = normalizeEditableString((entry as { name?: unknown }).name) || null;
    deduped.set(email, { email, name });
  }

  const recipients = Array.from(deduped.values());

  if (recipients.length === 0) {
    throw new Error('At least one valid email recipient is required.');
  }

  return recipients;
}

function normalizeEmailCampaignInput(input: EmailCampaignSendInput) {
  const templateId = normalizeOptionalIdentifier(input.templateId);
  const campaignName = normalizeEditableString(input.campaignName);
  const audienceSource: EmailCampaign['audienceSource'] =
    input.audienceSource === 'custom' ? 'custom' : 'contacts';

  if (!templateId) {
    throw new Error('A saved email template is required.');
  }

  if (!campaignName) {
    throw new Error('Campaign name is required.');
  }

  return {
    templateId,
    campaignName,
    audienceSource,
    recipients: normalizeEmailRecipients(input.recipients),
  };
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInsightsChannel(value: unknown): InboxInsightsChannel {
  if (value === 'whatsapp' || value === 'instagram' || value === 'messenger') {
    return value;
  }

  return 'all';
}

function formatIsoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseInsightsDateInput(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveInsightsDateRange(startDate: unknown, endDate: unknown) {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const parsedStart = parseInsightsDateInput(startDate) || todayUtc;
  const parsedEnd = parseInsightsDateInput(endDate) || parsedStart;

  const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
  const end = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return {
    startDate: formatIsoDateInput(start),
    endDate: formatIsoDateInput(end),
    startAtIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
}

function getMessagingLimitCapacity(tier: string | null) {
  if (!tier) {
    return null;
  }

  const normalized = tier.trim().toUpperCase();
  const exactMap: Record<string, number | null> = {
    TIER_250: 250,
    TIER_1K: 1000,
    TIER_2K: 2000,
    TIER_10K: 10000,
    TIER_100K: 100000,
    TIER_UNLIMITED: null,
    UNLIMITED: null,
  };

  if (normalized in exactMap) {
    return exactMap[normalized];
  }

  const shorthandMatch = normalized.match(/(\d+)(K|M)/);

  if (shorthandMatch) {
    const numeric = Number(shorthandMatch[1]);
    const multiplier = shorthandMatch[2] === 'M' ? 1_000_000 : 1_000;
    return numeric * multiplier;
  }

  const numericMatch = normalized.match(/(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : null;
}

function getNormalizedMessagingLimitTier(
  value:
    | {
        whatsapp_business_manager_messaging_limit?: unknown;
        messaging_limit_tier?: unknown;
      }
    | null
    | undefined,
) {
  return (
    normalizeOptionalString(value?.whatsapp_business_manager_messaging_limit) ||
    normalizeOptionalString(value?.messaging_limit_tier)
  );
}

type InsightsMessageRow = {
  thread_id: string | null;
  direction: string | null;
  status: string | null;
  recipient_wa_id: string | null;
  created_at: string | null;
};

function countRepliedOutboundMessages(rows: InsightsMessageRow[]) {
  const rowsByThread = new Map<string, InsightsMessageRow[]>();

  for (const row of rows) {
    const threadId = row.thread_id || '';

    if (!threadId) {
      continue;
    }

    const existing = rowsByThread.get(threadId);

    if (existing) {
      existing.push(row);
      continue;
    }

    rowsByThread.set(threadId, [row]);
  }

  let repliedCount = 0;

  for (const threadRows of rowsByThread.values()) {
    for (let index = 0; index < threadRows.length - 1; index += 1) {
      const current = threadRows[index];
      const next = threadRows[index + 1];

      if (current.direction === 'outbound' && next.direction === 'inbound') {
        repliedCount += 1;
      }
    }
  }

  return repliedCount;
}

function normalizeEditableString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim();
}

function normalizeStringArray(value: unknown, options?: { uppercase?: boolean }) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => (options?.uppercase ? entry.toUpperCase() : entry));

  return Array.from(new Set(normalized));
}

function normalizePaymentConfigurationName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePaymentConfigurationCode(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePaymentProviderName(
  value: unknown,
): WhatsAppPaymentConfigurationCreateInput['providerName'] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === 'razorpay' ||
    normalized === 'payu' ||
    normalized === 'zaakpay' ||
    normalized === 'upi_vpa'
  ) {
    return normalized;
  }

  return null;
}

function mapWhatsAppPaymentCodeDetail(
  value: unknown,
): WhatsAppPaymentConfiguration['merchantCategoryCode'] {
  if (typeof value === 'string') {
    const code = normalizePaymentConfigurationCode(value);
    return code ? { code, description: null } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const code = normalizePaymentConfigurationCode(value.code);
  const description = normalizeOptionalString(value.description);

  if (!code && !description) {
    return null;
  }

  return {
    code,
    description,
  };
}

function mapWhatsAppPaymentConfiguration(
  row: Record<string, unknown>,
): WhatsAppPaymentConfiguration | null {
  const configurationName = normalizePaymentConfigurationName(row.configuration_name);

  if (!configurationName) {
    return null;
  }

  return {
    configurationName,
    merchantCategoryCode: mapWhatsAppPaymentCodeDetail(row.merchant_category_code),
    purposeCode: mapWhatsAppPaymentCodeDetail(row.purpose_code),
    status: normalizeOptionalString(row.status),
    providerMid: normalizeOptionalString(row.provider_mid),
    providerName: normalizeOptionalString(row.provider_name),
    merchantVpa: normalizeOptionalString(row.merchant_vpa),
    dataEndpointUrl: normalizeOptionalString(row.data_endpoint_url),
    createdTimestamp:
      typeof row.created_timestamp === 'number' ? row.created_timestamp : null,
    updatedTimestamp:
      typeof row.updated_timestamp === 'number' ? row.updated_timestamp : null,
  };
}

function extractWhatsAppPaymentConfigurationRows(
  value: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.data)) {
    return value.data.flatMap((entry) =>
      isRecord(entry)
        ? extractWhatsAppPaymentConfigurationRows(
            entry.payment_configurations ?? entry.payment_configuration ?? entry,
          )
        : [],
    );
  }

  if (Array.isArray(value.payment_configurations)) {
    return value.payment_configurations.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  }

  if (isRecord(value.payment_configuration)) {
    return [value.payment_configuration];
  }

  if (normalizePaymentConfigurationName(value.configuration_name)) {
    return [value];
  }

  return [];
}

function normalizePaymentConfigurationOAuthResponse(
  value: unknown,
): WhatsAppPaymentConfigurationOAuthResponse {
  if (!isRecord(value)) {
    return {
      success: false,
      oauthUrl: null,
      expiration: null,
    };
  }

  return {
    success: Boolean(value.success) || Boolean(normalizeOptionalString(value.oauth_url)),
    oauthUrl: normalizeOptionalString(value.oauth_url),
    expiration: typeof value.expiration === 'number' ? value.expiration : null,
  };
}

function normalizeConversationalAutomationPrompt(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeConversationalAutomationCommandName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();

  return normalized || null;
}

function normalizeConversationalAutomationCommandDescription(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeConversationalAutomationCommands(value: unknown): WhatsAppAutomationCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenNames = new Set<string>();
  const commands: WhatsAppAutomationCommand[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const commandName = normalizeConversationalAutomationCommandName(
      entry.commandName ?? entry.command_name,
    );
    const commandDescription = normalizeConversationalAutomationCommandDescription(
      entry.commandDescription ?? entry.command_description,
    );

    if (!commandName || !commandDescription) {
      throw new Error('Each bot command needs a command name and description.');
    }

    if (seenNames.has(commandName)) {
      throw new Error(`Bot command "/${commandName}" is duplicated. Use unique command names.`);
    }

    seenNames.add(commandName);
    commands.push({
      commandName,
      commandDescription,
    });
  }

  return commands;
}

function normalizeConversationalAutomationInput(
  input: WhatsAppConversationalAutomationUpdateInput | null | undefined,
): Required<WhatsAppConversationalAutomationUpdateInput> {
  const prompts = Array.isArray(input?.prompts)
    ? Array.from(
        new Set(
          input.prompts
            .map((prompt) => normalizeConversationalAutomationPrompt(prompt))
            .filter((prompt): prompt is string => Boolean(prompt)),
        ),
      )
    : [];

  return {
    enableWelcomeMessage: Boolean(input?.enableWelcomeMessage),
    prompts,
    commands: normalizeConversationalAutomationCommands(input?.commands),
  };
}

function generateVerifyToken() {
  return crypto.randomBytes(18).toString('hex');
}

function getRequestOrigin(req: Request) {
  const forwardedProto = normalizeOptionalString(req.headers['x-forwarded-proto']);
  const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
  const host = normalizeOptionalString(req.get('host'));
  return host ? `${protocol}://${host}` : frontendOrigin;
}

function getMetaLeadCaptureCallbackUrl(req: Request) {
  return new URL('/api/meta/lead-capture/webhook', getRequestOrigin(req)).toString();
}

function normalizePhoneLike(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly || null;
}

function normalizeContactIdentity(value: unknown) {
  return normalizePhoneLike(value) || normalizeOptionalString(value);
}

function formatContactIdentity(value: unknown) {
  const normalizedPhone = normalizePhoneLike(value);

  if (normalizedPhone) {
    return `+${normalizedPhone}`;
  }

  return normalizeOptionalString(value);
}

function buildContactIdentityVariants(value: unknown) {
  const normalizedPhone = normalizePhoneLike(value);

  if (normalizedPhone) {
    return Array.from(new Set([normalizedPhone, `+${normalizedPhone}`]));
  }

  const normalizedIdentity = normalizeOptionalString(value);
  return normalizedIdentity ? [normalizedIdentity] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCallDirection(value: unknown): WhatsAppCallDirection {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (
      normalized === 'incoming' ||
      normalized === 'user_initiated' ||
      normalized === 'user-initiated' ||
      normalized === 'user initiated'
    ) {
      return 'incoming';
    }
  }

  return 'outgoing';
}

function normalizeCallState(
  value: unknown,
  fallback: WhatsAppCallState | '' = 'dialing',
): WhatsAppCallState | '' {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'incoming':
      return 'incoming';
    case 'dialing':
    case 'calling':
      return 'dialing';
    case 'ringing':
    case 'pre_accept':
    case 'pre-accept':
      return 'ringing';
    case 'connecting':
    case 'connect':
      return 'connecting';
    case 'accepted':
    case 'accept':
    case 'connected':
    case 'ongoing':
    case 'active':
    case 'in_progress':
    case 'in-progress':
      return 'ongoing';
    case 'ending':
      return 'ending';
    case 'ended':
    case 'terminate':
    case 'terminated':
    case 'complete':
    case 'completed':
      return 'ended';
    case 'rejected':
    case 'reject':
    case 'denied':
    case 'declined':
      return 'rejected';
    case 'missed':
      return 'missed';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return fallback;
  }
}

function isTerminalCallState(state: WhatsAppCallState) {
  return state === 'ended' || state === 'rejected' || state === 'missed' || state === 'failed';
}

function extractPhoneLike(value: unknown): string | null {
  const normalizedDirect = normalizePhoneLike(value);

  if (normalizedDirect) {
    return normalizedDirect;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalizedEntry = extractPhoneLike(entry);

      if (normalizedEntry) {
        return normalizedEntry;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  return (
    normalizePhoneLike(value.wa_id) ||
    normalizePhoneLike(value.user_wa_id) ||
    normalizePhoneLike(value.phone) ||
    normalizePhoneLike(value.phone_number) ||
    normalizePhoneLike(value.id) ||
    null
  );
}

function inferCallStateFromWebhook(args: {
  eventName?: string | null;
  statusName?: string | null;
  direction: WhatsAppCallDirection;
  hasOffer: boolean;
  hasAnswer: boolean;
}) {
  const explicitState = normalizeCallState(args.statusName || args.eventName, '');

  if (explicitState) {
    if (explicitState === 'connecting' && args.direction === 'incoming' && args.hasOffer) {
      return 'incoming';
    }

    return explicitState;
  }

  if (args.hasAnswer) {
    return 'connecting';
  }

  if (args.direction === 'incoming' && args.hasOffer) {
    return 'incoming';
  }

  return args.direction === 'incoming' ? 'incoming' : 'dialing';
}

function getCallLogTypeFromSession(session: Pick<WhatsAppCallSessionRecord, 'direction' | 'state'>): CallLog['type'] {
  if (session.direction === 'incoming') {
    return session.state === 'missed' || session.state === 'rejected' ? 'missed' : 'incoming';
  }

  return 'outgoing';
}

function formatCallStateLabel(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return 'Incoming';
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'ongoing':
      return 'Ongoing';
    case 'ending':
      return 'Ending';
    case 'ended':
      return 'Ended';
    case 'rejected':
      return 'Rejected';
    case 'missed':
      return 'Missed';
    case 'failed':
      return 'Failed';
    default:
      return state;
  }
}

function normalizeLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(labels)).slice(0, 12);
}

function normalizeWebsites(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const websites = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(websites)).slice(0, 2);
}

function extractTemplateVariables(value: string) {
  const matches = value.match(/\{\{\d+\}\}/g) || [];
  return Array.from(new Set(matches));
}

function buildTemplateExamples(value: string) {
  const variables = extractTemplateVariables(value);

  if (variables.length === 0) {
    return undefined;
  }

  return variables.map((_variable, index) => `Sample ${index + 1}`);
}

function guessMediaTypeFromMime(mimeType: string | null | undefined): SendMediaMessageInput['mediaType'] {
  if (!mimeType) {
    return 'document';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
}

function getMessageText(message: Record<string, unknown>) {
  const type = typeof message.type === 'string' ? message.type : 'text';

  switch (type) {
    case 'text':
      return ((message.text as { body?: string } | undefined)?.body || null) as string | null;
    case 'image':
      return ((message.image as { caption?: string } | undefined)?.caption || 'Image attachment') as string;
    case 'video':
      return ((message.video as { caption?: string } | undefined)?.caption || 'Video attachment') as string;
    case 'document':
      return (
        (message.document as { caption?: string; filename?: string } | undefined)?.caption ||
        (message.document as { filename?: string } | undefined)?.filename ||
        'Document attachment'
      ) as string;
    case 'audio':
      return 'Audio attachment';
    case 'sticker':
      return 'Sticker';
    case 'location': {
      const location = message.location as { latitude?: number; longitude?: number; name?: string } | undefined;
      return location?.name || (location?.latitude && location?.longitude ? `Location: ${location.latitude}, ${location.longitude}` : 'Location');
    }
    case 'contacts':
      return 'Contact card';
    case 'button':
      return ((message.button as { text?: string } | undefined)?.text || 'Button reply') as string;
    case 'interactive': {
      const interactive = message.interactive as
        | { button_reply?: { title?: string }; list_reply?: { title?: string; description?: string } }
        | undefined;
      return (
        interactive?.button_reply?.title ||
        interactive?.list_reply?.title ||
        interactive?.list_reply?.description ||
        'Interactive reply'
      );
    }
    default:
      return `${type} message`;
  }
}

function getMediaInfo(raw: Record<string, unknown>) {
  const type = typeof raw.type === 'string' ? raw.type : null;

  if (!type || !['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    return null;
  }

  const payload = raw[type] as { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined;

  if (!payload?.id) {
    return null;
  }

  return {
    mediaId: payload.id,
    mimeType: payload.mime_type || null,
    fileName: payload.filename || null,
    caption: payload.caption || null,
    mediaType: type,
  };
}

async function metaRequest<T>({
  accessToken,
  path: graphPath,
  method = 'GET',
  query,
  body,
}: {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${graphPath.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Meta API request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      message = payload.error?.message || message;
    } catch {
      return Promise.reject(new Error(message));
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function buildMetaApiError(
  response: globalThis.Response,
  payload: {
    error?: {
      message?: string;
      error_user_msg?: string;
      error_data?: {
        details?: string;
      };
      code?: number;
    };
  } | null,
) {
  const code = payload?.error?.code;
  let message =
    payload?.error?.error_data?.details ||
    payload?.error?.error_user_msg ||
    payload?.error?.message ||
    `Meta API request failed with status ${response.status}`;

  if (code === 138006) {
    message = 'Call permission has not been granted by this WhatsApp user yet.';
  }

  if (code) {
    message = `${message} (code ${code})`;
  }

  return new Error(message);
}

async function metaRequestDetailed<T>({
  accessToken,
  path: graphPath,
  method = 'GET',
  query,
  body,
}: {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${graphPath.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as T;
}

async function exchangeEmbeddedSignupCode(code: string, requestOrigin: string | undefined) {
  requireMetaAppCredentials();

  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set('client_id', metaAppId);
  url.searchParams.set('client_secret', metaAppSecret);
  url.searchParams.set('code', code);

  const redirectUri = metaRedirectUri || requestOrigin;
  if (redirectUri) {
    url.searchParams.set('redirect_uri', redirectUri);
  }

  const response = await fetch(url);

  if (!response.ok) {
    let message = `Failed to exchange Meta authorization code (${response.status}).`;

    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      message = payload.error?.message || message;
    } catch {
      throw new Error(message);
    }

    throw new Error(message);
  }

  const payload = (await response.json()) as {
    access_token: string;
  };

  return payload.access_token;
}

async function exchangeInstagramLongLivedAccessToken(accessToken: string) {
  if (!instagramAppId || !instagramAppSecret) {
    throw new Error(
      'Instagram Business Login did not return a long-lived token, and INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are not configured for token exchange.',
    );
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', instagramAppId);
  url.searchParams.set('client_secret', instagramAppSecret);
  url.searchParams.set('fb_exchange_token', accessToken);

  const response = await fetch(url);

  if (!response.ok) {
    let message = `Failed to exchange the Instagram long-lived access token (${response.status}).`;

    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      message = payload.error?.message || message;
    } catch {
      throw new Error(message);
    }

    throw new Error(message);
  }

  const payload = (await response.json()) as {
    access_token: string;
  };

  return payload.access_token;
}

async function normalizeInstagramLongLivedToken(
  longLivedToken: string | undefined | null,
  accessToken: string | undefined | null,
) {
  const normalizedLongLivedToken = normalizeOptionalString(longLivedToken);

  if (normalizedLongLivedToken) {
    return normalizedLongLivedToken;
  }

  const normalizedAccessToken = normalizeOptionalString(accessToken);

  if (!normalizedAccessToken) {
    throw new Error('Instagram Business Login did not return a usable access token.');
  }

  return exchangeInstagramLongLivedAccessToken(normalizedAccessToken);
}

async function fetchPhoneNumber(accessToken: string, phoneNumberId: string) {
  return metaRequest<{
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
    messaging_limit_tier?: string;
    name_status?: string;
  }>({
    accessToken,
    path: phoneNumberId,
    query: {
      fields:
        'display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit,name_status',
    },
  });
}

function normalizeCallPermissionStatus(value: unknown): WhatsAppCallPermissionResponse['permission']['status'] {
  if (value === 'granted' || value === 'pending' || value === 'denied' || value === 'expired') {
    return value;
  }

  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'denied';
}

function normalizeCallActionName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'unknown';
}

async function fetchCallPermissions(
  accessToken: string,
  phoneNumberId: string,
  userWaId: string,
): Promise<WhatsAppCallPermissionResponse> {
  const normalizedUserWaId = normalizePhoneLike(userWaId);

  if (!normalizedUserWaId) {
    throw new Error('A valid WhatsApp user ID is required to check call permissions.');
  }

  const response = await metaRequestDetailed<{
    messaging_product?: string;
    permission?: {
      status?: string;
      expiration_time?: number;
    };
    actions?: Array<{
      action_name?: string;
      can_perform_action?: boolean;
      limits?: Array<{
        time_period?: string;
        current_usage?: number;
        max_allowed?: number;
        limit_expiration_time?: number;
      }>;
    }>;
  }>({
    accessToken,
    path: `${phoneNumberId}/call_permissions`,
    query: {
      user_wa_id: normalizedUserWaId,
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product) || 'whatsapp',
    permission: {
      status: normalizeCallPermissionStatus(response.permission?.status),
      expirationTime:
        typeof response.permission?.expiration_time === 'number'
          ? response.permission.expiration_time
          : null,
    },
    actions: Array.isArray(response.actions)
      ? response.actions.map((action) => ({
          actionName: normalizeCallActionName(action.action_name),
          canPerformAction: Boolean(action.can_perform_action),
          limits: Array.isArray(action.limits)
            ? action.limits.map((limit) => ({
                timePeriod: typeof limit.time_period === 'string' ? limit.time_period : 'unknown',
                currentUsage: Number(limit.current_usage || 0),
                maxAllowed: Number(limit.max_allowed || 0),
                limitExpirationTime:
                  typeof limit.limit_expiration_time === 'number'
                    ? limit.limit_expiration_time
                    : null,
              }))
            : [],
        }))
      : [],
  };
}

function normalizeBlockedUsersPayload(users: unknown) {
  if (!Array.isArray(users)) {
    throw new Error('At least one WhatsApp user is required.');
  }

  const normalizedUsers = Array.from(
    new Set(
      users
        .map((value) => normalizePhoneLike(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!normalizedUsers.length) {
    throw new Error('At least one valid WhatsApp user is required.');
  }

  return normalizedUsers;
}

function mapBlockedUserRecord(entry: Record<string, unknown>): WhatsAppBlockedUser | null {
  const waId = normalizePhoneLike(entry.wa_id);

  if (!waId) {
    return null;
  }

  return {
    messagingProduct: normalizeOptionalString(entry.messaging_product),
    waId,
  };
}

function mapBlockedUserOperationRecord(entry: Record<string, unknown>) {
  return {
    input: normalizeOptionalString(entry.input),
    waId: normalizePhoneLike(entry.wa_id),
  };
}

async function fetchBlockedUsers(
  accessToken: string,
  phoneNumberId: string,
  after?: string | null,
): Promise<WhatsAppBlockedUsersResponse> {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
    paging?: {
      cursors?: {
        after?: string;
        before?: string;
      };
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    query: {
      after: normalizeOptionalString(after) || undefined,
    },
  });

  const data = Array.isArray(response.data)
    ? response.data
        .map((entry) => mapBlockedUserRecord(entry))
        .filter((entry): entry is WhatsAppBlockedUser => Boolean(entry))
    : [];

  return {
    data,
    paging: response.paging?.cursors
      ? {
          after: normalizeOptionalString(response.paging.cursors.after),
          before: normalizeOptionalString(response.paging.cursors.before),
        }
      : null,
  };
}

async function fetchAllBlockedUsers(
  accessToken: string,
  phoneNumberId: string,
): Promise<WhatsAppBlockedUsersResponse> {
  const users: WhatsAppBlockedUser[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchBlockedUsers(accessToken, phoneNumberId, after);

    for (const entry of response.data) {
      if (seen.has(entry.waId)) {
        continue;
      }

      seen.add(entry.waId);
      users.push(entry);
    }

    after = response.paging?.after || null;

    if (!after) {
      break;
    }
  }

  return {
    data: users,
    paging: null,
  };
}

async function blockUsers(
  accessToken: string,
  phoneNumberId: string,
  users: string[],
): Promise<WhatsAppBlockedUsersMutationResponse> {
  const normalizedUsers = normalizeBlockedUsersPayload(users);
  const response = await metaRequestDetailed<{
    messaging_product?: string;
    block_users?: {
      added_users?: Array<Record<string, unknown>>;
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      block_users: normalizedUsers.map((user) => ({ user })),
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    users: Array.isArray(response.block_users?.added_users)
      ? response.block_users.added_users.map((entry) => mapBlockedUserOperationRecord(entry))
      : [],
  };
}

async function unblockUsers(
  accessToken: string,
  phoneNumberId: string,
  users: string[],
): Promise<WhatsAppBlockedUsersMutationResponse> {
  const normalizedUsers = normalizeBlockedUsersPayload(users);
  const response = await metaRequestDetailed<{
    messaging_product?: string;
    block_users?: {
      removed_users?: Array<Record<string, unknown>>;
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    method: 'DELETE',
    body: {
      messaging_product: 'whatsapp',
      block_users: normalizedUsers.map((user) => ({ user })),
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    users: Array.isArray(response.block_users?.removed_users)
      ? response.block_users.removed_users.map((entry) => mapBlockedUserOperationRecord(entry))
      : [],
  };
}

function normalizeActivitiesLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function normalizeActivitiesListFilter(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((entry) => String(entry).split(','))
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

function normalizeWhatsAppBusinessActivitiesFilters(
  input: WhatsAppBusinessActivitiesFilters,
): Required<Pick<WhatsAppBusinessActivitiesFilters, 'limit'>> & WhatsAppBusinessActivitiesFilters {
  return {
    limit: normalizeActivitiesLimit(input.limit),
    after: normalizeOptionalString(input.after) || undefined,
    before: normalizeOptionalString(input.before) || undefined,
    since: normalizeOptionalString(input.since) || undefined,
    until: normalizeOptionalString(input.until) || undefined,
    activityType: normalizeActivitiesListFilter(input.activityType),
  };
}

function mapWhatsAppBusinessActivityRecord(
  entry: Record<string, unknown>,
): WhatsAppBusinessAccountActivity | null {
  const id = normalizeOptionalIdentifier(entry.id);
  const activityType = normalizeOptionalString(entry.activity_type);
  const timestamp = normalizeOptionalString(entry.timestamp);
  const actorType = normalizeOptionalString(entry.actor_type);

  if (!id || !activityType || !timestamp || !actorType) {
    return null;
  }

  return {
    id,
    activityType,
    timestamp,
    actorType,
    actorId: normalizeOptionalIdentifier(entry.actor_id),
    actorName: normalizeOptionalString(entry.actor_name),
    description: normalizeOptionalString(entry.description),
    details: isRecord(entry.details) ? entry.details : null,
    ipAddress: normalizeOptionalString(entry.ip_address),
    userAgent: normalizeOptionalString(entry.user_agent),
  };
}

async function fetchWhatsAppBusinessActivities(
  accessToken: string,
  wabaId: string,
  filters: WhatsAppBusinessActivitiesFilters,
): Promise<WhatsAppBusinessActivitiesResponse> {
  const normalizedFilters = normalizeWhatsAppBusinessActivitiesFilters(filters);
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
    paging?: {
      cursors?: {
        before?: string;
        after?: string;
      };
      previous?: string;
      next?: string;
    };
  }>({
    accessToken,
    path: `${wabaId}/activities`,
    query: {
      fields:
        'id,activity_type,timestamp,actor_type,actor_id,actor_name,description,details,ip_address,user_agent',
      limit: normalizedFilters.limit,
      after: normalizedFilters.after,
      before: normalizedFilters.before,
      since: normalizedFilters.since,
      until: normalizedFilters.until,
      activity_type:
        normalizedFilters.activityType && normalizedFilters.activityType.length > 0
          ? normalizedFilters.activityType.join(',')
          : undefined,
    },
  });

  return {
    wabaId,
    activities: Array.isArray(response.data)
      ? response.data
          .map((entry) => mapWhatsAppBusinessActivityRecord(entry))
          .filter((entry): entry is WhatsAppBusinessAccountActivity => Boolean(entry))
      : [],
    paging: {
      before: normalizeOptionalString(response.paging?.cursors?.before),
      after: normalizeOptionalString(response.paging?.cursors?.after),
      previous: normalizeOptionalString(response.paging?.previous),
      next: normalizeOptionalString(response.paging?.next),
    },
    fetchedAt: new Date().toISOString(),
  };
}

async function manageRemoteCall(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppCallManageInput,
): Promise<WhatsAppCallManageResponse> {
  const normalizedTo = normalizePhoneLike(input.to);
  const normalizedCallId = normalizeOptionalString(input.callId);
  const normalizedCallbackData = normalizeEditableString(input.bizOpaqueCallbackData);
  const normalizedSessionSdp = normalizeSdpString(input.session?.sdp);
  const sessionType = input.session?.sdpType;
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    action: input.action,
  };

  if (input.action === 'connect') {
    if (!normalizedTo) {
      throw new Error('A WhatsApp user ID is required to start a call.');
    }

    if (sessionType !== 'offer' || !normalizedSessionSdp) {
      throw new Error('An SDP offer is required to start a call.');
    }
  }

  if (input.action === 'accept') {
    if (!normalizedCallId && !normalizedTo) {
      throw new Error('A call ID or WhatsApp user ID is required to accept a call.');
    }

    if (sessionType !== 'answer' || !normalizedSessionSdp) {
      throw new Error('An SDP answer is required to accept a call.');
    }
  }

  if ((input.action === 'pre_accept' || input.action === 'reject') && !normalizedCallId && !normalizedTo) {
    throw new Error('A call ID or WhatsApp user ID is required for this call action.');
  }

  if (input.action === 'terminate' && !normalizedCallId) {
    throw new Error('A call ID is required to terminate a call.');
  }

  if (normalizedTo) {
    payload.to = normalizedTo;
  }

  if (normalizedCallId) {
    payload.call_id = normalizedCallId;
  }

  if (normalizedSessionSdp && sessionType) {
    payload.session = {
      sdp_type: sessionType,
      sdp: normalizedSessionSdp,
    };
  }

  if (normalizedCallbackData) {
    payload.biz_opaque_callback_data = normalizedCallbackData.slice(0, 512);
  }

  const response = await metaRequestDetailed<{
    messaging_product?: string;
    calls?: Array<{ id?: string }>;
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/calls`,
    method: 'POST',
    body: payload,
  });

  const callIds = Array.isArray(response.calls)
    ? response.calls
        .map((entry) => normalizeOptionalString(entry.id))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    callId: callIds[0] || normalizedCallId || null,
    callIds,
    success: Boolean(response.success) || callIds.length > 0,
  };
}

async function fetchBusinessProfile(accessToken: string, phoneNumberId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_business_profile`,
    query: {
      fields: 'about,address,description,email,profile_picture_url,websites,vertical',
    },
  });

  return (response.data?.[0] || {}) as Record<string, unknown>;
}

async function updateBusinessProfile(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppBusinessProfileUpdateInput,
) {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
  };

  if ('about' in input) payload.about = normalizeEditableString(input.about) ?? '';
  if ('address' in input) payload.address = normalizeEditableString(input.address) ?? '';
  if ('description' in input) payload.description = normalizeEditableString(input.description) ?? '';
  if ('email' in input) payload.email = normalizeEditableString(input.email) ?? '';
  if ('profilePictureHandle' in input) {
    payload.profile_picture_handle = normalizeEditableString(input.profilePictureHandle) ?? '';
  }
  if ('vertical' in input) payload.vertical = normalizeEditableString(input.vertical) ?? '';
  if ('websites' in input) payload.websites = normalizeWebsites(input.websites);

  await metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_business_profile`,
    method: 'POST',
    body: payload,
  });

  return fetchBusinessProfile(accessToken, phoneNumberId);
}

async function fetchCommerceSettings(accessToken: string, phoneNumberId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_commerce_settings`,
  });

  return (response.data?.[0] || {}) as Record<string, unknown>;
}

function normalizeCommerceSettingsInput(input: WhatsAppCommerceSettingsUpdateInput) {
  const normalized: {
    isCartEnabled?: boolean;
    isCatalogVisible?: boolean;
  } = {};

  if ('isCartEnabled' in input) {
    if (typeof input.isCartEnabled !== 'boolean') {
      throw new Error('isCartEnabled must be a boolean.');
    }

    normalized.isCartEnabled = input.isCartEnabled;
  }

  if ('isCatalogVisible' in input) {
    if (typeof input.isCatalogVisible !== 'boolean') {
      throw new Error('isCatalogVisible must be a boolean.');
    }

    normalized.isCatalogVisible = input.isCatalogVisible;
  }

  if (!('isCartEnabled' in normalized) && !('isCatalogVisible' in normalized)) {
    throw new Error('At least one commerce setting must be provided.');
  }

  return normalized;
}

async function updateCommerceSettings(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppCommerceSettingsUpdateInput,
) {
  const normalizedInput = normalizeCommerceSettingsInput(input);

  await metaRequest<{
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_commerce_settings`,
    method: 'POST',
    query: {
      is_cart_enabled: normalizedInput.isCartEnabled,
      is_catalog_visible: normalizedInput.isCatalogVisible,
    },
  });

  return fetchCommerceSettings(accessToken, phoneNumberId);
}

async function configureConversationalAutomation(
  accessToken: string,
  phoneNumberId: string,
  input: Required<WhatsAppConversationalAutomationUpdateInput>,
) {
  const response = await metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/conversational_automation`,
    method: 'POST',
    body: {
      enable_welcome_message: input.enableWelcomeMessage,
      prompts: input.prompts,
      commands: input.commands.map((command) => ({
        command_name: command.commandName,
        command_description: command.commandDescription,
      })),
    },
  });

  if (!response.success) {
    throw new Error('WhatsApp did not confirm the automation update.');
  }

  return response;
}

async function listWhatsAppPaymentConfigurations(
  accessToken: string,
  wabaId: string,
) {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${wabaId}/payment_configurations`,
  });

  return extractWhatsAppPaymentConfigurationRows(response)
    .map((row) => mapWhatsAppPaymentConfiguration(row))
    .filter((row): row is WhatsAppPaymentConfiguration => Boolean(row));
}

async function getWhatsAppPaymentConfiguration(
  accessToken: string,
  wabaId: string,
  configurationName: string,
) {
  const normalizedConfigurationName = normalizePaymentConfigurationName(configurationName);

  if (!normalizedConfigurationName) {
    throw new Error('A payment configuration name is required.');
  }

  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/payment_configuration/${encodeURIComponent(normalizedConfigurationName)}`,
  });
  const row = extractWhatsAppPaymentConfigurationRows(response)[0];
  const configuration = row ? mapWhatsAppPaymentConfiguration(row) : null;

  if (!configuration) {
    throw new Error('Payment configuration not found.');
  }

  return configuration;
}

async function createWhatsAppPaymentConfiguration(
  accessToken: string,
  wabaId: string,
  input: WhatsAppPaymentConfigurationCreateInput,
) {
  const configurationName = normalizePaymentConfigurationName(input.configurationName);
  const purposeCode = normalizePaymentConfigurationCode(input.purposeCode);
  const merchantCategoryCode = normalizePaymentConfigurationCode(input.merchantCategoryCode);
  const providerName = normalizePaymentProviderName(input.providerName);
  const redirectUrl = normalizeOptionalString(input.redirectUrl);
  const merchantVpa = normalizeOptionalString(input.merchantVpa);
  const providerMid = normalizeOptionalString(input.providerMid);

  if (!configurationName || !purposeCode || !merchantCategoryCode || !providerName) {
    throw new Error(
      'Configuration name, purpose code, merchant category code, and provider are required.',
    );
  }

  if (providerName === 'upi_vpa' && !merchantVpa) {
    throw new Error('A merchant UPI ID is required for UPI-based payments.');
  }

  if (providerName !== 'upi_vpa' && !redirectUrl) {
    throw new Error('A redirect URL is required for payment gateway onboarding.');
  }

  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/payment_configuration`,
    method: 'POST',
    body: {
      configuration_name: configurationName,
      purpose_code: purposeCode,
      merchant_category_code: merchantCategoryCode,
      provider_name: providerName,
      ...(providerMid ? { provider_mid: providerMid } : {}),
      ...(merchantVpa ? { merchant_vpa: merchantVpa } : {}),
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    },
  });

  let configuration: WhatsAppPaymentConfiguration;

  try {
    configuration = await getWhatsAppPaymentConfiguration(
      accessToken,
      wabaId,
      configurationName,
    );
  } catch {
    configuration = {
      configurationName,
      merchantCategoryCode: {
        code: merchantCategoryCode,
        description: null,
      },
      purposeCode: {
        code: purposeCode,
        description: null,
      },
      status: providerName === 'upi_vpa' ? 'Active' : 'Needs_Connecting',
      providerMid,
      providerName,
      merchantVpa,
      dataEndpointUrl: normalizeOptionalString(input.dataEndpointUrl),
      createdTimestamp: null,
      updatedTimestamp: null,
    };
  }

  const dataEndpointUrl = normalizeOptionalString(input.dataEndpointUrl);

  if (dataEndpointUrl) {
    configuration = await updateWhatsAppPaymentConfigurationDataEndpoint(
      accessToken,
      wabaId,
      configurationName,
      {
        dataEndpointUrl,
      },
    );
  }

  return {
    configuration,
    oauth: normalizePaymentConfigurationOAuthResponse(response),
  };
}

async function updateWhatsAppPaymentConfigurationDataEndpoint(
  accessToken: string,
  wabaId: string,
  configurationName: string,
  input: WhatsAppPaymentConfigurationEndpointInput,
) {
  const normalizedConfigurationName = normalizePaymentConfigurationName(configurationName);
  const dataEndpointUrl = normalizeOptionalString(input.dataEndpointUrl);

  if (!normalizedConfigurationName || !dataEndpointUrl) {
    throw new Error('Configuration name and data endpoint URL are required.');
  }

  await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/payment_configuration/${encodeURIComponent(normalizedConfigurationName)}`,
    method: 'POST',
    body: {
      data_endpoint_url: dataEndpointUrl,
    },
  });

  return getWhatsAppPaymentConfiguration(accessToken, wabaId, normalizedConfigurationName);
}

async function regenerateWhatsAppPaymentConfigurationOAuthLink(
  accessToken: string,
  wabaId: string,
  configurationName: string,
  input: WhatsAppPaymentConfigurationOAuthLinkInput,
) {
  const normalizedConfigurationName = normalizePaymentConfigurationName(configurationName);
  const redirectUrl = normalizeOptionalString(input.redirectUrl);

  if (!normalizedConfigurationName || !redirectUrl) {
    throw new Error('Configuration name and redirect URL are required.');
  }

  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/generate_payment_configuration_oauth_link`,
    method: 'POST',
    body: {
      configuration_name: normalizedConfigurationName,
      redirect_url: redirectUrl,
    },
  });

  return normalizePaymentConfigurationOAuthResponse(response);
}

async function deleteWhatsAppPaymentConfiguration(
  accessToken: string,
  wabaId: string,
  configurationName: string,
) {
  const normalizedConfigurationName = normalizePaymentConfigurationName(configurationName);

  if (!normalizedConfigurationName) {
    throw new Error('A payment configuration name is required.');
  }

  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/payment_configuration`,
    method: 'DELETE',
    body: {
      configuration_name: normalizedConfigurationName,
    },
  });

  if (!response.success) {
    throw new Error('WhatsApp did not confirm the payment configuration deletion.');
  }

  return true;
}

function isSupportedBusinessProfilePhotoMimeType(value: string | null | undefined) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png';
}

async function createBusinessProfilePhotoUploadSession(
  accessToken: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  requireMetaAppCredentials();

  const response = await metaRequest<{ id?: string }>({
    accessToken,
    path: `${metaAppId}/uploads`,
    method: 'POST',
    query: {
      file_length: file.buffer.length,
      file_type: file.mimeType,
      file_name: file.fileName,
    },
  });

  const uploadId = normalizeOptionalString(response.id);

  if (!uploadId) {
    throw new Error('Meta did not return a profile photo upload session.');
  }

  return uploadId;
}

async function uploadBusinessProfilePhotoHandle(
  accessToken: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  const uploadId = await createBusinessProfilePhotoUploadSession(accessToken, file);
  const uploadUrl = `https://graph.facebook.com/${graphVersion}/${uploadId.replace(/^\/+/, '')}`;
  let lastError: Error | null = null;

  for (const authorization of [`OAuth ${accessToken}`, `Bearer ${accessToken}`]) {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        file_offset: '0',
        'Content-Type': file.mimeType,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      let message = `Profile photo upload failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as {
          error?: {
            message?: string;
          };
        };
        message = payload.error?.message || message;
      } catch {
        lastError = new Error(message);
        continue;
      }

      lastError = new Error(message);
      continue;
    }

    const payload = (await response.json()) as {
      h?: string;
      handle?: string;
    };
    const handle = normalizeOptionalString(payload.h) || normalizeOptionalString(payload.handle);

    if (!handle) {
      throw new Error('Meta did not return a profile photo handle.');
    }

    return handle;
  }

  throw lastError || new Error('Profile photo upload failed.');
}

async function fetchWaba(accessToken: string, wabaId: string) {
  return metaRequest<{
    id?: string;
    name?: string;
  }>({
    accessToken,
    path: wabaId,
    query: {
      fields: 'id,name',
    },
  });
}

async function fetchInstagramPages(accessToken: string) {
  const response = await metaRequest<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: {
        id?: string;
      } | null;
    }>;
  }>({
    accessToken,
    path: 'me/accounts',
    query: {
      fields: 'id,name,access_token,instagram_business_account{id}',
    },
  });

  return response.data || [];
}

async function fetchMessengerPages(accessToken: string) {
  const response = await metaRequestDetailed<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      picture?: unknown;
    }>;
  }>({
    accessToken,
    path: 'me/accounts',
    query: {
      fields: 'id,name,access_token,picture{url}',
    },
  });

  return response.data || [];
}

async function fetchMessengerPage(accessToken: string, pageId: string) {
  return metaRequestDetailed<{
    id?: string;
    name?: string;
    picture?: unknown;
  }>({
    accessToken,
    path: pageId,
    query: {
      fields: 'id,name,picture{url}',
    },
  });
}

async function subscribeMessengerPageToWebhook(accessToken: string, pageId: string) {
  return metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: `${pageId}/subscribed_apps`,
    method: 'POST',
    query: {
      subscribed_fields: DEFAULT_MESSENGER_WEBHOOK_FIELDS.join(','),
    },
  });
}

async function fetchInstagramAccountProfile(
  userAccessToken: string,
  pageAccessToken: string,
  instagramAccountId: string,
) {
  const query = {
    fields: 'id,username,name,profile_picture_url',
  };

  try {
    return await metaRequest<{
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>({
      accessToken: userAccessToken,
      path: instagramAccountId,
      query,
    });
  } catch {
    return metaRequest<{
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>({
      accessToken: pageAccessToken,
      path: instagramAccountId,
      query,
    });
  }
}

async function listTemplates(accessToken: string, wabaId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${wabaId}/message_templates`,
    query: {
      limit: 100,
    },
  });

  return response.data || [];
}

async function createRemoteTemplate(
  accessToken: string,
  wabaId: string,
  input: {
    name: string;
    category: string;
    language: string;
    components: Array<Record<string, unknown>>;
  },
) {
  return metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/message_templates`,
    method: 'POST',
    body: input,
  });
}

async function deleteRemoteTemplate(accessToken: string, wabaId: string, templateName: string) {
  return metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/message_templates`,
    method: 'DELETE',
    query: {
      name: templateName,
    },
  });
}

interface RemoteWhatsAppMessageResponse {
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
  messaging_product?: string;
}

function normalizeOutgoingWhatsAppRecipient(value: unknown) {
  return normalizePhoneLike(value) || normalizeOptionalString(value);
}

function normalizeOutgoingMessageContext(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const messageId = normalizeOptionalString(value.message_id);
  return messageId ? { message_id: messageId } : undefined;
}

function normalizeOutgoingMediaObject(
  value: unknown,
  options?: { allowCaption?: boolean; allowFilename?: boolean; label?: string },
) {
  if (!isRecord(value)) {
    throw new Error(`${options?.label || 'Media'} payload is required.`);
  }

  const id = normalizeOptionalIdentifier(value.id);
  const link = normalizeOptionalString(value.link);

  if (!id && !link) {
    throw new Error(`${options?.label || 'Media'} must include either id or link.`);
  }

  const normalized: Record<string, unknown> = {};

  if (id) {
    normalized.id = id;
  }

  if (link) {
    normalized.link = link;
  }

  if (options?.allowCaption) {
    const caption = normalizeOptionalString(value.caption);

    if (caption) {
      normalized.caption = caption;
    }
  }

  if (options?.allowFilename) {
    const filename = normalizeOptionalString(value.filename);

    if (filename) {
      normalized.filename = filename;
    }
  }

  return normalized;
}

function normalizeOutgoingInteractiveHeader(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = normalizeOptionalString(value.type);

  if (!type) {
    throw new Error('Interactive header type is required.');
  }

  if (type === 'text') {
    const text = normalizeOptionalString(value.text);

    if (!text) {
      throw new Error('Interactive header text is required.');
    }

    const normalizedHeader: Record<string, unknown> = {
      type,
      text,
    };
    const subText = normalizeOptionalString(value.sub_text);

    if (subText) {
      normalizedHeader.sub_text = subText;
    }

    return normalizedHeader;
  }

  if (type === 'image' || type === 'video' || type === 'document') {
    const normalizedHeader: Record<string, unknown> = {
      type,
      [type]: normalizeOutgoingMediaObject(value[type], {
        allowFilename: type === 'document',
        label: `Interactive ${type}`,
      }),
    };
    const subText = normalizeOptionalString(value.sub_text);

    if (subText) {
      normalizedHeader.sub_text = subText;
    }

    return normalizedHeader;
  }

  throw new Error(`Unsupported interactive header type: ${type}.`);
}

function normalizeOutgoingInteractiveObject(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Interactive payload is required.');
  }

  const type = normalizeOptionalString(value.type);

  if (!type) {
    throw new Error('Interactive type is required.');
  }

  if (!isRecord(value.action)) {
    throw new Error('Interactive action is required.');
  }

  const normalizedInteractive: Record<string, unknown> = {
    type,
    action: value.action,
  };

  const header = normalizeOutgoingInteractiveHeader(value.header);

  if (header) {
    normalizedInteractive.header = header;
  }

  if (isRecord(value.body)) {
    const text = normalizeOptionalString(value.body.text);

    if (text) {
      normalizedInteractive.body = {
        text,
      };
    }
  }

  if (isRecord(value.footer)) {
    const text = normalizeOptionalString(value.footer.text);

    if (text) {
      normalizedInteractive.footer = {
        text,
      };
    }
  }

  return normalizedInteractive;
}

function normalizeOutgoingContacts(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('At least one contact is required.');
  }

  const contacts = value.filter(isRecord);

  if (contacts.length === 0) {
    throw new Error('At least one contact is required.');
  }

  return contacts;
}

function normalizeOutgoingLocation(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Location payload is required.');
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location latitude and longitude are required.');
  }

  const normalizedLocation: Record<string, unknown> = {
    latitude,
    longitude,
  };
  const name = normalizeOptionalString(value.name);
  const address = normalizeOptionalString(value.address);

  if (name) {
    normalizedLocation.name = name;
  }

  if (address) {
    normalizedLocation.address = address;
  }

  return normalizedLocation;
}

function normalizeOutgoingWhatsAppMessagePayload(payload: WhatsAppMessagePayload) {
  if (!isRecord(payload)) {
    throw new Error('A WhatsApp message payload is required.');
  }

  const to = normalizeOutgoingWhatsAppRecipient(payload.to);

  if (!to) {
    throw new Error('A valid recipient is required.');
  }

  const type = payload.type;

  if (!normalizeOptionalString(type)) {
    throw new Error('Message type is required.');
  }

  const normalizedPayload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: payload.recipient_type === 'group' ? 'group' : 'individual',
    to,
    type,
  };
  const context = normalizeOutgoingMessageContext(payload.context);

  if (context) {
    normalizedPayload.context = context;
  }

  switch (type) {
    case 'text': {
      if (!isRecord(payload.text)) {
        throw new Error('Text payload is required.');
      }

      const body = normalizeOptionalString(payload.text.body);

      if (!body) {
        throw new Error('Text body is required.');
      }

      normalizedPayload.text = {
        body,
        preview_url: payload.text.preview_url === true,
      };
      break;
    }
    case 'image':
      normalizedPayload.image = normalizeOutgoingMediaObject(payload.image, {
        allowCaption: true,
        label: 'Image',
      });
      break;
    case 'video':
      normalizedPayload.video = normalizeOutgoingMediaObject(payload.video, {
        allowCaption: true,
        label: 'Video',
      });
      break;
    case 'audio':
      normalizedPayload.audio = normalizeOutgoingMediaObject(payload.audio, {
        label: 'Audio',
      });
      break;
    case 'document':
      normalizedPayload.document = normalizeOutgoingMediaObject(payload.document, {
        allowCaption: true,
        allowFilename: true,
        label: 'Document',
      });
      break;
    case 'sticker':
      normalizedPayload.sticker = normalizeOutgoingMediaObject(payload.sticker, {
        label: 'Sticker',
      });
      break;
    case 'reaction': {
      if (!isRecord(payload.reaction)) {
        throw new Error('Reaction payload is required.');
      }

      const messageId = normalizeOptionalString(payload.reaction.message_id);
      const emoji = normalizeOptionalString(payload.reaction.emoji);

      if (!messageId || !emoji) {
        throw new Error('Reaction message_id and emoji are required.');
      }

      normalizedPayload.reaction = {
        message_id: messageId,
        emoji,
      };
      break;
    }
    case 'location':
      normalizedPayload.location = normalizeOutgoingLocation(payload.location);
      break;
    case 'contacts':
      normalizedPayload.contacts = normalizeOutgoingContacts(payload.contacts);
      break;
    case 'interactive':
      normalizedPayload.interactive = normalizeOutgoingInteractiveObject(payload.interactive);
      break;
    case 'template': {
      if (!isRecord(payload.template)) {
        throw new Error('Template payload is required.');
      }

      const name = normalizeOptionalString(payload.template.name);
      const languageCode = isRecord(payload.template.language)
        ? normalizeOptionalString(payload.template.language.code)
        : null;

      if (!name || !languageCode) {
        throw new Error('Template name and language code are required.');
      }

      const normalizedTemplate: Record<string, unknown> = {
        name,
        language: {
          code: languageCode,
        },
      };

      if (Array.isArray(payload.template.components)) {
        const components = payload.template.components.filter(isRecord);

        if (components.length > 0) {
          normalizedTemplate.components = components;
        }
      }

      normalizedPayload.template = normalizedTemplate;
      break;
    }
    default:
      throw new Error(`Unsupported WhatsApp message type: ${type}.`);
  }

  return normalizedPayload;
}

async function sendRemoteWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  payload: WhatsAppMessagePayload,
) {
  return metaRequest<RemoteWhatsAppMessageResponse>({
    accessToken,
    path: `${phoneNumberId}/messages`,
    method: 'POST',
    body: normalizeOutgoingWhatsAppMessagePayload(payload),
  });
}

async function uploadRemoteMedia(
  accessToken: string,
  phoneNumberId: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', new Blob([file.buffer], { type: file.mimeType }), file.fileName);

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    let message = `Media upload failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      throw new Error(message);
    }

    throw new Error(message);
  }

  return (await response.json()) as { id: string };
}

async function fetchRemoteMediaMetadata(accessToken: string, mediaId: string) {
  return metaRequest<{
    url?: string;
    mime_type?: string;
    sha256?: string;
    file_size?: number;
  }>({
    accessToken,
    path: mediaId,
  });
}

function mapProfile(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return {
    userId: String(row.user_id),
    email: (row.email as string | null) || null,
    fullName: (row.full_name as string | null) || null,
    profilePictureUrl: normalizeOptionalString(row.profile_picture_url),
    companyLogoUrl: normalizeOptionalString(row.company_logo_url),
    countryCode: (row.country_code as string | null) || null,
    phone: (row.phone as string | null) || null,
    companyName: (row.company_name as string | null) || null,
    companyWebsite: (row.company_website as string | null) || null,
    industry: (row.industry as string | null) || null,
    selectedPlan: (row.selected_plan as string | null) || null,
    billingCycle: normalizeBillingCycle(row.billing_cycle as string | null),
    billingStatus: normalizeBillingStatus(row.billing_status as string | null),
    trialEndsAt: (row.trial_ends_at as string | null) || null,
    couponCode: (row.coupon_code as string | null) || null,
    razorpaySubscriptionId: (row.razorpay_subscription_id as string | null) || null,
    onboardingCompleted: Boolean(row.onboarding_completed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWorkspaceTeamMember(row: Record<string, unknown>): WorkspaceTeamMember {
  return {
    id: String(row.id),
    workspaceOwnerUserId: String(row.workspace_owner_user_id),
    memberUserId: normalizeOptionalIdentifier(row.member_user_id),
    fullName: normalizeOptionalString(row.full_name),
    email: String(row.invited_email || ''),
    role: normalizeWorkspaceUserRole(row.role),
    status: normalizeWorkspaceUserStatus(row.status),
    invitedAt: String(row.invite_sent_at || row.created_at || new Date().toISOString()),
    acceptedAt: toIsoTimestamp(row.accepted_at as string | number | null | undefined),
    isOwner: false,
  };
}

function mapNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: normalizeNotificationType(row.type),
    title: String(row.title || ''),
    body: String(row.body || ''),
    targetPath: normalizeOptionalString(row.target_path),
    isRead: Boolean(row.is_read),
    readAt: normalizeOptionalString(row.read_at),
    createdAt: String(row.created_at || new Date().toISOString()),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

function mapNotificationPreferences(
  row: Record<string, unknown> | null,
  userId: string,
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences(userId);

  if (!row) {
    return defaults;
  }

  return {
    userId: String(row.user_id || userId),
    enabled: normalizeBooleanPreference(row.enabled, defaults.enabled),
    soundEnabled: normalizeBooleanPreference(row.sound_enabled, defaults.soundEnabled),
    callSoundEnabled: normalizeBooleanPreference(
      row.call_sound_enabled,
      defaults.callSoundEnabled,
    ),
    soundPreset: normalizeNotificationSoundPreset(row.sound_preset),
    volume: normalizeNotificationVolume(row.volume, defaults.volume),
    templateReviewEnabled: normalizeBooleanPreference(
      row.template_review_enabled,
      defaults.templateReviewEnabled,
    ),
    missedCallEnabled: normalizeBooleanPreference(
      row.missed_call_enabled,
      defaults.missedCallEnabled,
    ),
    leadEnabled: normalizeBooleanPreference(row.lead_enabled, defaults.leadEnabled),
    teamJoinedEnabled: normalizeBooleanPreference(
      row.team_joined_enabled,
      defaults.teamJoinedEnabled,
    ),
    createdAt: String(row.created_at || defaults.createdAt),
    updatedAt: String(row.updated_at || defaults.updatedAt),
  };
}

function mapChannel(row: Record<string, unknown> | null): MetaChannelConnection | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    setupType: (row.setup_type as MetaChannelConnection['setupType']) || null,
    connectionMethod: row.connection_method as MetaChannelConnection['connectionMethod'],
    status: (row.status as MetaChannelConnection['status']) || 'connected',
    wabaId: String(row.waba_id),
    phoneNumberId: String(row.phone_number_id),
    displayPhoneNumber: (row.display_phone_number as string | null) || null,
    verifiedName: (row.verified_name as string | null) || null,
    qualityRating: (row.quality_rating as string | null) || null,
    messagingLimitTier: (row.messaging_limit_tier as string | null) || null,
    businessAccountName: (row.business_account_name as string | null) || null,
    accessTokenLast4: (row.access_token_last4 as string | null) || null,
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: (row.last_synced_at as string | null) || null,
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapInstagramChannel(row: Record<string, unknown> | null): InstagramChannelConnection | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    connectionMethod: row.connection_method as InstagramChannelConnection['connectionMethod'],
    status: (row.status as InstagramChannelConnection['status']) || 'connected',
    instagramAccountId: String(row.instagram_account_id),
    instagramUsername: normalizeOptionalString(row.instagram_username),
    instagramName: normalizeOptionalString(row.instagram_name),
    profilePictureUrl: normalizeOptionalString(row.profile_picture_url),
    pageId: String(row.page_id),
    pageName: normalizeOptionalString(row.page_name),
    userAccessTokenLast4: normalizeOptionalString(row.user_access_token_last4),
    pageAccessTokenLast4: normalizeOptionalString(row.page_access_token_last4),
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapMessengerChannel(row: Record<string, unknown> | null): MessengerChannelConnection | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    connectionMethod: row.connection_method as MessengerChannelConnection['connectionMethod'],
    status: (row.status as MessengerChannelConnection['status']) || 'connected',
    pageId: String(row.page_id),
    pageName: normalizeOptionalString(row.page_name),
    pagePictureUrl: normalizeOptionalString(row.page_picture_url),
    pageTasks: normalizeStringArray(row.page_tasks, { uppercase: true }),
    pageAccessTokenLast4: normalizeOptionalString(row.page_access_token_last4),
    webhookFields: normalizeStringArray(row.webhook_fields),
    webhookSubscribed: Boolean(row.webhook_subscribed),
    webhookLastError: normalizeOptionalString(row.webhook_last_error),
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapEmailConnection(row: Record<string, unknown> | null): EmailConnectionSummary | null {
  if (!row) {
    return null;
  }

  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || ''),
    emailAddress: String(row.email_address || ''),
    authUser: String(row.auth_user || ''),
    smtpHost: String(row.smtp_host || ''),
    smtpPort: Number(row.smtp_port || 0),
    smtpSecure: Boolean(row.smtp_secure),
    imapHost: String(row.imap_host || ''),
    imapPort: Number(row.imap_port || 0),
    imapSecure: Boolean(row.imap_secure),
    status: (normalizeOptionalString(row.status) as EmailConnectionStatus | null) || 'connected',
    lastVerifiedAt: normalizeOptionalString(row.last_verified_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapEmailTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name || ''),
    subject: String(row.subject || ''),
    editorMode: normalizeEmailTemplateEditorMode(row.editor_mode),
    htmlContent: String(row.html_content || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapEmailCampaign(row: Record<string, unknown>): EmailCampaign {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    templateId: normalizeOptionalIdentifier(row.email_template_id),
    templateName: normalizeOptionalString(row.template_name),
    campaignName: String(row.campaign_name || ''),
    subject: String(row.subject || ''),
    htmlContent: String(row.html_content || ''),
    audienceSource: row.audience_source === 'custom' ? 'custom' : 'contacts',
    recipientCount: Number(row.recipient_count || 0),
    status:
      row.status === 'partial' || row.status === 'failed'
        ? row.status
        : 'sent',
    sentAt: normalizeOptionalString(row.sent_at),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapTemplate(row: Record<string, unknown>): MetaTemplate {
  return {
    id: String(row.id),
    metaTemplateId: (row.meta_template_id as string | null) || null,
    name: String(row.template_name),
    category: (row.category as string | null) || null,
    language: String(row.language),
    status: (row.status as string | null) || null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function getThreadDisplayPhone(row: Record<string, unknown>) {
  return (
    formatContactIdentity(row.display_phone) ||
    (normalizePhoneLike(row.contact_wa_id) ? formatContactIdentity(row.contact_wa_id) : null) ||
    null
  );
}

function mapThread(row: Record<string, unknown>): ConversationThread {
  return {
    id: String(row.id),
    contactWaId: normalizeContactIdentity(row.contact_wa_id) || String(row.contact_wa_id),
    contactName: (row.contact_name as string | null) || null,
    displayPhone: getThreadDisplayPhone(row),
    email: (row.email as string | null) || null,
    source: (row.source as string | null) || null,
    remark: (row.remark as string | null) || null,
    avatarUrl: (row.avatar_url as string | null) || null,
    status: normalizeStatus(row.status as string | null),
    priority: normalizePriority(row.priority as string | null),
    labels: Array.isArray(row.labels) ? (row.labels as string[]) : [],
    ownerName: (row.owner_name as string | null) || null,
    lastMessageText: (row.last_message_text as string | null) || null,
    lastMessageAt: (row.last_message_at as string | null) || null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): ConversationMessage {
  const direction = row.direction as ConversationMessage['direction'];

  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    waMessageId: (row.wa_message_id as string | null) || null,
    direction,
    messageType: String(row.message_type),
    body: (row.body as string | null) || null,
    senderName: (row.sender_name as string | null) || null,
    senderWaId:
      direction === 'inbound'
        ? formatContactIdentity(row.sender_wa_id) || normalizeOptionalString(row.sender_wa_id)
        : normalizeOptionalString(row.sender_wa_id),
    recipientWaId:
      direction === 'outbound'
        ? formatContactIdentity(row.recipient_wa_id) || normalizeOptionalString(row.recipient_wa_id)
        : normalizeOptionalString(row.recipient_wa_id),
    templateName: (row.template_name as string | null) || null,
    status: (row.status as string | null) || null,
    createdAt: String(row.created_at),
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function mapCall(row: Record<string, unknown>): CallLog {
  return {
    id: String(row.id),
    callId: (row.call_id as string | null) || null,
    name: (row.name as string | null) || null,
    phone: formatContactIdentity(row.phone) || String(row.phone),
    type: row.type as CallLog['type'],
    createdAt: String(row.created_at),
    durationSeconds: Number(row.duration_seconds || 0),
  };
}

function mapCallSession(row: Record<string, unknown>): WhatsAppCallSessionRecord {
  return {
    id: String(row.id),
    callId: String(row.call_id),
    contactWaId: normalizeContactIdentity(row.contact_wa_id),
    contactName: (row.contact_name as string | null) || null,
    displayPhone: getThreadDisplayPhone(row),
    direction: normalizeCallDirection(row.direction),
    state: normalizeCallState(row.state) || 'dialing',
    startedAt: String(row.started_at || row.created_at),
    connectedAt: (row.connected_at as string | null) || null,
    updatedAt: String(row.updated_at || row.created_at),
    endedAt: (row.ended_at as string | null) || null,
    offerSdp: (row.offer_sdp as string | null) || null,
    answerSdp: (row.answer_sdp as string | null) || null,
    bizOpaqueCallbackData: (row.biz_opaque_callback_data as string | null) || null,
    lastEvent: (row.last_event as string | null) || null,
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function mapMetaLeadCaptureConfig(row: Record<string, unknown>, callbackUrl: string): MetaLeadCaptureConfig {
  const status = normalizeOptionalString(row.status);

  return {
    userId: String(row.user_id),
    metaChannelId: normalizeOptionalString(row.meta_channel_id),
    status: status === 'ready' || status === 'error' ? status : 'draft',
    appId: normalizeOptionalString(row.app_id),
    pageIds: Array.isArray(row.page_ids) ? (row.page_ids as string[]).filter(Boolean) : [],
    formIds: Array.isArray(row.form_ids) ? (row.form_ids as string[]).filter(Boolean) : [],
    accessTokenLast4: normalizeOptionalString(row.access_token_last4),
    verifyToken: String(row.verify_token || ''),
    verifiedAt: normalizeOptionalString(row.verified_at),
    callbackUrl,
    defaultOwnerName: normalizeOptionalString(row.default_owner_name),
    defaultLabels: Array.isArray(row.default_labels) ? (row.default_labels as string[]).filter(Boolean) : [],
    autoCreateLeads: Boolean(row.auto_create_leads),
    lastWebhookAt: normalizeOptionalString(row.last_webhook_at),
    lastLeadSyncedAt: normalizeOptionalString(row.last_lead_synced_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMetaLeadCaptureEvent(row: Record<string, unknown>): MetaLeadCaptureEvent {
  const processingStatus = normalizeOptionalString(row.processing_status);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    pageId: normalizeOptionalIdentifier(row.page_id),
    formId: normalizeOptionalIdentifier(row.form_id),
    leadId: normalizeOptionalIdentifier(row.lead_id),
    eventTime: normalizeOptionalString(row.event_time),
    processingStatus:
      processingStatus === 'processed' || processingStatus === 'skipped' || processingStatus === 'error'
        ? processingStatus
        : 'received',
    errorMessage: normalizeOptionalString(row.error_message),
    raw: (row.raw as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
  };
}

function mapWhatsAppPaymentConfigurationEvent(
  row: Record<string, unknown>,
): WhatsAppPaymentConfigurationEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    configurationName: normalizePaymentConfigurationName(row.configuration_name),
    providerName: normalizeOptionalString(row.provider_name),
    providerMid: normalizeOptionalString(row.provider_mid),
    status: normalizeOptionalString(row.status),
    createdTimestamp:
      typeof row.created_timestamp === 'number' ? row.created_timestamp : null,
    updatedTimestamp:
      typeof row.updated_timestamp === 'number' ? row.updated_timestamp : null,
    raw: (row.raw as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
  };
}

function normalizeMetaSubscribedFields(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => normalizeOptionalString(entry)?.toLowerCase())
          .filter((entry): entry is string => Boolean(entry)),
      ),
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(/[,\s]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

async function insertCallLog(args: {
  userId: string;
  callId?: string | null;
  phone: string;
  type: CallLog['type'];
  name?: string | null;
  durationSeconds?: number;
}) {
  const normalizedPhone = normalizePhoneLike(args.phone);

  if (!normalizedPhone) {
    return null;
  }

  const payload = {
    user_id: args.userId,
    call_id: normalizeOptionalString(args.callId) || null,
    name: normalizeOptionalString(args.name) || null,
    phone: normalizedPhone,
    type: args.type,
    duration_seconds: Number(args.durationSeconds || 0),
  };

  const query = adminSupabase.from('call_logs');
  const result = payload.call_id
    ? await query.upsert(payload, { onConflict: 'user_id,call_id' }).select('*').single()
    : await query.insert(payload).select('*').single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  return mapCall(data as Record<string, unknown>);
}

async function upsertCallSession(args: {
  userId: string;
  metaChannelId?: string | null;
  callId: string;
  contactWaId?: string | null;
  contactName?: string | null;
  displayPhone?: string | null;
  direction?: WhatsAppCallDirection;
  state?: WhatsAppCallState;
  startedAt?: string | null;
  connectedAt?: string | null;
  endedAt?: string | null;
  offerSdp?: string | null;
  answerSdp?: string | null;
  bizOpaqueCallbackData?: string | null;
  lastEvent?: string | null;
  raw?: Record<string, unknown>;
}) {
  const payload: Record<string, unknown> = {
    user_id: args.userId,
    meta_channel_id: args.metaChannelId || null,
    call_id: args.callId,
  };

  if (args.contactWaId !== undefined) {
    payload.contact_wa_id = normalizePhoneLike(args.contactWaId) || null;
  }

  if (args.contactName !== undefined) {
    payload.contact_name = normalizeOptionalString(args.contactName) || null;
  }

  if (args.displayPhone !== undefined) {
    payload.display_phone = formatContactIdentity(args.displayPhone) || normalizeOptionalString(args.displayPhone);
  }

  if (args.direction) {
    payload.direction = args.direction;
  }

  if (args.state) {
    payload.state = args.state;
  }

  if (args.startedAt !== undefined) {
    payload.started_at = args.startedAt || null;
  }

  if (args.connectedAt !== undefined) {
    payload.connected_at = args.connectedAt || null;
  }

  if (args.endedAt !== undefined) {
    payload.ended_at = args.endedAt || null;
  }

  if (args.offerSdp !== undefined) {
    payload.offer_sdp = normalizeSdpString(args.offerSdp) || null;
  }

  if (args.answerSdp !== undefined) {
    payload.answer_sdp = normalizeSdpString(args.answerSdp) || null;
  }

  if (args.bizOpaqueCallbackData !== undefined) {
    payload.biz_opaque_callback_data = normalizeOptionalString(args.bizOpaqueCallbackData) || null;
  }

  if (args.lastEvent !== undefined) {
    payload.last_event = normalizeOptionalString(args.lastEvent) || null;
  }

  if (args.raw !== undefined) {
    payload.raw = args.raw;
  }

  const { data, error } = await adminSupabase
    .from('call_sessions')
    .upsert(payload, { onConflict: 'user_id,call_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapCallSession(data as Record<string, unknown>);
}

async function syncCallLogFromSession(userId: string, session: WhatsAppCallSessionRecord) {
  const phone = session.displayPhone || session.contactWaId;

  if (!phone) {
    return null;
  }

  const connectedAtMs = session.connectedAt ? Date.parse(session.connectedAt) : Number.NaN;
  const startedAtMs = Number.isFinite(connectedAtMs) ? connectedAtMs : Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;
  const durationSeconds =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
      ? Math.round((endedAtMs - startedAtMs) / 1000)
      : 0;

  return insertCallLog({
    userId,
    callId: session.callId,
    phone,
    type: getCallLogTypeFromSession(session),
    name: session.contactName,
    durationSeconds,
  });
}

async function upsertCallSummaryMessage(args: {
  userId: string;
  metaChannelId: string | null;
  session: WhatsAppCallSessionRecord;
}) {
  const session = args.session;
  const contactWaId = session.contactWaId || session.displayPhone;

  if (!contactWaId || !isTerminalCallState(session.state)) {
    return null;
  }

  const summaryLabel = formatCallStateLabel(session.state);
  const previewText = `${session.direction === 'incoming' ? 'Incoming' : 'Outgoing'} WhatsApp call • ${summaryLabel}`;
  const createdAt = session.endedAt || session.updatedAt || new Date().toISOString();
  const connectedAtMs = session.connectedAt ? Date.parse(session.connectedAt) : Number.NaN;
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;
  const durationSeconds =
    Number.isFinite(connectedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= connectedAtMs
      ? Math.round((endedAtMs - connectedAtMs) / 1000)
      : 0;

  const thread = await upsertThread({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    contactWaId,
    contactName: session.contactName,
    displayPhone: session.displayPhone || contactWaId,
    lastMessageText: previewText,
    lastMessageAt: createdAt,
    unreadDelta: session.direction === 'incoming' ? 1 : 0,
  });

  return insertMessage({
    userId: args.userId,
    threadId: thread.id,
    waMessageId: `call-summary:${session.callId}`,
    direction: session.direction === 'incoming' ? 'inbound' : 'outbound',
    messageType: 'call_summary',
    body: previewText,
    senderName: session.direction === 'incoming' ? session.contactName : null,
    senderWaId: session.direction === 'incoming' ? contactWaId : null,
    recipientWaId: session.direction === 'outgoing' ? contactWaId : null,
    status: 'delivered',
    raw: {
      call_summary: {
        call_id: session.callId,
        direction: session.direction,
        state: session.state,
        started_at: session.startedAt,
        connected_at: session.connectedAt,
        ended_at: session.endedAt,
        duration_seconds: durationSeconds,
        contact_name: session.contactName,
        phone: session.displayPhone || contactWaId,
        last_event: session.lastEvent,
      },
    },
  });
}

async function maybeCreateMissedCallNotification(session: WhatsAppCallSessionRecord, userId: string) {
  if (session.state !== 'missed') {
    return;
  }

  const callerLabel =
    session.contactName || session.displayPhone || session.contactWaId || 'a WhatsApp caller';

  await createUserNotification({
    userId,
    type: 'missed_call',
    title: 'Missed WhatsApp call',
    body: `You missed a call from ${callerLabel}.`,
    targetPath: '/dashboard/calls',
    metadata: {
      callId: session.callId,
      contactWaId: session.contactWaId,
      contactName: session.contactName,
      phone: session.displayPhone || session.contactWaId,
      state: session.state,
    },
    dedupeKey: `missed-call:${session.callId}`,
  });
}

function buildCallSessionFromManageAction(args: {
  callId: string;
  input: WhatsAppCallManageInput;
  startedAt?: string;
}): Pick<
  WhatsAppCallSessionRecord,
  | 'callId'
  | 'contactWaId'
  | 'displayPhone'
  | 'direction'
  | 'state'
  | 'startedAt'
  | 'connectedAt'
  | 'endedAt'
  | 'offerSdp'
  | 'answerSdp'
  | 'bizOpaqueCallbackData'
  | 'lastEvent'
> {
  const startedAt = args.startedAt || new Date().toISOString();
  const normalizedTo = normalizePhoneLike(args.input.to);

  switch (args.input.action) {
    case 'connect':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'dialing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: normalizeSdpString(args.input.session?.sdp) || null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'connect_request',
      };
    case 'accept':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'connecting',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: normalizeSdpString(args.input.session?.sdp) || null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'accept_request',
      };
    case 'pre_accept':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'ringing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'pre_accept_request',
      };
    case 'reject':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'rejected',
        startedAt,
        connectedAt: null,
        endedAt: new Date().toISOString(),
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'reject_request',
      };
    case 'terminate':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'ended',
        startedAt,
        connectedAt: null,
        endedAt: new Date().toISOString(),
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'terminate_request',
      };
    default:
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'dialing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: `${args.input.action}_request`,
      };
  }
}

async function handleCallWebhookEntry(args: {
  userId: string;
  metaChannelId: string;
  callRecord: Record<string, unknown>;
  fallbackContactName?: string | null;
}) {
  const callId =
    normalizeOptionalString(args.callRecord.id) ||
    normalizeOptionalString(args.callRecord.call_id) ||
    null;

  if (!callId) {
    return null;
  }

  const direction = normalizeCallDirection(
    args.callRecord.direction || args.callRecord.call_direction || args.callRecord.initiated_by,
  );
  const session = isRecord(args.callRecord.session) ? args.callRecord.session : null;
  const sessionSdpType = normalizeOptionalString(session?.sdp_type);
  const sessionSdp = normalizeSdpString(session?.sdp) || null;
  const eventName =
    normalizeOptionalString(args.callRecord.event) ||
    normalizeOptionalString(args.callRecord.status) ||
    normalizeOptionalString(args.callRecord.call_status);
  const statusName = normalizeOptionalString(args.callRecord.status);
  const startedAt = toIsoTimestamp(
    (args.callRecord.timestamp as string | number | null | undefined) ||
      (args.callRecord.created_at as string | number | null | undefined) ||
      (args.callRecord.updated_at as string | number | null | undefined),
  );
  const contactWaId =
    direction === 'incoming'
      ? extractPhoneLike(args.callRecord.from) ||
        extractPhoneLike(args.callRecord.caller) ||
        extractPhoneLike(args.callRecord.user)
      : extractPhoneLike(args.callRecord.to) ||
        extractPhoneLike(args.callRecord.callee) ||
        extractPhoneLike(args.callRecord.user);
  const nextState = inferCallStateFromWebhook({
    eventName,
    statusName,
    direction,
    hasOffer: sessionSdpType === 'offer',
    hasAnswer: sessionSdpType === 'answer',
  });
  const endedAt = isTerminalCallState(nextState) ? new Date().toISOString() : undefined;
  const connectedAt = nextState === 'ongoing' ? new Date().toISOString() : undefined;

  const sessionRecord = await upsertCallSession({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    callId,
    contactWaId: contactWaId || undefined,
    contactName:
      normalizeOptionalString(args.callRecord.contact_name) ||
      normalizeOptionalString(args.callRecord.contactName) ||
      args.fallbackContactName ||
      undefined,
    displayPhone: contactWaId || undefined,
    direction,
    state: nextState,
    startedAt: startedAt || undefined,
    connectedAt,
    endedAt,
    offerSdp: sessionSdpType === 'offer' ? sessionSdp : undefined,
    answerSdp: sessionSdpType === 'answer' ? sessionSdp : undefined,
    bizOpaqueCallbackData:
      normalizeOptionalString(args.callRecord.biz_opaque_callback_data) ||
      normalizeOptionalString(args.callRecord.bizOpaqueCallbackData) ||
      undefined,
    lastEvent: eventName || statusName || undefined,
    raw: args.callRecord,
  });

  await syncCallLogFromSession(args.userId, sessionRecord);

  if (isTerminalCallState(sessionRecord.state)) {
    await maybeCreateMissedCallNotification(sessionRecord, args.userId);
    await upsertCallSummaryMessage({
      userId: args.userId,
      metaChannelId: args.metaChannelId,
      session: sessionRecord,
    });
  }

  return sessionRecord;
}

async function handleCallWebhookStatus(args: {
  userId: string;
  metaChannelId: string;
  statusRecord: Record<string, unknown>;
}) {
  const explicitType = normalizeOptionalString(args.statusRecord.type);

  if (explicitType && explicitType !== 'call') {
    return null;
  }

  const callId =
    normalizeOptionalString(args.statusRecord.call_id) ||
    (explicitType === 'call' ? normalizeOptionalString(args.statusRecord.id) : null);

  if (!callId) {
    return null;
  }

  const nextState = normalizeCallState(
    args.statusRecord.status || args.statusRecord.event || args.statusRecord.call_status,
    'connecting',
  );
  const contactWaId =
    extractPhoneLike(args.statusRecord.from) ||
    extractPhoneLike(args.statusRecord.to) ||
    extractPhoneLike(args.statusRecord.user);
  const direction = normalizeCallDirection(
    args.statusRecord.direction || args.statusRecord.call_direction || args.statusRecord.initiated_by,
  );
  const connectedAt = nextState === 'ongoing' ? new Date().toISOString() : undefined;
  const sessionRecord = await upsertCallSession({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    callId,
    contactWaId: contactWaId || undefined,
    displayPhone: contactWaId || undefined,
    direction,
    state: nextState || 'connecting',
    connectedAt,
    endedAt: isTerminalCallState(nextState || 'connecting') ? new Date().toISOString() : undefined,
    lastEvent:
      normalizeOptionalString(args.statusRecord.event) ||
      normalizeOptionalString(args.statusRecord.status) ||
      undefined,
    raw: args.statusRecord,
  });

  await syncCallLogFromSession(args.userId, sessionRecord);

  if (isTerminalCallState(sessionRecord.state)) {
    await maybeCreateMissedCallNotification(sessionRecord, args.userId);
    await upsertCallSummaryMessage({
      userId: args.userId,
      metaChannelId: args.metaChannelId,
      session: sessionRecord,
    });
  }

  return sessionRecord;
}

function mapBusinessProfile(
  raw: Record<string, unknown>,
  channelRow: Record<string, unknown>,
  phoneSnapshot?: {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
    messaging_limit_tier?: string;
    name_status?: string;
  },
): WhatsAppBusinessProfile {
  return {
    about: normalizeOptionalString(raw.about),
    address: normalizeOptionalString(raw.address),
    description: normalizeOptionalString(raw.description),
    displayNameStatus: normalizeOptionalString(phoneSnapshot?.name_status),
    email: normalizeOptionalString(raw.email),
    profilePictureUrl: normalizeOptionalString(raw.profile_picture_url),
    websites: Array.isArray(raw.websites)
      ? (raw.websites as unknown[])
          .map((website) => (typeof website === 'string' ? website : ''))
          .filter(Boolean)
      : [],
    vertical: normalizeOptionalString(raw.vertical),
    displayPhoneNumber:
      normalizeOptionalString(phoneSnapshot?.display_phone_number) ||
      normalizeOptionalString(channelRow.display_phone_number),
    verifiedName:
      normalizeOptionalString(phoneSnapshot?.verified_name) ||
      normalizeOptionalString(channelRow.verified_name),
    qualityRating:
      normalizeOptionalString(phoneSnapshot?.quality_rating) ||
      normalizeOptionalString(channelRow.quality_rating),
    messagingLimitTier: getNormalizedMessagingLimitTier(phoneSnapshot) || normalizeOptionalString(channelRow.messaging_limit_tier),
    businessAccountName: normalizeOptionalString(channelRow.business_account_name),
    phoneNumberId: String(channelRow.phone_number_id),
    wabaId: String(channelRow.waba_id),
  };
}

function mapCommerceSettings(
  raw: Record<string, unknown>,
  channelRow: Record<string, unknown>,
): WhatsAppCommerceSettings {
  return {
    id: normalizeOptionalIdentifier(raw.id),
    phoneNumberId: String(channelRow.phone_number_id),
    isCartEnabled: typeof raw.is_cart_enabled === 'boolean' ? raw.is_cart_enabled : false,
    isCatalogVisible: typeof raw.is_catalog_visible === 'boolean' ? raw.is_catalog_visible : false,
  };
}

function getDefaultConversationalAutomationConfig(args: {
  userId: string;
  channelRow?: Record<string, unknown> | null;
}): WhatsAppConversationalAutomationConfig {
  const now = new Date().toISOString();

  return {
    userId: args.userId,
    metaChannelId: args.channelRow ? String(args.channelRow.id) : null,
    phoneNumberId: args.channelRow ? String(args.channelRow.phone_number_id) : null,
    enableWelcomeMessage: false,
    prompts: [],
    commands: [],
    lastSyncedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mapConversationalAutomationConfig(
  row: Record<string, unknown> | null,
  args: {
    userId: string;
    channelRow?: Record<string, unknown> | null;
  },
): WhatsAppConversationalAutomationConfig {
  const defaults = getDefaultConversationalAutomationConfig(args);

  if (!row) {
    return defaults;
  }

  return {
    userId: String(row.user_id || defaults.userId),
    metaChannelId: args.channelRow ? String(args.channelRow.id) : normalizeOptionalString(row.meta_channel_id),
    phoneNumberId: args.channelRow
      ? String(args.channelRow.phone_number_id)
      : normalizeOptionalString(row.phone_number_id),
    enableWelcomeMessage: Boolean(row.enable_welcome_message),
    prompts: Array.isArray(row.prompts)
      ? row.prompts
          .map((prompt) => normalizeConversationalAutomationPrompt(prompt))
          .filter((prompt): prompt is string => Boolean(prompt))
      : [],
    commands: normalizeConversationalAutomationCommands(row.commands),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at || defaults.createdAt),
    updatedAt: String(row.updated_at || defaults.updatedAt),
  };
}

async function getBootstrap(user: User): Promise<DashboardBootstrap> {
  const [
    profileResult,
    channelResult,
    instagramChannelResult,
    messengerChannelResult,
    templatesResult,
    threadsResult,
    notificationsResult,
    notificationPreferencesResult,
    creditsResult,
    callHistoryResult,
    callSessionsResult,
  ] =
    await Promise.all([
      adminSupabase.from('app_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('meta_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('instagram_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('messenger_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('meta_templates').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      adminSupabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false }),
      adminSupabase.from('user_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      adminSupabase.from('user_notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('credit_ledger').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      adminSupabase.from('call_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      adminSupabase.from('call_sessions').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (channelResult.error) throw channelResult.error;
  if (instagramChannelResult.error && !isMissingSchemaError(instagramChannelResult.error)) {
    throw instagramChannelResult.error;
  }
  if (messengerChannelResult.error && !isMissingSchemaError(messengerChannelResult.error)) {
    throw messengerChannelResult.error;
  }
  if (templatesResult.error) throw templatesResult.error;
  if (threadsResult.error) throw threadsResult.error;
  if (notificationsResult.error && !isMissingSchemaError(notificationsResult.error)) {
    throw notificationsResult.error;
  }
  if (notificationPreferencesResult.error && !isMissingSchemaError(notificationPreferencesResult.error)) {
    throw notificationPreferencesResult.error;
  }
  if (creditsResult.error) throw creditsResult.error;
  if (callHistoryResult.error) throw callHistoryResult.error;
  if (callSessionsResult.error) throw callSessionsResult.error;

  const ledger = (creditsResult.data || []).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    description: String(row.description),
    type: row.type as 'addition' | 'deduction',
    amount: Number(row.amount || 0),
    currency: String(row.currency || 'USD'),
  }));

  const balance = ledger.reduce((current, item) => {
    return item.type === 'addition' ? current + item.amount : current - item.amount;
  }, 0);

  const mappedProfile = mapProfile(profileResult.data as Record<string, unknown> | null);
  let threadRows = ((threadsResult.data || []) as Record<string, unknown>[]) || [];

  if (threadRows.length > 0) {
    const changed = await ensureConversationThreadPhoneConsistency(user.id, threadRows);

    if (changed) {
      const refreshedThreadsResult = await adminSupabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (refreshedThreadsResult.error) {
        throw refreshedThreadsResult.error;
      }

      threadRows = (refreshedThreadsResult.data || []) as Record<string, unknown>[];
    }
  }

  return {
    profile: mappedProfile
      ? {
          ...mappedProfile,
          email: user.email || mappedProfile.email,
        }
      : null,
    channel: mapChannel(channelResult.data as Record<string, unknown> | null),
    instagramChannel: mapInstagramChannel(
      instagramChannelResult.data as Record<string, unknown> | null,
    ),
    messengerChannel: mapMessengerChannel(
      messengerChannelResult.data as Record<string, unknown> | null,
    ),
    templates: (templatesResult.data || []).map((row) => mapTemplate(row as Record<string, unknown>)),
    conversations: threadRows.map((row) => mapThread(row)),
    notifications: (notificationsResult.data || []).map((row) =>
      mapNotification(row as Record<string, unknown>),
    ),
    notificationPreferences: mapNotificationPreferences(
      notificationPreferencesResult.data as Record<string, unknown> | null,
      user.id,
    ),
    credits: {
      balance,
      currency: ledger[0]?.currency || 'USD',
      ledger,
    },
    callHistory: (callHistoryResult.data || []).map((row) => mapCall(row as Record<string, unknown>)),
    callSessions: (callSessionsResult.data || []).map((row) => mapCallSession(row as Record<string, unknown>)),
  };
}

async function getNotificationPreferencesForUser(userId: string) {
  const { data, error } = await adminSupabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return mapNotificationPreferences((data as Record<string, unknown> | null) || null, userId);
}

async function saveNotificationPreferences(
  userId: string,
  input: NotificationPreferencesUpdateInput,
) {
  const current = await getNotificationPreferencesForUser(userId);
  const payload = {
    user_id: userId,
    enabled: input.enabled ?? current.enabled,
    sound_enabled: input.soundEnabled ?? current.soundEnabled,
    call_sound_enabled: input.callSoundEnabled ?? current.callSoundEnabled,
    sound_preset: normalizeNotificationSoundPreset(input.soundPreset ?? current.soundPreset),
    volume: normalizeNotificationVolume(input.volume ?? current.volume, current.volume),
    template_review_enabled: input.templateReviewEnabled ?? current.templateReviewEnabled,
    missed_call_enabled: input.missedCallEnabled ?? current.missedCallEnabled,
    lead_enabled: input.leadEnabled ?? current.leadEnabled,
    team_joined_enabled: input.teamJoinedEnabled ?? current.teamJoinedEnabled,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('user_notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapNotificationPreferences(data as Record<string, unknown>, userId);
}

async function createUserNotification(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetPath?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}) {
  const preferences = await getNotificationPreferencesForUser(args.userId);

  if (!shouldCreateNotification(preferences, args.type)) {
    return null;
  }

  const dedupeKey = normalizeOptionalString(args.dedupeKey);

  if (dedupeKey) {
    const existing = await adminSupabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', args.userId)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existing.error && !isMissingSchemaError(existing.error)) {
      throw existing.error;
    }

    if (existing.data) {
      return mapNotification(existing.data as Record<string, unknown>);
    }
  }

  const { data, error } = await adminSupabase
    .from('user_notifications')
    .insert({
      user_id: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      target_path: normalizeOptionalString(args.targetPath) || null,
      metadata: args.metadata || {},
      dedupe_key: dedupeKey,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapNotification(data as Record<string, unknown>);
}

async function markNotificationsRead(userId: string, options: { notificationId?: string | null; markAll?: boolean }) {
  let query = adminSupabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (!options.markAll) {
    const notificationId = normalizeOptionalString(options.notificationId);

    if (!notificationId) {
      throw new Error('notificationId is required unless markAll is true.');
    }

    query = query.eq('id', notificationId);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function getInboxInsights(
  userId: string,
  query: Record<string, unknown>,
): Promise<InboxInsightsResponse> {
  const channel = normalizeInsightsChannel(query.channel);
  const { startDate, endDate, startAtIso, endExclusiveIso } = resolveInsightsDateRange(
    query.startDate,
    query.endDate,
  );
  const isChannelSupported = channel === 'all' || channel === 'whatsapp';
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  let rows: InsightsMessageRow[] = [];

  if (isChannelSupported) {
    const messagesResult = await adminSupabase
      .from('conversation_messages')
      .select('thread_id,direction,status,recipient_wa_id,created_at')
      .eq('user_id', userId)
      .gte('created_at', startAtIso)
      .lt('created_at', endExclusiveIso)
      .order('thread_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (messagesResult.error) {
      throw messagesResult.error;
    }

    rows = (messagesResult.data || []) as InsightsMessageRow[];
  }

  const outboundRows = rows.filter((row) => row.direction === 'outbound');
  const inboundRows = rows.filter((row) => row.direction === 'inbound');
  const deliveredCount = outboundRows.filter((row) => row.status === 'delivered' || row.status === 'read').length;
  const readCount = outboundRows.filter((row) => row.status === 'read').length;
  const failedCount = outboundRows.filter((row) => row.status === 'failed').length;
  const repliedCount = countRepliedOutboundMessages(rows);
  const uniqueOutboundRecipients = new Set(
    outboundRows
      .map((row) => normalizePhoneLike(row.recipient_wa_id) || (row.thread_id ? `thread:${row.thread_id}` : null))
      .filter(Boolean),
  ).size;
  const channelRow = channelResult.data as Record<string, unknown> | null;
  let messagingLimitTier = normalizeOptionalString(channelRow?.messaging_limit_tier);
  let messagingQuality = normalizeOptionalString(channelRow?.quality_rating);

  if (channelRow?.phone_number_id) {
    try {
      const { row, accessToken } = await getChannelWithToken(userId);
      const phoneSnapshot = await fetchPhoneNumber(accessToken, String(row.phone_number_id));
      const nextMessagingLimitTier = getNormalizedMessagingLimitTier(phoneSnapshot) || messagingLimitTier;
      const nextMessagingQuality = normalizeOptionalString(phoneSnapshot.quality_rating) || messagingQuality;

      messagingLimitTier = nextMessagingLimitTier;
      messagingQuality = nextMessagingQuality;

      if (
        nextMessagingLimitTier !== normalizeOptionalString(channelRow.messaging_limit_tier) ||
        nextMessagingQuality !== normalizeOptionalString(channelRow.quality_rating)
      ) {
        await adminSupabase
          .from('meta_channels')
          .update({
            messaging_limit_tier: nextMessagingLimitTier,
            quality_rating: nextMessagingQuality,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('id', row.id);
      }
    } catch {
      // Keep insights available even when the live Meta fetch fails temporarily.
    }
  }

  return {
    filters: {
      startDate,
      endDate,
      channel,
    },
    isChannelSupported,
    lastUpdatedAt: new Date().toISOString(),
    messagingLimit: {
      consumed: uniqueOutboundRecipients,
      total: getMessagingLimitCapacity(messagingLimitTier),
      tier: messagingLimitTier,
    },
    messagingQuality,
    totals: {
      sent: outboundRows.length,
      delivered: deliveredCount,
      received: inboundRows.length,
    },
    outcomes: {
      read: readCount,
      replied: repliedCount,
      failed: failedCount,
    },
  };
}

function resolveMetaLeadCaptureStatus(args: {
  pageIds: string[];
  hasAccessToken: boolean;
  lastError?: string | null;
}): MetaLeadCaptureConfig['status'] {
  if (args.lastError) {
    return 'error';
  }

  return args.pageIds.length > 0 && args.hasAccessToken ? 'ready' : 'draft';
}

async function ensureMetaLeadCaptureConfig(userId: string, metaChannelId: string | null) {
  const existingResult = await adminSupabase
    .from('meta_lead_capture_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (existingResult.data) {
    if (!existingResult.data.meta_channel_id && metaChannelId) {
      const { data, error } = await adminSupabase
        .from('meta_lead_capture_configs')
        .update({
          meta_channel_id: metaChannelId,
        })
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data as Record<string, unknown>;
    }

    return existingResult.data as Record<string, unknown>;
  }

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .insert({
      user_id: userId,
      meta_channel_id: metaChannelId,
      verify_token: generateVerifyToken(),
      default_labels: ['meta lead'],
      auto_create_leads: true,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function getMetaLeadCaptureSetup(
  userId: string,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const configRow = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  return buildMetaLeadCaptureSetupResponse(userId, req, configRow);
}

async function fetchMetaLeadCapturePageSubscription(
  accessToken: string,
  pageId: string,
  appId: string | null,
): Promise<MetaLeadCapturePageSubscription> {
  try {
    const response = await metaRequest<{
      data?: Array<Record<string, unknown>>;
    }>({
      accessToken,
      path: `${pageId}/subscribed_apps`,
      query: {
        fields: 'id,name,subscribed_fields',
      },
    });

    const apps = Array.isArray(response.data)
      ? response.data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];
    const normalizedAppId = normalizeOptionalIdentifier(appId);
    const exactApp =
      (normalizedAppId
        ? apps.find((entry) => normalizeOptionalIdentifier(entry.id) === normalizedAppId) || null
        : null);
    const leadgenApp =
      apps.find((entry) => normalizeMetaSubscribedFields(entry.subscribed_fields).includes('leadgen')) || null;
    const matchedApp = exactApp || leadgenApp;
    const matchedFields = matchedApp ? normalizeMetaSubscribedFields(matchedApp.subscribed_fields) : [];
    const subscribed = Boolean(leadgenApp);
    const mismatchMessage =
      normalizedAppId &&
      leadgenApp &&
      normalizeOptionalIdentifier(leadgenApp.id) !== normalizedAppId
        ? `Leadgen is active on this Page, but the subscribed app ID (${normalizeOptionalIdentifier(leadgenApp.id) || 'unknown'}) does not match the saved Meta App ID (${normalizedAppId}).`
        : null;

    return {
      pageId,
      appId: matchedApp ? normalizeOptionalIdentifier(matchedApp.id) : normalizedAppId,
      appName: matchedApp ? normalizeOptionalString(matchedApp.name) : null,
      subscribed,
      subscribedFields: matchedFields,
      errorMessage: mismatchMessage,
    };
  } catch (error) {
    return {
      pageId,
      appId: normalizeOptionalIdentifier(appId),
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage: mapDbError(error),
    };
  }
}

async function getMetaLeadCapturePageSubscriptions(configRow: Record<string, unknown>) {
  const pageIds = normalizeStringArray(configRow.page_ids);

  if (!pageIds.length) {
    return [] satisfies MetaLeadCapturePageSubscription[];
  }

  const encryptedAccessToken = normalizeOptionalString(configRow.access_token_ciphertext);
  const appId = normalizeOptionalIdentifier(configRow.app_id);

  if (!encryptedAccessToken) {
    return pageIds.map((pageId) => ({
      pageId,
      appId,
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage: 'Save a Page access token to check Page subscriptions.',
    }));
  }

  let accessToken = '';

  try {
    accessToken = decryptAccessToken(encryptedAccessToken);
  } catch (error) {
    const errorMessage = mapDbError(error);
    return pageIds.map((pageId) => ({
      pageId,
      appId,
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage,
    }));
  }

  return Promise.all(
    pageIds.map((pageId) => fetchMetaLeadCapturePageSubscription(accessToken, pageId, appId)),
  );
}

async function buildMetaLeadCaptureSetupResponse(
  userId: string,
  req: Request,
  configRow: Record<string, unknown>,
): Promise<MetaLeadCaptureSetupResponse> {
  const [eventsResult, pageSubscriptions] = await Promise.all([
    adminSupabase
      .from('meta_lead_capture_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12),
    getMetaLeadCapturePageSubscriptions(configRow),
  ]);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  const callbackUrl = getMetaLeadCaptureCallbackUrl(req);

  return {
    config: mapMetaLeadCaptureConfig(configRow, callbackUrl),
    recentEvents: (eventsResult.data || []).map((row) =>
      mapMetaLeadCaptureEvent(row as Record<string, unknown>),
    ),
    pageSubscriptions,
  };
}

async function insertWhatsAppPaymentConfigurationEvent(args: {
  userId: string;
  metaChannelId: string | null;
  value: Record<string, unknown>;
}) {
  const { error } = await adminSupabase
    .from('whatsapp_payment_configuration_events')
    .insert({
      user_id: args.userId,
      meta_channel_id: args.metaChannelId,
      configuration_name: normalizePaymentConfigurationName(args.value.configuration_name),
      provider_name: normalizeOptionalString(args.value.provider_name),
      provider_mid: normalizeOptionalString(args.value.provider_mid),
      status: normalizeOptionalString(args.value.status),
      created_timestamp:
        typeof args.value.created_timestamp === 'number'
          ? args.value.created_timestamp
          : null,
      updated_timestamp:
        typeof args.value.updated_timestamp === 'number'
          ? args.value.updated_timestamp
          : null,
      raw: args.value,
    });

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }
}

async function buildWhatsAppPaymentsSetupResponse(
  userId: string,
): Promise<WhatsAppPaymentsSetupResponse> {
  const [channelResult, eventsResult] = await Promise.all([
    adminSupabase.from('meta_channels').select('*').eq('user_id', userId).maybeSingle(),
    adminSupabase
      .from('whatsapp_payment_configuration_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  if (channelResult.error) {
    throw channelResult.error;
  }

  if (eventsResult.error && !isMissingSchemaError(eventsResult.error)) {
    throw eventsResult.error;
  }

  if (!channelResult.data) {
    return {
      hasChannel: false,
      wabaId: null,
      configurations: [],
      recentEvents: (eventsResult.data || []).map((row) =>
        mapWhatsAppPaymentConfigurationEvent(row as Record<string, unknown>),
      ),
    };
  }

  const row = channelResult.data as Record<string, unknown>;
  const accessToken = decryptAccessToken(String(row.access_token_ciphertext));
  const configurations = await listWhatsAppPaymentConfigurations(accessToken, String(row.waba_id));

  return {
    hasChannel: true,
    wabaId: String(row.waba_id),
    configurations,
    recentEvents: (eventsResult.data || []).map((row) =>
      mapWhatsAppPaymentConfigurationEvent(row as Record<string, unknown>),
    ),
  };
}

async function saveMetaLeadCaptureSetup(
  userId: string,
  input: MetaLeadCaptureSetupInput,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const existing = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  const nextAccessToken = normalizeOptionalString(input.accessToken);
  const nextPageIds = input.pageIds !== undefined ? normalizeStringArray(input.pageIds) : normalizeStringArray(existing.page_ids);
  const nextFormIds = input.formIds !== undefined ? normalizeStringArray(input.formIds) : normalizeStringArray(existing.form_ids);
  const nextDefaultLabels =
    input.defaultLabels !== undefined ? normalizeStringArray(input.defaultLabels) : normalizeStringArray(existing.default_labels);
  const nextVerifyToken =
    input.regenerateVerifyToken || !normalizeOptionalString(existing.verify_token)
      ? generateVerifyToken()
      : String(existing.verify_token);
  const accessTokenCiphertext =
    input.accessToken !== undefined
      ? nextAccessToken
        ? encryptAccessToken(nextAccessToken)
        : null
      : normalizeOptionalString(existing.access_token_ciphertext);
  const accessTokenLast4 =
    input.accessToken !== undefined
      ? nextAccessToken
        ? last4(nextAccessToken)
        : null
      : normalizeOptionalString(existing.access_token_last4);
  const nextLastError = input.accessToken !== undefined || input.pageIds !== undefined ? null : normalizeOptionalString(existing.last_error);
  const status = resolveMetaLeadCaptureStatus({
    pageIds: nextPageIds,
    hasAccessToken: Boolean(accessTokenCiphertext),
    lastError: nextLastError,
  });

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .upsert(
      {
        user_id: userId,
        meta_channel_id: channelResult.data ? String(channelResult.data.id) : normalizeOptionalString(existing.meta_channel_id),
        status,
        app_id:
          'appId' in input
            ? normalizeOptionalString(input.appId)
            : normalizeOptionalString(existing.app_id),
        page_ids: nextPageIds,
        form_ids: nextFormIds,
        access_token_ciphertext: accessTokenCiphertext,
        access_token_last4: accessTokenLast4,
        verify_token: nextVerifyToken,
        default_owner_name:
          'defaultOwnerName' in input
            ? normalizeOptionalString(input.defaultOwnerName)
            : normalizeOptionalString(existing.default_owner_name),
        default_labels: nextDefaultLabels,
        auto_create_leads:
          input.autoCreateLeads !== undefined
            ? Boolean(input.autoCreateLeads)
            : Boolean(existing.auto_create_leads),
        last_error: nextLastError,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return buildMetaLeadCaptureSetupResponse(userId, req, data as Record<string, unknown>);
}

async function subscribeMetaLeadCapturePage(accessToken: string, pageId: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps`);
  url.searchParams.set('subscribed_fields', 'leadgen');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as { success?: boolean };
}

async function activateMetaLeadCapturePageSubscriptions(
  userId: string,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const configRow = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  const pageIds = normalizeStringArray(configRow.page_ids);

  if (!pageIds.length) {
    throw new Error('Add at least one Page ID before activating Page subscriptions.');
  }

  const encryptedAccessToken = normalizeOptionalString(configRow.access_token_ciphertext);

  if (!encryptedAccessToken) {
    throw new Error('Save a Page access token before activating Page subscriptions.');
  }

  const accessToken = decryptAccessToken(encryptedAccessToken);
  const failures: string[] = [];

  for (const pageId of pageIds) {
    try {
      await subscribeMetaLeadCapturePage(accessToken, pageId);
    } catch (error) {
      failures.push(`${pageId}: ${mapDbError(error)}`);
    }
  }

  const nextLastError = failures.length ? failures.join(' | ') : null;
  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .update({
      status: resolveMetaLeadCaptureStatus({
        pageIds,
        hasAccessToken: true,
        lastError: nextLastError,
      }),
      last_error: nextLastError,
    })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return buildMetaLeadCaptureSetupResponse(userId, req, data as Record<string, unknown>);
}

async function fetchMetaLeadCaptureLead(accessToken: string, leadId: string) {
  return metaRequest<{
    id?: string;
    created_time?: string;
    field_data?: Array<{
      name?: string;
      values?: unknown[];
    }>;
    form_id?: string;
    is_organic?: boolean;
    platform?: string;
  }>({
    accessToken,
    path: leadId,
    query: {
      fields: 'id,created_time,field_data,form_id,is_organic,platform',
    },
  });
}

function getMetaLeadCaptureFieldMap(fieldData: unknown) {
  if (!Array.isArray(fieldData)) {
    return {} as Record<string, string[]>;
  }

  return fieldData.reduce<Record<string, string[]>>((accumulator, entry) => {
    if (!isRecord(entry)) {
      return accumulator;
    }

    const name = normalizeOptionalString(entry.name)?.toLowerCase();
    const values = Array.isArray(entry.values)
      ? entry.values
          .map((value) => normalizeOptionalString(value))
          .filter((value): value is string => Boolean(value))
      : [];

    if (!name || values.length === 0) {
      return accumulator;
    }

    accumulator[name] = values;
    return accumulator;
  }, {});
}

function getMetaLeadCaptureFieldValue(
  fieldMap: Record<string, string[]>,
  candidates: string[],
) {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    const value = fieldMap[normalizedCandidate]?.[0];

    if (value) {
      return value;
    }
  }

  return null;
}

async function upsertMetaLeadCaptureEvent(args: {
  userId: string;
  pageId: string | null;
  formId: string | null;
  leadId: string | null;
  eventTime: string | null;
  processingStatus: MetaLeadCaptureEvent['processingStatus'];
  errorMessage?: string | null;
  raw: Record<string, unknown>;
}) {
  if (args.leadId) {
    const existing = await adminSupabase
      .from('meta_lead_capture_events')
      .select('*')
      .eq('user_id', args.userId)
      .eq('lead_id', args.leadId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      const { data, error } = await adminSupabase
        .from('meta_lead_capture_events')
        .update({
          page_id: args.pageId,
          form_id: args.formId,
          event_time: args.eventTime,
          processing_status: args.processingStatus,
          error_message: args.errorMessage || null,
          raw: args.raw,
        })
        .eq('id', existing.data.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data as Record<string, unknown>;
    }
  }

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_events')
    .insert({
      user_id: args.userId,
      page_id: args.pageId,
      form_id: args.formId,
      lead_id: args.leadId,
      event_time: args.eventTime,
      processing_status: args.processingStatus,
      error_message: args.errorMessage || null,
      raw: args.raw,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function processMetaLeadCaptureChange(change: Record<string, unknown>, pageIdFallback: string | null) {
  if (normalizeOptionalString(change.field) !== 'leadgen') {
    return;
  }

  const value = isRecord(change.value) ? change.value : {};
  const pageId = normalizeOptionalIdentifier(value.page_id) || pageIdFallback;
  const formId = normalizeOptionalIdentifier(value.form_id);
  const leadId = normalizeOptionalIdentifier(value.leadgen_id) || normalizeOptionalIdentifier(value.lead_id);
  const eventTime =
    toIsoTimestamp(
      typeof value.created_time === 'string' || typeof value.created_time === 'number'
        ? value.created_time
        : null,
    ) || new Date().toISOString();

  if (!pageId) {
    return;
  }

  const configResult = await adminSupabase
    .from('meta_lead_capture_configs')
    .select('*')
    .contains('page_ids', [pageId])
    .limit(1)
    .maybeSingle();

  if (configResult.error) {
    throw configResult.error;
  }

  if (!configResult.data) {
    return;
  }

  const config = configResult.data as Record<string, unknown>;
  const userId = String(config.user_id);
  const configLabels = normalizeStringArray(config.default_labels);

  await adminSupabase
    .from('meta_lead_capture_configs')
    .update({
      last_webhook_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('user_id', userId);

  await upsertMetaLeadCaptureEvent({
    userId,
    pageId,
    formId,
    leadId,
    eventTime,
    processingStatus: 'received',
    raw: change,
  });

  const configuredFormIds = normalizeStringArray(config.form_ids);

  if (configuredFormIds.length > 0 && (!formId || !configuredFormIds.includes(formId))) {
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'skipped',
      errorMessage: 'This form is not enabled in the Meta Lead Capture setup.',
      raw: change,
    });
    return;
  }

  if (!Boolean(config.auto_create_leads)) {
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'skipped',
      errorMessage: 'Auto-create leads is turned off for this integration.',
      raw: change,
    });
    return;
  }

  if (!leadId) {
    const message = 'Meta did not include a leadgen_id in the webhook payload.';
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });
    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
    return;
  }

  const encryptedAccessToken = normalizeOptionalString(config.access_token_ciphertext);

  if (!encryptedAccessToken) {
    const message = 'No Meta Page access token is saved for lead retrieval.';
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });
    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
    return;
  }

  try {
    const lead = await fetchMetaLeadCaptureLead(decryptAccessToken(encryptedAccessToken), leadId);
    const fieldMap = getMetaLeadCaptureFieldMap(lead.field_data);
    const firstName = getMetaLeadCaptureFieldValue(fieldMap, ['first_name']);
    const lastName = getMetaLeadCaptureFieldValue(fieldMap, ['last_name']);
    const fullName =
      getMetaLeadCaptureFieldValue(fieldMap, ['full_name', 'full name', 'name']) ||
      [firstName, lastName].filter(Boolean).join(' ') ||
      'Meta lead';
    const phone =
      normalizePhoneLike(
        getMetaLeadCaptureFieldValue(fieldMap, [
          'phone_number',
          'phone',
          'phone number',
          'work_phone_number',
          'mobile_phone_number',
        ]),
      ) || null;
    const email = normalizeOptionalString(
      getMetaLeadCaptureFieldValue(fieldMap, ['email', 'email_address']),
    );
    const contactIdentity = phone || email || `meta-lead:${leadId}`;
    const displayPhone = phone || email || `Lead ${leadId.slice(-6)}`;
    const previewText = `New Meta lead${formId ? ` from form ${formId}` : ''}`;
    const leadLabels = Array.from(new Set(['meta lead', ...configLabels]));
    const leadMessageId = `meta-lead:${leadId}`;
    const existingLeadMessage = await adminSupabase
      .from('conversation_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('wa_message_id', leadMessageId)
      .maybeSingle();

    if (existingLeadMessage.error) {
      throw existingLeadMessage.error;
    }

    const thread = await upsertThread({
      userId,
      metaChannelId: normalizeOptionalString(config.meta_channel_id),
      contactWaId: contactIdentity,
      contactName: fullName,
      displayPhone,
      email,
      source: 'Meta',
      remark: previewText,
      status: 'New',
      priority: 'Medium',
      labels: leadLabels,
      ownerName: normalizeOptionalString(config.default_owner_name),
      lastMessageText: previewText,
      lastMessageAt: eventTime,
      unreadDelta: existingLeadMessage.data ? 0 : 1,
    });

    await insertMessage({
      userId,
      threadId: thread.id,
      waMessageId: leadMessageId,
      direction: 'inbound',
      messageType: 'lead_capture',
      body: previewText,
      senderName: fullName,
      senderWaId: contactIdentity,
      status: 'delivered',
      raw: {
        lead_capture: {
          lead_id: leadId,
          page_id: pageId,
          form_id: formId || normalizeOptionalIdentifier(lead.form_id),
          created_time: normalizeOptionalString(lead.created_time) || eventTime,
          is_organic: Boolean(lead.is_organic),
          platform: normalizeOptionalString(lead.platform),
          field_data: fieldMap,
        },
      },
    });

    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'processed',
      raw: change,
    });

    await createUserNotification({
      userId,
      type: 'lead_created',
      title: 'New lead added to CRM',
      body: `${fullName} was added to your lead list from Meta Lead Capture.`,
      targetPath: '/dashboard/crm/leads',
      metadata: {
        leadId,
        pageId,
        formId,
        source: 'Meta',
        threadId: thread.id,
        contactName: fullName,
        phone: phone || null,
        email,
      },
      dedupeKey: `lead-created:${leadId}`,
    });

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: resolveMetaLeadCaptureStatus({
          pageIds: normalizeStringArray(config.page_ids),
          hasAccessToken: true,
          lastError: null,
        }),
        last_error: null,
        last_lead_synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch (error) {
    const message = mapDbError(error);

    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
  }
}

async function upsertProfile(user: User, input: ProfileUpsertInput) {
  const existing = await adminSupabase
    .from('app_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const previousProfilePictureUrl = normalizeOptionalString(existing.data?.profile_picture_url);
  const previousCompanyLogoUrl = normalizeOptionalString(existing.data?.company_logo_url);
  const nextProfilePictureUrl =
    'profilePictureUrl' in input
      ? normalizeOptionalString(input.profilePictureUrl)
      : previousProfilePictureUrl;
  const nextCompanyLogoUrl =
    'companyLogoUrl' in input
      ? normalizeOptionalString(input.companyLogoUrl)
      : previousCompanyLogoUrl;

  const payload = {
    user_id: user.id,
    email: user.email || existing.data?.email || null,
    full_name:
      'fullName' in input
        ? normalizeOptionalString(input.fullName)
        : normalizeOptionalString(existing.data?.full_name),
    profile_picture_url: nextProfilePictureUrl,
    company_logo_url: nextCompanyLogoUrl,
    country_code:
      'countryCode' in input
        ? normalizeOptionalString(input.countryCode)
        : normalizeOptionalString(existing.data?.country_code),
    phone:
      'phone' in input ? normalizeOptionalString(input.phone) : normalizeOptionalString(existing.data?.phone),
    company_name:
      'companyName' in input
        ? normalizeOptionalString(input.companyName)
        : normalizeOptionalString(existing.data?.company_name),
    company_website:
      'companyWebsite' in input
        ? normalizeOptionalString(input.companyWebsite)
        : normalizeOptionalString(existing.data?.company_website),
    industry:
      'industry' in input
        ? normalizeOptionalString(input.industry)
        : normalizeOptionalString(existing.data?.industry),
    selected_plan: 'selectedPlan' in input ? input.selectedPlan ?? null : existing.data?.selected_plan ?? null,
    billing_cycle:
      'billingCycle' in input ? input.billingCycle ?? null : (existing.data?.billing_cycle as string | null) ?? null,
    billing_status:
      'billingStatus' in input
        ? input.billingStatus ?? null
        : (existing.data?.billing_status as string | null) ?? null,
    trial_ends_at:
      'trialEndsAt' in input ? input.trialEndsAt ?? null : (existing.data?.trial_ends_at as string | null) ?? null,
    coupon_code: 'couponCode' in input ? input.couponCode ?? null : (existing.data?.coupon_code as string | null) ?? null,
    razorpay_subscription_id:
      'razorpaySubscriptionId' in input
        ? input.razorpaySubscriptionId ?? null
        : (existing.data?.razorpay_subscription_id as string | null) ?? null,
    onboarding_completed:
      'onboardingCompleted' in input ? input.onboardingCompleted ?? false : existing.data?.onboarding_completed ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('app_profiles')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if ('profilePictureUrl' in input && previousProfilePictureUrl && previousProfilePictureUrl !== nextProfilePictureUrl) {
    await deleteStoredAppProfilePhoto(previousProfilePictureUrl);
  }

  if ('companyLogoUrl' in input && previousCompanyLogoUrl && previousCompanyLogoUrl !== nextCompanyLogoUrl) {
    await deleteStoredAppProfilePhoto(previousCompanyLogoUrl);
  }

  return mapProfile(data as Record<string, unknown>);
}

async function ensureInvitedProfile(userId: string, email: string, fullName: string) {
  const payload = {
    user_id: userId,
    email,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminSupabase.from('app_profiles').upsert(payload, {
    onConflict: 'user_id',
  });

  if (error) {
    throw error;
  }
}

async function getWorkspaceTeamMembers(user: User) {
  const [profileResult, membersResult] = await Promise.all([
    adminSupabase.from('app_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    adminSupabase
      .from('workspace_team_members')
      .select('*')
      .eq('workspace_owner_user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (membersResult.error) {
    throw membersResult.error;
  }

  const ownerProfile = profileResult.data as Record<string, unknown> | null;
  const ownerEmail = normalizeEmailAddress(user.email || ownerProfile?.email) || user.email || '';
  const ownerName =
    normalizeOptionalString(ownerProfile?.full_name) ||
    normalizeOptionalString(user.user_metadata?.full_name) ||
    normalizeOptionalString(user.user_metadata?.name) ||
    normalizeOptionalString(ownerEmail.split('@')[0]) ||
    'Workspace Owner';

  const ownerRecord: WorkspaceTeamMember = {
    id: `owner-${user.id}`,
    workspaceOwnerUserId: user.id,
    memberUserId: user.id,
    fullName: ownerName,
    email: ownerEmail,
    role: 'Owner',
    status: 'active',
    invitedAt: String(ownerProfile?.created_at || user.created_at || new Date().toISOString()),
    acceptedAt: String(ownerProfile?.created_at || user.created_at || new Date().toISOString()),
    isOwner: true,
  };

  return [
    ownerRecord,
    ...(membersResult.data || []).map((row) => mapWorkspaceTeamMember(row as Record<string, unknown>)),
  ];
}

async function inviteWorkspaceTeamMember(user: User, input: InviteWorkspaceUserInput) {
  const fullName = normalizeOptionalString(input.fullName);
  const email = normalizeEmailAddress(input.email);
  const role = normalizeWorkspaceUserRole(input.role);

  if (!fullName) {
    throw new Error('A full name is required to invite a user.');
  }

  if (!email) {
    throw new Error('A valid email address is required to invite a user.');
  }

  if (role === 'Owner') {
    throw new Error('Invite a workspace role such as Admin, Manager, or Agent.');
  }

  if (normalizeEmailAddress(user.email) === email) {
    throw new Error('You cannot invite your own workspace email address.');
  }

  const existingMembership = await adminSupabase
    .from('workspace_team_members')
    .select('*')
    .eq('workspace_owner_user_id', user.id)
    .eq('invited_email', email)
    .maybeSingle();

  if (existingMembership.error) {
    throw existingMembership.error;
  }

  if (existingMembership.data) {
    throw new Error('This email address is already part of your workspace team.');
  }

  const redirectTo = `${frontendOrigin.replace(/\/$/, '')}/login`;
  const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: {
        full_name: fullName,
        workspace_role: role,
        workspace_owner_user_id: user.id,
      },
    },
  );

  if (inviteError) {
    throw inviteError;
  }

  if (!inviteData.user?.id) {
    throw new Error('Supabase did not return an invited user record.');
  }

  await ensureInvitedProfile(inviteData.user.id, email, fullName);

  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .insert({
      workspace_owner_user_id: user.id,
      member_user_id: inviteData.user.id,
      invited_by_user_id: user.id,
      invited_email: email,
      full_name: fullName,
      role,
      status: 'invited',
      invite_sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapWorkspaceTeamMember(data as Record<string, unknown>);
}

async function getChannelWithToken(userId: string) {
  const { data, error } = await adminSupabase.from('meta_channels').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Connect a WhatsApp Business account before using Meta features.');
  }

  return {
    row: data as Record<string, unknown>,
    accessToken: decryptAccessToken(String(data.access_token_ciphertext)),
  };
}

async function getEmailConnectionRow(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data as Record<string, unknown> | null) || null;
}

async function getStoredEmailConnection(userId: string) {
  return mapEmailConnection(await getEmailConnectionRow(userId));
}

async function getEmailConnectionWithPassword(userId: string) {
  const row = await getEmailConnectionRow(userId);

  if (!row) {
    throw new Error('Connect an email account before using email features.');
  }

  const passwordCiphertext = normalizeOptionalString(row.password_ciphertext);

  if (!passwordCiphertext) {
    throw new Error('The saved email password is missing. Reconnect the email account.');
  }

  return {
    row,
    connection: mapEmailConnection(row)!,
    password: decryptAccessToken(passwordCiphertext),
  };
}

function createEmailTransporter(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.authUser,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

async function verifySmtpConnection(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  const startedAt = Date.now();

  try {
    const transporter = createEmailTransporter(config);
    await transporter.verify();

    return {
      ok: true,
      message: 'SMTP connection verified successfully.',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'SMTP verification failed.',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function verifyImapConnection(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  const startedAt = Date.now();
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.authUser,
      pass: config.password,
    },
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
    connectionTimeout: 10_000,
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: true });

    return {
      ok: true,
      message: 'IMAP connection verified successfully.',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'IMAP verification failed.',
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function verifyEmailConnectionInput(
  input: EmailConnectionUpsertInput,
): Promise<EmailConnectionVerifyResponse> {
  const normalizedInput = normalizeEmailConnectionInput(input);
  const [smtp, imap] = await Promise.all([
    verifySmtpConnection(normalizedInput),
    verifyImapConnection(normalizedInput),
  ]);

  return {
    smtp,
    imap,
    canConnect: smtp.ok && imap.ok,
  };
}

async function saveEmailConnection(userId: string, input: EmailConnectionUpsertInput) {
  const normalizedInput = normalizeEmailConnectionInput(input);
  const verification = await verifyEmailConnectionInput(normalizedInput);

  if (!verification.canConnect) {
    const messages = [verification.smtp.message, verification.imap.message].filter(Boolean);
    throw new Error(messages.join(' '));
  }

  const payload = {
    user_id: userId,
    display_name: normalizedInput.displayName,
    email_address: normalizedInput.emailAddress,
    auth_user: normalizedInput.authUser,
    password_ciphertext: encryptAccessToken(normalizedInput.password),
    smtp_host: normalizedInput.smtpHost,
    smtp_port: normalizedInput.smtpPort,
    smtp_secure: normalizedInput.smtpSecure,
    imap_host: normalizedInput.imapHost,
    imap_port: normalizedInput.imapPort,
    imap_secure: normalizedInput.imapSecure,
    status: 'connected',
    last_verified_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_connections')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailConnection(data as Record<string, unknown>)!;
}

async function deleteEmailConnection(userId: string) {
  const { error } = await adminSupabase.from('email_connections').delete().eq('user_id', userId);

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return { ok: true as const };
}

function mapParsedAddressList(addresses: { address?: string | null }[] | undefined) {
  return (addresses || [])
    .map((entry) => normalizeEmailAddress(entry.address))
    .filter((entry): entry is string => Boolean(entry));
}

async function fetchEmailInbox(userId: string, options?: { limit?: number }) {
  const { connection, password } = await getEmailConnectionWithPassword(userId);
  const client = new ImapFlow({
    host: connection.imapHost,
    port: connection.imapPort,
    secure: connection.imapSecure,
    auth: {
      user: connection.authUser,
      pass: password,
    },
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
    connectionTimeout: 10_000,
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    const total = mailbox.exists || 0;
    const limit = Math.max(1, Math.min(options?.limit || 20, 50));

    if (total === 0) {
      return [];
    }

    const startSequence = Math.max(total - limit + 1, 1);
    const messages: EmailMessage[] = [];

    for await (const message of client.fetch(`${startSequence}:${total}`, {
      uid: true,
      envelope: true,
      flags: true,
      source: true,
    })) {
      const parsed = await simpleParser(message.source as Buffer);
      const htmlBody =
        typeof parsed.html === 'string'
          ? parsed.html
          : parsed.html
            ? String(parsed.html)
            : null;
      const textBody = normalizeOptionalString(parsed.text);
      const fromEntry = parsed.from?.value?.[0];
      const previewText = (textBody || (htmlBody ? stripHtmlTags(htmlBody) : '') || 'No preview available.').slice(0, 180);
      const flagValues = Array.from(message.flags || []);

      messages.push({
        id: `${message.uid || message.seq}:${parsed.messageId || parsed.subject || 'email'}`,
        folder: 'INBOX',
        subject: normalizeOptionalString(parsed.subject) || 'No subject',
        fromName: normalizeOptionalString(fromEntry?.name),
        fromEmail: normalizeEmailAddress(fromEntry?.address),
        to: mapParsedAddressList(parsed.to?.value),
        receivedAt:
          parsed.date?.toISOString() ||
          (message.envelope?.date instanceof Date ? message.envelope.date.toISOString() : null),
        htmlBody,
        textBody,
        previewText,
        isUnread: !flagValues.includes('\\Seen'),
      });
    }

    return messages.reverse();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function getEmailTemplateById(userId: string, templateId: string) {
  const { data, error } = await adminSupabase
    .from('email_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Email template not found.');
  }

  return mapEmailTemplate(data as Record<string, unknown>);
}

async function getEmailTemplates(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data || []).map((row) => mapEmailTemplate(row as Record<string, unknown>));
}

async function saveEmailTemplate(userId: string, input: EmailTemplateSaveInput) {
  const normalizedInput = normalizeEmailTemplateInput(input);
  const payload = {
    user_id: userId,
    name: normalizedInput.name,
    subject: normalizedInput.subject,
    editor_mode: normalizedInput.editorMode,
    html_content: normalizedInput.htmlContent,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_templates')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailTemplate(data as Record<string, unknown>);
}

async function deleteEmailTemplate(userId: string, templateId: string) {
  const { error } = await adminSupabase
    .from('email_templates')
    .delete()
    .eq('user_id', userId)
    .eq('id', templateId);

  if (error) {
    throw error;
  }

  return { ok: true as const };
}

async function getEmailCampaigns(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data || []).map((row) => mapEmailCampaign(row as Record<string, unknown>));
}

async function insertEmailCampaign(args: {
  userId: string;
  template: EmailTemplate;
  campaignName: string;
  audienceSource: EmailCampaign['audienceSource'];
  recipientCount: number;
  status: EmailCampaign['status'];
  sentAt: string | null;
}) {
  const payload = {
    user_id: args.userId,
    email_template_id: args.template.id,
    template_name: args.template.name,
    campaign_name: args.campaignName,
    subject: args.template.subject,
    html_content: args.template.htmlContent,
    audience_source: args.audienceSource,
    recipient_count: args.recipientCount,
    status: args.status,
    sent_at: args.sentAt,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_campaigns')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailCampaign(data as Record<string, unknown>);
}

async function sendEmailCampaign(userId: string, input: EmailCampaignSendInput) {
  const normalizedInput = normalizeEmailCampaignInput(input);
  const { connection, password } = await getEmailConnectionWithPassword(userId);
  const template = await getEmailTemplateById(userId, normalizedInput.templateId);
  const transporter = nodemailer.createTransport({
    host: connection.smtpHost,
    port: connection.smtpPort,
    secure: connection.smtpSecure,
    auth: {
      user: connection.authUser,
      pass: password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  let deliveredCount = 0;

  for (const recipient of normalizedInput.recipients) {
    try {
      await transporter.sendMail({
        from: {
          name: connection.displayName,
          address: connection.emailAddress,
        },
        to: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
        subject: template.subject,
        html: template.htmlContent,
      });
      deliveredCount += 1;
    } catch (error) {
      console.error('Email send failure:', error);
    }
  }

  const status: EmailCampaign['status'] =
    deliveredCount === normalizedInput.recipients.length
      ? 'sent'
      : deliveredCount > 0
        ? 'partial'
        : 'failed';

  return insertEmailCampaign({
    userId,
    template,
    campaignName: normalizedInput.campaignName,
    audienceSource: normalizedInput.audienceSource,
    recipientCount: normalizedInput.recipients.length,
    status,
    sentAt: deliveredCount > 0 ? new Date().toISOString() : null,
  });
}

async function getConversationalAutomationConfigRow(userId: string) {
  const { data, error } = await adminSupabase
    .from('meta_conversational_automation_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Record<string, unknown> | null) || null;
}

async function getConversationalAutomationConfig(
  userId: string,
  channelRow: Record<string, unknown> | null,
) {
  const row = await getConversationalAutomationConfigRow(userId);
  return mapConversationalAutomationConfig(row, {
    userId,
    channelRow,
  });
}

async function saveConversationalAutomationConfig(args: {
  userId: string;
  channelRow: Record<string, unknown> | null;
  input: Required<WhatsAppConversationalAutomationUpdateInput>;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}) {
  const currentRow = await getConversationalAutomationConfigRow(args.userId);
  const payload = {
    user_id: args.userId,
    meta_channel_id: args.channelRow ? String(args.channelRow.id) : null,
    enable_welcome_message: args.input.enableWelcomeMessage,
    prompts: args.input.prompts,
    commands: args.input.commands.map((command) => ({
      commandName: command.commandName,
      commandDescription: command.commandDescription,
    })),
    last_synced_at:
      args.lastSyncedAt !== undefined
        ? args.lastSyncedAt
        : normalizeOptionalString(currentRow?.last_synced_at),
    last_error:
      args.lastError !== undefined
        ? args.lastError
        : normalizeOptionalString(currentRow?.last_error),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('meta_conversational_automation_configs')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapConversationalAutomationConfig(data as Record<string, unknown>, {
    userId: args.userId,
    channelRow: args.channelRow,
  });
}

async function refreshChannelSnapshot(userId: string, row: Record<string, unknown>, accessToken: string) {
  const [phone, waba] = await Promise.all([
    fetchPhoneNumber(accessToken, String(row.phone_number_id)),
    fetchWaba(accessToken, String(row.waba_id)),
  ]);

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      display_phone_number: phone.display_phone_number || null,
      verified_name: phone.verified_name || null,
      quality_rating: phone.quality_rating || null,
      messaging_limit_tier: getNormalizedMessagingLimitTier(phone),
      business_account_name: waba.name || null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    channelRow: data as Record<string, unknown>,
    phone,
  };
}

async function saveMetaChannel(args: {
  userId: string;
  setupType: string;
  connectionMethod: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
}) {
  const payload = {
    user_id: args.userId,
    setup_type: args.setupType,
    connection_method: args.connectionMethod,
    status: 'connected',
    waba_id: args.wabaId,
    phone_number_id: args.phoneNumberId,
    display_phone_number: args.displayPhoneNumber,
    verified_name: args.verifiedName,
    quality_rating: args.qualityRating,
    messaging_limit_tier: args.messagingLimitTier,
    business_account_name: args.businessAccountName,
    access_token_ciphertext: encryptAccessToken(args.accessToken),
    access_token_last4: last4(args.accessToken),
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapChannel(data as Record<string, unknown>);
}

async function saveInstagramChannel(args: {
  userId: string;
  userAccessToken: string;
  pageAccessToken: string;
  pageId: string;
  pageName: string | null;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
}) {
  const payload = {
    user_id: args.userId,
    connection_method: 'business_login',
    status: 'connected',
    instagram_account_id: args.instagramAccountId,
    instagram_username: args.instagramUsername,
    instagram_name: args.instagramName,
    profile_picture_url: args.profilePictureUrl,
    page_id: args.pageId,
    page_name: args.pageName,
    user_access_token_ciphertext: encryptAccessToken(args.userAccessToken),
    user_access_token_last4: last4(args.userAccessToken),
    page_access_token_ciphertext: encryptAccessToken(args.pageAccessToken),
    page_access_token_last4: last4(args.pageAccessToken),
    metadata: {},
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('instagram_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapInstagramChannel(data as Record<string, unknown>);
}

async function saveMessengerChannel(args: {
  userId: string;
  connectionMethod: MessengerChannelConnection['connectionMethod'];
  pageAccessToken: string;
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  webhookSubscribed: boolean;
  webhookLastError: string | null;
}) {
  const payload = {
    user_id: args.userId,
    connection_method: args.connectionMethod,
    status: args.webhookLastError ? 'error' : 'connected',
    page_id: args.pageId,
    page_name: args.pageName,
    page_picture_url: args.pagePictureUrl,
    page_tasks: args.pageTasks,
    page_access_token_ciphertext: encryptAccessToken(args.pageAccessToken),
    page_access_token_last4: last4(args.pageAccessToken),
    webhook_fields: [...DEFAULT_MESSENGER_WEBHOOK_FIELDS],
    webhook_subscribed: args.webhookSubscribed,
    webhook_last_error: args.webhookLastError,
    metadata: {},
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('messenger_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapMessengerChannel(data as Record<string, unknown>);
}

async function listInstagramConnectableAccounts(longLivedToken: string) {
  const pages = await fetchInstagramPages(longLivedToken);
  const connectablePages = pages.filter(
    (page) => normalizeOptionalString(page.access_token) && normalizeOptionalString(page.instagram_business_account?.id),
  );

  const accounts = await Promise.all(
    connectablePages.map(async (page) => {
      const pageAccessToken = normalizeOptionalString(page.access_token);
      const instagramAccountId = normalizeOptionalString(page.instagram_business_account?.id);

      if (!pageAccessToken || !instagramAccountId) {
        return null;
      }

      const profile = await fetchInstagramAccountProfile(
        longLivedToken,
        pageAccessToken,
        instagramAccountId,
      ).catch(() => null);

      return {
        pageId: String(page.id),
        pageName: normalizeOptionalString(page.name),
        instagramAccountId,
        instagramUsername: normalizeOptionalString(profile?.username),
        instagramName: normalizeOptionalString(profile?.name),
        profilePictureUrl: normalizeOptionalString(profile?.profile_picture_url),
      } as InstagramConnectableAccount;
    }),
  );

  return accounts.filter(Boolean) as InstagramConnectableAccount[];
}

async function listMessengerConnectablePages(userAccessToken: string) {
  const pages = await fetchMessengerPages(userAccessToken);

  return pages
    .filter(
      (page) =>
        normalizeOptionalIdentifier(page.id) &&
        normalizeOptionalString(page.access_token),
    )
    .map((page) => {
      const pageId = normalizeOptionalIdentifier(page.id) || '';

      return {
        pageId,
        pageName: normalizeOptionalString(page.name),
        pagePictureUrl: getGraphPictureUrl(page.picture),
        pageTasks: [],
        canSendMessages: true,
        canManageWebhooks: true,
      } satisfies MessengerConnectablePage;
    });
}

async function connectMessengerChannel(args: {
  userId: string;
  connectionMethod: MessengerChannelConnection['connectionMethod'];
  pageId: string;
  pageAccessToken: string;
}) {
  const page = await fetchMessengerPage(args.pageAccessToken, args.pageId);

  let webhookSubscribed = false;
  let webhookLastError: string | null = null;

  try {
    await subscribeMessengerPageToWebhook(args.pageAccessToken, args.pageId);
    webhookSubscribed = true;
  } catch (error) {
    webhookLastError = mapDbError(error);
  }

  return saveMessengerChannel({
    userId: args.userId,
    connectionMethod: args.connectionMethod,
    pageAccessToken: args.pageAccessToken,
    pageId: String(page.id || args.pageId),
    pageName: normalizeOptionalString(page.name),
    pagePictureUrl: getGraphPictureUrl(page.picture),
    pageTasks: [],
    webhookSubscribed,
    webhookLastError,
  });
}

async function syncTemplates(userId: string) {
  const { row, accessToken } = await getChannelWithToken(userId);
  const remoteTemplates = await listTemplates(accessToken, String(row.waba_id));
  const existingTemplatesResult = await adminSupabase
    .from('meta_templates')
    .select('template_name, language, status')
    .eq('user_id', userId);

  if (existingTemplatesResult.error) {
    throw existingTemplatesResult.error;
  }

  const existingStatusByTemplate = new Map<string, string | null>();

  for (const templateRow of existingTemplatesResult.data || []) {
    const templateName = normalizeOptionalString(templateRow.template_name);
    const language = normalizeOptionalString(templateRow.language);

    if (!templateName || !language) {
      continue;
    }

    existingStatusByTemplate.set(
      `${templateName}:${language}`,
      normalizeOptionalString(templateRow.status)?.toUpperCase() || null,
    );
  }

  for (const template of remoteTemplates) {
    const templateName = String(template.name || '');
    const language = String(template.language || 'en_US');
    const nextStatus = normalizeOptionalString(template.status)?.toUpperCase() || null;
    const previousStatus = existingStatusByTemplate.get(`${templateName}:${language}`) || null;
    const payload = {
      user_id: userId,
      meta_channel_id: row.id,
      meta_template_id: (template.id as string | undefined) || null,
      template_name: templateName,
      category: (template.category as string | undefined) || null,
      language,
      status: (template.status as string | undefined) || null,
      raw: template,
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminSupabase.from('meta_templates').upsert(payload, {
      onConflict: 'user_id,template_name,language',
    });

    if (error) {
      throw error;
    }

    if (nextStatus && nextStatus !== previousStatus) {
      if (nextStatus === 'APPROVED') {
        await createUserNotification({
          userId,
          type: 'template_approved',
          title: 'WhatsApp template approved',
          body: `${templateName} is now approved and ready to use.`,
          targetPath: '/dashboard/templates',
          metadata: {
            templateName,
            language,
            previousStatus,
            currentStatus: nextStatus,
          },
          dedupeKey: `template-status:${templateName}:${language}:${previousStatus || 'unknown'}:${nextStatus}`,
        });
      }

      if (nextStatus === 'REJECTED') {
        await createUserNotification({
          userId,
          type: 'template_rejected',
          title: 'WhatsApp template rejected',
          body: `${templateName} was rejected. Review it before sending again.`,
          targetPath: '/dashboard/templates',
          metadata: {
            templateName,
            language,
            previousStatus,
            currentStatus: nextStatus,
          },
          dedupeKey: `template-status:${templateName}:${language}:${previousStatus || 'unknown'}:${nextStatus}`,
        });
      }
    }

    existingStatusByTemplate.set(`${templateName}:${language}`, nextStatus);
  }

  await adminSupabase
    .from('meta_channels')
    .update({
      last_synced_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  const { data, error } = await adminSupabase
    .from('meta_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapTemplate(row as Record<string, unknown>));
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  const components = raw?.components;

  return Array.isArray(components)
    ? components.filter((component): component is Record<string, unknown> => Boolean(component) && typeof component === 'object' && !Array.isArray(component))
    : [];
}

function normalizeTemplateSnapshot(
  raw: Record<string, unknown> | null | undefined,
  fallback?: { name?: string | null; language?: string | null },
) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallback?.name) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallback?.name || null,
    language: typeof raw?.language === 'string' ? raw.language : fallback?.language || null,
    components,
  };
}

function getTemplatePreviewText(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  fallbackName?: string | null,
) {
  const bodyComponent = snapshot?.components.find((component) => component.type === 'BODY') || null;
  const headerComponent = snapshot?.components.find((component) => component.type === 'HEADER') || null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';

  if (bodyText) {
    return bodyText.replace(/\s+/g, ' ').slice(0, 140);
  }

  if (headerText) {
    return headerText.replace(/\s+/g, ' ').slice(0, 140);
  }

  return fallbackName ? `Template: ${fallbackName}` : 'Template message';
}

async function getStoredTemplateSnapshot(userId: string, templateName: string, language: string) {
  const { data, error } = await adminSupabase
    .from('meta_templates')
    .select('template_name, language, raw')
    .eq('user_id', userId)
    .eq('template_name', templateName)
    .eq('language', language)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return normalizeTemplateSnapshot((data.raw as Record<string, unknown>) || {}, {
    name: String(data.template_name),
    language: String(data.language || language),
  });
}

function getConversationThreadActivityTimestamp(row: Record<string, unknown>) {
  const timestamp =
    normalizeOptionalString(row.last_message_at) ||
    normalizeOptionalString(row.updated_at) ||
    normalizeOptionalString(row.created_at);

  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickConversationThreadRow(rows: Record<string, unknown>[], canonicalPhone: string) {
  return [...rows].sort((left, right) => {
    const leftIsCanonical = String(left.contact_wa_id || '') === canonicalPhone ? 1 : 0;
    const rightIsCanonical = String(right.contact_wa_id || '') === canonicalPhone ? 1 : 0;

    if (leftIsCanonical !== rightIsCanonical) {
      return rightIsCanonical - leftIsCanonical;
    }

    const timeDiff =
      getConversationThreadActivityTimestamp(right) - getConversationThreadActivityTimestamp(left);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return String(right.id || '').localeCompare(String(left.id || ''));
  })[0];
}

function pickConversationThreadString(
  rows: Record<string, unknown>[],
  key: string,
  primaryRow: Record<string, unknown>,
) {
  const preferred = normalizeOptionalString(primaryRow[key]);

  if (preferred) {
    return preferred;
  }

  for (const row of rows) {
    const value = normalizeOptionalString(row[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

async function findConversationThreadRowsByIdentity(userId: string, contactIdentity: unknown) {
  const variants = buildContactIdentityVariants(contactIdentity);

  if (variants.length === 0) {
    return [] as Record<string, unknown>[];
  }

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .in('contact_wa_id', variants);

  if (error) {
    throw error;
  }

  return (data || []) as Record<string, unknown>[];
}

async function consolidateConversationThreadRows(args: {
  userId: string;
  rows: Record<string, unknown>[];
  canonicalPhone: string;
}) {
  const uniqueRows = Array.from(
    new Map(args.rows.map((row) => [String(row.id || ''), row])).values(),
  );

  if (uniqueRows.length === 0) {
    return null;
  }

  const primaryRow = pickConversationThreadRow(uniqueRows, args.canonicalPhone);
  const duplicateRows = uniqueRows.filter((row) => String(row.id || '') !== String(primaryRow.id || ''));
  const duplicateIds = duplicateRows.map((row) => String(row.id || '')).filter(Boolean);
  const latestMessageRow =
    [...uniqueRows]
      .filter((row) => normalizeOptionalString(row.last_message_at))
      .sort((left, right) => {
        const leftTimestamp = Date.parse(normalizeOptionalString(left.last_message_at) || '');
        const rightTimestamp = Date.parse(normalizeOptionalString(right.last_message_at) || '');
        return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) - (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
      })[0] || primaryRow;
  const mergedLabels = normalizeLabels(
    uniqueRows.flatMap((row) => (Array.isArray(row.labels) ? (row.labels as unknown[]) : [])),
  );
  const mergedUnreadCount = uniqueRows.reduce((total, row) => total + Number(row.unread_count || 0), 0);
  const payload = {
    meta_channel_id: pickConversationThreadString(uniqueRows, 'meta_channel_id', primaryRow),
    contact_wa_id: args.canonicalPhone,
    contact_name: pickConversationThreadString(uniqueRows, 'contact_name', primaryRow),
    display_phone: `+${args.canonicalPhone}`,
    email: pickConversationThreadString(uniqueRows, 'email', primaryRow),
    source: pickConversationThreadString(uniqueRows, 'source', primaryRow),
    remark: pickConversationThreadString(uniqueRows, 'remark', primaryRow),
    avatar_url: pickConversationThreadString(uniqueRows, 'avatar_url', primaryRow),
    status: normalizeStatus(
      (pickConversationThreadString(uniqueRows, 'status', primaryRow) || primaryRow.status) as
        | string
        | null,
    ),
    priority: normalizePriority(
      (pickConversationThreadString(uniqueRows, 'priority', primaryRow) || primaryRow.priority) as
        | string
        | null,
    ),
    labels: mergedLabels,
    owner_name: pickConversationThreadString(uniqueRows, 'owner_name', primaryRow),
    last_message_text: pickConversationThreadString(uniqueRows, 'last_message_text', latestMessageRow),
    last_message_at: normalizeOptionalString(latestMessageRow.last_message_at),
    unread_count: mergedUnreadCount,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await adminSupabase
    .from('conversation_threads')
    .update(payload)
    .eq('user_id', args.userId)
    .eq('id', String(primaryRow.id));

  if (updateError) {
    throw updateError;
  }

  if (duplicateIds.length > 0) {
    const { error: reassignMessagesError } = await adminSupabase
      .from('conversation_messages')
      .update({ thread_id: String(primaryRow.id) })
      .eq('user_id', args.userId)
      .in('thread_id', duplicateIds);

    if (reassignMessagesError) {
      throw reassignMessagesError;
    }

    const { error: deleteThreadsError } = await adminSupabase
      .from('conversation_threads')
      .delete()
      .eq('user_id', args.userId)
      .in('id', duplicateIds);

    if (deleteThreadsError) {
      throw deleteThreadsError;
    }
  }

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', args.userId)
    .eq('id', String(primaryRow.id))
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function ensureConversationThreadPhoneConsistency(
  userId: string,
  rows: Record<string, unknown>[],
) {
  const rowsByPhone = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const canonicalPhone = normalizePhoneLike(row.contact_wa_id);

    if (!canonicalPhone) {
      continue;
    }

    const currentRows = rowsByPhone.get(canonicalPhone) || [];
    currentRows.push(row);
    rowsByPhone.set(canonicalPhone, currentRows);
  }

  let changed = false;

  for (const [canonicalPhone, groupedRows] of rowsByPhone.entries()) {
    const expectedDisplay = `+${canonicalPhone}`;
    const needsConsolidation =
      groupedRows.length > 1 ||
      groupedRows.some((row) => {
        const currentContactWaId = String(row.contact_wa_id || '');
        const currentDisplayPhone = formatContactIdentity(row.display_phone) || null;

        return currentContactWaId !== canonicalPhone || currentDisplayPhone !== expectedDisplay;
      });

    if (!needsConsolidation) {
      continue;
    }

    await consolidateConversationThreadRows({
      userId,
      rows: groupedRows,
      canonicalPhone,
    });
    changed = true;
  }

  return changed;
}

async function upsertThread(args: {
  userId: string;
  metaChannelId: string | null;
  contactWaId: string;
  contactName?: string | null;
  displayPhone?: string | null;
  email?: string | null;
  source?: string | null;
  remark?: string | null;
  avatarUrl?: string | null;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  ownerName?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadDelta?: number;
}) {
  const contactWaId = normalizeContactIdentity(args.contactWaId);

  if (!contactWaId) {
    throw new Error('contactWaId is required.');
  }

  const canonicalPhone = normalizePhoneLike(contactWaId);
  let existingRow: Record<string, unknown> | null = null;

  if (canonicalPhone) {
    const matchingRows = await findConversationThreadRowsByIdentity(args.userId, canonicalPhone);
    existingRow =
      matchingRows.length > 0
        ? await consolidateConversationThreadRows({
            userId: args.userId,
            rows: matchingRows,
            canonicalPhone,
          })
        : null;
  } else {
    const existing = await adminSupabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', args.userId)
      .eq('contact_wa_id', contactWaId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    existingRow = (existing.data as Record<string, unknown> | null) || null;
  }

  const currentUnread = existingRow?.unread_count ? Number(existingRow.unread_count) : 0;
  const payload = {
    meta_channel_id: args.metaChannelId ?? existingRow?.meta_channel_id ?? null,
    contact_wa_id: contactWaId,
    contact_name: args.contactName ?? existingRow?.contact_name ?? null,
    display_phone:
      formatContactIdentity(args.displayPhone) ??
      (canonicalPhone ? `+${canonicalPhone}` : normalizeOptionalString(existingRow?.display_phone)) ??
      null,
    email: args.email ?? existingRow?.email ?? null,
    source: args.source ?? existingRow?.source ?? null,
    remark: args.remark ?? existingRow?.remark ?? null,
    avatar_url: args.avatarUrl ?? existingRow?.avatar_url ?? null,
    status: args.status ?? normalizeStatus((existingRow?.status as string | null | undefined) ?? null),
    priority:
      args.priority ?? normalizePriority((existingRow?.priority as string | null | undefined) ?? null),
    labels: args.labels !== undefined ? normalizeLabels(args.labels) : normalizeLabels(existingRow?.labels),
    owner_name: args.ownerName ?? existingRow?.owner_name ?? null,
    last_message_text: args.lastMessageText ?? existingRow?.last_message_text ?? null,
    last_message_at: args.lastMessageAt ?? existingRow?.last_message_at ?? null,
    unread_count: Math.max(0, currentUnread + (args.unreadDelta || 0)),
    updated_at: new Date().toISOString(),
  };

  const query = adminSupabase.from('conversation_threads');
  const result = existingRow
    ? await query
        .update(payload)
        .eq('user_id', args.userId)
        .eq('id', String(existingRow.id))
        .select('*')
        .single()
    : await query
        .insert({
          user_id: args.userId,
          ...payload,
        })
        .select('*')
        .single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  return mapThread(data as Record<string, unknown>);
}

async function createContact(userId: string, input: ContactUpsertInput) {
  const contactWaId = normalizePhoneLike(input.contactWaId);

  if (!contactWaId) {
    throw new Error('contactWaId is required.');
  }

  const [matchingRows, channelResult] = await Promise.all([
    findConversationThreadRowsByIdentity(userId, contactWaId),
    adminSupabase.from('meta_channels').select('id').eq('user_id', userId).maybeSingle(),
  ]);

  if (channelResult.error) {
    throw channelResult.error;
  }

  const existing =
    matchingRows.length > 0
      ? await consolidateConversationThreadRows({
          userId,
          rows: matchingRows,
          canonicalPhone: contactWaId,
        })
      : null;
  const payload = {
    meta_channel_id: existing?.meta_channel_id || channelResult.data?.id || null,
    contact_wa_id: contactWaId,
    contact_name: normalizeOptionalString(input.contactName) ?? existing?.contact_name ?? null,
    display_phone: formatContactIdentity(input.displayPhone) ?? existing?.display_phone ?? `+${contactWaId}`,
    email: normalizeOptionalString(input.email) ?? existing?.email ?? null,
    source: normalizeOptionalString(input.source) ?? existing?.source ?? 'Manual',
    remark: normalizeOptionalString(input.remark) ?? existing?.remark ?? null,
    avatar_url: normalizeOptionalString(input.avatarUrl) ?? existing?.avatar_url ?? null,
    status: normalizeStatus(input.status ?? (existing?.status as string | null | undefined)),
    priority: normalizePriority(input.priority ?? (existing?.priority as string | null | undefined)),
    labels: input.labels !== undefined ? normalizeLabels(input.labels) : existing?.labels ?? [],
    owner_name: normalizeOptionalString(input.ownerName) ?? existing?.owner_name ?? null,
    last_message_text: existing?.last_message_text ?? null,
    last_message_at: existing?.last_message_at ?? null,
    unread_count: Number(existing?.unread_count || 0),
    updated_at: new Date().toISOString(),
  };

  const query = adminSupabase.from('conversation_threads');
  const result = existing
    ? await query
        .update(payload)
        .eq('user_id', userId)
        .eq('id', String(existing.id))
        .select('*')
        .single()
    : await query
        .insert({
          user_id: userId,
          ...payload,
        })
        .select('*')
        .single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  return mapThread(data as Record<string, unknown>);
}

async function updateContact(userId: string, threadId: string, input: ContactUpdateInput) {
  const existingResult = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (!existingResult.data) {
    throw new Error('Contact not found.');
  }

  const existing = existingResult.data as Record<string, unknown>;
  const nextContactWaId =
    input.displayPhone !== undefined
      ? normalizeContactIdentity(input.displayPhone) || normalizeContactIdentity(existing.contact_wa_id)
      : normalizeContactIdentity(existing.contact_wa_id);

  if (!nextContactWaId) {
    throw new Error('Contact number is required.');
  }

  const canonicalPhone = normalizePhoneLike(nextContactWaId);
  let targetRow = existing;

  if (canonicalPhone) {
    const matchingRows = await findConversationThreadRowsByIdentity(userId, canonicalPhone);
    const rowsToMerge = Array.from(
      new Map([...matchingRows, existing].map((row) => [String(row.id || ''), row])).values(),
    );

    targetRow =
      (await consolidateConversationThreadRows({
        userId,
        rows: rowsToMerge,
        canonicalPhone,
      })) || existing;
  }

  const payload = {
    contact_wa_id: nextContactWaId,
    contact_name:
      input.contactName !== undefined
        ? normalizeOptionalString(input.contactName)
        : targetRow.contact_name ?? null,
    display_phone:
      input.displayPhone !== undefined
        ? formatContactIdentity(input.displayPhone) ??
          (canonicalPhone ? `+${canonicalPhone}` : formatContactIdentity(targetRow.display_phone)) ??
          normalizeOptionalString(targetRow.display_phone) ??
          null
        : formatContactIdentity(targetRow.display_phone) ??
          (canonicalPhone ? `+${canonicalPhone}` : normalizeOptionalString(targetRow.display_phone)) ??
          null,
    email:
      input.email !== undefined
        ? normalizeOptionalString(input.email)
        : targetRow.email ?? null,
    source:
      input.source !== undefined
        ? normalizeOptionalString(input.source)
        : targetRow.source ?? null,
    remark:
      input.remark !== undefined
        ? normalizeOptionalString(input.remark)
        : targetRow.remark ?? null,
    avatar_url:
      input.avatarUrl !== undefined
        ? normalizeOptionalString(input.avatarUrl)
        : targetRow.avatar_url ?? null,
    status:
      input.status !== undefined
        ? normalizeStatus(input.status)
        : normalizeStatus(targetRow.status as string | null | undefined),
    priority:
      input.priority !== undefined
        ? normalizePriority(input.priority)
        : normalizePriority(targetRow.priority as string | null | undefined),
    labels: input.labels !== undefined ? normalizeLabels(input.labels) : normalizeLabels(targetRow.labels),
    owner_name:
      input.ownerName !== undefined
        ? normalizeOptionalString(input.ownerName)
        : targetRow.owner_name ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', String(targetRow.id))
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapThread(data as Record<string, unknown>);
}

async function insertMessage(args: {
  userId: string;
  threadId: string;
  waMessageId?: string | null;
  direction: ConversationMessage['direction'];
  messageType: string;
  body?: string | null;
  senderName?: string | null;
  senderWaId?: string | null;
  recipientWaId?: string | null;
  templateName?: string | null;
  status?: string | null;
  raw?: Record<string, unknown>;
}) {
  const payload = {
    user_id: args.userId,
    thread_id: args.threadId,
    wa_message_id: args.waMessageId || null,
    direction: args.direction,
    message_type: args.messageType,
    body: args.body || null,
    sender_name: args.senderName || null,
    sender_wa_id: args.senderWaId || null,
    recipient_wa_id: args.recipientWaId || null,
    template_name: args.templateName || null,
    status: args.status || null,
    raw: args.raw || {},
  };

  if (args.waMessageId) {
    const existing = await adminSupabase
      .from('conversation_messages')
      .select('*')
      .eq('user_id', args.userId)
      .eq('wa_message_id', args.waMessageId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      return mapMessage(existing.data as Record<string, unknown>);
    }
  }

  const { data, error } = await adminSupabase
    .from('conversation_messages')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapMessage(data as Record<string, unknown>);
}

function getOutgoingInteractivePreviewText(payload: WhatsAppMessagePayload) {
  if (payload.type !== 'interactive') {
    return null;
  }

  const bodyText = normalizeOptionalString(payload.interactive.body?.text);
  const headerText =
    payload.interactive.header?.type === 'text'
      ? normalizeOptionalString(payload.interactive.header.text)
      : null;
  const footerText = normalizeOptionalString(payload.interactive.footer?.text);

  return bodyText || headerText || footerText || 'Interactive message';
}

function getOutgoingContactsPreviewText(payload: WhatsAppMessagePayload) {
  if (payload.type !== 'contacts' || payload.contacts.length === 0) {
    return 'Contact card';
  }

  const firstContact = payload.contacts[0];
  const formattedName = normalizeOptionalString(firstContact.name?.formatted_name);
  const phone = normalizeOptionalString(firstContact.phones?.[0]?.phone);
  const email = normalizeOptionalString(firstContact.emails?.[0]?.email);

  return formattedName
    ? `Contact card: ${formattedName}`
    : phone
      ? `Contact card: ${phone}`
      : email
        ? `Contact card: ${email}`
        : 'Contact card';
}

async function describeOutgoingWhatsAppMessage(userId: string, payload: WhatsAppMessagePayload) {
  const rawBase = payload.context?.message_id
    ? {
        context: payload.context,
      }
    : {};

  switch (payload.type) {
    case 'text':
      return {
        messageType: 'text',
        body: payload.text.body,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'text',
          text: payload.text,
        },
      };
    case 'image':
      return {
        messageType: 'image',
        body: payload.image.caption || 'Image attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'image',
          image: payload.image,
        },
      };
    case 'video':
      return {
        messageType: 'video',
        body: payload.video.caption || 'Video attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'video',
          video: payload.video,
        },
      };
    case 'audio':
      return {
        messageType: 'audio',
        body: 'Audio attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'audio',
          audio: payload.audio,
        },
      };
    case 'document':
      return {
        messageType: 'document',
        body: payload.document.caption || payload.document.filename || 'Document attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'document',
          document: payload.document,
        },
      };
    case 'sticker':
      return {
        messageType: 'sticker',
        body: 'Sticker',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'sticker',
          sticker: payload.sticker,
        },
      };
    case 'reaction':
      return {
        messageType: 'reaction',
        body: `Reaction: ${payload.reaction.emoji}`,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'reaction',
          reaction: payload.reaction,
        },
      };
    case 'location': {
      const locationLabel =
        normalizeOptionalString(payload.location.name) ||
        normalizeOptionalString(payload.location.address) ||
        `${payload.location.latitude}, ${payload.location.longitude}`;

      return {
        messageType: 'location',
        body: `Location: ${locationLabel}`,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'location',
          location: payload.location,
        },
      };
    }
    case 'contacts':
      return {
        messageType: 'contacts',
        body: getOutgoingContactsPreviewText(payload),
        templateName: null,
        raw: {
          ...rawBase,
          type: 'contacts',
          contacts: payload.contacts,
        },
      };
    case 'interactive':
      return {
        messageType: 'interactive',
        body: getOutgoingInteractivePreviewText(payload) || 'Interactive message',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'interactive',
          interactive: payload.interactive,
        },
      };
    case 'template': {
      const templateSnapshot = await getStoredTemplateSnapshot(
        userId,
        payload.template.name,
        payload.template.language.code,
      );

      return {
        messageType: 'template',
        body: getTemplatePreviewText(templateSnapshot, payload.template.name),
        templateName: payload.template.name,
        raw: {
          ...rawBase,
          type: 'template',
          template: payload.template,
          template_snapshot: templateSnapshot,
        },
      };
    }
  }
}

async function sendThreadOutgoingWhatsAppMessage(args: {
  user: User;
  metaChannelId: string;
  phoneNumberId: string;
  accessToken: string;
  thread: ConversationThread;
  payload: WhatsAppMessagePayload;
  clientTempId?: string;
  status?: ConversationThread['status'];
}) {
  const remote = await sendRemoteWhatsAppMessage(args.accessToken, args.phoneNumberId, args.payload);
  const createdAt = new Date().toISOString();
  const descriptor = await describeOutgoingWhatsAppMessage(args.user.id, args.payload);
  const nextThread = await upsertThread({
    userId: args.user.id,
    metaChannelId: args.metaChannelId,
    contactWaId: args.thread.contactWaId,
    contactName: args.thread.contactName,
    displayPhone: args.payload.to,
    status: args.status || 'In progress',
    lastMessageText: descriptor.body,
    lastMessageAt: createdAt,
    unreadDelta: 0,
  });

  const message = await insertMessage({
    userId: args.user.id,
    threadId: args.thread.id,
    waMessageId: remote.messages?.[0]?.id || null,
    direction: 'outbound',
    messageType: descriptor.messageType,
    body: descriptor.body,
    senderName: args.user.user_metadata?.full_name || null,
    senderWaId: args.phoneNumberId,
    recipientWaId: args.payload.to,
    templateName: descriptor.templateName,
    status: 'sent',
    raw: {
      client_temp_id: args.clientTempId || null,
      to: args.payload.to,
      recipient_type: args.payload.recipient_type || 'individual',
      ...descriptor.raw,
      remote,
    },
  });

  return {
    remote,
    thread: nextThread,
    message,
  };
}

function buildOutgoingTextPayload(input: SendTextMessageInput): WhatsAppMessagePayload {
  return {
    to: input.to,
    type: 'text',
    context: input.replyToMessageId
      ? {
          message_id: input.replyToMessageId,
        }
      : undefined,
    text: {
      body: input.body,
      preview_url: input.previewUrl === true,
    },
  };
}

function buildOutgoingMediaPayload(input: SendMediaMessageInput): WhatsAppMessagePayload {
  const baseMediaObject = {
    ...(input.mediaId ? { id: input.mediaId } : {}),
    ...(input.mediaLink ? { link: input.mediaLink } : {}),
    ...(input.caption ? { caption: input.caption } : {}),
    ...(input.fileName && input.mediaType === 'document' ? { filename: input.fileName } : {}),
  };
  const context = input.replyToMessageId
    ? {
        message_id: input.replyToMessageId,
      }
    : undefined;

  switch (input.mediaType) {
    case 'image':
      return {
        to: input.to,
        type: 'image',
        context,
        image: baseMediaObject,
      };
    case 'video':
      return {
        to: input.to,
        type: 'video',
        context,
        video: baseMediaObject,
      };
    case 'audio':
      return {
        to: input.to,
        type: 'audio',
        context,
        audio: baseMediaObject,
      };
    case 'document':
      return {
        to: input.to,
        type: 'document',
        context,
        document: baseMediaObject,
      };
  }
}

function buildOutgoingTemplatePayload(input: SendTemplateMessageInput): WhatsAppMessagePayload {
  return {
    to: input.to,
    type: 'template',
    context: input.replyToMessageId
      ? {
          message_id: input.replyToMessageId,
        }
      : undefined,
    template: {
      name: input.templateName,
      language: {
        code: input.language,
      },
      ...(Array.isArray(input.components) && input.components.length > 0
        ? {
            components: input.components,
          }
        : {}),
    },
  };
}

async function getThreadMessages(userId: string, threadId: string, options?: { markRead?: boolean }) {
  const markRead = options?.markRead ?? true;
  const [threadResult, messagesResult] = await Promise.all([
    adminSupabase.from('conversation_threads').select('*').eq('user_id', userId).eq('id', threadId).maybeSingle(),
    adminSupabase
      .from('conversation_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
  ]);

  if (threadResult.error) throw threadResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (!threadResult.data) throw new Error('Conversation not found.');

  if (markRead && Number(threadResult.data.unread_count || 0) > 0) {
    await adminSupabase
      .from('conversation_threads')
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('id', threadId);
  }

  return {
    thread: mapThread({
      ...(threadResult.data as Record<string, unknown>),
      unread_count: markRead ? 0 : threadResult.data.unread_count,
    }),
    messages: (messagesResult.data || []).map((row) => mapMessage(row as Record<string, unknown>)),
  };
}

async function getThreadById(userId: string, threadId: string) {
  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Conversation not found.');
  }

  return mapThread(data as Record<string, unknown>);
}

async function deleteContact(userId: string, threadId: string) {
  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .delete()
    .eq('user_id', userId)
    .eq('id', threadId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Contact not found.');
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    graphVersion,
  });
});

app.get('/api/meta/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === metaWebhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send('Invalid verify token.');
});

app.post('/api/meta/webhook', async (req, res) => {
  try {
    const payload = req.body as {
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: Record<string, unknown>;
        }>;
      }>;
    };

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const changeField =
          change && typeof change.field === 'string' ? change.field.trim().toLowerCase() : null;
        const value = change.value;

        if (changeField === 'payment_configuration_update' && value && isRecord(value)) {
          const wabaId =
            normalizeOptionalIdentifier((entry as Record<string, unknown>).id) ||
            normalizeOptionalIdentifier(value.waba_id);

          if (wabaId) {
            const { data: channel, error: channelError } = await adminSupabase
              .from('meta_channels')
              .select('id, user_id')
              .eq('waba_id', wabaId)
              .maybeSingle();

            if (!channelError && channel) {
              await insertWhatsAppPaymentConfigurationEvent({
                userId: String(channel.user_id),
                metaChannelId: normalizeOptionalString(channel.id),
                value,
              });
            }
          }

          continue;
        }

        const metadata = value && isRecord(value.metadata) ? (value.metadata as Record<string, unknown>) : null;
        const phoneNumberId = normalizeOptionalString(metadata?.phone_number_id);

        if (!phoneNumberId) {
          continue;
        }

        const { data: channel, error: channelError } = await adminSupabase
          .from('meta_channels')
          .select('*')
          .eq('phone_number_id', phoneNumberId)
          .maybeSingle();

        if (channelError || !channel) {
          continue;
        }

        const userId = String(channel.user_id);
        const metaChannelId = String(channel.id);
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const firstContact =
          contacts[0] && isRecord(contacts[0]) ? (contacts[0] as Record<string, unknown>) : null;
        const contactProfile =
          firstContact && isRecord(firstContact.profile) ? (firstContact.profile as Record<string, unknown>) : null;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        const calls = Array.isArray(value?.calls) ? value.calls : [];

        for (const message of messages) {
          if (!isRecord(message)) {
            continue;
          }

          const createdAt = toIsoTimestamp(message.timestamp as string | number | null | undefined) || new Date().toISOString();
          const messageRecord = message as Record<string, unknown>;
          const body = getMessageText(messageRecord);
          const thread = await upsertThread({
            userId,
            metaChannelId,
            contactWaId: String(message.from || firstContact?.wa_id || ''),
            contactName: (contactProfile?.name as string | undefined) || null,
            displayPhone: String(message.from || firstContact?.wa_id || ''),
            status: 'New',
            lastMessageText: body,
            lastMessageAt: createdAt,
            unreadDelta: 1,
          });

          await insertMessage({
            userId,
            threadId: thread.id,
            waMessageId: normalizeOptionalString(message.id) || null,
            direction: 'inbound',
            messageType: normalizeOptionalString(message.type) || 'text',
            body,
            senderName: (contactProfile?.name as string | undefined) || null,
            senderWaId: normalizeOptionalString(message.from) || null,
            recipientWaId: phoneNumberId,
            status: 'received',
            raw: messageRecord,
          });
        }

        for (const call of calls) {
          if (!isRecord(call)) {
            continue;
          }

          await handleCallWebhookEntry({
            userId,
            metaChannelId,
            callRecord: call,
            fallbackContactName: (contactProfile?.name as string | undefined) || null,
          });
        }

        for (const status of statuses) {
          if (!isRecord(status)) {
            continue;
          }

          const handledCallStatus = await handleCallWebhookStatus({
            userId,
            metaChannelId,
            statusRecord: status,
          });

          if (handledCallStatus) {
            continue;
          }

          await adminSupabase
            .from('conversation_messages')
            .update({
              status: normalizeOptionalString(status.status) || null,
            })
            .eq('user_id', userId)
            .eq('wa_message_id', status.id);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, 500, error);
  }
});

function handleMessengerWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === messengerWebhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send('Invalid verify token.');
}

async function handleMessengerWebhookEvent(req: Request, res: Response) {
  try {
    const payload = req.body as {
      object?: string;
      entry?: Array<{
        id?: string;
      }>;
    };

    if (payload.object === 'page') {
      const pageIds = Array.from(
        new Set(
          (payload.entry || [])
            .map((entry) => normalizeOptionalIdentifier(entry.id))
            .filter((pageId): pageId is string => Boolean(pageId)),
        ),
      );

      if (pageIds.length > 0) {
        await adminSupabase
          .from('messenger_channels')
          .update({
            last_synced_at: new Date().toISOString(),
            webhook_last_error: null,
            updated_at: new Date().toISOString(),
          })
          .in('page_id', pageIds);
      }
    }
  } catch (error) {
    console.error('Messenger webhook handling error:', error);
  }

  res.status(200).json({ ok: true });
}

app.get('/api/messenger/webhook', handleMessengerWebhookVerification);
app.get('/api/meta/messenger/webhook', handleMessengerWebhookVerification);

app.post('/api/messenger/webhook', handleMessengerWebhookEvent);
app.post('/api/meta/messenger/webhook', handleMessengerWebhookEvent);

app.get('/api/meta/lead-capture/webhook', async (req, res) => {
  try {
    const mode = normalizeOptionalString(req.query['hub.mode']);
    const verifyToken = normalizeOptionalString(req.query['hub.verify_token']);
    const challenge = normalizeOptionalString(req.query['hub.challenge']);

    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      res.status(400).send('Missing Meta webhook verification parameters.');
      return;
    }

    const configResult = await adminSupabase
      .from('meta_lead_capture_configs')
      .select('user_id')
      .eq('verify_token', verifyToken)
      .maybeSingle();

    if (configResult.error) {
      throw configResult.error;
    }

    if (!configResult.data) {
      res.status(403).send('Invalid verify token.');
      return;
    }

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        verified_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('verify_token', verifyToken);

    res.status(200).send(challenge);
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/meta/lead-capture/webhook', async (req, res) => {
  try {
    const payload = req.body as {
      entry?: Array<Record<string, unknown>>;
    };

    for (const entry of payload.entry || []) {
      if (!isRecord(entry)) {
        continue;
      }

      const pageId = normalizeOptionalIdentifier(entry.id);
      if (pageId) {
        const updateResult = await adminSupabase
          .from('meta_lead_capture_configs')
          .update({
            last_webhook_at: new Date().toISOString(),
            last_error: null,
          })
          .contains('page_ids', [pageId]);

        if (updateResult.error) {
          throw updateResult.error;
        }
      }

      const changes = Array.isArray(entry.changes)
        ? entry.changes.filter((change): change is Record<string, unknown> => isRecord(change))
        : [];

      for (const change of changes) {
        await processMetaLeadCaptureChange(change, pageId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.use('/api', authenticate);

app.get('/api/bootstrap', async (req, res) => {
  try {
    res.json(await getBootstrap(req.authedUser!));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const notificationId =
      req.body && typeof req.body.notificationId === 'string' ? req.body.notificationId : null;
    const markAll = Boolean(req.body?.markAll);
    await markNotificationsRead(req.authedUser!.id, {
      notificationId,
      markAll,
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/notifications/preferences', async (req, res) => {
  try {
    const preferences = await saveNotificationPreferences(
      req.authedUser!.id,
      req.body as NotificationPreferencesUpdateInput,
    );
    res.json({ preferences });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/connection', async (req, res) => {
  try {
    res.json({
      connection: await getStoredEmailConnection(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/connection/verify', async (req, res) => {
  try {
    res.json(await verifyEmailConnectionInput(req.body as EmailConnectionUpsertInput));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/connection', async (req, res) => {
  try {
    res.json({
      connection: await saveEmailConnection(req.authedUser!.id, req.body as EmailConnectionUpsertInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/email/connection', async (req, res) => {
  try {
    res.json(await deleteEmailConnection(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/inbox', async (req, res) => {
  try {
    res.json({
      messages: await fetchEmailInbox(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/templates', async (req, res) => {
  try {
    res.json({
      templates: await getEmailTemplates(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/templates', async (req, res) => {
  try {
    res.json({
      template: await saveEmailTemplate(req.authedUser!.id, req.body as EmailTemplateSaveInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/email/templates/:templateId', async (req, res) => {
  try {
    res.json(await deleteEmailTemplate(req.authedUser!.id, req.params.templateId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/campaigns', async (req, res) => {
  try {
    res.json({
      campaigns: await getEmailCampaigns(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/campaigns/send', async (req, res) => {
  try {
    res.json({
      campaign: await sendEmailCampaign(req.authedUser!.id, req.body as EmailCampaignSendInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/meta-lead-capture', async (req, res) => {
  try {
    res.json(await getMetaLeadCaptureSetup(req.authedUser!.id, req));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-lead-capture', async (req, res) => {
  try {
    res.json(
      await saveMetaLeadCaptureSetup(
        req.authedUser!.id,
        req.body as MetaLeadCaptureSetupInput,
        req,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-lead-capture/subscribe-pages', async (req, res) => {
  try {
    res.json(await activateMetaLeadCapturePageSubscriptions(req.authedUser!.id, req));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/whatsapp-payments', async (req, res) => {
  try {
    res.json(await buildWhatsAppPaymentsSetupResponse(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/whatsapp-payments/:configurationName', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const configuration = await getWhatsAppPaymentConfiguration(
      accessToken,
      String(row.waba_id),
      req.params.configurationName,
    );
    res.json({ configuration });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/whatsapp-payments', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await createWhatsAppPaymentConfiguration(
      accessToken,
      String(row.waba_id),
      req.body as WhatsAppPaymentConfigurationCreateInput,
    );
    res.json(result);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/whatsapp-payments/:configurationName/data-endpoint', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const configuration = await updateWhatsAppPaymentConfigurationDataEndpoint(
      accessToken,
      String(row.waba_id),
      req.params.configurationName,
      req.body as WhatsAppPaymentConfigurationEndpointInput,
    );
    res.json({ configuration });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/whatsapp-payments/:configurationName/oauth-link', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const oauth = await regenerateWhatsAppPaymentConfigurationOAuthLink(
      accessToken,
      String(row.waba_id),
      req.params.configurationName,
      req.body as WhatsAppPaymentConfigurationOAuthLinkInput,
    );
    res.json({ oauth });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/integrations/whatsapp-payments/:configurationName', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await deleteWhatsAppPaymentConfiguration(
      accessToken,
      String(row.waba_id),
      req.params.configurationName,
    );
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('A file upload is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const uploaded = await uploadRemoteMedia(accessToken, String(row.phone_number_id), {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileName: req.file.originalname || 'attachment',
    });

    res.json({
      mediaId: uploaded.id,
      mediaType: guessMediaTypeFromMime(req.file.mimetype),
      fileName: req.file.originalname || 'attachment',
      mimeType: req.file.mimetype || 'application/octet-stream',
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/media/:mediaId', async (req, res) => {
  try {
    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const metadata = await fetchRemoteMediaMetadata(accessToken, req.params.mediaId);

    if (!metadata.url) {
      throw new Error('Media URL was not returned by Meta.');
    }

    const response = await fetch(metadata.url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download media from Meta (${response.status}).`);
    }

    const requestedName = normalizeOptionalString(req.query.fileName);
    if (requestedName) {
      res.setHeader('Content-Disposition', `inline; filename="${requestedName.replace(/"/g, '')}"`);
    }
    if (metadata.mime_type) {
      res.setHeader('Content-Type', metadata.mime_type);
    }
    if (metadata.file_size) {
      res.setHeader('Content-Length', String(metadata.file_size));
    }

    Readable.fromWeb(response.body as any).pipe(res);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const next = await upsertProfile(req.authedUser!, req.body as ProfileUpsertInput);
    res.json({ profile: next });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/profile/photo', upload.single('file'), async (req, res) => {
  let uploadedProfilePictureUrl: string | null = null;

  try {
    if (!req.file) {
      throw new Error('A profile picture upload is required.');
    }

    if (!isSupportedAppProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Profile picture must be a PNG or JPEG image.');
    }

    if (req.file.size > MAX_APP_PROFILE_PHOTO_BYTES) {
      throw new Error('Profile picture must be 5 MB or smaller.');
    }

    uploadedProfilePictureUrl = await uploadAppProfilePhoto({
      userId: req.authedUser!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      purpose: 'profile-picture',
    });

    const profile = await upsertProfile(req.authedUser!, {
      profilePictureUrl: uploadedProfilePictureUrl,
    });

    res.json({ profile });
  } catch (error) {
    if (uploadedProfilePictureUrl) {
      await deleteStoredAppProfilePhoto(uploadedProfilePictureUrl).catch(() => undefined);
    }

    sendError(res, 400, error);
  }
});

app.post('/api/profile/company-logo', upload.single('file'), async (req, res) => {
  let uploadedCompanyLogoUrl: string | null = null;

  try {
    if (!req.file) {
      throw new Error('A company logo upload is required.');
    }

    if (!isSupportedAppProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Company logo must be a PNG or JPEG image.');
    }

    if (req.file.size > MAX_APP_PROFILE_PHOTO_BYTES) {
      throw new Error('Company logo must be 5 MB or smaller.');
    }

    uploadedCompanyLogoUrl = await uploadAppProfilePhoto({
      userId: req.authedUser!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      purpose: 'company-logo',
    });

    const profile = await upsertProfile(req.authedUser!, {
      companyLogoUrl: uploadedCompanyLogoUrl,
    });

    res.json({ profile });
  } catch (error) {
    if (uploadedCompanyLogoUrl) {
      await deleteStoredAppProfilePhoto(uploadedCompanyLogoUrl).catch(() => undefined);
    }

    sendError(res, 400, error);
  }
});

app.get('/api/team/members', async (req, res) => {
  try {
    res.json({ members: await getWorkspaceTeamMembers(req.authedUser!) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/team/invite', async (req, res) => {
  try {
    const member = await inviteWorkspaceTeamMember(req.authedUser!, req.body as InviteWorkspaceUserInput);
    res.json({
      member,
      inviteSent: true,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/quote', async (req, res) => {
  try {
    const { quote } = getBillingQuote(req.body as BillingQuoteInput);
    res.json({ quote });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/subscription', async (req, res) => {
  try {
    const { planCode, billingCycle, couponCode } = req.body as BillingQuoteInput;

    const { subscription, quote } = await createRazorpaySubscription({
      userId: req.authedUser!.id,
      userEmail: req.authedUser!.email,
      planCode,
      billingCycle,
      couponCode,
    });

    res.json({
      keyId: razorpayKeyId,
      subscriptionId: subscription.id,
      businessName: razorpayBusinessName,
      businessLogoUrl: razorpayBusinessLogoUrl || null,
      quote,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/subscription/verify', async (req, res) => {
  try {
    const {
      razorpayPaymentId,
      razorpaySubscriptionId,
      razorpaySignature,
    } = req.body as {
      razorpayPaymentId: string;
      razorpaySubscriptionId: string;
      razorpaySignature: string;
    };

    if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
      throw new Error('razorpayPaymentId, razorpaySubscriptionId, and razorpaySignature are required.');
    }

    verifyRazorpaySubscriptionSignature({
      paymentId: razorpayPaymentId,
      subscriptionId: razorpaySubscriptionId,
      signature: razorpaySignature,
    });

    const subscription = await fetchRazorpaySubscription(razorpaySubscriptionId);
    const planCode = subscription.notes?.plan_code as BillingPlanCode | undefined;
    const billingCycle = normalizeBillingCycle(subscription.notes?.billing_cycle);
    const couponCode = normalizeCouponCode(subscription.notes?.coupon_code);
    const trialEndsAt =
      (typeof subscription.notes?.trial_ends_at === 'string' && subscription.notes.trial_ends_at) ||
      (subscription.start_at ? new Date(subscription.start_at * 1000).toISOString() : null);

    if (!planCode) {
      throw new Error('Razorpay subscription notes are missing plan metadata.');
    }

    if (!billingCycle) {
      throw new Error('Razorpay subscription notes are missing billing cycle metadata.');
    }

    const plan = getBillingPlan(planCode);

    if (!plan) {
      throw new Error('The saved Razorpay plan is not recognized by the app catalog.');
    }

    const profile = await upsertProfile(req.authedUser!, {
      selectedPlan: plan.name,
      billingCycle,
      billingStatus: resolvePersistedBillingStatus(subscription, trialEndsAt),
      trialEndsAt,
      couponCode,
      razorpaySubscriptionId,
    });

    res.json({ profile });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/connect/manual', async (req, res) => {
  try {
    const { accessToken, setupType, wabaId, phoneNumberId } = req.body as {
      accessToken: string;
      setupType: string;
      wabaId: string;
      phoneNumberId: string;
    };

    if (!accessToken || !wabaId || !phoneNumberId || !setupType) {
      throw new Error('setupType, accessToken, wabaId, and phoneNumberId are required.');
    }

    const [phone, waba] = await Promise.all([
      fetchPhoneNumber(accessToken, phoneNumberId),
      fetchWaba(accessToken, wabaId),
    ]);

    const channel = await saveMetaChannel({
      userId: req.authedUser!.id,
      setupType,
      connectionMethod: 'manual',
      accessToken,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      messagingLimitTier: getNormalizedMessagingLimitTier(phone),
      businessAccountName: waba.name || null,
    });

    await syncTemplates(req.authedUser!.id);
    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/connect/embedded', async (req, res) => {
  try {
    const { code, setupType, wabaId, phoneNumberId } = req.body as {
      code: string;
      setupType: string;
      wabaId: string;
      phoneNumberId: string;
    };

    if (!code || !wabaId || !phoneNumberId || !setupType) {
      throw new Error('code, setupType, wabaId, and phoneNumberId are required.');
    }

    const accessToken = await exchangeEmbeddedSignupCode(code, req.get('origin') || undefined);
    const [phone, waba] = await Promise.all([
      fetchPhoneNumber(accessToken, phoneNumberId),
      fetchWaba(accessToken, wabaId),
    ]);

    const channel = await saveMetaChannel({
      userId: req.authedUser!.id,
      setupType,
      connectionMethod: 'embedded_signup',
      accessToken,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      messagingLimitTier: getNormalizedMessagingLimitTier(phone),
      businessAccountName: waba.name || null,
    });

    await syncTemplates(req.authedUser!.id);
    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/channel', async (req, res) => {
  try {
    await adminSupabase.from('meta_templates').delete().eq('user_id', req.authedUser!.id);
    await adminSupabase.from('meta_channels').delete().eq('user_id', req.authedUser!.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/instagram/connect/options', async (req, res) => {
  try {
    const { longLivedToken, accessToken } = req.body as {
      longLivedToken?: string;
      accessToken?: string;
    };
    const normalizedToken = await normalizeInstagramLongLivedToken(longLivedToken, accessToken);
    const accounts = await listInstagramConnectableAccounts(normalizedToken);

    if (accounts.length === 0) {
      throw new Error(
        'Meta did not return any Instagram Professional account connected to a Facebook Page for this login.',
      );
    }

    res.json({ accounts });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/instagram/connect/business-login', async (req, res) => {
  try {
    const { longLivedToken, accessToken, pageId } = req.body as ConnectInstagramBusinessLoginInput;
    const normalizedToken = await normalizeInstagramLongLivedToken(longLivedToken, accessToken);
    const pages = await fetchInstagramPages(normalizedToken);
    const connectablePages = pages.filter(
      (page) =>
        normalizeOptionalString(page.access_token) &&
        normalizeOptionalString(page.instagram_business_account?.id),
    );

    if (connectablePages.length === 0) {
      throw new Error(
        'Meta did not return any Instagram Professional account connected to a Facebook Page for this login.',
      );
    }

    const selectedPage =
      (pageId
        ? connectablePages.find((page) => String(page.id) === pageId)
        : connectablePages.length === 1
          ? connectablePages[0]
          : null) || null;

    if (!selectedPage) {
      throw new Error('Select the Instagram account you want to connect before saving it.');
    }

    const pageAccessToken = normalizeOptionalString(selectedPage.access_token);
    const instagramAccountId = normalizeOptionalString(selectedPage.instagram_business_account?.id);

    if (!pageAccessToken || !instagramAccountId) {
      throw new Error('Meta returned an incomplete Instagram account payload for the selected Page.');
    }

    const profile = await fetchInstagramAccountProfile(
      normalizedToken,
      pageAccessToken,
      instagramAccountId,
    ).catch(() => null);
    const channel = await saveInstagramChannel({
      userId: req.authedUser!.id,
      userAccessToken: normalizedToken,
      pageAccessToken,
      pageId: String(selectedPage.id),
      pageName: normalizeOptionalString(selectedPage.name),
      instagramAccountId,
      instagramUsername: normalizeOptionalString(profile?.username),
      instagramName: normalizeOptionalString(profile?.name),
      profilePictureUrl: normalizeOptionalString(profile?.profile_picture_url),
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/instagram/channel', async (req, res) => {
  try {
    await adminSupabase.from('instagram_channels').delete().eq('user_id', req.authedUser!.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/options', async (req, res) => {
  try {
    const { accessToken } = req.body as {
      accessToken?: string;
    };

    if (!accessToken?.trim()) {
      throw new Error('A Facebook user access token is required to list Messenger Pages.');
    }

    const pages = await listMessengerConnectablePages(accessToken);

    if (pages.length === 0) {
      throw new Error(
        'Meta did not return any Facebook Pages with a usable Page access token for this login.',
      );
    }

    res.json({ pages });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/facebook-login', async (req, res) => {
  try {
    const { accessToken, pageId } = req.body as ConnectMessengerPageLoginInput;

    if (!accessToken?.trim()) {
      throw new Error('A Facebook user access token is required to connect Messenger.');
    }

    const pages = await fetchMessengerPages(accessToken);
    const connectablePages = pages.filter(
      (page) =>
        normalizeOptionalIdentifier(page.id) &&
        normalizeOptionalString(page.access_token),
    );

    if (connectablePages.length === 0) {
      throw new Error(
        'Meta did not return any Facebook Pages with a usable Page access token for this login.',
      );
    }

    const selectedPage =
      (pageId
        ? connectablePages.find((page) => String(page.id) === pageId)
        : connectablePages.length === 1
          ? connectablePages[0]
          : null) || null;

    if (!selectedPage) {
      throw new Error('Select the Facebook Page you want to connect before saving Messenger.');
    }

    const pageAccessToken = normalizeOptionalString(selectedPage.access_token);
    const normalizedPageId = normalizeOptionalIdentifier(selectedPage.id);

    if (!pageAccessToken || !normalizedPageId) {
      throw new Error('Meta returned an incomplete Facebook Page payload for the selected Page.');
    }

    const channel = await connectMessengerChannel({
      userId: req.authedUser!.id,
      connectionMethod: 'facebook_login',
      pageId: normalizedPageId,
      pageAccessToken,
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/manual', async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body as {
      pageId?: string;
      pageAccessToken?: string;
    };

    if (!pageId?.trim() || !pageAccessToken?.trim()) {
      throw new Error('pageId and pageAccessToken are required.');
    }

    const channel = await connectMessengerChannel({
      userId: req.authedUser!.id,
      connectionMethod: 'manual',
      pageId,
      pageAccessToken,
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/messenger/channel', async (req, res) => {
  try {
    await adminSupabase.from('messenger_channels').delete().eq('user_id', req.authedUser!.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates/sync', async (req, res) => {
  try {
    res.json({
      templates: await syncTemplates(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const { name, category, language, body, headerType, headerText, headerMediaSampleUrl, footer, buttons } =
      req.body as CreateTemplateInput;

    if (!name || !category || !language || !body) {
      throw new Error('name, category, language, and body are required.');
    }

    if (!/^[a-z0-9_]+$/.test(name)) {
      throw new Error('Template name may only contain lowercase letters, numbers, and underscores.');
    }

    const components: Array<Record<string, unknown>> = [];
    const normalizedHeaderType = headerType || 'NONE';

    if (normalizedHeaderType === 'TEXT') {
      if (!headerText?.trim()) {
        throw new Error('Header text is required when the campaign title type is Text.');
      }

      const headerComponent: Record<string, unknown> = {
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      };

      const headerExamples = buildTemplateExamples(headerText.trim());
      if (headerExamples) {
        headerComponent.example = {
          header_text: headerExamples,
        };
      }

      components.push(headerComponent);
    }

    if (normalizedHeaderType === 'IMAGE' || normalizedHeaderType === 'VIDEO' || normalizedHeaderType === 'DOCUMENT') {
      if (!headerMediaSampleUrl?.trim()) {
        throw new Error(`A sample media URL is required for ${normalizedHeaderType.toLowerCase()} headers.`);
      }

      components.push({
        type: 'HEADER',
        format: normalizedHeaderType,
        example: {
          header_handle: [headerMediaSampleUrl.trim()],
        },
      });
    }

    const bodyComponent: Record<string, unknown> = {
      type: 'BODY',
      text: body.trim(),
    };

    const bodyExamples = buildTemplateExamples(body.trim());
    if (bodyExamples) {
      bodyComponent.example = {
        body_text: [bodyExamples],
      };
    }

    components.push(bodyComponent);

    if (footer?.trim()) {
      components.push({
        type: 'FOOTER',
        text: footer.trim(),
      });
    }

    const normalizedButtons = (buttons || [])
      .map((button) => {
        if (button.type === 'QUICK_REPLY') {
          return button.text.trim()
            ? {
                type: 'QUICK_REPLY',
                text: button.text.trim(),
              }
            : null;
        }

        return button.text.trim() && button.url.trim()
          ? {
              type: 'URL',
              text: button.text.trim(),
              url: button.url.trim(),
            }
          : null;
      })
      .filter(Boolean);

    if (normalizedButtons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: normalizedButtons,
      });
    }

    await createRemoteTemplate(accessToken, String(row.waba_id), {
      name,
      category,
      language,
      components,
    });

    const templates = await syncTemplates(req.authedUser!.id);
    const created = templates.find((template) => template.name === name && template.language === language);
    res.json({
      template: created || templates[0],
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates/:templateId/duplicate', async (req, res) => {
  try {
    const templateId = req.params.templateId;
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const templateResult = await adminSupabase
      .from('meta_templates')
      .select('*')
      .eq('user_id', req.authedUser!.id)
      .eq('id', templateId)
      .maybeSingle();

    if (templateResult.error) throw templateResult.error;
    if (!templateResult.data) throw new Error('Template not found.');

    const raw = templateResult.data.raw as Record<string, unknown>;
    const sourceName = String(templateResult.data.template_name);
    const bodyComponent = Array.isArray(raw.components)
      ? (raw.components as Array<Record<string, unknown>>).find((component) => component.type === 'BODY')
      : null;

    if (!bodyComponent) {
      throw new Error('Only simple body templates can be duplicated from this build.');
    }

    const duplicateName = `${sourceName}_copy_${Date.now().toString().slice(-6)}`.toLowerCase();

    await createRemoteTemplate(accessToken, String(row.waba_id), {
      name: duplicateName,
      category: String(templateResult.data.category || raw.category || 'UTILITY'),
      language: String(templateResult.data.language || raw.language || 'en_US'),
      components: raw.components as Array<Record<string, unknown>>,
    });

    const templates = await syncTemplates(req.authedUser!.id);
    const created = templates.find((template) => template.name === duplicateName);
    res.json({
      template: created || templates[0],
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/templates/:templateId', async (req, res) => {
  try {
    const templateResult = await adminSupabase
      .from('meta_templates')
      .select('*')
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.templateId)
      .maybeSingle();

    if (templateResult.error) throw templateResult.error;
    if (!templateResult.data) throw new Error('Template not found.');

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await deleteRemoteTemplate(accessToken, String(row.waba_id), String(templateResult.data.template_name));
    await adminSupabase.from('meta_templates').delete().eq('user_id', req.authedUser!.id).eq('id', req.params.templateId);
    res.status(204).send();
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/conversational-automation', async (req, res) => {
  try {
    const { row } = await getChannelWithToken(req.authedUser!.id);

    res.json({
      config: await getConversationalAutomationConfig(req.authedUser!.id, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/conversational-automation', async (req, res) => {
  try {
    const normalizedInput = normalizeConversationalAutomationInput(
      req.body as WhatsAppConversationalAutomationUpdateInput,
    );
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);

    try {
      await configureConversationalAutomation(accessToken, String(row.phone_number_id), normalizedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply automation to WhatsApp.';

      await saveConversationalAutomationConfig({
        userId: req.authedUser!.id,
        channelRow: row,
        input: normalizedInput,
        lastError: message,
      });

      throw error;
    }

    const config = await saveConversationalAutomationConfig({
      userId: req.authedUser!.id,
      channelRow: row,
      input: normalizedInput,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });

    res.json({ config });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/business-profile', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const [snapshot, remoteProfile] = await Promise.all([
      refreshChannelSnapshot(req.authedUser!.id, row, accessToken),
      fetchBusinessProfile(accessToken, String(row.phone_number_id)),
    ]);

    res.json({
      profile: mapBusinessProfile(remoteProfile, snapshot.channelRow, snapshot.phone),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/commerce-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const settings = await fetchCommerceSettings(accessToken, String(row.phone_number_id));

    res.json({
      settings: mapCommerceSettings(settings, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/insights/inbox', async (req, res) => {
  try {
    res.json(
      await getInboxInsights(req.authedUser!.id, {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        channel: req.query.channel,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/commerce-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const settings = await updateCommerceSettings(
      accessToken,
      String(row.phone_number_id),
      req.body as WhatsAppCommerceSettingsUpdateInput,
    );

    res.json({
      settings: mapCommerceSettings(settings, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/business-profile', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const nextProfile = await updateBusinessProfile(
      accessToken,
      String(row.phone_number_id),
      req.body as WhatsAppBusinessProfileUpdateInput,
    );
    const snapshot = await refreshChannelSnapshot(req.authedUser!.id, row, accessToken);

    res.json({
      profile: mapBusinessProfile(nextProfile, snapshot.channelRow, snapshot.phone),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/business-profile/photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('A profile photo upload is required.');
    }

    if (!isSupportedBusinessProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Profile photo must be a PNG or JPEG image.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const handle = await uploadBusinessProfilePhotoHandle(accessToken, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname || 'business-profile-photo',
    });
    const nextProfile = await updateBusinessProfile(accessToken, String(row.phone_number_id), {
      profilePictureHandle: handle,
    });
    const snapshot = await refreshChannelSnapshot(req.authedUser!.id, row, accessToken);

    res.json({
      profile: mapBusinessProfile(nextProfile, snapshot.channelRow, snapshot.phone),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await fetchAllBlockedUsers(accessToken, String(row.phone_number_id)));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const users = Array.isArray((req.body as { users?: unknown[] }).users)
      ? ((req.body as { users?: string[] }).users as string[])
      : [];
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await blockUsers(accessToken, String(row.phone_number_id), users));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const users = Array.isArray((req.body as { users?: unknown[] }).users)
      ? ((req.body as { users?: string[] }).users as string[])
      : [];
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await unblockUsers(accessToken, String(row.phone_number_id), users));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/developer/whatsapp-activities', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const wabaId = normalizeOptionalIdentifier(row.waba_id);
    const limit = getFirstQueryValue(req.query.limit);
    const after = getFirstQueryValue(req.query.after);
    const before = getFirstQueryValue(req.query.before);
    const since = getFirstQueryValue(req.query.since);
    const until = getFirstQueryValue(req.query.until);
    const activityType = getFirstQueryValue(req.query.activityType);

    if (!wabaId) {
      throw new Error('A WhatsApp Business Account must be connected before viewing activity logs.');
    }

    res.json(
      await fetchWhatsAppBusinessActivities(accessToken, wabaId, {
        limit:
          typeof limit === 'string' || typeof limit === 'number'
            ? Number(limit)
            : undefined,
        after: typeof after === 'string' ? after : undefined,
        before: typeof before === 'string' ? before : undefined,
        since: typeof since === 'string' ? since : undefined,
        until: typeof until === 'string' ? until : undefined,
        activityType: typeof activityType === 'string' ? activityType.split(',') : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/calls/permissions', async (req, res) => {
  try {
    const userWaId = typeof req.query.userWaId === 'string' ? req.query.userWaId : '';

    if (!userWaId.trim()) {
      throw new Error('userWaId is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await fetchCallPermissions(accessToken, String(row.phone_number_id), userWaId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/calls', async (req, res) => {
  try {
    const payload = req.body as WhatsAppCallManageInput;
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const response = await manageRemoteCall(accessToken, String(row.phone_number_id), payload);
    const callSession =
      response.callId || payload.callId
        ? await upsertCallSession({
            userId: req.authedUser!.id,
            metaChannelId: String(row.id),
            ...buildCallSessionFromManageAction({
              callId: response.callId || payload.callId || '',
              input: payload,
            }),
          })
        : null;
    const callLog =
      payload.action === 'connect' && payload.to
        ? await insertCallLog({
            userId: req.authedUser!.id,
            callId: response.callId,
            phone: payload.to,
            type: 'outgoing',
          })
        : callSession && isTerminalCallState(callSession.state)
          ? await syncCallLogFromSession(req.authedUser!.id, callSession)
          : null;

    if (callSession && isTerminalCallState(callSession.state)) {
      await upsertCallSummaryMessage({
        userId: req.authedUser!.id,
        metaChannelId: String(row.id),
        session: callSession,
      });
    }

    res.json({
      ...response,
      callLog: callLog || undefined,
      callSession: callSession || undefined,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const contact = await createContact(req.authedUser!.id, req.body as ContactUpsertInput);
    res.json({ contact });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/contacts/:threadId', async (req, res) => {
  try {
    const contact = await updateContact(req.authedUser!.id, req.params.threadId, req.body as ContactUpdateInput);
    res.json({ contact });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/contacts/:threadId', async (req, res) => {
  try {
    await deleteContact(req.authedUser!.id, req.params.threadId);
    res.status(204).end();
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/conversations/:threadId', async (req, res) => {
  try {
    const markRead = req.query.markRead !== 'false';
    res.json(await getThreadMessages(req.authedUser!.id, req.params.threadId, { markRead }));
  } catch (error) {
    sendError(res, 404, error);
  }
});

app.post('/api/conversations/:threadId/messages/text', async (req, res) => {
  try {
    const thread = await getThreadById(req.authedUser!.id, req.params.threadId);
    const payload = req.body as SendTextMessageInput;
    const { body, to, clientTempId } = payload;

    if (!body || !to) {
      throw new Error('body and to are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: buildOutgoingTextPayload(payload),
      clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/:threadId/messages/media', async (req, res) => {
  try {
    const thread = await getThreadById(req.authedUser!.id, req.params.threadId);
    const payload = req.body as SendMediaMessageInput;

    if (!payload.to || (!payload.mediaId && !payload.mediaLink) || !payload.mediaType) {
      throw new Error('to, mediaType, and either mediaId or mediaLink are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: buildOutgoingMediaPayload(payload),
      clientTempId: payload.clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/:threadId/messages', async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const thread = await getThreadById(req.authedUser!.id, threadId);
    const { message, clientTempId } = req.body as SendWhatsAppMessageInput;

    if (!message) {
      throw new Error('message is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: message,
      clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/start', async (req, res) => {
  try {
    const payload = req.body as SendTemplateMessageInput & {
      contactName?: string;
    };
    const { to, templateName, language, contactName, clientTempId } = payload;

    if (!to || !templateName || !language) {
      throw new Error('to, templateName, and language are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const messagePayload = buildOutgoingTemplatePayload(payload);
    const remote = await sendRemoteWhatsAppMessage(accessToken, String(row.phone_number_id), messagePayload);
    const createdAt = new Date().toISOString();
    const descriptor = await describeOutgoingWhatsAppMessage(req.authedUser!.id, messagePayload);
    const thread = await upsertThread({
      userId: req.authedUser!.id,
      metaChannelId: String(row.id),
      contactWaId: to,
      contactName: contactName || to,
      displayPhone: to,
      status: 'New',
      lastMessageText: descriptor.body,
      lastMessageAt: createdAt,
      unreadDelta: 0,
    });

    const message = await insertMessage({
      userId: req.authedUser!.id,
      threadId: thread.id,
      waMessageId: remote.messages?.[0]?.id || null,
      direction: 'outbound',
      messageType: descriptor.messageType,
      body: descriptor.body,
      senderName: req.authedUser!.user_metadata?.full_name || null,
      senderWaId: String(row.phone_number_id),
      recipientWaId: to,
      templateName: descriptor.templateName,
      status: 'sent',
      raw: {
        client_temp_id: clientTempId || null,
        to,
        recipient_type: messagePayload.recipient_type || 'individual',
        ...descriptor.raw,
        remote,
      },
    });

    res.json({ ok: true, threadId: thread.id, thread, message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/template-message', async (req, res) => {
  try {
    const payload = req.body as SendTemplateMessageInput;
    const { to, templateName, language, clientTempId } = payload;

    if (!to || !templateName || !language) {
      throw new Error('to, templateName, and language are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const messagePayload = buildOutgoingTemplatePayload(payload);
    const remote = await sendRemoteWhatsAppMessage(accessToken, String(row.phone_number_id), messagePayload);
    const descriptor = await describeOutgoingWhatsAppMessage(req.authedUser!.id, messagePayload);

    const thread = await upsertThread({
      userId: req.authedUser!.id,
      metaChannelId: String(row.id),
      contactWaId: to,
      contactName: to,
      displayPhone: to,
      status: 'In progress',
      lastMessageText: descriptor.body,
      lastMessageAt: new Date().toISOString(),
      unreadDelta: 0,
    });

    const message = await insertMessage({
      userId: req.authedUser!.id,
      threadId: thread.id,
      waMessageId: remote.messages?.[0]?.id || null,
      direction: 'outbound',
      messageType: descriptor.messageType,
      body: descriptor.body,
      senderName: req.authedUser!.user_metadata?.full_name || null,
      senderWaId: String(row.phone_number_id),
      recipientWaId: to,
      templateName: descriptor.templateName,
      status: 'sent',
      raw: {
        client_temp_id: clientTempId || null,
        to,
        recipient_type: messagePayload.recipient_type || 'individual',
        ...descriptor.raw,
        remote,
      },
    });

    res.json({ ok: true, threadId: thread.id, thread, message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

app.listen(port, () => {
  console.log(`Connektly API server listening on port ${port}`);
});
