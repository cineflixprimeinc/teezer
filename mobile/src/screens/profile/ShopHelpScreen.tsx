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
 * Shop Help - opened from the "?" on the Sell on Reelsoo intro screen
 * (SellerApplicationScreen). Same structure as the general HelpCenterScreen
 * (search, grouped articles, an article reader BottomSheet, a "still need
 * help" card) but scoped to one topic, so it skips that screen's full
 * category-disc browser - there's only one topic here.
 *
 * Nothing below states a specific follower count, review time or payout
 * rate as fact - those are shown live on the application/Shop screens
 * themselves and can change from there without this copy going stale.
 */

const SUPPORT_MAIL = "mailto:support@teezer.live?subject=Teezer%20Shop%20Support";
const HELP_SITE = "https://help.teezer.live";
type Ion = keyof typeof Ionicons.glyphMap;

interface Group { key: string; label: string; icon: Ion; tint: string; deep: string; }
interface Article { id: string; group: string; title: string; sub: string; body: string; }

const GROUPS: Group[] = [
  { key: "basics",   label: "Getting Started",  icon: "storefront",         tint: "#ffe4ec", deep: colors.brand },
  { key: "apply",    label: "Applying",         icon: "document-text",      tint: "#ffedd9", deep: "#f97316" },
  { key: "selling",  label: "Selling",          icon: "pricetags",          tint: "#dcfce9", deep: "#16a34a" },
  { key: "payments", label: "Payments",         icon: "wallet",             tint: "#efeaff", deep: "#7c3aed" },
];

const ARTICLES: Article[] = [
  // Getting Started
  {
    id: "what-is-shop", group: "basics",
    title: "What is Teezer Shop?",
    sub: "A marketplace built into the app",
    body: "Teezer Shop lets you list and sell your own products directly to people on Teezer - a marketplace built right into the app, not a separate site. Once you're approved, your products can be showcased in your videos, in LIVE streams, and on a Shop tab on your profile, so people can buy without leaving the app.",
  },
  {
    id: "who-can-sell", group: "basics",
    title: "Who can sell on Teezer?",
    sub: "Individuals and businesses",
    body: "Both individual creators and businesses can apply to sell on Teezer. During the application you'll pick the seller type that matches you, and the steps that follow are tailored to it. Everyone still needs to meet the eligibility requirements shown on the application page and pass review before their Shop goes live.",
  },

  // Applying
  {
    id: "how-to-apply", group: "apply",
    title: "How do I apply to sell?",
    sub: "Start your application",
    body: "Open Settings -> Teezer Shop and tap Apply Now. You'll go through a short application - your seller type, shop details, and any documents we need to verify - then submit it for review. You can save an in-progress application and come back to finish it later.",
  },
  {
    id: "requirements", group: "apply",
    title: "What do I need to qualify?",
    sub: "Eligibility requirements",
    body: "The requirements to apply are listed right on the application screen - things like meeting our Community Guidelines, a minimum age, and an account in good standing. They're kept up to date there, so that's always the accurate list rather than repeating specific numbers here that could change.",
  },
  {
    id: "review-time", group: "apply",
    title: "How long does review take?",
    sub: "What happens after you submit",
    body: "Our team reviews every application - we'll get back to you within a few days. You can check your status any time from Settings -> Teezer Shop. Meeting the listed requirements is a good sign, but it doesn't guarantee approval; we also check that everything in your application looks right.",
  },
  {
    id: "needs-info-rejected", group: "apply",
    title: "My application needs more information, or was rejected",
    sub: "What to do next",
    body: "If we need more from you, you'll see \"Needs Information\" with a note explaining what to add - tap Complete Required Information to update and resubmit. If your application wasn't approved, you'll see the reason (when we can share one) and can tap Update Application to make changes and try again - a rejection isn't necessarily final.",
  },

  // Selling
  {
    id: "add-product", group: "selling",
    title: "How do I add a product?",
    sub: "List something for sale",
    body: "Once your Shop is approved, open your Shop and tap Add Product. Add photos, a title, description, price and any variants (like size or colour), then publish. Your product then appears on your Shop tab and can be linked from your videos and LIVE streams.",
  },
  {
    id: "edit-product", group: "selling",
    title: "How do I edit, hide or remove a product?",
    sub: "Manage your listings",
    body: "Open your Shop, tap the product, and choose Edit to change its details or photos, or use the options there to take it down. Changes to price or availability apply immediately - there's no separate re-approval step for routine edits.",
  },
  {
    id: "found-by-buyers", group: "selling",
    title: "How do buyers find my products?",
    sub: "Where your Shop shows up",
    body: "Your products show up wherever you link them - tagged in a video, pinned during a LIVE stream, or browsed directly from your profile's Shop tab. Featuring your best-selling or newest items in your content is usually what drives the most visits.",
  },

  // Payments
  {
    id: "getting-paid", group: "payments",
    title: "How do I get paid for sales?",
    sub: "Payouts and fees",
    body: "Your Shop dashboard shows your sales, balance and payout details once you're approved and selling - that's the accurate place to check current rates and thresholds, since they're shown live rather than repeated here. If a payout looks wrong, contact support with the order details and we'll look into it.",
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

export function ShopHelpScreen() {
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
            <Text style={styles.title}>Shop Help</Text>
            <Text style={styles.subtitle}>Applying, selling and getting paid on Teezer</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search shop help topics..."
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

        <LinearGradient colors={["#2c1a3d", "#7a1f52", colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.helpCard}>
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
