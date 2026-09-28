"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { authService } from "@/services/auth.service";

type State = "loading" | "success_signup" | "success_login" | "already_verified" | "error";

function VerifyEmailContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [state,      setState]      = useState<State>("loading");
  const [message,    setMessage]    = useState("");
  const [email,      setEmail]      = useState("");
  const [draftToken, setDraftToken] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); setMessage("No verification token found in the link."); return; }

    authService.verifyEmailLink(token)
      .then((res) => {
        setEmail(res.email ?? "");
        if (res.flow === "signup") {
          setDraftToken(res.draft_token ?? "");
          setState("success_signup");
          setMessage(res.message);
        } else if (res.flow === "already_verified") {
          setState("already_verified");
          setMessage(res.message);
          setTimeout(() => router.push("/?action=login"), 3000);
        } else {
          setState("success_login");
          setMessage(res.message);
        }
      })
      .catch((err) => {
        setState("error");
        setMessage(err?.response?.data?.message || "Verification link is invalid or has expired.");
      });
  }, [token]);

  function continueSignup() {
    sessionStorage.setItem("reelsoo_signup_draft", JSON.stringify({
      draftToken,
      email,
      emailVerified: true,
    }));
    router.push("/?action=signup");
  }

  function continueLogin() {
    sessionStorage.setItem("reelsoo_login_prefill", JSON.stringify({ email }));
    router.push("/?action=login");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f4f5f7",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 24,
        padding: "48px 40px",
        maxWidth: 460,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
      }}>
        {/* Logo */}
        <p style={{ margin: "0 0 32px", fontSize: 22, fontWeight: 800, color: "#fd4605" }}>
          &#9654; Teezer
        </p>

        {/* Loading */}
        {state === "loading" && (
          <>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <Loader2 size={48} color="#fd4605" style={{ margin: "0 auto 16px", animation: "spin 0.75s linear infinite", display: "block" }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Verifying your email…</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Please wait a moment.</p>
          </>
        )}

        {/* Success - continue to signup */}
        {state === "success_signup" && (
          <>
            <CheckCircle2 size={56} color="#16a34a" style={{ margin: "0 auto 16px", display: "block" }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>Email Verified!</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 32px", lineHeight: 1.6 }}>
              Your email <strong>{email}</strong> has been verified. Continue to complete your Teezer account.
            </p>
            <button onClick={continueSignup} style={btnStyle}>
              Continue Sign Up <ArrowRight size={16} />
            </button>
          </>
        )}

        {/* Success - continue to login */}
        {state === "success_login" && (
          <>
            <CheckCircle2 size={56} color="#16a34a" style={{ margin: "0 auto 16px", display: "block" }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>Email Verified!</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 32px", lineHeight: 1.6 }}>
              Your email <strong>{email}</strong> has been verified. You can now log in to your Teezer account.
            </p>
            <button onClick={continueLogin} style={btnStyle}>
              Continue to Log In <ArrowRight size={16} />
            </button>
          </>
        )}

        {/* Already verified - auto-redirect to login */}
        {state === "already_verified" && (
          <>
            <CheckCircle2 size={56} color="#fd4605" style={{ margin: "0 auto 16px", display: "block" }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>Already Verified!</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 32px", lineHeight: 1.6 }}>
              <strong>{email}</strong> is already verified. Redirecting you to login…
            </p>
            <button onClick={continueLogin} style={btnStyle}>
              Log In Now <ArrowRight size={16} />
            </button>
          </>
        )}

        {/* Error */}
        {state === "error" && (
          <>
            <XCircle size={56} color="#dc2626" style={{ margin: "0 auto 16px", display: "block" }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>Verification Failed</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 32px", lineHeight: 1.6 }}>
              {message || "The verification link is invalid or has expired. Please request a new code."}
            </p>
            <button onClick={() => router.push("/?action=signup")} style={{ ...btnStyle, background: "#fff", color: "#111827", border: "1.5px solid #e5e7eb" }}>
              Back to Sign Up
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: "100%", height: 52,
  borderRadius: 9999, border: "none",
  background: "#fd4605", color: "#fff",
  fontSize: 15, fontWeight: 700,
  cursor: "pointer", transition: "background 150ms",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f5f7" }}>
        <p style={{ color: "#6b7280", fontFamily: "sans-serif" }}>Loading…</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
