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
 * Reelsoo Shop → Country Requirements.
 *
 * What "Sell on Reelsoo" asks a seller to fill in/upload, resolved server-side
 * by (country_code, seller_type) - SellerApplicationController reads this
 * table, the mobile wizard never hard-codes a form per country. '*' is the
 * fallback row used for any country without its own explicit row.
 */

const FIELD_OPTIONS = [
  { key: "legal_full_name", label: "Legal Full Name" },
  { key: "date_of_birth", label: "Date of Birth" },
  { key: "residential_address", label: "Residential Address" },
  { key: "phone", label: "Phone Number" },
  { key: "email", label: "Email Address" },
  { key: "id_type", label: "ID Type" },
  { key: "id_number", label: "ID Number" },
  { key: "legal_business_name", label: "Legal Business Name" },
  { key: "business_type", label: "Business Type" },
  { key: "business_registration_number", label: "Business Registration Number" },
  { key: "business_address", label: "Registered Business Address" },
  { key: "business_phone", label: "Business Phone" },
  { key: "business_email", label: "Business Email" },
  { key: "business_website", label: "Website" },
  { key: "authorized_rep_name", label: "Authorized Representative Name" },
  { key: "authorized_rep_dob", label: "Representative Date of Birth" },
  { key: "authorized_rep_position", label: "Representative Position/Role" },
];
const DOCUMENT_OPTIONS = [
  { key: "government_id", label: "Government-issued ID" },
  { key: "business_registration_certificate", label: "Business Registration Certificate" },
  { key: "authorized_rep_id", label: "Authorized Representative's Government ID" },
  { key: "proof_of_address", label: "Proof of Address" },
];

type Requirement = {
  id: number;
  country_code: string;
  seller_type: "individual" | "business";
  required_fields: string[];
  required_documents: string[];
  requires_tax_form: boolean;
};

const input =
  "w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c9c5d0] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10";
const label = "mb-1.5 block text-[12px] font-semibold text-[#374151]";

function CheckList({ options, selected, onToggle }: { options: { key: string; label: string }[]; selected: string[]; onToggle: (key: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 rounded-[10px] border border-[#e5e7eb] p-3 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.key} className="flex items-center gap-2 text-[12.5px] text-[#374151]">
          <input type="checkbox" checked={selected.includes(o.key)} onChange={() => onToggle(o.key)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export default function CountryRequirementsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [sellerType, setSellerType] = useState<"individual" | "business">("individual");
  const [fields, setFields] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [requiresTax, setRequiresTax] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Requirement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["country-seller-requirements"],
    queryFn: () => api.get("/admin/shop/country-requirements").then((r) => r.data.data as Requirement[]),
  });

  const openCreate = () => {
    setEditing(null);
    setCountryCode("");
    setSellerType("individual");
    setFields([]);
    setDocs([]);
    setRequiresTax(false);
    setErr(null);
    setFormOpen(true);
  };

  const openEdit = (r: Requirement) => {
    setEditing(r);
    setCountryCode(r.country_code);
    setSellerType(r.seller_type);
    setFields(r.required_fields);
    setDocs(r.required_documents);
    setRequiresTax(r.requires_tax_form);
    setErr(null);
    setFormOpen(true);
  };

  const toggle = (list: string[], setList: (v: string[]) => void, key: string) =>
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        country_code: countryCode.trim(),
        seller_type: sellerType,
        required_fields: fields,
        required_documents: docs,
        requires_tax_form: requiresTax,
      };
      return editing
        ? api.put(`/admin/shop/country-requirements/${editing.id}`, body)
        : api.post("/admin/shop/country-requirements", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["country-seller-requirements"] });
      setFormOpen(false);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shop/country-requirements/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["country-seller-requirements"] });
      setDeleting(null);
    },
    onError: (e) => setErr(apiMessage(e)),
  });

  return (
    <AdminShell title="Teezer Shop — Country Requirements">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Country Requirements</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Rule
            </Button>
          </CardHeader>
          <Table>
            <Thead>
              <Th>Country</Th>
              <Th>Seller Type</Th>
              <Th>Fields</Th>
              <Th>Documents</Th>
              <Th>Tax Form</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading && <TableLoading cols={6} />}
              {!isLoading && !data?.length && <TableEmpty message="No country requirements configured yet." />}
              {data?.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-[#111827]">{r.country_code === "*" ? "Default (all countries)" : r.country_code}</Td>
                  <Td className="capitalize">{r.seller_type}</Td>
                  <Td className="text-[#6b7280]">{r.required_fields.length} fields</Td>
                  <Td className="text-[#6b7280]">{r.required_documents.length} documents</Td>
                  <Td><Badge variant={r.requires_tax_form ? "warning" : "default"}>{r.requires_tax_form ? "Required" : "Not required"}</Badge></Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
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
              <CardTitle>{editing ? "Edit Requirement" : "New Requirement"}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {err && <p className="text-[12px] text-red-600">{err}</p>}
              <div>
                <label className={label}>Country Code</label>
                <input
                  className={input} value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  placeholder="NP, IN, US... or * for the default"
                  maxLength={2}
                />
              </div>
              <div>
                <label className={label}>Seller Type</label>
                <select className={input} value={sellerType} onChange={(e) => setSellerType(e.target.value as "individual" | "business")}>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <label className={label}>Required Fields</label>
                <CheckList options={FIELD_OPTIONS} selected={fields} onToggle={(k) => toggle(fields, setFields, k)} />
              </div>
              <div>
                <label className={label}>Required Documents</label>
                <CheckList options={DOCUMENT_OPTIONS} selected={docs} onToggle={(k) => toggle(docs, setDocs, k)} />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#374151]">
                <input type="checkbox" checked={requiresTax} onChange={(e) => setRequiresTax(e.target.checked)} />
                Requires tax information (existing Tax Forms system)
              </label>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" disabled={!countryCode.trim() || save.isPending} onClick={() => save.mutate()}>
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
        title="Delete requirement"
        message={`Delete the ${deleting?.seller_type} requirement for ${deleting?.country_code === "*" ? "the default fallback" : deleting?.country_code}? Sellers from that country will fall back to the default rule, if one exists.`}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}
