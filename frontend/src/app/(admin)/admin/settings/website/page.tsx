"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Globe, RotateCcw, Save, Info, Link2, Share2, Eye, Zap,
  Search, Image as ImageIcon, FileText, Trash2, RefreshCw, CheckCircle2,
  MonitorSmartphone, Clock,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { apiMessage } from "@/admin-panel/services/api";
import {
  platformSettingsService, type SettingField,
} from "@/admin-panel/services/platform-settings.service";

/**
 * Platform Settings → Website & SEO.
 *
 * Backed entirely by the EXISTING platform-settings endpoints
 * (AdminPlatformSettingsController + PlatformSettings). Nothing here keeps its
 * own copy of a setting: the server owns the schema, the defaults and the
 * labels, and this screen renders whatever that returns. Adding a field to the
 * registry makes it appear here without touching this file.
 */

/** The server describes each field; SettingField is that shape. */
type Field = SettingField;

type Draft = Record<string, string | boolean>;

const TABS = [
  { key: "general", label: "General", icon: Globe },
  { key: "seo", label: "SEO & Metadata", icon: Search },
  { key: "social", label: "Social Sharing", icon: Share2 },
  { key: "icons", label: "Favicon & Icons", icon: ImageIcon },
  { key: "indexing", label: "Indexing", icon: FileText },
  { key: "advanced", label: "Advanced", icon: Zap },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ── brand marks ──────────────────────────────────────────────────────────
 * Inlined rather than imported: lucide 1.x dropped its brand icons, so X,
 * Instagram, Facebook and YouTube have no export to pull. These are the
 * single-path glyphs the design shows, at the same 14px the other field icons
 * use.                                                                       */

function BrandX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function BrandInstagram({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BrandFacebook({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}

function BrandYouTube({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.58 7.19a2.5 2.5 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42A2.5 2.5 0 0 0 2.42 7.19 26 26 0 0 0 2 12a26 26 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.42-4.81M10 15.02V8.98L15.2 12z" />
    </svg>
  );
}

/* ── small presentational pieces ──────────────────────────────────────── */

function SectionCard({
  icon: Icon, tint, title, sub, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tint: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="p-5">
        <div className="flex items-start gap-3 mb-5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `${tint}1a`, color: tint }}
          >
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#111827]">{title}</h2>
            <p className="text-[12.5px] text-[#6B7280] mt-0.5">{sub}</p>
          </div>
        </div>
        <div className="grid gap-4">{children}</div>
      </CardBody>
    </Card>
  );
}

function TextField({
  label, value, onChange, help, required, placeholder, multiline, icon,
}: {
  label: string; value: string; onChange: (v: string) => void; help?: string;
  required?: boolean; placeholder?: string; multiline?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-[#374151]">
        {label}{required && <span className="text-[#EC1C5C]"> *</span>}
      </span>
      <div className="relative mt-1.5">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">{icon}</span>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-[13.5px] text-[#111827] outline-none transition focus:border-[#EC1C5C] focus:ring-2 focus:ring-[#EC1C5C]/15 resize-y"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-xl border border-[#E5E7EB] bg-white py-2.5 text-[13.5px] text-[#111827] outline-none transition focus:border-[#EC1C5C] focus:ring-2 focus:ring-[#EC1C5C]/15 ${icon ? "pl-9 pr-3.5" : "px-3.5"}`}
          />
        )}
      </div>
      {help && <span className="mt-1.5 block text-[11.5px] text-[#9CA3AF]">{help}</span>}
    </label>
  );
}

function Toggle({
  label, help, checked, onChange,
}: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="text-[12.5px] font-semibold text-[#374151]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-1.5 flex items-center gap-2.5"
      >
        <span
          className={`relative h-[26px] w-[46px] rounded-full transition-colors ${checked ? "bg-[#EC1C5C]" : "bg-[#D1D5DB]"}`}
        >
          <span
            className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[23px]" : "left-[3px]"}`}
          />
        </span>
        <span className="text-[13px] font-semibold text-[#111827]">
          {checked ? "Enabled" : "Disabled"}
        </span>
      </button>
      {help && <span className="mt-1.5 block text-[11.5px] text-[#9CA3AF]">{help}</span>}
    </div>
  );
}

/* ── live preview ─────────────────────────────────────────────────────── */

const PREVIEWS = [
  { key: "google", label: "Google Search", icon: Search },
  { key: "share", label: "Social Share", icon: Share2 },
  { key: "tab", label: "Browser Tab", icon: MonitorSmartphone },
] as const;

function LivePreview({ draft }: { draft: Draft }) {
  const [mode, setMode] = useState<(typeof PREVIEWS)[number]["key"]>("google");

  const name = String(draft.site_name || "Teezer");
  const tagline = String(draft.site_tagline || "");
  const description = String(draft.site_description || "");
  const url = String(draft.canonical_base_url || "https://teezer.live");
  const host = url.replace(/^https?:\/\//, "");
  // The same "Name - Tagline" shape the server builds for the home page title,
  // so this preview matches what actually ships rather than approximating it.
  const title = tagline ? `${name} - ${tagline}` : name;

  return (
    <Card>
      <CardBody className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#3B82F6]/10 text-[#3B82F6]">
            <Eye size={17} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-[#111827]">Live Preview</h2>
            <p className="text-[12.5px] text-[#6B7280] mt-0.5">
              This is how your site will appear in search results.
            </p>
          </div>
        </div>

        <div className="flex gap-1 rounded-xl bg-[#F9FAFB] p-1 mb-4">
          {PREVIEWS.map((p) => {
            const on = mode === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setMode(p.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition ${
                  on ? "bg-white text-[#EC1C5C] shadow-sm" : "text-[#6B7280] hover:text-[#374151]"
                }`}
              >
                <p.icon size={13} />
                <span className="hidden lg:inline">{p.label}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-[#E5E7EB] p-4">
          {mode === "google" && (
            <>
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#EC1C5C]/10 text-[#EC1C5C] text-[11px] font-black">R</span>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12.5px] text-[#111827]">{name}</div>
                  <div className="truncate text-[11.5px] text-[#6B7280]">{url}</div>
                </div>
              </div>
              <div className="mt-2 text-[16px] leading-snug text-[#1A0DAB]">{title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">
                {description || "No description set."}
              </p>
            </>
          )}

          {mode === "share" && (
            <>
              <div className="mb-3 grid h-28 place-items-center rounded-lg bg-gradient-to-br from-[#EC1C5C]/15 to-[#3B82F6]/15 text-[#9CA3AF]">
                <ImageIcon size={22} />
              </div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{host}</div>
              <div className="mt-1 text-[13.5px] font-bold text-[#111827]">{title}</div>
              <p className="mt-1 line-clamp-2 text-[12px] text-[#6B7280]">
                {description || "No description set."}
              </p>
            </>
          )}

          {mode === "tab" && (
            <div className="flex items-center gap-2 rounded-t-lg border border-[#E5E7EB] bg-[#F3F4F6] px-3 py-2">
              <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#EC1C5C] text-[8px] font-black text-white">R</span>
              <span className="truncate text-[12px] text-[#374151]">{title}</span>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function WebsiteSettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<Draft>({});

  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "site"],
    queryFn: () => platformSettingsService.site(),
  });

  // Seed the draft once the server answers. Keyed on `data` rather than run on
  // mount, because the form cannot be filled before the schema arrives.
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.map((f) => [f.key, f.value])));
  }, [data]);

  const byKey = useMemo(
    () => Object.fromEntries((data ?? []).map((f) => [f.key, f])) as Record<string, Field>,
    [data],
  );

  /** Only what actually changed - the endpoint takes `sometimes` on every field. */
  const changed = useMemo(() => {
    const out: Draft = {};
    for (const f of data ?? []) {
      if (draft[f.key] !== undefined && draft[f.key] !== f.value) out[f.key] = draft[f.key];
    }
    return out;
  }, [data, draft]);

  const dirty = Object.keys(changed).length > 0;

  const save = useMutation({
    mutationFn: () => platformSettingsService.updateSite(changed),
    onSuccess: () => {
      toast.success("Website settings saved.");
      void qc.invalidateQueries({ queryKey: ["platform-settings", "site"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reset = useMutation({
    mutationFn: () => platformSettingsService.resetSite(),
    onSuccess: () => {
      toast.success("Reset to defaults.");
      void qc.invalidateQueries({ queryKey: ["platform-settings", "site"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const clearCache = useMutation({
    mutationFn: () => platformSettingsService.clearSiteCache(),
    onSuccess: () => {
      toast.success("SEO cache cleared.");
      void qc.invalidateQueries({ queryKey: ["platform-settings", "site"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const set = (k: string) => (v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  const str = (k: string) => String(draft[k] ?? "");
  const bool = (k: string) => Boolean(draft[k] ?? false);
  const help = (k: string) => byKey[k]?.help;

  const canonical = str("canonical_base_url") || "https://teezer.live";

  return (
    <AdminShell title="Website & SEO">
      <div className="mx-auto max-w-[1240px] px-4 py-5">
        {/* ── header ── */}
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#EC1C5C] hover:underline"
        >
          <ArrowLeft size={14} /> Platform Settings
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#EC1C5C]/10 text-[#EC1C5C]">
              <Globe size={22} />
            </span>
            <p className="max-w-[560px] text-[13px] text-[#4B5563]">
              Manage your website&apos;s basic information, SEO settings, social sharing
              and indexing options.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => reset.mutate()}
              disabled={reset.isPending || isLoading}
            >
              <RotateCcw size={14} className="mr-1.5" />
              Reset to Default
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending || isLoading}
            >
              <Save size={14} className="mr-1.5" />
              {save.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* ── tabs ── */}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-[13px] font-semibold transition ${
                    on
                      ? "border-b-2 border-[#EC1C5C] text-[#EC1C5C]"
                      : "border-b-2 border-transparent text-[#6B7280] hover:text-[#374151]"
                  }`}
                >
                  <t.icon size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <p className="mt-6 text-[13px] text-[#6B7280]">Loading settings…</p>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px] items-start">
            {/* ── left column ── */}
            <div className="grid gap-5">
              {tab === "general" && (
                <>
                  <SectionCard
                    icon={Info}
                    tint="#3B82F6"
                    title="Basic Information"
                    sub="These details will be used across your platform and in search results."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="Site Name"
                        required
                        value={str("site_name")}
                        onChange={set("site_name")}
                        help={help("site_name")}
                      />
                      <TextField
                        label="Site Tagline"
                        value={str("site_tagline")}
                        onChange={set("site_tagline")}
                        help={help("site_tagline")}
                      />
                    </div>
                    <TextField
                      label="Site Description"
                      multiline
                      value={str("site_description")}
                      onChange={set("site_description")}
                      help="A brief description of your platform (recommended 50-160 characters)."
                    />
                  </SectionCard>

                  <SectionCard
                    icon={Link2}
                    tint="#8B5CF6"
                    title="Domain & Indexing"
                    sub="Configure your domain and search engine indexing settings."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="Canonical Base URL"
                        value={str("canonical_base_url")}
                        onChange={set("canonical_base_url")}
                        help={help("canonical_base_url")}
                      />
                      <Toggle
                        label="Allow Search Engine Indexing"
                        checked={bool("allow_indexing")}
                        onChange={set("allow_indexing")}
                        help="Allow search engines like Google to index your site."
                      />
                    </div>
                  </SectionCard>

                  <SectionCard
                    icon={Share2}
                    tint="#EC1C5C"
                    title="Social Media Handles"
                    sub="Your official social media accounts for meta tags and footer display."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="Twitter / X Handle"
                        value={str("twitter_handle")}
                        onChange={set("twitter_handle")}
                        placeholder="@teezer"
                        icon={<BrandX />}
                        help="Your official X (Twitter) handle."
                      />
                      <TextField
                        label="Instagram Handle"
                        value={str("instagram_handle")}
                        onChange={set("instagram_handle")}
                        placeholder="@teezer"
                        icon={<BrandInstagram />}
                        help="Your official Instagram handle."
                      />
                      <TextField
                        label="Facebook Page"
                        value={str("facebook_url")}
                        onChange={set("facebook_url")}
                        placeholder="https://facebook.com/teezer"
                        icon={<BrandFacebook />}
                        help="Your official Facebook page URL."
                      />
                      <TextField
                        label="YouTube Channel"
                        value={str("youtube_url")}
                        onChange={set("youtube_url")}
                        placeholder="https://youtube.com/@teezer"
                        icon={<BrandYouTube />}
                        help="Your official YouTube channel URL."
                      />
                    </div>
                  </SectionCard>
                </>
              )}

              {tab === "seo" && (
                <SectionCard
                  icon={Search}
                  tint="#10B981"
                  title="SEO & Metadata"
                  sub="What search engines read before anything else on the page."
                >
                  <TextField
                    label="Meta Description"
                    multiline
                    value={str("site_description")}
                    onChange={set("site_description")}
                    help={help("site_description")}
                  />
                  <TextField
                    label="Keywords"
                    value={str("seo_keywords")}
                    onChange={set("seo_keywords")}
                    help={help("seo_keywords")}
                  />
                </SectionCard>
              )}

              {tab === "social" && (
                <SectionCard
                  icon={Share2}
                  tint="#F59E0B"
                  title="Social Sharing"
                  sub="How a Teezer link looks when someone shares it."
                >
                  <TextField
                    label="Social Share Image"
                    value={str("og_image_url")}
                    onChange={set("og_image_url")}
                    help={help("og_image_url")}
                  />
                  <TextField
                    label="Twitter / X Handle"
                    value={str("twitter_handle")}
                    onChange={set("twitter_handle")}
                    help={help("twitter_handle")}
                  />
                </SectionCard>
              )}

              {tab === "icons" && (
                <SectionCard
                  icon={ImageIcon}
                  tint="#6366F1"
                  title="Favicon & Icons"
                  sub="The marks browsers and app stores show for Teezer."
                >
                  <TextField
                    label="Social / Open Graph Image"
                    value={str("og_image_url")}
                    onChange={set("og_image_url")}
                    help={help("og_image_url")}
                  />
                  <p className="rounded-xl bg-[#F9FAFB] p-3.5 text-[12.5px] leading-relaxed text-[#6B7280]">
                    The favicon and app icons ship with the web build
                    (<code className="text-[#374151]">frontend/public</code>) rather than
                    being configurable here. Replacing them is a deploy, not a setting —
                    listed on this tab so it is clear where they live, instead of showing
                    an upload box that would not change anything.
                  </p>
                </SectionCard>
              )}

              {tab === "indexing" && (
                <SectionCard
                  icon={FileText}
                  tint="#0EA5E9"
                  title="Indexing"
                  sub="Whether search engines may list Teezer at all."
                >
                  <Toggle
                    label="Allow Search Engine Indexing"
                    checked={bool("allow_indexing")}
                    onChange={set("allow_indexing")}
                    help={help("allow_indexing")}
                  />
                  <TextField
                    label="Canonical Base URL"
                    value={str("canonical_base_url")}
                    onChange={set("canonical_base_url")}
                    help={help("canonical_base_url")}
                  />
                </SectionCard>
              )}

              {tab === "advanced" && (
                <SectionCard
                  icon={Zap}
                  tint="#EF4444"
                  title="Advanced"
                  sub="Operations that affect the whole site at once."
                >
                  <div className="rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] p-4">
                    <p className="text-[13px] font-semibold text-[#991B1B]">Reset every setting</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#B91C1C]">
                      Restores the shipped defaults for every field on this page. The site
                      keeps serving throughout; only the values change.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => reset.mutate()}
                      disabled={reset.isPending}
                    >
                      <RotateCcw size={14} className="mr-1.5" />
                      {reset.isPending ? "Resetting…" : "Reset to Default"}
                    </Button>
                  </div>
                </SectionCard>
              )}
            </div>

            {/* ── right rail ── */}
            <div className="grid gap-5">
              <LivePreview draft={draft} />

              <Card>
                <CardBody className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F59E0B]/10 text-[#F59E0B]">
                      <Zap size={17} />
                    </span>
                    <div>
                      <h2 className="text-[15px] font-bold text-[#111827]">Quick Actions</h2>
                      <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                        Common tasks for your website settings.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {/* Opens the live file rather than claiming to regenerate one:
                        the site serves no sitemap.xml today, so a "Regenerate"
                        button here would do nothing. See the note below. */}
                    <a
                      href={`${canonical}/sitemap.xml`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] p-3 transition hover:bg-[#F9FAFB]"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#3B82F6]/10 text-[#3B82F6]">
                        <RefreshCw size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#111827]">View Sitemap</span>
                        <span className="block text-[11.5px] text-[#9CA3AF]">Open sitemap.xml on the live site</span>
                      </span>
                    </a>

                    <a
                      href={`${canonical}/robots.txt`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] p-3 transition hover:bg-[#F9FAFB]"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#8B5CF6]/10 text-[#8B5CF6]">
                        <FileText size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#111827]">View Robots.txt</span>
                        <span className="block text-[11.5px] text-[#9CA3AF]">Check your current robots.txt content</span>
                      </span>
                    </a>

                    <button
                      type="button"
                      onClick={() => clearCache.mutate()}
                      disabled={clearCache.isPending}
                      className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] p-3 text-left transition hover:bg-[#F9FAFB] disabled:opacity-60"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EF4444]/10 text-[#EF4444]">
                        <Trash2 size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#111827]">
                          {clearCache.isPending ? "Clearing…" : "Clear SEO Cache"}
                        </span>
                        <span className="block text-[11.5px] text-[#9CA3AF]">Refresh cached metadata and SEO data</span>
                      </span>
                    </button>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#10B981]/10 text-[#10B981]">
                      <CheckCircle2 size={17} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-bold text-[#111827]">
                        {dirty ? "Unsaved changes" : "Settings are up to date"}
                      </h2>
                      <p className="mt-0.5 text-[12.5px] text-[#6B7280]">
                        {dirty
                          ? `${Object.keys(changed).length} field${Object.keys(changed).length === 1 ? "" : "s"} changed and not yet saved.`
                          : "Everything on this page matches what the site is serving."}
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/admin/logs"
                    className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#F0FDF4] py-2.5 text-[12.5px] font-semibold text-[#047857] transition hover:bg-[#DCFCE7]"
                  >
                    <Clock size={14} /> View Change Logs
                  </Link>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
