import emojiData from "rn-emoji-keyboard/src/assets/emojis.json";

/**
 * The app's one emoji utility.
 *
 * Everything here operates on NATIVE Unicode text. No image assets, no network,
 * no emoji CDN - an emoji is a string, the OS font draws it, and the database
 * stores the same UTF-8 bytes the user typed. That is the whole design, and it
 * is why the runtime cost of emoji support in this app is zero.
 *
 * The dataset is the one already bundled with rn-emoji-keyboard, read directly
 * rather than re-shipped: 1640 emojis across the nine standard categories, each
 * carrying its own search keywords. Importing the JSON costs nothing at runtime
 * beyond the parse - it is the same module the picker itself loads, so there is
 * exactly one copy in the bundle.
 *
 * KNOWN LIMIT: that dataset tops out at Emoji 5.0, so emoji introduced later
 * (🫠 14.0, 🫩 16.0 …) are not LISTED by the picker or found by search here.
 * They still type, paste, store, render and delete perfectly, because those
 * paths are the platform's, not ours. Only discovery through the picker is
 * capped. Replacing the dataset is a drop-in: everything below reads through
 * ALL_EMOJIS.
 */

export type EmojiRecord = {
  emoji: string;
  name: string;
  /** Unicode Emoji version that introduced it. */
  v: string;
  toneEnabled: boolean;
  keywords?: string[];
};

type Category = { title: string; data: EmojiRecord[] };

const CATEGORIES = emojiData as unknown as Category[];

/** Flat list, built once at module load. */
export const ALL_EMOJIS: EmojiRecord[] = CATEGORIES.flatMap((c) => c.data);

/** emoji -> record, for O(1) name lookup when labelling for screen readers. */
const BY_CHAR = new Map<string, EmojiRecord>();
for (const e of ALL_EMOJIS) BY_CHAR.set(e.emoji, e);

/* ── Accessibility ────────────────────────────────────────────────────────── */

/**
 * Human-readable name for an emoji, for accessibilityLabel.
 *
 * Falls back to the character itself rather than to "emoji": a screen reader
 * given the raw character still announces it, because every platform ships its
 * own CLDR name table. Returning a generic placeholder would be strictly worse
 * than saying nothing.
 */
export function emojiName(emoji: string): string {
  const base = BY_CHAR.get(emoji);
  if (base) return base.name;
  // Skin-toned variants are not in the table under their toned form; strip the
  // modifier and look the neutral form up.
  const neutral = emoji.replace(TONE_MODIFIERS, "");
  return BY_CHAR.get(neutral)?.name ?? emoji;
}

/** U+1F3FB..U+1F3FF - the five Fitzpatrick skin-tone modifiers. */
const TONE_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]/gu;

/* ── Search ───────────────────────────────────────────────────────────────── */

/**
 * Keyword search: "happy" -> 😀 😄 😁 😊, "fire" -> 🔥.
 *
 * Ranked, not merely filtered. An exact keyword hit outranks a prefix, which
 * outranks a substring - without that, searching "fire" returns "fire_engine"
 * and "firecracker" above 🔥 itself, because they match the same substring and
 * come first in the dataset.
 */
export function searchEmojis(query: string, limit = 60): EmojiRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { rec: EmojiRecord; score: number }[] = [];

  for (const rec of ALL_EMOJIS) {
    const haystack = [rec.name, ...(rec.keywords ?? [])];
    let best = 0;

    for (const raw of haystack) {
      const term = raw.toLowerCase().replace(/_/g, " ");
      if (term === q) { best = Math.max(best, 4); break; }
      if (term.startsWith(q)) best = Math.max(best, 3);
      else if (term.includes(q)) best = Math.max(best, 1);
    }

    if (best > 0) scored.push({ rec, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.rec);
}

/* ── Grapheme-safe text handling ──────────────────────────────────────────── */

/**
 * Split text into user-perceived characters.
 *
 * An emoji is rarely one code unit: 👍🏽 is a base plus a tone modifier, and
 * 👨‍👩‍👧 is three people joined by zero-width joiners. Naive `.length` and
 * `slice` cut through the middle of those and produce the mojibake half-emoji
 * users see when a backspace "deletes half a face".
 *
 * Intl.Segmenter is the correct tool and is present on modern Hermes, but it is
 * not guaranteed on every RN runtime this app ships to, so the fallback pairs
 * surrogates and keeps ZWJ sequences and tone modifiers attached by hand.
 */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  }
  // Fallback: Array.from already splits by code POINT (so surrogate pairs stay
  // whole); this pass then re-joins the pieces that form one glyph.
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    const prev = out[out.length - 1];
    const joins =
      prev !== undefined &&
      (prev.endsWith("‍") || // previous ended in a ZWJ - this continues it
        ch === "‍" ||
        ch === "️" || // variation selector-16
        /[\u{1F3FB}-\u{1F3FF}]/u.test(ch)); // skin tone
    if (joins) out[out.length - 1] = prev + ch;
    else out.push(ch);
  }
  return out;
}

/** Count as a human would, so a 👨‍👩‍👧 costs 1 against a character limit. */
export function visibleLength(text: string): number {
  return graphemes(text).length;
}

/** Truncate without ever cutting a glyph in half. */
export function truncateGraphemes(text: string, max: number): string {
  const g = graphemes(text);
  return g.length <= max ? text : g.slice(0, max).join("");
}

/* ── Cursor insertion ─────────────────────────────────────────────────────── */

export type Selection = { start: number; end: number };

/**
 * Insert at the caret, replacing any selection, and report where the caret
 * should land afterwards.
 *
 * Appending to the end instead - which is what the quick-emoji rows did before
 * this existed - silently reorders what the user wrote the moment their caret
 * was anywhere but the end.
 *
 * A missing/stale selection means "no caret we can trust", and appending is the
 * only safe answer there.
 */
export function insertAtCursor(
  text: string,
  insert: string,
  selection?: Selection | null,
): { text: string; selection: Selection } {
  const len = text.length;
  const hasCaret =
    selection &&
    Number.isFinite(selection.start) &&
    Number.isFinite(selection.end) &&
    selection.start >= 0 &&
    selection.end <= len;

  if (!hasCaret) {
    const next = text + insert;
    return { text: next, selection: { start: next.length, end: next.length } };
  }

  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const next = text.slice(0, start) + insert + text.slice(end);
  const caret = start + insert.length;
  return { text: next, selection: { start: caret, end: caret } };
}

/**
 * Backspace, one user-perceived character at a time.
 *
 * This is the whole reason graphemes() exists. `text.slice(0, -1)` removes ONE
 * UTF-16 code unit, which on 👍🏽 strips half the skin-tone modifier and leaves
 * a broken sequence on screen, and on 👨‍👩‍👧 removes one member of the family
 * and silently rewrites the emoji into a different one. Both take several
 * presses to clear something the user sees as a single character.
 *
 * A selection is deleted whole, matching what a hardware backspace does.
 */
export function deleteBeforeCursor(
  text: string,
  selection?: Selection | null,
): { text: string; selection: Selection } {
  const len = text.length;
  const hasCaret =
    selection &&
    Number.isFinite(selection.start) &&
    Number.isFinite(selection.end) &&
    selection.start >= 0 &&
    selection.end <= len;

  const start = hasCaret ? Math.min(selection.start, selection.end) : len;
  const end = hasCaret ? Math.max(selection.start, selection.end) : len;

  // A range selection: delete exactly that, no grapheme walking needed.
  if (end > start) {
    const next = text.slice(0, start) + text.slice(end);
    return { text: next, selection: { start, end: start } };
  }

  if (start === 0) return { text, selection: { start: 0, end: 0 } };

  // Collapsed caret: drop the last WHOLE grapheme before it.
  const before = text.slice(0, start);
  const g = graphemes(before);
  const kept = g.slice(0, -1).join("");
  const next = kept + text.slice(start);
  return { text: next, selection: { start: kept.length, end: kept.length } };
}

/* ── Validation ───────────────────────────────────────────────────────────── */

/**
 * Lone surrogates: a high or low surrogate with no partner.
 *
 * These are the malformed input that matters in practice. They cannot be
 * encoded as UTF-8, so Postgres rejects the whole statement with a byte-sequence
 * error - one pasted half-emoji otherwise fails an entire comment insert.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** True when the string is well-formed Unicode and safe to send to the API. */
export function isWellFormedUnicode(text: string): boolean {
  const wf = (text as unknown as { isWellFormed?: () => boolean }).isWellFormed;
  if (typeof wf === "function") return wf.call(text);
  return !LONE_SURROGATE.test(text);
}

/**
 * Make text safe to store: drop lone surrogates and the C0 controls that no
 * text field should carry. Tab, newline and carriage return are kept - they are
 * legitimate in a caption or a message.
 */
export function sanitizeUnicode(text: string): string {
  return text
    .replace(LONE_SURROGATE, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[ --]/g, "");
}

/* ── Detection ────────────────────────────────────────────────────────────── */

/** Whether a grapheme is (or starts with) a pictographic character. */
export function isEmoji(grapheme: string): boolean {
  return /\p{Extended_Pictographic}/u.test(grapheme);
}

/** True when the string is nothing but emoji and whitespace - lets a surface
 *  render an emoji-only message larger, the way every chat app does. */
export function isEmojiOnly(text: string, max = 3): boolean {
  const g = graphemes(text.trim()).filter((c) => c.trim().length > 0);
  return g.length > 0 && g.length <= max && g.every(isEmoji);
}
