import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput,
  View, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { ds, radius } from "@/theme/design";
import { klipyApi, type Gif } from "@/api/klipy.api";
import { useAuthStore } from "@/store/auth.store";

/**
 * The comment composer's GIF picker, powered by Klipy.
 *
 * Trending until something is typed, then search - both debounced, because the
 * endpoint is a real request per keystroke otherwise.
 *
 * Two columns of previews rather than full-size GIFs: the grid animates every
 * tile at once, and the small variant is roughly a tenth of the bytes. The
 * full-size URL only travels when one is actually chosen.
 */

function SearchGlyph({ c = ds.textMuted }: { c?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={c} strokeWidth={2.4} />
      <Path d="M15.6 15.6L21 21" stroke={c} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function CloseGlyph({ c = ds.text }: { c?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={c} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function GifPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (gif: Gif) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);

  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");

  /** Stable per viewer - Klipy uses it to de-duplicate, so it must not be
   *  regenerated per call. Guests share one bucket, which is fine. */
  const customerId = useMemo(() => (me?.id ? `teezer-${me.id}` : "teezer-guest"), [me?.id]);

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  // Reset between openings, so it never reopens on the last search.
  useEffect(() => { if (!visible) { setRaw(""); setQ(""); } }, [visible]);

  const gifs = useQuery({
    queryKey: ["klipy", q, customerId],
    queryFn: () => (q.length >= 2 ? klipyApi.search(q, customerId) : klipyApi.trending(customerId)),
    enabled: visible,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const gap = 8;
  const pad = 14;
  const cell = (width - pad * 2 - gap) / 2;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close GIF picker" />

        <View style={[styles.sheet, { height: Math.min(560, height * 0.72), paddingBottom: insets.bottom }]}>
          <View style={styles.head}>
            <Text style={styles.title}>GIFs</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <CloseGlyph />
            </Pressable>
          </View>

          <View style={styles.field}>
            <SearchGlyph />
            <TextInput
              value={raw}
              onChangeText={setRaw}
              placeholder="Search GIFs"
              placeholderTextColor={ds.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {raw.length > 0 && (
              <Pressable onPress={() => setRaw("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
                <CloseGlyph c={ds.textMuted} />
              </Pressable>
            )}
          </View>

          {gifs.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={ds.accent} /></View>
          ) : gifs.isError ? (
            <View style={styles.center}>
              <Text style={styles.blankTitle}>GIFs are unavailable</Text>
              <Text style={styles.blankBody}>This is temporary. Try again in a moment.</Text>
            </View>
          ) : (gifs.data?.length ?? 0) === 0 ? (
            <View style={styles.center}>
              <Text style={styles.blankTitle}>{q ? `No GIFs for “${q}”` : "No GIFs right now"}</Text>
              <Text style={styles.blankBody}>Try a different word.</Text>
            </View>
          ) : (
            <FlatList
              data={gifs.data ?? []}
              keyExtractor={(g) => g.id}
              numColumns={2}
              columnWrapperStyle={{ gap }}
              contentContainerStyle={{ padding: pad, gap }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // Tiles are animated images; keeping the window tight stops a long
              // scroll from holding dozens of them decoded at once.
              initialNumToRender={8}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item }) => {
                const ratio = item.width && item.height ? item.height / item.width : 1;
                return (
                  <Pressable
                    onPress={() => onPick(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.title || "GIF"}
                    style={({ pressed }) => [styles.tile, { width: cell, height: cell * Math.min(1.6, Math.max(0.6, ratio)) }, pressed && styles.pressed]}
                  >
                    <Image
                      source={{ uri: item.previewUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={120}
                    />
                  </Pressable>
                );
              }}
            />
          )}

          <Text style={styles.credit}>Powered by KLIPY</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Transparent, matching the comments sheet this opens from - that sheet
  // deliberately does not dim the video behind it, and a picker opened out of
  // it must not either. The full-bleed Pressable below still closes on a tap
  // outside; it just does not paint.
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  sheet: {
    backgroundColor: ds.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "700", color: ds.text },
  field: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 14, paddingHorizontal: 12, height: 38,
    borderRadius: 10, backgroundColor: "#F1EFF3",
  },
  input: { flex: 1, minWidth: 0, fontSize: 14, color: ds.text, padding: 0 },
  tile: { borderRadius: 10, overflow: "hidden", backgroundColor: "#E7E4EA" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 30 },
  blankTitle: { fontSize: 15, fontWeight: "700", color: ds.text, textAlign: "center" },
  blankBody: { fontSize: 13, color: ds.textMuted, textAlign: "center" },
  credit: { fontSize: 10, color: ds.textMuted, textAlign: "center", paddingVertical: 6, letterSpacing: 0.5 },
  pressed: { opacity: 0.75 },
});
