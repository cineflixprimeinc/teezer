import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Mic, MicOff, LogOut } from "lucide-react-native";
import { useSpaceMiniStore } from "@/store/space-mini.store";
import { spaceRoomApi } from "@/api/spaces.api";
import { font, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { useElapsedClock } from "@/hooks/useElapsedClock";

/**
 * The minimised Space, docked above the bottom nav.
 *
 * Layout follows the room's rule that nothing may overlap: a fixed pulse dot,
 * a flexible title/meta column that truncates, then two fixed 40px squares.
 * The title column is the only elastic zone, so a long room name shortens
 * itself instead of pushing the mic and leave buttons off their track.
 */
export function SpaceMiniBar({ bottom }: { bottom: number }) {
  const navigation = useNavigation<any>();
  const space = useSpaceMiniStore((s) => s.space);
  const patch = useSpaceMiniStore((s) => s.patch);
  const clear = useSpaceMiniStore((s) => s.clear);
  const elapsed = useElapsedClock(space?.startedAt ?? null);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!space) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [space, pulse]);

  if (!space) return null;

  const leave = () => {
    // Clear first so the bar disappears immediately. The leave call is
    // fire-and-forget: a failed request must not strand a bar for a room the
    // user has already decided to leave, and the server drops the seat on
    // disconnect anyway.
    clear();
    spaceRoomApi.leave(space.id).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { bottom }]}>
      <Pressable
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.92 }]}
        onPress={() => navigation.navigate("SpaceRoom", { id: space.id })}
        accessibilityRole="button"
        accessibilityLabel={`Reopen ${space.title}`}
      >
        <Animated.View style={[styles.dot, { opacity: pulse }]} />

        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{space.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatCompact(space.listening)} listening{elapsed ? ` · ${elapsed}` : ""}
          </Text>
        </View>

        {space.canSpeak && (
          <Pressable
            onPress={() => patch({ muted: !space.muted })}
            style={styles.square}
            hitSlop={6}
            accessibilityLabel={space.muted ? "Unmute" : "Mute"}
          >
            {space.muted
              ? <MicOff size={17} color="rgba(255,255,255,0.65)" strokeWidth={2.1} />
              : <Mic size={17} color="#fff" strokeWidth={2.1} />}
          </Pressable>
        )}

        <Pressable onPress={leave} style={[styles.square, styles.leave]} hitSlop={6} accessibilityLabel="Leave space">
          <LogOut size={17} color="#fff" strokeWidth={2.1} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, paddingHorizontal: spacing.md, zIndex: 30 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: "#16161a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
  },
  dot: { flex: 0, width: 7, height: 7, borderRadius: 4, backgroundColor: "#f5194e" },
  // The only elastic zone. min-width 0 is what actually lets the labels
  // ellipsis instead of forcing the row wider than the bar.
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: font.weightHeavy, color: "#fff", letterSpacing: -0.15 },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },
  square: {
    flex: 0,
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1c1c21",
  },
  leave: { backgroundColor: "#f5194e" },
});
