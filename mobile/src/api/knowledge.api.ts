import { api } from "./client";

/**
 * Wikipedia knowledge cards.
 *
 * The app never talks to Wikimedia directly - every request goes to our Go
 * backend, which owns the caching, the entity gate and the rate limiting.
 * Mirrors frontend/src/services/knowledge.service.ts so both clients see the
 * same contract.
 */

export interface KnowledgeArticle {
  title: string;
  summary: string;
  /** Empty string when the article has no lead image. */
  thumbnail: string;
  article_url: string;
}

export interface KnowledgeResult {
  found: boolean;
  article?: KnowledgeArticle;
}

/**
 * Look up one topic.
 *
 * Resolves to `{ found: false }` instead of throwing on any failure - no
 * article, offline, server error. A knowledge card is decoration: the caller
 * hides it and carries on, and a lookup must never be able to surface an error
 * over a feed or a search screen.
 */
export async function lookupKnowledge(
  query: string,
  signal?: AbortSignal,
): Promise<KnowledgeResult> {
  const q = query.trim();
  if (!q) return { found: false };

  try {
    const { data } = await api.get("/knowledge", { params: { q }, signal });
    return (data?.data as KnowledgeResult) ?? { found: false };
  } catch {
    return { found: false };
  }
}
