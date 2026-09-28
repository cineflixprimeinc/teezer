"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading } from "@/components/ui/data-table";
import { api, apiMessage } from "@/services/api";

/**
 * Reelsoo Shop → Marketplace Coupons.
 *
 * Deliberately a separate page/table from the existing /coupons (Monetization
 * → Coupons & Offers) - that one is the platform-wide subscription-plan
 * coupon system, unrelated domain. See ShopCoupon's own doc comment.
 *
 * A "claim" adds the coupon to a user's wallet (mobile/web's Shop home) - it
 * is not a checkout redemption, since there is no marketplace checkout yet
 * to redeem against.
 */

type Type = "percentage" | "fixed" | "free_delivery";
type Coupon = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  type: Type;
  value: number | null;
  min_spend: number | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
};

const TYPE_LABEL: Record<Type, string> = { percentage: "Percentage off", fixed: "Fixed amount off", free_delivery: "Free delivery" };

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";

export default function ShopCouponsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Type>("fixed");
  const [value, setValue] = useState(0);
  const [minSpend, setMinSpend] = useState<number | "">("");
  const [usageLimit, setUsageLimit] = useState<number | "">("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-coupons"],
    queryFn: () => api.get("/admin/shop/coupons").then((r) => r.data.data as Coupon[]),
  });

  const openCreate = () => {
    setEditing(null);
    setCode("");
    setTitle("");
    setDescription("");
    setType("fixed");
    setValue(0);
    setMinSpend("");
    setUsageLimit("");
    setIsActive(true);
    setSortOrder((data?.length ?? 0) + 1);
    setStartsAt("");
    setEndsAt("");
    setErr(null);
    setFormOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setCode(c.code);
    setTitle(c.title);
    setDescription(c.description ?? "");
    setType(c.type);
    setValue(c.value ?? 0);
    setMinSpend(c.min_spend ?? "");
    setUsageLimit(c.usage_limit ?? "");
    setIsActive(c.is_active);
    setSortOrder(c.sort_order);
    setStartsAt(c.starts_at?.slice(0, 16) ?? "");
    setEndsAt(c.ends_at?.slice(0, 16) ?? "");
    setErr(null);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code, title, description: description || null, type,
        value: type === "free_delivery" ? null : value,
        min_spend: minSpend === "" ? null : minSpend,
        usage_limit: usageLimit === "" ? null : usageLimit,
        is_active: isActive, sort_order: sortOrder,
        starts_at: startsAt || null, ends_at: endsAt || null,
      };
      return editing
        ? api.put(`/admin/shop/coupons/${editing.id}`, body)
        : api.post("/admin/shop/coupons", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-coupons"] });
      setFormOpen(false);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shop/coupons/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shop-coupons"] });
      setDeleting(null);
      if (res?.data?.message) setErr(null);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  return (
    <AdminShell title="Teezer Shop — Marketplace Coupons">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Coupons</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Coupon
            </Button>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Code</Th>
              <Th>Offer</Th>
              <Th>Claimed</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading && <TableLoading cols={5} />}
              {!isLoading && !data?.length && <TableEmpty message="No coupons yet." />}
              {data?.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-[12px] font-semibold text-[#111827]">{c.code}</Td>
                  <Td>
                    {c.title}
                    <span className="ml-1.5 text-[11px] text-[#9ca3af]">
                      ({c.type === "percentage" ? `${c.value}%` : c.type === "fixed" ? `Rs ${c.value}` : "free delivery"})
                    </span>
                  </Td>
                  <Td className="text-[#9ca3af]">{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</Td>
                  <Td>
                    <Badge variant={c.is_active ? "success" : "default"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>

        {formOpen && (
          <Card>
            <CardHeader>
              <CardTitle>{editing ? "Edit Coupon" : "New Coupon"}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {err && <p className="text-[12px] text-red-600">{err}</p>}
              <div>
                <label className={label}>Code</label>
                <input className={`${input} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE300" />
              </div>
              <div>
                <label className={label}>Title</label>
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rs 300 off" />
              </div>
              <div>
                <label className={label}>Description (optional)</label>
                <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Min. spend Rs 1,500" />
              </div>
              <div>
                <label className={label}>Type</label>
                <select className={input} value={type} onChange={(e) => setType(e.target.value as Type)}>
                  {(Object.keys(TYPE_LABEL) as Type[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              {type !== "free_delivery" && (
                <div>
                  <label className={label}>{type === "percentage" ? "Percent off" : "Amount off (Rs)"}</label>
                  <input type="number" className={input} value={value} onChange={(e) => setValue(Number(e.target.value))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Min. spend (optional)</label>
                  <input type="number" className={input} value={minSpend} onChange={(e) => setMinSpend(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div>
                  <label className={label}>Claim limit (optional)</label>
                  <input type="number" className={input} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Unlimited" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Starts</label>
                  <input type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Ends</label>
                  <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={label}>Sort Order</label>
                <input type="number" className={input} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#374151]">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" disabled={!code.trim() || !title.trim() || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={!!deleting}
        title="Delete coupon"
        message={`Delete "${deleting?.code}"? If it has already been claimed, it will be deactivated instead so the claim record is kept.`}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}
