"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useMentionSearch, type MentionUser } from "@/hooks/use-mention-search";
import { cn } from "@/lib/utils";

/* ── helpers ────────────────────────────────────────────────────────────── */

/** Returns the @query fragment immediately before the cursor, or null. */
function getMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match  = before.match(/@([a-zA-Z0-9._]*)$/);
  return match ? match[1] : null;
}

function MiniAvatar({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initial = (name.replace(/[^a-zA-Z]/g, "")[0] ?? name[0] ?? "U").toUpperCase();
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setErr(true)}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center font-bold text-white flex-shrink-0 bg-[#fe2c55]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initial}
    </div>
  );
}

/* ── MentionInput ───────────────────────────────────────────────────────── */

interface MentionInputProps {
  value:        string;
  onChange:     (val: string) => void;
  onKeyDown?:   (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?:    boolean;
  rows?:        number;
  maxLength?:   number;
  className?:   string;
  style?:       React.CSSProperties;
  inputRef?:    React.RefObject<HTMLTextAreaElement | null>;
}

export const MentionInput = forwardRef<HTMLDivElement, MentionInputProps>(function MentionInput(
  { value, onChange, onKeyDown, placeholder, disabled, rows = 1, maxLength, className, style, inputRef },
  _ref,
) {
  const wrapperRef                    = useRef<HTMLDivElement>(null);
  const taRef                         = useRef<HTMLTextAreaElement>(null);
  const resolvedRef                   = (inputRef ?? taRef) as React.RefObject<HTMLTextAreaElement>;
  const { results, loading, search, clear } = useMentionSearch();
  const [activeIdx, setActiveIdx]     = useState(0);
  const [showDrop,  setShowDrop]      = useState(false);
  const queryRef                      = useRef<string | null>(null);

  /* Detect @ while typing */
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    onChange(next);

    const cursor = e.target.selectionStart ?? next.length;
    const q      = getMentionQuery(next, cursor);

    if (q !== null) {
      queryRef.current = q;
      setActiveIdx(0);
      setShowDrop(true);
      search(q);
    } else {
      queryRef.current = null;
      setShowDrop(false);
      clear();
    }
  }

  /* Keyboard nav inside dropdown */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showDrop && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertMention(results[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        setShowDrop(false);
        clear();
        return;
      }
    }
    onKeyDown?.(e);
  }

  /* Insert selected mention into textarea */
  const insertMention = useCallback((user: MentionUser) => {
    const ta     = resolvedRef.current;
    const cursor = ta?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after  = value.slice(cursor);

    // Replace the @query fragment with @username + space
    const replaced = before.replace(/@([a-zA-Z0-9._]*)$/, `@${user.username} `);
    const next     = replaced + after;
    onChange(maxLength ? next.slice(0, maxLength) : next);

    setShowDrop(false);
    clear();
    queryRef.current = null;

    requestAnimationFrame(() => {
      if (ta) {
        const pos = replaced.length;
        ta.selectionStart = ta.selectionEnd = pos;
        ta.focus();
      }
    });
  }, [value, onChange, maxLength, clear, resolvedRef]);

  /* Close on outside click */
  useEffect(() => {
    if (!showDrop) return;
    const h = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setShowDrop(false);
        clear();
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showDrop, clear]);

  const dropVisible = showDrop && (loading || results.length > 0);

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <textarea
        ref={resolvedRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={className}
        style={style}
      />

      {/* Dropdown */}
      {dropVisible && (
        <div className="absolute bottom-full left-0 z-[300] mb-1 w-[260px] overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-xl"
          style={{ animation: "fadeInUp 160ms ease" }}>
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent" />
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {results.map((user, idx) => (
                <li key={user.id} role="option" aria-selected={idx === activeIdx}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      idx === activeIdx ? "bg-[#fff0f4]" : "hover:bg-[#f8f9fb]",
                    )}
                  >
                    <MiniAvatar src={user.avatar} name={user.displayName || user.username} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-[13px] font-bold text-black">
                          {user.displayName || user.username}
                        </span>
                        {user.isVerified && (
                          <VerifiedBadge size={12} className="flex-shrink-0" />
                        )}
                      </div>
                      <span className="truncate text-[11px] text-[#6b7280]">
                        @{user.username}
                        {user.followersCount > 0 && (
                          <span className="ml-1 text-[10px] text-[#9ca3af]">
                            · {user.followersCount >= 1000
                              ? `${(user.followersCount / 1000).toFixed(1)}K`
                              : user.followersCount} followers
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
