import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";

/**
 * A single comment - an ENTRY POINT, not a page of its own.
 *
 * A comment has no standalone view anywhere in the product; it lives inside its
 * video. So this route resolves the comment to its video and forwards, with the
 * comment id preserved as `?comment=` so the destination can scroll to it.
 *
 * Why the route exists at all: for `reply` and `comment_like` notifications the
 * only id the client holds is a COMMENT id (entity_type is 'comment', and
 * target_reel_id is null), so no client could work out which video to open.
 * /comment/{id} moves that lookup to the server, which is the only place that
 * can do it.
 *
 * Forwarding rather than rendering also keeps it out of the index - one
 * canonical URL per video, no duplicate content.
 */
async function resolveVideoId(id: string): Promise<number | null> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    // The public replies endpoint returns the thread's video_id.
    const res = await fetch(`${base}/comments/${encodeURIComponent(id)}/replies`, {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const vid = Number(json?.video_id);
    return Number.isFinite(vid) && vid > 0 ? vid : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = pageMetadata("Comment", "View this comment on Teezer.");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = await resolveVideoId(id);

  // A deleted comment, or an unreachable API, should still land somewhere real.
  redirect(videoId ? `/video/${videoId}?comment=${encodeURIComponent(id)}` : "/");
}
