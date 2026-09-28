"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, isAdmin, fetchMe, logout } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
      await fetchMe();
      const store = useAuthStore.getState();
      if (!store.isAuthenticated) {
        router.replace("/login");
        return;
      }
      if (!store.isAdmin()) {
        await logout();
        router.replace("/login?error=access_denied");
        return;
      }
      // 2FA is opt-in for admins (config/auth.php admin_two_factor_required,
      // off by default), so an admin without it is not redirected anywhere.
      //
      // Nothing is lost if that switch is turned back on: the API answers
      // TWO_FACTOR_SETUP_REQUIRED on every admin endpoint, and the interceptor
      // in services/api.ts routes to /security?setup=1 on that code. Deciding
      // it here as well would only duplicate the server's judgement, and would
      // force enrollment even while the server does not require it.
      setChecked(true);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked || isLoading || !isAuthenticated || !isAdmin()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
