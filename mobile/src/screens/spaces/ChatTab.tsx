import { memo, useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Pin, SendHorizontal, Smile, X } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import {
  spaceChatApi, type SpaceChat, type SpaceMessage, type SpaceMsgReaction,
} from "@/api/spaces.api";
import { REACTION_EMOJIS, roleBadge, SPACE_DARK } from "./space-style";

/**
 * The chat inside a Space - the "Chat" tab on the People sheet.
 *
 * Polled, not socket-driven: it shares the room's few-second refresh, which
 * keeps it working in Expo Go (where the native realtime transport is absent)
 * and never leaves a message stranded if an event is dropped. Sending and
 * reacting are optimistic against the query cache so the tap lands instantly;
 * the next poll reconciles with the server's truth.
 *
 * Every line is left-aligned with its author's badge - this is a room talking,
 * not a two-person DM, so "mine on the right" would only add noise.
 */
export function ChatTab({ spaceId, meId }: { spaceId: string; meId: string | null }) {
  const qc = useQueryClient();
  const listRef = useRef<FlatList<SpaceMessage>>(null);
  const [text, setText] = useState("");
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  // The message whose reaction picker is open, if any.
  const [picking, setPicking] = useState<string | null>(null);

  const key = ["space-chat", spaceId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => spaceChatApi.messages(spaceId),
    refetchInterval: 4000,
  });

  const messages = data?.data ?? [];
  const pinned = data?.pinned ?? null;

  const sendM = useMutation({
    mutationFn: (body: string) => spaceChatApi.send(spaceId, body),
    onSuccess: (msg) => {
      qc.setQueryData<SpaceChat>(key, (prev) =>
        prev
          ? { ...prev, data: [...prev.data.filter((m) => m.id !== msg.id), msg] }
          : { data: [msg], pinned: null });
      setText("");
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
  });

  const reactM = useMutation({
    mutationFn: (v: { messageId: string; emoji: string }) => spaceChatApi.react(spaceId, v.messageId, v.emoji),
    // Optimistic: flip the chip now, patch the real count in on success.
    onMutate: ({ messageId, emoji }) => {
      qc.setQueryData<SpaceChat>(key, (prev) =>
        prev ? { ...prev, data: prev.data.map((m) => m.id === messageId ? toggleReaction(m, emoji) : m) } : prev);
    },
    onSuccess: (res, { messageId }) => {
      qc.setQueryData<SpaceChat>(key, (prev) =>
        prev ? { ...prev, data: prev.data.map((m) => m.id === messageId ? applyReaction(m, res) : m) } : prev);
    },
  });

  const canPost = !!meId;

  const send = () => {
    const body = text.trim();
    if (!body || sendM.isPending) return;
    sendM.mutate(body);
  };

  // Stable across a keystroke in the composer below (deps never include
  // `text`) - keeps FlatList's own `renderItem` reference from changing on
  // every character typed, so rows already on screen aren't asked to re-render.
  const renderMessage = useCallback(({ item }: { item: SpaceMessage }) => (
    <MessageRow
      m={item}
      onToggle={(emoji) => canPost && reactM.mutate({ messageId: item.id, emoji })}
      onAdd={() => canPost && setPicking(item.id)}
    />
  ), [canPost, reactM]);

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Pinned banner - the host's note, dismissible for this session. */}
      {pinned && !pinnedDismissed && (
        <View style={styles.pinned}>
          <Pin size={15} color={SPACE_DARK.brand} strokeWidth={2.2} />
          <View style={styles.pinnedText}>
            <Text style={styles.pinnedLabel}>Pinned by Host</Text>
            <Text style={styles.pinnedBody} numberOfLines={3}>{pinned.body}</Text>
          </View>
          <Pressable onPress={() => setPinnedDismissed(true)} hitSlop={8} accessibilityLabel="Dismiss pinned message">
            <X size={16} color={SPACE_DARK.faint} strokeWidth={2.2} />
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello 👋</Text>}
          renderItem={renderMessage}
        />
      )}

      {/* Composer */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={canPost ? "Type a message…" : "Join the space to chat"}
          placeholderTextColor={SPACE_DARK.faint}
          editable={canPost}
          multiline
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => setText((t) => t + "😊")}
          disabled={!canPost}
          hitSlop={8}
          style={styles.emojiBtn}
          accessibilityLabel="Add emoji"
        >
          <Smile size={22} color={SPACE_DARK.dim} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={send}
          disabled={!canPost || !text.trim()}
          style={[styles.sendBtn, (!canPost || !text.trim()) && styles.sendBtnOff]}
          accessibilityLabel="Send message"
        >
          <SendHorizontal size={18} color={colors.white} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Reaction picker */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.pickBackdrop} onPress={() => setPicking(null)}>
          <View style={styles.pickBar}>
            {REACTION_EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => { if (picking) reactM.mutate({ messageId: picking, emoji: e }); setPicking(null); }}
                style={({ pressed }) => [styles.pickEmoji, pressed && { transform: [{ scale: 1.25 }] }]}
              >
                <Text style={styles.pickEmojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ── one message ─────────────────────────────────────────────────────── */

const MessageRow = memo(function MessageRow({ m, onToggle, onAdd }: {
  m: SpaceMessage;
  onToggle: (emoji: string) => void;
  onAdd: () => void;
}) {
  const badge = roleBadge(m.role);
  return (
    <View style={styles.msgRow}>
      <Avatar uri={m.user.avatar} style={styles.msgAvatar} />
      <View style={styles.msgBody}>
        <View style={styles.msgHead}>
          <Text style={styles.msgName} numberOfLines={1}>{m.user.name}</Text>
          {m.user.verified && <VerifiedBadge size={12} />}
          <Text style={[styles.msgRole, { color: badge.color }]}>{badge.label}</Text>
          <Text style={styles.msgTime}>{clockTime(m.created_at)}</Text>
        </View>
        <Pressable onLongPress={onAdd} delayLongPress={220}>
          <Text style={styles.msgText}>{m.body}</Text>
        </Pressable>

        <View style={styles.reactions}>
          {m.reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onToggle(r.emoji)}
              style={[styles.chip, r.reacted && styles.chipOn]}
            >
              <Text style={styles.chipEmoji}>{r.emoji}</Text>
              <Text style={[styles.chipCount, r.reacted && styles.chipCountOn]}>{r.count}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onAdd} style={styles.chipAdd} accessibilityLabel="Add a reaction">
            <Smile size={13} color={SPACE_DARK.faint} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

/* ── helpers ─────────────────────────────────────────────────────────── */

/** ISO → "10:30 PM". */
function clockTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.replace(/([+-])(\d{2}):(\d{2})$/, "$1$2$3"));
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** Optimistically flip my reaction on a message before the server answers. */
function toggleReaction(m: SpaceMessage, emoji: string): SpaceMessage {
  const existing = m.reactions.find((r) => r.emoji === emoji);
  let reactions: SpaceMsgReaction[];
  if (existing) {
    const count = existing.count + (existing.reacted ? -1 : 1);
    reactions = count <= 0 && !existing.reacted
      ? m.reactions.filter((r) => r.emoji !== emoji)
      : m.reactions.map((r) => r.emoji === emoji ? { ...r, reacted: !r.reacted, count: Math.max(0, count) } : r);
  } else {
    reactions = [...m.reactions, { emoji, count: 1, reacted: true }];
  }
  return { ...m, reactions: reactions.filter((r) => r.count > 0) };
}

/** Reconcile a message's chip with the server's authoritative count. */
function applyReaction(m: SpaceMessage, res: SpaceMsgReaction): SpaceMessage {
  const has = m.reactions.some((r) => r.emoji === res.emoji);
  const reactions = has
    ? m.reactions.map((r) => r.emoji === res.emoji ? { ...r, count: res.count, reacted: res.reacted } : r)
    : [...m.reactions, res];
  return { ...m, reactions: reactions.filter((r) => r.count > 0) };
}

/* ── styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: SPACE_DARK.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  pinned: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    margin: spacing.md, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: SPACE_DARK.panel, borderWidth: 1, borderColor: SPACE_DARK.line,
  },
  pinnedText: { flex: 1 },
  pinnedLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: SPACE_DARK.brand, marginBottom: 2 },
  pinnedBody: { fontSize: font.sm, color: SPACE_DARK.dim, lineHeight: 18 },

  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.lg },
  empty: { textAlign: "center", marginTop: spacing.xxl, fontSize: font.sm, color: SPACE_DARK.faint },

  msgRow: { flexDirection: "row", gap: spacing.sm },
  msgAvatar: { width: 34, height: 34, borderRadius: 17, marginTop: 2 },
  msgBody: { flex: 1 },
  msgHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  msgName: { fontSize: font.sm, fontWeight: font.weightBold, color: SPACE_DARK.text, flexShrink: 1 },
  msgRole: { fontSize: 11, fontWeight: font.weightBold },
  msgTime: { fontSize: 11, color: SPACE_DARK.faint, marginLeft: "auto" },
  msgText: { marginTop: 3, fontSize: font.md, color: "rgba(255,255,255,0.90)", lineHeight: 20 },

  reactions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 7 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, height: 26, borderRadius: 13,
    backgroundColor: SPACE_DARK.glass, borderWidth: 1, borderColor: SPACE_DARK.glassLine,
  },
  chipOn: { backgroundColor: SPACE_DARK.brandSoft, borderColor: "rgba(254,44,85,0.5)" },
  chipEmoji: { fontSize: 13 },
  chipCount: { fontSize: font.xs, fontWeight: font.weightBold, color: SPACE_DARK.dim },
  chipCountOn: { color: SPACE_DARK.brand },
  chipAdd: {
    width: 28, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: SPACE_DARK.glassLine,
  },

  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: SPACE_DARK.line, backgroundColor: SPACE_DARK.bg,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.xl,
    paddingHorizontal: spacing.md, paddingVertical: Platform.OS === "ios" ? 12 : 8,
    backgroundColor: SPACE_DARK.panel, borderWidth: 1, borderColor: SPACE_DARK.line,
    color: SPACE_DARK.text, fontSize: font.md,
  },
  emojiBtn: { height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.brand,
  },
  sendBtnOff: { opacity: 0.4 },

  pickBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6,3,10,0.55)" },
  pickBar: {
    flexDirection: "row", gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.pill, backgroundColor: SPACE_DARK.panelHi,
    borderWidth: 1, borderColor: SPACE_DARK.glassLine,
  },
  pickEmoji: { padding: 4 },
  pickEmojiText: { fontSize: 28 },
});
