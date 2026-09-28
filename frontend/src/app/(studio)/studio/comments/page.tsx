import { StudioCommentsPage } from "@/features/studio/studio-comments-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Comments");

export default function Page() {
  return <StudioCommentsPage />;
}
