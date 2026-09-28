"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Bold, Italic, List, ListOrdered, Link2, Heading2, Heading3, Code2, Undo2, Redo2 } from "lucide-react";

/**
 * Lightweight WYSIWYG for CMS & Legal page content - no editor library
 * dependency (contentEditable + execCommand), since this is an internal
 * admin tool, not a public surface, and it keeps the VPS deploy to a plain
 * git pull + build rather than a new npm package. The output is plain
 * semantic HTML (h2/h3/p/ul/ol/a/strong/em), which is exactly what the
 * live legal pages' CMS-aware renderer expects (see
 * frontend/src/features/legal/cms-legal-page.tsx: h2 → TOC entry).
 *
 * The "HTML" toggle is the escape hatch for anything the toolbar can't do
 * (tables, custom markup) - it edits the exact same string.
 */
interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  // Tracks the last value THIS component produced, so the sync effect below
  // only pushes into the contentEditable div on a genuine external change
  // (switching pages) - never while the user is actively typing, which
  // would yank the caret to the start on every keystroke.
  const lastKnown = useRef(value);

  useEffect(() => {
    if (value !== lastKnown.current) {
      lastKnown.current = value;
      setSourceValue(value);
      if (ref.current && ref.current.innerHTML !== value) {
        ref.current.innerHTML = value || "";
      }
    }
  }, [value]);

  const exec = useCallback(
    (cmd: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(cmd, false, arg);
      if (ref.current) {
        lastKnown.current = ref.current.innerHTML;
        onChange(ref.current.innerHTML);
      }
    },
    [onChange],
  );

  const handleInput = useCallback(() => {
    if (ref.current) {
      lastKnown.current = ref.current.innerHTML;
      onChange(ref.current.innerHTML);
    }
  }, [onChange]);

  const insertLink = useCallback(() => {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  }, [exec]);

  const toggleSource = useCallback(() => {
    if (!sourceMode && ref.current) {
      setSourceValue(ref.current.innerHTML);
    } else if (sourceMode) {
      lastKnown.current = sourceValue;
      onChange(sourceValue);
      if (ref.current) ref.current.innerHTML = sourceValue;
    }
    setSourceMode((s) => !s);
  }, [sourceMode, sourceValue, onChange]);

  const btn =
    "flex h-8 w-8 items-center justify-center rounded-lg text-[#4b5563] hover:bg-[#f4f5f7] hover:text-[#111827] transition-colors";

  return (
    <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#e8eaed] bg-[#fafafa] p-1.5">
        <button type="button" className={btn} title="Heading 2" onClick={() => exec("formatBlock", "h2")}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Heading 3" onClick={() => exec("formatBlock", "h3")}>
          <Heading3 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-[#e8eaed]" />
        <button type="button" className={btn} title="Bold" onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Italic" onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-[#e8eaed]" />
        <button type="button" className={btn} title="Bullet list" onClick={() => exec("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-[#e8eaed]" />
        <button type="button" className={btn} title="Insert link" onClick={insertLink}>
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Undo" onClick={() => exec("undo")}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Redo" onClick={() => exec("redo")}>
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={toggleSource}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${
              sourceMode ? "bg-[#111827] text-white" : "text-[#4b5563] hover:bg-[#f4f5f7]"
            }`}
            title="Edit raw HTML"
          >
            <Code2 className="h-3.5 w-3.5" /> HTML
          </button>
        </div>
      </div>

      {sourceMode ? (
        <textarea
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          rows={18}
          className="w-full resize-y bg-white p-4 font-mono text-[13px] leading-relaxed text-[#374151] outline-none"
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          className="legal-rte min-h-[380px] max-h-[640px] overflow-y-auto p-5 text-[15px] leading-7 text-[#374151] outline-none empty:before:text-[#9ca3af] empty:before:content-[attr(data-placeholder)]"
          data-placeholder={placeholder}
        />
      )}

      <style jsx global>{`
        .legal-rte h2 {
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          font-size: 1.375rem;
          font-weight: 800;
          color: #111827;
        }
        .legal-rte h3 {
          margin-top: 1rem;
          margin-bottom: 0.375rem;
          font-size: 1.0625rem;
          font-weight: 700;
          color: #111827;
        }
        .legal-rte p {
          margin-top: 0.5rem;
        }
        .legal-rte ul,
        .legal-rte ol {
          margin-top: 0.5rem;
          padding-left: 1.5rem;
        }
        .legal-rte ul {
          list-style: disc;
        }
        .legal-rte ol {
          list-style: decimal;
        }
        .legal-rte a {
          color: #fd4605;
          font-weight: 600;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
