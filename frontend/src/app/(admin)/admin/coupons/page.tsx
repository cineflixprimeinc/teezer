"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, ChevronLeft, ChevronRight, ChevronRight as Crumb, Download,
  Gem, Info, MoreHorizontal, Percent, Plus, Search, SlidersHorizontal, Users,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { api, apiMessage } from "@/admin-panel/services/api";

/**
 * Monetization → Coupons & Offers.
 *
 * The definitions the public checkout validates against. Status is NOT stored -
 * the API derives it (active / inactive / expired / exhausted) in CouponService,
 * so this page and the customer-facing message can never disagree about what
 * "expired" means. Nothing here recomputes it.
 */

type Coupon = {
  id: number; code: string; name: string; description: string | null;
  type: "percentage" | "fixed"; value: number; currency: string | null;
  applicable_plans: string[]; usage_limit: number | null; per_user_limit: number | null;
  used_count: number; min_amount: number | null;
  valid_from: string | null; valid_until: string | null;
  is_active: boolean; status: "active" | "inactive" | "expired" | "exhausted";
  created_at: string | null;
};

type Plan = { id: number; key: string; name: string };

const PAGE_SIZE = 8;

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";
const hint = "mt-1.5 block text-[11px] leading-snug text-[#9ca3af]";

const STATUS_TINT: Record<string, string> = {
  active: "bg-[#16a34a]",
  inactive: "bg-[#9ca3af]",
  expired: "bg-[#9ca3af]",
  exhausted: "bg-[#d97706]",
};

const PLAN_TINT: Record<string, string> = {
  starter: "bg-[#dcfce7] text-[#15803d]",
  pro: "bg-[#f3e8ff] text-[#7c3aed]",
  studio: "bg-[#e0f2fe] text-[#0284c7]",
};

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const shortDate = (iso: string | null) => {
  if (!iso) return "No Expiry";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** datetime -> the value <input type="date"> wants, in LOCAL time. */
const toDateInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function StatCard({ icon: Icon, tint, value, title, sub }: {
  icon: React.ElementType; tint: string; value: string; title: string; sub: string;
}) {
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-[12px] ${tint}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold text-[#8A8592]">{title}</span>
        <span className="block text-[21px] font-black leading-tight text-[#111827]">{value}</span>
        <span className="block text-[10.5px] text-[#9ca3af]">{sub}</span>
      </span>
    </Card>
  );
}

export default function CouponsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["coupons", q, status, type, planKey],
    queryFn: () =>
      api.get("/admin/coupons", { params: { q, status, type, plan: planKey } })
        .then((r) => r.data.data as { coupons: Coupon[]; stats: Record<string, number> }),
  });
  const { data: plans } = useQuery({
    queryKey: ["premium-plans"],
    queryFn: () => api.get("/admin/premium-plans").then((r) => r.data.data as Plan[]),
  });

  const coupons = data?.coupons ?? [];
  const stats = data?.stats;

  const pageRows = useMemo(
    () => coupons.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [coupons, page],
  );
  const pageCount = Math.max(1, Math.ceil(coupons.length / PAGE_SIZE));

  const blank = {
    code: "", name: "", type: "percentage", value: "", applicable_plans: [] as string[],
    usage_limit: "", valid_until: "", no_expiry: false, is_active: true, currency: "USD",
  };
  const [form, setForm] = useState<Record<string, any>>(blank);
  const setF = (k: string, v: unknown) => setForm({ ...form, [k]: v });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        code: String(form.code).trim().toUpperCase(),
        name: String(form.name).trim(),
        type: form.type,
        value: parseFloat(form.value) || 0,
        // Empty means "every plan", which the API stores as null. Sending []
        // would read as "applies to no plan" and break every checkout.
        applicable_plans: form.applicable_plans.length ? form.applicable_plans : null,
        usage_limit: String(form.usage_limit).trim() === "" ? null : parseInt(form.usage_limit, 10),
        valid_until: form.no_expiry ? null : (form.valid_until || null),
        is_active: form.is_active,
        // A percentage has no currency; the API clears it anyway, this just
        // avoids sending a value that would be discarded.
        currency: form.type === "fixed" ? form.currency : null,
      };
      return editing
        ? api.put(`/admin/coupons/${editing.id}`, body)
        : api.post("/admin/coupons", body);
    },
    onSuccess: () => {
      setErr(null);
      setForm(blank);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/coupons/${id}`),
    onSuccess: (r: any) => {
      setMenuFor(null);
      // The API deactivates instead of deleting once a coupon has been
      // redeemed - surfaced so the row not disappearing is explained.
      if (r?.data?.message) setErr(r.data.message);
      qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const startEdit = (c: Coupon) => {
    setEditing(c);
    setMenuFor(null);
    setForm({
      code: c.code, name: c.name, type: c.type, value: String(c.value),
      applicable_plans: c.applicable_plans, usage_limit: c.usage_limit?.toString() ?? "",
      valid_until: toDateInput(c.valid_until), no_expiry: !c.valid_until,
      is_active: c.is_active, currency: c.currency ?? "USD",
    });
  };

  return (
    <AdminShell title="Coupons & Offers">
      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <nav className="flex items-center gap-1.5 text-[11.5px] text-[#8A8592]">
              <Link href="/admin/premium-plans" className="hover:text-[#fe2c55]">Subscription Plans</Link>
              <Crumb size={12} />
              <span className="font-semibold text-[#111827]">Coupons &amp; Offers</span>
            </nav>
            <h1 className="mt-1.5 text-[26px] font-black tracking-[-0.02em] text-[#111827]">
              Coupons &amp; Offers
            </h1>
            <p className="mt-1 text-[13px] text-[#8A8592]">
              Create and manage discount coupons for subscription plans.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href={`${api.defaults.baseURL ?? ""}/admin/coupons/export`}
              className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
            >
              <Download size={15} /> Export
            </a>
            <button
              onClick={() => { setEditing(null); setForm(blank); }}
              className="flex items-center gap-1.5 rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e0243d]"
            >
              <Plus size={15} /> Create Coupon
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] font-semibold text-[#dc2626]">
            {err}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {/* ── Stat cards. Counted by the API from real rows. ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={Gem} tint="bg-[#dcfce7] text-[#16a34a]"
                        value={(stats?.total ?? 0).toLocaleString()} title="Total Coupons" sub="All time" />
              <StatCard icon={Users} tint="bg-[#f3e8ff] text-[#7c3aed]"
                        value={(stats?.active ?? 0).toLocaleString()} title="Active Coupons" sub="Currently active" />
              <StatCard icon={CalendarDays} tint="bg-[#e0f2fe] text-[#0284c7]"
                        value={(stats?.redemptions ?? 0).toLocaleString()} title="Used Coupons" sub="Total redeemed" />
              <StatCard icon={Percent} tint="bg-[#fff7ed] text-[#ea580c]"
                        value={money(stats?.total_discount ?? 0)} title="Total Discount Given" sub="All time" />
            </div>

            {/* ── Table ── */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 border-b border-[#eceaf0] p-4">
                <div className="relative min-w-[180px] flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                         placeholder="Search coupons..."
                         className={`${input} py-2 pl-9`} />
                </div>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] text-[#374151] outline-none focus:border-[#fe2c55]">
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="expired">Expired</option>
                  <option value="exhausted">Fully used</option>
                </select>
                <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
                        className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] text-[#374151] outline-none focus:border-[#fe2c55]">
                  <option value="">All Types</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                <select value={planKey} onChange={(e) => { setPlanKey(e.target.value); setPage(1); }}
                        className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] text-[#374151] outline-none focus:border-[#fe2c55]">
                  <option value="">Select Plan</option>
                  {(plans ?? []).map((p) => <option key={p.id} value={p.key}>{p.name}</option>)}
                </select>
                <button
                  onClick={() => { setQ(""); setStatus(""); setType(""); setPlanKey(""); setPage(1); }}
                  className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12.5px] font-bold text-[#374151] transition hover:bg-[#fafafa]"
                >
                  <SlidersHorizontal size={13} /> Reset
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#eceaf0] bg-[#fbfafc] text-left">
                      {["Code", "Offer Name", "Plan", "Discount", "Type", "Usage", "Status", "Valid Until", "Created", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-[#9ca3af]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-[13px] text-[#8A8592]">Loading coupons…</td></tr>
                    )}
                    {!isLoading && pageRows.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-[13px] text-[#8A8592]">
                        {coupons.length === 0 ? "No coupons yet — create one on the right." : "No coupons match those filters."}
                      </td></tr>
                    )}
                    {pageRows.map((c) => (
                      <tr key={c.id} className="border-b border-[#f4f2f5] last:border-0 hover:bg-[#fcfbfd]">
                        <td className="px-4 py-3">
                          <span className="font-mono text-[12.5px] font-bold text-[#fe2c55]">{c.code}</span>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#111827]">{c.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {c.applicable_plans.length === 0 ? (
                              <span className="rounded-[6px] bg-[#f4f2f5] px-2 py-[3px] text-[10.5px] font-bold text-[#6b7280]">All plans</span>
                            ) : c.applicable_plans.map((k) => (
                              <span key={k} className={`rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold ${PLAN_TINT[k] ?? "bg-[#f4f2f5] text-[#6b7280]"}`}>
                                {plans?.find((p) => p.key === k)?.name ?? k}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] font-bold text-[#111827]">
                          {c.type === "percentage" ? `${c.value}% OFF` : `${money(c.value)} OFF`}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#6b7280]">
                          {c.type === "percentage" ? "Percentage" : "Fixed Amount"}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#6b7280]">
                          {/* ∞ rather than a number when there is no limit -
                              "34 / 0" would read as exhausted. */}
                          {c.used_count} / {c.usage_limit ?? "∞"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-[12px] font-semibold capitalize text-[#374151]">
                            <span className={`h-[7px] w-[7px] rounded-full ${STATUS_TINT[c.status]}`} />
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#6b7280]">{shortDate(c.valid_until)}</td>
                        <td className="px-4 py-3 text-[12.5px] text-[#6b7280]">{shortDate(c.created_at)}</td>
                        <td className="relative px-4 py-3">
                          <button onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                                  className="grid h-7 w-7 place-items-center rounded-[7px] text-[#9ca3af] transition hover:bg-[#f4f2f5]">
                            <MoreHorizontal size={15} />
                          </button>
                          {menuFor === c.id && (
                            <div className="absolute right-4 top-11 z-20 w-[150px] overflow-hidden rounded-[10px] border border-[#eceaf0] bg-white shadow-lg">
                              <button onClick={() => startEdit(c)}
                                      className="block w-full px-3 py-2 text-left text-[12px] font-semibold text-[#374151] hover:bg-[#fafafa]">
                                Edit coupon
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete ${c.code}? If it has been redeemed it is deactivated instead, so the discount record survives.`)) {
                                    remove.mutate(c.id);
                                  }
                                }}
                                className="block w-full px-3 py-2 text-left text-[12px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]">
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eceaf0] px-4 py-3">
                <p className="text-[12px] text-[#6b7280]">
                  Showing {coupons.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, coupons.length)} of {coupons.length} coupons
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).slice(0, 6).map((n) => (
                    <button key={n} onClick={() => setPage(n)}
                            className={`h-8 min-w-8 rounded-[8px] px-2 text-[12px] font-bold transition ${
                              n === page ? "bg-[#fe2c55] text-white" : "border border-[#e5e7eb] text-[#6b7280] hover:bg-[#fafafa]"
                            }`}>
                      {n}
                    </button>
                  ))}
                  <button disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}
                          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </Card>

            <p className="flex items-start gap-2 rounded-[11px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[12px] leading-snug text-[#1e40af]">
              <Info size={14} className="mt-[1px] flex-none" />
              Coupons are validated by the server at checkout, on the website and in the app alike —
              so a code that is expired or fully redeemed is refused everywhere at the same moment.
            </p>
          </div>

          {/* ── Create / edit panel ── */}
          <Card className="h-fit p-5">
            <h2 className="text-[15px] font-black text-[#111827]">
              {editing ? `Edit ${editing.code}` : "Create Coupon"}
            </h2>

            <div className="mt-4 space-y-3.5">
              <div>
                <span className={label}>Coupon Code <span className="text-[#fe2c55]">*</span></span>
                <input className={`${input} font-mono uppercase`} placeholder="SAVE20" maxLength={32}
                       value={form.code} onChange={(e) => setF("code", e.target.value.toUpperCase())} />
                <span className={hint}>4–32 characters, letters and numbers.</span>
              </div>

              <div>
                <span className={label}>Offer Name <span className="text-[#fe2c55]">*</span></span>
                <input className={input} placeholder="20% OFF Special" maxLength={120}
                       value={form.name} onChange={(e) => setF("name", e.target.value)} />
                <span className={hint}>Shown to admins.</span>
              </div>

              <div>
                <span className={label}>Type</span>
                <select className={input} value={form.type} onChange={(e) => setF("type", e.target.value)}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>

              <div>
                <span className={label}>Discount Value <span className="text-[#fe2c55]">*</span></span>
                <div className="relative">
                  <input className={`${input} pr-9`} inputMode="decimal" placeholder="20"
                         value={form.value} onChange={(e) => setF("value", e.target.value)} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#9ca3af]">
                    {form.type === "percentage" ? "%" : form.currency}
                  </span>
                </div>
                {form.type === "fixed" && (
                  <span className={hint}>
                    A fixed amount only applies to orders in {form.currency} — it is never converted,
                    because converting would change the discount you set.
                  </span>
                )}
              </div>

              <div>
                <span className={label}>Applicable Plan</span>
                <div className="flex flex-wrap gap-1.5">
                  {(plans ?? []).map((p) => {
                    const on = form.applicable_plans.includes(p.key);
                    return (
                      <button key={p.id} type="button"
                              onClick={() => setF("applicable_plans", on
                                ? form.applicable_plans.filter((k: string) => k !== p.key)
                                : [...form.applicable_plans, p.key])}
                              className={`rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-bold transition ${
                                on ? "border-[#fe2c55] bg-[#ffe9ef] text-[#fe2c55]" : "border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#fafafa]"
                              }`}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <span className={hint}>
                  {form.applicable_plans.length === 0
                    ? "None selected = every plan, including ones added later."
                    : `${form.applicable_plans.length} plan(s) selected.`}
                </span>
              </div>

              <div>
                <span className={label}>Usage Limit</span>
                <input className={input} inputMode="numeric" placeholder="100"
                       value={form.usage_limit} onChange={(e) => setF("usage_limit", e.target.value)} />
                <span className={hint}>Leave empty for unlimited.</span>
              </div>

              <div>
                <span className={label}>Valid Until</span>
                <div className="flex items-center gap-2">
                  <input type="date" disabled={form.no_expiry}
                         className={`${input} ${form.no_expiry ? "bg-[#f6f4f7] text-[#9ca3af]" : ""}`}
                         value={form.no_expiry ? "" : form.valid_until}
                         onChange={(e) => setF("valid_until", e.target.value)} />
                  <label className="flex flex-none cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="h-[15px] w-[15px] accent-[#fe2c55]"
                           checked={form.no_expiry} onChange={(e) => setF("no_expiry", e.target.checked)} />
                    <span className="whitespace-nowrap text-[11.5px] text-[#374151]">No Expiry</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-semibold text-[#374151]">Status</span>
                <button type="button" role="switch" aria-checked={form.is_active}
                        onClick={() => setF("is_active", !form.is_active)}
                        className={`relative h-[22px] w-[38px] flex-none rounded-full transition ${form.is_active ? "bg-[#16a34a]" : "bg-[#d8d5dd]"}`}>
                  <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all ${form.is_active ? "left-[19px]" : "left-[3px]"}`} />
                </button>
                <span className="text-[12.5px] font-semibold text-[#111827]">
                  {form.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <button onClick={() => save.mutate()} disabled={save.isPending}
                    className="mt-5 w-full rounded-[10px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e0243d] disabled:opacity-60">
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create Coupon"}
            </button>
            <button onClick={() => { setForm(blank); setEditing(null); setErr(null); }}
                    className="mt-2 w-full rounded-[10px] border border-[#e5e7eb] bg-white py-2.5 text-[13px] font-bold text-[#374151] transition hover:bg-[#fafafa]">
              {editing ? "Cancel Edit" : "Reset Form"}
            </button>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
