"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * The header's "Back to Reelsoo" link - hidden only when this page is
 * opened inside the app's in-app policy viewer (a WebView that appends
 * ?embedded=1 - see mobile/src/screens/legal/PolicyViewerScreen.tsx). There
 * it would navigate the WebView to teezer.live/ rather than close the
 * app's own popup (the app's own header already has a close button for
 * that), so it doesn't belong there. A normal browser visit never sends
 * this param, so the link is unaffected on the live website.
 */
export function BackToReelsooLink() {
  const params = useSearchParams();
  if (params.get("embedded") === "1") return null;

  return (
    <Link href="/" className="rounded-full bg-[#fe2c55] px-5 py-2 text-sm font-bold text-white hover:bg-[#e0243d]">
      Back to Teezer
    </Link>
  );
}
