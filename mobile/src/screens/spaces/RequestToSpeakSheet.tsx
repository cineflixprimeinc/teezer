import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Hand, MicOff, ShieldCheck, UserPlus, X } from "lucide-react-native";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * "Request to speak" - the flow's confirm sheet.
 *
 * It exists to set expectations before the tap, which is the whole point of the
 * two lines it carries: your mic stays off, and the host decides. Without them
 * a listener taps, nothing audible happens, and the room feels broken.
 *
 * Light on a dark room, deliberately: it is a decision, and it should stop you.
 */
export function RequestToSpeakSheet({
  visible, sending, onSend, onClose,
}: {
  visible: boolean;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps so pressing the card never closes it. */}
        <Pressable style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
            <X size={18} color={colors.textMuted} strokeWidth={2.2} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Hand size={30} color={colors.brand} strokeWidth={2} />
          </View>

          <Text style={styles.title}>Request to speak</Text>
          <Text style={styles.body}>
            Send a request to the host. They'll be notified and can invite you on stage.
          </Text>

          <View style={styles.points}>
            <View style={styles.point}>
              <MicOff size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.pointText}>Your mic will be off</Text>
            </View>
            <View style={styles.point}>
              <UserPlus size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.pointText}>You'll join as a speaker if approved</Text>
            </View>
            <View style={styles.point}>
              <ShieldCheck size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.pointText}>Be respectful and follow the space rules</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.send, pressed && styles.pressed]}
            onPress={onSend}
            disabled={sending}
            accessibilityRole="button"
          >
            {sending
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.sendText}>Send request</Text>}
          </Pressable>

          <Text style={styles.footnote}>You can cancel your request anytime</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  backdrop: {
    flex: 1, backgroundColor: "rgba(8,4,12,0.6)",
    justifyContent: "flex-end",
  },
  card: {
    width: "100%",
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    backgroundColor: colors.card, paddingHorizontal: spacing.xl, paddingTop: spacing.md, alignItems: "center",
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  close: { position: "absolute", top: spacing.md, right: spacing.md, padding: spacing.xs },
  footnote: { marginTop: spacing.md, fontSize: font.xs, color: colors.textFaint, textAlign: "center" },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, marginTop: spacing.sm,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTint,
  },
  title: { marginTop: spacing.lg, fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  body: {
    marginTop: spacing.sm, fontSize: font.sm, color: colors.textMuted,
    textAlign: "center", lineHeight: 19,
  },
  points: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xl },
  point: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pointText: { fontSize: font.sm, color: colors.textSecondary },
  send: {
    alignSelf: "stretch", height: 52, borderRadius: radius.pill, marginTop: spacing.xl,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.brand,
  },
  sendText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },
});
