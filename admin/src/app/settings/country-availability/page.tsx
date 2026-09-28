"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import {
  Search, Globe, ShieldAlert, Save, X, ChevronDown, ChevronRight, Users,
  CheckCircle2, XCircle, MapPin, History as HistoryIcon, Lock, Shuffle,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading,
} from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { adminService } from "@/services/admin.service";
import { apiMessage } from "@/services/api";
import { timeAgo, cn } from "@/lib/utils";

/**
 * "REELSOO COUNTRY AVAILABILITY" - Settings › Country Restriction.
 * Backend: AdminCountryAvailabilityController, gated by
 * permission:manage_country_availability (server/app/Services/
 * CountryAvailabilityService.php is the actual policy engine this
 * configures - see that file's docblock for the full architecture).
 *
 * Every toggle on this page (global settings AND per-country rows, whether
 * changed from the table or the detail drawer) accumulates into one local
 * diff and publishes together via "Save All Changes" - a single
 * review-before-publish step for the whole page, not per-card autosave.
 * Allow All/Deny All and the bulk-action dropdown are a SEPARATE,
 * immediate path (behind their own confirmation) for applying one action
 * across many countries at once.
 *
 * Every write sends `expected_version` (the `country_policy_version`
 * counter this same service already bumps on every change) so a second
 * admin's concurrent edit is caught as a 409 instead of silently
 * overwritten - see AdminCountryAvailabilityController::checkVersion().
 *
 * LAYOUT NOTE: rebuilt to match a supplied design (two-column - controls
 * left, country table right - real pagination instead of one long
 * scrolling list). A few of that design's rows don't correspond to any
 * real field this backend exposes (a "Restriction Mode: Strict/Soft"
 * toggle, a detection-priority order); rather than wire a toggle to
 * nothing - or to the wrong field - those are either left out or shown
 * disabled with an honest caption. See PAGE_SIZE below for the one
 * explicit numeric choice (20 rows) that overrides this backend's own
 * original "fetch everything, scroll" design.
 */

type Country = {
  code: string; name: string; region: string;
  signup_enabled: boolean; login_enabled: boolean;
  restriction_reason: string | null; status: string;
  existing_users: number; updated_at: string | null;
};
type GlobalSettings = {
  country_restrictions_enabled: boolean;
  global_signup_enabled: boolean;
  global_login_enabled: boolean;
  country_existing_user_policy: string;
  country_restriction_message: string;
  country_detection_mode: string;
  show_restricted_countries: boolean;
  allow_manual_country_change: boolean;
  country_undetermined_signup_policy: string;
  policy_version: number;
};
type Stats = { total: number; allowed: number; restricted: number; existingUsers: number };
type PendingEdit = { signup_enabled?: boolean; login_enabled?: boolean; restriction_reason?: string | null };
type PendingGlobal = Partial<Omit<GlobalSettings, "policy_version" | "country_detection_mode">>;
type HistoryLog = {
  id: number;
  admin: { id: number; name: string; username: string } | null;
  action: string; description: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};
type CountryDetail = { country: Country; existingUsers: number; history: HistoryLog[] };
/** GET /admin/settings/country-availability/provider-health - the optional
 *  countries.dev integration's status. Read-only; nothing here is ever
 *  editable - see AdminCountryAvailabilityController::providerHealth(). */
type ProviderHealth = {
  enabled: boolean;
  circuitOpen: boolean;
  metrics: {
    requests: number; success: number; failures: number;
    cacheHits: number; cacheMisses: number;
    circuitOpenSkips: number; concurrencyRejected: number;
  };
  lastSync: { at: string | null; success: number | null; skipped: number | null; failed: number | null };
};

/** 20, not the backend's previous 300-per-request "fetch it all" choice -
 *  an explicit request to page the table instead of scrolling one long list. */
const PAGE_SIZE = 20;

const EXISTING_USER_POLICIES: { value: string; label: string }[] = [
  { value: "allow_existing", label: "Allow Existing Users" },
  { value: "restrict_existing", label: "Restrict Existing Users" },
  { value: "allow_login_disable_signup", label: "Allow Login but Disable New Signup" },
  { value: "require_admin_review", label: "Require Admin Review" },
];

const UNDETERMINED_SIGNUP_POLICIES: { value: string; label: string }[] = [
  { value: "deny", label: "Deny (recommended)" },
  { value: "allow", label: "Allow" },
];

const BULK_ACTIONS: { action: string; label: string }[] = [
  { action: "enable_signup", label: "Enable Signup" },
  { action: "disable_signup", label: "Disable Signup" },
  { action: "enable_login", label: "Enable Login" },
  { action: "disable_login", label: "Disable Login" },
];

/** ISO alpha-2 -> regional indicator flag emoji. No dependency needed. */
function flagEmoji(code: string): string {
  if (code.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

function isStaleVersion(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 409 && e.response?.data?.code === "STALE_VERSION";
}

/**
 * Indigo when on, matching the supplied design (the site's own brand pink
 * is reserved for primary actions elsewhere - this page's own accent, not
 * a change to any shared button/toggle).
 *
 * Track: 44x24px. Thumb: 20x20px, 2px inset on every side (top/bottom via
 * `top-0.5`, left/right via the explicit `left-0.5` base position below).
 * ON simply adds the full remaining travel distance as a translate: 44 -
 * 20 - 2*2 = 20px, i.e. translate-x-5 - so the thumb lands with the exact
 * same 2px gap from the right edge that it rests with from the left.
 *
 * The thumb previously had NO explicit `left`, relying on translateX alone
 * on top of the browser's own "static position" fallback for an absolutely
 * positioned element with left/right both auto. That fallback is not
 * simple block-flow left-alignment here: modern Chromium renders <button>
 * as a flex container by default (its own UA stylesheet, for content
 * centering - nothing in this app's CSS forces that), and a flex
 * container's absolutely-positioned children resolve their static position
 * via flex alignment rules, not "left edge". That gave the thumb an
 * unpredictable starting point before the translate was even applied,
 * which is what pushed it outside the track in the ON state. An explicit
 * `left-0.5` removes the ambiguity outright - `left` always wins over the
 * static-position fallback once it's set, regardless of the button's
 * computed display.
 */
function ToggleSwitch({ on, onToggle, dirty, disabled, label }: {
  on: boolean; onToggle: () => void; dirty?: boolean; disabled?: boolean; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
        on ? "bg-indigo-600 hover:brightness-110" : "bg-[#d1d5db] hover:bg-[#c3c8d1]",
        dirty && "ring-2 ring-offset-1 ring-amber-400",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          on ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number; sub: string; icon: React.ElementType; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: color + "18" }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <p className="mt-3 text-[13px] font-medium text-[#6b7280]">{label}</p>
      <p className="mt-0.5 text-[24px] font-bold leading-none text-[#111827]">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11.5px] text-[#9ca3af]">{sub}</p>
    </Card>
  );
}

/** A settings row shared by every control in the "Restriction Controls"
 *  card - label + hint on the left, one control on the right, matching
 *  the supplied design's row rhythm regardless of which control it is. */
function ControlRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-[#111827]">{label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-[#6b7280]">{hint}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/** Page-local, matching the supplied design's exact footer ("Showing X to Y
 *  of Z countries" + numbered pages with an ellipsis) - the shared
 *  <Pagination> from data-table.tsx (still used below for Audit History,
 *  unchanged) renders a different, simpler style used across the rest of
 *  the admin app, and changing it would restyle every other page that
 *  uses it too. */
function CountryTablePagination({
  currentPage, lastPage, total, pageSize, onPage,
}: { currentPage: number; lastPage: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  // Windowed page numbers with an ellipsis, e.g. 1 2 3 … 25 - not every
  // page number when there are many, same idea as the shared component's
  // own 5-wide window, just with the supplied design's leading "1" and
  // trailing "…lastPage" always visible.
  const pages: (number | "…")[] = [];
  if (lastPage <= 7) {
    for (let p = 1; p <= lastPage; p++) pages.push(p);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("…");
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(lastPage - 1, currentPage + 1); p++) pages.push(p);
    if (currentPage < lastPage - 2) pages.push("…");
    pages.push(lastPage);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eaed] px-4 py-3">
      <p className="text-[12px] text-[#6b7280]">
        Showing {from} to {to} of {total.toLocaleString()} countries
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPage(currentPage - 1)}
          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e8eaed] text-[#6b7280] hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1.5 text-[12px] text-[#9ca3af]">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cn(
                "grid h-8 min-w-8 place-items-center rounded-[8px] px-2 text-[12px] font-medium transition-colors",
                p === currentPage ? "bg-indigo-600 text-white" : "border border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={currentPage >= lastPage}
          onClick={() => onPage(currentPage + 1)}
          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e8eaed] text-[#6b7280] hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      </div>
    </div>
  );
}

export default function CountryAvailabilityPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [region, setRegion] = useState("all");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Map<string, PendingEdit>>(new Map());
  const [pendingGlobal, setPendingGlobal] = useState<PendingGlobal>({});
  const [bulkConfirm, setBulkConfirm] = useState<null | { action: string; label: string }>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [selectAllConfirm, setSelectAllConfirm] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [drawerCode, setDrawerCode] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!bulkMenuRef.current?.contains(e.target as Node)) setBulkMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bulkMenuOpen]);

  const params = {
    page, per_page: PAGE_SIZE, ...(q && { q }), status, ...(region !== "all" && { region }),
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-country-availability", params],
    queryFn: () => adminService.countryAvailability(params),
  });

  // Allow All / Deny All / Invert Selection apply beyond the current page -
  // a separate, unfiltered, single-request fetch of the full ~247-row
  // list, used only when Allow All / Deny All actually fire.
  const allCodesQuery = useQuery({
    queryKey: ["admin-country-availability-all-codes"],
    queryFn: () => adminService.countryAvailability({ per_page: 500 }),
    staleTime: 60_000,
  });
  const allCodes: string[] = (allCodesQuery.data?.data?.countries ?? []).map((c: Country) => c.code);

  const detailQuery = useQuery({
    queryKey: ["admin-country-availability-detail", drawerCode],
    queryFn: () => adminService.countryAvailabilityDetail(drawerCode as string),
    enabled: !!drawerCode,
  });
  const detail: CountryDetail | undefined = detailQuery.data?.data;

  const historyQuery = useQuery({
    queryKey: ["admin-country-availability-history", historyPage],
    queryFn: () => adminService.countryAvailabilityHistory({ page: historyPage, per_page: 10 }),
  });
  const historyLogs: HistoryLog[] = historyQuery.data?.data ?? [];
  const historyMeta = historyQuery.data?.meta ?? {};

  const providerHealthQuery = useQuery({
    queryKey: ["admin-country-provider-health"],
    queryFn: () => adminService.countryProviderHealth(),
    refetchInterval: 30_000,
  });
  const providerHealth: ProviderHealth | undefined = providerHealthQuery.data?.data;

  const global: GlobalSettings | undefined = data?.data?.global;
  const stats: Stats | undefined = data?.data?.stats;
  const regions: string[] = data?.data?.regions ?? [];
  const countries: Country[] = data?.data?.countries ?? [];
  const meta = data?.meta ?? {};
  const pageCodes = countries.map((c) => c.code);
  const effectiveGlobal: GlobalSettings | undefined = global ? { ...global, ...pendingGlobal } : undefined;
  const changeCount = pending.size + Object.keys(pendingGlobal).length;

  const resetSelection = () => setSelectedCodes(new Set());
  const invertSelection = () => setSelectedCodes((prev) => {
    const next = new Set(prev);
    pageCodes.forEach((c) => (next.has(c) ? next.delete(c) : next.add(c)));
    return next;
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-country-availability"] });
    qc.invalidateQueries({ queryKey: ["admin-country-availability-detail"] });
    qc.invalidateQueries({ queryKey: ["admin-country-availability-history"] });
  };

  const setPendingGlobalField = <K extends keyof PendingGlobal>(key: K, value: PendingGlobal[K]) => {
    setPendingGlobal((prev) => {
      const next = { ...prev };
      if (global && value === global[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const setPendingField = <K extends keyof PendingEdit>(code: string, field: K, value: PendingEdit[K]) => {
    setPending((prev) => {
      const next = new Map(prev);
      const original = countries.find((c) => c.code === code) ?? (detail?.country.code === code ? detail.country : undefined);
      const edit: PendingEdit = { ...(next.get(code) ?? {}), [field]: value };
      if (original) {
        (Object.keys(edit) as (keyof PendingEdit)[]).forEach((k) => {
          if (edit[k] === original[k]) delete edit[k];
        });
      }
      if (Object.keys(edit).length === 0) next.delete(code);
      else next.set(code, edit);
      return next;
    });
  };

  const effective = (c: Country): Country => ({ ...c, ...(pending.get(c.code) ?? {}) });

  const clearAllPending = () => { setPending(new Map()); setPendingGlobal({}); };

  const saveAll = useMutation({
    mutationFn: async () => {
      const expected_version = global?.policy_version;
      if (Object.keys(pendingGlobal).length > 0) {
        await adminService.updateCountryAvailabilityGlobal({ ...pendingGlobal, expected_version });
      }
      if (pending.size > 0) {
        await Promise.all(
          [...pending.entries()].map(([code, edit]) =>
            adminService.updateCountryAvailabilityCountry(code, { ...edit, expected_version })),
        );
      }
    },
    onSuccess: () => {
      toast.success(`${changeCount} change${changeCount === 1 ? "" : "s"} saved`);
      clearAllPending();
      invalidate();
    },
    onError: (e) => {
      if (isStaleVersion(e)) {
        toast.error("These settings were updated by another administrator. Refreshing the latest values - please redo your changes.");
        invalidate();
      } else {
        toast.error(apiMessage(e));
      }
    },
  });

  const bulkAct = useMutation({
    mutationFn: ({ codes, action }: { codes: string[]; action: string }) =>
      adminService.bulkUpdateCountryAvailability(codes, action, global?.policy_version),
    onSuccess: (res) => {
      toast.success(`Updated ${res?.data?.affected ?? "selected"} countries`);
      resetSelection();
      setBulkConfirm(null);
      setSelectAllConfirm(false);
      setClearAllConfirm(false);
      invalidate();
    },
    onError: (e) => {
      if (isStaleVersion(e)) {
        toast.error("Country policy changed elsewhere. Refreshing before retrying.");
        invalidate();
      } else {
        toast.error(apiMessage(e));
      }
      setBulkConfirm(null);
    },
  });

  return (
    <AdminShell title="Country Restriction">
      <div className="space-y-5 pb-10">
        {/* ── Breadcrumb + header ── */}
        <div>
          <p className="text-[12px] text-[#9ca3af]">Settings <ChevronRight className="inline h-3 w-3" /> Country Restriction</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[24px] font-bold text-[#111827]">Country Restriction</h2>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                Control access to Teezer based on user&apos;s country. Manage allowed countries for signup and login.
              </p>
            </div>
            <button
              type="button"
              disabled={changeCount === 0 || saveAll.isPending}
              onClick={() => saveAll.mutate()}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-indigo-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {changeCount > 0 ? `Save All Changes (${changeCount})` : "Save All Changes"}
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Countries" value={stats?.total ?? 0} sub={`Out of ${stats?.total ?? 0} countries`} icon={Globe} color="#6366f1" />
          <StatCard label="Allowed Countries" value={stats?.allowed ?? 0} sub="Allowed for signup" icon={CheckCircle2} color="#10b981" />
          <StatCard label="Restricted Countries" value={stats?.restricted ?? 0} sub="Blocked from signup" icon={Lock} color="#fe2c55" />
          <StatCard label="Existing Users" value={stats?.existingUsers ?? 0} sub="From allowed countries" icon={Users} color="#6366f1" />
        </div>

        {/* ── Two-column: controls left, country table right ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/* ── Restriction Controls ── */}
          <Card className="h-fit">
            <CardHeader>
              <div>
                <CardTitle>Restriction Controls</CardTitle>
                <p className="mt-0.5 text-[12px] text-[#9ca3af]">Configure how country restriction works on the platform.</p>
              </div>
            </CardHeader>
            <CardBody className="divide-y divide-[#f3f4f6]">
              <ControlRow
                label="Enable Country Restriction"
                hint="Turn this on to start controlling access by country. When it's off, every country works normally and the settings below have no effect."
              >
                <ToggleSwitch
                  label="Enable Country Restriction"
                  on={!!effectiveGlobal?.country_restrictions_enabled}
                  dirty={"country_restrictions_enabled" in pendingGlobal}
                  onToggle={() => setPendingGlobalField("country_restrictions_enabled", !effectiveGlobal?.country_restrictions_enabled)}
                />
              </ControlRow>

              <ControlRow
                label="Allow New Signups"
                hint="Turns new signups on or off for the whole app, in every country. Use this to pause all signups in an emergency. To block specific countries only, use Country Management on the right."
              >
                <ToggleSwitch
                  label="Allow New Signups"
                  on={!!effectiveGlobal?.global_signup_enabled}
                  dirty={"global_signup_enabled" in pendingGlobal}
                  onToggle={() => setPendingGlobalField("global_signup_enabled", !effectiveGlobal?.global_signup_enabled)}
                />
              </ControlRow>

              <ControlRow
                label="Allow Logins"
                hint="Turns logins on or off for the whole app, in every country. Use this to pause all logins in an emergency. To block specific countries only, use Country Management on the right."
              >
                <ToggleSwitch
                  label="Allow Logins"
                  on={!!effectiveGlobal?.global_login_enabled}
                  dirty={"global_login_enabled" in pendingGlobal}
                  onToggle={() => setPendingGlobalField("global_login_enabled", !effectiveGlobal?.global_login_enabled)}
                />
              </ControlRow>

              <ControlRow
                label="Existing User Policy"
                hint="Choose what happens to someone who already has an account in a country that gets blocked."
              >
                <Select
                  value={effectiveGlobal?.country_existing_user_policy ?? "allow_existing"}
                  onChange={(e) => setPendingGlobalField("country_existing_user_policy", e.target.value)}
                  className={cn("w-[220px]", "country_existing_user_policy" in pendingGlobal && "ring-2 ring-amber-400")}
                >
                  {EXISTING_USER_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </ControlRow>

              <ControlRow
                label="Auto Detect Country"
                hint="Teezer automatically figures out each visitor's country. This is always on and can't be turned off."
              >
                <ToggleSwitch label="Auto Detect Country (always on)" on disabled onToggle={() => {}} />
              </ControlRow>

              <ControlRow
                label="Show Country Selector on Signup"
                hint="When on, people can pick a different country while signing up. When off, they're locked to the country we detected for them."
              >
                <ToggleSwitch
                  label="Show Country Selector on Signup"
                  on={!!effectiveGlobal?.allow_manual_country_change}
                  dirty={"allow_manual_country_change" in pendingGlobal}
                  onToggle={() => setPendingGlobalField("allow_manual_country_change", !effectiveGlobal?.allow_manual_country_change)}
                />
              </ControlRow>

              <ControlRow
                label="Show Restricted Countries in Picker"
                hint="When on, blocked countries still show up in the signup list (grayed out, with a reason). When off, blocked countries don't appear at all."
              >
                <ToggleSwitch
                  label="Show Restricted Countries in Picker"
                  on={!!effectiveGlobal?.show_restricted_countries}
                  dirty={"show_restricted_countries" in pendingGlobal}
                  onToggle={() => setPendingGlobalField("show_restricted_countries", !effectiveGlobal?.show_restricted_countries)}
                />
              </ControlRow>

              <ControlRow
                label="Country Detection Order"
                hint="The order Teezer checks to find a visitor's country. This is fixed and can't be changed."
              >
                <Select value="ip_manual" disabled className="w-[220px] opacity-60">
                  <option value="ip_manual">IP Address {">"} Manual Select</option>
                </Select>
              </ControlRow>

              <ControlRow
                label="When Country Can't Be Detected"
                hint="What to do when we can't tell which country a new signup is coming from. This never affects people who are just logging in."
              >
                <Select
                  value={effectiveGlobal?.country_undetermined_signup_policy ?? "deny"}
                  onChange={(e) => setPendingGlobalField("country_undetermined_signup_policy", e.target.value)}
                  className={cn("w-[220px]", "country_undetermined_signup_policy" in pendingGlobal && "ring-2 ring-amber-400")}
                >
                  {UNDETERMINED_SIGNUP_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </ControlRow>

              <div className="pt-3.5">
                <p className="text-[13.5px] font-semibold text-[#111827]">Custom Block Message</p>
                <p className="mt-0.5 text-[12px] text-[#6b7280]">Message to show users from restricted countries.</p>
                <Textarea
                  defaultValue={global?.country_restriction_message ?? ""}
                  onBlur={(e) => setPendingGlobalField("country_restriction_message", e.target.value)}
                  maxLength={150}
                  className={cn("mt-2 w-full", "country_restriction_message" in pendingGlobal && "ring-2 ring-amber-400")}
                  rows={2}
                />
                <p className="mt-1 text-right text-[11px] text-[#9ca3af]">
                  {(effectiveGlobal?.country_restriction_message ?? "").length}/150
                </p>
              </div>
            </CardBody>
          </Card>

          {/* ── Country Management ── */}
          <Card className="h-fit">
            <CardHeader>
              <div>
                <CardTitle>Country Management</CardTitle>
                <p className="mt-0.5 text-[12px] text-[#9ca3af]">Select which countries can access Teezer.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-52">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
                  <Input placeholder="Search country..." value={q}
                    onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
                </div>
                <Select value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }}>
                  <option value="all">All Regions</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </div>
            </CardHeader>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
              <Button variant="success" size="sm" onClick={() => setSelectAllConfirm(true)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Allow All
              </Button>
              <Button variant="danger" size="sm" onClick={() => setClearAllConfirm(true)}>
                <XCircle className="h-3.5 w-3.5" /> Deny All
              </Button>
              <Button variant="outline" size="sm" onClick={invertSelection}>
                <Shuffle className="h-3.5 w-3.5" /> Invert Selection
              </Button>
            </div>

            <Table>
              <Thead>
                <Th className="w-8">
                  <input type="checkbox" className="accent-indigo-600" checked={pageCodes.length > 0 && pageCodes.every((c) => selectedCodes.has(c))}
                    onChange={() => setSelectedCodes((prev) => {
                      const allOnPage = pageCodes.length > 0 && pageCodes.every((c) => prev.has(c));
                      const next = new Set(prev);
                      if (allOnPage) pageCodes.forEach((c) => next.delete(c));
                      else pageCodes.forEach((c) => next.add(c));
                      return next;
                    })} />
                </Th>
                <Th>Country</Th>
                <Th>Status</Th>
                <Th>Region</Th>
                <Th>Users</Th>
                <Th className="w-6">{null}</Th>
              </Thead>
              <Tbody>
                {isLoading
                  ? <TableLoading cols={6} />
                  : countries.length === 0
                    ? <TableEmpty message="No countries match this filter." />
                    : countries.map((raw) => {
                        const c = effective(raw);
                        const dirty = pending.has(raw.code);
                        const selected = selectedCodes.has(raw.code);
                        const available = c.signup_enabled && c.login_enabled;
                        return (
                          <Tr
                            key={raw.code}
                            onClick={() => setDrawerCode(raw.code)}
                            className={selected ? "bg-[#eef0ff]" : dirty ? "bg-amber-50" : undefined}
                          >
                            <Td>
                              <input type="checkbox" className="accent-indigo-600" checked={selected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => setSelectedCodes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(raw.code)) next.delete(raw.code); else next.add(raw.code);
                                  return next;
                                })} />
                            </Td>
                            <Td>
                              <span className="flex items-center gap-1.5 font-medium text-[#111827]">
                                <span>{flagEmoji(raw.code)}</span>
                                <span>{c.name} <span className="text-[#9ca3af]">({raw.code})</span></span>
                              </span>
                            </Td>
                            <Td>
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                                available ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                              )}>
                                {available ? "Allowed" : "Restricted"}
                              </span>
                            </Td>
                            <Td><span className="text-[12px] text-[#6b7280]">{raw.region}</span></Td>
                            <Td><span className="text-[12px] text-[#6b7280]">{raw.existing_users.toLocaleString()}</span></Td>
                            <Td><ChevronRight className="h-4 w-4 text-[#c4c8ce]" /></Td>
                          </Tr>
                        );
                      })
                }
              </Tbody>
            </Table>

            {/* Bulk action bar takes over the footer while rows are selected;
                otherwise it's the paged-country footer. */}
            {selectedCodes.size > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eaed] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-medium text-[#374151]">{selectedCodes.size} selected</span>
                  <button onClick={resetSelection} className="text-[12px] text-[#9ca3af] hover:text-[#6b7280]">Clear</button>
                </div>
                <div ref={bulkMenuRef} className="relative">
                  <Button variant="outline" size="sm" onClick={() => setBulkMenuOpen((o) => !o)}>
                    Bulk Actions <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  {bulkMenuOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-[10px] border border-[#e8eaed] bg-white py-1 shadow-lg">
                      {BULK_ACTIONS.map(({ action, label }) => (
                        <button
                          key={action}
                          onClick={() => { setBulkConfirm({ action, label }); setBulkMenuOpen(false); }}
                          className="block w-full px-3 py-2 text-left text-[12.5px] text-[#374151] hover:bg-[#f9fafb]"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <CountryTablePagination
                currentPage={meta.current_page ?? 1}
                lastPage={meta.last_page ?? 1}
                total={meta.total ?? 0}
                pageSize={PAGE_SIZE}
                onPage={(p) => { setPage(p); resetSelection(); }}
              />
            )}
          </Card>
        </div>

        {/* ── countries.dev provider health - read-only, existing
            functionality kept, moved into its own compact card so the
            two-column section above stays focused on the supplied design. ── */}
        <Card>
          <CardHeader><CardTitle className="text-[14px]">countries.dev Provider</CardTitle></CardHeader>
          <CardBody>
            {providerHealthQuery.isLoading || !providerHealth ? (
              <p className="text-[12px] text-[#9ca3af]">Loading…</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={providerHealth.enabled ? "success" : "default"}>
                    {providerHealth.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {providerHealth.enabled && (
                    <Badge variant={providerHealth.circuitOpen ? "danger" : "success"}>
                      {providerHealth.circuitOpen ? "Circuit Open (provider unreachable)" : "Circuit Closed (healthy)"}
                    </Badge>
                  )}
                </div>
                {providerHealth.enabled && (
                  <p className="text-[11px] text-[#9ca3af]">
                    {providerHealth.metrics.requests} request{providerHealth.metrics.requests === 1 ? "" : "s"} ·{" "}
                    {providerHealth.metrics.success} succeeded · {providerHealth.metrics.failures} failed ·{" "}
                    {providerHealth.metrics.cacheHits} cache hits ({
                      providerHealth.metrics.cacheHits + providerHealth.metrics.cacheMisses > 0
                        ? Math.round((providerHealth.metrics.cacheHits / (providerHealth.metrics.cacheHits + providerHealth.metrics.cacheMisses)) * 100)
                        : 0
                    }% hit rate)
                  </p>
                )}
                <p className="text-[11px] text-[#9ca3af]">
                  Last metadata sync: {providerHealth.lastSync.at ? timeAgo(providerHealth.lastSync.at) : "never"}
                  {providerHealth.lastSync.at && ` (${providerHealth.lastSync.success ?? 0} updated, ${providerHealth.lastSync.failed ?? 0} failed)`}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── Audit history ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5"><HistoryIcon className="h-3.5 w-3.5" /> Audit History</CardTitle>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Action</Th>
              <Th>Description</Th>
              <Th>Admin</Th>
              <Th>Time</Th>
            </Thead>
            <Tbody>
              {historyQuery.isLoading
                ? <TableLoading cols={4} />
                : historyLogs.length === 0
                  ? <TableEmpty message="No country-availability changes logged yet." />
                  : historyLogs.map((log) => (
                      <Tr key={log.id}>
                        <Td><span className="font-mono text-[12px] font-medium text-[#111827]">{log.action}</span></Td>
                        <Td><p className="max-w-[360px] truncate text-[12px] text-[#6b7280]">{log.description}</p></Td>
                        <Td>
                          <p className="text-[12.5px] font-medium text-[#111827]">{log.admin?.name ?? "System"}</p>
                          {log.admin?.username && <p className="text-[11px] text-[#9ca3af]">@{log.admin.username}</p>}
                        </Td>
                        <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(log.created_at)}</span></Td>
                      </Tr>
                    ))
              }
            </Tbody>
          </Table>
          <CountryTablePagination
            currentPage={historyMeta.current_page ?? 1}
            lastPage={historyMeta.last_page ?? 1}
            total={historyMeta.total ?? 0}
            pageSize={10}
            onPage={setHistoryPage}
          />
        </Card>
      </div>

      {/* ── Detail drawer ── */}
      {drawerCode && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerCode(null)} />
          <div className="relative flex h-full w-full max-w-[400px] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-4">
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#111827]">
                <span>{flagEmoji(drawerCode)}</span> {detail?.country.name ?? drawerCode}
              </h3>
              <button onClick={() => setDrawerCode(null)} className="text-[#9ca3af] hover:text-[#374151]">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detailQuery.isLoading || !detail ? (
                <p className="text-[13px] text-[#9ca3af]">Loading…</p>
              ) : (() => {
                  const raw = detail.country;
                  const c = pending.has(raw.code) ? { ...raw, ...pending.get(raw.code) } : raw;
                  return (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{raw.code}</Badge>
                        <Badge variant="outline"><MapPin className="mr-1 h-3 w-3 inline" />{raw.region}</Badge>
                        <Badge variant={c.signup_enabled && c.login_enabled ? "success" : "danger"}>
                          {c.signup_enabled && c.login_enabled ? "Allowed" : "Restricted"}
                        </Badge>
                      </div>

                      <div className="rounded-xl bg-[#f9fafb] p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">Existing Users</p>
                        <p className="text-[20px] font-bold text-[#111827]">{detail.existingUsers.toLocaleString()}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-[13px] font-medium text-[#374151]">Signup vs. Login</p>
                        <p className="mb-2 text-[11px] text-[#9ca3af]">
                          The Status badge in the table turns both of these on or off together.
                          Only use the switches below if you need them to be different for this
                          country - for example, letting existing users keep logging in while new
                          signups are paused.
                        </p>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#f3f4f6] pb-3">
                        <span className="text-[13px] font-medium text-[#374151]">Signup Enabled</span>
                        <ToggleSwitch label="Signup Enabled" on={c.signup_enabled} dirty={pending.get(raw.code)?.signup_enabled !== undefined}
                          onToggle={() => setPendingField(raw.code, "signup_enabled", !c.signup_enabled)} />
                      </div>
                      <div className="flex items-center justify-between border-b border-[#f3f4f6] pb-3">
                        <span className="text-[13px] font-medium text-[#374151]">Login Enabled</span>
                        <ToggleSwitch label="Login Enabled" on={c.login_enabled} dirty={pending.get(raw.code)?.login_enabled !== undefined}
                          onToggle={() => setPendingField(raw.code, "login_enabled", !c.login_enabled)} />
                      </div>

                      <div>
                        <p className="mb-1.5 text-[13px] font-medium text-[#374151]">Restriction Reason</p>
                        <Textarea
                          defaultValue={raw.restriction_reason ?? ""}
                          placeholder="Shown to users if set - falls back to the global message otherwise."
                          onBlur={(e) => setPendingField(raw.code, "restriction_reason", e.target.value || null)}
                          rows={2}
                          className={pending.get(raw.code)?.restriction_reason !== undefined ? "ring-2 ring-amber-400" : ""}
                        />
                      </div>

                      <div>
                        <p className="mb-2 text-[13px] font-medium text-[#374151]">Recent Activity</p>
                        {detail.history.length === 0 ? (
                          <p className="text-[12px] text-[#9ca3af]">No changes logged for this country yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {detail.history.map((log) => (
                              <div key={log.id} className="border-l-2 border-[#e8eaed] pl-3">
                                <p className="text-[12px] text-[#374151]">{log.description}</p>
                                <p className="text-[11px] text-[#9ca3af]">
                                  {log.admin?.name ?? "System"} · {timeAgo(log.created_at)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>
      )}

      {/* Sticky pending-changes bar duplicated the "Save All Changes" button
          in the header above, so on this rebuild it's gone - the header
          button already reflects the same changeCount and is always
          visible without scrolling to the bottom. */}

      {/* Bulk action confirmation */}
      <ConfirmModal
        open={!!bulkConfirm}
        title={`${bulkConfirm?.label} for ${selectedCodes.size} countries?`}
        message="This applies immediately and is logged to the admin audit log."
        confirmLabel={bulkConfirm?.label ?? "Confirm"}
        loading={bulkAct.isPending}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => bulkConfirm && bulkAct.mutate({ codes: [...selectedCodes], action: bulkConfirm.action })}
      />

      {/* Allow All / Deny All confirmation - the two highest-blast-radius
          actions on this page, per the feature's own explicit requirement. */}
      <ConfirmModal
        open={selectAllConfirm}
        title="Enable Teezer access for all countries?"
        message={`This sets Signup to ON for all ${allCodes.length || "…"} countries platform-wide. This applies immediately and is logged.`}
        confirmLabel="Allow All"
        danger
        loading={bulkAct.isPending}
        onCancel={() => setSelectAllConfirm(false)}
        onConfirm={() => bulkAct.mutate({ codes: allCodes, action: "enable_signup" })}
      />
      <ConfirmModal
        open={clearAllConfirm}
        title="Disable access for all countries?"
        message={`This sets Signup to OFF for all ${allCodes.length || "…"} countries platform-wide. This applies immediately and is logged.`}
        confirmLabel="Deny All"
        danger
        loading={bulkAct.isPending}
        onCancel={() => setClearAllConfirm(false)}
        onConfirm={() => bulkAct.mutate({ codes: allCodes, action: "disable_signup" })}
      />
    </AdminShell>
  );
}
