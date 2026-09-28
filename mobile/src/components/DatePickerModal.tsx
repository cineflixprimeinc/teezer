import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { colors } from "@/constants/colors";
import { spacing, font } from "@/constants/theme";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(monthIdx: number, year: number) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/** Parse a YYYY-MM-DD string into {year, month(0-11), day}; null if invalid. */
function parseISO(value?: string | null) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: +m[1], month: +m[2] - 1, day: +m[3] };
}

/**
 * Date-of-birth picker - three tappable columns (month / day / year) in a bottom
 * sheet. Avoids a native datetime dependency so it runs in Expo Go. Confirms an
 * ISO `YYYY-MM-DD` string via onConfirm.
 */
export function DatePickerModal({
  visible, value, onConfirm, onClose, minAge = 13, maxAge = 100, title = "Date of birth",
}: {
  visible: boolean;
  value?: string | null;
  onConfirm: (iso: string) => void;
  onClose: () => void;
  minAge?: number;
  maxAge?: number;
  title?: string;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const initial = parseISO(value) ?? { year: currentYear - 18, month: 0, day: 1 };

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  // Newest selectable year first (must be at least minAge old).
  const years = useMemo(() => {
    const top = currentYear - minAge;
    const bottom = currentYear - maxAge;
    return Array.from({ length: top - bottom + 1 }, (_, i) => top - i);
  }, [currentYear, minAge, maxAge]);

  const days = useMemo(() => {
    const count = daysInMonth(month, year);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [month, year]);

  const safeDay = Math.min(day, daysInMonth(month, year));

  function confirm() {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(safeDay).padStart(2, "0");
    onConfirm(`${year}-${mm}-${dd}`);
    onClose();
  }

  const insets = useSafeAreaInsets();
  return (
    // Columns scroll internally → drag-to-dismiss lives on the grabber/title.
    <BottomSheet visible={visible} onClose={onClose} scrollable={false} dragArea="header" header={<Text style={styles.title}>{title}</Text>}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.columns}>
          <Column
            data={MONTHS.map((m, i) => ({ key: i, label: m }))}
            selected={month}
            onSelect={(k) => setMonth(k as number)}
            flex={1.4}
          />
          <Column
            data={days.map((d) => ({ key: d, label: String(d) }))}
            selected={safeDay}
            onSelect={(k) => setDay(k as number)}
            flex={0.8}
          />
          <Column
            data={years.map((y) => ({ key: y, label: String(y) }))}
            selected={year}
            onSelect={(k) => setYear(k as number)}
            flex={1}
          />
        </View>

        <Button label="Confirm" onPress={confirm} style={{ marginTop: spacing.lg }} />
      </View>
    </BottomSheet>
  );
}

function Column({
  data, selected, onSelect, flex,
}: {
  data: { key: number; label: string }[];
  selected: number;
  onSelect: (key: number) => void;
  flex: number;
}) {
  return (
    <FlatList
      style={{ flex }}
      data={data}
      keyExtractor={(it) => String(it.key)}
      showsVerticalScrollIndicator={false}
      initialNumToRender={24}
      renderItem={({ item }) => {
        const active = item.key === selected;
        return (
          <Pressable onPress={() => onSelect(item.key)} style={styles.option}>
            <Text style={[styles.optionText, active && styles.optionActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.xl },
  title: { fontSize: font.lg, fontWeight: "800", color: colors.text, textAlign: "center", marginVertical: spacing.md },
  columns: { flexDirection: "row", height: 220, gap: spacing.sm },
  option: { paddingVertical: 10, alignItems: "center" },
  optionText: { fontSize: font.md, color: colors.textMuted },
  optionActive: { color: colors.brand, fontWeight: "800", fontSize: 17 },
});
