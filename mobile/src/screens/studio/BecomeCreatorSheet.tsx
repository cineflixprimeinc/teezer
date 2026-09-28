import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Lock, PartyPopper } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { creatorApi, type EligibilityData } from "@/api/creator.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { UPLOAD_LIMITS } from "@/constants/creator-rules";

/** The website's /studio/become-creator page, as a sheet: the 10-point
 *  checklist, the Creator Terms gate, and the apply button.
 *
 *  The terms checkbox is its own endpoint (`accept-terms`) rather than a
 *  client-side flag, because `terms_accepted` is one of the ten checks the
 *  server re-runs on apply - ticking it locally would just 422. */
export function BecomeCreatorSheet({
  visible,
  onClose,
  data,
  onApplied,
}: {
  visible: boolean;
  onClose: () => void;
  data?: EligibilityData | null;
  onApplied: () => void;
}) {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  const [accepting, setAccepting] = useState(false);
  const [applying, setApplying] = useState(false);

  const reqs = data?.requirements ?? [];
  const done = data?.completed_count ?? 0;
  const total = data?.total_count ?? 10;
  const eligible = !!data?.is_eligible;
  const termsAccepted = reqs.find((r) => r.key === "terms_accepted")?.passed ?? false;

  const acceptTerms = async () => {
    if (termsAccepted || accepting) return;
    setAccepting(true);
    try {
      await creatorApi.acceptTerms();
      await qc.invalidateQueries({ queryKey: ["creator-eligibility"] });
    } catch (e) {
      Alert.alert("Couldn't accept terms", apiErrorMessage(e, "Please try again."));
    } finally {
      setAccepting(false);
    }
  };

  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const res = await creatorApi.apply();
      if (!res.success) {
        Alert.alert("Not eligible yet", res.message ?? "You do not meet all requirements yet.");
        return;
      }
      // The server flips role → creator in the same transaction, so mirror it
      // locally rather than waiting for the next profile fetch.
      if (user) setUser({ ...user, role: "creator" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["creator-eligibility"] }),
        qc.invalidateQueries({ queryKey: ["creator-level-page"] }),
        qc.invalidateQueries({ queryKey: ["studio-permissions"] }),
      ]);
      Alert.alert("You're a Creator", res.message ?? "Welcome to the creator community.");
      onApplied();
    } catch (e) {
      Alert.alert("Couldn't apply", apiErrorMessage(e, "Please try again."));
    } finally {
      setApplying(false);
    }
  };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={0.88}
      scrollable={false}
      dragArea="header"
      header={
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Become a Creator</Text>
            <Text style={styles.headerSub}>{done} of {total} requirements met</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.card}>
          <View style={styles.progressTop}>
            <Text style={styles.progressPct}>{pct}%</Text>
            <Text style={styles.progressNote}>
              {eligible ? "You meet every requirement." : `${total - done} left to go.`}
            </Text>
          </View>
          <View style={styles.track}>
            <LinearGradient
              colors={eligible ? ["#16a34a", "#22c55e"] : [colors.brand, "#ff7a45"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fill, { width: `${pct}%` }]}
            />
          </View>
        </View>

        {/* The ten checks */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Requirements</Text>
          {reqs.map((r, i) => (
            <View key={r.key} style={[styles.reqRow, i > 0 && styles.reqRowBorder]}>
              <View style={[styles.reqIcon, r.passed && styles.reqIconOk]}>
                {r.passed ? (
                  <Check size={13} color={colors.white} strokeWidth={3.2} />
                ) : (
                  <Lock size={11} color={colors.textFaint} strokeWidth={2.6} />
                )}
              </View>
              <Text style={[styles.reqLabel, r.passed && styles.reqLabelOk]} numberOfLines={2}>
                {r.label}
              </Text>
              <Text style={[styles.reqValue, r.passed && { color: "#16a34a" }]}>{r.display}</Text>
            </View>
          ))}
        </View>

        {/* Terms gate */}
        <Pressable style={styles.card} onPress={acceptTerms} disabled={termsAccepted || accepting}>
          <View style={styles.termsRow}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxOn]}>
              {accepting ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : termsAccepted ? (
                <Check size={13} color={colors.white} strokeWidth={3.2} />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.termsTitle}>
                {termsAccepted ? "Creator Terms accepted" : "Accept the Creator Terms"}
              </Text>
              <Text style={styles.termsText}>
                You agree to the community guidelines, the content policy and the creator earnings policy.
              </Text>
            </View>
          </View>
        </Pressable>

        {/* What you get */}
        <View style={[styles.card, { backgroundColor: colors.brandTint, borderColor: "#fecdd3" }]}>
          <View style={styles.perkHead}>
            <PartyPopper size={16} color={colors.brand} strokeWidth={2.4} />
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>What you unlock</Text>
          </View>
          {[
            "Creator badge on your profile",
            `Uploads up to ${UPLOAD_LIMITS.creator.size} / ${UPLOAD_LIMITS.creator.duration}`,
            "Content manager and analytics",
            "Level progression toward monetization",
          ].map((p) => (
            <View key={p} style={styles.perkRow}>
              <Check size={14} color={colors.brand} strokeWidth={3} />
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {!!data?.rejection_reason && (
          <View style={[styles.card, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Text style={[styles.cardTitle, { color: "#dc2626" }]}>Previous application rejected</Text>
            <Text style={styles.termsText}>{data.rejection_reason}</Text>
          </View>
        )}

        <Pressable
          style={[styles.applyBtn, (!eligible || applying) && styles.applyBtnOff]}
          onPress={apply}
          disabled={!eligible || applying}
        >
          {applying ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.applyBtnText}>
              {eligible ? "Apply to become a Creator" : `Complete ${total - done} more to apply`}
            </Text>
          )}
        </Pressable>
        <Text style={styles.footNote}>
          Approval is automatic once every requirement passes - there is no review queue.
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  headerSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },

  progressTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginBottom: spacing.sm },
  progressPct: { fontSize: 26, fontWeight: font.weightHeavy, color: colors.text },
  progressNote: { flex: 1, fontSize: 12, color: colors.textMuted, fontWeight: font.weightMedium },
  track: { height: 8, borderRadius: 4, backgroundColor: "#ececf0", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },

  reqRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10 },
  reqRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  reqIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  reqIconOk: { backgroundColor: "#16a34a" },
  reqLabel: { flex: 1, fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  reqLabelOk: { color: colors.textSecondary },
  reqValue: { fontSize: 12, fontWeight: font.weightBold, color: colors.textFaint },

  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  checkboxOn: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  termsTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  termsText: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.textMuted },

  perkHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4 },
  perkText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, fontWeight: font.weightMedium },

  applyBtn: {
    height: 50, borderRadius: radius.lg, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  applyBtnOff: { backgroundColor: colors.borderStrong, shadowOpacity: 0, elevation: 0 },
  applyBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  footNote: { textAlign: "center", fontSize: 11, color: colors.textFaint, marginTop: -spacing.xs },
});
