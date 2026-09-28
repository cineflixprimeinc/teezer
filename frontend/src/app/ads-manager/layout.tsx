import type { Metadata } from "next";
import { AdsShell } from "@/features/ads-studio/ads-shell";

/* ads.teezer.live branding - exact hyphen format, no "|"/":" separators. */
const TITLE = "Teezer - Grow Your Business with Teezer Ads.";
const DESCRIPTION =
  "Reach millions of engaged users across the Teezer App and Web with powerful AI-powered advertising. Create campaigns, target the right audience, optimize performance, and turn every scroll into measurable business growth.";
const LOGO = "https://ads.teezer.live/teezer-logo.png";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's "%s | Teezer" template so the browser
  // title is exactly the branded string with no "|" separator.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // Named rather than /favicon.png so the ads icon does not collide with the
  // main site's: on ads.teezer.live nginx serves .png from the ads-landing
  // root, and on teezer.live it comes from frontend/public - the file sits in
  // both. It also dodges the 30-day Cloudflare object still held for
  // ads.teezer.live/favicon.png (the API tokens on hand cannot purge).
  icons: { icon: "/icon-192.png", shortcut: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://ads.teezer.live/ads-manager",
    type: "website",
    images: [LOGO],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [LOGO],
  },
};

export default function AdsManagerLayout({ children }: { children: React.ReactNode }) {
  return <AdsShell>{children}</AdsShell>;
}
