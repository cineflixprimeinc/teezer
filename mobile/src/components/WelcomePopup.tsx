import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, type LucideIcon } from "lucide-react-native";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

/**
 * A reusable first-run welcome popup - a compact, centered floating card over a
 * dimmed page, in the clean style of TikTok's onboarding sheets: a small brand
 * mark, a bold title, a few plain-icon feature rows, one flat button. It hugs
 * its content rather than filling the screen.
 *
 * Purely presentational. The caller decides when it's `visible` (see
 * useOnboarding) and `onClose` is what dismisses + marks it seen. Both the X and
 * the button call `onClose`, so either dismissal is final. Light theme only.
 */

// Default brand accent for onboarding popups (#F5074D).
const DEFAULT_ACCENT = "#F5074D";

export type WelcomeFeature = { Icon: LucideIcon; title: string; body: string };

export function WelcomePopup({
  visible,
  onClose,
  icon: Icon,
  title,
  description,
  features,
  ctaLabel = "Got it",
  accent = DEFAULT_ACCENT,
}: {
  visible: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  description?: string;
  features: WelcomeFeature[];
  ctaLabel?: string;
  accent?: string;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep the Modal mounted through the exit animation, then unmount.
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // `mounted` intentionally omitted: we only react to `visible` flipping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const cardTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  // Sit just above the bottom nav, not centered.
  const bottomLift = insets.bottom + TAB_BAR_HEIGHT + spacing.lg;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: bottomLift }]}>
        {/* Dimmed page behind the card; tapping it dismisses too. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[styles.card, { maxHeight: height * 0.8, opacity: anim, transform: [{ translateY: cardTranslateY }] }]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.badge, { backgroundColor: accent }]}>
              <Icon size={26} color={colors.white} strokeWidth={2.4} />
            </View>

            <Text style={styles.title}>{title}</Text>
            {!!description && <Text style={styles.desc}>{description}</Text>}

            <View style={styles.features}>
              {features.map(({ Icon: FIcon, title: ft, body }) => (
                <View key={ft} style={styles.feature}>
                  <View style={styles.featureIcon}>
                    <FIcon size={24} color={accent} strokeWidth={2} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{ft}</Text>
                    <Text style={styles.featureBody}>{body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cta, { backgroundColor: accent }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  dim: { backgroundColor: "rgba(0, 0, 0, 0.5)" },
  pressed: { opacity: 0.85 },

  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 22,
  },

  close: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgMuted,
  },

  scrollContent: { paddingBottom: spacing.xs },

  badge: {
    alignSelf: "center",
    width: 58,
    height: 58,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.xxl,
    fontWeight: font.weightHeavy,
    color: colors.text,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  desc: {
    marginTop: spacing.sm,
    fontSize: font.sm,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: "center",
  },

  features: { alignSelf: "stretch", marginTop: spacing.lg, gap: spacing.md },
  feature: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  featureIcon: { width: 28, alignItems: "center", paddingTop: 1 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  featureBody: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },

  cta: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  ctaText: { color: colors.white, fontSize: font.lg, fontWeight: font.weightHeavy },
});
