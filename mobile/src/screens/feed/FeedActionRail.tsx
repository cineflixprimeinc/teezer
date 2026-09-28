import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
import Svg, { Path } from "react-native-svg";
import { ds } from "@/theme/design";
import likeAnimation from "@/assets/like-animation.json";
import saveAnimation from "@/assets/save.json";

/**
 * A four-point sparkle for the brand avatar - a star whose arms are concave, so
 * it reads as a glint rather than as a plus sign, which matters when a literal
 * + badge sits 20pt below it.
 */
function Sparkle({ size, style }: { size: number; style?: object }) {
  return (
    <View pointerEvents="none" style={[styles.sparkle, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12Z" fill={ds.onDark} />
      </Svg>
    </View>
  );
}

/**
 * The right-hand action rail on a feed post.
 *
 * Glyphs are the prototype's own filled paths, scaled down ~10% from its
 * original sizes (heart 35, comment 32, save 30, share 30) per request -
 * still deliberately not uniform, so normalising them to one size would
 * visibly change the rail's rhythm.
 */

const SHADOW = {
  textShadowColor: "rgba(0,0,0,0.4)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

function Heart({ filled }: { filled: boolean }) {
  return (
    <Svg width={35} height={35} viewBox="0 0 24 24">
      <Path
        d="M12 20.9c-.55 0-1.08-.22-1.47-.6-3.5-3.38-8.13-7.6-8.13-11.9C2.4 5.05 5.1 2.5 8.45 2.5c1.42 0 2.66.5 3.55 1.35.89-.85 2.13-1.35 3.55-1.35 3.35 0 6.05 2.55 6.05 5.9 0 4.3-4.63 8.52-8.13 11.9-.39.38-.92.6-1.47.6Z"
        fill={filled ? ds.accent : ds.onDark}
      />
    </Svg>
  );
}

/**
 * The rail's Like glyph, plus the one-shot Lottie burst on like.
 *
 * The heart itself is unchanged - same instant fill-colour swap as always,
 * so unliking (and every other existing behaviour) is untouched. The Lottie
 * layer is purely additive: it only mounts on a false -> true transition of
 * `filled` (never on unlike, never on the initial mount if a post already
 * arrives liked), plays once over the heart, and unmounts itself via
 * onAnimationFinish - no permanent overlay left behind.
 *
 * State is local to this component, which itself is local to one
 * FeedActionRail = one feed post: liking one post can never trigger or
 * affect the animation on another, including mid-scroll, and nothing here
 * causes a re-render outside this one rail.
 */
function LikeIcon({ filled }: { filled: boolean }) {
  const [playing, setPlaying] = useState(false);
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current) setPlaying(true);
    wasFilled.current = filled;
  }, [filled]);

  return (
    <View style={styles.likeIconWrap}>
      <Heart filled={filled} />
      {playing && (
        <View pointerEvents="none" style={styles.likeLottieWrap}>
          <LottieView
            source={likeAnimation}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            onAnimationFinish={() => setPlaying(false)}
          />
        </View>
      )}
    </View>
  );
}

/**
 * The design's comment glyph: one filled shape whose three dots are cut out
 * with the even-odd fill rule, so the video shows through them.
 *
 * All four subpaths MUST live in a single <Path>. Even-odd is a property of one
 * path's winding, so splitting them into separate elements paints three opaque
 * circles instead of punching holes - which is what the previous version did,
 * filling them with the feed's background colour. That only looks transparent
 * over flat dark video and shows as dark blobs over anything bright.
 */
const COMMENT_D = [
  "M12 3.1c5.6 0 10 3.6 10 8.15 0 4.55-4.4 8.15-10 8.15-.7 0-1.4-.06-2.05-.17l-4.2 2.4a.85.85 0 0 1-1.25-.95l.85-3.2C3.4 16 2 14.2 2 11.25 2 6.7 6.4 3.1 12 3.1Z",
  "M6.65 11.2a1.55 1.55 0 1 0 3.1 0a1.55 1.55 0 1 0-3.1 0Z",
  "M10.45 11.2a1.55 1.55 0 1 0 3.1 0a1.55 1.55 0 1 0-3.1 0Z",
  "M14.25 11.2a1.55 1.55 0 1 0 3.1 0a1.55 1.55 0 1 0-3.1 0Z",
].join(" ");

/** Exported so surfaces outside the rail (the post viewer's comment button)
 *  use this exact mark rather than drawing another speech bubble. Default size
 *  is the rail's own 36, so its call sites are unchanged. */
export function CommentGlyph({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={COMMENT_D} fill={ds.onDark} fillRule="evenodd" />
    </Svg>
  );
}

function Bookmark({ filled }: { filled: boolean }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Path
        d="M6.6 2.6h10.8c1 0 1.8.8 1.8 1.8v16.3c0 .78-.87 1.24-1.5.79L12 17.65l-5.7 3.84c-.63.45-1.5-.01-1.5-.79V4.4c0-1 .8-1.8 1.8-1.8Z"
        fill={filled ? "#FCD34D" : ds.onDark}
      />
    </Svg>
  );
}

/** The rail's Save glyph, plus the one-shot Lottie burst on save - same
 *  shape as LikeIcon above, see that component's own comment for the
 *  false -> true / cleanup / isolation reasoning, all identical here. */
function SaveIcon({ filled }: { filled: boolean }) {
  const [playing, setPlaying] = useState(false);
  // Bumped on every false->true transition and used as the LottieView's key.
  // Without this, a fast unsave->save->unsave->save only replays the burst
  // on the FIRST save: `playing` is already true from the tap before, so
  // setPlaying(true) again is a no-op and the still-mounted instance just
  // keeps running from wherever it was instead of restarting - which reads
  // as a weak, cut-off bounce and a rail that ignores quick re-taps.
  // Changing `key` forces React to unmount and remount a fresh instance
  // every time, so each tap gets the animation's full motion from frame 0.
  const [burst, setBurst] = useState(0);
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current) {
      setBurst((n) => n + 1);
      setPlaying(true);
    } else if (!filled && wasFilled.current) {
      // Unsave: drop any still-playing burst immediately instead of letting
      // it finish on its own. Without this, a quick save->unsave leaves the
      // previous burst animating on top of the now-unfilled bookmark for up
      // to its full ~1s run, which reads as the unsave tap being slow to
      // react when it's really just a leftover overlay from the tap before.
      setPlaying(false);
    }
    wasFilled.current = filled;
  }, [filled]);

  return (
    <View style={styles.saveIconWrap}>
      <Bookmark filled={filled} />
      {playing && (
        <View pointerEvents="none" style={styles.saveLottieWrap}>
          <LottieView
            key={burst}
            source={saveAnimation}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            onAnimationFinish={() => setPlaying(false)}
          />
        </View>
      )}
    </View>
  );
}

/** The "already following" badge - a plain checkmark, green like every other
 *  confirmed/success state in the app, on a white disc so it reads distinctly
 *  from the pink "+" invitation badge it replaces once the viewer follows. */
function CheckGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5 9 17.5 20 6" stroke="#22C55E" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Share - the curved reply-arrow, per the user-supplied icon. */
function ShareGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill={ds.onDark}>
      <Path d="M13 14H11C7.54202 14 4.53953 15.9502 3.03239 18.8107C3.01093 18.5433 3 18.2729 3 18C3 12.4772 7.47715 8 13 8V3L23 11L13 19V14Z" />
    </Svg>
  );
}

/**
 * The disc at the foot of the rail.
 *
 * Shows the sound's own cover when the track has one, falling back to the
 * post's thumbnail, then to a note glyph. Static: the design spins it, but a
 * rotating disc hides whatever art is on it, and the art is the point once it
 * is real content rather than a placeholder.
 */
function MusicDisc({ coverUri, onPress }: { coverUri?: string | null; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      // Not disabled when there is no handler - `Pressable` without onPress is
      // inert already, and disabling would also drop the press feedback for
      // callers that do pass one.
      hitSlop={8}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? "Open sound" : undefined}
      style={styles.disc}
    >
      {coverUri ? (
        <Image source={{ uri: coverUri }} style={styles.discArt} contentFit="cover" transition={140} />
      ) : (
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
          <Path d="M9 18V5l12-2v13" stroke={ds.onDark} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6 21a3 3 0 1 0 3-3" stroke={ds.onDark} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M18 19a3 3 0 1 0 3-3" stroke={ds.onDark} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      )}
    </Pressable>
  );
}

function RailButton({
  children,
  label,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  label: string;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={styles.item}
    >
      {children}
      <Text style={styles.count}>{label}</Text>
    </Pressable>
  );
}

export type RailProps = {
  /** Real creator avatar; falls back to the initial bubble when absent. */
  avatarUri?: string | null;
  avatarInitial: string;
  /** Draw the + "follow" badge over the avatar. The caller decides: false
   *  once the viewer follows this creator, and on the viewer's own posts. */
  showFollow?: boolean;
  /** Draw a green check "following" badge in the same spot instead - true
   *  once the viewer already follows this creator. Mutually exclusive with
   *  showFollow; both false (the viewer's own post) draws neither. */
  showFollowing?: boolean;
  /** True when this creator currently has a live story - draws the same
   *  gradient ring the profile screen and Inbox already draw, now here too. */
  hasStory?: boolean;
  /** Only consulted when hasStory is true - true switches the ring to the
   *  same flat "seen" color the Inbox story rail already uses. */
  storySeen?: boolean;
  likeLabel: string;
  liked: boolean;
  commentLabel: string;
  saveLabel: string;
  saved: boolean;
  shareLabel: string;
  onLike?: () => void;
  onComments?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onFollow?: () => void;
  /** Opens the creator's profile - the tap target is the whole avatar (ring +
   *  image/placeholder). The small follow/following badge overlaid on top of
   *  it is its own, separate Pressable and still triggers onFollow, not this. */
  onOpenProfile?: () => void;
  /** Sound cover art for the disc; falls back to a note glyph when absent. */
  discCoverUri?: string | null;
  /** Opens the sound sheet. Omitted, the disc stays inert as before. */
  onSound?: () => void;
  /** False for posts with no playable audio - see FeedVideoItem for the rule. */
  showDisc?: boolean;
  /** Extra space to leave below the rail. 0 on the feed, which is the default
   *  and leaves the bar exactly where it has always been; the profile post
   *  viewer passes its comment composer's height so the rail clears it. */
  bottomInset?: number;
};

export function FeedActionRail(p: RailProps) {
  return (
    <View style={[styles.rail, !!p.bottomInset && { bottom: 24 + p.bottomInset }]}>
      <Pressable
        onPress={p.onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Open creator profile"
        style={styles.avatarWrap}
      >
        {/* Only shown when the creator has a live story - same gradient-vs-
            seen ring the profile screen and Inbox already draw. Sits behind
            the avatar (render order), 3px proud of it on every side, same
            proportion those other rings already use. */}
        {p.hasStory && (p.storySeen
          ? <View style={[styles.storyRing, styles.storyRingSeen]} />
          : (
            <LinearGradient
              colors={["#F42B5B", "#FF6E90", "#8B5CF6"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.storyRing}
            />
          )
        )}
        {p.avatarUri ? (
          <Image source={{ uri: p.avatarUri }} style={styles.avatar} contentFit="cover" transition={120} />
        ) : (
          /* The brand placeholder, on the design's real gradient rather than
             the flat #B41F44 that stood in for it. Sparkles ride on this only -
             never over a creator's photograph, where they would be graffiti. */
          <LinearGradient
            colors={["#F42B5B", "#8B1130"]}
            // 150deg in the design: mostly downward with a rightward lean.
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{p.avatarInitial}</Text>
            <Sparkle style={styles.sparkleA} size={9} />
            <Sparkle style={styles.sparkleB} size={6} />
          </LinearGradient>
        )}
        {/* The + is an INVITATION to follow, so it only belongs on a creator
            the viewer does not already follow - and never on the viewer's own
            post, where following yourself is not a thing. It used to render
            unconditionally, which offered to follow people you already follow
            and offered to follow yourself.

            This badge is its own Pressable, nested inside the avatar's - RN
            gives the inner one first claim on the touch, so tapping the badge
            still follows/unfollows without also opening the profile behind
            it, while tapping anywhere else on the avatar opens the profile. */}
        {p.showFollow && (
          <Pressable
            onPress={p.onFollow}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Follow creator"
            style={styles.followDot}
          >
            <Text style={styles.followPlus}>+</Text>
          </Pressable>
        )}
        {p.showFollowing && (
          <Pressable
            onPress={p.onFollow}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Following - tap to unfollow"
            style={[styles.followDot, styles.followingDot]}
          >
            <CheckGlyph />
          </Pressable>
        )}
      </Pressable>

      <RailButton label={p.likeLabel} onPress={p.onLike} accessibilityLabel="Like">
        <LikeIcon filled={p.liked} />
      </RailButton>

      <RailButton label={p.commentLabel} onPress={p.onComments} accessibilityLabel="Comments">
        <CommentGlyph />
      </RailButton>

      <RailButton label={p.saveLabel} onPress={p.onSave} accessibilityLabel="Save">
        <SaveIcon filled={p.saved} />
      </RailButton>

      <RailButton label={p.shareLabel} onPress={p.onShare} accessibilityLabel="Share">
        <ShareGlyph />
      </RailButton>

      {p.showDisc && <MusicDisc coverUri={p.discCoverUri} onPress={p.onSound} />}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: "absolute", right: 10, bottom: 24, alignItems: "center", gap: 23 },
  item: { alignItems: "center", gap: 5 },
  // 39x39 box, but the whole wrap (heart + its burst together, so they never
  // drift apart) is nudged up a few px from where the rail would otherwise
  // centre it - a translate, not a margin/gap change, so it's purely visual
  // and the rest of the rail's layout (spacing, the label below) is untouched.
  likeIconWrap: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -8 }],
  },
  // Bigger than the heart and centered over it - a burst needs room to
  // expand past the icon's own bounds to read as one. pointerEvents none on
  // the wrapper (not the heart underneath) is what keeps the Like button
  // tappable for the animation's whole ~1s run instead of eating the touch.
  likeLottieWrap: { position: "absolute", width: 108, height: 108 },
  // Same reasoning as likeIconWrap/likeLottieWrap, sized down to match
  // Bookmark's own 33x33 (vs Heart's 39x39) and its proportional burst.
  saveIconWrap: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -7 }],
  },
  saveLottieWrap: { position: "absolute", width: 92, height: 92 },
  count: { color: ds.onDark, fontSize: 12.5, fontWeight: "700", ...SHADOW },
  avatarWrap: { width: 48, height: 56 },
  /** Behind the 48px avatar, 3px proud of it on every side - same
   *  proportion the profile screen (88→96, pad 4) and Inbox (56→62, pad 3)
   *  rings already use. */
  storyRing: {
    position: "absolute",
    top: -3,
    left: -3,
    width: 54,
    height: 54,
    borderRadius: 999,
  },
  /** Same flat "seen" color the Inbox story rail already uses. */
  storyRingSeen: { backgroundColor: "#E3DFE7" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    // No backgroundColor: the placeholder is a LinearGradient now, and a photo
    // covers this entirely. The flat #B41F44 that used to sit here was only
    // ever a stand-in for the design's gradient.
    borderWidth: 2,
    borderColor: ds.onDark,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  /* Absolute so they sit over the letter without shifting it - the avatar is a
     centring container, and adding them as flow children would push the R. */
  sparkle: { position: "absolute" },
  sparkleA: { top: 7, right: 8 },
  sparkleB: { top: 17, right: 4 },
  avatarText: { color: ds.onDark, fontSize: 19, fontWeight: "700", fontStyle: "italic" },
  followDot: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: ds.accent,
    borderWidth: 2,
    borderColor: ds.darkSheet,
    alignItems: "center",
    justifyContent: "center",
  },
  followPlus: { color: ds.onDark, fontSize: 14, lineHeight: 16 },
  /** The "following" state of the same badge - white disc so the green check
   *  reads clearly against it instead of blending into the pink accent. */
  followingDot: { backgroundColor: "#fff" },
  disc: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#26242C",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  discArt: { width: "100%", height: "100%" },
});
