import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rateLimitInfo } from "@/api/client";
import { font, radius, spacing } from "@/constants/theme";

export interface RateLimit {
  message: string;
  retryAfter: number;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Holds rate-limit state and ticks the countdown down each second (same behaviour
 * as the website). `fromError` returns true and arms the box when the error is a
 * 429/RATE_LIMITED response, so callers can `if (fromError(e)) return;`.
 */
export function useRateLimit() {
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);

  useEffect(() => {
    if (!rateLimit?.retryAfter) return;
    const t = setInterval(() => {
      setRateLimit((c) => {
        if (!c) return null;
        const next = c.retryAfter - 1;
        return next > 0 ? { ...c, retryAfter: next } : null;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rateLimit?.retryAfter]);

  const fromError = useCallback((err: unknown): boolean => {
    const info = rateLimitInfo(err);
    if (info) {
      setRateLimit(info);
      return true;
    }
    return false;
  }, []);

  return { rateLimit, fromError, clear: useCallback(() => setRateLimit(null), []) };
}

export function RateLimitBox({ rateLimit }: { rateLimit: RateLimit }) {
  const lines = rateLimit.message.split("\n").filter(Boolean);
  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="time-outline" size={16} color="#991b1b" />
        <Text style={styles.title}>{lines[0] || "Too many attempts"}</Text>
      </View>
      <Text style={styles.body}>
        {lines.slice(1).join(" ") || "For your account safety, this has been temporarily locked."}
      </Text>
      <Text style={styles.countdown}>Try again in {formatCountdown(rateLimit.retryAfter)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontWeight: font.weightHeavy, color: "#991b1b", fontSize: font.sm },
  body: { marginTop: 4, color: "#991b1b", fontSize: font.xs, lineHeight: 17 },
  countdown: { marginTop: 6, fontWeight: font.weightBold, color: "#991b1b", fontSize: font.sm },
});
