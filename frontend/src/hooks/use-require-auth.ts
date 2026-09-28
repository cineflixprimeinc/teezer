import { useAuthStore } from "@/store/auth.store";

/**
 * Returns a `requireAuth(action)` helper.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   onLikeClick={() => requireAuth(() => toggleLike(video.id))}
 *   onCommentInputClick={() => requireAuth(() => focusCommentInput())}
 *
 * Behaviour:
 * - Authenticated  → runs action() immediately.
 * - Guest          → opens the global login/signup modal; action is NOT run.
 *
 * The hook is a thin wrapper around the Zustand auth store so callers
 * don't have to import both isAuthenticated and openAuthModal separately.
 */
export function useRequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);

  return function requireAuth(action: () => void) {
    if (isAuthenticated) {
      action();
    } else {
      openAuthModal("login");
    }
  };
}
