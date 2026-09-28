import { Image, type ImageContentFit } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Same three stops used everywhere else this ring already appears
 *  (ProfileTabScreen's own avatar, the Inbox story rail) - one gradient, not
 *  a slightly-different copy per screen. */
const STORY_RING_COLORS = ["#F42B5B", "#FF6E90", "#8B5CF6"] as const;

/** Same flat "seen" color the Inbox story rail already uses
 *  (InboxScreen.tsx's `railRingSeen`) - one color, not a per-screen copy. */
const STORY_RING_SEEN_COLOR = "#E3DFE7";

/**
 * One avatar, one default. If the user uploaded a photo we show it; otherwise
 * everyone gets the SAME neutral silhouette (TikTok-style) instead of a blank
 * box or a per-user initial. Pass the same style you'd give the <Image> - the
 * size/shape come from that; the fallback just fills it.
 *
 * `hasStory` draws the same gradient ring ProfileTabScreen and the Inbox
 * story rail already use, behind the avatar - opt-in and false by default,
 * so the other ~40 call sites of this component that never pass it render
 * exactly as before. The ring is drawn slightly larger than the avatar
 * itself (via padding, scaled to the avatar's own size) so it reads as a
 * border around it rather than overlapping the photo.
 *
 * `storySeen` (only meaningful when `hasStory` is true) switches the ring
 * from the gradient to the flat "seen" color - same IG/TikTok-style
 * distinction the Inbox story rail already draws, now available anywhere
 * this component is used. Defaults to false (unseen/gradient) so a caller
 * that only knows "this user has a story" but not yet "have I watched it"
 * still gets a visible ring rather than silently downgrading to the muted
 * color.
 */
type AvatarProps = {
  /** The user's avatar URL, or null/undefined when they haven't uploaded one. */
  uri?: string | null;
  /** Same style you'd pass to <Image> (width/height/borderRadius/etc.). */
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Draws the "live story" ring behind the avatar. Omit/false for no ring -
   *  the existing, unchanged default. */
  hasStory?: boolean;
  /** Only consulted when `hasStory` is true - true switches the ring to the
   *  flat "already seen" color instead of the gradient. */
  storySeen?: boolean;
};

export function Avatar({ uri, style, contentFit = "cover", hasStory = false, storySeen = false }: AvatarProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;

  if (!hasStory) {
    return uri
      ? <Image source={uri} style={style as any} contentFit={contentFit} />
      : (
        <View style={[style, styles.fallback]}>
          <Svg width="62%" height="62%" viewBox="0 0 24 24">
            {/* head + shoulders silhouette */}
            <Path
              d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.35-8 5.25V21a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.75C20 16.35 16.42 14 12 14Z"
              fill="#b9bec9"
            />
          </Svg>
        </View>
      );
  }

  const size = typeof flat.width === "number" ? flat.width : 40;
  // Roughly the same ring-to-avatar proportion the existing rings already
  // use (Inbox rail: 62/56, Profile: a few px over 88) - scales with
  // whatever size this particular call site's avatar actually is.
  const ringPad = Math.max(2, Math.round(size * 0.07));
  const ringSize = size + ringPad * 2;
  const ringRadius = (flat.borderRadius as number | undefined) ?? size / 2;

  // Margin/positioning move to the OUTER wrapper (so the ring doesn't
  // disturb whatever spacing the caller's own style relied on among its
  // siblings); the inner avatar keeps every other property (size, shape,
  // etc.) but not its own copy of these, or they'd apply twice - once
  // shifting the wrapper, again shifting the image inside it, misaligning
  // it against the ring drawn around the wrapper's own edges.
  const {
    margin, marginTop, marginBottom, marginLeft, marginRight,
    marginHorizontal, marginVertical, alignSelf,
    ...innerStyle
  } = flat;
  const wrapperStyle: ViewStyle = {
    margin, marginTop, marginBottom, marginLeft, marginRight,
    marginHorizontal, marginVertical, alignSelf,
    width: size, height: size,
  };

  const content = uri
    ? <Image source={uri} style={innerStyle as any} contentFit={contentFit} />
    : (
      <View style={[innerStyle, styles.fallback]}>
        <Svg width="62%" height="62%" viewBox="0 0 24 24">
          <Path
            d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.35-8 5.25V21a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.75C20 16.35 16.42 14 12 14Z"
            fill="#b9bec9"
          />
        </Svg>
      </View>
    );

  const ringStyle: ViewStyle = {
    position: "absolute",
    left: -ringPad,
    top: -ringPad,
    width: ringSize,
    height: ringSize,
    borderRadius: ringRadius + ringPad,
  };

  return (
    <View style={wrapperStyle}>
      {storySeen ? (
        <View style={[ringStyle, { backgroundColor: STORY_RING_SEEN_COLOR }]} />
      ) : (
        <LinearGradient
          colors={STORY_RING_COLORS}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={ringStyle}
        />
      )}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "#e9eaee",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
