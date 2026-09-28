import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, NativeScrollEvent, NativeSyntheticEvent,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  AudioLines, BarChart3, Captions, Check, ChevronLeft, ChevronRight,
  Clock, Gift, Globe, Hand, Heart, HelpCircle, Info, Languages, Lightbulb, Link2, Lock,
  MessageSquare, Mic, Music, Plus, Radio, ScreenShare, Search, Share2,
  ShieldCheck, Tag, Users, Waves, X, type LucideIcon,
} from "lucide-react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { Screen } from "@/components/Screen";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { profileApi, type FollowUser } from "@/api/profile.api";
import { searchApi, MIN_QUERY_LENGTH, type SearchUser } from "@/api/search.api";
import { spaceHostApi } from "@/api/spaces.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/**
 * Create a Space - the full host set-up, built to the design.
 *
 * One long form in sections: cover + basics, discovery (topics/category), the
 * line-up (co-hosts/speakers), then the toggle-heavy settings (room behaviour,
 * capture, discovery, moderation), closing on a live preview of the card the
 * space will show as. Start now drops you straight into the room; scheduling
 * files it and returns to the list.
 *
 * Every control is wired to the create payload - nothing here is decorative.
 */

// Short, modern caps (characters) - both well under the server's real
// limits (title 120, description 300; see SpaceCreateController).
const TITLE_MAX = 70;
const DESC_MAX = 80;

type SelectedUser = { id: number; name: string | null; username: string; avatar: string | null };

// The Topics grid - a short curated set for the one-tap case, plus a much
// longer list behind "More topics" (a full-page picker, same pattern as
// Language) for anything more specific.
const QUICK_TOPICS = [
  "Creator tips", "Music", "Comedy", "Food", "Gaming",
  "Fitness", "Beauty", "Tech", "Travel", "Late night",
];

const MORE_TOPICS = [
  "Creator Economy", "Business", "Entrepreneurship", "Leadership", "Startups", "Startup Funding",
  "Marketing", "Social Media", "E-commerce", "Freelancing", "Remote Work", "Side Hustles",
  "Technology", "AI", "Machine Learning", "Data Science", "Programming", "Cybersecurity",
  "Web3", "Crypto", "NFTs", "Design", "Product", "K-Pop", "Dance", "Hip-Hop", "EDM", "Lo-fi",
  "Health", "Nutrition", "Yoga", "Meditation", "Mental Health", "Education",
  "Language Learning", "Finance", "Personal Finance", "Investing", "Stocks", "Real Estate",
  "Esports", "Anime", "Sports", "Motorsports", "Standup Comedy",
  "News", "Politics", "History", "Philosophy", "Psychology", "Art", "Photography",
  "Cooking", "Film", "TV", "Theatre", "Books", "Writing", "Podcasting",
  "Public Speaking", "Science", "Physics", "Space", "Astrology", "Fashion",
  "Relationships", "Dating", "Parenting", "Spirituality", "Motivation", "Productivity",
  "Career", "DIY", "Home Improvement", "Gardening", "Pets", "Wildlife", "Nature",
  "Environment", "Climate", "Automotive", "Voice Acting", "ASMR", "Study With Me",
  "Q&A", "Debate", "Networking", "Collabs", "Behind the Scenes", "Fan Chat",
  // More topics.
  "Blockchain Gaming", "Metaverse", "Virtual Reality", "Robotics", "Drones", "3D Printing",
  "Open Source", "UX/UI Design", "No-Code", "SaaS", "Angel Investing", "Day Trading",
  "Sports Betting", "Fantasy Sports", "Chess", "Poker", "Board Games", "Tabletop RPGs",
  "Cosplay", "Comics", "Manga", "True Crime", "Horror", "Sci-Fi", "Mystery", "Tarot",
  "Numerology", "Feng Shui", "Interior Design", "Architecture", "Urban Planning",
  "Sneakers", "Streetwear", "Luxury", "Minimalism", "Personal Branding", "Copywriting",
  "Mixology", "Coffee Culture", "Wine", "Baking", "Vegan Lifestyle", "Home Brewing",
  "Tattoo Art", "Martial Arts", "Boxing", "MMA", "Weightlifting", "Calisthenics",
  "Running", "Cycling", "Swimming", "Climbing", "Skateboarding", "Surfing",
  "Snowboarding", "Skiing", "Camping", "Hiking", "Van Life", "Sustainability",
  "Volunteering", "Faith & Spirituality", "LGBTQ+", "New Parents", "Grief Support",
  "Addiction Recovery", "Improv", "Musical Theatre", "Karaoke", "Magic Tricks",
];

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" }, { code: "es", label: "Spanish" },
  { code: "hi", label: "Hindi" }, { code: "ne", label: "Nepali" },
  { code: "fr", label: "French" }, { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" }, { code: "id", label: "Indonesian" },
  { code: "de", label: "German" }, { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" }, { code: "ru", label: "Russian" },
  { code: "ko", label: "Korean" }, { code: "it", label: "Italian" },
  { code: "tr", label: "Turkish" }, { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" }, { code: "bn", label: "Bengali" },
  { code: "ur", label: "Urdu" }, { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" }, { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" }, { code: "gu", label: "Gujarati" },
  { code: "fil", label: "Filipino" }, { code: "ms", label: "Malay" },
  { code: "fa", label: "Persian" }, { code: "sw", label: "Swahili" },
  { code: "nl", label: "Dutch" }, { code: "pl", label: "Polish" },
  { code: "uk", label: "Ukrainian" }, { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" }, { code: "he", label: "Hebrew" },
  { code: "sv", label: "Swedish" }, { code: "cs", label: "Czech" },
];

const AUDIENCES = [
  { value: "public" as const, label: "Public", Icon: Globe, desc: "Anyone can discover the space and join instantly. No approval required." },
  { value: "private" as const, label: "Private", Icon: Lock, desc: "Only people the host adds can join. Others can't discover or enter it." },
  { value: "invite" as const, label: "Invite Only", Icon: Link2, desc: "Join only with a valid invite link. The space stays out of public discovery." },
];

// Listener limit and speaker slots each open a full picker page (like
// Language), capped at 100 - the room stays a small/medium room, not an
// arena. 0 means Unlimited for the listener limit; speaker slots always
// has a real, enforced cap (never unlimited - the stage only holds so many
// live mics at once).
const LIMIT_OPTIONS = [10, 25, 50, 75, 100, 0];
const SLOT_OPTIONS = [2, 4, 6, 8, 10, 15, 20, 30, 50, 75, 100];

const SPEAKING = [
  { value: "everyone" as const, label: "Everyone can speak", desc: "Anyone who joins can unmute and speak. No request required.", Icon: Radio },
  { value: "request" as const, label: "Request to Speak", desc: "Listeners send a request; only the host or moderators can approve.", Icon: Hand },
  { value: "host_only" as const, label: "Host & Moderators only", desc: "Only the host and moderators can speak. Everyone else listens.", Icon: Lock },
];

// Shown to a listener the moment they join - none are on by default, so a
// host only ever ships the rules they deliberately picked.
const ROOM_RULES = [
  { key: "kind", label: "Be kind — no harassment or hate", def: false },
  { key: "topic", label: "Stay on topic while you have the mic", def: false },
  { key: "no_record", label: "Do not record or repost without asking", def: false },
  { key: "no_promo", label: "No self-promotion unless invited", def: false },
];

const AUDIO_QUALITIES = [
  { value: "standard" as const, label: "Standard", desc: "Recommended - clear voice, lowest data." },
  { value: "high" as const, label: "High Quality", desc: "Richer audio for music and detail." },
  { value: "ultra" as const, label: "Ultra Quality", desc: "Maximum fidelity - uses the most data." },
];

// A running-start for the blank-page problem - tap one to drop it straight
// into the title field (still fully editable after).
const TITLE_IDEAS = [
  "Ask me anything",
  "Growth clinic",
  "Late night listening",
  "Editing help desk",
  "Collab matching",
];

// Preset cover looks for when there's no uploaded photo - purely local, used
// only to colour the live preview card below. There's no `cover_theme` field
// on the space record, so this never travels to the server; it's a styling
// choice the same way a live card's cover gradient is (see SpacesScreen).
const COVER_THEMES: readonly (readonly [string, string])[] = [
  ["#ff3d72", "#c40f42"], // pink
  ["#a06bff", "#6c37d8"], // violet
  ["#41b8ff", "#2563d8"], // ocean
  ["#43dfa8", "#12a173"], // mint
  ["#ffb347", "#f5722e"], // sunset
  ["#3a3350", "#151222"], // night
];

// The three groups the long form falls into, purely for the header's "Step N
// of 3" - a real scroll-spy against section anchors below, not a fake counter.
const STEP_NAMES = ["Basics", "Setup", "Settings"];

export function CreateSpaceScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  // Co-host candidates: people you follow who follow you back, not the app's
  // global search - a co-host invite is a fast pick among mutuals, and typing
  // in the box below filters this list locally, it never calls the server.
  const mutualsQ = useQuery({
    queryKey: ["space-mutuals", me?.username],
    queryFn: () => profileApi.followers(me!.username, 1),
    enabled: !!me?.username,
    staleTime: 60_000,
  });
  const mutuals = useMemo(
    () => (mutualsQ.data?.data ?? []).filter((u) => u.is_following),
    [mutualsQ.data],
  );

  // Basics
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverTheme, setCoverTheme] = useState(0);
  const [topics, setTopics] = useState<string[]>([]);

  // "Step N of 3" - a real scroll-spy, not a fixed label: the two Y offsets
  // below are where "Setup" and "Settings" begin, measured via onLayout on
  // marker Views, and onScroll compares the live offset against them.
  const [step, setStep] = useState(1);
  const setupY = useRef(0);
  const settingsY = useRef(0);
  const onFormScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const next = y >= settingsY.current - 80 ? 3 : y >= setupY.current - 80 ? 2 : 1;
    setStep((s) => (s === next ? s : next));
  };

  // Set-up
  const [language, setLanguage] = useState("en");
  const [startNow, setStartNow] = useState(true);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [audience, setAudience] = useState<"public" | "private" | "invite">("public");
  const [speakingPermission, setSpeakingPermission] = useState<"everyone" | "request" | "host_only">("request");
  const [audioQuality, setAudioQuality] = useState<"standard" | "high" | "ultra">("standard");
  const [coHosts, setCoHosts] = useState<SelectedUser[]>([]);
  const [speakers, setSpeakers] = useState<SelectedUser[]>([]);
  const [coQuery, setCoQuery] = useState("");
  // There's no real draft-persistence backend yet, so this only flips the
  // button's own label - an honest "acknowledged," not a fake "saved to a
  // server that doesn't have anywhere to put it."
  const [draftSaved, setDraftSaved] = useState(false);

  // Advanced
  const [allowSpeakerRequests, setAllowSpeakerRequests] = useState(true);
  const [enableChat, setEnableChat] = useState(false);
  const [allowReactions, setAllowReactions] = useState(false);
  const [allowScreenSharing, setAllowScreenSharing] = useState(false);

  // Room rules - shown on join. Defaults match ROOM_RULES' `def` flags.
  const [roomRules, setRoomRules] = useState<string[]>(
    ROOM_RULES.filter((r) => r.def).map((r) => r.key),
  );
  const toggleRule = (key: string) =>
    setRoomRules((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  // Space settings
  const [isRecorded, setIsRecorded] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState(false);
  const [noiseCancellation, setNoiseCancellation] = useState(false);
  const [giftsEnabled, setGiftsEnabled] = useState(false);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [soundClipsEnabled, setSoundClipsEnabled] = useState(false);
  const [audienceLimit, setAudienceLimit] = useState(100); // 0 = Unlimited
  const [speakerSlots, setSpeakerSlots] = useState(8);
  // Up to 100 followers a host can name when Visibility is "Followers".
  const [allowedFollowers, setAllowedFollowers] = useState<SelectedUser[]>([]);
  const [followersPickerOpen, setFollowersPickerOpen] = useState(false);

  // Discovery
  const [tags, setTags] = useState<string[]>([]);
  const [shareToFeed, setShareToFeed] = useState(true);

  // Other
  const [enablePolls, setEnablePolls] = useState(true);
  const [qaEnabled, setQaEnabled] = useState(true);
  const [contentWarning, setContentWarning] = useState<string | null>(null);
  const [blockedWords, setBlockedWords] = useState<string | null>(null);

  // Which of the inline WHEN quick-picks is active - tracked separately from
  // startNow/scheduledFor so "Pick a time" stays highlighted after a precise
  // pick from the Alert, instead of re-deriving (and drifting) from the timestamp.
  const [whenChoice, setWhenChoice] = useState<"now" | "1h" | "tonight" | "custom">("now");

  // Which bottom sheet is open (people pickers + text sheets).
  const [sheet, setSheet] = useState<null | "speakers" | "warning" | "moderation">(null);
  // Full-screen searchable select pages (styled like the profile Interests page).
  const [page, setPage] = useState<null | "language" | "quality" | "topics" | "audience" | "limit" | "slots">(null);
  // "Pick a time" - its own full-screen date+time page, not a page in the list above.
  const [datePageOpen, setDatePageOpen] = useState(false);

  const createM = useMutation({
    mutationFn: () =>
      spaceHostApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        startNow,
        scheduledFor: startNow ? null : scheduledFor,
        topics,
        tags,
        language,
        audience,
        audienceLimit: audienceLimit === 0 ? null : audienceLimit, // 0 → Unlimited
        speakingPermission,
        audioQuality,
        allowScreenSharing,
        shareToFeed,
        isRecorded,
        liveCaptions,
        noiseCancellation,
        allowSpeakerRequests,
        enableChat,
        allowReactions,
        enablePolls,
        qaEnabled,
        contentWarning,
        blockedWords,
        coHostIds: coHosts.map((u) => u.id),
        speakerIds: speakers.map((u) => u.id),
        roomRules,
        giftsEnabled,
        waitingRoomEnabled,
        soundClipsEnabled,
        speakerSlots,
        allowedFollowerIds: audience === "private" ? allowedFollowers.map((u) => u.id) : undefined,
      }),
    onSuccess: (space) => {
      qc.invalidateQueries({ queryKey: ["spaces"] });
      // A live space used to drop the host straight into the room. That screen
      // is not in this build (see SpacesScreen.openRoom), so both outcomes come
      // back to the list, where the new space is now a row.
      navigation.goBack();
    },
    onError: (e: any) => {
      Alert.alert("Create Space", e?.response?.data?.message ?? "Could not create that space.");
    },
  });

  const canCreate = title.trim().length > 1 && description.trim().length > 0 && !createM.isPending;
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? "English";
  const dateLabel = startNow ? "Start now" : scheduledFor ? scheduleLabel(scheduledFor) : "Schedule";
  // Real clock times for the "In 1 hour" / "Tonight" quick-picks, not the
  // mockup's static placeholders - "tonight" rolls to tomorrow once 9 PM has passed.
  const inOneHour = useMemo(() => new Date(Date.now() + 60 * 60_000), []);
  const tonight = useMemo(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const audienceLabel = audience === "public" ? "Public" : audience === "private" ? "Private" : "Invite Only";
  // Distinct from audienceLabel above - "Followers" reads better as the
  // Visibility row's display value than "Private" does, even though it's the
  // same underlying value.
  const visibilityLabel = audience === "public" ? "Public" : audience === "private" ? "Followers" : "Invite only";
  const speakDescriptor = speakingPermission === "everyone" ? "open mic" : speakingPermission === "request" ? "request to speak" : "host-only mic";
  const previewLine = topics.slice(0, 3).join(" • ");
  // A one-line recap of what's already been decided, right above the button
  // that acts on it - the design's "READY TO GO" card, e.g.
  // "'Growth clinic' · Creator tips · open mic · starting now · 2 co-hosts".
  const summaryLine = [
    title.trim() ? `"${title.trim()}"` : "Untitled space",
    topics[0] || "no topic",
    speakDescriptor,
    startNow ? "starting now" : "scheduled",
    coHosts.length ? `${coHosts.length} co-host${coHosts.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  const coQueryTrim = coQuery.trim().toLowerCase();
  const filteredMutuals = coQueryTrim
    ? mutuals.filter((u) => `${u.name ?? ""} ${u.username}`.toLowerCase().includes(coQueryTrim))
    : mutuals;
  const toggleCoHost = (u: FollowUser) => {
    setCoHosts((cur) => cur.some((x) => x.id === u.id)
      ? cur.filter((x) => x.id !== u.id)
      : [...cur, { id: u.id, name: u.name, username: u.username, avatar: u.avatar }]);
  };

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Create a space</Text>
          <Text style={styles.headerStep}>Step {step} of 3 · {STEP_NAMES[step - 1]}</Text>
        </View>
        <Pressable style={styles.draftsBtn} onPress={() => setDraftSaved(true)}>
          <Text style={styles.draftsText}>{draftSaved ? "Draft saved" : "Save draft"}</Text>
        </Pressable>
      </View>
      <View style={styles.progressRow}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.progressBar, n <= step && styles.progressBarOn]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={onFormScroll}
        scrollEventThrottle={100}
      >
        {/* Live preview - what the room will look like in Explore, updating as
            you fill the form in below. Purely a preview; nothing here is a
            separate control. */}
        <LinearGradient colors={COVER_THEMES[coverTheme]} style={styles.livePreview}>
          <View style={styles.livePreviewTop}>
            <View style={styles.livePreviewLive}>
              <View style={styles.livePreviewDot} />
              <Text style={styles.livePreviewLiveText}>{startNow ? "LIVE" : "SCHEDULED"}</Text>
            </View>
            <Text style={styles.livePreviewExplore}>Preview in Explore</Text>
          </View>
          <Text style={styles.livePreviewTitle} numberOfLines={2}>
            {title.trim() || "Your space title appears here"}
          </Text>
          <Text style={styles.livePreviewSub} numberOfLines={1}>
            {previewLine || "Pick a few topics so people can find you"}
          </Text>
          <View style={styles.livePreviewHost}>
            <View style={styles.livePreviewFaces}>
              <Avatar uri={me?.avatar} style={styles.livePreviewAvatar} />
              {coHosts.slice(0, 3).map((u) => (
                <Avatar key={u.id} uri={u.avatar} style={[styles.livePreviewAvatar, styles.livePreviewAvatarOverlap]} />
              ))}
            </View>
            <Text style={styles.livePreviewHostText} numberOfLines={1}>
              {coHosts.length ? `You + ${coHosts.length} co-host${coHosts.length === 1 ? "" : "s"}` : "Hosted by you"}
            </Text>
          </View>
        </LinearGradient>

        {/* Cover theme - the room has no uploaded artwork, so this picks the
            gradient the live preview (and the room's card in Explore) wears. */}
        <FieldLabel>Cover theme</FieldLabel>
        <View style={styles.themeRow}>
          {COVER_THEMES.map((c, i) => (
            <Pressable
              key={i}
              onPress={() => setCoverTheme(i)}
              style={[styles.themeSwatchWrap, coverTheme === i && styles.themeSwatchWrapOn]}
            >
              <LinearGradient colors={c} style={[styles.themeSwatch, coverTheme === i && styles.themeSwatchOn]}>
                {coverTheme === i && <Check size={17} color={colors.white} strokeWidth={3.2} />}
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        {/* Title */}
        <FieldLabel required>Space Title</FieldLabel>
        <View>
          <TextInput
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            placeholder="e.g. The Future of Creator Economy"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <Text style={styles.counterInline}>{title.length}/{TITLE_MAX}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ideaRow}>
          {TITLE_IDEAS.map((idea) => (
            <Pressable key={idea} onPress={() => setTitle(idea)} style={styles.ideaChip}>
              <Lightbulb size={12} color={colors.brand} strokeWidth={2.2} />
              <Text style={styles.ideaChipText} numberOfLines={1}>{idea}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Description */}
        <FieldLabel required>Description</FieldLabel>
        <View>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESC_MAX))}
            placeholder="Tell people what your space is about..."
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.textarea]}
            multiline
          />
          <Text style={styles.counter}>{description.length}/{DESC_MAX}</Text>
        </View>

        {/* Topics - a fixed, tap-to-toggle grid (max 3), not free text: this is
            what gets people to the room, so it stays a short curated list. */}
        <View style={styles.topicsHead}>
          <Text style={styles.topicsLabel}>TOPICS</Text>
          <Text style={styles.topicsCount}>{topics.length} of 3 picked</Text>
        </View>
        <View style={styles.topicsGrid}>
          {QUICK_TOPICS.map((label) => {
            const on = topics.includes(label);
            const atLimit = topics.length >= 3;
            return (
              <Pressable
                key={label}
                disabled={!on && atLimit}
                onPress={() => setTopics((t) => (on ? t.filter((x) => x !== label) : t.length < 3 ? [...t, label] : t))}
                style={[styles.topicChip, on && styles.topicChipOn, !on && atLimit && styles.topicChipDim]}
              >
                {on && <Check size={12} color={colors.white} strokeWidth={3} />}
                <Text style={[styles.topicChipText, on && styles.topicChipTextOn]} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setPage("topics")} style={styles.browseRow} accessibilityLabel="More topics">
          <Search size={15} color={colors.brand} strokeWidth={2} />
          <Text style={styles.browseText}>More topics</Text>
          <ChevronRight size={16} color={colors.brand} strokeWidth={2} style={{ marginLeft: "auto" }} />
        </Pressable>

        {/* Scroll-spy marker: everything from here down is "Setup". */}
        <View onLayout={(e) => { setupY.current = e.nativeEvent.layout.y; }} />

        {/* Who can speak */}
        <SectionTitle>Who can speak</SectionTitle>
        <View style={{ gap: 8 }}>
          {SPEAKING.map((o) => {
            const on = speakingPermission === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => setSpeakingPermission(o.value)}
                style={[styles.speakCard, on && styles.speakCardOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.speakIconTile, on && styles.speakIconTileOn]}>
                  <o.Icon size={17} color={on ? colors.brand : colors.textSecondary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.speakLabel}>{o.label}</Text>
                  <Text style={styles.speakSub}>{o.desc}</Text>
                </View>
                <View style={[styles.speakCheck, on && styles.speakCheckOn]}>
                  {on && <Check size={12} color={colors.white} strokeWidth={3.2} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* When */}
        <SectionTitle>When</SectionTitle>
        <View style={styles.whenRow}>
          <WhenTile label="Now" sub="Go live" on={whenChoice === "now"} onPress={() => { setWhenChoice("now"); setStartNow(true); setScheduledFor(null); }} />
          <WhenTile label="In 1 hour" sub={clockTime(inOneHour)} on={whenChoice === "1h"} onPress={() => { setWhenChoice("1h"); schedule(60); }} />
          <WhenTile label="Tonight" sub={clockTime(tonight)} on={whenChoice === "tonight"} onPress={() => { setWhenChoice("tonight"); scheduleAt(21, 0); }} />
          <WhenTile label="Pick a time" sub={whenChoice === "custom" ? dateLabel : "Choose date"} on={whenChoice === "custom"} onPress={() => setDatePageOpen(true)} />
        </View>

        {/* Invite co-hosts - an inline mutuals rail, not the global search: a
            co-host invite is a fast, low-stakes pick from people you already
            follow each other with, not a full people search. */}
        <View style={styles.coHead}>
          <Text style={styles.topicsLabel}>INVITE CO-HOSTS</Text>
          <Text style={styles.topicsCount}>{coHosts.length} invited</Text>
        </View>
        <View style={styles.coSearchWrap}>
          <Search size={16} color={colors.textMuted} strokeWidth={2.2} />
          <TextInput
            value={coQuery}
            onChangeText={setCoQuery}
            placeholder="Search mutuals by name or handle"
            placeholderTextColor={colors.textFaint}
            style={styles.coSearchField}
            autoCapitalize="none"
          />
          {coQuery.length > 0 && (
            <Pressable onPress={() => setCoQuery("")} hitSlop={8} style={styles.coSearchClear}>
              <X size={12} color={colors.textSecondary} strokeWidth={3} />
            </Pressable>
          )}
        </View>
        {!!coQuery.trim() && filteredMutuals.length === 0 && (
          <Text style={styles.coEmpty}>No mutuals match "{coQuery.trim()}"</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coRail}>
          {filteredMutuals.map((u) => {
            const on = coHosts.some((x) => x.id === u.id);
            return (
              <Pressable key={u.id} onPress={() => toggleCoHost(u)} style={styles.coItem}>
                <View style={styles.coAvatarWrap}>
                  <Avatar uri={u.avatar} style={styles.coAvatar} />
                  {on && (
                    <View style={styles.coCheckBadge}>
                      <Check size={11} color={colors.white} strokeWidth={3.4} />
                    </View>
                  )}
                </View>
                <Text style={[styles.coName, on && styles.coNameOn]} numberOfLines={1}>{u.name ?? u.username}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Invite speakers - a fuller people search (can reach beyond mutuals),
            so this one keeps the sheet + real search. */}
        <Card style={{ marginTop: spacing.lg }}>
          <PeopleRow icon={Mic} title="Invite Speakers" users={speakers} onPress={() => setSheet("speakers")} />
        </Card>

        {/* Room rules - shown to a listener the moment they join. */}
        <FieldLabel>Room rules <Text style={styles.labelHint}>shown on join</Text></FieldLabel>
        <View style={{ gap: 7 }}>
          {ROOM_RULES.map((r) => {
            const on = roomRules.includes(r.key);
            return (
              <Pressable
                key={r.key}
                onPress={() => toggleRule(r.key)}
                style={[styles.ruleRow, on && styles.ruleRowOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <View style={[styles.ruleBox, on && styles.ruleBoxOn]}>
                  {on && <Check size={11} color={colors.white} strokeWidth={3.4} />}
                </View>
                <Text style={styles.ruleLabel} numberOfLines={1}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Scroll-spy marker: everything from here down is "Settings". */}
        <View onLayout={(e) => { settingsY.current = e.nativeEvent.layout.y; }} />

        {/* Space Settings - one unified card, matching the design (a soft-grey
            group of rows), instead of four separate cards. The design's own
            list comes first; the extra controls it doesn't mention (speaker
            requests, screen share, polls, Q&A, tags, content warnings) are
            real, already-shipped features, so they stay as trailing rows
            rather than being deleted to match the mockup exactly. */}
        <SectionTitle>Space Settings</SectionTitle>
        <Card>
          <ToggleRow icon={Mic} title="Record this space" subtitle="Save a replay listeners can play later" value={isRecorded} onChange={setIsRecorded} />
          <Divider />
          <ToggleRow icon={Captions} title="Live captions" subtitle="Auto-transcribe speakers in real time" value={liveCaptions} onChange={setLiveCaptions} />
          <Divider />
          <ToggleRow icon={Waves} title="AI noise cancellation" subtitle="Reduce background noise for better audio" value={noiseCancellation} onChange={setNoiseCancellation} />
          <Divider />
          <ToggleRow icon={MessageSquare} title="Room chat" subtitle="Listeners can send text messages" value={enableChat} onChange={setEnableChat} />
          <Divider />
          <ToggleRow icon={Heart} title="Reactions" subtitle="Hearts and claps float over the room" value={allowReactions} onChange={setAllowReactions} />
          <Divider />
          <ToggleRow icon={Gift} title="Gifts and coins" subtitle="Listeners can support you during the room" value={giftsEnabled} onChange={setGiftsEnabled} />
          <Divider />
          <ToggleRow icon={Users} title="Waiting room" subtitle="Approve listeners before they can hear you" value={waitingRoomEnabled} onChange={setWaitingRoomEnabled} />
          <Divider />
          <ToggleRow icon={Music} title="Play sounds and clips" subtitle="Drop audio from your library into the room" value={soundClipsEnabled} onChange={setSoundClipsEnabled} />
          <Divider />
          <NavRow icon={Globe} title="Visibility" subtitle={AUDIENCES.find((a) => a.value === audience)?.desc} value={visibilityLabel} valueBrand onPress={() => setPage("audience")} />
          <Divider />
          <NavRow icon={Users} title="Listener limit" subtitle="Cap the size of the room" value={audienceLimit === 0 ? "Unlimited" : formatCompact(audienceLimit)} onPress={() => setPage("limit")} />
          <Divider />
          <NavRow icon={Mic} title="Speaker slots" subtitle="How many people can hold the mic" value={String(speakerSlots)} onPress={() => setPage("slots")} />
          <Divider />
          <NavRow icon={Languages} title="Room language" subtitle="Helps the right listeners find you" value={languageLabel} onPress={() => setPage("language")} />
          <Divider />
          <NavRow icon={AudioLines} title="Audio quality" subtitle="Higher quality uses more data" value={AUDIO_QUALITIES.find((q) => q.value === audioQuality)?.label} onPress={() => setPage("quality")} />
          <Divider />
          <ToggleRow icon={Hand} title="Allow speaker requests" subtitle="People can request to speak" value={allowSpeakerRequests} onChange={setAllowSpeakerRequests} />
          <Divider />
          <ToggleRow icon={ScreenShare} title="Allow screen sharing" subtitle="Coming soon" value={allowScreenSharing} onChange={setAllowScreenSharing} />
          <Divider />
          <ToggleRow icon={BarChart3} title="Enable polls" subtitle="Allow host to create polls" value={enablePolls} onChange={setEnablePolls} />
          <Divider />
          <ToggleRow icon={HelpCircle} title="Q&A" subtitle="Allow audience to ask questions" value={qaEnabled} onChange={setQaEnabled} />
          <Divider />
          <ToggleRow icon={Share2} title="Share to feed" subtitle="Show this space in the Teezer feed" value={shareToFeed} onChange={setShareToFeed} />
          <Divider />
          <NavRow icon={Info} title="Content warnings" subtitle={contentWarning ? contentWarning : "Add warning for sensitive topics"} onPress={() => setSheet("warning")} />
          <Divider />
          <NavRow icon={ShieldCheck} title="Moderation" subtitle={blockedWords ? "Blocked words set" : "Manage blocked words and permissions"} onPress={() => setSheet("moderation")} />
        </Card>

        {/* Visibility follow-through: Followers gets an inline picker (up to
            100 specific followers, the only people who can then get in),
            Invite gets a note about the link - both audiences already share
            the room's "Share room"/"Copy link" action once it's live
            (SpaceRoomScreen), so there's nothing to fake here pre-creation. */}
        {audience === "private" && (
          <>
            <View style={styles.coHead}>
              <Text style={styles.topicsLabel}>ALLOWED FOLLOWERS</Text>
              <Text style={styles.topicsCount}>{allowedFollowers.length} of 100</Text>
            </View>
            <Pressable onPress={() => setFollowersPickerOpen(true)} style={styles.coSearchWrap} accessibilityLabel="Choose allowed followers">
              <Search size={16} color={colors.textMuted} strokeWidth={2.2} />
              <Text style={styles.coSearchField}>Search your followers</Text>
            </Pressable>
            {allowedFollowers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coRail}>
                {allowedFollowers.map((u) => (
                  <Pressable key={u.id} onPress={() => setAllowedFollowers((cur) => cur.filter((x) => x.id !== u.id))} style={styles.coItem}>
                    <View style={styles.coAvatarWrap}>
                      <Avatar uri={u.avatar} style={styles.coAvatar} />
                      <View style={styles.coCheckBadge}><Check size={11} color={colors.white} strokeWidth={3.4} /></View>
                    </View>
                    <Text style={styles.coName} numberOfLines={1}>{u.name ?? u.username}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Text style={styles.audienceNote}>
              Only these followers can join. Once you're live, share the room's link from its menu - they'll get straight in.
            </Text>
          </>
        )}
        {audience === "invite" && (
          <Text style={styles.audienceNote}>
            Anyone with the room's link can join, whether they follow you or not. The link is generated once you go live - share it from the room's menu.
          </Text>
        )}

        {/* Tags - kept as its own field (not folded into the card above): it's
            free-text entry, not a toggle or a cycle. */}
        <FieldLabel>Tags <Text style={styles.labelHint}>help people find your space</Text></FieldLabel>
        <ChipEditor chips={tags} onChange={setTags} max={10} placeholder="Add a tag" compact leading={<Tag size={15} color={colors.textFaint} strokeWidth={2} />} />

        {/* Preview */}
        <SectionTitle>Space Preview</SectionTitle>
        <PreviewCard
          title={title}
          coverTheme={COVER_THEMES[coverTheme]}
          topics={topics}
          live={startNow}
          audience={audience}
          limit={audienceLimit}
          language={languageLabel}
          host={me}
        />

        <View style={styles.ready}>
          <Text style={styles.readyLabel}>READY TO GO</Text>
          <Text style={styles.readyLine}>{summaryLine}</Text>
        </View>

        <Text style={styles.terms}>
          By creating a space, you agree to our <Text style={styles.termsLink}>Community Guidelines.</Text>
        </Text>
      </ScrollView>

      {/* Sticky footer - a grey Schedule toggle (flips "Now" ↔ "Tonight", the
          same two WHEN tiles above) beside the primary action, which itself
          flips label with that toggle and stays at 55% opacity until a title
          exists. */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.scheduleBtn, whenChoice !== "now" && styles.scheduleBtnOn]}
          onPress={() => {
            if (whenChoice === "now") { setWhenChoice("tonight"); scheduleAt(21, 0); }
            else { setWhenChoice("now"); setStartNow(true); setScheduledFor(null); }
          }}
        >
          <Clock size={17} color={colors.text} strokeWidth={2.1} />
          <Text style={styles.scheduleBtnText}>{whenChoice === "now" ? "Schedule" : "Scheduled"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.submit, !canCreate && styles.submitOff, pressed && styles.pressed]}
          onPress={() => createM.mutate()}
          disabled={!canCreate}
          accessibilityRole="button"
        >
          {createM.isPending
            ? <ActivityIndicator color={colors.white} />
            : (
              <>
                <Mic size={18} color={colors.white} strokeWidth={2.2} />
                <Text style={styles.submitText}>{startNow ? "Start space" : "Schedule space"}</Text>
              </>
            )}
        </Pressable>
      </View>

      {/* ── sheets ── */}
      <UserPickerSheet
        visible={sheet === "speakers"}
        title="Invite speakers"
        selected={speakers}
        suggested={mutuals}
        onDone={setSpeakers}
        onClose={() => setSheet(null)}
      />
      <FollowersPickerSheet
        visible={followersPickerOpen}
        selected={allowedFollowers}
        onDone={setAllowedFollowers}
        onClose={() => setFollowersPickerOpen(false)}
      />
      <TextSheet
        visible={sheet === "warning"}
        title="Content warning"
        placeholder="e.g. Discusses sensitive topics"
        value={contentWarning ?? ""}
        onSave={setContentWarning}
        onClose={() => setSheet(null)}
      />
      <TextSheet
        visible={sheet === "moderation"}
        title="Blocked words"
        placeholder="Comma-separated words to block from chat"
        value={blockedWords ?? ""}
        multiline
        onSave={setBlockedWords}
        onClose={() => setSheet(null)}
      />

      {/* Full-screen searchable select pages (profile-Interests style) */}
      <PickerPage
        visible={page === "topics"}
        title="More topics"
        helper="Add up to 3 topics so the right people can find your space."
        options={MORE_TOPICS.map((t) => ({ value: t, label: t }))}
        mode="multi"
        max={3}
        allowCustom
        selected={topics}
        onChange={setTopics}
        onClose={() => setPage(null)}
      />
      <PickerPage
        visible={page === "audience"}
        title="Visibility"
        helper="Control who can discover and join your space."
        options={AUDIENCES.map((a) => ({ value: a.value, label: a.label, desc: a.desc, Icon: a.Icon }))}
        mode="single"
        selected={[audience]}
        onChange={(arr) => { if (arr[0]) setAudience(arr[0] as "public" | "private" | "invite"); }}
        onClose={() => setPage(null)}
      />
      <PickerPage
        visible={page === "limit"}
        title="Listener limit"
        helper="The maximum number of listeners allowed in the room."
        options={LIMIT_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? "Unlimited" : `${n} listeners` }))}
        mode="single"
        selected={[String(audienceLimit)]}
        onChange={(arr) => { if (arr[0]) setAudienceLimit(Number(arr[0])); }}
        onClose={() => setPage(null)}
      />
      <PickerPage
        visible={page === "slots"}
        title="Speaker slots"
        helper="How many people can hold the mic at once."
        options={SLOT_OPTIONS.map((n) => ({ value: String(n), label: `${n} speakers` }))}
        mode="single"
        selected={[String(speakerSlots)]}
        onChange={(arr) => { if (arr[0]) setSpeakerSlots(Number(arr[0])); }}
        onClose={() => setPage(null)}
      />
      <PickerPage
        visible={page === "language"}
        title="Language"
        helper="Choose the main language spoken in your space."
        options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        mode="single"
        selected={[language]}
        onChange={(arr) => { if (arr[0]) setLanguage(arr[0]); }}
        onClose={() => setPage(null)}
      />
      <PickerPage
        visible={page === "quality"}
        title="Audio Quality"
        helper="Higher quality sounds better but uses more data."
        options={AUDIO_QUALITIES.map((q) => ({ value: q.value, label: q.label, desc: q.desc }))}
        mode="single"
        selected={[audioQuality]}
        onChange={(arr) => { if (arr[0]) setAudioQuality(arr[0] as typeof audioQuality); }}
        onClose={() => setPage(null)}
      />

      <DateTimePage
        visible={datePageOpen}
        initial={scheduledFor ? new Date(scheduledFor) : inOneHour}
        onPick={(d) => { setWhenChoice("custom"); setStartNow(false); setScheduledFor(d.toISOString()); }}
        onClose={() => setDatePageOpen(false)}
      />
    </Screen>
  );

  function schedule(mins: number) {
    setStartNow(false);
    setScheduledFor(new Date(Date.now() + mins * 60_000).toISOString());
  }
  /** The next occurrence of `hour:minute` - today if still ahead, else tomorrow
   *  (or always tomorrow when `forceTomorrow` is set, for "Tomorrow at 9 AM"). */
  function scheduleAt(hour: number, minute: number, forceTomorrow = false) {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    if (forceTomorrow || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    setStartNow(false);
    setScheduledFor(d.toISOString());
  }
}

function clockTime(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}{required && <Text style={styles.req}> *</Text>}
    </Text>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Card({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function RowIcon({ Icon }: { Icon: LucideIcon }) {
  return <View style={styles.rowIcon}><Icon size={18} color={colors.textSecondary} strokeWidth={2} /></View>;
}

function ToggleRow({ icon: Icon, title, subtitle, value, onChange, info }: {
  icon: LucideIcon; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; info?: boolean;
}) {
  return (
    <View style={styles.settingRow}>
      <RowIcon Icon={Icon} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleLine}>
          <Text style={styles.settingTitle}>{title}</Text>
          {info && <Info size={13} color={colors.textFaint} strokeWidth={2} />}
        </View>
        {!!subtitle && <Text style={styles.settingSub}>{subtitle}</Text>}
      </View>
      <Toggle value={value} onValueChange={onChange} />
    </View>
  );
}

function NavRow({ icon: Icon, title, subtitle, value, valueBrand, onPress, info }: {
  icon: LucideIcon; title: string; subtitle?: string; value?: string; valueBrand?: boolean; onPress: () => void; info?: boolean;
}) {
  return (
    <Pressable style={styles.settingRow} onPress={onPress}>
      <RowIcon Icon={Icon} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleLine}>
          <Text style={styles.settingTitle}>{title}</Text>
          {info && <Info size={13} color={colors.textFaint} strokeWidth={2} />}
        </View>
        {!!subtitle && <Text style={styles.settingSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={[styles.rowValue, valueBrand && { color: colors.brand }]}>{value}</Text>}
      <ChevronRight size={18} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

/** One of the four inline WHEN quick-picks (Now / 30 min / 1 hour / Schedule). */
function WhenTile({ label, sub, on, onPress }: { label: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.whenTile, on && styles.whenTileOn]}>
      <Text style={[styles.whenTileLabel, on && styles.whenTileLabelOn]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.whenTileSub, on && styles.whenTileSubOn]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

function PeopleRow({ icon: Icon, title, users, onPress }: {
  icon: LucideIcon; title: string; users: SelectedUser[]; onPress: () => void;
}) {
  return (
    <Pressable style={styles.settingRow} onPress={onPress}>
      <RowIcon Icon={Icon} />
      <Text style={[styles.settingTitle, { flex: 1 }]}>{title}</Text>
      <View style={styles.avatarStack}>
        {users.slice(0, 3).map((u, i) => (
          <Avatar key={u.id} uri={u.avatar} style={[styles.stackAvatar, { marginLeft: i === 0 ? 0 : -10 }]} />
        ))}
        {users.length > 3 && <Text style={styles.stackMore}>+{users.length - 3}</Text>}
        <View style={styles.addBtn}><Plus size={16} color={colors.brand} strokeWidth={2.4} /></View>
      </View>
      <ChevronRight size={18} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.brand, false: "#e4e6ec" }}
      thumbColor={colors.white}
      ios_backgroundColor="#e4e6ec"
    />
  );
}

/** Chips + an inline add box, shared by Topics and Tags. */
function ChipEditor({ chips, onChange, max, placeholder, suggestions, leading, compact }: {
  chips: string[];
  onChange: (next: string[]) => void;
  max: number;
  placeholder: string;
  suggestions?: string[];
  leading?: ReactNode;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || chips.length >= max) return;
    if (chips.some((c) => c.toLowerCase() === v.toLowerCase())) { setText(""); return; }
    onChange([...chips, v]);
    setText("");
  };
  const remaining = (suggestions ?? []).filter(
    (s) => !chips.some((c) => c.toLowerCase() === s.toLowerCase())
      && (text.trim() === "" || s.toLowerCase().includes(text.trim().toLowerCase())),
  ).slice(0, 6);

  return (
    <View>
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
              <Pressable onPress={() => onChange(chips.filter((x) => x !== c))} hitSlop={6}>
                <X size={13} color={colors.brand} strokeWidth={2.4} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {chips.length < max && (
        <View style={[styles.chipInput, compact && styles.chipInputCompact]}>
          {leading}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            style={styles.chipInputField}
            onSubmitEditing={() => add(text)}
            returnKeyType="done"
          />
          <Pressable onPress={() => add(text)} hitSlop={6} style={styles.chipAdd}>
            <Plus size={16} color={colors.brand} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}
      {remaining.length > 0 && (
        <View style={styles.suggestRow}>
          {remaining.map((s) => (
            <Pressable key={s} onPress={() => add(s)} style={styles.suggestChip}>
              <Plus size={12} color={colors.textMuted} strokeWidth={2.2} />
              <Text style={styles.suggestText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function PreviewCard({ title, coverTheme, topics, live, audience, limit, language, host }: {
  title: string; coverTheme: readonly [string, string]; topics: string[];
  live: boolean; audience: string; limit: number; language: string; host: any;
}) {
  const line = topics.slice(0, 3).join(" • ");
  return (
    <View style={styles.preview}>
      <View style={styles.previewTop}>
        <LinearGradient colors={coverTheme} style={styles.previewCover}>
          <Mic size={22} color={colors.white} strokeWidth={2} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.previewTitle} numberOfLines={2}>{title.trim() || "Your space title"}</Text>
          {!!line && <Text style={styles.previewLine} numberOfLines={1}>{line}</Text>}
          <View style={styles.previewHost}>
            <Avatar uri={host?.avatar} style={styles.previewAvatar} />
            <Text style={styles.previewHostName} numberOfLines={1}>{host?.name ?? host?.username ?? "You"}</Text>
            {host?.is_verified && <VerifiedBadge size={12} />}
            <Text style={styles.previewHostRole}>Host</Text>
          </View>
        </View>
        {live && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={styles.previewMeta}>
        <PreviewMeta icon={Globe} label={audience === "public" ? "Public" : "Private"} sub={audience === "public" ? "Anyone can join" : "Invite only"} />
        <PreviewMeta icon={Users} label={formatCompact(limit)} sub="Max listeners" />
        <PreviewMeta icon={Languages} label={language} sub="Language" />
      </View>
    </View>
  );
}

function PreviewMeta({ icon: Icon, label, sub }: { icon: LucideIcon; label: string; sub: string }) {
  return (
    <View style={styles.pMeta}>
      <View style={styles.pMetaHead}>
        <Icon size={13} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.pMetaLabel}>{label}</Text>
      </View>
      <Text style={styles.pMetaSub}>{sub}</Text>
    </View>
  );
}

/* ── sheets ──────────────────────────────────────────────────────────── */

function TextSheet({ visible, title, placeholder, value, multiline, onSave, onClose }: {
  visible: boolean; title: string; placeholder: string; value: string; multiline?: boolean;
  onSave: (v: string | null) => void; onClose: () => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { if (visible) setV(value); }, [visible, value]);
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false} keyboardAvoid>
      <View style={styles.sheetPad}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <TextInput
          value={v}
          onChangeText={setV}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={[styles.sheetInput, multiline && styles.sheetInputTall]}
          multiline={multiline}
        />
        <Pressable style={styles.sheetSave} onPress={() => { onSave(v.trim() || null); onClose(); }}>
          <Text style={styles.sheetSaveText}>Save</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function UserPickerSheet({ visible, title, selected, suggested, onDone, onClose }: {
  visible: boolean; title: string; selected: SelectedUser[];
  /** Shown before the host types anything - people worth suggesting up
   *  front (e.g. mutuals), instead of a blank "search for people" prompt. */
  suggested?: FollowUser[];
  onDone: (users: SelectedUser[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<SelectedUser[]>(selected);
  useEffect(() => { if (visible) { setSel(selected); setQ(""); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching } = useQuery({
    queryKey: ["space-user-search", q],
    // `search` was renamed to `query` while this screen was out of the app.
    queryFn: () => searchApi.query(q.trim(), "users"),
    // The endpoint rejects anything shorter with a 422, which surfaced as a
    // failed search on the very first character typed.
    enabled: visible && q.trim().length >= MIN_QUERY_LENGTH,
  });
  const results: (SearchUser | FollowUser)[] = q.trim().length >= 1 ? (data?.users ?? []) : (suggested ?? []);

  const toggle = (u: SearchUser | FollowUser) => {
    setSel((s) => s.some((x) => x.id === u.id)
      ? s.filter((x) => x.id !== u.id)
      // SearchUser now has these optional, where FollowUser has them nullable -
      // normalise so the picked row matches SelectedUser either way.
      : [...s, { id: u.id, name: u.name ?? null, username: u.username, avatar: u.avatar ?? null }]);
  };

  // Tall fixed sheet, NOT keyboard-avoided: the search header stays put at the
  // top instead of the whole sheet jumping up and colliding with the box.
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.92} scrollable
      header={
        <View style={styles.pickerHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.pickerSearch}>
            <Search size={16} color={colors.textFaint} strokeWidth={2} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search people"
              placeholderTextColor={colors.textFaint}
              style={styles.pickerSearchField}
              autoCapitalize="none"
            />
          </View>
        </View>
      }
    >
      <View style={styles.pickerBody}>
        {sel.length > 0 && (
          <View style={styles.chipRow}>
            {sel.map((u) => (
              <View key={u.id} style={styles.chip}>
                <Text style={styles.chipText}>@{u.username}</Text>
                <Pressable onPress={() => setSel((s) => s.filter((x) => x.id !== u.id))} hitSlop={6}>
                  <X size={13} color={colors.brand} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {q.trim().length < 1 && (suggested?.length ?? 0) > 0 && (
          <Text style={styles.pickerSectionLabel}>SUGGESTED</Text>
        )}
        {q.trim().length < 1 && !suggested?.length
          ? <Text style={styles.pickerHint}>Search for people to add.</Text>
          : isFetching && results.length === 0
            ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.brand} />
            : results.length === 0
              ? <Text style={styles.pickerHint}>No people found.</Text>
              : results.map((u) => {
                const on = sel.some((x) => x.id === u.id);
                // Both shapes now carry is_verified; SearchUser's is optional.
                const isVerified = !!u.is_verified;
                return (
                  <Pressable key={u.id} style={styles.userRow} onPress={() => toggle(u)}>
                    <Avatar uri={u.avatar} style={styles.userAvatar} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleLine}>
                        <Text style={styles.userName} numberOfLines={1}>{u.name ?? u.username}</Text>
                        {isVerified && <VerifiedBadge size={12} />}
                      </View>
                      <Text style={styles.userHandle} numberOfLines={1}>@{u.username}</Text>
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Check size={14} color={colors.white} strokeWidth={3} />}
                    </View>
                  </Pressable>
                );
              })}

        <Pressable style={styles.sheetSave} onPress={() => { onDone(sel); onClose(); }}>
          <Text style={styles.sheetSaveText}>Done{sel.length ? ` (${sel.length})` : ""}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/** "Allowed followers" for a Followers-only room - your real followers list,
 *  infinite-scrolled and filtered locally as you type (never the global
 *  search: this is specifically about who already follows you), capped at
 *  the 100 the backend accepts. */
function FollowersPickerSheet({ visible, selected, onDone, onClose }: {
  visible: boolean; selected: SelectedUser[];
  onDone: (users: SelectedUser[]) => void; onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<SelectedUser[]>(selected);
  useEffect(() => { if (visible) { setSel(selected); setQ(""); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["space-allowed-followers", me?.username],
    queryFn: ({ pageParam }) => profileApi.followers(me!.username, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.meta && last.meta.current_page < last.meta.last_page ? all.length + 1 : undefined),
    enabled: visible && !!me?.username,
  });
  const all = useMemo(() => (data?.pages ?? []).flatMap((p) => p.data), [data]);
  const qTrim = q.trim().toLowerCase();
  const filtered = qTrim
    ? all.filter((u) => `${u.name ?? ""} ${u.username}`.toLowerCase().includes(qTrim))
    : all;

  const toggle = (u: FollowUser) => {
    setSel((s) => {
      if (s.some((x) => x.id === u.id)) return s.filter((x) => x.id !== u.id);
      if (s.length >= 100) return s;
      return [...s, { id: u.id, name: u.name, username: u.username, avatar: u.avatar }];
    });
  };

  return (
    <BottomSheet
      visible={visible} onClose={onClose} height={0.92} scrollable={false}
      header={
        <View style={styles.pickerHead}>
          <Text style={styles.sheetTitle}>Choose followers</Text>
          <View style={styles.pickerSearch}>
            <Search size={16} color={colors.textFaint} strokeWidth={2} />
            <TextInput
              value={q} onChangeText={setQ} placeholder="Search your followers"
              placeholderTextColor={colors.textFaint} style={styles.pickerSearchField} autoCapitalize="none"
            />
          </View>
        </View>
      }
    >
      <FlatList
        data={filtered}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.pickerBody}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        ListHeaderComponent={sel.length > 0 ? (
          <View style={styles.chipRow}>
            {sel.map((u) => (
              <View key={u.id} style={styles.chip}>
                <Text style={styles.chipText}>@{u.username}</Text>
                <Pressable onPress={() => setSel((s) => s.filter((x) => x.id !== u.id))} hitSlop={6}>
                  <X size={13} color={colors.brand} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        renderItem={({ item: u }) => {
          const on = sel.some((x) => x.id === u.id);
          return (
            <Pressable style={styles.userRow} onPress={() => toggle(u)}>
              <Avatar uri={u.avatar} style={styles.userAvatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.titleLine}>
                  <Text style={styles.userName} numberOfLines={1}>{u.name ?? u.username}</Text>
                  {u.is_verified && <VerifiedBadge size={12} />}
                </View>
                <Text style={styles.userHandle} numberOfLines={1}>@{u.username}</Text>
              </View>
              <View style={[styles.checkbox, on && styles.checkboxOn]}>
                {on && <Check size={14} color={colors.white} strokeWidth={3} />}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={!isLoading ? <Text style={styles.pickerHint}>No followers yet.</Text> : null}
        ListFooterComponent={
          <>
            {isFetchingNextPage && <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.brand} />}
            <Pressable style={styles.sheetSave} onPress={() => { onDone(sel); onClose(); }}>
              <Text style={styles.sheetSaveText}>Done{sel.length ? ` (${sel.length})` : ""}</Text>
            </Pressable>
          </>
        }
      />
    </BottomSheet>
  );
}

/** A full-screen, searchable select page in the profile-Interests style: a
 *  search box, an optional "N/MAX selected" count, then rows as soft rounded
 *  pills with a circular check. Single-select (Language, Audience, Category,
 *  Limit, Quality) closes on pick; multi-select (Topics) keeps a Done button
 *  and can add custom entries. */
function PickerPage({ visible, title, helper, options, mode, selected, max, allowCustom, onChange, onClose }: {
  visible: boolean;
  title: string;
  helper?: string;
  options: { value: string; label: string; desc?: string; Icon?: LucideIcon }[];
  mode: "single" | "multi";
  selected: string[];
  max?: number;
  allowCustom?: boolean;
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (visible) setQ(""); }, [visible]);

  const query = q.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  const isSel = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase());
  const pick = (v: string) => {
    if (mode === "single") { onChange([v]); onClose(); return; }
    if (isSel(v)) onChange(selected.filter((s) => s.toLowerCase() !== v.toLowerCase()));
    else if (!max || selected.length < max) onChange([...selected, v]);
  };
  const canAddCustom = !!allowCustom && q.trim().length > 0
    && !options.some((o) => o.label.toLowerCase() === query) && !isSel(q.trim());
  const addCustom = () => {
    const v = q.trim();
    if (!v) return;
    if (mode === "single") { onChange([v]); onClose(); return; }
    if (!max || selected.length < max) onChange([...selected, v]);
    setQ("");
  };

  const header = (
    <>
      {!!helper && <Text style={styles.pageHelper}>{helper}</Text>}

      <View style={styles.pageSearchWrap}>
        <Search size={18} color={colors.textFaint} strokeWidth={2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${title.toLowerCase()}`}
          placeholderTextColor={colors.textFaint}
          style={styles.pageSearchField}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => allowCustom && addCustom()}
          returnKeyType={allowCustom ? "done" : "search"}
        />
        {q.length > 0 && (
          <Pressable hitSlop={8} onPress={() => setQ("")} accessibilityLabel="Clear search">
            <X size={16} color={colors.textFaint} strokeWidth={2.4} />
          </Pressable>
        )}
      </View>

      {mode === "multi" && (
        <Text style={styles.pageCount}>{selected.length}/{max ?? "∞"} selected</Text>
      )}

      {canAddCustom && (
        <Pressable style={[styles.pickPill, styles.pickPillAdd]} onPress={addCustom}>
          <Plus size={18} color={colors.brand} strokeWidth={2.4} />
          <Text style={[styles.pickPillLabel, { color: colors.brand, fontWeight: font.weightBold }]}>Add “{q.trim()}”</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* A native Modal is its own view hierarchy, so the root SafeAreaProvider's
          insets don't reach inside it - without this local provider the header +
          search box render at inset 0, tucked under the notch/status bar. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Screen edges={["top", "bottom"]}>
          <View style={styles.pageHeader}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Back"><ChevronLeft size={24} color={colors.text} strokeWidth={2.2} /></Pressable>
            <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
            {mode === "multi"
              ? <Pressable onPress={onClose} hitSlop={10}><Text style={styles.pageDone}>Done</Text></Pressable>
              : <View style={{ width: 40 }} />}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pageList}
            ListHeaderComponent={header}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => {
              const on = isSel(item.value);
              const Icon = item.Icon;
              return (
                <Pressable style={styles.pickPill} onPress={() => pick(item.value)}>
                  {Icon ? <Icon size={20} color={on ? colors.brand : colors.textMuted} strokeWidth={2} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickPillLabel, on && { color: colors.brand, fontWeight: font.weightBold }]}>{item.label}</Text>
                    {!!item.desc && <Text style={styles.pickPillDesc}>{item.desc}</Text>}
                  </View>
                  {on
                    ? <View style={styles.checkOn}><Check size={14} color={colors.white} strokeWidth={3} /></View>
                    : <View style={styles.checkOff} />}
                </Pressable>
              );
            }}
            ListEmptyComponent={!canAddCustom ? <Text style={styles.pageEmpty}>No matches.</Text> : null}
          />
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => ({ h: Math.floor(i / 2), m: (i % 2) * 30 }));

/** "Pick a time" - a real date+time page (day chips + a time list), not the
 *  three quick-picks' Alert fallback. No date-picker dependency exists in
 *  this build, so this is hand-rolled from plain lists rather than a native
 *  calendar widget. */
function DateTimePage({ visible, initial, onPick, onClose }: {
  visible: boolean; initial: Date; onPick: (d: Date) => void; onClose: () => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  }), []);
  const [dayIndex, setDayIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    // Land on whichever of the 7 day-chips matches the initial value (falls
    // back to "today" if it's further out than the chip row covers).
    const initialDay = new Date(initial);
    initialDay.setHours(0, 0, 0, 0);
    const idx = days.findIndex((d) => d.getTime() === initialDay.getTime());
    setDayIndex(idx >= 0 ? idx : 0);
  }, [visible, initial, days]);

  const isToday = dayIndex === 0;
  const now = new Date();
  const slots = isToday ? HALF_HOURS.filter((t) => t.h > now.getHours() || (t.h === now.getHours() && t.m > now.getMinutes())) : HALF_HOURS;

  const pick = (t: { h: number; m: number }) => {
    const d = new Date(days[dayIndex]);
    d.setHours(t.h, t.m, 0, 0);
    onPick(d);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Screen edges={["top", "bottom"]}>
          <View style={styles.pageHeader}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Back"><ChevronLeft size={24} color={colors.text} strokeWidth={2.2} /></Pressable>
            <Text style={styles.pageTitle}>Choose a time</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((d, i) => {
              const on = i === dayIndex;
              return (
                <Pressable key={d.getTime()} onPress={() => setDayIndex(i)} style={[styles.dayChip, on && styles.dayChipOn]}>
                  <Text style={[styles.dayChipLabel, on && styles.dayChipLabelOn]}>{dayLabel(d, i)}</Text>
                  <Text style={[styles.dayChipNum, on && styles.dayChipNumOn]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            data={slots}
            keyExtractor={(t) => `${t.h}:${t.m}`}
            contentContainerStyle={styles.pageList}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <Pressable style={styles.pickPill} onPress={() => pick(item)}>
                <Clock size={18} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.pickPillLabel}>{clockTime(new Date(0, 0, 0, item.h, item.m))}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.pageEmpty}>No times left today - try tomorrow.</Text>}
          />
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}

function dayLabel(d: Date, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function scheduleLabel(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "Starting…";
  if (mins < 60) return `In ${mins} min`;
  const h = Math.round(mins / 60);
  return `In ${h} hour${h === 1 ? "" : "s"}`;
}

/* ── styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  headerStep: { marginTop: 1, fontSize: 11, color: colors.textFaint },
  draftsBtn: {
    paddingHorizontal: spacing.md, height: 32, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted,
  },
  draftsText: { fontSize: 12, fontWeight: font.weightHeavy, color: colors.text },

  progressRow: { flexDirection: "row", gap: 5, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressBarOn: { backgroundColor: colors.brand },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },

  // live preview card - a real-time look at how the room reads in Explore.
  livePreview: { marginTop: spacing.sm, borderRadius: radius.lg, padding: 16, overflow: "hidden" },
  livePreviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePreviewLive: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 21, paddingHorizontal: 8, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.22)",
  },
  livePreviewDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.white },
  livePreviewLiveText: { color: colors.white, fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.5 },
  livePreviewExplore: { fontSize: 10.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.8)" },
  livePreviewTitle: { marginTop: 12, fontSize: 19, fontWeight: font.weightHeavy, color: colors.white, letterSpacing: -0.3, lineHeight: 24 },
  livePreviewSub: { marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.8)" },
  livePreviewHost: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  livePreviewFaces: { flexDirection: "row" },
  livePreviewAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  livePreviewAvatarOverlap: { marginLeft: -7 },
  livePreviewHostText: { fontSize: 11.5, color: "rgba(255,255,255,0.85)", fontWeight: font.weightMedium },

  // cover theme swatches
  themeRow: { flexDirection: "row", gap: 9, marginTop: spacing.sm },
  themeSwatchWrap: { width: 54, height: 54, borderRadius: 14, padding: 3 },
  // The glow ring on the selected swatch - the wrap becomes a brand-pink
  // frame around the (slightly inset) gradient tile, the RN stand-in for a
  // CSS outer box-shadow ring.
  themeSwatchWrapOn: { backgroundColor: colors.brand },
  themeSwatch: { flex: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  themeSwatchOn: { borderWidth: 2, borderColor: "rgba(255,255,255,0.9)" },

  label: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  labelHint: { color: colors.textFaint, fontWeight: font.weightRegular },
  req: { color: colors.brand },
  input: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: font.md, color: colors.text, backgroundColor: colors.card,
  },
  textarea: { height: 96, textAlignVertical: "top", paddingBottom: spacing.xl },
  counter: { position: "absolute", right: spacing.md, bottom: spacing.sm, fontSize: font.xs, color: colors.textFaint },
  counterInline: { alignSelf: "flex-end", marginTop: 4, fontSize: font.xs, color: colors.textFaint },

  ideaRow: { gap: spacing.sm, marginTop: spacing.sm, paddingBottom: 2 },
  ideaChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 31, paddingHorizontal: spacing.md, borderRadius: radius.sm,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  ideaChipText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, height: 32, borderRadius: 10,
    backgroundColor: colors.brandTint, borderWidth: 1, borderColor: "rgba(254,44,85,0.3)",
  },
  chipText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
  chipInput: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48, backgroundColor: colors.card,
  },
  chipInputCompact: { height: 44 },
  chipInputField: { flex: 1, fontSize: font.md, color: colors.text },
  chipAdd: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  suggestChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.md, height: 30, borderRadius: 9,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  suggestText: { fontSize: font.xs, fontWeight: font.weightMedium, color: colors.textMuted },

  topicsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.lg },
  topicsLabel: { fontSize: 11.5, fontWeight: font.weightHeavy, color: colors.textFaint, letterSpacing: 0.6 },
  topicsCount: { fontSize: 11, fontWeight: font.weightBold, color: colors.textFaint },
  topicsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  topicChip: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14,
    borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  topicChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  topicChipDim: { opacity: 0.45 },
  topicChipText: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  topicChipTextOn: { color: colors.white },

  browseRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingVertical: spacing.sm },
  browseText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  whenRow: { flexDirection: "row", gap: spacing.sm },
  whenTile: {
    flex: 1, minWidth: 0, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  whenTileOn: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  whenTileLabel: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  whenTileLabelOn: { color: colors.brand },
  whenTileSub: { marginTop: 3, fontSize: 10.5, color: colors.textMuted },
  whenTileSubOn: { color: colors.brand },

  card: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.card, paddingHorizontal: spacing.md, overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 46 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowIcon: {
    width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bgMuted,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  settingTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  settingSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted, lineHeight: 16 },
  rowValue: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },

  // "Who can speak" - icon-tile cards with a square check, not plain radio dots.
  speakCard: {
    flexDirection: "row", alignItems: "center", gap: 11,
    padding: 13, borderRadius: 13, backgroundColor: colors.bgMuted,
    borderWidth: 1.5, borderColor: "transparent",
  },
  speakCardOn: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  speakIconTile: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
  },
  speakIconTileOn: { backgroundColor: colors.card },
  speakLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  speakSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted, lineHeight: 16 },
  speakCheck: {
    width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.borderStrong,
  },
  speakCheckOn: { backgroundColor: colors.brand, borderColor: colors.brand },

  // Invite co-hosts - inline mutuals search + avatar rail.
  coHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.lg },
  coSearchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 42, marginTop: spacing.sm, paddingHorizontal: 13,
    borderRadius: 12, backgroundColor: colors.bgMuted,
  },
  coSearchField: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: font.weightMedium, color: colors.text, padding: 0 },
  coSearchClear: {
    width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.border,
  },
  coEmpty: { marginTop: spacing.sm, fontSize: 12.5, color: colors.textMuted },
  audienceNote: { marginTop: spacing.sm, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  coRail: { gap: 14, marginTop: spacing.md, paddingBottom: 2 },
  coItem: { width: 58, alignItems: "center", gap: 7 },
  coAvatarWrap: { position: "relative" },
  coAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted },
  coCheckBadge: {
    position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg,
    alignItems: "center", justifyContent: "center",
  },
  coName: { fontSize: 11, fontWeight: font.weightMedium, color: colors.textMuted, maxWidth: 58 },
  coNameOn: { color: colors.text, fontWeight: font.weightBold },

  // Room rules
  ruleRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, backgroundColor: colors.bgMuted,
    borderWidth: 1.5, borderColor: "transparent",
  },
  ruleRowOn: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  ruleBox: {
    width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.borderStrong,
  },
  ruleBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  ruleLabel: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: font.weightBold, color: colors.text },

  avatarStack: { flexDirection: "row", alignItems: "center" },
  stackAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.card },
  stackMore: { marginLeft: 4, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textMuted },
  addBtn: {
    width: 28, height: 28, borderRadius: 14, marginLeft: 6,
    borderWidth: 1, borderColor: "rgba(254,44,85,0.4)", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },


  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  preview: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.card, padding: spacing.md,
  },
  previewTop: { flexDirection: "row", gap: spacing.md },
  previewCover: {
    width: 76, height: 76, borderRadius: radius.md, backgroundColor: "#2a1020",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  previewTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 20 },
  previewLine: { marginTop: 3, fontSize: font.xs, color: colors.textMuted },
  previewHost: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  previewAvatar: { width: 20, height: 20, borderRadius: 10 },
  previewHostName: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  previewHostRole: { fontSize: 11, color: colors.textFaint },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    paddingHorizontal: spacing.sm, height: 22, borderRadius: 6, backgroundColor: colors.brand,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.white },
  liveText: { fontSize: 10, fontWeight: font.weightHeavy, color: colors.white, letterSpacing: 0.4 },
  previewMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  pMeta: { flex: 1 },
  pMetaHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  pMetaLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  pMetaSub: { marginTop: 2, fontSize: 11, color: colors.textFaint },

  ready: {
    marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgMuted,
  },
  readyLabel: { fontSize: 11, fontWeight: font.weightHeavy, color: colors.textFaint, letterSpacing: 0.6 },
  readyLine: { marginTop: spacing.xs, fontSize: font.sm, color: colors.textSecondary, lineHeight: 19 },

  // Sticky footer - square buttons throughout (13px radius), never pills.
  footer: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
  },
  scheduleBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    height: 50, paddingHorizontal: 15, borderRadius: 13, backgroundColor: colors.bgMuted,
  },
  scheduleBtnOn: { backgroundColor: colors.brandTint },
  scheduleBtnText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  submit: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 50, borderRadius: 13, backgroundColor: colors.brand,
  },
  submitOff: { opacity: 0.55 },
  submitText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.white },
  terms: { marginTop: spacing.md, textAlign: "center", fontSize: font.xs, color: colors.textMuted },
  termsLink: { color: colors.brand, fontWeight: font.weightBold },

  // sheets
  sheetPad: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sheetTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.md },
  // Full-screen select page (profile-Interests style): search + pill rows.
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pageTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  pageDone: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand },
  pageHelper: { fontSize: font.sm, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  pageSearchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, height: 48, borderRadius: 12, backgroundColor: colors.bgMuted, marginBottom: spacing.md },
  pageSearchField: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },
  pageCount: { marginBottom: spacing.sm, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  pageList: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },

  // DateTimePage's day-chip row
  dayRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  dayChip: { width: 58, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.bgMuted },
  dayChipOn: { backgroundColor: colors.brand },
  dayChipLabel: { fontSize: 11, fontWeight: font.weightBold, color: colors.textMuted },
  dayChipLabelOn: { color: "rgba(255,255,255,0.8)" },
  dayChipNum: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text },
  dayChipNumOn: { color: colors.white },
  pickPill: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 52 },
  pickPillAdd: { marginBottom: spacing.sm },
  pickPillLabel: { fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
  pickPillDesc: { marginTop: 2, fontSize: font.xs, color: colors.textMuted, lineHeight: 16 },
  checkOn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  checkOff: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong },
  pageEmpty: { textAlign: "center", marginTop: spacing.xxl, fontSize: font.sm, color: colors.textMuted },
  sheetInput: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: font.md, color: colors.text,
    backgroundColor: colors.card,
  },
  sheetInputTall: { height: 96, textAlignVertical: "top" },
  sheetSave: {
    marginTop: spacing.lg, height: 50, borderRadius: 13, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  sheetSaveText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  pickerHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  pickerSearch: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 44, backgroundColor: colors.bgMuted,
  },
  pickerSearchField: { flex: 1, fontSize: font.md, color: colors.text },
  pickerBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  pickerHint: { textAlign: "center", marginTop: spacing.xl, fontSize: font.sm, color: colors.textMuted },
  pickerSectionLabel: { fontSize: 11, fontWeight: font.weightHeavy, color: colors.textFaint, letterSpacing: 0.6, marginBottom: spacing.sm },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  userAvatar: { width: 42, height: 42, borderRadius: 21 },
  userName: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  userHandle: { marginTop: 1, fontSize: font.xs, color: colors.textMuted },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
