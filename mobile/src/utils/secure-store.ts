import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "reelsoo_token";
const ACCOUNTS_KEY = "reelsoo_accounts";

/**
 * Maximum number of accounts that can be SAVED for quick login on a single
 * device. This caps only the local quick-login list - it never limits how many
 * Reelsoo accounts a person owns or can be signed into over time. Enforced in
 * the business logic (auth.store `saveAccount`) AND surfaced in the UI.
 */
export const MAX_SAVED_ACCOUNTS = 5;

/** Token lives in the device Keychain/Keystore - never AsyncStorage. */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

/**
 * A signed-in account remembered for fast switching. We store the auth TOKEN and
 * a minimal profile snapshot - NEVER a password. The whole list lives in the
 * device Keychain/Keystore (iOS Keychain / Android Keystore-backed encrypted
 * store), so the tokens are encrypted at rest by the platform.
 */
export interface SavedAccount {
  id: number;
  token: string;
  name: string | null;
  username: string;
  avatar: string | null;
  is_verified: boolean;
  /** Optional user-chosen label shown instead of the display name (Manage → Rename). */
  label?: string | null;
  /** Epoch ms the account was saved on this device (shown in "View info"). */
  savedAt?: number;
}

/**
 * Persisted list of accounts the user can quick-switch between.
 *
 * Split deliberately across two stores, because the previous single Keychain
 * item did not survive a real build:
 *
 *   - TOKENS stay in SecureStore, one item per account. They are the only
 *     secret here, and they remain encrypted at rest by the platform.
 *   - The profile snapshot (name, username, avatar URL, verified flag, label)
 *     goes to AsyncStorage. None of it is secret - it is the same public
 *     profile data the app renders on screen - and it is what made the record
 *     large.
 *
 * The whole list used to be ONE SecureStore value. An iOS Keychain item written
 * through expo-secure-store is limited to about 2048 bytes, and five accounts,
 * each carrying a token plus a signed avatar URL that can run to several
 * hundred characters, goes past that ceiling. The write then fails, so nothing
 * was saved and the switcher came back empty - while Expo Go, where the list
 * rarely grew past an account or two during testing, stayed under the limit and
 * looked fine.
 *
 * Per-account token items are a few dozen bytes each, so the ceiling is no
 * longer reachable however many accounts are saved.
 */
const ACCOUNTS_META_KEY = "reelsoo_accounts_meta";
const accountTokenKey = (id: number) => `reelsoo_acct_token_${id}`;

/** The profile half - everything except the token. */
type AccountMeta = Omit<SavedAccount, "token">;

async function readMeta(): Promise<AccountMeta[] | null> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_META_KEY);
  if (raw === null) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as AccountMeta[]) : [];
  } catch {
    return [];
  }
}

/**
 * One-time import of the old single-item format.
 *
 * Runs only when the new key is absent, so it cannot clobber the split store,
 * and deletes the legacy item afterwards. Without this every account already
 * saved on a device would disappear on upgrade.
 */
async function migrateLegacy(): Promise<SavedAccount[]> {
  let legacy: SavedAccount[] = [];
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) legacy = list as SavedAccount[];
    }
  } catch {
    // A legacy item that cannot be read is not worth failing the app over -
    // the user simply signs in again.
  }
  if (legacy.length) await accountsStore.set(legacy);
  try {
    await SecureStore.deleteItemAsync(ACCOUNTS_KEY);
  } catch {
    /* best effort */
  }
  return legacy;
}

export const accountsStore = {
  get: async (): Promise<SavedAccount[]> => {
    const meta = await readMeta();
    if (meta === null) return migrateLegacy();

    const out: SavedAccount[] = [];
    for (const m of meta) {
      let token: string | null = null;
      try {
        token = await SecureStore.getItemAsync(accountTokenKey(m.id));
      } catch {
        token = null;
      }
      // An account whose token is gone cannot be switched to, so it is dropped
      // rather than listed as a row that fails the moment it is tapped.
      if (token) out.push({ ...m, token });
    }
    return out;
  },

  set: async (accounts: SavedAccount[]): Promise<void> => {
    const previous = (await readMeta()) ?? [];

    await AsyncStorage.setItem(
      ACCOUNTS_META_KEY,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      JSON.stringify(accounts.map(({ token, ...rest }) => rest)),
    );
    await Promise.all(
      accounts.map((a) => SecureStore.setItemAsync(accountTokenKey(a.id), a.token)),
    );

    // Drop tokens for accounts that are no longer in the list, so removing an
    // account really removes its credential rather than orphaning it.
    const keep = new Set(accounts.map((a) => a.id));
    await Promise.all(
      previous
        .filter((m) => !keep.has(m.id))
        .map((m) => SecureStore.deleteItemAsync(accountTokenKey(m.id)).catch(() => {})),
    );
  },

  clear: async (): Promise<void> => {
    const meta = (await readMeta()) ?? [];
    await Promise.all(
      meta.map((m) => SecureStore.deleteItemAsync(accountTokenKey(m.id)).catch(() => {})),
    );
    await AsyncStorage.removeItem(ACCOUNTS_META_KEY);
    try {
      await SecureStore.deleteItemAsync(ACCOUNTS_KEY);
    } catch {
      /* legacy item may already be gone */
    }
  },
};
