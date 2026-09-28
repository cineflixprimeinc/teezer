"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/store/auth.store";

export function AdminProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    window.addEventListener("admin:unauthorized", logout);
    return () => window.removeEventListener("admin:unauthorized", logout);
  }, [logout]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="top-right" richColors closeButton theme="light" />
    </QueryClientProvider>
  );
}
