import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { BottomSheet } from "@/components/BottomSheet";
import { EditShell, FieldRow } from "@/components/settings/EditShell";
import { useProfileFieldSave } from "./useProfileSave";
import { GENDERS, genderLabel } from "./profileFields";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Edit Gender - tappable row opens a bottom-sheet selector. */
export function EditGenderScreen() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [gender, setGender] = useState(initial);
  const [open, setOpen] = useState(false);
  const save = useProfileFieldSave();

  const canSave = !!gender && gender !== initial;

  return (
    <EditShell
      title="Gender"
      helper="Choose the gender you identify with."
      canSave={canSave}
      saving={save.isPending}
      onSave={() => save.mutate({ gender })}
    >
      <FieldRow value={genderLabel(gender)} placeholder="Select gender" onPress={() => setOpen(true)} />

      <BottomSheet visible={open} onClose={() => setOpen(false)} scrollable={false}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle}>Gender</Text>
          {GENDERS.map((g) => {
            const active = gender === g.value;
            return (
              <Pressable key={g.value} style={styles.row} onPress={() => { setGender(g.value); setOpen(false); }}>
                <Text style={[styles.rowText, active && styles.rowActive]}>{g.label}</Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </EditShell>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { fontSize: font.md, color: colors.text },
  rowActive: { color: colors.brand, fontWeight: font.weightBold },
});
