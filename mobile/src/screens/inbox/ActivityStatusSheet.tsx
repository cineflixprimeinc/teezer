import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { profileApi, type ActivityStatus } from "@/api/profile.api";
import { useAuthStore } from "@/store/auth.store";
import { prefsApi } from "@/api/prefs.api";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";

/**
 * "Choose who can see when you're active" - the sheet behind the caret next to
 * the Inbox title.
 *
 * Both controls are real settings, not local state:
 *   - the three options write `activity_status` via PATCH /profile/privacy
 *   - the toggle writes `read_receipts` via PATCH /profile/messages-preferences
 *
 * They live on two different endpoints, which is why this does not batch them
 * into one save. Each writes as you tap it - a sheet with no Save button must
 * not leave a choice unsaved when it is dismissed.
 */

const OPTIONS: { key: ActivityStatus; label: string; body: string }[] = [
  {
    key: "public",
    label: "Public",
    body: "Anyone on Teezer can see your activity status.",
  },
  {
    key: "friends",
    label: "Friends",
    body: "Followers you follow back — you'll see theirs only if they share it too.",
  },
  {
    key: "no_one",
    label: "No one",
    body: "Nobody sees your status, and you keep seeing public ones.",
  },
];

function CloseGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6 6 18M6 6l12 12" stroke={ds.text} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function ActivityStatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  const privacy = useQuery({
    queryKey: ["privacy-settings"],
    queryFn: () => profileApi.getPrivacy(),
    enabled: open,
    staleTime: 60_000,
  });

  /** Local echo so a tap lands instantly; null means "show the server's value". */
  const [choice, setChoice] = useState<ActivityStatus | null>(null);
  const status: ActivityStatus = choice ?? privacy.data?.activity_status ?? "public";

  /** read_receipts lives on messages-preferences, a DIFFERENT endpoint from the
   *  privacy settings above - which is why the two save independently. */
  const msgPrefs = useQuery({
    queryKey: ["messages-preferences"],
    queryFn: () => prefsApi.messages(),
    enabled: open,
    staleTime: 60_000,
  });
  const [receiptEcho, setReceiptEcho] = useState<boolean | null>(null);
  const hideReceipts = receiptEcho ?? !(msgPrefs.data?.read_receipts ?? true);

  // A reopened sheet must show the truth, not the last optimistic guess.
  useEffect(() => {
    if (open) {
      setChoice(null);
      setReceiptEcho(null);
    }
  }, [open]);

  const toggleReceipts = useCallback(
    (hide: boolean) => {
      const prev = hideReceipts;
      setReceiptEcho(hide);
      prefsApi
        .updateMessages({ read_receipts: !hide })
        .then(() => qc.invalidateQueries({ queryKey: ["messages-preferences"] }))
        .catch(() => setReceiptEcho(prev));
    },
    [hideReceipts, qc],
  );

  const pick = useCallback(
    (next: ActivityStatus) => {
      const prev = status;
      setChoice(next);
      profileApi
        .updatePrivacy({ activity_status: next })
        .then(() => qc.invalidateQueries({ queryKey: ["privacy-settings"] }))
        // Roll back rather than leaving a radio marking a setting that did not save.
        .catch(() => setChoice(prev));
    },
    [status, qc],
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={styles.close}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        >
          <CloseGlyph />
        </Pressable>

        <View style={styles.avatarWrap}>
          <Avatar uri={me?.avatar} style={styles.avatar} />
          {/* The dot is the thing being configured, so it is shown as it would
              appear to others under the current choice. */}
          {status !== "no_one" && <View style={styles.dot} />}
        </View>

        <Text style={styles.title}>Choose who can see{"\n"}when you&apos;re active</Text>

        <View style={styles.card}>
          {OPTIONS.map((o, i) => {
            const on = o.key === status;
            return (
              <Pressable
                key={o.key}
                style={[styles.row, i > 0 && styles.rowDivider]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => pick(o.key)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.optLabel}>{o.label}</Text>
                  <Text style={styles.optBody}>{o.body}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.receiptRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.optLabel}>Hide read receipts too</Text>
            <Text style={styles.optBody}>People won&apos;t see when you&apos;ve opened their message.</Text>
          </View>
          {/* Inverted: the setting is `read_receipts`, the row asks to HIDE them. */}
          <Switch
            value={hideReceipts}
            onValueChange={toggleReceipts}
            trackColor={{ false: "#E8E5EC", true: ds.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Transparent, not removed: it is still the tap-outside-to-close target, it
  // just no longer dims. The sheet's own shadow does the separating instead.
  scrim: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    backgroundColor: ds.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 22,
    // Without a scrim the sheet needs its own edge, or it reads as part of the
    // screen underneath rather than as something layered over it.
    shadowColor: "#12101422",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 18,
  },
  close: { position: "absolute", right: 16, top: 16, zIndex: 2 },

  avatarWrap: { alignSelf: "center", marginTop: 8 },
  avatar: { width: 84, height: 84, borderRadius: 999 },
  dot: {
    position: "absolute",
    right: 3,
    bottom: 3,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#2BC48A",
    borderWidth: 3,
    borderColor: ds.surface,
  },

  title: {
    fontSize: 22,
    fontWeight: font.weightHeavy,
    color: ds.text,
    textAlign: "center",
    lineHeight: 29,
    marginTop: 16,
    marginBottom: 18,
  },

  card: { backgroundColor: "#F7F6F8", borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E9E6EE" },
  optLabel: { fontSize: font.base, fontWeight: font.weightBold, color: ds.text },
  optBody: { fontSize: font.sm, color: ds.textMuted, lineHeight: 19, marginTop: 3 },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#D8D4DE",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: ds.accent },
  radioDot: { width: 11, height: 11, borderRadius: 999, backgroundColor: ds.accent },

  receiptRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 4, paddingTop: 18 },
});
