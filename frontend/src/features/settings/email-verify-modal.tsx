"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { accountService } from "@/services/account.service";
import { apiMessage } from "@/services/api";

/**
 * Verify the current (pending) email via a 6-digit OTP. Sends a code on open,
 * takes the code, verifies it, then calls onVerified.
 */
export function EmailVerifyModal({
  open,
  email,
  onClose,
  onVerified,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setOtp("");
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    setSending(true);
    try {
      const res = await accountService.sendEmailOtp();
      toast.success(res.message || `Code sent to ${email}`);
      inputs.current[0]?.focus();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) {
      toast.error("Please enter the full 6-digit code.");
      return;
    }
    setVerifying(true);
    try {
      await accountService.verifyEmailOtp(code);
      toast.success("Email verified successfully.");
      onVerified();
      onClose();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  function setDigit(i: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    const arr = otp.split("").slice(0, 6);
    while (arr.length < 6) arr.push("");
    if (cleaned.length > 1) {
      for (let j = 0; j < cleaned.length && i + j < 6; j++) arr[i + j] = cleaned[j];
      setOtp(arr.join(""));
      inputs.current[Math.min(i + cleaned.length, 5)]?.focus();
      return;
    }
    arr[i] = cleaned;
    setOtp(arr.join(""));
    if (cleaned && i < 5) inputs.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  if (!open) return null;

  const digits = otp.split("").slice(0, 6);
  while (digits.length < 6) digits.push("");
  const code = otp.replace(/\D/g, "");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold text-[#111827]">Verify your email</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#111827]"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-5 text-[13px] text-[#6b7280]">
          {sending ? "Sending a code…" : <>Enter the 6-digit code we sent to <span className="font-semibold text-[#111827]">{email}</span>.</>}
        </p>

        <div className="mb-5 flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric"
              maxLength={i === 0 ? 6 : 1}
              className={`h-12 w-11 rounded-xl border text-center text-2xl font-bold outline-none transition-colors ${d ? "border-[#fd4605]" : "border-[#e8eaf0]"} focus:border-[#fd4605]`}
            />
          ))}
        </div>

        <button
          onClick={verify}
          disabled={code.length < 6 || verifying || sending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fd4605] py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          {verifying ? "Verifying…" : "Verify Email"}
        </button>

        <div className="mt-3 flex items-center justify-between text-[13px]">
          <button onClick={onClose} className="font-semibold text-[#6b7280] hover:text-[#111827]">Cancel</button>
          <button onClick={send} disabled={sending} className="font-semibold text-[#fd4605] hover:underline disabled:opacity-50">Resend code</button>
        </div>
      </div>
    </div>
  );
}
