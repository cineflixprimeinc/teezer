"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  ArrowDownLeft, ArrowUpRight, Building2, ChevronLeft, ChevronRight,
  Clock, CreditCard, Gift, HelpCircle, Info, Lock, Megaphone,
  RefreshCw, Search, ShieldCheck, Sparkles, Star,
  TrendingUp, Wallet, X, Zap, Copy, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import {
  walletCoinsService,
  type CoinPackage,
  type WalletTransaction,
  type PaymentConfig,
} from "@/services/wallets-coins.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import { GIFTS, giftBySlug } from "@/features/gifts/gift-catalog";

/* ══════════════════════════════════════════════════════════════════════════
   COIN PLAN ICON

   Coin packages are illustrated with the 200-gift animated icon set. The icon is a
   presentational label for the plan, not a product - it is picked deterministically
   from sort_order so a given package always shows the same gift.

   The old hand-coded 24-icon registry (PALETTE / ICONS / *SVG / ci-* keyframes) was
   removed with this change; the SVGs now carry their own gradients and @keyframes, so
   no page-level CSS is injected for them.
══════════════════════════════════════════════════════════════════════════ */
function CoinPlanIcon({ icon, iconUrl, sort, size = 56, className }: {
  icon?: string | null; iconUrl?: string | null; sort: number; size?: number; className?: string;
}) {
  // coin_packages.icon holds the gift slug. Fall back to sort_order for any legacy
  // row that predates the gift catalog (the retired packages have icons like "coin").
  const gift = (icon ? giftBySlug(icon) : undefined)
    ?? GIFTS[(Math.max(1, sort) - 1) % GIFTS.length];

  // An admin upload beats the artwork bundled with the app. Without this, changing
  // an icon in the admin panel would appear to do nothing on the web.
  const src = iconUrl || gift.icon;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("inline-block shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MISC HELPERS
══════════════════════════════════════════════════════════════════════════ */
/** Catalog number as shown on a tile: 1 -> "01", 200 -> "200". */
function planNo(sort: number): string {
  return String(Math.max(1, sort)).padStart(2, "0");
}

function fmtRC(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1_000)     return n.toLocaleString();
  return String(n);
}
function fmtUSD(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type PayMethod = "card" | "paypal" | "applepay" | "googlepay" | "upi" | "bank";

/* Small inline RC coin */
function RC({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="inline-block shrink-0 align-middle">
      <circle cx="12" cy="12" r="12" fill="#f59e0b"/>
      <circle cx="12" cy="12" r="9" fill="#fbbf24"/>
      <circle cx="12" cy="12" r="7" fill="#f59e0b"/>
      <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="900"
        fill="#92400e" fontFamily="Arial,sans-serif">RC</text>
    </svg>
  );
}

/* Tooltip */
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      {children}
      {on && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-[#111827] px-2.5 py-1.5 text-[10.5px] text-white shadow-lg">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111827]" />
        </span>
      )}
    </span>
  );
}

/* ── Payment methods ──────────────────────────────────────────────────── */
const PAYMENT_METHODS: { id: PayMethod; label: string; desc: string; logo: React.ReactNode }[] = [
  {
    id: "card", label: "Credit / Debit Card", desc: "Visa, Mastercard, Amex",
    logo: (
      <div className="flex items-center gap-1">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black text-white" style={{ background: "#1a1f71" }}>VISA</span>
        <span className="flex items-center rounded bg-white px-1 py-0.5 shadow-sm">
          <span className="h-3.5 w-3.5 rounded-full bg-[#eb001b]" />
          <span className="-ml-1.5 h-3.5 w-3.5 rounded-full bg-[#f79e1b] opacity-90" />
        </span>
      </div>
    ),
  },
  { id: "paypal",    label: "PayPal",         desc: "Fast & secure",         logo: <span className="rounded px-2 py-0.5 text-[10px] font-black text-white" style={{ background: "#003087" }}>PayPal</span> },
  { id: "applepay",  label: "Apple Pay",      desc: "Touch / Face ID",       logo: <span className="rounded-[4px] bg-black px-2 py-0.5 text-[9.5px] font-semibold text-white"> Pay</span> },
  { id: "googlepay", label: "Google Pay",     desc: "Google account",        logo: <span className="rounded-[4px] border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-[#5f6368]">G Pay</span> },
  { id: "upi",       label: "UPI / Wallets",  desc: "GPay, PhonePe, Paytm",  logo: <span className="rounded px-1.5 py-0.5 text-[8.5px] font-black text-white" style={{ background: "#5f259f" }}>UPI</span> },
  { id: "bank",      label: "Bank Transfer",  desc: "NEFT / RTGS / SWIFT",   logo: <span className="rounded px-1.5 py-0.5 text-[8.5px] font-black text-white" style={{ background: "#0f766e" }}>BANK</span> },
];

/* ── Transaction meta ─────────────────────────────────────────────────── */
const TX_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  coin_purchase:       { label: "Coin Purchase",       color: "#16a34a", bg: "#dcfce7", icon: <CreditCard className="h-3.5 w-3.5" /> },
  gift_received:       { label: "Gift Received",        color: "#2563eb", bg: "#dbeafe", icon: <Gift       className="h-3.5 w-3.5" /> },
  gift_sent:           { label: "Gift Sent",            color: "#dc2626", bg: "#fee2e2", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
  platform_commission: { label: "Platform Commission",  color: "#6b7280", bg: "#f3f4f6", icon: <Building2  className="h-3.5 w-3.5" /> },
  bonus_coins:         { label: "Bonus Coins",          color: "#7c3aed", bg: "#ede9fe", icon: <Sparkles   className="h-3.5 w-3.5" /> },
  promotion_spend:     { label: "Promotion Spend",      color: "#d97706", bg: "#fef3c7", icon: <Megaphone  className="h-3.5 w-3.5" /> },
  refund:              { label: "Refund",               color: "#0891b2", bg: "#cffafe", icon: <RefreshCw  className="h-3.5 w-3.5" /> },
  admin_adjustment:    { label: "Admin Adjustment",     color: "#374151", bg: "#f3f4f6", icon: <Star       className="h-3.5 w-3.5" /> },
  withdrawal:          { label: "Withdrawal",           color: "#9ca3af", bg: "#f3f4f6", icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
  credit:              { label: "Credit",               color: "#16a34a", bg: "#dcfce7", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  debit:               { label: "Debit",                color: "#dc2626", bg: "#fee2e2", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
};
function txMeta(t: string) {
  return TX_META[t] ?? { label: t, color: "#374151", bg: "#f3f4f6", icon: <RefreshCw className="h-3.5 w-3.5" /> };
}

/* ══════════════════════════════════════════════════════════════════════════
   PLAN CARD (main-page 6)
══════════════════════════════════════════════════════════════════════════ */
function PlanCard({ pkg, selected, onSelect }: { pkg: CoinPackage; selected: boolean; onSelect: () => void }) {
  const badgeColor =
    pkg.badge === "Popular" ? "#fd4605" :
    pkg.badge === "Creator" ? "#7c3aed" :
    pkg.badge === "Boost"   ? "#2563eb" :
    pkg.badge === "Pro"     ? "#0891b2" : "#374151";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center rounded-[16px] border px-2 pb-4 pt-6 transition focus:outline-none",
        selected
          ? "border-[#fd4605] bg-[#fff6f1] shadow-[0_0_0_2px_#fd4605]"
          : "border-[#f0f1f5] bg-white hover:border-[#fca5a5] hover:shadow-sm",
        pkg.badge && !selected && "border-[#fed7aa]",
      )}
    >
      {pkg.badge && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm"
          style={{ background: badgeColor }}
        >{pkg.badge}</span>
      )}
      {selected && (
        <span className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-[#fd4605]" style={{ width: 18, height: 18 }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}

      {/* Catalog number. Top-left is the only free corner: the badge owns top-centre
          and the selected tick owns top-right. */}
      <span className="absolute left-2 top-2 text-[9px] font-black tabular-nums text-[#c2c7d0]">
        {planNo(pkg.sort_order)}
      </span>

      {/* Animated coin icon */}
      <CoinPlanIcon icon={pkg.icon} iconUrl={pkg.icon_url} sort={pkg.sort_order} size={60} />

      {/* Admin bonus, when one is running: show what actually lands in the
          wallet, with the base struck through so the extra is legible. The
          server sends total_coins already derived, so this never recomputes
          it - the number shown is the number credited. */}
      {/* The headline is the coins the pack SELLS, never the bonus-inflated
          total. Showing the total here was also internally inconsistent: the
          rate line underneath divided the BASE coins by the price, so a pack
          advertised 25 RC and 79 RC per $1 when 25 for $0.19 is really 131. A
          bonus is an extra, stated as an extra. */}
      <p className="mt-2 text-[14px] font-black leading-tight text-[#111827]">
        {fmtRC(pkg.coins)}
      </p>
      <p className="text-[10px] font-semibold text-[#9ca3af]">RC</p>

      {pkg.bonus?.has_bonus ? (
        <>
          {/* The AMOUNT always, so the buyer can quantify the offer. The
              admin's promo tag rides beside it and never replaces it - a badge
              reading "New Now" tells nobody how many coins they get. */}
          <span className="mt-1 rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[9px] font-black text-[#92400e]">
            {pkg.bonus.bonus_text ?? `+${fmtRC(pkg.bonus.bonus_coins)} bonus coins`}
          </span>
          {pkg.bonus.bonus_label && (
            <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-[#b45309]">
              {pkg.bonus.bonus_label}
            </span>
          )}
          {/* What actually lands in the wallet, stated once and plainly. The
              server derives it, so this is the number that gets credited. */}
          <p className="mt-1 text-[9px] font-bold text-[#16a34a]">
            You get {fmtRC(pkg.bonus.total_coins)} RC
          </p>
        </>
      ) : (
        /* No admin bonus - fall back to the rate advantage a bigger pack
           already carries, which is a different claim and stays green. */
        bonusPct(pkg) > 0 && (
          <span className="mt-1 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9px] font-black text-[#16a34a]">
            +{bonusPct(pkg)}% bonus
          </span>
        )
      )}
      <p className="mt-2 text-[16px] font-black text-[#111827]">{fmtUSD(pkg.price_usd)}</p>
      {/* The rate is computed from the SAME number the headline shows, so the
          two can never contradict each other. When a bonus is running, the
          effective rate is shown beside it as its own claim rather than
          silently replacing the base one. */}
      <p className="text-[9px] tabular-nums text-[#9ca3af]">
        {Math.round(pkg.coins / pkg.price_usd)} RC per $1
      </p>
      {pkg.bonus?.has_bonus && pkg.price_usd > 0 && (
        <p className="text-[9px] font-bold tabular-nums text-[#16a34a]">
          {Math.round(pkg.bonus.total_coins / pkg.price_usd)} with bonus
        </p>
      )}
    </button>
  );
}

/**
 * Bonus coins over the $0.01/RC base rate, derived from what the server actually
 * sells. Not stored on the package - computing it here keeps the badge honest even
 * if an admin edits a price, rather than letting a hardcoded number drift.
 */
function bonusPct(pkg: CoinPackage): number {
  const base = pkg.price_usd * 100;          // coins the same money buys at base rate
  return base > 0 ? Math.round(((pkg.coins - base) / base) * 100) : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   SEE MORE COINS MODAL
══════════════════════════════════════════════════════════════════════════ */
/**
 * Price bands, lifted from the legend on the gift design sheet. These replace the old
 * coin-amount buckets (Starter / Creator / Business / …): people shop by what a thing
 * costs, not by how many coins it happens to grant, and since the coin rate now varies
 * with spend, a coin bucket no longer maps cleanly onto a price anyway.
 */
type ModalFilter = string;

const MODAL_FILTERS: { id: ModalFilter; label: string; minUsd: number; maxUsd: number }[] = [
  { id: "all",  label: "All",              minUsd: 0,       maxUsd: Infinity },
  { id: "b1",   label: "$0.19 – $0.99",    minUsd: 0,       maxUsd: 0.99     },
  { id: "b2",   label: "$1.19 – $2.99",    minUsd: 1,       maxUsd: 2.99     },
  { id: "b3",   label: "$3.49 – $5.99",    minUsd: 3,       maxUsd: 5.99     },
  { id: "b4",   label: "$6.99 – $9.99",    minUsd: 6,       maxUsd: 9.99     },
  { id: "b5",   label: "$10.99 – $14.99",  minUsd: 10,      maxUsd: 14.99    },
  { id: "b6",   label: "$15.99 – $24.99",  minUsd: 15,      maxUsd: 24.99    },
  { id: "b7",   label: "$25.99 – $39.99",  minUsd: 25,      maxUsd: 39.99    },
  { id: "b8",   label: "$49.99 – $79.99",  minUsd: 49,      maxUsd: 79.99    },
  { id: "b9",   label: "$99.99 – $149.99", minUsd: 99,      maxUsd: 149.99   },
  { id: "b10",  label: "$199.99 – $399.99",minUsd: 199,     maxUsd: 399.99   },
  { id: "b11",  label: "$419.99 – $999.99",minUsd: 400,     maxUsd: 999.99   },
  { id: "b12",  label: "$1,599.99 – $2,000", minUsd: 1000,  maxUsd: Infinity },
];

function SeeMoreModal({
  allPkgs, currentId, onSelect, onClose,
}: {
  allPkgs: CoinPackage[];
  currentId: number | null;
  onSelect: (p: CoinPackage) => void;
  onClose: () => void;
}) {
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<ModalFilter>("all");
  const inputRef              = useRef<HTMLInputElement>(null);

  // Escape key to close
  const escRef = useRef(onClose);
  escRef.current = onClose;
  // biome-ignore lint: effect intentional
  useState(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && escRef.current();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });

  // Always the whole catalog, in catalog order. The old default tab hid the 5 plans that
  // are on the main page, so the list opened at #02 with a hole in the numbering - which
  // reads as a bug, not a feature.
  const baseList = [...allPkgs].sort((a, b) => a.sort_order - b.sort_order);

  const filterMeta  = MODAL_FILTERS.find(f => f.id === filter) ?? MODAL_FILTERS[0];
  const displayList = baseList.filter(p => {
    const inBand = p.price_usd >= filterMeta.minUsd && p.price_usd <= filterMeta.maxUsd;
    const q      = search.trim().toLowerCase();
    const text   = !q || p.plan_name.toLowerCase().includes(q)
                     || String(p.coins).includes(q)
                     || String(p.price_usd).includes(q);
    return inBand && text;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative flex h-[91vh] w-full max-w-[940px] flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-4">
          <div>
            <h2 className="text-[17px] font-black text-[#111827]">Buy Teezer Coins</h2>
            {/* Not "100 RC = $1.00" any more: the ladder runs 79 → 100 RC per dollar, so a
                flat rate here would be a false price. State the shape of it instead. */}
            <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">
              {allPkgs.length} plans · bigger plans earn a better coin rate · Click any plan to select
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151] transition hover:bg-[#e5e7eb]"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Search + price bands */}
        <div className="flex-shrink-0 space-y-2.5 border-b border-[#f3f4f6] px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"/>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, RC amount, or price…"
              className="w-full rounded-[10px] border border-[#e5e7eb] bg-[#f8f9fb] py-2.5 pl-9 pr-9 text-[13px] outline-none focus:border-[#fd4605] focus:bg-white"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                <X className="h-3.5 w-3.5"/>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MODAL_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11.5px] font-bold transition",
                  filter === f.id
                    ? "border-[#fd4605] bg-[#fd4605] text-white"
                    : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fca5a5]",
                )}
              >{f.label}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {allPkgs.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-[#d1d5db]"/>
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Search className="h-10 w-10 text-[#d1d5db]"/>
              <p className="mt-3 text-[13.5px] font-bold text-[#374151]">No plans found</p>
              <p className="mt-1 text-[11.5px] text-[#9ca3af]">Try a different search or filter</p>
              <button onClick={() => { setSearch(""); setFilter("all"); }}
                className="mt-3 text-[12.5px] font-bold text-[#fd4605]">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {displayList.map(p => {
                const isSel = p.id === currentId;
                const badgeColor =
                  p.badge === "Popular" ? "#fd4605" :
                  p.badge === "Creator" ? "#7c3aed" :
                  p.badge === "Boost"   ? "#2563eb" : "#0891b2";
                return (
                  <button
                    key={p.id}
                    onClick={() => { onSelect(p); onClose(); }}
                    className={cn(
                      "relative flex flex-col items-center rounded-[14px] border px-2 pb-3 pt-5 text-center transition hover:shadow-sm",
                      isSel
                        ? "border-[#fd4605] bg-[#fff6f1] shadow-md"
                        : "border-[#f0f1f5] bg-white hover:border-[#fca5a5]",
                      p.badge && !isSel && "border-[#fed7aa]",
                    )}
                  >
                    {p.badge && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[8.5px] font-black text-white uppercase"
                        style={{ background: badgeColor }}>{p.badge}</span>
                    )}
                    {isSel && (
                      <span className="absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-[#fd4605]" style={{ width: 16, height: 16 }}>
                        <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                    <span className="absolute left-1.5 top-1.5 text-[8.5px] font-black tabular-nums text-[#c2c7d0]">
                      {planNo(p.sort_order)}
                    </span>
                    <CoinPlanIcon icon={p.icon} iconUrl={p.icon_url} sort={p.sort_order} size={48} />
                    <p className="mt-1.5 text-[11.5px] font-black leading-tight text-[#111827]">{p.plan_name}</p>
                    <p className="text-[10px] font-bold text-[#fd4605]">{fmtRC(p.coins)} RC</p>
                    <p className="mt-1 text-[13px] font-black text-[#111827]">{fmtUSD(p.price_usd)}</p>
                    {/* Not "$0.01/RC": rounded to cents that reads the same on every plan and
                        is wrong on the cheap ones ($0.0127). Coins per dollar is the number a
                        buyer actually compares, and it shows bigger plans paying better. */}
                    <p className="text-[8.5px] tabular-nums text-[#9ca3af]">
                      {Math.round(p.coins / p.price_usd)} RC per $1
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between border-t border-[#f3f4f6] px-6 py-3">
          <p className="text-[11px] text-[#9ca3af]">
            Showing {displayList.length} of {baseList.length} plans
          </p>
          <button onClick={onClose}
            className="rounded-[10px] border border-[#e5e7eb] px-4 py-2 text-[12.5px] font-bold text-[#374151] hover:bg-[#f8f9fb] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAYPAL CHECKOUT - handles SDK loading state, must be inside ScriptProvider
══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
   TRANSACTION HISTORY MODAL

   The page shows only the first page of transactions. This is the full ledger:
   server-paginated (the endpoint already takes page / per_page / type), filterable
   by type, and it carries the one column the page has no room for - the running
   balance after each row, which is what people actually open a history to check.
══════════════════════════════════════════════════════════════════════════ */
const TX_PER_PAGE = 25;

function TransactionsModal({ initialType, onClose }: {
  initialType: string;
  onClose: () => void;
}) {
  const [type, setType] = useState(initialType);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    // The page behind a full-screen dialog must not scroll under it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const q = useQuery({
    queryKey: ["wallets-coins-tx-all", type, page],
    queryFn:  () => walletCoinsService.transactions({
      type: type === "all" ? undefined : type,
      page,
      per_page: TX_PER_PAGE,
    }),
    // Hold the previous page on screen while the next one loads, so paging does
    // not flash the table back to a skeleton.
    placeholderData: (prev) => prev,
  });

  const rows  = (q.data?.data ?? []) as WalletTransaction[];
  const meta  = q.data?.meta;
  const total = meta?.total ?? rows.length;
  const last  = meta?.last_page ?? 1;
  const from  = total === 0 ? 0 : (page - 1) * TX_PER_PAGE + 1;
  const to    = Math.min(page * TX_PER_PAGE, total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Transaction history">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[88vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl">

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#f3f4f6] px-6 py-4">
          <div>
            <h2 className="text-[17px] font-black text-[#111827]">Transaction History</h2>
            <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">
              {q.isLoading
                ? "Loading…"
                : total === 0
                ? "Nothing here yet"
                : `${total.toLocaleString()} transaction${total === 1 ? "" : "s"} · every coin in and out of your wallet`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151] transition hover:bg-[#e5e7eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fd4605]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type filter */}
        <div className="flex-shrink-0 overflow-x-auto border-b border-[#f3f4f6] px-6 py-3">
          <div className="flex gap-1.5">
            {([["all", "All"], ...Object.entries(TX_META).map(([k, m]) => [k, m.label] as const)] as [string, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setType(k); setPage(1); }}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-bold transition",
                  type === k
                    ? "bg-[#fd4605] text-white"
                    : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Column header */}
        <div className="grid flex-shrink-0 grid-cols-[1.3fr_2fr_1.2fr_.9fr_.9fr_1fr_1fr_.8fr] border-b border-[#f3f4f6] bg-[#fbfbfc] px-6 py-2.5">
          {["Date", "Description", "Type", "Gross RC", "Commission", "Net", "Balance After", "Status"].map(h => (
            <p key={h} className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{h}</p>
          ))}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {q.isLoading ? (
            <div className="divide-y divide-[#f8f9fb]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-[#f3f4f6]" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-[#f3f4f6]" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <RefreshCw className="h-10 w-10 text-[#d1d5db]" />
              <p className="mt-3 text-[13px] font-bold text-[#374151]">
                {type === "all" ? "No transactions yet" : `No ${txMeta(type).label.toLowerCase()} transactions`}
              </p>
              <p className="mt-1 text-[11.5px] text-[#9ca3af]">
                {type === "all"
                  ? "Buy coins or receive a gift to get started"
                  : "Try a different type filter"}
              </p>
              {type !== "all" && (
                <button
                  onClick={() => { setType("all"); setPage(1); }}
                  className="mt-4 rounded-[9px] border border-[#e5e7eb] px-3.5 py-1.5 text-[12px] font-bold text-[#374151] transition hover:bg-[#f9fafb]"
                >
                  Show all transactions
                </button>
              )}
            </div>
          ) : (
            rows.map((t) => {
              const m   = txMeta(t.type);
              const pos = t.net_coins > 0 || t.amount_usd > 0;
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1.3fr_2fr_1.2fr_.9fr_.9fr_1fr_1fr_.8fr] items-center border-b border-[#f8f9fb] px-6 py-3.5 transition last:border-0 hover:bg-[#fafafa]"
                >
                  <div>
                    <p className="text-[11.5px] font-semibold text-[#111827]">
                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-[10px] text-[#9ca3af]">
                      {new Date(t.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="pr-3">
                    <p className="truncate text-[11.5px] text-[#374151]">{t.description}</p>
                    {t.reference_id && (
                      <p className="truncate font-mono text-[9.5px] text-[#c2c7d0]">{t.reference_id}</p>
                    )}
                  </div>

                  <span
                    className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                    style={{ color: m.color, backgroundColor: m.bg }}
                  >
                    {m.icon}{m.label}
                  </span>

                  <p className={cn("text-[11.5px] font-semibold tabular-nums", t.gross_coins < 0 ? "text-[#dc2626]" : "text-[#374151]")}>
                    {t.gross_coins !== 0 ? `${t.gross_coins > 0 ? "+" : ""}${fmtRC(t.gross_coins)}` : "-"}
                  </p>

                  <p className="text-[11.5px] tabular-nums text-[#9ca3af]">
                    {t.commission_coins > 0 ? `-${fmtRC(t.commission_coins)}` : "-"}
                  </p>

                  <p className={cn("text-[11.5px] font-bold tabular-nums", pos ? "text-[#16a34a]" : "text-[#dc2626]")}>
                    {t.net_coins !== 0
                      ? `${t.net_coins > 0 ? "+" : ""}${fmtRC(Math.abs(t.net_coins))} RC`
                      : t.amount_usd !== 0
                      ? `${t.amount_usd > 0 ? "+" : ""}${fmtUSD(Math.abs(t.amount_usd))}`
                      : "-"}
                  </p>

                  {/* The reason this modal exists: the running balance the page cannot fit. */}
                  <div className="tabular-nums">
                    <p className="text-[11.5px] font-semibold text-[#111827]">{fmtRC(t.balance_after_coins)} RC</p>
                    {t.wallet_balance_after_usd > 0 && (
                      <p className="text-[10px] text-[#9ca3af]">{fmtUSD(t.wallet_balance_after_usd)}</p>
                    )}
                  </div>

                  <span className={cn("text-[10px] font-bold", t.status === "completed" ? "text-[#16a34a]" : "text-[#d97706]")}>
                    {t.status ?? "completed"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#f3f4f6] px-6 py-3">
          <p className="text-[11.5px] text-[#9ca3af]">
            {total === 0 ? "No results" : <>Showing <span className="font-bold text-[#374151]">{from}–{to}</span> of {total.toLocaleString()}</>}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || q.isFetching}
              className="flex items-center gap-1 rounded-[9px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-bold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="min-w-[74px] text-center text-[11.5px] font-bold tabular-nums text-[#6b7280]">
              {q.isFetching ? "Loading…" : `Page ${page} / ${last}`}
            </span>
            <button
              onClick={() => setPage(p => Math.min(last, p + 1))}
              disabled={page >= last || q.isFetching}
              className="flex items-center gap-1 rounded-[9px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-bold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayPalCheckout({ selectedPkg, canBuy, clientId, pendingOrderRef, onSuccess }: {
  selectedPkg: CoinPackage;
  canBuy: boolean;
  clientId: string;
  pendingOrderRef: React.MutableRefObject<{ id: number; coins: number } | null>;
  onSuccess: (coinsAdded: number) => Promise<void>;
}) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();

  if (!clientId || clientId === "sb") {
    return (
      <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-center">
        <p className="text-[12px] font-bold text-[#92400e]">PayPal not configured</p>
        <p className="mt-0.5 text-[10.5px] text-[#b45309]">
          Set PayPal Client ID in Admin → Payment Settings.
        </p>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="rounded-[10px] border border-[#fee2e2] bg-[#fff5f5] px-3 py-3 text-center">
        <p className="text-[12px] font-bold text-red-600">PayPal failed to load</p>
        <p className="mt-0.5 text-[10.5px] text-red-500">Check your PayPal Client ID in admin settings.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-[#f8f9fb] py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
        <span className="text-[12px] text-[#6b7280]">Loading PayPal…</span>
      </div>
    );
  }

  return (
    <PayPalButtons
      style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 40 }}
      disabled={!canBuy}
      createOrder={async () => {
        const d = await walletCoinsService.createOrder({
          package_id: selectedPkg.id,
          payment_method: "paypal",
        });
        pendingOrderRef.current = { id: d.order_id, coins: d.coins };
        return d.paypal_order_id!;
      }}
      onApprove={async (data: { orderID?: string }) => {
        if (!pendingOrderRef.current) return;
        const result = await walletCoinsService.capturePaypalOrder({
          order_id: pendingOrderRef.current.id,
          paypal_order_id: data.orderID ?? "",
        });
        pendingOrderRef.current = null;
        await onSuccess(result.coins_added);
      }}
      onError={() => {
        toast.error("PayPal payment failed. Please try again.");
        pendingOrderRef.current = null;
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   STRIPE CHECKOUT - inner form, must be inside <Elements> provider
══════════════════════════════════════════════════════════════════════════ */
function StripePaymentForm({ orderId, onSuccess, onCancel }: {
  orderId: number;
  onSuccess: (coinsAdded: number) => Promise<void>;
  onCancel: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (error) {
        toast.error(error.message ?? "Payment failed. Please try again.");
      } else if (paymentIntent?.status === "succeeded") {
        const result = await walletCoinsService.captureStripePayment(orderId, paymentIntent.id);
        await onSuccess(result.coins_added);
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
        {paying ? "Processing…" : "Pay Now"}
      </button>
      <button type="button" onClick={onCancel}
        className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]">
        Cancel
      </button>
    </form>
  );
}

function StripeCheckout({ selectedPkg, onSuccess, onCancel }: {
  selectedPkg: CoinPackage;
  onSuccess: (coinsAdded: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId]           = useState<number | null>(null);
  const [loading, setLoading]           = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  const payConfigQ = useQuery({
    queryKey: ["payment-config"],
    queryFn:  walletCoinsService.paymentConfig,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const pk = payConfigQ.data?.stripe?.publishable_key;
    if (pk) {
      setStripePromise(loadStripe(pk));
    }
  }, [payConfigQ.data?.stripe?.publishable_key]);

  const initStripe = async () => {
    setLoading(true);
    try {
      const data = await walletCoinsService.createStripeIntent(selectedPkg.id);
      setClientSecret(data.client_secret);
      setOrderId(data.order_id);
    } catch {
      toast.error("Failed to initialise Stripe payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!payConfigQ.data?.stripe?.publishable_key) {
    return (
      <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-center">
        <p className="text-[12px] font-bold text-[#92400e]">Stripe not configured</p>
        <p className="mt-0.5 text-[10.5px] text-[#b45309]">Set Stripe keys in Admin → Payment Settings.</p>
      </div>
    );
  }

  if (!clientSecret || !orderId || !stripePromise) {
    return (
      <button
        onClick={initStripe}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fd4605] py-3 text-[13px] font-black text-white transition hover:bg-[#e03e04] disabled:opacity-60"
      >
        <Lock className="h-3.5 w-3.5" />
        {loading ? "Loading…" : `Pay with Card - $${selectedPkg.price_usd.toFixed(2)}`}
      </button>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <StripePaymentForm
        orderId={orderId}
        onSuccess={onSuccess}
        onCancel={() => { setClientSecret(null); setOrderId(null); onCancel(); }}
      />
    </Elements>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RAZORPAY CHECKOUT - dynamically loads Razorpay script
══════════════════════════════════════════════════════════════════════════ */
function RazorpayCheckout({ selectedPkg, onSuccess, onCancel }: {
  selectedPkg: CoinPackage;
  onSuccess: (coinsAdded: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const order = await walletCoinsService.createRazorpayOrder(selectedPkg.id);

      // Load Razorpay script dynamically
      await new Promise<void>((resolve, reject) => {
        if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Razorpay) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });

      const RazorpayClass = (window as unknown as Record<string, unknown>).Razorpay as new (opts: Record<string, unknown>) => { open: () => void };
      const rzp = new RazorpayClass({
        key:          order.key_id,
        amount:       Math.round(order.amount * 100),
        currency:     "USD",
        name:         "Teezer Coins",
        description:  `${selectedPkg.coins} RC - ${selectedPkg.plan_name}`,
        order_id:     order.razorpay_order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const result = await walletCoinsService.captureRazorpayPayment({
              order_id:            order.order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_signature:  response.razorpay_signature,
            });
            await onSuccess(result.coins_added);
          } catch {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        modal: { ondismiss: onCancel },
      });
      rzp.open();
    } catch (err) {
      toast.error("Failed to initialise Razorpay. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#5f259f] py-3 text-[13px] font-black text-white transition hover:bg-[#4b1d80] disabled:opacity-60"
    >
      <Lock className="h-3.5 w-3.5" />
      {loading ? "Loading…" : `Pay with UPI / Razorpay - $${selectedPkg.price_usd.toFixed(2)}`}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   BANK TRANSFER CHECKOUT
══════════════════════════════════════════════════════════════════════════ */
function BankTransferCheckout({ selectedPkg, payConfig, onSuccess, onCancel }: {
  selectedPkg: CoinPackage;
  payConfig: PaymentConfig | undefined;
  onSuccess: (coinsAdded: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep]             = useState<"confirm" | "details">("confirm");
  const [loading, setLoading]       = useState(false);
  const [reference, setReference]   = useState("");
  const [orderId, setOrderId]       = useState<number | null>(null);
  const [copied, setCopied]         = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const data = await walletCoinsService.createBankTransferOrder(selectedPkg.id);
      setReference(data.reference);
      setOrderId(data.order_id);
      setStep("details");
    } catch {
      toast.error("Failed to create bank transfer order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bankDetails = payConfig?.bank;

  if (step === "confirm") {
    return (
      <div className="space-y-3">
        <div className="rounded-[10px] border border-[#e0e7ff] bg-[#f5f3ff] p-3">
          <p className="text-[11.5px] font-bold text-[#4338ca]">Bank Transfer</p>
          <p className="mt-1 text-[10.5px] text-[#4338ca]">
            Confirm your order to receive bank details and a reference number.
            Coins will be credited within 1-3 business days after payment is received.
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#0f766e] py-3 text-[13px] font-black text-white transition hover:bg-[#0d6b63] disabled:opacity-60"
        >
          <Lock className="h-3.5 w-3.5" />
          {loading ? "Creating order…" : "Confirm Order"}
        </button>
        <button type="button" onClick={onCancel}
          className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]">Cancel</button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-bold text-[#92400e]">Order #{orderId}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[10.5px] font-mono font-bold text-[#92400e]">{reference}</p>
            <button onClick={handleCopy} className="text-[#92400e] hover:text-[#78350f]">
              {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#92400e]">Include this reference in your payment description.</p>
      </div>
      {bankDetails && (
        <div className="rounded-[10px] border border-[#e5e7eb] bg-[#f8f9fb] p-3 space-y-1.5">
          <p className="text-[10.5px] font-black text-[#374151]">Bank Details</p>
          {([
            ["Account Holder", bankDetails.account_holder],
            ["Bank Name",      bankDetails.bank_name],
            ["Account Number", bankDetails.account_number],
            ["Routing / IFSC", bankDetails.routing_number],
            ["SWIFT / BIC",    bankDetails.swift_code],
          ] as const).filter(([, v]) => v).map(([label, val]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[10px] text-[#6b7280]">{label}</span>
              <span className="text-[10.5px] font-semibold text-[#111827]">{val}</span>
            </div>
          ))}
          {bankDetails.instructions && (
            <p className="mt-1.5 text-[10px] text-[#374151] border-t border-[#e5e7eb] pt-1.5">
              {bankDetails.instructions}
            </p>
          )}
        </div>
      )}
      <button type="button" onClick={onCancel}
        className="w-full text-[11px] text-[#9ca3af] hover:text-[#374151]">Close</button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export function StudioWalletsCoinsPage() {
  const { isAuthenticated, authReady } = useAuthStore();
  const queryClient = useQueryClient();

  const [collapsed,    setCollapsed]    = useState(false);
  const [dateRange,    setDateRange]    = useState({
    start: new Date(Date.now() - 6 * 86400000), end: new Date(),
  });
  const [selectedPkg,  setSelectedPkg]  = useState<CoinPackage | null>(null);
  const [payMethod,    setPayMethod]    = useState<PayMethod | null>(null);
  const [txFilter,     setTxFilter]     = useState("all");
  const [showModal,    setShowModal]    = useState(false);
  const [showTxModal,  setShowTxModal]  = useState(false);
  const [showHelpTip,  setShowHelpTip]  = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{ id: number; ref: string } | null>(null);
  const pendingOrderRef = useRef<{ id: number; coins: number } | null>(null);

  /* Picking a pack inside the modal is only half the job - the payment methods live
     further down the page, so bring them into view instead of dropping the buyer
     back onto whatever they happened to be scrolled to. */
  const buySectionRef = useRef<HTMLDivElement>(null);
  const scrollToBuy = () =>
    buySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ── Queries ─────────────────────────────────────────────────────────── */
  const payConfigQ = useQuery({
    queryKey: ["payment-config"],
    queryFn:  walletCoinsService.paymentConfig,
    staleTime: 10 * 60_000,
  });

  // Load ALL packages eagerly - used on main page, see-more card, and modal
  const pkgsQ = useQuery({
    queryKey: ["wallets-coins-packages"],
    queryFn:  () => walletCoinsService.packages(true),
    enabled:  !!isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const dashQ = useQuery({
    queryKey: ["wallets-coins-dashboard"],
    queryFn:  walletCoinsService.dashboard,
    enabled:  !!isAuthenticated,
  });

  const txQ = useQuery({
    queryKey: ["wallets-coins-tx", txFilter],
    queryFn:  () => walletCoinsService.transactions({
      type: txFilter === "all" ? undefined : txFilter,
    }),
    enabled:  !!isAuthenticated,
  });

  /* ── Derived data ────────────────────────────────────────────────────── */
  const allPkgs  = pkgsQ.data  ?? [];
  const frontPkgs= allPkgs.filter(p => p.is_front_visible);
  const morePkgs = allPkgs.filter(p => !p.is_front_visible);
  const txRows   = (txQ.data?.data ?? []) as WalletTransaction[];
  const wallet   = dashQ.data?.wallet;
  const commission = dashQ.data?.commission;

  /* ── Mutations ───────────────────────────────────────────────────────── */
  const createOrderMut = useMutation({
    mutationFn: walletCoinsService.createOrder,
    onSuccess: d => {
      setCurrentOrder({ id: d.order_id, ref: d.reference });
      toast.success(`Order ${d.reference} created! Complete payment to receive ${fmtRC(d.coins)} RC.`);
    },
    onError: () => toast.error("Failed to create order. Please try again."),
  });

  if (!authReady || !isAuthenticated) return <div className="min-h-screen bg-[#f8f9fb]" />;

  const canBuy = !!selectedPkg && !!payMethod;
  const paypalClientId = payConfigQ.data?.paypal?.client_id
    || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    || "sb";

  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD" }}>
    <>
      <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
        <StudioSidebarWrapper
          collapsed={collapsed}
          onToggle={() => setCollapsed(o => !o)}
          activeHref="/studio/wallets-coins"
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <StudioTopbarShared
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            searchPlaceholder="Search creators, videos, hashtags…"
          />

          {/* Page header */}
          <div className="flex-shrink-0 border-b border-[#f0f0f0] bg-white px-6 py-3.5">
            <div className="mb-1 flex items-center gap-1 text-[11.5px] text-[#9ca3af]">
              <span>Dashboard</span>
              <ChevronRight className="h-3 w-3"/>
              <span className="text-[#374151]">Wallets &amp; Coins</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-black leading-tight text-[#111827]">Wallets &amp; Coins</h1>
                <p className="mt-0.5 text-[12px] text-[#6b7280]">
                  Manage your balance, buy coins, and track every transaction.
                </p>
              </div>
              {/* "100 RC = $1.00" would overstate it: only the largest plans hit 100 RC per
                  dollar, the cheapest give 79. Claim the ceiling, not a flat rate. */}
              <span className="flex items-center gap-1.5 rounded-full border border-[#dcfce7] bg-[#f0fdf4] px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#16a34a]"/>
                <span className="text-[11px] font-bold text-[#16a34a]">Up to 100 RC per $1</span>
              </span>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 px-5 py-4">

              {/* ── 4 Stat Cards ──────────────────────────────────────────── */}
              <div className="grid grid-cols-4 gap-3">

                {/* Wallet Balance */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="flex items-start gap-3 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#fff0f3]">
                      <Wallet className="h-5 w-5 text-[#fd4605]"/>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#9ca3af]">
                        Wallet Balance
                        <Tip text="USD value of earned coins after 30% commission. Withdrawable.">
                          <HelpCircle className="h-3 w-3 cursor-help text-[#d1d5db]"/>
                        </Tip>
                      </p>
                      {dashQ.isLoading
                        ? <div className="mt-1 h-8 w-20 animate-pulse rounded bg-[#f3f4f6]"/>
                        : <p className="mt-0.5 text-[26px] font-black leading-tight text-[#111827]">{wallet ? fmtUSD(wallet.wallet_balance_usd) : "$0.00"}</p>
                      }
                      <p className="text-[10.5px] text-[#9ca3af]">Withdrawable</p>
                      <button className="mt-3 rounded-[8px] border border-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-[#fd4605] hover:bg-[#fff0f3] transition active:scale-[.97]">
                        Withdraw
                      </button>
                    </div>
                  </div>
                  <div className="mx-5 flex items-center justify-between border-t border-[#f3f4f6] pb-4 pt-3">
                    <span className="text-[10.5px] text-[#9ca3af]">Pending</span>
                    <span className="text-[12px] font-bold text-[#d97706]">{wallet ? fmtUSD(wallet.pending_balance_usd) : "$0.00"}</span>
                  </div>
                </div>

                {/* RC Balance */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="flex items-start gap-3 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#fffbeb]">
                      <RC size={28}/>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#9ca3af]">
                        RC Balance
                        <Tip text="Purchased coins for spending on gifts and promotions. Cannot be withdrawn.">
                          <HelpCircle className="h-3 w-3 cursor-help text-[#d1d5db]"/>
                        </Tip>
                      </p>
                      {dashQ.isLoading
                        ? <div className="mt-1 h-8 w-20 animate-pulse rounded bg-[#f3f4f6]"/>
                        : (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="text-[26px] font-black leading-tight text-[#111827]">{wallet ? fmtRC(wallet.coin_balance) : "0"}</p>
                            <RC size={18}/>
                          </div>
                        )
                      }
                      <p className="text-[10.5px] text-[#9ca3af]">Spendable coins</p>
                      <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="mt-3 rounded-[8px] border border-[#f59e0b] px-4 py-1.5 text-[12px] font-bold text-[#d97706] transition hover:bg-[#fffbeb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b] active:scale-[.97]"
                      >
                        Buy More
                      </button>
                    </div>
                  </div>
                  <div className="mx-5 flex items-center justify-between border-t border-[#f3f4f6] pb-4 pt-3">
                    <span className="text-[10.5px] text-[#9ca3af]">Total purchased</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] font-bold text-[#111827]">{wallet ? fmtRC(wallet.total_purchased_coins) : "0"}</span>
                      <RC size={12}/>
                    </div>
                  </div>
                </div>

                {/* Bonus Coins */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="flex items-start gap-3 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#ede9fe]">
                      <Sparkles className="h-5 w-5 text-[#7c3aed]"/>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#9ca3af]">
                        Bonus Coins
                        <Tip text="Free promotional coins from daily rewards, contests, or admin grants.">
                          <HelpCircle className="h-3 w-3 cursor-help text-[#d1d5db]"/>
                        </Tip>
                      </p>
                      {dashQ.isLoading
                        ? <div className="mt-1 h-8 w-20 animate-pulse rounded bg-[#f3f4f6]"/>
                        : (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="text-[26px] font-black leading-tight text-[#111827]">{wallet ? fmtRC(wallet.bonus_coin_balance) : "0"}</p>
                            <RC size={18}/>
                          </div>
                        )
                      }
                      <p className="text-[10.5px] text-[#9ca3af]">Promo coins</p>
                    </div>
                  </div>
                  <div className="mx-5 flex items-center justify-between border-t border-[#f3f4f6] pb-4 pt-3">
                    <span className="text-[10.5px] text-[#9ca3af]">Earned from gifts</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] font-bold text-[#111827]">{wallet ? fmtRC(wallet.earned_coin_balance) : "0"}</span>
                      <RC size={12}/>
                    </div>
                  </div>
                </div>

                {/* Pending */}
                <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="flex items-start gap-3 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#fef3c7]">
                      <Clock className="h-5 w-5 text-[#d97706]"/>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#9ca3af]">
                        Pending Balance
                        <Tip text="Earnings under review. Typically clears within 7 days.">
                          <HelpCircle className="h-3 w-3 cursor-help text-[#d1d5db]"/>
                        </Tip>
                      </p>
                      {dashQ.isLoading
                        ? <div className="mt-1 h-8 w-20 animate-pulse rounded bg-[#f3f4f6]"/>
                        : <p className="mt-0.5 text-[26px] font-black leading-tight text-[#111827]">{wallet ? fmtUSD(wallet.pending_balance_usd) : "$0.00"}</p>
                      }
                      <p className="text-[10.5px] text-[#9ca3af]">Clears in ~7 days</p>
                    </div>
                  </div>
                  <div className="mx-5 flex items-center justify-between border-t border-[#f3f4f6] pb-4 pt-3">
                    <span className="text-[10.5px] text-[#9ca3af]">Min withdrawal</span>
                    <span className="text-[12px] font-bold text-[#111827]">{commission ? fmtUSD(commission.min_withdrawal_usd) : "$10.00"}</span>
                  </div>
                </div>
              </div>

              {/* ── 2-column layout ──────────────────────────────────────── */}
              <div className="grid grid-cols-[1fr_320px] gap-4">

                {/* LEFT */}
                <div className="space-y-4">

                  {/* Creator Earnings Summary (only shown when there's data) */}
                  {wallet && wallet.total_received_coins > 0 && (
                    <div className="rounded-[16px] border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-[#fef3c7] p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fbbf24]">
                          <TrendingUp className="h-4 w-4 text-[#92400e]"/>
                        </div>
                        <div>
                          <h3 className="text-[14px] font-black text-[#111827]">Creator Earnings Summary</h3>
                          <p className="text-[11px] text-[#92400e]">After 30% Teezer platform commission</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "Total Received",     value: `${fmtRC(wallet.total_received_coins)} RC`,   tip: "Total coins received from gifts and tips before commission" },
                          { label: "Commission (30%)",   value: `${fmtRC(wallet.total_commission_coins)} RC`, tip: "Platform fee deducted automatically from all received gifts" },
                          { label: "Net Earned",         value: `${fmtRC(wallet.total_net_earned_coins)} RC`, tip: "Your coins after commission - 70% of received total" },
                          { label: "Wallet Balance",     value: fmtUSD(wallet.wallet_balance_usd),             tip: "Net earned coins → USD (÷100). This is withdrawable." },
                        ].map(card => (
                          <div key={card.label} className="rounded-[12px] border border-[#fde68a] bg-white/70 p-3 text-center">
                            <p className="flex items-center justify-center gap-1 text-[10.5px] font-semibold text-[#92400e]">
                              {card.label}
                              <Tip text={card.tip}><HelpCircle className="h-3 w-3 cursor-help text-[#ca8a04]"/></Tip>
                            </p>
                            <p className="mt-1 text-[15px] font-black text-[#111827]">{card.value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10.5px] leading-relaxed text-[#92400e]">
                        Teezer deducts 30% platform commission from all gifts and creator earnings.
                        Your Wallet Balance shows the remaining withdrawable value. Purchased coins cannot be withdrawn.
                      </p>
                    </div>
                  )}

                  {/* Buy Teezer Coins */}
                  <div ref={buySectionRef} className="scroll-mt-4 rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
                      <div>
                        <h2 className="text-[14px] font-black text-[#111827]">Buy Teezer Coins</h2>
                        <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">
                          {GIFTS.length} animated gifts · {fmtUSD(GIFTS[0].priceUsd)} – {fmtUSD(GIFTS[GIFTS.length - 1].priceUsd)}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 rounded-full border border-[#dcfce7] bg-[#f0fdf4] px-3 py-1">
                        <Lock className="h-3.5 w-3.5 text-[#16a34a]"/>
                        <span className="text-[11px] font-bold text-[#16a34a]">Secure</span>
                      </span>
                    </div>

                    <div className="p-5">
                      {pkgsQ.isLoading ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-[180px] animate-pulse rounded-[16px] bg-[#f3f4f6]"/>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {frontPkgs.map(p => (
                            <PlanCard
                              key={p.id}
                              pkg={p}
                              selected={selectedPkg?.id === p.id}
                              onSelect={() => setSelectedPkg(p)}
                            />
                          ))}

                          {/* See More Gifts - opens the full 200-pack catalog */}
                          <button
                            onClick={() => setShowModal(true)}
                            className="group relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[16px] border border-dashed border-[#fca5a5] bg-gradient-to-b from-[#fff6f1] to-[#ffe4e6] px-2 py-3 transition hover:border-solid hover:border-[#fd4605] hover:shadow-[0_8px_20px_-10px_rgba(253,70,5,.55)] active:scale-[.97]"
                          >
                            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/50 opacity-0 transition-all duration-500 group-hover:left-[110%] group-hover:opacity-100" />

                            <div className="relative h-[52px] w-[62px]">
                              {[
                                { g: GIFTS[168], x: 0,  y: 10, r: -14, s: 30, o: .75 },
                                { g: GIFTS[199], x: 17, y: 0,  r: 0,   s: 38, o: 1   },
                                { g: GIFTS[124], x: 36, y: 10, r: 14,  s: 30, o: .75 },
                              ].map(({ g, x, y, r, s, o }) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={g.slug} src={g.icon} alt="" width={s} height={s}
                                  loading="lazy" decoding="async"
                                  className="absolute select-none transition-transform duration-300 group-hover:scale-110"
                                  style={{ left: x, top: y, width: s, height: s, opacity: o, transform: `rotate(${r}deg)` }}
                                />
                              ))}
                            </div>

                            <p className="text-center text-[11px] font-black leading-tight text-[#fd4605]">
                              See More Gifts
                            </p>
                            <span className="flex items-center gap-1 rounded-full bg-[#fd4605] px-2.5 py-1 text-[9.5px] font-black text-white shadow-sm">
                              +{morePkgs.length} more
                              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Plan picked from the modal (not in the front row) */}
                      {selectedPkg && !frontPkgs.find(p => p.id === selectedPkg.id) && (
                        <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-[#fd4605] bg-[#fff6f1] px-4 py-3">
                          <CoinPlanIcon icon={selectedPkg.icon} iconUrl={selectedPkg.icon_url} sort={selectedPkg.sort_order} size={42}/>
                          <div className="flex-1">
                            <p className="text-[12.5px] font-black text-[#111827]">{selectedPkg.plan_name}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-[#fd4605]">{fmtRC(selectedPkg.coins)} RC</span>
                              <span className="text-[#d1d5db]">·</span>
                              <span className="text-[11px] text-[#6b7280]">{fmtUSD(selectedPkg.price_usd)}</span>
                            </div>
                          </div>
                          <button onClick={() => setSelectedPkg(null)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626] hover:bg-[#fecaca]">
                            <X className="h-3.5 w-3.5"/>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Feature strip */}
                    <div className="grid grid-cols-4 border-t border-[#f3f4f6]">
                      {[
                        { icon: <Zap className="h-4 w-4 text-[#2563eb]"/>,         bg: "bg-[#dbeafe]", t: "Instant Delivery",  s: "Coins added instantly"    },
                        { icon: <ShieldCheck className="h-4 w-4 text-[#16a34a]"/>, bg: "bg-[#dcfce7]", t: "Secure Payments",   s: "Bank-level encryption"    },
                        { icon: <RC size={16}/>,                                    bg: "bg-[#fef3c7]", t: "Best Value",        s: "More coins = better rate" },
                        { icon: <RefreshCw className="h-4 w-4 text-[#7c3aed]"/>,  bg: "bg-[#ede9fe]", t: "Use Anywhere",      s: "Promote, gift, boost"     },
                      ].map(f => (
                        <div key={f.t} className="flex items-center gap-2.5 px-4 py-3.5">
                          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", f.bg)}>{f.icon}</div>
                          <div>
                            <p className="text-[11px] font-bold text-[#111827]">{f.t}</p>
                            <p className="text-[9.5px] text-[#9ca3af]">{f.s}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transaction History */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[14px] font-black text-[#111827]">Transaction History</h2>
                        <div className="relative">
                          <button
                            onMouseEnter={() => setShowHelpTip(true)}
                            onMouseLeave={() => setShowHelpTip(false)}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f3f4f6] text-[#9ca3af] hover:bg-[#e5e7eb]"
                          >
                            <HelpCircle className="h-3.5 w-3.5"/>
                          </button>
                          {showHelpTip && (
                            <div className="absolute left-6 top-0 z-50 w-[250px] rounded-[12px] border border-[#f0f0f0] bg-white p-4 shadow-xl">
                              <p className="mb-2.5 text-[12px] font-black text-[#111827]">Transaction Types</p>
                              <div className="space-y-2">
                                {Object.entries(TX_META).slice(0, 9).map(([, m]) => (
                                  <div key={m.label} className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: m.bg, color: m.color }}>{m.icon}</span>
                                    <span className="text-[11px] text-[#374151]">{m.label}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2.5 text-[10px] text-[#9ca3af]">gift_received rows show gross, commission, and net coins.</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <select
                        value={txFilter}
                        onChange={e => setTxFilter(e.target.value)}
                        className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-semibold text-[#374151] outline-none focus:border-[#fd4605]"
                      >
                        <option value="all">All Transactions</option>
                        {Object.entries(TX_META).map(([k, m]) => (
                          <option key={k} value={k}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[1.4fr_2fr_1.2fr_1fr_1fr_1fr_0.8fr] border-b border-[#f3f4f6] px-5 py-2.5">
                      {["Date","Description","Type","Gross RC","Commission","Net / USD","Status"].map(h => (
                        <p key={h} className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{h}</p>
                      ))}
                    </div>

                    {txQ.isLoading ? (
                      <div className="divide-y divide-[#f8f9fb]">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-4 px-5 py-4">
                            <div className="h-3.5 w-24 animate-pulse rounded bg-[#f3f4f6]"/>
                            <div className="h-3.5 flex-1 animate-pulse rounded bg-[#f3f4f6]"/>
                          </div>
                        ))}
                      </div>
                    ) : txRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <RefreshCw className="h-10 w-10 text-[#d1d5db]"/>
                        <p className="mt-3 text-[13px] font-bold text-[#374151]">No transactions yet</p>
                        <p className="mt-1 text-[11.5px] text-[#9ca3af]">Buy coins or receive a gift to get started</p>
                      </div>
                    ) : (
                      txRows.map((t) => {
                        const m  = txMeta(t.type);
                        const pos = t.net_coins > 0 || t.amount_usd > 0;
                        return (
                          <div key={t.id} className="grid grid-cols-[1.4fr_2fr_1.2fr_1fr_1fr_1fr_0.8fr] items-center border-b border-[#f8f9fb] px-5 py-3.5 last:border-0 transition hover:bg-[#fafafa]">
                            <div>
                              <p className="text-[11.5px] font-semibold text-[#111827]">
                                {new Date(t.created_at).toLocaleDateString("en-US",{ month:"short", day:"numeric", year:"numeric" })}
                              </p>
                              <p className="text-[10px] text-[#9ca3af]">
                                {new Date(t.created_at).toLocaleTimeString("en-US",{ hour:"2-digit", minute:"2-digit" })}
                              </p>
                            </div>
                            <p className="truncate text-[11.5px] text-[#374151]">{t.description}</p>
                            <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                              style={{ color: m.color, backgroundColor: m.bg }}>
                              {m.icon}{m.label}
                            </span>
                            <p className={cn("text-[11.5px] font-semibold", t.gross_coins < 0 ? "text-[#dc2626]" : "text-[#374151]")}>
                              {t.gross_coins !== 0 ? (t.gross_coins > 0 ? `+${fmtRC(t.gross_coins)}` : `${fmtRC(t.gross_coins)}`) : "-"}
                            </p>
                            <p className="text-[11.5px] text-[#9ca3af]">
                              {t.commission_coins > 0 ? `-${fmtRC(t.commission_coins)}` : "-"}
                            </p>
                            <p className={cn("text-[11.5px] font-bold", pos ? "text-[#16a34a]" : "text-[#dc2626]")}>
                              {t.net_coins !== 0
                                ? `${t.net_coins > 0 ? "+" : ""}${fmtRC(Math.abs(t.net_coins))} RC`
                                : t.amount_usd !== 0
                                ? `${t.amount_usd > 0 ? "+" : ""}${fmtUSD(Math.abs(t.amount_usd))}`
                                : "-"}
                            </p>
                            <span className={cn("text-[10px] font-bold", t.status === "completed" ? "text-[#16a34a]" : "text-[#d97706]")}>
                              {t.status ?? "completed"}
                            </span>
                          </div>
                        );
                      })
                    )}

                    {/* "Load More" implied there was more to load even when the list was
                        empty. It opens the full ledger instead, and says so. */}
                    <div className="border-t border-[#f3f4f6] px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setShowTxModal(true)}
                        className="flex items-center gap-1 rounded text-[12px] font-bold text-[#fd4605] transition hover:text-[#e03e04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fd4605]"
                      >
                        View All Transactions <ChevronRight className="h-3.5 w-3.5"/>
                      </button>
                    </div>
                  </div>
                </div>

                {/* RIGHT panel */}
                <div className="space-y-3">

                  {/* Order Summary */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                    <div className="border-b border-[#f3f4f6] px-4 py-3.5">
                      <h3 className="text-[13px] font-black text-[#111827]">Order Summary</h3>
                    </div>
                    <div className="px-4 py-4 space-y-2">
                      {selectedPkg ? (
                        <>
                          <div className="flex items-center gap-3 rounded-[12px] bg-[#f8f9fb] p-3">
                            <CoinPlanIcon icon={selectedPkg.icon} iconUrl={selectedPkg.icon_url} sort={selectedPkg.sort_order} size={44}/>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[12.5px] font-black text-[#111827]">{selectedPkg.plan_name}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-[#fd4605]">{fmtRC(selectedPkg.coins)} RC</span>
                                {selectedPkg.badge && <span className="rounded-full bg-[#fd4605] px-1.5 py-0.5 text-[8px] font-black text-white">{selectedPkg.badge}</span>}
                              </div>
                            </div>
                            <button onClick={() => setSelectedPkg(null)} className="text-[#9ca3af] hover:text-[#374151]"><X className="h-4 w-4"/></button>
                          </div>
                          <div className="flex items-center justify-between rounded-[10px] bg-[#f8f9fb] px-3 py-2">
                            <span className="text-[11.5px] text-[#374151]">Subtotal</span>
                            <span className="text-[13px] font-black text-[#111827]">{fmtUSD(selectedPkg.price_usd)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-[10px] bg-[#f8f9fb] px-3 py-2">
                            <span className="text-[11.5px] text-[#374151]">Coins</span>
                            <div className="flex items-center gap-1"><span className="text-[12px] font-bold text-[#f59e0b]">{fmtRC(selectedPkg.coins)}</span><RC size={13}/></div>
                          </div>
                          <div className="flex items-center justify-between rounded-[10px] bg-[#f8f9fb] px-3 py-2">
                            <span className="text-[11.5px] text-[#374151]">Method</span>
                            <span className="text-[12px] font-semibold text-[#374151]">{payMethod ? PAYMENT_METHODS.find(p => p.id === payMethod)?.label : <span className="text-[#9ca3af]">Not selected</span>}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <RC size={38}/>
                          <p className="mt-2 text-[12px] font-bold text-[#374151]">No plan selected</p>
                          <p className="mt-1 text-[10.5px] text-[#9ca3af]">Choose a coin plan above or from the modal</p>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-[#f3f4f6] px-4 pb-4 pt-3">
                      {!canBuy ? (
                        <div className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#f3f4f6] py-3 text-[13px] font-black text-[#9ca3af]">
                          Select plan &amp; payment
                        </div>
                      ) : payMethod === "paypal" ? (
                        <PayPalCheckout
                          selectedPkg={selectedPkg!}
                          canBuy={canBuy}
                          clientId={paypalClientId}
                          pendingOrderRef={pendingOrderRef}
                          onSuccess={async (coinsAdded) => {
                            toast.success(`${fmtRC(coinsAdded)} RC added to your wallet!`);
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-dashboard"] });
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-tx"] });
                            setSelectedPkg(null);
                            setPayMethod(null);
                          }}
                        />
                      ) : (payMethod === "card" || payMethod === "applepay" || payMethod === "googlepay") ? (
                        <StripeCheckout
                          selectedPkg={selectedPkg!}
                          onSuccess={async (coinsAdded) => {
                            toast.success(`${fmtRC(coinsAdded)} RC added to your wallet!`);
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-dashboard"] });
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-tx"] });
                            setSelectedPkg(null);
                            setPayMethod(null);
                          }}
                          onCancel={() => setPayMethod(null)}
                        />
                      ) : payMethod === "upi" ? (
                        <RazorpayCheckout
                          selectedPkg={selectedPkg!}
                          onSuccess={async (coinsAdded) => {
                            toast.success(`${fmtRC(coinsAdded)} RC added to your wallet!`);
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-dashboard"] });
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-tx"] });
                            setSelectedPkg(null);
                            setPayMethod(null);
                          }}
                          onCancel={() => setPayMethod(null)}
                        />
                      ) : payMethod === "bank" ? (
                        <BankTransferCheckout
                          selectedPkg={selectedPkg!}
                          payConfig={payConfigQ.data}
                          onSuccess={async (coinsAdded) => {
                            toast.success(`${fmtRC(coinsAdded)} RC added to your wallet!`);
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-dashboard"] });
                            await queryClient.invalidateQueries({ queryKey: ["wallets-coins-tx"] });
                            setSelectedPkg(null);
                            setPayMethod(null);
                          }}
                          onCancel={() => setPayMethod(null)}
                        />
                      ) : null}
                      <p className="mt-2 flex items-center justify-center gap-1 text-[10.5px] text-[#9ca3af]">
                        <ShieldCheck className="h-3 w-3"/> 100% secure · Coins credited after payment
                      </p>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white shadow-sm">
                    <div className="border-b border-[#f3f4f6] px-4 py-3.5">
                      <h3 className="text-[13px] font-black text-[#111827]">Payment Method</h3>
                    </div>
                    <div className="divide-y divide-[#f8f9fb] px-4 py-1">
                      {PAYMENT_METHODS.map(m => (
                        <label key={m.id} className="flex cursor-pointer items-center justify-between py-3" onClick={() => setPayMethod(m.id)}>
                          <div className="flex items-center gap-2.5">
                            <div className={cn("flex h-4 w-4 items-center justify-center rounded-full border-2 transition", payMethod === m.id ? "border-[#fd4605]" : "border-[#d1d5db]")}>
                              {payMethod === m.id && <div className="h-2 w-2 rounded-full bg-[#fd4605]"/>}
                            </div>
                            <div>
                              <p className="text-[12px] font-bold text-[#374151]">{m.label}</p>
                              <p className="text-[10px] text-[#9ca3af]">{m.desc}</p>
                            </div>
                          </div>
                          {m.logo}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Commission info */}
                  <div className="rounded-[16px] border border-[#f0f1f5] bg-white p-4 shadow-sm">
                    <div className="mb-2.5 flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff0f3]">
                        <Info className="h-4 w-4 text-[#fd4605]"/>
                      </div>
                      <h3 className="text-[12.5px] font-black text-[#111827]">Gift Commission Rule</h3>
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-2 rounded-[8px] bg-[#fff0f3] px-3 py-2">
                        <span className="font-black text-[#fd4605]">30%</span>
                        <span className="text-[#374151]">Teezer commission on all received gifts</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-[8px] bg-[#dcfce7] px-3 py-2">
                        <span className="font-black text-[#16a34a]">70%</span>
                        <span className="text-[#374151]">Goes to your wallet as earned coins</span>
                      </div>
                      <p className="px-1 text-[10px] text-[#9ca3af]">
                        Example: 1,000 RC received → 300 RC commission → 700 RC earned → $7.00
                      </p>
                      <p className="px-1 text-[10px] text-[#9ca3af]">
                        Purchased coins cannot be withdrawn - only earned coins are withdrawable.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* See More Coins Modal */}
      {showModal && (
        <SeeMoreModal
          allPkgs={allPkgs}
          currentId={selectedPkg?.id ?? null}
          onSelect={p => { setSelectedPkg(p); setShowModal(false); scrollToBuy(); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {showTxModal && (
        <TransactionsModal
          initialType={txFilter}
          onClose={() => setShowTxModal(false)}
        />
      )}
    </>
    </PayPalScriptProvider>
  );
}
