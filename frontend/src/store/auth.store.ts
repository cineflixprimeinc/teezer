"use client";

import { create } from "zustand";
import { authService } from "@/services/auth.service";
import type { ReelsooUser, UserRole } from "@/types/user";

export type AuthModalMode = "login" | "signup";

interface SavedAccount {
  id: number;
  username: string;
  name: string;
  avatar: string | null;
  token: string;
  lastUsed: number; // timestamp
  tokenExpiresAt?: string | null;
  expired?: boolean;
}

type AuthState = {
  user: ReelsooUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authReady: boolean;
  savedAccounts: SavedAccount[]; // Multi-account support

  /* ── Auth Modal ── */
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;

  /* ── Auth actions ── */
  login: (payload: { login: string; password: string; turnstile_token?: string }) => Promise<{ twoFactorRequired: boolean; challenge?: string }>;
  /** Adopt a token minted by the SSO flow (same shape as a normal login). */
  applySsoAuth: (auth: { token: string; expires_at?: string; user: ReelsooUser }) => void;
  completeTwoFactor: (payload: { challenge: string; code?: string; recovery_code?: string }) => Promise<void>;
  register: (payload: Record<string, string | boolean>) => Promise<void>;
  logout: () => Promise<void>;
  expireSession: () => void;
  fetchMe: () => Promise<void>;
  setUser: (partial: Partial<ReelsooUser>) => void;
  hasRole: (roles: UserRole[]) => boolean;
  isCreator: () => boolean;
  isAdmin: () => boolean;

  /* ── Multi-account ── */
  switchAccount: (accountId: number, token: string) => Promise<void>;
  addAccountToSaved: (account: SavedAccount) => void;
  removeAccountFromSaved: (accountId: number) => void;
  getSavedAccounts: () => SavedAccount[];
};

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function fallbackTokenExpiresAt() {
  return new Date(Date.now() + TOKEN_TTL_MS).toISOString();
}

function isSavedAccountExpired(account: SavedAccount) {
  if (account.expired) return true;
  if (account.tokenExpiresAt) return Date.parse(account.tokenExpiresAt) <= Date.now();
  return Date.now() - account.lastUsed > TOKEN_TTL_MS;
}

function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("reelsoo_token", token);
  else window.localStorage.removeItem("reelsoo_token");
}

function hasStoredToken(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage.getItem("reelsoo_token"));
}

function getSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem("reelsoo_saved_accounts");
    const accounts = stored ? JSON.parse(stored) : [];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

function setSavedAccounts(accounts: SavedAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("reelsoo_saved_accounts", JSON.stringify(accounts));
  } catch {
    // quota exceeded
  }
}

function upsertSavedAccount(account: SavedAccount) {
  const accounts = getSavedAccounts();
  const next = {
    ...account,
    tokenExpiresAt: account.tokenExpiresAt ?? fallbackTokenExpiresAt(),
    expired: false,
  };
  const updated = accounts.some((a) => a.id === next.id)
    ? accounts.map((a) => (a.id === next.id ? { ...a, ...next } : a))
    : [...accounts, next];
  setSavedAccounts(updated);
  return updated;
}

function markSavedAccountExpired(accountId: number) {
  const updated = getSavedAccounts().map((a) =>
    a.id === accountId ? { ...a, expired: true } : a
  );
  setSavedAccounts(updated);
  return updated;
}

/** Persist token + saved account and flip the store to authenticated. Shared
 *  by the direct login path and the post-2FA challenge path. */
function finalizeAuthSession(
  set: (partial: Partial<AuthState>) => void,
  auth: { token: string; expires_at?: string; user: ReelsooUser },
) {
  setToken(auth.token);
  const updated = upsertSavedAccount({
    id: auth.user.id,
    username: auth.user.username,
    name: auth.user.name,
    avatar: auth.user.avatar || null,
    token: auth.token,
    tokenExpiresAt: auth.expires_at ?? fallbackTokenExpiresAt(),
    lastUsed: Date.now(),
  });
  set({
    token: auth.token,
    user: auth.user,
    isAuthenticated: true,
    isLoading: false,
    authReady: true,
    authModalOpen: false,
    savedAccounts: updated,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== "undefined" ? window.localStorage.getItem("reelsoo_token") : null,
  isAuthenticated: false,
  isLoading: hasStoredToken(),
  authReady: !hasStoredToken(),
  savedAccounts: typeof window !== "undefined" ? getSavedAccounts() : [],

  /* ── Modal state ── */
  authModalOpen: false,
  authModalMode: "login",
  openAuthModal(mode = "login") {
    set({ authModalOpen: true, authModalMode: mode });
  },
  closeAuthModal() {
    set({ authModalOpen: false });
  },

  /* ── Auth actions ── */
  async login(payload) {
    set({ isLoading: true });
    try {
      const result = await authService.login(payload);
      if (result.twoFactorRequired) {
        // Password OK but 2FA is on - keep session unestablished; the caller
        // collects a code and calls completeTwoFactor().
        set({ isLoading: false });
        return { twoFactorRequired: true, challenge: result.challenge };
      }
      finalizeAuthSession(set, result.auth);
      return { twoFactorRequired: false };
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  applySsoAuth(auth) {
    finalizeAuthSession(set, auth);
  },

  async completeTwoFactor(payload) {
    set({ isLoading: true });
    try {
      const auth = await authService.twoFactorChallenge(payload);
      finalizeAuthSession(set, auth);
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },
  async register(payload) {
    set({ isLoading: true });
    try {
      const auth = await authService.register(payload);
      setToken(auth.token);
      const updated = upsertSavedAccount({
        id: auth.user.id,
        username: auth.user.username,
        name: auth.user.name,
        avatar: auth.user.avatar || null,
        token: auth.token,
        tokenExpiresAt: auth.expires_at ?? fallbackTokenExpiresAt(),
        lastUsed: Date.now(),
      });
      set({
        token: auth.token,
        user: auth.user,
        isAuthenticated: true,
        isLoading: false,
        authReady: true,
        authModalOpen: false,
        savedAccounts: updated,
      });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },
  async logout() {
    const currentUserId = get().user?.id;
    try {
      if (get().token) await authService.logout();
    } finally {
      const savedAccounts = currentUserId ? markSavedAccountExpired(Number(currentUserId)) : getSavedAccounts();
      setToken(null);
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authReady: true,
        savedAccounts,
      });
    }
  },
  expireSession() {
    const currentUserId = get().user?.id;
    const savedAccounts = currentUserId ? markSavedAccountExpired(Number(currentUserId)) : getSavedAccounts();
    setToken(null);
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authReady: true,
      savedAccounts,
    });
  },
  async fetchMe() {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("reelsoo_token")
        : get().token;
    if (!token) {
      set({ authReady: true, isLoading: false, isAuthenticated: false, user: null });
      return;
    }
    set({ isLoading: true });
    try {
      const user = await authService.me();
      // Stale-response guard: if a login/logout/switchAccount happened while
      // this call was in flight, the token this call was FOR is no longer
      // the current one - applying its result (success or the catch's
      // expireSession() below) would clobber whatever the newer action just
      // established. query-provider.tsx fires this once on every page load,
      // so a slow or already-stale request here (e.g. a token that had gone
      // bad server-side before the user even opened the login modal) racing
      // against a fresh login was logging people out seconds after logging
      // in - the fresh session was already in place when this old call's
      // 401 arrived and unconditionally wiped it.
      if (typeof window !== "undefined" && window.localStorage.getItem("reelsoo_token") !== token) return;
      set({ user, token, isAuthenticated: true, authReady: true });
    } catch {
      if (typeof window !== "undefined" && window.localStorage.getItem("reelsoo_token") !== token) return;
      get().expireSession();
    } finally {
      set({ isLoading: false });
    }
  },
  setUser(partial) {
    const current = get().user;
    if (!current) return;
    set({ user: { ...current, ...partial } });
  },
  hasRole(roles) {
    const role = get().user?.role;
    return Boolean(role && roles.includes(role));
  },
  isCreator() {
    const user = get().user;
    return (
      user?.creatorStatus === "approved" ||
      user?.role === "creator" ||
      user?.role === "admin" ||
      user?.role === "super_admin"
    );
  },
  isAdmin() {
    const role = get().user?.role;
    return role === "admin" || role === "super_admin";
  },

  async switchAccount(accountId, token) {
    const previousToken = get().token;
    set({ isLoading: true });
    try {
      const target = getSavedAccounts().find((a) => a.id === accountId);
      if (target && isSavedAccountExpired(target)) {
        const updated = markSavedAccountExpired(accountId);
        set({
          savedAccounts: updated,
          authModalOpen: true,
          authModalMode: "login",
          isLoading: false,
        });
        throw new Error("This saved session expired. Please log in again.");
      }

      setToken(token);
      const user = await authService.me();
      set({
        token,
        user,
        isAuthenticated: true,
        authReady: true,
      });

      // Update last used timestamp
      const accounts = getSavedAccounts();
      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, lastUsed: Date.now(), expired: false } : a
      );
      setSavedAccounts(updated);
      set({ savedAccounts: updated });
    } catch (e) {
      setToken(previousToken ?? null);
      const updated = markSavedAccountExpired(accountId);
      set({
        savedAccounts: updated,
        authModalOpen: true,
        authModalMode: "login",
      });
      set({ isLoading: false });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  addAccountToSaved(account) {
    const updated = upsertSavedAccount(account);
    set({ savedAccounts: updated });
  },

  removeAccountFromSaved(accountId) {
    const accounts = getSavedAccounts().filter(a => a.id !== accountId);
    setSavedAccounts(accounts);
    set({ savedAccounts: accounts });
  },

  getSavedAccounts() {
    return getSavedAccounts();
  },
}));
