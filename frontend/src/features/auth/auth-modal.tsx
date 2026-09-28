"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Logo } from "@/components/ui/logo";
import { LoginContent } from "./login-content";
import { SignupContent } from "./signup-content";

const COPY = {
  login: {
    title:    "Log in to Teezer",
    subtitle: "Welcome back to your video world",
    switch:   "Don't have an account?",
    cta:      "Sign up",
    next:     "signup" as const,
  },
  signup: {
    title:    "Create your Teezer account",
    subtitle: "Join Teezer and start sharing your moments",
    switch:   "Already have an account?",
    cta:      "Log in",
    next:     "login" as const,
  },
} as const;

/* ── Compact terms line ────────────────────────────────────────────────── */
function TermsLine({ mode }: { mode: "login" | "signup" }) {
  return (
    <p style={{
      textAlign: "center",
      fontSize: 11,
      lineHeight: 1.55,
      color: "#9ca3af",
      marginTop: 14,
    }}>
      {mode === "login" ? (
        <>
          By continuing you agree to our{" "}
          <a href="/terms"   style={{ color: "#6b7280", textDecoration: "underline" }}>Terms</a>
          {" & "}
          <a href="/privacy" style={{ color: "#6b7280", textDecoration: "underline" }}>Privacy Policy</a>
        </>
      ) : (
        <>
          By signing up you agree to our{" "}
          <a href="/terms"   style={{ color: "#6b7280", textDecoration: "underline" }}>Terms</a>
          {" & "}
          <a href="/privacy" style={{ color: "#6b7280", textDecoration: "underline" }}>Privacy Policy</a>
        </>
      )}
    </p>
  );
}

/* ── Main modal ────────────────────────────────────────────────────────── */
export function AuthModal() {
  const { authModalOpen, authModalMode, openAuthModal, closeAuthModal } = useAuthStore();
  const [mounted,    setMounted]    = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  /* Escape to close */
  useEffect(() => {
    if (!authModalOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeAuthModal(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [authModalOpen, closeAuthModal]);

  /* Scroll body to top on mode switch */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [authModalMode]);

  if (!mounted || !authModalOpen) return null;

  const copy = COPY[authModalMode];

  function switchMode() {
    setContentKey((k) => k + 1);
    openAuthModal(copy.next);
  }

  const modal = (
    /* Overlay */
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) closeAuthModal(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "auth-overlay-in 250ms ease forwards",
      }}
    >
      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        style={{
          position: "relative",
          background: "#ffffff",
          borderRadius: 26,
          /* ── KEY: tighter max-width & max-height so it fits 1366×768 ── */
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.20)",
          animation: "auth-modal-in 300ms cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        {/* Close button */}
        <CloseBtn onClose={closeAuthModal} />

        {/* ── Scrollable body ── */}
        <div
          ref={scrollRef}
          className="hide-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            /* Compact vertical padding */
            padding: "32px 44px 16px",
          }}
        >
          {/* Logo - smaller at compact mode */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/teezer-logo.png" alt="Teezer" style={{ height: 32, width: "auto" }} />
          </div>

          {/* Title */}
          <h2 style={{
            textAlign: "center",
            fontSize: 20,
            fontWeight: 800,
            color: "#111827",
            margin: "0 0 5px",
            letterSpacing: "-0.02em",
          }}>
            {copy.title}
          </h2>

          {/* Subtitle */}
          <p style={{
            textAlign: "center",
            fontSize: 13,
            color: "#6b7280",
            margin: "0 0 20px",
            lineHeight: 1.4,
          }}>
            {copy.subtitle}
          </p>

          {/* Content - key triggers re-animation on mode switch */}
          <div key={contentKey}>
            {authModalMode === "login" ? <LoginContent /> : <SignupContent />}
          </div>

          <TermsLine mode={authModalMode} />
        </div>

        {/* ── Sticky footer ── */}
        <div style={{
          flexShrink: 0,
          borderTop: "1.5px solid #f0f0f0",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
        }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{copy.switch}</span>
          <button
            type="button"
            onClick={switchMode}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: "#fd4605",
              padding: 0,
              transition: "opacity 150ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {copy.cta}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/* ── Close button ─────────────────────────────────────────────────────── */
function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        background: "#f3f4f6",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        transition: "background 150ms",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#e5e7eb"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; }}
    >
      <X size={15} color="#374151" strokeWidth={2.5} />
    </button>
  );
}
