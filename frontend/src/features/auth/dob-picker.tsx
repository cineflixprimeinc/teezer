"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS    = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const YEAR_MIN = 1900;
const YEAR_MAX = 2030;

function pad(n: number) { return String(n).padStart(2, "0"); }

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Returns 0..6 where 0=Mon, 6=Sun for the 1st of the given month. */
function firstWeekdayMonStart(year: number, month1to12: number): number {
  const js = new Date(year, month1to12 - 1, 1).getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
}

/** Format "YYYY-MM-DD" → "DD/MM/YYYY". Returns "" if invalid. */
function formatDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

interface DOBPickerProps {
  value: string;        // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  error?: string;
}

export function DOBPicker({ value, onChange, error }: DOBPickerProps) {
  const today = useMemo(() => new Date(), []);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [overlay, setOverlay] = useState<"none" | "month" | "year">("none");
  const [query, setQuery] = useState("");

  // The month/year currently shown in the calendar grid
  const initialYear  = value ? Number(value.split("-")[0]) : today.getFullYear() - 18;
  const initialMonth = value ? Number(value.split("-")[1]) : today.getMonth() + 1;
  const [viewYear,  setViewYear]  = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  const selectedYear  = value ? Number(value.split("-")[0]) : 0;
  const selectedMonth = value ? Number(value.split("-")[1]) : 0;
  const selectedDay   = value ? Number(value.split("-")[2]) : 0;

  /* Open the dropdown, syncing the calendar view to the current value */
  function openPanel() {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m);
    }
    setOpen(true);
  }

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setOverlay("none");
        setQuery("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  /* Escape closes (overlay first, then dropdown) */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (overlay !== "none") { setOverlay("none"); return; }
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, overlay]);

  /* Auto-flip up if not enough room below */
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const PANEL_EST = 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setFlipUp(spaceBelow < PANEL_EST && spaceAbove > spaceBelow);
  }, [open]);

  /* Focus search input on open */
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  /* ── Search "jump" logic ─────────────────────────────────────────────── */
  function handleSearch(raw: string) {
    setQuery(raw);
    const q = raw.trim().toLowerCase();
    if (!q) return;

    // Year token: 1900..2030
    const yearMatch = q.match(/\b(\d{4})\b/);
    if (yearMatch) {
      const y = Number(yearMatch[1]);
      if (y >= YEAR_MIN && y <= YEAR_MAX) setViewYear(y);
    }
    // Month token: prefix match against full or short names
    const alpha = q.replace(/[^a-z]/g, "");
    if (alpha) {
      const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(alpha)) >= 0
        ? MONTHS.findIndex((m) => m.toLowerCase().startsWith(alpha))
        : MONTHS_SHORT.findIndex((m) => m.toLowerCase().startsWith(alpha));
      if (idx >= 0) setViewMonth(idx + 1);
    }
  }

  /* ── Day click → commit DOB and close ─────────────────────────────────── */
  function selectDay(day: number) {
    onChange(`${viewYear}-${pad(viewMonth)}-${pad(day)}`);
    setOpen(false);
    setOverlay("none");
    setQuery("");
  }

  function gotoPrevMonth() {
    if (viewMonth === 1) {
      if (viewYear > YEAR_MIN) { setViewMonth(12); setViewYear(viewYear - 1); }
    } else {
      setViewMonth(viewMonth - 1);
    }
  }
  function gotoNextMonth() {
    if (viewMonth === 12) {
      if (viewYear < YEAR_MAX) { setViewMonth(1); setViewYear(viewYear + 1); }
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  /* ── Build day grid ───────────────────────────────────────────────────── */
  const leadBlanks = firstWeekdayMonStart(viewYear, viewMonth);
  const totalDays  = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = YEAR_MAX; y >= YEAR_MIN; y--) arr.push(y);
    return arr;
  }, []);

  const display = formatDisplay(value);

  return (
    <div ref={wrapRef} style={{ width: "100%", position: "relative" }}>
      {/* ── Trigger pill ── */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 9999,
          border: `1.5px solid ${error ? "#fe2c55" : open ? "#fe2c55" : "#e5e7eb"}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          cursor: "pointer",
          gap: 10,
          transition: "border-color 150ms, box-shadow 150ms",
          boxShadow: open ? "0 0 0 3px rgba(254,44,85,0.10)" : "none",
        }}
      >
        <Calendar size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
        <span style={{
          flex: 1,
          textAlign: "left",
          fontSize: 14,
          color: display ? "#111827" : "#9ca3af",
          fontWeight: display ? 500 : 400,
        }}>
          {display || "DOB"}
        </span>
        <ChevronDown
          size={15}
          color="#9ca3af"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms",
          }}
        />
      </button>

      {/* ── Floating calendar panel ── */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Select date of birth"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(flipUp
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            zIndex: 200,
            background: "#fff",
            border: "1.5px solid #e5e7eb",
            borderRadius: 16,
            boxShadow: flipUp
              ? "0 -8px 40px rgba(0,0,0,0.14)"
              : "0 12px 40px rgba(0,0,0,0.14)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxHeight: "min(390px, calc(100vh - 64px))",
          }}
        >
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={14} color="#9ca3af" style={{
              position: "absolute", left: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
            }} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search year or month (e.g. 2002, Jan)"
              style={{
                width: "100%",
                height: 34,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#f8f9fb",
                padding: "0 10px 0 30px",
                fontSize: 13,
                color: "#111827",
                outline: "none",
              }}
            />
          </div>

          {/* Month + Year header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={gotoPrevMonth}
              aria-label="Previous month"
              style={navBtnStyle}
            >
              <ChevronLeft size={16} color="#374151" />
            </button>

            <button
              type="button"
              onClick={() => setOverlay(overlay === "month" ? "none" : "month")}
              style={chipStyle(overlay === "month")}
            >
              {MONTHS[viewMonth - 1]}
              <ChevronDown size={12} style={{ marginLeft: 4 }} />
            </button>

            <button
              type="button"
              onClick={() => setOverlay(overlay === "year" ? "none" : "year")}
              style={chipStyle(overlay === "year")}
            >
              {viewYear}
              <ChevronDown size={12} style={{ marginLeft: 4 }} />
            </button>

            <div style={{ flex: 1 }} />

            <button
              type="button"
              onClick={gotoNextMonth}
              aria-label="Next month"
              style={navBtnStyle}
            >
              <ChevronRight size={16} color="#374151" />
            </button>
          </div>

          {/* Day grid OR overlay */}
          <div style={{ position: "relative", height: 220, overflow: "hidden" }}>
            {overlay === "none" && (
              <>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 2,
                  marginBottom: 4,
                }}>
                  {WEEKDAYS.map((w) => (
                    <div key={w} style={{
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#9ca3af",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "4px 0",
                    }}>{w}</div>
                  ))}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 2,
                }}>
                  {cells.map((d, i) => {
                    if (d === null) return <div key={i} />;
                    const isToday =
                      viewYear === today.getFullYear() &&
                      viewMonth === today.getMonth() + 1 &&
                      d === today.getDate();
                    const isSelected =
                      viewYear === selectedYear &&
                      viewMonth === selectedMonth &&
                      d === selectedDay;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectDay(d)}
                        style={{
                          height: 30,
                          borderRadius: 8,
                          border: isToday && !isSelected ? "1px solid #fe2c55" : "1px solid transparent",
                          background: isSelected ? "#fe2c55" : "transparent",
                          color: isSelected ? "#fff" : isToday ? "#fe2c55" : "#111827",
                          fontSize: 12,
                          fontWeight: isSelected || isToday ? 700 : 500,
                          cursor: "pointer",
                          transition: "background 80ms, color 80ms",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "#f8f9fb";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {overlay === "year" && (
              <ScrollableList
                items={years.map((y) => ({ key: y, label: String(y) }))}
                selectedKey={viewYear}
                scrollToKey={viewYear}
                onSelect={(k) => { setViewYear(k as number); setOverlay("none"); }}
              />
            )}

            {overlay === "month" && (
              <ScrollableList
                items={MONTHS.map((m, i) => ({ key: i + 1, label: m }))}
                selectedKey={viewMonth}
                scrollToKey={viewMonth}
                onSelect={(k) => { setViewMonth(k as number); setOverlay("none"); }}
              />
            )}
          </div>

          {/* Footer actions */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 6,
            borderTop: "1px solid #f0f0f0",
          }}>
            <button
              type="button"
              onClick={() => { onChange(""); setQuery(""); setOverlay("none"); }}
              style={footerBtnStyle(false)}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth() + 1);
                setOverlay("none");
              }}
              style={footerBtnStyle(true)}
            >
              Today
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 4, paddingLeft: 14, fontSize: 12, color: "#fe2c55" }}>{error}</p>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */
const navBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${active ? "#fe2c55" : "#e5e7eb"}`,
    background: active ? "#fff0f4" : "#fff",
    color: active ? "#fe2c55" : "#111827",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function footerBtnStyle(primary: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    borderRadius: 8,
    border: primary ? "none" : "1px solid #e5e7eb",
    background: primary ? "#fe2c55" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

/* ── Scrollable picker list (years / months) ──────────────────────────── */
function ScrollableList({
  items, selectedKey, scrollToKey, onSelect,
}: {
  items: { key: number; label: string }[];
  selectedKey: number;
  scrollToKey: number;
  onSelect: (k: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-key="${scrollToKey}"]`,
    );
    if (el) el.scrollIntoView({ block: "center" });
  }, [scrollToKey]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        overflowY: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: "#e5e7eb transparent",
        borderRadius: 8,
      }}
    >
      {items.map((it) => {
        const isSelected = it.key === selectedKey;
        return (
          <button
            key={it.key}
            data-key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            style={{
              width: "100%",
              height: 34,
              padding: "0 12px",
              background: isSelected ? "#fff0f4" : "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isSelected ? 700 : 500,
              color: isSelected ? "#fe2c55" : "#111827",
              textAlign: "left",
              transition: "background 80ms",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "#f8f9fb";
            }}
            onMouseLeave={(e) => {
              if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
