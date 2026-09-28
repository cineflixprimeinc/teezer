import { pageMetadata } from "@/lib/metadata";
import { ResetPasswordPage } from "@/features/settings/auth-pages";

export const metadata = pageMetadata('Reset Password');

export default function Page() {
  return <ResetPasswordPage />;
}
