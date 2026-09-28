"use client";

import { useState } from "react";
import {
  Activity, BookOpen, Briefcase, Calendar, Camera, Car, ChefHat, Clapperboard,
  Dumbbell, Flame, Gamepad2, Globe, GraduationCap, Hammer, HeartHandshake,
  HeartPulse, HelpCircle, Home, Leaf, Link2,
  Lock, MessageCircle, Monitor, Music, Music2, Newspaper, Palette, PawPrint,
  Plane, Plus, Repeat, Shirt, Smile, Sparkles, Sun, ThumbsUp, Trees, Trophy,
  User as UserIcon, Users, Utensils, Video, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MentionInput } from "@/components/mention/mention-input";
import { Dropdown, type DropdownOption } from "./dropdown";
import {
  CATEGORY_OPTIONS, DESCRIPTION_MAX, HASHTAGS_MAX, TITLE_MAX,
  type Audience, type MediaType, type UploadFormState, type Visibility,
} from "./types";

type Props = {
  value:      UploadFormState;
  onChange:   (patch: Partial<UploadFormState>) => void;
  disabled?:  boolean;
  mediaType?: MediaType | null;
};

const AUDIENCE_OPTS: DropdownOption<Audience>[] = [
  { value: "everyone", label: "Everyone", icon: Globe, hint: "Anyone can watch" },
  { value: "friends",  label: "Friends",  icon: Users, hint: "Only people you follow back" },
  { value: "only_me",  label: "Only me",  icon: Lock,  hint: "Hidden from everyone else" },
];

const VISIBILITY_OPTS: DropdownOption<Visibility>[] = [
  { value: "public",   label: "Public",   icon: Globe, hint: "Show on For You & profile" },
  { value: "private",  label: "Private",  icon: Lock,  hint: "Only you can see it" },
  { value: "unlisted", label: "Unlisted", icon: Link2, hint: "Anyone with the link" },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Comedy":               Smile,
  "Dance":                Zap,
  "Music":                Music,
  "Travel":               Plane,
  "Food":                 Utensils,
  "Fashion":              Shirt,
  "Beauty":               Sparkles,
  "Lifestyle":            Leaf,
  "Fitness":              Dumbbell,
  "Sports":               Trophy,
  "Gaming":               Gamepad2,
  "Education":            GraduationCap,
  "Technology":           Monitor,
  "Business":             Briefcase,
  "Motivation":           Flame,
  "News":                 Newspaper,
  "Entertainment":        Clapperboard,
  "Vlog":                 Video,
  "Art":                  Palette,
  "Photography":          Camera,
  "Animals & Pets":       PawPrint,
  "Nature":               Trees,
  "Cars & Bikes":         Car,
  "Health":               HeartPulse,
  "DIY & Crafts":         Hammer,
  "Family":               Home,
  "Relationships":        HeartHandshake,
  "Cooking":              ChefHat,
  "Reviews":              ThumbsUp,
  "Tutorials":            BookOpen,
  "Religious / Spiritual":Sun,
  "Other":                HelpCircle,
  // Legacy fallback for the old Dance icon (Music2 was previously used)
  "_dance_legacy":        Activity,
};
const CATEGORY_OPTS: DropdownOption<string>[] = CATEGORY_OPTIONS.map((c) => ({
  value: c, label: c, icon: CATEGORY_ICONS[c] ?? BookOpen,
}));

export function UploadForm({ value, onChange, disabled = false, mediaType }: Props) {
  const isImage = mediaType === "image";
  const [hashtagDraft, setHashtagDraft] = useState("");

  function addHashtag(raw: string) {
    const cleaned = raw.replace(/^#+/, "").trim().toLowerCase();
    if (!cleaned) return;
    if (value.hashtags.includes(cleaned)) return;
    if (value.hashtags.length >= HASHTAGS_MAX) return;
    onChange({ hashtags: [...value.hashtags, cleaned] });
    setHashtagDraft("");
  }
  function removeHashtag(tag: string) {
    onChange({ hashtags: value.hashtags.filter((t) => t !== tag) });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Title / Description - combined, optional */}
      <Field label="Title / Description">
        <MentionInput
          value={value.description}
          onChange={(v) => onChange({ description: v.slice(0, DESCRIPTION_MAX) })}
          disabled={disabled}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          placeholder="Write a caption or description for your post…"
          className="block h-[88px] w-full resize-none rounded-[10px] border border-[#eeeeee] bg-white p-3 pb-6 text-sm text-black outline-none transition focus:border-[#fe2c55]"
        />
        <Counter value={value.description.length} max={DESCRIPTION_MAX} bottom={6} />
      </Field>

      {/* Hashtags */}
      <div>
        <p className="mb-1 text-[12px] font-semibold text-black">Hashtags</p>
        <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[10px] border border-[#eeeeee] bg-white px-2 py-1.5">
          {value.hashtags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[11px] font-semibold text-[#1f2937]"
            >
              # {tag}
              <button
                type="button"
                onClick={() => removeHashtag(tag)}
                disabled={disabled}
                aria-label={`Remove #${tag}`}
                className="grid h-3.5 w-3.5 place-items-center rounded-full text-[#5f6675] hover:bg-[#e5e7eb] hover:text-black"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          <input
            type="text"
            value={hashtagDraft}
            onChange={(e) => setHashtagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addHashtag(hashtagDraft); }
              else if (e.key === "Backspace" && !hashtagDraft && value.hashtags.length) {
                removeHashtag(value.hashtags[value.hashtags.length - 1]);
              }
            }}
            disabled={disabled || value.hashtags.length >= HASHTAGS_MAX}
            placeholder={value.hashtags.length ? "" : "Add hashtag and press Enter"}
            className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-[11px] text-black outline-none placeholder:text-[#9aa1ad]"
          />

          {hashtagDraft && (
            <button
              type="button"
              onClick={() => addHashtag(hashtagDraft)}
              disabled={disabled}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[#cccccc] px-2 py-0.5 text-[11px] font-semibold text-[#5f6675] hover:border-[#fe2c55] hover:text-[#fe2c55]"
            >
              <Plus className="h-2.5 w-2.5" /> Add
            </button>
          )}
        </div>
      </div>

      {/* Audience / Category / Visibility */}
      <div className="grid grid-cols-3 gap-2">
        <Dropdown
          label="Audience"
          value={value.audience}
          options={AUDIENCE_OPTS}
          onChange={(v) => onChange({ audience: v })}
          disabled={disabled}
        />
        <Dropdown
          label="Category"
          value={value.category}
          options={CATEGORY_OPTS}
          onChange={(v) => onChange({ category: v })}
          disabled={disabled}
        />
        <Dropdown
          label="Visibility"
          value={value.visibility}
          options={VISIBILITY_OPTS}
          onChange={(v) => onChange({ visibility: v })}
          disabled={disabled}
        />
      </div>

      {/* Toggle rows */}
      <div className="flex flex-col gap-1.5">
        <ToggleRow
          icon={<Calendar className="h-3.5 w-3.5 text-[#5f6675]" />}
          title="Schedule post"
          subtitle="Post at a specific date and time"
          checked={value.scheduled}
          onChange={(v) => onChange({ scheduled: v })}
          disabled={disabled}
        />
        <ToggleRow
          icon={<MessageCircle className="h-3.5 w-3.5 text-[#5f6675]" />}
          title="Allow comments"
          subtitle="Let people comment on your video"
          checked={value.allowComments}
          onChange={(v) => onChange({ allowComments: v })}
          disabled={disabled}
        />
        {/* Video-only: duet, remix, sound */}
        {!isImage && (
          <>
            <ToggleRow
              icon={<UserIcon className="h-3.5 w-3.5 text-[#5f6675]" />}
              title="Allow duet"
              subtitle="Allow others to duet with your video"
              checked={value.allowDuet}
              onChange={(v) => onChange({ allowDuet: v })}
              disabled={disabled}
            />
            <ToggleRow
              icon={<Repeat className="h-3.5 w-3.5 text-[#5f6675]" />}
              title="Allow remix"
              subtitle="Allow others to create remixes"
              checked={value.allowRemix}
              onChange={(v) => onChange({ allowRemix: v })}
              disabled={disabled}
            />

            {/* Sound row */}
            <div className="flex items-center justify-between rounded-[10px] border border-[#eeeeee] bg-white px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#f8f9fb]">
                  <Music2 className="h-3.5 w-3.5 text-[#5f6675]" />
                </span>
                <div className="leading-tight">
                  <p className="text-[12px] font-semibold text-black">Sound</p>
                  <p className="text-[10px] text-[#5f6675]">{value.soundLabel}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                className="rounded-[8px] border border-[#eeeeee] bg-white px-2.5 py-1 text-[11px] font-semibold text-black hover:border-[#fe2c55] hover:text-[#fe2c55]"
              >
                Change
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── primitives ───────────────────────────────────────────────────────────── */

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-black">
        {label} {required && <span className="text-[#fe2c55]">*</span>}
      </label>
      <div className="relative">{children}</div>
    </div>
  );
}

function Counter({ value, max, bottom = 8 }: { value: number; max: number; bottom?: number }) {
  return (
    <span
      className="pointer-events-none absolute right-3 text-[10px] text-[#9aa1ad]"
      style={{ bottom }}
    >
      {value} / {max}
    </span>
  );
}

function ToggleRow({
  icon, title, subtitle, checked, onChange, disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[#eeeeee] bg-white px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#f8f9fb]">{icon}</span>
        <div className="leading-tight">
          <p className="text-[12px] font-semibold text-black">{title}</p>
          <p className="text-[10px] text-[#5f6675]">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition",
          checked ? "bg-[#fe2c55]" : "bg-[#e5e7eb]",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
    </div>
  );
}
