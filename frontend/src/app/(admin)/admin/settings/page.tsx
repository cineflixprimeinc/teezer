"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Save, RefreshCw, Settings, Eye, EyeOff, Shield, CheckCircle, XCircle, Loader2, Sparkles, Globe, ChevronRight } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";

type Setting = {
  id: number; key: string; value: string; type: string; group: string;
  description: string | null; is_public: boolean;
};

const GROUP_LABELS: Record<string, string> = {
  general:     "General",
  email:       "Email / OTP",
  upload:      "Upload & Video",
  storage:     "Storage / R2",
  cdn:         "CDN Settings",
  moderation:  "Content Moderation",
  suggestions: "Recommendation Settings",
  features:    "Feature Flags",
  seo:         "SEO",
  app:         "App Settings",
};

function SightengineSettingsSection() {
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Read current sightengine keys from DB via the moderation group
  const { data: allSettings } = useQuery({
    queryKey: ["admin-settings", "moderation"],
    queryFn:  () => adminService.settings("moderation"),
  });
  const settingsList: Setting[] = Array.isArray(allSettings) ? allSettings : [];

  const get = (key: string) => settingsList.find(s => s.key === key)?.value ?? "";

  const [enabled,    setEnabled]    = useState<string | null>(null);
  const [apiUser,    setApiUser]    = useState<string | null>(null);
  const [apiSecret,  setApiSecret]  = useState<string | null>(null);
  const [models,     setModels]     = useState<string | null>(null);
  const [blockThr,   setBlockThr]   = useState<string | null>(null);
  const [reviewThr,  setReviewThr]  = useState<string | null>(null);

  const val = (local: string | null, key: string) => local ?? get(key);

  const save = (key: string, value: string, type = "string") =>
    adminService.updateSetting(key, value, type, "moderation")
      .then(() => { toast.success(`Saved ${key}`); qc.invalidateQueries({ queryKey: ["admin-settings"] }); })
      .catch(() => toast.error(`Failed to save ${key}`));

  const testMutation = useMutation({
    mutationFn: adminService.sightengineTest,
    onSuccess: (res) => setTestResult({ ok: res.success, message: res.message }),
    onError:   ()    => setTestResult({ ok: false, message: "Request failed. Check credentials." }),
  });

  const enabledVal = val(enabled, "sightengine_enabled");

  return (
    <div className="mb-6 rounded-[12px] border border-[#e5e7eb] bg-white p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[#7c3aed]" />
        <h3 className="text-[14px] font-semibold text-[#111827]">Sightengine Content Moderation</h3>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#374151]">Enable Sightengine</p>
          <p className="text-[11px] text-[#9ca3af]">Scan uploads for nudity and explicit content before publishing</p>
        </div>
        <button
          onClick={() => {
            const nv = enabledVal === "1" ? "0" : "1";
            setEnabled(nv);
            save("sightengine_enabled", nv, "boolean");
          }}
          className={`relative h-5 w-9 rounded-full transition-colors ${enabledVal === "1" ? "bg-[#7c3aed]" : "bg-[#d1d5db]"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabledVal === "1" ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* API User */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#374151]">API User</p>
          <p className="text-[11px] text-[#9ca3af]">Your Sightengine API user ID</p>
        </div>
        <input
          value={val(apiUser, "sightengine_api_user")}
          onChange={e => setApiUser(e.target.value)}
          onBlur={e => { if (e.target.value !== get("sightengine_api_user")) save("sightengine_api_user", e.target.value); }}
          placeholder="e.g. 29188807"
          className="h-8 w-48 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#7c3aed]"
        />
      </div>

      {/* API Secret */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#374151]">API Secret</p>
          <p className="text-[11px] text-[#9ca3af]">Never shared with the browser - stored server-side only</p>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={val(apiSecret, "sightengine_api_secret")}
            onChange={e => setApiSecret(e.target.value)}
            onBlur={e => { if (e.target.value !== get("sightengine_api_secret")) save("sightengine_api_secret", e.target.value); }}
            type={showSecret ? "text" : "password"}
            placeholder="API secret"
            className="h-8 w-48 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#7c3aed]"
          />
          <button onClick={() => setShowSecret(v => !v)} className="text-[#9ca3af] hover:text-[#374151]">
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Models */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#374151]">Models</p>
          <p className="text-[11px] text-[#9ca3af]">Comma-separated Sightengine models (e.g. nudity-2.1)</p>
        </div>
        <input
          value={val(models, "sightengine_models")}
          onChange={e => setModels(e.target.value)}
          onBlur={e => { if (e.target.value !== get("sightengine_models")) save("sightengine_models", e.target.value); }}
          placeholder="nudity-2.1"
          className="h-8 w-48 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#7c3aed]"
        />
      </div>

      {/* Thresholds */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[13px] font-medium text-[#374151]">Block threshold</p>
            <p className="text-[11px] text-[#9ca3af]">Score ≥ this → blocked (0–1)</p>
          </div>
          <input
            value={val(blockThr, "sightengine_block_threshold")}
            onChange={e => setBlockThr(e.target.value)}
            onBlur={e => { if (e.target.value !== get("sightengine_block_threshold")) save("sightengine_block_threshold", e.target.value, "float"); }}
            placeholder="0.80"
            className="h-8 w-20 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#7c3aed]"
          />
        </div>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[13px] font-medium text-[#374151]">Review threshold</p>
            <p className="text-[11px] text-[#9ca3af]">Score ≥ this → needs review</p>
          </div>
          <input
            value={val(reviewThr, "sightengine_review_threshold")}
            onChange={e => setReviewThr(e.target.value)}
            onBlur={e => { if (e.target.value !== get("sightengine_review_threshold")) save("sightengine_review_threshold", e.target.value, "float"); }}
            placeholder="0.50"
            className="h-8 w-20 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#7c3aed]"
          />
        </div>
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled={testMutation.isPending}
          onClick={() => { setTestResult(null); testMutation.mutate(); }}
        >
          {testMutation.isPending
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</>
            : <><Shield className="h-3.5 w-3.5" /> Test Connection</>
          }
        </Button>
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[12px] font-medium ${testResult.ok ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
            {testResult.ok
              ? <CheckCircle className="h-3.5 w-3.5" />
              : <XCircle className="h-3.5 w-3.5" />
            }
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationSettingsSection() {
  const qc = useQueryClient();

  const { data: allSettings } = useQuery({
    queryKey: ["admin-settings", "suggestions"],
    queryFn:  () => adminService.settings("suggestions"),
  });
  const settingsList: Setting[] = Array.isArray(allSettings) ? allSettings : [];
  const get = (key: string, fallback: string) => settingsList.find(s => s.key === key)?.value ?? fallback;

  const save = (key: string, value: string, type = "string") =>
    adminService.updateSetting(key, value, type, "suggestions")
      .then(() => { toast.success(`Saved ${key}`); qc.invalidateQueries({ queryKey: ["admin-settings"] }); })
      .catch(() => toast.error(`Failed to save ${key}`));

  type WeightRow = { key: string; label: string; hint: string; default: string };
  const WEIGHTS: WeightRow[] = [
    { key: "suggestion_mutual_weight",   label: "Mutual follows weight",        hint: "How much mutual connections influence score",    default: "0.22" },
    { key: "suggestion_location_weight", label: "Location weight",              hint: "Same country/city boost",                        default: "0.12" },
    { key: "suggestion_interest_weight", label: "Interest similarity weight",   hint: "Jaccard similarity on interests/categories",     default: "0.16" },
    { key: "suggestion_watch_weight",    label: "Watch behavior weight",        hint: "Based on video categories user watches",         default: "0.14" },
    { key: "suggestion_like_weight",     label: "Liked video similarity weight",hint: "Based on categories of videos user liked",       default: "0.10" },
    { key: "suggestion_creator_weight",  label: "Creator similarity weight",    hint: "Based on creators user already interacts with",  default: "0.10" },
    { key: "suggestion_quality_weight",  label: "Creator quality weight",       hint: "Engagement rate, completeness, follower count",  default: "0.08" },
    { key: "suggestion_activity_weight", label: "Activity score weight",        hint: "Recency of last user activity",                  default: "0.04" },
    { key: "suggestion_new_boost",       label: "New creator boost",            hint: "Small boost for new accounts with good trust",   default: "0.02" },
    { key: "suggestion_verified_boost",  label: "Verified/creator boost",       hint: "Small boost for verified or creator accounts",   default: "0.02" },
  ];

  type BoolRow = { key: string; label: string; hint: string };
  const BOOLS: BoolRow[] = [
    { key: "suggestion_enabled",          label: "Enable suggestions",                   hint: "Master switch - turns off the entire algorithm" },
    { key: "suggestion_enable_location",  label: "Location-based suggestions",           hint: "Include same-country/city users as candidates" },
    { key: "suggestion_enable_interests", label: "Interest-based suggestions",           hint: "Include users with matching interests/categories" },
    { key: "suggestion_enable_watch",     label: "Watch-history-based suggestions",      hint: "Use video_events and user_video_preferences for scoring" },
  ];

  return (
    <div className="mb-6 rounded-[12px] border border-[#e5e7eb] bg-white p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-[#fe2c55]" />
        <h3 className="text-[14px] font-semibold text-[#111827]">Profile Suggestion Algorithm</h3>
      </div>
      <p className="text-[12px] text-[#6b7280]">
        Controls the hybrid ranking system for "Suggested for You" on homepage, profile, friends, and discovery pages.
        All weights must sum to approximately 1.0 for accurate scoring.
        Changes take effect immediately (cache expires within 15 minutes).
      </p>

      {/* Toggle flags */}
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Feature Toggles</p>
        {BOOLS.map(({ key, label, hint }) => {
          const current = get(key, "1");
          return (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-[#374151]">{label}</p>
                <p className="text-[11px] text-[#9ca3af]">{hint}</p>
              </div>
              <button
                onClick={() => save(key, current === "1" ? "0" : "1", "boolean")}
                className={`relative h-5 w-9 rounded-full transition-colors ${current === "1" ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${current === "1" ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Weight sliders */}
      <div className="space-y-3 pt-2 border-t border-[#f3f4f6]">
        <p className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Scoring Weights</p>
        {WEIGHTS.map(({ key, label, hint, default: def }) => {
          const current = get(key, def);
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#374151]">{label}</p>
                <p className="text-[11px] text-[#9ca3af]">{hint}</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue={current}
                onBlur={(e) => {
                  if (e.target.value !== current) save(key, e.target.value, "string");
                }}
                className="h-8 w-20 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#fe2c55] text-right"
              />
            </div>
          );
        })}
      </div>

      {/* Other settings */}
      <div className="space-y-3 pt-2 border-t border-[#f3f4f6]">
        <p className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Other Settings</p>
        {[
          { key: "suggestion_max_per_request", label: "Max suggestions per request", hint: "Max limit (1-50)", def: "10" },
          { key: "suggestion_cache_ttl",       label: "Cache TTL (seconds)",         hint: "How long to cache per user+context (default 900 = 15 min)", def: "900" },
          { key: "suggestion_min_trust_score", label: "Minimum trust score",         hint: "Users below this score are excluded (0.0–1.0)", def: "0.30" },
        ].map(({ key, label, hint, def }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#374151]">{label}</p>
              <p className="text-[11px] text-[#9ca3af]">{hint}</p>
            </div>
            <input
              type="text"
              defaultValue={get(key, def)}
              onBlur={(e) => { if (e.target.value !== get(key, def)) save(key, e.target.value); }}
              className="h-8 w-24 rounded-[8px] border border-[#e8eaed] px-2.5 text-[12px] outline-none focus:border-[#fe2c55] text-right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingRow({ setting }: { setting: Setting }) {
  const qc  = useQueryClient();
  const [val, setVal]       = useState(setting.value ?? "");
  const [editing, setEditing] = useState(false);
  const isDirty = val !== (setting.value ?? "");

  const save = useMutation({
    mutationFn: () => adminService.updateSetting(setting.key, val, setting.type, setting.group),
    onSuccess:  () => { toast.success(`Saved: ${setting.key}`); setEditing(false); qc.invalidateQueries({ queryKey: ["admin-settings"] }); },
    onError:    () => toast.error("Failed to save"),
  });

  const isBoolean = setting.type === "boolean";

  const on = val === "1";

  /* "feature_audio_rooms" -> "Feature audio rooms". The raw key stays visible
     as a chip beside it: the label is what an admin reads, the key is what
     they search the codebase for, and both matter. */
  const label = setting.key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="group flex items-center justify-between gap-4 rounded-[12px] px-3 py-3 transition-colors hover:bg-[#fafbfc]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-[#111827]">{label}</p>
          <code className="rounded-[5px] bg-[#f3f4f6] px-1.5 py-0.5 font-mono text-[10.5px] text-[#6b7280]">
            {setting.key}
          </code>
        </div>
        {setting.description && (
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#9ca3af]">{setting.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {isBoolean ? (
          <>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${on ? "text-[#fe2c55]" : "text-[#9ca3af]"}`}>
              {on ? "On" : "Off"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={label}
              onClick={() => {
                const newVal = on ? "0" : "1";
                setVal(newVal);
                adminService.updateSetting(setting.key, newVal, setting.type, setting.group)
                  .then(() => { toast.success(`${label} turned ${newVal === "1" ? "on" : "off"}`); qc.invalidateQueries({ queryKey: ["admin-settings"] }); })
                  // Put the switch back where it was: an optimistic flip that
                  // the server refused must not keep claiming it succeeded.
                  .catch(() => { setVal(on ? "1" : "0"); toast.error("Couldn't save that change"); });
              }}
              className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fe2c55]/30 ${on ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}
            >
              <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${on ? "left-[23px]" : "left-[3px]"}`} />
            </button>
          </>
        ) : editing ? (
          <>
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isDirty) save.mutate();
                if (e.key === "Escape") { setVal(setting.value ?? ""); setEditing(false); }
              }}
              className="h-9 w-56 rounded-[10px] border border-[#e5e7eb] px-3 text-[12.5px] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"
              autoFocus
            />
            <Button size="sm" variant="primary" disabled={save.isPending || !isDirty} onClick={() => save.mutate()}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setVal(setting.value ?? ""); setEditing(false); }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span
              className="max-w-[220px] truncate rounded-[8px] bg-[#f9fafb] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#374151]"
              title={val || undefined}
            >
              {val || "—"}
            </span>
            {/* Reads as a control at rest rather than only on hover - an Edit
                you have to discover is one most admins never find. */}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[8px] border border-[#e5e7eb] px-2.5 py-1.5 text-[12px] font-semibold text-[#6b7280] transition-colors hover:border-[#fe2c55]/40 hover:bg-[#fff0f4] hover:text-[#fe2c55]"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeGroup, setActiveGroup] = useState<string>("general");

  const { data: groups } = useQuery({
    queryKey: ["admin-settings-groups"],
    queryFn:  adminService.settingsGroups,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-settings", activeGroup],
    queryFn:  () => adminService.settings(activeGroup === "all" ? undefined : activeGroup),
  });

  const settings: Setting[] = Array.isArray(data) ? data : [];
  const groupKeys = groups ? Object.keys(groups).filter((g) => g !== "features") : [];

  return (
    <AdminShell title="Platform Settings">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fff0f4] text-[#fe2c55]">
              <Settings className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#111827]">Platform Settings</h2>
              <p className="text-[13px] text-[#6b7280]">Configure all platform behaviour from one place.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Website & SEO gets a card of its own: it is the settings group most
            often reached, and the only one with a dedicated screen. */}
        <Link href="/admin/settings/website"
          className="flex items-center gap-3.5 rounded-[12px] border border-[#e5e7eb] bg-white p-4 transition-colors hover:border-[#fe2c55]/40 hover:bg-[#fff8fa]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#fff0f4] text-[#fe2c55]">
            <Globe className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-[#111827]">Website &amp; SEO</span>
            <span className="block text-[12.5px] text-[#6b7280]">
              Site name, description, canonical URL, social handles and search-engine indexing.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
        </Link>

        <div className="flex gap-5">

          {/* Sidebar nav */}
          <div className="w-48 shrink-0">
            <Card className="p-2">
              {["all", ...groupKeys].map((g) => {
                const count = groups ? (groups as Record<string, number>)[g] : undefined;
                const label = g === "all" ? "All Settings" : (GROUP_LABELS[g] ?? g);

                /* The `site` group has a purpose-built screen now - site name,
                   tagline, description, canonical URL, social handles and the
                   indexing switch, with a live search/share preview. Sending
                   the category there beats listing the same eight values as
                   raw key/value rows with an Edit link on each. */
                if (g === "site") {
                  return (
                    <Link key={g} href="/admin/settings/website"
                      className="group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-[#374151] transition-colors hover:bg-[#fff0f4] hover:text-[#fe2c55]">
                      <Globe className="h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover:text-[#fe2c55]" />
                      <span className="truncate">Website &amp; SEO</span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[#d1d5db] transition-colors group-hover:text-[#fe2c55]" />
                    </Link>
                  );
                }

                const active = activeGroup === g;
                return (
                  <button key={g}
                    onClick={() => setActiveGroup(g)}
                    className={`relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors
                      ${active ? "bg-[#fff0f4] text-[#fe2c55]" : "text-[#374151] hover:bg-[#f7f8fa]"}`}>
                    {/* A rail on the active row, so the selection reads at a
                        glance instead of only as a faint tint. */}
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#fe2c55]" />}
                    <Settings className={`h-4 w-4 shrink-0 ${active ? "text-[#fe2c55]" : "text-[#9ca3af]"}`} />
                    <span className="truncate">{label}</span>
                    {count !== undefined && g !== "all" && (
                      <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums
                        ${active ? "bg-[#fe2c55]/12 text-[#fe2c55]" : "bg-[#f3f4f6] text-[#9ca3af]"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </Card>
          </div>

          {/* Settings list */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>{activeGroup === "all" ? "All Settings" : (GROUP_LABELS[activeGroup] ?? activeGroup)}</CardTitle>
                <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#6b7280]">
                  {settings.length} settings
                </span>
              </CardHeader>
              <CardBody className="p-0 px-3 pb-2">
                {activeGroup === "moderation"  && <SightengineSettingsSection />}
                {activeGroup === "suggestions" && <RecommendationSettingsSection />}
                {isLoading ? (
                  <div className="grid gap-2 py-3">
                    {/* Skeletons rather than a word: the list is long, and a
                        centred "Loading" makes the page look empty. */}
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between gap-4 px-3 py-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-3 w-40 animate-pulse rounded bg-[#f1f2f4]" />
                          <div className="h-2.5 w-56 animate-pulse rounded bg-[#f6f7f8]" />
                        </div>
                        <div className="h-[26px] w-[46px] shrink-0 animate-pulse rounded-full bg-[#f1f2f4]" />
                      </div>
                    ))}
                  </div>
                ) : settings.length === 0 && !["moderation","suggestions"].includes(activeGroup) ? (
                  <div className="py-12 text-center">
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f6] text-[#9ca3af]">
                      <Settings className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-[13px] font-semibold text-[#374151]">Nothing in this group</p>
                    <p className="mt-1 text-[12px] text-[#9ca3af]">Settings appear here once they exist on the server.</p>
                  </div>
                ) : (
                  settings.map((s) => <SettingRow key={s.id} setting={s} />)
                )}
              </CardBody>
            </Card>
          </div>

        </div>
      </div>
    </AdminShell>
  );
}
