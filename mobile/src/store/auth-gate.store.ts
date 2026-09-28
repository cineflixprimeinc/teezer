import { create } from "zustand";

/**
 * Controls the "log in or sign up to continue" popup that appears when a guest
 * tries a restricted action. The popup is a plain overlay (not a navigation
 * screen), so closing it never touches the feed - the user stays on the exact
 * same video, no refresh, no old screen reappearing.
 *
 * `pending` is the action the guest attempted; it's replayed after a successful
 * login (see RootNavigator) - e.g. tap Like as a guest → log in → it likes.
 */
interface AuthGateState {
  visible: boolean;
  pending: (() => void) | null;
  /** Open the popup, optionally stashing the action to resume after login. */
  open: (pending?: (() => void) | null) => void;
  /** Stash the pending action WITHOUT showing the popup - used when routing to the
   *  full Saved Accounts screen instead of the popup (still replayed after login). */
  stash: (pending?: (() => void) | null) => void;
  /** Close the popup and forget the pending action (user cancelled). */
  close: () => void;
  /** Run the stored action (if any) and clear it. */
  consume: () => void;
}

export const useAuthGate = create<AuthGateState>((set, get) => ({
  visible: false,
  pending: null,
  open: (pending = null) => set({ visible: true, pending }),
  stash: (pending = null) => set({ pending }),
  close: () => set({ visible: false, pending: null }),
  consume: () => {
    const fn = get().pending;
    set({ visible: false, pending: null });
    if (fn) fn();
  },
}));
