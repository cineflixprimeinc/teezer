import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Check, Megaphone, ShieldCheck } from "lucide-react-native";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const POINTS = [
  "Ads must be honest - no false, misleading, or deceptive claims.",
  "No prohibited content (illegal, adult, hateful, or fraudulent).",
  "Targeting must respect people's privacy and applicable laws.",
  "You're responsible for your ad account billing and charges.",
];

/**
 * One-time Advertising Policy gate. Shown the first time a creator taps
 * "Create Campaign". The user must tick the checkbox before "Accept & Continue"
 * unlocks - there is no way to reach the campaign wizard without accepting.
 */
export function AdPolicyGate({ visible, onClose, onAccept }: {
  visible: boolean; onClose: () => void; onAccept: () => void;
}) {
  const navigation = useNavigation<any>();
  const [checked, setChecked] = useState(false);
  // Reset the tick each time the gate is reopened.
  useEffect(() => { if (visible) setChecked(false); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Megaphone size={26} color={colors.white} strokeWidth={2.2} />
          </View>
          <Text style={s.title}>Before you advertise</Text>
          <Text style={s.sub}>Review and accept our Advertising Policy to create and run ads on Teezer.</Text>

          <ScrollView style={s.pointsScroll} contentContainerStyle={s.points} showsVerticalScrollIndicator={false}>
            {POINTS.map((p) => (
              <View key={p} style={s.pointRow}>
                <ShieldCheck size={16} color={colors.brand} strokeWidth={2.3} style={{ marginTop: 1 }} />
                <Text style={s.pointText}>{p}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable hitSlop={6} onPress={() => navigation.navigate("StudioLegal", { doc: "advertising" })}>
            <Text style={s.readMore}>Read the full Advertising Policy</Text>
          </Pressable>

          {/* Acceptance checkbox - gates the primary button */}
          <Pressable style={s.checkRow} onPress={() => setChecked((c) => !c)}>
            <View style={[s.box, checked && s.boxOn]}>{checked && <Check size={14} color={colors.white} strokeWidth={3.2} />}</View>
            <Text style={s.checkText}>I have read and accept the Advertising Policy.</Text>
          </Pressable>

          <Pressable
            style={[s.acceptBtn, !checked && s.acceptBtnOff]}
            disabled={!checked}
            onPress={onAccept}
          >
            <Text style={s.acceptText}>Accept & Continue</Text>
          </Pressable>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 400, backgroundColor: colors.bg, borderRadius: radius.xl, padding: spacing.xl, alignItems: "center" },
  iconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  sub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center" },

  pointsScroll: { alignSelf: "stretch", maxHeight: 168, marginTop: spacing.lg },
  points: { gap: spacing.md, paddingRight: spacing.xs },
  pointRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  pointText: { flex: 1, fontSize: font.sm, lineHeight: 20, color: colors.textSecondary },

  readMore: { marginTop: spacing.lg, fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand, textAlign: "center" },

  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.lg, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkText: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: font.weightMedium },

  acceptBtn: { alignSelf: "stretch", marginTop: spacing.lg, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  acceptBtnOff: { opacity: 0.4 },
  acceptText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  cancelBtn: { alignSelf: "stretch", marginTop: spacing.xs, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.textMuted, fontSize: font.sm, fontWeight: font.weightBold },
});
