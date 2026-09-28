"use client";

import { useEffect, useState } from "react";
import {
  Bookmark, Music, Sparkles, Hash,
  FolderPlus, FolderOpen, FolderCog, Lock, Globe, Users,
  Loader2, Check,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, SettingsRow,
  Toggle, Btn, ChevronRow, ActionBar,
} from "@/features/settings/settings-ui";
import { userService } from "@/services/user.service";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

type Privacy = "private" | "followers" | "public";

const PRIVACY_OPTIONS: { value: Privacy; label: string; desc: string; Icon: React.ElementType }[] = [
  { value: "private",   label: "Only me",      desc: "No one else can see your saved list",      Icon: Lock   },
  { value: "followers", label: "Followers",     desc: "People who follow you can see your saves", Icon: Users  },
  { value: "public",    label: "Everyone",      desc: "Anyone on Teezer can browse your saves",  Icon: Globe  },
];

export default function SavedVideosPage() {
  const authUser = useAuthStore((s) => s.user);

  const [privacy,      setPrivacy]      = useState<Privacy>("private");
  const [savedCount,   setSavedCount]   = useState<number | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  // Load current saved count + privacy from API
  useEffect(() => {
    if (!authUser?.username) return;
    setLoading(true);
    userService.savedCount(authUser.username)
      .then(({ count, privacy: p }) => {
        setSavedCount(count);
        setPrivacy((p as Privacy) ?? "private");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authUser?.username]);

  async function handleSave() {
    setSaving(true);
    try {
      await userService.updateSavedPrivacy(privacy);
      setSaved(true);
      toast.success("Privacy setting saved.");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save privacy setting.");
    } finally {
      setSaving(false);
    }
  }

  const countBadge = (n: number | null) => (
    <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold text-[#16a34a]">
      {loading ? "…" : (n ?? 0)}
    </span>
  );

  return (
    <div className="p-6">
      <PageHeader title="Saved Videos" subtitle="Manage your bookmarked content and privacy" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Card 1 - Saved Content */}
        <SettingsCard>
          <CardHeader n={1} title="Saved Content" />
          <ChevronRow
            icon={Bookmark} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Saved Videos"   desc="All videos you have bookmarked"
            badge={countBadge(savedCount)}
          />
          <ChevronRow
            icon={Music} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Saved Sounds"   desc="Audio clips saved from videos"
            badge={<span className="rounded-full bg-[#f3e8ff] px-2 py-0.5 text-[11px] font-bold text-[#7c3aed]">-</span>}
          />
          <ChevronRow
            icon={Sparkles} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
            title="Saved Effects"  desc="AR effects and filters you have saved"
            badge={<span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-[11px] font-bold text-[#ca8a04]">-</span>}
          />
          <ChevronRow
            icon={Hash} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Saved Hashtags" desc="Hashtag pages you follow or bookmark"
            badge={<span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-bold text-[#2563eb]">-</span>}
            last
          />
        </SettingsCard>

        {/* Card 2 - Collections */}
        <SettingsCard>
          <CardHeader n={2} title="Collections" />
          <ChevronRow
            icon={FolderOpen} iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
            title="All Collections" desc="Browse all your video collections"
            badge={<span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[11px] font-bold text-[#dc2626]">-</span>}
          />
          <SettingsRow
            icon={FolderPlus} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Create New Collection" desc="Organise your saved videos into a new folder"
            right={<Btn label="Create" variant="primary" />}
          />
          <ChevronRow
            icon={FolderCog} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
            title="Manage Collections" desc="Rename, reorder or delete collections" last
          />
        </SettingsCard>

        {/* Card 3 - Privacy */}
        <SettingsCard>
          <CardHeader n={3} title="Privacy" />

          {/* Privacy selector */}
          <div className="px-5 py-4 space-y-2">
            {PRIVACY_OPTIONS.map(({ value, label, desc, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPrivacy(value)}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left transition ${
                  privacy === value
                    ? "border-[#fe2c55] bg-[#fff0f4]"
                    : "border-[#f0f1f5] bg-white hover:bg-[#fafbfc]"
                }`}
              >
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] ${
                  privacy === value ? "bg-[#fce7ec]" : "bg-[#f8f9fb]"
                }`}>
                  <Icon className={`h-4 w-4 ${privacy === value ? "text-[#fe2c55]" : "text-[#6b7280]"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-bold ${privacy === value ? "text-[#fe2c55]" : "text-[#111827]"}`}>{label}</p>
                  <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                </div>
                {privacy === value && <Check className="h-4 w-4 flex-shrink-0 text-[#fe2c55]" />}
              </button>
            ))}
          </div>

          {/* Save button */}
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`flex w-full items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-bold transition disabled:opacity-60 ${
                saved
                  ? "bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]"
                  : "bg-[#fe2c55] text-white hover:bg-[#e0193f]"
              }`}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : saved ? (
                <><Check className="h-4 w-4" /> Saved!</>
              ) : (
                "Save Privacy Setting"
              )}
            </button>
          </div>

          <div className="border-t border-[#f0f1f5] px-5 py-4">
            <p className="text-[12px] text-[#9ca3af] leading-relaxed">
              {privacy === "private"
                ? "Only you can see what you have saved."
                : privacy === "followers"
                  ? "Followers can browse your saved videos list."
                  : "Anyone on Teezer can see your saved videos."}
            </p>
          </div>
        </SettingsCard>

      </div>

      <ActionBar />
    </div>
  );
}
