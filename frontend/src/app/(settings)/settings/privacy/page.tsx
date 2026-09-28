"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Check, ChevronDown, Download, Eye, EyeOff,
  Flag, Globe, Hash, Heart, Loader2, Lock, MessageCircleOff,
  MessageSquare, Scissors, Search, Shield, ShieldAlert, ShieldOff,
  UserCheck, UserMinus, UserX, Users,
} from "lucide-react";
import { toast } from "sonner";
import { profileService, type PrivacySettings } from "@/services/profile.service";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────────────
   Option definitions - value + label + icon + description
───────────────────────────────────────────────────────────────── */
type AllPrivacy = "everyone" | "friends" | "followers" | "no_one" | "only_me";

interface Opt {
  value:  AllPrivacy;
  label:  string;
  desc:   string;
  Icon:   React.ElementType;
  color:  string;
  bg:     string;
}

const OPT_EVERYONE:  Opt = { value: "everyone",  label: "Everyone",  desc: "All Teezer users",             Icon: Globe,      color: "text-[#3b82f6]", bg: "bg-[#eff6ff]" };
const OPT_FRIENDS:   Opt = { value: "friends",   label: "Friends",   desc: "Mutual followers only",        Icon: UserCheck,  color: "text-[#10b981]", bg: "bg-[#ecfdf5]" };
const OPT_FOLLOWERS: Opt = { value: "followers", label: "Followers", desc: "People who follow you",        Icon: Users,      color: "text-[#8b5cf6]", bg: "bg-[#f5f3ff]" };
const OPT_NOONEE:    Opt = { value: "no_one",    label: "No one",    desc: "Only you can see/do this",     Icon: UserMinus,  color: "text-[#ef4444]", bg: "bg-[#fef2f2]" };
const OPT_ONLY_ME:   Opt = { value: "only_me",   label: "Only me",   desc: "Completely private",           Icon: Lock,       color: "text-[#374151]", bg: "bg-[#f3f4f6]" };

const ALL4:    Opt[] = [OPT_EVERYONE, OPT_FRIENDS, OPT_FOLLOWERS, OPT_NOONEE];
const COMMENT: Opt[] = [OPT_EVERYONE, OPT_FOLLOWERS, OPT_NOONEE];
const DUET:    Opt[] = [OPT_EVERYONE, OPT_FRIENDS, OPT_NOONEE];
const MSG:     Opt[] = [OPT_EVERYONE, OPT_FRIENDS, OPT_FOLLOWERS, OPT_NOONEE];
const LIKED:   Opt[] = [OPT_EVERYONE, OPT_ONLY_ME];

/* ─────────────────────────────────────────────────────────────────
   NiceDropdown - portal-based, icon-rich, fully animated
───────────────────────────────────────────────────────────────── */
function NiceDropdown({
  value, options, onChange, disabled, saving,
}: {
  value:    string;
  options:  Opt[];
  onChange: (v: AllPrivacy) => void;
  disabled?: boolean;
  saving?:   boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0, width: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);
  const menuRef           = useRef<HTMLDivElement>(null);
  const selected          = options.find((o) => o.value === value);

  /* Position the portal menu under the trigger */
  const openMenu = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.right - 220, width: 220 });
    setOpen(true);
  };

  /* Close on outside click or ESC */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const SelIcon = selected?.Icon ?? Globe;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`group flex h-9 min-w-[126px] items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 ${
          open
            ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605] shadow-[0_0_0_3px_rgba(253,70,5,0.10)]"
            : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fd4605] hover:bg-[#fff8f9] hover:text-[#fd4605]"
        }`}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#fd4605]" />
        ) : (
          <SelIcon className={`h-3.5 w-3.5 flex-shrink-0 ${open ? "text-[#fd4605]" : selected?.color ?? "text-[#6b7280]"}`} />
        )}
        <span className="flex-1 text-left">{selected?.label ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#fd4605]" : "text-[#9ca3af]"}`} />
      </button>

      {/* Portal dropdown */}
      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="rounded-2xl border border-[#f0f1f5] bg-white p-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-[#fff3ec]"
                    : "hover:bg-[#f8f9fb]"
                }`}
              >
                {/* Option icon */}
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                  active ? "bg-[#fde7dc]" : opt.bg
                }`}>
                  <opt.Icon className={`h-4 w-4 ${active ? "text-[#fd4605]" : opt.color}`} />
                </div>

                {/* Label + desc */}
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold leading-tight ${active ? "text-[#fd4605]" : "text-[#111827]"}`}>
                    {opt.label}
                  </p>
                  <p className={`text-[11px] leading-tight ${active ? "text-[#f87185]" : "text-[#9ca3af]"}`}>
                    {opt.desc}
                  </p>
                </div>

                {/* Check */}
                {active && (
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#fd4605]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Toggle
───────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        on ? "bg-[#fd4605]" : "bg-[#d1d5db]"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Row components
───────────────────────────────────────────────────────────────── */
function SettingRow({
  icon: Icon, iconBg, iconColor, title, desc, right, last = false, saving = false,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc?: string; right: React.ReactNode;
  last?: boolean; saving?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 px-5 py-4 ${!last ? "border-b border-[#f3f4f6]" : ""}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
        <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] leading-tight">{title}</p>
        {desc && !saving && (
          <p className="mt-0.5 text-[11.5px] leading-tight text-[#9ca3af]">{desc}</p>
        )}
        {saving && (
          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] leading-tight text-[#f59e0b]">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  );
}

function NavRow({
  icon: Icon, iconBg, iconColor, title, desc, href, last = false,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc: string; href?: string; last?: boolean;
}) {
  const inner = (
    <div className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-[#f9fafb] ${!last ? "border-b border-[#f3f4f6]" : ""}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
        <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827]">{title}</p>
        <p className="text-[11.5px] text-[#9ca3af]">{desc}</p>
      </div>
      <ChevronDown className="h-4 w-4 flex-shrink-0 -rotate-90 text-[#d1d5db]" />
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <>{inner}</>;
}

/* ─────────────────────────────────────────────────────────────────
   Card wrapper
───────────────────────────────────────────────────────────────── */
function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-[#f3f4f6] px-5 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fd4605] text-[11px] font-black text-white">
          {n}
        </span>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#374151]">{title}</p>
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────────────── */
export default function PrivacyPage() {
  const { user, setUser } = useAuthStore();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});

  useEffect(() => {
    profileService.getPrivacy()
      .then(setSettings)
      .catch(() => {
        setSettings({
          is_private:             user?.is_private             ?? false,
          active_status:          (user as any)?.active_status          ?? true,
          profile_discovery:      (user as any)?.profile_discovery      ?? true,
          show_to_search_engines: (user as any)?.show_to_search_engines ?? false,
          comment_filter:         (user as any)?.comment_filter         ?? true,
          message_privacy:        (user?.message_privacy as any)        ?? "everyone",
          who_can_comment:        (user as any)?.who_can_comment        ?? "everyone",
          who_can_tag:            (user as any)?.who_can_tag            ?? "friends",
          who_can_duet:           (user as any)?.who_can_duet           ?? "friends",
          who_can_download:       (user as any)?.who_can_download       ?? "everyone",
          who_can_see_liked:      (user as any)?.who_can_see_liked      ?? "only_me",
        });
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (patch: Partial<PrivacySettings>) => {
    const key = Object.keys(patch)[0];
    setSaving((s) => ({ ...s, [key]: true }));
    setSettings((prev) => prev ? { ...prev, ...patch } : prev);
    setUser(patch as any);
    try {
      const updated = await profileService.updatePrivacy(patch);
      setSettings(updated);
      setUser(updated as any);
      toast.success("Saved.", { duration: 1800 });
    } catch {
      toast.error("Could not save. Please try again.");
      profileService.getPrivacy().then(setSettings).catch(() => {});
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }, [setUser]);

  if (loading || !settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#fd4605]" />
      </div>
    );
  }

  const is  = (key: string) => !!saving[key];
  const any = Object.values(saving).some(Boolean);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-[#111827]">Privacy & Safety</h1>
        <p className="mt-0.5 text-[13px] text-[#6b7280]">Control who can see and interact with you</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* ── 1 Account Privacy ── */}
        <Card n={1} title="Account Privacy">
          <SettingRow icon={UserX}   iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Private Account" desc="Only approved followers can see your content"
            saving={is("is_private")}
            right={<Toggle on={settings.is_private} disabled={any} onChange={(v) => save({ is_private: v })} />} />
          <SettingRow icon={Eye}     iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Active Status" desc="Show when you were last active"
            saving={is("active_status")}
            right={<Toggle on={settings.active_status} disabled={any} onChange={(v) => save({ active_status: v })} />} />
          <SettingRow icon={Search}  iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Profile Discovery" desc="Allow others to find your account"
            saving={is("profile_discovery")}
            right={<Toggle on={settings.profile_discovery} disabled={any} onChange={(v) => save({ profile_discovery: v })} />} />
          <SettingRow icon={Globe}   iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
            title="Show Profile to Search Engines" desc="Let search engines index your profile"
            saving={is("show_to_search_engines")} last
            right={<Toggle on={settings.show_to_search_engines} disabled={any} onChange={(v) => save({ show_to_search_engines: v })} />} />
        </Card>

        {/* ── 2 Interaction Privacy ── */}
        <Card n={2} title="Interaction Privacy">
          <SettingRow icon={MessageSquare}   iconBg="bg-[#eff6ff]"  iconColor="text-[#3b82f6]"
            title="Who Can Message You"
            desc={is("message_privacy") ? undefined : "Saved to your account"}
            saving={is("message_privacy")}
            right={<NiceDropdown value={settings.message_privacy}  options={MSG}     disabled={any} saving={is("message_privacy")}  onChange={(v) => save({ message_privacy: v as any })} />} />
          <SettingRow icon={MessageCircleOff} iconBg="bg-[#f0fdf4]"  iconColor="text-[#16a34a]"
            title="Who Can Comment"
            saving={is("who_can_comment")}
            right={<NiceDropdown value={settings.who_can_comment}   options={COMMENT} disabled={any} saving={is("who_can_comment")}   onChange={(v) => save({ who_can_comment: v as any })} />} />
          <SettingRow icon={Hash}             iconBg="bg-[#fff7ed]"  iconColor="text-[#f97316]"
            title="Who Can Tag / Mention You"
            saving={is("who_can_tag")}
            right={<NiceDropdown value={settings.who_can_tag}        options={ALL4}    disabled={any} saving={is("who_can_tag")}        onChange={(v) => save({ who_can_tag: v as any })} />} />
          <SettingRow icon={Scissors}         iconBg="bg-[#f5f3ff]"  iconColor="text-[#7c3aed]"
            title="Who Can Duet / Stitch"
            saving={is("who_can_duet")}
            right={<NiceDropdown value={settings.who_can_duet}       options={DUET}    disabled={any} saving={is("who_can_duet")}       onChange={(v) => save({ who_can_duet: v as any })} />} />
          <SettingRow icon={Download}         iconBg="bg-[#fefce8]"  iconColor="text-[#ca8a04]"
            title="Who Can Download Videos"
            saving={is("who_can_download")}
            right={<NiceDropdown value={settings.who_can_download}   options={DUET}    disabled={any} saving={is("who_can_download")}   onChange={(v) => save({ who_can_download: v as any })} />} />
          <SettingRow icon={Heart}            iconBg="bg-[#fff3ec]"  iconColor="text-[#fd4605]"
            title="Who Can See Liked Videos"
            desc={settings.who_can_see_liked === "only_me" ? "Your likes are hidden from others" : undefined}
            saving={is("who_can_see_liked")} last
            right={<NiceDropdown value={settings.who_can_see_liked}  options={LIKED}   disabled={any} saving={is("who_can_see_liked")}  onChange={(v) => save({ who_can_see_liked: v as any })} />} />
        </Card>

        {/* ── 3 Safety Tools ── */}
        <Card n={3} title="Safety Tools">
          <NavRow icon={ShieldOff}   iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
            title="Blocked Accounts"  desc="Manage accounts you have blocked"  href="/settings/blocked" />
          <NavRow icon={EyeOff}      iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Muted Accounts"   desc="Manage accounts you have muted"    href="/settings/muted" />
          <NavRow icon={ShieldAlert} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
            title="Hidden Words"     desc="Filter specific words from your experience" href="/settings/hidden-words" />
          <SettingRow icon={MessageCircleOff} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Comment Filter" desc="Auto-filter offensive and spam comments"
            saving={is("comment_filter")} last
            right={<Toggle on={settings.comment_filter} disabled={any} onChange={(v) => save({ comment_filter: v })} />} />
        </Card>

        {/* ── 4 Reports ── */}
        <Card n={4} title="Reports">
          <NavRow icon={Flag}          iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
            title="Report History"    desc="View the reports you have submitted"         href="/settings/reports" />
          <NavRow icon={Shield}        iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Safety Center"     desc="Resources and tools to stay safe on Teezer" />
          <NavRow icon={AlertTriangle} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
            title="Appeal Restriction" desc="Appeal a content restriction or account action" last />
        </Card>
      </div>

      {/* Floating save badge */}
      {any && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[9998] flex items-center gap-2 rounded-xl bg-[#111827]/90 px-4 py-2.5 text-[13px] font-semibold text-white shadow-2xl backdrop-blur-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
        </div>
      )}
    </div>
  );
}
