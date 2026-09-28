import { useState } from "react";
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Heart, MessageCircle, Send } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { Avatar as UserAvatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { studioCommentsApi, type StudioComment } from "@/api/studio-comments.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { useSavedRepliesStore } from "@/store/saved-replies.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact, relativeTime } from "@/utils/format";

/** One comment thread: the root comment, every reply under it, and the box to
 *  answer from. Opening it marks the comment seen server-side, which is why the
 *  inbox list is invalidated on close rather than on reply. */
export function CommentThreadSheet({
  comment,
  onClose,
}: {
  comment: StudioComment | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const savedReplies = useSavedRepliesStore((s) => s.replies);
  const [body, setBody] = useState("");

  const threadQ = useQuery({
    queryKey: ["studio-comment-thread", comment?.id],
    queryFn: () => studioCommentsApi.thread(comment!.id),
    enabled: !!comment,
  });

  const replyM = useMutation({
    mutationFn: (text: string) => studioCommentsApi.reply(comment!.id, text),
    onSuccess: () => {
      setBody("");
      threadQ.refetch();
      qc.invalidateQueries({ queryKey: ["studio-comments"] });
      qc.invalidateQueries({ queryKey: ["studio-comment-stats"] });
    },
    onError: (e) => Alert.alert("Couldn't reply", apiErrorMessage(e, "Please try again.")),
  });

  const send = () => {
    const text = body.trim();
    if (!text || replyM.isPending) return;
    replyM.mutate(text);
  };

  const close = () => {
    // The thread endpoint marks it seen, so the list's unread count is stale now.
    qc.invalidateQueries({ queryKey: ["studio-comments"] });
    qc.invalidateQueries({ queryKey: ["studio-comment-stats"] });
    setBody("");
    onClose();
  };

  return (
    <BottomSheet
      visible={!!comment}
      onClose={close}
      height={0.82}
      scrollable={false}
      dragArea="header"
      keyboardAvoid
      header={
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.headTitle}>Thread</Text>
            <Text style={s.headSub}>
              {comment?.reply_count ?? 0} {comment?.reply_count === 1 ? "reply" : "replies"}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={close} style={s.close}>
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    >
      {!comment ? null : (
        <View style={s.root}>
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {/* Root comment */}
            <View style={s.rootComment}>
              <Avatar uri={comment.user?.avatar} name={comment.user?.name || comment.user?.username} size={38} />
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <Text style={s.name} numberOfLines={1}>
                    {comment.user?.name || comment.user?.username || "Unknown"}
                  </Text>
                  {comment.user?.is_verified && <VerifiedBadge size={13} />}
                  <Text style={s.time}>{relativeTime(comment.created_at)}</Text>
                </View>
                {!!comment.body && <Text style={s.rootBody}>{comment.body}</Text>}
                {!!comment.gif_preview_url && (
                  <Image source={{ uri: comment.gif_preview_url }} style={s.gif} />
                )}
                <View style={s.metaRow}>
                  <Heart size={12} color={colors.textFaint} strokeWidth={2.4} />
                  <Text style={s.metaText}>{formatCompact(comment.love_count)}</Text>
                  <MessageCircle size={12} color={colors.textFaint} strokeWidth={2.4} />
                  <Text style={s.metaText}>{formatCompact(comment.reply_count)}</Text>
                  {comment.user && comment.user.followers_count > 0 && (
                    <Text style={s.metaText}>
                      · {formatCompact(comment.user.followers_count)} followers
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {!!comment.note && (
              <View style={s.note}>
                <Text style={s.noteLabel}>Your note</Text>
                <Text style={s.noteText}>{comment.note}</Text>
              </View>
            )}

            {/* Replies */}
            {threadQ.isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
            ) : (
              (threadQ.data ?? [])
                // The thread includes the root itself; it's already rendered above.
                .filter((r) => r.id !== comment.id)
                .map((r) => {
                  const mine = r.user?.id === me?.id;
                  return (
                    <View key={r.id} style={s.reply}>
                      <Avatar uri={r.user?.avatar ?? null} name={r.user?.name || r.user?.username} size={30} />
                      <View style={{ flex: 1 }}>
                        <View style={s.nameRow}>
                          <Text style={s.replyName} numberOfLines={1}>
                            {r.user?.name || r.user?.username || "Unknown"}
                          </Text>
                          {mine && (
                            <View style={s.youChip}>
                              <Text style={s.youChipText}>You</Text>
                            </View>
                          )}
                          <Text style={s.time}>{relativeTime(r.created_at)}</Text>
                        </View>
                        {!!r.body && <Text style={s.replyBody}>{r.body}</Text>}
                      </View>
                    </View>
                  );
                })
            )}

            {!threadQ.isLoading && (threadQ.data ?? []).filter((r) => r.id !== comment.id).length === 0 && (
              <Text style={s.empty}>No replies yet. You'd be the first.</Text>
            )}
          </ScrollView>

          {/* Saved replies - the canned answers written on the Comments page.
              This is the only place a reply is actually typed, so this is where
              they earn their keep: tapping one drops it into the box, still
              editable before you send. */}
          {savedReplies.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.savedScroll}
              contentContainerStyle={s.savedRow}
              keyboardShouldPersistTaps="handled"
            >
              {savedReplies.map((r) => (
                <Pressable
                  key={r.id}
                  style={s.savedChip}
                  onPress={() => setBody((b) => (b.trim() ? `${b.trimEnd()} ${r.body}` : r.body))}
                >
                  <Text style={s.savedChipText}>{r.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Reply box */}
          <View style={s.composer}>
            <Avatar uri={me?.avatar ?? null} name={me?.name || me?.username} size={30} />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Reply as the creator…"
              placeholderTextColor={colors.textFaint}
              style={s.input}
              multiline
              maxLength={1000}
            />
            <Pressable
              style={[s.send, (!body.trim() || replyM.isPending) && s.sendOff]}
              onPress={send}
              disabled={!body.trim() || replyM.isPending}
            >
              {replyM.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Send size={15} color={colors.white} strokeWidth={2.6} />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

export function Avatar({
  uri,
  size = 36,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  return <UserAvatar uri={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  headSub: { marginTop: 1, fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  root: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },

  rootComment: { flexDirection: "row", gap: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  time: { fontSize: 11, color: colors.textFaint, fontWeight: font.weightMedium },
  rootBody: { marginTop: 3, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  gif: { marginTop: spacing.sm, width: 160, height: 120, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  metaText: { fontSize: 11, color: colors.textFaint, fontWeight: font.weightMedium, marginRight: 6 },

  note: {
    backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a",
    borderRadius: radius.md, padding: spacing.md,
  },
  noteLabel: { fontSize: 10, fontWeight: font.weightHeavy, color: "#d97706", textTransform: "uppercase", letterSpacing: 0.5 },
  noteText: { marginTop: 3, fontSize: 12.5, color: "#92400e", lineHeight: 18 },

  reply: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.lg },
  replyName: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  replyBody: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  youChip: { backgroundColor: colors.brandTint, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1 },
  youChipText: { fontSize: 9, fontWeight: font.weightHeavy, color: colors.brand },

  empty: { textAlign: "center", fontSize: 12.5, color: colors.textFaint, paddingVertical: spacing.lg },

  savedScroll: { flexGrow: 0, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  savedRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6, alignItems: "center" },
  savedChip: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 30, justifyContent: "center", backgroundColor: colors.card,
  },
  savedChipText: { fontSize: 12, fontWeight: font.weightMedium, color: colors.textSecondary },

  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
  },
  input: {
    flex: 1, maxHeight: 96, minHeight: 38,
    backgroundColor: colors.bgMuted, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingTop: 9, paddingBottom: 9,
    fontSize: 14, color: colors.text,
  },
  send: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  sendOff: { backgroundColor: colors.borderStrong },

  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.white, fontWeight: font.weightBold },
});
