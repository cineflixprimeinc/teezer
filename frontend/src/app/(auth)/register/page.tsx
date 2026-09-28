import { pageMetadata } from "@/lib/metadata";
import { RegisterPage } from "@/features/settings/auth-pages";

export const metadata = pageMetadata('Sign up');

export default function Page() {
  return <RegisterPage />;
}
