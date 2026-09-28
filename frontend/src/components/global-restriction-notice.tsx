"use client";

/**
 * Inline "why is this blocked" banner for a Global Teezer Control denial.
 * Feed it the object `globalFeatureError()` (in services/api.ts) extracts
 * from a 403 GLOBAL_FEATURE_DISABLED response - never hand-build one, so
 * every surface shows the same real backend message, not a guessed one.
 */
export function GlobalRestrictionNotice({
  message,
  expiresAt,
}: {
  message: string;
  expiresAt: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: 12,
        background: "#fff4f6",
        border: "1px solid #ffd6dd",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: "20px" }} aria-hidden="true">⏸</span>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{message}</p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{expiryLabel(expiresAt)}</p>
      </div>
    </div>
  );
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "No estimated return time yet - please check back later.";

  const when = new Date(expiresAt);
  if (Number.isNaN(when.getTime())) return "No estimated return time yet - please check back later.";

  const sameDay = when.toDateString() === new Date().toDateString();
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const date = when.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return `Expected back ${sameDay ? `around ${time}` : `${date} at ${time}`}.`;
}
