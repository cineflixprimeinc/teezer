"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { api, apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

/* Change the signed-in admin's own password.
   The API verifies the current password, stores the new one (hashed), then
   revokes every session (API tokens, SSO and the admin cookie). The same
   account logs in to the admin panel and the website, so the new password
   applies to both; the admin is sent back to /login to sign in again. */

const MIN_LENGTH = 8;

function PasswordField({
  label, value, onChange, autoComplete, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-[#374151]">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="h-11 w-full rounded-xl border border-[#e8eaed] bg-white pl-3.5 pr-11 text-[14px] text-[#111827] outline-none transition focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/15"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] hover:bg-[#f4f5f7] hover:text-[#374151]"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <span className="mt-1 block text-[12px] text-[#ef4444]">{error}</span>}
    </label>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 text-[12px] ${ok ? "text-[#059669]" : "text-[#9ca3af]"}`}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {children}
    </li>
  );
}

function ChangePasswordContent() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const longEnough = next.length >= MIN_LENGTH;
  const hasLetter = /[A-Za-z]/.test(next);
  const hasNumber = /\d/.test(next);
  const hasSymbol = /[^A-Za-z0-9]/.test(next);
  const differs = next.length > 0 && next !== current;
  const matches = confirm.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && longEnough && differs && matches && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErrors({});
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        password: next,
        password_confirmation: confirm,
      });
      toast.success("Password changed. Please sign in again with your new password.");
      // Every session was revoked server-side; clear local state and go to login.
      await logout().catch(() => undefined);
      router.replace("/login");
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } }).response;
      const fieldErrors = res?.data?.errors;
      if (fieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrors)) mapped[k] = Array.isArray(v) ? v[0] : String(v);
        setErrors(mapped);
      }
      toast.error(res?.status === 429 ? "Too many attempts. Please wait a minute and try again." : apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-[#e8eaed] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#fd4605]/10 text-[#fd4605]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-[#111827]">Change Admin Password</h2>
            <p className="text-[12px] text-[#6b7280]">
              {user?.email ? `Signed in as ${user.email}. ` : ""}
              The new password is used for the admin panel and the website.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            error={errors.current_password}
          />
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            error={errors.password}
          />
          <ul className="grid grid-cols-2 gap-1 rounded-xl bg-[#f9fafb] px-3 py-2.5">
            <Rule ok={longEnough}>At least {MIN_LENGTH} characters</Rule>
            <Rule ok={differs}>Different from current</Rule>
            <Rule ok={hasLetter && hasNumber}>Letters and numbers</Rule>
            <Rule ok={hasSymbol}>A symbol (recommended)</Rule>
          </ul>
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={confirm.length > 0 && !matches ? "Passwords do not match." : errors.password_confirmation}
          />

          <div className="rounded-xl border border-[#fde7dc] bg-[#fff6f1] px-3 py-2.5 text-[12px] text-[#b83203]">
            After changing it you will be signed out everywhere (admin panel, website and apps) and must sign in again.
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#fd4605] text-[14px] font-semibold text-white transition hover:bg-[#e03e04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Changing password..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ChangeAdminPasswordPage() {
  return (
    <AdminShell title="Change Admin Password">
      <ChangePasswordContent />
    </AdminShell>
  );
}
