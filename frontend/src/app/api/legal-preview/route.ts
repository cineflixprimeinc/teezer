import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side preview of a legal page's CURRENT default content (the
 * hardcoded page still live on the site until an admin publishes CMS
 * content for it) - lets CMS & Legal show "what's live right now, in its
 * real design" without an <iframe> (the site sends X-Frame-Options: DENY
 * site-wide - see frontend/next.config.ts - so embedding it directly isn't
 * possible, and loosening that for every visitor just to support this one
 * admin preview isn't worth the clickjacking-surface trade-off).
 *
 * Fetches the page server-side and returns just its <main> content - the same
 * eyebrow/title/date/body a visitor sees, without the surrounding site chrome
 * (header, sidebar, scripts). The admin page renders that fragment with the
 * hand-written .legal-preview-embed rules in app/(admin)/admin-panel.css.
 *
 * ORIGIN: taken from the incoming request, not from a hardcoded default.
 *
 * When this route lived in the separate admin app the fetch was genuinely
 * cross-origin - admin panel to website - and defaulting to
 * https://teezer.live was right. Since the panel moved to /admin it is the
 * SAME app fetching itself, and a hardcoded production URL would mean local
 * development previews production, and a customer installation on their own
 * domain previews ours. Using the request's own origin makes it preview
 * whatever site it is actually part of.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ success: false, message: "Missing or invalid path" }, { status: 400 });
  }

  const origin = req.nextUrl.origin;

  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { "User-Agent": "Teezer-Admin-Preview" },
      // Short cache - this is a reference preview, not the live page itself.
      next: { revalidate: 120 },
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, message: `Site returned ${res.status}` }, { status: 502 });
    }
    const html = await res.text();
    const match = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
    if (!match) {
      return NextResponse.json({ success: false, message: "Couldn't find page content" }, { status: 502 });
    }
    return NextResponse.json({ success: true, html: match[1] });
  } catch {
    return NextResponse.json({ success: false, message: "Couldn't reach the site" }, { status: 502 });
  }
}
