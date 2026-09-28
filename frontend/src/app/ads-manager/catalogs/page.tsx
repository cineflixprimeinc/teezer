import { CatalogsPage } from "@/features/ads-studio/pages/catalogs-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Catalogs");

export default function Page() {
  return <CatalogsPage />;
}
