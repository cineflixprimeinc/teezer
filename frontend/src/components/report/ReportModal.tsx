"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, CircleCheck, Flag, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { REPORT_CONFIG, type ReportEntityType } from "@/lib/report-config";
import { reportService } from "@/services/report.service";
import { apiMessage } from "@/services/api";

const MAX_EVIDENCE = 3;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export interface ReportModalProps {
  entityType: ReportEntityType;
  /** The video/comment/story id, username, or the other user's id (conversation) - whatever REPORT_CONFIG's endpoint() for this type expects. */
  entityId: number | string;
  onClose: () => void;
  /** Fires once the report is actually accepted by the server - lets the caller update its own UI (e.g. disable "Report" once already reported). */
  onSubmitted?: () => void;
}

type Step = "reason" | "details" | "done";

/**
 * The one report popup for everything reportable in the app - video,
 * comment, story, a user's profile, a DM conversation, a live stream, a
 * Space. Two steps (pick a reason, then add optional context/evidence)
 * plus a success state, entirely driven by REPORT_CONFIG so a new
 * reportable thing is a config entry, not a new component.
 *
 * Deliberately still the video-report-modal.tsx visual language (white
 * rounded-2xl card, brand red, portal-rendered, ESC to close) rather than
 * a new look bolted on next to it - this REPLACES that modal (and the
 * inline dialogs in comment-section.tsx/story-viewer.tsx), it isn't a
 * fourth style alongside them.
 */
export function ReportModal({ entityType, entityId, onClose, onSubmitted }: ReportModalProps) {
  const config = REPORT_CONFIG[entityType];

  const [step, setStep]           = useState<Step>("reason");
  const [reason, setReason]       = useState<string | null>(null);
  const [details, setDetails]     = useState("");
  const [evidence, setEvidence]   = useState<{ file: File; previewUrl: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedReason = useMemo(() => config.reasons.find((r) => r.value === reason) ?? null, [config, reason]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Release blob URLs on unmount so previews don't leak memory.
  useEffect(() => () => evidence.forEach((e) => URL.revokeObjectURL(e.previewUrl)), [evidence]);

  function pickReason(value: string) {
    setReason(value);
    setStep("details");
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_EVIDENCE - evidence.length;
    if (room <= 0) { toast.error(`You can attach up to ${MAX_EVIDENCE} photos.`); return; }

    const next: { file: File; previewUrl: string }[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) { toast.error(`${file.name} isn't an image.`); continue; }
      if (file.size > MAX_EVIDENCE_BYTES) { toast.error(`${file.name} is over 5MB.`); continue; }
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setEvidence((prev) => [...prev, ...next]);
  }

  function removeEvidence(idx: number) {
    setEvidence((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      const res = await reportService.submit(entityType, entityId, {
        reason,
        details: config.allowDetails ? (details.trim() || undefined) : undefined,
        evidence: evidence.map((e) => e.file),
      });
      onSubmitted?.();
      setStep("done");
      void res;
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1100] grid place-items-center bg-black/55 backdrop-blur-sm px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#eeeeee] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[#eeeeee] px-4 py-3">
          {step === "details" ? (
            <button
              type="button"
              onClick={() => setStep("reason")}
              aria-label="Back"
              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[#5f6675] hover:bg-[#f8f9fb] hover:text-black"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#fff0f4]">
              <Flag className="h-3.5 w-3.5 text-[#fe2c55]" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-[15px] font-bold text-black">
              {step === "done" ? "Report submitted" : `Report ${config.noun}`}
            </h2>
            {step !== "done" && (
              <p className="text-[11px] font-medium text-[#9ca3af]">Step {step === "reason" ? 1 : 2} of 2</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[#5f6675] hover:bg-[#f8f9fb] hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1: reason */}
        {step === "reason" && (
          <div className="max-h-[420px] space-y-1 overflow-y-auto p-3">
            {config.reasons.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => pickReason(r.value)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f8f9fb]"
              >
                <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border border-[#cccccc] bg-white" />
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold text-black">{r.label}</p>
                  {r.hint && <p className="text-[11px] text-[#5f6675]">{r.hint}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: details + evidence */}
        {step === "details" && (
          <div className="p-4">
            <div className="mb-3 rounded-xl bg-[#fff0f4] px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#fe2c55]">Reason selected</p>
              <p className="text-[13px] font-semibold text-black">{selectedReason?.label}</p>
            </div>

            {config.allowDetails && (
              <div className="mb-3">
                <label className="mb-1 block text-[12px] font-semibold text-black">
                  Add details <span className="font-normal text-[#9ca3af]">(optional)</span>
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value.slice(0, 500))}
                  placeholder="What happened? Anything you tell us helps our review team."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#eeeeee] bg-white p-2 text-[12px] text-black outline-none focus:border-[#fe2c55]"
                />
                <p className="mt-0.5 text-right text-[10px] text-[#9ca3af]">{details.length}/500</p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-black">
                Add evidence <span className="font-normal text-[#9ca3af]">(optional, up to {MAX_EVIDENCE} photos)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
              <div className="flex flex-wrap gap-2">
                {evidence.map((e, i) => (
                  <div key={e.previewUrl} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-[#eeeeee]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.previewUrl} alt="Evidence" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeEvidence(i)}
                      aria-label="Remove"
                      className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {evidence.length < MAX_EVIDENCE && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-lg border border-dashed border-[#cccccc] text-[#9ca3af] hover:border-[#fe2c55] hover:text-[#fe2c55]"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-[#eeeeee] bg-white px-3 text-[12px] font-semibold text-black hover:border-[#fe2c55] hover:text-[#fe2c55]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#fe2c55] px-4 text-[12px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <CircleCheck className="h-10 w-10 text-[#16a34a]" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-black">Thank you for keeping Teezer safe.</p>
            <p className="text-[12px] text-[#5f6675]">Our team will review your report shortly.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 h-9 rounded-lg bg-[#fe2c55] px-5 text-[12px] font-bold text-white shadow-sm"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
