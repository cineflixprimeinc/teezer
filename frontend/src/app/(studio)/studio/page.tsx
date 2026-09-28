import { StudioPage } from "@/features/studio/studio-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Dashboard");

export default function Page() {
  return <StudioPage />;
}
