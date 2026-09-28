import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";

export interface MentionUser {
  id:             number;
  username:       string;
  displayName:    string;
  avatar:         string | null;
  isVerified:     boolean;
  followersCount: number;
}

const cache = new Map<string, MentionUser[]>();

export function useMentionSearch() {
  const [results,  setResults]  = useState<MentionUser[]>([]);
  const [loading,  setLoading]  = useState(false);
  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const q = query.trim();
    if (q.length === 0) { setResults([]); setLoading(false); return; }

    if (cache.has(q)) { setResults(cache.get(q)!); setLoading(false); return; }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { data } = await api.get(`/users/mention-search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const items: MentionUser[] = data.data ?? [];
        cache.set(q, items);
        setResults(items);
      } catch {
        // aborted or network error - keep previous results
      } finally {
        setLoading(false);
      }
    }, 270);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setResults([]);
    setLoading(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { results, loading, search, clear };
}
