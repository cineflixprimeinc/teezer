import { ReactNode, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shared chrome for every Profile-Information field editor:
 *   ← back (left) · Cancel (right, pink) · big title · gray helper · body ·
 *   fixed pink-gradient "Save Changes" button. Back and Cancel both discard.
 */
export function EditShell({
  title,
  helper,
  canSave,
  saving,
  onSave,
  saveLabel = "Save Changes",
  children,
}: {
  title: string;
  helper?: string;
  canSave: boolean;
  saving?: boolean;
  onSave: () => void;
  saveLabel?: string;
  children: ReactNode;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const disabled = !canSave || !!saving;

  return (
    <Screen edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Top bar: back · Cancel */}
        <View style={styles.topBar}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={28} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{title}</Text>
          {!!helper && <Text style={styles.helper}>{helper}</Text>}
          <View style={{ marginTop: spacing.xl }}>{children}</View>
        </ScrollView>

        {/* Fixed bottom Save Changes */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable onPress={onSave} disabled={disabled} style={({ pressed }) => pressed && !disabled && { opacity: 0.9 }}>
            <LinearGradient
              colors={disabled ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveBtn}
            >
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>{saveLabel}</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Gray rounded input box with an inline clear-X. `multiline` makes a textarea. */
export function ClearableInput({
  value,
  onChangeText,
  multiline,
  maxLength,
  ...rest
}: {
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  return (
    <View style={[styles.inputBox, multiline && styles.inputBoxMultiline]}>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={maxLength}
        placeholderTextColor={colors.textFaint}
        {...rest}
      />
      {value.length > 0 && (
        <Pressable hitSlop={8} onPress={() => onChangeText("")} style={multiline ? styles.clearTop : styles.clear}>
          <Ionicons name="close-circle" size={22} color="#b9bdc6" />
        </Pressable>
      )}
    </View>
  );
}

/** Gray tappable row showing a value with a trailing icon (chevron / calendar). */
export function FieldRow({
  value,
  placeholder,
  icon = "chevron-forward",
  onPress,
}: {
  value: string;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.fieldRow} onPress={onPress}>
      <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]} numberOfLines={1}>
        {value || placeholder || "Select"}
      </Text>
      <Ionicons name={icon} size={20} color={colors.textFaint} />
    </Pressable>
  );
}

/** Right-aligned `NN/MAX` counter; turns red when over the limit. */
export function CharCounter({ length, max }: { length: number; max: number }) {
  return <Text style={[styles.counter, length > max && styles.counterError]}>{length}/{max}</Text>;
}

/** Password confirmation sheet for security-sensitive changes (email / phone). */
export function PasswordConfirmModal({
  visible,
  title,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  busy?: boolean;
  onConfirm: (password: string) => void;
  onClose: () => void;
}) {
  const [pw, setPw] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.pwBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.pwCard}>
          <Text style={styles.pwTitle}>{title}</Text>
          <Text style={styles.pwHint}>Enter your current password to confirm this change.</Text>
          <TextInput
            style={styles.pwInput}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoFocus
            placeholder="Current password"
            placeholderTextColor={colors.textFaint}
          />
          <View style={styles.pwActions}>
            <Pressable style={styles.pwCancel} onPress={() => { setPw(""); onClose(); }}>
              <Text style={styles.pwCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.pwConfirm, (!pw || busy) && styles.pwConfirmDisabled]}
              disabled={!pw || busy}
              onPress={() => onConfirm(pw)}
            >
              {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.pwConfirmText}>Confirm</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  cancel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand, paddingHorizontal: spacing.sm },

  body: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { fontSize: 30, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 36 },
  helper: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted, lineHeight: 21 },

  inputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgMuted, borderRadius: 14, paddingHorizontal: 16, height: 54 },
  inputBoxMultiline: { height: 150, alignItems: "flex-start", paddingVertical: 14 },
  input: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  inputMultiline: { height: "100%", textAlignVertical: "top" },
  clear: { marginLeft: spacing.sm },
  clearTop: { marginLeft: spacing.sm, marginTop: 2 },

  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgMuted, borderRadius: 14, paddingHorizontal: 16, height: 54 },
  fieldValue: { flex: 1, fontSize: 16, color: colors.text },
  fieldPlaceholder: { color: colors.textFaint },

  counter: { alignSelf: "flex-end", marginTop: spacing.sm, fontSize: font.sm, color: colors.textMuted },
  counterError: { color: colors.danger, fontWeight: font.weightBold },

  bottom: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  saveBtn: { height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: colors.white, fontSize: font.lg, fontWeight: font.weightHeavy },

  // Password modal
  // No dim - the dialog floats on its own soft shadow (global popup style).
  pwBackdrop: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  pwCard: {
    backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  pwTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  pwHint: { marginTop: 6, fontSize: font.sm, color: colors.textMuted },
  pwInput: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 48, fontSize: font.md, color: colors.text },
  pwActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.lg },
  pwCancel: { paddingHorizontal: 18, paddingVertical: 10 },
  pwCancelText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.textMuted },
  pwConfirm: { minWidth: 96, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center" },
  pwConfirmDisabled: { backgroundColor: "#f4b6c2" },
  pwConfirmText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },
});
