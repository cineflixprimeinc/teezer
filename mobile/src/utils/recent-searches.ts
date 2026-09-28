import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Recent search terms, persisted on-device (AsyncStorage). Most-recent-first,
 * de-duplicated case-insensitively, capped at MAX entries. All operations are
 * fail-safe - storage errors never throw into the UI.
 */
const KEY = "reelsoo:recent-searches";
const MAX = 10;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const t = term.trim();
  if (t.length < 2) return getRecentSearches();
  const list = await getRecentSearches();
  const next = [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore write failure */
  }
  return next;
}

export async function removeRecentSearch(term: string): Promise<string[]> {
  const list = await getRecentSearches();
  const next = list.filter((x) => x.toLowerCase() !== term.toLowerCase());
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore write failure */
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
