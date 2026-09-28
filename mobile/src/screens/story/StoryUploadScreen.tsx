import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Switch,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library/legacy";
import * as ImagePicker from "expo-image-picker";
import LottieView from "lottie-react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { ds } from "@/theme/design";
import storyUploadLoader from "@/assets/story-upload-loader.json";
import { storyApi, type StoryLayer, type StoryVisibility } from "@/api/story.api";
import { musicApi, type MusicTrack } from "@/api/music.api";
import { StoryEditor, type StoryOverlay } from "./StoryEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TextInput } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { profileApi } from "@/api/profile.api";
import { useAuthStore } from "@/store/auth.store";
import { useNavigation } from "@react-navigation/native";
import type { RepostOf } from "@/navigation/types";

/**
 * New story - the design's `storyUploadOpen` surface.
 *
 * All three of the design's phases are here: PICK (choose from the device),
 * EDIT (StoryEditor - music, text and emoji laid on the media) and SHARE (who
 * sees it, then post).
 *
 * The overlays the editor returns are posted as real `layers`, in the same
 * shape the website writes them, so what was placed on the canvas is what the
 * viewer sees. Filters, stickers, GIFs and drawing have no layer type to be
 * stored as and are not built - see StoryEditor.
 *
 * The gallery is drawn in-app from expo-media-library rather than handed off to
 * the system picker, because the design's grid IS the screen - three columns
 * under Camera/Text/Boomerang tiles, with its own album chip and media tabs. A
 * system sheet would be a different screen wearing the same name.
 */

/* ── Design tokens, taken from the prototype rather than approximated ─────── */
const INK = "#121014";
const MUTED = "#8A8592";
const FAINT = "#B6B1BE";
const LINE = "#EFECF1";
const CHIP = "#F4F2F5";
const CARD = "#FAF9FA";
/** The design's brand pink, used for the chosen row and the share button. */
const ACCENT = "#F42B5B";
const ACCENT_WASH = "#FEF0F4";

type Phase = "pick" | "edit" | "share";
type MediaTab = "all" | "photo" | "video";

const TABS: { key: MediaTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
];

/**
 * Maps 1:1 onto StoryVisibility, so the row the user taps is the value sent.
 *
 * `only_me` is not offered. The design's list is these three, and the server
 * already treats close_friends as owner-only anyway (see the subtitle), so a
 * fourth row would have been a second way to say the same thing.
 */
const PRIVACY: { key: StoryVisibility; label: string; sub: string }[] = [
  { key: "everyone", label: "Everyone", sub: "Anyone on Teezer can view" },
  { key: "followers", label: "Followers only", sub: "Only people who follow you" },
  {
    key: "close_friends",
    label: "Close friends",
    /* Not "3 people on your list". There is no close-friends list in this
       product yet - no table, no endpoint, nothing to count - and
       StoryController::visibleTo fails closed on it, so a story shared this way
       reaches nobody but you. Printing a number here would be inventing one. */
    sub: "No list yet - only you will see it",
  },
];

/** The design's Story controls - all three are API fields now. */
const CONTROLS = [
  { key: "replies", label: "Allow replies", sub: "Let viewers into your DMs" },
  { key: "sharing", label: "Allow sharing", sub: "Viewers can share this to their own chats" },
  { key: "ai", label: "AI Generated Content", sub: "Mark this Story as AI-generated content" },
] as const;

const PAGE = 60;

function CloseGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke={INK} strokeWidth={2.3} strokeLinecap="round" />
    </Svg>
  );
}

function BackGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={INK} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Visibility row icons, in the design's order. */
function PrivacyGlyph({ which }: { which: StoryVisibility }) {
  if (which === "everyone") {
    return (
      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={8.6} stroke={INK} strokeWidth={1.7} />
        <Path d="M3.4 12h17.2M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2" stroke={INK} strokeWidth={1.7} />
      </Svg>
    );
  }
  if (which === "followers") {
    return (
      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={8.4} r={3.9} stroke={INK} strokeWidth={1.7} />
        <Path d="M4.8 20c1.5-3.4 4-5.1 7.2-5.1s5.7 1.7 7.2 5.1" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.2l7 2.6v5.6c0 4.2-2.8 7.6-7 9.4-4.2-1.8-7-5.2-7-9.4V5.8z"
        stroke={ACCENT}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Story-control row icons, in the design's order. */
function ControlGlyph({ which }: { which: (typeof CONTROLS)[number]["key"] }) {
  if (which === "replies") {
    return (
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <Path
          d="M4.5 5.5h15v10h-9l-6 4z"
          stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (which === "sharing") {
    return (
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <Path d="M12 16V4m-5 5 5-5 5 5" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="m12 3.5 2.1 4.7 4.9.7-3.5 3.5.8 5-4.3-2.4-4.3 2.4.8-5-3.5-3.5 4.9-.7z"
        stroke={MUTED} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The filled tick in a selected radio. */
function TickGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="m5 12.5 4.6 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ClockGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={MUTED} strokeWidth={2.1} />
      <Path d="M12 7v5l3.5 2" stroke={MUTED} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 3h6l1.6 2.4H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1h3.4z"
        stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.5} stroke={INK} strokeWidth={1.8} />
    </Svg>
  );
}

function TextGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7V4h16v3M9 20h6M12 4v16" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BoomerangGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 2.1 21 6.1l-4 4M3 12.6v-1.5a4 4 0 0 1 4-4h14M7 21.9 3 17.9l4-4M21 11.4v1.5a4 4 0 0 1-4 4H3"
        stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function VideoTagGlyph() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6.5h11v11H4zM15 11l5-3v8l-5-3z" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Full-screen while a story is actually being posted (`posting`) - the same
 * flag that already brackets the entire post() request, on either of the two
 * screens that can call it (StoryEditor's Publish Story, or this screen's own
 * Share-phase Post button), so it can never linger past the real upload or
 * appear before one has actually started. Sits above everything, including
 * the composer's own canvas, so nothing underneath can be tapped mid-upload.
 */
function UploadOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.uploadOverlay} pointerEvents="auto">
      <LottieView
        source={storyUploadLoader}
        autoPlay
        loop
        resizeMode="contain"
        style={styles.uploadOverlayLottie}
      />
      <Text style={styles.uploadOverlayText}>Posting your story…</Text>
    </View>
  );
}

/**
 * "Reposted from @username" attribution - shown on a repost's edit canvas
 * here, and again in the viewer once it's published (StoryViewerScreen
 * reuses this same component). NOT part of the overlays array the user can
 * edit or delete - a separate, fixed render, per spec: the original
 * creator's credit must survive a repost, User A cannot remove it.
 */
export function RepostAttributionPill({
  user,
  onPress,
  bottom = 18,
}: {
  /* username/name/avatar are nullable here (not on the upload-screen's own
     RepostOf param, which is always a real, just-fetched author): this
     component is reused by the VIEWER, whose story.reposted_from is
     resolved live and falls back to null fields if the original creator's
     account is gone by the time it's viewed - see resolveRepostedFrom() on
     the server. */
  user: { username: string | null; name: string | null; avatar: string | null };
  onPress: () => void;
  bottom?: number;
}) {
  const label = user.username ? `Reposted from @${user.username}` : "Reposted story";
  return (
    <View style={[styles.repostPillWrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        disabled={!user.username}
        style={styles.repostPill}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.repostPillAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.repostPillAvatar, styles.repostPillAvatarFallback]}>
            <Text style={styles.repostPillInitial}>{(user.name || user.username || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.repostPillText} numberOfLines={1}>{label}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The Share-phase preview thumbnail. Used to be `<Image source={{ uri:
 * picked.uri }} />` unconditionally - for a video that's an .mp4 path handed
 * to an image decoder, which renders nothing. A paused, muted VideoView
 * shows a real frame instead, the same player StoryEditor's own canvas
 * already uses for video.
 */
function PreviewThumb({ picked }: { picked: { uri: string; isVideo: boolean } }) {
  const player = useVideoPlayer(picked.isVideo ? picked.uri : null, (p) => {
    p.muted = true;
  });

  if (picked.isVideo) {
    return <VideoView player={player} style={styles.previewThumb} contentFit="cover" nativeControls={false} />;
  }
  return <Image source={{ uri: picked.uri }} style={styles.previewThumb} contentFit="cover" transition={120} />;
}

/** mm:ss, for the duration tag on a video tile. */
function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function StoryUploadScreen({ onClose, repostOf }: { onClose: () => void; repostOf?: RepostOf }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();

  // A repost skips the pick phase entirely and starts on the original's own
  // media - see StoryUploadScreen's doc comment / the plan this implements.
  const [phase, setPhase] = useState<Phase>(repostOf ? "edit" : "pick");
  const [tab, setTab] = useState<MediaTab>("all");
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<{ uri: string; name: string; type: string; isVideo: boolean } | null>(
    () =>
      repostOf
        ? { uri: repostOf.media_url, name: "repost", type: repostOf.isVideo ? "video/mp4" : "image/jpeg", isVideo: repostOf.isVideo }
        : null,
  );
  const [visibility, setVisibility] = useState<StoryVisibility>("everyone");
  const [posting, setPosting] = useState(false);
  /** What the editor laid on the canvas - serialised to `layers` on post. */
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  /* Story controls. The first two are real fields on POST /stories; the third
     is a local copy into the gallery, which is not something the API stores. */
  /* Close friends. `saved` is what the server holds; `picked` is what the sheet
     is editing. Kept apart so cancelling leaves the real list untouched. */
  const [cfOpen, setCfOpen] = useState(false);
  const [cfPicked, setCfPicked] = useState<Set<number>>(new Set());
  const [cfSaving, setCfSaving] = useState(false);
  const [cfQuery, setCfQuery] = useState("");

  const closeFriends = useQuery({
    queryKey: ["close-friends"],
    queryFn: () => profileApi.closeFriends(),
    staleTime: 60_000,
  });
  /* Only people you follow may be on the list - the server enforces it, so the
     picker offers exactly that set rather than letting a choice be rejected. */
  const following = useQuery({
    queryKey: ["following", me?.username],
    // Unwrapped here so the list is a plain array everywhere below.
    queryFn: () => profileApi.following(me!.username).then((r) => r.data ?? []),
    enabled: cfOpen && !!me?.username,
    staleTime: 60_000,
  });

  const cfCount = closeFriends.data?.length ?? 0;

  const [allowReplies, setAllowReplies] = useState(true);
  const [allowSharing, setAllowSharing] = useState(true);
  /* Off by default - only set when the creator actually marks it. A repost
     starts from the original's own flag: the server ORs it back in anyway
     (see StoryController::repost), so the toggle shown here already
     reflects the true eventual state, it just can't be unchecked away. */
  const [aiGenerated, setAiGenerated] = useState(repostOf?.is_ai_generated ?? false);

  /* The grid is 3 columns with 5pt gutters inside 18pt page padding. Deriving
     the tile from the real width keeps the last column flush with the edge
     instead of drifting a pixel or two on each device. */
  const tile = useMemo(() => Math.floor((width - 18 * 2 - 5 * 2) / 3), [width]);

  const mediaType = useMemo<MediaLibrary.MediaTypeValue[]>(
    () => (tab === "photo" ? ["photo"] : tab === "video" ? ["video"] : ["photo", "video"]),
    [tab],
  );

  /**
   * Load a page of the camera roll.
   *
   * Permission is asked for explicitly rather than left to the first read: once
   * the OS has been told no, getAssetsAsync just returns nothing and the grid
   * looks broken rather than blocked.
   */
  const load = useCallback(
    async (after?: string) => {
      const current = await MediaLibrary.getPermissionsAsync();
      let granted = current.granted;
      if (!granted && current.canAskAgain) {
        granted = (await MediaLibrary.requestPermissionsAsync()).granted;
      }
      if (!granted) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setDenied(false);

      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE,
        after,
        mediaType,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setAssets((prev) => (after ? [...prev, ...page.assets] : page.assets));
      setCursor(page.endCursor);
      setHasMore(page.hasNextPage);
      setLoading(false);
    },
    [mediaType],
  );

  // Reloads from the top whenever the tab changes - the cursor belongs to the
  // previous filter and paging on with it would splice two lists together.
  useEffect(() => {
    setLoading(true);
    setAssets([]);
    setCursor(undefined);
    setHasMore(true);
    void load();
  }, [load]);

  /**
   * Turn a library asset into something uploadable.
   *
   * getAssetInfoAsync is not optional: on iOS `asset.uri` is a `ph://` handle
   * that only Photos understands, and posting it uploads nothing. `localUri` is
   * the real file.
   */
  const choose = useCallback(async (asset: MediaLibrary.Asset) => {
    const isVideo = asset.mediaType === MediaLibrary.MediaType.video;

    let uri: string;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      uri = info.localUri ?? asset.uri;
    } catch {
      /* This tap used to die in silence. The call site voids the promise, so a
         rejection here discarded itself and the grid just sat there - no editor,
         no error, nothing to suggest the tap had registered. iCloud photos that
         are not downloaded locally are the usual cause. */
      Alert.alert(
        "Couldn't open that",
        "That item couldn't be read from your gallery. If it's stored in iCloud, open it in Photos once and try again.",
      );
      return;
    }

    /* getAssetInfoAsync can succeed and still hand back no localUri - falling
       through to the bare asset.uri then silently hands the editor a ph://
       (iOS) library HANDLE rather than a real file (content:// on Android is
       left alone - unlike ph://, Android's own media player generally CAN
       resolve those directly, so treating them the same would reject picks
       that actually work). expo-video can't decode a handle at all, so a
       video picked this way opened the editor with nothing to preview and
       nothing to play - no error anywhere, because nothing actually threw. A
       photo often still renders from a handle (expo-image is more
       forgiving), which is why this only showed up on video. Caught
       explicitly here instead of leaving the composer to fail silently on
       it. Expo Go's own media library access is more restricted than a dev
       build's, which is the usual reason localUri comes back empty at all. */
    if (/^(ph|assets-library):/i.test(uri)) {
      Alert.alert(
        "Couldn't open that",
        isVideo
          ? "That video couldn't be read from your gallery. If it's stored in iCloud, open it in Photos once and try again."
          : "That photo couldn't be read from your gallery. If it's stored in iCloud, open it in Photos once and try again.",
      );
      return;
    }

    setPicked({
      uri,
      name: asset.filename || (isVideo ? "story.mp4" : "story.jpg"),
      type: isVideo ? "video/mp4" : "image/jpeg",
      isVideo,
    });
    setPhase("edit");
  }, []);

  const capture = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access is off",
        "Teezer needs your camera to shoot a story.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    /* Same reason as `choose`: the call site voids this promise, so a throw
       from the camera would leave the tile looking dead rather than saying so. */
    let shot: ImagePicker.ImagePickerResult;
    try {
      shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
    } catch {
      Alert.alert("Couldn't open the camera", "Something stopped the camera from starting. Try again.");
      return;
    }
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    const isVideo = a.type === "video";
    setPicked({
      uri: a.uri,
      name: a.fileName ?? (isVideo ? "story.mp4" : "story.jpg"),
      type: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
      isVideo,
    });
    setPhase("edit");
  }, []);

  /** Honest about the tiles and editor tools that are not built. */
  const notBuilt = useCallback((what: string) => {
    Alert.alert(what, "This part of the story composer isn't built yet.");
  }, []);

  const post = useCallback(async (status: "published" | "draft") => {
    if (!picked || posting) return;
    setPosting(true);
    try {
      /* The editor works in percentages, which is exactly what StoryLayer
         stores, so placement survives whatever size the viewer renders at.

         scale, rotation and zIndex are the real values off the canvas now.
         They were hardcoded to 1 / 0 / array-position, which silently threw
         away every resize and rotation the moment Share was pressed - the
         columns to hold them have existed since the table was created. */
      const layers: StoryLayer[] = overlays.map((o) => ({
        type: o.kind,
        text: o.text,
        slideIndex: 0,
        x: o.x,
        y: o.y,
        scale: o.scale,
        rotation: o.rotation,
        color: o.color,
        font: "classic",
        zIndex: o.zIndex,
      }));

      const created = repostOf
        ? { data: await storyApi.repost(repostOf.id, {
            visibility,
            allow_replies: allowReplies,
            allow_resharing: allowSharing,
            is_ai_generated: aiGenerated,
            layers: layers.length ? layers : undefined,
          }) }
        : await storyApi.create({
            media: [{ uri: picked.uri, name: picked.name, type: picked.type }],
            visibility,
            status,
            allow_replies: allowReplies,
            allow_resharing: allowSharing,
            is_ai_generated: aiGenerated,
            // The track is part of the story now, not just an attribution stat.
            music_id: track?.id ?? null,
            layers: layers.length ? layers : undefined,
          });

      /* Attribution for the track, once the story it belongs to exists. Never
         allowed to fail the post - the story is already up by this point. */
      if (track) {
        void musicApi
          .logUse(track.id, { content_id: created.data?.id, content_type: "story" })
          .catch(() => {});
      }
      /* The ring appears the moment this screen closes, not a round trip later.
         has_story is written straight into the cached profile, so the rendered
         value is already true before any request goes out - React Query rerenders
         the profile from cache synchronously.

         A draft is deliberately excluded: it is not live, so it must not draw a
         ring that promises viewers something they cannot open.

         The invalidation below still runs. The optimistic write makes it
         instant; the refetch makes it TRUE - if the post is later rejected or
         expires, the server's answer replaces this guess rather than leaving a
         ring with nothing behind it. */
      if (status === "published") {
        const markLive = (old: unknown) =>
          old && typeof old === "object"
            ? { ...(old as Record<string, unknown>), has_story: true, has_active_story: true }
            : old;
        // Only ever the CURRENT user's own cache entry - ["profile-me"] is
        // exclusively this account (ProfileTabScreen.tsx routes a self-view
        // there, never to ["profile-user", *], since isSelf already catches
        // forUser === authUser.username). setQueriesData({queryKey:
        // ["profile-user"]}, ...) used to sit here too, but that's a PREFIX
        // match with no username filter - it stamped has_story:true onto
        // every OTHER user's profile this device had ever cached this
        // session, which is exactly what put a gradient ring on people who
        // never posted anything.
        qc.setQueryData(["profile-me"], markLive);
      }

      /* Still refetched: the profile is cached for 60s and the story feed longer,
         and both are now stale by definition - we are what made them so. */
      void qc.invalidateQueries({ queryKey: ["profile-me"] });
      void qc.invalidateQueries({ queryKey: ["profile-user"] });
      void qc.invalidateQueries({ queryKey: ["stories-feed"] });
      void qc.invalidateQueries({ queryKey: ["story-ring-ids"] });

      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Your story wasn't posted. Check your connection and try again.";
      Alert.alert("Not posted", msg);
    } finally {
      setPosting(false);
    }
  }, [picked, posting, visibility, overlays, track, allowReplies, allowSharing, aiGenerated, repostOf, qc, onClose]);

  /* ── Pick ──────────────────────────────────────────────────────────────── */

  if (phase === "pick") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Close">
            <CloseGlyph />
          </Pressable>
          <Text style={styles.title}>New story</Text>
          <View style={styles.albumChip}>
            <Text style={styles.albumText}>Recents</Text>
          </View>
        </View>

        <FlatList
          data={assets}
          keyExtractor={(a) => a.id}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={{ gap: 5 }}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (hasMore && !loading && cursor) void load(cursor); }}
          ListHeaderComponent={
            <View style={styles.gridHeader}>
              <View style={styles.tiles}>
                <Pressable style={styles.tile} onPress={capture} accessibilityRole="button">
                  <View style={styles.tileIcon}><CameraGlyph /></View>
                  <Text style={styles.tileLabel}>Camera</Text>
                </Pressable>
                <Pressable style={styles.tile} onPress={() => notBuilt("Text story")} accessibilityRole="button">
                  <View style={styles.tileIcon}><TextGlyph /></View>
                  <Text style={styles.tileLabel}>Text</Text>
                </Pressable>
                <Pressable style={styles.tile} onPress={() => notBuilt("Boomerang")} accessibilityRole="button">
                  <View style={styles.tileIcon}><BoomerangGlyph /></View>
                  <Text style={styles.tileLabel}>Boomerang</Text>
                </Pressable>
              </View>

              <View style={styles.tabRow}>
                <View style={styles.tabs}>
                  {TABS.map((t) => (
                    <Pressable
                      key={t.key}
                      onPress={() => setTab(t.key)}
                      style={[styles.tab, tab === t.key && styles.tabOn]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.count}>{assets.length}{hasMore ? "+" : ""} items</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}><ActivityIndicator color={ds.accent} /></View>
            ) : denied ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Photo access is off</Text>
                <Text style={styles.emptyText}>Teezer needs your photos to make a story.</Text>
                <Pressable onPress={() => void Linking.openSettings()} style={styles.emptyBtn} accessibilityRole="button">
                  <Text style={styles.emptyBtnText}>Open Settings</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}><Text style={styles.emptyText}>Nothing here yet.</Text></View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void choose(item)}
              style={[styles.cell, { width: tile, height: tile }]}
              accessibilityRole="imagebutton"
              accessibilityLabel={item.mediaType === MediaLibrary.MediaType.video ? "Video" : "Photo"}
            >
              <Image source={{ uri: item.uri }} style={styles.cellImg} contentFit="cover" transition={90} />
              {item.mediaType === MediaLibrary.MediaType.video && (
                <View style={styles.durTag}>
                  <VideoTagGlyph />
                  <Text style={styles.durText}>{clock(item.duration ?? 0)}</Text>
                </View>
              )}
            </Pressable>
          )}
        />
      </View>
    );
  }

  /* ── Edit ──────────────────────────────────────────────────────────────── */

  if (phase === "edit" && picked) {
    return (
      <>
        <View style={{ flex: 1 }}>
          <StoryEditor
            media={{ uri: picked.uri, isVideo: picked.isVideo }}
            overlays={overlays}
            onOverlaysChange={setOverlays}
            track={track}
            onTrackChange={setTrack}
            /* Back drops the media too: returning to the grid with a picture
               still held would leave Next pointing at something no longer on
               screen. A repost has no grid to go back to - it skipped the
               pick phase entirely - so Back just leaves the composer. */
            onBack={() => {
              if (repostOf) { onClose(); return; }
              setPicked(null);
              setOverlays([]);
              setPhase("pick");
            }}
            onNext={() => setPhase("share")}
            onUnbuilt={notBuilt}
            onPublish={() => void post("published")}
            publishing={posting}
          />
          {/* Non-removable: not part of `overlays`, so there is no delete
              control on it and it is never sent back as a layer. */}
          {repostOf && (
            <RepostAttributionPill
              user={repostOf.user}
              onPress={() => navigation.navigate("UserProfile", { username: repostOf.user.username })}
              bottom={insets.bottom + 94}
            />
          )}
        </View>
        <UploadOverlay visible={posting} />
      </>
    );
  }

  /* ── Share ─────────────────────────────────────────────────────────────── */

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Pressable
          /* Back to the canvas, not the grid - the overlays placed there are
             still on this story and must not be stranded behind the grid. */
          onPress={() => setPhase("edit")}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackGlyph />
        </Pressable>
        <Text style={styles.title}>Share your story</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.shareBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.previewCard}>
          {picked && <PreviewThumb picked={picked} />}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={styles.previewTitle}>Your story</Text>
            <View style={styles.previewMetaRow}>
              <ClockGlyph />
              <Text style={styles.previewMeta}>Visible for 24 hours</Text>
            </View>
          </View>
          {/* Back to the canvas with the media and its overlays intact - the
              editor's own back is the way to a different picture, and that is
              where dropping the overlays belongs. */}
          <Pressable
            onPress={() => setPhase("edit")}
            style={styles.editBtn}
            accessibilityRole="button"
            accessibilityLabel="Edit your story"
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>WHO CAN SEE THIS</Text>
        <View style={{ gap: 8 }}>
          {PRIVACY.map((o) => {
            const on = visibility === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => setVisibility(o.key)}
                style={[styles.privacyRow, on && styles.privacyRowOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${o.label}. ${o.sub}`}
              >
                <View style={[styles.privacyTile, on && styles.privacyTileOn]}>
                  <PrivacyGlyph which={o.key} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[styles.privacyLabel, on && styles.privacyLabelOn]} numberOfLines={1}>
                    {o.label}
                  </Text>
                  <Text style={styles.privacySub} numberOfLines={1}>
                    {/* The real count now that there is a real list. An empty one
                        says so plainly - shared to nobody is the actual outcome,
                        and a silent "0 people" would not read as a warning. */}
                    {o.key === "close_friends"
                      ? cfCount === 0
                        ? "No one on your list yet - tap Manage"
                        : `${cfCount} ${cfCount === 1 ? "person" : "people"} on your list`
                      : o.sub}
                  </Text>
                </View>
                {o.key === "close_friends" && (
                  <Pressable
                    onPress={() => {
                      // Open on what is actually saved, so the sheet starts from
                      // the truth rather than the last thing that was cancelled.
                      setCfPicked(new Set((closeFriends.data ?? []).map((u) => u.id)));
                      setCfQuery("");
                      setCfOpen(true);
                    }}
                    hitSlop={6}
                    style={styles.managePill}
                    accessibilityRole="button"
                  >
                    <Text style={styles.managePillText}>Manage</Text>
                  </Pressable>
                )}
                <View style={[styles.radio, on && styles.radioOn]}>{on && <TickGlyph />}</View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>STORY CONTROLS</Text>
        <View style={styles.controlCard}>
          {CONTROLS.map((c, i) => {
            const value =
              c.key === "replies" ? allowReplies : c.key === "sharing" ? allowSharing : aiGenerated;
            const set =
              c.key === "replies"
                ? setAllowReplies
                : c.key === "sharing"
                  ? setAllowSharing
                  : setAiGenerated;
            // The AI-generated flag is a fact about the ORIGINAL media, not
            // something the reposter gets to editorialise - a repost must
            // neither hide a real AI disclosure nor invent one for content
            // that wasn't. Locked to whatever the original actually was for
            // the whole life of this repost, in both directions.
            const aiLocked = c.key === "ai" && !!repostOf;
            return (
              <View key={c.key} style={[styles.controlRow, i > 0 && styles.controlRowDivided]}>
                <View style={styles.controlTile}><ControlGlyph which={c.key} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.controlLabel} numberOfLines={1}>{c.label}</Text>
                  <Text style={styles.controlSub} numberOfLines={1}>
                    {aiLocked ? "Carried over from the original Story - can't be changed here" : c.sub}
                  </Text>
                </View>
                <Switch
                  value={value}
                  onValueChange={aiLocked ? undefined : set}
                  disabled={aiLocked}
                  trackColor={{ true: ACCENT, false: "#D8D4DD" }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel={c.label}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Close-friends picker. Everyone you follow, searchable, with the current
          list ticked. Saving replaces the whole set - see profileApi. */}
      <BottomSheet visible={cfOpen} onClose={() => setCfOpen(false)} height={0.75}>
        <View style={styles.cfHead}>
          <Text style={styles.cfTitle}>Close friends</Text>
          <Text style={styles.cfCount}>{cfPicked.size} selected</Text>
        </View>
        <View style={styles.cfSearchWrap}>
          <TextInput
            value={cfQuery}
            onChangeText={setCfQuery}
            placeholder="Search people you follow"
            placeholderTextColor={FAINT}
            style={styles.cfSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {following.isLoading ? (
          <View style={styles.cfCenter}><ActivityIndicator color={ACCENT} /></View>
        ) : following.isError ? (
          <Text style={styles.cfEmpty}>Couldn&apos;t load the people you follow.</Text>
        ) : (
          (following.data ?? [])
            .filter((u) => {
              const q = cfQuery.trim().toLowerCase();
              if (!q) return true;
              return (u.username ?? "").toLowerCase().includes(q)
                || (u.name ?? "").toLowerCase().includes(q);
            })
            .map((u) => {
              const on = cfPicked.has(u.id);
              return (
                <Pressable
                  key={u.id}
                  onPress={() =>
                    setCfPicked((prev) => {
                      // New Set, not a mutation - React compares by identity.
                      const next = new Set(prev);
                      if (next.has(u.id)) next.delete(u.id);
                      else next.add(u.id);
                      return next;
                    })
                  }
                  style={styles.cfRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={u.name || u.username}
                >
                  {u.avatar ? (
                    <Image source={{ uri: u.avatar }} style={styles.cfAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.cfAvatar, styles.cfAvatarFallback]}>
                      <Text style={styles.cfInitial}>
                        {(u.name || u.username || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cfName} numberOfLines={1}>{u.name || u.username}</Text>
                    <Text style={styles.cfHandle} numberOfLines={1}>@{u.username}</Text>
                  </View>
                  <View style={[styles.cfCheck, on && styles.cfCheckOn]}>{on && <TickGlyph />}</View>
                </Pressable>
              );
            })
        )}

        <View style={[styles.cfFooter, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            onPress={() => {
              setCfSaving(true);
              profileApi
                .setCloseFriends(Array.from(cfPicked))
                .then(() => {
                  void qc.invalidateQueries({ queryKey: ["close-friends"] });
                  setCfOpen(false);
                })
                .catch(() => Alert.alert("Not saved", "Couldn't save your list. Try again."))
                .finally(() => setCfSaving(false));
            }}
            disabled={cfSaving}
            style={[styles.postBtn, cfSaving && styles.postBtnOff]}
            accessibilityRole="button"
          >
            {cfSaving
              ? <ActivityIndicator color={ds.onDark} />
              : <Text style={styles.postBtnText}>Save list</Text>}
          </Pressable>
        </View>
      </BottomSheet>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={() => void post("published")}
          disabled={!picked || posting}
          style={[styles.postBtn, (!picked || posting) && styles.postBtnOff]}
          accessibilityRole="button"
        >
          {posting
            ? <ActivityIndicator color={ds.onDark} />
            : <Text style={styles.postBtnText}>Share to story</Text>}
        </Pressable>
        {/* A real status on POST /stories, not a local shelf - the story is
            created as a draft and simply never published. Not offered for a
            repost: POST /stories/{id}/repost has no draft status - it always
            publishes (see StoryController::repost). */}
        {!repostOf && (
          <Pressable
            onPress={() => void post("draft")}
            disabled={!picked || posting}
            hitSlop={6}
            style={styles.draftBtn}
            accessibilityRole="button"
          >
            <Text style={styles.draftText}>Save as draft instead</Text>
          </Pressable>
        )}
      </View>

      <UploadOverlay visible={posting} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },

  /* Above the canvas AND the share-phase UI - StyleSheet.absoluteFill inside
     each phase's own root rather than a portal, since both phases already
     render this as their own last sibling. */
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,9,12,.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  uploadOverlayLottie: { width: 220, height: 150 },
  uploadOverlayText: { marginTop: 4, fontSize: 15, fontWeight: "700", color: "#fff" },

  repostPillWrap: { position: "absolute", left: 14, right: 14 },
  repostPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7,
    maxWidth: "80%", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: "rgba(10,9,12,.55)",
  },
  repostPillAvatar: { width: 20, height: 20, borderRadius: 999, backgroundColor: "rgba(255,255,255,.25)" },
  repostPillAvatarFallback: { alignItems: "center", justifyContent: "center" },
  repostPillInitial: { fontSize: 10, fontWeight: "800", color: "#fff" },
  repostPillText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  header: { paddingHorizontal: 18, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 12 },
  circleBtn: {
    width: 38, height: 38, borderRadius: 999, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontSize: 19, fontWeight: "800", color: INK, letterSpacing: -0.5 },
  albumChip: { backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  albumText: { fontSize: 12, fontWeight: "700", color: INK },

  gridContent: { paddingHorizontal: 18, paddingBottom: 26, gap: 5 },
  gridHeader: { paddingTop: 18, gap: 18, paddingBottom: 18 },

  tiles: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1, aspectRatio: 1, borderRadius: 20, borderWidth: 1, borderColor: LINE,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 9,
  },
  tileIcon: {
    width: 46, height: 46, borderRadius: 999, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontSize: 12.5, fontWeight: "800", color: INK },

  tabRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabs: { flex: 1, flexDirection: "row", gap: 5, backgroundColor: CHIP, padding: 3, borderRadius: 999 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  tabOn: { backgroundColor: "#fff" },
  tabText: { fontSize: 12, fontWeight: "700", color: MUTED },
  tabTextOn: { color: INK },
  count: { fontSize: 11.5, fontWeight: "700", color: FAINT },

  cell: { borderRadius: 10, overflow: "hidden", backgroundColor: CHIP },
  cellImg: { width: "100%", height: "100%" },
  durTag: { position: "absolute", bottom: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  durText: { fontSize: 9.5, fontWeight: "700", color: "#fff" },

  empty: { paddingVertical: 60, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: INK },
  emptyText: { fontSize: 12.5, color: MUTED, textAlign: "center" },
  emptyBtn: { marginTop: 6, backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  emptyBtnText: { fontSize: 12.5, fontWeight: "800", color: INK },

  /** contentContainerStyle now - the body scrolls, so it must not be flex:1. */
  shareBody: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20, gap: 16 },
  previewCard: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14,
    borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderColor: LINE,
  },
  previewThumb: { width: 46, height: 60, borderRadius: 10, backgroundColor: CHIP },
  previewTitle: { fontSize: 14, fontWeight: "800", color: INK, letterSpacing: -0.2 },
  previewMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  previewMeta: { fontSize: 11.5, color: MUTED },
  editBtn: { backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  editBtnText: { fontSize: 11.5, fontWeight: "700", color: INK },

  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, color: FAINT, paddingTop: 6 },

  privacyRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12,
    borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: "#fff",
  },
  privacyRowOn: { borderColor: ACCENT, backgroundColor: ACCENT_WASH },
  privacyTile: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  privacyTileOn: { backgroundColor: "#FFFFFF" },
  privacyLabel: { fontSize: 13.5, fontWeight: "700", color: INK },
  privacyLabelOn: { color: ACCENT },
  privacySub: { fontSize: 11.5, color: MUTED },
  /** The design's pill on the close-friends row. */
  managePill: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: "#FBD9E3",
  },
  managePillText: { fontSize: 11, fontWeight: "800", color: ACCENT },
  radio: {
    width: 21, height: 21, borderRadius: 999, borderWidth: 2, borderColor: "#DCD8E0",
    alignItems: "center", justifyContent: "center",
  },
  /** Selected reads as a filled tick, not a dot - see the design. */
  radioOn: { borderColor: ACCENT, backgroundColor: ACCENT },

  controlCard: {
    borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: "#fff", overflow: "hidden",
  },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  controlRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  controlTile: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  controlLabel: { fontSize: 13.5, fontWeight: "700", color: INK },
  controlSub: { fontSize: 11.5, color: MUTED },

  footer: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  cfHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 8 },
  cfTitle: { fontSize: 17, fontWeight: "800", color: INK },
  cfCount: { fontSize: 12.5, fontWeight: "700", color: ACCENT },
  cfSearchWrap: { paddingHorizontal: 18, paddingBottom: 10 },
  cfSearch: { height: 42, borderRadius: 12, backgroundColor: CHIP, paddingHorizontal: 14, fontSize: 14, color: INK },
  cfCenter: { paddingVertical: 40, alignItems: "center" },
  cfEmpty: { paddingHorizontal: 18, paddingVertical: 26, fontSize: 13, color: MUTED, textAlign: "center" },
  cfRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9 },
  cfAvatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: CHIP },
  cfAvatarFallback: { alignItems: "center", justifyContent: "center" },
  cfInitial: { fontSize: 16, fontWeight: "800", color: MUTED },
  cfName: { fontSize: 14, fontWeight: "700", color: INK },
  cfHandle: { marginTop: 2, fontSize: 12, color: MUTED },
  cfCheck: {
    width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: "#DCD8E0",
    alignItems: "center", justifyContent: "center",
  },
  cfCheckOn: { borderColor: ACCENT, backgroundColor: ACCENT },
  cfFooter: { paddingHorizontal: 18, paddingTop: 10 },

  draftBtn: { alignSelf: "center", paddingVertical: 12 },
  draftText: { fontSize: 13, fontWeight: "700", color: MUTED },
  postBtn: {
    height: 50, borderRadius: 999, backgroundColor: ds.accent,
    alignItems: "center", justifyContent: "center",
  },
  postBtnOff: { opacity: 0.45 },
  postBtnText: { fontSize: 15, fontWeight: "800", color: ds.onDark },
});
