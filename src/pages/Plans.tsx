import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  TicketPercent,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import OnboardingTopBar from '../components/OnboardingTopBar';
import {
  BILLING_DEFAULT_TRIAL_DAYS,
  BILLING_GST_RATE,
  BILLING_PLANS,
  buildBillingSummary,
  computeTrialEndsAt,
  formatRupees,
  getBillingPlan,
  getBillingPlanByName,
  type BillingCycle,
  type BillingPlanCode,
  type BillingSummary,
} from '../lib/billing';

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TRIAL_FEATURES = [
  '7 days access with no payment required',
  'Complete onboarding and workspace setup',
  'Try the product before choosing a paid plan',
  'Upgrade to Starter or Pro any time later',
] as const;

type PlanSelection = 'trial' | BillingPlanCode;

let razorpayCheckoutPromise: Promise<boolean> | null = null;

interface RazorpaySuccessPayload {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id: string;
}

interface RazorpayFailurePayload {
  error?: {
    description?: string;
    reason?: string;
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (eventName: string, handler: (payload: RazorpayFailurePayload) => void) => void;
}

interface RazorpayCheckoutConstructor {
  new (options: Record<string, unknown>): RazorpayCheckoutInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}

function loadRazorpayCheckoutScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (razorpayCheckoutPromise) {
    return razorpayCheckoutPromise;
  }

  razorpayCheckoutPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);

    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return razorpayCheckoutPromise;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function buildPrefillContact(countryCode: string | null | undefined, phone: string | null | undefined) {
  const parts = [countryCode?.trim(), phone?.trim()].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function getAnnualSavings(planCode: BillingPlanCode) {
  const plan = getBillingPlan(planCode);

  if (!plan) {
    return 0;
  }

  return Math.max(plan.monthlyBaseAmount * 12 - plan.annualBaseAmount, 0);
}

function isPaidSelection(selection: PlanSelection): selection is BillingPlanCode {
  return selection === 'starter' || selection === 'pro';
}

function getSelectionFromProfile(selectedPlan: string | null | undefined): PlanSelection {
  if (selectedPlan?.trim().toLowerCase() === 'trial') {
    return 'trial';
  }

  return getBillingPlanByName(selectedPlan)?.code ?? 'trial';
}

export default function Plans() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>(
    getSelectionFromProfile(bootstrap?.profile?.selectedPlan),
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(bootstrap?.profile?.billingCycle ?? 'monthly');
  const [couponInput, setCouponInput] = useState(bootstrap?.profile?.couponCode ?? '');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(bootstrap?.profile?.couponCode ?? null);
  const [isCouponOpen, setIsCouponOpen] = useState(Boolean(bootstrap?.profile?.couponCode));
  const [quote, setQuote] = useState<BillingSummary | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isCheckoutReady, setIsCheckoutReady] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  const [isStartingTrial, setIsStartingTrial] = useState(false);

  useEffect(() => {
    setSelectedPlan(getSelectionFromProfile(bootstrap?.profile?.selectedPlan));

    if (bootstrap?.profile?.billingCycle) {
      setBillingCycle(bootstrap.profile.billingCycle);
    }

    setCouponInput(bootstrap?.profile?.couponCode ?? '');
    setAppliedCouponCode(bootstrap?.profile?.couponCode ?? null);
    setIsCouponOpen(Boolean(bootstrap?.profile?.couponCode));
  }, [
    bootstrap?.profile?.billingCycle,
    bootstrap?.profile?.couponCode,
    bootstrap?.profile?.selectedPlan,
  ]);

  useEffect(() => {
    let cancelled = false;

    void loadRazorpayCheckoutScript().then((loaded) => {
      if (!cancelled) {
        setIsCheckoutReady(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isPaidSelection(selectedPlan) || !appliedCouponCode) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setIsApplyingCoupon(true);

    void appApi
      .getBillingQuote({
        planCode: selectedPlan,
        billingCycle,
        couponCode: appliedCouponCode,
      })
      .then((response) => {
        if (!cancelled) {
          setQuote(response.quote);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setQuote(null);
          setAppliedCouponCode(null);
          setCouponFeedback({
            tone: 'error',
            message: nextError instanceof Error ? nextError.message : 'Failed to re-apply the coupon.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsApplyingCoupon(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appliedCouponCode, billingCycle, selectedPlan]);

  const paidPlan = useMemo(
    () => (isPaidSelection(selectedPlan) ? getBillingPlan(selectedPlan) : null),
    [selectedPlan],
  );
  const fallbackSummary = useMemo(
    () =>
      paidPlan
        ? buildBillingSummary({
            planCode: paidPlan.code,
            billingCycle,
          })
        : null,
    [billingCycle, paidPlan],
  );
  const activeSummary = quote ?? fallbackSummary;
  const trialEndsAtPreview = useMemo(
    () => computeTrialEndsAt(new Date(), BILLING_DEFAULT_TRIAL_DAYS).toISOString(),
    [],
  );
  const activeTrialEndsAt =
    bootstrap?.profile?.selectedPlan === 'Trial' && bootstrap?.profile?.trialEndsAt
      ? bootstrap.profile.trialEndsAt
      : trialEndsAtPreview;

  const handleApplyCoupon = async () => {
    if (!isPaidSelection(selectedPlan)) {
      return;
    }

    const normalizedCode = couponInput.trim().toUpperCase();

    if (!normalizedCode) {
      setAppliedCouponCode(null);
      setQuote(null);
      setCouponFeedback({
        tone: 'error',
        message: 'Enter a coupon code before applying it.',
      });
      return;
    }

    try {
      setIsApplyingCoupon(true);
      setError(null);

      const response = await appApi.getBillingQuote({
        planCode: selectedPlan,
        billingCycle,
        couponCode: normalizedCode,
      });

      setAppliedCouponCode(normalizedCode);
      setQuote(response.quote);
      setIsCouponOpen(true);
      setCouponFeedback({
        tone: 'success',
        message: `${normalizedCode} applied to this ${response.quote.planName} plan.`,
      });
    } catch (nextError) {
      setAppliedCouponCode(null);
      setQuote(null);
      setCouponFeedback({
        tone: 'error',
        message: nextError instanceof Error ? nextError.message : 'Failed to apply the coupon.',
      });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setAppliedCouponCode(null);
    setQuote(null);
    setCouponFeedback(null);
    setIsCouponOpen(false);
  };

  const handleStartTrial = async () => {
    try {
      setIsStartingTrial(true);
      setError(null);
      await appApi.saveProfile({
        selectedPlan: 'Trial',
        billingCycle: null,
        billingStatus: 'trialing',
        trialEndsAt: activeTrialEndsAt,
        couponCode: null,
        razorpaySubscriptionId: null,
      });
      await refresh();
      navigate('/onboarding', { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start your free trial.');
    } finally {
      setIsStartingTrial(false);
    }
  };

  const finalizeCheckout = async (response: RazorpaySuccessPayload) => {
    try {
      setIsFinalizingPayment(true);
      setError(null);

      await appApi.verifyBillingSubscription({
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySubscriptionId: response.razorpay_subscription_id,
        razorpaySignature: response.razorpay_signature,
      });

      await refresh();
      navigate('/onboarding', { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Payment verification failed.');
    } finally {
      setIsCheckingOut(false);
      setIsFinalizingPayment(false);
    }
  };

  const handleCheckout = async () => {
    if (!isPaidSelection(selectedPlan) || !activeSummary) {
      return;
    }

    try {
      setError(null);
      setIsCheckingOut(true);

      const scriptLoaded = await loadRazorpayCheckoutScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error('Razorpay checkout failed to load. Refresh the page and try again.');
      }

      const response = await appApi.createBillingSubscription({
        planCode: selectedPlan,
        billingCycle,
        couponCode: appliedCouponCode || undefined,
      });

      setQuote(response.quote);

      const checkout = new window.Razorpay({
        key: response.keyId,
        subscription_id: response.subscriptionId,
        name: response.businessName,
        description: `${response.quote.planName} plan billed ${response.quote.billingCycleLabel.toLowerCase()}.`,
        image: response.businessLogoUrl || undefined,
        prefill: {
          name: bootstrap?.profile?.fullName || undefined,
          email: bootstrap?.profile?.email || undefined,
          contact: buildPrefillContact(bootstrap?.profile?.countryCode, bootstrap?.profile?.phone),
        },
        notes: {
          plan_name: response.quote.planName,
          billing_cycle: response.quote.billingCycleLabel,
          trial_ends_at: response.quote.trialEndsAt,
        },
        theme: {
          color: '#5b45ff',
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setIsCheckingOut(false);
          },
        },
        handler: (payload: RazorpaySuccessPayload) => {
          void finalizeCheckout(payload);
        },
      });

      checkout.on('payment.failed', (payload: RazorpayFailurePayload) => {
        setIsCheckingOut(false);
        setError(
          payload.error?.description ||
            payload.error?.reason ||
            'Razorpay could not authorize the subscription.',
        );
      });

      checkout.open();
    } catch (nextError) {
      setIsCheckingOut(false);
      setError(nextError instanceof Error ? nextError.message : 'Failed to start Razorpay checkout.');
    }
  };

  const summaryButtonDisabled =
    selectedPlan === 'trial'
      ? isStartingTrial
      : !paidPlan || isApplyingCoupon || isCheckingOut || isFinalizingPayment;

  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-20 font-sans sm:px-6 lg:px-8">
      <OnboardingTopBar />

      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mx-auto mb-14 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
            Choose the plan you want to run in production
          </h2>
          <p className="text-gray-500">
            Start a 7-day free trial without paying, or pick a paid plan and continue to Razorpay when you are ready.
          </p>

          <div className="mt-8 flex items-center justify-center space-x-4">
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>
              Bill Monthly
            </span>
            <button
              onClick={() => setBillingCycle((current) => (current === 'monthly' ? 'annual' : 'monthly'))}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-[#5b45ff] transition-colors"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  billingCycle === 'annual' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'annual' ? 'text-gray-900' : 'text-gray-500'}`}>
              Bill Yearly
            </span>
          </div>

          <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[#5b45ff]">
            Trial does not need a billing choice. Paid plans use this cadence.
          </p>
        </motion.div>

        {error ? (
          <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_340px]">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => {
                setSelectedPlan('trial');
                setError(null);
              }}
              className={`rounded-3xl border p-7 text-left transition-all ${
                selectedPlan === 'trial'
                  ? 'border-[#5b45ff] bg-white shadow-[0_16px_40px_rgba(91,69,255,0.12)]'
                  : 'border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-[#d9d2ff]'
              }`}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    No payment required
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900">Trial</h3>
                  <p className="mt-2 text-sm text-gray-500">Use the product first and decide on billing later.</p>
                </div>
                <div className="rounded-2xl bg-[#f3f4f6] px-4 py-2 text-lg font-semibold text-[#5b45ff]">
                  Free
                </div>
              </div>

              <p className="mb-5 text-sm font-medium text-gray-900">7 days access before any payment decision.</p>

              <ul className="space-y-3">
                {TRIAL_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-gray-600">
                    <span className="mt-0.5 rounded-full bg-[#5b45ff] p-1 text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.button>

            {BILLING_PLANS.map((plan, index) => {
              const isSelected = selectedPlan === plan.code;
              const displayAmount =
                billingCycle === 'annual' ? plan.annualBaseAmount : plan.monthlyBaseAmount;
              const annualSavings = getAnnualSavings(plan.code);

              return (
                <motion.button
                  key={plan.code}
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  onClick={() => {
                    setSelectedPlan(plan.code);
                    setError(null);
                  }}
                  className={`rounded-3xl border p-7 text-left transition-all ${
                    isSelected
                      ? 'border-[#5b45ff] bg-white shadow-[0_16px_40px_rgba(91,69,255,0.12)]'
                      : 'border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-[#d9d2ff]'
                  }`}
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      {plan.featured ? (
                        <div className="mb-2 inline-flex rounded-full bg-[#f3f0ff] px-3 py-1 text-xs font-semibold text-[#5b45ff]">
                          Most chosen
                        </div>
                      ) : null}
                      <h3 className="text-2xl font-semibold text-gray-900">{plan.name}</h3>
                      <p className="mt-2 text-sm text-gray-500">{plan.headline}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f3f4f6] px-4 py-2 text-lg font-semibold text-[#5b45ff]">
                      {formatRupees(displayAmount)}
                    </div>
                  </div>

                  <p className="mb-2 text-sm font-medium text-gray-900">
                    {billingCycle === 'annual' ? 'Per Year' : 'Per Month'}
                  </p>
                  <p className="mb-5 text-sm text-gray-500">
                    {billingCycle === 'annual' && annualSavings > 0
                      ? `Save ${formatRupees(annualSavings)} compared to monthly billing.`
                      : '18% GST gets added in the final summary.'}
                  </p>

                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-gray-600">
                        <span className="mt-0.5 rounded-full bg-[#5b45ff] p-1 text-white">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </motion.button>
              );
            })}
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
            className="lg:sticky lg:top-6"
          >
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              {selectedPlan === 'trial' ? (
                <>
                  <div className="border-b border-gray-100 pb-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#5b45ff]">
                      Trial Summary
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900">7-Day Free Trial</h3>
                    <p className="mt-2 text-sm text-gray-500">No payment needed to start onboarding.</p>
                  </div>

                  <div className="mt-4 rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-[#5b45ff]" />
                      <span>
                        Free trial until <span className="font-semibold text-gray-900">{formatDate(activeTrialEndsAt)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>Plan name</span>
                      <span className="font-medium text-gray-900">Trial</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Amount due today</span>
                      <span className="font-medium text-gray-900">{formatRupees(0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>GST charged today</span>
                      <span className="font-medium text-gray-900">{formatRupees(0)}</span>
                    </div>
                  </div>
                </>
              ) : activeSummary ? (
                <>
                  <div className="border-b border-gray-100 pb-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#5b45ff]">
                      Payment Summary
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900">
                      {activeSummary.planName} {activeSummary.billingCycleLabel}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">Trial first, recurring billing starts later.</p>
                  </div>

                  <div className="mt-4 rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-[#5b45ff]" />
                      <span>
                        Free trial until <span className="font-semibold text-gray-900">{formatDate(activeSummary.trialEndsAt)}</span>
                      </span>
                    </div>
                  </div>

                  {couponFeedback ? (
                    <div
                      className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
                        couponFeedback.tone === 'success'
                          ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border border-amber-100 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {couponFeedback.message}
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-gray-100 bg-[#fbfbfd] p-4">
                    <button
                      type="button"
                      onClick={() => setIsCouponOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                        <TicketPercent className="h-4 w-4 text-[#5b45ff]" />
                        <span>{appliedCouponCode ? `Coupon: ${appliedCouponCode}` : 'Apply coupon code'}</span>
                      </div>
                      <span className="text-xs font-medium text-[#5b45ff]">
                        {isCouponOpen ? 'Hide' : 'Show'}
                      </span>
                    </button>

                    {isCouponOpen ? (
                      <div className="mt-4 flex flex-col gap-3">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                          placeholder="Enter coupon code"
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleApplyCoupon()}
                          disabled={isApplyingCoupon}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:opacity-70"
                        >
                          {isApplyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Apply coupon
                        </button>

                        {appliedCouponCode ? (
                          <button
                            type="button"
                            onClick={handleRemoveCoupon}
                            className="text-sm font-medium text-[#5b45ff] transition hover:text-[#4a35e8]"
                          >
                            Remove {appliedCouponCode}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>Plan name</span>
                      <span className="font-medium text-gray-900">{activeSummary.planName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Billing cycle</span>
                      <span className="font-medium text-gray-900">{activeSummary.billingCycleLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Plan subtotal</span>
                      <span className="font-medium text-gray-900">{formatRupees(activeSummary.baseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Coupon discount</span>
                      <span className="font-medium text-gray-900">
                        {activeSummary.discountAmount > 0 ? `- ${formatRupees(activeSummary.discountAmount)}` : 'Not applied'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>GST ({Math.round(BILLING_GST_RATE * 100)}%)</span>
                      <span className="font-medium text-gray-900">{formatRupees(activeSummary.gstAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-[#5b45ff] px-5 py-4 text-white">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-white/80">Recurring total</span>
                      <span className="text-2xl font-semibold">{formatRupees(activeSummary.totalAmount)}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      Renews {activeSummary.recurringLabel} after the trial period.
                    </p>
                  </div>

                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#ede9fe] bg-[#faf7ff] px-4 py-3 text-sm text-gray-600">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5b45ff]" />
                    <p>
                      Razorpay is authorizing a future subscription. During a trial, the gateway can show a small token authorization instead of the full invoice amount.
                    </p>
                  </div>
                </>
              ) : null}

              <button
                onClick={() => void (selectedPlan === 'trial' ? handleStartTrial() : handleCheckout())}
                disabled={summaryButtonDisabled}
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-[#5b45ff] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isStartingTrial || isCheckingOut || isFinalizingPayment ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
                {selectedPlan === 'trial'
                  ? isStartingTrial
                    ? 'Starting free trial...'
                    : 'Start 7-Day Free Trial'
                  : isFinalizingPayment
                    ? 'Verifying payment...'
                    : 'Go to Checkout'}
              </button>

              {selectedPlan !== 'trial' ? (
                <div className="mt-4 flex items-start gap-3 text-sm leading-6 text-gray-500">
                  <BadgePercent className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <p>
                    Razorpay handles the subscription mandate. {isCheckoutReady ? 'Checkout is ready.' : 'Checkout is still loading.'}
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex items-start gap-3 text-sm leading-6 text-gray-500">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <p>
                    This path bypasses payment completely and only saves the trial state to the workspace profile.
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
