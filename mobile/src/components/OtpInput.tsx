import { useRef } from "react";
import { NativeSyntheticEvent, StyleSheet, TextInput, TextInputKeyPressEventData, View } from "react-native";
import { colors } from "@/constants/colors";
import { radius } from "@/constants/theme";

/**
 * 6-box OTP entry. Auto-advances on input, backspaces to the previous box, and
 * supports pasting a full code into the first box. Reports the joined string via
 * onChange. The active/filled box gets a brand-red border per the design.
 */
export function OtpInput({ value, onChange, autoFocus }: {
  value: string;
  onChange: (code: string) => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = value.split("").slice(0, 6);
  while (digits.length < 6) digits.push("");

  function setAt(idx: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    // Paste / multi-char: distribute across boxes from this index.
    if (cleaned.length > 1) {
      const arr = [...digits];
      for (let i = 0; i < cleaned.length && idx + i < 6; i++) arr[idx + i] = cleaned[i];
      onChange(arr.join(""));
      const next = Math.min(idx + cleaned.length, 5);
      refs.current[next]?.focus();
      return;
    }
    const arr = [...digits];
    arr[idx] = cleaned;
    onChange(arr.join(""));
    if (cleaned && idx < 5) refs.current[idx + 1]?.focus();
  }

  function onKey(idx: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === "Backspace" && !digits[idx] && idx > 0) {
      const arr = [...digits];
      arr[idx - 1] = "";
      onChange(arr.join(""));
      refs.current[idx - 1]?.focus();
    }
  }

  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          style={[styles.box, d ? styles.boxFilled : null]}
          value={d}
          onChangeText={(t) => setAt(i, t)}
          onKeyPress={(e) => onKey(i, e)}
          keyboardType="number-pad"
          maxLength={i === 0 ? 6 : 1}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus={autoFocus && i === 0}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: {
    flex: 1, aspectRatio: 0.86, maxWidth: 56,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    textAlign: "center", fontSize: 22, fontWeight: "700", color: colors.text,
  },
  boxFilled: { borderColor: colors.brand },
});
