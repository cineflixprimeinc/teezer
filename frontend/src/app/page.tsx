import { FeedPage } from "@/features/feed/feed-page";

// Home intentionally exports NO metadata: it inherits the root layout's branded
// default - title.default "Reelsoo - Create Your Trend" (site title + tagline)
// plus the site description + OG/Twitter. Every OTHER route sets its own
// "{Page} - Reelsoo" title; the landing page keeps the full brand identity.
export default function HomePage() {
  return <FeedPage />;
}
