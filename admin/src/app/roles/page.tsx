"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ShieldCheck, X, Plus } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { adminService } from "@/services/admin.service";
import { formatCompact, timeAgo } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { apiMessage } from "@/services/api";

/**
 * Per-admin permission chips + grant/revoke - only a viewing super_admin can
 * act (the backend enforces this too, see AdminPermissionController); other
 * viewers just see the read-only chips. Currently one grantable capability
 * exists (manage_country_availability); the catalog drives the "+ Grant"
 * dropdown so a future permission needs no UI change here.
 */
function PermissionsCell({ userId, canManage }: { userId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-permissions-catalog"],
    queryFn: adminService.permissionsCatalog,
  });
  const catalog: Record<string, { label: string; description: string }> = data?.catalog ?? {};
  const grants: { user_id: number; permission: string }[] = data?.grants ?? [];
  const mine = grants.filter((g) => g.user_id === userId).map((g) => g.permission);
  const grantable = Object.keys(catalog).filter((p) => !mine.includes(p));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-permissions-catalog"] });
  const grant = useMutation({
    mutationFn: (permission: string) => adminService.grantPermission(userId, permission),
    onSuccess: () => { toast.success("Permission granted"); invalidate(); setAdding(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (permission: string) => adminService.revokePermission(userId, permission),
    onSuccess: () => { toast.success("Permission revoked"); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {mine.length === 0 && !canManage && <span className="text-[11px] text-[#9ca3af]">-</span>}
      {mine.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">
          {catalog[p]?.label ?? p}
          {canManage && (
            <button onClick={() => revoke.mutate(p)} disabled={revoke.isPending} className="hover:text-red-600">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {canManage && grantable.length > 0 && (
        adding ? (
          <Select
            autoFocus
            className="h-6 px-1 text-[10px]"
            onChange={(e) => { if (e.target.value) grant.mutate(e.target.value); }}
            onBlur={() => setAdding(false)}
            defaultValue=""
          >
            <option value="" disabled>Grant…</option>
            {grantable.map((p) => <option key={p} value={p}>{catalog[p]?.label ?? p}</option>)}
          </Select>
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-[#d1d5db] px-1.5 py-0.5 text-[10px] font-medium text-[#9ca3af] hover:border-[#fe2c55] hover:text-[#fe2c55]">
            <Plus className="h-2.5 w-2.5" /> Grant
          </button>
        )
      )}
    </div>
  );
}

const ROLES = ["user", "creator", "admin", "super_admin"];
const ROLE_PERMISSIONS: Record<string, string[]> = {
  user:        ["dashboard.view"],
  creator:     ["dashboard.view", "studio.access", "monetization.view"],
  admin:       ["dashboard.view", "users.view", "users.edit", "videos.moderate", "reports.manage", "settings.manage"],
  super_admin: ["*"],
};

export default function RolesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const viewer = useAuthStore((s) => s.user);
  const canManagePermissions = viewer?.role === "super_admin";
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ id: number | null; name: string; newRole: string }>({ id: null, name: "", newRole: "" });

  const params = { page, per_page: 20, role: "admin", ...(q && { q }) };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-roles-users", params],
    queryFn:  () => adminService.users(params),
  });

  const admins = data?.data ?? [];
  const meta   = data?.meta ?? {};

  const promote = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => adminService.promoteUser(id, role),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin-roles-users"] }); },
  });

  return (
    <AdminShell title="Admin Roles">
      <div className="space-y-5">

        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Admin Roles & Permissions</h2>
          <p className="text-[13px] text-[#6b7280]">Manage admin accounts and their permission levels.</p>
        </div>

        {/* Role overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { role: "super_admin", label: "Super Admin", color: "#ef4444", desc: "Full platform access" },
            { role: "admin",       label: "Admin",       color: "#8b5cf6", desc: "Manage users & content" },
            { role: "creator",     label: "Creator",     color: "#3b82f6", desc: "Studio + monetization" },
            { role: "user",        label: "User",        color: "#6b7280", desc: "Standard access" },
          ].map(({ role, label, color, desc }) => (
            <Card key={role} className="p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color }} />
                <span className="text-[13px] font-bold" style={{ color }}>{label}</span>
              </div>
              <p className="text-[12px] text-[#9ca3af]">{desc}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(ROLE_PERMISSIONS[role] ?? []).slice(0, 3).map((p) => (
                  <span key={p} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">{p}</span>
                ))}
                {ROLE_PERMISSIONS[role]?.length === 1 && ROLE_PERMISSIONS[role][0] === "*" && (
                  <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">all permissions</span>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Admin users table */}
        <Card>
          <CardHeader>
            <CardTitle>Admin Users</CardTitle>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
              <Input placeholder="Search admins..." value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
            </div>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Admin</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Permissions</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={6} />
                : admins.length === 0
                  ? <TableEmpty message="No admin users found." />
                  : admins.map((a: {
                      id: number; name: string; username: string; email: string;
                      role: string; is_active: boolean; created_at: string;
                    }) => (
                      <Tr key={a.id} onClick={() => router.push(`/users/${a.id}`)}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-purple-50 text-[12px] font-bold text-purple-600">
                              {(a.name?.[0] ?? "A").toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[13px] font-semibold text-[#111827]">{a.name}</p>
                              <p className="text-[11px] text-[#9ca3af]">{a.email}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <Badge variant={a.role === "super_admin" ? "danger" : "purple"} className="capitalize">
                            {a.role.replace("_", " ")}
                          </Badge>
                        </Td>
                        <Td><Badge variant={a.is_active ? "success" : "default"}>{a.is_active ? "Active" : "Inactive"}</Badge></Td>
                        <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(a.created_at)}</span></Td>
                        <Td><PermissionsCell userId={a.id} canManage={canManagePermissions} /></Td>
                        <Td>
                          <Button variant="ghost" size="sm"
                            onClick={(e) => { e.stopPropagation(); router.push(`/users/${a.id}`); }}>
                            View
                          </Button>
                        </Td>
                      </Tr>
                    ))
              }
            </Tbody>
          </Table>
          <Pagination
            currentPage={meta.current_page ?? 1}
            lastPage={meta.last_page ?? 1}
            total={meta.total ?? 0}
            onPage={setPage}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
