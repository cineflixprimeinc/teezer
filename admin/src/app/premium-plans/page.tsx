"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Apple, BarChart3, Calendar, Copy, DollarSign, Globe,
  Layers, Pencil, Rocket, Search, Smartphone, TrendingUp, Users, X, Zap,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { api, apiMessage } from "@/services/api";

/**
 * Monetization → Premium Subscription.
 *
 * EVERY FIGURE HERE IS COUNTED from the database - subscribers, revenue,
 * per-plan splits, countries. None are illustrative. With no subscribers yet
 * most read zero, and a true zero is worth more than a placeholder: an admin
 * who cannot trust one number on a dashboard trusts none of them.
 *
 * Two guards the editor keeps:
 *  - `key` is shown but never editable. Subscriptions reference it, so renaming
 *    one would reassign what existing subscribers are on.
 *  - App price is one nullable column, not a mode flag. Null means "same as
 *    web" and cannot drift; the toggle clears it rather than writing 0.
 */

type Plan = {
  id: number;
  key: string;
  name: string;
  tagline: string | null;
  base_price_usd: number | null;
  app_price_usd: number | null;
  separate_app_price: boolean;
  price: number;
  currency: string;
  period: string;
  features: string[];
  is_popular: boolean;
  badge_label: string | null;
  is_default: boolean;
  theme: string;
  ios_product_id: string | null;
  android_product_id: string | null;
  sort: number;
  is_enabled: boolean;
  sellable: boolean;
};

type Stats = {
  total_plans: number; live_plans: number; sellable_plans: number; priced_plans: number;
  active_subscribers: number; new_this_month: number;
  revenue_month: number; revenue_year: number; cancelled_month: number;
  supported_countries: number; supported_currencies: number;
  per_plan: Record<string, { subscribers: number; revenue: number }>;
  by_platform: Record<string, number>;
  recent: {
    id: number; plan_key: string | null; plan: string; price: number; currency: string;
    platform: string; username: string | null; name: string | null; avatar: string | null;
    started_at: string | null;
  }[];
  top_countries: { country: string; count: number }[];
};

const PLAN_ICON: Record<string, React.ElementType> = { starter: Rocket, pro: Zap, studio: Layers };
const PLAN_TINT: Record<string, string> = {
  starter: "bg-[#ffe9ef] text-[#fe2c55]",
  pro: "bg-[#f3e8ff] text-[#7c3aed]",
  studio: "bg-[#17151b] text-white",
};

const PLATFORM_LABEL: Record<string, string> = { web: "Web", ios: "iOS", android: "Android" };
const PLATFORM_COLOR: Record<string, string> = { web: "#3b82f6", ios: "#6b7280", android: "#22c55e" };

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "block text-[11px] font-bold uppercase tracking-wide text-[#8A8592]";
const hint = "mt-1 block text-[10.5px] font-normal normal-case leading-snug text-[#9ca3af]";

/* ── Stat tile ─────────────────────────────────────────────────────────── */

function Stat({
  icon: Icon, tint, label: text, value, hint: sub, alert,
}: {
  icon: React.ElementType; tint: string; label: string; value: string; hint?: string; alert?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-[11px] ${tint}`}>
          <Icon size={18} strokeWidth={2.1} />
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-[#8A8592]">{text}</p>
          <p className={`mt-0.5 text-[20px] font-black tracking-[-0.02em] ${alert ? "text-[#b45309]" : "text-[#111827]"}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

/* ── Donut ─────────────────────────────────────────────────────────────── */

/** Plain SVG rather than a chart library: three arcs and a total. */
function Donut({ data, total }: { data: [string, number][]; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg viewBox="0 0 140 140" className="h-[150px] w-[150px] -rotate-90">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#f1eff3" strokeWidth="17" />
      {total > 0 &&
        data.map(([k, n]) => {
          const len = (n / total) * C;
          const el = (
            <circle
              key={k} cx="70" cy="70" r={R} fill="none"
              stroke={PLATFORM_COLOR[k] ?? "#9ca3af"} strokeWidth="17"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
}

/* ── Plan row ──────────────────────────────────────────────────────────── */

function PlanRow({ plan, subs, revenue }: { plan: Plan; subs: number; revenue: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const Glyph = PLAN_ICON[plan.key] ?? Layers;

  const [f, setF] = useState({
    name: plan.name,
    tagline: plan.tagline ?? "",
    base_price_usd: plan.base_price_usd?.toString() ?? "",
    app_price_usd: plan.app_price_usd?.toString() ?? "",
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
  });

  const patch = (body: Record<string, unknown>) => api.put(`/admin/premium-plans/${plan.id}`, body);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["premium-plans"] });
    qc.invalidateQueries({ queryKey: ["premium-plan-stats"] });
  };

  const save = useMutation({
    mutationFn: () =>
      patch({
        name: f.name.trim(),
        tagline: f.tagline.trim() || null,
        // Blank clears to null rather than 0, which would read as "free".
        base_price_usd: f.base_price_usd.trim() === "" ? null : parseFloat(f.base_price_usd),
        // Null re-links the app to the web price - that is what the toggle does.
        app_price_usd: !f.separate || f.app_price_usd.trim() === "" ? null : parseFloat(f.app_price_usd),
        price: parseFloat(f.price) || 0,
        currency: f.currency.trim().toUpperCase(),
        period: f.period,
        features: f.features.split("\n").map((x) => x.trim()).filter(Boolean),
        badge_label: f.badge_label.trim() || null,
        ios_product_id: f.ios_product_id.trim() || null,
        android_product_id: f.android_product_id.trim() || null,
        sort: parseInt(f.sort, 10) || 0,
        is_popular: f.is_popular,
        is_default: f.is_default,
        is_enabled: f.is_enabled,
        theme: f.theme,
      }),
    onSuccess: () => { setErr(null); refresh(); setOpen(false); },
    onError: (e) => setErr(apiMessage(e)),
  });

  /** The status switch writes immediately - it is one boolean, not a form. */
  const toggle = useMutation({
    mutationFn: (on: boolean) => patch({ is_enabled: on }),
    onSuccess: refresh,
  });

  return (
    <>
      <tr className="border-b border-[#f6f4f7] align-top">
        <td className="px-5 py-4">
          <div className="flex gap-3">
            <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-[12px] ${PLAN_TINT[plan.key] ?? "bg-[#f4f2f5] text-[#111827]"}`}>
              <Glyph size={19} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-black text-[#111827]">{plan.name}</span>
                {plan.is_popular && (
                  <span className="rounded-[6px] bg-[#ffe9ef] px-1.5 py-[2px] text-[9.5px] font-black text-[#fe2c55]">
                    {plan.badge_label ?? "MOST POPULAR"}
                  </span>
                )}
                {plan.is_default && (
                  <span className="rounded-[6px] bg-[#eef2ff] px-1.5 py-[2px] text-[9.5px] font-black text-[#4338ca]">
                    DEFAULT
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="rounded-[5px] bg-[#f6f4f7] px-1.5 py-[1px] font-mono text-[10.5px] text-[#6b7280]">
                  {plan.key}
                </code>
                <span className={`rounded-[5px] px-1.5 py-[1px] text-[9.5px] font-bold ${plan.is_enabled ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
                  {plan.is_enabled ? "Active" : "Hidden"}
                </span>
              </div>
              {plan.tagline && <p className="mt-1 text-[11.5px] text-[#8A8592]">{plan.tagline}</p>}
            </div>
          </div>
        </td>

        <td className="px-5 py-4">
          {plan.base_price_usd !== null ? (
            <>
              <p className="text-[15px] font-black text-[#111827]">
                ${plan.base_price_usd}
                <span className="ml-1 text-[11px] font-medium text-[#9ca3af]">/ {plan.period}</span>
              </p>
              {plan.separate_app_price && plan.app_price_usd !== null ? (
                <p className="mt-0.5 text-[12px] font-bold text-[#4338ca]">
                  ${plan.app_price_usd}
                  <span className="ml-1 text-[10.5px] font-medium text-[#9ca3af]">in app</span>
                </p>
              ) : (
                <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">app same as web</p>
              )}
              <span className="mt-1.5 inline-block rounded-[6px] bg-[#e9fbef] px-2 py-[2px] text-[9.5px] font-bold text-[#15803d]">
                USD BASE PRICE
              </span>
            </>
          ) : (
            <span className="text-[12px] font-bold text-[#b45309]">No USD price</span>
          )}
        </td>

        {/* A store id is what makes a platform real, not a wish. */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span title="Website - always available" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
              <Globe size={13} />
            </span>
            <span
              title={plan.android_product_id ? `Play: ${plan.android_product_id}` : "No Play product id"}
              className={`flex h-7 w-7 items-center justify-center rounded-full ${plan.android_product_id ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#c9c5d0]"}`}
            >
              <Smartphone size={13} />
            </span>
            <span
              title={plan.ios_product_id ? `App Store: ${plan.ios_product_id}` : "No App Store product id"}
              className={`flex h-7 w-7 items-center justify-center rounded-full ${plan.ios_product_id ? "bg-[#e5e7eb] text-[#111827]" : "bg-[#f3f4f6] text-[#c9c5d0]"}`}
            >
              <Apple size={13} />
            </span>
          </div>
          {!plan.sellable && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#b45309]">
              <AlertTriangle size={10} /> web only
            </p>
          )}
        </td>

        <td className="px-5 py-4">
          <p className="text-[15px] font-black text-[#111827]">{subs.toLocaleString()}</p>
          <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">active subscribers</p>
        </td>

        <td className="px-5 py-4">
          <p className="text-[15px] font-black text-[#111827]">{money(revenue)}</p>
          <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">charged to date</p>
        </td>

        <td className="px-5 py-4">
          <button
            onClick={() => toggle.mutate(!plan.is_enabled)}
            disabled={toggle.isPending}
            aria-label={plan.is_enabled ? "Hide plan" : "Show plan"}
            className={`relative h-[22px] w-[40px] rounded-full transition ${plan.is_enabled ? "bg-[#fe2c55]" : "bg-[#d9d6dd]"} disabled:opacity-60`}
          >
            <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${plan.is_enabled ? "left-[21px]" : "left-[3px]"}`} />
          </button>
        </td>

        <td className="px-5 py-4">
          <div className="flex items-center gap-1">
            {/* Full editor is its own page: five groups of settings and a
                summary do not fit in a table row. */}
            <Link href={`/premium-plans/${plan.id}/edit`} title="Edit plan"
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#e5e7eb] text-[#111827] transition hover:bg-[#fafafa]">
              <Pencil size={14} />
            </Link>
            <button onClick={() => navigator.clipboard?.writeText(plan.key)} title="Copy plan key"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] transition hover:bg-[#fafafa]">
              <Copy size={14} />
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-[#f1eff3]">
          <td colSpan={7} className="bg-[#fcfbfd] px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Name</span>
                <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </label>
              <label className="block">
                <span className={label}>Tagline</span>
                <input className={input} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
              </label>
            </div>

            <div className="mt-4 rounded-[12px] border border-[#e9fbef] bg-[#f6fefa] p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#15803d]">
                <DollarSign size={13} /> Pricing
              </p>
              <p className="mb-3 text-[11px] leading-snug text-[#6b7280]">
                Entered in <strong>USD only</strong>. Every other currency is converted per request
                from live rates and rounded to that market&apos;s rule; a country with no rate is
                quoted the USD price rather than shown an error.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Website price (USD)</span>
                  <input className={input} inputMode="decimal" placeholder="4.99"
                         value={f.base_price_usd}
                         onChange={(e) => setF({ ...f, base_price_usd: e.target.value })} />
                  <span className={hint}>Charged by Stripe and PayPal. Also the app default.</span>
                </label>
                <label className="block">
                  <span className={label}>App price (USD)</span>
                  <input
                    className={`${input} ${!f.separate ? "bg-[#f6f4f7] text-[#9ca3af]" : ""}`}
                    inputMode="decimal" disabled={!f.separate}
                    placeholder={f.separate ? "6.99" : f.base_price_usd || "same as website"}
                    value={f.separate ? f.app_price_usd : ""}
                    onChange={(e) => setF({ ...f, app_price_usd: e.target.value })}
                  />
                  <span className={hint}>
                    {f.separate ? "Often higher to absorb the store's 15-30% cut." : "Linked to the website price."}
                  </span>
                </label>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2.5">
                <input type="checkbox" className="mt-[2px] h-4 w-4 accent-[#fe2c55]"
                       checked={f.separate}
                       onChange={(e) => setF({ ...f, separate: e.target.checked })} />
                <span className="text-[12px] leading-snug text-[#111827]">
                  <span className="font-bold">Charge a different price in the app</span>
                  <span className="mt-0.5 block text-[11px] text-[#6b7280]">
                    Off means both use the website price. Turning it off clears the app price
                    rather than leaving a stale number behind.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 rounded-[12px] border border-[#eef2ff] bg-[#fafbff] p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#4338ca]">
                <Smartphone size={13} /> Store products
              </p>
              <p className="mb-3 text-[11px] leading-snug text-[#6b7280]">
                Apple and Google set their own local prices from these products — the app shows the
                store&apos;s price, not the one above. Without an id the tier is web-only.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>iOS product id</span>
                  <input className={input} placeholder="com.teezer.premium.pro"
                         value={f.ios_product_id}
                         onChange={(e) => setF({ ...f, ios_product_id: e.target.value })} />
                </label>
                <label className="block">
                  <span className={label}>Android product id</span>
                  <input className={input} placeholder="premium_pro_monthly"
                         value={f.android_product_id}
                         onChange={(e) => setF({ ...f, android_product_id: e.target.value })} />
                </label>
              </div>
            </div>

            <label className="mt-4 block">
              <span className={label}>
                Features{" "}
                <span className="text-[#b0acb8]">
                  · {f.features.split("\n").filter((x) => x.trim()).length} listed
                </span>
              </span>
              <textarea rows={5} className={`${input} font-mono text-[12px] leading-relaxed`}
                        value={f.features}
                        onChange={(e) => setF({ ...f, features: e.target.value })} />
              <span className={hint}>One per line. Rendered as the ticked rows on the plan card.</span>
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={label}>Billing period</span>
                <select className={input} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </label>
              <label className="block">
                <span className={label}>Card theme</span>
                <select className={input} value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="block">
                <span className={label}>Sort order</span>
                <input className={input} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 rounded-[12px] border border-[#eceaf0] bg-white px-4 py-3">
              {([
                ["is_enabled", "Visible on the premium page"],
                ["is_popular", "Highlight as most popular"],
                ["is_default", "Pre-selected when the page opens"],
              ] as const).map(([k, text]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#111827]">
                  <input type="checkbox" className="h-4 w-4 accent-[#fe2c55]"
                         checked={f[k] as boolean}
                         onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
                  {text}
                </label>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button onClick={() => save.mutate()} disabled={save.isPending}
                      className="rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e0243d] disabled:opacity-60">
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setOpen(false)}
                      className="rounded-[10px] border border-[#e5e7eb] px-4 py-2.5 text-[13px] font-bold text-[#6b7280] transition hover:bg-[#fafafa]">
                Cancel
              </button>
              {err && <span className="text-[12px] font-semibold text-[#dc2626]">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function PremiumPlansPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["premium-plans"],
    queryFn: () => api.get("/admin/premium-plans").then((r) => r.data.data as Plan[]),
  });
  const { data: stats } = useQuery({
    queryKey: ["premium-plan-stats"],
    queryFn: () => api.get("/admin/premium-plans/stats").then((r) => r.data.data as Stats),
  });

  const plans = useMemo(() => data ?? [], [data]);
  const shown = useMemo(
    () =>
      plans.filter((p) => {
        if (status === "active" && !p.is_enabled) return false;
        if (status === "hidden" && p.is_enabled) return false;
        const t = q.trim().toLowerCase();
        return !t || p.name.toLowerCase().includes(t) || p.key.toLowerCase().includes(t);
      }),
    [plans, q, status],
  );

  const platformEntries = Object.entries(stats?.by_platform ?? {}) as [string, number][];
  const platformTotal = platformEntries.reduce((a, [, n]) => a + n, 0);
  const topCountryMax = Math.max(1, ...(stats?.top_countries ?? []).map((c) => c.count));

  return (
    <AdminShell title="Premium Subscription">
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-black tracking-[-0.02em] text-[#111827]">Premium Subscription</h1>
          <p className="mt-1 text-[13px] text-[#8A8592]">
            Manage all subscription plans, pricing, features and availability for your app &amp; website.
          </p>
        </div>

        {/* Counted, not illustrative. Zeros here are real. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat icon={Calendar} tint="bg-[#ffe9ef] text-[#fe2c55]" label="Total plans"
                value={String(stats?.total_plans ?? plans.length)} hint={`${stats?.live_plans ?? 0} active`} />
          <Stat icon={Users} tint="bg-[#eef2ff] text-[#4338ca]" label="Active subscribers"
                value={(stats?.active_subscribers ?? 0).toLocaleString()}
                hint={`+${stats?.new_this_month ?? 0} this month`} />
          <Stat icon={DollarSign} tint="bg-[#e9fbef] text-[#16a34a]" label="Monthly revenue"
                value={money(stats?.revenue_month ?? 0)} hint="charged, not projected" />
          <Stat icon={TrendingUp} tint="bg-[#fff7ed] text-[#ea580c]" label="Annual revenue"
                value={money(stats?.revenue_year ?? 0)} hint="charged, not projected" />
          <Stat icon={BarChart3} tint="bg-[#f3e8ff] text-[#7c3aed]" label="Purchasable in app"
                value={`${stats?.sellable_plans ?? 0} of ${stats?.total_plans ?? plans.length}`}
                hint="have a store product id" alert={(stats?.sellable_plans ?? 0) === 0} />
          <Stat icon={Globe} tint="bg-[#eff6ff] text-[#2563eb]" label="Supported countries"
                value={String(stats?.supported_countries ?? 0)}
                hint={`${stats?.supported_currencies ?? 0} currencies`} />
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1eff3] px-5 py-4">
            <h2 className="text-[15px] font-black text-[#111827]">Subscription Plans</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                      className="rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] text-[#111827] outline-none">
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="hidden">Hidden</option>
              </select>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans…"
                       className="w-[190px] rounded-[10px] border border-[#e5e7eb] py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-[#fe2c55]" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[#f1eff3] bg-[#fcfbfd]">
                  {["Plan details", "Pricing (USD)", "Platforms", "Subscribers", "Revenue", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[10.5px] font-black uppercase tracking-wide text-[#8A8592]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <PlanRow key={p.id} plan={p}
                           subs={stats?.per_plan?.[p.key]?.subscribers ?? 0}
                           revenue={stats?.per_plan?.[p.key]?.revenue ?? 0} />
                ))}
              </tbody>
            </table>
          </div>

          {isLoading && <p className="px-5 py-10 text-center text-[13px] text-[#8A8592]">Loading plans…</p>}
          {isError && <p className="px-5 py-10 text-center text-[13px] text-[#dc2626]">Couldn&apos;t load plans.</p>}
          {!isLoading && shown.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-[#8A8592]">No plans match.</p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="text-[14px] font-black text-[#111827]">Recent subscriptions</h3>
            <div className="mt-3 space-y-3">
              {(stats?.recent ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <div className="h-9 w-9 flex-none overflow-hidden rounded-full bg-[#f1eff3]">
                    {r.avatar && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-[#111827]">
                      {(r.plan_key ?? r.plan)} · {PLATFORM_LABEL[r.platform] ?? r.platform}
                    </p>
                    <p className="truncate text-[11px] text-[#8A8592]">
                      {r.username ? `@${r.username}` : "unknown user"}
                    </p>
                  </div>
                  <span className="text-[12.5px] font-black text-[#16a34a]">
                    {r.currency} {r.price}
                  </span>
                </div>
              ))}
              {(stats?.recent?.length ?? 0) === 0 && (
                <p className="py-8 text-center text-[12px] text-[#9ca3af]">
                  No subscriptions yet — nothing has been sold.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-[14px] font-black text-[#111827]">Subscription by platform</h3>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative flex-none">
                <Donut data={platformEntries} total={platformTotal} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[18px] font-black text-[#111827]">{platformTotal.toLocaleString()}</span>
                  <span className="text-[10px] text-[#9ca3af]">total</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {platformEntries.map(([k, n]) => (
                  <div key={k} className="flex items-center gap-2 text-[11.5px]">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: PLATFORM_COLOR[k] ?? "#9ca3af" }} />
                    <span className="flex-1 font-semibold text-[#111827]">{PLATFORM_LABEL[k] ?? k}</span>
                    <span className="text-[#8A8592]">
                      {n} ({platformTotal ? Math.round((n / platformTotal) * 100) : 0}%)
                    </span>
                  </div>
                ))}
                {platformTotal === 0 && (
                  <p className="text-[12px] text-[#9ca3af]">No active subscriptions to split.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-[14px] font-black text-[#111827]">Top countries</h3>
            <div className="mt-3 space-y-3">
              {(stats?.top_countries ?? []).map((c) => (
                <div key={c.country}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[#111827]">{c.country}</span>
                    <span className="text-[#8A8592]">{c.count.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f1eff3]">
                    <div className="h-full rounded-full bg-[#fe2c55]"
                         style={{ width: `${(c.count / topCountryMax) * 100}%` }} />
                  </div>
                </div>
              ))}
              {(stats?.top_countries?.length ?? 0) === 0 && (
                <p className="py-8 text-center text-[12px] text-[#9ca3af]">
                  No subscriber countries yet.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
