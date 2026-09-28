import { pageMetadata } from "@/lib/metadata";
import { ForgotPasswordPage } from "@/features/settings/auth-pages";

export const metadata = pageMetadata('Forgot Password');

export default function Page() {
  return <ForgotPasswordPage />;
}
