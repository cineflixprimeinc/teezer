import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { ds } from "@/theme/design";

/** Line-art character with a speech bubble and a paper plane - "waiting to hear back". */
const ILLUSTRATION = require("../../assets/messagerequestemptystate.png");

/**
 * Avatar colours for accounts with no photo.
 *
 * The shared <Avatar> deliberately gives everyone ONE neutral silhouette rather
 * than a per-user initial, and that stays true everywhere else. Here the design
 * asks for the contact's own colour and initials, because this block is about
 * one specific person you have not spoken to yet - a grey silhouette would say
 * nothing about who the request is going to.
 */
const AVATAR_COLORS = ["#E4572E", "#3D5A80", "#2E7D5B", "#5B48C8", "#C2477F", "#B0741B", "#1F7A5A"];

/** Stable per-account colour: the same handle always gets the same swatch. */
function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface MessageRequestEmptyProps {
  username: string;
  name?: string | null;
  avatar?: string | null;
}

/**
 * The first-contact card on a message request that has no history yet.
 *
 * Rendered inside the thread's scrollable area, and only while the thread is
 * empty - the moment either side has a message the normal list takes over, so
 * this never sits above real conversation.
 */
export function MessageRequestEmpty({ username, name, avatar }: MessageRequestEmptyProps) {
  const display = name || username;
  const initial = (display || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <View style={styles.wrap}>
      <View style={[styles.avatar, { backgroundColor: colorFor(username || display) }]}>
        {avatar ? (
          <Image source={avatar} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.avatarInitial}>{initial}</Text>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {display}
      </Text>

      <View style={styles.pill}>
        <Text style={styles.pillText}>MESSAGE REQUEST</Text>
      </View>

      <Text style={styles.body}>
        You don&apos;t follow each other, so this went to their requests. They won&apos;t see your
        name or replies until they accept.
      </Text>

      <Image
        source={ILLUSTRATION}
        style={styles.art}
        contentFit="contain"
        accessibilityLabel="Waiting to hear back"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", maxWidth: 250, alignItems: "center", paddingTop: 18 },

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // Subtle lift, not a card shadow.
    shadowColor: "#0A090C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: ds.onDark, fontSize: 26, fontWeight: "800", fontStyle: "italic" },

  name: { marginTop: 12, fontSize: 16, fontWeight: "700", color: ds.text, textAlign: "center" },

  pill: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: ds.surfaceSunken,
  },
  pillText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: ds.textMuted },

  body: {
    marginTop: 12,
    fontSize: 12.5,
    lineHeight: 20, // 12.5 × 1.6
    color: ds.textMuted,
    textAlign: "center",
  },

  /** Square source (1024×1024), so the height matches the design's ~168px width. */
  art: { width: 168, height: 168, marginTop: 18 },
});
