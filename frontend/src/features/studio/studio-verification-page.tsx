"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, BadgeCheck, Calendar, Check, CheckCircle2,
  ChevronDown, ChevronRight, ChevronUp, Clock, CreditCard, DollarSign,
  ExternalLink, FileText, Globe, HelpCircle, Info, Loader2, Lock, Plus,
  RefreshCw, Search, Shield, ShieldCheck, Star, Upload, User, Users, X,
} from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { walletCoinsService } from "@/services/wallets-coins.service";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";
import {
  studioService,
  type AccountCheck,
  type EligibilityData,
  type PaymentMethod,
  type VerificationData,
} from "@/services/studio.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";

/* ── Brand colours ──────────────────────────────────────────────────────── */
const BRAND = "#fe2c55";

/* ── Plan data ──────────────────────────────────────────────────────────── */
const BV_PLANS = [
  {
    id: "basic", name: "Blue Verified Basic", price: "$5", period: "/month",
    tagline: "Perfect for individuals getting started.",
    badge: null as string | null, save: null as string | null, popular: false,
    features: [
      "Blue badge application access",
      "Identity protection from fake accounts",
      "Verified profile trust label",
      "Account safety alerts",
    ],
  },
  {
    id: "plus", name: "Blue Verified Plus", price: "$10", period: "/month",
    tagline: "Best value for creators.",
    badge: "Most Popular" as string | null, save: null as string | null, popular: true,
    features: [
      "Everything in Basic",
      "Enhanced profile discovery",
      "Social link authenticity check",
      "Verified support chat",
    ],
  },
  {
    id: "business", name: "Blue Verified Business", price: "$20", period: "/month",
    tagline: "For brands & professional accounts.",
    badge: null as string | null, save: null as string | null, popular: false,
    features: [
      "Everything in Plus",
      "Official business/brand label",
      "Brand impersonation protection",
      "Team/brand profile management",
    ],
  },
];

const PLAN_MAP: Record<string, { name: string; price: string; period: string }> = {
  basic:    { name: "Blue Verified Basic",    price: "$5",  period: "/month" },
  plus:     { name: "Blue Verified Plus",     price: "$10", period: "/month" },
  business: { name: "Blue Verified Business", price: "$20", period: "/month" },
};

const SOCIAL_PLATFORMS = [
  { value: "Instagram", label: "Instagram", color: "#e1306c" },
  { value: "YouTube",   label: "YouTube",   color: "#ff0000" },
  { value: "TikTok",    label: "TikTok",    color: "#111827" },
  { value: "Facebook",  label: "Facebook",  color: "#1877f2" },
  { value: "Twitter/X", label: "Twitter/X", color: "#111827" },
  { value: "LinkedIn",  label: "LinkedIn",  color: "#0a66c2" },
  { value: "Website",   label: "Website",   color: "#6b7280" },
  { value: "Other",     label: "Other",     color: "#9ca3af" },
];

const PLATFORM_ICONS: Record<string, string> = {
  "Instagram": "/icons/social/instagram.png",
  "YouTube":   "/icons/social/youtube.png",
  "Facebook":  "/icons/social/facebook.png",
  "Twitter/X": "/icons/social/twitter.png",
};

const FAQ_ITEMS = [
  { q: "How long does verification take?",          a: "Our team typically reviews applications within 3-5 business days." },
  { q: "What happens if my application is denied?", a: "You'll receive a reason. You can address it and reapply after 30 days." },
  { q: "Can I get a refund?",                       a: "Subscriptions are non-refundable once a verification review has begun." },
  { q: "Can I change my plan later?",               a: "Yes. You can upgrade or change your plan from your account settings." },
];

type SocialLink = { platform: string; url: string };
type FileEntry  = { file: File; name: string } | null;

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
function validateFile(file: File, allowPdf: boolean): string | null {
  const allowed = allowPdf
    ? ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    : ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return allowPdf ? "JPG, PNG, or PDF only." : "JPG or PNG only.";
  if (file.size > 10 * 1024 * 1024) return "File must be under 10 MB.";
  return null;
}

/* ── Blue Verified Badge - real filled SVG (same as profile-header) ─────── */

/* ── Step progress bar (card-box style) ─────────────────────────────────── */
const STEP_DEFS = [
  { n: 1, label: "Choose Plan"       },
  { n: 2, label: "Account Review"    },
  { n: 3, label: "Upload Documents"  },
  { n: 4, label: "Submit for Review" },
];

function StepperBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center">
      {STEP_DEFS.flatMap((step, i) => {
        const done   = currentStep > step.n;
        const active = currentStep === step.n;
        const locked = currentStep < step.n;
        const subLabel = done ? "Completed" : active ? "In Progress" : "Locked";

        const card = (
          <div key={`step-${step.n}`} className={cn(
            "flex flex-1 items-center gap-2.5 rounded-[12px] border px-3.5 py-3 transition",
            done   ? "border-[#dcfce7] bg-[#f0fdf4]" :
            active ? "border-[#bfdbfe] bg-[#eff6ff]"  :
                     "border-[#f0f1f5] bg-white",
          )}>
            <div className={cn(
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-black",
              done   ? "bg-[#16a34a] text-white" :
              active ? "bg-[#2563eb] text-white"  :
                       "bg-[#f3f4f6] text-[#9ca3af]",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : step.n}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-[12px] font-extrabold leading-tight",
                done ? "text-[#15803d]" : active ? "text-[#1e3a8a]" : "text-[#9ca3af]",
              )}>{step.label}</p>
              <p className={cn(
                "text-[10.5px] font-semibold",
                done ? "text-[#16a34a]" : active ? "text-[#2563eb]" : "text-[#d1d5db]",
              )}>{subLabel}</p>
            </div>
            {done   && <Check className="h-4 w-4 flex-shrink-0 text-[#16a34a]" />}
            {locked && <Lock  className="h-3.5 w-3.5 flex-shrink-0 text-[#d1d5db]" />}
          </div>
        );

        const connector = i < STEP_DEFS.length - 1 ? (
          <div key={`line-${step.n}`} className="mx-1.5 h-[2px] w-5 flex-shrink-0"
            style={{
              background: done
                ? "#16a34a"
                : "repeating-linear-gradient(to right,#e5e7eb 0,#e5e7eb 3px,transparent 3px,transparent 7px)",
            }}
          />
        ) : null;

        return connector ? [card, connector] : [card];
      })}
    </div>
  );
}

/* ── Subscription status banner (top of steps 2-4) ─────────────────────── */
function PlanStatusBanner({ planId, stepLabel }: { planId: string | null; stepLabel: string }) {
  const plan = planId ? PLAN_MAP[planId] : null;
  return (
    <div className="rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] px-5 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbeafe]">
            <VerifiedBadge size={20} />
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-[#1e3a8a]">Your Blue Verified plan is active</p>
            <p className="text-[11px] text-[#3b5998]">
              {plan ? `${plan.name} · ${plan.price}${plan.period}` : "Plan selected"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[11px] font-bold text-[#1d4ed8]">
          {stepLabel}
        </span>
      </div>
    </div>
  );
}

/* ── Plan Active Banner (step 2 top) ─────────────────────────────────────── */
function PlanActiveBanner({ planId }: { planId: string | null }) {
  const plan = planId ? PLAN_MAP[planId] : null;
  const nextBilling = new Date();
  nextBilling.setFullYear(nextBilling.getFullYear() + 1);
  const billingStr = nextBilling.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const stats = [
    { icon: <Calendar className="h-4 w-4 text-[#9ca3af]" />, label: "Selected Plan",       value: plan?.name ?? "-",  color: "#111827" },
    { icon: <DollarSign className="h-4 w-4 text-[#9ca3af]" />, label: "Billing Status",    value: "Active",           color: "#16a34a" },
    { icon: <Calendar className="h-4 w-4 text-[#9ca3af]" />,   label: "Next Billing Date", value: billingStr,         color: "#111827" },
    { icon: <ShieldCheck className="h-4 w-4 text-[#2563eb]" />, label: "Verification Status", value: "Account Review\nin Progress", color: "#2563eb" },
  ];

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-sm">
      <div className="flex items-center gap-0">
        {/* Badge + text */}
        <div className="flex flex-1 items-center gap-4 px-5 py-5">
          <div className="relative flex-shrink-0">
            <span className="absolute -left-2 -top-1 select-none text-[12px] text-[#93c5fd]">+</span>
            <span className="absolute -right-1 top-0 select-none text-[10px] text-[#bfdbfe]">+</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/blue-verified-badge.png" alt="" className="h-[72px] w-[72px] object-contain drop-shadow-md" />
            <span className="absolute -bottom-1 right-0 select-none text-[9px] text-[#bfdbfe]">+</span>
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-black text-[#111827]">Your Blue Verified plan is active</p>
            <p className="mt-1 max-w-[340px] text-[12px] leading-relaxed text-[#6b7280]">
              Great! Your subscription is successful. Next, we&apos;ll review your account before you continue your verification request.
            </p>
          </div>
        </div>
        {/* Stats */}
        <div className="flex flex-shrink-0 items-stretch divide-x divide-[#f0f1f5] border-l border-[#f0f1f5]">
          {stats.map(({ icon, label, value, color }) => (
            <div key={label} className="flex w-[110px] flex-col items-center justify-center gap-1 px-3 py-4 text-center">
              {icon}
              <p className="mt-0.5 text-[10px] text-[#9ca3af]">{label}</p>
              <p className="whitespace-pre text-[11px] font-bold leading-tight" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Profile preview card (right sidebar) ───────────────────────────────── */
function ProfilePreviewCard({ eligData }: { eligData: EligibilityData | undefined }) {
  const { user: storeUser, isAuthenticated } = useAuthStore();

  /* Fresh fetch so counts are always live */
  const { data: freshUser, isLoading: statsLoading } = useQuery({
    queryKey: ["auth-me-profile-preview"],
    queryFn:  authService.me,
    enabled:  isAuthenticated,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const user = freshUser ?? storeUser;

  /* Stats - eligData from /studio/become-creator is most accurate for views */
  const followers = eligData?.stats.followers    ?? freshUser?.profile?.total_followers  ?? storeUser?.profile?.total_followers  ?? storeUser?.followers_count  ?? 0;
  const views     = eligData?.stats.total_views  ?? freshUser?.total_video_views         ?? storeUser?.total_video_views         ?? 0;
  const following = freshUser?.profile?.total_following ?? storeUser?.profile?.total_following ?? storeUser?.following_count ?? 0;
  const catLabel  = user?.profile?.category ?? user?.categories?.[0] ?? "Content Creator";

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
      <div className="border-b border-[#f3f4f6] px-4 py-3 flex items-center gap-1.5">
        <p className="text-[12.5px] font-extrabold text-[#111827]">Profile Preview</p>
        <HelpCircle className="h-3.5 w-3.5 text-[#9ca3af]" />
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          {user?.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={user.avatar} alt="" className="h-11 w-11 flex-shrink-0 rounded-full object-cover" />
            : (
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-black text-white" style={{ background: BRAND }}>
                {(user?.name || user?.username || "U")[0].toUpperCase()}
              </div>
            )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate text-[13px] font-extrabold text-[#111827]">{user?.name ?? "-"}</p>
              <VerifiedBadge size={15} />
            </div>
            <p className="text-[11px] text-[#9ca3af]">@{user?.username ?? "-"}</p>
            <p className="text-[10.5px] text-[#6b7280]">{catLabel}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-around border-t border-[#f3f4f6] pt-3">
          {statsLoading
            ? [1,2,3].map(i => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-4 w-8 animate-pulse rounded bg-[#f3f4f6]" />
                  <div className="h-2.5 w-12 animate-pulse rounded bg-[#f3f4f6]" />
                </div>
              ))
            : [
                { label: "Followers", val: fmtNum(followers) },
                { label: "Views",     val: fmtNum(views)     },
                { label: "Following", val: fmtNum(following) },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-[13px] font-black text-[#111827]">{val}</p>
                  <p className="text-[10px] text-[#9ca3af]">{label}</p>
                </div>
              ))
          }
        </div>

        <p className="mt-2.5 rounded-[8px] bg-[#f8f9fb] px-2.5 py-1.5 text-center text-[10.5px] text-[#6b7280]">
          This is how your profile will look after approval.
        </p>
      </div>
    </div>
  );
}

/* ── Verification status card ────────────────────────────────────────────── */
function VerificationStatusCard({
  currentStep, vData, isVerified,
}: {
  currentStep: number; vData: VerificationData; isVerified: boolean;
}) {
  // Revoked first: the row stays `approved` after a revocation, so checking "approved"
  // before "revoked" would label a removed badge "Verified".
  const revoked = !!vData?.is_revoked;

  const cfg = revoked
    ? { label: "Badge removed", color: "#dc2626", bg: "#fff5f5", border: "#fecaca", dot: "Removed" }
    : isVerified || vData?.status === "approved"
    ? { label: "Verified",      color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", dot: "Step Completed" }
    : vData?.status === "pending"
    ? { label: "Under Review",  color: "#d97706", bg: "#fffbeb", border: "#fde68a", dot: "In Review"       }
    : vData?.status === "rejected"
    ? { label: "Rejected",      color: "#dc2626", bg: "#fff5f5", border: "#fecaca", dot: "Rejected"        }
    : currentStep > 1
    ? { label: "In Progress",   color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: `Step ${currentStep} of 4` }
    : { label: "Not Started",   color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", dot: "Choose a plan"  };

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
      <div className="border-b border-[#f3f4f6] px-4 py-3">
        <p className="text-[12.5px] font-extrabold text-[#111827]">Verification Status</p>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between rounded-[10px] border px-3 py-2.5"
          style={{ background: cfg.bg, borderColor: cfg.border }}>
          <span className="text-[12.5px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          <div className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: cfg.color + "22", color: cfg.color }}>
            {cfg.dot}
          </div>
        </div>

        {/* Renewal. Blue Verified is a subscription, so a verified creator should be
            able to see when their badge runs out without hunting for it.

            A PERMANENT badge (staff / official accounts) has nothing to renew, and must
            not render as "Renews on: Not available" - that reads as missing data when
            the badge is working exactly as intended. */}
        {/* A removed badge has no renewal - showing one would be telling them to pay for
            something they no longer have. The reason is shown instead. */}
        {revoked && vData?.revoke_reason && (
          <div className="mt-3 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] px-3 py-2.5">
            <p className="text-[12px] font-bold text-[#b91c1c]">Why it was removed</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#dc2626]">{vData.revoke_reason}</p>
          </div>
        )}

        {!revoked && (isVerified || vData?.status === "approved") && (
          vData?.is_permanent ? (
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-[#c7e6fb] bg-[#f2f9fe] px-3 py-2.5">
              <span className="text-[12px] text-[#2b7fb5]">Verification</span>
              <span className="text-[12.5px] font-bold text-[#0b5d8f]">Permanent · never expires</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-[#f0f1f5] bg-[#f9fafb] px-3 py-2.5">
              <span className="text-[12px] text-[#6b7280]">
                {vData?.has_lapsed ? "Expired" : "Renews on"}
              </span>
              <span className={cn(
                "text-[12.5px] font-bold",
                vData?.has_lapsed ? "text-[#dc2626]" : "text-[#111827]",
              )}>
                {vData?.expires_at
                  ? new Date(vData.expires_at).toLocaleDateString("en-US", {
                      day: "numeric", month: "short", year: "numeric",
                    })
                  /* Approved before we tracked expiry. "Not available" is the honest
                     answer; computing "approved + 1 month" would be a confident date
                     about their billing that nothing enforces. */
                  : "Not available"}
              </span>
            </div>
          )
        )}
        {currentStep > 1 && vData?.status !== "pending" && !isVerified && (
          <div className="mt-3 space-y-1.5">
            {[
              { n: 1, label: "Plan Selected",       done: true                                          },
              { n: 2, label: "Account Review",       done: currentStep > 2                              },
              { n: 3, label: "Documents Uploaded",   done: currentStep > 3                              },
              { n: 4, label: "Submitted for Review", done: currentStep > 4                              },
            ].map(row => (
              <div key={row.n} className="flex items-center gap-2">
                <div className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
                  row.done ? "bg-[#16a34a]" : currentStep === row.n ? "bg-[#fe2c55]" : "bg-[#f3f4f6]",
                )}>
                  {row.done
                    ? <Check className="h-2.5 w-2.5 text-white" />
                    : currentStep === row.n
                    ? <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    : <div className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />}
                </div>
                <span className={cn(
                  "text-[11px]",
                  row.done ? "text-[#16a34a] font-semibold" : currentStep === row.n ? "font-semibold text-[#374151]" : "text-[#9ca3af]",
                )}>{row.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── FAQ accordion (right sidebar) ─────────────────────────────────────── */
function FAQCard() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
      <div className="border-b border-[#f3f4f6] px-4 py-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-[#6b7280]" />
          <p className="text-[12.5px] font-extrabold text-[#111827]">Frequently Asked Questions</p>
        </div>
      </div>
      <div className="divide-y divide-[#f3f4f6]">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[#f8f9fb]">
              <span className="text-[12px] font-semibold text-[#374151]">{item.q}</span>
              {open === i
                ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
                : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />}
            </button>
            {open === i && (
              <p className="px-4 pb-3 text-[11.5px] leading-relaxed text-[#6b7280]">{item.a}</p>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-[#f3f4f6] px-4 py-3">
        <button type="button" className="text-[11px] font-semibold text-[#fe2c55] transition hover:underline">
          View all FAQs →
        </button>
      </div>
    </div>
  );
}

/* ── Platform badge ─────────────────────────────────────────────────────── */
function PlatformBadge({ platform, size = 20 }: { platform: string; size?: number }) {
  const cfg     = SOCIAL_PLATFORMS.find(p => p.value === platform);
  const color   = cfg?.color ?? "#6b7280";
  const iconSrc = PLATFORM_ICONS[platform];
  const abbr    = platform === "Twitter/X" ? "X" : platform === "Instagram" ? "Ig" :
    platform === "YouTube" ? "Yt" : platform === "TikTok" ? "Tt" :
    platform === "Facebook" ? "Fb" : platform === "LinkedIn" ? "Li" : platform[0];

  if (iconSrc) return (
    <div className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e5e7eb] bg-white"
      style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} alt={platform} style={{ width: size - 4, height: size - 4 }} className="object-contain" />
    </div>
  );
  return (
    <div className="flex flex-shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38, fontWeight: 900 }}>
      {abbr}
    </div>
  );
}

/* ── Social link row ────────────────────────────────────────────────────── */
function SocialLinkRow({
  link, index, onChange, onRemove, disabled,
}: {
  link: SocialLink; index: number;
  onChange: (i: number, f: keyof SocialLink, v: string) => void;
  onRemove: (i: number) => void; disabled?: boolean;
}) {
  const [pOpen, setPOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <div ref={ref} className="relative flex-shrink-0">
        <button type="button" disabled={disabled} onClick={() => !disabled && setPOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-[8px] border border-[#e5e7eb] bg-white px-2 py-[7px] text-[12px] font-medium transition hover:border-[#d1d5db]">
          <PlatformBadge platform={link.platform} size={18} />
          <span className="text-[#374151]">{link.platform}</span>
          <ChevronDown className={cn("h-3 w-3 text-[#9ca3af] transition-transform", pOpen && "rotate-180")} />
        </button>
        {pOpen && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-[300] w-[150px] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white shadow-xl">
            {SOCIAL_PLATFORMS.map(p => (
              <button key={p.value} type="button" onClick={() => { onChange(index, "platform", p.value); setPOpen(false); }}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-[12px] text-[#374151] hover:bg-[#f8f9fb]">
                <PlatformBadge platform={p.value} size={16} />
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="url" value={link.url} disabled={disabled} onChange={e => onChange(index, "url", e.target.value)}
        placeholder={`https://${link.platform.toLowerCase().replace("/x", "")}.com/@handle`}
        className="min-w-0 flex-1 rounded-[8px] border border-[#e5e7eb] bg-white px-2.5 py-[7px] text-[12px] text-[#374151] outline-none transition placeholder:text-[#c9cdd4] focus:border-[#fe2c55] disabled:bg-[#f9fafb] disabled:opacity-70" />
      <button type="button" disabled={disabled} onClick={() => onRemove(index)}
        className="flex-shrink-0 rounded-full p-1 text-[#9ca3af] transition hover:bg-[#fee2e2] hover:text-[#dc2626]">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── File upload box ────────────────────────────────────────────────────── */
function FileUploadBox({
  label, subtext, entry, onFile, allowPdf = true, optional = false, disabled = false,
}: {
  label: string; subtext: string; entry: FileEntry;
  onFile: (e: FileEntry) => void; allowPdf?: boolean; optional?: boolean; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file, allowPdf);
    if (err) { toast.error(err); return; }
    onFile({ file, name: file.name });
    e.target.value = "";
  }
  return (
    // Plain vertical padding, no first:pt-0 / last:pb-0.
    //
    // Those two modifiers assumed the CONTAINER supplied the outer breathing room, and it
    // didn't - the wrappers were `px-5` with no py. So the first row's text sat flush
    // against the header's divider and the last row's "JPG, PNG up to 10 MB" sat flush on
    // the card's bottom border. In Supporting Documents the single box is BOTH first and
    // last, so it had zero vertical padding at all and the card closed on top of its own
    // text. The padding now lives in one place instead of being split between two.
    <div className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-[#374151]">
            {label}
            {!optional && <span className="ml-0.5 text-[#fe2c55]">*</span>}
            {optional  && <span className="ml-1 text-[11px] font-normal text-[#9ca3af]">(Optional)</span>}
          </p>
          <p className="text-[11px] leading-snug text-[#9ca3af]">{subtext}</p>
        </div>
        {entry ? (
          <button type="button" onClick={() => onFile(null)} disabled={disabled}
            className="flex flex-shrink-0 items-center gap-1 rounded-[8px] border border-[#fecaca] bg-[#fff5f5] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#dc2626] transition hover:bg-[#fee2e2]">
            <X className="h-3 w-3" />Remove
          </button>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />Upload
          </button>
        )}
      </div>
      {entry ? (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-[6px] bg-[#f0fdf4] px-2 py-1">
          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-[#16a34a]" />
          <span className="truncate text-[10.5px] font-semibold text-[#166534]">{entry.name}</span>
        </div>
      ) : (
        <p className="mt-1 text-[10.5px] text-[#9ca3af]">{allowPdf ? "JPG, PNG, PDF" : "JPG, PNG"} up to 10 MB</p>
      )}
      <input ref={inputRef} type="file"
        accept={allowPdf ? ".jpg,.jpeg,.png,.pdf,.webp" : ".jpg,.jpeg,.png,.webp"}
        className="hidden" onChange={handleChange} disabled={disabled} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 1 - CHOOSE PLAN
══════════════════════════════════════════════════════════════════════ */
function ChoosePlanStep({
  selectedPlanId, onSelectPlan, onNext, isSubmitting,
}: {
  selectedPlanId: string | null;
  onSelectPlan: (id: string | null) => void;
  onNext: () => void;
  isSubmitting: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"plans" | "note">("plans");
  const plan = selectedPlanId ? PLAN_MAP[selectedPlanId] : null;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-[12px] border border-[#f0f1f5] bg-[#f8f9fb] p-1">
        <button type="button"
          onClick={() => setActiveTab("plans")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-bold transition",
            activeTab === "plans"
              ? "bg-white text-[#111827] shadow-sm"
              : "text-[#6b7280] hover:text-[#374151]",
          )}>
          <CreditCard className="h-4 w-4" /> Choose Plan
        </button>
        <button type="button"
          onClick={() => setActiveTab("note")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-bold transition",
            activeTab === "note"
              ? "bg-white text-[#15803d] shadow-sm"
              : "text-[#6b7280] hover:text-[#374151]",
          )}>
          <Info className="h-4 w-4" /> Important Note
        </button>
      </div>

      {/* Important Note tab */}
      {activeTab === "note" && (
        <div className="overflow-hidden rounded-[16px] border border-[#bbf7d0] bg-gradient-to-b from-[#f0fdf4] to-[#dcfce7]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[#bbf7d0] bg-[#f0fdf4] px-6 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#16a34a]">
              <Info className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-black text-[#14532d]">Important Note - Please Read Before Subscribing</p>
              <p className="text-[12px] text-[#166534]">Understanding the Blue Verified process</p>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            {/* Key alert */}
            <div className="flex items-start gap-3 rounded-[12px] border border-[#86efac] bg-white px-4 py-3.5">
              <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
                <AlertCircle className="h-3.5 w-3.5 text-[#16a34a]" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#14532d]">Payment does NOT automatically grant the Blue Verified badge.</p>
                <p className="mt-0.5 text-[12px] text-[#166534]">
                  Your subscription unlocks the ability to apply. The badge is only granted after our team manually reviews and approves your account.
                </p>
              </div>
            </div>

            {/* Steps list */}
            <div className="rounded-[12px] border border-[#86efac] bg-white px-4 py-4">
              <p className="mb-3 text-[12.5px] font-extrabold text-[#14532d]">How the badge approval process works:</p>
              <div className="space-y-3">
                {[
                  { n: 1, title: "Subscribe to a plan",          desc: "Choose Basic, Plus, or Business and complete payment to unlock your application." },
                  { n: 2, title: "Complete account review",      desc: "We verify your profile completeness, account authenticity, and community standing." },
                  { n: 3, title: "Submit identity documents",    desc: "Upload a valid government ID and selfie. Supporting documents are optional but help." },
                  { n: 4, title: "Wait for admin review",        desc: "Our team manually reviews every application. This typically takes 3-5 business days." },
                  { n: 5, title: "Badge granted (if approved)",  desc: "Only after admin approval will the Blue Verified badge appear on your profile." },
                ].map(s => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-[11px] font-black text-white">
                      {s.n}
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-[#166534]">{s.title}</p>
                      <p className="text-[11.5px] leading-snug text-[#4ade80] brightness-0 invert-0 text-opacity-80" style={{ color: "#3d6b48" }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Eligibility requirements */}
            <div className="rounded-[12px] border border-[#86efac] bg-white px-4 py-4">
              <p className="mb-3 text-[12.5px] font-extrabold text-[#14532d]">Eligibility requirements for approval:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Complete profile (photo, name, username)",
                  "No active community violations",
                  "Valid government-issued ID",
                  "Real and authentic identity",
                  "Public presence or notable activity",
                  "Active account with original content",
                ].map(r => (
                  <div key={r} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#16a34a]" />
                    <span className="text-[11.5px] text-[#166534]">{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Refund + rejection note */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-[#86efac] bg-white px-3.5 py-3">
                <p className="text-[12px] font-bold text-[#14532d]">If rejected</p>
                <p className="mt-1 text-[11px] text-[#3d6b48]">
                  You&apos;ll receive the reason. You may reapply after addressing the issues. Subscription remains active.
                </p>
              </div>
              <div className="rounded-[10px] border border-[#86efac] bg-white px-3.5 py-3">
                <p className="text-[12px] font-bold text-[#14532d]">Refund policy</p>
                <p className="mt-1 text-[11px] text-[#3d6b48]">
                  Subscriptions are non-refundable once a verification review has begun. Cancel anytime to stop future billing.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between rounded-[12px] border border-[#86efac] bg-[#16a34a] px-5 py-3.5">
              <p className="text-[13px] font-bold text-white">Ready to apply? Choose a plan to get started.</p>
              <button type="button" onClick={() => setActiveTab("plans")}
                className="flex items-center gap-1.5 rounded-[8px] bg-white px-4 py-2 text-[12.5px] font-bold text-[#16a34a] transition hover:bg-[#f0fdf4]">
                View Plans <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plans tab content */}
      {activeTab === "plans" && <>
      {/* Pricing cards */}
      <div id="bv-plans-section" className="grid grid-cols-3 gap-4">
        {BV_PLANS.map(p => {
          const isSelected = selectedPlanId === p.id;
          return (
            <div key={p.id}
              className={cn(
                "relative flex flex-col overflow-visible rounded-[16px] border bg-white shadow-sm transition cursor-pointer",
                isSelected ? "border-[#1d4ed8] ring-2 ring-[#bfdbfe]" : p.popular ? "border-[#fca5a5]" : "border-[#f0f1f5]",
              )}
              onClick={() => onSelectPlan(p.id)}
            >
              {/* Popular badge */}
              {p.badge && (
                <div className="absolute -top-3.5 left-0 right-0 flex justify-center">
                  <span className="flex items-center gap-1 rounded-full bg-[#fee2e2] px-3 py-1 text-[11px] font-bold text-[#fe2c55]">
                    <Star className="h-3 w-3 fill-[#fe2c55]" /> {p.badge}
                  </span>
                </div>
              )}
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#1d4ed8]">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              <div className={cn("rounded-t-[16px] px-5 pt-6 pb-4", p.popular && !isSelected && "bg-[#fff5f7]", isSelected && "bg-[#eff6ff]")}>
                <p className="text-[13.5px] font-extrabold text-[#111827]">{p.name}</p>
                <div className="mt-2 flex items-end gap-1.5">
                  <span className="text-[28px] font-black leading-none text-[#111827]">{p.price}</span>
                  <span className="mb-0.5 text-[13px] text-[#6b7280]">{p.period}</span>
                  {p.save && (
                    <span className="mb-0.5 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-bold text-[#fe2c55]">
                      {p.save}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-[#6b7280]">{p.tagline}</p>
              </div>
              <div className="flex-1 space-y-2 px-5 py-3">
                {p.features.map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#16a34a]" />
                    <span className="text-[12px] text-[#374151]">{f}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5 pt-2">
                <button type="button" onClick={e => { e.stopPropagation(); onSelectPlan(p.id); }}
                  className={cn(
                    "w-full rounded-[10px] py-2.5 text-[12.5px] font-bold transition active:scale-[0.98]",
                    isSelected
                      ? "bg-[#1d4ed8] text-white"
                      : p.popular
                      ? "bg-[#fe2c55] text-white hover:bg-[#e0193f]"
                      : "border border-[#fe2c55] text-[#fe2c55] hover:bg-[#fff5f7]",
                  )}>
                  {isSelected ? "Selected ✓" : `Choose ${p.name.replace("Blue Verified ", "")}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Selected plan summary bar (matches screenshot exactly) ─────── */}
      {plan && (() => {
        const fullPlan = BV_PLANS.find(p => p.id === selectedPlanId);
        return (
          <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb] bg-white shadow-sm">
            <div className="flex items-stretch">
              {/* Left - icon + name + price */}
              <div className="flex min-w-[200px] items-center gap-3 border-r border-[#f3f4f6] px-5 py-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#fff0f3]">
                  <CreditCard className="h-5 w-5 text-[#fe2c55]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#9ca3af]">Selected Plan</p>
                  <p className="text-[14px] font-extrabold leading-tight text-[#111827]">{plan.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[13.5px] font-black text-[#111827]">{plan.price}</span>
                    <span className="text-[11.5px] text-[#6b7280]">{plan.period}</span>
                    {fullPlan?.save && (
                      <span className="rounded-full bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold text-[#fe2c55]">
                        {fullPlan.save}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle - features */}
              <div className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-4">
                {(fullPlan?.features ?? []).map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#16a34a]" />
                    <span className="text-[12px] text-[#374151]">{f}</span>
                  </div>
                ))}
              </div>

              {/* Right - badge + buttons */}
              <div className="flex flex-shrink-0 flex-col items-stretch justify-center gap-2 border-l border-[#f3f4f6] px-5 py-4">
                <div className="flex items-center justify-end gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#16a34a]" />
                  <span className="text-[11px] font-bold text-[#16a34a]">Plan Selected</span>
                </div>
                <button type="button" onClick={onNext} disabled={isSubmitting}
                  className="flex items-center justify-center gap-2 rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#e0193f] active:scale-[0.98] disabled:opacity-60">
                  {isSubmitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</>
                    : <>Next: Account Review <ChevronRight className="h-4 w-4" /></>}
                </button>
                <button type="button" onClick={() => onSelectPlan(null)}
                  className="flex items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white px-5 py-2 text-[12.5px] font-semibold text-[#374151] transition hover:border-[#d1d5db] hover:bg-[#f8f9fb]">
                  Change Plan
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Warning banner (matches screenshot) ─────────────────────────── */}
      <div className="flex items-center gap-4 rounded-[12px] border border-[#fde68a] bg-[#fffbeb] px-5 py-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#fbbf24]">
          <Check className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-[#92400e]">
            Important: The badge is not granted by payment alone.
          </p>
          <p className="text-[11.5px] text-[#a16207]">
            Subscription is required to apply. Badge displays only after approval.
          </p>
        </div>
        <button type="button"
          className="flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold text-[#d97706] transition hover:underline">
          Learn more <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── How verification works (matches screenshot) ───────────────────── */}
      <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="px-6 pt-5 pb-0">
          <p className="text-[14px] font-extrabold text-[#111827]">How verification works</p>
        </div>
        <div className="px-6 py-6">
          <div className="flex items-start">
            {[
              { n: 1, Icon: FileText,   title: "Choose Plan",            desc: "Pick the plan that fits you and subscribe securely."            },
              { n: 2, Icon: CreditCard, title: "Subscribe",              desc: "Complete payment and activate your subscription."              },
              { n: 3, Icon: User,       title: "Submit Identity Review", desc: "Provide your ID and required information for review."          },
              { n: 4, Icon: BadgeCheck, title: "Get Approved",           desc: "Once approved, your Blue Verified badge goes live."            },
            ].map((step, i) => (
              <div key={step.n} className="flex flex-1 items-start">
                {/* Step column */}
                <div className="flex flex-col items-center text-center px-2 flex-1">
                  {/* Number circle */}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fe2c55] text-[13px] font-black text-white shadow-sm ring-4 ring-white">
                    {step.n}
                  </div>
                  {/* Icon circle */}
                  <div className="mt-3 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#f0f1f5] bg-[#f8f9fb] shadow-sm">
                    <step.Icon className="h-5 w-5 text-[#6b7280]" />
                  </div>
                  <p className="mt-2.5 text-[12.5px] font-bold text-[#111827]">{step.title}</p>
                  <p className="mt-1 text-[10.5px] leading-snug text-[#6b7280]">{step.desc}</p>
                </div>
                {/* Dashed connector (between steps) */}
                {i < 3 && (
                  <div className="mt-4 flex-shrink-0 self-start pt-0">
                    <div className="flex items-center gap-[3px] pt-[2px]">
                      {Array.from({ length: 5 }).map((_, di) => (
                        <div key={di} className="h-[2px] w-[5px] rounded-full bg-[#d1d5db]" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 2 - ACCOUNT REVIEW
══════════════════════════════════════════════════════════════════════ */
const CHECK_ROW_ICONS: Record<string, React.ReactNode> = {
  subscription:          <CreditCard  className="h-3.5 w-3.5" />,
  profile_completeness:  <User        className="h-3.5 w-3.5" />,
  account_authenticity:  <Shield      className="h-3.5 w-3.5" />,
  community_guidelines:  <ShieldCheck className="h-3.5 w-3.5" />,
  content_activity:      <FileText    className="h-3.5 w-3.5" />,
  public_presence:       <Globe       className="h-3.5 w-3.5" />,
  identity_readiness:    <BadgeCheck  className="h-3.5 w-3.5" />,
};

function AccountReviewStep({
  planId, checks, isChecking, canProceed, onNext, onBack, onRunCheck,
}: {
  planId: string | null;
  checks: AccountCheck[];
  isChecking: boolean;
  canProceed: boolean;
  onNext: () => void;
  onBack: () => void;
  onRunCheck: () => void;
}) {
  const passed  = checks.filter(c => c.status === "passed" || c.status === "ready").length;
  const total   = checks.length || 4;

  function StatusCircle({ status }: { status: AccountCheck["status"] }) {
    if (status === "passed" || status === "ready") {
      return (
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16a34a]">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      );
    }
    if (status === "failed") {
      return (
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#dc2626]">
          <X className="h-3.5 w-3.5 text-white" />
        </div>
      );
    }
    if (status === "checking") {
      return (
        <div className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-dashed border-[#2563eb] animate-spin" />
      );
    }
    return (
      <div className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-[#e5e7eb] bg-white" />
    );
  }

  function StatusBadge({ status, label }: { status: AccountCheck["status"]; label: string }) {
    if (status === "passed")   return <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-[11px] font-bold text-[#16a34a]">{label === "Blue Verified subscription" ? "Active" : label === "Profile completeness" ? "Completed" : "Passed"}</span>;
    if (status === "ready")    return <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">Ready</span>;
    if (status === "failed")   return <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[11px] font-bold text-[#dc2626]">Failed</span>;
    if (status === "checking") return <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">Checking...</span>;
    return <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#9ca3af]">Pending</span>;
  }

  return (
    <div className="space-y-4">
      {/* Plan active banner */}
      <PlanActiveBanner planId={planId} />

      {/* Account eligibility check card */}
      <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Account Eligibility Check</p>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#f3f4f6]">
          {(checks.length === 0 && !isChecking
            ? [
                { key: "subscription",         label: "Blue Verified subscription",   status: "pending" as const, detail: null },
                { key: "profile_completeness",  label: "Profile completeness",          status: "pending" as const, detail: null },
                { key: "account_authenticity",  label: "Account authenticity",          status: "pending" as const, detail: null },
                { key: "community_guidelines",  label: "Community guidelines",          status: "pending" as const, detail: null },
                { key: "content_activity",      label: "Content & activity review",     status: "pending" as const, detail: null },
                { key: "public_presence",       label: "Public presence",               status: "pending" as const, detail: null },
                { key: "identity_readiness",    label: "Identity verification readiness", status: "pending" as const, detail: null },
              ]
            : checks
          ).map((c, idx) => (
            <div key={c.key} className="flex items-center gap-3 px-5 py-3.5">
              <StatusCircle status={isChecking && c.status !== "passed" && c.status !== "ready" ? "checking" : c.status} />
              <span className="w-5 flex-shrink-0 text-[11.5px] text-[#9ca3af]">{idx + 1}</span>
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
                {CHECK_ROW_ICONS[c.key] ?? <Shield className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-[#374151]">{c.label}</p>
                {c.detail && <p className="text-[11px] text-[#9ca3af]">{c.detail}</p>}
              </div>
              <StatusBadge status={isChecking && c.status !== "passed" && c.status !== "ready" ? "checking" : c.status} label={c.label} />
            </div>
          ))}
        </div>

        {/* Security + progress */}
        <div className="border-t border-[#f3f4f6] px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#eff6ff]">
                <Lock className="h-3.5 w-3.5 text-[#2563eb]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#111827]">Your information is secure</p>
                <p className="text-[10.5px] text-[#9ca3af]">We use industry-standard encryption to protect your data.</p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-[#f3f4f6]">
                <div className="h-2 rounded-full bg-[#2563eb] transition-all"
                  style={{ width: `${Math.round((passed / (checks.length || 7)) * 100)}%` }} />
              </div>
              <p className="flex-shrink-0 text-[11px] font-semibold text-[#374151]">
                {passed} of {checks.length || 4} steps completed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Checking info banner */}
      {(isChecking || checks.length > 0) && (
        <div className="flex items-center gap-3 rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#2563eb]">
            <Info className="h-3.5 w-3.5 text-white" />
          </div>
          <p className="text-[12.5px] text-[#1e40af]">
            {isChecking
              ? "We're checking your account now... This may take a few seconds. Please don't close this page."
              : canProceed
              ? "Account check complete! You can now proceed to upload your verification documents."
              : "Some checks require your attention. Please resolve the issues above before continuing."}
          </p>
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" onClick={onBack}
          className="rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-3 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb] active:scale-95">
          Back to Plans
        </button>
        <button
          type="button"
          onClick={canProceed ? onNext : undefined}
          disabled={isChecking}
          className={cn(
            "flex items-center gap-2 rounded-[12px] px-7 py-3 text-[13px] font-bold text-white shadow-sm transition active:scale-95",
            canProceed && !isChecking
              ? "bg-[#fe2c55] hover:bg-[#e0193f]"
              : "bg-[#fe2c55]/80 cursor-not-allowed",
          )}
        >
          {isChecking && <Loader2 className="h-4 w-4 animate-spin" />}
          Next: Upload Documents
          {!canProceed && !isChecking && <Lock className="h-4 w-4" />}
          {canProceed && !isChecking && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 3 - UPLOAD DOCUMENTS
══════════════════════════════════════════════════════════════════════ */
function UploadDocumentsStep({
  planId, govId, setGovId, selfie, setSelfie, suppDoc, setSuppDoc,
  socialLinks, setSocialLinks, website, setWebsite, onContinue, onBack, isSubmitting,
}: {
  planId: string | null;
  govId: FileEntry;   setGovId:   (e: FileEntry) => void;
  selfie: FileEntry;  setSelfie:  (e: FileEntry) => void;
  suppDoc: FileEntry; setSuppDoc: (e: FileEntry) => void;
  socialLinks: SocialLink[]; setSocialLinks: (v: SocialLink[]) => void;
  website: string;    setWebsite: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const canContinue = !!(govId && selfie);

  function upLink(i: number, f: keyof SocialLink, v: string) {
    const n = [...socialLinks]; n[i] = { ...n[i], [f]: v }; setSocialLinks(n);
  }
  function rmLink(i: number) { setSocialLinks(socialLinks.filter((_, j) => j !== i)); }
  function addLink() {
    if (socialLinks.length >= 5) return;
    const used = new Set(socialLinks.map(l => l.platform));
    const next = SOCIAL_PLATFORMS.find(p => !used.has(p.value))?.value ?? "Other";
    setSocialLinks([...socialLinks, { platform: next, url: "" }]);
  }

  return (
    <div className="space-y-4">
      <PlanStatusBanner planId={planId} stepLabel="Upload Documents" />

      {/* Identity documents */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Identity Documents</p>
          <p className="text-[11.5px] text-[#9ca3af]">Upload clear, valid documents to verify your identity.</p>
        </div>
        <div className="divide-y divide-[#f3f4f6] px-5">
          <FileUploadBox label="Government ID"      subtext="Passport, Driver's License, or National ID"   entry={govId}   onFile={setGovId}   allowPdf />
          <FileUploadBox label="Selfie Verification" subtext="A clear selfie holding your ID"               entry={selfie}  onFile={setSelfie}  allowPdf={false} />
        </div>
      </div>

      {/* Supporting documents */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Supporting Documents</p>
          <p className="text-[11.5px] text-[#9ca3af]">Optional. Helps speed up the review process.</p>
        </div>
        <div className="px-5">
          <FileUploadBox label="Supporting Documents" optional
            subtext="Press articles, official links, business license, media coverage, etc."
            entry={suppDoc} onFile={setSuppDoc} allowPdf />
        </div>
      </div>

      {/* Public presence */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Public Presence</p>
          <p className="text-[11.5px] text-[#9ca3af]">Add links to verify your public presence.</p>
        </div>
        <div className="space-y-3 p-5">
          {/* Social links */}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-[#374151]">Social Links</p>
            <div className="space-y-2">
              {socialLinks.map((link, i) => (
                <SocialLinkRow key={i} link={link} index={i} onChange={upLink} onRemove={rmLink} />
              ))}
              {socialLinks.length < 5 && (
                <button type="button" onClick={addLink}
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#fe2c55] transition hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add another link
                </button>
              )}
            </div>
          </div>
          {/* Website */}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[#374151]">Website / Official Page</p>
            <div className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-[9px] transition focus-within:border-[#fe2c55]">
              <Globe className="h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
              <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#374151] outline-none placeholder:text-[#9ca3af]" />
            </div>
          </div>
        </div>
      </div>

      {/* Document guidelines */}
      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fb] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-4.5 w-4.5 flex-shrink-0 text-[#6b7280]" />
          <div>
            <p className="text-[12.5px] font-bold text-[#374151]">Document Guidelines</p>
            <ul className="mt-1.5 space-y-1">
              {[
                "Document must be clear and readable",
                "All text must be visible and unedited",
                "No expired or temporary documents",
                "Accepted formats: JPG, PNG, PDF",
                "File size up to 10 MB",
              ].map(g => (
                <li key={g} className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
                  <Check className="h-3 w-3 flex-shrink-0 text-[#16a34a]" />{g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-[13px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
          <ArrowLeft className="h-4 w-4" /> Back to Account Review
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11.5px] text-[#9ca3af]">
            {govId && selfie ? "✓ Required documents uploaded" : "Upload Government ID and Selfie to continue"}
          </p>
          <button type="button" onClick={onContinue} disabled={!canContinue || isSubmitting}
            className={cn(
              "flex items-center gap-2 rounded-[12px] px-6 py-3 text-[13px] font-bold transition",
              canContinue && !isSubmitting
                ? "bg-[#fe2c55] text-white shadow-sm hover:bg-[#e0193f] active:scale-95"
                : "cursor-not-allowed bg-[#f3f4f6] text-[#9ca3af]",
            )}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <>Continue to Submit for Review <ChevronRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   BLUE VERIFIED PAYMENT
   Mirrors the coins checkout deliberately - same gateways, same
   create-then-capture shape. A second, subtly different payment path is how
   one of them ends up with a hole the other already closed.
══════════════════════════════════════════════════════════════════════ */

const PAY_METHODS: { id: PaymentMethod; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "card",      label: "Card",       sub: "Visa, Mastercard, Amex", icon: <CreditCard className="h-4 w-4" /> },
  { id: "paypal",    label: "PayPal",     sub: "Pay with your PayPal account", icon: <DollarSign className="h-4 w-4" /> },
  { id: "applepay",  label: "Apple Pay",  sub: "Pay with Apple Pay",  icon: <CreditCard className="h-4 w-4" /> },
  { id: "googlepay", label: "Google Pay", sub: "Pay with Google Pay", icon: <CreditCard className="h-4 w-4" /> },
];

/** Card form. Must live inside <Elements>. */
function BvStripeForm({ paymentId, onPaid, onCancel }: {
  paymentId: number; onPaid: () => Promise<void>; onCancel: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });

      if (error) {
        // Payment failed → they stay on the payment step and can try again or switch
        // method. Nothing is submitted.
        toast.error(error.message ?? "Payment failed. Please try again.");
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        // The SERVER asks Stripe whether this really succeeded. The browser saying so is
        // not evidence.
        await studioService.verificationStripeCapture(paymentId, paymentIntent.id);
        await onPaid();
      } else {
        toast.error("Payment was not completed. Please try again.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement />
      <button type="submit" disabled={!stripe || paying}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-50">
        <Lock className="h-3.5 w-3.5" />
        {paying ? "Processing…" : "Pay now"}
      </button>
      <button type="button" onClick={onCancel}
        className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]">
        Choose a different method
      </button>
    </form>
  );
}

function BvPaymentModal({ amount, planName, onPaid, onClose }: {
  amount: number;
  planName: string;
  onPaid: () => Promise<void>;
  onClose: () => void;
}) {
  const [method, setMethod]             = useState<PaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentId, setPaymentId]       = useState<number | null>(null);
  const [busy, setBusy]                 = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  const paypalPaymentRef = useRef<number | null>(null);

  const methodsQ = useQuery({
    queryKey: ["bv-payment-methods"],
    queryFn: studioService.verificationPaymentMethods,
  });

  const payConfigQ = useQuery({
    queryKey: ["payment-config"],
    queryFn: walletCoinsService.paymentConfig,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const pk = payConfigQ.data?.stripe?.publishable_key;
    if (pk) setStripePromise(loadStripe(pk));
  }, [payConfigQ.data?.stripe?.publishable_key]);

  const enabled = methodsQ.data?.methods;
  const available = PAY_METHODS.filter(m => enabled?.[m.id]);

  /** Card / wallet: create the payment, then a Stripe intent for it. */
  const startCard = async (m: PaymentMethod) => {
    setBusy(true);
    try {
      const order  = await studioService.verificationCreatePayment(m);
      const intent = await studioService.verificationStripeIntent(order.payment_id);
      setPaymentId(order.payment_id);
      setClientSecret(intent.client_secret);
      setMethod(m);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't start the payment.");
    } finally {
      setBusy(false);
    }
  };

  const stripeReady = clientSecret && paymentId && stripePromise;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] overflow-hidden rounded-[16px] bg-white shadow-xl"
           onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between border-b border-[#f0f1f5] px-5 py-4">
          <div>
            <p className="text-[15px] font-black text-[#111827]">Complete your subscription</p>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">
              {planName} · <span className="font-bold text-[#111827]">${amount.toFixed(2)}</span> to submit your application
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {methodsQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
          ) : available.length === 0 ? (
            /* Every gateway is off in Admin → Payment Settings. Say that, rather than
               showing an empty box the creator can't act on. */
            <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-center">
              <p className="text-[12px] font-bold text-[#92400e]">No payment methods available</p>
              <p className="mt-0.5 text-[10.5px] text-[#b45309]">
                Payments are currently disabled. Please try again later.
              </p>
            </div>
          ) : stripeReady && method !== "paypal" ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
              <BvStripeForm
                paymentId={paymentId}
                onPaid={onPaid}
                onCancel={() => { setClientSecret(null); setPaymentId(null); setMethod(null); }}
              />
            </Elements>
          ) : method === "paypal" ? (
            <div className="space-y-3">
              <PayPalButtons
                style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 44 }}
                createOrder={async () => {
                  const order = await studioService.verificationCreatePayment("paypal");
                  paypalPaymentRef.current = order.payment_id;
                  return order.paypal_order_id!;
                }}
                onApprove={async (data: { orderID?: string }) => {
                  if (!paypalPaymentRef.current) return;
                  try {
                    await studioService.verificationPaypalCapture(
                      paypalPaymentRef.current, data.orderID ?? "",
                    );
                    paypalPaymentRef.current = null;
                    await onPaid();
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message ?? "PayPal payment failed.");
                  }
                }}
                onError={() => {
                  toast.error("PayPal payment failed. Please try again.");
                  paypalPaymentRef.current = null;
                }}
              />
              <button type="button" onClick={() => setMethod(null)}
                className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]">
                Choose a different method
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {available.map(m => (
                <button
                  key={m.id}
                  disabled={busy}
                  onClick={() => (m.id === "paypal" ? setMethod("paypal") : startCard(m.id))}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-[#e5e7eb] px-4 py-3 text-left transition hover:border-[#fe2c55] hover:bg-[#fff5f7] disabled:opacity-50"
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-[#f3f4f6] text-[#374151]">
                    {m.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-[#111827]">{m.label}</span>
                    <span className="block text-[11px] text-[#9ca3af]">{m.sub}</span>
                  </span>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-[#9ca3af]" />
                        : <ChevronRight className="h-4 w-4 text-[#d1d5db]" />}
                </button>
              ))}
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[10.5px] text-[#9ca3af]">
            <Lock className="h-3 w-3" /> Payments are processed securely. We never see your card details.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 4 - SUBMIT FOR REVIEW
══════════════════════════════════════════════════════════════════════ */
function SubmitReviewStep({
  vData, planId, onBack, onSubmit, isSubmitting,
}: {
  vData: VerificationData;
  planId: string | null;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const plan = planId ? PLAN_MAP[planId] : null;
  // The SERVER's price, not the plan table's - those can drift, and only one of them
  // decides what actually gets charged.
  const planPrice = vData?.plan_price_usd ?? null;
  const [terms, setTerms] = useState({ accurate: false, termsAccepted: false, noGuarantee: false });
  const allTerms = terms.accurate && terms.termsAccepted && terms.noGuarantee;

  function TermRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    return (
      <div className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 transition hover:border-[#1d4ed8]"
        onClick={onChange}>
        <div className={cn(
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition",
          checked ? "border-[#1d4ed8] bg-[#1d4ed8]" : "border-[#d1d5db] bg-white",
        )}>
          {checked && <Check className="h-3 w-3 text-white" />}
        </div>
        <p className="text-[12px] leading-relaxed text-[#374151]">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan summary */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Selected Plan Summary</p>
        </div>
        <div className="space-y-2.5 p-5">
          {plan && [
            { k: "Plan",         v: plan.name                  },
            { k: "Billing",      v: "Active"                   },
            { k: "Price",        v: `${plan.price}${plan.period}` },
            { k: "Next Billing", v: "-"                        },
          ].map(({ k, v }) => (
            <div key={k} className="flex items-center justify-between text-[12.5px]">
              <span className="text-[#6b7280]">{k}</span>
              <span className="font-semibold text-[#111827]">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Account check summary */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Account Check Summary</p>
        </div>
        <div className="space-y-2 p-5">
          {[
            "Profile complete",
            "Account authenticity passed",
            "No active serious violations",
            "Public presence checked",
          ].map(item => (
            <div key={item} className="flex items-center gap-2">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#16a34a]">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-[12px] text-[#374151]">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Documents summary */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Uploaded Documents</p>
        </div>
        <div className="space-y-2 p-5">
          {[
            { label: "Government ID",       uploaded: true,  required: true  },
            { label: "Selfie Verification", uploaded: true,  required: true  },
            { label: "Supporting Document", uploaded: !!(vData?.supporting_doc_uploaded), required: false },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full",
                  item.uploaded ? "bg-[#16a34a]" : "bg-[#f3f4f6]",
                )}>
                  {item.uploaded
                    ? <Check className="h-2.5 w-2.5 text-white" />
                    : <X className="h-2.5 w-2.5 text-[#9ca3af]" />}
                </div>
                <span className="text-[12px] text-[#374151]">{item.label}</span>
              </div>
              <span className={cn(
                "text-[10.5px] font-bold rounded-full px-2 py-0.5",
                item.uploaded ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#f9fafb] text-[#9ca3af]",
              )}>
                {item.uploaded ? "Uploaded" : item.required ? "Missing" : "Not provided"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Verification terms */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Verification Terms</p>
          <p className="text-[11.5px] text-[#9ca3af]">Please review and accept all terms before submitting.</p>
        </div>
        <div className="space-y-3 p-5">
          <TermRow
            label="I confirm all information provided is accurate and up to date."
            checked={terms.accurate}
            onChange={() => setTerms(t => ({ ...t, accurate: !t.accurate }))}
          />
          <TermRow
            label="I accept the Blue Verified Terms and Conditions."
            checked={terms.termsAccepted}
            onChange={() => setTerms(t => ({ ...t, termsAccepted: !t.termsAccepted }))}
          />
          <TermRow
            label="I understand that payment does not guarantee verification approval."
            checked={terms.noGuarantee}
            onChange={() => setTerms(t => ({ ...t, noGuarantee: !t.noGuarantee }))}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack}
          className="flex items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#d1d5db] hover:bg-[#f8f9fb]">
          <ArrowLeft className="h-4 w-4" /> Back to Upload Documents
        </button>
        <button type="button" onClick={onSubmit} disabled={!allTerms || isSubmitting}
          className={cn(
            "flex items-center gap-2 rounded-[12px] px-6 py-3 text-[13px] font-bold transition",
            allTerms && !isSubmitting
              ? "bg-[#fe2c55] text-white shadow-sm hover:bg-[#e0193f] active:scale-95"
              : "cursor-not-allowed bg-[#f3f4f6] text-[#9ca3af]",
          )}>
          {isSubmitting
            ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            /* Say what the button will actually do. A "Submit" that silently opens a
               payment sheet is a button that lied about its own price. */
            : vData?.is_paid
              ? <><ShieldCheck className="h-4 w-4" />Submit Verification Request</>
              : <><Lock className="h-4 w-4" />Pay &amp; Submit{planPrice ? ` · $${planPrice.toFixed(2)}` : ""}</>}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 5 - UNDER REVIEW
══════════════════════════════════════════════════════════════════════ */
function UnderReviewStep({ planId }: { planId: string | null }) {
  const plan = planId ? PLAN_MAP[planId] : null;
  const reviewSteps = [
    { label: "Submit Application", sublabel: "Application received",         done: true,  active: false },
    { label: "Document Review",    sublabel: "Reviewing your documents",      done: false, active: true  },
    { label: "Authenticity Review",sublabel: "Verifying identity and presence", done: false, active: false },
    { label: "Final Decision",     sublabel: "Admin approves or rejects",     done: false, active: false },
  ];

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <div className="overflow-hidden rounded-[16px] border border-[#fde68a] bg-gradient-to-r from-[#fffbeb] via-[#fef3c7] to-[#fffbeb]">
        <div className="flex items-center gap-6 px-8 py-7">
          <div className="flex h-[80px] w-[80px] flex-shrink-0 items-center justify-center rounded-full bg-[#fde68a]">
            <Clock className="h-10 w-10 text-[#d97706]" />
          </div>
          <div>
            <h2 className="text-[22px] font-black leading-tight text-[#92400e]">
              Verification Under Review
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#a16207]">
              Your Blue Verified request has been submitted. Our team will review within
              <span className="font-bold"> 3-5 business days</span>.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[#a16207]">
              <Lock className="h-3 w-3 flex-shrink-0" />
              The Blue badge will NOT appear until admin approves your request.
            </p>
          </div>
        </div>
      </div>

      {/* Review stages */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
        <div className="border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[14px] font-extrabold text-[#111827]">Review Progress</p>
        </div>
        <div className="space-y-0 divide-y divide-[#f3f4f6]">
          {reviewSteps.map((s, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                s.done   ? "bg-[#16a34a]"  :
                s.active ? "bg-[#fde68a]"  : "bg-[#f3f4f6]",
              )}>
                {s.done   ? <Check className="h-4 w-4 text-white" /> :
                 s.active ? <Loader2 className="h-4 w-4 animate-spin text-[#d97706]" /> :
                            <div className="h-2.5 w-2.5 rounded-full bg-[#d1d5db]" />}
              </div>
              <div>
                <p className={cn(
                  "text-[12.5px] font-bold",
                  s.done ? "text-[#16a34a]" : s.active ? "text-[#d97706]" : "text-[#9ca3af]",
                )}>{s.label}</p>
                <p className="text-[11px] text-[#9ca3af]">{s.sublabel}</p>
              </div>
              <div className="ml-auto">
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                  s.done   ? "bg-[#f0fdf4] text-[#16a34a]"  :
                  s.active ? "bg-[#fffbeb] text-[#d97706]"  : "bg-[#f3f4f6] text-[#9ca3af]",
                )}>
                  {s.done ? "Completed" : s.active ? "In Progress" : "Pending"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan info */}
      {plan && (
        <div className="rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <VerifiedBadge size={22} />
            <div>
              <p className="text-[13px] font-extrabold text-[#1e3a8a]">{plan.name}</p>
              <p className="text-[11px] text-[#3b5998]">{plan.price}{plan.period} · Subscription Active</p>
            </div>
          </div>
        </div>
      )}

      {/* What happens after */}
      <div className="rounded-[14px] border border-[#f0f1f5] bg-white p-4 shadow-sm">
        <p className="mb-3 text-[12.5px] font-bold text-[#111827]">What happens next?</p>
        <div className="space-y-2">
          {[
            "You'll receive an email once a decision is made.",
            "If approved, the Blue badge appears on your profile immediately.",
            "If rejected, you'll get the reason and can reapply after 30 days.",
            "Your subscription remains active regardless of the decision.",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#fe2c55]" />
              <p className="text-[11.5px] leading-relaxed text-[#6b7280]">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP 6 - VERIFIED
══════════════════════════════════════════════════════════════════════ */
function VerifiedStep({ planId, vData }: { planId: string | null; vData: VerificationData }) {
  const plan = planId ? PLAN_MAP[planId] : null;
  const qc   = useQueryClient();

  const permanent = Boolean(vData?.is_permanent);
  const lapsed    = Boolean(vData?.has_lapsed);
  const canRenew  = Boolean(vData?.can_renew);
  const windowDays = vData?.renew_window_days ?? 10;

  // Captured once at mount, not read during every render. Date.now() in a render body is
  // impure, and a "days remaining" that can silently differ between two renders of the
  // same screen is a bug waiting to happen.
  const [now] = useState(() => Date.now());

  const renewsAt = vData?.expires_at ? new Date(vData.expires_at) : null;
  const daysLeft = renewsAt
    ? Math.ceil((renewsAt.getTime() - now) / 86_400_000)
    : null;

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  /**
   * Share of the current period already used, for the bar.
   *
   * Derived from the period LENGTH implied by the plan, not from the approval date -
   * a renewal moves expires_at without moving reviewed_at, so anchoring to the approval
   * would make the bar read "300% elapsed" for anyone who has ever renewed.
   */
  const periodDays = planId === "annual" ? 365 : 30;
  const usedPct = daysLeft === null
    ? null
    : Math.min(100, Math.max(0, ((periodDays - daysLeft) / periodDays) * 100));

  const renew = useMutation({
    mutationFn: () => studioService.verificationRenew(),
    onSuccess: (r) => {
      toast.success(r.message ?? "Your badge has been renewed.");
      // The key the page's own verification query uses. Get this wrong and the badge
      // renews on the server while the card keeps showing the old date.
      qc.invalidateQueries({ queryKey: ["verification-status"] });
    },
    onError: () => toast.error("Couldn't renew your badge. Please try again."),
  });

  return (
    <div className="space-y-4">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[16px] border border-[#bbf7d0] bg-gradient-to-r from-[#f0fdf4] via-[#dcfce7] to-[#f0fdf4]">
        <div className="flex flex-wrap items-center gap-6 px-8 py-7">
          <div className="flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
            <VerifiedBadge size={54} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-black leading-tight text-[#166534]">
              Account Verified! 🎉
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#15803d]">
              Your Blue Verified badge is live on your profile, videos and comments. Your
              audience can see your account is authentic.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {plan && !permanent && (
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11.5px] font-bold text-[#166534]">
                  {plan.name} · {plan.price}{plan.period}
                </span>
              )}
              {permanent && (
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11.5px] font-bold text-[#0b5d8f]">
                  Permanent · never expires
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Billing ──────────────────────────────────────────────────────────
          A permanent badge has nothing to bill and nothing to renew, so it gets a
          statement rather than a billing panel full of blanks. */}
      {permanent ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-[#c7e6fb] bg-[#f2f9fe] px-5 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1d9bf0]" />
          <div>
            <p className="text-[13.5px] font-extrabold text-[#0b5d8f]">Permanent verification</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#2b7fb5]">
              There&apos;s nothing to renew and nothing to pay. Your badge stays until an
              admin changes it.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5] bg-white">
          <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-3">
            <p className="text-[13px] font-extrabold text-[#111827]">Billing cycle</p>
            {plan && (
              <span className="text-[12px] font-semibold text-[#6b7280]">
                {plan.price}{plan.period}
              </span>
            )}
          </div>

          <div className="px-5 py-4">
            {!renewsAt ? (
              /* Approved before renewal dates were recorded. Say so - a computed date
                 about someone's billing that nothing enforces is worse than none. */
              <p className="text-[12.5px] text-[#6b7280]">
                We don&apos;t have a renewal date on record for this badge. It stays active
                until an admin changes it.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11.5px] text-[#9ca3af]">
                      {lapsed ? "Expired on" : "Next billing cycle"}
                    </p>
                    <p className={cn(
                      "mt-0.5 text-[20px] font-black leading-none",
                      lapsed ? "text-[#dc2626]" : "text-[#111827]",
                    )}>
                      {fmt(renewsAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[11.5px] text-[#9ca3af]">Time remaining</p>
                    <p className={cn(
                      "mt-0.5 text-[15px] font-extrabold leading-none",
                      lapsed ? "text-[#dc2626]" : daysLeft !== null && daysLeft <= windowDays
                        ? "text-[#d97706]" : "text-[#111827]",
                    )}>
                      {lapsed
                        ? `Lapsed ${Math.abs(daysLeft ?? 0)}d ago`
                        : daysLeft === 0
                          ? "Renews today"
                          : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>

                {usedPct !== null && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        lapsed ? "bg-[#dc2626]"
                          : daysLeft !== null && daysLeft <= windowDays ? "bg-[#f59e0b]" : "bg-[#16a34a]",
                      )}
                      style={{ width: `${lapsed ? 100 : usedPct}%` }}
                    />
                  </div>
                )}

                {/* Renew appears only inside the window the SERVER defines. */}
                {canRenew && (
                  <div className={cn(
                    "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3",
                    lapsed ? "border-[#fecaca] bg-[#fff5f5]" : "border-[#fde68a] bg-[#fffbeb]",
                  )}>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-[12.5px] font-extrabold",
                        lapsed ? "text-[#b91c1c]" : "text-[#b45309]",
                      )}>
                        {lapsed ? "Your badge has expired" : "Your badge renews soon"}
                      </p>
                      <p className={cn(
                        "mt-0.5 text-[12px]",
                        lapsed ? "text-[#dc2626]" : "text-[#d97706]",
                      )}>
                        {lapsed
                          ? "Renew now to bring your Blue Verified badge back."
                          : `Renew now to keep it running past ${fmt(renewsAt)}.`}
                      </p>
                    </div>

                    <button
                      onClick={() => renew.mutate()}
                      disabled={renew.isPending}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#fe2c55] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#e0243d] disabled:opacity-60"
                    >
                      {renew.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />}
                      {renew.isPending ? "Renewing…" : "Renew now"}
                    </button>
                  </div>
                )}

                {!canRenew && !lapsed && daysLeft !== null && (
                  <p className="mt-3 text-[11.5px] text-[#9ca3af]">
                    You can renew from {windowDays} days before your renewal date.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
        <BadgeCheck className="h-5 w-5 flex-shrink-0 text-[#16a34a]" />
        <p className="text-[12.5px] font-semibold text-[#166534]">
          Your Blue Verified badge is displayed across Teezer - on your profile, videos, and comments.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */
export function StudioVerificationPage() {
  const router       = useRouter();
  const { isAuthenticated, authReady, user } = useAuthStore();
  const queryClient  = useQueryClient();

  const [collapsed,  setCollapsed]  = useState(false);
  const [dateRange,  setDateRange]  = useState({
    start: new Date(Date.now() - 6 * 86400000),
    end:   new Date(),
  });

  /* ── Local step state ───────────────────────────────────────────────────── */
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [accountChecks,  setAccountChecks]  = useState<AccountCheck[]>([]);
  const [checkCanProceed, setCheckCanProceed] = useState(false);
  const [stepOverride, setStepOverride] = useState<number | null>(null);
  const [payOpen, setPayOpen]           = useState(false);

  /* File state (step 3) */
  const [govId,   setGovId]   = useState<FileEntry>(null);
  const [selfie,  setSelfie]  = useState<FileEntry>(null);
  const [suppDoc, setSuppDoc] = useState<FileEntry>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([
    { platform: "Instagram", url: "" },
    { platform: "YouTube",   url: "" },
  ]);
  const [website, setWebsite] = useState("");

  /* Auth guard */
  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  /* ── Queries ────────────────────────────────────────────────────────────── */
  const { data: vData, isLoading: vLoading } = useQuery<VerificationData>({
    queryKey: ["verification-status"],
    queryFn:  studioService.verification,
    enabled:  isAuthenticated,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const { data: eligData } = useQuery<EligibilityData>({
    queryKey: ["creator-eligibility"],
    queryFn:  studioService.eligibility,
    enabled:  isAuthenticated,
    staleTime: 60_000,
  });

  /* ── Determine current step ─────────────────────────────────────────────── */

  /**
   * A REVOKED badge is not a verified account.
   *
   * The request row deliberately stays `approved` after a revocation - that is how we
   * keep the fact the badge once existed. So `status === "approved"` no longer means
   * "verified", and treating it that way is what showed "Account Verified! 🎉" to a
   * creator whose badge had just been taken away.
   *
   * `user.is_verified` from the auth store is not enough on its own either: it is a
   * cached copy that can be minutes stale, and it was still true on their screen. The
   * server's `is_revoked` is the fact that settles it.
   */
  const isRevoked  = !!vData?.is_revoked;
  const isVerified = !!(user?.is_verified) && !isRevoked;

  const currentStep = useMemo((): number => {
    if (!vData) return 1;
    // Revoked → back to the start, so they can apply again.
    if (isRevoked)                                      return 1;
    if (isVerified || vData.status === "approved")      return 6;
    if (vData.status === "rejected")                    return 1; // restart
    if (vData.status === "pending")                     return 5;
    if (vData.verification_step === "documents_uploaded") return 4;
    if (vData.verification_step === "account_checked")  return 3;
    if (vData.verification_step === "plan_selected")    return 2;
    return 1;
  }, [vData, isVerified, isRevoked]);

  /* displayStep: server step, but can be overridden locally (e.g. user clicks Back to Plans) */
  const displayStep = stepOverride ?? currentStep;

  /* Clear step override when server advances to upload/submit/review/verified */
  useEffect(() => {
    if (currentStep >= 3) setStepOverride(null);
  }, [currentStep]);

  /* Sync selected plan from server state */
  useEffect(() => {
    if (vData?.plan_id && !selectedPlanId) setSelectedPlanId(vData.plan_id);
  }, [vData, selectedPlanId]);

  /* ── Mutations ──────────────────────────────────────────────────────────── */
  const selectPlanMut = useMutation({
    mutationFn: (planId: string) => studioService.verificationSelectPlan(planId),
    onSuccess: async (_data, variables) => {
      setStepOverride(null);
      try {
        localStorage.setItem("blueVerifiedSelectedPlan", JSON.stringify({ id: variables }));
      } catch {}
      await queryClient.invalidateQueries({ queryKey: ["verification-status"] });
      router.push("/studio/verification/account-review");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? "Failed to select plan.");
    },
  });

  const accountCheckMut = useMutation({
    mutationFn: studioService.verificationAccountCheck,
    onSuccess: (res) => {
      setAccountChecks(res.checks);
      const hardBlocked = res.checks.some(
        c => c.key === "community_guidelines" && c.status === "failed",
      );
      setCheckCanProceed(!hardBlocked);
      // Do NOT auto-advance - let user review results and click Next
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? "Account check failed.");
    },
  });

  const uploadDocsMut = useMutation({
    mutationFn: (formData: FormData) => studioService.verificationUploadDocuments(formData),
    onSuccess: () => {
      // Drop the Back override, or a RE-upload strands you.
      //
      // The effect that normally clears it only fires when `currentStep` CHANGES. Someone
      // who stepped back from 4 to 3 is already at server step 4, so a successful
      // re-upload changes nothing - the effect never runs, the override stays at 3, and
      // they'd sit on the upload page watching a successful upload do nothing.
      setStepOverride(null);
      void queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    },
    onError: (err: any) => {
      // The field error, not the wrapper. A 422 arrives as
      // message:"Validation failed." with the real reason under errors.document - showing
      // only the wrapper tells someone their upload failed and nothing about why.
      const fieldError = err?.response?.data?.errors
        ? (Object.values(err.response.data.errors).flat()[0] as string | undefined)
        : undefined;
      toast.error(fieldError ?? err?.response?.data?.message ?? "Document upload failed.");
    },
  });

  const submitMut = useMutation({
    mutationFn: studioService.verificationSubmit,
    onSuccess: (res) => {
      toast.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? "Submission failed.");
    },
  });

  /* ── Step 2: auto-run account check when we arrive ─────────────────────── */
  const checkedRef = useRef(false);
  useEffect(() => {
    if (displayStep === 2 && !checkedRef.current && !accountCheckMut.isPending && accountChecks.length === 0) {
      checkedRef.current = true;
      accountCheckMut.mutate();
    }
    if (displayStep !== 2) checkedRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayStep]);

  /* ── Handlers ───────────────────────────────────────────────────────────── */
  function handleNextFromPlan() {
    if (!selectedPlanId) {
      toast.error("Please choose a Blue Verified plan first.");
      return;
    }
    setStepOverride(null);
    selectPlanMut.mutate(selectedPlanId);
  }

  function handleNextFromAccountCheck() {
    // Same trap as the upload: someone who stepped BACK to 2 is already past it on the
    // server, so refetching changes no step and the clear-override effect never fires.
    // Drop the override explicitly and let the server's own progress decide where they
    // land.
    setStepOverride(null);
    void queryClient.refetchQueries({ queryKey: ["verification-status"] });
  }

  function handleUploadDocuments() {
    if (!govId || !selfie) return;
    const fd = new FormData();
    fd.append("document", govId.file);
    fd.append("selfie",   selfie.file);
    if (suppDoc) fd.append("supporting_doc", suppDoc.file);
    const links = socialLinks.filter(l => l.url.trim());
    if (links.length) fd.append("social_links", JSON.stringify(links));
    if (website.trim()) fd.append("website", website.trim());
    uploadDocsMut.mutate(fd);
  }

  /**
   * Submit → pay first, if they haven't.
   *
   * The payment gate is enforced on the SERVER (submit returns 402 without a settled
   * payment). This just decides which screen to show - it is not the rule. If payment
   * succeeds we submit immediately; if it fails they land back on the Submit button with
   * nothing sent.
   */
  function handleSubmitReview() {
    if (!vData?.is_paid) {
      setPayOpen(true);
      return;
    }
    submitMut.mutate();
  }

  /** Payment settled → refresh the status, then submit for real. */
  async function handlePaid() {
    setPayOpen(false);
    toast.success("Payment received.");
    await queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    submitMut.mutate();
  }

  /**
   * Step 4 → step 3, for real.
   *
   * This used to be a lie: the button said "Back to Upload Documents" and then just
   * raised a toast telling you your documents were already uploaded. You could not go
   * back - which mattered most in the one case you'd want to, having just uploaded the
   * wrong file.
   *
   * It works now because the SERVER lets it. `upload-documents` used to require the draft
   * to be exactly on `account_checked`, so the first upload moved you past the only step
   * from which uploading was allowed and a re-upload 422'd. It now accepts
   * `documents_uploaded` too, so replacing a document is a supported move rather than a
   * dead end this button was papering over.
   */
  function handleBackToUpload() {
    setStepOverride(3);
  }

  /** Step 3 → step 2. Re-running the account check is idempotent, so this is safe. */
  function handleBackToAccountReview() {
    setStepOverride(2);
  }

  if (!authReady || !isAuthenticated) return <div className="min-h-screen bg-[#f8f9fb]" />;

  const effectivePlanId = vData?.plan_id ?? selectedPlanId;
  const showStepper     = displayStep >= 1 && displayStep <= 4;

  /* ── Right sidebar ──────────────────────────────────────────────────────── */
  function RightSidebar() {
    return (
      <div className="w-[260px] flex-shrink-0 space-y-4">
        <ProfilePreviewCard eligData={eligData} />
        <VerificationStatusCard currentStep={displayStep} vData={vData ?? null} isVerified={isVerified} />

        {/* Subscription Summary (steps 2-5) */}
        {displayStep >= 2 && displayStep <= 5 && effectivePlanId && (() => {
          const pl = PLAN_MAP[effectivePlanId];
          if (!pl) return null;
          const nextBilling = new Date();
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          const billingStr = nextBilling.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return (
            <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
              <div className="border-b border-[#f3f4f6] px-4 py-3">
                <p className="text-[12.5px] font-extrabold text-[#111827]">Subscription Summary</p>
              </div>
              <div className="space-y-2.5 p-4 text-[12px]">
                {[
                  { k: "Plan",             v: `${pl.name} (Blue Verified)`,    vc: "#111827" },
                  { k: "Price",            v: `${pl.price}${pl.period}`,        vc: "#111827" },
                  { k: "Next Billing Date",v: billingStr,                        vc: "#111827" },
                  { k: "Payment Method",   v: "Visa ···· 4242",                  vc: "#111827" },
                ].map(({ k, v, vc }) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#6b7280]">{k}</span>
                    <span className="text-right text-[11px] font-semibold" style={{ color: vc }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#f3f4f6] px-4 pb-4 pt-3">
                <button type="button"
                  className="w-full rounded-[10px] border border-[#fe2c55] bg-white py-2 text-[12px] font-bold text-[#fe2c55] transition hover:bg-[#fff5f5]">
                  Manage Subscription
                </button>
              </div>
            </div>
          );
        })()}

        {/* Verification Status (step 2) */}
        {displayStep === 2 && (
          <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
            <div className="border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[#111827]">Verification Status</p>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3 rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-3">
                <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-[#2563eb]" />
                <div>
                  <p className="text-[12.5px] font-bold text-[#1e40af]">Account Check in Progress</p>
                  <p className="mt-0.5 text-[11px] text-[#4b6a9c]">
                    We&apos;re reviewing your account to ensure it meets our verification requirements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Why we check (step 2) */}
        {displayStep === 2 && (
          <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
            <div className="border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[#111827]">Why we check your account</p>
            </div>
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#eff6ff]">
                <Shield className="h-4 w-4 text-[#2563eb]" />
              </div>
              <p className="text-[11.5px] leading-relaxed text-[#6b7280]">
                These checks help us keep Teezer safe, authentic, and trustworthy for everyone.
                We verify to protect our community and maintain platform integrity.
              </p>
            </div>
          </div>
        )}

        {/* Step-3 document guidelines */}
        {displayStep === 3 && (
          <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
            <div className="border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[#111827]">Document Guidelines</p>
            </div>
            <div className="space-y-1.5 p-4">
              {["Clear and readable", "All text visible", "No expired docs", "JPG/PNG/PDF", "Max 10 MB"].map(g => (
                <div key={g} className="flex items-center gap-2 text-[11px] text-[#6b7280]">
                  <Check className="h-3 w-3 flex-shrink-0 text-[#16a34a]" />{g}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step-4 what happens next */}
        {displayStep === 4 && (
          <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
            <div className="border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[#111827]">What happens next?</p>
            </div>
            <div className="space-y-2.5 p-4">
              {[
                { n: 1, t: "Document review" },
                { n: 2, t: "Authenticity review" },
                { n: 3, t: "Final decision" },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-2">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[10px] font-black text-[#fe2c55]">
                    {s.n}
                  </div>
                  <span className="text-[11.5px] text-[#374151]">{s.t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 eligibility checklist */}
        {displayStep === 1 && (
          <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
            <div className="border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[#111827]">Eligibility Checklist</p>
            </div>
            <div className="p-4">
              <p className="mb-3 text-[11px] text-[#6b7280]">You must meet all requirements to apply.</p>
              <div className="space-y-2.5">
                {[
                  { label: "Completed profile",             passed: !!(user?.has_avatar && user?.name && user?.username)      },
                  { label: "Valid government ID",           passed: false                                                      },
                  { label: "Public presence proof",         passed: false                                                      },
                  { label: "No active serious violations",  passed: !!(eligData?.requirements.find(r => r.key === "no_violations")?.passed) },
                  { label: "Accepted verification terms",   passed: false                                                      },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
                        item.passed ? "bg-[#16a34a]" : "bg-[#f3f4f6]",
                      )}>
                        {item.passed
                          ? <Check className="h-2.5 w-2.5 text-white" />
                          : <div className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />}
                      </div>
                      <span className="text-[11.5px] text-[#374151]">{item.label}</span>
                    </div>
                    <span className={cn(
                      "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      item.passed ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#f3f4f6] text-[#9ca3af]",
                    )}>
                      {item.passed ? "Completed" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FAQ (steps 1, 2, 5) */}
        {[1, 2, 5].includes(displayStep) && <FAQCard />}

        {/* Security notice */}
        <div className="flex items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-[#f8f9fb] px-3 py-2.5">
          <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
          <p className="text-[10.5px] leading-snug text-[#9ca3af]">
            Your data is protected with industry-standard encryption.
          </p>
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  // PayPal's SDK has to wrap anything that renders <PayPalButtons>. Same client id the
  // coins page uses - one PayPal app, not two.
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD" }}>
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      {payOpen && (
        <BvPaymentModal
          amount={vData?.plan_price_usd ?? 0}
          planName={(effectivePlanId && PLAN_MAP[effectivePlanId]?.name) || "Blue Verified"}
          onPaid={handlePaid}
          onClose={() => setPayOpen(false)}
        />
      )}

      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref="/studio/verification"
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search creators, videos, hashtags..."
        />

        {/* Page header */}
        <div className="flex-shrink-0 border-b border-[#f0f0f0] bg-white px-6 py-3.5">
          <div className="mb-1 flex items-center gap-1 text-[11.5px] text-[#9ca3af]">
            <span>Verification Center</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#374151]">Get Blue Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-black leading-tight text-[#111827]">Get Blue Verified</h1>
            <VerifiedBadge size={22} />
          </div>
          <p className="mt-0.5 text-[12px] text-[#6b7280]">
            Subscribe to apply for the Teezer Blue Verified badge and unlock exclusive benefits.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {vLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-[#fe2c55]" />
            </div>
          ) : (
            <div className="flex gap-4 px-5 py-4">
              {/* Main content */}
              <div className="min-w-0 flex-1 space-y-4">

                {/* Rejected banner */}
                {vData?.status === "rejected" && (
                  <div className="flex items-start gap-3 rounded-[12px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3">
                    <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#dc2626]" />
                    <div>
                      <p className="text-[13px] font-bold text-[#991b1b]">Previous Application Rejected</p>
                      <p className="text-[11.5px] text-[#6b7280]">
                        {vData.rejection_reason ?? "Please review the requirements and start a new application."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Hero banner - shown on step 1, above the stepper */}
                {displayStep === 1 && (
                  <div className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-transparent">
                    <div className="flex min-h-[180px]">
                      {/* Left - badge image panel */}
                      <div className="relative flex w-[240px] flex-shrink-0 items-center justify-center bg-transparent">
                        <span className="absolute left-5 top-6 select-none text-[18px] font-light text-[#93c5fd]">✦</span>
                        <span className="absolute right-6 top-8 select-none text-[13px] text-[#bfdbfe]">✦</span>
                        <span className="absolute bottom-7 left-8 select-none text-[11px] text-[#bfdbfe]">✦</span>
                        <span className="absolute bottom-6 right-5 select-none text-[15px] text-[#93c5fd]">✦</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/icons/blue-verified-badge.png"
                          alt="Blue Verified Badge"
                          className="relative z-10 h-[110px] w-[110px] object-contain drop-shadow-lg"
                        />
                      </div>

                      {/* Divider */}
                      <div className="w-px self-stretch bg-[#f0f1f5]" />

                      {/* Right - text + CTA panel */}
                      <div className="flex flex-1 flex-col justify-center bg-transparent px-8 py-7">
                        <h2 className="text-[22px] font-black leading-snug text-[#111827]">
                          Stand out. Build trust. Grow faster.
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">
                          The Blue Verified badge shows your audience you&apos;re authentic and official.<br />
                          Subscribe now to start your verification journey.
                        </p>
                        <div className="mt-4">
                          <button
                            onClick={() => {
                              document.getElementById("bv-plans-section")?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                            style={{ background: BRAND }}
                          >
                            Subscribe &amp; Apply
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#9ca3af]">
                          <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                          Safe, secure, and privacy-first verification
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step progress bar - sits directly below the hero on step 1 */}
                {showStepper && (
                  <div className="rounded-[14px] border border-[#f0f1f5] bg-white px-6 py-5 shadow-sm">
                    <StepperBar currentStep={displayStep} />
                  </div>
                )}

                {/* A removed badge lands them back at step 1. Tell them WHY before showing
                    the plans again - otherwise the page just silently forgets they were
                    ever verified, which is the most confusing possible response to having
                    your badge taken away. */}
                {displayStep === 1 && isRevoked && (
                  <div className="mb-4 rounded-[14px] border border-[#fecaca] bg-[#fff5f5] px-5 py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#dc2626]" />
                      <div>
                        <p className="text-[13.5px] font-extrabold text-[#b91c1c]">
                          Your verification badge was removed
                        </p>
                        {vData?.revoke_reason && (
                          <p className="mt-1 text-[12.5px] leading-relaxed text-[#dc2626]">
                            {vData.revoke_reason}
                          </p>
                        )}
                        <p className="mt-1.5 text-[12px] text-[#9f1239]">
                          You can fix the issue and apply again below.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step content */}
                {displayStep === 1 && (
                  <ChoosePlanStep
                    selectedPlanId={selectedPlanId}
                    onSelectPlan={setSelectedPlanId}
                    onNext={handleNextFromPlan}
                    isSubmitting={selectPlanMut.isPending}
                  />
                )}

                {displayStep === 2 && (
                  <AccountReviewStep
                    planId={effectivePlanId}
                    checks={accountChecks}
                    isChecking={accountCheckMut.isPending}
                    canProceed={checkCanProceed}
                    onNext={handleNextFromAccountCheck}
                    onBack={() => {
                      setStepOverride(1);
                      setAccountChecks([]);
                      setCheckCanProceed(false);
                    }}
                    onRunCheck={() => accountCheckMut.mutate()}
                  />
                )}

                {displayStep === 3 && (
                  <UploadDocumentsStep
                    planId={effectivePlanId}
                    govId={govId}   setGovId={setGovId}
                    selfie={selfie} setSelfie={setSelfie}
                    suppDoc={suppDoc} setSuppDoc={setSuppDoc}
                    socialLinks={socialLinks} setSocialLinks={setSocialLinks}
                    website={website} setWebsite={setWebsite}
                    onContinue={handleUploadDocuments}
                    onBack={handleBackToAccountReview}
                    isSubmitting={uploadDocsMut.isPending}
                  />
                )}

                {displayStep === 4 && (
                  <SubmitReviewStep
                    vData={vData ?? null}
                    planId={effectivePlanId}
                    onBack={handleBackToUpload}
                    onSubmit={handleSubmitReview}
                    isSubmitting={submitMut.isPending}
                  />
                )}

                {displayStep === 5 && (
                  <UnderReviewStep planId={effectivePlanId} />
                )}

                {displayStep === 6 && (
                  <VerifiedStep planId={effectivePlanId} vData={vData ?? null} />
                )}

              </div>

              {/* Right sidebar */}
              <RightSidebar />
            </div>
          )}
        </div>
      </div>
    </div>
    </PayPalScriptProvider>
  );
}
