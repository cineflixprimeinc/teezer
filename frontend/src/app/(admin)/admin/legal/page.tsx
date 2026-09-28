"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Save, FileText, ExternalLink, Plus, Trash2, Search, ChevronDown,
  Info, Eye, Globe2, Sparkles,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody } from "@/admin-panel/components/ui/card";
import { Badge } from "@/admin-panel/components/ui/badge";
import { Button } from "@/admin-panel/components/ui/button";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { RichTextEditor } from "@/admin-panel/components/ui/rich-text-editor";
import { adminService } from "@/admin-panel/services/admin.service";

type CmsPage = {
  id: number; slug: string; title: string; content: string | null;
  meta_title: string | null; meta_description: string | null;
  is_published: boolean; locale: string; updated_at: string;
};

const SITE = "https://teezer.live";

/** Where each known slug actually lives on the site - only used to build
 *  the "View live" link and the default-content preview fetch. A slug
 *  this admin panel doesn't recognise (a brand-new policy) falls back to
 *  /policies/{slug}, which is where a matching page.tsx would need to be
 *  added for it to be reachable. */
const LIVE_PATHS: Record<string, string> = {
  terms: "/terms", privacy: "/privacy", guidelines: "/guidelines",
  cookies: "/cookies", copyright: "/copyright", "law-enforcement": "/law-enforcement",
  "virtual-items": "/virtual-items",
};
const livePathFor = (slug: string) => LIVE_PATHS[slug] ?? `/policies/${slug}`;

/** Same three groupings mobile's PoliciesScreen.tsx already uses, so the
 *  admin's mental model of "where is this policy" matches the app's. */
const CATEGORIES: { title: string; color: string; slugs: string[] }[] = [
  { title: "Core Policies", color: "#fd4605", slugs: ["terms", "privacy", "guidelines"] },
  {
    title: "Safety & Community",
    color: "#f59e0b",
    slugs: [
      "safety", "adult-content", "minor-safety", "harassment", "hateful-behavior",
      "integrity", "ai-content", "enforcement",
    ],
  },
  {
    title: "Legal & Data",
    color: "#6366f1",
    slugs: [
      "copyright", "virtual-items", "creator-earnings", "cookies", "data-collection",
      "data-sharing", "data-retention", "security", "your-rights", "law-enforcement",
      "creator-agreement", "monetization-terms", "advertising-policy",
    ],
  },
];

const PROTECTED_SLUGS = new Set(["terms", "privacy", "guidelines"]);

const PAGE_ICONS: Record<string, string> = {
  terms: "📜", privacy: "🔒", guidelines: "📋", about: "ℹ️", help: "❓",
  safety: "⚠️", "adult-content": "🔞", "minor-safety": "🧒", harassment: "🚫",
  "hateful-behavior": "💢", integrity: "✅", "ai-content": "✨", enforcement: "⚖️",
  copyright: "©️", "virtual-items": "💎", "creator-earnings": "💰", cookies: "🍪",
  "data-collection": "🗄️", "data-sharing": "🔗", "data-retention": "🕒",
  security: "🔐", "your-rights": "🙋", "law-enforcement": "🏛️",
  "creator-agreement": "🤝", "monetization-terms": "📈", "advertising-policy": "📣",
};

/** The site's own default content for a slug that has nothing published in
 *  CMS yet - fetched server-side via /api/legal-preview (see that route
 *  for why not a plain <iframe>) and rendered with .legal-preview-embed's
 *  hand-matched typography (globals.css). */
function DefaultContentPreview({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["legal-preview", slug],
    queryFn: async () => {
      const res = await fetch(`/api/legal-preview?path=${encodeURIComponent(livePathFor(slug))}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      return json.html as string;
    },
    staleTime: 60_000,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8eaed] bg-[#fafafa] px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#374151]">
          <Eye className="h-3.5 w-3.5 text-[#9ca3af]" /> Current default content (live on the site)
        </div>
        <a
          href={`${SITE}${livePathFor(slug)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold text-[#6b7280] hover:text-[#374151]"
        >
          Open in new tab <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="py-8 text-center text-[12.5px] text-[#9ca3af]">Loading preview…</div>
        ) : isError || !data ? (
          <div className="py-8 text-center text-[12.5px] text-[#9ca3af]">Couldn&apos;t load a preview of the live page.</div>
        ) : (
          <div className="legal-preview-embed" dangerouslySetInnerHTML={{ __html: data }} />
        )}
      </div>
    </div>
  );
}

/** WordPress/Yoast-style search-result mock - the fastest way for an admin
 *  to see what their meta title/description will actually look like, and
 *  makes the SEO section worth having open instead of a bare pair of
 *  inputs. */
function SerpPreview({ url, title, description }: { url: string; title: string; description: string }) {
  return (
    <div className="rounded-[10px] border border-[#e8eaed] bg-white p-3.5">
      <p className="truncate text-[13px] text-[#1a0dab]">{title || "Untitled page"}</p>
      <p className="truncate text-[12px] text-[#006621]">{url}</p>
      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-[#545454]">
        {description || "No meta description set - search engines will pull a snippet from the page content instead."}
      </p>
    </div>
  );
}

function CmsEditor({ page }: { page: CmsPage }) {
  const qc = useQueryClient();
  const [content, setContent] = useState(page.content ?? "");
  const [title, setTitle] = useState(page.title ?? "");
  const [metaTitle, setMetaTitle] = useState(page.meta_title ?? "");
  const [metaDesc, setMetaDesc] = useState(page.meta_description ?? "");
  const [published, setPublished] = useState(page.is_published);
  const [seoOpen, setSeoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDirty =
    content !== (page.content ?? "") ||
    title !== page.title ||
    metaTitle !== (page.meta_title ?? "") ||
    metaDesc !== (page.meta_description ?? "") ||
    published !== page.is_published;

  const save = useMutation({
    mutationFn: () =>
      adminService.updateCmsPage(page.slug, {
        title, content, is_published: published,
        meta_title: metaTitle || null, meta_description: metaDesc || null,
      }),
    onSuccess: () => { toast.success("Page saved"); qc.invalidateQueries({ queryKey: ["admin-cms"] }); },
    onError: () => toast.error("Failed to save"),
  });

  const del = useMutation({
    mutationFn: () => adminService.deleteCmsPage(page.slug),
    onSuccess: () => {
      toast.success("Page deleted");
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-cms"] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to delete");
      setDeleteOpen(false);
    },
  });

  const protectedPage = PROTECTED_SLUGS.has(page.slug);
  const isLive = page.is_published && !!page.content;

  return (
    <div className="space-y-5">
      {/* Live-vs-default banner */}
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[12.5px] leading-5 ${
          isLive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {isLive ? (
          <span>This CMS content is <strong>live</strong> - it&apos;s what visitors see at this page&apos;s URL.</span>
        ) : (
          <span>
            Not live yet - the site is currently showing this page&apos;s <strong>built-in default content</strong>,
            previewed below. Add content and publish to override it.
          </span>
        )}
      </div>

      {!isLive && <DefaultContentPreview slug={page.slug} />}

      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-[#e8eaed] bg-white px-3.5 text-[14px] font-semibold text-[#111827] outline-none transition-colors focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10"
          placeholder="Page title…"
        />
        <button
          onClick={() => setPublished((p) => !p)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${published ? "bg-[#fd4605]" : "bg-[#d1d5db]"}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${published ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <span className="w-16 shrink-0 text-[12px] text-[#9ca3af]">{published ? "Published" : "Draft"}</span>
      </div>

      <RichTextEditor value={content} onChange={setContent} placeholder="Write this policy's content…" />

      {/* SEO - collapsed by default, with a live search-result preview */}
      <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <button
          onClick={() => setSeoOpen((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[#374151]">
            <Globe2 className="h-4 w-4 text-[#9ca3af]" /> SEO metadata
          </span>
          <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform ${seoOpen ? "rotate-180" : ""}`} />
        </button>
        {seoOpen && (
          <div className="space-y-4 border-t border-[#e8eaed] bg-[#fafafa] p-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Meta title</label>
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="mt-1 h-9 w-full rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]"
                placeholder={title || "Defaults to page title"}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Meta description</label>
              <textarea
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-[10px] border border-[#e8eaed] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]"
                placeholder="One or two sentences for search results"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Search result preview</label>
              <SerpPreview url={`${SITE}${livePathFor(page.slug)}`} title={metaTitle || title} description={metaDesc} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a
            href={`${SITE}${livePathFor(page.slug)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6b7280] hover:text-[#374151]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View live page
          </a>
          <span className="text-[12px] text-[#d1d5db]">·</span>
          <span className="text-[12px] text-[#9ca3af]">
            {content.replace(/<[^>]+>/g, "").length} chars
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!protectedPage && (
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button variant="primary" size="sm" disabled={save.isPending || !isDirty} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5" />
            {save.isPending ? "Saving…" : "Save Page"}
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={`Delete "${page.title}"?`}
        message="This removes the page from CMS & Legal entirely. If a live page still links here, that link will break unless you remove it too."
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function NewPageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () => adminService.createCmsPage({ slug, title, content: "", is_published: false }),
    onSuccess: () => {
      toast.success("Page created");
      qc.invalidateQueries({ queryKey: ["admin-cms"] });
      setSlug(""); setTitle("");
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to create page");
    },
  });

  if (!open) return null;

  return (
    <ConfirmModal
      open={open}
      title="New policy page"
      message="Choose a URL-safe slug (lowercase, hyphens only) and a title. The page is created as an unpublished draft - publish it once it has content."
      confirmLabel={create.isPending ? "Creating…" : "Create"}
      loading={create.isPending}
      onConfirm={() => slug && title && create.mutate()}
      onCancel={onClose}
    >
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Slug</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
            placeholder="e.g. refund-policy"
            className="mt-1 h-9 w-full rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Refund Policy"
            className="mt-1 h-9 w-full rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]"
          />
        </div>
        <p className="text-[11px] leading-4 text-[#9ca3af]">
          Note: a brand-new slug needs a matching page on the website (under /policies/{"{slug}"}) to actually be
          reachable at a URL - ask engineering to add one if it doesn&apos;t already exist.
        </p>
      </div>
    </ConfirmModal>
  );
}

export default function LegalPage() {
  const [activeSlug, setActiveSlug] = useState("terms");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-cms"],
    queryFn: adminService.cmsPages,
  });

  const pages: CmsPage[] = Array.isArray(data) ? data : [];
  const byslug = useMemo(() => new Map(pages.map((p) => [p.slug, p])), [pages]);
  const activePage = byslug.get(activeSlug);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return pages.filter((p) => p.title.toLowerCase().includes(q) || p.slug.includes(q));
  }, [pages, query]);

  const categorized = new Set(CATEGORIES.flatMap((c) => c.slugs));
  const other = pages.filter((p) => !categorized.has(p.slug));

  const publishedCount = pages.filter((p) => p.is_published && !!p.content).length;

  return (
    <AdminShell title="CMS & Legal">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e8eaed] bg-gradient-to-br from-white to-[#fff8f9] p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fd4605]/10">
              <Sparkles className="h-5 w-5 text-[#fd4605]" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#111827]">CMS & Legal</h2>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                Edit every legal/policy page the site and app link to.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  {publishedCount} live
                </span>
                <span className="rounded-full bg-[#f4f5f7] px-2.5 py-0.5 text-[11px] font-bold text-[#6b7280]">
                  {pages.length} total
                </span>
              </div>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Policy
          </Button>
        </div>

        <div className="flex gap-5">
          {/* Page sidebar */}
          <div className="w-72 shrink-0 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages…"
                className="h-10 w-full rounded-xl border border-[#e8eaed] bg-white pl-9 pr-3 text-[13px] text-[#111827] outline-none transition-colors focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10"
              />
            </div>

            <div className="max-h-[calc(100vh-300px)] space-y-4 overflow-y-auto rounded-2xl border border-[#e8eaed] bg-white p-3">
              {isLoading ? (
                <div className="p-4 text-[13px] text-[#9ca3af]">Loading…</div>
              ) : filtered ? (
                <PageList pages={filtered} activeSlug={activeSlug} onSelect={setActiveSlug} />
              ) : (
                <>
                  {CATEGORIES.map((cat) => {
                    const rows = cat.slugs.map((s) => byslug.get(s)).filter((p): p is CmsPage => !!p);
                    if (!rows.length) return null;
                    return (
                      <div key={cat.title}>
                        <div className="mb-1.5 flex items-center gap-1.5 px-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#9ca3af]">{cat.title}</p>
                        </div>
                        <PageList pages={rows} activeSlug={activeSlug} onSelect={setActiveSlug} accent={cat.color} />
                      </div>
                    );
                  })}
                  {other.length > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 px-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#9ca3af]" />
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#9ca3af]">Other</p>
                      </div>
                      <PageList pages={other} activeSlug={activeSlug} onSelect={setActiveSlug} accent="#9ca3af" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Editor area */}
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <Card><CardBody className="py-12 text-center text-[13px] text-[#9ca3af]">Loading pages…</CardBody></Card>
            ) : activePage ? (
              <Card className="overflow-visible rounded-2xl">
                <div className="flex items-center justify-between border-b border-[#f1f2f4] px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4f5f7] text-[17px]">
                      {PAGE_ICONS[activePage.slug] ?? "📄"}
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-[15px] font-bold text-[#111827]">
                        <FileText className="h-3.5 w-3.5 text-[#fd4605]" /> {activePage.title}
                      </p>
                      <p className="text-[11px] text-[#9ca3af]">
                        /{activePage.slug} · Updated {new Date(activePage.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={activePage.is_published && activePage.content ? "success" : "default"}>
                    {activePage.is_published && activePage.content ? "Live" : activePage.is_published ? "Published, empty" : "Draft"}
                  </Badge>
                </div>
                <CardBody>
                  <CmsEditor key={activePage.slug} page={activePage} />
                </CardBody>
              </Card>
            ) : (
              <Card><CardBody className="py-12 text-center text-[13px] text-[#9ca3af]">Select a page to edit.</CardBody></Card>
            )}
          </div>
        </div>
      </div>

      <NewPageModal open={newOpen} onClose={() => setNewOpen(false)} />
    </AdminShell>
  );
}

function PageList({
  pages, activeSlug, onSelect, accent = "#fd4605",
}: {
  pages: CmsPage[]; activeSlug: string; onSelect: (slug: string) => void; accent?: string;
}) {
  return (
    <div className="space-y-0.5">
      {pages.map((p) => {
        const active = activeSlug === p.slug;
        const live = p.is_published && !!p.content;
        return (
          <button
            key={p.slug}
            onClick={() => onSelect(p.slug)}
            style={active ? { borderLeftColor: accent, background: `${accent}0d` } : undefined}
            className={`group flex w-full items-center gap-2.5 rounded-r-[10px] border-l-[3px] py-2.5 pl-2.5 pr-2 text-left transition-colors
              ${active ? "" : "border-l-transparent hover:bg-[#f4f5f7]"}`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-[14px] shadow-sm ring-1 ring-[#e8eaed]">
              {PAGE_ICONS[p.slug] ?? "📄"}
            </span>
            <span className={`flex-1 truncate text-[13px] ${active ? "font-bold text-[#111827]" : "font-medium text-[#374151]"}`}>
              {p.title}
            </span>
            {live ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Live from CMS" />
            ) : !p.is_published ? (
              <span className="shrink-0 rounded-full bg-[#f4f5f7] px-1.5 py-0.5 text-[9px] font-bold text-[#9ca3af]">DRAFT</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
