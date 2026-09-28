"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Phone, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { accountService } from "@/services/account.service";
import { apiMessage } from "@/services/api";

type Mode = "email" | "phone";

interface Props {
  open: boolean;
  mode: Mode;
  currentValue: string | null | undefined;
  onClose: () => void;
  onSaved: (newValue: string) => void;
}

export function ContactChangeModal({ open, mode, currentValue, onClose, onSaved }: Props) {
  const [value,    setValue]    = useState("");
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (open) {
      setValue("");
      setPassword("");
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const isEmail = mode === "email";
  const title   = isEmail ? "Change Email Address" : "Change Phone Number";
  const label   = isEmail ? "New email address"    : "New phone number";
  const ph      = isEmail ? "you@example.com"      : "+977 9800000000";
  const inputType = isEmail ? "email" : "tel";

  async function submit() {
    if (!value.trim()) { toast.error("Enter a new " + (isEmail ? "email." : "phone number.")); return; }
    if (!password)     { toast.error("Enter your current password."); return; }

    setBusy(true);
    try {
      if (isEmail) {
        const r = await accountService.changeEmail(value.trim(), password);
        onSaved(r.email);
        toast.success("Email updated.");
      } else {
        const r = await accountService.changePhone(value.trim(), password);
        onSaved(r.phone);
        toast.success("Phone updated.");
      }
      onClose();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[420px] rounded-[18px] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#fff0f4]">
              {isEmail ? <Mail className="h-4 w-4 text-[#fe2c55]" /> : <Phone className="h-4 w-4 text-[#fe2c55]" />}
            </span>
            <h3 className="text-[15px] font-extrabold text-[#111827]">{title}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f4f5f7] hover:text-[#111827]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {currentValue ? (
          <p className="mb-3 text-[12px] text-[#6b7280]">
            Current: <span className="font-semibold text-[#111827]">{currentValue}</span>
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-bold text-[#374151]">{label}</span>
            <input
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={ph}
              className="h-10 rounded-[10px] border border-[#e8eaf0] bg-white px-3 text-[13.5px] text-[#111827] placeholder:text-[#c0c4cc] outline-none transition-colors focus:border-[#fe2c55]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-bold text-[#374151]">Current password</span>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-10 w-full rounded-[10px] border border-[#e8eaf0] bg-white pl-9 pr-3 text-[13.5px] text-[#111827] placeholder:text-[#c0c4cc] outline-none transition-colors focus:border-[#fe2c55]"
              />
            </div>
          </label>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-[10px] border border-[#e8eaf0] bg-white py-2.5 text-[13px] font-bold text-[#374151] transition-colors hover:bg-[#f8fafc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-[10px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#e0193f] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
