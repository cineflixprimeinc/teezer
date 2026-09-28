"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { Badge } from "@/admin-panel/components/ui/badge";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading } from "@/admin-panel/components/ui/data-table";
import { api, apiMessage } from "@/admin-panel/services/api";

/**
 * Reelsoo Shop → Deals of the Day.
 *
 * Each deal points at ONE real, existing product (picked via an admin-only
 * cross-shop search - there is still no public "browse all products"
 * endpoint, so this sidesteps that gap entirely rather than needing it).
 * discount_percent is computed server-side from the product's own current
 * price, never something this form sends.
 */

type ProductRef = { name: string; image_url: string | null; price: number; currency: string; shop_name: string | null };
type Deal = {
  id: number;
  product_id: number;
  product: ProductRef | null;
  deal_price: number;
  discount_percent: number;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};
type ProductSearchRow = { id: number; name: string; image_url: string | null; price: number; currency: string; shop_name: string | null };

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";

export default function ShopDealsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Deal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [product, setProduct] = useState<ProductSearchRow | null>(null);
  const [dealPrice, setDealPrice] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-deals"],
    queryFn: () => api.get("/admin/shop/deals").then((r) => r.data.data as Deal[]),
  });

  const search = useQuery({
    queryKey: ["shop-deal-product-search", productQuery],
    queryFn: () => api.get("/admin/shop/products/search", { params: { q: productQuery } }).then((r) => r.data.data as ProductSearchRow[]),
    enabled: formOpen && !product,
  });

  const openCreate = () => {
    setEditing(null);
    setProduct(null);
    setProductQuery("");
    setDealPrice(0);
    setIsActive(true);
    setSortOrder((data?.length ?? 0) + 1);
    setStartsAt("");
    setEndsAt("");
    setErr(null);
    setFormOpen(true);
  };

  const openEdit = (d: Deal) => {
    setEditing(d);
    setProduct(d.product ? { id: d.product_id, ...d.product } : null);
    setProductQuery("");
    setDealPrice(d.deal_price);
    setIsActive(d.is_active);
    setSortOrder(d.sort_order);
    setStartsAt(d.starts_at?.slice(0, 16) ?? "");
    setEndsAt(d.ends_at?.slice(0, 16) ?? "");
    setErr(null);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        product_id: product?.id, deal_price: dealPrice, is_active: isActive, sort_order: sortOrder,
        starts_at: startsAt || null, ends_at: endsAt || null,
      };
      return editing
        ? api.put(`/admin/shop/deals/${editing.id}`, body)
        : api.post("/admin/shop/deals", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-deals"] });
      setFormOpen(false);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shop/deals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-deals"] });
      setDeleting(null);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  return (
    <AdminShell title="Teezer Shop — Deals of the Day">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Deals</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Deal
            </Button>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Product</Th>
              <Th>Deal price</Th>
              <Th>Discount</Th>
              <Th>Window</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading && <TableLoading cols={6} />}
              {!isLoading && !data?.length && <TableEmpty message="No deals yet." />}
              {data?.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-[#111827]">
                    {d.product?.name ?? `#${d.product_id}`}
                    {d.product?.shop_name && <span className="ml-1.5 text-[11px] text-[#9ca3af]">({d.product.shop_name})</span>}
                  </Td>
                  <Td>{d.product?.currency} {d.deal_price.toLocaleString()}</Td>
                  <Td>-{d.discount_percent}%</Td>
                  <Td className="text-[#9ca3af]">
                    {d.ends_at ? `Until ${new Date(d.ends_at).toLocaleDateString()}` : "No end date"}
                  </Td>
                  <Td>
                    <Badge variant={d.is_active ? "success" : "default"}>{d.is_active ? "Active" : "Hidden"}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}>
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
              <CardTitle>{editing ? "Edit Deal" : "New Deal"}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {err && <p className="text-[12px] text-red-600">{err}</p>}

              <div>
                <label className={label}>Product</label>
                {product ? (
                  <div className="flex items-center justify-between rounded-[10px] border border-[#e5e7eb] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[#111827]">{product.name}</p>
                      <p className="text-[11px] text-[#9ca3af]">
                        {product.currency} {product.price.toLocaleString()} — {product.shop_name}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>Change</Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                      <input
                        className={`${input} pl-9`}
                        placeholder="Search products by name…"
                        value={productQuery}
                        onChange={(e) => setProductQuery(e.target.value)}
                      />
                    </div>
                    {search.data && search.data.length > 0 && (
                      <div className="mt-1.5 max-h-48 overflow-auto rounded-[10px] border border-[#e5e7eb]">
                        {search.data.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setProduct(p); setDealPrice(p.price); }}
                            className="flex w-full items-center justify-between border-b border-[#f3f4f6] px-3 py-2 text-left text-[12.5px] last:border-b-0 hover:bg-[#fafafa]"
                          >
                            <span className="truncate text-[#111827]">{p.name}</span>
                            <span className="ml-2 shrink-0 text-[#9ca3af]">{p.currency} {p.price.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className={label}>Deal price</label>
                <input
                  type="number"
                  className={input}
                  value={dealPrice}
                  onChange={(e) => setDealPrice(Number(e.target.value))}
                />
                {product && product.price > 0 && dealPrice > 0 && (
                  <p className="mt-1 text-[11.5px] text-[#9ca3af]">
                    ≈ {Math.max(0, Math.min(99, Math.round((1 - dealPrice / product.price) * 100)))}% off {product.currency} {product.price.toLocaleString()}
                  </p>
                )}
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
                <Button className="flex-1" disabled={!product || !dealPrice || save.isPending} onClick={() => save.mutate()}>
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
        title="Delete deal"
        message={`Remove this deal on "${deleting?.product?.name ?? "this product"}"?`}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}
