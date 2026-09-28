"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail, Lock, Server, Send, Eye, EyeOff,
  CheckCircle2, AlertCircle, Loader2, Save, RefreshCw, Shield,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { adminService } from "@/admin-panel/services/admin.service";

// ── Tiny form field components ────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-semibold text-[#374151] mb-1">{children}</p>;
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full h-[38px] rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fe2c55] transition-colors disabled:bg-[#f4f5f7] disabled:text-[#9ca3af]"
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full h-[38px] rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#fe2c55] transition-colors"
    >
      {children}
    </select>
  );
}

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f3f4f6]">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fff0f4]">
          <span className="text-[#fe2c55]">{icon}</span>
        </div>
        <div>
          <p className="text-[14px] font-bold text-[#111827]">{title}</p>
          <p className="text-[12px] text-[#6b7280]">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Btn({
  children, onClick, disabled, variant = "primary", loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  loading?: boolean;
}) {
  const base = "inline-flex items-center gap-2 rounded-[10px] px-4 h-[36px] text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-[#fe2c55] text-white hover:bg-[#e0193f]",
    outline: "border border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
    ghost:   "text-[#6b7280] hover:bg-[#f4f5f7]",
  };
  return (
    <button className={`${base} ${styles[variant]}`} onClick={onClick} disabled={disabled || loading}>
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmailSettings {
  mail_mailer: string;
  mail_host: string;
  mail_port: string;
  mail_username: string;
  mail_password: string;
  mail_encryption: string;
  mail_from_address: string;
  mail_from_name: string;
}

interface OtpSettings {
  otp_expiry_minutes: string;
  otp_max_per_10min: string;
  otp_max_per_hour: string;
  otp_max_per_day: string;
}

const MASKED = "••••••••";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EmailSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-email-settings"],
    queryFn: adminService.emailSettings,
  });

  // ── Email form state ──────────────────────────────────────────────────────
  const [email, setEmail] = useState<EmailSettings>({
    mail_mailer: "smtp", mail_host: "", mail_port: "587",
    mail_username: "", mail_password: "", mail_encryption: "tls",
    mail_from_address: "", mail_from_name: "Teezer",
  });
  const [showPass, setShowPass]   = useState(false);
  const [pwdTouched, setPwdTouched] = useState(false);

  // ── OTP form state ────────────────────────────────────────────────────────
  const [otp, setOtp] = useState<OtpSettings>({
    otp_expiry_minutes: "30", otp_max_per_10min: "3",
    otp_max_per_hour: "5", otp_max_per_day: "10",
  });

  // ── Test email state ──────────────────────────────────────────────────────
  const [testTo, setTestTo]     = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setEmail({
      mail_mailer:       data.email.mail_mailer       ?? "smtp",
      mail_host:         data.email.mail_host         ?? "",
      mail_port:         data.email.mail_port         ?? "587",
      mail_username:     data.email.mail_username     ?? "",
      mail_password:     data.email.mail_password     ?? "",
      mail_encryption:   data.email.mail_encryption   ?? "tls",
      mail_from_address: data.email.mail_from_address ?? "",
      mail_from_name:    data.email.mail_from_name    ?? "Teezer",
    });
    setOtp({
      otp_expiry_minutes: data.otp.otp_expiry_minutes ?? "30",
      otp_max_per_10min:  data.otp.otp_max_per_10min  ?? "3",
      otp_max_per_hour:   data.otp.otp_max_per_hour   ?? "5",
      otp_max_per_day:    data.otp.otp_max_per_day    ?? "10",
    });
  }, [data]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveEmail = useMutation({
    mutationFn: () => adminService.updateEmailSettings({
      ...email,
      // send current value (masked or new) - backend ignores masked
      mail_password: pwdTouched ? email.mail_password : MASKED,
    }),
    onSuccess: () => {
      toast.success("Email settings saved.");
      setPwdTouched(false);
      qc.invalidateQueries({ queryKey: ["admin-email-settings"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Save failed."),
  });

  const saveOtp = useMutation({
    mutationFn: () => adminService.updateOtpSettings({
      otp_expiry_minutes: Number(otp.otp_expiry_minutes),
      otp_max_per_10min:  Number(otp.otp_max_per_10min),
      otp_max_per_hour:   Number(otp.otp_max_per_hour),
      otp_max_per_day:    Number(otp.otp_max_per_day),
    }),
    onSuccess: () => {
      toast.success("OTP settings saved.");
      qc.invalidateQueries({ queryKey: ["admin-email-settings"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Save failed."),
  });

  const sendTest = useMutation({
    mutationFn: () => adminService.testEmail(testTo),
    onSuccess: (res) => {
      setTestResult({ ok: true, msg: res.message });
      toast.success(res.message);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? "Test failed.";
      setTestResult({ ok: false, msg });
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <AdminShell title="Email & OTP">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#fe2c55]" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Email & OTP">
      <div className="max-w-3xl space-y-6">

        {/* ── SMTP Configuration ─────────────────────────────────────────── */}
        <SectionCard
          icon={<Server size={18} />}
          title="SMTP Configuration"
          subtitle="Outbound mail credentials - used for OTP emails, password resets, and notifications"
        >
          <div className="grid grid-cols-2 gap-4">

            {/* Mail Driver */}
            <div>
              <Label>Mail Driver</Label>
              <Select value={email.mail_mailer} onChange={(e) => setEmail({ ...email, mail_mailer: e.target.value })}>
                <option value="smtp">SMTP</option>
                <option value="ses">Amazon SES</option>
                <option value="sendmail">Sendmail</option>
                <option value="log">Log (dev only)</option>
              </Select>
            </div>

            {/* Encryption */}
            <div>
              <Label>Encryption</Label>
              <Select value={email.mail_encryption} onChange={(e) => setEmail({ ...email, mail_encryption: e.target.value })}>
                <option value="tls">TLS (recommended)</option>
                <option value="ssl">SSL</option>
                <option value="">None</option>
              </Select>
            </div>

            {/* Host */}
            <div>
              <Label>SMTP Host</Label>
              <Input
                placeholder="email-smtp.us-east-1.amazonaws.com"
                value={email.mail_host}
                onChange={(e) => setEmail({ ...email, mail_host: e.target.value })}
              />
            </div>

            {/* Port */}
            <div>
              <Label>SMTP Port</Label>
              <Input
                type="number"
                placeholder="587"
                value={email.mail_port}
                onChange={(e) => setEmail({ ...email, mail_port: e.target.value })}
              />
            </div>

            {/* Username */}
            <div>
              <Label>SMTP Username</Label>
              <Input
                placeholder="AKIA..."
                value={email.mail_username}
                onChange={(e) => setEmail({ ...email, mail_username: e.target.value })}
                autoComplete="off"
              />
            </div>

            {/* Password */}
            <div>
              <Label>SMTP Password</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Leave blank to keep existing"
                  value={email.mail_password}
                  onChange={(e) => {
                    setEmail({ ...email, mail_password: e.target.value });
                    setPwdTouched(true);
                  }}
                  onFocus={() => {
                    if (email.mail_password === MASKED) {
                      setEmail({ ...email, mail_password: "" });
                      setPwdTouched(true);
                    }
                  }}
                  autoComplete="new-password"
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151] transition"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* From Address */}
            <div>
              <Label>From Email Address</Label>
              <Input
                type="email"
                placeholder="support@teezer.live"
                value={email.mail_from_address}
                onChange={(e) => setEmail({ ...email, mail_from_address: e.target.value })}
              />
            </div>

            {/* From Name */}
            <div>
              <Label>From Name</Label>
              <Input
                placeholder="Teezer"
                value={email.mail_from_name}
                onChange={(e) => setEmail({ ...email, mail_from_name: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-[#f3f4f6] pt-4">
            <p className="text-[12px] text-[#9ca3af]">
              Credentials are stored encrypted in the database, never in source code.
            </p>
            <Btn onClick={() => saveEmail.mutate()} loading={saveEmail.isPending}>
              <Save size={13} /> Save SMTP Settings
            </Btn>
          </div>
        </SectionCard>

        {/* ── Test Email ─────────────────────────────────────────────────── */}
        <SectionCard
          icon={<Send size={18} />}
          title="Send Test Email"
          subtitle="Verify your SMTP configuration by sending a test message"
        >
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Recipient Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={testTo}
                onChange={(e) => { setTestTo(e.target.value); setTestResult(null); }}
              />
            </div>
            <Btn
              onClick={() => { setTestResult(null); sendTest.mutate(); }}
              disabled={!testTo.includes("@")}
              loading={sendTest.isPending}
            >
              <Send size={13} /> Send Test
            </Btn>
          </div>

          {testResult && (
            <div className={`mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[13px] font-medium ${
              testResult.ok
                ? "bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d]"
                : "bg-[#fef2f2] border border-[#fecaca] text-[#dc2626]"
            }`}>
              {testResult.ok
                ? <CheckCircle2 size={15} />
                : <AlertCircle size={15} />}
              {testResult.msg}
            </div>
          )}
        </SectionCard>

        {/* ── OTP Settings ───────────────────────────────────────────────── */}
        <SectionCard
          icon={<Shield size={18} />}
          title="OTP Rate Limits"
          subtitle="Control how often users can request signup verification codes"
        >
          <div className="grid grid-cols-2 gap-4">

            <div>
              <Label>OTP Expiry (minutes)</Label>
              <Input
                type="number"
                min="5" max="1440"
                placeholder="30"
                value={otp.otp_expiry_minutes}
                onChange={(e) => setOtp({ ...otp, otp_expiry_minutes: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">How long before a code expires (5–1440 min)</p>
            </div>

            <div>
              <Label>Max OTPs per 10 minutes</Label>
              <Input
                type="number"
                min="1" max="20"
                placeholder="3"
                value={otp.otp_max_per_10min}
                onChange={(e) => setOtp({ ...otp, otp_max_per_10min: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">Per IP/device in a 10-minute window</p>
            </div>

            <div>
              <Label>Max OTPs per hour</Label>
              <Input
                type="number"
                min="1" max="60"
                placeholder="5"
                value={otp.otp_max_per_hour}
                onChange={(e) => setOtp({ ...otp, otp_max_per_hour: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">Per IP/device in a 60-minute window</p>
            </div>

            <div>
              <Label>Max OTPs per day</Label>
              <Input
                type="number"
                min="1" max="200"
                placeholder="10"
                value={otp.otp_max_per_day}
                onChange={(e) => setOtp({ ...otp, otp_max_per_day: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">Per IP/device in a 24-hour window</p>
            </div>
          </div>

          <div className="mt-5 flex justify-end border-t border-[#f3f4f6] pt-4">
            <Btn onClick={() => saveOtp.mutate()} loading={saveOtp.isPending}>
              <Save size={13} /> Save OTP Settings
            </Btn>
          </div>
        </SectionCard>

        {/* ── Current Config Summary ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-[#e8eaed] bg-[#fafafa] px-6 py-4">
          <p className="text-[12px] font-bold text-[#374151] mb-3 flex items-center gap-2">
            <Mail size={13} className="text-[#fe2c55]" /> Active Configuration
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px]">
            {[
              ["Driver",       email.mail_mailer],
              ["Host",         email.mail_host  || "-"],
              ["Port",         email.mail_port],
              ["Encryption",   email.mail_encryption || "none"],
              ["From Address", email.mail_from_address || "-"],
              ["From Name",    email.mail_from_name],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] pb-1">
                <span className="text-[#9ca3af] font-medium">{k}</span>
                <span className="text-[#374151] font-semibold truncate max-w-[180px]">{v}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminShell>
  );
}
