import { useCallback, useEffect, useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import Picker, { EmojiKeyboard, type EmojiType } from "rn-emoji-keyboard";
import { ds } from "@/theme/design";
import { useEmojiStore } from "@/store/emoji.store";
import { Emoji } from "./Emoji";

/**
 * The app's emoji picker. One component, used by every surface that offers
 * emoji - so a change to the theme, the categories or the usage tracking lands
 * everywhere at once.
 *
 * Wraps rn-emoji-keyboard rather than reimplementing it. That library is pure
 * Unicode: it ships a JSON table of characters and renders them as <Text>, with
 * no images, no sprite sheets and no network calls, which is exactly the
 * constraint this feature is built under. What it does not give us is a
 * FREQUENTLY-used row (it has recents only), so that row is ours, drawn above
 * the keyboard and fed by the same store that records every pick.
 *
 * `dark` is a prop rather than a hook because the surfaces disagree: the feed's
 * comment sheet is dark whatever the system theme is, while a settings field is
 * not. Reading a colour scheme here would make the picker fight its host.
 */
/* Module constants, not per-render objects: both the modal and the inline panel
   use them, and rebuilding an identical theme on every render would hand the
   keyboard a new object each time and defeat its own memoisation. */
const DARK_THEME = {
  backdrop: "rgba(0,0,0,0.45)",
  knob: "rgba(255,255,255,0.35)",
  container: ds.darkSheet,
  header: "rgba(255,255,255,0.72)",
  skinTonesContainer: ds.darkChrome,
  category: {
    icon: "rgba(255,255,255,0.55)",
    iconActive: ds.onDark,
    container: ds.darkChrome,
    containerActive: ds.accent,
  },
  search: {
    background: ds.darkChrome,
    text: ds.onDark,
    placeholder: "rgba(255,255,255,0.45)",
    icon: "rgba(255,255,255,0.55)",
  },
  emoji: { selected: ds.accent },
};

const LIGHT_THEME = {
  backdrop: "rgba(0,0,0,0.28)",
  knob: "rgba(0,0,0,0.25)",
  container: ds.surface,
  header: ds.textDim,
  skinTonesContainer: ds.surfaceSunken,
  category: {
    icon: ds.textDim,
    iconActive: "#FFFFFF",
    container: ds.surfaceSunken,
    containerActive: ds.accent,
  },
  search: {
    background: ds.surfaceSunken,
    text: ds.text,
    placeholder: ds.textDim,
    icon: ds.textDim,
  },
  emoji: { selected: ds.accent },
};

export function EmojiPicker({
  open,
  onClose,
  onPick,
  dark = true,
  closeOnPick = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the plain Unicode string, already tone-applied by the keyboard. */
  onPick: (emoji: string) => void;
  dark?: boolean;
  /** Single-insert surfaces (a name field) close on pick; composers stay open
   *  so several can be chosen in a row. */
  closeOnPick?: boolean;
}) {
  const hydrate = useEmojiStore((s) => s.hydrate);
  const track = useEmojiStore((s) => s.track);
  const usage = useEmojiStore((s) => s.usage);

  // Cheap and idempotent; the store returns immediately once hydrated.
  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  const frequent = useMemo(
    () =>
      Object.keys(usage)
        .sort((a, b) => usage[b].count - usage[a].count || usage[b].lastUsed - usage[a].lastUsed)
        .slice(0, 12),
    [usage],
  );

  const handle = useCallback(
    (e: EmojiType) => {
      track(e.emoji);
      onPick(e.emoji);
      if (closeOnPick) onClose();
    },
    [track, onPick, closeOnPick, onClose],
  );

  const pickFrequent = useCallback(
    (emoji: string) => {
      track(emoji);
      onPick(emoji);
      if (closeOnPick) onClose();
    },
    [track, onPick, closeOnPick, onClose],
  );

  const theme = dark ? DARK_THEME : LIGHT_THEME;

  return (
    <Picker
      open={open}
      onClose={onClose}
      onEmojiSelected={handle}
      // Every category the brief asks for. The library's own order already runs
      // smileys → people → animals → food → travel → activities → objects →
      // symbols → flags, so none is disabled and none is reordered.
      enableSearchBar
      enableRecentlyUsed
      categoryPosition="top"
      enableCategoryChangeAnimation
      enableCategoryChangeGesture
      // Keeps the sheet open across several picks; the host decides when to
      // close via closeOnPick.
      allowMultipleSelections={!closeOnPick}
      emojiSize={30}
      expandable
      theme={theme}
      styles={{ container: { borderTopLeftRadius: 18, borderTopRightRadius: 18 } }}
      // Drawn above the keyboard grid. Recently-used is the library's own row;
      // this is the one it does not have.
      customButtons={
        frequent.length > 0 ? (
          <View style={styles.freqWrap}>
            <Text style={[styles.freqLabel, { color: dark ? "rgba(255,255,255,0.55)" : ds.textDim }]}>
              Frequently used
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.freqRow}
              keyboardShouldPersistTaps="handled"
            >
              {frequent.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => pickFrequent(e)}
                  hitSlop={6}
                  style={styles.freqItem}
                  accessibilityRole="button"
                >
                  <Emoji emoji={e} size={26} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null
      }
    />
  );
}

/**
 * The same keyboard, INLINE rather than as a modal sheet.
 *
 * Use this wherever the host already owns the bottom of the screen - a comment
 * composer, a chat input. The modal EmojiPicker above presents over everything,
 * which is right for a one-off insert into a name field but wrong above a
 * composer: it covers the very input the emoji is going into, so the user
 * cannot see what they are building.
 *
 * Rendered into a fixed-height box by the host, standing in for the keyboard it
 * replaced, so nothing overlaps and the layout above simply gives up the space
 * it would have given the keyboard anyway.
 */
export function EmojiPanel({
  onPick,
  onBackspace,
  onClose,
  dark = true,
}: {
  onPick: (emoji: string) => void;
  /** Delete the character before the caret. Omitted, no backspace is drawn. */
  onBackspace?: () => void;
  /** Dismiss the panel. Omitted, no close button is drawn. */
  onClose?: () => void;
  dark?: boolean;
}) {
  const hydrate = useEmojiStore((s) => s.hydrate);
  const track = useEmojiStore((s) => s.track);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handle = useCallback(
    (e: EmojiType) => {
      track(e.emoji);
      onPick(e.emoji);
    },
    [track, onPick],
  );

  const theme = useMemo(
    () => (dark ? DARK_THEME : LIGHT_THEME),
    [dark],
  );

  return (
    <EmojiKeyboard
      onEmojiSelected={handle}
      enableSearchBar
      enableRecentlyUsed
      categoryPosition="top"
      enableCategoryChangeAnimation
      enableCategoryChangeGesture
      // Inline, so it must never try to own the safe area or close itself - the
      // host decides when the panel goes away.
      disableSafeArea
      allowMultipleSelections
      emojiSize={30}
      theme={theme}
      // Fills the box the host gave it, rather than the library's own default
      // sheet height, which would leave a gap or overflow.
      styles={{ container: { height: "100%", borderRadius: 0 } }}
      /* customButtons renders INSIDE the library's search row, which is a
         flexDirection:"row" container - so this lands directly beside the
         search box, which is where a backspace belongs. Without one there is no
         way to undo a pick from inside the panel: the text field is visible but
         not focused, so the OS keyboard's own backspace is not on screen. */
      customButtons={
        onBackspace || onClose ? (
          <View style={styles.toolRow}>
            {!!onBackspace && (
              <Pressable
                onPress={onBackspace}
                // Holding it clears a run of emoji, the way a real backspace does.
                onLongPress={onBackspace}
                delayLongPress={400}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Delete"
                style={[
                  styles.panelBtn,
                  { backgroundColor: dark ? ds.darkChrome : ds.surfaceSunken },
                ]}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9.2 5.5h9.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2a2 2 0 0 1-1.5-.68l-4-4.5a2 2 0 0 1 0-2.64l4-4.5a2 2 0 0 1 1.5-.68Z"
                    stroke={dark ? ds.onDark : ds.text}
                    strokeWidth={1.7}
                    strokeLinejoin="round"
                  />
                  <Path
                    d="m12.2 10 4.2 4.2m0-4.2-4.2 4.2"
                    stroke={dark ? ds.onDark : ds.text}
                    strokeWidth={1.7}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
            )}

            {/* Explicit dismiss. Tapping the list above also closes the panel,
                but that is an invisible affordance - a visible control is the
                one people find without being told. */}
            {!!onClose && (
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close emoji panel"
                style={[
                  styles.panelBtn,
                  { backgroundColor: dark ? ds.darkChrome : ds.surfaceSunken },
                ]}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="m18 6-12 12M6 6l12 12"
                    stroke={dark ? ds.onDark : ds.text}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
            )}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  freqWrap: { width: "100%", paddingTop: 6, paddingBottom: 2 },
  freqLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, paddingHorizontal: 14, marginBottom: 4 },
  freqRow: { paddingHorizontal: 10, gap: 6 },
  freqItem: { paddingHorizontal: 4, paddingVertical: 2 },
  toolRow: { flexDirection: "row", alignItems: "center" },
  // Matches the search bar's own height so they sit level in their row.
  panelBtn: {
    width: 44,
    height: 40,
    borderRadius: 10,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
