import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { Screen } from "@/components/Screen";
import { ds } from "@/theme/design";
import { font, TAB_BAR_HEIGHT } from "@/constants/theme";
import { inboxApi, type Conversation } from "@/api/inbox.api";
import { useAuthStore } from "@/store/auth.store";

/**
 * Inbox search - the design's SEARCH PEOPLE AND MESSAGES page.
 *
 * Scoped to the inbox, as the design asks: every row comes from GET
 * /messages/conversations, so a result is always someone you already have a
 * thread with. It deliberately does NOT call the global /search endpoint -
 * that answers with creators you have never messaged, which is not what this
 * page is for.
 *
 * Rendered INSIDE the Inbox tab rather than pushed as a route, so the bottom
 * tab bar stays put - the same way the Spaces tab opens its own search.
 *
 * ── One honest limitation ──────────────────────────────────────────────────
 * The "Messages" tab matches each conversation's MOST RECENT message only.
 * There is no message-body search endpoint on the backend (the /messages route
 * group has no search route), and the client only ever holds the last message
 * per thread. Searching full history needs a server endpoint; until then this
 * tab is honest about what it can see rather than pretending to search deeper.
 */

const RECENTS_KEY = "teezer:inbox:recents";
const MAX_RECENTS = 8;
const TABS = ["All", "People", "Chats", "Messages"] as const;
type Tab = (typeof TABS)[number];

function ClockGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M12 7.5V12l3 1.8" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function MagnifierGlyph({ c = ds.textMuted, s = 16 }: { c?: string; s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={c} strokeWidth={2.4} />
      <Path d="M15.6 15.6L21 21" stroke={c} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function XGlyph({ c = ds.textMuted, s = 13 }: { c?: string; s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={c} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Same relative stamp the inbox list uses, so a row reads identically here. */
function ago(iso: string | null) {
  if (!iso) return "";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return `${Math.floor(secs / 604800)}w`;
}

/** Media-only messages have no body; naming the kind beats an empty line. */
function preview(c: Conversation) {
  if (c.last_message_type === "shared_video") return "Sent a video";
  if (c.last_message && c.last_message.trim()) return c.last_message;
  switch (c.last_message_type) {
    case "image": return "Photo";
    case "video": return "Video";
    case "voice": return "Voice message";
    case "audio": return "Audio";
    case "document": return "Document";
    default: return "";
  }
}

const matchesPerson = (c: Conversation, q: string) =>
  (c.name ?? "").toLowerCase().includes(q) || c.username.toLowerCase().includes(q);

const matchesMessage = (c: Conversation, q: string) =>
  (c.last_message ?? "").toLowerCase().includes(q);

export function InboxSearchScreen({ onClose }: { onClose: () => void }) {
  const navigation = useNavigation<any>();
  // Same guest test the Inbox screen uses, so the two agree on who is signed in.
  const isGuest = useAuthStore((s) => s.status !== "authenticated");

  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("All");
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    void AsyncStorage.getItem(RECENTS_KEY).then((v) => {
      if (v) try { setRecents(JSON.parse(v)); } catch { /* corrupt entry, ignore */ }
    });
  }, []);

  const remember = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecents((prev) => {
      const next = [t, ...prev.filter((p) => p.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENTS);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forget = useCallback((term: string) => {
    setRecents((prev) => {
      const next = prev.filter((p) => p !== term);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /** The whole inbox, filtered on device - the endpoint returns every thread, so
   *  a query needs no extra round trip. Shares the Inbox screen's cache key on
   *  purpose: arriving from that screen, results are already there. */
  const convos = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    enabled: !isGuest,
    staleTime: 20_000,
  });

  const all = useMemo<Conversation[]>(() => convos.data ?? [], [convos.data]);
  const has = q.length > 0;

  const people = useMemo(() => (has ? all.filter((c) => matchesPerson(c, q)) : []), [all, q, has]);
  const messages = useMemo(() => (has ? all.filter((c) => matchesMessage(c, q)) : []), [all, q, has]);

  /** Most recent threads - the design's "Jump back in" rail. */
  const jumpBack = useMemo(() => all.slice(0, 10), [all]);

  const openChat = useCallback((c: Conversation) => {
    remember(raw);
    navigation.navigate("Chat", {
      userId: c.user_id,
      username: c.username,
      name: c.name,
      avatar: c.avatar,
      isVerified: !!c.is_verified,
    });
  }, [navigation, raw, remember]);

  const showPeople = has && (tab === "All" || tab === "People");
  const showChats = has && (tab === "All" || tab === "Chats");
  const showMessages = has && (tab === "All" || tab === "Messages");

  const nothing = has && !convos.isLoading
    && (tab === "Messages" ? messages.length === 0 : people.length === 0 && messages.length === 0);

  const personRow = (c: Conversation, sub: string) => (
    <Pressable
      key={c.user_id}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      onPress={() => openChat(c)}
    >
      <Avatar uri={c.avatar} style={styles.rowAvatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{c.name || c.username}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      {c.unread_count > 0 && <View style={styles.unreadDot} />}
    </Pressable>
  );

  return (
    <Screen edges={["top"]} bg={ds.surface}>
      <View style={styles.searchRow}>
        <View style={styles.field}>
          <MagnifierGlyph />
          <TextInput
            ref={inputRef}
            value={raw}
            onChangeText={setRaw}
            placeholder="Search people and messages"
            placeholderTextColor={ds.textMuted}
            style={styles.input}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => remember(raw)}
          />
          {raw.length > 0 && (
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear"
              onPress={() => setRaw("")}
            >
              <XGlyph />
            </Pressable>
          )}
        </View>
        <Pressable hitSlop={8} accessibilityRole="button" onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      {/* Scope chips - the design's All / People / Chats / Messages. */}
      {/* flexGrow:0 is load-bearing: a horizontal ScrollView in a flex column
          otherwise expands to fill the free space, and its children stretch to
          match - which is what made these pills hundreds of points tall. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {TABS.map((t) => {
          const on = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {isGuest ? (
          <View style={styles.blank}>
            <Text style={styles.blankTitle}>Log in to search your inbox</Text>
            <Text style={styles.blankBody}>Your messages and people are per-account.</Text>
          </View>
        ) : (
          <>
            {/* ── recent ── */}
            {!has && recents.length > 0 && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>RECENT</Text>
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    onPress={() => {
                      setRecents([]);
                      void AsyncStorage.removeItem(RECENTS_KEY);
                    }}
                  >
                    <Text style={styles.clearAll}>Clear all</Text>
                  </Pressable>
                </View>
                {recents.map((t) => (
                  <View key={t} style={styles.recentRow}>
                    <ClockGlyph />
                    <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => setRaw(t)}>
                      <Text style={styles.recentText} numberOfLines={1}>{t}</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${t}`}
                      onPress={() => forget(t)}
                    >
                      <XGlyph />
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {/* ── jump back in ── */}
            {!has && jumpBack.length > 0 && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>JUMP BACK IN</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {jumpBack.map((c) => (
                    <Pressable
                      key={c.user_id}
                      style={styles.jumpItem}
                      accessibilityRole="button"
                      accessibilityLabel={`Open chat with ${c.name || c.username}`}
                      onPress={() => openChat(c)}
                    >
                      <View style={styles.jumpRing}>
                        <Avatar uri={c.avatar} style={styles.jumpAvatar} />
                        {/* Both states are real fields on the conversation, so
                            the rail says something the list would otherwise
                            make you scroll to find. */}
                        {c.is_online && <View style={styles.jumpOnline} />}
                        {c.unread_count > 0 && (
                          <View style={styles.jumpBadge}>
                            <Text style={styles.jumpBadgeText}>
                              {c.unread_count > 99 ? "99+" : c.unread_count}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.jumpName} numberOfLines={1}>
                        {c.name || c.username}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {convos.isLoading && (
              <View style={styles.center}><ActivityIndicator color={ds.accent} /></View>
            )}

            {convos.isError && (
              <View style={styles.blank}>
                <Text style={styles.blankTitle}>Couldn&apos;t load your inbox</Text>
                <Text style={styles.blankBody}>This is temporary. Try again in a moment.</Text>
              </View>
            )}

            {!has && !convos.isLoading && recents.length === 0 && jumpBack.length === 0 && (
              <View style={styles.blank}>
                <MagnifierGlyph c="#B6B1BE" s={34} />
                <Text style={styles.blankTitle}>Search your inbox</Text>
                <Text style={styles.blankBody}>Find people you have messaged, and what they said.</Text>
              </View>
            )}

            {/* ── results ── */}
            {showPeople && people.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>PEOPLE</Text>
                {people.map((c) => personRow(c, `@${c.username}`))}
              </>
            )}

            {showChats && people.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>CHATS</Text>
                {people.map((c) => personRow(c, `${preview(c)} · ${ago(c.last_ts)}`))}
              </>
            )}

            {showMessages && messages.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>MESSAGES</Text>
                {messages.map((c) => personRow(c, `${preview(c)} · ${ago(c.last_ts)}`))}
              </>
            )}

            {nothing && (
              <View style={styles.blank}>
                <Text style={styles.blankTitle}>No results for “{raw.trim()}”</Text>
                <Text style={styles.blankBody}>
                  {tab === "Messages"
                    ? "Only the latest message in each chat can be searched."
                    : "Check the spelling, or try a username."}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  field: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F1EFF3", borderRadius: 10, paddingHorizontal: 12, height: 38,
  },
  input: { flex: 1, minWidth: 0, fontSize: font.sm, color: ds.text, padding: 0 },
  cancel: { fontSize: font.sm, fontWeight: font.weightMedium, color: ds.accent },

  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: "center" },
  chip: { paddingHorizontal: 15, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F1EFF3" },
  chipOn: { backgroundColor: ds.text },
  chipText: { fontSize: font.sm, fontWeight: font.weightMedium, color: "#4A4653" },
  chipTextOn: { color: ds.onDark, fontWeight: font.weightBold },

  content: { paddingHorizontal: 16, paddingBottom: TAB_BAR_HEIGHT + 24 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 4 },
  sectionLabel: {
    flex: 1, fontSize: font.xs, fontWeight: font.weightBold, letterSpacing: 0.9,
    color: ds.textMuted, textTransform: "uppercase", marginTop: 14, marginBottom: 6,
  },
  clearAll: { fontSize: font.sm, fontWeight: font.weightMedium, color: ds.accent },

  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  recentText: { fontSize: font.base, color: ds.text },

  rail: { gap: 14, paddingVertical: 8, paddingRight: 16 },
  jumpItem: { width: 72, alignItems: "center", gap: 8 },
  /** Holds the avatar plus its two overlays, so both anchor to the circle
   *  rather than to the column (which is wider than the avatar). */
  jumpRing: {
    width: 62, height: 62, borderRadius: 999,
    alignItems: "center", justifyContent: "center", backgroundColor: "#F1EFF3",
  },
  jumpAvatar: { width: 58, height: 58, borderRadius: 999 },
  jumpOnline: {
    position: "absolute", right: 1, bottom: 1,
    width: 15, height: 15, borderRadius: 999,
    backgroundColor: "#2BC48A", borderWidth: 2.5, borderColor: ds.surface,
  },
  jumpBadge: {
    position: "absolute", top: -1, right: -3,
    minWidth: 20, height: 20, borderRadius: 999, paddingHorizontal: 5,
    backgroundColor: ds.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: ds.surface,
  },
  jumpBadgeText: { color: ds.onDark, fontSize: 10, fontWeight: font.weightHeavy },
  jumpName: { width: 72, fontSize: font.xs, fontWeight: font.weightMedium, color: ds.text, textAlign: "center" },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  rowAvatar: { width: 46, height: 46, borderRadius: 999 },
  rowTitle: { fontSize: font.sm, fontWeight: font.weightBold, color: ds.text },
  rowSub: { fontSize: font.xs, color: ds.textMuted, marginTop: 2 },
  unreadDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: ds.accent },

  center: { paddingTop: 40, alignItems: "center" },
  blank: { paddingTop: 60, alignItems: "center", gap: 8, paddingHorizontal: 30 },
  blankTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text, textAlign: "center" },
  blankBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center", lineHeight: 20 },

  pressed: { opacity: 0.85 },
});
