import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const LOGO = require("../../assets/logo.png"); // the website wordmark logo
type Ion = keyof typeof Ionicons.glyphMap;

interface Feature { key: string; icon: Ion; title: string; desc: string; body: string; }

const FEATURES: Feature[] = [
  {
    key: "mission", icon: "videocam", title: "Our Mission",
    desc: "Empowering creativity by making video creation simple, fun and accessible for everyone.",
    body: "We believe anyone can be a creator. Teezer exists to remove the barriers between an idea and a finished video - no expensive gear, no complicated software. Just open the app, capture a moment, and share it with the world in minutes.",
  },
  {
    key: "why", icon: "star", title: "Why Teezer?",
    desc: "Easy to use, feature rich, and built for creators who love to tell stories.",
    body: "Teezer pairs a simple, fast interface with genuinely powerful tools. Whether you're posting your first reel or growing an audience of millions, you get trending sounds, smart editing, and a For You feed that helps the right people discover your work.",
  },
  {
    key: "offer", icon: "heart", title: "What We Offer",
    desc: "Powerful editing tools, trending templates, effects, filters and more.",
    body: "Record or import clips, trim and reorder them, add trending sounds, captions, stickers, effects and filters, then post in multiple qualities automatically. Creators also get Teezer Studio for analytics, monetization and payouts.",
  },
  {
    key: "privacy", icon: "shield-checkmark", title: "Your Privacy",
    desc: "We respect your privacy and keep your data safe and secure.",
    body: "Your privacy comes first: we don't sell your data, we use no third-party ad trackers, and you get clear controls over who can see and interact with you. Everything is encrypted in transit and protected with account-security tools like two-factor authentication.",
  },
  {
    key: "community", icon: "people", title: "Our Community",
    desc: "Join millions of creators and be part of a global creative community.",
    body: "Teezer is more than an app - it's a community of creators from around the world. Follow people you love, discover new voices, collaborate through Duets, and be part of a positive, creative space guided by our Community Guidelines.",
  },
];

interface Social { key: string; label: string; icon: Ion; color: string; url: string; }
const SOCIALS: Social[] = [
  { key: "instagram", label: "Instagram", icon: "logo-instagram", color: "#E4405F", url: "https://instagram.com/teezer" },
  { key: "tiktok", label: "TikTok", icon: "logo-tiktok", color: "#000000", url: "https://tiktok.com/@teezer" },
  { key: "youtube", label: "YouTube", icon: "logo-youtube", color: "#FF0000", url: "https://youtube.com/@teezer" },
  { key: "twitter", label: "Twitter", icon: "logo-twitter", color: "#1DA1F2", url: "https://twitter.com/teezer" },
  { key: "facebook", label: "Facebook", icon: "logo-facebook", color: "#1877F2", url: "https://facebook.com/teezer" },
];

/**
 * About Teezer - opened from the three-dot menu › About Teezer. Info cards
 * open a detail popup; social icons and legal links are wired.
 */
export function AboutTeezerScreen() {
  const navigation = useNavigation<any>();
  const [openFeature, setOpenFeature] = useState<Feature | null>(null);
  const version = (Constants.expoConfig as { version?: string } | null)?.version ?? "1.0.0";
  const year = 2026;

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>About Teezer</Text>
        <View style={styles.back} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
        {/* Hero */}
        <View style={styles.hero}>
          {/* decorative sparkles */}
          <View style={[styles.dot, { top: 30, left: 28, backgroundColor: colors.brand }]} />
          <View style={[styles.ring, { top: 60, left: 20 }]} />
          <View style={[styles.dot, { top: 22, right: 60, width: 12, height: 12, borderRadius: 6, backgroundColor: "#ffb3c6" }]} />
          <Ionicons name="close" size={16} color={colors.brand} style={{ position: "absolute", top: 44, left: 60 }} />
          <Ionicons name="star" size={14} color="#ffb3c6" style={{ position: "absolute", top: 90, right: 56 }} />
          <View style={[styles.ring, { top: 34, right: 30, width: 14, height: 14, borderRadius: 7 }]} />

          <Image source={LOGO} style={styles.logo} contentFit="contain" />
          <Text style={styles.tagline}>Make. Edit. Share.</Text>
          <Text style={styles.version}>Version {version}</Text>
        </View>

        <Text style={styles.intro}>
          Teezer is your all-in-one video creation platform. Create stunning reels, edit with powerful tools, and share your story with the world.
        </Text>

        {/* Feature cards */}
        <View style={styles.card}>
          {FEATURES.map((f, i) => (
            <Pressable key={f.key} style={({ pressed }) => [styles.featureRow, i < FEATURES.length - 1 && styles.divider, pressed && styles.pressed]} onPress={() => setOpenFeature(f)}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.brand} />
            </Pressable>
          ))}
        </View>

        {/* Connect */}
        <View style={styles.connectCard}>
          <Text style={styles.connectHead}>Connect With Us</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((sc) => (
              <Pressable key={sc.key} style={styles.socialItem} onPress={() => Linking.openURL(sc.url).catch(() => {})}>
                <View style={styles.socialCircle}>
                  <Ionicons name={sc.icon} size={22} color={sc.color} />
                </View>
                <Text style={styles.socialLabel}>{sc.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Legal */}
        <View style={styles.card}>
          <Pressable style={({ pressed }) => [styles.legalRow, styles.divider, pressed && styles.pressed]} onPress={() => openPolicy("terms")}>
            <View style={styles.legalIcon}><Ionicons name="document-text-outline" size={19} color={colors.brand} /></View>
            <Text style={styles.legalLabel}>Terms of Use</Text>
            <Ionicons name="chevron-forward" size={19} color={colors.brand} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]} onPress={() => openPolicy("privacy")}>
            <View style={styles.legalIcon}><Ionicons name="lock-closed-outline" size={19} color={colors.brand} /></View>
            <Text style={styles.legalLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={19} color={colors.brand} />
          </Pressable>
        </View>

        <Text style={styles.copyright}>© {year} Teezer. All rights reserved.</Text>
      </ScrollView>

      {/* Feature detail popup */}
      <BottomSheet visible={openFeature != null} onClose={() => setOpenFeature(null)} scrollable={false}
        header={openFeature ? (
          <View style={styles.sheetHead}>
            <View style={styles.featureIcon}><Ionicons name={openFeature.icon} size={22} color={colors.brand} /></View>
            <Text style={styles.sheetTitle}>{openFeature.title}</Text>
          </View>
        ) : undefined}
      >
        {openFeature && (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetText}>{openFeature.body}</Text>
          </View>
        )}
      </BottomSheet>

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, height: 56 },
  back: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },

  hero: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card, alignItems: "center", paddingVertical: spacing.xxl, marginTop: spacing.sm, overflow: "hidden" },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  ring: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#ffd0dc" },
  logo: { width: 210, height: 56, marginBottom: spacing.xs },
  tagline: { fontSize: font.lg, fontWeight: font.weightBold, color: colors.brand, marginTop: 4 },
  version: { fontSize: font.md, color: colors.textMuted, marginTop: spacing.sm },

  intro: { fontSize: font.md, color: colors.textMuted, textAlign: "center", lineHeight: 24, marginTop: spacing.lg, paddingHorizontal: spacing.sm },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, marginTop: spacing.lg, overflow: "hidden" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.bgMuted },
  featureIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  featureDesc: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, lineHeight: 19 },

  connectCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, marginTop: spacing.lg, padding: spacing.lg },
  connectHead: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.md },
  socialRow: { flexDirection: "row", justifyContent: "space-between" },
  socialItem: { alignItems: "center", gap: 6, flex: 1 },
  socialCircle: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  socialLabel: { fontSize: font.xs, color: colors.textSecondary },

  legalRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md + 2 },
  legalIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  legalLabel: { flex: 1, fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  copyright: { textAlign: "center", fontSize: font.sm, color: colors.textFaint, marginTop: spacing.xl },

  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  sheetTitle: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sheetText: { fontSize: font.md, color: colors.textSecondary, lineHeight: 24 },
});
