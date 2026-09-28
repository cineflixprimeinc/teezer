"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldAlert, Smartphone, KeyRound, Copy, Check, Loader2, Download,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { authService } from "@/services/auth.service";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

type Step = "idle" | "scan" | "recovery";

function SecurityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, fetchMe } = useAuthStore();
  const enabled = Boolean(user?.two_factor_enabled);
  // Only when the SERVER sent us here to enrol (?setup=1, set by the
  // TWO_FACTOR_SETUP_REQUIRED interceptor in services/api.ts). 2FA is opt-in
  // for admins by default, so simply not having it on is no longer a reason to
  // tell someone it is mandatory - that banner would otherwise be a standing
  // false statement on this page.
  const mandatory = !enabled && params.get("setup") === "1";

  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Disable form
  const [disablePassword, setDisablePassword] = useState("");

  useEffect(() => {
    if (params.get("setup") === "1" && !enabled) {
      void beginSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginSetup() {
    setBusy(true);
    try {
      const data = await authService.twoFactorSetup();
      setSecret(data.secret);
      setOtpauthUri(data.otpauth_uri);
      setStep("scan");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const data = await authService.twoFactorConfirm(code.trim());
      setRecoveryCodes(data.recovery_codes);
      setStep("recovery");
      await fetchMe();
      toast.success("Two-factor authentication enabled.");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await authService.twoFactorDisable(disablePassword);
      setDisablePassword("");
      await fetchMe();
      toast.success("Two-factor authentication disabled.");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const data = await authService.twoFactorRecoveryCodes();
      setRecoveryCodes(data.recovery_codes);
      toast.success("New recovery codes generated.");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadCodes() {
    const blob = new Blob([`Teezer Admin - recovery codes\n\n${recoveryCodes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teezer-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-[#fe2c55]" />
        <h1 className="text-xl font-bold text-[#111827]">Security · Two-Factor Authentication</h1>
      </div>

      {mandatory && step === "idle" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Setup required</p>
            <p className="mt-0.5 text-[13px] text-amber-800">
              Two-factor authentication is mandatory for admin accounts. Set it up now to access the panel.
            </p>
          </div>
        </div>
      )}

      {/* ── Enabled state ── */}
      {enabled && step !== "recovery" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-900">
              Two-factor authentication is ON for your account.
            </p>
          </div>

          <div className="rounded-xl border border-[#e8eaed] bg-white p-5">
            <p className="text-sm font-semibold text-[#111827]">Recovery codes</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">
              Generate a fresh set if you&apos;ve lost yours. Old codes stop working immediately.
            </p>
            <button
              onClick={regenerate}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#e8eaed] px-3 py-2 text-[13px] font-semibold text-[#111827] hover:bg-[#f4f5f7] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Regenerate recovery codes
            </button>
            {recoveryCodes.length > 0 && <RecoveryList codes={recoveryCodes} onCopy={copyCodes} copied={copied} onDownload={downloadCodes} />}
          </div>

          <div className="rounded-xl border border-red-200 bg-white p-5">
            <p className="text-sm font-semibold text-[#111827]">Disable 2FA</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">Confirm your password to turn off two-factor authentication.</p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Current password"
                className="h-[38px] flex-1 rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] outline-none focus:border-[#fe2c55]"
              />
              <button
                onClick={disable}
                disabled={busy || !disablePassword}
                className="rounded-lg bg-red-600 px-4 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup: idle (not enabled) ── */}
      {!enabled && step === "idle" && (
        <div className="rounded-xl border border-[#e8eaed] bg-white p-6 text-center">
          <Smartphone className="mx-auto h-10 w-10 text-[#fe2c55]" />
          <p className="mt-3 text-sm font-semibold text-[#111827]">Protect your account with an authenticator app</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[#6b7280]">
            Use Google Authenticator, Authy, or 1Password to generate a 6-digit code each time you sign in.
          </p>
          <button
            onClick={beginSetup}
            disabled={busy}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#fe2c55] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0193f] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Begin setup
          </button>
        </div>
      )}

      {/* ── Setup: scan QR ── */}
      {step === "scan" && (
        <div className="rounded-xl border border-[#e8eaed] bg-white p-6">
          <p className="text-sm font-semibold text-[#111827]">1. Scan this QR code</p>
          <p className="mt-1 text-[13px] text-[#6b7280]">Open your authenticator app and scan the code below.</p>
          <div className="my-4 flex justify-center">
            <div className="rounded-xl border border-[#e8eaed] bg-white p-4">
              {otpauthUri && <QRCodeSVG value={otpauthUri} size={184} />}
            </div>
          </div>
          <p className="text-center text-[12px] text-[#6b7280]">
            Can&apos;t scan? Enter this key manually:
          </p>
          <p className="mt-1 text-center font-mono text-[13px] font-semibold tracking-wider text-[#111827] break-all">{secret}</p>

          <p className="mt-5 text-sm font-semibold text-[#111827]">2. Enter the 6-digit code</p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-[42px] flex-1 rounded-[10px] border border-[#e8eaed] bg-white px-3 text-center text-[15px] tracking-[0.3em] outline-none focus:border-[#fe2c55]"
            />
            <button
              onClick={confirmSetup}
              disabled={busy || code.trim().length < 6}
              className="rounded-lg bg-[#fe2c55] px-5 text-sm font-semibold text-white hover:bg-[#e0193f] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>
      )}

      {/* ── Setup: recovery codes ── */}
      {step === "recovery" && (
        <div className="rounded-xl border border-[#e8eaed] bg-white p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-semibold text-[#111827]">Two-factor authentication is on. Save your recovery codes.</p>
          </div>
          <p className="mt-1 text-[13px] text-[#6b7280]">
            Each code works once. Store them somewhere safe - they&apos;re the only way back in if you lose your phone.
          </p>
          <RecoveryList codes={recoveryCodes} onCopy={copyCodes} copied={copied} onDownload={downloadCodes} />
          <button
            onClick={() => router.replace("/dashboard")}
            className="mt-5 w-full rounded-lg bg-[#fe2c55] py-2.5 text-sm font-semibold text-white hover:bg-[#e0193f]"
          >
            I&apos;ve saved my codes - continue
          </button>
        </div>
      )}
    </div>
  );
}

function RecoveryList({ codes, onCopy, copied, onDownload }: {
  codes: string[]; onCopy: () => void; copied: boolean; onDownload: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f4f5f7] p-4">
        {codes.map((c) => (
          <span key={c} className="font-mono text-[13px] font-semibold tracking-wider text-[#111827]">{c}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg border border-[#e8eaed] px-3 py-2 text-[13px] font-semibold text-[#111827] hover:bg-[#f4f5f7]">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg border border-[#e8eaed] px-3 py-2 text-[13px] font-semibold text-[#111827] hover:bg-[#f4f5f7]">
          <Download className="h-4 w-4" />
          Download
        </button>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <AdminShell title="Security">
      <Suspense fallback={null}>
        <SecurityContent />
      </Suspense>
    </AdminShell>
  );
}
