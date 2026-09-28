import { useAuthStore } from "@/store/auth.store";

/** Convenience selector hook for auth state across screens. */
export function useAuth() {
  return useAuthStore((s) => ({
    status: s.status,
    user: s.user,
    isAuthenticated: s.status === "authenticated",
    signIn: s.signIn,
    signOut: s.signOut,
    setUser: s.setUser,
  }));
}
