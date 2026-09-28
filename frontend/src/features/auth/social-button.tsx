"use client";

import type { ReactNode } from "react";

interface SocialButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function SocialButton({ icon, label, onClick, disabled }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 44,             /* reduced from 56 → 44 */
        borderRadius: 9999,
        border: "1.5px solid #e5e7eb",
        background: "#ffffff",
        display: "grid",
        gridTemplateColumns: "38px 1fr 38px",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 2px",
        transition: "background 150ms, border-color 150ms",
        opacity: disabled ? 0.55 : 1,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "#f8f9fb";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "#ffffff";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb";
        }
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#111827", letterSpacing: "-0.01em" }}>
        {label}
      </span>
      <span />
    </button>
  );
}

/* ── Brand SVG icons ─────────────────────────────────────────────────── */

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function TikTokIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#000000" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.65a8.16 8.16 0 0 0 4.77 1.52V6.72a4.85 4.85 0 0 1-1-.03z" />
    </svg>
  );
}

export function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function AppleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#000000" aria-hidden>
      <path d="M17.05 12.04c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.95-3.4-2.22-4.13-2.25-1.76-.18-3.43 1.04-4.32 1.04-.89 0-2.26-1.02-3.72-.99-1.91.03-3.68 1.11-4.66 2.82-1.99 3.45-.51 8.55 1.42 11.35.94 1.37 2.06 2.91 3.53 2.85 1.42-.06 1.95-.92 3.66-.92 1.71 0 2.19.92 3.69.89 1.53-.03 2.49-1.39 3.42-2.77 1.08-1.59 1.52-3.13 1.55-3.21-.03-.01-2.97-1.14-3-4.53zM14.2 3.81c.78-.95 1.31-2.27 1.16-3.59-1.13.05-2.49.75-3.3 1.7-.72.84-1.36 2.18-1.19 3.47 1.26.1 2.55-.64 3.33-1.58z" />
    </svg>
  );
}
