import { pageMetadata } from "@/lib/metadata";
import { RequireAuth } from "@/components/layout/protected-route";
import { UploadPage } from "@/features/upload/upload-page";

export const metadata = pageMetadata('Upload');

export default function Page() {
  return (
    <RequireAuth>
      <UploadPage />
    </RequireAuth>
  );
}
