"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Bell, Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff,
  Key, Laptop, Loader2, Lock, LogOut, Monitor, Phone, Mail,
  ShieldCheck, ShieldOff, Smartphone, Tablet, Trash2, UserCheck, X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { securityService, type SecurityOverview, type SessionItem } from "@/services/security.service";
import { authService } from "@/services/auth.service";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

/* ── Two-Factor Authentication modal ─────────────────────────────── */
function TwoFactorModal({ enabled, onClose, onChanged }: {
  enabled: boolean; onClose: () => void; onChanged: () => void;
}) {
  type Step = "intro" | "scan" | "recovery" | "disable";
  const [step, setStep]       = useState<Step>(enabled ? "disable" : "intro");
  const [busy, setBusy]       = useState(false);
  const [secret, setSecret]   = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode]       = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [copied, setCopied]   = useState(false);

  async function begin() {
    setBusy(true);
    try {
      const d = await authService.twoFactorSetup();
      setSecret(d.secret); setOtpauth(d.otpauth_uri); setStep("scan");
    } catch (e) { toast.error(apiMessage(e)); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    try {
      const d = await authService.twoFactorConfirm(code.trim());
      setRecovery(d.recovery_codes); setStep("recovery"); onChanged();
      toast.success("Two-factor authentication enabled.");
    } catch (e) { toast.error(apiMessage(e)); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try {
      await authService.twoFactorDisable(password);
      onChanged(); toast.success("Two-factor authentication disabled."); onClose();
    } catch (e) { toast.error(apiMessage(e)); }
    finally { setBusy(false); }
  }
  function copyCodes() {
    navigator.clipboard.writeText(recovery.join("\n"));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#ecfdf5]">
              <ShieldCheck className="h-4.5 w-4.5 text-[#10b981]" />
            </div>
            <p className="text-[15px] font-bold text-[#111827]">Two-Factor Authentication</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb]">
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === "intro" && (
            <div className="text-center">
              <Smartphone className="mx-auto h-10 w-10 text-[#fe2c55]" />
              <p className="mt-3 text-[14px] font-semibold text-[#111827]">Add an extra layer of security</p>
              <p className="mx-auto mt-1 max-w-xs text-[12.5px] text-[#6b7280]">
                Use Google Authenticator, Authy, or 1Password to generate a 6-digit code each time you sign in.
              </p>
              <button onClick={begin} disabled={busy}
                className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#e0193f] disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Begin Setup
              </button>
            </div>
          )}

          {step === "scan" && (
            <div>
              <p className="text-[13px] font-semibold text-[#111827]">1. Scan with your authenticator app</p>
              <div className="my-4 flex justify-center">
                <div className="rounded-xl border border-[#e5e7eb] p-3">
                  {otpauth && <QRCodeSVG value={otpauth} size={170} />}
                </div>
              </div>
              <p className="text-center text-[11.5px] text-[#9ca3af]">Or enter this key manually:</p>
              <p className="mt-1 break-all text-center font-mono text-[12.5px] font-semibold tracking-wider text-[#111827]">{secret}</p>
              <p className="mt-4 text-[13px] font-semibold text-[#111827]">2. Enter the 6-digit code</p>
              <div className="mt-2 flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456"
                  className="h-[42px] flex-1 rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-center text-[15px] tracking-[0.3em] outline-none focus:border-[#fe2c55]" />
                <button onClick={confirm} disabled={busy || code.trim().length < 6}
                  className="rounded-[10px] bg-[#fe2c55] px-5 text-[13px] font-bold text-white hover:bg-[#e0193f] disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </button>
              </div>
            </div>
          )}

          {step === "recovery" && (
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#10b981]" />
                <p className="text-[13px] font-semibold text-[#111827]">2FA is on. Save your recovery codes.</p></div>
              <p className="mt-1 text-[12px] text-[#6b7280]">Each code works once. Keep them somewhere safe - they let you back in if you lose your phone.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#f9fafb] p-4">
                {recovery.map((c) => <span key={c} className="font-mono text-[12.5px] font-semibold tracking-wider text-[#111827]">{c}</span>)}
              </div>
              <button onClick={copyCodes} className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] font-semibold text-[#111827] hover:bg-[#f9fafb]">
                {copied ? <Check className="h-4 w-4 text-[#10b981]" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy codes"}
              </button>
              <button onClick={onClose} className="mt-4 w-full rounded-[10px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white hover:bg-[#e0193f]">
                Done
              </button>
            </div>
          )}

          {step === "disable" && (
            <div>
              <div className="flex items-center gap-2 rounded-xl bg-[#ecfdf5] p-3">
                <ShieldCheck className="h-5 w-5 text-[#10b981]" />
                <p className="text-[13px] font-semibold text-[#065f46]">Two-factor authentication is ON.</p>
              </div>
              <p className="mt-4 text-[13px] font-semibold text-[#111827]">Turn off 2FA</p>
              <p className="mt-1 text-[12px] text-[#6b7280]">Confirm your password to disable two-factor authentication.</p>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password"
                className="mt-3 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#fe2c55]" />
              <button onClick={disable} disabled={busy || !password}
                className="mt-3 w-full rounded-[10px] bg-[#ef4444] py-2.5 text-[13px] font-bold text-white hover:bg-[#dc2626] disabled:opacity-50">
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Disable 2FA"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */
function ago(iso: string | null): string {
  if (!iso) return "Unknown";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "Unknown"; }
}
function mask(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  return u.slice(0, 2) + "•".repeat(Math.max(2, u.length - 2)) + "@" + d;
}
function maskPhone(p: string): string {
  return p.slice(0, 4) + "•".repeat(Math.max(2, p.length - 7)) + p.slice(-2);
}

/* ── Device icon ─────────────────────────────────────────────────── */
function DeviceIcon({ type, className = "" }: { type: string; className?: string }) {
  if (type === "mobile") return <Smartphone className={className} />;
  if (type === "tablet") return <Tablet className={className} />;
  return <Monitor className={className} />;
}

/* ── Badge ───────────────────────────────────────────────────────── */
function Badge({ label, color }: { label: string; color: "green" | "blue" | "red" | "gray" }) {
  const cls = {
    green: "bg-[#dcfce7] text-[#16a34a]",
    blue:  "bg-[#dbeafe] text-[#2563eb]",
    red:   "bg-[#fee2e2] text-[#dc2626]",
    gray:  "bg-[#f3f4f6] text-[#6b7280]",
  }[color];
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>;
}

/* ── Toggle ──────────────────────────────────────────────────────── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${on ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ── ChangePassword modal ────────────────────────────────────────── */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent]   = useState("");
  const [next,    setNext]      = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showC,   setShowC]     = useState(false);
  const [showN,   setShowN]     = useState(false);
  const [saving,  setSaving]    = useState(false);
  const router = useRouter();

  const strength = next.length === 0 ? 0 : next.length < 6 ? 1 : next.length < 10 ? 2 : /[A-Z]/.test(next) && /\d/.test(next) && /[^A-Za-z0-9]/.test(next) ? 4 : 3;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-[#ef4444]", "bg-[#f59e0b]", "bg-[#10b981]", "bg-[#3b82f6]"][strength];

  async function submit() {
    if (!current || !next || next !== confirm) {
      toast.error(next !== confirm ? "Passwords do not match." : "Please fill all fields.");
      return;
    }
    if (next.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await securityService.changePassword(current, next, confirm);
      toast.success("Password changed. Please log in again.");
      onClose();
      setTimeout(() => router.push("/login"), 1000);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not change password.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fff0f4]">
              <Lock className="h-4.5 w-4.5 text-[#fe2c55]" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#111827]">Change Password</p>
              <p className="text-[11.5px] text-[#9ca3af]">Update your password regularly</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb]">
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Current */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Current Password</label>
            <div className="relative">
              <input type={showC ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#111827] placeholder-[#9ca3af] outline-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10" />
              <button type="button" onClick={() => setShowC(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                {showC ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {/* New */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">New Password</label>
            <div className="relative">
              <input type={showN ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#111827] placeholder-[#9ca3af] outline-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10" />
              <button type="button" onClick={() => setShowN(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                {showN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {next && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : "bg-[#f3f4f6]"}`} />)}
                </div>
                <p className={`text-[11px] font-semibold ${["","text-[#ef4444]","text-[#f59e0b]","text-[#10b981]","text-[#3b82f6]"][strength]}`}>{strengthLabel}</p>
              </div>
            )}
          </div>
          {/* Confirm */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Confirm New Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              className={`w-full rounded-[10px] border px-3.5 py-2.5 text-[13px] text-[#111827] placeholder-[#9ca3af] outline-none focus:ring-2 focus:ring-[#fe2c55]/10 ${confirm && confirm !== next ? "border-[#ef4444] focus:border-[#ef4444]" : "border-[#e5e7eb] focus:border-[#fe2c55]"}`} />
            {confirm && confirm !== next && <p className="mt-1 text-[11px] text-[#ef4444]">Passwords do not match</p>}
          </div>
        </div>

        <div className="flex gap-3 border-t border-[#f3f4f6] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb]">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white hover:bg-[#e0193f] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── DeleteAccount modal ─────────────────────────────────────────── */
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [show,     setShow]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const router = useRouter();
  const { logout } = useAuthStore();

  async function submit() {
    if (!password) { toast.error("Please enter your password."); return; }
    setSaving(true);
    try {
      await securityService.deleteAccount(password);
      toast.success("Account deleted.");
      logout();
      router.push("/");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not delete account.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fef2f2]">
              <Trash2 className="h-4.5 w-4.5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#111827]">Delete Account</p>
              <p className="text-[11.5px] text-[#9ca3af]">This action is permanent</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb]">
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="mb-4 rounded-xl bg-[#fef2f2] p-4">
            <p className="text-[13px] font-semibold text-[#dc2626]">⚠ Warning - this cannot be undone</p>
            <p className="mt-1 text-[12px] text-[#ef4444]">All your videos, followers, messages and data will be permanently deleted.</p>
          </div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Confirm your password</label>
          <div className="relative">
            <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#111827] placeholder-[#9ca3af] outline-none focus:border-[#ef4444] focus:ring-2 focus:ring-[#ef4444]/10" />
            <button type="button" onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex gap-3 border-t border-[#f3f4f6] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb]">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#ef4444] py-2.5 text-[13px] font-bold text-white hover:bg-[#dc2626] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Deleting…" : "Delete My Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Section card ────────────────────────────────────────────────── */
function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
      <div className="border-b border-[#f3f4f6] px-6 py-4">
        <p className="text-[15px] font-bold text-[#111827]">{title}</p>
        {desc && <p className="mt-0.5 text-[12px] text-[#9ca3af]">{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────────────────── */
function Row({
  icon: Icon, iconBg, iconColor, title, desc, right, last, onClick,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc?: string; right?: React.ReactNode;
  last?: boolean; onClick?: () => void;
}) {
  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 px-6 py-4 ${!last ? "border-b border-[#f3f4f6]" : ""} ${onClick ? "cursor-pointer transition hover:bg-[#f9fafb]" : ""}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
        <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] leading-tight">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] leading-tight text-[#9ca3af]">{desc}</p>}
      </div>
      {right && <div className="flex flex-shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/* ── Security Tips illustration ──────────────────────────────────── */
function ShieldIllustration() {
  return (
    <svg viewBox="0 0 120 120" fill="none" className="h-24 w-24" aria-hidden="true">
      <circle cx="60" cy="60" r="58" fill="#fff0f4" />
      <path d="M60 20 L88 33 L88 60 Q88 82 60 98 Q32 82 32 60 L32 33 Z" fill="#fe2c55" opacity=".15"/>
      <path d="M60 26 L84 37 L84 60 Q84 79 60 93 Q36 79 36 60 L36 37 Z" fill="#fe2c55" opacity=".3"/>
      <path d="M60 32 L80 41 L80 60 Q80 76 60 88 Q40 76 40 60 L40 41 Z" fill="#fe2c55"/>
      <path d="M51 60 L57 66 L70 53" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sparkles */}
      <g opacity=".55">
        <line x1="98" y1="30" x2="98" y2="38" stroke="#fe2c55" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="94" y1="34" x2="102" y2="34" stroke="#fe2c55" strokeWidth="2.5" strokeLinecap="round"/>
      </g>
      <g opacity=".4">
        <line x1="20" y1="78" x2="20" y2="84" stroke="#ffa0b4" strokeWidth="2" strokeLinecap="round"/>
        <line x1="17" y1="81" x2="23" y2="81" stroke="#ffa0b4" strokeWidth="2" strokeLinecap="round"/>
      </g>
      <circle cx="95" cy="68" r="3" fill="#ffd6e0"/>
      <circle cx="22" cy="48" r="2.5" fill="#ffc7d2"/>
    </svg>
  );
}

/* ── SecurityBestPracticesModal ──────────────────────────────────── */
function SecurityBestPracticesModal({
  onClose,
  overview,
}: {
  onClose: () => void;
  overview: import("@/services/security.service").SecurityOverview | null;
}) {
  const router = useRouter();

  const tips = [
    "Use a strong password with at least 8 characters",
    "Enable Two-Factor Authentication",
    "Don't share your password with anyone",
    "Log out from unused devices",
    "Keep your recovery information up to date",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-[#fff5f7] px-6 pt-6 pb-4">
          {/* Shield hero */}
          <div className="absolute right-4 top-4 opacity-90">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fce4ea]">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fe2c55]">
                  <Check className="h-5 w-5 text-white" strokeWidth={3} />
                </div>
              </div>
              <span className="absolute -right-1 -top-1 text-[#fe2c55] text-lg font-bold leading-none">+</span>
              <span className="absolute -bottom-0.5 -left-1 text-[#fca5a5] text-sm font-bold leading-none">+</span>
            </div>
          </div>
          <h2 className="text-[20px] font-black text-[#111827] pr-20">Security Best Practices</h2>
          <p className="mt-1 text-[12.5px] text-[#6b7280] pr-20">Learn how to keep your Teezer account safe and secure.</p>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] transition"
          >
            <X className="h-3.5 w-3.5 text-[#6b7280]" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="max-h-[70vh] overflow-y-auto px-6 pb-5 space-y-3">

          {/* Row 1: Password + 2FA */}
          <div className="grid grid-cols-2 gap-3">

            {/* 1. Password Safety */}
            <div className="rounded-xl bg-[#fff5f7] p-4 border border-[#fce4ea]">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#fce4ea]">
                  <Lock className="h-3.5 w-3.5 text-[#fe2c55]" />
                </div>
                <p className="text-[13px] font-bold text-[#111827]">1. Password Safety</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  "Use a strong password with at least 8 characters.",
                  "Combine letters, numbers, and symbols.",
                  "Avoid using personal information or common words.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#fe2c55]" />
                    <p className="text-[11.5px] text-[#374151] leading-snug">{t}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* 2. Two-Factor Auth */}
            <div className="rounded-xl border border-[#f0f1f5] bg-white p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#dcfce7]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#16a34a]" />
                </div>
                <p className="text-[13px] font-bold text-[#111827]">2. Two-Factor Authentication</p>
              </div>
              <p className="text-[11.5px] text-[#6b7280] leading-snug flex-1">
                Add an extra layer of security by requiring a verification code when you sign in.
              </p>
              <button
                onClick={() => { onClose(); router.push("/settings/security"); }}
                className="mt-3 w-full rounded-[10px] border-2 border-[#fe2c55] py-2 text-[12px] font-bold text-[#fe2c55] transition hover:bg-[#fff0f4]"
              >
                Set Up 2FA
              </button>
            </div>
          </div>

          {/* Row 2: Recovery + Login Protection */}
          <div className="grid grid-cols-2 gap-3">

            {/* 3. Recovery & Verification */}
            <div className="rounded-xl border border-[#f0f1f5] bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#f5f3ff]">
                  <UserCheck className="h-3.5 w-3.5 text-[#7c3aed]" />
                </div>
                <p className="text-[13px] font-bold text-[#111827]">3. Recovery & Verification</p>
              </div>
              <p className="mb-3 text-[11px] text-[#9ca3af] leading-snug">
                Keep your recovery options up to date so you can regain access if needed.
              </p>
              {[
                { icon: Mail,  label: "Email recovery",  verified: overview?.email_verified },
                { icon: Phone, label: "Phone recovery",  verified: overview?.phone_verified },
                { icon: Key,   label: "Backup access",   recommended: true },
              ].map(({ icon: Icon, label, verified, recommended }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#f9fafb] last:border-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                    <span className="text-[11.5px] font-medium text-[#374151]">{label}</span>
                  </div>
                  {verified ? (
                    <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#16a34a]">Verified</span>
                  ) : recommended ? (
                    <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-bold text-[#ca8a04]">Recommended</span>
                  ) : (
                    <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[10px] font-bold text-[#ef4444]">Not Set</span>
                  )}
                </div>
              ))}
            </div>

            {/* 4. Login Protection */}
            <div className="rounded-xl border border-[#f0f1f5] bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#fffbeb]">
                  <ShieldOff className="h-3.5 w-3.5 text-[#f59e0b]" />
                </div>
                <p className="text-[13px] font-bold text-[#111827]">4. Login Protection</p>
              </div>
              <p className="mb-3 text-[11px] text-[#9ca3af] leading-snug">
                Monitor and manage how and where your account is accessed.
              </p>
              {[
                { icon: Bell,    title: "Login alerts",              desc: "Get notified of new logins" },
                { icon: Monitor, title: "Trusted devices",           desc: "Review and manage devices" },
                { icon: LogOut,  title: "Sign out from unknown devices", desc: "Protect your account instantly" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-2.5 py-1.5 border-b border-[#f9fafb] last:border-0">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[6px] bg-[#f3f4f6]">
                    <Icon className="h-3 w-3 text-[#6b7280]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#111827] leading-tight">{title}</p>
                    <p className="text-[10.5px] text-[#9ca3af]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Security Tips (full width) */}
          <div className="rounded-xl border border-[#f0f1f5] bg-[#fafafa] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#fef9c3]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#ca8a04]" />
              </div>
              <p className="text-[13px] font-bold text-[#111827]">5. Security Tips</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {tips.map((tip) => (
                <div key={tip} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
                    <Check className="h-2.5 w-2.5 text-[#16a34a]" strokeWidth={3} />
                  </div>
                  <p className="text-[11.5px] text-[#374151] leading-snug">{tip}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-[#f3f4f6] bg-white px-6 py-4">
          <a
            href="https://help.teezer.live"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#fe2c55] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Visit Help Center
          </a>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-[10px] border border-[#e5e7eb] px-5 py-2 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb]"
            >
              Close
            </button>
            <button
              onClick={() => { onClose(); router.push("/settings/security"); }}
              className="rounded-[10px] bg-[#fe2c55] px-5 py-2 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(254,44,85,0.25)] transition hover:bg-[#e0193f]"
            >
              Go to Security Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function SecurityPage() {
  const { user, logout, fetchMe } = useAuthStore();
  const router = useRouter();
  const [show2fa, setShow2fa] = useState(false);
  const twoFaEnabled = Boolean(user?.two_factor_enabled);

  const [overview,  setOverview]  = useState<SecurityOverview | null>(null);
  const [sessions,  setSessions]  = useState<SessionItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [revoking,  setRevoking]  = useState<number | null>(null);
  const [alertSaving, setAlertSaving] = useState(false);

  const [showChangePwd,     setShowChangePwd]     = useState(false);
  const [showDeleteAcct,    setShowDeleteAcct]    = useState(false);
  const [showBestPractices, setShowBestPractices] = useState(false);

  useEffect(() => {
    Promise.all([
      securityService.overview(),
      securityService.sessions(),
    ]).then(([ov, ss]) => {
      setOverview(ov);
      setSessions(ss);
    }).catch(() => {
      // Fallback from auth store
      setOverview({
        email:               user?.email ?? "",
        phone:               user?.phone ?? null,
        email_verified:      !!(user as any)?.email_verified_at,
        phone_verified:      !!(user as any)?.phone,
        login_alerts:        (user as any)?.login_alerts ?? true,
        password_changed_at: null,
        session_count:       1,
      });
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRevokeSession(id: number) {
    setRevoking(id);
    try {
      await securityService.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
      toast.success("Session revoked.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not revoke session.");
    } finally { setRevoking(null); }
  }

  async function handleRevokeAll() {
    setRevoking(-1);
    try {
      await securityService.revokeAllSessions();
      setSessions((s) => s.filter((x) => x.is_current));
      toast.success("All other sessions revoked.");
    } finally { setRevoking(null); }
  }

  async function handleLoginAlerts(v: boolean) {
    if (!overview) return;
    setAlertSaving(true);
    setOverview((o) => o ? { ...o, login_alerts: v } : o);
    try {
      await securityService.toggleLoginAlerts(v);
      toast.success(v ? "Login alerts enabled." : "Login alerts disabled.", { duration: 1800 });
    } catch {
      setOverview((o) => o ? { ...o, login_alerts: !v } : o);
      toast.error("Could not save.");
    } finally { setAlertSaving(false); }
  }

  const pwdDesc = overview?.password_changed_at
    ? `Last changed ${ago(overview.password_changed_at)}`
    : "Keep your account secure with a strong password";

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#fe2c55]" />
      </div>
    );
  }

  return (
    <>
      {showChangePwd     && <ChangePasswordModal      onClose={() => setShowChangePwd(false)} />}
      {showDeleteAcct    && <DeleteAccountModal       onClose={() => setShowDeleteAcct(false)} />}
      {showBestPractices && <SecurityBestPracticesModal onClose={() => setShowBestPractices(false)} overview={overview} />}
      {show2fa           && <TwoFactorModal enabled={twoFaEnabled} onClose={() => setShow2fa(false)} onChanged={() => { void fetchMe(); }} />}

      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-black text-[#111827]">Login & Security</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">Manage your password, security settings and account access.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* ── Left column ── */}
          <div className="space-y-5">

            {/* Account Security */}
            <SectionCard title="Account Security" desc="Keep your account safe with these security settings.">
              <Row icon={Lock} iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
                title="Password" desc={pwdDesc}
                onClick={() => setShowChangePwd(true)}
                right={
                  <span className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition">
                    Change Password <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                }
              />
              <Row icon={ShieldCheck} iconBg="bg-[#ecfdf5]" iconColor="text-[#10b981]"
                title="Two-Factor Authentication (2FA)"
                desc={twoFaEnabled ? "Enabled - codes required at sign-in" : "Add an extra layer of security to your account"}
                onClick={() => setShow2fa(true)}
                right={<>
                  <Badge label={twoFaEnabled ? "On" : "Off"} color={twoFaEnabled ? "green" : "gray"} />
                  <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
                </>}
              />
              <Row icon={Key} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
                title="Login Alerts"
                desc={alertSaving ? "Saving…" : "Get notified about new logins to your account"}
                right={
                  alertSaving
                    ? <Loader2 className="h-4.5 w-4.5 animate-spin text-[#fe2c55]" />
                    : <Toggle on={overview?.login_alerts ?? true} onChange={handleLoginAlerts} />
                }
              />
              <Row icon={Monitor} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
                title="Trusted Devices"
                desc="Manage devices that can access your account"
                last
                right={
                  <><span className="text-[13px] font-semibold text-[#374151]">{overview?.session_count ?? sessions.length} Device{(overview?.session_count ?? 1) !== 1 ? "s" : ""}</span>
                  <ChevronRight className="h-4 w-4 text-[#d1d5db]" /></>
                }
              />
            </SectionCard>

            {/* Recent Activity */}
            <SectionCard title="Recent Activity" desc="Review your recent account activity.">
              {sessions.length === 0 && (
                <div className="px-6 py-8 text-center text-[13px] text-[#9ca3af]">No session data available.</div>
              )}
              {sessions.map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-3.5 px-6 py-4 ${idx < sessions.length - 1 ? "border-b border-[#f3f4f6]" : ""}`}>
                  {/* Device icon */}
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                    s.type === "mobile" ? "bg-[#f5f3ff]" : s.type === "tablet" ? "bg-[#fff7ed]" : "bg-[#eff6ff]"
                  }`}>
                    <DeviceIcon type={s.type} className={`h-5 w-5 ${
                      s.type === "mobile" ? "text-[#7c3aed]" : s.type === "tablet" ? "text-[#f97316]" : "text-[#3b82f6]"
                    }`} />
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[#111827] leading-tight truncate">{s.label}</p>
                    <p className="text-[11.5px] text-[#9ca3af] leading-tight">
                      {s.ip ? `${s.ip} · ` : ""}{s.last_used ? ago(s.last_used) : ago(s.created_at)}
                    </p>
                  </div>
                  {/* Badge or revoke */}
                  {s.is_current ? (
                    <Badge label="Current Session" color="green" />
                  ) : (
                    <button
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={revoking === s.id}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#9ca3af] transition hover:bg-[#fef2f2] hover:text-[#ef4444] disabled:opacity-40">
                      {revoking === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              ))}
              {sessions.filter(s => !s.is_current).length > 0 && (
                <div className="border-t border-[#f3f4f6] px-6 py-3">
                  <button onClick={handleRevokeAll} disabled={revoking === -1}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#fe2c55] hover:underline disabled:opacity-50">
                    {revoking === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                    Log out of all other devices
                  </button>
                </div>
              )}
            </SectionCard>

          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">

            {/* Recovery Options */}
            <SectionCard title="Recovery Options" desc="Set up recovery options to get back to your account.">
              <Row icon={Mail} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
                title="Recovery Email"
                desc={overview?.email ? mask(overview.email) : "Not set"}
                right={overview?.email_verified
                  ? <><Badge label="Verified" color="green" /><ChevronRight className="h-4 w-4 text-[#d1d5db]" /></>
                  : <><Badge label="Unverified" color="red" /><ChevronRight className="h-4 w-4 text-[#d1d5db]" /></>
                }
              />
              <Row icon={Phone} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
                title="Recovery Phone"
                desc={overview?.phone ? maskPhone(overview.phone) : "Not set"}
                right={overview?.phone
                  ? <><Badge label="Verified" color="green" /><ChevronRight className="h-4 w-4 text-[#d1d5db]" /></>
                  : <><span className="rounded-[10px] border border-[#e5e7eb] px-3 py-1 text-[12px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition cursor-pointer">Set Up</span><ChevronRight className="h-4 w-4 text-[#d1d5db]" /></>
                }
                last
              />
            </SectionCard>

            {/* Security Tips */}
            <SectionCard title="Security Tips" desc="Follow these tips to keep your account secure.">
              <div className="flex items-start gap-4 px-6 py-4">
                <div className="flex-1 space-y-2.5">
                  {[
                    "Use a strong password with at least 8 characters",
                    "Enable Two-Factor Authentication",
                    "Don't share your password with anyone",
                    "Log out from unused devices",
                    "Keep your recovery information up to date",
                  ].map((tip) => (
                    <div key={tip} className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
                        <Check className="h-2.5 w-2.5 text-[#16a34a]" strokeWidth={3} />
                      </div>
                      <p className="text-[12.5px] text-[#374151] leading-snug">{tip}</p>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowBestPractices(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-[#fe2c55]/30 bg-[#fff0f4] px-4 py-2 text-[12px] font-bold text-[#fe2c55] transition hover:bg-[#fce4ea]"
                  >
                    Learn More About Security <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-shrink-0">
                  <ShieldIllustration />
                </div>
              </div>
            </SectionCard>

            {/* Danger Zone */}
            <div className="overflow-hidden rounded-2xl border border-[#fca5a5] bg-white shadow-sm">
              <div className="border-b border-[#fca5a5] bg-[#fef2f2] px-6 py-4">
                <p className="text-[15px] font-bold text-[#dc2626]">Danger Zone</p>
                <p className="mt-0.5 text-[12px] text-[#ef4444]">These actions are permanent and cannot be undone.</p>
              </div>
              <div className="flex items-center gap-4 px-6 py-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#fef2f2]">
                  <Trash2 className="h-[18px] w-[18px] text-[#ef4444]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#111827]">Delete Account</p>
                  <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">Permanently delete your account and all data</p>
                </div>
                <button onClick={() => setShowDeleteAcct(true)}
                  className="flex items-center gap-1.5 rounded-[10px] bg-[#fef2f2] px-4 py-2 text-[12px] font-bold text-[#ef4444] transition hover:bg-[#fee2e2] border border-[#fca5a5]">
                  Delete Account <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Help footer */}
            <p className="text-left text-[12px] text-[#9ca3af]">
              Need help?{" "}
              <a href="/help" className="font-semibold text-[#fe2c55] hover:underline">Visit our Help Center</a>
              {" "}or contact{" "}
              <a href="mailto:support@teezer.live" className="font-semibold text-[#fe2c55] hover:underline">
                support@teezer.live <ExternalLink className="inline h-3 w-3" />
              </a>
            </p>

          </div>
        </div>
      </div>
    </>
  );
}
