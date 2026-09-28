import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { STORY_REACTION_EMOJI } from "@/api/story.api";

/**
 * The Story-preview card shown inside a chat bubble for a `story_reply` or
 * `story_reaction` message - the one place both message types actually need
 * to look like "the Story that was interacted with" rather than a generic
 * image bubble. One component, not duplicated across ChatScreen and any
 * future surface that needs the same card.
 *
 * Deliberately similar in shape to the website's own StoryReplyBubble
 * (frontend/src/features/messages/messages-page.tsx) - same "Story" tag
 * placement, same graceful fallback when the thumbnail is missing/broken -
 * so the two clients read as the same feature, not two different ones.
 */
export function StoryContextPreview({
  thumbnailUrl,
  kind,
  body,
  mine,
  onPress,
  onLongPress,
}: {
  thumbnailUrl: string | null;
  kind: "story_reply" | "story_reaction";
  /** The reply text (story_reply) or the reaction_type key e.g. "heart"
   *  (story_reaction) - resolved to an emoji here via STORY_REACTION_EMOJI. */
  body: string | null;
  mine: boolean;
  onPress: () => void;
  onLongPress?: (e: import("react-native").GestureResponderEvent) => void;
}) {
  const hasThumb = !!thumbnailUrl;
  const caption =
    kind === "story_reaction"
      ? `${STORY_REACTION_EMOJI[body ?? ""] ?? "❤️"} Reacted to your Story`
      : body || "Replied to story";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 300 : undefined}
      style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}
      accessibilityRole="button"
      accessibilityLabel={hasThumb ? "Open story" : "Story is no longer available"}
    >
      <View style={styles.thumbWrap}>
        {hasThumb ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbFill} contentFit="cover" transition={120} />
        ) : (
          <View style={[styles.thumbFill, styles.thumbUnavailable]}>
            <Text style={styles.thumbUnavailableText}>Story unavailable</Text>
          </View>
        )}
        <View style={styles.storyTag}>
          <Text style={styles.storyTagText}>STORY</Text>
        </View>
      </View>

      {kind === "story_reply" ? (
        <Text style={[styles.caption, mine ? styles.captionMine : styles.captionTheirs]} numberOfLines={3}>
          {caption}
        </Text>
      ) : (
        <Text style={[styles.caption, mine ? styles.captionMine : styles.captionTheirs]} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </Pressable>
  );
}

const CARD_WIDTH = 168;

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, borderRadius: 18, overflow: "hidden" },
  cardMine: { borderBottomRightRadius: 6 },
  cardTheirs: { borderBottomLeftRadius: 6 },

  thumbWrap: { width: "100%", height: 140, backgroundColor: "#0A090C" },
  thumbFill: { width: "100%", height: "100%" },
  thumbUnavailable: { alignItems: "center", justifyContent: "center", backgroundColor: "#1A1720" },
  thumbUnavailableText: { fontSize: 11.5, fontWeight: "600", color: "rgba(255,255,255,.6)" },
  storyTag: {
    position: "absolute", left: 8, top: 8,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,.45)",
  },
  storyTagText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.4 },

  caption: { paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, lineHeight: 17 },
  captionMine: { backgroundColor: "#F42B5B", color: "#fff" },
  captionTheirs: { backgroundColor: "#F1EEF2", color: "#121014" },
});
