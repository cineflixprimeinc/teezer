import { api } from "./api";

/**
 * Wikipedia knowledge cards.
 *
 * The browser never talks to Wikimedia - every request goes to our Go backend,
 * which owns the caching, the entity gate and the rate limiting. From here it
 * is one plain GET whose result is safe to cache aggressively.
 */

export type KnowledgeArticle = {
  title: string;
  summary: string;
  /** Empty string when the article has no lead image. */
  thumbnail: string;
  article_url: string;
};

export type KnowledgeResult = {
  found: boolean;
  article?: KnowledgeArticle;
};

export const knowledgeService = {
  /**
   * Look up one topic. Resolves to `{ found: false }` rather than throwing
   * when there is no article, because "no card" is a normal outcome on most
   * searches - the caller renders nothing and moves on.
   *
   * Network and server failures are swallowed for the same reason: a knowledge
   * card is decoration, and it must never be able to surface an error on a
   * search page or block anything around it.
   */
  async lookup(query: string, signal?: AbortSignal): Promise<KnowledgeResult> {
    const q = query.trim();
    if (!q) return { found: false };

    try {
      const { data } = await api.get("/knowledge", { params: { q }, signal });
      return (data?.data as KnowledgeResult) ?? { found: false };
    } catch {
      return { found: false };
    }
  },
};
