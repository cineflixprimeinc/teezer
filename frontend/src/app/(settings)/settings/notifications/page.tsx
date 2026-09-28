"use client";

import { useEffect, useState } from "react";
import {
  AtSign, Bell, Check, Heart, Loader2, Lock, Mail,
  MessageSquare, Newspaper, Phone, Play, Radio,
  RefreshCw, RotateCcw, ShieldCheck, Star, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  notificationsService,
  type NotificationPrefs,
  DEFAULT_PREFS,
} from "@/services/notifications.service";

/* ── Toggle ─────────────────────────────────────────────────────── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[26px] w-12 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        on ? "bg-[#fe2c55]" : "bg-[#d1d5db]"
      }`}
    >
      <span
        className={`inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-md transition-transform duration-200 ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* ── Row ─────────────────────────────────────────────────────────── */
function NotifRow({
  icon: Icon, iconBg, iconColor, title, desc,
  on, onChange, last,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc: string;
  on: boolean; onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 px-5 py-3.5 ${!last ? "border-b border-[#f3f4f6]" : ""}`}>
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] ${iconBg}`}>
        <Icon className={`h-[16px] w-[16px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] leading-tight">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-tight text-[#9ca3af]">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────────────── */
function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-[#f3f4f6] bg-white px-5 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fe2c55] text-[11px] font-black text-white">
          {n}
        </span>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#374151]">{title}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function NotificationsPage() {
  const [prefs,    setPrefs]    = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [original, setOriginal] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);

  useEffect(() => {
    notificationsService.get()
      .then((data) => { setPrefs(data); setOriginal(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof NotificationPrefs) {
    return (v: boolean) => setPrefs((p) => ({ ...p, [key]: v }));
  }

  function reset() {
    setPrefs(original);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await notificationsService.save(prefs);
      setPrefs(updated);
      setOriginal(updated);
      toast.success("Notification preferences saved.");
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#fe2c55]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-black text-[#111827]">Notifications</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">Manage alerts and updates for your account</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ── 1 Push Notifications ── */}
          <Card n={1} title="Push Notifications">
            <NotifRow icon={Heart}         iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
              title="Likes"                desc="When someone likes your video"
              on={prefs.push_likes}     onChange={set("push_likes")} />
            <NotifRow icon={MessageSquare} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Comments"             desc="When someone comments on your video"
              on={prefs.push_comments}  onChange={set("push_comments")} />
            <NotifRow icon={UserPlus}      iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="New Followers"        desc="When someone follows your account"
              on={prefs.push_followers} onChange={set("push_followers")} />
            <NotifRow icon={AtSign}        iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
              title="Mentions & Tags"      desc="When someone mentions or tags you"
              on={prefs.push_mentions}  onChange={set("push_mentions")} />
            <NotifRow icon={Mail}          iconBg="bg-[#f0fdfa]" iconColor="text-[#0d9488]"
              title="Messages"             desc="When you receive a direct message"
              on={prefs.push_messages}  onChange={set("push_messages")} />
            <NotifRow icon={Radio}         iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Live Notifications"   desc="When creators you follow go live"
              on={prefs.push_live}      onChange={set("push_live")} />
            <NotifRow icon={Play}          iconBg="bg-[#fefce8]" iconColor="text-[#ca8a04]"
              title="Videos From Following" desc="New videos from accounts you follow"
              on={prefs.push_following} onChange={set("push_following")} />
            <NotifRow icon={Star}          iconBg="bg-[#f8fafc]" iconColor="text-[#64748b]"
              title="Creator Updates"      desc="Updates from verified creators"
              on={prefs.push_creator}   onChange={set("push_creator")} last />
          </Card>

          {/* ── 2 Email Notifications ── */}
          <Card n={2} title="Email Notifications">
            <NotifRow icon={ShieldCheck}   iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Security Alerts"      desc="Unusual login attempts and changes"
              on={prefs.email_security} onChange={set("email_security")} />
            <NotifRow icon={Bell}          iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
              title="Account Updates"      desc="Important changes to your account"
              on={prefs.email_account}  onChange={set("email_account")} />
            <NotifRow icon={Newspaper}     iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
              title="Promotional Emails"   desc="Special offers and feature announcements"
              on={prefs.email_promo}    onChange={set("email_promo")} />
            <NotifRow icon={Star}          iconBg="bg-[#f8fafc]" iconColor="text-[#64748b]"
              title="Creator News"         desc="News and tips for creators"
              on={prefs.email_news}     onChange={set("email_news")} last />
          </Card>

          {/* ── 3 SMS Notifications ── */}
          <Card n={3} title="SMS Notifications">
            <NotifRow icon={Phone}         iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Login OTP"            desc="One-time password for login verification"
              on={prefs.sms_otp}        onChange={set("sms_otp")} />
            <NotifRow icon={Lock}          iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
              title="Security Alerts"      desc="Critical security alerts via SMS"
              on={prefs.sms_security}   onChange={set("sms_security")} />
            <NotifRow icon={Bell}          iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
              title="Important Account Updates" desc="Critical account changes via SMS"
              on={prefs.sms_updates}    onChange={set("sms_updates")} last />
          </Card>

        </div>
      </div>

      {/* ── Bottom action bar (sticky) ── */}
      <div className="sticky bottom-0 z-10 border-t border-[#f0f1f5] bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty || saving}
            className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#d1d5db] hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Changes
          </button>

          <div className="flex items-center gap-3">
            {isDirty && !saving && (
              <p className="text-[12px] text-[#f59e0b] font-medium">You have unsaved changes</p>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!isDirty || saving}
              className="flex items-center gap-2 rounded-[10px] bg-[#fe2c55] px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(254,44,85,0.25)] transition hover:bg-[#e0193f] hover:shadow-[0_4px_18px_rgba(254,44,85,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><Check className="h-4 w-4" strokeWidth={3} /> Save Changes</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
