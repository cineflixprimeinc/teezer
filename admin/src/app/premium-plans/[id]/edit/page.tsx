"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Apple, Archive, BarChart3, Building2, Check, ChevronRight, Copy,
  DollarSign, ExternalLink, Eye, Globe, Home, Info, Layers, Lock, Medal, Monitor,
  Rocket, Settings2, Smartphone, Sparkles, Store, Tag, Ticket, Trash2, TrendingUp,
  Undo2, Users, X, Zap, Plus, RotateCcw, Pencil, ChevronUp, ChevronDown, Search,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { api, apiMessage } from "@/services/api";

/**
 * Edit one subscription plan.
 *
 * A full page rather than an inline row: the plan has eleven distinct groups of
 * settings and a summary worth keeping visible while editing, neither of which
 * fits in a table row.
 *
 * TABS ARE ONLY EDITABLE FOR THINGS THAT EXIST. Country pricing, currencies,
 * trials and coupons have no backend, so they say so rather than rendering
 * empty forms that silently discard input - a form that looks editable and
 * saves nothing is worse than no form. The same rule is why the icon, category,
 * tags and internal note below ARE editable: they got real columns first.
 */

type Plan = {
  id: number; key: string; name: string; tagline: string | null;
  base_price_usd: number | null; app_price_usd: number | null; separate_app_price: boolean;
  compare_at_price_usd: number | null; compare_at_app_price_usd: number | null;
  discount_label: string | null;
  price: number; currency: string; period: string; features: string[];
  is_popular: boolean; badge_label: string | null; is_default: boolean; theme: string;
  ios_product_id: string | null; android_product_id: string | null;
  sort: number; is_enabled: boolean; sellable: boolean;
  icon_path: string | null; icon_url: string | null;
  category: string | null; tags: string[]; internal_note: string | null;
  status: string; platforms: string[]; visibility: Record<string, boolean>;
  purchase_eligibility: string; requirements: Record<string, any>;
  available_from: string | null; available_until: string | null;
  countries_mode: string; countries: string[];
  upgrade_rules: Record<string, any>; downgrade_rules: Record<string, any>;
  existing_subscriber_behavior: string;
  plan_features: PlanFeature[];
  feature_groups: Record<string, string>;
  feature_group_counts: Record<string, number>;
  trial_days: number | null;
  global_trial_days: number;
  /** 'global' | 'country' — whether per-country overrides are consulted. */
  pricing_mode: string;
  coupons: PlanCoupon[];
};

/** One row of the country matrix, already resolved by the backend. */
type CountryPrice = {
  country_code: string; country_name: string; currency_code: string;
  country_enabled: boolean;
  /** Per-platform: a fixed price if one is set, and the converted global. */
  web_custom: number | null; web_global: number | null;
  app_custom: number | null; app_global: number | null;
  /** What each platform would actually charge, override or not. */
  web_effective: number | null; app_effective: number | null;
  /** Null when either side is unknown — never guessed. */
  platforms_match: boolean | null;
  custom_price: number | null; global_price: number | null;
  difference_pct: number | null;
  has_override: boolean; has_web_override: boolean; has_app_override: boolean;
  currency_supported: boolean; status: string;
  updated_at: string | null; note: string | null;
};

/**
 * One editable price cell.
 *
 * Uncontrolled with a `key` tied to the incoming value, so a refetch after a
 * save re-seeds it while typing is never interrupted mid-edit. Commits on blur
 * or Enter; an emptied cell commits null, which the caller reads as "remove
 * this override".
 */
type AdminCountry = { code: string; name: string; currency: string; enabled: boolean };

/**
 * Searchable multi-select for countries.
 *
 * Replaces a bare two-letter text box, which required knowing ISO codes by
 * heart and silently accepted "XX". The list comes from country_currency_map -
 * the same table the resolver reads - so a country can never be picked here
 * that pricing and availability do not know about.
 *
 * Disabled markets are shown and flagged rather than hidden: restricting a plan
 * to a market that is currently switched off is something an admin needs to
 * SEE, not discover by the country being absent from the list.
 */
function CountryPicker({ mode, selected, all, loading, onChange }: {
  mode: "include" | "exclude";
  selected: string[];
  all: AdminCountry[];
  loading: boolean;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const chosen = new Set(selected.map((c) => c.toUpperCase()));
  const needle = q.trim().toLowerCase();
  const matches = all.filter((c) =>
    !needle || c.name.toLowerCase().includes(needle) ||
    c.code.toLowerCase().includes(needle) || c.currency.toLowerCase().includes(needle),
  );

  const toggle = (code: string) =>
    onChange(chosen.has(code) ? selected.filter((x) => x.toUpperCase() !== code) : [...selected, code]);

  return (
    <div className="mt-4 rounded-[11px] border border-[#eceaf0] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-[#6b7280]">
          {mode === "include" ? "Available in" : "Excluded from"} ({selected.length})
        </p>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])}
                  className="text-[11px] font-bold text-[#9ca3af] transition hover:text-[#dc2626]">
            Clear all
          </button>
        )}
      </div>

      {/* Chips first: what is already chosen matters more than the picker. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((code) => {
          const c = all.find((x) => x.code === code.toUpperCase());
          return (
            <span key={code}
                  className={`flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11.5px] font-semibold ${
                    mode === "include"
                      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                      : "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]"
                  }`}>
              {c?.name ?? code.toUpperCase()}
              {c && !c.enabled && (
                <span className="rounded-[4px] bg-[#fef3c7] px-1 text-[9px] font-bold text-[#92400e]">off</span>
              )}
              <button type="button" onClick={() => toggle(code.toUpperCase())}
                      className="opacity-60 transition hover:opacity-100" aria-label={`Remove ${code}`}>
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          );
        })}

        <button type="button" onClick={() => setOpen((v) => !v)}
                className="rounded-[7px] border border-dashed border-[#d8d5dd] px-2.5 py-1 text-[11.5px] font-bold text-[#6b7280] transition hover:bg-[#fafafa]">
          + Add country
        </button>
      </div>

      {open && (
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-[#eceaf0]">
          <div className="flex items-center gap-2 border-b border-[#eceaf0] bg-[#fbfafc] px-3 py-2">
            <Search size={13} className="flex-none text-[#9ca3af]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country, code or currency…"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c9c5d0]"
            />
            <button type="button" onClick={() => { setOpen(false); setQ(""); }}
                    className="flex-none text-[#9ca3af] transition hover:text-[#111827]">
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>

          <div className="max-h-[230px] overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-[12px] text-[#9ca3af]">Loading countries…</p>}
            {!loading && matches.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-[#9ca3af]">
                {needle ? `No country matches "${q}".` : "No countries configured."}
              </p>
            )}
            {matches.map((c) => {
              const on = chosen.has(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className={`flex w-full items-center gap-2.5 border-b border-[#f4f2f5] px-3 py-2 text-left transition last:border-0 ${
                    on ? "bg-[#fff5f7]" : "hover:bg-[#fafafa]"
                  }`}
                >
                  <span className={`flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border ${
                    on ? "border-[#fe2c55] bg-[#fe2c55] text-white" : "border-[#d8d5dd] bg-white"
                  }`}>
                    {on && <Check size={10} strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#111827]">{c.name}</span>
                  {!c.enabled && (
                    <span className="rounded-[4px] bg-[#fef3c7] px-1.5 py-[1px] text-[9.5px] font-bold text-[#92400e]">
                      market off
                    </span>
                  )}
                  <span className="flex-none font-mono text-[11px] text-[#9ca3af]">{c.code}</span>
                  <span className="w-[38px] flex-none text-right text-[11px] text-[#c9c5d0]">{c.currency}</span>
                </button>
              );
            })}
          </div>

          {/* Bulk action applies to the CURRENT filter, so "select all shown"
              after a search means the results and not all 66 countries. */}
          {!loading && matches.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-[#eceaf0] bg-[#fbfafc] px-3 py-2">
              <span className="text-[11px] text-[#9ca3af]">{matches.length} shown</span>
              <button
                type="button"
                onClick={() => onChange(Array.from(new Set([
                  ...selected.map((s) => s.toUpperCase()),
                  ...matches.map((c) => c.code),
                ])))}
                className="text-[11px] font-bold text-[#fe2c55] transition hover:underline"
              >
                Select all shown
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One editable price cell.
 *
 * Uncontrolled with a `key` tied to the incoming value, so a refetch after a
 * save re-seeds it while typing is never interrupted mid-edit.
 */
function PriceCell({ value, placeholder, onCommit }: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
  return (
    <input
      key={String(value)}
      inputMode="decimal"
      defaultValue={value ?? ""}
      placeholder={placeholder}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") return value !== null ? onCommit(null) : undefined;
        const n = Number(raw);
        // Unchanged or nonsense: do nothing rather than write a no-op row into
        // the price history.
        if (Number.isNaN(n) || n < 0 || n === value) return;
        onCommit(n);
      }}
      className={`w-[96px] rounded-[8px] border px-2 py-1.5 text-[12px] outline-none transition focus:border-[#fe2c55] ${
        value !== null ? "border-[#fe2c55]/40 bg-[#fff5f7] font-bold text-[#111827]" : "border-[#e5e7eb] text-[#6b7280]"
      }`}
    />
  );
}

type BulkRow = {
  country_code: string; country_name: string; currency_code: string;
  current_price: number | null; new_price: number | null; skipped: boolean;
};

/** One resolved quote, with the rule that produced it. */
type PricePreview = {
  amount: number; currency: string; source: string;
  is_override: boolean; is_converted: boolean; base_usd: number | null;
  country: string; country_name: string; country_enabled: boolean;
};

/** Machine source → what an admin should read. */
const PRICE_SOURCE: Record<string, string> = {
  country_override: "Country price",
  currency_override: "Currency price",
  global_converted: "Global USD, converted",
  usd_fallback: "USD fallback (no rate)",
  none: "No price configured",
};

type PriceHistoryRow = {
  country_code: string | null; currency_code: string | null;
  billing_cycle: string | null; old_price: number | null; new_price: number | null;
  action: string; created_at: string | null;
  changed_by_name: string | null; changed_by_username: string | null;
};

type PlanCoupon = {
  id: number; code: string; name: string; type: string; value: number;
  used_count: number; usage_limit: number | null; status: string;
  applies_to_all: boolean;
};

/**
 * One catalogued feature, with this plan's setting merged in by the API.
 * `is_enabled` false still comes back - that is what populates the library.
 */
type PlanFeature = {
  key: string; name: string; description: string | null; icon: string | null;
  group_key: string | null; group_name: string | null;
  value_type: "boolean" | "select"; options: string[];
  is_enabled: boolean; value: string | null; sort: number; in_plan: boolean;
};

/** Mirrors PlanFeatureService::GROUPS. */
const FEATURE_GROUPS: Record<string, string> = {
  content: "Content & Experience",
  creator: "Creator & Tools",
  storage: "Storage & Quality",
  account: "Account & Identity",
};

/** Group tint for the feature icon tile. Falls back for an unknown group. */
function featureTint(group: string | null): string {
  return {
    content: "bg-[#f3e8ff] text-[#7c3aed]",
    creator: "bg-[#e0f2fe] text-[#0284c7]",
    storage: "bg-[#fff7ed] text-[#ea580c]",
    account: "bg-[#dcfce7] text-[#16a34a]",
  }[group ?? ""] ?? "bg-[#f4f2f5] text-[#6b7280]";
}

/** Surfaces a plan can be sold on. Mirrors PlanAvailabilityService::PLATFORMS. */
const PLATFORMS = [
  { id: "web", name: "Web", icon: Globe },
  { id: "android", name: "Android", icon: Smartphone },
  { id: "ios", name: "iOS", icon: Apple },
  { id: "mobile_web", name: "Mobile Web", icon: Smartphone },
  { id: "pwa", name: "PWA", icon: Zap },
  { id: "desktop_app", name: "Desktop/Web App", icon: Monitor },
] as const;

/** Placements. `hidden` is the odd one out - it removes the plan everywhere. */
const VISIBILITY = [
  { id: "premium_page", name: "Show on Premium / Subscription page" },
  { id: "upgrade_modal_app", name: "Show in upgrade modal (App)" },
  { id: "upgrade_modal_web", name: "Show in upgrade modal (Website)" },
  { id: "profile_upgrade", name: "Show in profile upgrade section" },
  { id: "in_app_prompts", name: "Show in in-app upgrade prompts" },
  { id: "web_prompts", name: "Show in web upgrade prompts" },
  { id: "search_discovery", name: "Include in search & discovery" },
  { id: "hidden", name: "Hide this plan from users" },
] as const;

const STATUSES = [
  { id: "active", name: "Active", help: "Plan is live and available for purchase.", tint: "text-[#16a34a]" },
  { id: "temporarily_unavailable", name: "Temporarily Unavailable", help: "Hide from new purchases but keep existing subscriptions active.", tint: "text-[#d97706]" },
  { id: "disabled", name: "Disabled", help: "Plan is hidden and cannot be purchased.", tint: "text-[#dc2626]" },
  { id: "archived", name: "Archived", help: "Plan is archived and only visible to admins.", tint: "text-[#6b7280]" },
] as const;

const ELIGIBILITY = [
  { id: "everyone", name: "Everyone", help: "All users can purchase this plan." },
  { id: "new_users", name: "New users only", help: "Only newly registered users." },
  { id: "existing_users", name: "Existing users only", help: "Only existing users can purchase." },
  { id: "free_users", name: "Free users only", help: "Only users without an active subscription." },
  { id: "without_active_subscription", name: "Users without an active subscription", help: "Users whose current subscription has expired or was canceled." },
  { id: "user_groups", name: "Specific user groups", help: "Allow only selected user groups to purchase.", soon: true },
] as const;

const COUNTRY_MODES = [
  { id: "all", name: "Available in all countries", help: "Make this plan available worldwide." },
  { id: "include", name: "Available in selected countries", help: "Allow purchase in specific countries only." },
  { id: "exclude", name: "Exclude specific countries", help: "Block purchase in selected countries." },
] as const;

const SUBSCRIBER_BEHAVIOUR = [
  { id: "keep_and_renew", name: "Keep access and allow renewal", help: "Existing subscribers can continue and renew." },
  { id: "keep_no_renew", name: "Keep access but don't allow renewal", help: "Existing subscribers remain with access, no renewals." },
  { id: "cancel_renewals", name: "Cancel future renewals", help: "Existing subscriptions remain until expiry, then cancel." },
  { id: "revoke_immediately", name: "Immediately revoke access", help: "Existing subscribers will lose access immediately.", danger: true },
] as const;

const REQUIREMENTS = [
  { id: "verified_email", name: "Require verified email" },
  { id: "verified_phone", name: "Require verified phone number" },
  { id: "creator_account", name: "Require creator account" },
  { id: "business_account", name: "Require business account" },
] as const;

/**
 * ISO datetime -> value for <input type="datetime-local">.
 * Sliced rather than parsed: the input wants exactly "YYYY-MM-DDTHH:mm" in
 * LOCAL time, and running it through Date() would shift a UTC string by the
 * browser's offset and quietly move an admin's schedule by hours.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Stats = {
  per_plan: Record<string, { subscribers: number; revenue: number }>;
  supported_countries: number; supported_currencies: number;
};

const PLAN_ICON: Record<string, React.ElementType> = { starter: Rocket, pro: Zap, studio: Layers };
const PLAN_TINT: Record<string, string> = {
  starter: "bg-[#ffe9ef] text-[#fe2c55]",
  pro: "bg-[#f3e8ff] text-[#7c3aed]",
  studio: "bg-[#17151b] text-white",
};

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";
const hint = "mt-1.5 block text-[11px] font-normal leading-snug text-[#9ca3af]";
const req = <span className="text-[#fe2c55]"> *</span>;

/** Tabs backed by real settings, and those that are not built yet. */
const TABS = [
  { id: "general", name: "General", icon: Home, live: true },
  { id: "pricing", name: "Pricing", icon: Tag, live: true },
  { id: "features", name: "Features", icon: Sparkles, live: true },
  { id: "availability", name: "Availability", icon: BarChart3, live: true },
  { id: "stores", name: "Store IDs", icon: Store, live: true },
  { id: "countries", name: "Countries & Regions", icon: Globe, live: false },
  { id: "currencies", name: "Currencies", icon: DollarSign, live: false },
  { id: "trials", name: "Trials", icon: Ticket, live: false },
  { id: "coupons", name: "Coupons", icon: Ticket, live: false },
  { id: "analytics", name: "Analytics", icon: TrendingUp, live: false },
  { id: "advanced", name: "Advanced", icon: Settings2, live: false },
] as const;

const CATEGORIES = [
  { value: "", name: "Uncategorised" },
  { value: "creator", name: "Creator" },
  { value: "business", name: "Business" },
  { value: "enterprise", name: "Enterprise" },
  { value: "personal", name: "Personal" },
];

/** The four card themes, each drawn as a miniature of what it produces. */
const THEMES = [
  { id: "light", name: "Light", card: "bg-white border-[#e5e7eb]", bar: "bg-[#fe2c55]", line: "bg-[#e9e7ec]" },
  { id: "dark", name: "Dark", card: "bg-[#17151b] border-[#17151b]", bar: "bg-white", line: "bg-white/25" },
  { id: "gradient", name: "Gradient", card: "bg-gradient-to-br from-[#a78bfa] to-[#818cf8] border-transparent", bar: "bg-white", line: "bg-white/40" },
  { id: "brand", name: "Brand", card: "bg-gradient-to-br from-[#fe2c55] to-[#e0243d] border-transparent", bar: "bg-white", line: "bg-white/40" },
];

/** iOS-style switch. Native checkbox underneath, so it stays keyboard-operable. */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] flex-none rounded-full transition ${on ? "bg-[#fe2c55]" : "bg-[#d8d5dd]"}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[19px]" : "left-[3px]"}`}
      />
    </button>
  );
}

const cardTitle = "text-[14.5px] font-black text-[#111827]";
const cardSub = "mt-1 text-[11.5px] leading-snug text-[#8A8592]";

/** The small square tick on a platform tile. */
function Check2({ on }: { on: boolean }) {
  return (
    <span className={`mt-[1px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border ${
      on ? "border-[#fe2c55] bg-[#fe2c55] text-white" : "border-[#d8d5dd] bg-white"
    }`}>
      {on && <Check size={10} strokeWidth={3.5} />}
    </span>
  );
}

/**
 * Radio row. `name` groups them so only one in a group can be chosen, which is
 * what makes these mutually exclusive rather than four independent checkboxes.
 */
function Radio({
  name, on, onSelect, title, help, badge, badgeTone = "muted", boxed = false,
}: {
  name: string; on: boolean; onSelect: () => void;
  title: React.ReactNode; help?: string; badge?: string;
  badgeTone?: "muted" | "danger"; boxed?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${
      boxed ? `rounded-[10px] border px-3 py-2.5 ${on ? "border-[#fe2c55] bg-[#fff5f7]" : "border-[#eceaf0]"}` : ""
    }`}>
      <input
        type="radio"
        name={name}
        checked={on}
        onChange={onSelect}
        className="mt-[2px] h-[14px] w-[14px] flex-none accent-[#fe2c55]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#111827]">
          {title}
          {badge && (
            <span className={`rounded-[6px] px-1.5 py-[2px] text-[9.5px] font-bold ${
              badgeTone === "danger" ? "bg-[#fee2e2] text-[#dc2626]" : "bg-[#f3e8ff] text-[#7c3aed]"
            }`}>
              {badge}
            </span>
          )}
        </span>
        {help && <span className="mt-0.5 block text-[11px] leading-snug text-[#8A8592]">{help}</span>}
      </span>
    </label>
  );
}

/**
 * A checkbox that gates a number. The number is disabled until the box is
 * ticked, and unticking clears it - a stale "18 days" left behind by an admin
 * who turned the rule off would be enforced the next time anyone turned it back
 * on, which is not what unticking meant.
 */
function NumberRequirement({
  label: text, unit, value, onChange,
}: { label: string; unit: string; value: any; onChange: (v: number | null) => void }) {
  const on = value !== null && value !== undefined && value !== "";
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="checkbox"
        className="h-[15px] w-[15px] flex-none accent-[#fe2c55]"
        checked={on}
        onChange={(e) => onChange(e.target.checked ? (unit === "days" ? 18 : 13) : null)}
      />
      <span className="flex-1 text-[12px] text-[#374151]">{text}</span>
      <input
        inputMode="numeric"
        disabled={!on}
        value={on ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
        className={`w-[74px] rounded-[8px] border border-[#e5e7eb] px-2 py-1.5 text-[12px] text-[#111827] outline-none transition focus:border-[#fe2c55] ${
          on ? "bg-white" : "bg-[#f6f4f7] text-[#c9c5d0]"
        }`}
      />
      <span className="w-[38px] text-[11px] text-[#9ca3af]">{unit}</span>
    </div>
  );
}

/** Upgrade or downgrade rules - the same shape twice, so one component. */
function SwitchRules({
  title, allowLabel, immediateLabel, immediateHelp, deferredLabel, deferredHelp,
  fromLabel, rules, onChange, plans, defaultDeferred = false,
}: {
  title: string; allowLabel: string; immediateLabel: string; immediateHelp: string;
  deferredLabel: string; deferredHelp: string; fromLabel: string;
  rules: Record<string, any>; onChange: (v: Record<string, any>) => void;
  plans: { id: number; key: string; name: string }[]; defaultDeferred?: boolean;
}) {
  const allowed = rules.allowed !== false;
  const timing = rules.timing ?? (defaultDeferred ? "next_cycle" : "immediate");
  const from: string[] = rules.from ?? [];
  const group = title.replace(/\s+/g, "_");

  return (
    <div className="rounded-[11px] border border-[#eceaf0] p-3.5">
      <p className="text-[12px] font-black text-[#111827]">{title}</p>

      <label className="mt-2.5 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="h-[15px] w-[15px] flex-none accent-[#fe2c55]"
          checked={allowed}
          onChange={(e) => onChange({ ...rules, allowed: e.target.checked })}
        />
        <span className="text-[11.5px] text-[#374151]">{allowLabel}</span>
      </label>

      {/* Timing and the source list only matter if the move is allowed at all,
          so they dim rather than sit there implying they still apply. */}
      <div className={`mt-2.5 space-y-2 ${allowed ? "" : "pointer-events-none opacity-45"}`}>
        <Radio name={`${group}_timing`} on={timing === "immediate"}
               onSelect={() => onChange({ ...rules, timing: "immediate" })}
               title={immediateLabel} help={immediateHelp} />
        <Radio name={`${group}_timing`} on={timing === "next_cycle"}
               onSelect={() => onChange({ ...rules, timing: "next_cycle" })}
               title={deferredLabel} help={deferredHelp} />

        <div className="pt-1">
          <p className="mb-1.5 text-[11px] font-bold text-[#6b7280]">{fromLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {plans.length === 0 && (
              <span className="text-[11px] text-[#9ca3af]">No other plans exist yet.</span>
            )}
            {plans.map((p) => {
              const on = from.includes(p.key);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange({
                    ...rules,
                    from: on ? from.filter((x) => x !== p.key) : [...from, p.key],
                  })}
                  className={`rounded-[7px] border px-2 py-1 text-[11px] font-semibold transition ${
                    on ? "border-[#fe2c55] bg-[#ffe9ef] text-[#fe2c55]" : "border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#fafafa]"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Character counter. Turns red past the limit rather than silently truncating. */
function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return (
    <span className={`text-[11px] tabular-nums ${n > max ? "font-bold text-[#dc2626]" : "text-[#c9c5d0]"}`}>
      {n} / {max}
    </span>
  );
}

export default function EditPlanPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params?.id);
  const [tab, setTab] = useState<string>("general");
  const [err, setErr] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [featureCat, setFeatureCat] = useState("");
  const [featureQuery, setFeatureQuery] = useState("");
  const [cycle, setCycle] = useState("month");
  const [cQuery, setCQuery] = useState("");
  const [cFilter, setCFilter] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSel, setBulkSel] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState("percent");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkRow[]>([]);
  const [previewCountry, setPreviewCountry] = useState("");
  const [previewCycle, setPreviewCycle] = useState("month");
  const [previewSurface, setPreviewSurface] = useState("web");
  const [previewResult, setPreviewResult] = useState<PricePreview | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["premium-plans"],
    queryFn: () => api.get("/admin/premium-plans").then((r) => r.data.data as Plan[]),
  });
  const { data: stats } = useQuery({
    queryKey: ["premium-plan-stats"],
    queryFn: () => api.get("/admin/premium-plans/stats").then((r) => r.data.data as Stats),
  });

  const plan = useMemo(() => (plans ?? []).find((p) => p.id === id), [plans, id]);

  /* ── Pricing ──
     Its own endpoint, not part of the plan payload: the matrix is ~66 rows
     resolved against live rates, and recomputing it on every plan fetch would
     make opening any other tab pay for a page it is not showing. */
  const matrixQ = useQuery({
    queryKey: ["plan-pricing", id, cycle],
    queryFn: () => api.get(`/admin/premium-plans/${id}/pricing`, { params: { cycle } })
      .then((r) => r.data.data as {
        pricing_mode: string;
        countries: CountryPrice[];
        has_separate_app_price: boolean;
        base_price_usd: number | null;
        app_price_usd: number | null;
      }),
    enabled: !!id && tab === "pricing",
  });

  /* Country reference data for the pickers. Shared across tabs and cached by
     key, so switching between Availability and Pricing does not refetch it. */
  const countriesQ = useQuery({
    queryKey: ["admin-countries"],
    queryFn: () => api.get("/admin/countries").then((r) => r.data.data as AdminCountry[]),
    staleTime: 10 * 60_000,
  });

  const historyQ = useQuery({
    queryKey: ["plan-pricing-history", id],
    queryFn: () => api.get(`/admin/premium-plans/${id}/pricing/history`)
      .then((r) => r.data.data as PriceHistoryRow[]),
    enabled: !!id && tab === "pricing",
  });

  const refreshPricing = () => {
    qc.invalidateQueries({ queryKey: ["plan-pricing", id] });
    qc.invalidateQueries({ queryKey: ["plan-pricing-history", id] });
    // The plan payload carries pricing_mode too, so it must not keep serving a
    // stale copy after a mode switch.
    qc.invalidateQueries({ queryKey: ["premium-plans"] });
  };

  const setMode = useMutation({
    mutationFn: (mode: string) => api.put(`/admin/premium-plans/${id}/pricing/mode`, { pricing_mode: mode }),
    onSuccess: refreshPricing,
    onError: (e) => setErr(apiMessage(e)),
  });

  /* Surface is a PARAMETER now, not a hardcoded "web".
     It used to be fixed, which meant the app price could never be seen or
     edited from this table and there was no way to tell whether the two
     platforms charged the same. */
  const saveCountryPrice = useMutation({
    mutationFn: (v: { country: string; price: number; surface: string }) =>
      api.post(`/admin/premium-plans/${id}/pricing/override`, {
        country_code: v.country, billing_cycle: cycle, price: v.price, surface: v.surface,
      }),
    onSuccess: refreshPricing,
    onError: (e) => setErr(apiMessage(e)),
  });

  const removeCountryPrice = useMutation({
    mutationFn: (v: { country: string; surface: string }) =>
      api.delete(`/admin/premium-plans/${id}/pricing/override`, {
        data: { country_code: v.country, billing_cycle: cycle, surface: v.surface },
      }),
    onSuccess: refreshPricing,
    onError: (e) => setErr(apiMessage(e)),
  });

  const preview = useMutation({
    mutationFn: () => api.get(`/admin/premium-plans/${id}/pricing/preview`, {
      params: { country: previewCountry, cycle: previewCycle, surface: previewSurface },
    }).then((r) => r.data.data as PricePreview),
    onSuccess: (d) => { setPreviewResult(d); setErr(null); },
    // Clears the stale result too: leaving the previous country's answer on
    // screen next to a failed lookup reads as if it succeeded.
    onError: (e) => { setPreviewResult(null); setErr(apiMessage(e)); },
  });

  const flushCache = useMutation({
    mutationFn: () => api.post(`/admin/premium-plans/${id}/pricing/flush`),
    onSuccess: () => { setErr(null); refreshPricing(); },
    onError: (e) => setErr(apiMessage(e)),
  });

  const bulk = useMutation({
    mutationFn: (confirm: boolean) =>
      api.post(`/admin/premium-plans/${id}/pricing/bulk`, {
        countries: bulkSel, billing_cycle: cycle, surface: "web",
        mode: bulkMode, value: parseFloat(bulkValue) || 0, confirm,
      }).then((r) => ({ ...r.data.data, confirmed: confirm })),
    onSuccess: (d: any) => {
      setBulkPreview(d.preview ?? []);
      // Only a confirmed run changes anything, so only that clears the panel.
      if (d.confirmed) {
        setBulkPreview([]); setBulkSel([]); setBulkOpen(false); refreshPricing();
      }
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const [f, setF] = useState<Record<string, any> | null>(null);
  // Seed the form once the plan arrives, then leave it alone so a background
  // refetch cannot wipe what the admin is halfway through typing.
  if (plan && f === null) {
    setF({
      name: plan.name,
      tagline: plan.tagline ?? "",
      base_price_usd: plan.base_price_usd?.toString() ?? "",
      app_price_usd: plan.app_price_usd?.toString() ?? "",
      compare_at_price_usd: plan.compare_at_price_usd?.toString() ?? "",
      compare_at_app_price_usd: plan.compare_at_app_price_usd?.toString() ?? "",
      discount_label: plan.discount_label ?? "",
      separate: plan.separate_app_price,
      price: String(plan.price),
      currency: plan.currency,
      period: plan.period,
      features: plan.features.join("\n"),
      badge_label: plan.badge_label ?? "",
      ios_product_id: plan.ios_product_id ?? "",
      android_product_id: plan.android_product_id ?? "",
      sort: String(plan.sort),
      is_popular: plan.is_popular,
      is_default: plan.is_default,
      is_enabled: plan.is_enabled,
      theme: plan.theme,
      category: plan.category ?? "",
      tags: plan.tags ?? [],
      internal_note: plan.internal_note ?? "",
      // Availability. The API returns `visibility` already resolved (every key
      // present, defaults applied), so nothing here has to guess which flags
      // exist - the editor and the enforcement path read the same shape.
      status: plan.status ?? "active",
      platforms: plan.platforms ?? [...PLATFORMS.map((p) => p.id)],
      visibility: plan.visibility ?? {},
      purchase_eligibility: plan.purchase_eligibility ?? "everyone",
      requirements: plan.requirements ?? {},
      available_from: toLocalInput(plan.available_from),
      available_until: toLocalInput(plan.available_until),
      no_expiry: !plan.available_until,
      countries_mode: plan.countries_mode ?? "all",
      countries: plan.countries ?? [],
      upgrade_rules: plan.upgrade_rules ?? {},
      downgrade_rules: plan.downgrade_rules ?? {},
      existing_subscriber_behavior: plan.existing_subscriber_behavior ?? "keep_and_renew",
      // Copied, not referenced: editing must not mutate the query cache, or a
      // background refetch would appear to "undo" half the admin's edits.
      plan_features: (plan.plan_features ?? []).map((x) => ({ ...x })),
      // Passed through as-is: null means "inherit the global", and coalescing
      // it to a number here would silently pin the plan to today's value.
      trial_days: plan.trial_days,
    });
  }

  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/premium-plans/${id}`, {
        name: f!.name.trim(),
        tagline: f!.tagline.trim() || null,
        base_price_usd: f!.base_price_usd.trim() === "" ? null : parseFloat(f!.base_price_usd),
        app_price_usd: !f!.separate || f!.app_price_usd.trim() === "" ? null : parseFloat(f!.app_price_usd),
        // Empty clears the discount. Null, not 0 - a zero was-price would be a
        // real price of zero rather than "no discount".
        compare_at_price_usd: f!.compare_at_price_usd.trim() === "" ? null : parseFloat(f!.compare_at_price_usd),
        compare_at_app_price_usd: !f!.separate || f!.compare_at_app_price_usd.trim() === "" ? null : parseFloat(f!.compare_at_app_price_usd),
        discount_label: f!.discount_label.trim() || null,
        price: parseFloat(f!.price) || 0,
        currency: f!.currency.trim().toUpperCase(),
        period: f!.period,
        features: f!.features.split("\n").map((x: string) => x.trim()).filter(Boolean),
        badge_label: f!.badge_label.trim() || null,
        ios_product_id: f!.ios_product_id.trim() || null,
        android_product_id: f!.android_product_id.trim() || null,
        sort: parseInt(f!.sort, 10) || 0,
        is_popular: f!.is_popular,
        is_default: f!.is_default,
        is_enabled: f!.is_enabled,
        theme: f!.theme,
        category: f!.category || null,
        tags: f!.tags,
        internal_note: f!.internal_note.trim() || null,

        // Availability. `is_enabled` is intentionally NOT sent alongside
        // status - the API derives it, so the two cannot be saved disagreeing.
        status: f!.status,
        platforms: f!.platforms,
        visibility: f!.visibility,
        purchase_eligibility: f!.purchase_eligibility,
        // Strip the nulls a cleared NumberRequirement leaves behind, so an
        // unticked rule is absent rather than stored as an explicit null the
        // resolver would still have to interpret.
        requirements: Object.fromEntries(
          Object.entries(f!.requirements).filter(([, v]) => v !== null && v !== "" && v !== false),
        ),
        available_from: f!.available_from || null,
        // "No expiry" means no end date at all, not an end date that is ignored.
        available_until: f!.no_expiry ? null : (f!.available_until || null),
        countries_mode: f!.countries_mode,
        countries: f!.countries,
        upgrade_rules: f!.upgrade_rules,
        downgrade_rules: f!.downgrade_rules,
        existing_subscriber_behavior: f!.existing_subscriber_behavior,

        // Sent whole, including the OFF rows: the API deletes anything it is
        // not sent, so omitting them would wipe every feature the admin turned
        // off rather than recording that they are off.
        plan_features: (f!.plan_features as PlanFeature[]).map((x, i) => ({
          key: x.key,
          is_enabled: x.is_enabled,
          // A boolean feature has no value to store; sending one would put
          // "100 GB" on a feature that cannot express it.
          value: x.value_type === "select" ? x.value : null,
          sort: i * 10,
        })),

        // null is sent deliberately - it is how "inherit the global" is
        // expressed, and omitting the key would leave the old value in place.
        trial_days: f!.trial_days,

      }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["premium-plans"] });
      qc.invalidateQueries({ queryKey: ["premium-plan-stats"] });
      router.push("/premium-plans");
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/premium-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["premium-plans"] });
      router.push("/premium-plans");
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  if (isLoading || !plan || !f) {
    return (
      <AdminShell title="Edit Subscription Plan">
        <Card className="p-10 text-center text-[13px] text-[#8A8592]">
          {isLoading ? "Loading plan…" : "Plan not found."}
        </Card>
      </AdminShell>
    );
  }

  const Glyph = PLAN_ICON[plan.key] ?? Layers;
  const per = stats?.per_plan?.[plan.key];
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const featureCount = f.features.split("\n").filter((x: string) => x.trim()).length;

  const addTag = () => {
    const t = newTag.trim();
    if (!t || f.tags.includes(t) || f.tags.length >= 12) return;
    set("tags", [...f.tags, t]);
    setNewTag("");
  };

  /* ── features ──────────────────────────────────────────────────────────
     `included` and `library` are two views of ONE list, not two lists. A
     feature moves between them by flipping is_enabled, so nothing is ever
     added or removed and its configured value survives a round trip through
     the library instead of being reset. */
  const allFeatures: PlanFeature[] = f.plan_features ?? [];
  const included = allFeatures.filter((x) => x.is_enabled);
  const library = allFeatures.filter((x) => {
    if (x.is_enabled) return false;
    if (featureCat && x.group_key !== featureCat) return false;
    const q = featureQuery.trim().toLowerCase();
    return !q || x.name.toLowerCase().includes(q) || (x.description ?? "").toLowerCase().includes(q);
  });

  const setFeature = (idx: number, patch: Partial<PlanFeature>) => {
    if (idx < 0) return;
    const next = allFeatures.map((x, i) => (i === idx ? { ...x, ...patch } : x));
    set("plan_features", next);
  };

  /** Reorder within the INCLUDED rows, then renumber sort across the list. */
  const moveFeature = (visibleIdx: number, dir: -1 | 1) => {
    const target = included[visibleIdx + dir];
    const current = included[visibleIdx];
    if (!target || !current) return;
    const next = allFeatures.map((x) =>
      x.key === current.key ? { ...x, sort: target.sort }
        : x.key === target.key ? { ...x, sort: current.sort } : x,
    );
    // Re-sorted here rather than relying on the server, so the row visibly
    // moves the moment it is clicked.
    next.sort((a, b) => a.sort - b.sort);
    set("plan_features", next);
  };

  /* Mode comes from the pricing endpoint when it has loaded, and from the plan
     payload before that - so the radio is never briefly wrong on first paint. */
  const pricingMode = matrixQ.data?.pricing_mode ?? plan.pricing_mode ?? "global";

  const visibleCountries = (matrixQ.data?.countries ?? []).filter((c) => {
    const q = cQuery.trim().toLowerCase();
    if (q && !(
      c.country_name.toLowerCase().includes(q) ||
      c.country_code.toLowerCase().includes(q) ||
      c.currency_code.toLowerCase().includes(q)
    )) return false;

    switch (cFilter) {
      case "custom": return c.has_override;
      case "global": return !c.has_override;
      // "Missing" is not the same as "global": it means we cannot quote this
      // market at all, which is a problem rather than a default.
      case "missing": return c.global_price === null && !c.has_override;
      case "unsupported": return !c.currency_supported;
      case "disabled": return !c.country_enabled;
      default: return true;
    }
  });


  return (
    <AdminShell title="Edit Subscription Plan">
      <div className="space-y-5">
        {/* ── Breadcrumb + title + actions ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <nav className="flex items-center gap-1.5 text-[11.5px] text-[#8A8592]">
              <Link href="/premium-plans" className="hover:text-[#fe2c55]">Subscription Plans</Link>
              <ChevronRight size={12} />
              {tab === "general" ? (
                <span className="font-semibold text-[#111827]">Edit Plan</span>
              ) : (
                <>
                  <button onClick={() => setTab("general")} className="hover:text-[#fe2c55]">Edit Plan</button>
                  <ChevronRight size={12} />
                  <span className="font-semibold text-[#111827]">
                    {TABS.find((t) => t.id === tab)?.name}
                  </span>
                </>
              )}
            </nav>
            <h1 className="mt-1.5 text-[26px] font-black tracking-[-0.02em] text-[#111827]">
              Edit Subscription Plan
            </h1>
            <p className="mt-1 text-[13px] text-[#8A8592]">
              {tab === "availability"
                ? "Manage where and to whom this plan is available."
                : "Update your subscription plan details, pricing, features and availability."}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href={`/premium-plans?preview=${plan.key}`}
              className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
            >
              <Eye size={15} /> Preview Plan
            </Link>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e0243d] disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] font-semibold text-[#dc2626]">
            {err}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex flex-wrap gap-0.5 border-b border-[#eceaf0]">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3.5 py-3 text-[12.5px] font-semibold transition ${
                  active ? "text-[#fe2c55]" : t.live ? "text-[#6b7280] hover:text-[#111827]" : "text-[#b9b5c0]"
                }`}
              >
                <Icon size={14} strokeWidth={2.2} />
                {t.name}
                {active && <span className="absolute inset-x-2.5 -bottom-px h-[2.5px] rounded-full bg-[#fe2c55]" />}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          {/* ══ Main column ══ */}
          <div className="space-y-4">
            {tab === "general" && (
              <>
                <Card className="p-6">
                  <h2 className="mb-5 text-[16px] font-black text-[#111827]">Plan Information</h2>

                  <div className="grid gap-6 md:grid-cols-[1fr_300px]">
                    {/* Left: the text fields */}
                    <div className="space-y-4">
                      <div>
                        <span className={label}>Plan Name{req}</span>
                        <div className="relative">
                          <input
                            className={`${input} pr-16`}
                            maxLength={50}
                            value={f.name}
                            onChange={(e) => set("name", e.target.value)}
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            <Counter value={f.name} max={50} />
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className={label}>Plan Slug{req}</span>
                        <input className={`${input} bg-[#f6f4f7] text-[#9ca3af]`} value={plan.key} disabled />
                        {/* Locked, and the reason is worth stating: subscriptions
                            reference this key, so renaming it would reassign what
                            existing subscribers are on. */}
                        <span className="mt-1.5 flex items-center gap-1 text-[11px] text-[#9ca3af]">
                          https://teezer.live/subscribe/{plan.key}
                          <ExternalLink size={11} />
                        </span>
                      </div>

                      <div>
                        <span className={label}>Short Description{req}</span>
                        <div className="relative">
                          <textarea
                            rows={3}
                            maxLength={150}
                            className={`${input} resize-none pb-7`}
                            value={f.tagline}
                            onChange={(e) => set("tagline", e.target.value)}
                          />
                          <span className="absolute bottom-2.5 right-3.5">
                            <Counter value={f.tagline} max={150} />
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <span className={label}>Badge</span>
                          <select className={input} value={f.badge_label} onChange={(e) => set("badge_label", e.target.value)}>
                            <option value="">No badge</option>
                            <option value="Most Popular">Most Popular</option>
                            <option value="Best Value">Best Value</option>
                            <option value="New">New</option>
                            <option value="Limited">Limited</option>
                          </select>
                        </div>
                        <div>
                          <span className={label}>Priority Order</span>
                          <input className={input} inputMode="numeric" value={f.sort} onChange={(e) => set("sort", e.target.value)} />
                          <span className={hint}>Lower number shows first</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-[12px] font-semibold text-[#374151]">Status</span>
                        {/* Writes `status`, not `is_enabled` - status is the
                            authoritative field and the API derives is_enabled
                            from it, so the two can never be saved disagreeing.
                            Off maps to `disabled`; the finer states live on the
                            Availability tab. */}
                        <Toggle
                          on={f.status === "active"}
                          onChange={(v) => setF({ ...f, status: v ? "active" : "disabled", is_enabled: v })}
                        />
                        <span className="text-[12.5px] font-semibold text-[#111827]">
                          {STATUSES.find((s) => s.id === f.status)?.name ?? "Active"}
                        </span>
                      </div>
                    </div>

                    {/* Right: icon, theme, category */}
                    <div className="space-y-5">
                      <div>
                        <span className={label}>Plan Icon</span>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-[76px] w-[76px] flex-none items-center justify-center rounded-[14px] ${PLAN_TINT[plan.key] ?? "bg-[#f4f2f5] text-[#111827]"}`}>
                            {plan.icon_url
                              ? <img src={plan.icon_url} alt="" className="h-9 w-9 object-contain" />
                              : <Glyph size={32} strokeWidth={2} />}
                          </div>
                          {/* Disabled on purpose: the column exists, the upload
                              endpoint does not. A button that opens a picker and
                              drops the file would be worse than one that says so. */}
                          <button
                            type="button"
                            disabled
                            title="Icon upload endpoint isn't built yet - the column exists, the uploader doesn't."
                            className="flex-1 cursor-not-allowed rounded-[10px] border border-dashed border-[#d8d5dd] bg-white px-3 py-3.5 text-center transition"
                          >
                            <span className="flex items-center justify-center gap-1.5 text-[12.5px] font-bold text-[#9ca3af]">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                              </svg>
                              Change Icon
                            </span>
                            <span className="mt-0.5 block text-[10.5px] text-[#c9c5d0]">PNG, SVG up to 2MB</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className={label}>Card Theme</span>
                        <div className="grid grid-cols-4 gap-2">
                          {THEMES.map((t) => {
                            const on = f.theme === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => set("theme", t.id)}
                                className={`relative rounded-[11px] border-[1.5px] p-1.5 text-center transition ${
                                  on ? "border-[#fe2c55] bg-[#fff5f7]" : "border-[#eceaf0] bg-white hover:border-[#d8d5dd]"
                                }`}
                              >
                                <span className={`block rounded-[7px] border p-2 ${t.card}`}>
                                  <span className={`mb-1 block h-1.5 w-7 rounded-full ${t.bar}`} />
                                  <span className={`mb-0.5 block h-1 w-full rounded-full ${t.line}`} />
                                  <span className={`block h-1 w-2/3 rounded-full ${t.line}`} />
                                </span>
                                <span className={`mt-1.5 block text-[10.5px] font-bold ${on ? "text-[#111827]" : "text-[#6b7280]"}`}>
                                  {t.name}
                                </span>
                                <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${on ? "bg-[#fe2c55]" : "bg-[#e5e7eb]"}`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <span className={label}>Plan Category</span>
                        <select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* ── Plan Tags ── */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Plan Tags</h2>
                  <p className="mt-1 text-[12px] text-[#8A8592]">
                    Add tags to help organize and filter your subscription plans.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#e5e7eb] p-3">
                    {f.tags.map((t: string) => (
                      <span key={t} className="flex items-center gap-1.5 rounded-[7px] bg-[#ffe9ef] px-2.5 py-1.5 text-[12px] font-semibold text-[#fe2c55]">
                        {t}
                        <button
                          type="button"
                          onClick={() => set("tags", f.tags.filter((x: string) => x !== t))}
                          className="opacity-70 transition hover:opacity-100"
                          aria-label={`Remove ${t}`}
                        >
                          <X size={12} strokeWidth={2.6} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      onBlur={addTag}
                      placeholder="+ Add Tag"
                      maxLength={32}
                      className="min-w-[90px] flex-1 bg-transparent px-1 text-[12px] text-[#111827] outline-none placeholder:text-[#9ca3af]"
                    />
                  </div>
                  {f.tags.length >= 12 && (
                    <p className="mt-1.5 text-[11px] font-semibold text-[#d97706]">
                      12 tags is the limit the API accepts.
                    </p>
                  )}

                  <div className="mt-5">
                    <span className={label}>Internal Note</span>
                    <p className="-mt-1 mb-1.5 text-[11px] text-[#9ca3af]">This note is only visible to admins.</p>
                    <div className="relative">
                      <textarea
                        rows={3}
                        maxLength={500}
                        className={`${input} resize-none pb-7`}
                        value={f.internal_note}
                        onChange={(e) => set("internal_note", e.target.value)}
                      />
                      <span className="absolute bottom-2.5 right-3.5">
                        <Counter value={f.internal_note} max={500} />
                      </span>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {tab === "pricing" && (
              <>
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Base currency</h2>
                  <div className="mt-3">
                    <select className={`${input} bg-[#f6f4f7] text-[#9ca3af]`} disabled value="USD">
                      <option value="USD">USD — US Dollar</option>
                    </select>
                    <span className={hint}>
                      All prices are stored in USD and converted per request from live rates. A
                      country with no rate is quoted the USD price rather than shown an error.
                    </span>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="mb-1 flex items-center gap-1.5 text-[16px] font-black text-[#111827]">
                    <DollarSign size={16} className="text-[#16a34a]" /> Pricing
                  </h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className={label}>Website price (USD)</span>
                      <input className={input} inputMode="decimal" placeholder="4.99"
                             value={f.base_price_usd} onChange={(e) => set("base_price_usd", e.target.value)} />
                      <span className={hint}>Charged by Stripe and PayPal. Also the app default.</span>
                    </div>
                    <div>
                      <span className={label}>App price (USD)</span>
                      <input className={`${input} ${!f.separate ? "bg-[#f6f4f7] text-[#9ca3af]" : ""}`}
                             inputMode="decimal" disabled={!f.separate}
                             placeholder={f.separate ? "6.99" : f.base_price_usd || "same as website"}
                             value={f.separate ? f.app_price_usd : ""}
                             onChange={(e) => set("app_price_usd", e.target.value)} />
                      <span className={hint}>
                        {f.separate ? "Often higher to absorb the store's 15-30% cut." : "Linked to the website price."}
                      </span>
                    </div>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[#e5e7eb] px-3 py-2.5">
                    <input type="checkbox" className="mt-[2px] h-4 w-4 accent-[#fe2c55]"
                           checked={f.separate} onChange={(e) => set("separate", e.target.checked)} />
                    <span className="text-[12px] leading-snug text-[#111827]">
                      <span className="font-bold">Charge a different price in the app</span>
                      <span className="mt-0.5 block text-[11px] text-[#6b7280]">
                        Off means both use the website price. Turning it off clears the app price
                        rather than leaving a stale number behind.
                      </span>
                    </span>
                  </label>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <span className={label}>Billing period</span>
                      <select className={input} value={f.period} onChange={(e) => set("period", e.target.value)}>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <span className={label}>Legacy price</span>
                      <input className={input} value={f.price} onChange={(e) => set("price", e.target.value)} />
                      <span className={hint}>Shown only until a USD price is set.</span>
                    </div>
                    <div>
                      <span className={label}>Legacy currency</span>
                      <input className={input} maxLength={3} value={f.currency}
                             onChange={(e) => set("currency", e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </Card>

                {/* ── Discount ──
                    Stores the price being discounted FROM, not a percentage.
                    That is what an admin actually decides, and it keeps the
                    percentage derived so the label and the money can never
                    disagree by a rounding cent. */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Discount</h2>
                  <p className={cardSub}>
                    Set the price this plan is discounted from. Leave empty for no discount.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className={label}>Website was-price (USD)</span>
                      <input className={input} inputMode="decimal" placeholder="—"
                             value={f.compare_at_price_usd}
                             onChange={(e) => set("compare_at_price_usd", e.target.value)} />
                      <span className={hint}>Must be higher than the website price to count as a discount.</span>
                    </div>
                    <div>
                      <span className={label}>App was-price (USD)</span>
                      <input className={`${input} ${!f.separate ? "bg-[#f6f4f7] text-[#9ca3af]" : ""}`}
                             inputMode="decimal" disabled={!f.separate} placeholder="—"
                             value={f.separate ? f.compare_at_app_price_usd : ""}
                             onChange={(e) => set("compare_at_app_price_usd", e.target.value)} />
                      <span className={hint}>
                        {f.separate ? "Compared against the app price." : "Only used when the app has its own price."}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <span className={label}>Badge text</span>
                    <input className={input} maxLength={40} placeholder="Launch offer"
                           value={f.discount_label} onChange={(e) => set("discount_label", e.target.value)} />
                    <span className={hint}>Shown beside the struck-through price. Optional.</span>
                  </div>

                  {/* Live arithmetic, so the admin sees the real saving before
                      saving rather than trusting a percentage they typed. */}
                  {(() => {
                    const now = parseFloat(f.base_price_usd) || 0;
                    const was = parseFloat(f.compare_at_price_usd) || 0;
                    if (!was) return null;
                    if (was <= now) {
                      return (
                        <p className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[11.5px] font-semibold leading-snug text-[#dc2626]">
                          <AlertTriangle size={13} className="mt-[1px] flex-none" />
                          The was-price must be higher than ${now.toFixed(2)} — otherwise there is no
                          discount and it will be ignored rather than shown as a negative saving.
                        </p>
                      );
                    }
                    const save = was - now;
                    return (
                      <p className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2.5 text-[11.5px] leading-snug text-[#15803d]">
                        <Check size={13} className="mt-[1px] flex-none" />
                        <span>
                          Customers see <s>${was.toFixed(2)}</s> <b>${now.toFixed(2)}</b> — saving{" "}
                          <b>${save.toFixed(2)}</b> ({Math.round((save / was) * 100)}% off).
                          Country prices convert the was-price through the same rate, so the saving
                          stays real in every currency.
                        </span>
                      </p>
                    );
                  })()}
                </Card>

                {/* ── Pricing mode ── */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Pricing mode</h2>
                  <p className={cardSub}>How this plan is priced around the world.</p>

                  <div className="mt-4 space-y-2.5">
                    <Radio name="pricing_mode" on={pricingMode === "global"}
                           onSelect={() => setMode.mutate("global")}
                           title="Global pricing"
                           help="One USD base price, converted per country by the existing exchange-rate and rounding system."
                           boxed />
                    <Radio name="pricing_mode" on={pricingMode === "country"}
                           onSelect={() => setMode.mutate("country")}
                           title="Country-specific pricing"
                           help="The same, plus a fixed price for the countries you configure. Everywhere else still converts from USD."
                           boxed />
                  </div>

                  {/* Switching is non-destructive, and saying so removes the
                      fear that toggling back wipes the configured prices. */}
                  <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#f8f7f9] px-3.5 py-2.5 text-[11.5px] leading-snug text-[#6b7280]">
                    <Info size={13} className="mt-[1px] flex-none text-[#9ca3af]" />
                    Switching to global does not delete your country prices — they stop being applied
                    and come back exactly as they were if you switch again. Resolution order is
                    always: country price → global USD converted → USD fallback.
                  </p>
                </Card>

                {/* ── Country pricing ── */}
                {pricingMode === "country" && (
                  <Card className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[16px] font-black text-[#111827]">Country pricing</h2>
                        <p className={cardSub}>
                          {matrixQ.data?.countries?.filter((c) => c.has_override).length ?? 0} of{" "}
                          {matrixQ.data?.countries?.length ?? 0} countries have a custom price.
                          {" "}
                          {/* States plainly whether the two platforms are linked
                              at the base, so equal numbers are not mistaken for
                              a coincidence - and unequal ones have an
                              explanation. */}
                          {matrixQ.data?.has_separate_app_price
                            ? `The app has its own USD base ($${matrixQ.data?.app_price_usd?.toFixed(2)}), so it can differ from the website.`
                            : "The app inherits the website's USD base, so both platforms match unless a country price splits them."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={cycle} onChange={(e) => setCycle(e.target.value)}
                                className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]">
                          <option value="month">Monthly</option>
                          <option value="year">Yearly</option>
                        </select>
                        <button type="button" onClick={() => setBulkOpen((v) => !v)}
                                className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] font-bold text-[#374151] transition hover:bg-[#fafafa]">
                          Bulk adjust
                        </button>
                      </div>
                    </div>

                    {/* Search + filters */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[190px] flex-1">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                        <input value={cQuery} onChange={(e) => setCQuery(e.target.value)}
                               placeholder="Search country, code or currency…"
                               className={`${input} py-2 pl-9`} />
                      </div>
                      <select value={cFilter} onChange={(e) => setCFilter(e.target.value)}
                              className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]">
                        <option value="">All countries</option>
                        <option value="custom">Custom pricing</option>
                        <option value="global">Global pricing</option>
                        <option value="missing">Missing price</option>
                        <option value="unsupported">Unsupported currency</option>
                        <option value="disabled">Disabled countries</option>
                      </select>
                    </div>

                    {/* Bulk panel. Preview is mandatory - nothing is written
                        without an explicit confirm, so a mis-click cannot
                        reprice a hundred markets. */}
                    {bulkOpen && (
                      <div className="mt-3 rounded-[11px] border border-[#fde68a] bg-[#fffbeb] p-3.5">
                        <p className="text-[12.5px] font-bold text-[#92400e]">Bulk adjust {bulkSel.length} selected</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <select value={bulkMode} onChange={(e) => setBulkMode(e.target.value)}
                                  className="rounded-[8px] border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[12px]">
                            <option value="percent">Adjust by %</option>
                            <option value="fixed">Set fixed price</option>
                          </select>
                          <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                                 placeholder={bulkMode === "percent" ? "-20" : "499"}
                                 className="w-[110px] rounded-[8px] border border-[#e5e7eb] px-2.5 py-1.5 text-[12px]" />
                          <button type="button" disabled={!bulkSel.length || bulkValue === "" || bulk.isPending}
                                  onClick={() => bulk.mutate(false)}
                                  className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-bold text-[#374151] disabled:opacity-45">
                            Preview
                          </button>
                          {!!bulkPreview.length && (
                            <button type="button" onClick={() => bulk.mutate(true)} disabled={bulk.isPending}
                                    className="rounded-[8px] bg-[#fe2c55] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">
                              Apply to {bulkPreview.filter((r) => !r.skipped).length}
                            </button>
                          )}
                        </div>
                        {!!bulkPreview.length && (
                          <div className="mt-2.5 max-h-[170px] overflow-y-auto rounded-[8px] border border-[#fde68a] bg-white">
                            {bulkPreview.map((r) => (
                              <div key={r.country_code} className="flex items-center justify-between border-b border-[#f4f2f5] px-3 py-1.5 text-[11.5px] last:border-0">
                                <span className="text-[#374151]">{r.country_name}</span>
                                <span className={r.skipped ? "text-[#9ca3af]" : "font-bold text-[#111827]"}>
                                  {r.skipped
                                    ? "skipped — no convertible price"
                                    : `${r.currency_code} ${Number(r.current_price ?? 0).toFixed(2)} → ${Number(r.new_price).toFixed(2)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Matrix */}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[820px] border-collapse">
                        <thead>
                          <tr className="border-b border-[#eceaf0] text-left">
                            <th className="w-8 pb-2.5" />
                            {["Country", "Code", "Currency", "Website", "App", "Match", "Global converted", "Status", ""].map((h) => (
                              <th key={h} className="pb-2.5 pr-3 text-[10.5px] font-bold uppercase tracking-wide text-[#9ca3af]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixQ.isLoading && (
                            <tr><td colSpan={10} className="py-8 text-center text-[12.5px] text-[#8A8592]">Loading countries…</td></tr>
                          )}
                          {!matrixQ.isLoading && visibleCountries.length === 0 && (
                            <tr><td colSpan={10} className="py-8 text-center text-[12.5px] text-[#8A8592]">No countries match that filter.</td></tr>
                          )}
                          {visibleCountries.map((c) => (
                            <tr key={c.country_code} className="border-b border-[#f4f2f5] last:border-0">
                              <td className="py-2.5">
                                <input type="checkbox" className="h-[14px] w-[14px] accent-[#fe2c55]"
                                       checked={bulkSel.includes(c.country_code)}
                                       onChange={(e) => setBulkSel(e.target.checked
                                         ? [...bulkSel, c.country_code]
                                         : bulkSel.filter((x) => x !== c.country_code))} />
                              </td>
                              <td className="py-2.5 pr-3 text-[12.5px] text-[#111827]">{c.country_name}</td>
                              <td className="py-2.5 pr-3 font-mono text-[11.5px] text-[#6b7280]">{c.country_code}</td>
                              <td className="py-2.5 pr-3 text-[11.5px] text-[#6b7280]">
                                {c.currency_code}
                                {!c.currency_supported && (
                                  <span className="ml-1.5 rounded-[5px] bg-[#fef3c7] px-1.5 py-[1px] text-[9.5px] font-bold text-[#92400e]">
                                    no rate
                                  </span>
                                )}
                              </td>
                              {/* Website and App edited independently. Each cell
                                  writes only its own surface, so setting an app
                                  price cannot silently move the website one. */}
                              <td className="py-2.5 pr-3">
                                <PriceCell
                                  value={c.web_custom}
                                  placeholder={c.web_global !== null ? c.web_global.toFixed(2) : "—"}
                                  onCommit={(v) => v === null
                                    ? (c.has_web_override && removeCountryPrice.mutate({ country: c.country_code, surface: "web" }))
                                    : saveCountryPrice.mutate({ country: c.country_code, price: v, surface: "web" })}
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                <PriceCell
                                  value={c.app_custom}
                                  placeholder={c.app_global !== null ? c.app_global.toFixed(2) : "—"}
                                  onCommit={(v) => v === null
                                    ? (c.has_app_override && removeCountryPrice.mutate({ country: c.country_code, surface: "app" }))
                                    : saveCountryPrice.mutate({ country: c.country_code, price: v, surface: "app" })}
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                {/* The actual question: do both platforms charge
                                    the same? Compared on the EFFECTIVE price, so
                                    an override on one side and a conversion on
                                    the other are still compared like for like. */}
                                {c.platforms_match === null ? (
                                  <span className="text-[11.5px] text-[#c9c5d0]">—</span>
                                ) : c.platforms_match ? (
                                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-[#16a34a]">
                                    <Check size={12} strokeWidth={3} /> Same
                                  </span>
                                ) : (
                                  <span className="text-[11.5px] font-bold text-[#d97706]" title={`Website ${c.web_effective?.toFixed(2)} · App ${c.app_effective?.toFixed(2)}`}>
                                    Differs
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pr-3 text-[12px] text-[#6b7280]">
                                {c.web_global !== null ? `${c.currency_code} ${c.web_global.toFixed(2)}` : "—"}
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className={`rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold ${
                                  c.status === "custom" ? "bg-[#ffe9ef] text-[#fe2c55]"
                                    : c.status === "disabled" ? "bg-[#f3f4f6] text-[#6b7280]"
                                    : "bg-[#f4f2f5] text-[#6b7280]"
                                }`}>
                                  {c.status === "custom" ? "Custom" : c.status === "disabled" ? "Disabled" : "Global"}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-[11.5px] text-[#9ca3af]">
                                {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-2.5">
                                {c.has_override && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Clears BOTH surfaces - "reset to global"
                                      // means this country has no fixed price at
                                      // all, not just on the column you happened
                                      // to be looking at.
                                      if (c.has_web_override) removeCountryPrice.mutate({ country: c.country_code, surface: "web" });
                                      if (c.has_app_override) removeCountryPrice.mutate({ country: c.country_code, surface: "app" });
                                    }}
                                    title="Reset both platforms to the global price"
                                    className="grid h-7 w-7 place-items-center rounded-[7px] text-[#9ca3af] transition hover:bg-[#fef2f2] hover:text-[#dc2626]"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* ── History ── */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Pricing history</h2>
                  <p className={cardSub}>Every price change, newest first. Append-only.</p>
                  <div className="mt-3 space-y-1.5">
                    {(historyQ.data ?? []).slice(0, 20).map((h, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 border-b border-[#f4f2f5] py-2 text-[11.5px] last:border-0">
                        <span className="font-mono text-[11px] text-[#9ca3af]">
                          {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                        </span>
                        <span className="rounded-[5px] bg-[#f4f2f5] px-1.5 py-[1px] text-[10px] font-bold uppercase text-[#6b7280]">
                          {h.action}
                        </span>
                        <span className="text-[#374151]">
                          {h.country_code ?? h.currency_code ?? "Global"}
                          {h.billing_cycle ? ` · ${h.billing_cycle}` : ""}
                        </span>
                        <span className="font-semibold text-[#111827]">
                          {h.old_price ?? "—"} → {h.new_price ?? "—"}
                        </span>
                        <span className="ml-auto text-[#9ca3af]">
                          {h.changed_by_name ?? h.changed_by_username ?? "system"}
                        </span>
                      </div>
                    ))}
                    {(historyQ.data ?? []).length === 0 && (
                      <p className="py-6 text-center text-[12.5px] text-[#9ca3af]">No price changes recorded yet.</p>
                    )}
                  </div>
                </Card>
              </>
            )}

            {tab === "features" && (
              <>
                {/* ── Features Included in This Plan ── */}
                <Card className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-black text-[#111827]">Features Included in This Plan</h2>
                      <p className={cardSub}>Enable or disable features and set limits for this subscription plan.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Custom features would need a catalog write endpoint;
                          the catalog is seeded and admin-managed elsewhere, so
                          this says so rather than opening a form that saves
                          nothing. */}
                      <button
                        type="button"
                        disabled
                        title="Adding to the shared feature catalog isn't built yet - features here come from the seeded catalog."
                        className="flex cursor-not-allowed items-center gap-1.5 rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-bold text-[#c9c5d0]"
                      >
                        <Plus size={13} /> Add Custom Feature
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm("Reset every feature on this plan to the catalog defaults? This clears your unsaved feature changes.")) return;
                          set("plan_features", (plan.plan_features ?? []).map((x) => ({ ...x })));
                        }}
                        className="flex items-center gap-1.5 rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
                      >
                        <RotateCcw size={13} /> Reset to Default
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#eceaf0] text-left">
                          {["Feature", "Description", "Limit / Value", "Status", "Actions"].map((h) => (
                            <th key={h} className="pb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-[#9ca3af]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {included.map((ft, i) => (
                          <tr key={ft.key} className="border-b border-[#f4f2f5] last:border-0">
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2.5">
                                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${featureTint(ft.group_key)}`}>
                                  <Sparkles size={15} />
                                </span>
                                <span className="text-[12.5px] font-bold text-[#111827]">{ft.name}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-[12px] text-[#6b7280]">{ft.description}</td>
                            <td className="py-3 pr-3">
                              {ft.value_type === "select" && ft.options?.length ? (
                                <select
                                  value={ft.value ?? ""}
                                  disabled={!ft.is_enabled}
                                  onChange={(e) => setFeature(i, { value: e.target.value })}
                                  className={`w-[150px] rounded-[9px] border border-[#e5e7eb] px-2.5 py-1.5 text-[12px] outline-none transition focus:border-[#fe2c55] ${
                                    ft.is_enabled ? "bg-white text-[#111827]" : "bg-[#f6f4f7] text-[#c9c5d0]"
                                  }`}
                                >
                                  {ft.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : ft.is_enabled ? (
                                // An on/off feature that is ON has no limit to
                                // show - "Unlimited" is how that reads, not a
                                // stored value.
                                <span className="text-[12px] font-semibold text-[#16a34a]">Unlimited</span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-[12px] text-[#9ca3af]">
                                  <Lock size={11} /> Not Included
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <Toggle on={ft.is_enabled} onChange={(v) => setFeature(i, { is_enabled: v })} />
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setFeature(i, { is_enabled: !ft.is_enabled })}
                                  title={ft.is_enabled ? "Turn off" : "Turn on"}
                                  className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#e5e7eb] text-[#6b7280] transition hover:bg-[#fafafa]"
                                >
                                  <Pencil size={12} />
                                </button>
                                {/* Reorder by button, not drag: a drag handle
                                    that does nothing is worse than an arrow
                                    that works, and sort is what the API reads. */}
                                <button
                                  type="button"
                                  disabled={i === 0}
                                  onClick={() => moveFeature(i, -1)}
                                  title="Move up"
                                  className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#e5e7eb] text-[#6b7280] transition hover:bg-[#fafafa] disabled:opacity-35"
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={i === included.length - 1}
                                  onClick={() => moveFeature(i, 1)}
                                  title="Move down"
                                  className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#e5e7eb] text-[#6b7280] transition hover:bg-[#fafafa] disabled:opacity-35"
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {included.length === 0 && (
                          <tr><td colSpan={5} className="py-8 text-center text-[12.5px] text-[#9ca3af]">
                            No features on this plan yet — add them from the library below.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-[#f8f7f9] px-4 py-3 text-[11.5px] leading-snug text-[#6b7280]">
                    <Info size={13} className="mt-[1px] flex-none text-[#9ca3af]" />
                    Changes to features apply to new subscribers. Existing subscribers keep their
                    current access until they renew.
                  </p>
                </Card>

                {/* ── Feature Library ── */}
                <Card className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-black text-[#111827]">Feature Library</h2>
                      <p className={cardSub}>Add additional features from the library.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={featureCat}
                        onChange={(e) => setFeatureCat(e.target.value)}
                        className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] text-[#374151] outline-none focus:border-[#fe2c55]"
                      >
                        <option value="">All Categories</option>
                        {Object.entries(FEATURE_GROUPS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                      </select>
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                        <input
                          value={featureQuery}
                          onChange={(e) => setFeatureQuery(e.target.value)}
                          placeholder="Search features..."
                          className="w-[190px] rounded-[9px] border border-[#e5e7eb] bg-white py-2 pl-8 pr-3 text-[12px] outline-none focus:border-[#fe2c55]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {library.map((ft) => (
                      <div key={ft.key} className="flex items-start gap-2.5 rounded-[11px] border border-[#eceaf0] p-3">
                        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${featureTint(ft.group_key)}`}>
                          <Sparkles size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold text-[#111827]">{ft.name}</span>
                          <span className="mt-0.5 block truncate text-[10.5px] text-[#8A8592]">{ft.description}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setFeature(allFeatures.findIndex((x) => x.key === ft.key), { is_enabled: true })}
                          className="flex flex-none items-center gap-1 rounded-[7px] border border-[#e5e7eb] px-2 py-1 text-[11px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
                        >
                          <Plus size={11} /> Add
                        </button>
                      </div>
                    ))}
                    {library.length === 0 && (
                      <p className="col-span-full py-6 text-center text-[12px] text-[#9ca3af]">
                        {featureQuery || featureCat
                          ? "No features match that filter."
                          : "Every catalogued feature is already on this plan."}
                      </p>
                    )}
                  </div>
                </Card>
              </>
            )}

            {tab === "availability" && (
              <div className="grid gap-4 xl:grid-cols-3">
                {/* ── Platform Availability ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Platform Availability</h3>
                  <p className={cardSub}>Select platforms where this plan can be purchased and used.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
                    {PLATFORMS.map((p) => {
                      const on = (f.platforms as string[]).includes(p.id);
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => set("platforms", on
                            ? (f.platforms as string[]).filter((x) => x !== p.id)
                            : [...(f.platforms as string[]), p.id])}
                          className={`flex items-start gap-2.5 rounded-[11px] border p-3 text-left transition ${
                            on ? "border-[#e5e7eb] bg-white" : "border-[#f0eef2] bg-[#fafafa]"
                          }`}
                        >
                          <Icon size={19} className={on ? "mt-[1px] flex-none text-[#374151]" : "mt-[1px] flex-none text-[#c9c5d0]"} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold text-[#111827]">{p.name}</span>
                            <span className={`block text-[10.5px] font-semibold ${on ? "text-[#16a34a]" : "text-[#c9c5d0]"}`}>
                              {on ? "Available" : "Off"}
                            </span>
                          </span>
                          <Check2 on={on} />
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* ── Plan Visibility ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Plan Visibility</h3>
                  <p className={cardSub}>Control where this plan is displayed to users.</p>
                  <div className="mt-3.5 space-y-2.5">
                    {VISIBILITY.map((v) => (
                      <label key={v.id} className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-[1px] h-[15px] w-[15px] flex-none accent-[#fe2c55]"
                          checked={!!(f.visibility as Record<string, boolean>)[v.id]}
                          onChange={(e) => set("visibility", { ...f.visibility, [v.id]: e.target.checked })}
                        />
                        <span className="text-[12px] leading-snug text-[#374151]">{v.name}</span>
                      </label>
                    ))}
                  </div>
                  {/* Only shown when it is actually true - a permanent warning
                      about a setting that is off is noise. */}
                  {!!(f.visibility as Record<string, boolean>).hidden && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-[9px] bg-[#f6f4f7] px-3 py-2 text-[11px] leading-snug text-[#6b7280]">
                      <Info size={12} className="mt-[1px] flex-none" />
                      If hidden, users won&apos;t be able to view or purchase this plan.
                    </p>
                  )}
                </Card>

                {/* ── Plan Status ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Plan Status</h3>
                  <p className={cardSub}>Control the availability status of this plan.</p>
                  <div className="mt-3.5 space-y-2">
                    {STATUSES.map((s) => (
                      <Radio
                        key={s.id}
                        name="status"
                        on={f.status === s.id}
                        onSelect={() => set("status", s.id)}
                        title={<span className={`font-bold ${s.tint}`}>{s.name}</span>}
                        help={s.help}
                        boxed
                      />
                    ))}
                  </div>
                </Card>

                {/* ── Purchase Eligibility ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Purchase Eligibility</h3>
                  <p className={cardSub}>Define who can purchase this plan.</p>
                  <div className="mt-3.5 space-y-2.5">
                    {ELIGIBILITY.map((e) => (
                      <Radio
                        key={e.id}
                        name="eligibility"
                        on={f.purchase_eligibility === e.id}
                        onSelect={() => set("purchase_eligibility", e.id)}
                        title={e.name}
                        help={e.help}
                        // Selectable but inert: there is no user-group table, so
                        // the backend treats it as "everyone" rather than making
                        // the plan silently unbuyable.
                        badge={"soon" in e && e.soon ? "Coming Soon" : undefined}
                      />
                    ))}
                  </div>
                </Card>

                {/* ── Availability Schedule ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Availability Schedule</h3>
                  <p className={cardSub}>Set the time period for plan availability.</p>
                  <div className="mt-3.5 space-y-3.5">
                    <div>
                      <span className={label}>Start Date</span>
                      <input
                        type="datetime-local"
                        className={input}
                        value={f.available_from}
                        onChange={(e) => set("available_from", e.target.value)}
                      />
                    </div>
                    <div>
                      <span className={label}>End Date (Optional)</span>
                      <input
                        type="datetime-local"
                        className={`${input} ${f.no_expiry ? "bg-[#f6f4f7] text-[#9ca3af]" : ""}`}
                        disabled={f.no_expiry}
                        value={f.no_expiry ? "" : f.available_until}
                        onChange={(e) => set("available_until", e.target.value)}
                      />
                    </div>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-[1px] h-[15px] w-[15px] flex-none accent-[#fe2c55]"
                        checked={f.no_expiry}
                        onChange={(e) => set("no_expiry", e.target.checked)}
                      />
                      <span className="text-[12px] leading-snug text-[#374151]">
                        No expiry
                        <span className="mt-0.5 block text-[11px] text-[#9ca3af]">
                          Plan will be available indefinitely.
                        </span>
                      </span>
                    </label>
                  </div>
                </Card>

                {/* ── Countries & Regions ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Countries &amp; Regions</h3>
                  <p className={cardSub}>Choose where this plan is available.</p>
                  <div className="mt-3.5 space-y-2.5">
                    {COUNTRY_MODES.map((c) => (
                      <Radio
                        key={c.id}
                        name="countries_mode"
                        on={f.countries_mode === c.id}
                        onSelect={() => set("countries_mode", c.id)}
                        title={c.name}
                        help={c.help}
                      />
                    ))}
                  </div>

                  {f.countries_mode !== "all" && (
                    <CountryPicker
                      mode={f.countries_mode as "include" | "exclude"}
                      selected={f.countries as string[]}
                      all={countriesQ.data ?? []}
                      loading={countriesQ.isLoading}
                      onChange={(next) => set("countries", next)}
                    />
                  )}

                  {/* The one genuinely dangerous state, called out where it
                      happens: "selected countries" with nothing selected is a
                      valid instruction that sells nowhere, and it is easy to
                      reach by switching mode and not finishing. */}
                  {f.countries_mode === "include" && (f.countries as string[]).length === 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[11.5px] leading-snug font-semibold text-[#dc2626]">
                      <AlertTriangle size={13} className="mt-[1px] flex-none" />
                      No countries selected — this plan cannot be purchased anywhere. Pick at least
                      one country, or switch back to &ldquo;Available in all countries&rdquo;.
                    </p>
                  )}

                  {f.countries_mode === "exclude" && (f.countries as string[]).length === 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#f8f7f9] px-3.5 py-2.5 text-[11.5px] leading-snug text-[#6b7280]">
                      <Info size={13} className="mt-[1px] flex-none text-[#9ca3af]" />
                      Nothing excluded yet, so this behaves exactly like &ldquo;all countries&rdquo;.
                    </p>
                  )}
                </Card>

                {/* ── Account Requirements ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Account Requirements</h3>
                  <p className={cardSub}>Set requirements that users must meet.</p>
                  <div className="mt-3.5 space-y-3">
                    {REQUIREMENTS.slice(0, 2).map((r) => (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="h-[15px] w-[15px] flex-none accent-[#fe2c55]"
                          checked={!!(f.requirements as Record<string, any>)[r.id]}
                          onChange={(e) => set("requirements", { ...f.requirements, [r.id]: e.target.checked })}
                        />
                        <span className="text-[12px] text-[#374151]">{r.name}</span>
                      </label>
                    ))}

                    <NumberRequirement
                      label="Minimum account age"
                      unit="days"
                      value={(f.requirements as Record<string, any>).min_account_age_days}
                      onChange={(v) => set("requirements", { ...f.requirements, min_account_age_days: v })}
                    />
                    <NumberRequirement
                      label="Minimum user age"
                      unit="years"
                      value={(f.requirements as Record<string, any>).min_user_age_years}
                      onChange={(v) => set("requirements", { ...f.requirements, min_user_age_years: v })}
                    />

                    {REQUIREMENTS.slice(2).map((r) => (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="h-[15px] w-[15px] flex-none accent-[#fe2c55]"
                          checked={!!(f.requirements as Record<string, any>)[r.id]}
                          onChange={(e) => set("requirements", { ...f.requirements, [r.id]: e.target.checked })}
                        />
                        <span className="text-[12px] text-[#374151]">{r.name}</span>
                      </label>
                    ))}
                  </div>
                </Card>

                {/* ── Upgrade / Downgrade Rules ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Upgrade / Downgrade Rules</h3>
                  <p className={cardSub}>Define how users can change their subscription.</p>
                  <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                    <SwitchRules
                      title="Upgrade Rules"
                      allowLabel="Allow upgrade to this plan"
                      immediateLabel="Immediate upgrade"
                      immediateHelp="Upgrade takes effect immediately."
                      deferredLabel="Upgrade at next billing cycle"
                      deferredHelp="Upgrade takes effect on next renewal."
                      fromLabel="Allowed upgrade from"
                      rules={f.upgrade_rules}
                      onChange={(v) => set("upgrade_rules", v)}
                      plans={(plans ?? []).filter((p) => p.id !== id)}
                    />
                    <SwitchRules
                      title="Downgrade Rules"
                      allowLabel="Allow downgrade to this plan"
                      immediateLabel="Immediate downgrade"
                      immediateHelp="Downgrade takes effect immediately."
                      deferredLabel="Downgrade at next billing cycle"
                      deferredHelp="Downgrade takes effect on next renewal."
                      fromLabel="Allowed downgrade from"
                      rules={f.downgrade_rules}
                      onChange={(v) => set("downgrade_rules", v)}
                      plans={(plans ?? []).filter((p) => p.id !== id)}
                      defaultDeferred
                    />
                  </div>
                </Card>

                {/* ── Existing Subscriber Behavior ── */}
                <Card className="p-5">
                  <h3 className={cardTitle}>Existing Subscriber Behavior</h3>
                  <p className={cardSub}>Decide what happens to existing subscribers.</p>
                  <div className="mt-3.5 space-y-2.5">
                    {SUBSCRIBER_BEHAVIOUR.map((b) => (
                      <Radio
                        key={b.id}
                        name="subscriber_behavior"
                        on={f.existing_subscriber_behavior === b.id}
                        onSelect={() => set("existing_subscriber_behavior", b.id)}
                        title={b.name}
                        help={b.help}
                        badge={"danger" in b && b.danger ? "Danger" : undefined}
                        badgeTone="danger"
                      />
                    ))}
                  </div>
                </Card>

                <div className="xl:col-span-3">
                  <p className="flex items-start gap-2 rounded-[11px] border border-[#eceaf0] bg-white px-4 py-3 text-[11.5px] leading-snug text-[#6b7280]">
                    <Info size={13} className="mt-[1px] flex-none text-[#9ca3af]" />
                    Availability settings help you control where, when, and who can access this
                    subscription plan. They are enforced on the server for every surface — website,
                    app, and anything added later — so a client cannot show or sell a plan these
                    rules refuse.
                  </p>
                </div>
              </div>
            )}

            {tab === "stores" && (
              <Card className="p-6">
                <h2 className="mb-1 flex items-center gap-1.5 text-[16px] font-black text-[#111827]">
                  <Smartphone size={16} className="text-[#4338ca]" /> Store product IDs
                </h2>
                <p className="mb-4 text-[12px] leading-relaxed text-[#8A8592]">
                  Apple and Google set their own local prices from these products — the app shows the
                  store&apos;s price, not the USD one. Without an id this tier is web-only.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className={`${label} flex items-center gap-1.5`}><Apple size={13} /> iOS product id</span>
                    <input className={input} placeholder="com.teezer.premium.pro"
                           value={f.ios_product_id} onChange={(e) => set("ios_product_id", e.target.value)} />
                    <span className={hint}>From App Store Connect.</span>
                  </div>
                  <div>
                    <span className={`${label} flex items-center gap-1.5`}><Smartphone size={13} /> Android product id</span>
                    <input className={input} placeholder="premium_pro_monthly"
                           value={f.android_product_id} onChange={(e) => set("android_product_id", e.target.value)} />
                    <span className={hint}>From the Play Console.</span>
                  </div>
                </div>
                {!plan.sellable && (
                  <p className="mt-4 flex items-start gap-1.5 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[11.5px] font-semibold text-[#92400e]">
                    <AlertTriangle size={13} className="mt-[1px] flex-none" />
                    This tier has no store product id, so it cannot be purchased in the app at all.
                  </p>
                )}
              </Card>
            )}

            {(tab === "countries" || tab === "currencies") && (
              <Card className="p-8 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#ffe9ef] text-[#fe2c55]">
                  <DollarSign size={18} />
                </div>
                <p className="text-[14px] font-bold text-[#111827]">Per-country pricing lives on the Pricing tab</p>
                <p className="mx-auto mt-1.5 max-w-[470px] text-[12px] leading-relaxed text-[#8A8592]">
                  Country and currency prices are edited there so every change is recorded in the
                  plan&apos;s price history and audit log. Two editors writing the same table is how
                  the two copies drift apart.
                </p>
                <button type="button" onClick={() => setTab("pricing")}
                        className="mt-4 rounded-[10px] bg-[#fe2c55] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#e0243d]">
                  Open Pricing
                </button>
              </Card>
            )}

            {tab === "trials" && (
              <Card className="p-6">
                <h2 className="text-[16px] font-black text-[#111827]">Free trial</h2>
                <p className={cardSub}>How long this plan is free before the first charge.</p>

                <div className="mt-4 space-y-2.5">
                  <Radio name="trial_mode" on={f.trial_days === null}
                         onSelect={() => set("trial_days", null)}
                         title={`Use the global setting (${plan.global_trial_days ?? 7} days)`}
                         help="Changing the global value later moves this plan with it." boxed />
                  <Radio name="trial_mode" on={f.trial_days === 0}
                         onSelect={() => set("trial_days", 0)}
                         title="No trial on this plan"
                         help="Charged immediately. This is different from inheriting a global of 0." boxed />
                  <Radio name="trial_mode" on={typeof f.trial_days === "number" && f.trial_days > 0}
                         onSelect={() => set("trial_days", 14)}
                         title="A specific length for this plan" boxed />
                </div>

                {typeof f.trial_days === "number" && f.trial_days > 0 && (
                  <div className="mt-3 flex items-center gap-2.5">
                    <input inputMode="numeric" value={f.trial_days}
                           onChange={(e) => set("trial_days", Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)))}
                           className="w-[90px] rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
                    <span className="text-[12px] text-[#6b7280]">days free, then billed {f.period === "year" ? "yearly" : "monthly"}.</span>
                  </div>
                )}

                <p className="mt-4 flex items-start gap-2 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[11.5px] leading-snug text-[#92400e]">
                  <AlertTriangle size={13} className="mt-[1px] flex-none" />
                  This controls the website and any direct billing. In-app purchases use the
                  introductory offer configured in App Store Connect and the Play Console — Apple
                  and Google will not honour a trial length set here.
                </p>
              </Card>
            )}

            {tab === "coupons" && (
              <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[16px] font-black text-[#111827]">Coupons on this plan</h2>
                    <p className={cardSub}>
                      Codes a customer can redeem against {plan.name}. Validated by the server at
                      checkout, so the same code behaves identically on the website and in the app.
                    </p>
                  </div>
                  <Link href="/coupons"
                        className="flex items-center gap-1.5 rounded-[9px] bg-[#fe2c55] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#e0243d]">
                    <Plus size={13} /> Manage coupons
                  </Link>
                </div>

                <div className="mt-4 space-y-2">
                  {(plan.coupons ?? []).map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#eceaf0] p-3">
                      <span className="font-mono text-[12.5px] font-bold text-[#fe2c55]">{c.code}</span>
                      <span className="text-[12.5px] text-[#111827]">{c.name}</span>
                      <span className="rounded-[6px] bg-[#f4f2f5] px-2 py-[3px] text-[11px] font-bold text-[#374151]">
                        {c.type === "percentage" ? `${c.value}% OFF` : `$${c.value} OFF`}
                      </span>
                      {/* Scope matters: a site-wide coupon is listed here
                          because it DOES apply, but it is not owned by this
                          plan and editing it affects every other one. */}
                      {c.applies_to_all && (
                        <span className="rounded-[6px] bg-[#e0f2fe] px-2 py-[3px] text-[10.5px] font-bold text-[#0284c7]">
                          All plans
                        </span>
                      )}
                      <span className="text-[11.5px] text-[#6b7280]">
                        {c.used_count} / {c.usage_limit ?? "∞"} used
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold capitalize text-[#374151]">
                        <span className={`h-[7px] w-[7px] rounded-full ${
                          c.status === "active" ? "bg-[#16a34a]" : c.status === "exhausted" ? "bg-[#d97706]" : "bg-[#9ca3af]"
                        }`} />
                        {c.status}
                      </span>
                    </div>
                  ))}
                  {(plan.coupons ?? []).length === 0 && (
                    <p className="py-8 text-center text-[12.5px] text-[#9ca3af]">
                      No coupons apply to this plan yet.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {tab === "analytics" && (
              <>
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Plan performance</h2>
                  <p className={cardSub}>Counted from real subscriptions on {plan.name}.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[12px] border border-[#eceaf0] p-4">
                      <Users size={16} className="text-[#4338ca]" />
                      <p className="mt-2 text-[22px] font-black leading-none text-[#111827]">
                        {(per?.subscribers ?? 0).toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9ca3af]">Subscribers</p>
                    </div>
                    <div className="rounded-[12px] border border-[#eceaf0] p-4">
                      <DollarSign size={16} className="text-[#16a34a]" />
                      <p className="mt-2 text-[22px] font-black leading-none text-[#111827]">{money(per?.revenue ?? 0)}</p>
                      <p className="mt-1 text-[11px] text-[#9ca3af]">Total revenue</p>
                    </div>
                    <div className="rounded-[12px] border border-[#eceaf0] p-4">
                      <TrendingUp size={16} className="text-[#0ea5e9]" />
                      <p className="mt-2 text-[22px] font-black leading-none text-[#111827]">
                        {/* Real arithmetic on real numbers, guarded - not a
                            fabricated growth percentage. */}
                        {(per?.subscribers ?? 0) > 0
                          ? money((per?.revenue ?? 0) / (per?.subscribers ?? 1))
                          : "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9ca3af]">Revenue per subscriber</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Coupon impact</h2>
                  <p className={cardSub}>Discount actually given on codes that apply to this plan.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[12px] border border-[#eceaf0] p-4">
                      <p className="text-[22px] font-black leading-none text-[#111827]">
                        {(plan.coupons ?? []).reduce((n, c) => n + c.used_count, 0).toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9ca3af]">Redemptions</p>
                    </div>
                    <div className="rounded-[12px] border border-[#eceaf0] p-4">
                      <p className="text-[22px] font-black leading-none text-[#111827]">
                        {(plan.coupons ?? []).filter((c) => c.status === "active").length}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9ca3af]">Active coupons</p>
                    </div>
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-[11px] leading-snug text-[#9ca3af]">
                    <BarChart3 size={12} className="mt-[1px] flex-none" />
                    Conversion and churn need an events table recording plan impressions, which does
                    not exist — so they are absent rather than estimated.
                  </p>
                </Card>
              </>
            )}
            {tab === "advanced" && (
              <>
                {/* ── Price diagnostics ──
                    Answers "why is this customer seeing that number" without
                    reading the code: it returns the RULE that produced the
                    price, not just the price. */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Price diagnostics</h2>
                  <p className={cardSub}>Check exactly what one country is quoted, and which rule decided it.</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      value={previewCountry}
                      onChange={(e) => setPreviewCountry(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="NP"
                      className="w-[80px] rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-center text-[13px] font-bold uppercase outline-none focus:border-[#fe2c55]"
                    />
                    <select value={previewCycle} onChange={(e) => setPreviewCycle(e.target.value)}
                            className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]">
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                    <select value={previewSurface} onChange={(e) => setPreviewSurface(e.target.value)}
                            className="rounded-[9px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]">
                      <option value="web">Website</option>
                      <option value="app">App</option>
                    </select>
                    <button type="button" onClick={() => preview.mutate()}
                            disabled={previewCountry.length !== 2 || preview.isPending}
                            className="rounded-[9px] bg-[#111827] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-black disabled:opacity-40">
                      {preview.isPending ? "Checking…" : "Check price"}
                    </button>
                  </div>

                  {!!previewResult && (
                    <div className="mt-4 rounded-[11px] border border-[#eceaf0] p-4">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[24px] font-black leading-none text-[#111827]">
                          {previewResult.currency} {Number(previewResult.amount).toFixed(2)}
                        </span>
                        <span className="text-[12px] text-[#8A8592]">
                          {previewResult.country_name} ({previewResult.country})
                        </span>
                        {!previewResult.country_enabled && (
                          <span className="rounded-[6px] bg-[#fef3c7] px-2 py-[2px] text-[10.5px] font-bold text-[#92400e]">
                            market disabled
                          </span>
                        )}
                      </div>

                      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#8A8592]">Rule applied</dt>
                          <dd className="font-bold text-[#111827]">{PRICE_SOURCE[previewResult.source] ?? previewResult.source}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#8A8592]">Converted from USD</dt>
                          <dd className="font-bold text-[#111827]">{previewResult.is_converted ? "Yes" : "No"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#8A8592]">USD base</dt>
                          <dd className="font-bold text-[#111827]">
                            {previewResult.base_usd !== null ? `$${Number(previewResult.base_usd).toFixed(2)}` : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#8A8592]">Pricing mode</dt>
                          <dd className="font-bold text-[#111827] capitalize">{pricingMode}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </Card>

                {/* ── Cache ── */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Pricing cache</h2>
                  <p className={cardSub}>
                    Prices are cached per country for 5 minutes and cleared automatically on every
                    save — so this is a repair tool, not part of the normal flow.
                  </p>
                  <button type="button" onClick={() => flushCache.mutate()} disabled={flushCache.isPending}
                          className="mt-3 flex items-center gap-1.5 rounded-[9px] border border-[#e5e7eb] bg-white px-3.5 py-2 text-[12.5px] font-bold text-[#374151] transition hover:bg-[#fafafa] disabled:opacity-50">
                    <RotateCcw size={13} /> {flushCache.isPending ? "Clearing…" : "Clear pricing cache"}
                  </button>
                  <p className="mt-2.5 text-[11px] leading-snug text-[#9ca3af]">
                    Use it if a price was changed directly in the database, or a deploy left a stale
                    counter behind. Worst case is one uncached read per market.
                  </p>
                </Card>

                {/* ── Identity ── */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Plan identity</h2>
                  <p className={cardSub}>Fields that cannot be edited, and why.</p>
                  <dl className="mt-3 space-y-2 text-[12.5px]">
                    <div className="flex items-start justify-between gap-4 border-b border-[#f4f2f5] pb-2">
                      <dt className="text-[#8A8592]">Plan key</dt>
                      <dd className="text-right">
                        <code className="font-mono font-bold text-[#111827]">{plan.key}</code>
                        <span className="mt-0.5 block text-[10.5px] text-[#9ca3af]">
                          Immutable — subscriptions reference it, so renaming would reassign what
                          existing subscribers are on.
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#f4f2f5] pb-2">
                      <dt className="text-[#8A8592]">Internal ID</dt>
                      <dd className="font-mono font-bold text-[#111827]">{plan.id}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[#8A8592]">Sellable in app</dt>
                      <dd className="font-bold text-[#111827]">
                        {plan.sellable ? "Yes — store product configured" : "No — no store product id"}
                      </dd>
                    </div>
                  </dl>
                </Card>

                {/* ── Store-controlled ──
                    Kept as an explanation rather than switches: these really are
                    decided by Apple, Google and Stripe, and a toggle here would
                    imply control the backend does not have. */}
                <Card className="p-6">
                  <h2 className="text-[16px] font-black text-[#111827]">Decided outside Teezer</h2>
                  <p className={cardSub}>These exist, but not as settings on this record.</p>
                  <ul className="mt-3 space-y-2.5 text-[12px] leading-snug text-[#6b7280]">
                    <li className="flex items-start gap-2">
                      <Lock size={13} className="mt-[2px] flex-none text-[#c9c5d0]" />
                      <span>
                        <b className="text-[#111827]">Proration</b> on upgrades is applied by the
                        store or by Stripe using their own rules.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Lock size={13} className="mt-[2px] flex-none text-[#c9c5d0]" />
                      <span>
                        <b className="text-[#111827]">In-app prices</b> come from App Store Connect
                        and the Play Console. Country pricing here governs web and card checkout only.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check size={13} className="mt-[2px] flex-none text-[#16a34a]" />
                      <span>
                        <b className="text-[#111827]">Grandfathering</b> IS yours — it is the
                        &ldquo;Existing subscriber behaviour&rdquo; setting on the Availability tab.
                      </span>
                    </li>
                  </ul>
                </Card>
              </>
            )}
          </div>

          {/* ══ Sidebar ══ */}
          <div className="space-y-4">
            {/* ── Plan Summary ── */}
            <Card className="p-6">
              <div className="mb-4 flex items-start justify-between">
                <h2 className="text-[15px] font-black text-[#111827]">Plan Summary</h2>
                <span className={`rounded-[6px] px-2 py-[3px] text-[10px] font-bold ${f.is_enabled ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
                  {f.is_enabled ? "Active" : "Hidden"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] ${PLAN_TINT[plan.key] ?? "bg-[#f4f2f5] text-[#111827]"}`}>
                  {plan.icon_url
                    ? <img src={plan.icon_url} alt="" className="h-7 w-7 object-contain" />
                    : <Glyph size={23} strokeWidth={2.1} />}
                </div>
                <div className="min-w-0">
                  <p className="text-[17px] font-black text-[#111827]">{f.name || plan.name}</p>
                  <code className="block font-mono text-[11px] text-[#9ca3af]">{plan.key}</code>
                </div>
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-[#8A8592]">
                {f.tagline || "No description"}
              </p>

              <ul className="mt-4 space-y-2.5 text-[11.5px] text-[#4b5563]">
                <li className="flex items-start gap-2">
                  <Globe size={13} className="mt-[1px] flex-none text-[#2563eb]" />
                  Visible on: Web{f.android_product_id ? ", Android" : ""}{f.ios_product_id ? ", iOS" : ""}
                </li>
                <li className="flex items-start gap-2">
                  <DollarSign size={13} className="mt-[1px] flex-none text-[#16a34a]" />
                  {f.base_price_usd ? `Base price: $${f.base_price_usd} USD` : "No USD base price"}
                </li>
                <li className="flex items-start gap-2">
                  <Check size={13} className="mt-[1px] flex-none text-[#16a34a]" />
                  {/* x / y, so "7 features" cannot be mistaken for "all of
                      them" when the catalog holds more. */}
                  {included.length} / {allFeatures.length} features included
                </li>
                <li className="flex items-start gap-2">
                  <Globe size={13} className="mt-[1px] flex-none text-[#0284c7]" />
                  {f.countries_mode === "all"
                    ? "All countries"
                    : `${(f.countries as string[]).length} ${f.countries_mode === "include" ? "allowed" : "excluded"} countries`}
                </li>
                {!!f.badge_label && (
                  <li className="flex items-start gap-2">
                    <Medal size={13} className="mt-[1px] flex-none text-[#d97706]" />
                    {f.badge_label}
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <Building2 size={13} className="mt-[1px] flex-none text-[#7c3aed]" />
                  Priority: {f.sort || "0"}
                </li>
              </ul>

              <button
                type="button"
                onClick={() => setTab("analytics")}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white py-2.5 text-[12.5px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
              >
                <BarChart3 size={14} /> View Plan Analytics
              </button>
            </Card>

            {/* ── Feature Groups ──
                Counted from the live form state, not from the API response, so
                toggling a feature updates the count immediately instead of
                after a save. */}
            {tab === "features" && (
              <Card className="p-6">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[15px] font-black text-[#111827]">Feature Groups</h2>
                    <p className="mt-0.5 text-[11px] text-[#8A8592]">Organize features into groups.</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {Object.entries(FEATURE_GROUPS).map(([key, name]) => {
                    const n = included.filter((x) => x.group_key === key).length;
                    const total = allFeatures.filter((x) => x.group_key === key).length;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setFeatureCat(featureCat === key ? "" : key); setTab("features"); }}
                        className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition ${
                          featureCat === key ? "bg-[#fff5f7]" : "hover:bg-[#fafafa]"
                        }`}
                      >
                        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${featureTint(key)}`}>
                          <Sparkles size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-[#111827]">{name}</span>
                          <span className="block text-[10.5px] text-[#8A8592]">{total} available</span>
                        </span>
                        <span className="rounded-[6px] bg-[#f4f2f5] px-1.5 py-[2px] text-[11px] font-bold text-[#374151]">
                          {n}
                        </span>
                        <ChevronRight size={13} className="flex-none text-[#c9c5d0]" />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10.5px] leading-snug text-[#9ca3af]">
                  Group membership is a property of the feature itself, so two plans can never file
                  the same feature under different headings.
                </p>
              </Card>
            )}

            {/* ── Quick Stats ──
                Counted from real subscriptions. Conversion and refund rate have
                no data source at all - there is no plan-impression or refund
                table - so they read "—" rather than a number that would look
                authoritative and be invented. Zero here is real; a dash means
                "not measured", and the two must not look the same. */}
            <Card className="p-6">
              <h2 className="mb-4 text-[15px] font-black text-[#111827]">
                Quick Stats <span className="text-[11px] font-semibold text-[#9ca3af]">(Real-time)</span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[12px] border border-[#eceaf0] p-3 text-center">
                  <Users size={16} className="mx-auto text-[#4338ca]" />
                  <p className="mt-1.5 text-[19px] font-black leading-none text-[#111827]">
                    {(per?.subscribers ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[10.5px] text-[#9ca3af]">Subscribers</p>
                </div>
                <div className="rounded-[12px] border border-[#eceaf0] p-3 text-center">
                  <DollarSign size={16} className="mx-auto text-[#16a34a]" />
                  <p className="mt-1.5 text-[19px] font-black leading-none text-[#111827]">
                    {money(per?.revenue ?? 0)}
                  </p>
                  <p className="mt-1 text-[10.5px] text-[#9ca3af]">Total Revenue</p>
                </div>
                <div className="rounded-[12px] border border-[#eceaf0] p-3 text-center">
                  <TrendingUp size={16} className="mx-auto text-[#0ea5e9]" />
                  <p className="mt-1.5 text-[19px] font-black leading-none text-[#c9c5d0]">—</p>
                  <p className="mt-1 text-[10.5px] text-[#9ca3af]">Conversion Rate</p>
                </div>
                <div className="rounded-[12px] border border-[#eceaf0] p-3 text-center">
                  <Undo2 size={16} className="mx-auto text-[#d97706]" />
                  <p className="mt-1.5 text-[19px] font-black leading-none text-[#c9c5d0]">—</p>
                  <p className="mt-1 text-[10.5px] text-[#9ca3af]">Refund Rate</p>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-snug text-[#9ca3af]">
                <BarChart3 size={12} className="mt-[1px] flex-none" />
                Subscribers and revenue are counted from real subscriptions. Conversion and refund
                rate show a dash because nothing records plan impressions or refunds yet.
              </p>
            </Card>

            {/* ── Plan Actions ── */}
            <Card className="p-6">
              <h2 className="mb-3 text-[15px] font-black text-[#111827]">Plan Actions</h2>
              <div className="space-y-1">
                {/* Duplicate and Archive have no endpoint. Shown because they are
                    part of the design, disabled because clicking them would do
                    nothing and a dead button that looks live is a bug report. */}
                <button
                  type="button"
                  disabled
                  title="No duplicate endpoint yet."
                  className="flex w-full cursor-not-allowed items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left opacity-50"
                >
                  <Copy size={16} className="mt-[2px] flex-none text-[#6b7280]" />
                  <span>
                    <span className="block text-[12.5px] font-bold text-[#111827]">Duplicate Plan</span>
                    <span className="block text-[11px] text-[#8A8592]">Create a copy of this plan</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => set("is_enabled", false)}
                  className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition hover:bg-[#fafafa]"
                >
                  <Archive size={16} className="mt-[2px] flex-none text-[#6b7280]" />
                  <span>
                    <span className="block text-[12.5px] font-bold text-[#111827]">Archive Plan</span>
                    <span className="block text-[11px] text-[#8A8592]">Hide it from sale — save to apply</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${plan.name}"? If anyone is subscribed it is disabled instead of removed.`)) {
                      remove.mutate();
                    }
                  }}
                  disabled={remove.isPending}
                  className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition hover:bg-[#fef2f2] disabled:opacity-60"
                >
                  <Trash2 size={16} className="mt-[2px] flex-none text-[#dc2626]" />
                  <span>
                    <span className="block text-[12.5px] font-bold text-[#dc2626]">Delete Plan</span>
                    <span className="block text-[11px] text-[#8A8592]">Permanently delete this plan</span>
                  </span>
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
