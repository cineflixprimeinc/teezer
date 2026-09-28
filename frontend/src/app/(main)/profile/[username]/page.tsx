import type { Metadata } from "next";
import { ProfilePage } from "@/features/profile/profile-page";
import { pageMetadata, fetchMetadataResource } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  // /profile/me is the viewer's own profile (resolved client-side) - not a public
  // username, so title it generically and skip the public lookup.
  if (username === "me") return pageMetadata("Profile");
  const user = await fetchMetadataResource<{ name?: string; username?: string; bio?: string }>(
    `/users/${encodeURIComponent(username)}`,
  );
  const handle = user?.username ?? username;
  const title = user?.name ? `${user.name} (@${handle})` : `@${handle}`;
  const description = user?.bio?.trim() || `Watch ${title}'s videos on Teezer.`;
  return pageMetadata(title, description);
}

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfilePage username={username} />;
}
