import { api } from "./client";
import type { TaxForm, TaxFormType } from "@/store/tax-forms.store";

/**
 * Creator tax forms API - the real, production endpoints backing
 * Reelsoo Studio → Settings → Tax Information → Tax Forms.
 * Forms are per-user; the server only ever returns the caller's own forms.
 */

/** A file picked on the device, in the shape React Native's FormData expects. */
export type PickedFile = { uri: string; name: string; type?: string };

export interface CreateTaxFormPayload {
  formType: TaxFormType;
  entityKind: "Individual" | "Entity";
  firstName: string;
  middleName?: string;
  lastName: string;
  dob?: string;
  citizenship?: string;
  residenceCountry?: string;
  residenceTin?: string;
  addr1?: string;
  addr2?: string;
  city?: string;
  tinType?: string;
  taxId?: string;
  identityDoc?: PickedFile | null;
  addressDoc?: PickedFile | null;
}

/** Guess a MIME type from the file name/uri so the upload part is well-formed. */
function mimeFor(file: PickedFile): string {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() || file.uri.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

function filePart(file: PickedFile) {
  // RN's FormData takes {uri, name, type}; the DOM types only admit Blob | string,
  // so the cast is unavoidable (same pattern as verification.api.ts).
  return { uri: file.uri, name: file.name, type: mimeFor(file) } as unknown as Blob;
}

export const taxApi = {
  /** List the caller's tax forms, newest first. */
  async list(): Promise<TaxForm[]> {
    const { data } = await api.get("/studio/tax-forms");
    return (data?.data ?? []) as TaxForm[];
  },

  /** Submit a new tax form. Returns the created form (status "Under Review"). */
  async create(p: CreateTaxFormPayload): Promise<TaxForm> {
    const form = new FormData();
    form.append("form_type", p.formType);
    form.append("entity_kind", p.entityKind);
    form.append("first_name", p.firstName);
    if (p.middleName) form.append("middle_name", p.middleName);
    form.append("last_name", p.lastName);
    if (p.dob) form.append("dob", p.dob);
    if (p.citizenship) form.append("citizenship", p.citizenship);
    if (p.residenceCountry) form.append("residence_country", p.residenceCountry);
    if (p.residenceTin) form.append("residence_tin", p.residenceTin);
    if (p.addr1) form.append("addr1", p.addr1);
    if (p.addr2) form.append("addr2", p.addr2);
    if (p.city) form.append("city", p.city);
    if (p.tinType) form.append("tin_type", p.tinType);
    if (p.taxId) form.append("tax_id", p.taxId);
    if (p.identityDoc) form.append("identity_doc", filePart(p.identityDoc));
    if (p.addressDoc) form.append("address_doc", filePart(p.addressDoc));

    // The axios request interceptor strips Content-Type for FormData so RN can set
    // the multipart boundary itself.
    const { data } = await api.post("/studio/tax-forms", form);
    return data.data as TaxForm;
  },

  /** Delete one of the caller's tax forms. */
  async remove(id: string): Promise<void> {
    await api.delete(`/studio/tax-forms/${id}`);
  },
};
