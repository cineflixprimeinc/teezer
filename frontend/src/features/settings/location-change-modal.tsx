"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, Check, Loader2, Lock, MapPin, Navigation, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { locationService, type LocationResult } from "@/services/location.service";
import { countryService, type CountryStatus } from "@/services/country.service";
import { apiMessage } from "@/services/api";

/* ── Types ──────────────────────────────────────────────────────────────── */
type DropdownState = "idle" | "loading" | "results" | "empty" | "error";

type Props = {
  currentLocation: string;
  countryCode:     string | null | undefined;  // may be name or code - we prefer lockStatus code
  countryName:     string | null | undefined;
  onSaved:         (formatted: string) => void;
  onClose:         () => void;
};

/* ── Component ──────────────────────────────────────────────────────────── */
export function LocationChangeModal({
  countryCode: countryCodeProp, countryName, onSaved, onClose,
}: Props) {
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  /* ── State ── */
  const [query,         setQuery]         = useState("");
  const [suggestions,   setSuggestions]   = useState<LocationResult[]>([]);
  const [dropState,     setDropState]     = useState<DropdownState>("idle");
  const [selected,      setSelected]      = useState<LocationResult | null>(null);
  const [detecting,     setDetecting]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [gpsError,      setGpsError]      = useState<string | null>(null);
  const [lockStatus,    setLockStatus]    = useState<CountryStatus | null>(null);
  const [lockLoading,   setLockLoading]   = useState(true);

  /*
   * The Nominatim API needs a 2-letter ISO country code (e.g. "NP"), NOT the
   * country name. The prop `countryCode` from Account Settings can be the name
   * string ("Nepal"). We prefer the authoritative code from the lock-status
   * response, falling back to the prop only if it looks like a code (≤2 chars).
   */
  const searchCountryCode = lockStatus?.currentCountryCode
    ?? lockStatus?.detectedCountryCode
    ?? ((countryCodeProp && countryCodeProp.length === 2) ? countryCodeProp.toUpperCase() : null);

  /* Focus input on mount */
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  /* Fetch country-lock status to get the correct 2-letter code */
  useEffect(() => {
    countryService.status()
      .then(setLockStatus)
      .catch(() => {})
      .finally(() => setLockLoading(false));
  }, []);

  /* ── Debounced search ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      setDropState("idle");
      setHighlightIdx(-1);
      return;
    }

    setDropState("loading");

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await locationService.search(q, searchCountryCode ?? undefined);

        /* Filter to same country if locked */
        const filtered = searchCountryCode
          ? results.filter((r) =>
              !r.country_code ||
              r.country_code.toUpperCase() === searchCountryCode.toUpperCase(),
            )
          : results;

        setSuggestions(filtered);
        setHighlightIdx(-1);
        setDropState(filtered.length > 0 ? "results" : "empty");
      } catch {
        setSuggestions([]);
        setDropState("error");
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchCountryCode]);

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropState("idle");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── Escape key ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dropState !== "idle") { setDropState("idle"); return; }
        onClose();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [dropState, onClose]);

  /* ── Keyboard navigation inside dropdown ── */
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (dropState !== "results") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      pick(suggestions[highlightIdx]);
    }
  }

  function pick(result: LocationResult) {
    setSelected(result);
    setQuery(result.formatted);
    setSuggestions([]);
    setDropState("idle");
    setHighlightIdx(-1);
  }

  /* ── GPS detect ── */
  async function detectGps() {
    setGpsError(null);
    setDetecting(true);
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      setDetecting(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await locationService.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (!result) {
            setGpsError("Could not determine your location. Please search manually.");
          } else {
            pick(result);
          }
        } catch (e) {
          setGpsError(apiMessage(e));
        } finally {
          setDetecting(false);
        }
      },
      (err) => {
        setDetecting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Location permission denied. Please enable it in your browser settings, or search manually.");
        } else {
          setGpsError("Could not get your location. Please search manually.");
        }
      },
      { timeout: 10_000 },
    );
  }

  /* ── Save ── */
  async function handleSave() {
    if (!selected) { toast.error("Please select a location first."); return; }
    setSaving(true);
    try {
      await locationService.save({
        ...selected,
        source: selected.lat && selected.lng ? "gps" : "nominatim",
      });
      onSaved(selected.formatted);
      toast.success("Location saved.");
      onClose();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /* ── Country lock helpers ── */
  const countryLocked       = (lockStatus?.remainingLockDays ?? 0) > 0;
  const differentCountry    = selected?.country_code && searchCountryCode
    ? selected.country_code.toUpperCase() !== searchCountryCode.toUpperCase()
    : false;
  const blockedByCountryLock = countryLocked && differentCountry;

  const showDropdown = dropState !== "idle" && query.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal - overflow-visible so dropdown can escape the card bounds */}
      <div className="w-full max-w-md overflow-visible rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#fe2c55]" />
            <p className="text-base font-bold text-[#111827]">Change Location</p>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f8f9fb] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body - overflow-visible keeps dropdown visible */}
        <div className="overflow-visible p-5 space-y-4">

          {/* Current country badge */}
          {(countryName || countryCodeProp || searchCountryCode) && (
            <div className="flex items-center justify-between rounded-xl bg-[#f8f9fb] px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Current Country</p>
                <p className="mt-0.5 text-sm font-bold text-[#111827]">
                  {lockStatus?.currentCountryName ?? countryName ?? searchCountryCode}
                </p>
              </div>
              {countryLocked && !lockLoading && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#fff1f3] px-3 py-1 text-[11px] font-bold text-[#fe2c55]">
                  <Lock className="h-3 w-3" />
                  {lockStatus!.remainingLockDays}d locked
                </span>
              )}
            </div>
          )}

          {/* Lock notice */}
          {countryLocked && !lockLoading && (
            <div className="flex items-start gap-2 rounded-xl border border-[#fde8ec] bg-[#fff8f9] px-4 py-3">
              <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#fe2c55]" />
              <p className="text-xs leading-relaxed text-[#6b7280]">
                Your country is locked for{" "}
                <span className="font-semibold text-[#fe2c55]">{lockStatus!.remainingLockDays} more days</span>.
                {" "}You can still change your city or regional location within{" "}
                <span className="font-semibold text-[#111827]">
                  {lockStatus?.currentCountryName ?? countryName}
                </span>.
              </p>
            </div>
          )}

          {/* GPS button */}
          <button type="button" onClick={detectGps} disabled={detecting}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm font-semibold text-[#111827] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-60"
          >
            {detecting
              ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-[#fe2c55]" />
              : <Navigation className="h-4 w-4 flex-shrink-0" />}
            <span>{detecting ? "Detecting your location…" : "Use my current location"}</span>
          </button>

          {gpsError && (
            <div className="flex items-start gap-2 rounded-xl border border-[#fde8ec] bg-[#fff8f9] px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#fe2c55]" />
              <p className="text-xs text-[#6b7280]">{gpsError}</p>
            </div>
          )}

          {/* ── Search input + dropdown ── */}
          {/* overflow-visible is critical - any parent with overflow:hidden clips the dropdown */}
          <div ref={wrapperRef} className="relative overflow-visible">
            <label className="mb-1.5 block text-[11px] font-semibold text-[#6b7280]">
              Search Location
              {searchCountryCode && (
                <span className="ml-1 font-normal text-[#9ca3af]">({searchCountryCode})</span>
              )}
            </label>

            {/* Input row */}
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#9ca3af]" />
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value.trim()) { setSelected(null); setDropState("idle"); }
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Search city, area, or region…"
                className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-9 text-sm text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10"
              />
              {dropState === "loading" && (
                <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-[#9ca3af]" />
              )}
              {selected && dropState === "idle" && (
                <Check className="absolute right-3 h-4 w-4 text-[#10b981]" />
              )}
            </div>

            {/* ── Dropdown - z-[9999] to break out of any stacking context ── */}
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5"
                style={{
                  zIndex: 9999,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {/* Loading */}
                {dropState === "loading" && (
                  <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-[#9ca3af]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching locations…
                  </div>
                )}

                {/* Results */}
                {dropState === "results" && suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition",
                      i === highlightIdx ? "bg-[#fff0f3]" : "hover:bg-[#f8f9fb]",
                    )}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#fe2c55]" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#111827] truncate">
                        {s.city ?? s.formatted.split(",")[0]}
                      </p>
                      {(s.region || s.country) && (
                        <p className="text-xs text-[#9ca3af] truncate">
                          {[s.region, s.country].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </button>
                ))}

                {/* Empty */}
                {dropState === "empty" && (
                  <div className="px-4 py-3.5 text-center text-sm text-[#9ca3af]">
                    No locations found for &ldquo;{query}&rdquo;
                  </div>
                )}

                {/* Error */}
                {dropState === "error" && (
                  <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Could not load locations. Try again.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected preview */}
          {selected && (
            <div className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              blockedByCountryLock ? "border-red-200 bg-red-50" : "border-[#d1fae5] bg-[#ecfdf5]",
            )}>
              <div className={cn(
                "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full",
                blockedByCountryLock ? "bg-red-100" : "bg-[#d1fae5]",
              )}>
                <MapPin className={cn("h-4 w-4", blockedByCountryLock ? "text-red-500" : "text-[#059669]")} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#111827] truncate">{selected.formatted}</p>
                {blockedByCountryLock && (
                  <p className="mt-0.5 text-xs text-red-500">You cannot change your country while it&apos;s locked.</p>
                )}
              </div>
              <button type="button" onClick={() => { setSelected(null); setQuery(""); }}
                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#111827] transition">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-full border border-[#e5e7eb] py-2.5 text-sm font-semibold text-[#111827] transition hover:bg-[#f8f9fb]"
            >
              Cancel
            </button>
            <button type="button" onClick={handleSave}
              disabled={!selected || saving || blockedByCountryLock}
              className="flex-1 rounded-full bg-[#fe2c55] py-2.5 text-sm font-bold text-white transition hover:bg-[#e02449] disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </span>
              ) : "Save Location"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
