import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Gifts & Coins Help - opened from the "?" on the Gifts & Coins intro screen
 * (GiftsIntroScreen). Same structure as ShopHelpScreen (search, grouped
 * articles, an article reader BottomSheet, a "still need help" card), scoped
 * to this one topic.
 *
 * Nothing below states a specific requirement number, commission rate or
 * coin rate as fact - those are admin-configurable and shown live on the
 * Gifts & Coins / Wallet screens themselves, so this points there instead of
 * repeating a figure that could go stale the moment an admin changes it.
 */

const SUPPORT_MAIL = "mailto:support@teezer.live?subject=Teezer%20Gifts%20%26%20Coins%20Support";
const HELP_SITE = "https://help.teezer.live";
type Ion = keyof typeof Ionicons.glyphMap;

interface Group { key: string; label: string; icon: Ion; tint: string; deep: string; }
interface Article { id: string; group: string; title: string; sub: string; body: string; }

const GROUPS: Group[] = [
  { key: "basics",   label: "Getting Started",     icon: "sparkles",       tint: "#ffe4ec", deep: colors.brand },
  { key: "sending",  label: "Sending Gifts",        icon: "gift",           tint: "#ffedd9", deep: "#f97316" },
  { key: "earning",  label: "Earning From Gifts",   icon: "trending-up",    tint: "#dcfce9", deep: "#16a34a" },
  { key: "payouts",  label: "Wallet & Payouts",   icon: "wallet",         tint: "#efeaff", deep: "#7c3aed" },
];

const ARTICLES: Article[] = [
  // Getting Started
  {
    id: "what-are-gifts-coins", group: "basics",
    title: "What are Gifts & Coins?",
    sub: "Teezer's in-app support system",
    body: "Coins are Teezer's in-app currency. Viewers buy Coins and send them as gifts on videos and during LIVE streams to show support for creators they love. Every gift a creator receives lands in their Creator Wallet in full, ready to be withdrawn as real earnings.",
  },
  {
    id: "how-to-get-coins", group: "basics",
    title: "How do I get Coins?",
    sub: "Buying Coins",
    body: "Tap Get Coins Now on the Gifts & Coins page, or Top Up from the Inbox's Gifts & Coins screen, to see the available Coin packages and payment options. Purchased Coins are added to your balance instantly and are ready to send as gifts right away.",
  },

  // Sending Gifts
  {
    id: "how-to-send-gift", group: "sending",
    title: "How do I send a gift?",
    sub: "During a LIVE stream or on a video",
    body: "While watching a LIVE stream or a video, tap the gift icon to open the gift tray, pick a gift, and send it - it costs the Coin amount shown on the gift. The creator sees it appear right away, and it's added to their earnings immediately.",
  },
  {
    id: "what-happens-on-send", group: "sending",
    title: "What happens when I send a gift?",
    sub: "Where the Coins go",
    body: "The Coins are deducted from your balance and the full value is credited to the creator's Creator Wallet - nothing is taken out of the gift itself. If you're one of a creator's biggest supporters, you may also earn recognition through Top Supporter perks.",
  },
  {
    id: "coins-refundable", group: "sending",
    title: "Can I get a refund on Coins?",
    sub: "Coins are final",
    body: "Coins are non-refundable once purchased, and a gift can't be reversed once it's sent - the creator has already been credited. Keep your account secure, since anyone with access to it can spend your Coin balance.",
  },

  // Earning From Gifts
  {
    id: "how-to-start-earning", group: "earning",
    title: "How do I start receiving gifts?",
    sub: "No application needed",
    body: "Unlike some other Teezer programmes, Gifts & Coins doesn't need an application - it unlocks automatically the moment you meet every requirement, which are re-checked regularly. Open Teezer Studio -> Monetization -> Gifts & Coins to see exactly which requirements you've met and which are still open.",
  },
  {
    id: "requirements", group: "earning",
    title: "What do I need to unlock Gifts & Coins?",
    sub: "Eligibility requirements",
    body: "The requirements are listed live on the Gifts & Coins page in Studio, with a checkmark next to each one you've already met - things like having a verified email or phone, an account of a minimum age, a few public videos, and no active Community Guidelines violations. They're admin-configured and kept current there, so that's always the accurate list.",
  },
  {
    id: "how-much-earn", group: "earning",
    title: "How much do I earn per gift?",
    sub: "Full value, credited instantly",
    body: "A gift credits your Creator Wallet in full, in Coins, the moment it's sent - nothing is deducted at that point. Teezer's commission only applies later, when you request a withdrawal, so the balance you see reflects exactly what people sent you.",
  },
  {
    id: "top-supporter-perks", group: "earning",
    title: "What are Top Supporter perks?",
    sub: "Recognizing your biggest supporters",
    body: "Your most generous gifters can stand out with badges and recognition tied to how much they've supported you. It's a way to thank the fans who show up for you the most, on top of the gifts themselves.",
  },

  // Wallet & Payouts
  {
    id: "where-earnings-go", group: "payouts",
    title: "Where do my gift earnings go?",
    sub: "Your Creator Wallet",
    body: "Every gift you receive is credited to your Creator Wallet. You can see your balance, recent gifts and supporters any time from the Inbox's Gifts & Coins screen.",
  },
  {
    id: "how-to-withdraw", group: "payouts",
    title: "How do I withdraw my earnings?",
    sub: "Cashing out",
    body: "Tap Withdraw from the Gifts & Coins screen. Payouts require an admin-approved tax form on file first - if you haven't submitted one yet, you'll be prompted to before your withdrawal is released.",
  },
  {
    id: "withdrawal-fee", group: "payouts",
    title: "Is there a fee when I withdraw?",
    sub: "Commission on payout",
    body: "Teezer takes a commission when you withdraw, not when a gift is received - the current rate and minimum withdrawal amount are shown live on the withdrawal screen, since they're set by Teezer and can change.",
  },
];

function ArticleRow({ a, onPress, divider }: { a: Article; onPress: () => void; divider: boolean }) {
  const g = GROUPS.find((x) => x.key === a.group)!;
  return (
    <Pressable
      style={({ pressed }) => [styles.articleRow, divider && styles.rowDivider, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.articleIcon, { backgroundColor: g.tint }]}>
        <Ionicons name={g.icon} size={18} color={g.deep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.articleTitle}>{a.title}</Text>
        <Text style={styles.articleSub} numberOfLines={1}>{a.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

export function GiftsCoinsHelpScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Article | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ARTICLES.filter((a) => a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
  }, [query]);

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Gifts & Coins Help</Text>
            <Text style={styles.subtitle}>Sending, receiving and getting paid</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search gifts & coins topics..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {searching ? (
          <>
            <Text style={styles.blockHead}>{results.length} {results.length === 1 ? "result" : "results"}</Text>
            <View style={styles.articleCard}>
              {results.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="search-outline" size={28} color={colors.textFaint} />
                  <Text style={styles.emptyText}>No topics found. Try another search.</Text>
                </View>
              ) : results.map((a, i) => (
                <ArticleRow key={a.id} a={a} divider={i < results.length - 1} onPress={() => setOpen(a)} />
              ))}
            </View>
          </>
        ) : (
          GROUPS.map((g) => {
            const list = ARTICLES.filter((a) => a.group === g.key);
            return (
              <View key={g.key}>
                <View style={styles.groupHead}>
                  <View style={[styles.groupIcon, { backgroundColor: g.tint }]}>
                    <Ionicons name={g.icon} size={16} color={g.deep} />
                  </View>
                  <Text style={styles.groupTitle}>{g.label}</Text>
                </View>
                <View style={styles.articleCard}>
                  {list.map((a, i) => (
                    <ArticleRow key={a.id} a={a} divider={i < list.length - 1} onPress={() => setOpen(a)} />
                  ))}
                </View>
              </View>
            );
          })
        )}

        <LinearGradient colors={["#1a2c3d", "#1f527a", colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.helpCard}>
          <View style={styles.mailBadge}>
            <Ionicons name="headset" size={26} color={colors.white} />
          </View>
          <Text style={styles.helpTitle}>Still need help?</Text>
          <Text style={styles.helpSub}>Browse the full Help Center or reach the support team directly.</Text>
          <Pressable style={styles.visitBtn} onPress={() => Linking.openURL(HELP_SITE).catch(() => {})}>
            <Ionicons name="globe-outline" size={17} color={colors.brand} />
            <Text style={styles.visitText}>Visit Help Center</Text>
            <Ionicons name="open-outline" size={15} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>
            <Ionicons name="mail-outline" size={16} color={colors.white} />
            <Text style={styles.contactText}>Contact Support</Text>
          </Pressable>
        </LinearGradient>
      </ScrollView>

      <BottomSheet visible={open != null} onClose={() => setOpen(null)} height={0.62}
        header={open ? (
          <View style={styles.sheetHead}>
            <View style={[styles.articleIcon, { backgroundColor: GROUPS.find((g) => g.key === open.group)!.tint }]}>
              <Ionicons name={GROUPS.find((g) => g.key === open.group)!.icon} size={19} color={GROUPS.find((g) => g.key === open.group)!.deep} />
            </View>
            <Text style={styles.sheetTitle}>{open.title}</Text>
          </View>
        ) : undefined}
      >
        {open && (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetText}>{open.body}</Text>
            <Pressable style={styles.sheetSupportBtn} onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>
              <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.brand} />
              <Text style={styles.sheetSupportText}>Still need help? Contact support</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  title: { fontSize: 24, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },

  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.lg, paddingHorizontal: spacing.md, height: 52 },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },

  blockHead: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  groupIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  groupTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  articleCard: { marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, overflow: "hidden" },
  articleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.bgMuted },
  articleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  articleTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  articleSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { fontSize: font.sm, color: colors.textMuted },

  helpCard: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.xl, padding: spacing.xl, overflow: "hidden" },
  mailBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  helpTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.white },
  helpSub: { fontSize: font.sm, color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 20 },
  visitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.lg, backgroundColor: colors.white, borderRadius: radius.pill, height: 48 },
  visitText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.brand },
  contactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: radius.pill, height: 46 },
  contactText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  sheetTitle: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetText: { fontSize: font.md, color: colors.textSecondary, lineHeight: 24 },
  sheetSupportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xl, backgroundColor: colors.brandTint, borderRadius: radius.md, paddingVertical: spacing.md },
  sheetSupportText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
});
