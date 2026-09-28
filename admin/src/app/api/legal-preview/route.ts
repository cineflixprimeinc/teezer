import { NextRequest, NextResponse } from "next/server";

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || "https://teezer.live";

/**
 * Server-side preview of a legal page's CURRENT default content (the
 * hardcoded page still live on the site until an admin publishes CMS
 * content for it) - lets CMS & Legal show "what's live right now, in its
 * real design" without an <iframe> (the site sends X-Frame-Options: DENY
 * site-wide - see frontend/next.config.ts - so embedding it directly isn't
 * possible, and loosening that for every visitor just to support this one
 * admin preview isn't worth the clickjacking-surface trade-off).
 *
 * Fetches the real page server-side (no CORS - this is server-to-server)
 * and returns just its <main> content - the same eyebrow/title/date/body
 * a visitor sees, without the surrounding site chrome (header, sidebar,
 * scripts). The admin page renders this fragment with its own hand-written
 * CSS (globals.css's .legal-preview-embed) approximating the site's own
 * typography, since Tailwind's compiled output differs per app and the
 * raw utility classes in this fetched HTML won't resolve to anything here.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ success: false, message: "Missing or invalid path" }, { status: 400 });
  }

  try {
    const res = await fetch(`${FRONTEND_URL}${path}`, {
      headers: { "User-Agent": "Reelsoo-Admin-Preview" },
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
