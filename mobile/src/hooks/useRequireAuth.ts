import { useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { navigationRef } from "@/navigation/ref";

/**
 * Returns `requireAuth(action?)`:
 *  - signed in  → runs `action` immediately, returns true.
 *  - guest with SAVED accounts → routes to the full "Saved Accounts" screen so
 *                 they can resume with one tap; `action` is stashed and replayed
 *                 after login (returns false).
 *  - guest with NO saved accounts → opens the lightweight auth popup over the
 *                 feed and stashes `action` (returns false). Closing it just
 *                 dismisses it; the feed is never navigated away from.
 */
export function useRequireAuth() {
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const open = useAuthGate((s) => s.open);

  return useCallback(
    (action?: () => void): boolean => {
      if (isAuthed) {
        action?.();
        return true;
      }
      const hasSaved = useAuthStore.getState().accounts.length > 0;
      if (hasSaved && navigationRef.isReady()) {
        // Remember the attempted action, then show Saved Accounts (not the popup).
        useAuthGate.getState().stash(action ?? null);
        navigationRef.navigate("SavedAccounts" as never);
      } else {
        open(action ?? null);
      }
      return false;
    },
    [isAuthed, open],
  );
}
