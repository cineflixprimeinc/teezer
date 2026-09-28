"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, ImageIcon } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading } from "@/components/ui/data-table";
import { api, apiMessage } from "@/services/api";

/**
 * Reelsoo Shop → Promo Banners.
 *
 * The Shop marketplace home's promo carousel. A banner can be pure
 * gradient + copy (image optional) - see ShopPromoBanner's own doc comment.
 * Update is POST, not PUT, unlike this section's other CRUD pages: PHP does
 * not populate $_FILES on a PUT request, and this form may submit a file.
 */

type Banner = {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  gradient_start: string | null;
  gradient_end: string | null;
  cta_label: string;
  cta_link: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";

export default function ShopPromoBannersPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [gradientStart, setGradientStart] = useState("#F42B5B");
  const [gradientEnd, setGradientEnd] = useState("#FF7A45");
  const [ctaLabel, setCtaLabel] = useState("Shop now");
  const [ctaLink, setCtaLink] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-promo-banners"],
    queryFn: () => api.get("/admin/shop/promo-banners").then((r) => r.data.data as Banner[]),
  });

  const openCreate = () => {
    setEditing(null);
    setTitle(""); setSubtitle(""); setDescription("");
    setGradientStart("#F42B5B"); setGradientEnd("#FF7A45");
    setCtaLabel("Shop now"); setCtaLink("");
    setImageFile(null);
    setIsActive(true);
    setSortOrder((data?.length ?? 0) + 1);
    setStartsAt(""); setEndsAt("");
    setErr(null);
    setFormOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setTitle(b.title); setSubtitle(b.subtitle ?? ""); setDescription(b.description ?? "");
    setGradientStart(b.gradient_start ?? "#F42B5B"); setGradientEnd(b.gradient_end ?? "#FF7A45");
    setCtaLabel(b.cta_label); setCtaLink(b.cta_link ?? "");
    setImageFile(null);
    setIsActive(b.is_active);
    setSortOrder(b.sort_order);
    setStartsAt(b.starts_at?.slice(0, 16) ?? ""); setEndsAt(b.ends_at?.slice(0, 16) ?? "");
    setErr(null);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      setSaving(true);
      const fd = new FormData();
      fd.append("title", title);
      fd.append("subtitle", subtitle);
      fd.append("description", description);
      fd.append("gradient_start", gradientStart);
      fd.append("gradient_end", gradientEnd);
      fd.append("cta_label", ctaLabel);
      fd.append("cta_link", ctaLink);
      fd.append("is_active", isActive ? "1" : "0");
      fd.append("sort_order", String(sortOrder));
      if (startsAt) fd.append("starts_at", startsAt);
      if (endsAt) fd.append("ends_at", endsAt);
      if (imageFile) fd.append("image_file", imageFile);

      const url = editing ? `/admin/shop/promo-banners/${editing.id}` : "/admin/shop/promo-banners";
      return api.post(url, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-promo-banners"] });
      setFormOpen(false);
    },
    onError: (e) => setErr(apiMessage(e)),
    onSettled: () => setSaving(false),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shop/promo-banners/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-promo-banners"] });
      setDeleting(null);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  return (
    <AdminShell title="Teezer Shop — Promo Banners">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Promo Banners</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Banner
            </Button>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Preview</Th>
              <Th>Title</Th>
              <Th>Sort</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading && <TableLoading cols={5} />}
              {!isLoading && !data?.length && <TableEmpty message="No promo banners yet." />}
              {data?.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <div
                      className="flex h-9 w-16 items-center justify-center rounded-[6px] text-[9px] font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${b.gradient_start ?? "#F42B5B"}, ${b.gradient_end ?? "#FF7A45"})` }}
                    >
                      {b.image_url ? <ImageIcon className="h-3.5 w-3.5" /> : "AD"}
                    </div>
                  </Td>
                  <Td className="font-medium text-[#111827]">{b.title}</Td>
                  <Td>{b.sort_order}</Td>
                  <Td>
                    <Badge variant={b.is_active ? "success" : "default"}>{b.is_active ? "Active" : "Hidden"}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(b)}>
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
              <CardTitle>{editing ? "Edit Banner" : "New Banner"}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {err && <p className="text-[12px] text-red-600">{err}</p>}
              <div>
                <label className={label}>Title</label>
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Season Sale" />
              </div>
              <div>
                <label className={label}>Subtitle</label>
                <input className={input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Creator gear, up to 60% off" />
              </div>
              <div>
                <label className={label}>Description (optional)</label>
                <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Verified shops, free delivery over Rs 2,000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Gradient start</label>
                  <input type="color" className="h-10 w-full rounded-[10px] border border-[#e5e7eb]" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Gradient end</label>
                  <input type="color" className="h-10 w-full rounded-[10px] border border-[#e5e7eb]" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={label}>Image (optional - overrides the gradient)</label>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className={input}
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className={label}>Button label</label>
                <input className={input} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
              </div>
              <div>
                <label className={label}>Button link (optional)</label>
                <input className={input} value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://…" />
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
                <Button className="flex-1" disabled={!title.trim() || saving} onClick={() => save.mutate()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={!!deleting}
        title="Delete banner"
        message={`Delete "${deleting?.title}"?`}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}
