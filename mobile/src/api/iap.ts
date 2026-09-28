import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./client";

/**
 * Apple In-App Purchase / Google Play Billing.
 *
 * Both stores REQUIRE their own billing for digital goods, and a verification badge is
 * digital goods. Stripe and PayPal are for the WEBSITE - shipping them for a badge inside
 * the app is a rejection, not a shortcut.
 *
 * react-native-iap is a NATIVE module. It cannot exist in Expo Go, so it is required
 * lazily behind the same guard the app already uses for WebRTC: in Expo Go we degrade to
 * an honest "not available here" rather than crashing on import.
 *
 * ── Android only, for now ────────────────────────────────────────────────────
 * Upgraded 12.16.4 -> 16.3.0 (the v12 API didn't compile against this project's current
 * Expo Modules Core - a genuine toolchain incompatibility, not a video-work regression).
 * v16 rewrote the purchase API: requestPurchase() no longer resolves with the purchase,
 * it dispatches one and the result arrives via purchaseUpdatedListener/purchaseErrorListener
 * (see awaitPurchase() below); getProducts/getSubscriptions merged into fetchProducts();
 * and - the one that actually matters here - the iOS receipt is no longer the classic
 * base64 blob Apple's deprecated /verifyReceipt endpoint expects. It's now a StoreKit 2 JWS
 * token, which the backend (IapService::verifyApple/verifyAppleConsumable) cannot verify
 * without its own rewrite for the App Store Server API. That's real payment-backend work,
 * scoped out here deliberately. Android's purchaseToken format is unchanged, so only that
 * path is wired up; every purchase function below returns an honest "not available yet"
 * on iOS instead of sending it to a backend that would reject it.
 */

const isExpoGo = Constants.executionEnvironment === "storeClient";

type IapModule = typeof import("react-native-iap") | null;

let mod: IapModule | undefined;

function iap(): IapModule {
  if (mod !== undefined) return mod;

  // Never require the native module in Expo Go - the import itself would throw.
  if (isExpoGo) return (mod = null);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-iap") as IapModule;
  } catch {
    mod = null;
  }

  return mod ?? null;
}

export const iapAvailable = () => iap() !== null;

export const iapUnavailableReason = isExpoGo
  ? "In-app purchases need the Teezer app from the App Store or Play Store - they can't run in Expo Go."
  : "In-app purchases aren't available on this device.";

/** iOS path is real in the store SDK but not wired to the backend yet - see the module
 *  comment. Distinct from iapUnavailableReason, which means "no native module at all". */
const IOS_NOT_READY = "iOS purchases aren't available in this build yet. Please check back soon.";

/**
 * Dispatch a purchase request and resolve with the purchase v16 delivers through the
 * listener pair, not through requestPurchase()'s own return value. Whichever fires first
 * settles the promise; the other subscription is torn down either way so a slow
 * counterpart never fires into a purchase flow that already finished.
 */
function awaitPurchase(RNIap: NonNullable<IapModule>, dispatch: () => Promise<unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const updated = RNIap.purchaseUpdatedListener((purchase) => {
      cleanup();
      resolve(purchase);
    });
    const failed = RNIap.purchaseErrorListener((error) => {
      cleanup();
      reject(error);
    });
    function cleanup() {
      updated.remove();
      failed.remove();
    }
    dispatch().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}

/* ── Products ───────────────────────────────────────────────────────────────── */

/**
 * What the app needs to buy: the store product id for THIS creator's plan, and whether
 * the store is switched on at all.
 *
 * Comes from the server rather than being hard-coded, because the ids must match App Store
 * Connect and the Play Console exactly and whoever set the store up chose the names.
 */
export type IapConfig = {
  /** Product id for this platform, or null when the plan has none configured. */
  productId: string | null;
  enabled: boolean;
  amountUsd: number | null;
  paid: boolean;
};

export async function fetchIapConfig(): Promise<IapConfig> {
  const { data } = await api.get("/verification/payment/methods");
  const d = data?.data ?? {};
  const key = Platform.OS === "ios" ? "ios" : "android";

  return {
    productId: d.iap_products?.[key] ?? null,
    enabled:   Boolean(d.iap_enabled?.[key]),
    amountUsd: d.amount_usd ?? null,
    paid:      Boolean(d.paid),
  };
}

/* ── Purchase ───────────────────────────────────────────────────────────────── */

export type IapResult = { ok: true } | { ok: false; message: string; cancelled?: boolean };

/**
 * Picks the Play offer to buy, preferring one that starts with a free trial.
 *
 * `paymentMode` is v16's normalized, cross-platform field for this - v12 had to infer a
 * trial by scanning raw pricing phases for a zero price; v16 already tells us directly.
 * Falls back to the first offer, so a product with no trial stays buyable.
 */
function androidOfferToken(sub: any): string | null {
  const offers = sub?.subscriptionOffers;
  if (!Array.isArray(offers) || offers.length === 0) return null;

  const withTrial = offers.find((o: any) => o?.paymentMode === "free-trial");

  return (withTrial ?? offers[0])?.offerTokenAndroid ?? null;
}

/**
 * Buy the subscription, then have the SERVER verify the receipt.
 *
 * The receipt the store hands us is not proof of anything until Apple or Google confirms
 * it, so the purchase is only "done" once our own backend says so. If verification fails
 * the purchase is NOT finished - the store will retry it, and the user is not silently
 * charged for a badge they didn't get.
 */
export async function purchaseVerification(productId: string): Promise<IapResult> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: iapUnavailableReason };
  if (Platform.OS !== "android") return { ok: false, message: IOS_NOT_READY };

  try {
    await RNIap.initConnection();

    // Load the product first. A product id that doesn't exist in the store fails here with
    // a clear error, rather than deep inside the purchase flow.
    const subs: any[] = (await RNIap.fetchProducts({ skus: [productId], type: "subs" })) ?? [];
    const sub = subs.find((s: any) => s?.id === productId) ?? subs[0];
    const token = androidOfferToken(sub);
    if (!token) {
      return {
        ok: false,
        message: "This plan isn't available from the Play Store right now. Please try again later.",
      };
    }

    const purchase = await awaitPurchase(RNIap, () =>
      RNIap.requestPurchase({
        request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken: token }] } },
        type: "subs",
      }),
    );

    const receipt = purchase?.purchaseToken;

    if (!receipt) {
      return { ok: false, message: "The store didn't return a receipt. Please try again." };
    }

    // Server-side verification. Only now is the purchase real.
    await api.post("/verification/payment/iap/verify", {
      platform: "android",
      receipt,
    });

    // Finish ONLY after our server accepted it. Finishing first would tell the store the
    // purchase is delivered while our side still thinks it isn't - the user pays and gets
    // nothing, with no retry.
    await RNIap.finishTransaction({ purchase, isConsumable: false });

    return { ok: true };
  } catch (e: any) {
    // The user backing out is not an error worth alarming them about.
    if (RNIap.isUserCancelledError?.(e)) {
      return { ok: false, message: "Payment cancelled.", cancelled: true };
    }

    const serverMsg =
      e?.response?.data?.message ??
      (e?.response?.data?.errors ? Object.values(e.response.data.errors).flat()[0] : undefined);

    return { ok: false, message: serverMsg ?? e?.message ?? "Payment failed. Please try again." };
  } finally {
    try { await iap()?.endConnection(); } catch {}
  }
}

/* ── Coins ──────────────────────────────────────────────────────────────────
   Coins are CONSUMABLES, not subscriptions, and Apple requires In-App Purchase for
   them: they are digital content (Review Guideline 3.1.1). The web checkout - card,
   PayPal, UPI, bank - cannot be used inside the iOS app, and Apple Pay is not a way
   round it either: Apple Pay is for physical goods and services.
─────────────────────────────────────────────────────────────────────────── */

export type CoinProduct = {
  package_id: number;
  product_id: string;
  plan_name: string;
  coins: number;
  price_usd: number;
  badge: string | null;
  icon: string | null;
  sort_order: number;
  /**
   * Bonus coins, derived server-side. total_coins is what the wallet is
   * credited, so the client never recomputes it - what is shown is what is paid.
   */
  bonus?: {
    has_bonus: boolean;
    base_coins: number;
    bonus_coins: number;
    total_coins: number;
    bonus_label: string | null;
    bonus_text: string | null;
    bonus_ends_at: string | null;
  };
};

/** Which coin packs this platform can actually sell, per the server + App Store Connect. */
export async function fetchCoinProducts(): Promise<{ enabled: boolean; products: CoinProduct[] }> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const { data } = await api.get("/studio/wallets-coins/iap/products", { params: { platform } });
  const d = data?.data ?? {};
  return { enabled: Boolean(d.enabled), products: d.products ?? [] };
}

export type CoinPurchase =
  | { ok: true; coinsAdded: number }
  | { ok: false; message: string; cancelled?: boolean };

/**
 * Buy a coin pack.
 *
 * The receipt is verified by OUR server before the coins are granted and before the
 * transaction is finished with the store. Order matters:
 *
 *   - Verify first, finish second. Finishing first tells Apple the goods were delivered
 *     while our side may still have failed - the user pays and gets nothing, with no retry.
 *   - `isConsumable: true` is what lets the SAME pack be bought again. Without it, StoreKit
 *     treats the purchase as still-owned and the next buy of that pack fails.
 *
 * `quantity` was iOS-only even before this rewrite (Play Billing has no concept of buying
 * N of a consumable in one transaction) - now moot until the iOS path is wired up, kept on
 * the signature so callers don't need to change when it is.
 */
export async function purchaseCoins(productId: string, quantity = 1): Promise<CoinPurchase> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: iapUnavailableReason };
  if (Platform.OS !== "android") return { ok: false, message: IOS_NOT_READY };
  void quantity; // Android-only for now; see the doc comment above.

  try {
    await RNIap.initConnection();

    // Fail early and clearly if the id isn't live in the Play Console.
    await RNIap.fetchProducts({ skus: [productId], type: "in-app" });

    const purchase = await awaitPurchase(RNIap, () =>
      RNIap.requestPurchase({ request: { google: { skus: [productId] } }, type: "in-app" }),
    );

    const receipt = purchase?.purchaseToken;

    if (!receipt) {
      return { ok: false, message: "The store didn't return a receipt. Please try again." };
    }

    const { data } = await api.post("/studio/wallets-coins/iap/verify", {
      platform: "android",
      product_id: productId,
      receipt,
    });

    // Only now is the purchase real, so only now do we tell the store it was delivered.
    await RNIap.finishTransaction({ purchase, isConsumable: true });

    return { ok: true, coinsAdded: Number(data?.data?.coins_added ?? 0) };
  } catch (e: any) {
    if (RNIap.isUserCancelledError?.(e)) {
      return { ok: false, message: "Purchase cancelled.", cancelled: true };
    }

    const serverMsg =
      e?.response?.data?.message ??
      (e?.response?.data?.errors ? Object.values(e.response.data.errors).flat()[0] : undefined);

    return { ok: false, message: (serverMsg as string) ?? e?.message ?? "Purchase failed. Please try again." };
  } finally {
    try { await iap()?.endConnection(); } catch {}
  }
}

/* ── Ad account funds ─────────────────────────────────────────────────────
   Money added to a Teezer Ads balance is digital content spent inside the app,
   so on a phone it MUST go through In-App Purchase (Apple Review 3.1.1) - the
   same rule as coins. There is no "just add $50" button: funds are sold as fixed
   store products (a card form or web link would be a rejection), the receipt is
   verified by OUR server, and only then is the balance credited.
─────────────────────────────────────────────────────────────────────────── */

export type AdFundProduct = {
  product_id: string;   // App Store / Play product id
  amount_usd: number;   // funds the pack adds to the ad balance
  bonus_usd?: number;   // optional promotional bonus on top
  label?: string;       // optional marketing label ("Most popular")
};

/** Which ad-fund packs this platform can sell, per the server + App Store Connect. */
export async function fetchAdFundProducts(): Promise<{ enabled: boolean; products: AdFundProduct[] }> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const { data } = await api.get("/studio/ad-account/iap/products", { params: { platform } });
  const d = data?.data ?? {};
  return { enabled: Boolean(d.enabled), products: d.products ?? [] };
}

export type AdFundPurchase =
  | { ok: true; amountAdded: number }
  | { ok: false; message: string; cancelled?: boolean };

/**
 * Buy an ad-fund pack. Verify-then-finish, consumable (a pack can be re-bought) -
 * identical ordering to purchaseCoins, and for the same reason: finishing before
 * our server confirms would tell the store the funds were delivered while our side
 * failed, charging the user for balance they never receive.
 */
export async function purchaseAdFunds(productId: string): Promise<AdFundPurchase> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: iapUnavailableReason };
  if (Platform.OS !== "android") return { ok: false, message: IOS_NOT_READY };

  try {
    await RNIap.initConnection();
    await RNIap.fetchProducts({ skus: [productId], type: "in-app" });

    const purchase = await awaitPurchase(RNIap, () =>
      RNIap.requestPurchase({ request: { google: { skus: [productId] } }, type: "in-app" }),
    );

    const receipt = purchase?.purchaseToken;

    if (!receipt) {
      return { ok: false, message: "The store didn't return a receipt. Please try again." };
    }

    const { data } = await api.post("/studio/ad-account/iap/verify", {
      platform: "android",
      product_id: productId,
      receipt,
    });

    await RNIap.finishTransaction({ purchase, isConsumable: true });

    return { ok: true, amountAdded: Number(data?.data?.amount_added ?? 0) };
  } catch (e: any) {
    if (RNIap.isUserCancelledError?.(e)) {
      return { ok: false, message: "Payment cancelled.", cancelled: true };
    }
    const serverMsg =
      e?.response?.data?.message ??
      (e?.response?.data?.errors ? Object.values(e.response.data.errors).flat()[0] : undefined);
    return { ok: false, message: (serverMsg as string) ?? e?.message ?? "Payment failed. Please try again." };
  } finally {
    try { await iap()?.endConnection(); } catch {}
  }
}

/* ── Premium subscriptions ────────────────────────────────────────────────
   Premium is digital content, so on a phone it can only be sold by the store's
   own billing: StoreKit on iOS (App Store Review 3.1.1), Play Billing on
   Android. A card form in-app, or a link out to the web checkout, is a
   rejection on both. There is no non-store path here on purpose. ── */
export type SubPlan = "monthly" | "annual";

export type SubProduct = { plan: SubPlan; product_id: string; price: number };

export async function fetchSubProducts(): Promise<{ enabled: boolean; products: SubProduct[] }> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const { data } = await api.get("/studio/subscriptions/iap/products", { params: { platform } });
  const d = data?.data ?? {};
  return { enabled: Boolean(d.enabled), products: d.products ?? [] };
}

export type SubPurchase =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

export async function purchaseSubscription(
  productId: string,
  plan: SubPlan,
  /** Which tier this is. Omitted for the single legacy Premium product. */
  planKey?: string,
): Promise<SubPurchase> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: iapUnavailableReason };
  if (Platform.OS !== "android") return { ok: false, message: IOS_NOT_READY };
  void plan;

  try {
    await RNIap.initConnection();

    // Subscriptions are their own product type in both stores - fetchProducts() with
    // type: "in-app" does not return them, so asking for them that way fails with an
    // empty list.
    const subs: any[] = (await RNIap.fetchProducts({ skus: [productId], type: "subs" })) ?? [];
    const sub = subs.find((s: any) => s?.id === productId) ?? subs[0];

    const token = androidOfferToken(sub);
    if (!token) {
      // Better than letting Billing fail with a bare response code: this is
      // almost always a product that exists but has no active base-plan offer.
      return {
        ok: false,
        message: "This plan isn't available from the Play Store right now. Please try again later.",
      };
    }

    const purchase = await awaitPurchase(RNIap, () =>
      RNIap.requestPurchase({
        request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken: token }] } },
        type: "subs",
      }),
    );

    const receipt = purchase?.purchaseToken;

    if (!receipt) {
      return { ok: false, message: "The store didn't return a receipt. Please try again." };
    }

    await api.post("/studio/subscriptions/iap/verify", {
      platform: "android",
      plan,
      // The server resolves price and product from this; it never trusts the
      // client for either. Omitted entirely for the legacy product.
      ...(planKey ? { plan_key: planKey } : {}),
      receipt,
    });

    // NOT consumable: a subscription is owned, not spent. Acknowledging it as a
    // consumable would let the store sell it to the same user again.
    await RNIap.finishTransaction({ purchase, isConsumable: false });

    return { ok: true };
  } catch (e: any) {
    if (RNIap.isUserCancelledError?.(e)) {
      return { ok: false, message: "Purchase cancelled.", cancelled: true };
    }

    const serverMsg =
      e?.response?.data?.message ??
      (e?.response?.data?.errors ? Object.values(e.response.data.errors).flat()[0] : undefined);

    return { ok: false, message: (serverMsg as string) ?? e?.message ?? "Purchase failed. Please try again." };
  } finally {
    try { await iap()?.endConnection(); } catch {}
  }
}
