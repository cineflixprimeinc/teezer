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
 * Teezer Shop → Categories.
 *
 * The platform-wide taxonomy every shop's product grid filters against - the
 * storefront's [All] [Fashion] [Beauty]... carousel. Not per-shop: sellers
 * pick from this list, they don't define their own.
 */

type Category = {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  // Curation for the Shop marketplace home's category grid - independent of
  // is_active (a category can exist app-wide without being featured there).
  is_featured_home: boolean;
  home_sort_order: number;
};

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";

export default function ShopCategoriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isFeaturedHome, setIsFeaturedHome] = useState(false);
  const [homeSortOrder, setHomeSortOrder] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-categories"],
    queryFn: () => api.get("/admin/shop/categories").then((r) => r.data.data as Category[]),
  });

  const topLevel = data?.filter((c) => !c.parent_id) ?? [];

  const openCreate = () => {
    setEditing(null);
    setName("");
    setParentId(null);
    setSortOrder((data?.length ?? 0) + 1);
    setIsActive(true);
    setIsFeaturedHome(false);
    setHomeSortOrder(0);
    setErr(null);
    setFormOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setParentId(c.parent_id);
    setSortOrder(c.sort_order);
    setIsActive(c.is_active);
    setIsFeaturedHome(c.is_featured_home);
    setHomeSortOrder(c.home_sort_order);
    setErr(null);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name, parent_id: parentId, sort_order: sortOrder, is_active: isActive,
        is_featured_home: isFeaturedHome, home_sort_order: homeSortOrder,
      };
      return editing
        ? api.put(`/admin/shop/categories/${editing.id}`, body)
        : api.post("/admin/shop/categories", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-categories"] });
      setFormOpen(false);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shop/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-categories"] });
      setDeleting(null);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  return (
    <AdminShell title="Teezer Shop — Categories">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Sort</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading && <TableLoading cols={5} />}
              {!isLoading && !data?.length && <TableEmpty message="No categories yet." />}
              {data?.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-[#111827]">
                    {c.parent_id ? <span className="mr-1.5 text-[#c9c5d0]">↳</span> : null}
                    {c.name}
                  </Td>
                  <Td className="text-[#9ca3af]">{c.slug}</Td>
                  <Td>{c.sort_order}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Badge variant={c.is_active ? "success" : "default"}>
                        {c.is_active ? "Active" : "Hidden"}
                      </Badge>
                      {c.is_featured_home && <Badge variant="purple">Featured</Badge>}
                    </div>
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
              <CardTitle>{editing ? "Edit Category" : "New Category"}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {err && <p className="text-[12px] text-red-600">{err}</p>}
              <div>
                <label className={label}>Name</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fashion" />
              </div>
              <div>
                <label className={label}>Parent Category (optional)</label>
                <select
                  className={input}
                  value={parentId ?? ""}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">None — top-level category</option>
                  {topLevel.filter((c) => c.id !== editing?.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Sort Order</label>
                <input
                  type="number"
                  className={input}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#374151]">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (shown in the shop carousel)
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#374151]">
                <input type="checkbox" checked={isFeaturedHome} onChange={(e) => setIsFeaturedHome(e.target.checked)} />
                Featured on Shop home
              </label>
              {isFeaturedHome && (
                <div>
                  <label className={label}>Home sort order</label>
                  <input
                    type="number"
                    className={input}
                    value={homeSortOrder}
                    onChange={(e) => setHomeSortOrder(Number(e.target.value))}
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  disabled={!name.trim() || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={!!deleting}
        title="Delete category"
        message={`Delete "${deleting?.name}"? Products in this category keep their listing but lose the category tag.`}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}
