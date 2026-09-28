import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Info } from "lucide-react-native";

import { colors } from "@/constants/colors";
import { lookupKnowledge, type KnowledgeArticle } from "@/api/knowledge.api";

/**
 * The Wikipedia info card, shown above search results and on hashtag, location
 * and video surfaces.
 *
 * Same three rules as the web card:
 *  - It loads on its own and nothing waits for it. In the feed in particular it
 *    must never touch video playback.
 *  - It renders nothing when there is no article, which is the common case.
 *  - It never shows an error. A failed lookup and "no article" look identical.
 */

type Variant = "default" | "compact" | "inline";

interface Props {
  /** Topic to look up. Falsy or under three characters skips the request. */
  query?: string | null;
  variant?: Variant;
  /** Extra context line, e.g. the country on a location screen. */
  subtitle?: string;
  /** Renders on a dark surface (the video feed) rather than a light one. */
  dark?: boolean;
  /**
   * Applied to the card's own root, never to a wrapper. Spacing has to live on
   * the element that disappears: a wrapping View with marginBottom still
   * occupies that margin when the card renders null, which would leave a gap
   * on every non-topic query - and most queries are non-topic.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Debounce lives inside the hook, not the caller: the search screen updates its
 * query on every keystroke, and keeping the delay here means no screen can
 * reintroduce a request-per-character by forgetting to debounce.
 */
function useKnowledge(query?: string | null) {
  const [article, setArticle] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query?.trim();
    if (!q || q.length < 3) {
      setArticle(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    const timer = setTimeout(() => {
      lookupKnowledge(q, controller.signal)
        .then((result) => {
          if (!active) return;
          setArticle(result.found && result.article ? result.article : null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { article, loading };
}

function openArticle(url: string) {
  // Fire-and-forget: a device with no browser handler is not worth an alert
  // over, and Linking rejects rather than throwing synchronously.
  Linking.openURL(url).catch(() => {});
}

export function KnowledgeCard({ query, variant = "default", subtitle, dark, style }: Props) {
  const { article, loading } = useKnowledge(query);

  const palette = dark
    ? {
        card: "rgba(255,255,255,0.08)",
        border: "rgba(255,255,255,0.14)",
        title: colors.feedText,
        body: "rgba(255,255,255,0.78)",
        muted: "rgba(255,255,255,0.6)",
      }
    : {
        card: colors.card,
        border: colors.border,
        title: colors.text,
        body: colors.textSecondary,
        muted: colors.textMuted,
      };

  if (loading) {
    // A skeleton the same height as the real card, so nothing below it jumps
    // when the article arrives.
    if (variant === "inline") {
      return (
        <View style={[styles.inlineLoading, style]}>
          <ActivityIndicator size="small" color={palette.muted} />
        </View>
      );
    }
    return (
      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }, style]}>
        <View style={[styles.thumbSkeleton, { backgroundColor: palette.border }]} />
        <View style={styles.flex}>
          <View style={[styles.lineSkeleton, { backgroundColor: palette.border, width: "40%" }]} />
          <View style={[styles.lineSkeleton, { backgroundColor: palette.border, width: "100%" }]} />
          <View style={[styles.lineSkeleton, { backgroundColor: palette.border, width: "75%" }]} />
        </View>
      </View>
    );
  }

  if (!article) return null;

  if (variant === "inline") {
    return <InlineKnowledge article={article} palette={palette} style={style} />;
  }

  const compact = variant === "compact";

  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }, style]}>
      {article.thumbnail ? (
        <Pressable onPress={() => openArticle(article.article_url)}>
          <Image
            source={{ uri: article.thumbnail }}
            style={[styles.thumb, compact && styles.thumbCompact]}
            // Wikimedia already serves these pre-sized from their CDN, so the
            // app fetches the thumbnail directly and nothing passes through
            // Reelsoo's own bandwidth.
            resizeMode="cover"
          />
        </Pressable>
      ) : null}

      <View style={styles.flex}>
        <View style={styles.badgeRow}>
          <BookOpen size={13} color={palette.muted} />
          <Text style={[styles.badgeText, { color: palette.muted }]}>Wikipedia</Text>
        </View>

        <Text style={[styles.title, { color: palette.title }]} numberOfLines={1}>
          {article.title}
        </Text>

        {subtitle ? (
          <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        <Text
          style={[styles.summary, { color: palette.body }]}
          numberOfLines={compact ? 2 : 3}
        >
          {article.summary}
        </Text>

        <Pressable
          onPress={() => openArticle(article.article_url)}
          hitSlop={8}
          style={styles.readMoreRow}
        >
          <Text style={styles.readMore}>Read More</Text>
          <ExternalLink size={13} color={colors.brand} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The feed variant: one quiet line that expands on tap. Collapsed by default so
 * it never covers the video or competes with the caption.
 */
function InlineKnowledge({
  article,
  palette,
  style,
}: {
  article: KnowledgeArticle;
  palette: { card: string; border: string; title: string; body: string; muted: string };
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={style}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.inlineTrigger}
      >
        <Info size={13} color={palette.muted} />
        <Text style={[styles.inlineTriggerText, { color: palette.muted }]} numberOfLines={1}>
          Learn about {article.title}
        </Text>
        {open ? (
          <ChevronUp size={13} color={palette.muted} />
        ) : (
          <ChevronDown size={13} color={palette.muted} />
        )}
      </Pressable>

      {open ? (
        <View
          style={[
            styles.inlineBody,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.inlineSummary, { color: palette.body }]} numberOfLines={5}>
            {article.summary}
          </Text>
          <Pressable
            onPress={() => openArticle(article.article_url)}
            hitSlop={8}
            style={styles.readMoreRow}
          >
            <Text style={styles.readMore}>Read full article</Text>
            <ExternalLink size={12} color={colors.brand} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  flex: { flex: 1, minWidth: 0 },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  thumbCompact: { width: 54, height: 54 },
  thumbSkeleton: { width: 72, height: 72, borderRadius: 10, opacity: 0.6 },
  lineSkeleton: { height: 10, borderRadius: 5, marginBottom: 7, opacity: 0.6 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 1 },
  summary: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  readMoreRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  readMore: { fontSize: 13, fontWeight: "600", color: colors.brand },
  inlineLoading: { paddingVertical: 6, alignItems: "flex-start" },
  inlineTrigger: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  inlineTriggerText: { fontSize: 13, flexShrink: 1 },
  inlineBody: { marginTop: 6, borderWidth: 1, borderRadius: 10, padding: 10 },
  inlineSummary: { fontSize: 13, lineHeight: 18 },
});
