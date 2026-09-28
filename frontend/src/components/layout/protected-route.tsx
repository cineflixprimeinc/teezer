"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";

/**
 * Wraps content that requires authentication.
 * - If authenticated: renders children.
 * - If not authenticated: opens the global auth modal and redirects to "/"
 *   so the user never lands on a blank protected page.
 * - While loading (token being verified): renders a blank shell.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, authReady, openAuthModal } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (authReady && !isLoading && !isAuthenticated) {
      openAuthModal("login");
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, authReady, openAuthModal, router]);

  if (!authReady || isLoading) return <AuthBlank />;
  if (!isAuthenticated) return <AuthBlank />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuthStore();
  if (!isAuthenticated) return <RequireAuth>{children}</RequireAuth>;
  if (!isAdmin())
    return (
      <GuardCard
        title="Access Denied"
        text="Admin Dashboard is available only to admins."
        action="Back to Home Feed"
        href="/"
      />
    );
  return <>{children}</>;
}

/** Blank white fill shown while auth state is resolving or redirect is pending. */
function AuthBlank() {
  return <div className="min-h-screen bg-[#f8f9fb]" aria-hidden />;
}

function GuardCard({
  title, text, action, href = "/",
}: {
  title: string; text: string; action?: string; href?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f9fb] p-6">
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-black">{title}</h1>
        <p className="mt-3 text-sm text-[#5f6675]">{text}</p>
        <Link href={href}>
          <Button className="mt-6">{action || "Go home"}</Button>
        </Link>
      </Card>
    </main>
  );
}
