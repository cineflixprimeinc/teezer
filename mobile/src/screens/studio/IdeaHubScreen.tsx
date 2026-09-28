import { useMemo, useRef, useState } from "react";
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight, BadgeCheck, Bell, Bot, CalendarClock, ChevronDown, ChevronLeft, ChevronUp,
  CircleCheck, CircleDollarSign, Clapperboard, ClipboardCheck, Flame, Folder, Languages,
  Lightbulb, MessageCircle, Mic, Moon, Palette, PenLine, Plus, Search, Send, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Trophy, Users, Wrench, X,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { inboxApi } from "@/api/inbox.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/* ────────────────────────────────────────────────────────────────────────────
 * Idea Hub - Teezer Studio's community feedback board.
 *
 * Reached from the bottom of Creator Tools and the Studio Dashboard. Everything
 * here runs on in-memory state (upvotes, submissions, comments, filters) so the
 * whole board is functional in-session; swap the seed data + handlers for an
 * `/ideas` API when the backend endpoint lands.
 * ──────────────────────────────────────────────────────────────────────────── */

type Status = "In Review" | "Planned" | "Under Consideration" | "Building" | "Shipped";

type Idea = {
  id: string;
  title: string;
  desc: string;
  category: string;
  status: Status;
  votes: number;
  comments: number;
  author: { name: string; verified: boolean; avatar?: string };
  icon: LucideIcon;
  tint: string;
  iconColor: string;
  createdAt: number; // higher = newer
  trending?: boolean;
  mine?: boolean;
  featured?: boolean;
};

type Comment = { id: string; author: string; verified: boolean; text: string };

const STATUS_STYLE: Record<Status, { bg: string; color: string }> = {
  "In Review": { bg: "#fef3c7", color: "#b45309" },
  Planned: { bg: "#e0e7ff", color: "#4338ca" },
  "Under Consideration": { bg: "#ffedd5", color: "#c2410c" },
  Building: { bg: "#dcfce7", color: "#15803d" },
  Shipped: { bg: "#d1fae5", color: "#047857" },
};

/** Icon + colour per category, used for the "More" sheet, submissions and topics. */
const CATEGORY_META: Record<string, { icon: LucideIcon; tint: string; color: string }> = {
  Feature: { icon: Sparkles, tint: "#fff1f4", color: colors.brand },
  "Creator Tools": { icon: Wrench, tint: "#eef2ff", color: "#4f46e5" },
  "UI/UX": { icon: Palette, tint: "#fff7ed", color: "#ea580c" },
  "AI Tools": { icon: Bot, tint: "#f5f3ff", color: "#7c3aed" },
  Monetization: { icon: CircleDollarSign, tint: "#ecfdf5", color: "#059669" },
  Community: { icon: Users, tint: "#eff6ff", color: "#2563eb" },
  Moderation: { icon: ShieldCheck, tint: "#f0fdf4", color: "#16a34a" },
};

const SEED_IDEAS: Idea[] = [
  {
    id: "summarizer", title: "AI-powered video summarizer",
    desc: "Automatically generate short summaries for long videos.",
    category: "AI Tools", status: "In Review", votes: 1200, comments: 86,
    author: { name: "Amit Shrestha", verified: true },
    icon: Clapperboard, tint: "#fff1f4", iconColor: colors.brand, createdAt: 7, trending: true,
  },
  {
    id: "cohost", title: "Live audio co-host feature",
    desc: "Allow creators to invite co-hosts during live audio sessions.",
    category: "Creator Tools", status: "Planned", votes: 889, comments: 64,
    author: { name: "Salina Shrestha", verified: true },
    icon: Mic, tint: "#f5f3ff", iconColor: "#7c3aed", createdAt: 6, trending: true,
  },
  {
    id: "themes", title: "Custom themes for profiles",
    desc: "Let users personalize their profile with custom themes.",
    category: "UI/UX", status: "Under Consideration", votes: 642, comments: 43,
    author: { name: "Nirajan Pun", verified: true },
    icon: Palette, tint: "#fff7ed", iconColor: "#ea580c", createdAt: 5,
  },
  {
    id: "moderation", title: "Content moderation suggestions",
    desc: "AI suggestions for better content moderation and safety.",
    category: "Moderation", status: "In Review", votes: 512, comments: 28,
    author: { name: "Prabin Rai", verified: true },
    icon: ShieldCheck, tint: "#f0fdf4", iconColor: "#16a34a", createdAt: 8,
  },
  {
    id: "folders", title: "Organize saved content in folders",
    desc: "Create folders to organize your saved videos and audios.",
    category: "Feature", status: "Planned", votes: 421, comments: 19,
    author: { name: "Sujata Gurung", verified: false },
    icon: Folder, tint: "#eff6ff", iconColor: "#2563eb", createdAt: 3,
  },
  {
    id: "captions", title: "Multi-language captions",
    desc: "Auto-translate captions into 30+ languages so creators reach a global audience.",
    category: "Creator Tools", status: "Building", votes: 1800, comments: 96,
    author: { name: "Rohit Basnet", verified: true },
    icon: Languages, tint: "#f5f3ff", iconColor: "#7c3aed", createdAt: 4, trending: true, featured: true,
  },
  {
    id: "schedule", title: "Scheduled posting",
    desc: "Queue videos to publish automatically at the best time for your audience.",
    category: "Creator Tools", status: "Planned", votes: 356, comments: 22,
    author: { name: "Anisha Karki", verified: false },
    icon: CalendarClock, tint: "#eef2ff", iconColor: "#4f46e5", createdAt: 2,
  },
  {
    id: "darkmode", title: "Dark mode polish",
    desc: "Refine dark-mode contrast and spacing across the studio.",
    category: "UI/UX", status: "Under Consideration", votes: 287, comments: 15,
    author: { name: "Bikash Thapa", verified: false },
    icon: Moon, tint: "#f1f5f9", iconColor: "#475569", createdAt: 1,
  },
];

const TRENDING_TOPICS: { label: string; count: number; category: string }[] = [
  { label: "AI Tools", count: 562, category: "AI Tools" },
  { label: "Creator Growth", count: 438, category: "Creator Tools" },
  { label: "Monetization", count: 367, category: "Monetization" },
  { label: "UI/UX", count: 298, category: "UI/UX" },
  { label: "Community", count: 254, category: "Community" },
];

/** The always-visible category chips. "More" opens the rest. */
const PRIMARY_CHIPS: { label: string; icon: LucideIcon }[] = [
  { label: "For You", icon: Star },
  { label: "Trending", icon: Flame },
  { label: "Feature", icon: Sparkles },
  { label: "Creator Tools", icon: Wrench },
  { label: "UI/UX", icon: PenLine },
];
const PRIMARY_LABELS = PRIMARY_CHIPS.map((c) => c.label);
const MORE_CATEGORIES = ["AI Tools", "Monetization", "Community", "Moderation"];

const TABS = ["Top Ideas", "Recent Ideas", "My Ideas", "My Upvotes"] as const;
type Tab = (typeof TABS)[number];

const SORTS = [
  { key: "popular", label: "Most Popular" },
  { key: "recent", label: "Most Recent" },
  { key: "discussed", label: "Most Discussed" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const HOW_STEPS: { icon: LucideIcon; tint: string; color: string; title: string; desc: string }[] = [
  { icon: Lightbulb, tint: "#fff1f4", color: colors.brand, title: "Share Idea", desc: "Submit your idea in a few taps" },
  { icon: Users, tint: "#f5f3ff", color: "#7c3aed", title: "Get Support", desc: "Others upvote and comment" },
  { icon: ClipboardCheck, tint: "#eff6ff", color: "#2563eb", title: "We Review", desc: "Our team reviews top ideas" },
  { icon: CircleCheck, tint: "#f0fdf4", color: "#16a34a", title: "We Build", desc: "We build and keep you updated" },
];

export function IdeaHubScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const me = {
    name: user?.name || user?.username || "You",
    verified: !!user?.is_verified,
    avatar: user?.avatar ?? undefined,
  };

  const unreadQ = useQuery({
    queryKey: ["notificationsUnreadBadge"],
    queryFn: () => inboxApi.notificationsUnread(["profile_view"]),
    staleTime: 30_000,
  });

  const [ideas, setIdeas] = useState<Idea[]>(SEED_IDEAS);
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set());
  const [commentsById, setCommentsById] = useState<Record<string, Comment[]>>({});

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("For You");
  const [moreLabel, setMoreLabel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Top Ideas");
  const [sort, setSort] = useState<SortKey>("popular");

  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const seq = useRef(100);

  const toggleUpvote = (id: string) => {
    const has = upvoted.has(id);
    setUpvoted((prev) => {
      const next = new Set(prev);
      has ? next.delete(id) : next.add(id);
      return next;
    });
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, votes: i.votes + (has ? -1 : 1) } : i)));
  };

  const pickCategory = (label: string) => {
    setCategory(label);
    setMoreLabel(PRIMARY_LABELS.includes(label) ? null : label);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const submitIdea = (title: string, desc: string, cat: string) => {
    const meta = CATEGORY_META[cat] ?? CATEGORY_META.Feature;
    const id = `mine-${seq.current++}`;
    const idea: Idea = {
      id, title: title.trim(), desc: desc.trim() || "No description provided.",
      category: cat, status: "In Review", votes: 1, comments: 0,
      author: { name: me.name, verified: me.verified, avatar: me.avatar },
      icon: meta.icon, tint: meta.tint, iconColor: meta.color,
      createdAt: seq.current, mine: true,
    };
    setIdeas((prev) => [idea, ...prev]);
    setUpvoted((prev) => new Set(prev).add(id)); // you back your own idea
    setSubmitOpen(false);
    setTab("My Ideas");
    setCategory("For You");
    setMoreLabel(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const addComment = (id: string, text: string) => {
    const c: Comment = { id: `c-${seq.current++}`, author: me.name, verified: me.verified, text: text.trim() };
    setCommentsById((prev) => ({ ...prev, [id]: [...(prev[id] ?? seedComments(id)), c] }));
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, comments: i.comments + 1 } : i)));
  };

  const visible = useMemo(() => {
    let list = ideas;
    if (tab === "My Ideas") list = list.filter((i) => i.mine);
    else if (tab === "My Upvotes") list = list.filter((i) => upvoted.has(i.id));

    if (category === "Trending") list = list.filter((i) => i.trending);
    else if (category !== "For You") list = list.filter((i) => i.category === category);

    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) =>
      i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));

    const effSort: SortKey = tab === "Recent Ideas" ? "recent" : sort;
    const sorted = [...list].sort((a, b) =>
      effSort === "recent" ? b.createdAt - a.createdAt
        : effSort === "discussed" ? b.comments - a.comments
          : b.votes - a.votes);
    return sorted;
  }, [ideas, upvoted, tab, category, query, sort]);

  const featured = ideas.find((i) => i.featured);
  const detail = detailId ? ideas.find((i) => i.id === detailId) ?? null : null;
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "Most Popular";

  return (
    <Screen edges={["top"]} bg={colors.bgMuted}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </Pressable>

        <View style={s.brandBadge}>
          <Lightbulb size={19} color={colors.brand} strokeWidth={2.4} fill="#ffe08a" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.hTitle}>Idea Hub</Text>
          <Text style={s.hSub} numberOfLines={1}>Share ideas. Improve Teezer. Build together.</Text>
        </View>

        <Pressable hitSlop={8} style={s.bellBtn} onPress={() => navigation.navigate("Notifications")}>
          <Bell size={19} color={colors.text} strokeWidth={2.1} />
          {!!unreadQ.data && (
            <View style={s.bellBadge}>
              <Text style={s.bellBadgeText}>{unreadQ.data > 9 ? "9+" : unreadQ.data}</Text>
            </View>
          )}
        </Pressable>

        <Pressable style={s.submitBtn} onPress={() => setSubmitOpen(true)}>
          <Plus size={15} color={colors.white} strokeWidth={3} />
          <Text style={s.submitBtnText}>Submit</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Search ───────────────────────────────────────────────────────── */}
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Search size={17} color={colors.textFaint} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search ideas, topics or keywords…"
              placeholderTextColor={colors.textFaint}
              style={s.searchInput}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setQuery("")}>
                <X size={15} color={colors.textFaint} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>
          <Pressable style={s.filterBtn} onPress={() => setSortOpen(true)}>
            <SlidersHorizontal size={18} color={colors.textSecondary} strokeWidth={2.2} />
          </Pressable>
        </View>

        {/* ── Category chips ───────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {PRIMARY_CHIPS.map((c) => {
            const active = category === c.label;
            const Icon = c.icon;
            return (
              <Pressable key={c.label} style={[s.chip, active && s.chipOn]} onPress={() => pickCategory(c.label)}>
                <Icon size={14} color={active ? colors.brand : colors.textMuted} strokeWidth={2.4}
                  fill={active && c.label === "For You" ? colors.brand : "transparent"} />
                <Text style={[s.chipText, active && s.chipTextOn]}>{c.label}</Text>
              </Pressable>
            );
          })}
          {/* More - shows the picked extra category, if any */}
          <Pressable
            style={[s.chip, moreLabel && category === moreLabel && s.chipOn]}
            onPress={() => setMoreOpen(true)}
          >
            <Text style={[s.chipText, moreLabel && category === moreLabel && s.chipTextOn]}>
              {moreLabel ?? "More"}
            </Text>
            <ChevronDown size={14} color={moreLabel && category === moreLabel ? colors.brand : colors.textMuted} strokeWidth={2.4} />
          </Pressable>
        </ScrollView>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <LinearGradient colors={["#ffe4ec", "#ffd3e0", "#ffe9d6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroText}>
            <Text style={s.heroTitle}>Your idea can{"\n"}shape <Text style={{ color: colors.brand }}>Teezer</Text> 💡</Text>
            <Text style={s.heroSub}>Share your thoughts and help us build a better platform for everyone.</Text>
            <Pressable style={s.heroBtn} onPress={() => setSubmitOpen(true)}>
              <Text style={s.heroBtnText}>Share Your Idea</Text>
              <ArrowRight size={15} color={colors.white} strokeWidth={2.8} />
            </Pressable>
          </View>
          <HeroArt />
        </LinearGradient>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.howTitle}><Text style={{ color: colors.brand }}>How</Text> Idea Hub works</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.howRow}>
            {HOW_STEPS.map((step, i) => (
              <View key={step.title} style={s.howStepWrap}>
                <View style={s.howStep}>
                  <View style={[s.howIcon, { backgroundColor: step.tint }]}>
                    <step.icon size={20} color={step.color} strokeWidth={2.2} />
                  </View>
                  <Text style={s.howStepTitle}>{i + 1}. {step.title}</Text>
                  <Text style={s.howStepDesc}>{step.desc}</Text>
                </View>
                {i < HOW_STEPS.length - 1 && <ArrowRight size={16} color={colors.textFaint} strokeWidth={2.2} style={s.howArrow} />}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Tabs + sort ──────────────────────────────────────────────────── */}
        <View style={s.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.tabsInner}>
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
                  <Text style={[s.tabText, active && s.tabTextOn]}>{t}</Text>
                  <View style={[s.tabUnderline, active && s.tabUnderlineOn]} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={s.sortPill} onPress={() => setSortOpen(true)}>
            <Text style={s.sortPillText}>{sortLabel}</Text>
            <ChevronDown size={13} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>
        </View>

        {/* ── Idea list ────────────────────────────────────────────────────── */}
        {visible.length === 0 ? (
          <View style={s.emptyBox}>
            <View style={s.emptyIcon}><Lightbulb size={24} color={colors.textFaint} strokeWidth={2} /></View>
            <Text style={s.emptyTitle}>
              {tab === "My Ideas" ? "You haven't shared an idea yet"
                : tab === "My Upvotes" ? "You haven't upvoted anything yet"
                  : "No ideas match your filters"}
            </Text>
            <Text style={s.emptySub}>
              {tab === "My Ideas" ? "Tap Submit to share your first idea."
                : tab === "My Upvotes" ? "Upvote ideas you'd love to see built."
                  : "Try a different category or clear your search."}
            </Text>
            {tab === "My Ideas" && (
              <Pressable style={s.emptyBtn} onPress={() => setSubmitOpen(true)}>
                <Plus size={14} color={colors.white} strokeWidth={3} />
                <Text style={s.emptyBtnText}>Submit an idea</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {visible.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                upvoted={upvoted.has(idea.id)}
                onUpvote={() => toggleUpvote(idea.id)}
                onOpen={() => setDetailId(idea.id)}
              />
            ))}
          </View>
        )}

        {/* ── Community impact ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.communityHead}>
            <Users size={16} color={colors.brand} strokeWidth={2.4} />
            <Text style={s.cardTitle}>Community Impact</Text>
          </View>
          <View style={s.communityRow}>
            <View style={s.communityIcon}>
              <Users size={24} color={colors.brand} strokeWidth={2} />
            </View>
            <View>
              <Text style={s.communityBig}>2,584</Text>
              <Text style={s.communitySmall}>Ideas shared</Text>
            </View>
          </View>
          <View style={s.avatarStack}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.stackAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 4 - i }]}>
                <Avatar uri={undefined} style={s.stackAvatarImg} />
              </View>
            ))}
            <View style={s.stackMore}><Text style={s.stackMoreText}>+128</Text></View>
          </View>
        </View>

        {/* ── Trending topics ──────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={[s.cardTitle, { marginBottom: spacing.md }]}>Trending Topics</Text>
          <View style={{ gap: spacing.md }}>
            {TRENDING_TOPICS.map((t) => {
              const meta = CATEGORY_META[t.category] ?? CATEGORY_META.Feature;
              return (
                <Pressable key={t.label} style={s.topicRow} onPress={() => pickCategory(t.category)}>
                  <View style={[s.topicIcon, { backgroundColor: meta.tint }]}>
                    <meta.icon size={16} color={meta.color} strokeWidth={2.2} />
                  </View>
                  <Text style={s.topicLabel}>{t.label}</Text>
                  <Text style={s.topicCount}>{t.count} ideas</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={s.topicAll} onPress={() => setMoreOpen(true)}>
            <Text style={s.topicAllText}>View all topics</Text>
          </Pressable>
        </View>

        {/* ── Idea of the week ─────────────────────────────────────────────── */}
        {featured && (
          <View style={s.card}>
            <View style={s.communityHead}>
              <Trophy size={16} color="#f59e0b" strokeWidth={2.4} />
              <Text style={s.cardTitle}>Idea of the Week</Text>
            </View>
            <Text style={s.featTitle}>{featured.title}</Text>
            <View style={s.featAuthor}>
              <Text style={s.featBy}>by</Text>
              <Avatar uri={featured.author.avatar} style={s.featAvatar} />
              <Text style={s.featName}>{featured.author.name}</Text>
              {featured.author.verified && <BadgeCheck size={13} color={colors.brand} strokeWidth={2.4} />}
            </View>
            <Text style={s.featMeta}>{formatCompact(featured.votes)} votes · {featured.comments} comments</Text>
            <Pressable
              style={[s.featBtn, upvoted.has(featured.id) && s.featBtnOn]}
              onPress={() => toggleUpvote(featured.id)}
            >
              <ChevronUp size={16} color={colors.brand} strokeWidth={2.6} />
              <Text style={s.featBtnText}>{upvoted.has(featured.id) ? "Upvoted" : "Upvote"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* ── Sheets ───────────────────────────────────────────────────────────── */}
      <SortSheet
        visible={sortOpen}
        current={sort}
        onClose={() => setSortOpen(false)}
        onPick={(k) => { setSort(k); setSortOpen(false); }}
      />
      <MoreSheet
        visible={moreOpen}
        current={category}
        onClose={() => setMoreOpen(false)}
        onPick={(c) => { pickCategory(c); setMoreOpen(false); }}
      />
      <SubmitSheet
        visible={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmit={submitIdea}
      />
      <DetailSheet
        idea={detail}
        upvoted={detail ? upvoted.has(detail.id) : false}
        comments={detail ? (commentsById[detail.id] ?? seedComments(detail.id)) : []}
        onUpvote={() => detail && toggleUpvote(detail.id)}
        onComment={(text) => detail && addComment(detail.id, text)}
        onClose={() => setDetailId(null)}
      />
    </Screen>
  );
}

/* ── Hero illustration: a glowing bulb rising from a box, framed by avatars ── */
function HeroArt() {
  return (
    <View style={s.art} pointerEvents="none">
      <View style={s.artGlow} />
      <LinearGradient colors={[colors.brand, "#ff6b8a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.artBox}>
        <Text style={s.artMark}>R</Text>
      </LinearGradient>
      <View style={s.artBulb}>
        <Lightbulb size={30} color="#fbbf24" strokeWidth={2.2} fill="#fde68a" />
      </View>
      {[
        { top: 2, left: 4 }, { top: 0, right: 6 }, { bottom: 8, left: -2 },
      ].map((pos, i) => (
        <View key={i} style={[s.artAvatar, pos]}>
          <Avatar uri={undefined} style={s.artAvatarImg} />
        </View>
      ))}
    </View>
  );
}

/* ── One idea card ─────────────────────────────────────────────────────────── */
function IdeaCard({ idea, upvoted, onUpvote, onOpen }: {
  idea: Idea; upvoted: boolean; onUpvote: () => void; onOpen: () => void;
}) {
  const st = STATUS_STYLE[idea.status];
  return (
    <Pressable style={s.ideaCard} onPress={onOpen}>
      {/* Upvote column */}
      <Pressable style={[s.voteCol, upvoted && s.voteColOn]} onPress={onUpvote} hitSlop={4}>
        <ChevronUp size={18} color={upvoted ? colors.white : colors.brand} strokeWidth={2.8} />
        <Text style={[s.voteCount, upvoted && { color: colors.white }]}>{formatCompact(idea.votes)}</Text>
        <Text style={[s.voteLabel, upvoted && { color: "rgba(255,255,255,0.85)" }]}>votes</Text>
      </Pressable>

      {/* Body */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.ideaTop}>
          <View style={[s.ideaIcon, { backgroundColor: idea.tint }]}>
            <idea.icon size={18} color={idea.iconColor} strokeWidth={2.2} />
          </View>
          <Text style={s.ideaTitle} numberOfLines={2}>{idea.title}</Text>
          <View style={[s.statusPill, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{idea.status}</Text>
          </View>
        </View>
        <Text style={s.ideaDesc} numberOfLines={2}>{idea.desc}</Text>
        <View style={s.ideaFoot}>
          <Avatar uri={idea.author.avatar} style={s.ideaAuthorAvatar} />
          <Text style={s.ideaAuthor} numberOfLines={1}>{idea.author.name}</Text>
          {idea.author.verified && <BadgeCheck size={13} color={colors.brand} strokeWidth={2.4} />}
          <View style={{ flex: 1 }} />
          <MessageCircle size={14} color={colors.textFaint} strokeWidth={2.2} />
          <Text style={s.ideaComments}>{idea.comments}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/* ── Sort sheet ────────────────────────────────────────────────────────────── */
function SortSheet({ visible, current, onClose, onPick }: {
  visible: boolean; current: SortKey; onClose: () => void; onPick: (k: SortKey) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={s.sheetPad}>
        <Text style={s.sheetTitle}>Sort ideas by</Text>
        {SORTS.map((o) => (
          <Pressable key={o.key} style={[s.sheetRow, current === o.key && s.sheetRowOn]} onPress={() => onPick(o.key)}>
            <Text style={[s.sheetRowText, current === o.key && s.sheetRowTextOn]}>{o.label}</Text>
            {current === o.key && <Ionicons name="checkmark" size={18} color={colors.brand} />}
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

/* ── More-categories sheet ─────────────────────────────────────────────────── */
function MoreSheet({ visible, current, onClose, onPick }: {
  visible: boolean; current: string; onClose: () => void; onPick: (c: string) => void;
}) {
  const all = ["For You", ...PRIMARY_LABELS.filter((l) => l !== "For You"), ...MORE_CATEGORIES];
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={s.sheetPad}>
        <Text style={s.sheetTitle}>Browse by topic</Text>
        <View style={s.moreGrid}>
          {all.map((c) => {
            const meta = CATEGORY_META[c];
            const active = current === c;
            return (
              <Pressable key={c} style={[s.moreChip, active && s.moreChipOn]} onPress={() => onPick(c)}>
                {meta ? <meta.icon size={14} color={active ? colors.white : meta.color} strokeWidth={2.4} />
                  : <Star size={14} color={active ? colors.white : colors.textMuted} strokeWidth={2.4} />}
                <Text style={[s.moreChipText, active && { color: colors.white }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

/* ── Submit-idea sheet ─────────────────────────────────────────────────────── */
function SubmitSheet({ visible, onClose, onSubmit }: {
  visible: boolean; onClose: () => void; onSubmit: (title: string, desc: string, cat: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("Feature");
  const cats = [...PRIMARY_LABELS.filter((l) => l !== "For You" && l !== "Trending"), ...MORE_CATEGORIES];

  const reset = () => { setTitle(""); setDesc(""); setCat("Feature"); };
  const submit = () => {
    if (!title.trim()) return Alert.alert("Add a title", "Give your idea a short, clear title.");
    onSubmit(title, desc, cat);
    reset();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable keyboardAvoid onClosed={reset}
      header={<View style={s.sheetHead}><Text style={s.sheetHeadTitle}>Share an idea</Text>
        <Pressable hitSlop={8} onPress={onClose}><X size={20} color={colors.textMuted} strokeWidth={2.4} /></Pressable></View>}>
      <View style={s.sheetPad}>
        <Text style={s.fieldLabel}>Title</Text>
        <TextInput
          value={title} onChangeText={setTitle}
          placeholder="e.g. Add a duet feature for videos"
          placeholderTextColor={colors.textFaint} style={s.input} maxLength={90}
        />

        <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>Description</Text>
        <TextInput
          value={desc} onChangeText={setDesc}
          placeholder="Explain your idea and why it would help creators…"
          placeholderTextColor={colors.textFaint} style={[s.input, s.inputArea]}
          multiline maxLength={400}
        />

        <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>Category</Text>
        <View style={s.moreGrid}>
          {cats.map((c) => {
            const meta = CATEGORY_META[c];
            const active = cat === c;
            return (
              <Pressable key={c} style={[s.moreChip, active && s.moreChipOn]} onPress={() => setCat(c)}>
                {meta && <meta.icon size={14} color={active ? colors.white : meta.color} strokeWidth={2.4} />}
                <Text style={[s.moreChipText, active && { color: colors.white }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={s.submitFull} onPress={submit}>
          <Text style={s.submitFullText}>Submit idea</Text>
        </Pressable>
        <Text style={s.submitNote}>Ideas are public. Our team reviews the top-voted ones each week.</Text>
      </View>
    </BottomSheet>
  );
}

/* ── Idea detail + comments sheet ──────────────────────────────────────────── */
function DetailSheet({ idea, upvoted, comments, onUpvote, onComment, onClose }: {
  idea: Idea | null; upvoted: boolean; comments: Comment[];
  onUpvote: () => void; onComment: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState("");
  if (!idea) return null;
  const st = STATUS_STYLE[idea.status];
  const send = () => { if (!text.trim()) return; onComment(text); setText(""); };

  return (
    <BottomSheet visible={!!idea} onClose={onClose} height={0.82} scrollable keyboardAvoid onClosed={() => setText("")}
      header={<View style={s.sheetHead}>
        <Text style={s.sheetHeadTitle} numberOfLines={1}>Idea details</Text>
        <Pressable hitSlop={8} onPress={onClose}><X size={20} color={colors.textMuted} strokeWidth={2.4} /></Pressable>
      </View>}>
      <View style={s.sheetPad}>
        <View style={s.detailTop}>
          <View style={[s.ideaIcon, { backgroundColor: idea.tint, width: 44, height: 44 }]}>
            <idea.icon size={22} color={idea.iconColor} strokeWidth={2.2} />
          </View>
          <View style={[s.statusPill, { backgroundColor: st.bg }]}>
            <Text style={[s.statusText, { color: st.color }]}>{idea.status}</Text>
          </View>
        </View>
        <Text style={s.detailTitle}>{idea.title}</Text>
        <Text style={s.detailDesc}>{idea.desc}</Text>

        <View style={s.detailAuthor}>
          <Avatar uri={idea.author.avatar} style={s.ideaAuthorAvatar} />
          <Text style={s.ideaAuthor}>{idea.author.name}</Text>
          {idea.author.verified && <BadgeCheck size={13} color={colors.brand} strokeWidth={2.4} />}
          <View style={{ flex: 1 }} />
          <Pressable style={[s.voteInline, upvoted && s.voteInlineOn]} onPress={onUpvote}>
            <ChevronUp size={16} color={upvoted ? colors.white : colors.brand} strokeWidth={2.8} />
            <Text style={[s.voteInlineText, upvoted && { color: colors.white }]}>{formatCompact(idea.votes)}</Text>
          </Pressable>
        </View>

        <View style={s.detailDivider} />
        <Text style={s.commentsHead}>{idea.comments} comments</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          {comments.map((c) => (
            <View key={c.id} style={s.commentRow}>
              <Avatar uri={undefined} style={s.commentAvatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.commentAuthorRow}>
                  <Text style={s.commentAuthor}>{c.author}</Text>
                  {c.verified && <BadgeCheck size={11} color={colors.brand} strokeWidth={2.4} />}
                </View>
                <Text style={s.commentText}>{c.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.commentBar}>
        <TextInput
          value={text} onChangeText={setText}
          placeholder="Add a comment…"
          placeholderTextColor={colors.textFaint} style={s.commentInput}
          onSubmitEditing={send} returnKeyType="send"
        />
        <Pressable style={[s.commentSend, !text.trim() && { opacity: 0.4 }]} onPress={send} disabled={!text.trim()}>
          <Send size={17} color={colors.white} strokeWidth={2.4} />
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/** A couple of illustrative comments so a freshly-opened idea isn't empty. */
function seedComments(id: string): Comment[] {
  return [
    { id: `${id}-s1`, author: "Kritika Shah", verified: false, text: "Yes please - this would save me so much time." },
    { id: `${id}-s2`, author: "Dipesh Adhikari", verified: true, text: "Great idea. Would love an option to toggle it per video." },
  ];
}

const s = StyleSheet.create({
  /* Header */
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md,
  },
  backBtn: { width: 26, height: 34, alignItems: "flex-start", justifyContent: "center", marginLeft: -4 },
  brandBadge: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandTint,
    alignItems: "center", justifyContent: "center",
  },
  hTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  hSub: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontWeight: font.weightMedium },
  bellBtn: {
    width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  bellBadge: {
    position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: colors.bgMuted,
  },
  bellBadgeText: { color: colors.white, fontSize: 8.5, fontWeight: font.weightBold },
  submitBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, height: 38, paddingHorizontal: 12,
    borderRadius: radius.pill, backgroundColor: colors.brand,
    shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  submitBtnText: { color: colors.white, fontSize: 13, fontWeight: font.weightBold },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg },

  /* Search */
  searchRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, height: 46,
  },
  searchInput: { flex: 1, fontSize: font.sm, color: colors.text, padding: 0 },
  filterBtn: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },

  /* Chips */
  chipsRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  chipText: { fontSize: 12.5, fontWeight: font.weightMedium, color: colors.textMuted },
  chipTextOn: { color: colors.brand, fontWeight: font.weightBold },

  /* Hero */
  hero: {
    borderRadius: radius.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center",
    overflow: "hidden", minHeight: 168,
  },
  heroText: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroTitle: { fontSize: 23, lineHeight: 28, fontWeight: font.weightHeavy, color: colors.text },
  heroSub: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, fontWeight: font.weightMedium },
  heroBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 4,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 11,
    shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  heroBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },

  /* Hero art */
  art: { width: 108, height: 132, alignItems: "center", justifyContent: "flex-end" },
  artGlow: {
    position: "absolute", top: 12, width: 92, height: 92, borderRadius: 46,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  artBox: {
    width: 74, height: 58, borderRadius: 14, alignItems: "center", justifyContent: "center",
    shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  artMark: { color: "rgba(255,255,255,0.9)", fontSize: 26, fontWeight: font.weightHeavy, fontStyle: "italic" },
  artBulb: {
    position: "absolute", top: 14, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#f59e0b", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  artAvatar: {
    position: "absolute", width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.white,
    overflow: "hidden",
  },
  artAvatarImg: { width: "100%", height: "100%", borderRadius: 13 },

  /* Card shell */
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  /* How it works */
  howTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.md },
  howRow: { paddingRight: spacing.sm, alignItems: "flex-start" },
  howStepWrap: { flexDirection: "row", alignItems: "center" },
  howStep: { width: 118, alignItems: "flex-start", gap: 6 },
  howIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  howStepTitle: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text },
  howStepDesc: { fontSize: 11, lineHeight: 15, color: colors.textMuted, fontWeight: font.weightMedium },
  howArrow: { marginHorizontal: 2 },

  /* Tabs */
  tabsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsInner: { gap: spacing.lg, alignItems: "flex-end" },
  tab: { alignItems: "center", paddingBottom: 2 },
  tabText: { fontSize: 13.5, fontWeight: font.weightMedium, color: colors.textMuted, paddingBottom: 8 },
  tabTextOn: { color: colors.text, fontWeight: font.weightHeavy },
  tabUnderline: { height: 2.5, alignSelf: "stretch", borderRadius: 2, backgroundColor: "transparent" },
  tabUnderlineOn: { backgroundColor: colors.brand },
  sortPill: {
    flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.card,
  },
  sortPillText: { fontSize: 11.5, fontWeight: font.weightMedium, color: colors.textSecondary },

  /* Idea card */
  ideaCard: {
    flexDirection: "row", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  voteCol: {
    width: 58, borderRadius: radius.md, backgroundColor: colors.brandTint,
    alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, gap: 1,
  },
  voteColOn: { backgroundColor: colors.brand },
  voteCount: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  voteLabel: { fontSize: 10, color: colors.textMuted, fontWeight: font.weightMedium },
  ideaTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  ideaIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  ideaTitle: { flex: 1, fontSize: 14.5, lineHeight: 19, fontWeight: font.weightHeavy, color: colors.text },
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" },
  statusText: { fontSize: 9.5, fontWeight: font.weightBold },
  ideaDesc: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: spacing.sm, fontWeight: font.weightMedium },
  ideaFoot: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.md },
  ideaAuthorAvatar: { width: 22, height: 22, borderRadius: 11 },
  ideaAuthor: { fontSize: 12, fontWeight: font.weightBold, color: colors.textSecondary, maxWidth: 140 },
  ideaComments: { fontSize: 12, color: colors.textFaint, fontWeight: font.weightMedium },

  /* Empty */
  emptyBox: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.xs,
  },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.textSecondary },
  emptySub: { fontSize: 12.5, color: colors.textFaint, textAlign: "center", maxWidth: 260, lineHeight: 18 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.md,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10,
  },
  emptyBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },

  /* Community impact */
  communityHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.md },
  communityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  communityIcon: {
    width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandTint,
    alignItems: "center", justifyContent: "center",
  },
  communityBig: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  communitySmall: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  avatarStack: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  stackAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.card, overflow: "hidden" },
  stackAvatarImg: { width: "100%", height: "100%", borderRadius: 15 },
  stackMore: {
    marginLeft: -10, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: colors.brandTint,
    borderWidth: 2, borderColor: colors.card, alignItems: "center", justifyContent: "center",
  },
  stackMoreText: { fontSize: 11, fontWeight: font.weightBold, color: colors.brand },

  /* Trending topics */
  topicRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  topicIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  topicLabel: { flex: 1, fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  topicCount: { fontSize: 12, color: colors.textFaint, fontWeight: font.weightMedium },
  topicAll: {
    marginTop: spacing.lg, alignItems: "center", backgroundColor: colors.brandTint,
    borderRadius: radius.md, paddingVertical: 11,
  },
  topicAllText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.brand },

  /* Idea of the week */
  featTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, marginTop: 2 },
  featAuthor: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  featBy: { fontSize: 12, color: colors.textMuted },
  featAvatar: { width: 22, height: 22, borderRadius: 11 },
  featName: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  featMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, fontWeight: font.weightMedium },
  featBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: spacing.md,
    backgroundColor: colors.brandTint, borderRadius: radius.md, paddingVertical: 12,
  },
  featBtnOn: { backgroundColor: "#ffd7e0" },
  featBtnText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  /* Sheets */
  sheetPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  sheetTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md,
  },
  sheetRowOn: { backgroundColor: colors.brandTint },
  sheetRowText: { fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
  sheetRowTextOn: { color: colors.brand, fontWeight: font.weightBold },
  sheetHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: 2,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetHeadTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  /* More grid + submit form */
  moreGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  moreChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.card,
  },
  moreChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  moreChipText: { fontSize: 12.5, fontWeight: font.weightMedium, color: colors.textSecondary },
  fieldLabel: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: font.sm, color: colors.text,
    backgroundColor: colors.bgMuted,
  },
  inputArea: { minHeight: 92, textAlignVertical: "top" },
  submitFull: {
    marginTop: spacing.lg, backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center",
  },
  submitFullText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  submitNote: { marginTop: spacing.sm, fontSize: 11, color: colors.textFaint, textAlign: "center", lineHeight: 15 },

  /* Detail */
  detailTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  detailTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 27 },
  detailDesc: { fontSize: 13.5, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.sm, fontWeight: font.weightMedium },
  detailAuthor: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg },
  voteInline: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTint,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7,
  },
  voteInlineOn: { backgroundColor: colors.brand },
  voteInlineText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
  detailDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  commentsHead: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  commentRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  commentAvatar: { width: 30, height: 30, borderRadius: 15 },
  commentAuthorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  commentAuthor: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  commentText: { fontSize: 13, lineHeight: 18, color: colors.text, marginTop: 2 },
  commentBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
  },
  commentInput: {
    flex: 1, backgroundColor: colors.bgMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.sm, color: colors.text,
  },
  commentSend: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
});
