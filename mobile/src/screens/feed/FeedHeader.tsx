import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import LottieView from "lottie-react-native";
import { ds } from "@/theme/design";
import { useUploadStore } from "@/store/upload.store";
import type { FeedTabKey } from "@/api/feed.api";

/**
 * The feed's header row (Live glyph / tab labels / Search glyph) -
 * extracted from HomeScreen.tsx (byte-identical rendering, not a redesign)
 * so its layout stays in one place regardless of what else reads it.
 */

/** The "country" entry's label is resolved at render time by the caller
 *  (HomeScreen's own query) - this placeholder is never shown. */
export const TABS: { label: string; key: FeedTabKey }[] = [
  { label: "", key: "country" },
  { label: "Following", key: "following" },
  { label: "For You", key: "for-you" },
];

/** Swipe order, and it must stay the header's order - the gesture moves one
 *  step along this list, so the two disagreeing would send a swipe somewhere
 *  the labels say it shouldn't go. */
export const TAB_KEYS = TABS.map((t) => t.key);

/**
 * The exact user-supplied glyph (mobile/src/assets/feddliveiconS.svg,
 * replacing the earlier feddliveicon.svg version) - a camera-body
 * silhouette with a small "LIVE" badge plate on it. Rendered via SvgXml
 * from the file's own raw markup (verbatim - defs/clipPaths/nested
 * transforms for the four LIVE letters, not hand-transcribed) rather than
 * decomposed into individual react-native-svg components, since a manual
 * port of this many nested groups/clip-paths is exactly the kind of thing
 * that quietly drops a letter or breaks a transform.
 *
 * The source uses exactly two colors, always paired opposite each other
 * for contrast: the body + the LIVE lettering (#000000 in the file), and
 * the plate they sit on (#ffffff). `main`/`plate` swap both at once via a
 * plain string replace - never one without the other, or the plate and
 * its text collapse into the same color and the badge disappears.
 * Defaults here are the header's own white-on-dark-plate, for its dark
 * background - the opposite of the file's own black-on-white defaults,
 * which the website's sidebar (light background) uses unchanged.
 */
const LIVE_ICON_XML =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 810 809.999993" version="1.0"><defs><clipPath id="b8e05610f7"><path d="M 63 26 L 747.78125 26 L 747.78125 810 L 63 810 Z M 63 26 " clip-rule="nonzero"/></clipPath><clipPath id="94b483f762"><path d="M 268.855469 290.34375 L 573.753906 290.34375 L 573.753906 595.246094 L 268.855469 595.246094 Z M 268.855469 290.34375 " clip-rule="nonzero"/></clipPath><clipPath id="ec70e3c6a4"><path d="M 0.855469 0.34375 L 305.753906 0.34375 L 305.753906 305.246094 L 0.855469 305.246094 Z M 0.855469 0.34375 " clip-rule="nonzero"/></clipPath><clipPath id="0e660409d0"><rect x="0" width="306" y="0" height="306"/></clipPath><clipPath id="6df88cd508"><rect x="0" width="426" y="0" height="182"/></clipPath></defs><g clip-path="url(#b8e05610f7)"><path fill="#000000" d="M 183.65625 150.644531 L 326.804688 150.644531 L 246.160156 70.019531 C 236.078125 59.941406 236.078125 43.816406 246.160156 33.738281 C 256.238281 23.660156 272.367188 23.660156 282.449219 33.738281 L 394.953125 146.207031 C 401 152.253906 411.886719 152.253906 417.9375 146.207031 L 530.4375 33.738281 C 540.519531 23.660156 556.648438 23.660156 566.730469 33.738281 C 576.8125 43.816406 576.8125 59.941406 566.730469 70.019531 L 486.082031 150.644531 L 626.007812 150.644531 C 692.539062 150.644531 747.378906 205.066406 747.378906 271.984375 L 747.378906 623.507812 C 747.378906 666.238281 724.394531 705.746094 688.507812 727.511719 L 688.507812 789.191406 C 688.507812 803.300781 677.21875 814.992188 663.105469 814.992188 C 648.992188 814.992188 637.699219 803.300781 637.699219 789.191406 L 637.699219 744.042969 C 637.699219 744.042969 311.484375 744.445312 174.382812 744.042969 L 174.382812 788.789062 C 174.382812 802.898438 163.09375 814.589844 148.980469 814.589844 C 134.867188 814.589844 123.574219 802.898438 123.574219 788.789062 L 123.574219 727.917969 C 86.476562 706.550781 63.089844 666.238281 63.089844 623.105469 L 63.089844 271.582031 C 63.089844 205.066406 117.527344 150.238281 184.464844 150.238281 Z M 363.097656 554.574219 C 363.097656 568.683594 351.804688 580.375 337.691406 580.375 C 323.578125 580.375 311.886719 569.085938 311.886719 554.976562 C 311.484375 519.90625 311.886719 461.453125 311.886719 412.269531 L 311.886719 362.6875 C 311.886719 342.933594 323.175781 326.40625 341.726562 319.148438 C 358.660156 312.296875 380.839844 313.910156 395.757812 324.792969 L 519.957031 414.6875 C 532.050781 423.15625 539.714844 436.457031 539.3125 451.375 C 539.3125 466.691406 531.246094 479.59375 518.746094 487.65625 L 423.984375 550.945312 C 412.292969 558.605469 396.160156 555.378906 388.5 543.6875 C 380.839844 532 384.066406 515.875 395.757812 508.214844 L 482.050781 450.566406 L 363.097656 365.105469 C 363.097656 365.105469 362.695312 535.625 363.097656 554.574219 Z M 626.007812 201.839844 L 183.65625 201.839844 C 145.351562 201.839844 113.898438 233.285156 113.898438 271.582031 L 113.898438 623.105469 C 113.898438 661.402344 145.351562 692.84375 183.65625 692.84375 L 626.007812 692.84375 C 664.3125 692.84375 695.765625 661.402344 695.765625 623.105469 L 695.765625 271.582031 C 695.765625 233.285156 664.3125 201.839844 626.007812 201.839844 Z M 626.007812 201.839844 " fill-opacity="1" fill-rule="nonzero"/></g><g clip-path="url(#94b483f762)"><g transform="matrix(1, 0, 0, 1, 268, 290)"><g clip-path="url(#0e660409d0)"><g clip-path="url(#ec70e3c6a4)"><path fill="#ffffff" d="M 0.855469 0.34375 L 305.753906 0.34375 L 305.753906 305.246094 L 0.855469 305.246094 Z M 0.855469 0.34375 " fill-opacity="1" fill-rule="nonzero"/></g></g></g></g><g transform="matrix(1, 0, 0, 1, 192, 356)"><g clip-path="url(#6df88cd508)"><g fill="#000000" fill-opacity="1"><g transform="translate(1.032738, 146.255969)"><g><path d="M 12.28125 -114.109375 L 48.921875 -114.109375 L 48.921875 -29.1875 L 107.484375 -29.1875 L 107.484375 0 L 12.28125 0 Z M 12.28125 -114.109375 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(111.657222, 146.255969)"><g><path d="M 13.9375 0 L 13.9375 -114.109375 L 50.59375 -114.109375 L 50.59375 0 Z M 13.9375 0 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(176.174328, 146.255969)"><g><path d="M 43.296875 0 L 2.8125 -114.109375 L 41.96875 -114.109375 L 64.84375 -37.8125 L 65.515625 -37.8125 L 88.5625 -114.109375 L 126.046875 -114.109375 L 85.75 0 Z M 43.296875 0 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(305.208578, 146.255969)"><g><path d="M 12.28125 -114.109375 L 110.953125 -114.109375 L 110.953125 -86.75 L 48.921875 -86.75 L 48.921875 -70.984375 L 102 -70.984375 L 102 -44.78125 L 48.921875 -44.78125 L 48.921875 -27.359375 L 112.125 -27.359375 L 112.125 0 L 12.28125 0 Z M 12.28125 -114.109375 "/></g></g></g></g></g></svg>';

/** The user's own asset, used exactly as provided - not moved or renamed. */
const UPLOAD_ANIMATION = require("../../assets/reelsoo-upload-animation.json");

/*
 * The animation is authored in two acts, and playing it end to end on a loop
 * would fire the celebration every 3.5 seconds whether or not anything had
 * finished. So it is driven as two segments instead:
 *
 *   0  -> 149   orbit / halo / progress ring - loops while bytes are moving
 *   150 -> 210  successCircle, check, conf0-7 - plays once, then the Live
 *               glyph comes back
 *
 * 149 is the last frame before `successCircle` enters at 150; `halo0`/`halo1`
 * leave at 152 and `arrowBadge` at 170, which is what makes the back half read
 * as a completion rather than more waiting.
 */
const UPLOAD_LOOP_IN = 0;
const UPLOAD_LOOP_OUT = 149;
const UPLOAD_SUCCESS_IN = 150;
const UPLOAD_SUCCESS_OUT = 210;

/**
 * Stands in for the Live glyph while one of the user's own posts is uploading.
 *
 * Publishing happens in the background now (see upload.store.ts), so this is
 * the only place the app says the work is still going on. It deliberately
 * occupies the Live button's exact slot rather than adding a row: the header is
 * a fixed three-part layout, and anything inserted into it would shift the tab
 * labels off centre for the duration.
 */
function PublishingGlyph({
  status,
  percent,
  onDone,
}: {
  status: "uploading" | "success";
  percent: number;
  onDone: () => void;
}) {
  const anim = useRef<LottieView>(null);

  useEffect(() => {
    if (status === "uploading") anim.current?.play(UPLOAD_LOOP_IN, UPLOAD_LOOP_OUT);
    else anim.current?.play(UPLOAD_SUCCESS_IN, UPLOAD_SUCCESS_OUT);
  }, [status]);

  return (
    // The slot keeps the Live glyph's exact 32pt footprint so the tab labels
    // never shift when this swaps in; the animation itself is drawn larger and
    // absolutely positioned, overflowing that slot evenly on all four sides.
    <View style={styles.publishingSlot}>
      <LottieView
        ref={anim}
        source={UPLOAD_ANIMATION}
        // Only the first segment repeats. The success burst has to be allowed to
        // end, or onAnimationFinish never fires and the Live glyph never returns.
        loop={status === "uploading"}
        autoPlay={false}
        resizeMode="contain"
        style={styles.publishing}
        onAnimationFinish={() => { if (status === "success") onDone(); }}
      />
      {/* Sits inside the animation's progress ring. Declared after the Lottie
          so it paints over it. Hidden once the upload lands - the number is
          100 by then and the animation's own check mark says it better.
          Note this tracks the file transfer only; it can sit at 100% for a
          moment while /complete-upload finishes, which is honest - the bytes
          really are up. */}
      {status === "uploading" && (
        <Text style={styles.publishingPct} numberOfLines={1}>{percent}%</Text>
      )}
    </View>
  );
}

function LiveGlyph({ main = ds.onDark, plate = "#000000" }: { main?: string; plate?: string }) {
  const xml = LIVE_ICON_XML.replace(/#000000/g, main).replace(/#ffffff/g, plate);
  return <SvgXml xml={xml} width={24} height={24} />;
}

function SearchGlyph({ color = ds.onDark }: { color?: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={color} strokeWidth={2} />
      <Path d="M15.6 15.6L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function FeedHeader({
  tabKey,
  countryTabLabel,
  topInset,
  onTabPress,
  onLivePress,
  onSearchPress,
}: {
  tabKey: FeedTabKey;
  countryTabLabel: string | null;
  topInset: number;
  onTabPress: (key: FeedTabKey) => void;
  onLivePress: () => void;
  onSearchPress: () => void;
}) {
  // While one of the user's own posts is uploading, this slot shows that
  // instead of the Live glyph - the upload runs in the background now, so the
  // header is where it becomes visible. Idle is the overwhelmingly common case
  // and renders exactly what it always did.
  const uploadStatus = useUploadStore((s) => s.status);
  const uploadPercent = useUploadStore((s) => s.percent);
  const resetUpload = useUploadStore((s) => s.reset);
  const publishing = uploadStatus !== "idle";

  return (
    <View style={[styles.header, { paddingTop: topInset }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={publishing ? "Publishing your post" : "Live"}
        hitSlop={8}
        // Not a button while it is showing upload progress - it would look like
        // the indicator was the thing being tapped, and land the user in Live.
        disabled={publishing}
        onPress={onLivePress}
        style={styles.headerSide}
      >
        {publishing ? (
          <PublishingGlyph status={uploadStatus} percent={uploadPercent} onDone={resetUpload} />
        ) : (
          <>
            <LiveGlyph />
            <View style={styles.liveDot} />
          </>
        )}
      </Pressable>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tabKey;
          const isCountry = t.key === "country";
          const label = isCountry ? countryTabLabel : t.label;
          return (
            <Pressable
              key={t.key}
              onPress={() => onTabPress(t.key)}
              accessibilityRole="button"
              accessibilityLabel={isCountry && label == null ? "Detecting your country" : undefined}
              hitSlop={8}
            >
              {isCountry && label == null ? (
                // Still resolving - a placeholder, never a guessed name, so
                // the tab can't flash a wrong country before settling.
                <View style={styles.tabSkeleton} />
              ) : (
                <Text style={[styles.tabLabel, active ? styles.tabActive : styles.tabIdle]}>
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        hitSlop={8}
        onPress={onSearchPress}
        style={[styles.headerSide, styles.headerRight]}
      >
        <SearchGlyph />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
  },
  headerSide: { width: 32, justifyContent: "center" },
  // Holds the Live glyph's exact footprint, so swapping the indicator in never
  // moves the tab labels.
  publishingSlot: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  // Drawn larger than the slot and offset by half the difference ((32-56)/2),
  // so it overflows evenly and stays optically centred on the Live button's
  // position without taking any more room in the row.
  //
  // 56 is the ceiling here, not a preference: the header is
  // [32pt slot][12pt gap][centred tab labels], so anything past 56 puts the
  // artwork under "Following". The animation's outer ring is transparent glow,
  // so it reads bigger than its box and the overflow into the gap is invisible.
  publishing: { position: "absolute", left: -12, top: -12, width: 56, height: 56 },
  publishingPct: {
    fontSize: 10.5,
    fontWeight: "800",
    color: ds.onDark,
    // The ring behind this is bright at its edges; the shadow keeps the digits
    // legible over whatever frame the animation happens to be on.
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerRight: { alignItems: "flex-end" },
  liveDot: {
    position: "absolute",
    top: -1,
    left: 16,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: ds.accent,
    borderWidth: 1.5,
    borderColor: ds.dark,
  },
  tabs: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  tabLabel: { fontSize: 15.5 },
  tabActive: { color: ds.onDark, fontWeight: "700" },
  tabIdle: { color: "rgba(255,255,255,0.62)", fontWeight: "600" },
  // Same footprint as a short country name so the tab row doesn't reflow once
  // the real label lands.
  tabSkeleton: { width: 46, height: 14, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
});
