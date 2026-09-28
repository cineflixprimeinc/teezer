"use client";

import { type FormEvent, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  BadgeCheck, BarChart3, Check, ChevronRight, Coins, Copy, Crown, Gauge,
  Lock, Palette, Rocket, ShieldCheck, Sparkles, TrendingUp, Video, X as XIcon,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { walletCoinsService, type SubscriptionData } from "@/services/wallets-coins.service";
import { api } from "@/services/api";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";

/**
 * One plan tier from GET /premium - the same shape the app consumes.
 * `pricing` is the server's resolved quote: already converted, already
 * discounted, already country-aware. Nothing here is recomputed client-side.
 */
type PremiumTier = {
  key: string;
  name: string;
  tagline: string | null;
  price: number;
  currency: string;
  period: string;
  is_popular: boolean;
  is_default?: boolean;
  badge_label: string | null;
  can_purchase?: boolean;
  unavailable_message?: string | null;
  trial_days?: number;
  pricing: {
    amount: number;
    currency: string;
    formatted: string;
    has_discount?: boolean;
    compare_at?: number | null;
    discount_percent?: number;
  } | null;
};

/** The server's verdict on a coupon. `valid: false` is a normal answer. */
type CouponCheck = {
  valid: boolean;
  reason: string | null;
  message: string | null;
  discount: number;
  final: number;
  coupon: { code: string; name: string; type: string; value: number } | null;
};

/* ── Plans ────────────────────────────────────────────────────────────────
   The backend only sells `monthly` and `annual` - its intent endpoint validates
   Rule::in(['monthly','annual']). Quarterly is in the design but has no price
   setting, no product and no expiry branch server-side, so it is rendered and
   plainly marked as not yet available rather than pretending to check out. ── */
type Plan = "monthly" | "quarterly" | "annual";
type SellablePlan = "monthly" | "annual";
type Method = "card" | "paypal" | "upi" | "bank";

const QUARTERLY_LIVE = false;

/* ── Benefits ─────────────────────────────────────────────────────────────
   Marketing copy. None of these limits are enforced by the backend today - see
   the note in the PR: the subscription only records a plan and an expiry. ── */
const BENEFITS = [
  { icon: XIcon,     tint: "#fff3ec", color: "#fd4605", title: "Ad-Free Experience", desc: "Enjoy uninterrupted watching." },
  { icon: Crown,     tint: "#fff3ec", color: "#fd4605", title: "Exclusive Badges",   desc: "Stand out with premium badges." },
  { icon: Video,     tint: "#fff3ec", color: "#fd4605", title: "HD Uploads",         desc: "Upload in up to 4K quality." },
  { icon: BarChart3, tint: "#fff3ec", color: "#fd4605", title: "Advanced Analytics", desc: "Deep insights into your performance." },
  { icon: Gauge,     tint: "#fff3ec", color: "#fd4605", title: "Higher Upload Limits", desc: "Upload longer videos and more often." },
  { icon: Palette,   tint: "#fff3ec", color: "#fd4605", title: "Profile Themes",     desc: "Unlock premium profile themes." },
  { icon: Coins,     tint: "#fffbeb", color: "#f59e0b", title: "Bonus Coins",        desc: "Receive 200 coins monthly." },
];

/** free = false | true | a string when the row is a value rather than a tick. */
const COMPARE: { label: string; free: boolean | string; premium: boolean | string }[] = [
  { label: "Ad-Free Experience",   free: false, premium: true },
  { label: "HD / 4K Uploads",      free: false, premium: true },
  { label: "Advanced Analytics",   free: false, premium: true },
  { label: "Higher Upload Limits", free: "5 min", premium: "30 min" },
  { label: "Exclusive Badges",     free: false, premium: true },
  { label: "Profile Boosts",       free: false, premium: true },
  { label: "Early Access",         free: false, premium: true },
  { label: "Bonus Coins / Month",  free: "0",   premium: "200" },
  { label: "Priority Support",     free: false, premium: true },
];

const CREATOR_PERKS = [
  { icon: Rocket,     tint: "#f5f3ff", color: "#7c3aed", title: "Get discovered 4x more", desc: "Boost your visibility" },
  { icon: TrendingUp, tint: "#fffbeb", color: "#f59e0b", title: "Earn more",              desc: "Access premium monetization opportunities" },
  { icon: Sparkles,   tint: "#f0fdfa", color: "#0d9488", title: "Build your brand",       desc: "Exclusive tools to grow your influence" },
];

/* ── Stripe form ──────────────────────────────────────────────────────────── */
function StripeSubPaymentForm({ orderId, plan, onSuccess, onCancel }: {
  orderId: number;
  plan: SellablePlan;
  onSuccess: (sub: SubscriptionData) => Promise<void>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (error) {
        toast.error(error.message ?? "Payment failed.");
      } else if (paymentIntent?.status === "succeeded") {
        const result = await walletCoinsService.captureSubscriptionStripe(orderId, paymentIntent.id);
        await onSuccess(result.subscription);
      }
    } catch {
      toast.error("Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || paying}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fd4605] py-3 text-[13px] font-black text-white transition hover:bg-[#e03e04] disabled:opacity-50"
      >
        <Lock className="h-3.5 w-3.5" />
        {paying ? "Processing…" : `Subscribe - ${plan === "annual" ? "Yearly" : "Monthly"}`}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-[11.5px] text-[#9ca3af] hover:text-[#374151]">
        Cancel
      </button>
    </form>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function StudioPremiumPage() {
  const { isAuthenticated, authReady, user } = useAuthStore();
  const queryClient = useQueryClient();

  const [collapsed, setCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState({ start: new Date(Date.now() - 6 * 86400000), end: new Date() });
  const [payMethod, setPayMethod] = useState<Method | null>(null);

  const [stripeState, setStripeState] = useState<{ clientSecret: string; orderId: number; promise: ReturnType<typeof loadStripe> } | null>(null);
  const [bankState, setBankState] = useState<{ orderId: number; reference: string; amount: number } | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const pendingPaypalOrderRef = useRef<number | null>(null);

  const payConfigQ = useQuery({
    queryKey: ["payment-config"],
    queryFn: walletCoinsService.paymentConfig,
    staleTime: 10 * 60_000,
  });

  const subQ = useQuery({
    queryKey: ["current-subscription"],
    queryFn: walletCoinsService.getCurrentSubscription,
    enabled: !!isAuthenticated,
  });

  const payConfig = payConfigQ.data;
  const sub = subQ.data?.subscription ?? null;
  const monthlyPrice = payConfig?.pricing?.subscription_monthly ?? 4.99;
  const annualPrice = payConfig?.pricing?.subscription_annual ?? 39.99;
  const paypalClientId = payConfig?.paypal?.client_id || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "sb";

  /** Only what the server can actually charge for. */
  /* ── Plan tiers ──
     The same endpoint the app reads, so one admin edit moves both surfaces.
     This page used to price from admin_coin_settings (Monthly/Yearly of a
     single "Premium"), which is a different product model from the tiers the
     admin panel actually edits - hence $39.99 here and $24.99 in the app. */
  const tiersQ = useQuery({
    queryKey: ["premium-tiers"],
    queryFn: async () => {
      const { data } = await api.get("/premium", { params: { surface: "web" } });
      return (data?.data?.plans ?? []) as PremiumTier[];
    },
    staleTime: 5 * 60_000,
  });

  const tiers = tiersQ.data ?? [];
  const tiersLoading = tiersQ.isLoading;

  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);

  /* Default to a tier the customer can actually buy: pre-selecting a refused
     one leaves the CTA dead with no explanation. Falls through to the first
     tier only when every one is blocked, so the page still shows something. */
  const buyableTiers = tiers.filter((t) => t.can_purchase !== false);
  const activeTier =
    tiers.find((t) => t.key === selectedTierKey)
    ?? buyableTiers.find((t) => t.is_default)
    ?? buyableTiers[0]
    ?? tiers[0]
    ?? null;

  const tierBlocked = activeTier?.can_purchase === false;
  const planCurrency = activeTier?.pricing?.currency ?? activeTier?.currency ?? "USD";
  const planPrice = activeTier?.pricing?.amount ?? activeTier?.price ?? monthlyPrice;

  /* The intent endpoint still speaks monthly|annual; the tier's own period is
     what decides which, so a yearly tier is not billed as monthly. */
  const sellableCycle: SellablePlan = activeTier?.period === "year" ? "annual" : "monthly";

  /* Coupon. The server decides what a code is worth; this only renders that
     answer and sends the CODE (never the discount) with the payment intent,
     where it is re-validated and re-priced before anyone is charged. */
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      const { data } = await api.post("/premium/coupon/validate", {
        code, amount: planPrice, currency: "USD",
      });
      setCoupon(data.data as CouponCheck);
    } catch {
      // A failed request is not "invalid code" - blaming the customer for a
      // network problem sends them to support over nothing.
      setCoupon({ valid: false, reason: "network", message: "Couldn't check that code. Try again.", discount: 0, final: 0, coupon: null });
    } finally {
      setCouponBusy(false);
    }
  };

  // Floored at a cent: a 100% coupon lands on 0 and the processors reject a
  // zero charge, which the backend also guards.
  const payableTotal = coupon?.valid ? Math.max(0.01, planPrice - coupon.discount) : planPrice;
  const annualSavingPct = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);
  const annualSavingUsd = monthlyPrice * 12 - annualPrice;
  /* Checkout is gated on the SERVER's verdict now, not on which cycle was
     picked. The backend refuses a blocked tier anyway; stopping it here saves
     a round trip and lets the page say why. */
  const canCheckout = !!activeTier && !tierBlocked;

  /* Only offer gateways the server says are switched on - the page must not be
     able to present a method that isn't configured. */
  const METHODS: { id: Method; label: string; desc: string; on: boolean }[] = [
    { id: "card",   label: "Credit / Debit Card", desc: "Visa, Mastercard, Amex", on: payConfig?.stripe?.enabled ?? true },
    { id: "paypal", label: "PayPal",              desc: "Fast and secure",        on: payConfig?.paypal?.enabled ?? true },
    { id: "upi",    label: "UPI / Razorpay",      desc: "GPay, PhonePe, Paytm",   on: payConfig?.razorpay?.enabled ?? true },
    { id: "bank",   label: "Bank Transfer",       desc: "NEFT / RTGS / SWIFT",    on: payConfig?.bank?.enabled ?? true },
  ];
  const methods = METHODS.filter((m) => m.on);

  const resetPayment = () => { setStripeState(null); setBankState(null); };

  const onSubscribed = async (newSub: SubscriptionData) => {
    setSuccess(true);
    resetPayment();
    setPayMethod(null);
    await queryClient.invalidateQueries({ queryKey: ["current-subscription"] });
    toast.success(`${newSub.plan === "annual" ? "Yearly" : "Monthly"} subscription activated!`);
  };

  const handlePaypalCreateOrder = async () => {
    const data = await walletCoinsService.createSubscriptionIntent(sellableCycle, "paypal", coupon?.valid ? couponCode : null, activeTier?.key ?? null) as Record<string, unknown>;
    pendingPaypalOrderRef.current = data.order_id as number;
    return data.paypal_order_id as string;
  };

  const handlePaypalApprove = async (data: { orderID: string }) => {
    if (!pendingPaypalOrderRef.current) return;
    const result = await walletCoinsService.captureSubscriptionPaypal(pendingPaypalOrderRef.current, data.orderID);
    pendingPaypalOrderRef.current = null;
    await onSubscribed(result.subscription);
  };

  const handleInitStripe = async () => {
    setLoadingPay(true);
    try {
      const data = await walletCoinsService.createSubscriptionIntent(sellableCycle, "card", coupon?.valid ? couponCode : null, activeTier?.key ?? null) as Record<string, unknown>;
      const pk = payConfig?.stripe?.publishable_key;
      if (!pk) { toast.error("Stripe is not configured."); return; }
      setStripeState({
        clientSecret: data.client_secret as string,
        orderId: data.order_id as number,
        promise: loadStripe(pk),
      });
    } catch {
      toast.error("Failed to initialise payment.");
    } finally {
      setLoadingPay(false);
    }
  };

  const handleInitRazorpay = async () => {
    setLoadingPay(true);
    try {
      const data = await walletCoinsService.createSubscriptionIntent(sellableCycle, "upi", coupon?.valid ? couponCode : null, activeTier?.key ?? null) as Record<string, unknown>;

      await new Promise<void>((res, rej) => {
        if ((window as unknown as Record<string, unknown>).Razorpay) { res(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => res();
        s.onerror = () => rej(new Error("Failed to load Razorpay"));
        document.body.appendChild(s);
      });

      const RazorpayClass = (window as unknown as Record<string, unknown>).Razorpay as new (opts: Record<string, unknown>) => { open: () => void };
      const rzp = new RazorpayClass({
        key: data.key_id,
        amount: Math.round((data.price as number) * 100),
        currency: "USD",
        name: "Teezer Premium",
        description: `${sellableCycle === "annual" ? "Yearly" : "Monthly"} Subscription`,
        order_id: data.razorpay_order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const result = await walletCoinsService.captureSubscriptionRazorpay({
            order_id: data.order_id as number,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          await onSubscribed(result.subscription);
        },
      });
      rzp.open();
    } catch {
      toast.error("Failed to initialise Razorpay.");
    } finally {
      setLoadingPay(false);
    }
  };

  const handleInitBank = async () => {
    setLoadingPay(true);
    try {
      const data = await walletCoinsService.createSubscriptionIntent(sellableCycle, "bank", coupon?.valid ? couponCode : null, activeTier?.key ?? null) as Record<string, unknown>;
      setBankState({
        orderId: data.order_id as number,
        reference: data.reference as string,
        amount: data.price as number,
      });
    } catch {
      toast.error("Failed to create the bank transfer order.");
    } finally {
      setLoadingPay(false);
    }
  };

  const handleCancel = async () => {
    if (!sub) return;
    try {
      await walletCoinsService.cancelSubscription();
      await queryClient.invalidateQueries({ queryKey: ["current-subscription"] });
      toast.success("Subscription cancelled. Access continues until it expires.");
    } catch {
      toast.error("Failed to cancel the subscription.");
    }
  };

  if (!authReady || !isAuthenticated) return <div className="min-h-screen bg-[#f8f9fb]" />;

  const stats = user?.profile;

  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD" }}>
      <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
        <StudioSidebarWrapper
          collapsed={collapsed}
          onToggle={() => setCollapsed((o) => !o)}
          activeHref="/studio/premium"
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <StudioTopbarShared
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            searchPlaceholder="Search creators, videos, hashtags…"
          />

          <div className="flex-shrink-0 border-b border-[#f0f0f0] bg-white px-6 py-3.5">
            <div className="mb-1 flex items-center gap-1 text-[11.5px] text-[#9ca3af]">
              <span>Dashboard</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-[#374151]">Premium</span>
            </div>
            <h1 className="text-[20px] font-black leading-tight text-[#111827]">Teezer Premium</h1>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">
              Unlock exclusive features with a Premium subscription.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              {/* ── Main column ───────────────────────────────────────────── */}
              <div className="min-w-0 space-y-4">
                {success && (
                  <div className="flex items-center gap-4 rounded-[16px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
                    <CheckCircle className="h-8 w-8 shrink-0 text-[#16a34a]" />
                    <div>
                      <p className="text-[15px] font-black text-[#15803d]">Subscription activated</p>
                      <p className="text-[12px] text-[#16a34a]">Your Premium benefits are live. Enjoy Teezer Premium.</p>
                    </div>
                  </div>
                )}

                {sub && (
                  <div className="flex items-center justify-between rounded-[16px] border border-[#e0e7ff] bg-[#f5f3ff] p-5">
                    <div className="flex items-center gap-3">
                      <Crown className="h-6 w-6 text-[#7c3aed]" />
                      <div>
                        <p className="text-[14px] font-black text-[#4c1d95]">
                          {sub.plan === "annual" ? "Yearly" : "Monthly"} Premium active
                        </p>
                        <p className="text-[11.5px] text-[#6d28d9]">
                          Renews {sub.expires_at
                            ? new Date(sub.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                            : "-"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCancel}
                      className="rounded-lg border border-[#c4b5fd] px-3 py-1.5 text-[11.5px] font-semibold text-[#6d28d9] transition hover:bg-[#ede9fe]"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Hero */}
                <div className="relative overflow-hidden rounded-[20px] border border-[#fde2e8] bg-gradient-to-br from-[#fff6f1] via-[#fff8fa] to-[#ffeef3] p-7">
                  <div className="relative z-10 max-w-lg">
                    <h2 className="flex items-center gap-2 text-[30px] font-black leading-tight tracking-tight text-[#111827]">
                      Teezer <span className="text-[#fd4605]">Premium</span>
                      <Sparkles className="h-5 w-5 text-[#fbbf24]" />
                    </h2>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">
                      Unlock the ultimate Teezer experience with exclusive features built for creators and fans.
                    </p>
                  </div>

                  {/* Decorative crown - purely ornamental, hidden from a11y tree */}
                  <div aria-hidden className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 md:block">
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd7e2] to-[#ffb3c8]">
                      <Crown className="h-14 w-14 text-[#fd4605]" strokeWidth={1.6} />
                    </div>
                    <span className="absolute -left-10 top-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                      <BadgeCheck className="h-4 w-4 text-[#f59e0b]" />
                    </span>
                    <span className="absolute -left-14 bottom-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                      <Sparkles className="h-4 w-4 text-[#fd4605]" />
                    </span>
                    <span className="absolute -right-6 top-6 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                      <Rocket className="h-4 w-4 text-[#f59e0b]" />
                    </span>
                  </div>
                </div>

                {/* Plans + billing.  Billing spans both rows on the right, so the
                    plan cards and the two panels below share the left 3 columns. */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  {/* The admin's plan tiers, exactly as the app shows them.
                      This used to be Monthly / Quarterly / Yearly priced from
                      admin_coin_settings - a different product model from the
                      app's tiers, which is why the website said $39.99 while
                      the app said $24.99 for what looked like the same thing.
                      Both surfaces now read GET /premium, so one admin edit
                      moves both. */}
                  {tiersLoading && [0, 1, 2].map((i) => (
                    <div key={i} className="h-[168px] animate-pulse rounded-[16px] border border-[#f0f1f5] bg-[#fafafa]" />
                  ))}

                  {!tiersLoading && tiers.map((t) => (
                    <PlanCard
                      key={t.key}
                      title={t.name}
                      price={t.pricing?.amount ?? t.price}
                      currency={t.pricing?.currency ?? t.currency}
                      unit={`/ ${t.period === "year" ? "year" : "month"}`}
                      note={t.tagline ?? ""}
                      badge={t.is_popular && t.badge_label ? t.badge_label.toUpperCase() : undefined}
                      compareAt={t.pricing?.has_discount ? t.pricing.compare_at ?? undefined : undefined}
                      savePct={t.pricing?.has_discount ? t.pricing.discount_percent : undefined}
                      // The server's verdict, rendered rather than recomputed.
                      // A refused tier stays visible and explains itself instead
                      // of vanishing, which reads as a broken page.
                      disabled={t.can_purchase === false}
                      disabledNote={t.unavailable_message ?? undefined}
                      selected={selectedTierKey === t.key}
                      onSelect={() => { setSelectedTierKey(t.key); resetPayment(); }}
                    />
                  ))}

                  {!tiersLoading && tiers.length === 0 && (
                    <div className="rounded-[16px] border border-[#f0f1f5] bg-white p-5 text-[13px] text-[#8A8592] lg:col-span-3">
                      No plans are available right now.
                    </div>
                  )}

                  {/* Billing summary + checkout */}
                  <div className="self-start rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm lg:row-span-2">
                    <div className="border-b border-[#f3f4f6] px-5 py-4">
                      <h3 className="text-[14px] font-black text-[#111827]">Billing Summary</h3>
                    </div>

                    <div className="space-y-2.5 px-5 py-4">
                      <Line label={`${activeTier?.name ?? "Plan"}`} value={fmtMoney(planPrice, planCurrency)} />

                      {/* "You Save (33%) −$19.89" used to sit here as a line
                          item, and the column did not add up: 39.99 − 19.89 +
                          0.00 is 20.10, while the Total underneath said 39.99.
                          It is a COMPARISON against twelve monthly payments,
                          not money taken off this order, so it has moved out of
                          the arithmetic and become a note under the total. Only
                          amounts that actually change what is charged are line
                          items now, which is why the column sums correctly. */}
                      {/* Coupon. The discount shown here is the SERVER's answer,
                          and the same code is sent with the payment intent so the
                          amount charged is the discounted one - a reduced total
                          beside a full-price charge would be worse than no
                          coupons at all. */}
                      {coupon?.valid && (
                        <Line
                          label={`Coupon ${coupon.coupon?.code ?? ""}`}
                          value={`-${fmtMoney(coupon.discount, planCurrency)}`}
                          valueClass="text-[#16a34a]"
                        />
                      )}

                      <Line label="Tax" value="$0.00" />

                      <div className="flex items-end justify-between border-t border-[#f3f4f6] pt-3">
                        <span className="text-[13px] font-black text-[#111827]">Total</span>
                        <span className="text-[24px] font-black leading-none text-[#111827]">
                          {fmtMoney(payableTotal, planCurrency)}
                        </span>
                      </div>

                      {/* Coupon input */}
                      <div className="pt-1">
                        {!coupon?.valid ? (
                          <>
                            <div className="flex gap-2">
                              <input
                                value={couponCode}
                                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCoupon(null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }}
                                placeholder="Coupon code"
                                maxLength={32}
                                className="min-w-0 flex-1 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[#111827] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-[#c9c5d0] focus:border-[#fd4605] focus:bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => void applyCoupon()}
                                disabled={couponBusy || !couponCode.trim()}
                                className="rounded-[10px] bg-[#111827] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#000] disabled:opacity-40"
                              >
                                {couponBusy ? "…" : "Apply"}
                              </button>
                            </div>
                            {coupon && !coupon.valid && (
                              <p className="mt-1.5 text-[11.5px] font-semibold text-[#dc2626]">{coupon.message}</p>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
                            <Check className="h-3.5 w-3.5 flex-none text-[#16a34a]" />
                            <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#15803d]">
                              {coupon.coupon?.name ?? coupon.coupon?.code} applied
                            </span>
                            <button
                              type="button"
                              onClick={() => { setCoupon(null); setCouponCode(""); }}
                              className="flex-none text-[11.5px] font-bold text-[#6b7280] transition hover:text-[#dc2626]"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-[#9ca3af]">
                        {sellableCycle === "annual" ? "Billed once per year" : "Billed monthly"}
                      </p>

                      {/* The old "vs monthly" note belonged to the cycle model and has
                          no meaning now that the cards are tiers - Studio is not
                          a cheaper way of buying Starter. A real discount, when
                          the admin sets one, is shown on the card instead. */}
                    </div>

                    {/* Payment method */}
                    <div className="border-t border-[#f3f4f6] px-5 py-4">
                      <h4 className="mb-3 text-[13px] font-black text-[#111827]">Payment Method</h4>

                      {methods.length === 0 ? (
                        <p className="rounded-[10px] bg-[#f8f9fb] px-3 py-3 text-center text-[11.5px] text-[#9ca3af]">
                          No payment methods are switched on.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {methods.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!canCheckout}
                              onClick={() => { setPayMethod(m.id); resetPayment(); }}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[12px] border px-3 py-3 text-left transition",
                                payMethod === m.id
                                  ? "border-[#fd4605] bg-[#fff6f1]"
                                  : "border-[#e5e7eb] bg-white hover:border-[#fca5a5]",
                                !canCheckout && "cursor-not-allowed opacity-50",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition",
                                  payMethod === m.id ? "border-[#fd4605]" : "border-[#d1d5db]",
                                )}
                              >
                                {payMethod === m.id && <span className="h-2 w-2 rounded-full bg-[#fd4605]" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[12.5px] font-bold text-[#374151]">{m.label}</span>
                                <span className="block truncate text-[10.5px] text-[#9ca3af]">{m.desc}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Checkout */}
                    <div className="border-t border-[#f3f4f6] px-5 pb-5 pt-4">
                      {!canCheckout ? (
                        // The server's own wording, so the refusal reads the
                        // same here as it does on the card and in the app.
                        <div className="rounded-[10px] bg-[#fffbeb] px-3 py-3 text-center text-[12px] font-bold text-[#92400e]">
                          {activeTier?.unavailable_message ?? "This plan isn't available to you right now."}
                        </div>
                      ) : !payMethod ? (
                        <div className="rounded-[10px] bg-[#f3f4f6] py-3 text-center text-[12.5px] font-black text-[#9ca3af]">
                          Select a payment method
                        </div>
                      ) : (
                        <>
                          {payMethod === "card" && !stripeState && (
                            <UpgradeButton
                              loading={loadingPay}
                              onClick={handleInitStripe}
                              label={`Upgrade Now - ${fmtMoney(payableTotal, planCurrency)}`}
                            />
                          )}
                          {payMethod === "card" && stripeState && (
                            <Elements stripe={stripeState.promise} options={{ clientSecret: stripeState.clientSecret }}>
                              <StripeSubPaymentForm
                                orderId={stripeState.orderId}
                                plan={sellableCycle}
                                onSuccess={onSubscribed}
                                onCancel={() => setStripeState(null)}
                              />
                            </Elements>
                          )}

                          {payMethod === "paypal" && (
                            <PayPalButtons
                              style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 40 }}
                              createOrder={handlePaypalCreateOrder}
                              onApprove={handlePaypalApprove}
                              onError={() => toast.error("PayPal payment failed.")}
                            />
                          )}

                          {payMethod === "upi" && (
                            <button
                              onClick={handleInitRazorpay}
                              disabled={loadingPay}
                              className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#5f259f] py-3 text-[13px] font-black text-white transition hover:bg-[#4b1d80] disabled:opacity-60"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              {loadingPay ? "Loading…" : `Pay with UPI - ${fmtMoney(payableTotal, planCurrency)}`}
                            </button>
                          )}

                          {payMethod === "bank" && !bankState && (
                            <button
                              onClick={handleInitBank}
                              disabled={loadingPay}
                              className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#0f766e] py-3 text-[13px] font-black text-white transition hover:bg-[#0d6b63] disabled:opacity-60"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              {loadingPay ? "Creating order…" : "Confirm Bank Transfer"}
                            </button>
                          )}
                          {payMethod === "bank" && bankState && (
                            <div className="space-y-2">
                              <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] p-3">
                                <div className="mb-1 flex items-center justify-between">
                                  <p className="text-[11px] font-bold text-[#92400e]">Order #{bankState.orderId}</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10.5px] font-bold text-[#92400e]">{bankState.reference}</span>
                                    <button
                                      onClick={async () => {
                                        await navigator.clipboard.writeText(bankState.reference);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                      }}
                                    >
                                      {copied
                                        ? <CheckCircle className="h-3.5 w-3.5 text-[#16a34a]" />
                                        : <Copy className="h-3.5 w-3.5 text-[#92400e]" />}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-[10px] text-[#92400e]">
                                  Include this reference in your transfer description.
                                </p>
                              </div>

                              {payConfig?.bank && (
                                <div className="space-y-1.5 rounded-[10px] border border-[#e5e7eb] bg-[#f8f9fb] p-3">
                                  {([
                                    ["Account Holder", payConfig.bank.account_holder],
                                    ["Bank Name", payConfig.bank.bank_name],
                                    ["Account No.", payConfig.bank.account_number],
                                    ["Routing/IFSC", payConfig.bank.routing_number],
                                    ["SWIFT", payConfig.bank.swift_code],
                                  ] as const)
                                    .filter(([, v]) => v)
                                    .map(([label, val]) => (
                                      <div key={label} className="flex items-center justify-between">
                                        <span className="text-[10px] text-[#6b7280]">{label}</span>
                                        <span className="text-[10.5px] font-semibold text-[#111827]">{val}</span>
                                      </div>
                                    ))}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => setBankState(null)}
                                className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]"
                              >
                                Close
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      <p className="mt-2.5 flex items-center justify-center gap-1 text-[10.5px] text-[#9ca3af]">
                        <ShieldCheck className="h-3 w-3" /> Secure payment · Cancel anytime
                      </p>
                    </div>
                  </div>

                  {/* Premium Benefits - spans 2 of the 3 left columns */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm lg:col-span-2">
                    <div className="border-b border-[#f3f4f6] px-5 py-4">
                      <h3 className="text-[14px] font-black text-[#111827]">Premium Benefits</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                      {BENEFITS.map((b) => (
                        <div
                          key={b.title}
                          className="flex gap-3 rounded-[12px] border border-[#f0f1f5] p-3.5 transition hover:border-[#fca5a5]"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: b.tint }}
                          >
                            <b.icon className="h-4 w-4" style={{ color: b.color }} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-black text-[#111827]">{b.title}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-[#6b7280]">{b.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Free vs Premium */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                    <div className="border-b border-[#f3f4f6] px-5 py-4">
                      <h3 className="text-[14px] font-black text-[#111827]">Free vs Premium</h3>
                    </div>
                    <div className="px-5 py-3">
                      <div className="flex items-center justify-between pb-2 text-[10.5px] font-bold text-[#9ca3af]">
                        <span>Feature</span>
                        <span className="flex items-center gap-6">
                          <span>Free</span>
                          <span className="flex items-center gap-1 text-[#fd4605]">
                            <Crown className="h-3 w-3" /> Premium
                          </span>
                        </span>
                      </div>

                      <div className="divide-y divide-[#f8f9fb]">
                        {COMPARE.map((r) => (
                          <div key={r.label} className="flex items-center justify-between py-2.5">
                            <span className="pr-2 text-[11.5px] text-[#374151]">{r.label}</span>
                            <span className="flex shrink-0 items-center gap-6">
                              <span className="flex w-8 justify-center">
                                <Cell value={r.free} />
                              </span>
                              <span className="flex w-12 justify-center">
                                <Cell value={r.premium} premium />
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Right rail ────────────────────────────────────────────── */}
              <div className="space-y-4">
                {/* Premium preview - real account, not a mock-up */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="px-5 py-4">
                    <h3 className="text-[13px] font-black text-[#111827]">Your Premium Preview</h3>
                  </div>
                  <div className="px-4 pb-5">
                    <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5]">
                      <div className="h-16 bg-gradient-to-r from-[#c91f78] via-[#7c3aed] to-[#1d4ed8]" />
                      <div className="-mt-8 flex flex-col items-center px-4 pb-4">
                        <div className="relative">
                          <div className="h-16 w-16 overflow-hidden rounded-full border-[3px] border-white bg-[#f0f1f5]">
                            {user?.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[#fd4605] text-[20px] font-black text-white">
                                {(user?.name ?? user?.username ?? "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#fd4605]">
                            <Crown className="h-3 w-3 text-white" />
                          </span>
                        </div>

                        <p className="mt-2 flex items-center gap-1 text-[13px] font-black text-[#111827]">
                          {user?.username ?? "you"}
                          {user?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#2563eb]" />}
                        </p>

                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#fff3ec] px-2.5 py-0.5 text-[10.5px] font-black text-[#fd4605]">
                          <Crown className="h-3 w-3" /> Premium
                        </span>

                        <div className="mt-3 grid w-full grid-cols-3 text-center">
                          <Stat value={stats?.total_followers} label="Followers" />
                          <Stat value={stats?.total_following} label="Following" />
                          <Stat value={stats?.total_likes} label="Likes" />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#fff3ec] py-2.5 text-[12px] font-black text-[#fd4605] transition hover:bg-[#ffe3ec]"
                    >
                      <Palette className="h-3.5 w-3.5" /> Custom Theme &amp; Badge
                    </button>
                  </div>
                </div>

                {/* Creator perks */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="border-b border-[#f3f4f6] px-5 py-4">
                    <h3 className="text-[13px] font-black text-[#111827]">Creator Perks</h3>
                  </div>
                  <div className="space-y-3.5 px-5 py-4">
                    {CREATOR_PERKS.map((p) => (
                      <div key={p.title} className="flex gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                          style={{ backgroundColor: p.tint }}
                        >
                          <p.icon className="h-4 w-4" style={{ color: p.color }} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12px] font-black text-[#111827]">{p.title}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-[#6b7280]">{p.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What Premium guarantees. Deliberately NOT a member count or a
                    testimonial: we have no endpoint for either, and inventing
                    social proof is not something a billing page should do. */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="border-b border-[#f3f4f6] px-5 py-4">
                    <h3 className="text-[13px] font-black text-[#111827]">No commitment</h3>
                  </div>
                  <div className="space-y-2.5 px-5 py-4">
                    {[
                      "Cancel any time, in one click.",
                      "Keep your benefits until the period ends.",
                      "Payments are processed by Stripe and PayPal.",
                    ].map((t) => (
                      <div key={t} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" />
                        <p className="text-[11.5px] leading-snug text-[#6b7280]">{t}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PayPalScriptProvider>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */
function planLabel(p: Plan): string {
  return p === "annual" ? "Yearly" : p === "quarterly" ? "Quarterly" : "Monthly";
}

/** Money in the quote's own currency, not assumed to be USD. */
function fmtMoney(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    // An unknown ISO code would throw; falling back beats crashing the page.
    return `${currency} ${n.toFixed(2)}`;
  }
}

function PlanCard({
  title, price, currency = "USD", unit, note, badge, savePct, compareAt,
  selected, disabled, disabledNote, onSelect,
}: {
  title: string;
  price: number;
  currency?: string;
  unit: string;
  note: string;
  badge?: string;
  savePct?: number;
  compareAt?: number;
  selected: boolean;
  disabled?: boolean;
  disabledNote?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "relative flex flex-col rounded-[16px] border p-5 text-left transition",
        selected
          ? "border-[#fd4605] bg-white shadow-[0_0_0_2px_#fd4605]"
          : "border-[#e5e7eb] bg-white hover:border-[#fca5a5]",
        disabled && "opacity-70",
      )}
    >
      {badge && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#fd4605] px-2.5 py-0.5 text-[9px] font-black tracking-wide text-white">
          {badge}
        </span>
      )}

      <div className="flex items-start justify-between">
        <p className="text-[14px] font-black text-[#111827]">{title}</p>
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-[#fd4605]" : "border-[#d1d5db]",
          )}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-[#fd4605]" />}
        </span>
      </div>

      <p className="mt-2 text-[22px] font-black leading-none text-[#111827]">
        {fmtMoney(price, currency)}
        <span className="ml-1 text-[11px] font-semibold text-[#9ca3af]">{unit}</span>
      </p>

      {/* Struck-through "was" price. Already converted server-side through the
          same rate as the price beside it, so the saving is real in every
          currency rather than an exchange-rate artefact. */}
      {typeof compareAt === "number" && compareAt > price && (
        <p className="mt-1 text-[12px] font-semibold text-[#9ca3af] line-through">
          {fmtMoney(compareAt, currency)}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={cn("truncate text-[11px]", disabled ? "font-bold text-[#f97316]" : "text-[#9ca3af]")}>
          {disabled ? (disabledNote ?? "Not available here") : note}
        </span>
        {typeof savePct === "number" && savePct > 0 && !disabled && (
          <span className="shrink-0 rounded-full bg-[#fff3ec] px-2 py-0.5 text-[10px] font-black text-[#fd4605]">
            Save {savePct}%
          </span>
        )}
      </div>
    </button>
  );
}

function Line({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] text-[#6b7280]">{label}</span>
      <span className={cn("text-[12.5px] font-bold text-[#111827]", valueClass)}>{value}</span>
    </div>
  );
}

function Cell({ value, premium }: { value: boolean | string; premium?: boolean }) {
  if (typeof value === "string") {
    return (
      <span className={cn("text-[11px] font-black", premium ? "text-[#fd4605]" : "text-[#9ca3af]")}>
        {value}
      </span>
    );
  }
  return value
    ? <Check className="h-3.5 w-3.5 text-[#fd4605]" strokeWidth={3} />
    : <XIcon className="h-3.5 w-3.5 text-[#d1d5db]" strokeWidth={3} />;
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <div>
      <p className="text-[13px] font-black text-[#111827]">{fmtCount(value ?? 0)}</p>
      <p className="text-[10px] text-[#9ca3af]">{label}</p>
    </div>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function UpgradeButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fd4605] py-3 text-[13px] font-black text-white transition hover:bg-[#e03e04] disabled:opacity-60"
    >
      <Crown className="h-4 w-4" />
      {loading ? "Loading…" : label}
    </button>
  );
}
