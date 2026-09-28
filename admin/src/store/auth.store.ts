"use client";

import { create } from "zustand";
import { authService } from "@/services/auth.service";
import type { ReelsooUser } from "@/types/user";

type LoginOutcome = { twoFactorRequired: true; challenge: string } | { twoFactorRequired: false };

type AuthState = {
  user: ReelsooUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: { login: string; password: string; turnstile_token?: string }) => Promise<LoginOutcome>;
  completeTwoFactor: (payload: { challenge: string; code?: string; recovery_code?: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  isAdmin: () => boolean;
};

// No client-side token of any kind - the session lives entirely in the
// httpOnly reelsoo_admin_session cookie the API sets/clears, which this app
// never reads and never needs to. `isAuthenticated` can't be known
// synchronously on page load the way a localStorage check could pretend to
// (the cookie is invisible to JS by design) - fetchMe() is the only way to
// find out, exactly the same "show a spinner until checked" flow
// RequireAdmin already implements while that resolves.
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  async login(payload) {
    set({ isLoading: true });
    try {
      const result = await authService.login(payload);
      if (result.twoFactorRequired) {
        return { twoFactorRequired: true, challenge: result.challenge };
      }
      // result.auth.token is intentionally never read: the same login
      // response also set the session cookie, which is what every
      // subsequent request actually authenticates with.
      set({ user: result.auth.user, isAuthenticated: true });
      return { twoFactorRequired: false };
    } finally {
      set({ isLoading: false });
    }
  },

  async completeTwoFactor(payload) {
    set({ isLoading: true });
    try {
      const auth = await authService.twoFactorChallenge(payload);
      set({ user: auth.user, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },

  async logout() {
    try {
      await authService.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  async fetchMe() {
    set({ isLoading: true });
    try {
      const user = await authService.me();
      set({ user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  isAdmin() {
    const role = get().user?.role;
    return role === "admin" || role === "super_admin";
  },
}));
