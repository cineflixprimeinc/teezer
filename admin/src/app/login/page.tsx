"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, completeTwoFactor, logout, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(true);

  // 2FA step state
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [tsToken, setTsToken] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("error") === "access_denied") {
      toast.error("Access denied. Admin account required.");
    }
    fetchMe().then(() => {
      const store = useAuthStore.getState();
      if (store.isAuthenticated && store.isAdmin()) {
        router.replace("/dashboard");
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a session is established, route based on admin role + 2FA enrollment.
  const finishLogin = async () => {
    const store = useAuthStore.getState();
    if (!store.isAdmin()) {
      await logout();
      toast.error("Access denied. Admin account required.");
      setLoading(false);
      setChallenge(null);
      return;
    }
    // No enrollment detour: 2FA is opt-in for admins
    // (config/auth.php admin_two_factor_required, off by default). If that
    // switch is turned back on, the API replies TWO_FACTOR_SETUP_REQUIRED and
    // the interceptor in services/api.ts sends the user to /security?setup=1 -
    // so enrollment is still enforced when required, just by the server rather
    // than guessed at here.
    toast.success("Welcome back");
    router.replace("/dashboard");
  };

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const result = await login({
        login: String(form.get("login")),
        password: String(form.get("password")),
        turnstile_token: tsToken ?? undefined,
      });
      if (result.twoFactorRequired) {
        setChallenge(result.challenge);
        setLoading(false);
        return;
      }
      await finishLogin();
    } catch (error) {
      toast.error(apiMessage(error));
      setLoading(false);
    }
  };

  const submitCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!challenge) return;
    setLoading(true);
    try {
      await completeTwoFactor(
        useRecovery
          ? { challenge, recovery_code: code.trim() }
          : { challenge, code: code.trim() },
      );
      await finishLogin();
    } catch (error) {
      toast.error(apiMessage(error));
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a1628]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a1628] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fd4605] text-white text-2xl font-black shadow-lg shadow-[#fd4605]/30">
            R
          </div>
          <h1 className="mt-5 text-2xl font-bold text-white">Admin Panel</h1>
          <p className="mt-1.5 text-sm text-slate-400">Restricted access - admins only</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-white/5 bg-[#1e293b] p-8">
          {!challenge ? (
            <form onSubmit={submitPassword} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input className="pl-11" name="login" placeholder="Admin email or username" required autoComplete="username" />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input className="pl-11" name="password" type="password" placeholder="Password" required autoComplete="current-password" />
              </div>
              {turnstileEnabled && <Turnstile onToken={setTsToken} />}
              <Button className="w-full" disabled={loading || (turnstileEnabled && !tsToken)}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <ShieldCheck className="h-8 w-8 text-[#fd4605]" />
                <p className="mt-2 text-sm font-semibold text-white">Two-factor verification</p>
                <p className="mt-1 text-xs text-slate-400">
                  {useRecovery
                    ? "Enter one of your recovery codes."
                    : "Enter the 6-digit code from your authenticator app."}
                </p>
              </div>
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                className="text-center tracking-[0.3em]"
                required
              />
              <Button className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <button
                type="button"
                onClick={() => { setUseRecovery((v) => !v); setCode(""); }}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
              >
                {useRecovery ? "Use authenticator code instead" : "Use a recovery code"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Public website:{" "}
          <a href={process.env.NEXT_PUBLIC_APP_URL || "https://teezer.live"} className="text-slate-500 hover:text-slate-400 underline">
            teezer.live
          </a>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a1628]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
