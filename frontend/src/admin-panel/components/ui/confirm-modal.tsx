"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  danger       = false,
  loading      = false,
  onConfirm,
  onCancel,
  children,
}: {
  open:          boolean;
  title:         string;
  message:       string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
  loading?:      boolean;
  onConfirm:     () => void;
  onCancel:      () => void;
  children?:     React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[420px] rounded-2xl border border-[#e8eaed] bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${danger ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${danger ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#111827]">{title}</h3>
            <p className="mt-1 text-[13px] text-[#6b7280]">{message}</p>
            {children}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
            {loading ? "Processing…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
