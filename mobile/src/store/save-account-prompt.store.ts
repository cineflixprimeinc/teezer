import { create } from "zustand";

/**
 * Drives the "Save this account on this device?" prompt (and its "maximum saved
 * accounts reached" variant), shown once at the root by `SaveAccountPromptModal`.
 *
 * A store rather than local state so it can be triggered from `auth.store.signIn`
 * (a non-React context) the moment a brand-new, not-yet-saved account signs in.
 */
export interface SavePromptAccount {
  id: number;
  name: string | null;
  username: string;
  avatar: string | null;
  is_verified: boolean;
}

interface SavePromptState {
  /** The just-signed-in account awaiting a save decision (null = prompt hidden). */
  account: SavePromptAccount | null;
  /** When true the modal shows the "maximum 5 reached" variant instead of Save/Not Now. */
  limitReached: boolean;
  /** Ask the user whether to save `acc` for quick login. */
  request: (acc: SavePromptAccount) => void;
  /** Switch the open prompt to the "maximum reached" message. */
  showLimit: () => void;
  /** Close the prompt. */
  dismiss: () => void;
}

export const useSaveAccountPrompt = create<SavePromptState>((set) => ({
  account: null,
  limitReached: false,
  request: (account) => set({ account, limitReached: false }),
  showLimit: () => set({ limitReached: true }),
  dismiss: () => set({ account: null, limitReached: false }),
}));
