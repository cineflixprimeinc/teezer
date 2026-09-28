"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield, Users, UserPlus, Search, Plus, Copy, Trash2, X, Check,
  AlertTriangle, Loader2, RefreshCw, ChevronRight, Grid3x3, Activity,
  KeyRound, UserCheck, Ban, Power, Clock, ShieldAlert,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatDate, timeAgo } from "@/admin-panel/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */
type PermItem = { key: string; label: string; sensitive: boolean };
type PermCategory = { key: string; label: string; permissions: PermItem[] };
type RoleRow = {
  id: number; key: string; name: string; description: string | null;
  is_system: boolean; is_active: boolean;
  admin_count: number; permission_count: number;
  created_at: string | null; updated_at: string | null;
};
type AdminRow = {
  id: number; name: string; username: string; email: string; avatar: string | null;
  role: string; admin_role: { id: number; key: string; name: string } | null;
  status: string; permission_count: number; override_count: number;
  last_active_at: string | null; admin_since: string | null; created_at: string | null;
};
type SearchUser = {
  id: number; name: string; username: string; email: string;
  avatar: string | null; role: string; is_admin: boolean;
};

const TABS = [
  { key: "overview",   label: "Overview",       icon: Shield },
  { key: "admins",     label: "Administrators", icon: Users },
  { key: "roles",      label: "Roles",          icon: UserCheck },
  { key: "matrix",     label: "Permission Matrix", icon: Grid3x3 },
  { key: "activity",   label: "Activity",       icon: Activity },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "bg-[#fff0f4] text-[#F5074D] border-[#ffd9e2]" },
  disabled:  { label: "Disabled",  cls: "bg-[#F2F4F7] text-[#667085] border-[#E4E7EC]" },
  suspended: { label: "Suspended", cls: "bg-[#F2F4F7] text-[#667085] border-[#E4E7EC]" },
  pending:   { label: "Pending",   cls: "bg-[#F2F4F7] text-[#667085] border-[#E4E7EC]" },
};

function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>{m.label}</span>;
}

function Avatar({ src, name, size = 32 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-[#F2F4F7] font-bold text-[#667085]"
        style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {(name?.[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setFailed(true)}
    className="shrink-0 rounded-full bg-[#F2F4F7] object-cover" style={{ width: size, height: size }} />;
}

function Modal({ open, title, children, onClose, wide }: {
  open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-bold text-[#101828]">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[#667085] transition-colors hover:bg-[#F2F4F7]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Permission picker, shared by create and edit ──────────────────────── */
function PermissionPicker({ categories, selected, onChange }: {
  categories: PermCategory[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [confirmCat, setConfirmCat] = useState<PermCategory | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return categories;
    return categories
      .map(c => ({ ...c, permissions: c.permissions.filter(p =>
        p.label.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle)) }))
      .filter(c => c.permissions.length > 0);
  }, [categories, q]);

  const has = (k: string) => selected.includes(k);
  const toggle = (k: string) =>
    onChange(has(k) ? selected.filter(x => x !== k) : [...selected, k]);

  const selectAll = (c: PermCategory) => {
    // Granting a whole category of sensitive capabilities in one click is the
    // kind of thing that should be deliberate, so it asks first.
    if (c.permissions.some(p => p.sensitive)) { setConfirmCat(c); return; }
    onChange([...new Set([...selected, ...c.permissions.map(p => p.key)])]);
  };
  const clearAll = (c: PermCategory) =>
    onChange(selected.filter(k => !c.permissions.some(p => p.key === k)));

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search permissions…"
          className="h-9 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] pl-9 pr-3 text-[13px] outline-none transition focus:border-[#F5074D] focus:ring-2 focus:ring-[#F5074D]/15" />
      </div>

      <p className="mb-3 text-[12px] text-[#667085]">
        <span className="font-bold text-[#101828] tabular-nums">{selected.length}</span> permission{selected.length === 1 ? "" : "s"} selected
      </p>

      <div className="space-y-3">
        {filtered.map(c => {
          const inCat = c.permissions.filter(p => has(p.key)).length;
          return (
            <div key={c.key} className="rounded-[12px] border border-[#E4E7EC]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E7EC] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-bold text-[#101828]">{c.label}</p>
                  <span className="rounded-full bg-[#F2F4F7] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#667085]">
                    {inCat}/{c.permissions.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => selectAll(c)} className="text-[11px] font-semibold text-[#F5074D] hover:underline">Select all</button>
                  <span className="text-[#E4E7EC]">·</span>
                  <button onClick={() => clearAll(c)} className="text-[11px] font-semibold text-[#667085] hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid gap-x-4 p-2 sm:grid-cols-2">
                {c.permissions.map(p => (
                  <label key={p.key}
                    className="flex cursor-pointer items-start gap-2 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-[#F6F7F9]">
                    <input type="checkbox" checked={has(p.key)} onChange={() => toggle(p.key)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[#D0D5DD] text-[#F5074D] focus:ring-[#F5074D]/30" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] text-[#101828]">{p.label}</span>
                      <span className="block truncate font-mono text-[10px] text-[#98A2B3]">{p.key}</span>
                    </span>
                    {p.sensitive && <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#F5074D]" />}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-[12px] text-[#667085]">No permissions match “{q}”.</p>
        )}
      </div>

      <Modal open={!!confirmCat} title={`Grant all ${confirmCat?.label} permissions?`} onClose={() => setConfirmCat(null)}>
        <p className="text-[13px] leading-relaxed text-[#667085]">
          This category includes sensitive capabilities — access to money, credentials, account
          security or the permission system itself. Grant the whole category only if this role
          genuinely needs all of it.
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setConfirmCat(null)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => {
            if (confirmCat) onChange([...new Set([...selected, ...confirmCat.permissions.map(p => p.key)])]);
            setConfirmCat(null);
          }}>Grant all</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function AdminRolesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data: overview } = useQuery({ queryKey: ["rbac-overview"], queryFn: adminService.rbacOverview });
  const { data: permData } = useQuery({ queryKey: ["rbac-permissions"], queryFn: adminService.rbacPermissions });
  const categories: PermCategory[] = permData?.categories ?? [];

  const invalidateAll = () => {
    ["rbac-overview", "rbac-roles", "rbac-admins", "rbac-matrix", "rbac-activity"].forEach(k =>
      qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <AdminShell title="Admin Roles">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fff0f4] text-[#F5074D]">
              <Shield className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#101828]">Admin Roles</h2>
              <p className="text-[13px] text-[#667085]">Who has administrative access, what they can do, and who changed it.</p>
            </div>
          </div>
        </div>

        {/* ── Dashboard counters ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Administrators", value: overview?.administrators?.total,     icon: <Users className="h-[15px] w-[15px]" /> },
            { label: "Active",         value: overview?.administrators?.active,    icon: <Power className="h-[15px] w-[15px]" /> },
            { label: "Disabled",       value: overview?.administrators?.disabled,  icon: <Ban className="h-[15px] w-[15px]" /> },
            { label: "Suspended",      value: overview?.administrators?.suspended, icon: <Clock className="h-[15px] w-[15px]" /> },
            { label: "Roles",          value: overview?.roles?.total,              icon: <UserCheck className="h-[15px] w-[15px]" /> },
            { label: "Custom roles",   value: overview?.roles?.custom,             icon: <KeyRound className="h-[15px] w-[15px]" /> },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-3 rounded-2xl border border-[#E4E7EC] bg-white p-4 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F2F4F7] text-[#667085]">{c.icon}</span>
              <div className="min-w-0">
                <p className="truncate text-[11px] text-[#667085]">{c.label}</p>
                <p className="text-[19px] font-black leading-tight tabular-nums text-[#101828]">{c.value ?? "—"}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-[#F2F4F7] p-0.5">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                  tab === t.key ? "bg-white text-[#101828] shadow-sm" : "text-[#667085] hover:text-[#101828]"
                }`}>
                <Icon className="h-3.5 w-3.5" />{t.label}
              </button>
            );
          })}
        </div>

        {tab === "overview" && <OverviewTab overview={overview} categories={categories} onGo={setTab} />}
        {tab === "admins"   && <AdministratorsTab categories={categories} onChanged={invalidateAll} />}
        {tab === "roles"    && <RolesTab categories={categories} onChanged={invalidateAll} />}
        {tab === "matrix"   && <MatrixTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </AdminShell>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────── */
function OverviewTab({ overview, categories, onGo }: {
  overview: { permissions?: { total: number; categories: number } } | undefined;
  categories: PermCategory[]; onGo: (t: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-sm">
        <div className="border-b border-[#E4E7EC] px-5 py-3.5">
          <h3 className="text-[13px] font-bold text-[#101828]">How access works here</h3>
        </div>
        <div className="space-y-3 p-5 text-[12.5px] leading-relaxed text-[#667085]">
          <p>
            An administrator is an existing Teezer account that has been given a role. There is no
            separate admin login and no second password — the person signs in as themselves, so there
            is one credential to protect and one set of sessions to revoke.
          </p>
          <p>
            A role carries a set of permissions. Individual grants or denials can be layered on top of
            a role for one person, and a denial always wins.
          </p>
          <p>
            <span className="font-semibold text-[#101828]">Super Admin</span> holds every permission by
            design rather than by a stored list, so it never falls behind as new permissions are added.
            The platform always keeps at least one.
          </p>
          <p className="rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 py-2">
            Permissions are enforced by the API, not by this page. Hiding a button here does not protect
            the endpoint behind it — every admin route checks the permission itself.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-5 py-3.5">
          <h3 className="text-[13px] font-bold text-[#101828]">Permission catalogue</h3>
          <span className="rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#667085]">
            {overview?.permissions?.total ?? categories.reduce((a, c) => a + c.permissions.length, 0)}
          </span>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E7EC] bg-[#F6F7F9] px-2.5 py-1">
                <span className="text-[12px] font-medium text-[#101828]">{c.label}</span>
                <span className="rounded-full bg-white px-1.5 text-[10.5px] font-bold tabular-nums text-[#667085]">
                  {c.permissions.length}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onGo("admins")}><Users className="h-3.5 w-3.5" /> Administrators</Button>
            <Button size="sm" variant="outline" onClick={() => onGo("roles")}><UserCheck className="h-3.5 w-3.5" /> Roles</Button>
            <Button size="sm" variant="outline" onClick={() => onGo("matrix")}><Grid3x3 className="h-3.5 w-3.5" /> Matrix</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Administrators ────────────────────────────────────────────────────── */
function AdministratorsTab({ categories, onChanged }: { categories: PermCategory[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [roleId, setRoleId] = useState("");
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(t); }, [qInput]);

  const params = { ...(q && { q }), ...(status && { status }), ...(roleId && { role_id: roleId }) };
  const { data, isLoading } = useQuery({
    queryKey: ["rbac-admins", params],
    queryFn:  () => adminService.rbacAdmins(params),
  });
  const { data: roles } = useQuery({ queryKey: ["rbac-roles", {}], queryFn: () => adminService.rbacRoles() });

  const admins: AdminRow[] = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] px-5 py-3.5">
          <div>
            <h3 className="text-[13px] font-bold text-[#101828]">Administrators</h3>
            <p className="text-[11.5px] text-[#667085]">Staff accounts, roles and access.</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Add administrator
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E7EC] px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#667085]" />
            <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Search username or email…"
              className="h-8 w-56 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] pl-7 pr-2 text-[12px] outline-none transition focus:border-[#F5074D]" />
          </div>
          <select value={roleId} onChange={e => setRoleId(e.target.value)}
            className="h-8 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] px-2 text-[12px] text-[#344054] outline-none focus:border-[#F5074D]">
            <option value="">All roles</option>
            {(roles ?? []).map((r: RoleRow) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="h-8 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] px-2 text-[12px] text-[#344054] outline-none focus:border-[#F5074D]">
            <option value="">All statuses</option>
            {["active", "disabled", "suspended", "pending"].map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <span className="ml-auto rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#667085]">
            {data?.meta?.total ?? 0}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-[#E4E7EC] bg-[#F6F7F9]">
                {["Administrator", "Role", "Permissions", "Status", "Last active", ""].map((h, i) => (
                  <th key={h || i} className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#667085] ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-3.5"><div className="h-8 w-40 animate-pulse rounded bg-[#F2F4F7]" /></td>
                  <td className="px-5 py-3.5"><div className="h-3 w-20 animate-pulse rounded bg-[#F2F4F7]" /></td>
                  <td className="px-5 py-3.5"><div className="ml-auto h-3 w-10 animate-pulse rounded bg-[#F2F4F7]" /></td>
                  <td className="px-5 py-3.5"><div className="h-3 w-14 animate-pulse rounded bg-[#F2F4F7]" /></td>
                  <td className="px-5 py-3.5"><div className="h-3 w-16 animate-pulse rounded bg-[#F2F4F7]" /></td>
                  <td />
                </tr>
              )) : admins.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#F2F4F7] text-[#667085]"><Users className="h-5 w-5" /></span>
                  <p className="mt-3 text-[13px] font-semibold text-[#344054]">No administrators match</p>
                </td></tr>
              ) : admins.map(a => (
                <tr key={a.id} className="transition-colors hover:bg-[#FAFBFC]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={a.avatar} name={a.name || a.username} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#101828]">{a.name || a.username}</p>
                        <p className="truncate text-[11px] text-[#667085]">@{a.username} · {a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#E4E7EC] bg-[#F6F7F9] px-2 py-0.5 text-[11.5px] font-semibold text-[#344054]">
                      {a.role === "super_admin" && <Shield className="h-3 w-3 text-[#F5074D]" />}
                      {a.admin_role?.name ?? (a.role === "super_admin" ? "Super Admin" : "No role")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-[13px] font-bold tabular-nums text-[#101828]">{a.permission_count}</span>
                    {a.override_count > 0 && (
                      <span className="ml-1 text-[10.5px] text-[#667085]">+{a.override_count} override</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5"><StatusChip status={a.status} /></td>
                  <td className="px-5 py-3.5 text-[11.5px] text-[#667085]">
                    {a.last_active_at ? timeAgo(a.last_active_at) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setDetailId(a.id)}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#F5074D] hover:underline">
                      Manage <ChevronRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddAdministratorModal roles={roles ?? []} onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["rbac-admins"] }); onChanged(); }} />
      )}
      {detailId && (
        <AdministratorDrawer id={detailId} roles={roles ?? []} categories={categories}
          onClose={() => setDetailId(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["rbac-admins"] }); onChanged(); }} />
      )}
    </div>
  );
}

/* ── Add administrator ─────────────────────────────────────────────────── */
function AddAdministratorModal({ roles, onClose, onDone }: {
  roles: RoleRow[]; onClose: () => void; onDone: () => void;
}) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<SearchUser | null>(null);
  const [roleId, setRoleId] = useState<string>("");

  useEffect(() => { const t = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(t); }, [qInput]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["rbac-user-search", q],
    queryFn:  () => adminService.rbacSearchUsers(q),
    enabled:  q.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: () => adminService.rbacCreateAdmin({ user_id: picked!.id, role_id: Number(roleId) }),
    onSuccess: (r) => { toast.success(r?.message ?? "Administrator added"); onDone(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? "Could not add administrator"),
  });

  const role = roles.find(r => String(r.id) === roleId);
  const isSuper = role?.key === "super_admin";

  return (
    <Modal open title="Add administrator" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Find an existing Teezer user</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]" />
            <input value={qInput} onChange={e => { setQInput(e.target.value); setPicked(null); }}
              placeholder="Username, email or user ID…"
              className="h-10 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] pl-9 pr-3 text-[13px] outline-none transition focus:border-[#F5074D] focus:ring-2 focus:ring-[#F5074D]/15" />
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#667085]">
            Administrators are existing accounts given a role — no second login is created.
          </p>
        </div>

        {picked ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#F5074D]/30 bg-[#fff0f4] p-3">
            <Avatar src={picked.avatar} name={picked.name || picked.username} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-[#101828]">{picked.name || picked.username}</p>
              <p className="truncate text-[11.5px] text-[#667085]">@{picked.username} · {picked.email}</p>
            </div>
            <button onClick={() => setPicked(null)} className="rounded-lg p-1 text-[#667085] hover:bg-white"><X className="h-4 w-4" /></button>
          </div>
        ) : q.trim().length >= 2 && (
          <div className="max-h-56 overflow-y-auto rounded-[12px] border border-[#E4E7EC]">
            {isFetching ? (
              <p className="py-6 text-center text-[12px] text-[#667085]">Searching…</p>
            ) : (results ?? []).length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[#667085]">No users found.</p>
            ) : (results ?? []).map((u: SearchUser) => (
              <button key={u.id} onClick={() => setPicked(u)}
                className="flex w-full items-center gap-3 border-b border-[#F2F4F7] px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-[#F6F7F9]">
                <Avatar src={u.avatar} name={u.name || u.username} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-[#101828]">{u.name || u.username}</p>
                  <p className="truncate text-[11px] text-[#667085]">@{u.username} · {u.email}</p>
                </div>
                {u.is_admin && (
                  <span className="shrink-0 rounded-full border border-[#E4E7EC] bg-[#F2F4F7] px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-[#667085]">
                    Already admin
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Role</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)}
            className="h-10 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-[13px] text-[#101828] outline-none focus:border-[#F5074D]">
            <option value="">Select a role…</option>
            {roles.filter(r => r.is_active).map(r => (
              <option key={r.id} value={r.id}>{r.name} — {r.permission_count} permissions</option>
            ))}
          </select>
          {role && <p className="mt-1.5 text-[11.5px] text-[#667085]">{role.description}</p>}
        </div>

        {isSuper && (
          <div className="flex items-start gap-2 rounded-[12px] border border-[#ffd9e2] bg-[#fff0f4] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F5074D]" />
            <p className="text-[12px] leading-relaxed text-[#7a1229]">
              Super Admin grants complete control of the platform, including the ability to remove
              other administrators. Only a Super Admin can grant this.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-[#E4E7EC] pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!picked || !roleId || save.isPending}
            onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Grant access
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Administrator detail ──────────────────────────────────────────────── */
function AdministratorDrawer({ id, roles, categories, onClose, onDone }: {
  id: number; roles: RoleRow[]; categories: PermCategory[]; onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["rbac-admin", id], queryFn: () => adminService.rbacAdmin(id) });
  const [roleId, setRoleId] = useState<string>("");
  const [confirmRole, setConfirmRole] = useState<RoleRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => { if (data?.admin_role?.id) setRoleId(String(data.admin_role.id)); }, [data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["rbac-admin", id] }); onDone(); };

  const update = useMutation({
    mutationFn: (body: unknown) => adminService.rbacUpdateAdmin(id, body),
    onSuccess: (r) => { toast.success(r?.message ?? "Updated"); setConfirmRole(null); refresh(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? "Update refused"),
  });
  const remove = useMutation({
    mutationFn: () => adminService.rbacRemoveAdmin(id),
    onSuccess: (r) => { toast.success(r?.message ?? "Access revoked"); setConfirmRemove(false); onClose(); onDone(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? "Could not revoke access"),
  });
  const revoke = useMutation({
    mutationFn: () => adminService.rbacRevokeSessions(id),
    onSuccess: (r) => { toast.success(r?.message ?? "Sessions revoked"); refresh(); },
    onError: () => toast.error("Could not revoke sessions"),
  });

  const currentRole = roles.find(r => String(r.id) === roleId);
  const changedRole = data?.admin_role?.id ? String(data.admin_role.id) !== roleId : !!roleId;

  return (
    <Modal open title={isLoading ? "Loading…" : `${data?.name || data?.username}`} onClose={onClose} wide>
      {isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[10px] bg-[#F2F4F7]" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar src={data.avatar} name={data.name || data.username} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-[#101828]">{data.name || data.username}</p>
              <p className="truncate text-[12px] text-[#667085]">@{data.username} · {data.email}</p>
            </div>
            <StatusChip status={data.status} />
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Role</label>
            <div className="flex flex-wrap gap-2">
              <select value={roleId} onChange={e => setRoleId(e.target.value)}
                className="h-9 flex-1 rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-[13px] text-[#101828] outline-none focus:border-[#F5074D]">
                <option value="">No role</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button size="sm" variant="primary" disabled={!changedRole || update.isPending}
                onClick={() => setConfirmRole(currentRole ?? null)}>Change role</Button>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Administrative status</label>
            <div className="flex flex-wrap gap-1.5">
              {["active", "disabled", "suspended"].map(s => (
                <Button key={s} size="sm" variant={data.status === s ? "primary" : "outline"}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ status: s })}>
                  {STATUS_META[s].label}
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#667085]">
              Disabling or suspending ends their admin sessions immediately. Their ordinary Teezer
              account keeps working either way.
            </p>
          </div>

          {/* Effective permissions */}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-[#344054]">
              Effective permissions
              <span className="ml-1.5 rounded-full bg-[#F2F4F7] px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-[#667085]">
                {data.effective?.length ?? 0}
              </span>
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-[12px] border border-[#E4E7EC] p-2">
              {(data.by_category ?? []).map((c: { key: string; label: string; total: number; granted: number; items: { key: string; label: string; granted: boolean; source: string; sensitive: boolean }[] }) => (
                <details key={c.key} className="rounded-[10px] bg-[#F6F7F9] px-3 py-2">
                  <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-semibold text-[#101828]">
                    {c.label}
                    <span className="tabular-nums text-[11px] font-bold text-[#667085]">{c.granted}/{c.total}</span>
                  </summary>
                  <div className="mt-2 space-y-1">
                    {c.items.map(i => (
                      <div key={i.key} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className={i.granted ? "text-[#101828]" : "text-[#98A2B3]"}>{i.label}</span>
                        {i.granted ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#F5074D]">
                            <Check className="h-3 w-3" />{i.source === "override" ? "Override" : "Role"}
                          </span>
                        ) : i.source === "denied" ? (
                          <span className="text-[10px] font-bold text-[#667085]">Denied</span>
                        ) : <span className="text-[10px] text-[#D0D5DD]">—</span>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Sessions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-[#344054]">
                Admin sessions
                <span className="ml-1.5 rounded-full bg-[#F2F4F7] px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-[#667085]">
                  {data.sessions?.length ?? 0}
                </span>
              </p>
              {(data.sessions?.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
                  Revoke all
                </Button>
              )}
            </div>
            {(data.sessions?.length ?? 0) === 0 ? (
              <p className="rounded-[10px] bg-[#F6F7F9] px-3 py-2.5 text-[12px] text-[#667085]">Not signed in anywhere.</p>
            ) : (
              <div className="space-y-1">
                {data.sessions.map((s: { id: number; name: string; last_used_at: string | null }) => (
                  <div key={s.id} className="flex items-center justify-between rounded-[10px] bg-[#F6F7F9] px-3 py-2">
                    <span className="truncate text-[12px] text-[#101828]">{s.name || "Session"}</span>
                    <span className="shrink-0 text-[10.5px] text-[#667085]">
                      {s.last_used_at ? timeAgo(s.last_used_at) : "never used"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2.5 border-t border-[#E4E7EC] pt-4">
            <Button variant="danger" size="sm" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Revoke admin access
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      {/* Role-change confirmation states what actually changes. */}
      <Modal open={!!confirmRole} title="Confirm role change" onClose={() => setConfirmRole(null)}>
        <p className="text-[13px] leading-relaxed text-[#667085]">
          Changing <span className="font-semibold text-[#101828]">@{data?.username}</span> from{" "}
          <span className="font-semibold text-[#101828]">{data?.admin_role?.name ?? "no role"}</span> to{" "}
          <span className="font-semibold text-[#101828]">{confirmRole?.name}</span>.
        </p>
        {confirmRole?.key === "super_admin" && (
          <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-[#ffd9e2] bg-[#fff0f4] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F5074D]" />
            <p className="text-[12px] leading-relaxed text-[#7a1229]">
              Super Admin grants complete control, including removing other administrators and changing
              anyone&apos;s access.
            </p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setConfirmRole(null)}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={update.isPending}
            onClick={() => update.mutate({ role_id: Number(roleId) })}>
            {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirm change
          </Button>
        </div>
      </Modal>

      <Modal open={confirmRemove} title="Revoke administrative access?" onClose={() => setConfirmRemove(false)}>
        <p className="text-[13px] leading-relaxed text-[#667085]">
          @{data?.username} stops being staff and their admin sessions end. Their ordinary Teezer
          account, content and history are untouched.
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          <Button variant="danger" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Revoke access
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}

/* ── Roles ─────────────────────────────────────────────────────────────── */
function RolesTab({ categories, onChanged }: { categories: PermCategory[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [dupRole, setDupRole] = useState<RoleRow | null>(null);
  const [delRole, setDelRole] = useState<RoleRow | null>(null);

  const { data: roles, isLoading } = useQuery({ queryKey: ["rbac-roles", {}], queryFn: () => adminService.rbacRoles() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["rbac-roles"] }); onChanged(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-[#667085]">System roles ship with Teezer and cannot be deleted. Custom roles are yours.</p>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Create role</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-[#E4E7EC] bg-white shadow-sm" />
        )) : (roles ?? []).map((r: RoleRow) => (
          <div key={r.id} className="flex flex-col rounded-2xl border border-[#E4E7EC] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[14px] font-bold text-[#101828]">{r.name}</p>
                  {r.is_system && (
                    <span className="rounded-full border border-[#E4E7EC] bg-[#F2F4F7] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#667085]">System</span>
                  )}
                  {!r.is_active && (
                    <span className="rounded-full border border-[#E4E7EC] bg-[#F2F4F7] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#667085]">Disabled</span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[#667085]">{r.description}</p>
              </div>
              {r.key === "super_admin" && <Shield className="h-4 w-4 shrink-0 text-[#F5074D]" />}
            </div>

            <div className="mt-3 flex items-center gap-4 border-t border-[#F2F4F7] pt-3">
              <div>
                <p className="text-[10.5px] text-[#667085]">Administrators</p>
                <p className="text-[15px] font-black tabular-nums text-[#101828]">{r.admin_count}</p>
              </div>
              <div>
                <p className="text-[10.5px] text-[#667085]">Permissions</p>
                <p className="text-[15px] font-black tabular-nums text-[#101828]">{r.permission_count}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setEditId(r.id)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setDupRole(r)}><Copy className="h-3 w-3" /> Duplicate</Button>
              {!r.is_system && (
                <Button size="sm" variant="ghost" onClick={() => setDelRole(r)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {creating && <RoleEditor categories={categories} onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}
      {editId && <RoleEditor roleId={editId} categories={categories} onClose={() => setEditId(null)} onDone={() => { setEditId(null); refresh(); }} />}
      {dupRole && <DuplicateRoleModal role={dupRole} onClose={() => setDupRole(null)} onDone={() => { setDupRole(null); refresh(); }} />}
      {delRole && <DeleteRoleModal role={delRole} roles={roles ?? []} onClose={() => setDelRole(null)} onDone={() => { setDelRole(null); refresh(); }} />}
    </div>
  );
}

function RoleEditor({ roleId, categories, onClose, onDone }: {
  roleId?: number; categories: PermCategory[]; onClose: () => void; onDone: () => void;
}) {
  const editing = typeof roleId === "number";
  const { data: role, isLoading } = useQuery({
    queryKey: ["rbac-role", roleId],
    queryFn:  () => adminService.rbacRole(roleId!),
    enabled:  editing,
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [active, setActive] = useState(true);
  const [perms, setPerms] = useState<string[]>([]);

  useEffect(() => {
    if (!role) return;
    setName(role.name); setDesc(role.description ?? "");
    setActive(role.is_active); setPerms(role.permissions ?? []);
  }, [role]);

  const isSuper = role?.key === "super_admin";

  const save = useMutation({
    mutationFn: () => editing
      ? adminService.rbacUpdateRole(roleId!, { name, description: desc, is_active: active, permissions: perms })
      : adminService.rbacCreateRole({ name, description: desc, is_active: active, permissions: perms }),
    onSuccess: (r) => { toast.success(r?.message ?? "Saved"); onDone(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? "Could not save role"),
  });

  return (
    <Modal open title={editing ? "Edit role" : "Create role"} onClose={onClose} wide>
      {editing && isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[10px] bg-[#F2F4F7]" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Role name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Community Manager"
                className="h-10 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-[13px] outline-none transition focus:border-[#F5074D] focus:ring-2 focus:ring-[#F5074D]/15" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Status</label>
              <div className="flex items-center gap-2 pt-1.5">
                <button type="button" role="switch" aria-checked={active} onClick={() => setActive(!active)}
                  disabled={isSuper}
                  className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${active ? "bg-[#F5074D]" : "bg-[#D0D5DD]"}`}>
                  <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-all ${active ? "left-[23px]" : "left-[3px]"}`} />
                </button>
                <span className="text-[12.5px] font-semibold text-[#344054]">{active ? "Active" : "Disabled"}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this role is for"
              className="h-10 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-[13px] outline-none transition focus:border-[#F5074D] focus:ring-2 focus:ring-[#F5074D]/15" />
          </div>

          {isSuper ? (
            <div className="flex items-start gap-2 rounded-[12px] border border-[#ffd9e2] bg-[#fff0f4] px-3 py-2.5">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#F5074D]" />
              <p className="text-[12px] leading-relaxed text-[#7a1229]">
                Super Admin holds every permission by design rather than by a stored list, so it never
                falls behind as new permissions are added. Its permissions cannot be edited.
              </p>
            </div>
          ) : (
            <PermissionPicker categories={categories} selected={perms} onChange={setPerms} />
          )}

          <div className="flex justify-end gap-2.5 border-t border-[#E4E7EC] pt-4">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? "Save role" : "Create role"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DuplicateRoleModal({ role, onClose, onDone }: { role: RoleRow; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(`${role.name} copy`);
  const [copy, setCopy] = useState(true);
  const save = useMutation({
    mutationFn: () => adminService.rbacDuplicateRole(role.id, { name, copy_permissions: copy }),
    onSuccess: (r) => { toast.success(r?.message ?? "Role duplicated"); onDone(); },
    onError: () => toast.error("Could not duplicate role"),
  });

  return (
    <Modal open title={`Duplicate ${role.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">New role name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="h-10 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-[13px] outline-none focus:border-[#F5074D]" />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={copy} onChange={() => setCopy(!copy)}
            className="h-3.5 w-3.5 rounded border-[#D0D5DD] text-[#F5074D] focus:ring-[#F5074D]/30" />
          <span className="text-[12.5px] text-[#344054]">Copy its {role.permission_count} permissions</span>
        </label>
        <p className="text-[11.5px] text-[#667085]">The copy is always a custom role, even when duplicated from a system one.</p>
        <div className="flex justify-end gap-2.5 border-t border-[#E4E7EC] pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create duplicate
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteRoleModal({ role, roles, onClose, onDone }: {
  role: RoleRow; roles: RoleRow[]; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<"reassign" | "disable">("reassign");
  const [target, setTarget] = useState("");
  const save = useMutation({
    mutationFn: () => adminService.rbacDeleteRole(role.id, { mode, reassign_to: target ? Number(target) : null }),
    onSuccess: (r) => { toast.success(r?.message ?? "Role deleted"); onDone(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? "Could not delete role"),
  });

  return (
    <Modal open title={`Delete ${role.name}?`} onClose={onClose}>
      {role.admin_count > 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-[#667085]">
            This role is assigned to <span className="font-bold text-[#101828] tabular-nums">{role.admin_count}</span>{" "}
            administrator{role.admin_count === 1 ? "" : "s"}. Choose what happens to them — access is never
            removed silently.
          </p>
          <label className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-[#E4E7EC] p-3">
            <input type="radio" checked={mode === "reassign"} onChange={() => setMode("reassign")} className="mt-0.5 text-[#F5074D]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-[#101828]">Reassign to another role</span>
              <select value={target} onChange={e => setTarget(e.target.value)} disabled={mode !== "reassign"}
                className="mt-2 h-9 w-full rounded-[10px] border border-[#E4E7EC] bg-[#F6F7F9] px-2 text-[12.5px] outline-none focus:border-[#F5074D] disabled:opacity-50">
                <option value="">Select a role…</option>
                {roles.filter(r => r.id !== role.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-[#E4E7EC] p-3">
            <input type="radio" checked={mode === "disable"} onChange={() => setMode("disable")} className="mt-0.5 text-[#F5074D]" />
            <span>
              <span className="block text-[12.5px] font-semibold text-[#101828]">Disable their administrative access</span>
              <span className="block text-[11.5px] text-[#667085]">Their Teezer accounts stay intact.</span>
            </span>
          </label>
        </div>
      ) : (
        <p className="text-[13px] text-[#667085]">No administrators hold this role, so nothing else changes.</p>
      )}
      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="danger" size="sm"
          disabled={save.isPending || (role.admin_count > 0 && mode === "reassign" && !target)}
          onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete role
        </Button>
      </div>
    </Modal>
  );
}

/* ── Matrix ────────────────────────────────────────────────────────────── */
function MatrixTab() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["rbac-matrix"], queryFn: adminService.rbacMatrix });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = data?.rows ?? [];
    if (!needle) return all;
    return all.filter((r: { label: string; permission: string; category: string }) =>
      r.label.toLowerCase().includes(needle) || r.permission.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] px-5 py-3.5">
        <div>
          <h3 className="text-[13px] font-bold text-[#101828]">Permission matrix</h3>
          <p className="text-[11.5px] text-[#667085]">Every permission against every role.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#667085]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search permissions…"
            className="h-8 w-52 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] pl-7 pr-2 text-[12px] outline-none focus:border-[#F5074D]" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-[#F2F4F7]" />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="sticky top-0">
              <tr className="border-b border-[#E4E7EC] bg-[#F6F7F9]">
                <th className="sticky left-0 z-10 bg-[#F6F7F9] px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#667085]">Permission</th>
                {(data?.roles ?? []).map((r: { id: number; name: string }) => (
                  <th key={r.id} className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[#667085]">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {rows.map((row: { permission: string; label: string; category: string; sensitive: boolean; roles: Record<string, boolean> }) => (
                <tr key={row.permission} className="transition-colors hover:bg-[#FAFBFC]">
                  <td className="sticky left-0 z-10 bg-white px-5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] text-[#101828]">{row.label}</span>
                      {row.sensitive && <ShieldAlert className="h-3 w-3 shrink-0 text-[#F5074D]" />}
                    </div>
                    <span className="font-mono text-[10px] text-[#98A2B3]">{row.permission}</span>
                  </td>
                  {(data?.roles ?? []).map((r: { id: number }) => (
                    <td key={r.id} className="px-3 py-2 text-center">
                      {row.roles[r.id]
                        ? <Check className="mx-auto h-3.5 w-3.5 text-[#F5074D]" />
                        : <span className="text-[#D0D5DD]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Activity ──────────────────────────────────────────────────────────── */
function ActivityTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["rbac-activity", page],
    queryFn:  () => adminService.rbacActivity({ page }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E4E7EC] px-5 py-3.5">
        <div>
          <h3 className="text-[13px] font-bold text-[#101828]">Access activity</h3>
          <p className="text-[11.5px] text-[#667085]">Every role, permission and administrator change.</p>
        </div>
        <span className="rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#667085]">
          {data?.meta?.total ?? 0}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-[#F2F4F7]" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-14 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#F2F4F7] text-[#667085]"><Activity className="h-5 w-5" /></span>
          <p className="mt-3 text-[13px] font-semibold text-[#344054]">No access changes recorded yet</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F2F4F7]">
          {rows.map((l: { id: number; action: string; description: string; severity: string; created_at: string | null; metadata: Record<string, unknown> | null; admin: { username: string; name: string; avatar: string | null } | null }) => (
            <div key={l.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                l.severity === "critical" ? "bg-[#fff0f4] text-[#F5074D]" : "bg-[#F2F4F7] text-[#667085]"}`}>
                <KeyRound className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-[#101828]">{l.description}</p>
                <p className="mt-0.5 text-[11px] text-[#667085]">
                  {l.admin ? `@${l.admin.username}` : "System"}
                  {l.created_at ? ` · ${formatDate(l.created_at)}` : ""}
                  {" · "}<span className="font-mono">{l.action}</span>
                </p>
                {l.metadata && Array.isArray((l.metadata as { added?: string[] }).added) && (
                  <p className="mt-1 text-[11px] text-[#667085]">
                    {((l.metadata as { added?: string[] }).added ?? []).length > 0 && (
                      <span className="mr-2 rounded-full bg-[#fff0f4] px-1.5 py-0.5 font-bold text-[#F5074D]">
                        +{((l.metadata as { added?: string[] }).added ?? []).length} permissions
                      </span>
                    )}
                    {((l.metadata as { removed?: string[] }).removed ?? []).length > 0 && (
                      <span className="rounded-full bg-[#F2F4F7] px-1.5 py-0.5 font-bold text-[#667085]">
                        −{((l.metadata as { removed?: string[] }).removed ?? []).length} permissions
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(data?.meta?.last_page ?? 1) > 1 && (
        <div className="flex items-center justify-between border-t border-[#E4E7EC] px-5 py-3">
          <p className="text-[12px] tabular-nums text-[#667085]">Page {data.meta.current_page} of {data.meta.last_page}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= data.meta.last_page} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
