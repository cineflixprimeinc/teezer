/**
 * Session-reset registry.
 *
 * User-scoped stores (things that must never carry one account's data into
 * another - Ads/Wallet balances, etc.) register a reset callback here at import
 * time. The auth store calls `resetUserScopedStores()` on every session change
 * (sign-in, account switch, sign-out) so stale in-memory data can't leak.
 *
 * This module imports NOTHING, so the auth store can call it without importing
 * (and creating a require cycle through) every user-scoped store. A store only
 * needs resetting if it was ever loaded - and loading it runs its registration -
 * so the registry is always in sync with what actually holds data.
 */

type Resetter = () => void;

const resetters = new Set<Resetter>();

/** Called by a user-scoped store at module load to opt into session resets. */
export function registerSessionReset(fn: Resetter): void {
  resetters.add(fn);
}

/** Drop every registered user-scoped store's in-memory state. */
export function resetUserScopedStores(): void {
  resetters.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a single store's reset must never break the session change */
    }
  });
}

/**
 * Work that has to reach the server as the OUTGOING user, before sign-out
 * clears the token.
 *
 * Distinct from the resetters above in both timing and shape: those run after
 * the session is already gone and only touch local state, which is too late for
 * anything that needs to be an authenticated request. Unregistering this
 * handset's push token is the case this exists for - do it after the token is
 * cleared and it is an anonymous 401, do it not at all and the phone keeps
 * buzzing for an account nobody is signed into.
 *
 * The token is handed in rather than read back, because by the time an async
 * hook actually runs the store has already cleared it - a hook that looked it
 * up would find nothing. Hooks are fire-and-forget: a logout must never sit
 * waiting on the network to finish, so this returns void and nothing awaits it.
 */
type SignOutHook = (token: string | null) => void;

const signOutHooks = new Set<SignOutHook>();

/** Called at module load by anything with server-side cleanup to do. */
export function registerSignOutHook(fn: SignOutHook): void {
  signOutHooks.add(fn);
}

/** Fired by the auth store on a real sign-out, while the token is still valid. */
export function runSignOutHooks(token: string | null): void {
  signOutHooks.forEach((fn) => {
    try {
      fn(token);
    } catch {
      /* one hook's failure must never block the sign-out */
    }
  });
}
