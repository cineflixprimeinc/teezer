"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { toast } from "sonner";
import {
  Eye, EyeOff, Lock, Mail, User, AtSign, Circle,
  ArrowLeft, CheckCircle2, Pencil, AlertCircle, Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { apiMessage, rateLimitInfo, globalFeatureError } from "@/services/api";
import { GlobalRestrictionNotice } from "@/components/global-restriction-notice";
import { authService } from "@/services/auth.service";
import { countryService } from "@/services/country.service";
import { SocialButton, GoogleIcon, TikTokIcon, FacebookIcon, AppleIcon } from "./social-button";
import { CountrySelect } from "./country-select";
import { DOBPicker } from "./dob-picker";
import { WORLD_COUNTRIES } from "./world-countries";

type SignupView = "options" | "emailSignup";

/* Same client_id, same GIS init, same reasoning as login-content.tsx's own
 * copy - completeSocial() find-or-creates, so "sign up with Google" and
 * "log in with Google" are the exact same server call; there's no separate
 * signup-flavored endpoint to call here. Kept as a second copy rather than
 * shared, matching how this file already duplicates rather than imports
 * login-content.tsx's other auth logic. */
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
  }
}
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

/* Live password rules - kept in sync with validate(). Shown as a checklist that
   lights up green as each requirement is met while the user types. */
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "8-20 characters", test: (p) => p.length >= 8 && p.length <= 20 },
  { label: "lowercase",       test: (p) => /[a-z]/.test(p) },
  { label: "uppercase",       test: (p) => /[A-Z]/.test(p) },
  { label: "number",          test: (p) => /[0-9]/.test(p) },
  { label: "special char",    test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/* ── Pill input ─────────────────────────────────────────────────────────── */
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
          position: "absolute", left: 16, top: "50%",
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
            height: 52,
            borderRadius: 9999,
            border: `1.5px solid ${error ? "#fd4605" : "#e5e7eb"}`,
            background: props.disabled ? "#f9fafb" : "#fff",
            padding: right ? "0 48px 0 44px" : "0 16px 0 44px",
            fontSize: 14,
            color: "#111827",
            outline: "none",
            transition: "border-color 150ms, box-shadow 150ms",
            boxSizing: "border-box",
          }}
          {...props}
        />
        {right && (
          <span style={{
            position: "absolute", right: 14, top: "50%",
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center",
            color: "#9ca3af", cursor: "pointer",
          }}>
            {right}
          </span>
        )}
      </div>
      {error && (
        <p style={{ marginTop: 4, paddingLeft: 16, fontSize: 11, color: "#fd4605" }}>{error}</p>
      )}
    </div>
  );
}

/* ── 6-box OTP input ────────────────────────────────────────────────────── */
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("").slice(0, 6);
  while (digits.length < 6) digits.push("");

  function handleChange(idx: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const arr = [...digits];
    arr[idx] = digit;
    onChange(arr.join(""));
    if (digit && idx < 5) refs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      const arr = [...digits];
      if (arr[idx]) { arr[idx] = ""; onChange(arr.join("")); }
      else if (idx > 0) { arr[idx - 1] = ""; onChange(arr.join("")); refs.current[idx - 1]?.focus(); }
    } else if (e.key === "ArrowLeft"  && idx > 0) refs.current[idx - 1]?.focus();
      else if (e.key === "ArrowRight" && idx < 5) refs.current[idx + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, "").slice(0, 6));
    setTimeout(() => refs.current[Math.min(pasted.length, 5)]?.focus(), 0);
  }

  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: "calc((100% - 30px) / 6)",
            minWidth: 0,
            maxWidth: 52,
            height: 52,
            borderRadius: 12,
            border: `1.5px solid ${d ? "#fd4605" : "#e5e7eb"}`,
            background: "#fff",
            fontSize: 20,
            fontWeight: 700,
            color: "#111827",
            textAlign: "center",
            outline: "none",
            transition: "border-color 150ms",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

type Errs = Partial<Record<"name" | "username" | "email" | "password" | "dob" | "country" | "otp", string>>;

export function SignupContent({ startView = "options", embedded = false }: { startView?: SignupView; embedded?: boolean } = {}) {
  const { register, isLoading, openAuthModal, applySsoAuth } = useAuthStore();
  const [view, setView] = useState<SignupView>(startView);

  /* ── Google sign-in ── */
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function initGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID || !window.google) return;
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
    // Render Google's own button off-screen and forward clicks to it (see
    // login-content.tsx's copy of this comment for why prompt()/One Tap alone
    // isn't reliable enough to be the primary trigger).
    if (window.google && googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, { type: "standard" });
    }
    setGoogleReady(true);
  }

  // Same fix as login-content.tsx: this modal fully unmounts on close, so
  // every reopen is a fresh instance with googleReady back to false while
  // the <Script> below only ever loads the SDK once (Next dedupes by src) -
  // its onLoad won't refire for the new instance, leaving the button stuck
  // on "still loading" forever. Init immediately if the SDK is already
  // loaded, or poll briefly if it's still mid-flight from another mount.
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
      if (result.twoFactorRequired) {
        // No 2FA UI on this page (Signup is options-or-email-form only) - an
        // account that already has 2FA set up isn't really "signing up"
        // anyway, so hand off to the flow that can actually clear it.
        toast.info("This account has 2-factor authentication enabled - continue on the login page.");
        openAuthModal("login");
        return;
      }
      applySsoAuth({ token: result.auth.token, expires_at: result.auth.expires_at, user: result.auth.user });
      toast.success("Welcome to Teezer! 🎉");
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
      if (result.twoFactorRequired) {
        // No 2FA UI on this page, same as handleGoogleCredential above.
        toast.info("This account has 2-factor authentication enabled - continue on the login page.");
        openAuthModal("login");
        return;
      }
      applySsoAuth({ token: result.auth.token, expires_at: result.auth.expires_at, user: result.auth.user });
      toast.success("Welcome to Teezer! 🎉");
    } catch (err) {
      // Dismissing the popup is a normal outcome, not a failure worth a toast.
      const code = (err as { error?: string })?.error;
      if (code === "popup_closed_by_user" || code === "user_cancelled_authorize") return;
      toast.error(apiMessage(err));
    }
  }

  function startGoogleSignup() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google sign-in isn't configured yet.");
      return;
    }
    if (!googleReady || !window.google) {
      toast.error("Google sign-in is still loading - try again in a moment.");
      return;
    }
    const realBtn = googleBtnRef.current?.querySelector<HTMLElement>('div[role="button"]');
    if (realBtn) { realBtn.click(); return; }
    window.google.accounts.id.prompt();
  }

  const [name,        setName]        = useState("");
  const [username,    setUsername]    = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [dob,         setDob]         = useState("");
  const [country,     setCountry]     = useState("");
  const [countryCode, setCountryCode] = useState("");
  /** From the same detect() call below - UX signal only, the backend
   *  re-checks independently at submit time (see country.service.ts). */
  const [signupRestriction, setSignupRestriction] = useState<{ country: string; reason: string } | null>(null);
  /* Global Reelsoo Control - admin-side kill switch, distinct from the
   * country restriction above. Both freeze the button; only this one can
   * carry an expected return time. */
  const [globalRestriction, setGlobalRestriction] = useState<{ message: string; expiresAt: string | null } | null>(null);
  /** Every disabled country's code, for the dropdown - a separate fetch
   *  since detect() above only answers for the ONE detected country. */
  const [disabledCountryCodes, setDisabledCountryCodes] = useState<Set<string>>(new Set());
  /** The full country list, from the SAME fetch as disabledCountryCodes -
   *  the backend-authoritative dataset (IsoCountries::map(), 247 codes),
   *  same source the admin panel's Country Availability page reads from.
   *  Passed to CountrySelect so signup and admin can never drift onto two
   *  different lists again. Starts null (CountrySelect falls back to its
   *  own default WORLD_COUNTRIES list) until this resolves, so a slow/failed
   *  fetch never blocks signup. */
  const [backendCountries, setBackendCountries] = useState<{ name: string; code: string }[] | null>(null);
  /** "Allow Manual Country Change" admin setting - defaults to true (today's
   *  behavior) until detect() resolves. UX only; the backend always
   *  evaluates the detected country regardless of this. */
  const [allowManualCountryChange, setAllowManualCountryChange] = useState(true);
  const [errors,      setErrors]      = useState<Errs>({});
  const [rateLimit,   setRateLimit]   = useState<{ message: string; retryAfter: number } | null>(null);

  /* OTP + draft */
  const [otp,           setOtp]           = useState("");
  const [otpLoading,    setOtpLoading]    = useState(false);
  const [otpSent,       setOtpSent]       = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resendTimer,   setResendTimer]   = useState(0);
  const [draftToken,    setDraftToken]    = useState("");

  /* Username availability */
  const [usernameStatus,  setUsernameStatus]  = useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Timers ── */
  useEffect(() => {
    if (!rateLimit?.retryAfter) return;
    const t = window.setInterval(() => {
      setRateLimit((c) => {
        if (!c) return null;
        const next = c.retryAfter - 1;
        return next > 0 ? { ...c, retryAfter: next } : null;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [rateLimit?.retryAfter]);

  useEffect(() => {
    if (!resendTimer) return;
    const t = window.setInterval(() => setResendTimer((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [resendTimer]);

  /* ── Country auto-detect ── */
  useEffect(() => {
    let cancelled = false;
    countryService.detect()
      .then((d) => {
        if (cancelled) return;
        const match = WORLD_COUNTRIES.find((c) => c.code === d.countryCode);
        if (match) {
          setCountry((cur) => cur || match.name);
          setCountryCode((cur) => cur || match.code);
        }
        if (!d.signupAllowed) {
          setSignupRestriction({ country: d.countryName, reason: d.signupReason || "Teezer is currently unavailable in your country." });
        }
        setAllowManualCountryChange(d.allowManualCountryChange);
      })
      .catch(() => {});
    countryService.availabilityList()
      .then((list) => {
        if (cancelled) return;
        setDisabledCountryCodes(new Set(list.countries.filter((c) => !c.enabled).map((c) => c.code)));
        setBackendCountries(list.countries.map((c) => ({ name: c.name, code: c.code })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* ── Restore draft from sessionStorage (after email link verification) ── */
  useEffect(() => {
    if (view !== "emailSignup") return;
    try {
      const raw = sessionStorage.getItem("reelsoo_signup_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.draftToken) setDraftToken(draft.draftToken);
      if (draft.email)      setEmail(draft.email);
      if (draft.name)       setName(draft.name);
      if (draft.username)   { setUsername(draft.username); setUsernameStatus("available"); setUsernameMessage("Username available."); }
      if (draft.dob)        setDob(draft.dob);
      if (draft.country)    setCountry(draft.country);
      if (draft.countryCode) setCountryCode(draft.countryCode);
      if (draft.emailVerified) { setEmailVerified(true); setOtpSent(true); }
      sessionStorage.removeItem("reelsoo_signup_draft");
    } catch {}
  }, [view]);

  /* ── Username availability debounce ── */
  function handleUsernameChange(raw: string) {
    const val = raw.replace(/\s/g, "").toLowerCase();
    setUsername(val);
    setUsernameStatus("idle");
    setUsernameMessage("");

    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);

    if (!val) return;

    if (!/^[a-zA-Z0-9_.]+$/.test(val)) {
      setUsernameStatus("invalid");
      setUsernameMessage("Only letters, numbers, underscore and dot allowed.");
      return;
    }
    if (val.length < 3) {
      setUsernameStatus("invalid");
      setUsernameMessage("Must be at least 3 characters.");
      return;
    }
    if (val.length > 25) {
      setUsernameStatus("invalid");
      setUsernameMessage("Cannot exceed 25 characters.");
      return;
    }

    setUsernameStatus("checking");
    usernameDebounce.current = setTimeout(async () => {
      try {
        const res = await authService.checkUsernamePublic(val);
        setUsernameStatus(res.available ? "available" : "taken");
        setUsernameMessage(res.message);
      } catch {
        setUsernameStatus("idle");
        setUsernameMessage("");
      }
    }, 500);
  }

  function handleCountryChange(name: string) {
    setCountry(name);
    const match = WORLD_COUNTRIES.find((c) => c.name === name);
    setCountryCode(match ? match.code : "");
  }

  function isValidEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  }

  function validate(): Errs {
    const e: Errs = {};
    if (!name.trim())      e.name     = "Full name required.";
    if (!username.trim())  e.username = "Username required.";
    else if (usernameStatus === "taken")   e.username = "Username already taken.";
    else if (usernameStatus === "invalid") e.username = usernameMessage;
    else if (usernameStatus === "checking") e.username = "Please wait for username check to complete.";
    if (!email.trim())     e.email    = "Email required.";
    else if (!isValidEmail(email)) e.email = "Enter a valid email.";
    if (!password)         e.password = "Password required.";
    else if (password.length < 8 || password.length > 20) e.password = "Password must be 8-20 characters.";
    else if (!/[a-z]/.test(password)) e.password = "Include at least one lowercase letter.";
    else if (!/[A-Z]/.test(password)) e.password = "Include at least one uppercase letter.";
    else if (!/[0-9]/.test(password)) e.password = "Include at least one number.";
    else if (!/[^A-Za-z0-9]/.test(password)) e.password = "Include at least one special character.";
    if (!dob)              e.dob      = "Date of birth required.";
    else {
      const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 13) e.dob = "Must be at least 13 years old.";
    }
    if (!country) e.country = "Please select a country.";
    return e;
  }

  async function handleSendOtp() {
    if (!email.trim() || !isValidEmail(email)) {
      setErrors({ ...errors, email: "Enter a valid email." });
      return;
    }
    setOtpLoading(true);
    try {
      const res = await authService.sendSignupOtp({
        email:         email.trim(),
        name:          name.trim() || undefined,
        username:      username.trim() || undefined,
        date_of_birth: dob || undefined,
        country:       country || undefined,
        country_code:  countryCode || undefined,
      });
      setDraftToken(res.draft_token);
      /* persist draft_token in sessionStorage so page refresh doesn't lose it */
      sessionStorage.setItem("reelsoo_draft_token", res.draft_token);
      setOtpSent(true);
      setOtp("");
      setErrors((e) => ({ ...e, email: undefined, otp: undefined }));
      setResendTimer(30);
      toast.success("Verification code sent to your email!");
    } catch (err) {
      const blocked = globalFeatureError(err);
      if (blocked) {
        // A banner already states the reason and expected return time -
        // a toast on top would just repeat it.
        setGlobalRestriction({ message: blocked.message, expiresAt: blocked.expiresAt });
      } else {
        toast.error(apiMessage(err));
      }
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    /* ── Step 1: verify OTP ── */
    if (!emailVerified) {
      if (!otpSent) { toast.error("Please send the verification code to your email first."); return; }
      const digits = otp.replace(/\D/g, "");
      if (digits.length < 6) { setErrors({ ...errors, otp: "Enter the full 6-digit code." }); return; }

      setOtpLoading(true);
      try {
        const res = await authService.verifySignupOtp({
          email:       email.trim(),
          otp:         digits,
          draft_token: draftToken || undefined,
        });
        setEmailVerified(true);
        setDraftToken(res.draft_token);
        setErrors({});
        toast.success("Email verified!");
      } catch (err) {
        const blocked = globalFeatureError(err);
        if (blocked) {
          setGlobalRestriction({ message: blocked.message, expiresAt: blocked.expiresAt });
        } else {
          const fallback = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setErrors({ ...errors, otp: fallback || "Invalid or expired code." });
        }
      } finally {
        setOtpLoading(false);
      }
      return;
    }

    /* ── Step 2: create account ── */
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!draftToken) { toast.error("Session expired. Please send OTP again."); return; }

    setErrors({});
    try {
      await register({
        name:                  name.trim(),
        username:              username.trim(),
        email:                 email.trim(),
        password,
        password_confirmation: password,
        date_of_birth:         dob,
        country,
        draft_token:           draftToken,
        ...(countryCode ? { country_code: countryCode } : {}),
      });
      sessionStorage.removeItem("reelsoo_draft_token");
      toast.success("Account created! Welcome to Teezer 🎉");
    } catch (err) {
      const limited = rateLimitInfo(err);
      if (limited) { setRateLimit(limited); return; }
      const blocked = globalFeatureError(err);
      if (blocked) { setGlobalRestriction({ message: blocked.message, expiresAt: blocked.expiresAt }); return; }
      toast.error(apiMessage(err));
    }
  }

  /* ── Username status icon ── */
  function UsernameIcon() {
    if (usernameStatus === "checking") return <Loader2 size={15} style={{ animation: "spin 0.75s linear infinite" }} />;
    if (usernameStatus === "available") return <CheckCircle2 size={15} color="#16a34a" />;
    if (usernameStatus === "taken" || usernameStatus === "invalid") return <AlertCircle size={15} color="#fd4605" />;
    return null;
  }

  /* ── OPTIONS VIEW ─────────────────────────────────────────────────────── */
  if (view === "options") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!!GOOGLE_CLIENT_ID && (
          <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogleSignIn} />
            {/* Google's real button lives here, off-screen - startGoogleSignup() clicks it. */}
            <div ref={googleBtnRef} style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }} />
          </>
        )}
        {!!APPLE_SERVICES_ID && (
          <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
            strategy="afterInteractive" onLoad={initAppleSignIn} />
        )}
        <button
          type="button"
          onClick={() => setView("emailSignup")}
          style={{
            width: "100%", height: 48,
            borderRadius: 9999, border: "1.5px solid #e5e7eb",
            background: "#fff", color: "#111827", fontSize: 14, fontWeight: 600,
            cursor: "pointer", transition: "all 150ms",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#fd4605";
            (e.currentTarget as HTMLElement).style.background  = "#fff5f8";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
            (e.currentTarget as HTMLElement).style.background  = "#fff";
          }}
        >
          <Mail size={18} color="#fd4605" /> Continue with Email
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          <span style={{ fontSize: 12, color: "#9ca3af" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        </div>

        <SocialButton icon={<GoogleIcon />}   label="Continue with Google"   onClick={startGoogleSignup} />
        <SocialButton icon={<TikTokIcon />}   label="Continue with TikTok"   onClick={() => toast.info("TikTok signup coming soon!")} />
        <SocialButton icon={<FacebookIcon />} label="Continue with Facebook" onClick={() => toast.info("Facebook signup coming soon!")} />
        <SocialButton icon={<AppleIcon />}    label="Continue with Apple"    onClick={handleAppleSignIn} />
      </div>
    );
  }

  /* ── EMAIL SIGNUP VIEW ────────────────────────────────────────────────── */
  const otpReady    = otp.replace(/\D/g, "").length === 6;
  const usernameOk  = usernameStatus === "available" || usernameStatus === "idle";
  const btnDisabled = otpLoading || isLoading || Boolean(rateLimit) || Boolean(signupRestriction)
    || (!emailVerified && otpSent && !otpReady)
    || (!emailVerified && !otpSent);

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Back button - hidden in the ads flow, where the parent owns the single Back. */}
      {!embedded && (
        <button
          type="button"
          onClick={() => {
            setView("options");
            setErrors({});
            setOtpSent(false);
            setEmailVerified(false);
            setOtp("");
            setDraftToken("");
          }}
          style={{
            alignSelf: "flex-start", background: "none", border: "none",
            color: "#5f6675", fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            padding: "0 0 2px 0", transition: "color 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#111827"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#5f6675"; }}
        >
          <ArrowLeft size={15} /> Back to signup options
        </button>
      )}

      {/* Section heading */}
      <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "2px 0 4px" }}>
        Create account with email
      </p>

      {rateLimit && <RateLimitBox message={rateLimit.message} retryAfter={rateLimit.retryAfter} />}

      {/* Full Name */}
      <Field
        icon={<User size={16} />} placeholder="Full Name"
        type="text" value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name" error={errors.name} maxLength={20}
        right={
          <span style={{ fontSize: 11, fontWeight: 600, pointerEvents: "none",
            color: name.length >= 20 ? "#fd4605" : "#9ca3af" }}>
            {name.length > 0 ? `${name.length}/20` : ""}
          </span>
        }
      />

      {/* Username with availability indicator */}
      <div style={{ width: "100%" }}>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 16, top: "50%",
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center",
            color: "#9ca3af", pointerEvents: "none",
          }}>
            <AtSign size={16} />
          </span>
          <input
            className="auth-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            autoComplete="username"
            maxLength={25}
            style={{
              width: "100%", height: 52, borderRadius: 9999,
              border: `1.5px solid ${
                errors.username || usernameStatus === "taken" || usernameStatus === "invalid"
                  ? "#fd4605"
                  : usernameStatus === "available"
                  ? "#16a34a"
                  : "#e5e7eb"
              }`,
              background: "#fff",
              padding: "0 78px 0 44px",
              fontSize: 14, color: "#111827", outline: "none",
              transition: "border-color 150ms",
              boxSizing: "border-box" as const,
            }}
          />
          <span style={{
            position: "absolute", right: 14, top: "50%",
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {username.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600,
                color: username.length >= 25 ? "#fd4605" : "#9ca3af" }}>
                {username.length}/25
              </span>
            )}
            <UsernameIcon />
          </span>
        </div>
        {/* Username status message */}
        {usernameStatus === "available" && (
          <p style={{ marginTop: 4, paddingLeft: 16, fontSize: 11, color: "#16a34a" }}>
            {usernameMessage}
          </p>
        )}
        {(usernameStatus === "taken" || usernameStatus === "invalid") && (
          <p style={{ marginTop: 4, paddingLeft: 16, fontSize: 11, color: "#fd4605" }}>
            {usernameMessage}
          </p>
        )}
        {errors.username && usernameStatus !== "taken" && usernameStatus !== "invalid" && (
          <p style={{ marginTop: 4, paddingLeft: 16, fontSize: 11, color: "#fd4605" }}>{errors.username}</p>
        )}
      </div>

      {/* Date of birth */}
      <DOBPicker value={dob} onChange={setDob} error={errors.dob} />

      {/* Country */}
      <CountrySelect value={country} onChange={handleCountryChange} error={errors.country} disabledCodes={disabledCountryCodes} countries={backendCountries ?? undefined} locked={!allowManualCountryChange} />

      {/* Email + Send OTP */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Field
            icon={<Mail size={16} />} placeholder="email@gmail.com"
            type="email" value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (otpSent) { setOtpSent(false); setEmailVerified(false); setOtp(""); setDraftToken(""); }
            }}
            autoComplete="email" error={errors.email}
            disabled={emailVerified} maxLength={40}
          />
        </div>

        {!emailVerified && (
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={otpLoading || !email.trim() || !isValidEmail(email) || resendTimer > 0}
            style={{
              height: 52, flexShrink: 0,
              borderRadius: 9999, border: "none",
              background: (otpLoading || !email.trim() || !isValidEmail(email) || resendTimer > 0)
                ? "#f87a96" : "#fd4605",
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: (otpLoading || !email.trim() || !isValidEmail(email) || resendTimer > 0)
                ? "not-allowed" : "pointer",
              padding: "0 18px", whiteSpace: "nowrap",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => {
              const ok = !otpLoading && email.trim() && isValidEmail(email) && !resendTimer;
              if (ok) (e.currentTarget as HTMLElement).style.background = "#e03e04";
            }}
            onMouseLeave={(e) => {
              const ok = !otpLoading && email.trim() && isValidEmail(email) && !resendTimer;
              if (ok) (e.currentTarget as HTMLElement).style.background = "#fd4605";
            }}
          >
            {otpLoading ? "Sending…"
              : resendTimer > 0 ? `Resend in ${formatCountdown(resendTimer)}`
              : otpSent ? "Resend OTP" : "Send OTP"}
          </button>
        )}

        {emailVerified && (
          <div style={{
            height: 52, display: "flex", alignItems: "center", gap: 6,
            color: "#16a34a", fontSize: 13, fontWeight: 600,
            flexShrink: 0, paddingRight: 4,
          }}>
            <CheckCircle2 size={18} /> Verified
          </div>
        )}
      </div>

      {/* Password */}
      <div style={{ width: "100%" }}>
        <Field
          icon={<Lock size={16} />} placeholder="Password"
          type={showPass ? "text" : "password"}
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" error={errors.password} maxLength={20}
          right={
            <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Hide" : "Show"}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />
        {/* Live requirement checklist - appears once the user starts typing */}
        {password.length > 0 && (
          <div style={{ marginTop: 6, paddingLeft: 16, display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <span key={r.label} style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3,
                  color: ok ? "#16a34a" : "#9ca3af" }}>
                  {ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  {r.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* OTP section - always visible below password when not yet verified */}
      {!emailVerified && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 10,
          padding: "14px 16px",
          background: "#fafafa", border: `1.5px solid ${otpSent ? "#e5e7eb" : "#f0f0f0"}`,
          borderRadius: 16, marginTop: 2,
        }}>
          {!otpSent ? (
            /* ── Placeholder before OTP is sent ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>
                Email verification code
              </span>
              <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{
                    width: "calc((100% - 30px) / 6)", minWidth: 0, maxWidth: 52,
                    height: 52, borderRadius: 12,
                    border: "1.5px solid #f0f0f0", background: "#f9fafb",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, fontWeight: 700, color: "#d1d5db",
                    boxSizing: "border-box" as const,
                  }}>-</div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#b0b5be", margin: 0, lineHeight: 1.5 }}>
                Enter your email above and tap <strong>Send OTP</strong> to receive your 6-digit code.
              </p>
            </div>
          ) : (
            /* ── Active OTP entry after Send OTP ── */
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  Enter verification code
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setErrors((e) => ({ ...e, otp: undefined }));
                  }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#6b7280", fontSize: 12, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 4, padding: 0,
                    transition: "color 150ms",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#111827"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                >
                  <Pencil size={12} /> Back to email
                </button>
              </div>

              <OtpBoxes value={otp} onChange={setOtp} />

              {errors.otp && <p style={{ fontSize: 12, color: "#fd4605", margin: 0 }}>{errors.otp}</p>}

              <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
                We sent a 6-digit code to <strong>{email}</strong>.
              </p>
            </>
          )}
        </div>
      )}

      {/* Country restriction banner - detected server-side; the button below
          is frozen too, but the real enforcement is register()'s own catch,
          not this UI (see CountryAvailabilityService's docblock). */}
      {signupRestriction && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "10px 16px",
          background: "#fef2f2", border: "1.5px solid #fecaca",
          borderRadius: 12, fontSize: 12.5, color: "#991b1b", lineHeight: 1.5,
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Teezer is currently unavailable in {signupRestriction.country}.</strong>
            {" "}{signupRestriction.reason}
          </span>
        </div>
      )}

      {/* Global Reelsoo Control banner - unlike the country restriction above,
          this comes from a failed attempt (send-otp/verify/register can each
          hit it) rather than a proactive check, and an admin can flip it back
          on at any moment - so it's informational only and never disables the
          button, or a user would be stuck with no way to retry. */}
      {globalRestriction && (
        <GlobalRestrictionNotice message={globalRestriction.message} expiresAt={globalRestriction.expiresAt} />
      )}

      {/* Email verified banner */}
      {emailVerified && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px",
          background: "#f0fdf4", border: "1.5px solid #bbf7d0",
          borderRadius: 12, fontSize: 13, color: "#15803d", fontWeight: 600,
        }}>
          <CheckCircle2 size={16} /> Email verified successfully
        </div>
      )}

      {/* Main CTA */}
      <button
        type="submit"
        disabled={btnDisabled}
        style={{
          width: "100%", height: 54, marginTop: 4,
          borderRadius: 9999, border: "none",
          background: btnDisabled ? "#f87a96" : "#fd4605",
          color: "#fff", fontSize: 15, fontWeight: 700,
          cursor: btnDisabled ? "not-allowed" : "pointer",
          transition: "background 150ms",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
        onMouseEnter={(e) => { if (!btnDisabled) (e.currentTarget as HTMLElement).style.background = "#e03e04"; }}
        onMouseLeave={(e) => { if (!btnDisabled) (e.currentTarget as HTMLElement).style.background = "#fd4605"; }}
      >
        {rateLimit
          ? `Try again in ${formatCountdown(rateLimit.retryAfter)}`
          : signupRestriction
          ? "Signup unavailable in your country"
          : isLoading
          ? <><Spinner /> Creating account…</>
          : otpLoading
          ? <><Spinner /> {emailVerified ? "Creating…" : "Verifying…"}</>
          : emailVerified
          ? "Create Account"
          : "Verify email to continue"}
      </button>
    </form>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
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
      border: "1px solid #fecaca", background: "#fef2f2",
      borderRadius: 14, padding: "10px 12px",
      color: "#991b1b", fontSize: 12, lineHeight: 1.45,
    }}>
      <p style={{ fontWeight: 800, margin: 0 }}>{lines[0] || "Too many attempts"}</p>
      <p style={{ margin: "4px 0 0" }}>{lines.slice(1).join(" ") || "Please wait before trying again."}</p>
      <p style={{ margin: "6px 0 0", fontWeight: 700 }}>Try again in {formatCountdown(retryAfter)}</p>
    </div>
  );
}
