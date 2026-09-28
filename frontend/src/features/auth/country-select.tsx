"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Search } from "lucide-react";
import { WORLD_COUNTRIES, type Country } from "./world-countries";
import { CountryFlag } from "./country-flag";

interface CountrySelectProps {
  value: string;          // country name or ""
  onChange: (v: string) => void;
  error?: string;
  /** ISO codes signup is currently unavailable for (App\Services\
   *  CountryAvailabilityService, via countryService.availabilityList()).
   *  Those entries stay visible but disabled - clicking one explains why
   *  instead of silently doing nothing, per the "Restricted Country UI"
   *  requirement. This is UX only; the backend re-checks independently. */
  disabledCodes?: Set<string>;
  /** Admin-configurable ("Allow Manual Country Change") - when true, the
   *  picker is frozen on whatever `value` already is instead of opening.
   *  UX only; omitted/false preserves today's fully-interactive behavior
   *  for every other consumer. */
  locked?: boolean;
  /** Overrides the default WORLD_COUNTRIES list - optional and additive, so
   *  every other consumer of this component (just this one call site today,
   *  but a shared component) keeps working unchanged. Only the signup form
   *  passes this, sourced from the SAME backend-authoritative
   *  /countries/availability list the admin panel's Country Availability
   *  page reads from (App\Services\IsoCountries::map(), 247 codes) - this is
   *  what makes the signup and admin country lists the same dataset instead
   *  of two hand-maintained files that can drift apart. */
  countries?: Country[];
}

export function CountrySelect({ value, onChange, error, disabledCodes, countries, locked }: CountrySelectProps) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const [flipUp, setFlipUp] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);

  const countryList = countries ?? WORLD_COUNTRIES;

  /* Auto-flip up when there isn't room below */
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const PANEL_EST = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setFlipUp(spaceBelow < PANEL_EST && spaceAbove > spaceBelow);
  }, [open]);

  const filtered = query.trim()
    ? countryList.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase())
      )
    : countryList;

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* Escape closes */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  /* Focus search input when dropdown opens */
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  /* Find selected country object for display */
  const selected = countryList.find((c) => c.name === value);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>

      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => { if (!locked) setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={locked || undefined}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 9999,
          border: `1.5px solid ${error ? "#fd4605" : open ? "#fd4605" : "#e5e7eb"}`,
          background: locked ? "#f8f9fb" : "#fff",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          cursor: locked ? "default" : "pointer",
          gap: 8,
          opacity: locked ? 0.75 : 1,
          transition: "border-color 150ms",
          boxShadow: open ? "0 0 0 3px rgba(253,70,5,0.10)" : "none",
        }}
      >
        {/* Left icon: globe or flag */}
        {selected ? (
          <CountryFlag code={selected.code} size={22} />
        ) : (
          <Globe size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
        )}

        {/* Value / placeholder */}
        <span style={{
          flex: 1,
          textAlign: "left",
          fontSize: 14,
          color: value ? "#111827" : "#9ca3af",
          fontWeight: value ? 500 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {value || "Country"}
        </span>

        {/* Chevron */}
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

      {/* ── Dropdown ── */}
      {open && (
        <div
          role="listbox"
          aria-label="Select country"
          style={{
            position: "absolute",
            ...(flipUp
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            left: 0,
            right: 0,
            zIndex: 200,
            background: "#fff",
            border: "1.5px solid #e5e7eb",
            borderRadius: 16,
            boxShadow: flipUp
              ? "0 -8px 40px rgba(0,0,0,0.14)"
              : "0 12px 40px rgba(0,0,0,0.14)",
            display: "flex",
            flexDirection: "column",
            maxHeight: 260,
            overflow: "hidden",
          }}
        >
          {/* Search bar - sticky at top */}
          <div style={{
            padding: "8px 10px",
            borderBottom: "1px solid #f0f0f0",
            flexShrink: 0,
            background: "#fff",
          }}>
            <div style={{ position: "relative" }}>
              <Search
                size={14}
                color="#9ca3af"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country..."
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
          </div>

          {/* Country list */}
          <div
            ref={listRef}
            style={{
              overflowY: "auto",
              flex: 1,
              padding: "4px 0",
              scrollbarWidth: "thin",
              scrollbarColor: "#e5e7eb transparent",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{
                padding: "20px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "#9ca3af",
              }}>
                No country found
              </div>
            ) : (
              filtered.map((country) => {
                const isSelected = country.name === value;
                const isDisabled = disabledCodes?.has(country.code) ?? false;
                return (
                  <button
                    key={country.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) {
                        setBlockedMsg(`Teezer signup is currently unavailable in ${country.name}.`);
                        return;
                      }
                      setBlockedMsg(null);
                      select(country.name);
                    }}
                    style={{
                      width: "100%",
                      height: 40,
                      padding: "0 14px",
                      background: isSelected ? "#fff3ec" : "transparent",
                      border: "none",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.45 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "#fd4605" : "#111827",
                      transition: "background 80ms",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isDisabled)
                        (e.currentTarget as HTMLButtonElement).style.background = "#f8f9fb";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isDisabled)
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <CountryFlag code={country.code} size={20} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {country.name}
                    </span>
                    {isDisabled ? (
                      <span style={{ fontSize: 10.5, color: "#dc2626", flexShrink: 0, fontWeight: 600 }}>
                        Unavailable
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {country.code}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {blockedMsg && (
            <div style={{
              padding: "8px 14px",
              borderTop: "1px solid #f0f0f0",
              background: "#fef2f2",
              fontSize: 11.5,
              color: "#991b1b",
              flexShrink: 0,
            }}>
              {blockedMsg}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p style={{ marginTop: 4, paddingLeft: 14, fontSize: 12, color: "#fd4605" }}>
          {error}
        </p>
      )}
    </div>
  );
}
