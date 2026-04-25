export type BillingPlanCode = 'starter' | 'pro';
export type BillingCycle = 'monthly' | 'annual';
export type BillingStatus = 'trialing' | 'active' | 'inactive' | 'past_due';

export interface BillingCouponDefinition {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  description?: string;
}

export interface BillingAppliedCoupon extends BillingCouponDefinition {
  discountAmount: number;
}

export interface BillingPlanDefinition {
  code: BillingPlanCode;
  name: string;
  headline: string;
  description: string;
  monthlyBaseAmount: number;
  annualBaseAmount: number;
  features: string[];
  featured?: boolean;
}

export interface BillingSummary {
  planCode: BillingPlanCode;
  planName: string;
  billingCycle: BillingCycle;
  billingCycleLabel: string;
  currency: 'INR';
  baseAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  trialDays: number;
  trialEndsAt: string;
  recurringLabel: string;
  coupon: BillingAppliedCoupon | null;
}

export const BILLING_CURRENCY = 'INR' as const;
export const BILLING_GST_RATE = 0.18;
export const BILLING_DEFAULT_TRIAL_DAYS = 7;

export const BILLING_PLANS: BillingPlanDefinition[] = [
  {
    code: 'starter',
    name: 'Starter',
    headline: 'For teams launching their first production inbox.',
    description:
      'Shared inbox, automation baseline, business profile controls, and channel readiness for a lean operating team.',
    monthlyBaseAmount: 99900,
    annualBaseAmount: 999000,
    featured: true,
    features: [
      '1 shared WhatsApp workspace',
      'Template sync and delivery tools',
      'Channel setup and quality visibility',
      'Standard support during onboarding',
      'Workspace profile and contact operations',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    headline: 'For revenue teams that need tighter response operations.',
    description:
      'Everything in Starter, plus faster support, higher-touch operations, and a plan designed for scale-up teams.',
    monthlyBaseAmount: 199900,
    annualBaseAmount: 1999000,
    features: [
      'Priority support with faster response time',
      'Advanced operational workflows',
      'Deeper workspace controls for growing teams',
      'Scale-ready shared inbox setup',
      'Faster rollout for multi-channel execution',
    ],
  },
];

const BILLING_PLAN_MAP = new Map(BILLING_PLANS.map((plan) => [plan.code, plan]));

export function getBillingPlan(planCode: BillingPlanCode) {
  return BILLING_PLAN_MAP.get(planCode) || null;
}

export function getBillingPlanByName(name: string | null | undefined) {
  if (!name) {
    return null;
  }

  const normalized = name.trim().toLowerCase();
  return BILLING_PLANS.find((plan) => plan.name.toLowerCase() === normalized) || null;
}

export function normalizeBillingCycle(value: string | null | undefined): BillingCycle | null {
  return value === 'annual' || value === 'monthly' ? value : null;
}

export function normalizeBillingStatus(value: string | null | undefined): BillingStatus | null {
  return value === 'trialing' || value === 'active' || value === 'inactive' || value === 'past_due'
    ? value
    : null;
}

export function formatBillingCycleLabel(cycle: BillingCycle) {
  return cycle === 'annual' ? 'Annual' : 'Monthly';
}

export function formatRupees(amount: number) {
  const value = amount / 100;
  const hasDecimals = amount % 100 !== 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: BILLING_CURRENCY,
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  }).format(value);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function computeTrialEndsAt(now = new Date(), trialDays = BILLING_DEFAULT_TRIAL_DAYS) {
  return addDays(now, Math.max(trialDays, 0));
}

function getPlanBaseAmount(plan: BillingPlanDefinition, billingCycle: BillingCycle) {
  return billingCycle === 'annual' ? plan.annualBaseAmount : plan.monthlyBaseAmount;
}

function getCouponDiscount(baseAmount: number, coupon?: BillingCouponDefinition | null) {
  if (!coupon) {
    return 0;
  }

  if (coupon.kind === 'percent') {
    return Math.min(baseAmount, Math.round((baseAmount * coupon.value) / 100));
  }

  return Math.min(baseAmount, Math.round(coupon.value * 100));
}

export function buildBillingSummary(args: {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  coupon?: BillingCouponDefinition | null;
  now?: Date;
  trialDays?: number;
}): BillingSummary {
  const plan = getBillingPlan(args.planCode);

  if (!plan) {
    throw new Error(`Unsupported billing plan: ${args.planCode}`);
  }

  const billingCycleLabel = formatBillingCycleLabel(args.billingCycle);
  const baseAmount = getPlanBaseAmount(plan, args.billingCycle);
  const discountAmount = getCouponDiscount(baseAmount, args.coupon);
  const taxableAmount = Math.max(baseAmount - discountAmount, 0);
  const gstAmount = Math.round(taxableAmount * BILLING_GST_RATE);
  const totalAmount = taxableAmount + gstAmount;
  const trialDays = args.trialDays ?? BILLING_DEFAULT_TRIAL_DAYS;
  const trialEndsAt = computeTrialEndsAt(args.now, trialDays).toISOString();

  return {
    planCode: plan.code,
    planName: plan.name,
    billingCycle: args.billingCycle,
    billingCycleLabel,
    currency: BILLING_CURRENCY,
    baseAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    totalAmount,
    trialDays,
    trialEndsAt,
    recurringLabel: args.billingCycle === 'annual' ? 'per year' : 'per month',
    coupon: args.coupon
      ? {
          ...args.coupon,
          discountAmount,
        }
      : null,
  };
}
