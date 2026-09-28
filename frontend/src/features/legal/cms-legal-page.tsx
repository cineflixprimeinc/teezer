import { LegalShell, type TocItem } from "./legal-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * The CMS-aware half of every legal/policy page. Each page.tsx under
 * /terms, /privacy, /policies/*, etc. wraps its EXISTING hardcoded JSX as
 * the `fallback` prop here unchanged - if an admin has published real
 * content for this slug from CMS & Legal, that renders instead; otherwise
 * this is a no-op and the page's own original content renders exactly as
 * it always has. See server/app/Http/Controllers/Api/CmsController.php for
 * why "published content" is the only thing that ever overrides fallback.
 */

type CmsPage = {
  id: number;
  slug: string;
  title: string;
  content: string | null;
  updated_at: string;
};

async function fetchCmsPage(slug: string): Promise<CmsPage | null> {
  try {
    // Plain fetch (not the axios client other services use) specifically so
    // Next.js's own fetch cache applies here - 60s revalidate means an
    // admin's saved edit reaches the live site within a minute, with no
    // rebuild/redeploy needed for a content-only change.
    const res = await fetch(`${API_BASE}/app/cms/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Pulls out every `<h2>` in the CMS HTML to build the same left-rail TOC
 * the hardcoded pages already hand-write, and stamps an id on each heading
 * that doesn't already have one (so the TOC's `#anchor` links work).
 * Regex-based rather than a full HTML parser - content only ever comes
 * from the admin toolbar's own H2/H3 buttons (or a deliberate HTML-source
 * edit by an admin), not arbitrary third-party markup.
 */
function extractToc(html: string): { toc: TocItem[]; html: string } {
  const toc: TocItem[] = [];
  let i = 0;
  const withIds = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs: string, text: string) => {
    const plain = text.replace(/<[^>]+>/g, "").trim();
    const existingId = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const id = existingId || plain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || `section-${i}`;
    i += 1;
    if (plain) toc.push({ id, label: plain });
    return existingId ? match : `<h2${attrs} id="${id}">${text}</h2>`;
  });
  return { toc, html: withIds };
}

export async function CmsAwarePolicyPage({
  slug,
  eyebrow,
  fallback,
}: {
  slug: string;
  /** Same small kicker label the hardcoded page already passes to LegalShell. */
  eyebrow: string;
  fallback: React.ReactNode;
}) {
  const page = await fetchCmsPage(slug);
  if (!page?.content) return <>{fallback}</>;

  const { toc, html } = extractToc(page.content);
  const lastUpdated = new Date(page.updated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <LegalShell eyebrow={eyebrow} title={page.title} lastUpdated={lastUpdated} toc={toc} related={[]}>
      <div className="legal-cms-body" dangerouslySetInnerHTML={{ __html: html }} />
    </LegalShell>
  );
}
