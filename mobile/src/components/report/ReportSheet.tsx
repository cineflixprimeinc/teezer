import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator } from "react-native";
import { CircleCheck, Flag, ImagePlus, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { ds, radius } from "@/theme/design";
import { REPORT_CONFIG, type ReportEntityType } from "@/constants/report-config";
import { reportApi, type ReportEvidenceFile } from "@/api/report.api";
import { apiErrorMessage } from "@/api/client";

const MAX_EVIDENCE = 3;

export interface ReportSheetProps {
  visible: boolean;
  entityType: ReportEntityType;
  /** video/comment/story id, username, or the other user's id (conversation) - whatever REPORT_CONFIG's endpoint() for this type expects. */
  entityId: number | string | null;
  onClose: () => void;
  /** Fires once the server actually accepts the report - lets the caller update its own list/state. */
  onSubmitted?: () => void;
}

type Step = "reason" | "details" | "done";

/**
 * The one report sheet for everything reportable in the app - mirrors
 * frontend/src/components/report/ReportModal.tsx on web exactly (same two
 * steps: pick a reason, then optional details + up to 3 evidence photos,
 * then a success state), entirely driven by REPORT_CONFIG so a new
 * reportable thing is a config entry, not a new component.
 */
export function ReportSheet({ visible, entityType, entityId, onClose, onSubmitted }: ReportSheetProps) {
  const config = entityType ? REPORT_CONFIG[entityType] : null;

  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [evidence, setEvidence] = useState<ReportEvidenceFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fresh state every time the sheet opens for a new thing.
  useEffect(() => {
    if (visible) {
      setStep("reason"); setReason(null); setDetails("");
      setEvidence([]); setSubmitting(false); setErrorMsg(null);
    }
  }, [visible, entityType, entityId]);

  if (!config || entityId === null) return null;
  // Re-bound as `const` so their narrowed (non-null) types survive inside the
  // nested function declarations below - TS doesn't retain narrowing on
  // params captured by a closure, only on `const` bindings.
  const cfg = config;
  const id = entityId;
  const selectedReason = cfg.reasons.find((r) => r.value === reason) ?? null;

  function pickReason(value: string) {
    setReason(value);
    setStep("details");
  }

  async function addEvidence() {
    const room = MAX_EVIDENCE - evidence.length;
    if (room <= 0) { Alert.alert("Limit reached", `You can attach up to ${MAX_EVIDENCE} photos.`); return; }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to attach evidence."); return; }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: true, selectionLimit: room,
    });
    if (res.canceled) return;

    setEvidence((prev) => [
      ...prev,
      ...res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `evidence-${Date.now()}-${i}.jpg`,
        type: a.mimeType ?? "image/jpeg",
      })),
    ].slice(0, MAX_EVIDENCE));
  }

  function removeEvidence(uri: string) {
    setEvidence((prev) => prev.filter((e) => e.uri !== uri));
  }

  async function submit() {
    if (!reason || submitting || !entityType) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await reportApi.submit(entityType, id, {
        reason,
        details: cfg.allowDetails ? (details.trim() || undefined) : undefined,
        evidence,
      });
      onSubmitted?.();
      setStep("done");
    } catch (e) {
      setErrorMsg(apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dragArea="header"
      keyboardAvoid
      header={
        <View style={styles.header}>
          {step === "details" ? (
            <Pressable onPress={() => setStep("reason")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
          ) : (
            <View style={styles.headerIconChip}>
              <Flag size={14} color={ds.accent} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {step === "done" ? "Report submitted" : `Report ${config.noun}`}
            </Text>
            {step !== "done" && (
              <Text style={styles.stepLabel}>Step {step === "reason" ? 1 : 2} of 2</Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={ds.textDim} />
          </Pressable>
        </View>
      }
    >
      {step === "reason" && (
        <View style={styles.reasonList}>
          {config.reasons.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => pickReason(r.value)}
              style={({ pressed }) => [styles.reasonRow, pressed && styles.reasonRowPressed]}
            >
              <View style={styles.radioOuter} />
              <Text style={styles.reasonLabel}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {step === "details" && (
        <View style={styles.detailsBody}>
          <View style={styles.selectedChip}>
            <Text style={styles.selectedChipLabel}>REASON SELECTED</Text>
            <Text style={styles.selectedChipValue}>{selectedReason?.label}</Text>
          </View>

          {config.allowDetails && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.fieldLabel}>Add details <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
              <TextInput
                value={details}
                onChangeText={(t) => setDetails(t.slice(0, 500))}
                placeholder="What happened? Anything you tell us helps our review team."
                placeholderTextColor={ds.textFaint}
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />
              <Text style={styles.charCount}>{details.length}/500</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>
            Add evidence <Text style={styles.fieldLabelOptional}>(optional, up to {MAX_EVIDENCE} photos)</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={styles.evidenceRow}>
              {evidence.map((e) => (
                <View key={e.uri} style={styles.evidenceThumbWrap}>
                  <Image source={{ uri: e.uri }} style={styles.evidenceThumb} />
                  <Pressable onPress={() => removeEvidence(e.uri)} style={styles.evidenceRemove} hitSlop={4}>
                    <X size={10} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {evidence.length < MAX_EVIDENCE && (
                <Pressable onPress={addEvidence} style={styles.evidenceAdd}>
                  <ImagePlus size={20} color={ds.textFaint} />
                </Pressable>
              )}
            </View>
          </ScrollView>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <View style={styles.actionsRow}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={submitting} style={[styles.submitBtn, submitting && { opacity: 0.6 }]}>
              {submitting && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
              <Text style={styles.submitBtnText}>{submitting ? "Submitting…" : "Submit report"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === "done" && (
        <View style={styles.doneBody}>
          <CircleCheck size={40} color="#16a34a" strokeWidth={1.75} />
          <Text style={styles.doneTitle}>Thank you for keeping Teezer safe.</Text>
          <Text style={styles.doneSubtitle}>Our team will review your report shortly.</Text>
          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.submitBtnText}>Done</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backGlyph: { fontSize: 26, color: ds.textDim, width: 22, textAlign: "center", marginTop: -2 },
  headerIconChip: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: ds.accentWash,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "700", color: ds.text },
  stepLabel: { fontSize: 11, fontWeight: "500", color: ds.textFaint, marginTop: 1 },

  reasonList: { paddingHorizontal: 10, paddingBottom: 10 },
  reasonRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 13, borderRadius: radius.lg,
  },
  reasonRowPressed: { backgroundColor: ds.surfaceMuted },
  radioOuter: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: ds.lineStrong },
  reasonLabel: { fontSize: 13.5, fontWeight: "600", color: ds.text },

  detailsBody: { paddingHorizontal: 16, paddingBottom: 8 },
  selectedChip: { backgroundColor: ds.accentWash, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14 },
  selectedChipLabel: { fontSize: 10, fontWeight: "700", color: ds.accent, letterSpacing: 0.4 },
  selectedChipValue: { fontSize: 13.5, fontWeight: "700", color: ds.text, marginTop: 1 },

  fieldLabel: { fontSize: 12, fontWeight: "600", color: ds.text, marginBottom: 6 },
  fieldLabelOptional: { fontWeight: "400", color: ds.textFaint },
  textarea: {
    borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, padding: 10,
    fontSize: 12.5, color: ds.text, minHeight: 66, textAlignVertical: "top",
  },
  charCount: { fontSize: 10, color: ds.textFaint, textAlign: "right", marginTop: 2 },

  evidenceRow: { flexDirection: "row", gap: 8 },
  evidenceThumbWrap: { width: 64, height: 64, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: ds.line },
  evidenceThumb: { width: "100%", height: "100%" },
  evidenceRemove: {
    position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
  },
  evidenceAdd: {
    width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed",
    borderColor: ds.lineStrong, alignItems: "center", justifyContent: "center",
  },

  errorText: { fontSize: 11.5, color: "#dc2626", marginTop: 10 },

  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancelBtn: {
    height: 38, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1,
    borderColor: ds.line, alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { fontSize: 12, fontWeight: "700", color: ds.text },
  submitBtn: {
    height: 38, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: ds.accent,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  submitBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  doneBody: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 28, gap: 6 },
  doneTitle: { fontSize: 13.5, fontWeight: "700", color: ds.text, textAlign: "center", marginTop: 4 },
  doneSubtitle: { fontSize: 12, color: ds.textDim, textAlign: "center" },
  doneBtn: {
    height: 38, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: ds.accent,
    alignItems: "center", justifyContent: "center", marginTop: 12,
  },
});
