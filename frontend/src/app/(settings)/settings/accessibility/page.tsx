"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Accessibility, Activity, Captions, Check, ChevronDown,
  Contrast, Eye, Keyboard, Loader2, MousePointer2,
  Play, RotateCcw, Type, Volume2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  accessibilityService,
  type AccessibilityPrefs,
  DEFAULT_A11Y,
} from "@/services/accessibility.service";
import { applyA11y } from "@/features/a11y/apply";

/* ── Dropdown option types ─────────────────────────────────────── */
interface Opt { value: string; label: string; desc?: string }

const TEXT_SIZE_OPTS: Opt[] = [
  { value: "small",  label: "Small",       desc: "Compact - fits more content" },
  { value: "medium", label: "Medium",      desc: "Default comfortable reading size" },
  { value: "large",  label: "Large",       desc: "Easier to read at a distance" },
  { value: "xlarge", label: "Extra Large", desc: "Maximum readability" },
];
const POINTER_OPTS: Opt[] = [
  { value: "default", label: "Default",     desc: "Standard pointer size" },
  { value: "large",   label: "Large",       desc: "Easier to see on screen" },
  { value: "xlarge",  label: "Extra Large", desc: "Maximum pointer size" },
];
const CAPTION_OPTS: Opt[] = [
  { value: "default",       label: "Default",          desc: "Standard white text, dark background" },
  { value: "large_text",    label: "Large Text",        desc: "Bigger caption text" },
  { value: "high_contrast", label: "High Contrast",     desc: "Bold white on black" },
  { value: "yellow_black",  label: "Yellow on Black",   desc: "High-visibility captions" },
];

/* ── NiceDropdown ────────────────────────────────────────────────── */
function NiceDropdown({
  value, options, onChange, disabled,
}: {
  value: string; options: Opt[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0, width: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sel     = options.find((o) => o.value === value);

  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.right - Math.max(r.width, 200), width: Math.max(r.width, 200) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openMenu()}
        className={`flex h-9 min-w-[130px] items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 ${
          open
            ? "border-[#fe2c55] bg-[#fff0f4] text-[#fe2c55] shadow-[0_0_0_3px_rgba(254,44,85,0.10)]"
            : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fe2c55] hover:bg-[#fff8f9] hover:text-[#fe2c55]"
        }`}
      >
        <span className="flex-1 text-left">{sel?.label ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#fe2c55]" : "text-[#9ca3af]"}`} />
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white p-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.14)]"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${active ? "bg-[#fff0f4]" : "hover:bg-[#f8f9fb]"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold leading-tight ${active ? "text-[#fe2c55]" : "text-[#111827]"}`}>{opt.label}</p>
                  {opt.desc && <p className={`text-[11px] leading-tight ${active ? "text-[#f87185]" : "text-[#9ca3af]"}`}>{opt.desc}</p>}
                </div>
                {active && (
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#fe2c55]">
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

/* ── Toggle ─────────────────────────────────────────────────────── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[26px] w-12 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-40 ${on ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ── Row ─────────────────────────────────────────────────────────── */
function Row({
  icon: Icon, iconBg, iconColor, title, desc, right, last,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc: string; right: React.ReactNode; last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 px-5 py-3.5 ${!last ? "border-b border-[#f3f4f6]" : ""}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
        <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] leading-tight">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">{desc}</p>
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */
function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-[#f3f4f6] px-5 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fe2c55] text-[11px] font-black text-white">{n}</span>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#374151]">{title}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function AccessibilitySettingsPage() {
  const [prefs,    setPrefs]    = useState<AccessibilityPrefs>(DEFAULT_A11Y);
  const [original, setOriginal] = useState<AccessibilityPrefs>(DEFAULT_A11Y);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);

  useEffect(() => {
    accessibilityService.get()
      .then((d) => { setPrefs(d); setOriginal(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof AccessibilityPrefs>(key: K) {
    return (v: AccessibilityPrefs[K]) => setPrefs((p) => ({ ...p, [key]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await accessibilityService.save(prefs);
      setPrefs(updated); setOriginal(updated);
      applyA11y(updated); // take effect immediately, no reload needed
      toast.success("Accessibility settings saved.");
    } catch { toast.error("Could not save. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-[#fe2c55]" />
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-black text-[#111827]">Accessibility Settings</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">Adjust display, motion, captions, and accessibility options</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* ── 1 Display & Vision ── */}
          <Card n={1} title="Display & Vision">
            <Row icon={Type}     iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Larger Text"          desc="Increase text size across the app"
              right={<Toggle on={prefs.larger_text} onChange={set("larger_text")} />} />
            <Row icon={Type}     iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Text Size"            desc="Choose your preferred body text size"
              right={<NiceDropdown value={prefs.text_size} options={TEXT_SIZE_OPTS} onChange={(v) => set("text_size")(v as AccessibilityPrefs["text_size"])} />} />
            <Row icon={Contrast} iconBg="bg-[#f8fafc]" iconColor="text-[#475569]"
              title="High Contrast Mode"   desc="Boost contrast for easier reading"
              right={<Toggle on={prefs.high_contrast} onChange={set("high_contrast")} />} />
            <Row icon={Eye}      iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
              title="Reduce Transparency"  desc="Reduce blur and translucent effects"
              last right={<Toggle on={prefs.reduce_transparency} onChange={set("reduce_transparency")} />} />
          </Card>

          {/* ── 2 Motion & Interaction ── */}
          <Card n={2} title="Motion & Interaction">
            <Row icon={Activity}      iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
              title="Reduce Motion"     desc="Minimize animations and transitions"
              right={<Toggle on={prefs.reduce_motion} onChange={set("reduce_motion")} />} />
            <Row icon={Play}           iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Autoplay Videos"   desc="Automatically play videos as you scroll"
              right={<Toggle on={prefs.autoplay_videos} onChange={set("autoplay_videos")} />} />
            <Row icon={MousePointer2}  iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Pointer Size"      desc="Adjust the size of the on-screen pointer"
              last right={<NiceDropdown value={prefs.pointer_size} options={POINTER_OPTS} onChange={(v) => set("pointer_size")(v as AccessibilityPrefs["pointer_size"])} />} />
          </Card>

          {/* ── 3 Captions & Audio ── */}
          <Card n={3} title="Captions & Audio">
            <Row icon={Captions} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
              title="Captions Always On"  desc="Show captions on videos by default"
              right={<Toggle on={prefs.captions_always_on} onChange={set("captions_always_on")} />} />
            <Row icon={Captions} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Caption Style"       desc="Choose how captions appear on screen"
              right={<NiceDropdown value={prefs.caption_style} options={CAPTION_OPTS} onChange={(v) => set("caption_style")(v as AccessibilityPrefs["caption_style"])} />} />
            <Row icon={Volume2}  iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Audio Descriptions"  desc="Play narrated descriptions when available"
              last right={<Toggle on={prefs.audio_descriptions} onChange={set("audio_descriptions")} />} />
          </Card>

          {/* ── 4 Assistive Technology ── */}
          <Card n={4} title="Assistive Technology">
            <Row icon={Keyboard}     iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Keyboard Navigation"         desc="Use Tab and arrow keys to navigate"
              right={<Toggle on={prefs.keyboard_navigation} onChange={set("keyboard_navigation")} />} />
            <Row icon={Accessibility} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Screen Reader Friendly Labels" desc="Add extra labels for screen readers"
              last right={<Toggle on={prefs.screen_reader} onChange={set("screen_reader")} />} />
            <div className="border-t border-[#f3f4f6] px-5 py-4">
              <p className="text-[11.5px] leading-relaxed text-[#9ca3af]">
                Teezer follows <span className="font-semibold text-[#374151]">WCAG 2.1 AA</span> guidelines.
                If you need additional accessibility support, contact us through the{" "}
                <a href="/settings/help" className="font-semibold text-[#fe2c55] hover:underline">Help Center</a>.
              </p>
            </div>
          </Card>

        </div>
      </div>

      {/* ── Sticky action bar ── */}
      <div className="sticky bottom-0 z-10 border-t border-[#f0f1f5] bg-white/95 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setPrefs(original)} disabled={!isDirty || saving}
            className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> Reset Changes
          </button>
          <div className="flex items-center gap-3">
            {isDirty && !saving && (
              <p className="text-[12px] font-medium text-[#f59e0b]">You have unsaved changes</p>
            )}
            <button type="button" onClick={save} disabled={!isDirty || saving}
              className="flex items-center gap-2 rounded-[10px] bg-[#fe2c55] px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(254,44,85,0.25)] transition hover:bg-[#e0193f] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><Check className="h-4 w-4" strokeWidth={3} /> Save Changes</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
