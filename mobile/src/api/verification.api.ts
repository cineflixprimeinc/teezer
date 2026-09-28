import { api } from "./client";

/**
 * Blue Verified - the SAME endpoints and the SAME rules the website uses.
 *
 * Worth being explicit about what this system actually is, because it is easy to
 * assume otherwise: verification here is a paid subscription plus an identity check.
 * It is NOT a follower/engagement threshold. There is no "10K followers to apply"
 * rule anywhere in the backend, and there are no verification tiers.
 *
 * The flow is a four-step wizard, and the server enforces the order - each step
 * checks the draft is on the previous `verification_step` and 422s otherwise, so the
 * app cannot skip ahead even if its UI let you:
 *
 *   1. select-plan      → verification_step: plan_selected
 *   2. account-check    → verification_step: account_checked
 *   3. upload-documents → verification_step: documents_uploaded
 *   4. submit           → status: pending  (admin then approves / rejects)
 */

/* ── Plans ──────────────────────────────────────────────────────────────────── */

/**
 * Mirrors BV_PLANS in frontend/src/features/studio/studio-verification-page.tsx.
 * The ids are the only values POST /verification/select-plan accepts.
 */
export type PlanId = "basic" | "plus" | "business";

/**
 * The presentation side of a plan: what it is called, who it is for, what it
 * includes.
 *
 * Deliberately carries NO price. The price is the server's - see
 * `VerificationStatus.prices` - because `VerificationPayment::PLAN_PRICES` is
 * what the charge is actually taken against, and a second copy here could only
 * ever agree with it by luck.
 */
export type Plan = {
  id: PlanId;
  name: string;
  period: string;
  tagline: string;
  badge: string | null;
  features: string[];
};

export const BV_PLANS: Plan[] = [
  {
    id: "basic",
    name: "Blue Verified Basic",
    period: "/month",
    tagline: "Perfect for individuals getting started.",
    badge: null,
    features: [
      "Blue badge application access",
      "Identity protection from fake accounts",
      "Verified profile trust label",
      "Account safety alerts",
    ],
  },
  {
    id: "plus",
    name: "Blue Verified Plus",
    period: "/month",
    tagline: "Best value for creators.",
    badge: "Most Popular",
    features: [
      "Everything in Basic",
      "Enhanced profile discovery",
      "Social link authenticity check",
      "Verified support chat",
    ],
  },
  {
    id: "business",
    name: "Blue Verified Business",
    period: "/month",
    tagline: "For brands & professional accounts.",
    badge: null,
    features: [
      "Everything in Plus",
      "Official business/brand label",
      "Brand impersonation protection",
      "Priority review",
    ],
  },
];

export function planById(id?: string | null): Plan | null {
  return BV_PLANS.find((p) => p.id === id) ?? null;
}

/* ── Status ─────────────────────────────────────────────────────────────────── */

export type VerificationStep =
  | "plan_selected"
  | "account_checked"
  | "documents_uploaded"
  | null;

export type VerificationRequestData = {
  id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  verification_step: VerificationStep;
  plan_id: string | null;

  /**
   * ISO date the badge renews. Null for a PERMANENT badge (nothing to renew) and null
   * for one approved before expiry was tracked (date unknown). `is_permanent` is what
   * tells those two apart - never infer "never expires" from a missing date.
   */
  expires_at: string | null;
  has_lapsed: boolean;
  /** Staff / official badge: not billed, no renewal, never expires. */
  is_permanent: boolean;
  /**
   * The badge was granted and then taken back. The request row deliberately stays
   * `approved` so we keep the fact it once existed - so `status === "approved"` does NOT
   * mean verified, and this is the field that settles it.
   */
  is_revoked: boolean;
  revoke_reason: string | null;
  /** Whether this application has been paid for. The server re-checks on submit. */
  is_paid: boolean;
  plan_price_usd: number | null;

  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  document_uploaded: boolean;
  selfie_uploaded: boolean;
  supporting_doc_uploaded: boolean;
};

export type VerificationStatus = {
  /**
   * The badge flag on the USER - the only thing that decides whether a tick renders
   * anywhere in the product. Trust this over `request.status`, which can say
   * "approved" on a row whose badge an admin has since revoked.
   */
  isVerified: boolean;
  request: VerificationRequestData | null;
  /**
   * Plan id → price in USD, straight from the server's PLAN_PRICES.
   *
   * Empty against a server that predates the field, which is why every caller
   * has to handle a missing price rather than reach for a default: the whole
   * point of moving this off the client is that a local number can advertise a
   * price the store will not charge.
   */
  prices: Record<string, number>;
};

/** One row of the Account Review step. Only community_guidelines can actually block. */
export type AccountCheck = {
  key: string;
  label: string;
  status: "passed" | "pending" | "failed" | "ready";
  detail: string | null;
};

/* ── Documents ──────────────────────────────────────────────────────────────── */

/** A file picked on the device, in the shape React Native's FormData expects. */
export type PickedFile = { uri: string; name: string; type: string };

export type DocumentsPayload = {
  document: PickedFile;
  selfie: PickedFile;
  supportingDoc?: PickedFile | null;
  website?: string;
  socialLinks?: string[];
};

/* ── API ────────────────────────────────────────────────────────────────────── */

export const verificationApi = {
  /** GET /verification - the latest request, the badge flag, and plan pricing. */
  async status(): Promise<VerificationStatus> {
    const { data } = await api.get("/verification");
    const prices: Record<string, number> = {};
    for (const p of (data.plans ?? []) as { id?: string; price_usd?: number | null }[]) {
      if (p?.id && typeof p.price_usd === "number") prices[p.id] = p.price_usd;
    }
    return {
      isVerified: Boolean(data.is_verified),
      request: (data.data ?? null) as VerificationRequestData | null,
      prices,
    };
  },

  /** Step 1. Also restarts a rejected application, clearing its old documents. */
  async selectPlan(planId: PlanId): Promise<void> {
    await api.post("/verification/select-plan", { plan_id: planId });
  },

  /** Step 2. Returns the checks; `canProceed` is false only on a guidelines violation. */
  async accountCheck(): Promise<{ canProceed: boolean; checks: AccountCheck[] }> {
    const { data } = await api.post("/verification/account-check");
    return {
      canProceed: Boolean(data.can_proceed),
      checks: (data.checks ?? []) as AccountCheck[],
    };
  },

  /** Step 3. multipart/form-data - the server wants real files, not base64. */
  async uploadDocuments(payload: DocumentsPayload): Promise<void> {
    const form = new FormData();

    // RN's FormData takes {uri, name, type} for a file part. Cast is unavoidable:
    // the DOM's FormData types only admit Blob | string, and RN's runtime does not
    // use the DOM implementation.
    form.append("document", payload.document as unknown as Blob);
    form.append("selfie", payload.selfie as unknown as Blob);
    if (payload.supportingDoc) {
      form.append("supporting_doc", payload.supportingDoc as unknown as Blob);
    }
    if (payload.website) form.append("website", payload.website);
    if (payload.socialLinks?.length) {
      // The server json_decodes this string back into an array.
      form.append("social_links", JSON.stringify(payload.socialLinks));
    }

    await api.post("/verification/upload-documents", form, {
      headers: { "Content-Type": "multipart/form-data" },
      // Identity documents over a phone connection: give the upload room to finish
      // rather than failing a 10 MB scan on the client's default timeout.
      timeout: 120_000,
    });
  },

  /** Step 4. Moves the draft to `pending` for admin review. */
  async submit(): Promise<void> {
    await api.post("/verification/submit");
  },
};

/* ── Formatting ─────────────────────────────────────────────────────────────── */

/** "12 Aug 2026" - the renewal date, or null when we genuinely don't know it. */
export function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** Whole days until renewal. Negative once lapsed. Null when there is no date. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
