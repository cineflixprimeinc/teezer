import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { colors } from "@/constants/colors";
import { font } from "@/constants/theme";
import type { SavedAccount } from "@/utils/secure-store";

/**
 * Shared UI kit for the Saved-Accounts feature (login picker + manage page).
 * Reelsoo light theme, premium spacing, rounded cards, soft shadows and the
 * feature accent below. Kept dependency-free (plain Animated) so it runs at
 * 60/120fps in Expo Go with no reanimated.
 */

/** Feature accent - the brand pink requested for Saved Accounts (#F5074D). */
export const ACCENT = "#F5074D";
export const ACCENT_TINT = "#FFEAF0";

/** The best display name for a saved account: custom label → name → @username. */
export function accountTitle(a: SavedAccount): string {
  return (a.label && a.label.trim()) || a.name || a.username;
}

/** Avatar with a soft ring; `active` gives it the accent ring + a status dot. */
export function AccountAvatar({ account, size = 52, active }: { account: SavedAccount; size?: number; active?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatarRing, { width: size, height: size, borderRadius: size / 2, borderColor: active ? ACCENT : colors.border }]}>
        <Avatar uri={account.avatar} style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2, backgroundColor: colors.bgMuted }} />
      </View>
      {active && <View style={[styles.statusDot, { borderColor: colors.white }]} />}
    </View>
  );
}

/** Avatar + name (with verified badge) + @username, used inside every account row. */
export function AccountIdentity({ account, active, avatarSize = 52 }: { account: SavedAccount; active?: boolean; avatarSize?: number }) {
  return (
    <>
      <AccountAvatar account={account} size={avatarSize} active={active} />
      <View style={styles.identityText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{accountTitle(account)}</Text>
          {account.is_verified && <VerifiedBadge size={15} />}
        </View>
        <Text style={styles.handle} numberOfLines={1}>@{account.username}</Text>
        {active && <Text style={styles.activeLabel}>Active now</Text>}
      </View>
    </>
  );
}

/**
 * A card with an iOS-style press-in scale spring (native-driven transform, so it
 * stays smooth). Used for the tappable one-tap-login account cards.
 */
export function PressCard({
  onPress, disabled, children, style,
}: { onPress?: () => void; disabled?: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }, disabled && styles.cardDisabled, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardDisabled: { opacity: 0.55 },

  avatarRing: { borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  statusDot: {
    position: "absolute", right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#22c55e", borderWidth: 2.5,
  },

  identityText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  handle: { marginTop: 1, fontSize: font.sm, color: colors.textMuted },
  activeLabel: { marginTop: 2, fontSize: font.xs, fontWeight: font.weightBold, color: "#16a34a" },
});
