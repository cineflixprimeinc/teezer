import { pageMetadata } from "@/lib/metadata";
import { LoginPage } from "@/features/settings/auth-pages";

export const metadata = pageMetadata('Log in');

export default function Page() {
  return <LoginPage />;
}
