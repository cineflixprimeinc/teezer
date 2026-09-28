"use client";

/**
 * The analytics filter bar: period presets, a custom range, the dropdown filters,
 * and Export.
 *
 * Every control here drives the query key, so changing any of them refetches from
 * ClickHouse rather than filtering client-side. That is the whole point of moving
 * to an OLAP store: the server can answer a re-filtered question in milliseconds,
 * so there is no reason to ship the raw rows to the browser and slice them there.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Download, Loader2 } from "lucide-react";
import type { DashboardFilters, PeriodPreset } from "@/services/studio-analytics.service";

const PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7",     label: "7 Days" },
  { key: "28",    label: "28 Days" },
  { key: "90",    label: "90 Days" },
];

type Option = { value: string; label: string };

/**
 * A styled dropdown rather than a native <select>.
 *
 * The native control can't be told to match the rest of the bar - Chrome and Firefox
 * each draw their own popup - so the filters looked like form fields dropped onto a
 * dashboard. This is the same control the Studio topbar uses: a button that shows the
 * current choice, and a panel that shows the options with the active one ticked.
 */
function Dropdown({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value?: string;
  options: Option[];
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);
  const active = Boolean(selected);

  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "flex h-9 w-[168px] items-center gap-2 rounded-xl border px-3 text-[12.5px] font-semibold transition",
          "outline-none focus-visible:ring-2 focus-visible:ring-rose-100",
          active
            ? "border-rose-200 bg-rose-50 text-rose-600"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-[196px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
        >
          {[{ value: "", label: placeholder }, ...options].map(o => {
            const chosen = (o.value || undefined) === value;
            return (
              <li key={o.value || "all"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => pick(o.value || undefined)}
                  className={[
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition",
                    chosen
                      ? "bg-rose-50 font-semibold text-rose-600"
                      : "font-medium text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {chosen && <Check className="size-3.5 shrink-0" strokeWidth={2.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  onExport,
  exporting,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const [showCustom, setShowCustom] = useState(filters.period === "custom");

  // The half-typed range lives here, NOT in `filters`.
  //
  // Clicking Custom used to set period="custom" immediately, with no dates. The API
  // declares start_date/end_date as required_if:period,custom, so that request was a
  // guaranteed 422 - and since any error blanked the dashboard, clicking Custom
  // reliably killed the page before you could pick a single date. Nothing is
  // committed to `filters` (and so nothing is fetched) until BOTH ends exist and the
  // range is the right way round.
  const [draftStart, setDraftStart] = useState(filters.start_date ?? "");
  const [draftEnd, setDraftEnd]     = useState(filters.end_date ?? "");

  const set = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch });

  const editRange = (start: string, end: string) => {
    setDraftStart(start);
    setDraftEnd(end);
    if (start && end && start <= end) {
      onChange({ ...filters, period: "custom", start_date: start, end_date: end });
    }
  };

  const applyPreset = (key: PeriodPreset) => {
    setShowCustom(false);
    setDraftStart("");
    setDraftEnd("");
    // Drop the dates as well as the period. Leaving a stale start_date on a preset
    // request is harmless today (the server ignores it unless period=custom) but it
    // is exactly the kind of thing that starts mattering later.
    onChange({ ...filters, period: key, start_date: undefined, end_date: undefined });
  };

  const rangeBackwards = Boolean(draftStart && draftEnd && draftStart > draftEnd);

  // No title and no date-range chip here: StudioTopbarShared already renders both for
  // every Studio page. Duplicating them gave the page two headings and two competing
  // date pickers that could disagree with each other.
  //
  // No per-video or per-country filter either. Both dropdowns were populated from the
  // dashboard payload they then re-filtered, so picking a country narrowed the data
  // that decided which countries were on offer - and on a small account the list was
  // a single entry that filtered the page down to itself.
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Period presets */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {PRESETS.map(p => {
          const active = filters.period === p.key;
          return (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={[
                "rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition",
                active ? "bg-rose-50 text-rose-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}

        <button
          onClick={() => setShowCustom(o => !o)}
          className={[
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition",
            filters.period === "custom" ? "bg-rose-50 text-rose-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
          ].join(" ")}
        >
          Custom
          <CalendarDays className="size-3.5" />
        </button>
      </div>

      {/* Custom range - only mounted when chosen, so the bar stays clean */}
      {showCustom && (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1">
            <input
              type="date"
              value={draftStart}
              max={draftEnd || undefined}
              onChange={e => editRange(e.target.value, draftEnd)}
              className="h-7 rounded-md px-1.5 text-[12px] text-slate-700 outline-none"
            />
            <span className="text-[12px] text-slate-400">to</span>
            <input
              type="date"
              value={draftEnd}
              min={draftStart || undefined}
              onChange={e => editRange(draftStart, e.target.value)}
              className="h-7 rounded-md px-1.5 text-[12px] text-slate-700 outline-none"
            />
          </div>
          {rangeBackwards && (
            <span className="px-1 text-[11px] text-rose-600">End date must not be before the start date.</span>
          )}
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Dropdown
          placeholder="All Content Types"
          value={filters.content_type}
          options={[
            { value: "video", label: "Video" },
            { value: "photo", label: "Photo" },
            { value: "live",  label: "Live" },
          ]}
          onChange={v => set({ content_type: v as DashboardFilters["content_type"] })}
        />

        <Dropdown
          placeholder="All Devices"
          value={filters.device}
          options={[
            { value: "mobile",  label: "Mobile" },
            { value: "tablet",  label: "Tablet" },
            { value: "desktop", label: "Desktop" },
          ]}
          onChange={v => set({ device: v as DashboardFilters["device"] })}
        />

        <button
          onClick={onExport}
          disabled={exporting}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {exporting
            ? <Loader2 className="size-3.5 animate-spin" />
            : <Download className="size-3.5" />}
          Export Report
        </button>
      </div>
    </div>
  );
}
