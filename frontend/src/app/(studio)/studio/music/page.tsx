import { StudioMusicLibraryPage } from "@/features/studio/studio-music-library-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Music Library");

export default function Page() {
  return <StudioMusicLibraryPage />;
}
