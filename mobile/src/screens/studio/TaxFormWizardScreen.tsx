import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import {
  Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, FileText, Info, LocateFixed, Pencil,
  UploadCloud, X,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { DatePickerModal } from "@/components/DatePickerModal";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { useTaxFormsStore, type TaxDoc, type TaxForm, type TaxFormType } from "@/store/tax-forms.store";
import { taxApi } from "@/api/tax.api";
import { authApi } from "@/api/auth.api";
import { COUNTRIES } from "@/constants/countries";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS_LONG[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${mm} ${ampm}`;
}

const FORM_TYPES: { key: TaxFormType; title: string; desc: string; entity: "Individual" | "Entity" }[] = [
  { key: "W-8BEN", title: "W-8BEN", desc: "For individuals who are not U.S. persons", entity: "Individual" },
  { key: "W-9", title: "W-9", desc: "For U.S. persons and U.S. entities", entity: "Individual" },
  { key: "W-8BEN-E", title: "W-8BEN-E", desc: "For entities who are not U.S. persons", entity: "Entity" },
  { key: "Other", title: "Other Tax Forms", desc: "Other forms as required by local laws", entity: "Individual" },
];
const TIN_TYPES: SettingsOption[] = ["PAN", "SSN", "EIN", "ITIN", "Other"].map((v) => ({ value: v, label: v }));

const STEPS = [
  { title: "Choose Tax Form Type", sub: "Select the tax form that applies to you.", header: "Choose Form Type", info: "Pick the form that matches your tax status. Most non-US creators use W-8BEN." },
  { title: "Personal Information", sub: "Enter your full legal name as it appears on your tax documents.", header: "Personal Information", info: "Use your legal name exactly as on your government ID." },
  { title: "Tax Residency", sub: "Tell us what country you are a tax resident of.", header: "Tax Residency", info: "Your tax residency determines which tax rules apply to your payouts." },
  { title: "Tax Identification", sub: "Provide your tax identification details.", header: "Tax Identification", info: "This is your government tax ID (e.g. PAN in India, SSN in the US)." },
  { title: "Review Your Information", sub: "Please review your details before submitting.", header: "Review Information", info: "" },
  { title: "Upload Documents", sub: "Upload supporting documents for verification.", header: "Document Upload", info: "" },
  { title: "Preview & Confirm", sub: "Please confirm that all information is correct.", header: "Preview & Confirm", info: "" },
];
const TOTAL_NODES = 8; // 1 = Home; steps 0..6 map to nodes 2..8, matching the design.

interface Draft {
  formType: TaxFormType;
  firstName: string; middleName: string; lastName: string;
  dobIso: string; citizenship: string; citizenshipCode: string;
  residenceCountry: string; residenceCode: string; residenceTin: string;
  addr1: string; addr2: string; city: string;
  tinType: string; taxId: string;
  identityDoc: TaxDoc | null; addressDoc: TaxDoc | null;
}

const EMPTY: Draft = {
  formType: "W-8BEN",
  firstName: "", middleName: "", lastName: "",
  dobIso: "", citizenship: "", citizenshipCode: "",
  residenceCountry: "", residenceCode: "", residenceTin: "",
  addr1: "", addr2: "", city: "",
  tinType: "PAN", taxId: "",
  identityDoc: null, addressDoc: null,
};

export function TaxFormWizardScreen() {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));

  const [showDate, setShowDate] = useState(false);
  const [country, setCountry] = useState<null | "citizenship" | "residence">(null);
  const [tinSheet, setTinSheet] = useState(false);
  const [submitted, setSubmitted] = useState<TaxForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Auto-detect the creator's country by ISP/IP - the SAME `/detect-country`
  // endpoint that pre-fills the country at signup - and map it to our canonical
  // country list so it matches the picker. Fills residence (and citizenship if
  // still blank); `silent` skips the alert when it runs automatically.
  const detectResidence = async (silent: boolean) => {
    if (detecting) return;
    setDetecting(true);
    try {
      const r = await authApi.detectCountry();
      const code = (r?.countryCode ?? "").toUpperCase();
      const match = COUNTRIES.find((c) => c.code === code);
      const name = match?.name ?? r?.countryName ?? "";
      if (name) {
        setD((p) => ({
          ...p,
          residenceCountry: name,
          residenceCode: code,
          // Seed citizenship too when the user hasn't picked one yet.
          citizenship: p.citizenship || name,
          citizenshipCode: p.citizenshipCode || code,
        }));
      } else if (!silent) {
        Alert.alert("Couldn't detect", "We couldn't detect your country. Please select it manually.");
      }
    } catch {
      if (!silent) Alert.alert("Couldn't detect", "We couldn't detect your country. Please select it manually.");
    } finally {
      setDetecting(false);
    }
  };

  // On first reaching the Tax Residency step with no country chosen yet, quietly
  // pre-fill it from the ISP lookup (the user can still change it in the picker).
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (step === 2 && !d.residenceCountry && !autoTriedRef.current) {
      autoTriedRef.current = true;
      void detectResidence(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const fullName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(" ");
  const panLabel = d.tinType === "PAN" ? "Permanent Account Number (PAN)" : `${d.tinType} Number`;

  const back = () => (step === 0 ? navigation.goBack() : setStep((sp) => sp - 1));

  const validate = (): string | null => {
    if (step === 1) {
      if (!d.firstName.trim() || !d.lastName.trim()) return "Enter your first and last name.";
      if (!d.dobIso) return "Select your date of birth.";
      if (!d.citizenship) return "Select your country of citizenship.";
    }
    if (step === 2 && !d.residenceCountry) return "Select your country of tax residence.";
    if (step === 3 && !d.taxId.trim()) return `Enter your ${d.tinType} number.`;
    if (step === 5 && !d.identityDoc) return "Upload your identity proof to continue.";
    return null;
  };

  const onContinue = () => {
    const err = validate();
    if (err) { Alert.alert("Almost there", err); return; }
    setStep((sp) => sp + 1);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const meta = FORM_TYPES.find((f) => f.key === d.formType)!;
      const created = await taxApi.create({
        formType: d.formType,
        entityKind: meta.entity,
        firstName: d.firstName, middleName: d.middleName, lastName: d.lastName,
        dob: d.dobIso ? fmtDate(d.dobIso) : "",
        citizenship: d.citizenship,
        residenceCountry: d.residenceCountry, residenceTin: d.residenceTin,
        addr1: d.addr1, addr2: d.addr2, city: d.city,
        tinType: d.tinType, taxId: d.taxId,
        identityDoc: d.identityDoc, addressDoc: d.addressDoc,
      });
      useTaxFormsStore.getState().add(created);
      setSubmitted(created);
    } catch (e) {
      Alert.alert("Submission failed", apiErrorMessage(e, "Couldn't submit your tax form. Please check your details and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const pick = async (which: "identity" | "address") => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to upload a document."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const name = a.fileName || (which === "identity" ? "Identity proof.jpg" : "Address proof.jpg");
      set(which === "identity" ? { identityDoc: { name, uri: a.uri } } : { addressDoc: { name, uri: a.uri } });
    } catch {
      Alert.alert("Upload failed", "Couldn't open your library. Please try again.");
    }
  };

  /* ── Submitted success (step 9) ─────────────────────────────────────────── */
  if (submitted) {
    return (
      <Screen edges={["top", "bottom"]} bg={colors.bg}>
        <View style={s.successWrap}>
          <View style={s.successBadge}>
            <View style={s.successCircle}><Check size={46} color="#fff" strokeWidth={3.2} /></View>
            {CONFETTI.map((c, i) => <View key={i} style={[s.confetti, c]} />)}
          </View>
          <Text style={s.successTitle}>Tax Form Submitted{"\n"}Successfully!</Text>
          <Text style={s.successSub}>Your tax information has been submitted and is under review.</Text>

          <View style={s.subCard}>
            <Text style={s.subLabel}>Submission ID</Text>
            <Text style={s.subValue}>{submitted.submissionId}</Text>
            <View style={s.subDivider} />
            <Text style={s.subLabel}>Submitted on</Text>
            <Text style={s.subValueSm}>{fmtDateTime(submitted.submittedAt)}</Text>
          </View>

          <Text style={s.nextTitle}>What happens next?</Text>
          <View style={s.nextList}>
            {["We will review your information", "You will receive an email update", "Once approved, payouts will resume"].map((t) => (
              <View key={t} style={s.nextRow}>
                <CheckCircle2 size={18} color="#16a34a" strokeWidth={2.4} />
                <Text style={s.nextText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.footer}>
          <Pressable style={s.primaryBtn} onPress={() => navigation.navigate("Studio")}>
            <Text style={s.primaryBtnText}>Go to Dashboard</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const st = STEPS[step];

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={back}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={s.headerTitle}>{st.header}</Text>
        {st.info ? (
          <Pressable hitSlop={8} style={s.iconBtn} onPress={() => Alert.alert(st.header, st.info)}>
            <Info size={20} color={colors.textFaint} strokeWidth={2} />
          </Pressable>
        ) : <View style={s.iconBtn} />}
      </View>

      <Stepper current={step + 2} total={TOTAL_NODES} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.stepTitle}>{st.title}</Text>
        {!!st.sub && <Text style={s.stepSub}>{st.sub}</Text>}

        {/* ── Step 1 · Choose Form Type ── */}
        {step === 0 && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {FORM_TYPES.map((f) => (
              <RadioCard key={f.key} title={f.title} desc={f.desc} selected={d.formType === f.key} onPress={() => set({ formType: f.key })} />
            ))}
          </View>
        )}

        {/* ── Step 2 · Personal Information ── */}
        {step === 1 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <Text style={s.groupLabel}>Full Legal Name</Text>
            <Input label="First Name" value={d.firstName} onChangeText={(t) => set({ firstName: t })} placeholder="Amit" autoCapitalize="words" />
            <Input label="Middle Name (Optional)" value={d.middleName} onChangeText={(t) => set({ middleName: t })} placeholder="Kumar" autoCapitalize="words" />
            <Input label="Last Name" value={d.lastName} onChangeText={(t) => set({ lastName: t })} placeholder="Shrestha" autoCapitalize="words" />
            <SelectBox label="Date of Birth" value={d.dobIso ? fmtDate(d.dobIso) : ""} placeholder="Select date" onPress={() => setShowDate(true)} icon="calendar" />
            <SelectBox label="Country of Citizenship" value={d.citizenship} placeholder="Select country" onPress={() => setCountry("citizenship")} />
          </View>
        )}

        {/* ── Step 3 · Tax Residency ── */}
        {step === 2 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <View style={{ gap: spacing.sm }}>
              <SelectBox label="Country of Tax Residence" value={d.residenceCountry} placeholder="Select country" onPress={() => setCountry("residence")} />
              <Pressable style={s.detectRow} onPress={() => detectResidence(false)} disabled={detecting}>
                {detecting
                  ? <ActivityIndicator size="small" color={colors.brand} />
                  : <LocateFixed size={15} color={colors.brand} strokeWidth={2.3} />}
                <Text style={s.detectText}>{detecting ? "Detecting your country…" : "Auto-detect my country"}</Text>
              </Pressable>
            </View>
            <View>
              <Input label="Tax Identification Number (TIN)" value={d.residenceTin} onChangeText={(t) => set({ residenceTin: t })} placeholder="Enter your TIN" />
              <Text style={s.fieldHint}>Optional for some countries</Text>
            </View>
            <Text style={s.groupLabel}>Address</Text>
            <Input label="Address Line 1" value={d.addr1} onChangeText={(t) => set({ addr1: t })} placeholder="Street address" />
            <Input label="Address Line 2 (Optional)" value={d.addr2} onChangeText={(t) => set({ addr2: t })} placeholder="Apartment, suite, etc." />
            <Input label="City" value={d.city} onChangeText={(t) => set({ city: t })} placeholder="Kathmandu" autoCapitalize="words" />
          </View>
        )}

        {/* ── Step 4 · Tax Identification ── */}
        {step === 3 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <SelectBox label="TIN Type" value={d.tinType} placeholder="Select type" onPress={() => setTinSheet(true)} />
            <Input label={panLabel} value={d.taxId} onChangeText={(t) => set({ taxId: t })} placeholder="123456789" autoCapitalize="characters" />
            <Text style={s.fieldHint}>Make sure the TIN you provide is correct to avoid payment delays.</Text>
          </View>
        )}

        {/* ── Step 5 · Review Information ── */}
        {step === 4 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <SummarySection title="Personal Information" onEdit={() => setStep(1)}>
              <SummaryRow label="Name" value={fullName || "-"} />
              <SummaryRow label="Date of Birth" value={d.dobIso ? fmtDate(d.dobIso) : "-"} />
              <SummaryRow label="Country of Citizenship" value={d.citizenship || "-"} />
            </SummarySection>
            <SummarySection title="Tax Residency" onEdit={() => setStep(2)}>
              <SummaryRow label="Country of Tax Residence" value={d.residenceCountry || "-"} />
              <SummaryRow label="TIN Type" value={d.tinType} />
              <SummaryRow label={d.tinType} value={d.taxId || "-"} />
            </SummarySection>
          </View>
        )}

        {/* ── Step 6 · Document Upload ── */}
        {step === 5 && (
          <View style={{ gap: spacing.xl, marginTop: spacing.md }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={s.groupLabel}>Identity Proof</Text>
              <Text style={s.uploadSub}>Upload a clear copy of your valid ID.</Text>
              <UploadZone onPress={() => pick("identity")} />
              {d.identityDoc && <DocChip doc={d.identityDoc} onRemove={() => set({ identityDoc: null })} />}
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text style={s.groupLabel}>Address Proof (Optional)</Text>
              <Text style={s.uploadSub}>Upload a document that confirms your address.</Text>
              <UploadZone onPress={() => pick("address")} />
              {d.addressDoc && <DocChip doc={d.addressDoc} onRemove={() => set({ addressDoc: null })} />}
            </View>
          </View>
        )}

        {/* ── Step 7 · Preview & Confirm ── */}
        {step === 6 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <SummarySection title="Personal Information" onEdit={() => setStep(1)}>
              <SummaryRow label="Name" value={fullName || "-"} />
              <SummaryRow label="Date of Birth" value={d.dobIso ? fmtDate(d.dobIso) : "-"} />
              <SummaryRow label="Country of Citizenship" value={d.citizenship || "-"} />
            </SummarySection>
            <SummarySection title="Tax Residency" onEdit={() => setStep(2)}>
              <SummaryRow label="Country of Tax Residence" value={d.residenceCountry || "-"} />
              <SummaryRow label="TIN Type" value={d.tinType} />
              <SummaryRow label={d.tinType} value={d.taxId || "-"} />
              {(d.addr1 || d.city) ? <SummaryRow label="Address" value={[d.addr1, d.addr2, d.city].filter(Boolean).join(", ")} /> : null}
            </SummarySection>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        {step === 6 ? (
          <>
            <Pressable style={[s.primaryBtn, submitting && s.primaryBtnDisabled]} onPress={submit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={colors.white} />
                : <Text style={s.primaryBtnText}>Submit Tax Form</Text>}
            </Pressable>
            <Text style={s.disclaimer}>By submitting, you agree that the information provided is true and correct.</Text>
          </>
        ) : (
          <Pressable style={s.primaryBtn} onPress={onContinue}>
            <Text style={s.primaryBtnText}>Continue</Text>
          </Pressable>
        )}
      </View>

      {/* Pickers */}
      <DatePickerModal
        visible={showDate}
        value={d.dobIso || undefined}
        onConfirm={(iso) => set({ dobIso: iso })}
        onClose={() => setShowDate(false)}
      />
      <CountryPickerModal
        visible={country != null}
        selectedCode={country === "citizenship" ? d.citizenshipCode : d.residenceCode}
        onSelect={(c) => {
          if (country === "citizenship") set({ citizenship: c.name, citizenshipCode: c.code });
          else set({ residenceCountry: c.name, residenceCode: c.code });
        }}
        onClose={() => setCountry(null)}
      />
      <OptionSheet
        visible={tinSheet}
        title="TIN Type"
        options={TIN_TYPES}
        selected={d.tinType}
        onSelect={(v) => set({ tinType: v })}
        onClose={() => setTinSheet(false)}
      />
    </Screen>
  );
}

/* ── Stepper: sliding 5-node window, numbered like the design (2 … 8) ──────── */
function Stepper({ current, total }: { current: number; total: number }) {
  const WINDOW = Math.min(5, total);
  const start = Math.max(1, Math.min(current - 2, total - WINDOW + 1));
  const nums = Array.from({ length: WINDOW }, (_, i) => start + i);
  return (
    <View style={s.stepper}>
      {nums.map((n, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <View style={[s.stepDot, (done || active) && s.stepDotOn]}>
              {done ? <Check size={12} color="#fff" strokeWidth={3} />
                : <Text style={[s.stepNum, active && s.stepNumActive]}>{n}</Text>}
            </View>
            {i < nums.length - 1 && <View style={[s.stepLine, n < current && s.stepLineOn]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/* ── Form-type radio card ──────────────────────────────────────────────────── */
function RadioCard({ title, desc, selected, onPress }: { title: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.radioCard, selected && s.radioCardOn]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={s.radioTitle}>{title}</Text>
        <Text style={s.radioDesc}>{desc}</Text>
      </View>
      <View style={[s.radioOuter, selected && s.radioOuterOn]}>{selected && <View style={s.radioInner} />}</View>
    </Pressable>
  );
}

/* ── Boxed input with an inside label (matches the chart) ──────────────────── */
function Input({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad"; autoCapitalize?: "none" | "words" | "characters";
}) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "none"}
        style={s.boxInput}
      />
    </View>
  );
}

/* ── Boxed select (opens a picker) ─────────────────────────────────────────── */
function SelectBox({ label, value, placeholder, onPress, icon }: {
  label: string; value: string; placeholder: string; onPress: () => void; icon?: "calendar";
}) {
  return (
    <Pressable style={s.box} onPress={onPress}>
      <Text style={s.boxLabel}>{label}</Text>
      <View style={s.boxRow}>
        <Text style={[s.boxInput, { flex: 1 }, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {icon === "calendar" ? <Calendar size={18} color={colors.textFaint} /> : <ChevronDown size={18} color={colors.textFaint} />}
      </View>
    </Pressable>
  );
}

/* ── Review / Preview summary ──────────────────────────────────────────────── */
function SummarySection({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <View style={s.summaryCard}>
      <View style={s.summaryHead}>
        <Text style={s.summaryTitle}>{title}</Text>
        {onEdit && (
          <Pressable hitSlop={8} onPress={onEdit}>
            <Pencil size={16} color={colors.brand} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
  );
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

/* ── Document upload ───────────────────────────────────────────────────────── */
function UploadZone({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.uploadZone, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={s.uploadIcon}><UploadCloud size={22} color={colors.brand} strokeWidth={2} /></View>
      <Text style={s.uploadTitle}>Upload Document</Text>
      <Text style={s.uploadHint}>PNG, JPG or PDF (Max 10MB)</Text>
    </Pressable>
  );
}
function DocChip({ doc, onRemove }: { doc: TaxDoc; onRemove: () => void }) {
  return (
    <View style={s.docChip}>
      <View style={s.docIcon}><FileText size={16} color={colors.brand} strokeWidth={2.2} /></View>
      <Text style={s.docName} numberOfLines={1}>{doc.name}</Text>
      <CheckCircle2 size={18} color="#16a34a" strokeWidth={2.4} />
      <Pressable hitSlop={8} onPress={onRemove}><X size={16} color={colors.textFaint} strokeWidth={2.4} /></Pressable>
    </View>
  );
}

const CONFETTI = [
  { top: 2, left: 6, backgroundColor: "#f59e0b" },
  { top: 10, right: 2, backgroundColor: colors.brand },
  { bottom: 6, left: -2, backgroundColor: "#3b82f6" },
  { bottom: 0, right: 10, backgroundColor: "#16a34a" },
  { top: -4, left: 40, backgroundColor: "#7c3aed" },
  { bottom: 14, right: 34, backgroundColor: "#f59e0b" },
];

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  /* Stepper */
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: 2 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  stepDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepNum: { fontSize: 12, fontWeight: font.weightBold, color: colors.textFaint },
  stepNumActive: { color: colors.white },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4, maxWidth: 40 },
  stepLineOn: { backgroundColor: colors.brand },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  stepTitle: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 34 },
  stepSub: { marginTop: spacing.sm, fontSize: font.md, lineHeight: 22, color: colors.textMuted },
  groupLabel: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text, marginBottom: -4 },
  fieldHint: { marginTop: 6, fontSize: font.xs, color: colors.textFaint, lineHeight: 16 },
  detectRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 2 },
  detectText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  /* Radio cards */
  radioCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.card,
  },
  radioCardOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  radioTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  radioDesc: { marginTop: 3, fontSize: font.sm, lineHeight: 18, color: colors.textMuted },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOuterOn: { borderColor: colors.brand },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand },

  /* Boxed field */
  box: { borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.card },
  boxLabel: { fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },
  boxRow: { flexDirection: "row", alignItems: "center" },
  boxInput: { fontSize: font.md, color: colors.text, padding: 0, paddingVertical: 4, marginTop: 1 },

  /* Summary */
  summaryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.card },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  summaryTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  summaryLabel: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  summaryValue: { flex: 1.3, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, textAlign: "right" },

  /* Upload */
  uploadSub: { fontSize: font.sm, color: colors.textMuted, marginTop: -2 },
  uploadZone: {
    borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", borderRadius: radius.lg,
    alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: 6, backgroundColor: colors.bgMuted,
  },
  uploadIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  uploadTitle: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  uploadHint: { fontSize: font.xs, color: colors.textFaint },
  docChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card,
  },
  docIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  docName: { flex: 1, fontSize: font.sm, fontWeight: font.weightMedium, color: colors.text },

  /* Footer */
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  disclaimer: { marginTop: spacing.sm, fontSize: font.xs, color: colors.textFaint, textAlign: "center", lineHeight: 16 },

  /* Success */
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  successBadge: { width: 96, height: 96, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  successCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center", shadowColor: "#16a34a", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  confetti: { position: "absolute", width: 7, height: 7, borderRadius: 2 },
  successTitle: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center", lineHeight: 34 },
  successSub: { marginTop: spacing.sm, fontSize: font.md, lineHeight: 22, color: colors.textMuted, textAlign: "center", maxWidth: 320 },
  subCard: { alignSelf: "stretch", marginTop: spacing.xl, backgroundColor: colors.brandTint, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center" },
  subLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  subValue: { marginTop: 3, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.brand, letterSpacing: 0.4 },
  subDivider: { alignSelf: "stretch", height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: spacing.md },
  subValueSm: { marginTop: 3, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  nextTitle: { alignSelf: "flex-start", marginTop: spacing.xl, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  nextList: { alignSelf: "stretch", marginTop: spacing.md, gap: spacing.md },
  nextRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nextText: { fontSize: font.sm, color: colors.textSecondary, fontWeight: font.weightMedium },
});
