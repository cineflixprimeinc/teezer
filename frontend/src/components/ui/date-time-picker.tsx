"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Date and time pickers that we actually own.
 *
 * `<input type="date">` renders its calendar as BROWSER CHROME - the popup is
 * drawn by Chrome/Safari/Firefox themselves and is not reachable from CSS at
 * all. No amount of styling the input changes it, and it looks different on
 * every browser and OS. Replacing the popup is the only way to control it,
 * which is what this is.
 *
 * The values stay exactly what the native inputs produced - "YYYY-MM-DD" and
 * "HH:MM", both zero-padded - so callers and anything downstream are unchanged.
 *
 * Dates are built and compared in LOCAL time. `new Date("2026-08-06")` parses
 * as UTC and lands on the 5th for anyone west of Greenwich, which is how date
 * pickers end up one day off for half the world.
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
/** Local-time YYYY-MM-DD. Never toISOString() - that converts to UTC first. */
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Closes on an outside click and on Escape - both, because either alone
 *  strands the popover for whichever input the user reaches for next. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/* ── Date ─────────────────────────────────────────────────────────────────── */

export function DatePicker({
  value,
  onChange,
  disabled,
  /** Days before this are unselectable. Defaults to today - a post cannot be
   *  scheduled into the past, and offering it is how you get a 422 later. */
  min,
  placeholder = "Pick a date",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: Date;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromKey(value);
  const today = startOfDay(new Date());
  const floor = startOfDay(min ?? today);

  // The month on screen. Follows the selection when it changes, but is free to
  // wander while the popover is open so the user can page ahead without
  // committing to a date first.
  const [view, setView] = useState(() => selected ?? today);
  useEffect(() => { if (selected) setView(selected); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);

  const ref = useDismiss(open, () => setOpen(false));

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    // Back up to the Sunday on or before the 1st, then always draw 42 cells:
    // six fixed rows means the popover never changes height between months,
    // which is what makes month paging feel steady instead of jumpy.
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        date: d,
        key: toKey(d),
        inMonth: d.getMonth() === view.getMonth(),
        isToday: toKey(d) === toKey(today),
        disabled: d.getTime() < floor.getTime(),
      };
    });
  }, [view, floor, today]);

  const label = selected
    ? selected.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : placeholder;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[11px] transition",
          disabled
            ? "cursor-not-allowed border-transparent bg-[#f3f4f6] text-[#9aa1ad]"
            : "border-[#e5e7eb] bg-white text-[#111827] hover:border-[#fd4605]/40 hover:bg-[#fff6f1]",
          open && !disabled && "border-[#fd4605] ring-2 ring-[#fd4605]/15",
        )}
      >
        <Calendar className="h-3 w-3 shrink-0 text-[#5f6675]"/>
        <span className={cn("whitespace-nowrap", !selected && "text-[#9aa1ad]")}>{label}</span>
      </button>

      {open && !disabled && (
        <div className="absolute right-0 z-50 mt-2 w-[268px] rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.28)]">
          {/* Month header */}
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#111827]">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous month"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="grid h-6 w-6 place-items-center rounded-lg text-[#5f6675] transition hover:bg-[#f3f4f6] hover:text-[#111827]">
                <ChevronLeft className="h-3.5 w-3.5"/>
              </button>
              <button type="button" aria-label="Next month"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="grid h-6 w-6 place-items-center rounded-lg text-[#5f6675] transition hover:bg-[#f3f4f6] hover:text-[#111827]">
                <ChevronRight className="h-3.5 w-3.5"/>
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-y-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="grid h-6 place-items-center text-[10px] font-semibold text-[#9aa1ad]">{w}</div>
            ))}

            {grid.map((c) => {
              const isSel = !!selected && c.key === toKey(selected);
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={c.disabled}
                  onClick={() => { onChange(c.key); setOpen(false); }}
                  className={cn(
                    "relative grid h-8 w-8 place-items-center justify-self-center rounded-[10px] text-[12px] transition",
                    c.disabled
                      ? "cursor-not-allowed text-[#d1d5db]"
                      : c.inMonth ? "text-[#111827] hover:bg-[#f3f4f6]" : "text-[#c4c9d2] hover:bg-[#f7f8fa]",
                    isSel && "bg-[#fd4605] font-bold text-white hover:bg-[#fd4605]",
                  )}
                >
                  {c.date.getDate()}
                  {/* Today marker, but not when the cell is already filled -
                      a dot on a solid pink tile is invisible anyway. */}
                  {c.isToday && !isSel && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#fd4605]"/>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[#f0f1f3] pt-2">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#5f6675] transition hover:bg-[#f3f4f6]">
              Clear
            </button>
            <button type="button" onClick={() => { onChange(toKey(today)); setOpen(false); }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#fd4605] transition hover:bg-[#fff1f4]">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Time ─────────────────────────────────────────────────────────────────── */

/** Every 15 minutes. A free-text time field invites "7pm", "19", "7:5" and
 *  every other shape that has to be parsed and rejected; a list cannot be
 *  wrong, and quarter-hours are how people actually schedule. */
const SLOTS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${pad(h)}:${pad(m)}`;
});

const pretty = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
};

export function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const listRef = useRef<HTMLDivElement>(null);

  // Bring the current value into view on open. Without this the list always
  // starts at midnight and an evening slot is a 60-row scroll away.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    if (el) listRef.current.scrollTop = el.offsetTop - 72;
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[11px] transition",
          disabled
            ? "cursor-not-allowed border-transparent bg-[#f3f4f6] text-[#9aa1ad]"
            : "border-[#e5e7eb] bg-white text-[#111827] hover:border-[#fd4605]/40 hover:bg-[#fff6f1]",
          open && !disabled && "border-[#fd4605] ring-2 ring-[#fd4605]/15",
        )}
      >
        <Clock className="h-3 w-3 shrink-0 text-[#5f6675]"/>
        <span className="whitespace-nowrap">{pretty(value)}</span>
      </button>

      {open && !disabled && (
        <div className="absolute right-0 z-50 mt-2 w-[136px] rounded-[16px] border border-[#e5e7eb] bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.28)]">
          <div ref={listRef} className="max-h-[212px] overflow-y-auto">
            {SLOTS.map((s) => {
              const active = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  data-active={active}
                  onClick={() => { onChange(s); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-[11.5px] transition",
                    active ? "bg-[#fff1f4] font-bold text-[#fd4605]" : "text-[#111827] hover:bg-[#f3f4f6]",
                  )}
                >
                  {pretty(s)}
                  {active && <Check className="h-3 w-3"/>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
