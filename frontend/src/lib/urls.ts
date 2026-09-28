// Extracts http(s) URLs from free text (comments, captions, messages, bios).
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/** All unique URLs found in the text, with trailing punctuation trimmed. */
export function extractUrls(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(URL_RE);
  if (!matches) return [];
  const cleaned = matches.map((u) => u.replace(/[.,;:!?)\]}>'"]+$/, ""));
  return Array.from(new Set(cleaned));
}

/** First URL in the text, or null. Used to render a single preview card. */
export function firstUrl(text?: string | null): string | null {
  return extractUrls(text)[0] ?? null;
}
