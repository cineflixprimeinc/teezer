import { create } from "zustand";
import { taxApi } from "@/api/tax.api";

/**
 * Teezer Studio tax forms store - production, backend-backed.
 *
 * Forms live on the server (GET/POST/DELETE /studio/tax-forms) and are scoped to
 * the signed-in creator. There is no local seed/demo data: a new account simply
 * has no forms until it submits one. The wizard submits through the API and the
 * created form (status "Under Review") is inserted here; an admin later flips it
 * to Approved/Rejected server-side and the next load reflects that.
 */

export type TaxFormType = "W-8BEN" | "W-9" | "W-8BEN-E" | "Other";
export type TaxFormStatus = "Under Review" | "Approved" | "Rejected";
/** A document picked on-device before upload (wizard-local). */
export interface TaxDoc { name: string; uri: string }

export interface TaxForm {
  id: string;
  formType: TaxFormType;
  entityKind: "Individual" | "Entity";
  status: TaxFormStatus;
  submissionId: string; // TXF-2026-000123
  submittedAt: number;  // epoch ms
  // Collected data (returned by the API for the owner)
  firstName: string; middleName: string; lastName: string;
  dob: string;                 // "May 15, 1995"
  citizenship: string;         // country name
  residenceCountry: string;
  residenceTin: string;
  addr1: string; addr2: string; city: string;
  tinType: string;             // PAN / SSN / EIN …
  taxId: string;               // the identification number
  reviewNote?: string | null;  // shown on rejection
}

interface TaxFormsState {
  forms: TaxForm[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Fetch the creator's forms. No-op once loaded unless `force`. */
  load: (force?: boolean) => Promise<void>;
  /** Insert a just-created form at the top (called by the wizard on success). */
  add: (f: TaxForm) => void;
  /** Delete a form (optimistic; reverts if the request fails). */
  remove: (id: string) => Promise<void>;
}

export const useTaxFormsStore = create<TaxFormsState>((set, get) => ({
  forms: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const forms = await taxApi.list();
      set({ forms, loaded: true, loading: false });
    } catch {
      set({ loading: false, error: "Couldn't load your tax forms. Please try again." });
    }
  },

  add: (f) => set({ forms: [f, ...get().forms], loaded: true }),

  remove: async (id) => {
    const prev = get().forms;
    set({ forms: prev.filter((f) => f.id !== id) }); // optimistic
    try {
      await taxApi.remove(id);
    } catch {
      set({ forms: prev }); // revert on failure
    }
  },
}));
