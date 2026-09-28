import { useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { EditShell } from "@/components/settings/EditShell";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { DatePickerModal } from "@/components/DatePickerModal";
import { countryApi } from "@/api/country.api";
import { apiErrorMessage } from "@/api/client";
import { countryFlag } from "@/constants/countries";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const DOC_TYPES = [
  { value: "passport", label: "Passport (with entry/exit stamps)" },
  { value: "visa", label: "Visa" },
  { value: "residence_permit", label: "Residence Permit" },
  { value: "national_id", label: "National ID" },
  { value: "utility_bill", label: "Utility Bill (last 60 days)" },
  { value: "bank_statement", label: "Bank Statement (last 60 days)" },
  { value: "lease_agreement", label: "Lease / Rental Agreement" },
  { value: "other", label: "Other official document" },
];
const REQUIRED_DAYS = 60;

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const fmtDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

type PickedFile = { uri: string; name: string; type: string };

/** Change country with documents - manual residency-review submission. */
export function CountryDocumentScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [country, setCountry] = useState<{ code: string; name: string } | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [residingSince, setResidingSince] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);

  const [countryOpen, setCountryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const defaultResiding = useMemo(() => new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10), []);
  const residingValid = !!residingSince && daysAgo(residingSince) >= REQUIRED_DAYS;
  const canSubmit = !!country && !!docType && residingValid && !!file;

  const submit = useMutation({
    mutationFn: () =>
      countryApi.submitResidencyDocument({
        country_code: country!.code,
        document_type: docType!,
        residing_since: residingSince,
        note: note.trim() || undefined,
        file: file!,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["countryStatus"] });
      Alert.alert("Submitted", res.message || "Our team will review it within 1–3 business days.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert("Couldn't submit", apiErrorMessage(err, "Please try again.")),
  });

  async function pickFrom(source: "camera" | "library") {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Please allow ${source === "camera" ? "camera" : "photo"} access to continue.`);
        return;
      }
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.fileName || `document-${Date.now()}.jpg`;
      setFile({ uri: a.uri, name, type: a.mimeType || "image/jpeg" });
    } catch (e) {
      Alert.alert("Couldn't pick file", apiErrorMessage(e, "Please try again."));
    }
  }

  function chooseFile() {
    Alert.alert("Upload document", "Add a photo of your document.", [
      { text: "Take Photo", onPress: () => pickFrom("camera") },
      { text: "Choose from Library", onPress: () => pickFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function onSubmit() {
    if (!country) return Alert.alert("Select a country", "Choose the new country you're residing in.");
    if (!docType) return Alert.alert("Select a document type", "Choose the type of document you're uploading.");
    if (!residingValid) return Alert.alert("Invalid date", `Residing-since must be at least ${REQUIRED_DAYS} days ago.`);
    if (!file) return Alert.alert("Upload a document", "Please add a photo of your document.");
    submit.mutate();
  }

  return (
    <EditShell
      title="Change Country"
      helper="Upload a government-issued document proving you've been residing in the new country for the past 60 days. Our team reviews submissions within 1–3 business days."
      canSave={canSubmit}
      saving={submit.isPending}
      onSave={onSubmit}
      saveLabel="Submit for Review"
    >
      <View style={{ gap: spacing.lg }}>
        {/* New country */}
        <Field label="NEW COUNTRY">
          <Pressable style={styles.select} onPress={() => setCountryOpen(true)}>
            <Ionicons name="globe-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.selectText, !country && styles.placeholder]} numberOfLines={1}>
              {country ? `${countryFlag(country.code)}  ${country.name}` : "Country"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
          </Pressable>
        </Field>

        {/* Document type */}
        <Field label="DOCUMENT TYPE">
          <Pressable style={styles.select} onPress={() => setTypeOpen(true)}>
            <Text style={[styles.selectText, !docType && styles.placeholder]} numberOfLines={1}>
              {DOC_TYPES.find((t) => t.value === docType)?.label || "Select document type"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
          </Pressable>
        </Field>

        {/* Residing since */}
        <Field label="RESIDING SINCE">
          <Pressable style={styles.select} onPress={() => setDateOpen(true)}>
            <Text style={[styles.selectText, !residingSince && styles.placeholder]}>
              {residingSince ? fmtDate(residingSince) : "Select date"}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textFaint} />
          </Pressable>
          <Text style={[styles.hint, residingSince && !residingValid && styles.hintError]}>
            Must be at least {REQUIRED_DAYS} days ago.
          </Text>
        </Field>

        {/* Document upload */}
        <Field label="DOCUMENT">
          <Pressable style={styles.upload} onPress={chooseFile}>
            {file ? (
              <>
                <Image source={{ uri: file.uri }} style={styles.thumb} />
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
              </>
            ) : (
              <>
                <View style={styles.uploadIcon}><Ionicons name="cloud-upload-outline" size={20} color={colors.brand} /></View>
                <Text style={styles.uploadText}>Upload a photo of your document</Text>
              </>
            )}
          </Pressable>
        </Field>

        {/* Note */}
        <Field label="NOTE FOR REVIEWER (OPTIONAL)">
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder="Anything that helps us verify your residency…"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
          />
        </Field>
      </View>

      {/* Pickers */}
      <CountryPickerModal
        visible={countryOpen}
        selectedCode={country?.code}
        onSelect={(c) => setCountry({ code: c.code, name: c.name })}
        onClose={() => setCountryOpen(false)}
      />
      <DatePickerModal
        visible={dateOpen}
        title="Residing since"
        value={residingSince || defaultResiding}
        minAge={0}
        maxAge={20}
        onConfirm={setResidingSince}
        onClose={() => setDateOpen(false)}
      />
      <BottomSheet visible={typeOpen} onClose={() => setTypeOpen(false)} scrollable={false}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle}>Document type</Text>
          {DOC_TYPES.map((t) => {
            const active = docType === t.value;
            return (
              <Pressable key={t.value} style={styles.typeRow} onPress={() => { setDocType(t.value); setTypeOpen(false); }}>
                <Text style={[styles.typeText, active && styles.typeActive]}>{t.label}</Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </EditShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textMuted, letterSpacing: 0.6, marginBottom: spacing.sm },
  select: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgMuted, borderRadius: 14, paddingHorizontal: 16, height: 52 },
  selectText: { flex: 1, fontSize: font.md, color: colors.text },
  placeholder: { color: colors.textFaint },
  hint: { marginTop: 6, fontSize: font.xs, color: colors.textMuted },
  hintError: { color: colors.danger, fontWeight: font.weightBold },

  upload: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgMuted, borderRadius: 14, paddingHorizontal: 14, minHeight: 64, paddingVertical: 12 },
  uploadIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  uploadText: { flex: 1, fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.border },
  fileName: { flex: 1, fontSize: font.sm, color: colors.text },

  note: { backgroundColor: colors.bgMuted, borderRadius: 14, padding: 14, minHeight: 96, fontSize: font.md, color: colors.text, textAlignVertical: "top" },

  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  typeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  typeText: { flex: 1, fontSize: font.md, color: colors.text },
  typeActive: { color: colors.brand, fontWeight: font.weightBold },
});
