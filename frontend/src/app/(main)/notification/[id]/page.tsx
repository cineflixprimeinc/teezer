import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";

/**
 * A single notification - an ENTRY POINT into the notification centre.
 *
 * Notifications are private, so this cannot render anything server-side without
 * the viewer's session. It forwards to the centre with the id preserved, and the
 * centre highlights it once authenticated. Anyone not signed in lands on the
 * normal auth flow there rather than on an error.
 *
 * `noindex` because the target is per-user and unreachable to a crawler.
 */
export const metadata: Metadata = {
  ...pageMetadata("Notification"),
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/notifications?highlight=${encodeURIComponent(id)}`);
}
