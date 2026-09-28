import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { ds, radius } from "@/theme/design";
import { font } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { inboxApi, type Conversation, type ShareSuggestion } from "@/api/inbox.api";
import { useAuthStore } from "@/store/auth.store";

/** What the picker actually needs to render a row - ShareSuggestion and
 *  Conversation both reduce to this. */
interface Recipient {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
}

/**
 * "Send to" - the friend picker half of ShareSheet.tsx, minus the external-
 * app share grid (WhatsApp/Instagram/etc.) that only makes sense for a Reel's
 * public URL, not a profile or product card. Same select-then-Send flow
 * either way: a tap only ticks, nothing sends until Send is pressed.
 *
 * Generic over what's being sent - the caller supplies `onSend`, which is
 * shareProfile()/shareProduct()/forwardMessage() (or anything else with this
 * shape) bound to the specific thing being shared. This component only owns
 * the picker UI.
 *
 * `source` picks who fills the list: "friends" (the default, shareProfile/
 * shareProduct's own "Send to friends" pool) is followed accounts ranked by
 * chat frequency; "forward" is Forward's own list of who to forward the
 * message to - it needs your actual conversations, not just people you
 * follow, since forwarding to someone who messaged you first (a thread that
 * exists without a follow either way) is exactly the case "friends" misses.
 */
export function SendToSheet({
  visible,
  onClose,
  title,
  onSend,
  source = "friends",
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  onSend: (conversationUserId: number) => Promise<unknown>;
  source?: "friends" | "forward";
}) {
  const me = useAuthStore((s) => s.user);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPicked({});
      setSent({});
      setSending(false);
      setQuery("");
      setNotice(null);
    }
  }, [visible]);

  const friends = useQuery({
    queryKey: ["share-suggestions"],
    queryFn: () => inboxApi.shareSuggestions(30),
    enabled: visible && !!me && source === "friends",
    staleTime: 60_000,
  });

  const conversations = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    enabled: visible && !!me && source === "forward",
    staleTime: 30_000,
  });

  const recipients: Recipient[] = useMemo(() => {
    if (source === "forward") {
      return (conversations.data ?? []).map((c: Conversation) => ({
        id: c.user_id, username: c.username, name: c.name, avatar: c.avatar,
      }));
    }
    return (friends.data ?? []).map((f: ShareSuggestion) => ({
      id: f.id, username: f.username, name: f.name, avatar: f.avatar,
    }));
  }, [source, conversations.data, friends.data]);

  const isLoading = source === "forward" ? conversations.isLoading : friends.isLoading;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((f) => f.username?.toLowerCase().includes(q) || (f.name ?? "").toLowerCase().includes(q));
  }, [recipients, query]);

  const togglePick = useCallback((f: Recipient) => {
    setPicked((p) => {
      const next = { ...p };
      if (next[f.id]) delete next[f.id];
      else next[f.id] = true;
      return next;
    });
  }, []);

  const pickedIds = useMemo(() => Object.keys(picked).map(Number), [picked]);

  /** allSettled, not all: one blocked/failed recipient must not drop the rest. */
  const sendToPicked = useCallback(async () => {
    if (pickedIds.length === 0 || sending) return;
    setSending(true);
    const results = await Promise.allSettled(pickedIds.map((id) => onSend(id)));
    const ok: number[] = [];
    results.forEach((r, i) => { if (r.status === "fulfilled") ok.push(pickedIds[i]); });
    setSent((p) => {
      const next = { ...p };
      ok.forEach((id) => (next[id] = true));
      return next;
    });
    setPicked((p) => {
      const next = { ...p };
      ok.forEach((id) => delete next[id]);
      return next;
    });
    setSending(false);
    const failed = pickedIds.length - ok.length;
    setNotice(
      failed === 0
        ? `Sent to ${ok.length} ${ok.length === 1 ? "person" : "people"}.`
        : `Sent to ${ok.length}. ${failed} couldn't receive it - they may not accept messages from you.`,
    );
  }, [pickedIds, sending, onSend]);

  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.72}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>

        <View style={styles.searchField}>
          <SearchGlyph />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={source === "forward" ? "Search chats" : "Search friends"}
            placeholderTextColor={ds.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={ds.accent} />
          </View>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>
            {!me
              ? "Log in to send this."
              : source === "forward"
                ? "Start a conversation to forward this to someone."
                : "Follow people to send this straight to them."}
          </Text>
        ) : (
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {list.map((f) => {
              const isPicked = !!picked[f.id];
              const isSent = !!sent[f.id];
              return (
                <Pressable
                  key={f.id}
                  onPress={() => togglePick(f)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPicked }}
                  accessibilityLabel={`${isPicked ? "Deselect" : "Select"} ${f.username}`}
                  style={styles.row}
                >
                  {f.avatar ? (
                    <Image source={{ uri: f.avatar }} style={styles.avatar} contentFit="cover" transition={120} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>{(f.username ?? "?").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{f.name || f.username}</Text>
                    <Text style={styles.rowHandle} numberOfLines={1}>@{f.username}</Text>
                  </View>
                  <View style={[styles.checkbox, (isPicked || isSent) && styles.checkboxOn]}>
                    {(isPicked || isSent) && <TickGlyph />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        {pickedIds.length > 0 && (
          <Pressable
            onPress={() => void sendToPicked()}
            disabled={sending}
            accessibilityRole="button"
            style={[styles.sendBtn, sending && styles.sendBtnBusy]}
          >
            {sending ? <ActivityIndicator color={ds.onDark} size="small" /> : (
              <Text style={styles.sendBtnText}>Send{pickedIds.length > 1 ? ` to ${pickedIds.length}` : ""}</Text>
            )}
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
}

function SearchGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={ds.textMuted} strokeWidth={2} />
      <Path d="M15.6 15.6L21 21" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function TickGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5l5 5L20 6.5" stroke={ds.onDark} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: ds.text, marginBottom: 12 },
  searchField: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: ds.surfaceSunken, borderRadius: radius.pill,
    paddingHorizontal: 14, height: 40, marginBottom: 8,
  },
  searchInput: { flex: 1, padding: 0, fontSize: font.sm, color: ds.text },
  loading: { paddingVertical: 24, alignItems: "center" },
  empty: { paddingVertical: 12, fontSize: 12.5, color: ds.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  avatar: { width: 46, height: 46, borderRadius: 999 },
  avatarFallback: { backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 17, fontWeight: font.weightHeavy, color: ds.textMuted },
  rowName: { fontSize: 14, fontWeight: "700", color: ds.text },
  rowHandle: { fontSize: 12, color: ds.textMuted, marginTop: 1 },
  checkbox: {
    width: 24, height: 24, borderRadius: 999, borderWidth: 1.5, borderColor: ds.line,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { borderColor: ds.accent, backgroundColor: ds.accent },
  notice: { fontSize: 12, color: ds.textDim, paddingVertical: 8 },
  sendBtn: { height: 46, borderRadius: radius.pill, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center", marginTop: 4 },
  sendBtnBusy: { opacity: 0.7 },
  sendBtnText: { color: ds.onDark, fontSize: font.md, fontWeight: font.weightBold },
});
