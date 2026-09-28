"use client";

import Link from "next/link";

const MENTION_RE = /@([a-zA-Z0-9._]+)/g;

/**
 * Renders a string with @username occurrences turned into profile links.
 * Non-mention text is plain. Keeps the original whitespace / line breaks.
 */
export function MentionRenderer({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const username = match[1];
    parts.push(
      <Link
        key={`${match.index}-${username}`}
        href={`/profile/${username}`}
        className="font-semibold text-[#fe2c55] hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        @{username}
      </Link>,
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <span className={className}>{parts}</span>;
}
