import { api } from "./client";

/**
 * The "Sell on Reelsoo" application - Settings -> Sell on Reelsoo, NOT the
 * public Shop screen (shop.api.ts). Server-backed on shops + seller_profiles
 * + seller_documents (server/app/Http/Controllers/Api/SellerApplicationController.php).
 *
 * There is deliberately no local draft store here, unlike tax-forms.store.ts -
 * the draft IS the server row (GET returns whatever was last saved, PUT
 * saves incrementally per step), so there is nothing to keep in sync on the
 * client between sessions. See that controller's own docblock.
 */

export type SellerType = "individual" | "business";

export type ShopStatus =
  | "draft" | "incomplete" | "pending_review" | "needs_information"
  | "approved" | "rejected" | "suspended";

export interface SellerRequirements {
  required_fields: string[];
  required_documents: string[];
  requires_tax_form: boolean;
}

export interface SellerDocumentRow {
  id: number;
  document_key: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  uploaded_at: string;
}

export interface ShopPolicies {
  shipping?: {
    ships_from?: string;
    delivery_regions?: string;
    method?: string;
    fee?: string;
    free_threshold?: string;
    delivery_time?: string;
  };
  returns?: {
    accepts_returns?: boolean;
    period?: string;
    conditions?: string;
    refund_method?: string;
  };
  support?: {
    email?: string;
    phone?: string;
  };
  /** Shop Settings > Policies > Shop Policies - free-text, same "no fixed schema, just merge on write" convention as the groups above (see ShopSettingsController::update()). */
  refund_policy?: string;
  cancellation_policy?: string;
  terms?: string;
}

export interface AgreementAcceptance {
  version: string;
  accepted_at: string;
}

/**
 * One row of the eligibility checklist shown on the intro screen - admin-
 * configured (Admin Panel -> Monetization Control Center -> Sell on
 * Reelsoo) and computed live against the account, not a hardcoded list.
 * `all_met` gates the intro screen's Apply Now/Get Started button
 * (SellerApplicationScreen) - see SellerApplicationController::show()'s own
 * comment for what this does and doesn't gate.
 */
export interface EligibilityRequirement {
  key: string;
  label: string;
  sub?: string | null;
  target: number | null;
  current: number;
  met: boolean;
  /** "met" | "progress" (something to work toward) | "blocker" (needs an appeal/verification, not just more time) */
  kind: "met" | "progress" | "blocker";
  /** False on a pass/fail check (email verified, 2FA, profile complete...) -
   *  true on a number that only grows with real activity (followers, public
   *  videos...). Same field/meaning as ProgramRequirement.counted in
   *  monetization-programs.api.ts - determines whether an unmet row can
   *  offer a "fix" tap target at all (see requirement-fix.ts). */
  counted: boolean;
  /** true for the platform-wide checks every programme carries (age, two-
   *  factor, etc. - MonetizationProgram::BASELINE); false for the ones
   *  configured specifically on the Sell on Reelsoo programme itself in
   *  the admin panel's Requirements tab. The intro screen shows only the
   *  latter, so whatever an admin adds/removes/retargets there is exactly
   *  and only what shows here - see SellerApplicationScreen.tsx. */
  baseline: boolean;
}

export interface Eligibility {
  label: string;
  requirements: EligibilityRequirement[];
  met_count: number;
  total_count: number;
  all_met: boolean;
  /** Admin override for the CTA button text (Admin Panel -> Monetization
   *  Control Center -> Sell on Reelsoo -> Overview -> Button Text). Null
   *  means "use Apply Now / Get Started, this screen's own defaults". */
  cta_label: string | null;
  /** Admin overrides for the intro screen's headline/paragraph/bullets
   *  (Admin Panel -> ... -> Overview -> App Intro Pitch / Feature Bullets).
   *  Null/empty means "use this screen's own default pitch copy". */
  hero_title: string | null;
  hero_description: string | null;
  features: { icon: string; title: string; desc: string }[];
}

export interface SellerApplication {
  status: ShopStatus;
  seller_type: SellerType | null;
  country_code: string | null;
  /** The account's own country, suggested default for the Country step - never user-editable independently. */
  account_country_code: string | null;
  shop_name: string | null;
  shop_username: string | null;
  description: string | null;
  logo_url: string | null;
  category_id: number | null;
  policies: ShopPolicies | null;
  /** Individual/business fields - only the ones matching the chosen seller_type are ever non-empty. */
  legal_data: Record<string, string> | null;
  agreements: Record<string, AgreementAcceptance> | null;
  current_step: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  documents: SellerDocumentRow[];
  requirements: SellerRequirements | null;
  has_tax_form: boolean;
  eligibility: Eligibility | null;
}

export interface SellerApplicationUpdate {
  seller_type?: SellerType;
  country_code?: string;
  shop_name?: string;
  shop_username?: string;
  description?: string | null;
  category_id?: number | null;
  policies?: Partial<ShopPolicies>;
  legal_data?: Record<string, string>;
  agreements?: Record<string, { version: string; accepted_at: string }>;
  current_step?: string | null;
}

const BASE = "/seller/application";
type Envelope<T> = { success: boolean; data: T };

export const sellerApplicationApi = {
  get: () => api.get<Envelope<SellerApplication>>(BASE).then((r) => r.data.data),

  update: (payload: SellerApplicationUpdate) =>
    api.put<Envelope<SellerApplication>>(BASE, payload).then((r) => r.data.data),

  uploadLogo: (file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("logo", file as unknown as Blob);
    return api.post<Envelope<{ logo_url: string }>>(`${BASE}/logo`, form).then((r) => r.data.data);
  },

  uploadDocument: (documentKey: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("document_key", documentKey);
    form.append("file", file as unknown as Blob);
    return api.post<Envelope<SellerDocumentRow>>(`${BASE}/documents`, form).then((r) => r.data.data);
  },

  removeDocument: (id: number) => api.delete(`${BASE}/documents/${id}`),

  submit: () => api.post<Envelope<SellerApplication>>(`${BASE}/submit`).then((r) => r.data.data),
};
