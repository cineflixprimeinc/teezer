import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerSessionReset } from "./session";
import { useAuthStore } from "./auth.store";
import { payoutMethodsApi, type PayoutMethodPayload, type PayoutMethodRow } from "@/api/payout-methods.api";

/**
 * Creator payout methods - the accounts a creator RECEIVES earnings to.
 *
 * These are payouts (money out), never purchases: coins, gifts and subscriptions
 * are always bought through the App Store's in-app purchase, so this stays
 * within Apple's guidelines.
 *
 * Server-backed on `creator_payout_methods`, which is what the Monetization tab,
 * the Withdraw screen and Gifts & Coins all read. This used to persist only to
 * AsyncStorage, which is why a creator could add a method here and still be told
 * "No payout method yet" everywhere else.
 *
 * It stays usable when the server cannot take the write - offline, or a build
 * running against an API that has not deployed the payout-method routes yet. In
 * that case the method is kept on the device and marked `pendingSync`, and the
 * next successful refresh pushes it up and drops the local copy. A creator is
 * never blocked from entering their details, and is never told their details
 * are safely stored when they are only on this phone.
 */

/**
 * The pre-account-scoping key. One cache for the whole device, which is what
 * let a creator's payout methods appear under another account. Kept only so the
 * signed-in user's existing cache can be adopted once, then removed.
 */
const LEGACY_CACHE_KEY = "reelsoo:payment-methods";

/**
 * Cache key, per account.
 *
 * Scoped rather than cleared on a session change, because a method the server
 * has not accepted yet lives ONLY here - see pendingSync above. Wiping the
 * cache to stop the leak would have destroyed a creator's unsynced bank details
 * along with it, which is a worse outcome than the leak. Scoping isolates each
 * account AND keeps each account's pending methods waiting for their own next
 * refresh.
 *
 * Signed out (id 0) gets its own bucket rather than sharing the last account's.
 */
const cacheKeyFor = (userId: number) => `reelsoo:payment-methods:${userId}`;

function currentUserId(): number {
  return useAuthStore.getState().user?.id ?? 0;
}

export type PaymentMethodType = "Bank Transfer" | "Wallets" | "PayPal" | "Stripe" | "Wise";

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  fields: Record<string, string>;
  isDefault: boolean;
  /** The server's masked one-liner, when it has been fetched. */
  summary?: string;
  /** True while this exists only on this device. */
  pendingSync?: boolean;
}

const TYPES: PaymentMethodType[] = ["Bank Transfer", "Wallets", "PayPal", "Stripe", "Wise"];

/** Anything only this device knows about carries a `local-` id. */
const isLocal = (id: string) => id.startsWith("local-");

/** The server stores `provider` verbatim; fall back for anything older. */
function toType(provider: string): PaymentMethodType {
  const hit = TYPES.find((t) => t.toLowerCase() === (provider ?? "").toLowerCase());
  return hit ?? "Bank Transfer";
}

function fromRow(row: PayoutMethodRow): PaymentMethod {
  return {
    id: String(row.id),
    type: toType(row.provider),
    fields: row.details ?? {},
    isDefault: row.is_default,
    summary: row.masked_account ?? undefined,
  };
}

/** Which field carries the account address, per provider. */
function emailOf(type: PaymentMethodType, fields: Record<string, string>): string | null {
  const key =
    type === "PayPal" ? "paypalEmail" :
    type === "Stripe" ? "stripeEmail" :
    type === "Wise"   ? "wiseEmail"   :
    type === "Wallets" ? "walletEmail" : null;
  const value = key ? fields[key] : null;
  return value?.trim() ? value.trim() : null;
}

function payloadFor(type: PaymentMethodType, fields: Record<string, string>, makeDefault: boolean): PayoutMethodPayload {
  return {
    provider: type,
    account_email: emailOf(type, fields),
    details: fields,
    is_default: makeDefault,
  };
}

/** Mask a phone or account tail without giving the whole number away. */
function tail(value: string): string {
  const clean = value.replace(/\s+/g, "");
  return clean.length > 4 ? `•••• ${clean.slice(-4)}` : clean;
}

/** One-line summary for a method card (masks the account number). */
export function methodSummary(m: PaymentMethod): string {
  if (m.summary) return m.summary;
  const f = m.fields;
  switch (m.type) {
    case "Bank Transfer":
      return f.bankAccount ? `${tail(f.bankAccount)}${f.bankName ? " · " + f.bankName : ""}` : (f.bankName || "Bank account");
    case "Wallets": {
      const who = f.walletProvider || "Wallet";
      const id = f.walletPhone ? tail(f.walletPhone) : (f.walletEmail || "");
      return id ? `${who} · ${id}` : who;
    }
    case "PayPal": return f.paypalEmail || "PayPal account";
    case "Stripe": return f.stripeEmail || "Stripe account";
    case "Wise": return f.wiseEmail || "Wise account";
    default: return m.type;
  }
}

/** What went wrong with a write, and whether it is worth falling back for. */
type WriteOutcome = "ok" | "offline" | "rejected";

/**
 * Is this failure "the API cannot take this yet", or "the API read it and said
 * no"? Only the second is worth stopping the creator for.
 *
 * 405 matters as much as 404 here: `/studio/monetization/payout-methods` has
 * existed as a GET for a long time, so an API without the new write routes
 * answers a POST with Method Not Allowed, not Not Found. Treating that as a
 * real refusal is what put "the server couldn't save the payment method" in
 * front of people whose details were perfectly fine.
 */
function classify(e: any): "offline" | "rejected" {
  const status = e?.response?.status;
  if (status === undefined) return "offline";          // network / timeout
  if (status === 404 || status === 405 || status === 501) return "offline"; // route not deployed
  if (status >= 500) return "offline";                 // server fault, not the data
  return "rejected";                                   // 422 validation, 403, 401
}

interface PaymentMethodsState {
  methods: PaymentMethod[];
  loaded: boolean;
  /** Set when the server actively refused the last write. */
  error: string | null;
  /** True when at least one method exists only on this device. */
  hasPending: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Resolve false only when the server REFUSED the change - an offline save
   *  still succeeds, on the device. */
  addMethod: (type: PaymentMethodType, fields: Record<string, string>, makeDefault: boolean) => Promise<boolean>;
  updateMethod: (id: string, fields: Record<string, string>, makeDefault: boolean) => Promise<boolean>;
  removeMethod: (id: string) => Promise<boolean>;
  setDefault: (id: string) => Promise<boolean>;
}

function persist(methods: PaymentMethod[]) {
  void AsyncStorage.setItem(cacheKeyFor(currentUserId()), JSON.stringify(methods))
    .catch(() => { /* best-effort */ });
}

/** Guarantee exactly one default whenever at least one method exists. */
function normalize(methods: PaymentMethod[]): PaymentMethod[] {
  if (methods.length === 0) return methods;
  if (methods.some((m) => m.isDefault)) return methods;
  return methods.map((m, i) => ({ ...m, isDefault: i === 0 }));
}

export const usePaymentMethodsStore = create<PaymentMethodsState>((set, get) => {
  const apply = (methods: PaymentMethod[], error: string | null = null) => {
    const next = normalize(methods);
    set({ methods: next, error, hasPending: next.some((m) => m.pendingSync) });
    persist(next);
  };

  /** Server rows win; device-only methods are kept alongside them. */
  const merge = (rows: PayoutMethodRow[]) => {
    const pending = get().methods.filter((m) => m.pendingSync);
    apply([...rows.map(fromRow), ...pending]);
  };

  /** Push anything held on the device. Silently gives up if the API still
   *  cannot take it - it will be retried on the next refresh. */
  const flushPending = async (): Promise<boolean> => {
    const pending = get().methods.filter((m) => m.pendingSync);
    if (!pending.length) return false;

    let pushed = false;
    for (const m of pending) {
      try {
        await payoutMethodsApi.create(payloadFor(m.type, m.fields, m.isDefault));
        pushed = true;
      } catch (e) {
        if (classify(e) === "offline") return pushed; // still unavailable
        // Rejected outright - drop it rather than retrying a bad row forever.
        pushed = true;
      }
      set({ methods: get().methods.filter((x) => x.id !== m.id) });
    }
    return pushed;
  };

  return {
    methods: [],
    loaded: false,
    error: null,
    hasPending: false,

    hydrate: async () => {
      if (get().loaded) return;
      // Paint from the cache first so the list is never blank on a cold start.
      try {
        const key = cacheKeyFor(currentUserId());
        let raw = await AsyncStorage.getItem(key);

        // One-time adoption of the pre-scoping cache. It can only hold the
        // account that was signed in when this build replaced the old one, so
        // it is moved under that account's key and removed - a later account
        // never sees it. Anything already scoped wins, so this cannot overwrite
        // real data.
        if (raw === null) {
          const legacy = await AsyncStorage.getItem(LEGACY_CACHE_KEY);
          if (legacy !== null) {
            raw = legacy;
            await AsyncStorage.setItem(key, legacy).catch(() => {});
          }
        }
        // Removed unconditionally once we are past the read: leaving it would
        // let the next account adopt it too, which is the leak itself.
        void AsyncStorage.removeItem(LEGACY_CACHE_KEY).catch(() => {});

        if (raw) {
          const cached = JSON.parse(raw) as PaymentMethod[];
          set({ methods: normalize(cached), hasPending: cached.some((m) => m.pendingSync) });
        }
      } catch { /* corrupted cache - the fetch below is the real source */ }

      set({ loaded: true });
      await get().refresh();
    },

    refresh: async () => {
      try {
        // Send up anything the device is holding, then take the server's word.
        await flushPending();
        merge(await payoutMethodsApi.list());
      } catch {
        // Offline, or the routes are not deployed: keep what we have.
      }
    },

    addMethod: async (type, fields, makeDefault) => {
      try {
        merge(await payoutMethodsApi.create(payloadFor(type, fields, makeDefault)));
        return true;
      } catch (e) {
        if (classify(e) === "rejected") {
          set({ error: "The server wouldn't accept those details. Check them and try again." });
          return false;
        }
        // Hold it here and sync later.
        const existing = get().methods;
        const isDefault = makeDefault || existing.length === 0;
        const cleared = isDefault ? existing.map((m) => ({ ...m, isDefault: false })) : existing;
        apply([...cleared, { id: `local-${Date.now()}`, type, fields, isDefault, pendingSync: true }]);
        return true;
      }
    },

    updateMethod: async (id, fields, makeDefault) => {
      const current = get().methods.find((m) => m.id === id);
      const type = current?.type ?? "Bank Transfer";

      if (current && isLocal(id)) {
        // Never reached the server, so there is nothing to PATCH.
        let next = get().methods.map((m) => (m.id === id ? { ...m, fields } : m));
        if (makeDefault) next = next.map((m) => ({ ...m, isDefault: m.id === id }));
        apply(next);
        return true;
      }

      try {
        merge(await payoutMethodsApi.update(Number(id), payloadFor(type, fields, makeDefault)));
        return true;
      } catch (e) {
        if (classify(e) === "rejected") {
          set({ error: "The server wouldn't accept those details. Check them and try again." });
          return false;
        }
        let next = get().methods.map((m) => (m.id === id ? { ...m, fields } : m));
        if (makeDefault) next = next.map((m) => ({ ...m, isDefault: m.id === id }));
        apply(next);
        return true;
      }
    },

    removeMethod: async (id) => {
      if (isLocal(id)) {
        apply(get().methods.filter((m) => m.id !== id));
        return true;
      }
      try {
        merge(await payoutMethodsApi.remove(Number(id)));
        return true;
      } catch (e) {
        if (classify(e) === "rejected") {
          set({ error: "Couldn't remove that payout method. Please try again." });
          return false;
        }
        apply(get().methods.filter((m) => m.id !== id));
        return true;
      }
    },

    setDefault: async (id) => {
      const local = () => apply(get().methods.map((m) => ({ ...m, isDefault: m.id === id })));
      if (isLocal(id)) { local(); return true; }
      try {
        merge(await payoutMethodsApi.setDefault(Number(id)));
        return true;
      } catch (e) {
        if (classify(e) === "rejected") {
          set({ error: "Couldn't change your default payout method. Please try again." });
          return false;
        }
        local();
        return true;
      }
    },
  };
});

/*
 * Drop the outgoing account's methods from MEMORY on a session change.
 *
 * Storage is deliberately untouched. Each account's cache now lives under its
 * own key, so nothing has to be deleted to stop the leak - and deleting would
 * take any pendingSync method with it, which exists nowhere else.
 *
 * `loaded: false` is the important half: hydrate() returns early when loaded is
 * true, so without this the incoming account would keep the outgoing one's list
 * on screen until something else forced a refresh.
 */
registerSessionReset(() => {
  usePaymentMethodsStore.setState({ methods: [], loaded: false, error: null, hasPending: false });
});
