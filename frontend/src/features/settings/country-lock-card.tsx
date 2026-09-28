"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Lock, AlertCircle, CheckCircle2, RefreshCw,
  Upload, FileText, ShieldCheck, X,
} from "lucide-react";
import { apiMessage } from "@/services/api";
import {
  countryService,
  type CountryStatus,
  type ResidencyDocument,
  type ResidencyDocumentType,
} from "@/services/country.service";
import { CountrySelect } from "@/features/auth/country-select";
import { WORLD_COUNTRIES } from "@/features/auth/world-countries";
import { CountryFlag } from "@/features/auth/country-flag";

const DOCUMENT_TYPES: { value: ResidencyDocumentType; label: string }[] = [
  { value: "passport",         label: "Passport (with entry/exit stamps)" },
  { value: "visa",             label: "Visa" },
  { value: "residence_permit", label: "Residence Permit" },
  { value: "national_id",      label: "National ID" },
  { value: "utility_bill",     label: "Utility Bill (last 60 days)" },
  { value: "bank_statement",   label: "Bank Statement (last 60 days)" },
  { value: "lease_agreement",  label: "Lease / Rental Agreement" },
  { value: "other",            label: "Other official document" },
];

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

function todayMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function CountryLockCard() {
  const qc = useQueryClient();
  const { data: status, isLoading, refetch } = useQuery<CountryStatus>({
    queryKey: ["country-status"],
    queryFn:  () => countryService.status(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [busy,    setBusy]    = useState(false);
  const [picker,  setPicker]  = useState(false);
  const [target,  setTarget]  = useState("");

  // Manual residency-document upload state
  const [manualOpen,    setManualOpen]    = useState(false);
  const [manualCountry, setManualCountry] = useState("");
  const [docType,       setDocType]       = useState<ResidencyDocumentType>("passport");
  const [residingSince, setResidingSince] = useState(todayMinusDays(60));
  const [docNote,       setDocNote]       = useState("");
  const [docFile,       setDocFile]       = useState<File | null>(null);
  const [uploading,     setUploading]     = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  const { data: residencyDocs, refetch: refetchDocs } = useQuery<ResidencyDocument[]>({
    queryKey: ["country-residency-documents"],
    queryFn:  () => countryService.listResidencyDocuments(),
    staleTime: 30_000,
  });

  function setStatus(s: CountryStatus) {
    qc.setQueryData(["country-status"], s);
  }

  function resetManualForm() {
    setManualCountry("");
    setDocType("passport");
    setResidingSince(todayMinusDays(60));
    setDocNote("");
    setDocFile(null);
    if (docInputRef.current) docInputRef.current.value = "";
  }

  function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_DOC_BYTES) {
      toast.error("Document must be 10 MB or smaller.");
      return;
    }
    if (!/^(image\/(jpe?g|png|webp)|application\/pdf)$/i.test(f.type)) {
      toast.error("Use JPG, PNG, WEBP, or PDF.");
      return;
    }
    setDocFile(f);
  }

  async function submitResidencyDocument() {
    const country = WORLD_COUNTRIES.find((c) => c.name === manualCountry);
    if (!country)  { toast.error("Pick the new country.");          return; }
    if (!docFile)  { toast.error("Attach a supporting document.");  return; }
    if (!residingSince) { toast.error("Enter the residency start date."); return; }

    // Must be ≥ 60 days ago
    const days = Math.floor((Date.now() - new Date(residingSince).getTime()) / 86_400_000);
    if (days < 60) {
      toast.error("Residency start must be at least 60 days ago.");
      return;
    }

    setUploading(true);
    try {
      await countryService.submitResidencyDocument({
        countryCode:   country.code,
        documentType:  docType,
        file:          docFile,
        residingSince,
        note:          docNote.trim() || undefined,
      });
      toast.success("Document submitted. We'll review it within 1-3 business days.");
      resetManualForm();
      setManualOpen(false);
      refetchDocs();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function submitRequest() {
    const country = WORLD_COUNTRIES.find((c) => c.name === target);
    if (!country) { toast.error("Pick a country first."); return; }
    setBusy(true);
    try {
      const s = await countryService.requestChange(country.code);
      setStatus(s);
      setPicker(false);
      setTarget("");
      toast.success("Country change request started.");
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmChange() {
    setBusy(true);
    try {
      const s = await countryService.confirmChange();
      setStatus(s);
      toast.success("Country updated. New 60-day lock started.");
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#eeeeee] bg-white p-5 animate-pulse">
        <div className="h-5 w-32 bg-[#f0f0f0] rounded mb-3" />
        <div className="h-4 w-64 bg-[#f0f0f0] rounded" />
      </div>
    );
  }
  if (!status) return null;

  const flagCode    = status.currentCountryCode ?? status.detectedCountryCode ?? null;
  const displayName = status.currentCountryName ?? status.detectedCountryName ?? "Not set";
  const isDetectedOnly = !status.currentCountryName && !!status.detectedCountryName;
  const progressPct = Math.min(100, Math.round((status.continuousDetectedDays / status.requiredContinuousDays) * 100));

  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#fd4605]" />
            Country & Region
          </h3>
          <p className="mt-1 text-xs text-[#6b7280]">
            Your account country controls content region, currency, and discovery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f8f9fb] hover:text-[#111827] transition"
          aria-label="Refresh status"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Current country */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#f0f0f0] bg-[#f8f9fb] px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <CountryFlag code={flagCode} size={28} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#111827] truncate">
              {displayName}
            </p>
            <p className="text-xs text-[#6b7280]">
              {isDetectedOnly ? "Detected · not confirmed" : "Account country"}
            </p>
          </div>
        </div>
        {status.remainingLockDays > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#fff1f3] text-[#fd4605] px-3 py-1 text-xs font-bold whitespace-nowrap">
            <Lock className="h-3 w-3" />
            {status.remainingLockDays} day{status.remainingLockDays === 1 ? "" : "s"} left
          </span>
        ) : (
          <span className="rounded-full bg-[#ecfdf5] text-[#059669] px-3 py-1 text-xs font-bold whitespace-nowrap">
            Unlocked
          </span>
        )}
      </div>

      {/* Locked state */}
      {status.remainingLockDays > 0 && !status.pendingRequestedCountry && (
        <div className="rounded-xl border border-[#fff1f3] bg-[#fff8fa] px-4 py-3 text-xs text-[#6b7280]">
          <span className="font-semibold text-[#111827]">{status.message}</span>
        </div>
      )}

      {/* Pending request */}
      {status.pendingRequestedCountry && (
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CountryFlag code={status.pendingRequestedCountry} size={22} />
              <div>
                <p className="font-bold text-[#111827]">Change to {status.pendingRequestedName}</p>
                <p className="text-xs text-[#6b7280]">
                  Detected for {status.continuousDetectedDays}/{status.requiredContinuousDays} continuous days
                </p>
              </div>
            </div>
            {status.status === "eligible" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-[#ecfdf5] text-[#059669] px-3 py-1 text-xs font-bold whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />
                Eligible
              </span>
            ) : (
              <span className="rounded-full bg-[#fff7ed] text-[#ea580c] px-3 py-1 text-xs font-bold whitespace-nowrap">
                In progress
              </span>
            )}
          </div>

          <div className="h-2 w-full rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#fd4605] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {status.status === "pending" && status.continuousDetectedDays === 0 && (
            <p className="text-xs text-[#ea580c] flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              Country verification was reset because your detected country changed.
            </p>
          )}

          {status.status === "eligible" && (
            <button
              type="button"
              onClick={confirmChange}
              disabled={busy}
              className="w-full h-10 rounded-full bg-[#fd4605] text-sm font-bold text-white hover:bg-[#e03e04] disabled:opacity-60 transition"
            >
              {busy ? "Updating…" : `Confirm change to ${status.pendingRequestedName}`}
            </button>
          )}
        </div>
      )}

      {/* Start a new change request */}
      {status.canRequestCountryChange && !status.pendingRequestedCountry && !picker && (
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="w-full h-10 rounded-full border border-[#e5e7eb] bg-white text-sm font-bold text-[#111827] hover:border-[#fd4605] hover:text-[#fd4605] hover:bg-[#fff1f3] transition"
        >
          Request country change
        </button>
      )}

      {picker && (
        <div className="space-y-2">
          <CountrySelect value={target} onChange={setTarget} />
          <p className="text-xs text-[#6b7280] leading-relaxed">
            To change your country, Teezer must detect that you are using the app or
            website from the new country for {status.requiredContinuousDays} continuous days.
            If your detected country changes during verification, the counter resets.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setPicker(false); setTarget(""); }}
              className="flex-1 h-9 rounded-full border border-[#e5e7eb] bg-white text-sm font-bold text-[#111827] hover:bg-[#f8f9fb] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitRequest}
              disabled={busy || !target}
              className="flex-1 h-9 rounded-full bg-[#fd4605] text-sm font-bold text-white hover:bg-[#e03e04] disabled:opacity-50 transition"
            >
              {busy ? "Starting…" : "Start verification"}
            </button>
          </div>
        </div>
      )}

      {/* ── Manual change with documents ──────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-[#fd4605]" />
            <div>
              <p className="text-sm font-bold text-[#111827]">
                Change country with documents
              </p>
              <p className="mt-0.5 text-xs text-[#6b7280] leading-relaxed">
                Prefer a manual review? Upload a government-issued document
                (visa, passport, residence permit, recent utility bill, etc.)
                proving you&apos;ve been residing in the new country for the
                past {status.requiredContinuousDays} days. Our team reviews
                submissions within 1-3 business days.
              </p>
            </div>
          </div>
          {!manualOpen && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="flex-shrink-0 h-8 rounded-full border border-[#e5e7eb] bg-white px-3 text-xs font-bold text-[#111827] hover:border-[#fd4605] hover:text-[#fd4605] hover:bg-[#fff1f3] transition"
            >
              Upload
            </button>
          )}
        </div>

        {manualOpen && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-[#6b7280] mb-1">
                New country
              </label>
              <CountrySelect value={manualCountry} onChange={setManualCountry} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#6b7280] mb-1">
                  Document type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as ResidencyDocumentType)}
                  className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:border-[#fd4605]"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#6b7280] mb-1">
                  Residing since
                </label>
                <input
                  type="date"
                  value={residingSince}
                  max={todayMinusDays(60)}
                  onChange={(e) => setResidingSince(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:border-[#fd4605]"
                />
                <p className="mt-1 text-[10.5px] text-[#9ca3af]">
                  Must be at least {status.requiredContinuousDays} days ago.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-[#6b7280] mb-1">
                Note for reviewer (optional)
              </label>
              <textarea
                value={docNote}
                onChange={(e) => setDocNote(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Anything that helps us verify your residency…"
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] focus:outline-none focus:border-[#fd4605] resize-none"
              />
            </div>

            {/* File picker */}
            <div>
              <input
                ref={docInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleDocFile}
                className="hidden"
              />
              {docFile ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fb] px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-[#fd4605] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#111827] truncate">
                        {docFile.name}
                      </p>
                      <p className="text-[11px] text-[#6b7280]">
                        {(docFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDocFile(null); if (docInputRef.current) docInputRef.current.value = ""; }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-white hover:text-[#fd4605] transition"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-[#e5e7eb] bg-white text-sm font-semibold text-[#6b7280] hover:border-[#fd4605] hover:text-[#fd4605] hover:bg-[#fff1f3] transition"
                >
                  <Upload className="h-4 w-4" />
                  Choose file (PDF, JPG, PNG, WEBP · 10 MB max)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { resetManualForm(); setManualOpen(false); }}
                disabled={uploading}
                className="flex-1 h-9 rounded-full border border-[#e5e7eb] bg-white text-sm font-bold text-[#111827] hover:bg-[#f8f9fb] disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResidencyDocument}
                disabled={uploading || !manualCountry || !docFile}
                className="flex-1 h-9 rounded-full bg-[#fd4605] text-sm font-bold text-white hover:bg-[#e03e04] disabled:opacity-50 transition"
              >
                {uploading ? "Uploading…" : "Submit for review"}
              </button>
            </div>
          </div>
        )}

        {/* History of submissions */}
        {residencyDocs && residencyDocs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#f0f0f0]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              Your submissions
            </p>
            {residencyDocs.slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-[#f8f9fb] px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CountryFlag code={d.requested_country_code} size={20} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#111827] truncate">
                      {d.requested_country_name} · {d.document_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10.5px] text-[#9ca3af]">
                      {d.submitted_at ? new Date(d.submitted_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap " +
                    (d.status === "approved"
                      ? "bg-[#ecfdf5] text-[#059669]"
                      : d.status === "rejected"
                        ? "bg-[#fef2f2] text-[#dc2626]"
                        : "bg-[#fff7ed] text-[#ea580c]")
                  }
                >
                  {d.status === "pending_review" ? "Under review"
                    : d.status === "approved"    ? "Approved"
                    :                              "Rejected"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
