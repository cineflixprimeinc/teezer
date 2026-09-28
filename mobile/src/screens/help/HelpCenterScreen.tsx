import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const SUPPORT_MAIL = "mailto:support@teezer.live?subject=Help%20Center%20Support";
const HELP_SITE = "https://help.teezer.live";
type Ion = keyof typeof Ionicons.glyphMap;

interface Category { key: string; label: string; icon: Ion; tint: string; deep: string; }
interface Article { id: string; category: string; icon: Ion; tint: string; deep: string; title: string; sub: string; body: string; }

/* ── Main help groups (the "menu" the user browses by) ── */
const GROUPS: Category[] = [
  { key: "getting-started", label: "Getting Started", icon: "rocket", tint: "#ffe4ec", deep: colors.brand },
  { key: "account", label: "Account & Profile", icon: "person", tint: "#ffe4ec", deep: colors.brand },
  { key: "privacy", label: "Privacy & Safety", icon: "shield-checkmark", tint: "#efeaff", deep: "#7c3aed" },
  { key: "payments", label: "Payments & Earnings", icon: "wallet", tint: "#dcfce9", deep: "#16a34a" },
  { key: "creator", label: "Creator Tools", icon: "star", tint: "#ffedd9", deep: "#f97316" },
  { key: "creating", label: "Creating Content", icon: "play", tint: "#ffedd9", deep: "#f97316" },
  { key: "tech", label: "App & Tech Support", icon: "settings-sharp", tint: "#e2effe", deep: "#3b82f6" },
];

/* ── The five discs at the top (quick access) ── */
const DISCS: Category[] = [
  GROUPS[1], GROUPS[2], GROUPS[3], GROUPS[5], GROUPS[6],
];

/* ── All tutorials, grouped by category ── */
const ARTICLES: Article[] = [
  // Getting Started
  { id: "create-account", category: "getting-started", icon: "person-add", tint: "#ffe4ec", deep: colors.brand, title: "How to create an account?", sub: "Get started on Teezer in a minute", body: "Getting started takes less than a minute:\n\n1. Open the app and tap Sign up.\n2. Enter your email and create a strong password, or continue with Google or Apple.\n3. Verify your email with the 6-digit code we send you.\n4. Pick a username and add a profile photo.\n5. Choose a few interests so your For You feed is tailored from day one.\n\nThat's it - you're ready to watch, create and connect." },
  { id: "first-reel", category: "getting-started", icon: "videocam", tint: "#ffe4ec", deep: colors.brand, title: "Post your first reel", sub: "Share your first video", body: "Tap the + button in the bottom bar, record in-app or pick a clip from your gallery, add a sound and caption, then tap Post. Your reel goes live to your followers and can be discovered on For You. Film vertically in good lighting for the best result." },
  { id: "find-friends", category: "getting-started", icon: "people", tint: "#ffe4ec", deep: colors.brand, title: "How to find friends", sub: "Follow people you know", body: "Open your profile and tap the people icon at the top-left to open Find Friends. From there you can see friend requests, people you may know (suggested by mutual friends), and invite contacts. You can also search for anyone by username from the search page." },

  // Account & Profile
  { id: "edit-profile", category: "account", icon: "create", tint: "#ffe4ec", deep: colors.brand, title: "How to edit my profile?", sub: "Update name, bio, photo and links", body: "Open your profile and tap Edit Profile, or go to Settings → Account Settings → Profile Information. Change your name, username, bio, profile photo, category, and add links to your other social accounts. Changes save instantly." },
  { id: "grow", category: "account", icon: "trending-up", tint: "#ffe4ec", deep: colors.brand, title: "How to grow your followers?", sub: "Tips to grow your audience", body: "Growing comes down to consistency and connection:\n\n• Post regularly - creators who show up often reach more people.\n• Jump on trending sounds and hashtags while they're hot.\n• Hook viewers in the first two seconds.\n• Reply to comments and engage with creators in your niche.\n• Complete your profile so new visitors know who to follow." },
  { id: "change-username", category: "account", icon: "at", tint: "#ffe4ec", deep: colors.brand, title: "How to change your username", sub: "Pick a new @handle", body: "Go to Settings → Account Settings → Profile Information → Username. Enter a new username; if it's available it saves immediately. Your old username becomes free for others, so update any links that point to your profile." },
  { id: "delete-account", category: "account", icon: "trash", tint: "#ffe4ec", deep: colors.brand, title: "How to delete your account", sub: "Permanently close your account", body: "Go to Settings → Account. Choose to delete your account and confirm with your password. All your sessions are signed out and your content stops being available to others. Some records are kept briefly for legal and safety reasons - see the Privacy Policy for details." },

  // Privacy & Safety
  { id: "account-safe", category: "privacy", icon: "shield-checkmark", tint: "#efeaff", deep: "#7c3aed", title: "How to keep your account safe?", sub: "Best security practices", body: "Protect your account in Settings → Security:\n\n• Turn on two-factor authentication so a stolen password alone can't get in.\n• Enable new-login alerts.\n• Review active sessions and revoke any you don't recognize.\n• Use a strong, unique password.\n\nIf you think your account is compromised, change your password, revoke other sessions, and contact us." },
  { id: "private-account", category: "privacy", icon: "lock-closed", tint: "#efeaff", deep: "#7c3aed", title: "How to make my account private?", sub: "Approve who can follow you", body: "Go to Settings → Privacy and turn on Private account. New followers then need your approval, managed from Follow Requests. You can also control who can message you, comment, tag you, Duet and download - all in the same place." },
  { id: "two-factor", category: "privacy", icon: "keypad", tint: "#efeaff", deep: "#7c3aed", title: "Turn on two-factor authentication", sub: "Add a second layer of security", body: "Go to Settings → Security → Two-factor authentication and follow the steps. Once on, logging in requires a second factor in addition to your password, so no one can access your account with the password alone." },
  { id: "block-report", category: "privacy", icon: "hand-left", tint: "#efeaff", deep: "#7c3aed", title: "How to block or report someone?", sub: "Keep your space safe", body: "To block: open the person's profile, tap the menu, and choose Block - they can't find your profile, view your content or message you. To report content or an account, use Report in the same menu. Reports are confidential." },

  // Payments & Earnings
  { id: "earn", category: "payments", icon: "cash", tint: "#dcfce9", deep: "#16a34a", title: "How do I earn on Teezer?", sub: "Monetization and payouts", body: "Eligible creators earn from Gifts sent by viewers and other features in Teezer Studio:\n\n• Viewers buy Coins and send you Gifts on your content.\n• Gifts convert to earnings and add to your balance.\n• Once you pass the payout threshold, request a transfer to your registered payout method.\n\nEligibility, rates and thresholds are shown in Studio." },
  { id: "coins", category: "payments", icon: "diamond", tint: "#dcfce9", deep: "#16a34a", title: "How do Coins and Gifts work?", sub: "Buying Coins and sending Gifts", body: "Coins are a virtual item you buy to send Gifts to creators. Buy them from your wallet, then tap the Gift option on a creator's content. Coins have no cash value and can't be transferred off the Platform. Payments are handled securely by our partners - we never see your card details." },
  { id: "payout-method", category: "payments", icon: "card", tint: "#dcfce9", deep: "#16a34a", title: "How to set up a payout method?", sub: "Get paid for your earnings", body: "In Teezer Studio, open the wallet or monetization section and add a payout method. Enter accurate details - payouts are sent only to the method you register. Once your balance passes the minimum threshold, you can request a payout." },
  { id: "coin-refund", category: "payments", icon: "receipt", tint: "#dcfce9", deep: "#16a34a", title: "Can I get a refund on Coins?", sub: "Refund and billing questions", body: "Coin purchases are final and non-refundable, except where required by the law of your country or where a purchase failed to deliver the Coins. If you paid but weren't credited, contact support@teezer.live with the transaction reference and we'll fix it." },

  // Creator Tools
  { id: "studio", category: "creator", icon: "film", tint: "#ffedd9", deep: "#f97316", title: "What is Teezer Studio?", sub: "Your creator dashboard", body: "Teezer Studio is where you manage your content and growth: view analytics, manage your videos and drafts, set up monetization and payouts, apply for verification, and access creator tools. Open it from Settings → Teezer Studio." },
  { id: "verification", category: "creator", icon: "checkmark-circle", tint: "#ffedd9", deep: "#f97316", title: "How to get verified", sub: "Apply for a verified badge", body: "Verification confirms a notable account is authentic. In Teezer Studio, open the verification section and submit the required details. Our team reviews requests; you'll be notified of the decision. Meeting the criteria doesn't guarantee approval." },
  { id: "analytics", category: "creator", icon: "stats-chart", tint: "#ffedd9", deep: "#f97316", title: "Understanding your analytics", sub: "Track views, followers and reach", body: "In Teezer Studio you can see how your videos perform - views, watch time, likes, shares, follower growth and where your audience comes from. Use it to learn what content resonates and post more of what works." },

  // Creating Content
  { id: "upload", category: "creating", icon: "cloud-upload", tint: "#ffedd9", deep: "#f97316", title: "How to upload a reel?", sub: "Upload high-quality content", body: "1. Tap the + button in the bottom bar.\n2. Record in-app or pick a video from your gallery.\n3. Trim, add a sound, captions and hashtags.\n4. Set who can view, comment and Duet.\n5. Tap Post.\n\nFilm vertically in good lighting - Teezer streams every reel in multiple qualities automatically." },
  { id: "sounds", category: "creating", icon: "musical-notes", tint: "#ffedd9", deep: "#f97316", title: "How to add sounds to my video?", sub: "Use trending audio", body: "While editing a reel, tap the sound option to browse Teezer's library or use a trending sound. Trim where the audio starts and adjust its volume against your original audio. You can also upload original audio for other creators to use, credited to you." },
  { id: "edit-video", category: "creating", icon: "cut", tint: "#ffedd9", deep: "#f97316", title: "How to edit your videos", sub: "Trim, effects and captions", body: "While creating a reel you can trim clips, reorder them, add trending sounds, layer captions and stickers, and apply effects. Tap any element to fine-tune it, preview, and keep editing until it's right. Save an unfinished edit to Drafts to finish later." },
  { id: "drafts", category: "creating", icon: "documents", tint: "#ffedd9", deep: "#f97316", title: "How to save and manage drafts", sub: "Finish reels later", body: "Any reel you save before posting goes to Drafts on your profile. Open a draft to keep editing and post it, or delete drafts you no longer need. Drafts are stored on your account so you can pick up where you left off." },

  // App & Tech Support
  { id: "playback", category: "tech", icon: "cog", tint: "#e2effe", deep: "#3b82f6", title: "Video won't play or keeps buffering?", sub: "Fix playback issues", body: "Most playback issues are network-related:\n\n• Check your connection and try switching Wi-Fi and mobile data.\n• Turn on Data Saver Mode in Settings → Content Preferences on slow connections.\n• Close and reopen the app.\n• Make sure you're on the latest version.\n\nA specific stuck video usually recovers on its own within a few seconds." },
  { id: "notifications-not-working", category: "tech", icon: "notifications", tint: "#e2effe", deep: "#3b82f6", title: "I'm not getting notifications", sub: "Turn notifications back on", body: "Check Settings → Notifications in the app and enable the categories you want. Then check your device's system settings and confirm notifications are allowed for Teezer. If they were denied at install, re-enable them from your phone's app settings." },
  { id: "update-app", category: "tech", icon: "download", tint: "#e2effe", deep: "#3b82f6", title: "How to update the app", sub: "Get the latest version", body: "Open the App Store (iOS) or Play Store (Android), search for Teezer, and tap Update if one is available. Running the latest version fixes bugs and unlocks new features. You can also turn on automatic updates in your store settings." },
  { id: "storage", category: "tech", icon: "trash-bin", tint: "#e2effe", deep: "#3b82f6", title: "Free up storage or clear cache", sub: "If the app feels slow", body: "Over time the app caches media to load faster. If your device is low on space or the app feels sluggish, clear Teezer's cache from your device's app settings, or reinstall the app. Your account and content are safe - they live on your account, not just the device." },

  // ── More topics (app + website) ──
  // Getting Started
  { id: "use-web", category: "getting-started", icon: "globe", tint: "#ffe4ec", deep: colors.brand, title: "Using Teezer on the web", sub: "Watch and manage from teezer.live", body: "You can use Teezer in any browser at teezer.live - watch the feed, view profiles, manage your settings, and access Teezer Studio. Log in with the same account you use in the app; everything stays in sync. For creating and editing reels, the app gives you the full set of tools." },
  { id: "switch-accounts", category: "getting-started", icon: "swap-horizontal", tint: "#ffe4ec", deep: colors.brand, title: "Switch between accounts", sub: "Manage more than one profile", body: "Tap the chevron next to your name at the top of your profile to open the account switcher, then choose another account or add a new one. You can be signed in to multiple accounts and switch instantly without logging out." },

  // Account & Profile
  { id: "recover-account", category: "account", icon: "refresh", tint: "#ffe4ec", deep: colors.brand, title: "Recover a hacked or locked account", sub: "Get back into your account", body: "If you can't log in, use \"Forgot password\" on the login screen to reset it by email. If you think someone else has access, reset your password immediately, then in Settings → Security revoke all other sessions and turn on two-factor authentication. If you're still locked out, contact support@teezer.live from your registered email." },
  { id: "link-socials", category: "account", icon: "link", tint: "#ffe4ec", deep: colors.brand, title: "Link your social accounts", sub: "Add Instagram, YouTube and more", body: "Go to Settings → Account Settings → Social Links to add links to your Instagram, YouTube, TikTok, X and website. They appear as buttons on your profile so people can find you everywhere." },

  // Privacy & Safety
  { id: "who-sees-likes", category: "privacy", icon: "heart-circle", tint: "#efeaff", deep: "#7c3aed", title: "Control who can see your liked videos", sub: "Keep your likes private", body: "In Settings → Privacy you can choose who can see the videos you've liked - everyone, or only you. Set it to only you to keep your likes completely private." },
  { id: "activity-status", category: "privacy", icon: "ellipse", tint: "#efeaff", deep: "#7c3aed", title: "Manage your activity status", sub: "Show or hide when you're online", body: "Your activity status lets friends see when you're active. To turn it off, go to Settings → Privacy (or the Inbox status selector) and set activity status to no one. When it's off, you also won't see others' status." },

  // Payments & Earnings
  { id: "withdraw", category: "payments", icon: "wallet", tint: "#dcfce9", deep: "#16a34a", title: "How to withdraw your earnings", sub: "Cash out your balance", body: "Once your balance passes the minimum payout threshold, open Teezer Studio → wallet and request a payout to your registered payout method. Processing times vary by region and method. Make sure your payout details are accurate before requesting." },
  { id: "service-fee", category: "payments", icon: "pricetag", tint: "#dcfce9", deep: "#16a34a", title: "Understanding the service fee", sub: "How Gift earnings are calculated", body: "When a viewer sends a Gift, it converts to creator earnings at the rate shown in Teezer Studio. The difference between the Coin price and your earnings is Teezer's service fee, which covers payment processing and running the platform. Exact rates are always shown in Studio." },

  // Creator Tools
  { id: "go-live", category: "creator", icon: "radio", tint: "#ffedd9", deep: "#f97316", title: "How to go live on Teezer", sub: "Stream to your followers", body: "If live streaming is available for your account, tap the + button and choose Live. Add a title, then go live to broadcast in real time. Viewers can comment and send Gifts while you stream. Live features and eligibility are shown in the app when available." },
  { id: "apply-monetization", category: "creator", icon: "cash", tint: "#ffedd9", deep: "#f97316", title: "Apply for monetization", sub: "Start earning from your content", body: "Open Teezer Studio and go to the monetization section to see whether you're eligible and to apply. Eligibility can include minimum follower, video and account-age requirements, and your account being in good standing. Requirements are shown in Studio and may change over time." },

  // Creating Content
  { id: "duet-stitch", category: "creating", icon: "git-merge", tint: "#ffedd9", deep: "#f97316", title: "How to Duet or Stitch a video", sub: "Create with others' content", body: "On a video that allows it, open the share or menu options and choose Duet or Stitch. Duet places your video beside the original; Stitch lets you clip part of it into your own reel. Creators control whether their videos can be Dueted or Stitched in their privacy settings." },
  { id: "captions", category: "creating", icon: "chatbox", tint: "#ffedd9", deep: "#f97316", title: "Add captions to your video", sub: "Make your reels accessible", body: "While editing, add text captions to your reel so it's easy to follow with sound off. Position and time each caption as you like. Clear captions also help more people discover and enjoy your content." },

  // App & Tech Support
  { id: "web-not-loading", category: "tech", icon: "globe-outline", tint: "#e2effe", deep: "#3b82f6", title: "Teezer website won't load", sub: "Fix issues on teezer.live", body: "If teezer.live won't load: refresh the page, clear your browser cache, try a different browser or an incognito window, and check your internet connection. Make sure your browser is up to date. If it still fails, it may be a temporary outage - try again shortly." },
  { id: "report-bug", category: "tech", icon: "bug", tint: "#e2effe", deep: "#3b82f6", title: "Report a bug or problem", sub: "Tell us what went wrong", body: "Found a bug? Use Report a Problem in Settings to send us the details, or email support@teezer.live. Include what you were doing, what happened, your device and app version, and a screenshot if you can - it helps us fix it faster." },
];

/* ── Category icon disc with soft gradient ── */
function CategoryDisc({ c, active, onPress }: { c: Category; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.catItem} onPress={onPress}>
      <LinearGradient colors={[c.tint, c.tint + "cc"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.catCircle, active && styles.catCircleActive]}>
        <Ionicons name={c.icon} size={24} color={c.deep} />
      </LinearGradient>
      <Text style={styles.catLabel} numberOfLines={2}>{c.label}</Text>
    </Pressable>
  );
}

/**
 * Help Center - opened from the three-dot menu › Help Center. Search filters
 * the help articles only; a browse-by-category accordion groups every
 * tutorial under a main menu; each article opens with real content; and a
 * bottom card links to the full help.reelsoo.com site + support.
 */
export function HelpCenterScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState("");
  // Single-select category: only one help topic is open at a time.
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [open, setOpen] = useState<Article | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ARTICLES.filter((a) => a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
  }, [query]);

  const selectCat = (key: string) => setActiveCat((cur) => (cur === key ? null : key));
  const articlesOf = (key: string) => ARTICLES.filter((a) => a.category === key);
  const activeGroup = GROUPS.find((g) => g.key === activeCat);

  const renderArticleRow = (a: Article, divider: boolean) => (
    <Pressable key={a.id} style={({ pressed }) => [styles.articleRow, divider && styles.rowDivider, pressed && styles.pressed]} onPress={() => setOpen(a)}>
      <View style={[styles.articleIcon, { backgroundColor: a.tint }]}>
        <Ionicons name={a.icon} size={18} color={a.deep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.articleTitle}>{a.title}</Text>
        <Text style={styles.articleSub} numberOfLines={1}>{a.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
              <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
            </Pressable>
            <Text style={styles.title}>Help Center</Text>
            <Text style={styles.subtitle}>How can we help you today?</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.chatBtn} onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>
              <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.text} />
            </Pressable>
            <LinearGradient colors={["#ff6b9c", colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headsetBadge}>
              <Ionicons name="headset" size={30} color={colors.white} />
            </LinearGradient>
          </View>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for articles or help topics..."
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
          /* ── Search results (help center only) ── */
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{results.length} {results.length === 1 ? "result" : "results"}</Text>
              <Pressable hitSlop={8} onPress={() => setQuery("")} style={styles.viewAll}><Text style={styles.viewAllText}>Clear</Text></Pressable>
            </View>
            <View style={styles.articleCard}>
              {results.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="search-outline" size={30} color={colors.textFaint} />
                  <Text style={styles.emptyText}>No articles found. Try another search.</Text>
                </View>
              ) : results.map((a, i) => renderArticleRow(a, i < results.length - 1))}
            </View>
          </>
        ) : (
          <>
            {/* ── Quick-access discs (single-select: one topic at a time) ── */}
            <View style={styles.catCard}>
              {DISCS.map((c) => (
                <CategoryDisc key={c.key} c={c} active={activeCat === c.key} onPress={() => selectCat(c.key)} />
              ))}
            </View>

            {activeCat && activeGroup ? (
              /* ── Selected category → its related articles ── */
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{activeGroup.label}</Text>
                  <Pressable hitSlop={8} onPress={() => setActiveCat(null)} style={styles.viewAll}>
                    <Text style={styles.viewAllText}>Show all</Text>
                  </Pressable>
                </View>
                <View style={styles.articleCard}>
                  {articlesOf(activeCat).map((a, i, arr) => renderArticleRow(a, i < arr.length - 1))}
                </View>
              </>
            ) : (
              <>
                {/* ── Popular articles ── */}
                <Text style={styles.blockHead}>Popular Articles</Text>
                <View style={styles.articleCard}>
                  {["create-account", "account-safe", "earn", "upload", "grow"].map((id, i, arr) => {
                    const a = ARTICLES.find((x) => x.id === id)!;
                    return renderArticleRow(a, i < arr.length - 1);
                  })}
                </View>

                {/* ── Browse by category (single-select menu) ── */}
                <Text style={styles.blockHead}>Browse Help Topics</Text>
                <View style={styles.menuCard}>
                  {GROUPS.map((g, gi) => {
                    const list = articlesOf(g.key);
                    return (
                      <Pressable key={g.key} style={({ pressed }) => [styles.menuRow, gi < GROUPS.length - 1 && styles.rowDivider, pressed && styles.pressed]} onPress={() => setActiveCat(g.key)}>
                        <View style={[styles.menuIcon, { backgroundColor: g.tint }]}>
                          <Ionicons name={g.icon} size={20} color={g.deep} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuTitle}>{g.label}</Text>
                          <Text style={styles.menuCount}>{list.length} {list.length === 1 ? "article" : "articles"}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}

        {/* ── Still need more help? → full help site + support ── */}
        <LinearGradient colors={["#2c1a3d", "#7a1f52", colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.helpCard}>
          <View style={styles.mailBadge}>
            <Ionicons name="headset" size={28} color={colors.white} />
          </View>
          <Text style={styles.helpTitle}>Still need more help?</Text>
          <Text style={styles.helpSub}>Browse our full Help Center or reach the support team directly.</Text>
          <Pressable style={styles.visitBtn} onPress={() => openPolicy({ url: HELP_SITE, title: "Help Center" })}>
            <Ionicons name="globe-outline" size={17} color={colors.brand} />
            <Text style={styles.visitText}>Visit Help Center</Text>
            <Ionicons name="open-outline" size={15} color={colors.brand} />
          </Pressable>
          <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>
            <Ionicons name="mail-outline" size={16} color={colors.white} />
            <Text style={styles.contactText}>Contact Support</Text>
          </Pressable>
        </LinearGradient>

        {/* ── More resources ── */}
        <Text style={styles.resourceHead}>More Resources</Text>
        <View style={styles.resourceRow}>
          <Pressable style={[styles.resourceCard, { backgroundColor: "#fff0f4" }]} onPress={() => navigation.navigate("Policies")}>
            <View style={[styles.resourceIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="book" size={18} color={colors.white} />
            </View>
            <Text style={styles.resourceTitle}>Guidelines</Text>
            <Text style={styles.resourceDesc}>Community rules and content policies</Text>
            <View style={[styles.resourceArrow, { backgroundColor: "#ffd7e2" }]}>
              <Ionicons name="chevron-forward" size={13} color={colors.brand} />
            </View>
          </Pressable>
          <Pressable style={[styles.resourceCard, { backgroundColor: "#f4f0ff" }]} onPress={() => navigation.navigate("AboutReelsoo")}>
            <View style={[styles.resourceIcon, { backgroundColor: "#7c3aed" }]}>
              <Ionicons name="information" size={18} color={colors.white} />
            </View>
            <Text style={styles.resourceTitle}>About Teezer</Text>
            <Text style={styles.resourceDesc}>Learn more about us and our mission</Text>
            <View style={[styles.resourceArrow, { backgroundColor: "#e4d9ff" }]}>
              <Ionicons name="chevron-forward" size={13} color="#7c3aed" />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Article reader ── */}
      <BottomSheet visible={open != null} onClose={() => setOpen(null)} height={0.72}
        header={open ? (
          <View style={styles.sheetHead}>
            <View style={[styles.articleIcon, { backgroundColor: open.tint }]}>
              <Ionicons name={open.icon} size={19} color={open.deep} />
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

const CAT_GAP = spacing.xs;
const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  title: { fontSize: 32, fontWeight: font.weightHeavy, color: colors.text, marginTop: spacing.md },
  subtitle: { fontSize: font.md, color: colors.textMuted, marginTop: spacing.xs },
  headerRight: { alignItems: "flex-end", gap: spacing.md },
  chatBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  headsetBadge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.lg, paddingHorizontal: spacing.md, height: 52 },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },

  catCard: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm, backgroundColor: colors.card },
  catItem: { flex: 1, alignItems: "center", gap: 6, paddingHorizontal: CAT_GAP },
  catCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  catCircleActive: { borderWidth: 2, borderColor: colors.brand },
  catLabel: { fontSize: 11, fontWeight: font.weightMedium, color: colors.text, textAlign: "center", lineHeight: 14 },

  blockHead: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  articleCard: { marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, overflow: "hidden" },
  articleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.bgMuted },
  articleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  articleTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  articleSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { fontSize: font.sm, color: colors.textMuted },

  // Accordion menu
  menuCard: { marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  menuIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  menuTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  menuCount: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },

  helpCard: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.xl, padding: spacing.xl, overflow: "hidden" },
  mailBadge: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  helpTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.white },
  helpSub: { fontSize: font.sm, color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 20 },
  visitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.lg, backgroundColor: colors.white, borderRadius: radius.pill, height: 48 },
  visitText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.brand },
  contactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: radius.pill, height: 46 },
  contactText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  resourceHead: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  resourceRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  resourceCard: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, minHeight: 120 },
  resourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  resourceTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  resourceDesc: { fontSize: font.xs, color: colors.textMuted, marginTop: 3, lineHeight: 16, paddingRight: 24 },
  resourceArrow: { position: "absolute", right: spacing.md, bottom: spacing.md, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  sheetTitle: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetText: { fontSize: font.md, color: colors.textSecondary, lineHeight: 24 },
  sheetSupportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xl, backgroundColor: colors.brandTint, borderRadius: radius.md, paddingVertical: spacing.md },
  sheetSupportText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
});
