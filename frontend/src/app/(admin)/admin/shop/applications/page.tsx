"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertCircle, Ban, RotateCcw, FileText } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { Badge } from "@/admin-panel/components/ui/badge";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading, Pagination } from "@/admin-panel/components/ui/data-table";
import { api, apiMessage } from "@/admin-panel/services/api";

/**
 * Reelsoo Shop → Applications - the "Sell on Reelsoo" review queue.
 *
 * Every status transition here goes through AdminShopController's
 * application endpoints, the only place shops.status can move to/from
 * APPROVED (SellerApplicationController, the seller-facing side, can only
 * ever reach PENDING_REVIEW via its own submit()). The public Shop screen
 * and the profile's Shop/Share button both react to the status this page
 * sets on the very next request - nothing here needs a separate "publish"
 * step or a cache to bust.
 */

type Row = {
  id: number;
  shop_name: string;
  shop_username: string | null;
  owner_username: string | null;
  seller_type: string | null;
  country_code: string | null;
  status: string;
  updated_at: string | null;
};

type Doc = { id: number; document_key: string; status: string; admin_note: string | null; url: string | null; uploaded_at: string };
type Detail = {
  id: number; status: string; seller_type: string | null; country_code: string | null;
  shop_name: string; shop_username: string | null; description: string | null; logo_url: string | null;
  category: string | null; policies: Record<string, unknown> | null;
  owner: { username: string | null; name: string | null; email: string | null };
  legal_data: Record<string, string> | null;
  agreements: Record<string, { version: string; accepted_at: string }> | null;
  admin_note: string | null; submitted_at: string | null;
  documents: Doc[];
  tax_form: { status: string; form_type: string; entity_kind: string } | null;
};

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "pending_review", label: "Pending Review" },
  { key: "needs_information", label: "Needs Information" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default", incomplete: "default", pending_review: "warning", needs_information: "warning",
  approved: "success", rejected: "danger", suspended: "danger",
};

function humanizeKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ShopApplicationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reasonModal, setReasonModal] = useState<"reject" | "request-info" | "suspend" | null>(null);
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["shop-applications", status, q, page],
    queryFn: () =>
      api.get("/admin/shop/applications", { params: { status: status || undefined, q: q || undefined, page } })
        .then((r) => r.data as { data: Row[]; meta: { current_page: number; last_page: number; total: number } }),
  });

  const detail = useQuery({
    queryKey: ["shop-application", selectedId],
    queryFn: () => api.get(`/admin/shop/applications/${selectedId}`).then((r) => r.data.data as Detail),
    enabled: selectedId != null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shop-applications"] });
    qc.invalidateQueries({ queryKey: ["shop-application", selectedId] });
  };

  const approve = useMutation({
    mutationFn: (id: number) => api.post(`/admin/shop/applications/${id}/approve`),
    onSuccess: refresh,
  });
  const reactivate = useMutation({
    mutationFn: (id: number) => api.post(`/admin/shop/applications/${id}/reactivate`),
    onSuccess: refresh,
  });
  const withReason = useMutation({
    mutationFn: (vars: { id: number; action: "reject" | "request-info" | "suspend"; text: string }) => {
      const field = vars.action === "request-info" ? "note" : "reason";
      return api.post(`/admin/shop/applications/${vars.id}/${vars.action}`, { [field]: vars.text });
    },
    onSuccess: () => { refresh(); setReasonModal(null); setReason(""); },
  });
  const reviewDoc = useMutation({
    mutationFn: (vars: { docId: number; status: "approved" | "rejected"; note?: string }) =>
      api.post(`/admin/shop/applications/${selectedId}/documents/${vars.docId}/review`, { status: vars.status, admin_note: vars.note }),
    onSuccess: refresh,
  });

  return (
    <AdminShell title="Teezer Shop — Applications">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Seller Applications</CardTitle>
            <input
              className="w-56 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]"
              placeholder="Search shop or owner…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </CardHeader>
          <div className="flex flex-wrap gap-1.5 border-b border-[#f0f0f0] px-4 py-2.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setStatus(t.key); setPage(1); }}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                  status === t.key ? "bg-[#111827] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Table>
            <Thead>
              <Th>Shop</Th>
              <Th>Owner</Th>
              <Th>Type</Th>
              <Th>Country</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {list.isLoading && <TableLoading cols={5} />}
              {!list.isLoading && !list.data?.data.length && <TableEmpty message="No applications match this filter." />}
              {list.data?.data.map((r) => (
                <Tr key={r.id} onClick={() => setSelectedId(r.id)} className={selectedId === r.id ? "bg-[#fff7f8]" : undefined}>
                  <Td className="font-medium text-[#111827]">
                    {r.shop_name}
                    {r.shop_username && <span className="ml-1.5 text-[#9ca3af]">@{r.shop_username}</span>}
                  </Td>
                  <Td className="text-[#6b7280]">@{r.owner_username}</Td>
                  <Td className="capitalize">{r.seller_type ?? "—"}</Td>
                  <Td>{r.country_code ?? "—"}</Td>
                  <Td><Badge variant={STATUS_VARIANT[r.status] ?? "default"}>{humanizeKey(r.status)}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {list.data?.meta && (
            <Pagination
              currentPage={list.data.meta.current_page}
              lastPage={list.data.meta.last_page}
              total={list.data.meta.total}
              onPage={setPage}
            />
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Application Detail</CardTitle></CardHeader>
          <CardBody className="space-y-5">
            {!selectedId && <p className="text-[13px] text-[#9ca3af]">Select an application to review it.</p>}
            {selectedId && detail.isLoading && <p className="text-[13px] text-[#9ca3af]">Loading…</p>}
            {detail.data && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-bold text-[#111827]">{detail.data.shop_name}</p>
                    <p className="text-[12px] text-[#9ca3af]">@{detail.data.shop_username} · owner @{detail.data.owner.username}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[detail.data.status] ?? "default"}>{humanizeKey(detail.data.status)}</Badge>
                </div>

                {detail.data.status === "pending_review" || detail.data.status === "needs_information" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => approve.mutate(detail.data!.id)} disabled={approve.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setReasonModal("reject")}>
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReasonModal("request-info")}>
                      <AlertCircle className="h-3.5 w-3.5" /> Request Info
                    </Button>
                  </div>
                ) : detail.data.status === "approved" ? (
                  <Button size="sm" variant="danger" onClick={() => setReasonModal("suspend")}>
                    <Ban className="h-3.5 w-3.5" /> Suspend Shop
                  </Button>
                ) : detail.data.status === "suspended" ? (
                  <Button size="sm" onClick={() => reactivate.mutate(detail.data!.id)} disabled={reactivate.isPending}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                  </Button>
                ) : null}

                {detail.data.admin_note && (
                  <div className="rounded-[10px] bg-amber-50 p-3 text-[12.5px] text-amber-800">{detail.data.admin_note}</div>
                )}

                <Section title="Seller Information">
                  {detail.data.legal_data && Object.keys(detail.data.legal_data).length ? (
                    <dl className="space-y-1.5">
                      {Object.entries(detail.data.legal_data).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-[12.5px]">
                          <dt className="text-[#9ca3af]">{humanizeKey(k)}</dt>
                          <dd className="text-right font-medium text-[#111827]">{v || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-[12.5px] text-[#9ca3af]">Not provided yet.</p>}
                </Section>

                <Section title="Verification Documents">
                  {detail.data.documents.length ? (
                    <div className="space-y-2">
                      {detail.data.documents.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-[10px] border border-[#f0f0f0] p-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                            <a href={d.url ?? "#"} target="_blank" rel="noreferrer" className="truncate text-[12.5px] font-medium text-[#111827] underline">
                              {humanizeKey(d.document_key)}
                            </a>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge variant={d.status === "approved" ? "success" : d.status === "rejected" ? "danger" : "warning"}>{humanizeKey(d.status)}</Badge>
                            {d.status !== "approved" && (
                              <button className="text-[11px] font-semibold text-emerald-600" onClick={() => reviewDoc.mutate({ docId: d.id, status: "approved" })}>Approve</button>
                            )}
                            {d.status !== "rejected" && (
                              <button
                                className="text-[11px] font-semibold text-red-600"
                                onClick={() => { const note = window.prompt("Reason for rejecting this document?") ?? ""; reviewDoc.mutate({ docId: d.id, status: "rejected", note }); }}
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12.5px] text-[#9ca3af]">No documents uploaded yet.</p>}
                  {detail.data.tax_form && (
                    <div className="mt-2 flex justify-between text-[12.5px]">
                      <span className="text-[#9ca3af]">Tax Form ({detail.data.tax_form.form_type})</span>
                      <Badge variant={detail.data.tax_form.status === "approved" ? "success" : "warning"}>{detail.data.tax_form.status}</Badge>
                    </div>
                  )}
                </Section>

                <Section title="Agreements">
                  {detail.data.agreements && Object.keys(detail.data.agreements).length ? (
                    <ul className="space-y-1 text-[12.5px] text-[#374151]">
                      {Object.entries(detail.data.agreements).map(([k, v]) => (
                        <li key={k} className="flex justify-between"><span>{humanizeKey(k)}</span><span className="text-[#9ca3af]">{v.accepted_at ? "Accepted" : "—"}</span></li>
                      ))}
                    </ul>
                  ) : <p className="text-[12.5px] text-[#9ca3af]">Not accepted yet.</p>}
                </Section>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmModal
        open={!!reasonModal}
        title={reasonModal === "reject" ? "Reject application" : reasonModal === "request-info" ? "Request more information" : "Suspend shop"}
        message={
          reasonModal === "reject" ? "This will be shown to the seller. Explain what needs to change."
          : reasonModal === "request-info" ? "Tell the seller exactly what's missing - they'll see this note and can resubmit."
          : "The Shop tab and public storefront will disappear immediately for this seller."
        }
        danger={reasonModal !== "request-info"}
        loading={withReason.isPending}
        onConfirm={() => selectedId && reasonModal && withReason.mutate({ id: selectedId, action: reasonModal, text: reason })}
        onCancel={() => { setReasonModal(null); setReason(""); }}
      >
        <textarea
          className="mt-3 w-full rounded-[10px] border border-[#e5e7eb] p-2.5 text-[13px] outline-none focus:border-[#fe2c55]"
          rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={reasonModal === "suspend" ? "Reason (optional)" : "Explain what's needed…"}
        />
      </ConfirmModal>
    </AdminShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#f0f0f0] pt-4">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9ca3af]">{title}</p>
      {children}
    </div>
  );
}
