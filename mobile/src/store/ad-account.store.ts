import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "./auth.store";
import { useStudioSettingsStore } from "./studio-settings.store";
import { registerSessionReset } from "./session";
import { studioApi } from "@/api/studio.api";

/**
 * Teezer Ads - Ad Account store (Studio → Settings → Advertising).
 *
 * Models a creator's advertising account the way Facebook/TikTok Ads Manager do:
 * a brand-new creator has NO ad account. The account - and its unique, permanent
 * account number - is minted AUTOMATICALLY the first time they launch a campaign
 * (after accepting the Advertising Policy + the campaign Terms and the ad enters
 * review). From then on every launch is recorded as a committed spend, funds and
 * promo credits move the balances, and all four Advertising pages read from here.
 *
 * Persisted locally (AsyncStorage) like studio-settings.store - there is no
 * `/studio/ad-account` endpoint yet; swap `persist()` for an API sync when it
 * lands. The account is scoped to the signed-in creator (`ownerUserId`): loading
 * under a different account starts a fresh, empty ad account so numbers/balances
 * never leak across a device's saved logins.
 */

const CACHE_KEY = "teezer:ad-account";

export type AdAccountStatus = "none" | "active";
export type AdTxnKind = "campaign_spend" | "funds_added" | "credit_applied" | "refund";
export type AdTxnStatus = "Paid" | "Pending" | "Success" | "Refunded";

/** One money movement on the account (feeds the Payment History list + totals). */
export interface AdTransaction {
  id: string;
  kind: AdTxnKind;
  title: string;       // "Campaign Spending" | "Funds Added" | "Promo Credit"
  subtitle?: string;   // e.g. the campaign goal
  amount: number;      // USD; negative = money out, positive = money in
  date: number;        // epoch ms
  status: AdTxnStatus;
}

/** A billing invoice (Payment History → Invoices tab). */
export interface AdInvoice {
  id: string;          // INV-2026-000123
  date: number;
  amount: number;      // USD
  status: "Paid" | "Due";
}

export interface AdAccount {
  /** Which signed-in creator this account belongs to (guards cross-account leak). */
  ownerUserId: number | null;
  /** The unique, permanent ad-account number - null until the first campaign mints it. */
  accountId: string | null;
  status: AdAccountStatus;
  createdAt: number | null;

  // Identity (shown on the Ad Account page)
  businessName: string;
  accountOwner: string;
  accountType: "Business" | "Individual";
  timeZone: string;

  // Billing
  balance: number;                 // available funds (USD)
  autoPay: boolean;
  billingThreshold: number;        // auto-charge trigger (USD)
  invoiceFrequency: "Monthly" | "Weekly" | "On threshold";
  taxExemption: boolean;

  // Business + tax details (Billing Information page)
  billingEmail: string;
  phone: string;
  address: string;
  taxStatus: "Registered" | "Not registered";
  taxId: string;
  businessType: string;

  // Promotional credits
  creditsAvailable: number;
  creditsUsed: number;
  creditsEarned: number;

  // Tracked totals + history
  totalAdSpend: number;            // sum of committed campaign budgets (USD)
  activeCampaigns: number;
  transactions: AdTransaction[];
  invoices: AdInvoice[];
  appliedPromoCodes: string[];
}

const DEFAULTS: AdAccount = {
  ownerUserId: null,
  accountId: null,
  status: "none",
  createdAt: null,
  businessName: "",
  accountOwner: "",
  accountType: "Business",
  timeZone: "",
  balance: 0,
  autoPay: false,
  billingThreshold: 500,
  invoiceFrequency: "Monthly",
  taxExemption: false,
  billingEmail: "",
  phone: "",
  address: "",
  taxStatus: "Not registered",
  taxId: "",
  businessType: "",
  creditsAvailable: 0,
  creditsUsed: 0,
  creditsEarned: 0,
  totalAdSpend: 0,
  activeCampaigns: 0,
  transactions: [],
  invoices: [],
  appliedPromoCodes: [],
};

/**
 * Promo codes → credit grant (USD). Demo-functional: a real deployment validates
 * these server-side. Codes are single-use per account (tracked in `appliedPromoCodes`).
 */
const PROMO_CODES: Record<string, number> = {
  TEEZER25: 25,
  WELCOME10: 10,
  CREATOR50: 50,
  ADS100: 100,
};

/** Device timezone label, e.g. "(GMT+05:45) Kathmandu"-ish; falls back gracefully. */
function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Mint a unique 10-digit ad-account number, seeded by the creator's user id so it
 * is stable and distinct per user (then persisted, so it never changes again).
 * Format mirrors the big platforms: `reel_1234567890`.
 */
function genAccountId(userId?: number | null): string {
  const seed = (userId ?? 0) * 7919 + Math.floor(Math.random() * 1_000_000) + 1;
  const num = 1_000_000_000 + (Math.abs(seed) % 9_000_000_000);
  return `reel_${num}`;
}

let txnSeq = 0;
function txnId(): string {
  txnSeq += 1;
  return `adtxn_${Date.now().toString(36)}_${txnSeq}`;
}

/**
 * Fire-and-forget: push the advertiser's Business Info + Billing Preferences to
 * the server (meta) so the admin console (User 360 → Ads & Control) shows the
 * SAME values the app's Billing screen does. The local store stays the source of
 * truth; a failed sync never affects the UI.
 */
function syncSettings(d: AdAccount): void {
  studioApi.updateAdAccountSettings({
    business_name: d.businessName || undefined,
    account_owner: d.accountOwner || undefined,
    account_type: d.accountType || undefined,
    business_type: d.businessType || undefined,
    business_email: d.billingEmail || undefined,
    phone: d.phone || undefined,
    address: d.address || undefined,
    timezone: d.timeZone || undefined,
    auto_pay: d.autoPay,
    billing_threshold: d.billingThreshold,
    invoice_frequency: d.invoiceFrequency,
    tax_exemption: d.taxExemption,
  }).catch(() => { /* best-effort */ });
}

interface AdAccountState {
  data: AdAccount;
  loaded: boolean;
  /** Read the cached account for the CURRENT creator (fresh + empty for a new one). */
  hydrate: () => Promise<void>;
  /** Patch + persist any field(s). */
  update: (patch: Partial<AdAccount>) => void;
  /**
   * Called when a campaign is successfully submitted for review. Mints the ad
   * account (unique number + identity) on the very first call, then records the
   * launch as a committed spend and bumps the active-campaign count. Returns the
   * (new or existing) account number. This is the Facebook-style auto-provision.
   */
  recordCampaignLaunch: (info: { goalLabel: string; amountUsd: number }) => string;
  /** Add funds to the balance (records a "Funds Added" transaction). */
  addFunds: (amountUsd: number) => void;
  /** Redeem a promo code once; grants promotional credit on success. */
  applyPromo: (code: string) => { ok: boolean; message: string; amount?: number };
  /** Wipe the account (used when the stored owner no longer matches the session). */
  reset: () => void;
  /**
   * Drop the in-memory account and re-arm hydration for a NEW session (sign-in,
   * account switch, sign-out). Does NOT persist - so the previous owner's cached
   * snapshot is left intact - and clears `loaded` so the next screen visit
   * re-hydrates the correct owner's data (or empty defaults). This is what stops
   * one account's Ads/Wallet balances leaking into another after a switch.
   */
  sessionReset: () => void;
}

export const useAdAccountStore = create<AdAccountState>((set, get) => {
  const persist = (data: AdAccount) => {
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => { /* best-effort */ });
  };

  return {
    data: DEFAULTS,
    loaded: false,

    hydrate: async () => {
      if (get().loaded) return;
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const stored = raw ? (JSON.parse(raw) as Partial<AdAccount>) : null;
        // A stored account for a DIFFERENT signed-in creator must not show here.
        const belongsToSomeoneElse =
          !!stored && stored.ownerUserId != null && currentUserId != null && stored.ownerUserId !== currentUserId;
        const data: AdAccount = stored && !belongsToSomeoneElse
          ? { ...DEFAULTS, ...stored }
          : { ...DEFAULTS };
        set({ data, loaded: true });
        if (belongsToSomeoneElse) persist(data); // overwrite the other account's snapshot
      } catch {
        set({ data: { ...DEFAULTS }, loaded: true }); // corrupted cache → defaults
      }
    },

    update: (patch) => {
      const data = { ...get().data, ...patch };
      set({ data });
      persist(data);
      syncSettings(data); // keep the admin console in sync with app-side edits
    },

    recordCampaignLaunch: ({ goalLabel, amountUsd }) => {
      const amount = Math.max(1, Math.round(amountUsd));
      const cur = get().data;
      const user = useAuthStore.getState().user;
      const prefs = useStudioSettingsStore.getState().prefs;
      const data: AdAccount = { ...cur };

      // First campaign → provision the account + its unique number (idempotent).
      if (data.status === "none" || !data.accountId) {
        data.accountId = genAccountId(user?.id);
        data.status = "active";
        data.createdAt = Date.now();
        data.ownerUserId = user?.id ?? null;
        data.businessName =
          prefs.bizName?.trim() || user?.name?.trim() || (user?.username ? `@${user.username}` : "My Brand");
        data.accountOwner = user?.name?.trim() || user?.username || "Teezer Creator";
        data.accountType = "Business";
        data.timeZone = prefs.timezone?.trim() || detectTimeZone();
        data.billingEmail = prefs.bizEmail?.trim() || user?.email || "";
        data.phone = prefs.bizPhone?.trim() || "";
        data.address = [prefs.bizCity, prefs.bizState, prefs.bizCountry].map((p) => p?.trim()).filter(Boolean).join(", ");
        data.taxId = prefs.bizTaxId?.trim() || "";
        data.taxStatus = prefs.bizTaxId?.trim() ? "Registered" : "Not registered";
        data.businessType = prefs.bizType?.trim() || "Private Limited Company";
      }

      // Record the launch: committed spend + a Pending transaction (ad is in review).
      data.activeCampaigns += 1;
      data.totalAdSpend += amount;
      const txn: AdTransaction = {
        id: txnId(),
        kind: "campaign_spend",
        title: "Campaign Spending",
        subtitle: goalLabel,
        amount: -amount,
        date: Date.now(),
        status: "Pending",
      };
      data.transactions = [txn, ...data.transactions];

      set({ data, loaded: true });
      persist(data);
      syncSettings(data); // first campaign mints the account → seed its settings on the server too
      return data.accountId!;
    },

    addFunds: (amountUsd) => {
      const amount = Math.max(1, Math.round(amountUsd));
      const cur = get().data;
      const data: AdAccount = { ...cur, balance: cur.balance + amount };
      const txn: AdTransaction = {
        id: txnId(),
        kind: "funds_added",
        title: "Funds Added",
        amount,
        date: Date.now(),
        status: "Success",
      };
      data.transactions = [txn, ...data.transactions];
      set({ data });
      persist(data);
    },

    applyPromo: (code) => {
      const key = code.trim().toUpperCase();
      if (!key) return { ok: false, message: "Enter a promo code." };
      const cur = get().data;
      if (cur.appliedPromoCodes.includes(key)) {
        return { ok: false, message: "This promo code has already been used." };
      }
      const grant = PROMO_CODES[key];
      if (!grant) return { ok: false, message: "That promo code isn't valid or has expired." };
      const data: AdAccount = {
        ...cur,
        creditsAvailable: cur.creditsAvailable + grant,
        creditsEarned: cur.creditsEarned + grant,
        appliedPromoCodes: [...cur.appliedPromoCodes, key],
      };
      const txn: AdTransaction = {
        id: txnId(),
        kind: "credit_applied",
        title: "Promo Credit",
        subtitle: key,
        amount: grant,
        date: Date.now(),
        status: "Success",
      };
      data.transactions = [txn, ...data.transactions];
      set({ data });
      persist(data);
      return { ok: true, message: `$${grant.toFixed(2)} in credits added to your account.`, amount: grant };
    },

    reset: () => {
      const data = { ...DEFAULTS };
      set({ data });
      persist(data);
    },

    sessionReset: () => {
      // No persist: keep the previous owner's on-device snapshot; just clear memory
      // and re-arm hydrate so the next read loads the current session's account.
      set({ data: { ...DEFAULTS }, loaded: false });
    },
  };
});

// Reset the in-memory ad account on every session change so one creator's
// Ads/Wallet balances never show under another after an account switch.
registerSessionReset(() => useAdAccountStore.getState().sessionReset());
