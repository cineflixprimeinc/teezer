"use client";

import { useSyncExternalStore } from "react";

/* Never notifies - this store has exactly two values (server / client) and the
   transition between them is hydration itself, which React already drives. */
const subscribe         = () => () => {};
const getSnapshot       = () => true;
const getServerSnapshot = () => false;

/**
 * `false` while rendering on the server and throughout hydration, `true` from the
 * first client render after hydration completes.
 *
 * Needed for anything whose correct output depends on `localStorage`, because the
 * server cannot see it. The auth store seeds `authReady` from
 * `hasStoredToken()`, which is necessarily `false` during SSR - so on the server a
 * logged-in visitor is indistinguishable from a guest, and any UI branching on auth
 * state bakes the GUEST branch into the HTML. The browser paints that before a
 * single line of JS runs, which is the flash of "Login / Signup" a logged-in user
 * sees on refresh; no client-side guard can prevent it, because it happened before
 * the client existed.
 *
 * Gating on this renders a neutral placeholder into the HTML instead, then swaps to
 * the real state once the store has actually read `localStorage`.
 *
 * Implemented with `useSyncExternalStore` rather than a `useState` + `useEffect`
 * "mounted" flag: it is hydration-safe by construction (React uses the server
 * snapshot for the hydration render, so markup matches and no mismatch warning is
 * emitted) and it avoids a setState-in-effect cascade.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
