import axios from "axios";
import { InteractionManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { AuthUser } from "@/types";
import { tokenStore, accountsStore, SavedAccount, MAX_SAVED_ACCOUNTS } from "@/utils/secure-store";
import { api, setAuthToken } from "@/api/client";
import { authApi } from "@/api/auth.api";
import { config } from "@/constants/config";
import { getDeviceFingerprint } from "@/utils/fingerprint";
import { queryClient } from "@/store/query";
import { useSaveAccountPrompt } from "@/store/save-account-prompt.store";
import { registerSessionReset, resetUserScopedStores, runSignOutHooks } from "@/store/session";
import { setUser as setSentryUser, breadcrumb } from "@/services/sentry";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Result of trying to save the active account to the quick-login list. */
export type SaveResult = { ok: boolean; already?: boolean; limit?: boolean };
/** Result of switching to a saved account. `expired` → its token is dead (re-login). */
export type SwitchResult = { ok: boolean; expired?: boolean; account?: SavedAccount; stale?: boolean };

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Accounts saved on this device for one-tap login/switch (max 5, see MAX_SAVED_ACCOUNTS). */
  accounts: SavedAccount[];
  /** Bumps on every sign-in/out so RootNavigator can dismiss the auth modal even
   *  when adding a second account (status was already "authenticated"). */
  loginCount: number;
  /** Run once on app boot: read stored token + accounts, validate via /auth/me. */
  bootstrap: () => Promise<void>;
  /** Set the active session after a successful login/register. Does NOT auto-save
   *  the account - it triggers the "Save this account?" prompt instead. */
  signIn: (token: string, user: AuthUser) => Promise<void>;
  /** Save the CURRENTLY active account to the quick-login list (enforces max 5). */
  saveAccount: () => Promise<SaveResult>;
  /** Whether an account id is already in the saved quick-login list. */
  isSaved: (id: number) => boolean;
  /** Switch the active session to a saved account. Validates the saved token first
   *  (bypassing the global 401 handler) so an expired session asks for a password
   *  instead of silently failing. */
  switchAccount: (id: number) => Promise<SwitchResult>;
  /** Remove one saved account from this device (keeps the active session if it's the one removed). */
  removeAccount: (id: number) => Promise<void>;
  /** Remove every saved account from this device. */
  removeAllAccounts: () => Promise<void>;
  /** Persist a new order for the saved accounts (drag-to-reorder). */
  reorderAccounts: (orderedIds: number[]) => Promise<void>;
  /** Set/clear a custom label for a saved account. */
  renameAccount: (id: number, label: string) => Promise<void>;
  /** End the active session. By default the saved card is kept for quick re-login;
   *  pass `{ removeSaved: true }` to also delete it from this device. */
  signOut: (opts?: { removeSaved?: boolean }) => Promise<void>;
  setUser: (user: AuthUser) => void;
}

function unwrapMe(res: unknown): AuthUser {
  const r = res as { data?: AuthUser } & AuthUser;
  return (r?.data ?? r) as AuthUser;
}

function toAccount(token: string, user: AuthUser): SavedAccount {
  return { id: user.id, token, name: user.name, username: user.username, avatar: user.avatar, is_verified: !!user.is_verified };
}

/** Refresh the token + profile snapshot of an already-saved account in place,
 *  preserving its position, custom label and savedAt. Returns the same array
 *  reference when nothing was saved for that id (so callers can skip a write). */
function refreshSnapshot(list: SavedAccount[], token: string, user: AuthUser): SavedAccount[] {
  if (!list.some((a) => a.id === user.id)) return list;
  return list.map((a) =>
    a.id === user.id
      ? { ...a, token, name: user.name, username: user.username, avatar: user.avatar, is_verified: !!user.is_verified }
      : a,
  );
}

/**
 * Validate a saved token WITHOUT the shared api instance - a raw axios call so a
 * 401 can't trip the global unauthorized handler (which would clear the active
 * token and sign the whole app out). Distinguishes an expired token (401/403)
 * from a mere network hiccup so we only force a password re-entry when the
 * session is genuinely dead.
 */
async function validateToken(token: string): Promise<{ ok: true; user: AuthUser } | { ok: false; expired: boolean }> {
  try {
    const res = await axios.get(`${config.apiBaseUrl}/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Client": config.clientHeader,
        "X-Device-Fingerprint": await getDeviceFingerprint(),
      },
      timeout: 15000,
    });
    return { ok: true, user: unwrapMe(res.data) };
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    return { ok: false, expired: status === 401 || status === 403 };
  }
}

/**
 * Revoke ONE saved account's token server-side, authenticated with THAT
 * account's own token - never the active session's, which is what the shared
 * `api` instance would attach. Same raw-axios pattern as validateToken above,
 * for the same reason. Best-effort: removing a card from this device must
 * never hang/fail on a dead network - the local removal already happened by
 * the time this is called (see removeAccount/removeAllAccounts).
 */
async function revokeToken(token: string): Promise<void> {
  try {
    await axios.post(`${config.apiBaseUrl}/auth/logout`, null, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Client": config.clientHeader,
        "X-Device-Fingerprint": await getDeviceFingerprint(),
      },
      timeout: 15000,
    });
  } catch {
    /* best-effort - the card is already gone from this device either way */
  }
}

// Recent searches sit in AsyncStorage under FIXED, device-wide keys - they were
// never scoped to an account. Registering them here (rather than a one-off call
// inside signOut) means resetUserScopedStores() also clears them on signIn and
// switchAccount - the two session-change paths that used to leak one account's
// search terms into the next, since only signOut used to clear them.
registerSessionReset(() => {
  void AsyncStorage.multiRemove([
    "teezer:search:recents",   // feed search
    "teezer:inbox:recents",    // inbox search
    "teezer:spaces:recents",   // spaces search
    "teezer:recent-searches",  // shared util (Content Preferences' "clear")
  ]).catch(() => { /* ignore */ });
});

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accounts: [],
  loginCount: 0,

  bootstrap: async () => {
    const accounts = await accountsStore.get();
    const token = await tokenStore.get();
    if (!token) {
      set({ status: "unauthenticated", user: null, accounts });
      return;
    }
    setAuthToken(token);
    try {
      const user = unwrapMe(await authApi.me());
      // Keep an already-saved card's snapshot fresh; never auto-ADD (the user
      // decides that via the Save prompt).
      const merged = refreshSnapshot(accounts, token, user);
      if (merged !== accounts) await accountsStore.set(merged);
      set({ status: "authenticated", user, accounts: merged });
    } catch {
      await tokenStore.clear();
      setAuthToken(null);
      set({ status: "unauthenticated", user: null, accounts });
    }
  },

  signIn: async (token, user) => {
    // Numeric id only. Enough to see that six crash reports came from one
    // person rather than six; not enough to identify them from the dashboard.
    setSentryUser(user.id);
    breadcrumb("auth", "Signed in");
    await tokenStore.set(token);
    setAuthToken(token);
    queryClient.clear(); // never show the previous account's cached data
    resetUserScopedStores(); // + wipe user-scoped stores (Ads/Wallet) held outside react-query
    const alreadySaved = get().accounts.some((a) => a.id === user.id);
    const accounts = alreadySaved ? refreshSnapshot(get().accounts, token, user) : get().accounts;
    if (alreadySaved) await accountsStore.set(accounts);
    set({ status: "authenticated", user, accounts, loginCount: get().loginCount + 1 });
    // First-time login on this device → offer to save it for quick login.
    //
    // Deferred until the navigation transition finishes, and that ordering is
    // load-bearing on iOS. The set() above flips `status` to "authenticated",
    // which synchronously wakes RootNavigator's effect and fires
    // StackActions.popToTop() to dismiss the Login/Signup screens. Those are
    // @react-navigation/native-stack screens - real UIViewControllers - and
    // this prompt renders through BottomSheet, i.e. a React Native <Modal>,
    // which is another UIViewController presentation. Asking iOS to present one
    // in the same frame it is dismissing another deadlocks its presentation
    // machinery: the app keeps rendering but stops accepting touches, and only
    // a force-quit recovers it.
    //
    // Debug builds got away with it because the slower dev bundle happened to
    // land the two in different frames; Hermes + minification in a release
    // build closes that gap, which is why this only ever froze in TestFlight.
    //
    // Also why Account B went missing: signIn() never persists a new account by
    // itself, it only asks - saveAccount() does the write when the user taps
    // Save. Freezing before they could tap meant nothing was ever stored.
    //
    // runAfterInteractions is not a timeout papering over a race; it is the
    // scheduling primitive for "after the current transition", so the modal
    // presents against a settled view hierarchy.
    if (!alreadySaved) {
      const pending = {
        id: user.id, name: user.name, username: user.username, avatar: user.avatar, is_verified: !!user.is_verified,
      };
      InteractionManager.runAfterInteractions(() => {
        useSaveAccountPrompt.getState().request(pending);
      });
    }
  },

  saveAccount: async () => {
    const { user, accounts } = get();
    if (!user) return { ok: false };
    if (accounts.some((a) => a.id === user.id)) return { ok: true, already: true };
    if (accounts.length >= MAX_SAVED_ACCOUNTS) return { ok: false, limit: true };
    const token = (await tokenStore.get()) ?? "";
    if (!token) return { ok: false };
    const acc: SavedAccount = { ...toAccount(token, user), savedAt: Date.now() };
    const next = [...accounts, acc];
    await accountsStore.set(next);
    set({ accounts: next });
    return { ok: true };
  },

  isSaved: (id) => get().accounts.some((a) => a.id === id),

  switchAccount: async (id) => {
    setSentryUser(id);
    breadcrumb("auth", "Account switched", { accountId: id });
    const acc = get().accounts.find((a) => a.id === id);
    if (!acc) return { ok: false };
    if (acc.id === get().user?.id) return { ok: true };

    const res = await validateToken(acc.token);
    if (res.ok) {
      setAuthToken(acc.token);
      await tokenStore.set(acc.token);
      queryClient.clear(); // drop the previous account's cached data (feed, inbox, profile…)
      resetUserScopedStores(); // + Ads/Wallet stores held outside react-query
      const accounts = refreshSnapshot(get().accounts, acc.token, res.user);
      if (accounts !== get().accounts) await accountsStore.set(accounts);
      // Bump loginCount so RootNavigator treats this like a fresh sign-in even when
      // we were ALREADY authenticated (in-app switch): it dismisses any open auth
      // surface, replays a pending action, and every screen re-reads the new user +
      // refetches its authed queries. Without this an in-app switch changed `user`
      // but nothing refreshed, so the switch looked like it did nothing.
      set({ status: "authenticated", user: res.user, accounts, loginCount: get().loginCount + 1 });
      return { ok: true };
    }
    if (res.expired) {
      // Dead session - the card stays, but the user must re-enter their password.
      return { ok: false, expired: true, account: acc };
    }
    // Network hiccup (not a real 401): switch optimistically on the cached snapshot
    // rather than blocking; a genuinely bad token will 401 on the next real call.
    setAuthToken(acc.token);
    await tokenStore.set(acc.token);
    queryClient.clear();
    resetUserScopedStores(); // + Ads/Wallet stores held outside react-query
    set({
      status: "authenticated",
      user: { id: acc.id, name: acc.name, username: acc.username, avatar: acc.avatar, is_verified: acc.is_verified } as AuthUser,
      loginCount: get().loginCount + 1,
    });
    return { ok: true, stale: true };
  },

  removeAccount: async (id) => {
    const target = get().accounts.find((a) => a.id === id);
    const next = get().accounts.filter((a) => a.id !== id);
    await accountsStore.set(next);
    set({ accounts: next });
    // The card is gone from this device either way; also revoke its token
    // server-side so it can't still be used to authenticate elsewhere - see
    // revokeToken above. Deliberately not awaited: removal must not wait on
    // a network call.
    if (target) void revokeToken(target.token);
  },

  removeAllAccounts: async () => {
    const targets = get().accounts;
    await accountsStore.clear();
    set({ accounts: [] });
    targets.forEach((a) => void revokeToken(a.token));
  },

  reorderAccounts: async (orderedIds) => {
    const byId = new Map(get().accounts.map((a) => [a.id, a]));
    const next: SavedAccount[] = [];
    for (const oid of orderedIds) { const a = byId.get(oid); if (a) next.push(a); }
    // Safety: keep any account not referenced in orderedIds.
    for (const a of get().accounts) if (!orderedIds.includes(a.id)) next.push(a);
    await accountsStore.set(next);
    set({ accounts: next });
  },

  renameAccount: async (id, label) => {
    const clean = label.trim() || null;
    const next = get().accounts.map((a) => (a.id === id ? { ...a, label: clean } : a));
    await accountsStore.set(next);
    set({ accounts: next });
  },

  signOut: async (opts) => {
    setSentryUser(null);
    breadcrumb("auth", "Signed out");
    // IDEMPOTENT + non-looping. A stray 401 from a guest request calls this via
    // the global unauthorized handler; if it re-ran the full teardown it looped
    // (authApi.logout → 401 → handler → signOut → …), and every pass did
    // queryClient.clear() + loginCount++ - churn that froze the feed/explore and
    // made the app look dead after logout. When we're already a guest, do nothing
    // beyond making sure the in-memory token is gone.
    if (get().status !== "authenticated") {
      setAuthToken(null);
      return;
    }

    const activeId = get().user?.id;
    const keepingSaved = ! opts?.removeSaved && activeId != null && get().accounts.some((a) => a.id === activeId);
    // Snapshot the live token BEFORE clearing. On a 401-triggered logout the
    // interceptor has already cleared it, so `token` is null → we skip the revoke
    // (which would otherwise 401 and loop).
    const token = await tokenStore.get();

    // 0) Anything that has to reach the server AS THIS USER goes now, while the
    //    token above is still valid - push unregistration, so this handset stops
    //    receiving the account's notifications. Fire-and-forget by design: the
    //    logout must not wait on the network, and the token is handed over
    //    explicitly because the teardown below lands before these finish.
    runSignOutHooks(token);

    // 1) Flip to guest state FIRST, so any 401 during the (optional) revoke below
    //    re-enters this function as a no-op (status is already unauthenticated).
    await tokenStore.clear();
    setAuthToken(null);
    delete api.defaults.headers.common.Authorization;
    // Drop ONLY user-scoped caches; keep public browse content (feed, explore,
    // hashtags, public profiles) alive so guest mode is instant and the feed keeps
    // playing. `queryClient.clear()` here wiped everything and stopped playback.
    queryClient.removeQueries({ predicate: (q) => isUserScopedQuery(q.queryKey) });
    // The public caches we deliberately KEEP were fetched as the signed-in user,
    // so every row still carries that user's per-viewer flags. Left alone, a
    // guest sees the previous account's likes and saves filled in on the feed.
    // Scrubbing the flags in place clears them without dropping the data, so the
    // video carries on playing - which is the whole reason those caches stay.
    scrubViewerFlags();
    resetUserScopedStores(); // drop Ads/Wallet stores + recent searches held outside react-query too

    let accounts = get().accounts;
    if (opts?.removeSaved && activeId != null) {
      accounts = accounts.filter((a) => a.id !== activeId);
      await accountsStore.set(accounts);
    }
    set({ status: "unauthenticated", user: null, accounts, loginCount: get().loginCount + 1 });

    // 2) Revoke server-side AFTER the local teardown - only for a real user logout
    //    with a live token we are NOT keeping saved (keeping it saved must leave the
    //    token valid for one-tap re-login). Failure is ignored and can't loop.
    if (token && ! keepingSaved) {
      try {
        await authApi.logout();
      } catch {
        /* already logged out locally regardless */
      }
    }
  },

  setUser: (user) => {
    const accounts = refreshSnapshotProfile(get().accounts, user);
    if (accounts !== get().accounts) void accountsStore.set(accounts);
    set({ user, accounts });
  },
}));

/**
 * On logout we keep GUEST-visible content cached (so the feed/explore keep
 * playing) and drop only user-scoped caches. Returns true for a query that
 * belongs to the signed-in user and must be cleared.
 */
function isUserScopedQuery(key: readonly unknown[]): boolean {
  const root = key[0];
  if (typeof root !== "string") return true; // unknown shape → clear to be safe
  // Public browse content that stays alive in guest mode.
  const PUBLIC = new Set([
    "feed",              // for-you + following (guests still see for-you)
    "explore-hashtags", "explore-sounds", "explore-creators", "explore-trending", "explore-search",
    "profileVideos",     // a creator's public video grid
    "spaces",            // public audio rooms
  ]);
  if (PUBLIC.has(root)) return false;
  // Public profile reads are ["profile","public",username] - keep those; drop
  // ["profile","me"] and any other private profile query.
  if (root === "profile") return key[1] !== "public";
  // Everything else (inbox, messages, badges, notifications, wallet, …) is the
  // signed-in user's and is cleared.
  return true;
}

/**
 * Blank the per-viewer flags on cached PUBLIC content.
 *
 * `is_liked` / `is_saved` / `is_following` are answers to "has THIS viewer done
 * this", so they belong to the session that fetched them. The rows themselves
 * are public and stay - only the answers are wrong once there is no viewer.
 *
 * Walks the cached value rather than assuming one shape: the feed is an
 * infinite query ({ pages: [{ data: [...] }] }), a profile grid is a single
 * page ({ data: [...] }), and some reads are a bare array. Depth-capped, so a
 * cyclic or unexpectedly deep value cannot spin.
 */
function scrubViewerFlags(): void {
  const strip = (v: unknown, depth = 0): unknown => {
    if (depth > 5 || v == null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => strip(x, depth + 1));

    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = { ...o };
    let touched = false;

    for (const flag of ["is_liked", "is_saved", "is_following"]) {
      if (typeof out[flag] === "boolean" && out[flag] !== false) {
        out[flag] = false;
        touched = true;
      }
    }
    // Follow state is three-valued on profiles; "none" is its signed-out answer.
    if (typeof out.follow_status === "string" && out.follow_status !== "none") {
      out.follow_status = "none";
      touched = true;
    }

    for (const k of ["pages", "data", "items", "user"]) {
      if (k in out) {
        const next = strip(out[k], depth + 1);
        if (next !== out[k]) { out[k] = next; touched = true; }
      }
    }
    return touched ? out : v;
  };

  queryClient.setQueriesData({ predicate: (q) => !isUserScopedQuery(q.queryKey) }, (old) =>
    strip(old),
  );
}

/** Like refreshSnapshot but profile-only (no token) - for setUser. */
function refreshSnapshotProfile(list: SavedAccount[], user: AuthUser): SavedAccount[] {
  if (!list.some((a) => a.id === user.id)) return list;
  return list.map((a) =>
    a.id === user.id
      ? { ...a, name: user.name, username: user.username, avatar: user.avatar, is_verified: !!user.is_verified }
      : a,
  );
}
