"use client";

/**
 * Verification Badge - the listing and the review, in one place.
 *
 * This page answers "who is waiting, and how long have they been waiting", and lets a
 * reviewer act on a row without leaving it: clicking a row opens the same review UI
 * used on the applicant's 360 profile (documents, declared details, approve/reject/
 * revoke) in a modal over the table, instead of navigating away.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck, Check, ChevronRight, Clock, FileText, Search, ShieldCheck, ShieldX, X,
} from "lucide-react";

import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { Input } from "@/admin-panel/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading, Pagination,
} from "@/admin-panel/components/ui/data-table";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatNumber } from "@/admin-panel/lib/utils";
import { VerificationReview } from "@/admin-panel/components/verification/verification-review";

/* ── Types ──────────────────────────────────────────────────────────────────── */

type VUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  avatar: string | null;
  is_verified: boolean;

};

type VRequest = {
  id: number;
  /** "revoked" is display-only - the API rewrites an approved-then-revoked row to it
      (the DB keeps status='approved' plus a revoked_at). It must be handled here or
      the row cannot be rendered. */
  status: "draft" | "pending" | "approved" | "rejected" | "revoked";
  country: string | null;
  created_at: string;
  document_url: string | null;
  selfie_url: string | null;
  supporting_doc_url: string | null;
  user: VUser | null;
};

type Counts = { pending: number; approved: number; rejected: number; total: number };
type CountryRow = { country: string; total: number; pct: number };

const TABS = [
  { key: "all",      label: "All Applications" },
  { key: "pending",  label: "Pending"          },
  { key: "approved", label: "Approved"         },
  { key: "rejected", label: "Rejected"         },
] as const;

const COUNTRY_NAMES: Record<string, string> = {
  NP: "Nepal", IN: "India", US: "USA", AE: "UAE", GB: "UK",
  CN: "China", AU: "Australia", CA: "Canada", DE: "Germany",
  FR: "France", JP: "Japan", BR: "Brazil", ID: "Indonesia",
  PK: "Pakistan", BD: "Bangladesh", PH: "Philippines",
};

const countryName = (code: string) => COUNTRY_NAMES[code?.toUpperCase()] ?? code;

const STATUS_CHIPS: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  pending:  { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: Clock },
  approved: { label: "Approved",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Check },
  rejected: { label: "Rejected",       cls: "bg-rose-50 text-rose-700 border-rose-200",          Icon: X },
  revoked:  { label: "Revoked",        cls: "bg-rose-50 text-rose-700 border-rose-200",          Icon: ShieldX },
  draft:    { label: "Draft",          cls: "bg-slate-50 text-slate-600 border-slate-200",       Icon: FileText },
};

function StatusChip({ status }: { status: VRequest["status"] }) {
  // Fall back instead of indexing blind: an unrecognised status used to make this
  // component throw on `map.Icon`, which took the whole page down with it rather
  // than degrading to one odd-looking chip.
  const map = STATUS_CHIPS[status] ?? {
    label: String(status || "Unknown"),
    cls:   "bg-slate-50 text-slate-600 border-slate-200",
    Icon:  FileText,
  };

  const Icon = map.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${map.cls}`}>
      <Icon className="h-3 w-3" />
      {map.label}
    </span>
  );
}

function documentCount(r: VRequest) {
  return [r.document_url, r.selfie_url, r.supporting_doc_url].filter(Boolean).length;
}

/* ── Avatar ─────────────────────────────────────────────────────────────────── */

const PALETTE = ["#fd4605", "#7c3aed", "#2563eb", "#059669", "#d97706", "#db2777"];

/**
 * The house avatar: a plain <img> that falls back to coloured initials on error.
 *
 * Deliberately NOT next/image. Avatar URLs here can 404 - the origin isn't guaranteed
 * to still hold every file a user once uploaded - and next/image renders a broken image
 * with no recourse. onError gives us initials instead, which is what every other admin
 * table does and why they never look broken.
 */
function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  const initials = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const bg = PALETTE[(name || "?").charCodeAt(0) % PALETTE.length];

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: bg, fontSize: Math.max(Math.round(size * 0.36), 10) }}
    >
      {initials}
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */

function Stat({
  label, value, icon: Icon, tint, fg,
}: {
  label: string; value: number; icon: React.ElementType; tint: string; fg: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3.5">
        <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl ${tint}`}>
          <Icon className={`h-5 w-5 ${fg}`} />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] text-[#6b7280]">{label}</p>
          <p className="mt-0.5 text-[22px] font-bold leading-none text-[#111827]">{formatNumber(value)}</p>
        </div>
      </div>
    </Card>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function VerificationPage() {
  const qc = useQueryClient();

  const [tab, setTab]   = useState<string>("all");
  const [page, setPage] = useState(1);
  const [q, setQ]       = useState("");
  const [reviewing, setReviewing] = useState<{ id: number; username: string; isVerified: boolean } | null>(null);

  const params = {
    status: tab,
    page,
    per_page: 10,
    ...(q && { q }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-verifications", params],
    queryFn: () => adminService.verifications(params),
  });

  const rows: VRequest[]           = data?.data ?? [];
  const counts: Counts             = data?.counts ?? { pending: 0, approved: 0, rejected: 0, total: 0 };
  const topCountries: CountryRow[] = data?.top_countries ?? [];
  const meta = data?.meta ?? { current_page: 1, last_page: 1, total: 0 };

  const insights = [
    { label: "Pending",  value: counts.pending,  color: "#f59e0b" },
    { label: "Approved", value: counts.approved, color: "#22c55e" },
    { label: "Rejected", value: counts.rejected, color: "#fd4605" },
  ];
  const decidedTotal = Math.max(1, counts.pending + counts.approved + counts.rejected);

  const open = (r: VRequest) => {
    if (r.user) setReviewing({ id: r.user.id, username: r.user.username, isVerified: r.user.is_verified });
  };

  return (
    <>
    <AdminShell title="Verification Badge">
      <div className="space-y-5">

        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#111827]">
            Verification Applications
            <BadgeCheck className="h-4 w-4 text-[#fd4605]" />
          </h2>
          <p className="text-[13px] text-[#6b7280]">
            Creators applying for a verification badge. Open an applicant to see their
            documents and approve or reject.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total Applications" value={counts.total}    icon={BadgeCheck}  tint="bg-rose-50"    fg="text-[#fd4605]" />
          <Stat label="Pending Review"     value={counts.pending}  icon={Clock}       tint="bg-amber-50"   fg="text-amber-500" />
          <Stat label="Approved"           value={counts.approved} icon={ShieldCheck} tint="bg-emerald-50" fg="text-emerald-500" />
          <Stat label="Rejected"           value={counts.rejected} icon={ShieldX}     tint="bg-rose-50"    fg="text-rose-500" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">

          {/* ── Listing ───────────────────────────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-[#e8eaed] px-4">
              {TABS.map((t) => {
                const active = tab === t.key;
                const n =
                  t.key === "pending"  ? counts.pending  :
                  t.key === "approved" ? counts.approved :
                  t.key === "rejected" ? counts.rejected : null;

                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setPage(1); }}
                    className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold transition ${
                      active
                        ? "border-[#fd4605] text-[#fd4605]"
                        : "border-transparent text-[#6b7280] hover:text-[#111827]"
                    }`}
                  >
                    {t.label}
                    {n !== null && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                        active ? "bg-rose-50 text-[#fd4605]" : "bg-[#f3f4f6] text-[#6b7280]"
                      }`}>
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search only. The country filter was built from the applicants' own
                countries, and country is optional on an application - so the dropdown
                offered exactly one choice ("All countries") and filtered nothing. */}
            <div className="border-b border-[#e8eaed] px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder="Search by name, username or email..."
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading ? (
              <TableLoading cols={5} />
            ) : rows.length === 0 ? (
              <TableEmpty message="No verification applications match this view." />
            ) : (
              <>
                <Table>
                  <Thead>
                    <Th>Creator</Th>
                    <Th>Status</Th>
                    <Th>Applied On</Th>
                    <Th>Documents</Th>
                    <Th>{""}</Th>
                  </Thead>
                  <Tbody>
                    {rows.map((r) => {
                      const u = r.user;
                      const applied = new Date(r.created_at);
                      const docs = documentCount(r);

                      return (
                        <Tr
                          key={r.id}
                          onClick={() => open(r)}
                          className={u ? "cursor-pointer" : undefined}
                        >
                          <Td>
                            <div className="flex items-center gap-3">
                              <Avatar name={u?.name ?? "?"} src={u?.avatar ?? null} size={36} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-1">
                                  <span className="truncate text-[13px] font-semibold text-[#111827]">
                                    {u?.name ?? "Deleted user"}
                                  </span>
                                  {u?.is_verified && <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-[#1d9bf0]" />}
                                </span>
                                <span className="block truncate text-[11.5px] text-[#6b7280]">@{u?.username ?? "-"}</span>
                                <span className="block truncate text-[11px] text-[#9ca3af]">{u?.email ?? ""}</span>
                              </span>
                            </div>
                          </Td>

                          <Td><StatusChip status={r.status} /></Td>

                          <Td>
                            <span className="block whitespace-nowrap text-[12.5px] text-[#111827]">
                              {applied.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            <span className="block text-[11.5px] text-[#9ca3af]">
                              {applied.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </Td>

                          <Td>
                            {docs === 0 ? (
                              <span className="text-[12px] text-[#9ca3af]">None</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f3f4f6] px-2 py-1 text-[12px] font-semibold text-[#374151]">
                                <FileText className="h-3.5 w-3.5" />
                                {docs}
                              </span>
                            )}
                          </Td>

                          <Td className="text-right">
                            <ChevronRight className="ml-auto h-4 w-4 text-[#d1d5db]" />
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>

                <Pagination
                  currentPage={meta.current_page ?? 1}
                  lastPage={meta.last_page ?? 1}
                  total={meta.total ?? 0}
                  onPage={setPage}
                />
              </>
            )}
          </Card>

          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <div className="space-y-5">
            <Card className="p-5">
              <p className="mb-4 text-[14px] font-bold text-[#111827]">Verification Insights</p>

              {counts.total === 0 ? (
                <p className="text-[12.5px] text-[#9ca3af]">No applications yet.</p>
              ) : (
                <div className="space-y-3">
                  {insights.map((i) => (
                    <div key={i.label}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="flex items-center gap-2 text-[#374151]">
                          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
                          {i.label}
                        </span>
                        <span className="font-semibold text-[#111827]">
                          {formatNumber(i.value)}
                          <span className="ml-1 text-[11px] font-normal text-[#9ca3af]">
                            ({((i.value / decidedTotal) * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(i.value / decidedTotal) * 100}%`, background: i.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <p className="mb-4 text-[14px] font-bold text-[#111827]">Top Countries</p>

              {topCountries.length === 0 ? (
                // Country is optional on the request, so an empty list means nobody has
                // supplied one - not that nobody has applied.
                <p className="text-[12.5px] text-[#9ca3af]">No applicant has provided a country yet.</p>
              ) : (
                <div className="space-y-3">
                  {topCountries.map((c) => (
                    <div key={c.country} className="flex items-center gap-2.5">
                      <span className="w-16 flex-shrink-0 truncate text-[12.5px] text-[#374151]">
                        {countryName(c.country)}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                        <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className="w-11 flex-shrink-0 text-right text-[11.5px] font-semibold text-[#374151]">
                        {c.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>

    {/* Review modal - opened per-row, same review UI as the applicant's 360
        profile Verification tab, so a decision doesn't require leaving the
        queue. */}
    {reviewing && (
      <div
        className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8 sm:p-6"
        onClick={() => setReviewing(null)}
      >
        <div
          className="w-full max-w-3xl rounded-2xl bg-[#f7f7f8]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between rounded-t-2xl border-b border-[#e8eaed] bg-white px-5 py-3.5">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-[#fd4605]" />
              <p className="text-[14px] font-bold text-[#111827]">@{reviewing.username}</p>
            </div>
            <button
              type="button"
              onClick={() => setReviewing(null)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] transition hover:bg-[#f1f2f4] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[80vh] overflow-y-auto p-5">
            <VerificationReview
              userId={reviewing.id}
              username={reviewing.username}
              isVerified={reviewing.isVerified}
              onChanged={() => qc.invalidateQueries({ queryKey: ["admin-verifications"] })}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
