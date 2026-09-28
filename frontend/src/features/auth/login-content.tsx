"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, QrCode, User, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuthStore } from "@/store/auth.store";
import { apiMessage, rateLimitInfo, globalFeatureError } from "@/services/api";
import { GlobalRestrictionNotice } from "@/components/global-restriction-notice";
import { authService } from "@/services/auth.service";
import { countryService } from "@/services/country.service";
import { SocialButton, GoogleIcon, TikTokIcon, FacebookIcon, AppleIcon } from "./social-button";
import { Turnstile, turnstileEnabled } from "./turnstile";

type LoginView = "options" | "email" | "forgot" | "twofa" | "qr";

/** Matches mobile/src/components/profile/ProfileActionsSheet.tsx's own
 *  profileUrl() convention - a plain https URL, not a custom scheme, so the
 *  QR code still opens something sensible (a 404-ish "open in app" page) if
 *  scanned by an ordinary camera app instead of Reelsoo's own Scan screen. */
const QR_LOGIN_WEB = "https://teezer.live";
const qrLoginUrl = (ticket: string) => `${QR_LOGIN_WEB}/qr-login/${ticket}`;

/** How often the widget polls while a code is on screen. Kept comfortably
 *  under APISIX's 30-req/60s per-IP gateway cap on /api/v1/auth/* (deploy/
 *  apisix/routes/01-auth.json) - 3s here is 20 req/min, leaving headroom for
 *  the initial create() call and any retry. */
const QR_POLL_MS = 3000;

/* Google Identity Services - the same client_id the mobile app's Web Client
 * ID must be (Google's ID-token audience check is per client_id, and the
 * backend's SocialAuthVerifier accepts a comma-separated allow-list - see
 * server/app/Services/SocialLoginConfig.php - so the web and mobile client
 * IDs can be the same "Web application" credential or separate ones, as
 * long as both are added there). Blank means the button below shows its
 * "not configured" state instead of a broken sign-in prompt. */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

/* Sign in with Apple on the web uses a SERVICES ID, not the app's bundle id
 * (com.teezer.app) - Apple mints web tokens with the Services ID as their
 * `aud`, so both strings must be listed in Admin > Social Login > Apple for
 * the app and the website to share one backend endpoint. Blank means the
 * button reports "not configured" rather than opening a broken popup. */
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID || "";
/* Must match a Return URL registered on that Services ID byte for byte -
 * Apple compares it literally and refuses to open the popup otherwise. It is
 * never actually navigated to in popup mode. */
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || "https://teezer.live/login";


declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          prompt: () => void;
          renderButton: (parent: HTMLElement, options: { type: "standard" | "icon" }) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
        signIn: () => Promise<{
          authorization?: { id_token?: string; code?: string; state?: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}

/* ── Compact pill input (login only) ─────────────────────────────────── */
function Field({
  icon, right, error, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ReactNode;
  right?: React.ReactNode;
  error?: string;
}) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 13, top: "50%",
          transform: "translateY(-50%)",
          display: "flex", alignItems: "center",
          color: "#9ca3af", pointerEvents: "none",
        }}>
          {icon}
        </span>
        <input
          className="auth-input"
          style={{
            width: "100%",
            height: 46,
            borderRadius: 9999,
            border: `1.5px solid ${error ? "#fd4605" : "#e5e7eb"}`,
            background: "#fff",
            padding: right ? "0 42px 0 38px" : "0 14px 0 38px",
            fontSize: 14,
            color: "#111827",
            outline: "none",
            transition: "border-color 150ms, box-shadow 150ms",
          }}
          {...props}
        />
        {right && (
          <span style={{
            position: "absolute", right: 12, top: "50%",
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center",
            color: "#9ca3af", cursor: "pointer",
          }}>
            {right}
          </span>
        )}
      </div>
      {error && <p style={{ marginTop: 3, paddingLeft: 14, fontSize: 11, color: "#fd4605" }}>{error}</p>}
    </div>
  );
}

export function LoginContent({ startView = "options", embedded = false }: { startView?: LoginView; embedded?: boolean } = {}) {
  const { login, completeTwoFactor, applySsoAuth, isLoading } = useAuthStore();
  const [view,    setView]   = useState<LoginView>(startView);
  const [viewKey, setViewKey] = useState(0);

  /** Detected once on mount (regardless of which view is showing first) so
   *  it's ready by the time the email/password view renders - UX signal
   *  only, ApiAuthController::login() re-checks independently at submit
   *  time (see CountryAvailabilityService's docblock). */
  const [loginRestriction, setLoginRestriction] = useState<{ country: string; reason: string } | null>(null);
  /* Global Reelsoo Control - admin-side kill switch, distinct from the
   * country restriction above. Informational only, never disables the
   * form - an admin can flip login_enabled back on at any moment. */
  const [globalRestriction, setGlobalRestriction] = useState<{ message: string; expiresAt: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    countryService.detect()
      .then((d) => {
        if (!cancelled && !d.loginAllowed) {
          setLoginRestriction({ country: d.countryName, reason: d.loginReason || "Teezer login is currently unavailable in your country." });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* ── QR-code login ── */
  const [qrTicket, setQrTicket] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"loading" | "pending" | "scanned" | "confirmed" | "denied" | "expired" | "error">("loading");
  const qrPollTimer = useRef<number | null>(null);

  function stopQrPoll() {
    if (qrPollTimer.current) { window.clearInterval(qrPollTimer.current); qrPollTimer.current = null; }
  }

  async function startQrLogin() {
    stopQrPoll();
    setQrStatus("loading");
    switchView("qr");
    try {
      const { ticket } = await authService.qrCreate();
      setQrTicket(ticket);
      setQrStatus("pending");
      qrPollTimer.current = window.setInterval(async () => {
        try {
          const result = await authService.qrStatus(ticket);
          if (result.status === "confirmed" && result.token && result.user) {
            stopQrPoll();
            setQrStatus("confirmed");
            applySsoAuth({ token: result.token, expires_at: result.expires_at, user: result.user });
            toast.success("Welcome back! 🎉");
            return;
          }
          if (result.status === "denied" || result.status === "expired") {
            stopQrPoll();
            setQrStatus(result.status);
            return;
          }
          setQrStatus(result.status);
        } catch {
          // A transient network hiccup shouldn't kill the poll - the next
          // tick just tries again until the code itself actually expires.
        }
      }, QR_POLL_MS);
    } catch (err) {
      // Distinct from "expired": no ticket was ever created here (the create
      // call itself failed - a network hiccup or a rate limit), so "This code
      // has expired" was actively misleading - there was never a code to
      // expire. Same retry button either way.
      setQrStatus("error");
      toast.error(apiMessage(err));
    }
  }

  // Stop polling if the modal/page unmounts (or the user navigates away
  // from the QR view) while a code is still pending.
  useEffect(() => () => stopQrPoll(), []);
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const [rateLimit, setRateLimit] = useState<{ message: string; retryAfter: number } | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [tsToken, setTsToken] = useState<string | null>(null);

  /* Forgot-password state */
  const [fpEmail,   setFpEmail]   = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpSent,    setFpSent]    = useState(false);

  /* ── 2FA challenge ── */
  const [challenge,  setChallenge]  = useState<string | null>(null);
  const [twoFaCode,  setTwoFaCode]  = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  /* ── Google sign-in ── */
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function initGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID || !window.google) return;
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
    // Render Google's own button into a visually-hidden container and forward
    // clicks to it (below) instead of relying on prompt() (One Tap) as the
    // primary trigger - prompt() silently declines to display at all, with no
    // error and nothing for us to catch, once the browser's g_state cookie
    // records a prior dismissal (Google's own cooldown, up to ~2 weeks) or
    // when third-party-cookie/FedCM restrictions block it outright. The
    // rendered button opens a real popup account chooser instead, which isn't
    // subject to that cooldown.
    if (window.google && googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, { type: "standard" });
    }
    setGoogleReady(true);
  }

  // This modal fully unmounts on close (auth-modal.tsx: `if (!authModalOpen)
  // return null`), so every reopen is a fresh LoginContent instance with
  // googleReady back to false - but the <Script> tag below only ever loads
  // https://accounts.google.com/gsi/client ONCE (Next dedupes by src), so its
  // onLoad won't fire again for the new instance. Without this, "Continue
  // with Google" was permanently stuck on "still loading" on every reopen
  // after the first. Covers both cases: the SDK is already loaded (init now)
  // or still mid-flight from another mount (poll briefly until it appears).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    if (window.google?.accounts?.id) { initGoogleSignIn(); return; }
    const poll = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        initGoogleSignIn();
        window.clearInterval(poll);
      }
    }, 150);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);
    return () => { window.clearInterval(poll); window.clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleCredential(resp: { credential: string }) {
    try {
      const result = await authService.socialGoogle(resp.credential);
      // Same 2FA branch handleLogin() takes below - a provider is only one
      // factor, completeSocial() still gates on the account's own 2FA.
      if (result.twoFactorRequired) {
        setChallenge(result.challenge);
        setTwoFaCode("");
        setUseRecovery(false);
        switchView("twofa");
        return;
      }
      applySsoAuth({ token: result.auth.token, expires_at: result.auth.expires_at, user: result.auth.user });
      toast.success("Welcome back! 🎉");
    } catch (err) {
      toast.error(apiMessage(err));
    }
  }


  /* -- Apple sign-in -- */
  const [appleReady, setAppleReady] = useState(false);

  function initAppleSignIn() {
    if (!APPLE_SERVICES_ID || !window.AppleID) return;
    // usePopup keeps the whole exchange in the browser and hands back an
    // id_token directly. The redirect flow would instead POST a `code` to
    // APPLE_REDIRECT_URI, needing a .p8 key and a signed client-secret JWT
    // server-side to redeem it - all to reach the same token the popup
    // already gives us.
    window.AppleID.auth.init({
      clientId: APPLE_SERVICES_ID,
      scope: "name email",
      redirectURI: APPLE_REDIRECT_URI,
      usePopup: true,
    });
    setAppleReady(true);
  }

  // Same remount problem the Google effect above documents: <Script> loads
  // appleid.auth.js only once, so onLoad never fires again for a second
  // instance of this component and the button would sit on "still loading".
  useEffect(() => {
    if (!APPLE_SERVICES_ID) return;
    if (window.AppleID?.auth) { initAppleSignIn(); return; }
    const poll = window.setInterval(() => {
      if (window.AppleID?.auth) {
        initAppleSignIn();
        window.clearInterval(poll);
      }
    }, 150);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);
    return () => { window.clearInterval(poll); window.clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAppleSignIn() {
    if (!APPLE_SERVICES_ID) {
      toast.error("Apple sign-in isn't configured yet.");
      return;
    }
    if (!appleReady || !window.AppleID) {
      toast.error("Apple sign-in is still loading - try again in a moment.");
      return;
    }
    try {
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) {
        toast.error("Apple didn't return a sign-in token. Please try again.");
        return;
      }
      // Apple sends the name ONLY on the first-ever authorization for this
      // Services ID and never again, so it has to be forwarded now or the
      // account keeps its fallback display name permanently. Exactly why
      // mobile/src/hooks/useSocialAuth.ts passes it too.
      const name = data.user?.name
        ? [data.user.name.firstName, data.user.name.lastName].filter(Boolean).join(" ") || undefined
        : undefined;
      const result = await authService.socialApple(idToken, name);
      // Same 2FA branch handleGoogleCredential takes - completeSocial() gates
      // on the account's own 2FA whichever provider vouched for the user.
      if (result.twoFactorRequired) {
        setChallenge(result.challenge);
        setTwoFaCode("");
        setUseRecovery(false);
        switchView("twofa");
        return;
      }
      applySsoAuth({ token: result.auth.token, expires_at: result.auth.expires_at, user: result.auth.user });
      toast.success("Welcome back! 🎉");
    } catch (err) {
      // Dismissing the popup is a normal outcome, not a failure worth a toast.
      const code = (err as { error?: string })?.error;
      if (code === "popup_closed_by_user" || code === "user_cancelled_authorize") return;
      toast.error(apiMessage(err));
    }
  }

  function startGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google sign-in isn't configured yet.");
      return;
    }
    if (!googleReady || !window.google) {
      toast.error("Google sign-in is still loading - try again in a moment.");
      return;
    }
    // Forward the click to Google's own rendered button (see initGoogleSignIn)
    // instead of prompt() - see the comment there for why.
    const realBtn = googleBtnRef.current?.querySelector<HTMLElement>('div[role="button"]');
    if (realBtn) { realBtn.click(); return; }
    window.google.accounts.id.prompt();
  }

  /* Prefill email - from verify-email page (sessionStorage) or Remember Me (localStorage) */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reelsoo_login_prefill");
      if (raw) {
        const { email: prefillEmail } = JSON.parse(raw);
        if (prefillEmail) { setLoginVal(prefillEmail); switchView("email"); }
        sessionStorage.removeItem("reelsoo_login_prefill");
        return;
      }
    } catch {}
    try {
      const saved = localStorage.getItem("reelsoo_remember_email");
      if (saved) { setLoginVal(saved); setRememberMe(true); }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rateLimit?.retryAfter) return;
    const timer = window.setInterval(() => {
      setRateLimit((current) => {
        if (!current) return null;
        const next = current.retryAfter - 1;
        return next > 0 ? { ...current, retryAfter: next } : null;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimit?.retryAfter]);

  function switchView(next: LoginView) {
    // Leaving the QR view (Back, or any other navigation away from it)
    // stops the poll - it would otherwise keep hitting the API, and a
    // confirm() arriving after the user moved on would silently log them
    // in while they're looking at a different screen.
    if (view === "qr" && next !== "qr") stopQrPoll();
    setViewKey((k) => k + 1);
    setView(next);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!loginVal.trim()) errs.login    = "Email or username required.";
    if (!password)        errs.password = "Password required.";
    if (turnstileEnabled && !tsToken) errs.captcha = "Please complete the verification below.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    try {
      const result = await login({ login: loginVal.trim(), password, turnstile_token: tsToken ?? undefined });
      if (rememberMe) {
        localStorage.setItem("reelsoo_remember_email", loginVal.trim());
      } else {
        localStorage.removeItem("reelsoo_remember_email");
      }
      if (result.twoFactorRequired && result.challenge) {
        setChallenge(result.challenge);
        setTwoFaCode("");
        setUseRecovery(false);
        switchView("twofa");
        return;
      }
      toast.success("Welcome back! 🎉");
    } catch (err) {
      const limited = rateLimitInfo(err);
      if (limited) {
        setRateLimit(limited);
        return;
      }
      const blocked = globalFeatureError(err);
      if (blocked) {
        setGlobalRestriction({ message: blocked.message, expiresAt: blocked.expiresAt });
        return;
      }
      toast.error(apiMessage(err));
    }
  }

  async function handleTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || !twoFaCode.trim()) return;
    try {
      await completeTwoFactor(
        useRecovery
          ? { challenge, recovery_code: twoFaCode.trim() }
          : { challenge, code: twoFaCode.trim() },
      );
      toast.success("Welcome back! 🎉");
    } catch (err) {
      toast.error(apiMessage(err));
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!fpEmail.trim()) return;
    setFpLoading(true);
    try {
      await authService.forgotPassword(fpEmail.trim());
      setFpSent(true);
    } catch (err) {
      const limited = rateLimitInfo(err);
      if (limited) {
        setRateLimit(limited);
        return;
      }
      toast.error(apiMessage(err));
    } finally {
      setFpLoading(false);
    }
  }

  /* ── Back button ── */
  function BackBtn({ to }: { to: LoginView }) {
    return (
      <button
        type="button"
        onClick={() => switchView(to)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none",
          cursor: "pointer", color: "#5f6675",
          fontSize: 13, fontWeight: 500,
          padding: "0 0 14px 0",
          transition: "color 150ms",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#111827"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#5f6675"; }}
      >
        <ArrowLeft size={14} />
        Back
      </button>
    );
  }

  /* ── Options view ── */
  if (view === "options") {
    return (
      <div key={viewKey} style={{
        animation: "auth-content-in 250ms ease forwards",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {!!GOOGLE_CLIENT_ID && (
          <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogleSignIn} />
            {/* Google's real button lives here, off-screen - startGoogleLogin() clicks it. */}
            <div ref={googleBtnRef} style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }} />
          </>
        )}
        {!!APPLE_SERVICES_ID && (
          <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
            strategy="afterInteractive" onLoad={initAppleSignIn} />
        )}
        <SocialButton icon={<QrCode size={20} color="#fd4605" />}  label="Use QR code"
          onClick={startQrLogin} />
        <SocialButton icon={<User  size={18} color="#fd4605" />}   label="Use phone or email"
          onClick={() => switchView("email")} />
        <SocialButton icon={<GoogleIcon />}   label="Continue with Google"
          onClick={startGoogleLogin} />
        <SocialButton icon={<TikTokIcon />}   label="Continue with TikTok"
          onClick={() => toast.info("TikTok login coming soon!")} />
        <SocialButton icon={<FacebookIcon />} label="Continue with Facebook"
          onClick={() => toast.info("Facebook login coming soon!")} />
        <SocialButton icon={<AppleIcon />}    label="Continue with Apple"
          onClick={handleAppleSignIn} />
      </div>
    );
  }

  /* ── QR-code login view ── */
  if (view === "qr") {
    return (
      <div key={viewKey} style={{ animation: "auth-content-in 250ms ease forwards" }}>
        <BackBtn to="options" />

        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14, padding: "4px 0 8px",
        }}>
          <div style={{
            width: 216, height: 216,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 16, border: "1.5px solid #e5e7eb", background: "#fff",
            position: "relative",
          }}>
            {qrStatus === "loading" && <Spinner />}

            {qrTicket && (qrStatus === "pending" || qrStatus === "scanned") && (
              <>
                <QRCodeSVG value={qrLoginUrl(qrTicket)} size={190} />
                {qrStatus === "scanned" && (
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 16,
                    background: "rgba(255,255,255,0.94)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <Spinner />
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", textAlign: "center", maxWidth: 150 }}>
                      Scanned - confirm on your phone
                    </p>
                  </div>
                )}
              </>
            )}

            {(qrStatus === "denied" || qrStatus === "expired" || qrStatus === "error") && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 16 }}>
                <XCircle size={32} color="#9ca3af" />
                <p style={{ fontSize: 12.5, fontWeight: 700, color: "#5f6675", textAlign: "center" }}>
                  {qrStatus === "denied"
                    ? "Login request denied"
                    : qrStatus === "expired"
                    ? "This code has expired"
                    : "Couldn't load a code. Please try again."}
                </p>
                <button
                  type="button"
                  onClick={startQrLogin}
                  style={{
                    marginTop: 2, background: "none", border: "none", cursor: "pointer",
                    fontSize: 12.5, fontWeight: 700, color: "#fd4605", padding: 0,
                  }}
                >
                  Get a new code
                </button>
              </div>
            )}
          </div>

          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", textAlign: "center" }}>
            {qrStatus === "scanned" ? "Almost there" : "Scan with the Teezer app"}
          </p>
          <p style={{ fontSize: 12, color: "#5f6675", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
            Open Teezer on your phone, tap Scan (top-left of your profile), and point it at this code.
          </p>
        </div>
      </div>
    );
  }

  /* ── Forgot password view ── */
  if (view === "forgot") {
    return (
      <div key={viewKey} style={{ animation: "auth-content-in 250ms ease forwards" }}>
        <BackBtn to="email" />

        {fpSent ? (
          /* ── Success state ── */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 12, padding: "16px 0 8px", textAlign: "center",
          }}>
            <CheckCircle2 size={44} color="#10b981" strokeWidth={1.5} />
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Check your email
            </p>
            <p style={{ fontSize: 13, color: "#5f6675", lineHeight: 1.55, maxWidth: 300 }}>
              We sent a password reset link to{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>{fpEmail}</span>.
              Check your inbox (and spam folder).
            </p>
            <button
              type="button"
              onClick={() => { setFpSent(false); setFpEmail(""); switchView("email"); }}
              style={{
                marginTop: 4,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "#fd4605",
                padding: 0, transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              Back to Log in
            </button>
          </div>
        ) : (
          /* ── Request form ── */
          <form onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rateLimit && <RateLimitBox message={rateLimit.message} retryAfter={rateLimit.retryAfter} />}
            <p style={{ fontSize: 13, color: "#5f6675", marginBottom: 2, lineHeight: 1.5 }}>
              Enter the email address linked to your account and we'll send you a reset link.
            </p>
            <Field
              icon={<Mail size={15} />}
              placeholder="Email address"
              type="email"
              value={fpEmail}
              onChange={(e) => setFpEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={40}
            />
            <button
              type="submit"
              disabled={fpLoading || !fpEmail.trim() || Boolean(rateLimit)}
              style={{
                width: "100%", height: 46,
                borderRadius: 9999, border: "none",
                background: fpLoading || !fpEmail.trim() || rateLimit ? "#f87a96" : "#fd4605",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: fpLoading || !fpEmail.trim() || rateLimit ? "not-allowed" : "pointer",
                transition: "background 150ms",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!fpLoading && fpEmail.trim() && !rateLimit) (e.currentTarget as HTMLElement).style.background = "#e03e04";
              }}
              onMouseLeave={(e) => {
                if (!fpLoading && fpEmail.trim() && !rateLimit) (e.currentTarget as HTMLElement).style.background = "#fd4605";
              }}
            >
              {rateLimit ? `Try again in ${formatCountdown(rateLimit.retryAfter)}` : fpLoading ? <><Spinner /> Sending…</> : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    );
  }

  /* ── Two-factor code view ── */
  if (view === "twofa") {
    return (
      <div key={viewKey} style={{ animation: "auth-content-in 250ms ease forwards" }}>
        <button
          type="button"
          onClick={() => switchView("email")}
          style={{
            display: "flex", alignItems: "center", gap: 5, background: "none",
            border: "none", cursor: "pointer", color: "#5f6675", fontSize: 13,
            fontWeight: 500, padding: "0 0 14px 0",
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <QrCode size={28} style={{ color: "#fd4605" }} />
          <p style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: "#111827" }}>Two-factor verification</p>
          <p style={{ marginTop: 4, fontSize: 13, color: "#5f6675" }}>
            {useRecovery
              ? "Enter one of your recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <form onSubmit={handleTwoFactor} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field
            icon={<Lock size={15} />}
            placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
            type="text"
            value={twoFaCode}
            onChange={(e) => setTwoFaCode(e.target.value)}
            autoComplete="one-time-code"
          />
          <button
            type="submit"
            disabled={isLoading || !twoFaCode.trim()}
            style={{
              width: "100%", height: 46, borderRadius: 9999, border: "none",
              background: isLoading || !twoFaCode.trim() ? "#f87a96" : "#fd4605",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: isLoading || !twoFaCode.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isLoading ? <><Spinner /> Verifying…</> : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => { setUseRecovery((v) => !v); setTwoFaCode(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#5f6675", padding: 0 }}
          >
            {useRecovery ? "Use authenticator code instead" : "Use a recovery code"}
          </button>
        </form>
      </div>
    );
  }

  /* ── Email / password view ── */
  return (
    <div key={viewKey} style={{ animation: "auth-content-in 250ms ease forwards" }}>
      {/* In the ads flow the parent provides the single Back (to Reelsoo/Email). */}
      {!embedded && <BackBtn to="options" />}

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rateLimit && <RateLimitBox message={rateLimit.message} retryAfter={rateLimit.retryAfter} />}
        {globalRestriction && (
          <GlobalRestrictionNotice message={globalRestriction.message} expiresAt={globalRestriction.expiresAt} />
        )}
        {loginRestriction && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "10px 12px",
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 14, fontSize: 12, color: "#991b1b", lineHeight: 1.45,
          }}>
            <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Teezer login is currently unavailable in {loginRestriction.country}.</strong>
              {" "}{loginRestriction.reason}
            </span>
          </div>
        )}
        <Field
          icon={<Mail size={15} />} placeholder="Email or username"
          type="text" value={loginVal}
          onChange={(e) => setLoginVal(e.target.value)}
          autoComplete="username" error={errors.login} maxLength={40}
        />
        <Field
          icon={<Lock size={15} />} placeholder="Password"
          type={showPass ? "text" : "password"}
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" error={errors.password}
          right={
            <button type="button" onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Hide" : "Show"}>
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 7,
            cursor: "pointer", fontSize: 13, color: "#5f6675",
            userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ accentColor: "#fd4605", width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => switchView("forgot")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "#fd4605",
              padding: 0, transition: "opacity 150ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            Forgot password?
          </button>
        </div>

        {/* Cloudflare Turnstile - only rendered when a site key is configured */}
        {turnstileEnabled && (
          <div>
            <Turnstile onToken={setTsToken} />
            {errors.captcha && (
              <p style={{ marginTop: 4, fontSize: 11, color: "#fd4605", textAlign: "center" }}>{errors.captcha}</p>
            )}
          </div>
        )}

        {(() => {
          const disabled = isLoading || Boolean(rateLimit) || Boolean(loginRestriction) || (turnstileEnabled && !tsToken);
          return (
            <button
              type="submit" disabled={disabled}
              style={{
                width: "100%", height: 46,
                borderRadius: 9999, border: "none",
                background: disabled ? "#f87a96" : "#fd4605",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "background 150ms",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
              onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "#e03e04"; }}
              onMouseLeave={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "#fd4605"; }}
            >
              {rateLimit ? `Try again in ${formatCountdown(rateLimit.retryAfter)}` : loginRestriction ? "Login unavailable in your country" : isLoading ? <><Spinner /> Logging in…</> : "Log In"}
            </button>
          );
        })()}
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "spin 0.75s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function RateLimitBox({ message, retryAfter }: { message: string; retryAfter: number }) {
  const lines = message.split("\n").filter(Boolean);
  return (
    <div style={{
      border: "1px solid #fecaca",
      background: "#fef2f2",
      borderRadius: 14,
      padding: "10px 12px",
      color: "#991b1b",
      fontSize: 12,
      lineHeight: 1.45,
    }}>
      <p style={{ fontWeight: 800, margin: 0 }}>{lines[0] || "Too many attempts"}</p>
      <p style={{ margin: "4px 0 0" }}>{lines.slice(1).join(" ") || "For your account safety, login has been temporarily locked."}</p>
      <p style={{ margin: "6px 0 0", fontWeight: 700 }}>Try again in {formatCountdown(retryAfter)}</p>
    </div>
  );
}
