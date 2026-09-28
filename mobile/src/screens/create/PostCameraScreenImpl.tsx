import { File } from "expo-file-system";
import { haptics } from "@/services/haptics";
import { MusicEditorSheet, type MusicEditorValue } from "./MusicEditorSheet";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library/legacy";
import { useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect, SvgXml } from "react-native-svg";
import {
  MessageCircle, Users, Scissors, Download, UserSearch, ShieldCheck, Link2,
  Laugh, PersonStanding, Music, Plane, UtensilsCrossed, Shirt, Sparkles, Coffee,
  Dumbbell, Trophy, Gamepad2, GraduationCap, Cpu, Briefcase, Flame, Newspaper,
  Clapperboard, Video as VlogIcon, Palette, Camera, PawPrint, Trees, Car,
  HeartPulse, Hammer, Heart, ChefHat, Star, BookOpen, Feather, MoreHorizontal,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react-native";
import { ds } from "@/theme/design";
import { COMMIT_FRACTION, COMMIT_VELOCITY, SETTLE_MS } from "@/store/creator-layer.store";
import { useUploadStore } from "@/store/upload.store";
import { navigationRef } from "@/navigation/ref";
import { BottomSheet } from "@/components/BottomSheet";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { musicApi, fmtTrackTime, type MusicTrack } from "@/api/music.api";
import { prefsApi, type UploadPreferences } from "@/api/prefs.api";
import { SoundBrowsePage, type SoundBrowsePageHandle } from "./SoundBrowsePage";
import { videoApi, MULTIPART_THRESHOLD_BYTES } from "@/api/video.api";
import { apiErrorMessage } from "@/api/client";
import { locationApi } from "@/api/location.api";
import { searchApi, type SearchUser } from "@/api/search.api";
import { studioApi, type ContentStatus } from "@/api/studio.api";
import { profileApi } from "@/api/profile.api";
import { shopInventoryApi, type SellerProduct } from "@/api/shop-inventory.api";
import { renderMentionText, activeMentionToken, completeMention } from "@/utils/mentions";
import { EditorCanvas } from "@/features/editor/EditorCanvas";
import { BUILT_IN_FILTERS, DEFAULT_FILTER_KEY, findFilter, orderedFilters } from "@/features/editor/filters";
import { composeParams, neutralAdjustments } from "@/features/editor/adjustments";
import { TeezerLiveCamera, type TeezerLiveCameraHandle } from "@/features/camera/TeezerLiveCamera";
import { FilterCarousel } from "@/features/camera/FilterCarousel";
import { FILTER_CATEGORY_COLOR } from "@/features/camera/filterSwatchColors";
import type { Video } from "@/types";

/**
 * New post - a real in-app camera (live preview, record/capture, flip,
 * flash, sound, timer, gallery), styled to the TikTok-shaped reference the
 * design was given: a top sound pill, a right-hand tool rail, a duration/mode
 * row, and a LIVE / POST / CREATE strip at the foot.
 *
 * Three phases, one screen: CAMERA (default) -> GRID (the gallery shortcut,
 * same picker as StoryUploadScreen's PICK phase) -> COMPOSE (caption, Post).
 *
 * What is real: photo/video capture, front/back flip, flash, the 15s/60s
 * duration cap, the timer's countdown, the sound picker (real trending
 * tracks), the gallery shortcut, and LIVE (routes to the real CreateSpace).
 * What is not: Templates, Effects/Beauty, Filters, the dual-preset shortcut
 * by the shutter, 10-minute recording, Text posts, and CREATE - each says so
 * on tap, the same honest `notBuilt` pattern StoryUploadScreen's editor uses,
 * rather than sitting there doing nothing. There is still no POST /videos
 * endpoint, and the new Skia editor (features/editor/) has no picker or
 * publish screen around it - wiring either in is a separate, much larger
 * piece of work than this screen.
 *
 * This file is the real implementation - PostCameraScreen.tsx (same folder)
 * just re-exports it under the name RootNavigator.tsx imports. It uses
 * expo-camera (directly, and via TeezerLiveCamera), which ships inside Expo
 * Go, so there is no availability gate to carry the way there used to be.
 */

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const INK = "#121014";
const MUTED = "#8A8592";
const FAINT = "#B6B1BE";
const LINE = "#EFECF1";
const CHIP = "#F4F2F5";
/** The reference design's exact brand red (#FE2C55) - deliberately its own
 *  local constant rather than ds.accent (#F42B5B, a close but different
 *  hex this screen used before), scoped to this one screen only so the
 *  capture flow matches the supplied design pixel-for-pixel without
 *  changing the shared design token every other screen still uses. */
const RED = "#FE2C55";
const PAGE = 60;
/** Width of the flip+flash cluster (36 + 8 gap + 36). The close button's
 *  slot is padded out to match so the sound pill between them - centered
 *  via `justifyContent: "space-between"` on the top bar - lands on the
 *  screen's true center instead of skewing toward whichever side is
 *  narrower. */
const TOP_SIDE_W = 80;
/** Width of the filter carousel's fixed viewport. The shutter row's left
 *  spacer is padded out to match, same symmetric-flanking trick as
 *  TOP_SIDE_W above, so the shutter stays dead-center instead of drifting
 *  toward the narrower side. */
const SHUTTER_SIDE_W = 140;

type Phase = "camera" | "grid" | "edit" | "compose" | "category" | "mediaSafety" | "captionEditor" | "location" | "tagPeople" | "sound" | "collab" | "products";
type CaptureMode = "picture" | "video";
type DurationKey = "2m" | "60s" | "15s";
type MediaTab = "all" | "photo" | "video";
// What the foot bar shows, and what its left/right swipe steps through - the
// two must match, or a gesture can land on a tab with no button.
const FOOT_TABS = ["live", "post", "create"] as const;
type FootTab = (typeof FOOT_TABS)[number];

const DURATIONS: { key: DurationKey; label: string; seconds: number | null }[] = [
  // 2m replaces the old 10m, which was a dead option routed to notBuilt. This
  // one is real: the limit is just the number the progress ring fills against
  // and the recorder auto-stops on, so 120 behaves exactly as 60 and 15 do.
  { key: "2m",  label: "2m",  seconds: 120 },
  { key: "60s", label: "60s", seconds: 60 },
  { key: "15s", label: "15s", seconds: 15 },
];

/** The capture-mode row above the shutter: the three video lengths plus
 *  Photos. Order is also what the row's swipe steps through, so the two cannot
 *  disagree. */
const CAPTURE_MODES = [
  { key: "2m",    label: "2m"     },
  { key: "60s",   label: "60s"    },
  { key: "15s",   label: "15s"    },
  { key: "photo", label: "Photos" },
] as const;
const TIMER_OPTIONS = [0, 3, 10] as const;

/**
 * The camera tool rail, in display order.
 *
 * The first RAIL_COLLAPSED_COUNT are what the collapsed rail shows; the rest
 * appear only once it is expanded. Order therefore matters - it is the ranking
 * of what a creator reaches for most.
 *
 * `real: false` marks a tool whose UI exists but whose feature does not, so it
 * routes to notBuilt() rather than pretending. Kept in the list deliberately:
 * the rail is the discoverable surface for what is coming, and silently
 * omitting them would make the rail change shape as each lands.
 */
const RAIL_COLLAPSED_COUNT = 4;

/** Recovers the touch target the tightened spacing costs. The 1.5 scale on the
 *  icons is a paint-time transform - it does not enlarge the hit area, which
 *  stays the 32pt layout box. */
const RAIL_HIT_SLOP = { top: 6, bottom: 6, left: 10, right: 10 };

/** Light tap for the camera's own controls, matching the feed's existing use
 *  (HomeScreen/FeedVideoItem). Always .catch()ed - a device without a taptic
 *  engine rejects, and a missing buzz must never surface as an error. */
/* Haptics for this screen, named by what they MEAN so the call sites read as
 * intent. All three go through the shared service (src/services/haptics.ts),
 * which is backed by nitro: synchronous, JSI, and holding prepared generators
 * natively.
 *
 * That last part is why the warm-up scaffolding this file used to carry is gone.
 * expo-haptics built a cold UIImpactFeedbackGenerator per call, and iOS drops or
 * weakens a cold generator's first impact - so this screen had a mount warm-up,
 * a per-gesture warm-up, and onPressIn ticks on four controls, all of them
 * working around that. None of it is needed once the generator is kept warm on
 * the native side. */

/** A choice among several - capture mode, a tool, the gallery, a foot tab. */
function tapFeedback() {
  haptics.light();
}

/** A panel arriving or leaving - the sound sheet, the tool rail. Weightier than
 *  a selection because considerably more of the screen changes. */
function panelFeedback() {
  haptics.medium();
}

/** The mode row has nothing further in that direction. `soft` is exactly this:
 *  a cushioned edge, felt as a wall rather than as a move that failed to
 *  register. */
function edgeFeedback() {
  haptics.soft();
}

const TOOLS = [
  { key: "flip",         label: "Flip camera",    real: true  },
  { key: "flash",        label: "Flashlight",     real: true  },
  { key: "timer",        label: "Timer",          real: true  },
  { key: "filters",      label: "Filters",        real: true  },
  { key: "speed",        label: "Speed",          real: true  },
  { key: "layout",       label: "Layout",         real: false },
  { key: "retouch",      label: "Retouch",        real: false },
  { key: "templates",    label: "Templates",      real: false },
  { key: "teleprompter", label: "Teleprompter",   real: false },
  { key: "voice",        label: "Voice Effects",  real: false },
] as const;

type ToolKey = (typeof TOOLS)[number]["key"];

/** Rail icon per tool. A function rather than a field on TOOLS because two of
 *  them are stateful - the flash glyph reflects on/off, and Speed renders its
 *  current multiplier as text rather than an icon. */
function toolGlyph(key: ToolKey, ctx: { flashOn: boolean }) {
  switch (key) {
    case "flip":         return <CameraFlipGlyph />;
    case "flash":        return <FlashGlyph on={ctx.flashOn} />;
    case "timer":        return <TimerGlyph />;
    case "filters":      return <FiltersGlyph />;
    case "speed":        return <SpeedGlyph />;
    case "layout":       return <LayoutGlyph />;
    case "retouch":      return <RetouchGlyph />;
    case "templates":    return <TemplatesGlyph />;
    case "teleprompter": return <TeleprompterGlyph />;
    case "voice":        return <VoiceEffectsGlyph />;
  }
}
const SPEEDS = ["0.3x", "0.5x", "1x", "2x", "3x"] as const;
const TABS: { key: MediaTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
];

/** Same 31-item list the website's own upload page uses
 *  (frontend/src/features/upload/types.ts CATEGORY_OPTIONS) - a video
 *  post's category, not the (different, ~140-item) list EditCategoryScreen
 *  uses for a creator's own profile category. */
const CATEGORY_OPTIONS = [
  "Comedy", "Dance", "Music", "Travel & Nature", "Food", "Fashion", "Beauty",
  "Lifestyle", "Fitness", "Sports", "Gaming", "Education", "Technology",
  "Business", "Motivation", "News", "Entertainment", "Vlog", "Art",
  "Photography", "Animals & Pets", "Nature", "Cars & Bikes", "Health",
  "DIY & Crafts", "Family", "Relationships", "Cooking", "Reviews",
  "Tutorials", "Religious / Spiritual", "Other",
] as const;

/** One icon per category - every row in the picker used to render the exact
 *  same generic tag glyph regardless of which category it was. */
const CATEGORY_ICONS: Record<(typeof CATEGORY_OPTIONS)[number], LucideIcon> = {
  "Comedy": Laugh,
  "Dance": PersonStanding,
  "Music": Music,
  "Travel & Nature": Plane,
  "Food": UtensilsCrossed,
  "Fashion": Shirt,
  "Beauty": Sparkles,
  "Lifestyle": Coffee,
  "Fitness": Dumbbell,
  "Sports": Trophy,
  "Gaming": Gamepad2,
  "Education": GraduationCap,
  "Technology": Cpu,
  "Business": Briefcase,
  "Motivation": Flame,
  "News": Newspaper,
  "Entertainment": Clapperboard,
  "Vlog": VlogIcon,
  "Art": Palette,
  "Photography": Camera,
  "Animals & Pets": PawPrint,
  "Nature": Trees,
  "Cars & Bikes": Car,
  "Health": HeartPulse,
  "DIY & Crafts": Hammer,
  "Family": Users,
  "Relationships": Heart,
  "Cooking": ChefHat,
  "Reviews": Star,
  "Tutorials": BookOpen,
  "Religious / Spiritual": Feather,
  "Other": MoreHorizontal,
};

/**
 * "Add link" -> Teezer Product's "Recommended for this post" sort - maps
 * this post's own video category to the closest of the platform's 20
 * admin-managed Shop categories (`shop_categories`, a separate taxonomy -
 * see ShopController::categories). A hint only: a category with no entry
 * here (or a shop with no matching products) sorts however the list
 * otherwise would, never hidden or restricted - this never filters which
 * products a creator can pick, only which ones surface first.
 */
const VIDEO_TO_SHOP_CATEGORY: Partial<Record<(typeof CATEGORY_OPTIONS)[number], string>> = {
  "Fashion": "Fashion",
  "Beauty": "Beauty",
  "Technology": "Electronics",
  "Photography": "Electronics",
  "Sports": "Sports & Outdoors",
  "Fitness": "Sports & Outdoors",
  "Education": "Books & Stationery",
  "Tutorials": "Books & Stationery",
  "Food": "Groceries & Food",
  "Cooking": "Groceries & Food",
  "Family": "Baby & Kids",
  "Cars & Bikes": "Automotive",
  "Health": "Health & Wellness",
  "Animals & Pets": "Pet Supplies",
  "Art": "Art & Crafts",
  "DIY & Crafts": "Art & Crafts",
  "Music": "Music & Instruments",
};

/** Category-aware suggestion copy for the external-link form - same
 *  "recommend, never restrict" rule as the product picker above. A category
 *  with no entry here just shows the plain generic hint. */
const LINK_SUGGESTIONS: Partial<Record<(typeof CATEGORY_OPTIONS)[number], string>> = {
  "Travel & Nature": "Add a travel article or destination guide.",
  "Food": "Add a recipe, review, or restaurant page.",
  "Cooking": "Add a recipe, review, or restaurant page.",
  "Technology": "Add a review, spec sheet, or product page.",
  "Fashion": "Add a lookbook, collection page, or article.",
  "Beauty": "Add a routine, review, or product page.",
  "Fitness": "Add a program, guide, or class page.",
  "Health": "Add a program, guide, or class page.",
  "Education": "Add a course, guide, or resource page.",
  "Tutorials": "Add a course, guide, or resource page.",
  "Music": "Add a release, playlist, or artist page.",
  "News": "Add the full story or source article.",
  "Business": "Add a case study, article, or company page.",
};

/**
 * The filter carousel's catalog - the SAME 27 presets, and the SAME
 * `RenderParams`/SkSL colour pipeline, as the media editor
 * (src/features/editor/). Picking a filter here is picking a real,
 * GPU-rendered look - rendered starting at the edit-phase preview below,
 * through the exact same shader the editor itself uses. The live camera feed
 * (features/camera/TeezerLiveCamera.tsx) shows it unfiltered: that used to
 * run through a Skia frame processor when the camera engine was
 * react-native-vision-camera, but expo-camera has no raw-frame access to
 * hook a live filter into.
 */
const CAMERA_FILTER_LIST = orderedFilters(BUILT_IN_FILTERS);
/** The right-hand tool rail's icon size - a notch below the filter
 *  carousel's own thumbnail size (features/camera/FilterCarousel.tsx) so the
 *  rail's up-to-8 rows (5 default + Retouch/More + the chevron) fit inside
 *  its measured top<->bottom bound once expanded, without spilling into the
 *  top bar or the bottom stack on smaller screens. */
const RAIL_ICON_W = 34;

/** durationSec is only known for a video (real: elapsed recording time, or
 *  the picked asset's own duration) - a photo has none. */
/**
 * width/height: the picked media's real pixel dimensions, when the source
 * actually reports them - threaded straight through to completeUpload()
 * so the server can store real aspect_ratio instead of null. Without
 * this, every post (photo or video) landed with width/height = null in
 * the DB, and the feed's own isNineSixteen() check (FeedVideoItem.tsx)
 * had nothing to go on but its "assume 9:16 until proven otherwise"
 * fallback - which happens to be right for most videos on a vertical-
 * video app, but wrong for a landscape or square PHOTO, which then got
 * incorrectly cover-cropped/zoomed instead of shown uncropped.
 */
type Picked = { uri: string; name: string; isVideo: boolean; durationSec?: number; width?: number; height?: number };

/* ── Icons - stroked white/onDark, drawn over the live preview ───────────── */

function CloseGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function MusicNoteGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx={7} cy={17} r={3} fill={color} />
      <Circle cx={17} cy={15} r={3} fill={color} />
      <Path d="M10 17V5l10-2v10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Camera-flip icon - the user's own asset
 * (mobile/src/assets/camera-flip-svgrepo-com.svg), used as provided.
 *
 * Inlined as XML and drawn with SvgXml because this project has no metro SVG
 * transformer, so an .svg cannot be imported as a component. Same approach
 * FeedHeader already uses for feddliveiconS.svg.
 *
 * Recoloured from the file's black to white at build of this string: the rail
 * floats over a live camera feed, where black is invisible against anything
 * dark.
 */
const CAMERA_FLIP_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M21.8839 9.38388C22.372 8.89573 22.372 8.10427 21.8839 7.61612C21.3957 7.12796 20.6043 7.12796 20.1161 7.61612L21.8839 9.38388ZM18 11.5L17.1161 12.3839C17.3505 12.6183 17.6685 12.75 18 12.75C18.3315 12.75 18.6495 12.6183 18.8839 12.3839L18 11.5ZM15.8839 7.61612C15.3957 7.12796 14.6043 7.12796 14.1161 7.61612C13.628 8.10427 13.628 8.89573 14.1161 9.38388L15.8839 7.61612ZM4.75 8.5C4.75 9.19036 5.30964 9.75 6 9.75C6.69036 9.75 7.25 9.19036 7.25 8.5L4.75 8.5ZM18 5.5L19.25 5.5L18 5.5ZM20.1161 7.61612L17.1161 10.6161L18.8839 12.3839L21.8839 9.38388L20.1161 7.61612ZM18.8839 10.6161L15.8839 7.61612L14.1161 9.38388L17.1161 12.3839L18.8839 10.6161ZM19.25 11.5L19.25 5.5L16.75 5.5L16.75 11.5L19.25 11.5ZM17 3.25L7 3.25L7 5.75L17 5.75L17 3.25ZM4.75 5.5L4.75 8.5L7.25 8.5L7.25 5.5L4.75 5.5ZM7 3.25C5.75736 3.25 4.75 4.25736 4.75 5.5L7.25 5.5C7.25 5.63807 7.13807 5.75 7 5.75L7 3.25ZM19.25 5.5C19.25 4.25736 18.2426 3.25 17 3.25L17 5.75C16.8619 5.75 16.75 5.63807 16.75 5.5L19.25 5.5Z\" fill=\"#ffffff\"/> <path d=\"M3 15.5L6 12.5M6 12.5L9 15.5M6 12.5V18.5C6 19.0523 6.44772 19.5 7 19.5H17C17.5523 19.5 18 19.0523 18 18.5V15.5\" stroke=\"#ffffff\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>";

/**
 * Templates icon - the user's own asset, used as provided (recoloured from the
 * file's black to white for the rail, which sits over a live camera feed).
 */
const TEMPLATES_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 16 16\"><path fill=\"#ffffff\" fill-rule=\"evenodd\" d=\"M13.5 2.5h-11V5h11zm0 4h-7v7h7zM5 6.5H2.5v7H5zM2.5 1H1v14h14V1z\" clip-rule=\"evenodd\"/></svg>";

function TemplatesGlyph() {
  return <SvgXml xml={TEMPLATES_SVG} width={20} height={20} />;
}

/**
 * Dropdown arrow - the user's own asset. Its `fill="currentColor"` is replaced
 * with an explicit white: SvgXml has no cascading colour to inherit, so
 * currentColor would resolve to black and vanish against the camera.
 *
 * One asset serves both directions - `up` rotates it 180 for Collapse, so the
 * two chevrons can never drift apart visually.
 */
const DROPDOWN_ARROW_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"#ffffff\"><path d=\"M12 15.6315L20.9679 10.8838L20.0321 9.11619L12 13.3685L3.9679 9.11619L3.03212 10.8838L12 15.6315Z\"></path></svg>";

function DropdownArrowGlyph({ up = false }: { up?: boolean }) {
  return (
    <View style={up ? styles.arrowUp : undefined}>
      <SvgXml xml={DROPDOWN_ARROW_SVG} width={22} height={22} />
    </View>
  );
}

/**
 * Teleprompter icon - the user's own asset, used as provided. Recoloured from
 * the file's black (three separate fills) to white for the rail.
 */
const TELEPROMPTER_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 512 512\"><path fill=\"#ffffff\" fill-rule=\"evenodd\" d=\"M331.52 117.547c0 41.386-33.707 74.88-74.88 74.88c-41.387 0-74.88-33.494-74.88-74.88c0-41.387 33.493-74.88 74.88-74.88s74.88 33.493 74.88 74.88m-42.667 0c0-17.707-14.506-32.214-32.213-32.214s-32.213 14.507-32.213 32.214c0 17.706 14.506 32.213 32.213 32.213s32.213-14.507 32.213-32.213\" clip-rule=\"evenodd\"/><path fill=\"#ffffff\" d=\"M209.92 330.24h1.067v1.067h-1.067zm93.227 0h-1.067v1.067h1.067zm12.8.213h-1.067v1.067h1.067z\"/><path fill=\"#ffffff\" fill-rule=\"evenodd\" d=\"M256.64 232.96L64 136.533v236.374l192.64 96.426l192.64-96.426V136.533zm-149.973-27.52l128.64 64.427V410.88l-128.64-64.427zm299.946 141.013l-128.64 64.427V269.867l128.64-64.427z\" clip-rule=\"evenodd\"/></svg>";

function TeleprompterGlyph() {
  return <SvgXml xml={TELEPROMPTER_SVG} width={21} height={21} />;
}

/** Speed icon - the user's own asset, recoloured for the rail. */
const SPEED_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path fill=\"#ffffff\" d=\"M7 17v-2h2v2zm3 0v-2h4v-2h-4V7h6v2h-4v2h2q.825 0 1.413.588T16 13v2q0 .825-.587 1.413T14 17z\"/></svg>";

function SpeedGlyph() {
  return <SvgXml xml={SPEED_SVG} width={22} height={22} />;
}

/** Voice Effects icon - the user's own asset. Its fill="currentColor" is
 *  replaced with explicit white: SvgXml has no cascading colour to inherit. */
const VOICE_EFFECTS_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"#ffffff\"><path d=\"M20.7134 7.12811L20.4668 7.69379C20.2864 8.10792 19.7136 8.10792 19.5331 7.69379L19.2866 7.12811C18.8471 6.11947 18.0555 5.31641 17.0677 4.87708L16.308 4.53922C15.8973 4.35653 15.8973 3.75881 16.308 3.57612L17.0252 3.25714C18.0384 2.80651 18.8442 1.97373 19.2761 0.930828L19.5293 0.319534C19.7058 -0.106511 20.2942 -0.106511 20.4706 0.319534L20.7238 0.930828C21.1558 1.97373 21.9616 2.80651 22.9748 3.25714L23.6919 3.57612C24.1027 3.75881 24.1027 4.35653 23.6919 4.53922L22.9323 4.87708C21.9445 5.31641 21.1529 6.11947 20.7134 7.12811ZM9 2C13.0675 2 16.426 5.03562 16.9337 8.96494L19.1842 12.5037C19.3324 12.7367 19.3025 13.0847 18.9593 13.2317L17 14.071V17C17 18.1046 16.1046 19 15 19H13.001L13 22H4L4.00025 18.3061C4.00033 17.1252 3.56351 16.0087 2.7555 15.0011C1.65707 13.6313 1 11.8924 1 10C1 5.58172 4.58172 2 9 2ZM9 4C5.68629 4 3 6.68629 3 10C3 11.3849 3.46818 12.6929 4.31578 13.7499C5.40965 15.114 6.00036 16.6672 6.00025 18.3063L6.00013 20H11.0007L11.0017 17H15V12.7519L16.5497 12.0881L15.0072 9.66262L14.9501 9.22118C14.5665 6.25141 12.0243 4 9 4ZM19.4893 16.9929L21.1535 18.1024C22.32 16.3562 23 14.2576 23 12.0001C23 11.317 22.9378 10.6486 22.8186 10L20.8756 10.5C20.9574 10.9878 21 11.489 21 12.0001C21 13.8471 20.4436 15.5642 19.4893 16.9929Z\"></path></svg>";

function VoiceEffectsGlyph() {
  return <SvgXml xml={VOICE_EFFECTS_SVG} width={21} height={21} />;
}

/** Add-sound note - the user's own asset, currentColor swapped for white. */
const ADD_SOUND_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"#ffffff\"><path d=\"M12 13.5351V3H20V6H14V17C14 19.2091 12.2091 21 10 21C7.79086 21 6 19.2091 6 17C6 14.7909 7.79086 13 10 13C10.7286 13 11.4117 13.1948 12 13.5351Z\"></path></svg>";

function AddSoundGlyph() {
  return <SvgXml xml={ADD_SOUND_SVG} width={19} height={19} />;
}

/** Cancel / close - the user's own asset, recoloured for the camera. */
const CANCEL_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path fill=\"#ffffff\" d=\"M20 6.91L17.09 4L12 9.09L6.91 4L4 6.91L9.09 12L4 17.09L6.91 20L12 14.91L17.09 20L20 17.09L14.91 12z\"/></svg>";

function CancelGlyph() {
  return <SvgXml xml={CANCEL_SVG} width={24} height={24} />;
}

function CameraFlipGlyph() {
  return <SvgXml xml={CAMERA_FLIP_SVG} width={21} height={21} />;
}

function FlashGlyph({ on }: { on: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
        stroke={on ? "#FFD54A" : "#fff"}
        fill={on ? "#FFD54A" : "none"}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {!on && <Path d="M3 3l18 18" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />}
    </Svg>
  );
}

function TimerGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M9 3h6" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={12} cy={13} r={8} stroke="#fff" strokeWidth={2.6} />
      <Path d="M12 9v4l3 2" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A single 4-point sparkle - "Effects". */
function EffectsGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2 14.2 9.8 22 12 14.2 14.2 12 22 9.8 14.2 2 12 9.8 9.8Z" fill="#fff" />
    </Svg>
  );
}

/** Three overlapping circles, Venn-style - "Filters". */
function FiltersGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={9} r={6} stroke="#fff" strokeWidth={1.6} />
      <Circle cx={15} cy={9} r={6} stroke="#fff" strokeWidth={1.6} />
      <Circle cx={12} cy={15} r={6} stroke="#fff" strokeWidth={1.6} />
    </Svg>
  );
}

/** A wand tipped with a sparkle burst - "Beauty". */
function BeautifyGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20 14 10" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <Path d="M17 3 18.4 6.6 22 8 18.4 9.4 17 13 15.6 9.4 12 8 15.6 6.6Z" fill="#fff" />
    </Svg>
  );
}

/** Small filled checkmark badge - the reference design's "Beauty" tool has
 *  one pinned to its bottom-right corner. */
function CheckBadgeGlyph() {
  return (
    <Svg width={8} height={8} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4 10-11" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A pencil - "Retouch". */
function RetouchGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"
        stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
      />
      <Path d="M13 6.5 17.5 11" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

/** A 2x2 grid - "Layout". */
function LayoutGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={8} height={8} rx={2} stroke="#fff" strokeWidth={2.5} />
      <Rect x={13} y={3} width={8} height={8} rx={2} stroke="#fff" strokeWidth={2.5} />
      <Rect x={3} y={13} width={8} height={8} rx={2} stroke="#fff" strokeWidth={2.5} />
      <Rect x={13} y={13} width={8} height={8} rx={2} stroke="#fff" strokeWidth={2.5} />
    </Svg>
  );
}

/** Three dots - "More". */
function MoreGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={2} fill="#fff" />
      <Circle cx={12} cy={12} r={2} fill="#fff" />
      <Circle cx={19} cy={12} r={2} fill="#fff" />
    </Svg>
  );
}

function GalleryGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={3} stroke="#fff" strokeWidth={1.8} />
      <Path d="m5 17 4.5-5.5 3.5 4L16.5 12 20 17" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function StopGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={5} width={14} height={14} rx={3} fill={RED} />
    </Svg>
  );
}

/**
 * The shutter's recording-progress ring - fills clockwise from the top as
 * `elapsed`/`limit` grows, the same idea as the reference design's CSS
 * conic-gradient (React Native has no equivalent, so this draws the same
 * result with an SVG stroke-dasharray/offset instead). `circumference *
 * (1 - pct)` as the dash offset is the standard technique: the dash length
 * covers the WHOLE circle, and pushing part of it off past the start
 * leaves exactly `pct` of the stroke visible.
 */
function ShutterProgressRing({ pct, size, strokeWidth }: { pct: number; size: number; strokeWidth: number }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.3)" strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={RED} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - clamped)}
        strokeLinecap="round"
        // Start at 12 o'clock, like the reference design's conic-gradient,
        // instead of SVG's default 3-o'clock start.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function BackGlyph({ color = INK }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Compose header's "Default upload setting" entry - a plain gear, same
 *  stroke weight as BackGlyph. */
function GearGlyph({ color = INK }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A circular restart arrow - "Retake", matching the reference design's
 *  post-capture review row (a different shape from BackGlyph's plain
 *  chevron above). */
function RetakeGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 1 0 3-6.7" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 4.5V10h5.5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A folder/drawer shape - "Drafts", matching the reference design. */
function DraftsGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4.5h11l3.5 3.5v11.5H5z" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.5 4.5v5h7v-5" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.5 19.5v-6h7v6" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A right-pointing chevron - the reference design's "Next" button arrow. */
function NextArrowGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="m9 6 6 6-6 6" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function VideoTagGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6.5h11v11H4zM15 11l5-3v8l-5-3z" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ── Post-capture editor rail icons ───────────────────────────────────── */

function TextToolGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16M12 5v14" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function StickerGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke="#fff" strokeWidth={1.8} />
      <Circle cx={8.5} cy={10} r={1.3} fill="#fff" />
      <Circle cx={15.5} cy={10} r={1.3} fill="#fff" />
      <Path d="M7.5 14.5c1 1.8 3 2.8 4.5 2.8s3.5-1 4.5-2.8" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function StarGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5 14.9 9 22 9.7 16.8 14.4 18.3 21.5 12 17.9 5.7 21.5 7.2 14.4 2 9.7 9.1 9Z"
        stroke="#fff" strokeWidth={1.6} strokeLinejoin="round"
      />
    </Svg>
  );
}

function MicGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={2} width={6} height={12} rx={3} stroke="#fff" strokeWidth={1.8} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LoopGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 8.5a3.5 3.5 0 1 0 0 7c2.2 0 3.6-1.6 5-3.5s2.8-3.5 5-3.5a3.5 3.5 0 1 1 0 7c-2.2 0-3.6-1.6-5-3.5S9.2 8.5 7 8.5Z"
        stroke="#fff" strokeWidth={1.7} strokeLinejoin="round"
      />
    </Svg>
  );
}

function FlagGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M5 3v18" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 4h12l-3 4 3 4H5Z" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

function VolumeGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M4 10v4h3.5L13 18V6L7.5 10H4Z" fill="#fff" />
      <Path d="M16 9.5a4 4 0 0 1 0 5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M18.5 7.5a7.5 7.5 0 0 1 0 9" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.7} />
    </Svg>
  );
}

/** The scrub bar's diagonal-hatch fill - an SVG pattern, not an image asset,
 *  so it needs its pixel size measured (onLayout), same as everything else
 *  in this file that would otherwise have to guess. */
function ScrubStripes({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <Pattern id="scrubHatch" patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
          <Rect width={10} height={10} fill={RED} />
          <Line x1={0} y1={0} x2={0} y2={10} stroke="rgba(255,255,255,0.32)" strokeWidth={4} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} rx={10} fill="url(#scrubHatch)" />
    </Svg>
  );
}

/** mm:ss, for the recording timer and the duration tag on a video tile. */
function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ── Compose (the design's "New post" screen) - icons, the toggle track,
   a small screen-local toast, and its four picker sheets (Category, Tag
   people, Location, Media & safety). Sound is its own dedicated page now
   (SoundBrowsePage, phase "sound") rather than a picker sheet here - see
   openSound/soundReturnPhase further down. ─────────────────────────────── */

function EditPencilGlyph() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
/** "Expand this into the full caption editor" - the exact glyph supplied. */
function ExpandGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="#8A8592">
      <Path d="M7 8.41421V12L5 12L5 5L12 5V7L8.41421 7L17 15.5858V12L19 12L19 19H12V17H15.5858L7 8.41421Z" />
    </Svg>
  );
}
/** "Contract the full caption editor back down" - the exact glyph
 *  supplied, replacing the generic back chevron on that screen only. */
function ContractGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#121014">
      <Path d="M18.793 5.79285 12.5859 12 18.793 18.2071 20.2072 16.7928 15.4143 12 20.2072 7.20706 18.793 5.79285ZM5.20694 18.2072 11.414 12.0001 5.20694 5.793 3.79272 7.20721 8.58562 12.0001 3.79272 16.793 5.20694 18.2072Z" />
    </Svg>
  );
}
function HashtagGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" stroke="#4A4653" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function MentionGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke="#4A4653" strokeWidth={1.9} />
      <Path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CategoryGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4.5h7v7H4zM13 4.5h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
/** The exact user-supplied collaboration_handshake_icon.svg
 *  (mobile/src/assets), reproduced as react-native-svg primitives - two
 *  overlapping rings with a handshake, stroke-based like the source. */
function CollabIconGlyph({ size = 17, color = "#4A4653" }: { size?: number; color?: string }) {
  const strokeProps = { stroke: color, strokeWidth: 18, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Circle cx={190} cy={256} r={105} {...strokeProps} />
      <Circle cx={322} cy={256} r={105} {...strokeProps} />
      <Path d="M205 250l35-31c9-8 22-9 32-2l17 12" {...strokeProps} />
      <Path d="M307 229l17-12c10-7 23-6 32 2l35 31" {...strokeProps} />
      <Path d="M221 267l31 30c8 8 21 8 29 0l11-11" {...strokeProps} />
      <Path d="M291 286l11 11c8 8 21 8 29 0l31-30" {...strokeProps} />
      <Path d="M252 297l-13 13c-7 7-18 7-25 0l-17-17" {...strokeProps} />
      <Path d="M291 297l13 13c7 7 18 7 25 0l17-17" {...strokeProps} />
      <Path d="M240 250l22 21c7 7 18 7 25 0l20-20" {...strokeProps} />
      <Path d="M218 266l15 15" {...strokeProps} />
      <Path d="M333 266l-15 15" {...strokeProps} />
    </Svg>
  );
}

function TagPeopleGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M9.5 4.5a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M2.5 20c1.4-3.2 3.8-4.8 7-4.8s5.6 1.6 7 4.8" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 8.5h4M20 6.5v4" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}
function LocationPinGlyph({ size = 17 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" stroke="#4A4653" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 12.5a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8" stroke="#4A4653" strokeWidth={1.9} />
    </Svg>
  );
}
function ClockGlyph({ color = "#4A4653" }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Path d="M12 7v5l3.5 2" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CalendarGlyph() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5.5h16v15H4z" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 3v4M16 3v4M4 10h16" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronRightGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="m9 18 6-6-6-6" stroke="#C7C2CE" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function GlobeGlyph({ on }: { on: boolean }) {
  const c = on ? ds.accent : "#4A4653";
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" stroke={c} strokeWidth={1.9} />
      <Path d="M3.5 12h17" stroke={c} strokeWidth={1.9} />
      <Path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" stroke={c} strokeWidth={1.9} />
    </Svg>
  );
}
function FollowersGlyph({ on }: { on: boolean }) {
  const c = on ? ds.accent : "#4A4653";
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4" stroke={c} strokeWidth={1.9} />
      <Path d="M4.5 20.5c1.6-3.4 4.2-5 7.5-5s5.9 1.6 7.5 5" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}
function LockGlyph({ on }: { on: boolean }) {
  const c = on ? ds.accent : "#4A4653";
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M4.5 10h15v11h-15z" stroke={c} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}
/** Remix Icon `shield-check-fill` - "copyright pre-check", transparent bg,
 *  no stroke outline. */
function ShieldGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M12 1L20.2169 2.82598C20.6745 2.92766 21 3.33347 21 3.80217V13.7889C21 15.795 19.9974 17.6684 18.3282 18.7812L12 23L5.6718 18.7812C4.00261 17.6684 3 15.795 3 13.7889V3.80217C3 3.33347 3.32553 2.92766 3.78307 2.82598L12 1ZM16.4524 8.22183L11.5019 13.1709L8.67421 10.3431L7.25999 11.7574L11.5026 16L17.8666 9.63604L16.4524 8.22183Z" />
    </Svg>
  );
}
/** Remix Icon `sparkling-2-fill` - "AI-generated content". */
function SparkleGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M17.0007 1.20825 18.3195 3.68108 20.7923 4.99992 18.3195 6.31876 17.0007 8.79159 15.6818 6.31876 13.209 4.99992 15.6818 3.68108 17.0007 1.20825ZM8.00065 4.33325 10.6673 9.33325 15.6673 11.9999 10.6673 14.6666 8.00065 19.6666 5.33398 14.6666.333984 11.9999 5.33398 9.33325 8.00065 4.33325ZM19.6673 16.3333 18.0007 13.2083 16.334 16.3333 13.209 17.9999 16.334 19.6666 18.0007 22.7916 19.6673 19.6666 22.7923 17.9999 19.6673 16.3333Z" />
    </Svg>
  );
}
/** Remix Icon `user-follow-fill` - "subject consent confirmed". */
function PersonCheckGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M13 14.0619V22H4C4 17.5817 7.58172 14 12 14C12.3387 14 12.6724 14.021 13 14.0619ZM12 13C8.685 13 6 10.315 6 7C6 3.685 8.685 1 12 1C15.315 1 18 3.685 18 7C18 10.315 15.315 13 12 13ZM17.7929 19.9142L21.3284 16.3787L22.7426 17.7929L17.7929 22.7426L14.2574 19.2071L15.6716 17.7929L17.7929 19.9142Z" />
    </Svg>
  );
}
/** A briefcase - "paid partnership". */
/** Remix Icon `briefcase-fill` - "paid partnership". */
function BriefcaseGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M7 5V2C7 1.44772 7.44772 1 8 1H16C16.5523 1 17 1.44772 17 2V5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V6C2 5.44772 2.44772 5 3 5H7ZM4 15V19H20V15H4ZM11 11V13H13V11H11ZM9 3V5H15V3H9Z" />
    </Svg>
  );
}
/** Remix Icon `closed-captioning-fill` - "auto captions". */
function CaptionsGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M21 3C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H21ZM9 8C6.792 8 5 9.792 5 12C5 14.208 6.792 16 9 16C10.1 16 11.1 15.55 11.828 14.828L10.4144 13.4144C10.0525 13.7762 9.5525 14 9 14C7.895 14 7 13.105 7 12C7 10.895 7.895 10 9 10C9.55 10 10.0483 10.22 10.4153 10.5866L11.829 9.173C11.1049 8.44841 10.1045 8 9 8ZM16 8C13.792 8 12 9.792 12 12C12 14.208 13.792 16 16 16C17.104 16 18.104 15.552 18.828 14.828L17.4144 13.4144C17.0525 13.7762 16.5525 14 16 14C14.895 14 14 13.105 14 12C14 10.895 14.895 10 16 10C16.553 10 17.0534 10.2241 17.4153 10.5866L18.829 9.173C18.1049 8.44841 17.1045 8 16 8Z" />
    </Svg>
  );
}
/** Remix Icon `vip-diamond-fill` - "high-quality upload". */
function GemGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M4.87759 3.00275H19.1319C19.4518 3.00275 19.7524 3.15583 19.9406 3.41457L23.7634 8.67097C23.9037 8.86385 23.8882 9.12895 23.7265 9.30419L12.3721 21.6047C12.1848 21.8076 11.8685 21.8203 11.6656 21.633C11.6558 21.6239 11.6464 21.6145 11.6373 21.6047L0.282992 9.30419C0.121226 9.12895 0.10575 8.86385 0.246026 8.67097L4.06886 3.41457C4.25704 3.15583 4.55766 3.00275 4.87759 3.00275Z" />
    </Svg>
  );
}
/** Remix Icon `megaphone-fill` - "eligible for promotion". */
function MegaphoneGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M21 10.063V4C21 3.44772 20.5523 3 20 3H19C17.0214 4.97864 13.3027 6.08728 11 6.61281V17.3872C13.3027 17.9127 17.0214 19.0214 19 21H20C20.5523 21 21 20.5523 21 20V13.937C21.8626 13.715 22.5 12.9319 22.5 12 22.5 11.0681 21.8626 10.285 21 10.063ZM5 7C3.89543 7 3 7.89543 3 9V15C3 16.1046 3.89543 17 5 17H6L7 22H9V7H5Z" />
    </Svg>
  );
}
/** Remix Icon `emotion-happy-fill` - "made for kids". */
function SmileyGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#4A4653">
      <Path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM7 13C7 15.7614 9.23858 18 12 18C14.7614 18 17 15.7614 17 13H15C15 14.6569 13.6569 16 12 16C10.3431 16 9 14.6569 9 13H7ZM8 11C8.82843 11 9.5 10.3284 9.5 9.5C9.5 8.67157 8.82843 8 8 8C7.17157 8 6.5 8.67157 6.5 9.5C6.5 10.3284 7.17157 11 8 11ZM16 11C16.8284 11 17.5 10.3284 17.5 9.5C17.5 8.67157 16.8284 8 16 8C15.1716 8 14.5 8.67157 14.5 9.5C14.5 10.3284 15.1716 11 16 11Z" />
    </Svg>
  );
}
function InfoGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M12 12v5M12 8h.01" stroke={FAINT} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={9} stroke={FAINT} strokeWidth={1.9} />
    </Svg>
  );
}
function SearchGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={MUTED} strokeWidth={2.1} />
      <Path d="m20.5 20.5-4.4-4.4" stroke={MUTED} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}
/** The same checkmark shape used for the "already following" badge on the
 *  feed's avatar (FeedActionRail.tsx's CheckGlyph) - parameterized here
 *  since compose needs it at several sizes/colors (radio fill, list rows). */
function CheckGlyph({ size = 11, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4 10-11" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The design's own toggle track - flexbox justify-content flip, not a
 *  translateX, so it matches its exact rendering 1:1. */
function Toggle({ on, onPress }: { on: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} hitSlop={8}>
      <View style={[composeStyles.track, on && composeStyles.trackOn]}>
        <View style={composeStyles.trackThumb} />
      </View>
    </Pressable>
  );
}

const SWIPE_BACK_EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Generic swipe-right-to-go-back for the compose flow's simple dedicated
 * pages (Media & safety, Caption editor, Location, Tag people, Sound).
 * Category has its own live slide-over-compose gesture further down (it
 * stays mounted for the keyboard); these pages fully unmount on phase
 * change, so a local Animated.Value with the same live-drag feel is
 * enough - same commit thresholds (COMMIT_FRACTION/COMMIT_VELOCITY/
 * SETTLE_MS) as that gesture and the feed's own swipe-closing a creator
 * profile, so it feels identical everywhere it appears.
 */
function SwipeBackPage({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;

  const onGesture = useCallback((e: PanGestureHandlerGestureEvent) => {
    const dx = e.nativeEvent.translationX;
    if (dx <= 0) return; // only a rightward drag goes back
    translateX.setValue(dx);
  }, [translateX]);

  const onStateChange = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX, velocityX } = e.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    const far = translationX > width * COMMIT_FRACTION;
    const fast = velocityX > COMMIT_VELOCITY;
    if (far || fast) {
      Animated.timing(translateX, { toValue: width, duration: SETTLE_MS, easing: SWIPE_BACK_EASE, useNativeDriver: true }).start(onBack);
    } else {
      Animated.timing(translateX, { toValue: 0, duration: SETTLE_MS, easing: SWIPE_BACK_EASE, useNativeDriver: true }).start();
    }
  }, [translateX, width, onBack]);

  return (
    <PanGestureHandler onGestureEvent={onGesture} onHandlerStateChange={onStateChange} activeOffsetX={[-14, 14]} failOffsetY={[-10, 10]}>
      <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </PanGestureHandler>
  );
}

/** A small screen-local confirmation toast - the design's own `toast()`
 *  helper, translated. Distinct from `notBuilt()`'s interrupting Alert on
 *  purpose: this is for real actions that just happened (privacy changed,
 *  someone tagged, draft saved); notBuilt stays the honest, blocking one
 *  for anything that doesn't actually work yet. */
function ComposeToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={composeStyles.toastWrap}>
      <View style={composeStyles.toast}>
        <View style={composeStyles.toastDot} />
        <Text style={composeStyles.toastText} numberOfLines={1}>{message}</Text>
      </View>
    </View>
  );
}

/** "Followers" has no real per-post enforcement on the server yet - see
 *  submitPost's own comment on the status it sends. Still a real, selectable
 *  option here (matches the website's own upload page, which offers the
 *  same three and has the same gap), not a notBuilt() stub. */
const PRIVACY_OPTIONS: {
  key: "everyone" | "followers" | "only_me";
  label: string;
  sub: string;
  glyph: (on: boolean) => ReactNode;
}[] = [
  { key: "everyone", label: "Everyone", sub: "Anyone on Teezer can watch", glyph: (on) => <GlobeGlyph on={on} /> },
  { key: "followers", label: "Followers", sub: "Only people who follow you", glyph: (on) => <FollowersGlyph on={on} /> },
  { key: "only_me", label: "Only me", sub: "Private - nobody else sees it", glyph: (on) => <LockGlyph on={on} /> },
];

/** Which of the design's "Media & safety" toggles are real. is_ai_generated,
 *  "brand" (paidPartnership - opens the real Collab page once on), rights
 *  and consent all reach the server (completeUpload accepts them). rights
 *  is a hard requirement to publish - see submitPost - a real, timestamped
 *  attestation (server's rights_confirmed/rights_confirmed_at), the same
 *  "I own this or have the rights to post it" gate YouTube/TikTok/
 *  Instagram all require before a video goes live, and the actual legal
 *  protection a checkbox here can offer Teezer - an unconfirmed checkbox
 *  gives none. consent is the same idea for showing identifiable people,
 *  but stays a toggle (not every post has a person in it) rather than a
 *  hard gate. autoCaption/hq are real, user-togglable LOCAL state
 *  (defaulting off, see autoCaption/highQualityUpload above) and are part
 *  of the saved "Default upload setting" (see uploadDefaultsOpen) - but
 *  unlike rights/consent they have no per-post field on completeUpload
 *  itself, so only the default they carry into the NEXT compose session is
 *  persisted. The remaining three (promote, kids, copyright-scan) have no
 *  per-post, creator-facing backing anywhere in the API today - so they
 *  still render at the design's own default state and tap through to the
 *  same honest notBuilt() this whole screen already uses for Effects,
 *  Filters, Beauty and the rest, rather than silently pretending to save a
 *  setting nothing on the server will ever read. */
const MEDIA_SAFETY_GROUPS: {
  title: string;
  items: { key: string; label: string; sub: string; defaultOn?: boolean; glyph: () => ReactNode }[];
}[] = [
  { title: "DISCLOSURE", items: [
    { key: "ai", label: "AI-generated content", sub: "Adds an AI label to this post", glyph: () => <SparkleGlyph /> },
    { key: "consent", label: "Subject consent confirmed", sub: "Everyone shown agreed to appear", defaultOn: true, glyph: () => <PersonCheckGlyph /> },
    { key: "brand", label: "Paid partnership", sub: "Discloses a brand deal", glyph: () => <BriefcaseGlyph /> },
  ] },
  { title: "RIGHTS & OWNERSHIP", items: [
    { key: "rights", label: "Content rights confirmed", sub: "Required · you own this or have permission to post it", glyph: () => <ShieldCheck size={19} color="#4A4653" /> },
  ] },
  { title: "ACCESSIBILITY & QUALITY", items: [
    { key: "autoCaption", label: "Auto captions", sub: "Generate subtitles automatically", glyph: () => <CaptionsGlyph /> },
    { key: "hq", label: "High-quality upload", sub: "Slower upload, sharper playback", glyph: () => <GemGlyph /> },
  ] },
  { title: "REACH & PROTECTION", items: [
    { key: "promote", label: "Eligible for promotion", sub: "Can be boosted as an ad later", glyph: () => <MegaphoneGlyph /> },
    { key: "kids", label: "Made for kids", sub: "Limits data use and comments", glyph: () => <SmileyGlyph /> },
    { key: "copyright", label: "Copyright pre-check", sub: "Scan audio before publishing", defaultOn: true, glyph: () => <ShieldGlyph /> },
  ] },
];

/** mm:ss-agnostic date/time helpers for the Schedule fields - the design
 *  shows two plain text fields ("12 Sep 2026" / "7:30 PM"), not a native
 *  picker (nothing in this app pulls in a date-picker dependency today),
 *  so these format a sensible default into that same shape and parse it
 *  back on submit. */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatScheduleDate(d: Date) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function formatScheduleTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
function defaultScheduleAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 30, 0, 0);
  return d;
}
/** Best-effort parse of the two free-text fields back into a real Date -
 *  null on anything that doesn't parse, so the caller can ask for a fix
 *  instead of silently sending a bad date. */
function parseScheduleAt(dateText: string, timeText: string): Date | null {
  const d = new Date(`${dateText.trim()} ${timeText.trim()}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Add link" - the field shown/edited is exactly what the creator typed
 *  (so "example.com" stays "example.com" on screen), but the server's
 *  link_url validation requires a real URL with a scheme (PHP's
 *  FILTER_VALIDATE_URL rejects a bare domain), same as any browser address
 *  bar treats a bare domain as shorthand for one. Normalized only at the
 *  point of sending, never rewritten under the user's own typing. */
function normalizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Edit mode's read-only stand-in for `track` (the Sound state), built from
 *  whatever the post already carries (`main_sound`, falling back to the
 *  legacy `music_track`) - just enough to show the same title/artist the
 *  compose screen's two Sound rows already read (nothing else reads deeper
 *  MusicTrack fields there). There's no endpoint to change a post's sound
 *  after publishing (StudioContentController::updateFull has no such
 *  field), so this is display-only - openSound() below refuses to open the
 *  picker in edit mode rather than let a pick silently not save. */
function trackFromEditVideo(v?: Video): MusicTrack | null {
  const src = v?.main_sound ?? v?.music_track ?? null;
  if (!src) return null;
  return {
    id: src.id,
    title: src.title,
    artist_name: (src as { artist_name?: string | null }).artist_name ?? null,
    cover_url: src.cover_url ?? null,
    album: null, genre: null, mood: null, language: null, duration: null,
    audio_url: null, bpm: null, music_key: null, isrc: null, license_type: null,
    description: null, release_date: null, plays_count: 0, uses_count: 0,
    featured: false, recommended: false, allow_reels: false, allow_stories: false,
    explicit_content: false, created_by_admin_id: null, source_type: "library",
    created_at: v?.created_at ?? new Date().toISOString(),
  };
}

/** "Add link" -> Teezer Product's selection shape - the display fields
 *  only (name/price/currency/image), same trio the server itself returns
 *  both from shopInventoryApi.list (picking) and Video.featured_products
 *  (edit-mode restore) - never anything the client would need to re-derive. */
type FeaturedProductRef = { id: number; name: string; price: number; currency: string; image_url: string | null };

/**
 * "Add link" -> Teezer Product picker - a dedicated full page (opened as
 * its own `phase`, same pattern as Category/Location/Tag people), not a
 * bottom sheet: a 3-per-row product grid mirroring the Shop page's own
 * card language (ShopScreen.tsx's ProductCard - rounded square cover,
 * name, price) at a smaller, picker-appropriate size. The eligible-seller
 * case only - the not-eligible blocked state is rendered by the phase
 * block itself, since it needs to navigate away from this page entirely.
 * Search + "Load more" pagination over the SAME `/shop/products/mine` list
 * Shop Settings > Products & Inventory already uses (shopInventoryApi,
 * unchanged for that screen) - never a second product-listing endpoint.
 * Sorts the caller's own category-matching products first (never filters
 * them out) when `categoryHint` names a Shop category this post's own
 * category maps to.
 */
function ProductPickerGrid({
  selectedIds,
  onToggle,
  categoryHint,
  pageWidth,
}: {
  selectedIds: Set<number>;
  onToggle: (p: SellerProduct) => void;
  categoryHint?: string | null;
  pageWidth: number;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SellerProduct[]>([]);

  useEffect(() => { setPage(1); setItems([]); }, [search]);

  const q = useQuery({
    queryKey: ["studio-link-products", search, page],
    // activeOnly: true - a draft/hidden product must never be selectable
    // here. VideoService::syncFeaturedProducts (server-side) drops any
    // inactive product silently at save time with no error surfaced, so
    // this was previously the exact way a picked product could vanish
    // between "select it here" and "see it on the saved post" - filtering
    // it out of the list itself closes that gap at its source.
    queryFn: () => shopInventoryApi.list(page, search || undefined, true),
  });

  useEffect(() => {
    if (!q.data) return;
    setItems((prev) => (page === 1 ? q.data.data : [...prev, ...q.data.data]));
  }, [q.data, page]);

  const sorted = useMemo(() => {
    if (!categoryHint) return items;
    const matches = items.filter((p) => p.category_name === categoryHint);
    const rest = items.filter((p) => p.category_name !== categoryHint);
    return matches.length ? [...matches, ...rest] : items;
  }, [items, categoryHint]);

  const hasMore = !!q.data && page < q.data.meta.last_page;
  const atLimit = selectedIds.size >= 3;
  // Same 3-per-row math the gallery grid phase already uses (`tile` in
  // PostCameraCompose) - 18px page padding, 10px gaps between the 3 cards.
  const cardW = Math.floor((pageWidth - 18 * 2 - 10 * 2) / 3);

  return (
    <>
      <View style={composeStyles.pageSearchWrap}>
        <View style={composeStyles.searchBar}>
          <SearchGlyph />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your products"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            style={composeStyles.searchInput}
          />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {q.isLoading && page === 1 ? (
          <ActivityIndicator color={ds.accent} style={{ marginTop: 30 }} />
        ) : sorted.length === 0 ? (
          <Text style={composeStyles.sheetEmpty}>
            {search ? "No products match your search." : "You haven't added any products to your Shop yet."}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {sorted.map((p) => {
              const on = selectedIds.has(p.id);
              const disabled = !on && atLimit;
              const recommended = !!categoryHint && p.category_name === categoryHint;
              return (
                <Pressable
                  key={p.id}
                  disabled={disabled}
                  onPress={() => onToggle(p)}
                  style={[{ width: cardW }, disabled && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                >
                  <View style={[composeStyles.gridImgWrap, { width: cardW, height: cardW }]}>
                    {p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={composeStyles.gridImg} contentFit="cover" />
                    ) : (
                      <View style={[composeStyles.gridImg, composeStyles.gridImgFallback]} />
                    )}
                    {on && (
                      <View style={composeStyles.gridCheckBadge}>
                        <CheckGlyph size={11} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={composeStyles.gridName} numberOfLines={1}>{p.name}</Text>
                  <Text style={composeStyles.gridPrice}>{p.currency} {p.price.toFixed(2)}</Text>
                  {recommended && <Text style={composeStyles.recommendedTag}>Recommended</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
        {hasMore && (
          <Pressable onPress={() => setPage((pg) => pg + 1)} style={[composeStyles.loadMoreBtn, { alignSelf: "center", marginTop: 16 }]} accessibilityRole="button">
            <Text style={composeStyles.loadMoreText}>{q.isFetching ? "Loading…" : "Load more"}</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

/**
 * PostCameraScreenImpl (below `trackFromEditVideo`... see further down) only
 * ever mounts this once there is nothing left to wait for: immediately for a
 * new post, or once the full, real record for an existing one has finished
 * loading. Because of that gating, every `useState(editVideo?.field ??
 * default)` initializer in here runs exactly once, with the real data
 * already in hand - never a flash of defaults later overwritten, and never a
 * stale-state leak between two different posts (PostCameraScreenImpl
 * remounts this fresh, via `key`, per editVideoId). Otherwise unchanged in
 * shape from before edit mode existed - just renamed.
 */
function PostCameraCompose({ onClose, editVideo }: { onClose: () => void; editVideo?: Video }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tile = useMemo(() => Math.floor((width - 18 * 2 - 5 * 2) / 3), [width]);
  const navigation = useNavigation<any>();
  const requireAuth = useRequireAuth();
  const qc = useQueryClient();

  /**
   * Edit mode - Studio Content's "Edit" button reopens this exact screen
   * (not a separate page) with `editVideo` set, skipping straight past
   * camera/gallery/capture to the same compose surface a new post uses,
   * pre-filled from the post's own current data. There is no route to
   * replace the media file itself here (nothing in the API supports that -
   * StudioContentController::updateFull only ever touches metadata), so
   * `picked` is a synthetic, display-only stand-in built from the existing
   * thumbnail; submitPost's edit branch below never reads its `uri` for an
   * upload. Every initializer that follows reads from `editVideo` exactly
   * once, on mount - this screen is remounted fresh (it's pushed as its own
   * route) each time Edit is tapped, so a plain useState initializer is
   * enough; no effect is needed to keep it in sync with anything.
   */
  const [phase, setPhase] = useState<Phase>(editVideo ? "compose" : "camera");
  /** "Default upload setting" (the gear icon after Drafts) - a bottom
   *  sheet over compose, not its own full-screen phase (that was a
   *  separate `if (phase === "uploadDefaults")` page before). */
  const [uploadDefaultsOpen, setUploadDefaultsOpen] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(() =>
    editVideo
      ? {
          uri: editVideo.thumbnail_url ?? "",
          name: "post",
          // Always false here, even for a video post: this is a static
          // display-only stand-in for the cover thumbnail, not a playable
          // local file - isVideo:true would instead render a generic
          // placeholder icon in its place (see the cover button below),
          // which is strictly less informative than the real thumbnail.
          isVideo: false,
          durationSec: editVideo.duration ?? undefined,
          width: editVideo.width ?? undefined,
          height: editVideo.height ?? undefined,
        }
      : null,
  );
  const [caption, setCaption] = useState(editVideo?.caption ?? "");

  /** Compose screen state - the design's "New post" surface. Real fields
   *  (category, location, tagged_users, privacy, the allow_ toggles,
   *  schedule, is_ai_generated) all reach /videos/complete-upload for real;
   *  see submitPost below for exactly how each one maps, and its own
   *  comments for the two that don't have a clean 1:1 (allow_download,
   *  "Followers" privacy). */
  const [category, setCategory] = useState(editVideo?.category ?? "");
  const [location, setLocation] = useState(editVideo?.location ?? "");
  /** "Add link" - a single external URL (bio, shop, site) shown on the post
   *  once live. Real, persisted field (videos.link_url), same optional-
   *  string shape as location above - not a cosmetic placeholder. */
  const [link, setLink] = useState(editVideo?.link_url ?? "");
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  /** "Add link" popup's own two-choice navigation - "choose" is the
   *  External link / Teezer product picker; the other two are that
   *  choice's own form. Reset to "choose" whenever the sheet is closed so
   *  it never reopens mid-form. */
  const [linkStage, setLinkStage] = useState<"choose" | "external">("choose");
  /** "Add link" -> Teezer Product - up to 3 of the creator's own Shop
   *  products featured on this post. See FeaturedProductRef's own comment
   *  for why only these display fields are kept client-side. */
  const [selectedProducts, setSelectedProducts] = useState<FeaturedProductRef[]>(() =>
    (editVideo?.featured_products ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, image_url: p.image_url })),
  );
  const selectedProductIds = useMemo(() => new Set(selectedProducts.map((p) => p.id)), [selectedProducts]);
  /** Sell-on-Teezer eligibility for the "Teezer product" option - reuses
   *  the server-authoritative flag GET /profile already exposes (see
   *  UserResource::has_approved_shop's own doc comment) rather than a new
   *  endpoint; only fetched once the dedicated product page is open. */
  const linkEligibilityQuery = useQuery({
    queryKey: ["profileMe"],
    queryFn: profileApi.me,
    enabled: phase === "products",
  });
  const shopCategoryHint = category ? (VIDEO_TO_SHOP_CATEGORY[category as (typeof CATEGORY_OPTIONS)[number]] ?? null) : null;
  const [taggedUsers, setTaggedUsers] = useState<SearchUser[]>(() =>
    (editVideo?.tagged_users ?? []).map((u) => ({ id: u.id, username: u.username, name: u.display_name, avatar: u.avatar_url, is_verified: u.verified })),
  );
  /** "Paid partnership" - who's tagged as a collab partner. Real, separate
   *  from Tag people: writes to its own `collab_users` field / comment_
   *  mentions source_type. */
  const [paidPartnership, setPaidPartnership] = useState(() => !!editVideo?.collab_users?.length);
  const [collabUsers, setCollabUsers] = useState<SearchUser[]>(() =>
    (editVideo?.collab_users ?? []).map((u) => ({ id: u.id, username: u.username, name: u.display_name, avatar: u.avatar_url, is_verified: u.verified })),
  );
  const [privacy, setPrivacy] = useState<"everyone" | "followers" | "only_me">(editVideo?.status === "private" ? "only_me" : "everyone");
  const [allowComments, setAllowComments] = useState(editVideo?.allow_comments ?? true);
  const [allowDuet, setAllowDuet] = useState(editVideo?.allow_duet ?? false);
  const [allowStitch, setAllowStitch] = useState(editVideo?.allow_stitch ?? false);
  const [allowDownload, setAllowDownload] = useState(editVideo?.allow_download ?? false);
  const [isAiGenerated, setIsAiGenerated] = useState(editVideo?.is_ai_generated ?? false);
  /** "Auto captions" and "High-quality upload" on the Media & Safety page -
   *  previously fake (hard-coded on, tap did nothing but notBuilt()); now
   *  real, user-togglable state, defaulting off per request. Meaningless once
   *  a post already exists (both are upload-time processing choices), so
   *  edit mode leaves them at their normal new-post defaults. */
  const [autoCaption, setAutoCaption] = useState(false);
  const [highQualityUpload, setHighQualityUpload] = useState(false);
  /** Real, server-persisted legal attestations (server/app/Services/
   *  VideoService.php's rights_confirmed/consent_confirmed columns) -
   *  not cosmetic toggles. "Content rights confirmed" is required before
   *  publishing (see submitPost), same "Required" pattern as Category;
   *  "Subject consent confirmed" stays a toggle (not every post shows an
   *  identifiable person), defaulting on like it already did when it was
   *  still a fake row. Editing an existing post starts both already
   *  confirmed - this content was already attested at its original upload,
   *  and updateFull (unlike completeUpload) never re-validates the gate. */
  const [rightsConfirmed, setRightsConfirmed] = useState(!!editVideo);
  const [consentConfirmed, setConsentConfirmed] = useState(true);

  /** "Default upload setting" (GET/PATCH /profile/upload-preferences) - the
   *  hard-coded useState defaults above are only the fallback shown before
   *  this loads; once it resolves, this compose session's toggles are set
   *  to whatever the user last saved as their default, exactly once (a ref
   *  guard, not a dependency-driven effect, so a later refetch or the user's
   *  own in-session changes are never silently overwritten). */
  const uploadPrefsQuery = useQuery({ queryKey: ["upload-preferences"], queryFn: prefsApi.uploadPreferences, enabled: !editVideo });
  const appliedUploadPrefsRef = useRef(false);
  useEffect(() => {
    // Editing an existing post shows THAT post's own real settings (just
    // initialized above from editVideo) - applying the user's generic
    // new-upload defaults on top would silently overwrite them.
    if (editVideo || appliedUploadPrefsRef.current || !uploadPrefsQuery.data) return;
    appliedUploadPrefsRef.current = true;
    const p = uploadPrefsQuery.data;
    setAllowComments(p.allow_comments);
    setAllowDuet(p.allow_duet);
    setAllowStitch(p.allow_stitch);
    setAllowDownload(p.allow_download);
    setAutoCaption(p.auto_caption);
    setHighQualityUpload(p.high_quality_upload);
    setIsAiGenerated(p.is_ai_generated);
  }, [uploadPrefsQuery.data]);

  /** Flips the toggle AND persists it as the new default in one call - used
   *  by both the "Default upload setting" sheet (setUploadDefaultsOpen(true))
   *  and, functionally, is what makes that sheet's changes also apply to
   *  whichever post is currently being composed (same state, not a copy). */
  const setUploadDefault = useCallback(
    <K extends keyof UploadPreferences>(key: K, value: UploadPreferences[K]) => {
      prefsApi.updateUploadPreferences({ [key]: value } as Partial<UploadPreferences>).catch(() => {});
    },
    [],
  );

  const editScheduledAt = editVideo?.status === "scheduled" && editVideo.scheduled_at ? new Date(editVideo.scheduled_at) : null;
  const [scheduleOn, setScheduleOn] = useState(!!editScheduledAt);
  const [scheduleDate, setScheduleDate] = useState(() => formatScheduleDate(editScheduledAt ?? defaultScheduleAt()));
  const [scheduleTime, setScheduleTime] = useState(() => formatScheduleTime(editScheduledAt ?? defaultScheduleAt()));
  /** Category, Media & safety, Location and Tag people are all full phases
   *  now (own screen, real navigation, no gesture-driven BottomSheet) - see
   *  their own phase blocks further down. */
  const [categorySearch, setCategorySearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [debouncedLocationSearch, setDebouncedLocationSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocationSearch(locationSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [locationSearch]);
  const locationResults = useQuery({
    queryKey: ["compose-location-search", debouncedLocationSearch],
    queryFn: () => locationApi.search(debouncedLocationSearch),
    enabled: phase === "location" && debouncedLocationSearch.length >= 2,
  });

  /** Tag people - real search (unscoped: anyone can be tagged, follower or
   *  not - the search endpoint never restricted this). Nothing loads until
   *  a real query is typed - no default followers/following suggestions
   *  (see the blank state further down), per direction. */
  const [tagSearch, setTagSearch] = useState("");
  const [debouncedTagSearch, setDebouncedTagSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTagSearch(tagSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [tagSearch]);
  const tagSearchResults = useQuery({
    queryKey: ["compose-tag-search", debouncedTagSearch],
    queryFn: () => searchApi.query(debouncedTagSearch, "users", 20),
    enabled: phase === "tagPeople" && debouncedTagSearch.length >= 2,
  });

  /** "Paid partnership" collab tagging - same search-only shape as Tag
   *  people above, own state and its own dedicated "collab" phase page. */
  const [collabSearch, setCollabSearch] = useState("");
  const [debouncedCollabSearch, setDebouncedCollabSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCollabSearch(collabSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [collabSearch]);
  const collabSearchResults = useQuery({
    queryKey: ["compose-tag-search", debouncedCollabSearch],
    queryFn: () => searchApi.query(debouncedCollabSearch, "users", 20),
    enabled: phase === "collab" && debouncedCollabSearch.length >= 2,
  });

  /**
   * Category opens on tap only (the "Content category" row) - a wrapping
   * swipe gesture on the whole compose screen used to open it too, but that
   * caught ordinary scrolling/incidental touches as an unintended open, so
   * that handler was removed. Closing still has a real, live, cancelable
   * swipe (see onCategoryCloseGesture below) - that one is scoped to the
   * category page itself, where a rightward drag is unambiguous, same
   * commit thresholds (COMMIT_FRACTION/COMMIT_VELOCITY/SETTLE_MS) as the
   * feed's own swipe closing a creator profile (useFeedSwipe.ts +
   * creator-layer.store.ts) - reusing those exact constants rather than
   * re-guessing new ones keeps the gesture feeling identical; the position
   * itself is a plain local Animated.Value rather than that store's own
   * layerProgress, since layerProgress is shared between two specific
   * trees (the feed pane and the creator layer) and has no meaning for an
   * unrelated compose sub-page.
   *
   * 0 = category fully open (covering compose), `width` = parked fully off
   * the right edge (compose showing, category invisible - and, since RN
   * hit-tests a transformed view at its painted position, un-tappable).
   */
  const categoryX = useRef(new Animated.Value(width)).current;
  const categorySwipeEase = useRef(Easing.bezier(0.22, 1, 0.36, 1)).current;
  const categorySearchInputRef = useRef<TextInput>(null);

  /** Keyboard comes up automatically every time the category page is
   *  actually opened - not just on first mount, since the page now stays
   *  mounted (for the slide) rather than remounting each visit. A short
   *  delay lets the slide-in start before the keyboard fights it for
   *  attention. */
  useEffect(() => {
    if (phase !== "category") return;
    const t = setTimeout(() => categorySearchInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [phase]);

  const openCategory = useCallback(() => {
    setCategorySearch("");
    setPhase("category");
    Animated.timing(categoryX, { toValue: 0, duration: SETTLE_MS, easing: categorySwipeEase, useNativeDriver: true }).start();
  }, [categoryX, categorySwipeEase]);

  const closeCategory = useCallback(() => {
    Keyboard.dismiss();
    setPhase("compose");
    Animated.timing(categoryX, { toValue: width, duration: SETTLE_MS, easing: categorySwipeEase, useNativeDriver: true }).start();
  }, [categoryX, categorySwipeEase, width]);

  /** Closing swipe - lives on the category page itself (wraps it below),
   *  armed only while it's actually open. Same shape, mirrored: a
   *  rightward drag pushes it back toward `width`. */
  const onCategoryCloseGesture = useCallback((e: PanGestureHandlerGestureEvent) => {
    const dx = e.nativeEvent.translationX;
    if (dx <= 0) return; // only a rightward drag closes it
    categoryX.setValue(Math.min(width, dx));
  }, [categoryX, width]);

  const onCategoryCloseStateChange = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX, velocityX } = e.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    const far = translationX > width * COMMIT_FRACTION;
    const fast = velocityX > COMMIT_VELOCITY;
    if (far || fast) closeCategory();
    else Animated.timing(categoryX, { toValue: 0, duration: SETTLE_MS, easing: categorySwipeEase, useNativeDriver: true }).start();
  }, [categoryX, categorySwipeEase, closeCategory, width]);

  const [composeToast, setComposeToast] = useState<string | null>(null);
  const composeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showComposeToast = useCallback((msg: string) => {
    if (composeToastTimer.current) clearTimeout(composeToastTimer.current);
    setComposeToast(msg);
    composeToastTimer.current = setTimeout(() => setComposeToast(null), 1700);
  }, []);

  const toggleTaggedUser = useCallback((u: SearchUser) => {
    setTaggedUsers((prev) => {
      const exists = prev.some((p) => p.id === u.id);
      return exists ? prev.filter((p) => p.id !== u.id) : [...prev, u];
    });
  }, []);

  const toggleCollabUser = useCallback((u: SearchUser) => {
    setCollabUsers((prev) => {
      const exists = prev.some((p) => p.id === u.id);
      return exists ? prev.filter((p) => p.id !== u.id) : [...prev, u];
    });
  }, []);

  /** The design's Hashtag/Mention chips insert the token into the caption
   *  text itself rather than opening a separate composer - and since that's
   *  a real edit to keep typing after, focusing the field brings the
   *  keyboard up too, same as tapping into it directly would. */
  const captionInputRef = useRef<TextInput>(null);
  const [captionSelection, setCaptionSelection] = useState({ start: 0, end: 0 });
  const [captionFocused, setCaptionFocused] = useState(false);
  const insertToken = useCallback((ch: string) => {
    setCaption((c) => {
      const next = c + (c && !/\s$/.test(c) ? " " : "") + ch;
      setCaptionSelection({ start: next.length, end: next.length });
      return next;
    });
    captionInputRef.current?.focus();
  }, []);

  /**
   * Live @mention autocomplete, right in the caption box - typing "@" (by
   * hand or via the chip above) and then letters shows a dropdown of
   * matching usernames in place of the settings sections below (same
   * "@([a-zA-Z0-9._]+)" token the server's own MentionService uses to
   * parse it back out later, so what this offers to complete is exactly
   * what the server will actually recognise as a mention). Backspacing
   * past the "@", moving the caret elsewhere, or leaving the field closes
   * it and brings the sections back.
   */
  const activeMentionQuery = captionFocused ? activeMentionToken(caption, captionSelection.start) : null;
  const isMentioning = activeMentionQuery !== null;
  const [debouncedMentionQuery, setDebouncedMentionQuery] = useState<string | null>(null);
  useEffect(() => {
    if (activeMentionQuery === null) { setDebouncedMentionQuery(null); return; }
    const t = setTimeout(() => setDebouncedMentionQuery(activeMentionQuery), 200);
    return () => clearTimeout(t);
  }, [activeMentionQuery]);
  const mentionSearchResults = useQuery({
    queryKey: ["compose-caption-mention", debouncedMentionQuery],
    queryFn: () => searchApi.query(debouncedMentionQuery!, "users", 8),
    enabled: isMentioning && !!debouncedMentionQuery && debouncedMentionQuery.length >= 2,
  });
  /** Fewer than 2 letters typed after "@" yet - a blank state (see the
   *  render below) rather than any default suggestions, per direction. */
  const shortMention = isMentioning && (activeMentionQuery?.length ?? 0) < 2;
  const pickMention = useCallback((username: string) => {
    const { text, caret } = completeMention(caption, captionSelection.start, username);
    setCaption(text);
    setCaptionSelection({ start: caret, end: caret });
  }, [caption, captionSelection.start]);

  /** Only is_ai_generated is real state - the other six Media & safety
   *  toggles render at their fixed design-default state (see
   *  MEDIA_SAFETY_GROUPS's own comment for why), so this count is mostly a
   *  constant plus the one real toggle. */
  const mediaSafetyOnCount = useMemo(
    () => (isAiGenerated ? 1 : 0)
      + MEDIA_SAFETY_GROUPS.reduce((n, g) => n + g.items.filter((it) => it.key !== "ai" && it.defaultOn).length, 0),
    [isAiGenerated],
  );

  /** Real measured heights of the top bar and the bottom control stack, so the
   *  right-hand rail can be bounded between them instead of guessing fixed
   *  pixel offsets from the screen edges - that guessing was what let the
   *  rail's icons, the mode row, the shutter and the foot strip all land on
   *  top of each other on real devices (different notch/home-indicator
   *  insets, different font scaling). */
  const [topBarH, setTopBarH] = useState(0);
  const [bottomH, setBottomH] = useState(0);
  /** Tool rail: collapsed shows the first RAIL_COLLAPSED_COUNT icons plus a
   *  chevron; expanded shows every tool with its name. */
  const [railOpen, setRailOpen] = useState(false);
  /** Sound picker as a sheet, for the camera screen only. The compose row and
   *  the edit rail still push the full page - there the picker is the whole
   *  task, while here it is a quick choice over a live viewfinder you do not
   *  want to lose sight of. */
  const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  /* The audio mix, once the user has been through the music editor. Null means
   * they picked a track and never opened it, in which case the server applies
   * its own defaults (original 100, music 50) rather than this screen guessing. */
  const [audioMix, setAudioMix] = useState<MusicEditorValue | null>(null);
  /* Open once a track has been chosen, so picking a sound leads straight into
   * deciding how it sits rather than ending at "a song is attached". */
  const [musicEditorOpen, setMusicEditorOpen] = useState(false);
  /** Which half of the music editor to show. "all" is what picking a track
   *  opens - the full editor, unchanged. The photo sound bar's Sound and
   *  Volume buttons narrow it to one half each. */
  const [musicEditorSection, setMusicEditorSection] = useState<"all" | "trim" | "volume">("all");
  /** Set when the sound sheet is being closed *in order to* open the editor,
   *  so the editor opens from onClosed rather than racing the dismissal. */
  const [editorAfterSheet, setEditorAfterSheet] = useState(false);

  /* The track being auditioned in the sound browser.
   *
   * Tapping a row there only PLAYS it now - a sound becomes the post's sound
   * by closing the browser while it is playing. So this holds the candidate,
   * and closing is the single place it is committed, no matter how the browser
   * was closed: the back arrow, the sheet's grabber, or a swipe. */
  const [pendingTrack, setPendingTrack] = useState<MusicTrack | null>(null);
  // Mirrored so commitSound can read the CURRENT value from a handler that
  // closed over an older render.
  const pendingTrackRef = useRef<MusicTrack | null>(null);
  pendingTrackRef.current = pendingTrack;

  /** The mounted SoundBrowsePage's own imperative handle - only one of the
   *  full-page/sheet-embedded renders is ever mounted at a time, so one ref
   *  covers both. commitSound() stops its live preview player BEFORE the
   *  phase/sheet change that unmounts it: expo-audio releases the native
   *  player on unmount via its own internal effect, unguarded and outside
   *  anything this app's own try/catch can reach, and releasing one that is
   *  still actively playing is what crashed the app on close. Pausing it
   *  first (already what SoundBrowsePage's own `stop` does) means the
   *  release that follows - whenever it actually happens - has nothing live
   *  left to tear down badly. */
  const soundBrowseRef = useRef<SoundBrowsePageHandle>(null);

  const commitSound = () => {
    soundBrowseRef.current?.stop();
    const picked = pendingTrackRef.current;
    if (picked && picked.id !== track?.id) {
      setTrack(picked);
      // A new sound invalidates the old one's trim, placement and levels.
      setAudioMix(null);
    }
    setPendingTrack(null);
  };

  /** Height of the foot bar alone. The preview card ends here rather than at
   *  the top of the whole control stack, which is what puts the shutter INSIDE
   *  the camera instead of on the black below it. */
  const [footH, setFootH] = useState(0);
  /** Height of the visible mode row. The rail's lower bound is measured from
   *  it rather than guessed, so a font change there cannot silently push the
   *  expanded rail back over the labels. */
  const [modeRowH, setModeRowH] = useState(0);
  /** Height of the Add Sound pill, so the rail can start below it rather than
   *  at a guessed offset - the pill has been resized several times and a
   *  constant here would go stale each time. */
  const [soundPillH, setSoundPillH] = useState(0);

  /** Playback-speed puck, left of the shutter - cycles the label like the
   *  reference design's own SPEED control. Not wired to actual capture: this
   *  screen's recordAsync (expo-camera) has no variable-speed capture option
   *  to drive, so tapping it is an honest `notBuilt`, same pattern as every
   *  other not-yet-real tool on this screen, rather than a label that
   *  changes with no effect on the footage. */
  const [speedIdx, setSpeedIdx] = useState(SPEEDS.indexOf("1x"));

  /** The filter carousel's current selection - the single source of truth
   *  FilterCarousel (tap or swipe), the live camera's Skia shader, the
   *  shutter's tint/label, and the edit-phase preview all read from. */
  const [activeFilterKey, setActiveFilterKey] = useState(DEFAULT_FILTER_KEY);
  const activeFilter = useMemo(
    () => findFilter(CAMERA_FILTER_LIST, activeFilterKey),
    [activeFilterKey],
  );
  const activeFilterParams = useMemo(
    () => composeParams(activeFilter.params, activeFilter.defaultIntensity ?? 1, neutralAdjustments()),
    [activeFilter],
  );
  /** Swipe (or tap) a filter into the capture slot and the shutter itself
   *  shows it - tinted to the filter's category colour, its name labelled
   *  underneath - instead of the plain capture dot. Swipe back to Original
   *  and the real capture button returns, since activeFilterKey already
   *  updates on both tap and swipe. */
  const isFilterActive = activeFilterKey !== DEFAULT_FILTER_KEY;
  /** 1-based position in the filter list, for the "N/Total" badge beside
   *  the shutter (the slot the Speed puck vacated - see the shutter row). */
  const activeFilterPosition = useMemo(
    () => Math.max(0, CAMERA_FILTER_LIST.findIndex((f) => f.key === activeFilterKey)) + 1,
    [activeFilterKey],
  );

  /** Same lookup startRecording() uses for recordAsync's own maxDuration -
   *  the shutter's progress ring fills against this exact limit, so it
   *  reaches 100% at the same instant the recording actually auto-stops. */
  const recordLimitSec = DURATIONS.find((d) => d.key === duration)?.seconds ?? 60;

  /** Same measured-not-guessed reasoning, for the post-capture editor's own
   *  bottom stack - the rail's top edge no longer depends on a measured top
   *  bar (removed; see the edit phase JSX below), just the fixed inset. */
  const [editBottomH, setEditBottomH] = useState(0);

  /** Honest about the tools that are not built - same wording pattern as
   *  StoryUploadScreen's own `notBuilt`. */
  const notBuilt = useCallback((what: string) => {
    Alert.alert(what, "This part of Teezer isn't built yet.");
  }, []);

  /** The editor's clip-volume slider - a real, draggable control backed by
   *  local state. It has nowhere to go yet: this screen has no audio-mixing
   *  pipeline (posting itself is not wired up either, see `post` below), so
   *  the value it produces is not applied anywhere. Direct-manipulation
   *  drag, not relative delta - the thumb jumps to wherever the finger is,
   *  same as any standard slider. */
  const [clipVolume, setClipVolume] = useState(100);
  const volumeTrackW = useRef(1);
  const onVolumeTrackLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    volumeTrackW.current = e.nativeEvent.layout.width || 1;
  }, []);
  const onVolumeDrag = useCallback((e: PanGestureHandlerGestureEvent) => {
    const pct = (e.nativeEvent.x / volumeTrackW.current) * 100;
    setClipVolume(Math.round(Math.min(100, Math.max(0, pct))));
  }, []);

  /** The scrub bar's own measured width - it needs real pixels for its SVG
   *  pattern fill, not a percentage. */
  const [scrubW, setScrubW] = useState(0);

  /** LIVE / POST / CREATE at the foot - a swipeable 3-way selector, not just
   *  three independent taps. Landing on a tab, by tap or by swipe, does
   *  exactly what tapping it always did: LIVE hands off to the real
   *  CreateSpace flow, CREATE says it is not built yet (the same notBuilt
   *  pattern as the rest of this screen), POST is here. Swiping is just a
   *  second way to reach those same three destinations. */
  const [footTab, setFootTab] = useState<FootTab>("post");

  const selectFootTab = useCallback((tab: FootTab) => {
    // Covers taps and swipes both: onFootSwipe routes through here, the same
    // way pickCaptureMode covers the mode row.
    tapFeedback();
    setFootTab(tab);
    if (tab === "live") requireAuth(() => navigation.navigate("CreateSpace"));
    else if (tab === "create") notBuilt("Create mode");
  }, [requireAuth, navigation, notBuilt]);

  const onFootSwipe = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state !== State.END) return;
    const { translationX, velocityX } = e.nativeEvent;
    if (Math.abs(translationX) < 30 && Math.abs(velocityX) < 400) return;
    const dir = translationX < 0 ? 1 : -1; // swipe left -> next tab, toward CREATE
    const idx = FOOT_TABS.indexOf(footTab);
    const next = FOOT_TABS[Math.min(FOOT_TABS.length - 1, Math.max(0, idx + dir))];
    if (next !== footTab) selectFootTab(next);
  }, [footTab, selectFootTab]);

  /* ── Camera ────────────────────────────────────────────────────────────── */
  const cameraRef = useRef<TeezerLiveCameraHandle>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("video");
  const [duration, setDuration] = useState<DurationKey>("60s");
  /**
   * What the CAMERA is told, as opposed to what the row shows.
   *
   * expo-camera has to have its session mode set up front, and changing it
   * tears the capture session down and builds a new one - which is the black
   * frame when moving between a video length and Photos. Swiping 15s -> Photos
   * -> 60s would do that twice on the way past.
   *
   * Following the selection at a short delay means a swipe that passes THROUGH
   * Photos never reconfigures at all, and settling on it reconfigures once.
   */
  const [cameraMode, setCameraMode] = useState<CaptureMode>("video");
  // Two states, not three - a plain on/off is enough here; "auto" is a real
  // metering mode the OS camera has and this preview does not try to guess.
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [timerSeconds, setTimerSeconds] = useState<(typeof TIMER_OPTIONS)[number]>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (cameraMode === captureMode) return;
    const id = setTimeout(() => setCameraMode(captureMode), 220);

    return () => clearTimeout(id);
  }, [captureMode, cameraMode]);

  /** One handler for every rail tool. The five that are real drive the state
   *  that already existed for them; the rest say so rather than doing nothing
   *  silently. */
  const runTool = useCallback((key: ToolKey) => {
    tapFeedback();
    switch (key) {
      case "flip":
        setFacing((f) => (f === "back" ? "front" : "back"));
        return;
      case "flash":
        setFlash((f) => (f === "off" ? "on" : "off"));
        return;
      case "timer":
        // Cycles off -> 3s -> 10s -> off, the same three the shutter honours.
        setTimerSeconds((t) => TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(t) + 1) % TIMER_OPTIONS.length]);
        return;
      case "speed":
        setSpeedIdx((i) => (i + 1) % SPEEDS.length);
        return;
      case "filters":
        setActiveFilterKey((k) => {
          const i = CAMERA_FILTER_LIST.findIndex((f) => f.key === k);
          return CAMERA_FILTER_LIST[(i + 1) % CAMERA_FILTER_LIST.length].key;
        });
        return;
      default: {
        const tool = TOOLS.find((t) => t.key === key);
        notBuilt(tool ? tool.label : "That tool");
      }
    }
  }, [notBuilt]);

  /** What the one stateful rail glyph - the flash toggle - needs to draw
   *  itself. Speed used to render its multiplier as text here; it is an icon
   *  now, so it no longer varies with state. */
  const glyphCtx = useMemo(
    () => ({ flashOn: flash === "on" }),
    [flash],
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** Mirrors `elapsed` without the closure-staleness `useCallback` deps
   *  would otherwise force - read at the moment recording stops, for the
   *  editor's real duration label. */
  const elapsedRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState<MusicTrack | null>(() => trackFromEditVideo(editVideo));

  /* The attached sound, made audible here.
   *
   * Picking a track only ever changed the pill's LABEL: the sound browser's
   * preview player stops the instant that page unmounts, so an attached sound
   * went silent the moment it was chosen and stayed silent until the post was
   * published. This loops it on the camera screen, so what is attached is what
   * you hear. */
  const [soundPreviewUri, setSoundPreviewUri] = useState<string | null>(null);
  const soundPreview = useAudioPlayer(soundPreviewUri ? { uri: soundPreviewUri } : null);

  /* Declare how playback and capture share the audio session BEFORE anything
     plays. On iOS the camera owns that session, and starting a player inside
     it without saying how the two coexist makes the OS hand the session to
     whichever asked last - which is what takes the app down the moment an
     attached sound begins. mixWithOthers requests no exclusive focus, so the
     preview sits alongside the capture session rather than seizing it, and
     playsInSilentMode keeps it audible with the ringer switch off, where a
     silent preview would just look like the bug it is meant to fix. */
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" })
      .catch(() => { /* Playback is still worth attempting if this is refused. */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!track) { setSoundPreviewUri(null); return; }
      try {
        // An `original` track only ever gets a signed URL from the detail
        // endpoint - the list row carries no playable audio_url for one.
        const uri = track.source_type === "original" || !track.audio_url
          ? (await musicApi.detail(track.id)).audio_url
          : track.audio_url;
        if (!cancelled) setSoundPreviewUri(uri ?? null);
      } catch {
        // A sound that will not resolve simply stays silent; it is still
        // attached, and the server mixes it in regardless.
        if (!cancelled) setSoundPreviewUri(null);
      }
    })();
    return () => { cancelled = true; };
  }, [track]);

  /* Three cases have to SILENCE it, and each is a real bug if missed:
     - recording: the mic would capture it, and the server mixes the same
       track in afterwards (ProcessAudioMix), so the music would land twice,
       half a beat apart - once through the room, once cleanly;
     - the sound sheet or the sound page being open: those run their own
       preview player, and two tracks would play over each other. */
  const soundMuted = recording || soundSheetOpen || phase === "sound";

  useEffect(() => {
    if (!soundPreviewUri || !soundPreview) return;
    try {
      soundPreview.loop = true;
      if (soundMuted) soundPreview.pause();
      else soundPreview.play();
    } catch {
      /* Never worth breaking capture over. */
    }
    // Deliberately NOT keyed on `soundPreview`: its identity changes on every
    // status tick, which would restart the track several times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundPreviewUri, soundMuted]);

  /* Same rule as the sound browser's own player: pause the CURRENT instance
     once, at real unmount. useAudioPlayer releases the previous native player
     whenever the source changes, so a cleanup keyed on the player would call
     pause() on an instance already torn down - a real crash. */
  const soundPreviewRef = useRef(soundPreview);
  soundPreviewRef.current = soundPreview;
  useEffect(() => () => { try { soundPreviewRef.current?.pause(); } catch {} }, []);
  /** Sound is a dedicated page now (SoundBrowsePage, phase "sound"), reachable
   *  from three different points (camera top bar, edit rail, compose row) -
   *  this remembers which phase to return to on back/pick. */
  const [soundReturnPhase, setSoundReturnPhase] = useState<Phase>("compose");
  const openSoundSheet = useCallback(() => {
    // Before the edit-mode guard, so a press that can't do anything still
    // acknowledges itself rather than feeling like a dead button. Panel weight,
    // not a selection tap: this raises the whole sound sheet.
    panelFeedback();
    if (editVideo) {
      Alert.alert("Sound can't be changed", "A post's sound can't be changed once it's published.");
      return;
    }
    setSoundSheetOpen(true);
  }, [editVideo]);

  const openSound = useCallback(() => {
    // Nothing in the API can change a published post's sound - see
    // trackFromEditVideo's comment. Saying so beats silently opening a
    // picker whose pick would just be dropped on Save.
    if (editVideo) {
      Alert.alert("Sound can't be changed", "A post's sound can't be changed once it's published.");
      return;
    }
    setSoundReturnPhase(phase);
    setPhase("sound");
  }, [phase, editVideo]);
  /** Compose phase's own upload state - separate from `busy` (the camera
   *  phase's capture-in-progress flag), since this is a longer, more
   *  visible operation with its own progress indicator. */
  const [uploading, setUploading] = useState(false);
  /** The most recent camera-roll item, shown in the gallery shortcut so it
   *  reads as a real shortcut rather than a blank button. */
  const [recentUri, setRecentUri] = useState<string | null>(null);

  useEffect(() => {
    if (!camPermission?.granted) void requestCamPermission();
    if (!micPermission?.granted) void requestMicPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted) return;
      const page = await MediaLibrary.getAssetsAsync({ first: 1, sortBy: [MediaLibrary.SortBy.creationTime] });
      setRecentUri(page.assets[0]?.uri ?? null);
    })();
  }, [phase]); // refreshed whenever we come back from the grid or compose

  useEffect(() => {
    if (!recording) { setElapsed(0); elapsedRef.current = 0; return; }
    const id = setInterval(() => setElapsed((s) => { const next = s + 1; elapsedRef.current = next; return next; }), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const runCountdownThen = useCallback((seconds: number, then: () => void) => {
    if (seconds <= 0) { then(); return; }
    let n = seconds;
    setCountdown(n);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(null);
        then();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, []);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo?.uri) {
        // Same reasoning as recordAsync below: this project's expo-camera
        // typings return only { uri } here, no width/height - left
        // undefined (falls back to "assume 9:16" server-side), which is
        // correct in practice since in-app capture always uses this
        // screen's own fixed vertical camera viewport.
        setPicked({ uri: photo.uri, name: "post.jpg", isVideo: false });
        setPhase("edit");
      }
    } catch {
      Alert.alert("Couldn't take that photo", "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || busy || recording) return;
    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result.granted) {
        Alert.alert("Microphone access is off", "Teezer needs your microphone to record video with sound.");
        return;
      }
    }
    setRecording(true);
    try {
      const maxDuration = DURATIONS.find((d) => d.key === duration)?.seconds ?? 60;
      const result = await cameraRef.current.recordAsync({ maxDuration });
      if (result?.uri) {
        // recordAsync's result carries no width/height (unlike
        // takePictureAsync/gallery assets above) - left undefined, which
        // falls back to "assume 9:16" server-side. Safe here: in-app
        // recording always uses this screen's own fixed vertical camera
        // viewport, so it is genuinely 9:16 in practice.
        setPicked({ uri: result.uri, name: "post.mp4", isVideo: true, durationSec: elapsedRef.current });
        setPhase("edit");
      }
    } catch {
      Alert.alert("Couldn't record that", "Something went wrong. Try again.");
    } finally {
      setRecording(false);
    }
  }, [busy, recording, duration, micPermission, requestMicPermission]);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const onShutterPress = useCallback(() => {
    if (countdown != null) return; // already counting down
    // The camera's session mode follows the row at a short delay (see
    // cameraMode). In that window the row can say Photos while the device is
    // still armed for video, where takePictureAsync fails - so a press is
    // ignored until the two agree rather than capturing the wrong thing.
    if (cameraMode !== captureMode) return;
    const fire = () => {
      if (captureMode === "picture") void takePhoto();
      else if (recording) stopRecording();
      else void startRecording();
    };
    // The timer only delays STARTING a capture, never stopping one already running.
    if (timerSeconds > 0 && !recording) runCountdownThen(timerSeconds, fire);
    else fire();
  }, [countdown, cameraMode, captureMode, recording, timerSeconds, takePhoto, startRecording, stopRecording, runCountdownThen]);

  const pickDuration = useCallback((key: DurationKey) => {
    setCaptureMode("video");
    setDuration(key);
  }, []);

  /** The row's active key: Photos when in picture mode, otherwise the chosen
   *  video length. */
  const captureModeKey = captureMode === "picture" ? "photo" : duration;

  const pickCaptureMode = useCallback((key: string) => {
    // Covers taps and swipes both: onModeSwipe routes through here.
    tapFeedback();
    if (key === "photo") { setCaptureMode("picture"); return; }
    pickDuration(key as DurationKey);
  }, [pickDuration]);

  /** Swipe the row to step between modes, same feel as the foot bar. Clamped
   *  at both ends rather than wrapping, so a flick cannot cycle past Photos
   *  back to 2m. */
  const onModeSwipe = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state !== State.END) return;
    const { translationX, velocityX } = e.nativeEvent;
    if (Math.abs(translationX) < 30 && Math.abs(velocityX) < 400) return;
    const dir = translationX < 0 ? 1 : -1;
    const idx = CAPTURE_MODES.findIndex((m) => m.key === captureModeKey);
    const next = CAPTURE_MODES[Math.min(CAPTURE_MODES.length - 1, Math.max(0, idx + dir))];

    if (next && next.key !== captureModeKey) {
      pickCaptureMode(next.key);
      return;
    }

    // Already at 2m and swiping right, or Photos and swiping left. The clamp
    // above is correct - the row does not wrap - but with nothing to change,
    // nothing fired either, and a swipe that answers with silence reads as a
    // broken control rather than the end of a list. Reported exactly that way:
    // "haptic works going left only", from someone parked on the first mode.
    //
    // A softer, different bump: it has to say "there is nothing past here", not
    // repeat the tap that means "you moved", or the edge would feel like a
    // successful switch that failed to update the screen.
    edgeFeedback();
  }, [captureModeKey, pickCaptureMode]);

  /**
   * Direct-to-B2 presigned upload - the same three-step flow
   * (upload-url -> PUT -> complete-upload) the website's uploadService
   * already uses against these same endpoints; video.api.ts's
   * requestUploadUrl/uploadToB2/completeUpload mirror it. Once
   * complete-upload returns, the post exists and processing continues on
   * the server - this closes the screen immediately rather than waiting
   * for a transcode, matching "the user must not be required to keep the
   * upload screen open."
   *
   * asDraft=true is the design's "Save draft" button - same upload, just
   * status: "draft" instead of published/scheduled/private, and it ignores
   * the schedule toggle entirely (a draft isn't published yet, so "when"
   * doesn't apply).
   */
  const submitPost = useCallback(async (asDraft: boolean) => {
    if (!picked || uploading) return;

    // Categories are mandatory to publish (a draft is inherently unfinished,
    // so it's exempt) - same "Required" hint the Categories row itself shows.
    if (!asDraft && !category) {
      Alert.alert("Choose a category", "Pick at least one category before posting.");
      openCategory();
      return;
    }

    // Content rights confirmation is mandatory to publish, same as
    // Category - see MEDIA_SAFETY_GROUPS's own comment for why this one
    // specifically is a hard gate rather than a plain toggle.
    if (!asDraft && !rightsConfirmed) {
      Alert.alert(
        "Confirm content rights",
        "Confirm you own this content or have permission to post it before publishing.",
      );
      setPhase("mediaSafety");
      return;
    }

    let scheduledAtIso: string | undefined;
    if (!asDraft && scheduleOn) {
      const parsed = parseScheduleAt(scheduleDate, scheduleTime);
      if (!parsed || parsed.getTime() <= Date.now()) {
        Alert.alert("Check the schedule", "Enter a valid date and time in the future.");
        return;
      }
      scheduledAtIso = parsed.toISOString();
    }

    setUploading(true);

    // Edit mode - PATCH the existing post's metadata (StudioContentController
    // ::updateFull) instead of uploading new media and creating a new one.
    // `picked` is never read below this point in that case - it exists only
    // to satisfy the phase guards above, not as something to upload.
    if (editVideo) {
      try {
        const hashtags = Array.from(
          new Set((caption.match(/#[\p{L}0-9_]+/gu) ?? []).map((h) => h.slice(1).toLowerCase())),
        );
        // The privacy picker only has three slots (Everyone/Followers/Only
        // me) - it never had one for "unlisted" (a real, reachable status;
        // see VideoController's own statusMap) or "removed". If the
        // creator never touched the privacy selector or the schedule
        // toggle from what they were initialized to, recomputing status
        // from the picker would silently reassign one of those to
        // "published" on ANY edit save, even one that only changed the
        // caption. Comparing against the exact same expressions the
        // useState initializers used is what detects "untouched" here.
        const initialPrivacy = editVideo.status === "private" ? "only_me" : "everyone";
        const initialScheduleOn = editVideo.status === "scheduled" && !!editVideo.scheduled_at;
        const privacyUntouched = privacy === initialPrivacy && scheduleOn === initialScheduleOn;
        const currentStatus = editVideo.status ?? "published";
        const finalStatus: ContentStatus =
          asDraft ? "draft"
          : privacyUntouched && !(["published", "draft", "private", "scheduled"] as ContentStatus[]).includes(currentStatus)
            ? currentStatus
            : scheduleOn ? "scheduled" : privacy === "only_me" ? "private" : "published";
        await studioApi.updateContent(editVideo.id, {
          // Sent as-is, even empty - updateFull's contract is "omitted =
          // unchanged", so clearing the caption/category/location during an
          // edit only actually clears it server-side if the (possibly
          // empty) value is sent, not left out.
          caption,
          category,
          location,
          link_url: normalizeLink(link),
          hashtags,
          tagged_user_ids: taggedUsers.map((u) => u.id),
          collab_user_ids: collabUsers.map((u) => u.id),
          // Sent as-is, even empty - same "omitted = unchanged, sent =
          // applied" contract as tagged_user_ids/collab_user_ids above, so
          // clearing every product during an edit only actually clears it
          // server-side because [] is sent, not left out.
          product_ids: selectedProducts.map((p) => p.id),
          status: finalStatus,
          scheduled_at: scheduledAtIso,
          allow_comments: allowComments,
          allow_duet: allowDuet,
          allow_stitch: allowStitch,
          allow_download: allowDownload,
          is_ai_generated: isAiGenerated,
        });
        // The Content list (and its Published/counts header) is exactly
        // where this screen was opened from - it must show the edit
        // immediately, not on some later unrelated refetch. Feed/profile
        // grids pick up the change the next time THEY fetch (there's no
        // live-push bus in this app to reach already-rendered lists
        // elsewhere - same as any other edit already does today).
        qc.invalidateQueries({ queryKey: ["studio-content"] });
        qc.invalidateQueries({ queryKey: ["studio-overview"] });
        // This screen's OWN gate-then-mount query (PostCameraScreenImpl's
        // wrapper, and PostViewerScreen's singleQuery, share this exact
        // key) - without invalidating it, reopening Edit on this same post
        // right after saving reused the pre-save cached snapshot (React
        // Query shows cached data immediately and only refetches in the
        // background, too late for this screen's mount-time useState
        // initializers to pick up), so a just-added product (or any other
        // just-edited field) silently appeared to "not have saved" the next
        // time Edit was opened, even though it had.
        qc.invalidateQueries({ queryKey: ["video", editVideo.id] });
        onClose();
      } catch (e) {
        Alert.alert(
          "Couldn't save changes",
          e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.",
        );
      } finally {
        setUploading(false);
      }
      return;
    }

    /*
     * From here the upload runs in the BACKGROUND.
     *
     * Everything above this point is validation that has to be answered while
     * the composer is still on screen. Everything below is network work the
     * user has no reason to sit and watch, so the composer closes immediately
     * and the rest of this function keeps running - it is a closure, so it
     * outlives the screen that started it quite happily.
     *
     * Progress goes to useUploadStore instead of this component's own state,
     * because by the time the first byte moves there is nothing mounted here to
     * re-render. That store is what puts the publishing animation in the feed
     * header, in place of the Live glyph, until this finishes.
     */
    const publish = useUploadStore.getState();
    publish.start();
    onClose();

    try {
      // expo-file-system's File - a native handle carrying size and type
      // without reading the file at all.
      //
      // This was `await (await fetch(picked.uri)).blob()`. React Native's
      // fetch returns an ArrayBuffer body for a local file and its
      // Response.blob() then does `new Blob([arrayBuffer])`, which RN's Blob
      // refuses: "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are
      // not supported". Every post died there, before a byte was uploaded.
      const blob = new File(picked.uri);
      const fileType = blob.type || (picked.isVideo ? "video/mp4" : "image/jpeg");
      const fileName = picked.name || (picked.isVideo ? "post.mp4" : "post.jpg");

      // Multipart above the threshold - resumable, controlled concurrency,
      // per-part retry (see videoApi.uploadMultipart's own doc comment).
      // Below it, the existing single-PUT path - unchanged, already works
      // fine at that size.
      let objectKey: string;
      if (picked.isVideo && blob.size >= MULTIPART_THRESHOLD_BYTES) {
        const result = await videoApi.uploadMultipart(picked.uri, publish.setPercent);
        objectKey = result.object_key;
      } else {
        const { upload_url, object_key: key, content_type } = await videoApi.requestUploadUrl({
          file_name: fileName,
          file_type: fileType,
          file_size: blob.size,
        });
        await videoApi.uploadToB2(upload_url, picked.uri, content_type, publish.setPercent);
        objectKey = key;
      }

      // The design's Hashtag chip just inserts "#" into the caption text
      // (same as the Mention chip inserts "@") - there is no separate
      // hashtag-chip list here. The server needs them as a real array to
      // register (VideoService::syncHashtags reads only this array, never
      // the caption text itself), so they're pulled out of the caption
      // right here rather than asking the caption field to double as that
      // structured input.
      const hashtags = Array.from(
        new Set((caption.match(/#[\p{L}0-9_]+/gu) ?? []).map((h) => h.slice(1).toLowerCase())),
      );

      const finalStatus = asDraft ? "draft" : scheduleOn ? "scheduled" : privacy === "only_me" ? "private" : "published";

      const created = await videoApi.completeUpload({
        object_key: objectKey,
        caption: caption || undefined,
        category: category || undefined,
        location: location || undefined,
        link_url: link.trim() ? normalizeLink(link) : undefined,
        product_ids: selectedProducts.length ? selectedProducts.map((p) => p.id) : undefined,
        hashtags: hashtags.length ? hashtags : undefined,
        tagged_users: taggedUsers.length ? taggedUsers.map((u) => ({ id: u.id, username: u.username })) : undefined,
        collab_users: collabUsers.length ? collabUsers.map((u) => ({ id: u.id, username: u.username })) : undefined,
        // "Followers" has no real per-post enforcement anywhere in the API
        // yet (only Story has a followers-only visibility check) - this
        // matches the website's own upload page, which sends the same
        // status for Everyone and Followers today.
        status: finalStatus,
        scheduled_at: scheduledAtIso,
        duration: picked.durationSec,
        width: picked.width,
        height: picked.height,
        mime_type: fileType,
        file_size: blob.size,
        music_track_id: track?.id,
        // The project's real length, in milliseconds - the boundary everything
        // audio is clamped to. `duration` above is whole seconds (the column is
        // int2), which cannot express a 23.21s clip, so the music layer would
        // otherwise be allowed to run past the picture.
        project_duration_ms: picked.durationSec != null
          ? Math.round(picked.durationSec * 1000)
          : undefined,
        ...(audioMix ?? {}),
        allow_comments: allowComments,
        allow_duet: allowDuet,
        allow_stitch: allowStitch,
        is_ai_generated: isAiGenerated,
        rights_confirmed: rightsConfirmed,
        consent_confirmed: consentConfirmed,
      });

      // "Allow download" has no field on /complete-upload at all - it only
      // exists as a Studio post-publish edit (StudioContentController::
      // updateFull). Real, just a second real call, and only fired when the
      // toggle actually differs from the column's own default (false) so
      // the common case costs nothing extra. Best-effort: the post itself
      // already succeeded above, so a failure here must not surface as the
      // whole post having failed.
      if (allowDownload) {
        void studioApi.updateContent(created.id, { allow_download: true }).catch(() => {});
      }

      // The composer used to close here, AFTER the post existed, so whatever
      // the user landed on refetched with the new post already in place. It now
      // closes before any of this runs, so the lists that should contain the
      // post have to be told once it actually does.
      qc.invalidateQueries({ queryKey: ["studio-content"] });
      qc.invalidateQueries({ queryKey: ["studio-overview"] });
      qc.invalidateQueries({ queryKey: ["profile-videos"] });

      publish.succeed(created);

      // Land the viewer on the feed, where the post is then shown once as
      // confirmation of what actually went up. navigationRef rather than this
      // screen's own `navigation`: the composer unmounted the moment Post was
      // tapped, so its navigator handle is long gone by the time the upload
      // finishes. A draft is not published, so it goes nowhere.
      // dispatch rather than navigate(): RootStackParamList types Main as
      // `undefined`, so the typed navigate() signature has no room for the
      // nested tab - and landing on Main without naming the tab would leave
      // whatever tab was last open.
      if (!asDraft && navigationRef.isReady()) {
        navigationRef.dispatch(
          CommonActions.navigate({ name: "Main", params: { screen: "Home" } }),
        );
      }
    } catch (e) {
      // The composer is already gone, so this alert is the only thing that
      // tells the user - and the header indicator has to stop claiming the
      // post is still on its way.
      publish.fail();
      Alert.alert(
        asDraft ? "Couldn't save that draft" : "Couldn't post that",
        e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  }, [
    picked, uploading, caption, category, location, link, selectedProducts, taggedUsers, collabUsers, privacy, track,
    allowComments, allowDuet, allowStitch, allowDownload, isAiGenerated, rightsConfirmed, consentConfirmed,
    scheduleOn, scheduleDate, scheduleTime, onClose, editVideo,
  ]);

  /* ── Gallery grid (the shortcut's destination) ────────────────────────── */

  const [tab, setTab] = useState<MediaTab>("all");
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const mediaType = useMemo<MediaLibrary.MediaTypeValue[]>(
    () => (tab === "photo" ? ["photo"] : tab === "video" ? ["video"] : ["photo", "video"]),
    [tab],
  );

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

  useEffect(() => {
    if (phase !== "grid") return;
    setLoading(true);
    setAssets([]);
    setCursor(undefined);
    setHasMore(true);
    void load();
  }, [phase, load]);

  const choose = useCallback(async (asset: MediaLibrary.Asset) => {
    const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
    let uri: string;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      uri = info.localUri ?? asset.uri;
    } catch {
      Alert.alert(
        "Couldn't open that",
        "That item couldn't be read from your gallery. If it's stored in iCloud, open it in Photos once and try again.",
      );
      return;
    }
    setPicked({
      uri, name: asset.filename || (isVideo ? "post.mp4" : "post.jpg"), isVideo,
      durationSec: isVideo ? (asset.duration ?? 0) : undefined,
      width: asset.width, height: asset.height,
    });
    setPhase("edit");
  }, []);

  /* ── Compose ───────────────────────────────────────────────────────────── */

  if (picked && (phase === "compose" || phase === "category")) {
    return (
      <View style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            // Edit mode never had a capture/"edit" (crop-trim) phase to go
            // back to - there's nothing to replace the media with here, so
            // back means leaving the editor entirely.
            onPress={() => (editVideo ? onClose() : setPhase("edit"))}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{editVideo ? "Edit post" : "New post"}</Text>
            <Text style={composeStyles.draftStatus} numberOfLines={1}>
              {editVideo ? "Editing" : caption ? "Draft saving…" : "Draft saved just now"}
            </Text>
          </View>
          <Pressable onPress={() => notBuilt("Drafts")} style={composeStyles.draftsPill} accessibilityRole="button">
            <Text style={composeStyles.draftsPillText}>Drafts</Text>
          </Pressable>
          <Pressable
            onPress={() => setUploadDefaultsOpen(true)}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Default upload setting"
          >
            <GearGlyph />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={composeStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Caption card - cover-frame picker (real thumbnail, not built as
              an actual frame-picker - see notBuilt below) beside the caption
              text, then the Hashtag/Mention insert chips + char counter. */}
          <View style={composeStyles.captionCard}>
            <View style={composeStyles.captionRow}>
              <Pressable
                onPress={() => notBuilt("Cover frame")}
                style={composeStyles.coverBtn}
                accessibilityRole="button"
                accessibilityLabel="Choose cover frame"
              >
                {picked.isVideo ? (
                  <View style={[composeStyles.coverBtnBg, composeStyles.coverBtnVideoBg]}>
                    <VideoTagGlyph color="#fff" />
                  </View>
                ) : (
                  <Image source={{ uri: picked.uri }} style={composeStyles.coverBtnBg} contentFit="cover" />
                )}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.66)"]} style={composeStyles.coverBtnScrim} />
                <View style={composeStyles.coverBtnLabelRow}>
                  <EditPencilGlyph />
                  <Text style={composeStyles.coverBtnLabel}>Cover</Text>
                </View>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  ref={captionInputRef}
                  value={caption}
                  onChangeText={setCaption}
                  onSelectionChange={(e) => setCaptionSelection(e.nativeEvent.selection)}
                  selection={captionSelection}
                  onFocus={() => setCaptionFocused(true)}
                  onBlur={() => setCaptionFocused(false)}
                  placeholder="Write a caption…"
                  placeholderTextColor={FAINT}
                  multiline
                  style={composeStyles.captionInput}
                />
                <Pressable
                  onPress={() => setPhase("captionEditor")}
                  style={composeStyles.captionExpandBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Write caption full screen"
                  hitSlop={8}
                >
                  <ExpandGlyph />
                </Pressable>
              </View>
            </View>
            <View style={composeStyles.chipBar}>
              <Pressable onPress={() => insertToken("#")} style={composeStyles.miniChip} accessibilityRole="button">
                <HashtagGlyph />
                <Text style={composeStyles.miniChipText}>Hashtag</Text>
              </Pressable>
              <Pressable onPress={() => insertToken("@")} style={composeStyles.miniChip} accessibilityRole="button">
                <MentionGlyph />
                <Text style={composeStyles.miniChipText}>Mention</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text style={[composeStyles.charCount, caption.length > 2000 && { color: ds.accent }]}>
                {caption.length}/2200
              </Text>
            </View>
          </View>

          {/* Live @mention autocomplete - replaces the settings sections
              below while an "@token" is actively being typed in the
              caption, same as the Details/Privacy/etc. group further down
              but standing in for it, not stacked alongside it. */}
          {isMentioning && (
            <View style={{ gap: 11 }}>
              <Text style={composeStyles.secLabel}>MENTION SOMEONE</Text>
              {shortMention ? (
                <View style={composeStyles.searchEmptyState}>
                  <UserSearch size={38} color={MUTED} strokeWidth={1.5} />
                  <Text style={composeStyles.searchEmptyText}>Type a username to mention someone</Text>
                </View>
              ) : mentionSearchResults.isLoading ? (
                <ActivityIndicator color={ds.accent} style={{ marginTop: 14 }} />
              ) : !mentionSearchResults.data?.users?.length ? (
                <Text style={composeStyles.sheetEmpty}>No one found</Text>
              ) : (
                <View style={composeStyles.pageCard}>
                  {mentionSearchResults.data.users.map((u, i, arr) => (
                    <Pressable
                      key={u.id}
                      onPress={() => pickMention(u.username)}
                      style={[composeStyles.personRow, { paddingHorizontal: 12 }, i < arr.length - 1 && composeStyles.rowBorder]}
                      accessibilityRole="button"
                    >
                      {u.avatar ? (
                        <Image source={{ uri: u.avatar }} style={composeStyles.personAvatar} contentFit="cover" />
                      ) : (
                        <View style={[composeStyles.personAvatar, composeStyles.personAvatarFallback]}>
                          <Text style={composeStyles.personAvatarInitial}>{(u.name || u.username).charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={composeStyles.rowLabel} numberOfLines={1}>{u.name || u.username}</Text>
                        <Text style={composeStyles.rowSub} numberOfLines={1}>@{u.username}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {!isMentioning && (
          <>
          {/* Details */}
          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>DETAILS</Text>
            <View style={composeStyles.card}>
              <Pressable onPress={openCategory} style={[composeStyles.row, composeStyles.rowBorder]} accessibilityRole="button">
                <View style={composeStyles.tile}><CategoryGlyph /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Categories</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {category ? "Helps the right people find it" : "Required · helps the right people find it"}
                  </Text>
                </View>
                {!!category && <Text style={composeStyles.rowValue} numberOfLines={1}>{category}</Text>}
                <ChevronRightGlyph />
              </Pressable>
              <Pressable
                onPress={() => { setTagSearch(""); setPhase("tagPeople"); }}
                style={[composeStyles.row, composeStyles.rowBorder]}
                accessibilityRole="button"
              >
                <View style={composeStyles.tile}><TagPeopleGlyph /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Tag people</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>Mention creators in this post</Text>
                </View>
                {taggedUsers.length > 0 && (
                  <Text style={composeStyles.rowValue}>{taggedUsers.length} tagged</Text>
                )}
                <ChevronRightGlyph />
              </Pressable>
              <Pressable onPress={openSound} style={[composeStyles.row, composeStyles.rowBorder]} accessibilityRole="button">
                <View style={composeStyles.tile}><MusicNoteGlyph color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Sound</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {track ? `${track.title ?? "Untitled"} · ${track.artist_name ?? "Unknown artist"}` : "Add a trending track"}
                  </Text>
                </View>
                <ChevronRightGlyph />
              </Pressable>
              <Pressable
                onPress={() => { setLocationSearch(""); setPhase("location"); }}
                style={[composeStyles.row, composeStyles.rowBorder]}
                accessibilityRole="button"
              >
                <View style={composeStyles.tile}><LocationPinGlyph size={17} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Location</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {location || "Add a location"}
                  </Text>
                </View>
                <ChevronRightGlyph />
              </Pressable>
              <Pressable
                onPress={() => { setLinkStage("choose"); setLinkSheetOpen(true); }}
                style={composeStyles.row}
                accessibilityRole="button"
              >
                <View style={composeStyles.tile}><Link2 size={17} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Add link</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {link && selectedProducts.length
                      ? `${link} · ${selectedProducts.length} product${selectedProducts.length > 1 ? "s" : ""}`
                      : link
                        ? link
                        : selectedProducts.length
                          ? `${selectedProducts.length} product${selectedProducts.length > 1 ? "s" : ""} featured`
                          : "Link your bio, shop, or feature products"}
                  </Text>
                </View>
                <ChevronRightGlyph />
              </Pressable>
            </View>
          </View>

          {/* Who can watch */}
          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>WHO CAN WATCH</Text>
            <View style={composeStyles.card}>
              {PRIVACY_OPTIONS.map((p, i) => {
                const on = privacy === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => { setPrivacy(p.key); showComposeToast(p.label); }}
                    style={[composeStyles.row, i < PRIVACY_OPTIONS.length - 1 && composeStyles.rowBorder]}
                    accessibilityRole="button"
                  >
                    <View style={[composeStyles.tile, on && composeStyles.tileOn]}>{p.glyph(on)}</View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={composeStyles.rowLabel}>{p.label}</Text>
                      <Text style={composeStyles.rowSub} numberOfLines={1}>{p.sub}</Text>
                    </View>
                    <View style={[composeStyles.radio, on && composeStyles.radioOn]}>
                      {on && <CheckGlyph size={11} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Interaction */}
          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>INTERACTION</Text>
            <View style={composeStyles.card}>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow comments</Text>
                  <Text style={composeStyles.rowSub}>Viewers can reply on this post</Text>
                </View>
                <Toggle on={allowComments} onPress={() => setAllowComments((v) => !v)} />
              </View>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow Duet</Text>
                  <Text style={composeStyles.rowSub}>Others can film alongside you</Text>
                </View>
                <Toggle on={allowDuet} onPress={() => setAllowDuet((v) => !v)} />
              </View>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow Stitch</Text>
                  <Text style={composeStyles.rowSub}>Others can clip and reuse 5s</Text>
                </View>
                <Toggle on={allowStitch} onPress={() => setAllowStitch((v) => !v)} />
              </View>
              <View style={composeStyles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow download</Text>
                  <Text style={composeStyles.rowSub}>Save the video to their device</Text>
                </View>
                <Toggle on={allowDownload} onPress={() => setAllowDownload((v) => !v)} />
              </View>
            </View>
          </View>

          {/* Publishing */}
          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>PUBLISHING</Text>
            <View style={composeStyles.card}>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={[composeStyles.tile, scheduleOn && composeStyles.tileOn]}>
                  <ClockGlyph color={scheduleOn ? ds.accent : "#4A4653"} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Schedule post</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {scheduleOn ? `${scheduleDate} · ${scheduleTime}` : "Publish immediately"}
                  </Text>
                </View>
                <Toggle on={scheduleOn} onPress={() => setScheduleOn((v) => !v)} />
              </View>
              {scheduleOn && (
                <View style={composeStyles.scheduleFields}>
                  <View style={composeStyles.scheduleField}>
                    <CalendarGlyph />
                    <TextInput
                      value={scheduleDate}
                      onChangeText={setScheduleDate}
                      placeholder="12 Sep 2026"
                      placeholderTextColor={MUTED}
                      style={composeStyles.scheduleInput}
                    />
                  </View>
                  <View style={composeStyles.scheduleField}>
                    <ClockGlyph color={MUTED} />
                    <TextInput
                      value={scheduleTime}
                      onChangeText={setScheduleTime}
                      placeholder="7:30 PM"
                      placeholderTextColor={MUTED}
                      style={composeStyles.scheduleInput}
                    />
                  </View>
                </View>
              )}
              <Pressable onPress={() => setPhase("mediaSafety")} style={composeStyles.row} accessibilityRole="button">
                <View style={composeStyles.tile}><ShieldGlyph /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Media & safety</Text>
                  <Text style={composeStyles.rowSub} numberOfLines={1}>
                    {mediaSafetyOnCount} setting{mediaSafetyOnCount === 1 ? "" : "s"} on
                  </Text>
                </View>
                <ChevronRightGlyph />
              </Pressable>
            </View>
          </View>
          </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            onPress={() => submitPost(true)}
            disabled={uploading}
            style={styles.draftBtn}
            accessibilityRole="button"
          >
            <Text style={styles.draftBtnText}>
              {editVideo ? (editVideo.status === "draft" ? "Save draft" : "Unpublish") : "Save draft"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => submitPost(false)}
            disabled={uploading}
            style={[styles.postBtn, uploading && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            {uploading ? (
              // A spinner only. This used to show a percentage, which made
              // sense while the composer stayed open for the whole upload -
              // publishing now goes to the background and this screen closes
              // immediately, so the number would never be anything but 0.
              // Progress lives in the feed header's indicator instead.
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postBtnText}>
                {editVideo
                  ? editVideo.status === "draft" ? "Publish" : scheduleOn ? "Schedule post" : "Save changes"
                  : scheduleOn ? "Schedule post" : "Post"}
              </Text>
            )}
          </Pressable>
        </View>

        <ComposeToast message={composeToast} />
      </View>

      {/* Default upload setting - the gear icon after Drafts. Same toggles
          as this screen's own Interaction/Accessibility rows (same state,
          not a copy - see setUploadDefault above), so a change here both
          applies to the post currently being composed AND is saved
          server-side (/profile/upload-preferences) for every future post
          until changed again. A real bottom sheet, not a full-screen page -
          the sheetHeader/sheetTitle/sheetBody styles below already existed
          for exactly this, unused until now. */}
      <BottomSheet
        visible={uploadDefaultsOpen}
        onClose={() => setUploadDefaultsOpen(false)}
        height={0.72}
        header={
          <View style={composeStyles.sheetHeader}>
            <Text style={composeStyles.sheetTitle}>Default upload setting</Text>
          </View>
        }
      >
        {/* BottomSheet already wraps children in its own managed ScrollView
            (scrollable defaults to true) - a nested one here would fight it
            for the swipe-to-dismiss gesture's scroll-position tracking. */}
        <View style={composeStyles.sheetBody}>
          <Text style={composeStyles.uploadDefaultsTag}>
            Applies to every new post you upload, until you change it again.
          </Text>

          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>INTERACTION</Text>
            <View style={composeStyles.pageCard}>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={composeStyles.tile}><MessageCircle size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow comments</Text>
                  <Text style={composeStyles.rowSub}>Viewers can reply on this post</Text>
                </View>
                <Toggle
                  on={allowComments}
                  onPress={() => { const next = !allowComments; setAllowComments(next); setUploadDefault("allow_comments", next); }}
                />
              </View>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={composeStyles.tile}><Users size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow Duet</Text>
                  <Text style={composeStyles.rowSub}>Others can film alongside you</Text>
                </View>
                <Toggle
                  on={allowDuet}
                  onPress={() => { const next = !allowDuet; setAllowDuet(next); setUploadDefault("allow_duet", next); }}
                />
              </View>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={composeStyles.tile}><Scissors size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow Stitch</Text>
                  <Text style={composeStyles.rowSub}>Others can clip and reuse 5s</Text>
                </View>
                <Toggle
                  on={allowStitch}
                  onPress={() => { const next = !allowStitch; setAllowStitch(next); setUploadDefault("allow_stitch", next); }}
                />
              </View>
              <View style={composeStyles.row}>
                <View style={composeStyles.tile}><Download size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Allow download</Text>
                  <Text style={composeStyles.rowSub}>Save the video to their device</Text>
                </View>
                <Toggle
                  on={allowDownload}
                  onPress={() => { const next = !allowDownload; setAllowDownload(next); setUploadDefault("allow_download", next); }}
                />
              </View>
            </View>
          </View>

          <View style={{ gap: 11 }}>
            <Text style={composeStyles.secLabel}>ACCESSIBILITY & QUALITY</Text>
            <View style={composeStyles.pageCard}>
              <View style={[composeStyles.row, composeStyles.rowBorder]}>
                <View style={composeStyles.tile}><CaptionsGlyph /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Auto captions</Text>
                  <Text style={composeStyles.rowSub}>Generate subtitles automatically</Text>
                </View>
                <Toggle
                  on={autoCaption}
                  onPress={() => { const next = !autoCaption; setAutoCaption(next); setUploadDefault("auto_caption", next); }}
                />
              </View>
              <View style={composeStyles.row}>
                <View style={composeStyles.tile}><GemGlyph /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>High-quality upload</Text>
                  <Text style={composeStyles.rowSub}>Slower upload, sharper playback</Text>
                </View>
                <Toggle
                  on={highQualityUpload}
                  onPress={() => { const next = !highQualityUpload; setHighQualityUpload(next); setUploadDefault("high_quality_upload", next); }}
                />
              </View>
            </View>
          </View>
        </View>
      </BottomSheet>

      {/* Add link - a professional two-choice popup: an external URL (the
          original single-field feature, unchanged in behavior) or a Teezer
          product from the creator's own Shop. Same lightweight bottom-sheet
          shape as Default upload setting above rather than a full phase
          page. Bound straight to `link`/`selectedProducts` (no separate
          draft state) - same "always live" pattern the caption field
          itself already uses; there is nothing to cancel back out of. */}
      <BottomSheet
        visible={linkSheetOpen}
        onClose={() => { setLinkSheetOpen(false); setLinkStage("choose"); }}
        keyboardAvoid
        header={
          <View style={composeStyles.sheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {linkStage !== "choose" && (
                <Pressable onPress={() => setLinkStage("choose")} accessibilityRole="button" hitSlop={10}>
                  <BackGlyph />
                </Pressable>
              )}
              <Text style={composeStyles.sheetTitle}>
                {linkStage === "choose" ? "Add link" : "Add an external link"}
              </Text>
            </View>
          </View>
        }
      >
        <View style={composeStyles.sheetBody}>
          {linkStage === "choose" && (
            <>
              <Pressable onPress={() => setLinkStage("external")} style={composeStyles.linkChooserRow} accessibilityRole="button">
                <View style={composeStyles.tile}><Link2 size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Add an external link</Text>
                  <Text style={composeStyles.rowSub}>Add a link to a blog, article, news story, website, or other external page.</Text>
                  {!!link && <Text style={composeStyles.rowValue2} numberOfLines={1}>{link}</Text>}
                </View>
                <ChevronRightGlyph />
              </Pressable>
              <Pressable
                onPress={() => { setLinkSheetOpen(false); setLinkStage("choose"); setPhase("products"); }}
                style={composeStyles.linkChooserRow}
                accessibilityRole="button"
              >
                <View style={composeStyles.tile}><ShoppingBag size={18} color="#4A4653" /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={composeStyles.rowLabel}>Add a Teezer product</Text>
                  <Text style={composeStyles.rowSub}>Choose products from your Teezer Shop to feature with this post.</Text>
                  {selectedProducts.length > 0 && (
                    <Text style={composeStyles.rowValue2}>{selectedProducts.length} of 3 selected</Text>
                  )}
                </View>
                <ChevronRightGlyph />
              </Pressable>
            </>
          )}

          {linkStage === "external" && (
            <>
              <Text style={composeStyles.uploadDefaultsTag}>
                {category && LINK_SUGGESTIONS[category as (typeof CATEGORY_OPTIONS)[number]]
                  ? `Recommended for ${category} — ${LINK_SUGGESTIONS[category as (typeof CATEGORY_OPTIONS)[number]]}`
                  : "Shown on this post once it's live. A bare domain like \"example.com\" is saved as https://example.com."}
              </Text>
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="https://example.com"
                placeholderTextColor={FAINT}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={() => { setLinkSheetOpen(false); setLinkStage("choose"); }}
                style={composeStyles.linkInput}
              />
              <View style={composeStyles.linkSheetActions}>
                {!!link && (
                  <Pressable
                    style={composeStyles.linkRemoveBtn}
                    onPress={() => { setLink(""); setLinkSheetOpen(false); setLinkStage("choose"); }}
                    accessibilityRole="button"
                  >
                    <Text style={composeStyles.linkRemoveText}>Remove link</Text>
                  </Pressable>
                )}
                <Pressable
                  style={composeStyles.linkDoneBtn}
                  onPress={() => { setLinkSheetOpen(false); setLinkStage("choose"); }}
                  accessibilityRole="button"
                >
                  <Text style={composeStyles.linkDoneText}>Done</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </BottomSheet>

      {/* Category - opens on tap only (the "Content category" row, above);
          closing has a real, live, cancelable swipe (its own handler right
          here), same feel and commit thresholds as the feed's own swipe
          closing a creator profile - see categoryX's own comment for why
          opening doesn't get the same treatment. Stays mounted continuously
          (not remounted per visit,
          unlike the old separate-phase-block version) so it can slide as
          one continuous surface; the keyboard-focus effect above re-fires
          on every real open regardless. Kept off the touch/accessibility
          tree while parked (pointerEvents "none") so a swipe that never
          reaches compose's own content still can't land on a category row
          sitting just off the right edge. */}
      <Animated.View
        pointerEvents={phase === "category" ? "auto" : "none"}
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: categoryX }] }]}
      >
      <PanGestureHandler
        enabled={phase === "category"}
        onGestureEvent={onCategoryCloseGesture}
        onHandlerStateChange={onCategoryCloseStateChange}
        activeOffsetX={[-14, 14]}
        failOffsetY={[-10, 10]}
      >
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={closeCategory}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Categories</Text>
        </View>

        <View style={composeStyles.pageSearchWrap}>
          <View style={composeStyles.searchBar}>
            <SearchGlyph />
            <TextInput
              ref={categorySearchInputRef}
              value={categorySearch}
              onChangeText={setCategorySearch}
              placeholder="Search categories"
              placeholderTextColor={MUTED}
              style={composeStyles.searchInput}
            />
          </View>
        </View>

        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} accessibilityRole="none">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={composeStyles.pageListContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          showsVerticalScrollIndicator={false}
        >
          {(() => {
            const filteredCategories = CATEGORY_OPTIONS.filter((c) =>
              c.toLowerCase().includes(categorySearch.trim().toLowerCase()),
            );
            return filteredCategories.length === 0 ? (
              <Text style={composeStyles.sheetEmpty}>No categories match "{categorySearch}"</Text>
            ) : (
              <View style={composeStyles.pageCard}>
                {filteredCategories.map((c, i) => {
                  const on = category === c;
                  const Icon = CATEGORY_ICONS[c] ?? MoreHorizontal;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => { setCategory(c); closeCategory(); showComposeToast(`${c} selected`); }}
                      style={[
                        composeStyles.catPageRow,
                        i < filteredCategories.length - 1 && composeStyles.rowBorder,
                        on && composeStyles.catPageRowOn,
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={[composeStyles.tile, on && composeStyles.tileOn]}>
                        <Icon size={19} color={on ? ds.accent : MUTED} strokeWidth={2} />
                      </View>
                      <Text style={[composeStyles.catPageRowText, on && composeStyles.catPageRowTextOn]} numberOfLines={1}>
                        {c}
                      </Text>
                      {on && (
                        <View style={composeStyles.catCheckCircle}>
                          <CheckGlyph size={11} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })()}
        </ScrollView>
        </Pressable>
      </View>
      </PanGestureHandler>
      </Animated.View>
      </View>
    );
  }

  /* ── Media & safety - same reasoning as Category above: its own full
     page, not a BottomSheet. ────────────────────────────────────────────── */

  if (picked && phase === "mediaSafety") {
    return (
      <SwipeBackPage onBack={() => setPhase("compose")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("compose")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Media & safety</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={composeStyles.pageListContent}
          showsVerticalScrollIndicator={false}
        >
          {MEDIA_SAFETY_GROUPS.map((g) => (
            <View key={g.title} style={{ gap: 11 }}>
              <Text style={composeStyles.secLabel}>{g.title}</Text>
              <View style={composeStyles.pageCard}>
                {g.items.map((it, i) => {
                  const on =
                    it.key === "ai" ? isAiGenerated :
                    it.key === "autoCaption" ? autoCaption :
                    it.key === "hq" ? highQualityUpload :
                    it.key === "brand" ? paidPartnership :
                    it.key === "rights" ? rightsConfirmed :
                    it.key === "consent" ? consentConfirmed :
                    !!it.defaultOn;
                  const onPress =
                    it.key === "ai" ? () => setIsAiGenerated((v) => !v) :
                    it.key === "autoCaption" ? () => setAutoCaption((v) => !v) :
                    it.key === "hq" ? () => setHighQualityUpload((v) => !v) :
                    it.key === "brand" ? () => setPaidPartnership((v) => !v) :
                    it.key === "rights" ? () => setRightsConfirmed((v) => !v) :
                    it.key === "consent" ? () => setConsentConfirmed((v) => !v) :
                    () => notBuilt(it.label);
                  return (
                    <View
                      key={it.key}
                      style={[
                        composeStyles.row,
                        (i < g.items.length - 1 || (it.key === "brand" && paidPartnership)) && composeStyles.rowBorder,
                      ]}
                    >
                      <View style={[composeStyles.tile, on && composeStyles.tileOn]}>{it.glyph()}</View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={composeStyles.rowLabel} numberOfLines={1}>{it.label}</Text>
                        <Text style={composeStyles.rowSub} numberOfLines={1}>{it.sub}</Text>
                      </View>
                      <Toggle on={on} onPress={onPress} />
                    </View>
                  );
                })}
                {/* Only shown once "Paid partnership" is on - opens the
                    dedicated Collab page to tag brands/usernames. */}
                {g.title === "DISCLOSURE" && paidPartnership && (
                  <Pressable
                    onPress={() => { setCollabSearch(""); setPhase("collab"); }}
                    style={composeStyles.row}
                    accessibilityRole="button"
                  >
                    <View style={composeStyles.tile}><CollabIconGlyph size={17} color="#4A4653" /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={composeStyles.rowLabel} numberOfLines={1}>Collab with</Text>
                      <Text style={composeStyles.rowSub} numberOfLines={1}>
                        {collabUsers.length
                          ? collabUsers.map((u) => `@${u.username}`).join(", ")
                          : "Tag the brands or people you're collabing with"}
                      </Text>
                    </View>
                    <ChevronRightGlyph />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 9, paddingHorizontal: 4 }}>
            <InfoGlyph />
            <Text style={composeStyles.footnote}>
              Undisclosed AI or paid content can be removed. Copyright pre-check may delay publishing by a few minutes.
            </Text>
          </View>
        </ScrollView>
      </View>
      </SwipeBackPage>
    );
  }

  /* ── Caption, full screen - the expand button in the caption card's own
     corner opens this. Same `caption`/`setCaption` state the compose card's
     TextInput already uses, just with room to actually see what you're
     writing - not a separate draft to reconcile back. ────────────────────── */

  if (picked && phase === "captionEditor") {
    return (
      <SwipeBackPage onBack={() => setPhase("compose")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("compose")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Collapse caption editor"
          >
            <ContractGlyph />
          </Pressable>
          <Text style={styles.title}>Caption</Text>
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor={FAINT}
          multiline
          autoFocus
          style={composeStyles.captionEditorInput}
        />

        <View style={composeStyles.captionEditorFooter}>
          <Text style={[composeStyles.charCount, caption.length > 2000 && { color: ds.accent }]}>
            {caption.length}/2200
          </Text>
        </View>
      </View>
      </SwipeBackPage>
    );
  }

  /* ── Location - same reasoning as Category: its own full page, real
     search (locationApi.search, the same endpoint the old sheet used),
     not a BottomSheet. ──────────────────────────────────────────────────── */

  if (picked && phase === "location") {
    return (
      <SwipeBackPage onBack={() => setPhase("compose")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("compose")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Add location</Text>
        </View>

        <View style={composeStyles.pageSearchWrap}>
          <View style={composeStyles.searchBar}>
            <SearchGlyph />
            <TextInput
              value={locationSearch}
              onChangeText={setLocationSearch}
              placeholder="Search for a place"
              placeholderTextColor={MUTED}
              autoFocus
              style={composeStyles.searchInput}
            />
          </View>
        </View>

        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} accessibilityRole="none">
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={composeStyles.pageListContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
          >
            {debouncedLocationSearch.length < 2 ? (
              <Text style={composeStyles.sheetEmpty}>Search for a place</Text>
            ) : locationResults.isLoading ? (
              <ActivityIndicator color={ds.accent} style={{ marginTop: 30 }} />
            ) : !locationResults.data?.length ? (
              <Text style={composeStyles.sheetEmpty}>No places found</Text>
            ) : (
              <View style={composeStyles.pageCard}>
                {locationResults.data.map((r, i) => (
                  <Pressable
                    key={`${r.formatted}-${i}`}
                    onPress={() => { setLocation(r.formatted); setPhase("compose"); showComposeToast(r.formatted); }}
                    style={[composeStyles.locPageRow, i < locationResults.data!.length - 1 && composeStyles.rowBorder]}
                    accessibilityRole="button"
                  >
                    <View style={composeStyles.tile}><LocationPinGlyph size={16} /></View>
                    <Text style={composeStyles.rowLabel} numberOfLines={1}>{r.formatted}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </View>
      </SwipeBackPage>
    );
  }

  /* ── "Add link" -> Teezer Product - a dedicated full page (not a sheet),
     same pattern as Category/Location above: header + back, then either the
     not-eligible blocked state or the 3-per-row product grid with a fixed
     "N of 3 selected / Done" footer. ── */

  if (picked && phase === "products") {
    const eligible = !!linkEligibilityQuery.data?.has_approved_shop;
    return (
      <SwipeBackPage onBack={() => setPhase("compose")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("compose")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Choose products</Text>
        </View>

        {linkEligibilityQuery.isLoading ? (
          <ActivityIndicator color={ds.accent} style={{ marginTop: 40 }} />
        ) : !eligible ? (
          <View style={[composeStyles.eligibilityBlock, { flex: 1, justifyContent: "center" }]}>
            <View style={composeStyles.eligibilityIconWrap}>
              <ShoppingBag size={26} color={ds.accent} />
            </View>
            <Text style={composeStyles.eligibilityTitle}>Sell on Teezer isn't available yet</Text>
            <Text style={composeStyles.eligibilitySub}>Enable Sell on Teezer to feature your products in your posts.</Text>
            <Pressable
              style={composeStyles.eligibilityBtn}
              onPress={() => navigation.navigate("SellerApplication")}
              accessibilityRole="button"
            >
              <Text style={composeStyles.eligibilityBtnText}>Set up Sell on Teezer</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ProductPickerGrid
              selectedIds={selectedProductIds}
              categoryHint={shopCategoryHint}
              pageWidth={width}
              onToggle={(p) => {
                setSelectedProducts((prev) => {
                  const exists = prev.some((x) => x.id === p.id);
                  if (exists) return prev.filter((x) => x.id !== p.id);
                  if (prev.length >= 3) return prev;
                  return [...prev, { id: p.id, name: p.name, price: p.price, currency: p.currency, image_url: p.image_url }];
                });
              }}
            />
            <View style={[composeStyles.productPageFooter, { paddingBottom: insets.bottom + 12 }]}>
              <Text style={composeStyles.productCountFooterText}>{selectedProducts.length} of 3 selected</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {selectedProducts.length > 0 && (
                  <Pressable style={composeStyles.linkRemoveBtn} onPress={() => setSelectedProducts([])} accessibilityRole="button">
                    <Text style={composeStyles.linkRemoveText}>Remove all</Text>
                  </Pressable>
                )}
                <Pressable style={composeStyles.linkDoneBtn} onPress={() => setPhase("compose")} accessibilityRole="button">
                  <Text style={composeStyles.linkDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
      </SwipeBackPage>
    );
  }

  /* ── Tag people - real search (unscoped - anyone can be tagged, not just
     followers), and real followers/following suggestions before you've
     typed anything. Same full-page pattern as Category/Location above. ── */

  if (picked && phase === "tagPeople") {
    const showingSearch = debouncedTagSearch.length >= 2;
    const searchList = tagSearchResults.data?.users ?? [];
    const selectedIds = new Set(taggedUsers.map((u) => u.id));
    return (
      <SwipeBackPage onBack={() => setPhase("compose")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("compose")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Tag people</Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 10}
        >
        <View style={composeStyles.pageSearchWrap}>
          <View style={composeStyles.searchBar}>
            <SearchGlyph />
            <TextInput
              value={tagSearch}
              onChangeText={setTagSearch}
              placeholder="Search people"
              placeholderTextColor={MUTED}
              autoFocus
              style={composeStyles.searchInput}
            />
          </View>
          {taggedUsers.length > 0 && (
            <View style={[composeStyles.chipsRow, { marginTop: 12 }]}>
              {taggedUsers.map((u) => (
                <Pressable key={u.id} onPress={() => toggleTaggedUser(u)} style={composeStyles.personChip} accessibilityRole="button">
                  <Text style={composeStyles.personChipText} numberOfLines={1}>@{u.username}</Text>
                  <Text style={composeStyles.personChipRemove}>×</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} accessibilityRole="none">
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={composeStyles.pageListContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
          >
            {showingSearch ? (
              tagSearchResults.isLoading ? (
                <ActivityIndicator color={ds.accent} style={{ marginTop: 30 }} />
              ) : !searchList.length ? (
                <Text style={composeStyles.sheetEmpty}>No one found</Text>
              ) : (
                <View style={composeStyles.pageCard}>
                  {searchList.map((u, i) => {
                    const on = selectedIds.has(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => toggleTaggedUser(u)}
                        style={[composeStyles.personRow, { paddingHorizontal: 12 }, i < searchList.length - 1 && composeStyles.rowBorder]}
                        accessibilityRole="button"
                      >
                        {u.avatar ? (
                          <Image source={{ uri: u.avatar }} style={composeStyles.personAvatar} contentFit="cover" />
                        ) : (
                          <View style={[composeStyles.personAvatar, composeStyles.personAvatarFallback]}>
                            <Text style={composeStyles.personAvatarInitial}>{(u.name || u.username).charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={composeStyles.rowLabel} numberOfLines={1}>{u.name || u.username}</Text>
                          <Text style={composeStyles.rowSub} numberOfLines={1}>@{u.username}</Text>
                        </View>
                        {on
                          ? <CheckGlyph size={16} color={ds.accent} />
                          : <View style={composeStyles.addCircle}><Text style={composeStyles.addCirclePlus}>+</Text></View>}
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : (
              <View style={composeStyles.searchEmptyState}>
                <UserSearch size={40} color={MUTED} strokeWidth={1.5} />
                <Text style={composeStyles.searchEmptyText}>Search for people to tag</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </View>
      </SwipeBackPage>
    );
  }

  /* ── Collab ("Paid partnership") - same full-page pattern as Tag people
     above, own state (collabUsers, not taggedUsers). Opened from the
     Media & safety page's "Collab with" row, so back returns there. ───── */

  if (picked && phase === "collab") {
    const showingSearch = debouncedCollabSearch.length >= 2;
    const searchList = collabSearchResults.data?.users ?? [];
    const selectedIds = new Set(collabUsers.map((u) => u.id));
    return (
      <SwipeBackPage onBack={() => setPhase("mediaSafety")}>
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#fff" }]}>
        <View style={[styles.header, composeStyles.pageHeader]}>
          <Pressable
            onPress={() => setPhase("mediaSafety")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Collab with</Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 10}
        >
        <View style={composeStyles.pageSearchWrap}>
          <View style={composeStyles.searchBar}>
            <SearchGlyph />
            <TextInput
              value={collabSearch}
              onChangeText={setCollabSearch}
              placeholder="Search brands or people"
              placeholderTextColor={MUTED}
              autoFocus
              style={composeStyles.searchInput}
            />
          </View>
          {collabUsers.length > 0 && (
            <View style={[composeStyles.chipsRow, { marginTop: 12 }]}>
              {collabUsers.map((u) => (
                <Pressable key={u.id} onPress={() => toggleCollabUser(u)} style={composeStyles.personChip} accessibilityRole="button">
                  <Text style={composeStyles.personChipText} numberOfLines={1}>@{u.username}</Text>
                  <Text style={composeStyles.personChipRemove}>×</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} accessibilityRole="none">
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={composeStyles.pageListContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
          >
            {showingSearch ? (
              collabSearchResults.isLoading ? (
                <ActivityIndicator color={ds.accent} style={{ marginTop: 30 }} />
              ) : !searchList.length ? (
                <Text style={composeStyles.sheetEmpty}>No one found</Text>
              ) : (
                <View style={composeStyles.pageCard}>
                  {searchList.map((u, i) => {
                    const on = selectedIds.has(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => toggleCollabUser(u)}
                        style={[composeStyles.personRow, { paddingHorizontal: 12 }, i < searchList.length - 1 && composeStyles.rowBorder]}
                        accessibilityRole="button"
                      >
                        {u.avatar ? (
                          <Image source={{ uri: u.avatar }} style={composeStyles.personAvatar} contentFit="cover" />
                        ) : (
                          <View style={[composeStyles.personAvatar, composeStyles.personAvatarFallback]}>
                            <Text style={composeStyles.personAvatarInitial}>{(u.name || u.username).charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={composeStyles.rowLabel} numberOfLines={1}>{u.name || u.username}</Text>
                          <Text style={composeStyles.rowSub} numberOfLines={1}>@{u.username}</Text>
                        </View>
                        {on
                          ? <CheckGlyph size={16} color={ds.accent} />
                          : <View style={composeStyles.addCircle}><Text style={composeStyles.addCirclePlus}>+</Text></View>}
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : (
              <View style={composeStyles.searchEmptyState}>
                <UserSearch size={40} color={MUTED} strokeWidth={1.5} />
                <Text style={composeStyles.searchEmptyText}>Search for a brand or creator to collab with</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </View>
      </SwipeBackPage>
    );
  }

  /* ── Sound - dedicated "browse all sounds" page, reachable from the camera
     top bar, the post-capture edit rail, and the compose Sound row (see
     openSound/soundReturnPhase above). Real catalog, search, categories,
     cover art and a play/seek player - see SoundBrowsePage. ─────────────── */

  // No `picked &&` guard here, unlike the phases above - Sound is reachable
  // from the pre-capture camera top bar too, before anything is picked.
  if (phase === "sound") {
    return (
      <SwipeBackPage onBack={() => { commitSound(); setPhase(soundReturnPhase); }}>
        <SoundBrowsePage
          ref={soundBrowseRef}
          onBack={() => { commitSound(); setPhase(soundReturnPhase); }}
          onPreviewChange={setPendingTrack}
          // The audition counts as the current sound for the bar's purposes,
          // so its controls are live for the track being listened to rather
          // than the one attached before this page opened.
          selectedTrackId={(pendingTrack ?? track)?.id ?? null}
          // The editor lives in the compose render, not this one, so the bar
          // commits and returns there before opening it.
          onOpenEditor={(sec) => { commitSound(); setMusicEditorSection(sec); setPhase(soundReturnPhase); setMusicEditorOpen(true); }}
        />
      </SwipeBackPage>
    );
  }


  /* ── Post-capture editor - the step between capture and compose. Sound
     (real, the same trending-tracks picker as the top bar) and Next (goes
     to compose) work; the rest of the tool rail says so honestly on tap,
     same notBuilt pattern as everywhere else on this screen. ────────────── */

  if (picked && phase === "edit") {
    return (
      <View style={styles.editRoot}>
        {/* Real GPU-filtered preview - the same EditorCanvas, RenderParams,
            and SkSL colour pipeline as the media editor (features/editor/),
            rendering `activeFilterParams` (the filter picked in the
            carousel above) over the actual captured photo or video. Skia
            cannot run in Expo Go (it touches native code at import time,
            same as react-native-webrtc / react-native-iap - see
            features/editor/skia.ts), so `fallback` is what today's
            unfiltered preview already was: the plain photo, or the
            filename tag for video. A dev-client build is what's needed to
            see the filter actually render here, not the Expo Go tunnel. */}
        <EditorCanvas
          isVideo={picked.isVideo}
          uri={picked.uri}
          params={activeFilterParams}
          width={width}
          height={height}
          style={StyleSheet.absoluteFill}
          fallback={
            picked.isVideo ? (
              <View style={styles.editPreviewVideo}>
                <VideoTagGlyph color="#fff" />
                <Text style={styles.editPreviewVideoText} numberOfLines={1}>{picked.name}</Text>
              </View>
            ) : (
              <Image source={{ uri: picked.uri }} style={styles.editPreviewImg} contentFit="cover" />
            )
          }
        />

        <View style={[styles.editRail, { top: insets.top + 14, bottom: editBottomH + 14 }]}>
          <Pressable onPress={openSound} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Sound">
            <View style={styles.editRailIcon}><MusicNoteGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Text")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Text">
            <View style={styles.editRailIcon}><TextToolGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Stickers")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Stickers">
            <View style={styles.editRailIcon}><StickerGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Effects")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Effects">
            <View style={styles.editRailIcon}><StarGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Voiceover")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Voiceover">
            <View style={styles.editRailIcon}><MicGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Loop")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Loop">
            <View style={styles.editRailIcon}><LoopGlyph /></View>
          </Pressable>
          <Pressable onPress={() => notBuilt("Flag")} style={styles.editRailItem} accessibilityRole="button" accessibilityLabel="Flag">
            <View style={styles.editRailIcon}><FlagGlyph /></View>
          </Pressable>
        </View>

        <View
          style={[styles.editBottomStack, { paddingBottom: insets.bottom + 14 }]}
          onLayout={(e) => setEditBottomH(e.nativeEvent.layout.height)}
        >
          {/* Replaces the old top bar's back button + "Save draft" text -
              a plain confirmation of what was just captured, not a control.
              The actual actions (retake, save to drafts) moved into the
              footer row below as real buttons. */}
          <View style={styles.editStatusRow}>
            <View style={styles.editStatusDot} />
            <Text style={styles.editStatusText}>
              {picked.isVideo ? `Clip recorded · ${clock(picked.durationSec ?? 0)}` : "Photo captured"}
            </Text>
          </View>

          {picked.isVideo && (
            <View style={styles.editBottomPanel}>
              <View style={styles.volumeRow}>
                <VolumeGlyph />
                <PanGestureHandler onGestureEvent={onVolumeDrag}>
                  <View style={styles.volumeTrack} onLayout={onVolumeTrackLayout}>
                    <View style={styles.volumeBase} />
                    <View style={[styles.volumeFill, { width: `${clipVolume}%` }]} />
                    <View style={[styles.volumeThumb, { left: `${clipVolume}%` }]} />
                  </View>
                </PanGestureHandler>
                <Text style={styles.volumeValue}>{clipVolume}</Text>
              </View>

              <View style={styles.scrubWrap} onLayout={(e) => setScrubW(e.nativeEvent.layout.width)}>
                {scrubW > 0 && <ScrubStripes width={scrubW} height={40} />}
              </View>
              <View style={styles.scrubLabels}>
                <Text style={styles.scrubLabel}>0:00</Text>
                <Text style={styles.scrubLabel}>{clock(picked.durationSec ?? 0)}</Text>
              </View>
            </View>
          )}

          <View style={styles.editFooter}>
            {/* Sound is still reachable - the edit rail's own Sound item,
                unchanged above - so dropping the old duplicate "Add sound"
                pill here doesn't remove the capability, just the second
                entry point to it. Retake replaces the old top bar's back
                button (same handler: discard this capture, return to the
                camera); Drafts replaces its "Save draft" text (same
                notBuilt() stub, same behavior, just relocated). */}
            <Pressable
              onPress={() => { setPicked(null); setPhase("camera"); }}
              style={styles.editFooterIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Retake"
            >
              <View style={styles.editRailIcon}><RetakeGlyph /></View>
              <Text style={styles.editFooterIconLabel}>Retake</Text>
            </Pressable>
            <Pressable
              onPress={() => notBuilt("Save draft")}
              style={styles.editFooterIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Drafts"
            >
              <View style={styles.editRailIcon}><DraftsGlyph /></View>
              <Text style={styles.editFooterIconLabel}>Drafts</Text>
            </Pressable>
            <Pressable onPress={() => setPhase("compose")} style={styles.editNextBtn} accessibilityRole="button">
              <Text style={styles.editNextText}>Next</Text>
              <NextArrowGlyph />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  /* ── Gallery grid ──────────────────────────────────────────────────────── */

  if (phase === "grid") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 10, backgroundColor: "#FFFFFF" }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => setPhase("camera")}
            style={styles.circleBtnLight}
            accessibilityRole="button"
            accessibilityLabel="Back to camera"
          >
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>New post</Text>
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
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}><ActivityIndicator color={ds.accent} /></View>
            ) : denied ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Photo access is off</Text>
                <Text style={styles.emptyText}>Teezer needs your photos to make a post.</Text>
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

  /* ── Camera ────────────────────────────────────────────────────────────── */

  if (!camPermission?.granted) {
    return (
      <View style={[styles.root, styles.permissionRoot, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={onClose} style={[styles.circleBtn, styles.topLeftFloating]} accessibilityRole="button" accessibilityLabel="Close">
          <CloseGlyph />
        </Pressable>
        <Text style={styles.permissionTitle}>Camera access is off</Text>
        <Text style={styles.permissionText}>Teezer needs your camera to shoot a post.</Text>
        <Pressable
          onPress={() => (camPermission?.canAskAgain ? void requestCamPermission() : void Linking.openSettings())}
          style={styles.permissionBtn}
          accessibilityRole="button"
        >
          <Text style={styles.permissionBtnText}>
            {camPermission?.canAskAgain ? "Allow camera access" : "Open Settings"}
          </Text>
        </Pressable>
        <Pressable onPress={() => setPhase("grid")} style={styles.permissionAlt} accessibilityRole="button">
          <Text style={styles.permissionAltText}>Choose from gallery instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* The preview as a rounded card, clipped by this wrapper rather than by
          a radius on the camera itself: the camera is a NATIVE view, and a
          native view ignores its own borderRadius on Android - only a parent
          with overflow:"hidden" actually cuts it.

          It is inset top and bottom on purpose. Full-bleed, its corners sit in
          the screen's own corners where a radius is invisible - which is
          exactly why the first two attempts at this looked unchanged. Starting
          below the safe area and ending at the foot bar (footH) puts all four
          corners on black, where they read - and leaves the card tall enough
          for the shutter to sit inside it rather than under it. */}
      <View style={[styles.cameraClip, { top: insets.top, bottom: footH }]}>
        <TeezerLiveCamera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          // grid/edit/compose all return earlier above, so reaching this JSX
          // already means phase === "camera" - always true here, not a toggle.
          isActive={true}
          mode={cameraMode}
          onCameraReady={() => setCameraReady(true)}
        />
      </View>

      {/* Countdown overlay - back because the Timer tool is reachable again.
          Without it the shutter simply appears to do nothing for 3 or 10
          seconds. */}
      {countdown != null && (
        <View style={styles.countdownWrap} pointerEvents="none">
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Cancel - leaves the camera.

          This restores the only way off this screen. The close button went
          with the top bar when the screen was stripped back, which left the
          camera with no on-screen exit at all.

          Vertically aligned with the Add Sound pill's own top so the two read
          as one row rather than two floating controls at slightly different
          heights. */}
      <Pressable
        onPress={onClose}
        style={[styles.cancelBtn, { top: insets.top + 22 }]}
        hitSlop={RAIL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Close camera"
      >
        <CancelGlyph />
      </Pressable>

      {/* Add Sound - centred at the top of the camera.

          Shows the chosen track's title once there is one, and "Add Sound"
          until then, so the same control both invites the choice and reports
          it. Reuses openSound, which already refuses to open on a published
          post (its sound cannot be changed) rather than opening a picker whose
          result would be dropped. */}
      <View
        onLayout={(e) => setSoundPillH(e.nativeEvent.layout.height)}
        style={[styles.soundPillTop, { top: insets.top + 22 }]}
        // box-none is the fix, not decoration: this wrapper spans the full
        // width to centre the pill, and as a Pressable it swallowed every
        // touch across that whole band - including the cancel button sitting
        // at the same height, which is why the X opened the sound picker.
        // Only the pill itself is touchable now; the rest of the row passes
        // taps through to whatever is under it.
        pointerEvents="box-none"
      >
        <View style={styles.soundPill}>
          <Pressable
            onPress={openSoundSheet}
            style={styles.soundPillMain}
            accessibilityRole="button"
            accessibilityLabel={track ? `Sound: ${track.title}` : "Add sound"}
          >
            <AddSoundGlyph />
            <Text style={styles.soundPillText} numberOfLines={1}>
              {track ? track.title : "Add Sound"}
            </Text>
          </Pressable>

          {/* Only once a sound is attached. Clears it in one tap, without
              reopening the picker to look for a way to undo. */}
          {!!track && (
            <Pressable
              // audioMix is trim/placement/levels FOR THIS TRACK, so it has to
              // go with it - keeping it would apply the removed sound's
              // offsets to whatever is picked next.
              onPress={() => { haptics.light(); setTrack(null); setAudioMix(null); }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Remove sound"
            >
              <Text style={styles.soundPillClear}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Right-hand tool rail.

          Collapsed it is four bold icons and a chevron; expanded it is every
          tool, each with its name to the LEFT of its icon, plus a collapse
          chevron. Expanded it scrolls, because ten rows plus labels does not
          fit a small screen between the safe area and the shutter - a rail
          that runs off the bottom would hide its own collapse control. */}
      {/* The rail's box is bounded by its NEIGHBOURS, both measured rather than
          guessed, because expanded it fills whatever it is given:

            top     below the Add Sound pill - its first row carries a label
                    that reaches left, so starting level with the pill put
                    "Flip camera" against it.
            bottom  above the shutter, the foot bar and the mode row, with 56pt
                    of clearance so the pinned Collapse row is nowhere near
                    "Photos".

          Both are measured (onLayout) because the pill and the mode row have
          each been resized more than once; a constant would go stale silently
          and the overlap would come back. */}
      <View
        style={[
          styles.rail,
          {
            top: insets.top + 22 + (soundPillH || 46) + 16,
            bottom: footH + 92 + (recording ? 0 : modeRowH + 56),
          },
        ]}
      >
        {railOpen ? (
          <>
          {/* flex:1 is what makes this scroll at all. Without a height the
              ScrollView sizes to its content and simply overflows the rail -
              nothing scrolls, and the rows past the bottom edge (Collapse
              among them) are drawn over whatever is below. Bounding it to the
              rail is what turns overflow into scrolling. */}
          <ScrollView
            style={styles.railScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.railScroll}
            // The rail is narrow and sits over the camera; keep the touch
            // target generous without widening the visible column.
            keyboardShouldPersistTaps="handled"
          >
            {TOOLS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => runTool(t.key)}
                style={styles.railRow}
                hitSlop={RAIL_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t.label}
              >
                <Text style={styles.railRowLabel} numberOfLines={1}>{t.label}</Text>
                <View style={styles.railIconWrap}>{toolGlyph(t.key, glyphCtx)}</View>
              </Pressable>
            ))}

          </ScrollView>

          {/* Pinned BELOW the scroller, not inside it - it occupies the same
              slot the expand chevron does when collapsed, so the control never
              moves and can never be scrolled out of reach. */}
          <Pressable
            onPress={() => { panelFeedback(); setRailOpen(false); }}
            style={styles.railRow}
            hitSlop={RAIL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Collapse tools"
          >
            <Text style={styles.railRowLabel}>Collapse</Text>
            <View style={styles.railIconWrap}>
              <DropdownArrowGlyph up />
            </View>
          </Pressable>
          </>
        ) : (
          <>
            {TOOLS.slice(0, RAIL_COLLAPSED_COUNT).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => runTool(t.key)}
                style={styles.railItem}
                hitSlop={RAIL_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t.label}
              >
                <View style={styles.railIconWrap}>{toolGlyph(t.key, glyphCtx)}</View>
              </Pressable>
            ))}

            <Pressable
              onPress={() => { panelFeedback(); setRailOpen(true); }}
              style={styles.railItem}
              hitSlop={RAIL_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="More tools"
            >
              <View style={styles.railIconWrap}>
                <DropdownArrowGlyph />
              </View>
            </Pressable>
          </>
        )}
      </View>

      {/* Sound picker, as a sheet over the viewfinder.

          scrollable={false} because SoundBrowsePage brings its own list -
          nesting it inside the sheet's managed ScrollView would give two
          scrollers fighting for the same drag. dragArea="header" follows from
          that: with the content owning its scrolling, the grabber is what
          dismisses. */}
      <BottomSheet
        visible={soundSheetOpen}
        // Stopping the preview player happens HERE, not in onClosed below -
        // onClose fires immediately on dismiss, while SoundBrowsePage is
        // still mounted and the exit animation hasn't even started yet.
        // onClosed only fires once that animation fully finishes, by which
        // point the sheet's content is already unmounting or gone - too
        // late to pause a still-live native player before expo-audio's own
        // unmount effect releases it (the crash this call prevents).
        onClose={() => { soundBrowseRef.current?.stop(); setSoundSheetOpen(false); }}
        onClosed={() => {
          // Runs however the sheet was dismissed - grabber, backdrop or the
          // bar - so the auditioned sound is attached exactly once, here.
          commitSound();
          if (!editorAfterSheet) return;
          setEditorAfterSheet(false);
          setMusicEditorOpen(true);
        }}
        height={0.7}
        scrollable={false}
        dragArea="header"
        header={
          <View style={styles.soundSheetHeader}>
            <Text style={styles.soundSheetTitle}>Sounds</Text>
            <Text style={styles.soundSheetSub}>Tap a sound to hear it · close to use it</Text>
          </View>
        }
      >
        <SoundBrowsePage
          ref={soundBrowseRef}
          embedded
          selectedTrackId={(pendingTrack ?? track)?.id ?? null}
          // Sets soundSheetOpen directly rather than going through the
          // BottomSheet's own dismiss path, so it never reaches the onClose
          // below - stop() has to be called here too, for the same reason.
          onClear={() => { soundBrowseRef.current?.stop(); setTrack(null); setAudioMix(null); setPendingTrack(null); setSoundSheetOpen(false); }}
          onBack={() => { soundBrowseRef.current?.stop(); setSoundSheetOpen(false); }}
          onPreviewChange={setPendingTrack}
          onOpenEditor={(sec) => { soundBrowseRef.current?.stop(); setMusicEditorSection(sec); setEditorAfterSheet(true); setSoundSheetOpen(false); }}
        />
      </BottomSheet>

      {/* Opened from the sound browser's own Sound/Volume bar, never
          automatically on picking a track - choosing a sound should attach it
          and get out of the way. projectDurationMs is the recorded or picked
          length - the hard boundary - and hasOriginalAudio is false for a
          photo, which hides the original-volume row rather than showing a
          control that governs nothing. */}
      {!!track && (
        <MusicEditorSheet
          visible={musicEditorOpen}
          onClose={() => setMusicEditorOpen(false)}
          onDone={(v) => { setAudioMix(v); setMusicEditorOpen(false); }}
          track={track}
          projectDurationMs={Math.round((picked?.durationSec ?? 0) * 1000)}
          hasOriginalAudio={!!picked?.isVideo}
          section={musicEditorSection}
          initial={audioMix ?? undefined}
        />
      )}


      {/* Bottom controls - the shutter, then the mode bar. The only chrome on
          this screen: the top bar, recording-timer pill, right-hand tool rail
          and countdown overlay were all removed so the page is a plain camera.

          Still measured (onLayout -> bottomH) because the value is read
          elsewhere; nothing above it competes for the space any more. */}
      <View
        style={styles.bottomStack}
        onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}
      >
        {/* Capture-mode row - 2m / 60s / 15s / Photos, centred above the
            shutter. Hidden mid-recording: the length is fixed once the shot
            has started, and offering it would suggest otherwise.

            Transparent, with the active mode carried by weight and colour
            rather than a pill, so the row reads as labels over the camera
            instead of another bar of chrome. */}
        {!recording && (
          <PanGestureHandler
            onHandlerStateChange={onModeSwipe}
            activeOffsetX={[-10, 10]}
            failOffsetY={[-14, 14]}
          >
            <View style={styles.modeSwipeArea}>
              <View
                style={styles.modeRow}
                onLayout={(e) => setModeRowH(e.nativeEvent.layout.height)}
              >
              {CAPTURE_MODES.map((m) => {
                const on = m.key === captureModeKey;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => pickCaptureMode(m.key)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.modeText, on && styles.modeTextOn]}>{m.label}</Text>
                  </Pressable>
                );
                })}
              </View>
            </View>
          </PanGestureHandler>
        )}

        {/* Shutter - centred, on its own. The filter carousel and the
            filter-count badge that used to flank it are gone, so it no longer
            needs the equal-width side slots that kept it off-centre-proof. */}
        <View style={styles.shutterRow}>
          <View style={styles.shutterWrap}>
            <Pressable
              onPress={onShutterPress}
              disabled={!cameraReady || busy || cameraMode !== captureMode}
              style={[styles.shutterOuter, recording && styles.shutterOuterRecording]}
              accessibilityRole="button"
              accessibilityLabel={
                captureMode === "picture" ? "Take photo" : recording ? "Stop recording" : "Start recording"
              }
            >
              {recording && (
                <ShutterProgressRing pct={elapsed / recordLimitSec} size={74} strokeWidth={5} />
              )}
              {recording ? <StopGlyph /> : <View style={styles.shutterInner} />}
            </Pressable>
          </View>
        </View>

        {/* Foot bar - gallery shortcut, then LIVE / CAMERA / CREATE.

            A solid black bar pinned to the very bottom of the screen, which is
            why it carries the safe-area inset itself rather than inheriting it
            from bottomStack: padding on the parent would have left a
            transparent strip of camera feed below the bar on a device with a
            home indicator. */}
        {/* The swipe covers the WHOLE bar, not just the labels.
            
            It used to wrap footTabs alone - a strip barely wider than the three
            words - so a swipe that began over the gallery thumb or the empty
            space beside it did nothing, which is most of the bar. failOffsetY
            lets a vertical drag through untouched rather than being claimed as
            a sloppy horizontal one. */}
        <PanGestureHandler
          onHandlerStateChange={onFootSwipe}
          activeOffsetX={[-10, 10]}
          failOffsetY={[-14, 14]}
        >
          <View
            style={[styles.footStrip, { paddingBottom: insets.bottom + 10 }]}
            onLayout={(e) => setFootH(e.nativeEvent.layout.height)}
          >
          <Pressable
            onPress={() => { tapFeedback(); setPhase("grid"); }}
            style={styles.galleryThumb}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
          >
            {recentUri ? (
              <Image source={{ uri: recentUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <GalleryGlyph />
            )}
          </Pressable>

          <View style={styles.footTabs}>
            <Pressable onPress={() => selectFootTab("live")} accessibilityRole="button">
              <Text style={[styles.footTabText, footTab === "live" && styles.footTabTextOn]}>LIVE</Text>
            </Pressable>
            <Pressable onPress={() => selectFootTab("post")} accessibilityRole="button">
              {/* Displayed label only - the internal "post" key/FOOT_TABS/
                  selectFootTab routing is unchanged. */}
              <Text style={[styles.footTabText, footTab === "post" && styles.footTabTextOn]}>CAMERA</Text>
            </Pressable>
            <Pressable onPress={() => selectFootTab("create")} accessibilityRole="button">
              <Text style={[styles.footTabText, footTab === "create" && styles.footTabTextOn]}>CREATE</Text>
            </Pressable>
          </View>

            <View style={styles.footSideSpacer} />
          </View>
        </PanGestureHandler>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },

  /** Rounded preview card. `top`/`bottom` come from the call site because both
   *  are runtime values - the safe-area inset and the measured control stack. */
  cameraClip: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#000000",
  },


  /* ── Camera overlay chrome ──────────────────────────────────────────────── */
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
  },
  circleBtn: {
    width: 36, height: 36, borderRadius: 999, backgroundColor: "rgba(20,18,24,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  circleBtnLight: {
    width: 38, height: 38, borderRadius: 999, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  topSideSlot: { width: TOP_SIDE_W, alignItems: "flex-start" },
  topRightCluster: { flexDirection: "row", alignItems: "center", width: TOP_SIDE_W, justifyContent: "flex-end" },
  soundPill: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "rgba(20,18,24,0.55)", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13,
    maxWidth: 260,
  },
  soundPillText: { color: "#fff", fontSize: 16.5, fontWeight: "700", flexShrink: 1 },
  /** The tappable label half of the pill, so the clear ✕ beside it stays its
   *  own target rather than being swallowed by the pill's own press. */
  soundPillMain: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  soundPillClear: { color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: "800", paddingLeft: 2 },
  /** Centred across the screen rather than laid out in a row, so the pill
   *  stays optically centred no matter how wide its label grows - a track
   *  title can be much longer than "Add Sound". `top` is applied at the call
   *  site from the safe-area inset. */
  soundPillTop: {
    position: "absolute", left: 0, right: 0, alignItems: "center",
    // The pill spans the full width to stay optically centred, which let a
    // long track title grow straight into the close button and the top-right
    // cluster - both sit at this exact height. Padding the row by the side
    // slots' own width walls it into the gap between them, so the title
    // ellipsises instead of colliding. Belt and braces with maxWidth below,
    // which caps it on a wide screen where this padding leaves more room than
    // the pill should ever use.
    paddingHorizontal: TOP_SIDE_W + 10,
  },
  /** The sheet's own fixed header. SoundBrowsePage's internal title is
   *  suppressed via `embedded` so this is the only one - and, being in the
   *  sheet's header rather than its content, it stays put while the list
   *  scrolls under it. */
  soundSheetHeader: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 10, gap: 3 },
  soundSheetTitle: { fontSize: 18, fontWeight: "800", color: "#16151A" },
  soundSheetSub: { fontSize: 13, fontWeight: "500", color: "#6B6875" },
  /** Top-left, over the preview. Transparent like the tool rail - the glyph
   *  carries its own shadow rather than sitting on a plate. `top` comes from
   *  the call site so it lines up with the Add Sound pill. */
  cancelBtn: {
    position: "absolute", left: 16,
    width: 42, height: 42, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
  },

  countdownWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  countdownText: { fontSize: 96, fontWeight: "800", color: "rgba(255,255,255,0.92)" },

  timerPillWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  timerPill: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(20,18,24,0.6)",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  recDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: RED },
  timerText: { color: "#fff", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },

  /* Bounded between the top bar's and bottom stack's real measured heights
     (set inline as `top`/`bottom`) - never a bare guessed `top`. Sized a
     notch smaller than the filter carousel's icons (RAIL_ICON_W). Flat list,
     matching the reference design (no expand/collapse). */
  // flex-start, not center: the rail hangs from the top of its span rather
  // than floating in the middle of the preview.
  // Spacing is set by the PITCH, not by `gap` alone: the icons paint ~30pt
  // tall (about 20 x the 1.5 scale) while their layout box is 34, so the
  // daylight between two glyphs is (RAIL_ICON_W + gap) - 30. At 34 + 20 that is
  // ~24pt - even, and generously separated.
  //
  // Tune the gap alone; RAIL_ICON_W also sets the centring box and the touch
  // target, so changing it moves two things at once.
  rail: {
    position: "absolute", right: 14, alignItems: "flex-end", justifyContent: "flex-start", gap: 20,
    // Above the bottom stack, which is rendered AFTER this in the tree and so
    // paints over it. That stack's mode-swipe area reaches 200pt up the screen
    // to catch swipes, and it was landing on the rail's pinned Collapse button
    // and swallowing its taps. zIndex covers iOS, elevation covers Android
    // (which orders by elevation, not zIndex); the rail is transparent, so the
    // elevation casts no shadow.
    zIndex: 20,
    elevation: 20,
  },
  /** Expanded rows are right-aligned so the icons stay in the same column they
   *  occupy when collapsed - only the labels extend leftwards. */
  /** Bounded by the rail so overflow becomes scrolling instead of spilling. */
  railScrollView: { flexGrow: 0, flexShrink: 1, alignSelf: "flex-end" },
  railScroll: { alignItems: "flex-end", gap: 20, paddingVertical: 4 },
  railRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  railRowLabel: {
    color: "#fff", fontSize: 13, fontWeight: "700",
    // The rail floats over the live camera, so the label needs its own
    // legibility rather than relying on whatever is behind it.
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  arrowUp: { transform: [{ rotate: "180deg" }] },
  railItem: { alignItems: "center", gap: 4 },
  railIconWrap: {
    width: RAIL_ICON_W, height: RAIL_ICON_W, borderRadius: 999,
    // Transparent - no dark plate behind the glyphs. They carry their own
    // shadow instead, so they stay readable over a bright camera feed without
    // a visible box around each one.
    backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center",
    // Scaled here rather than by resizing each glyph: these components are
    // shared with the edit rail and other screens, where their current size is
    // correct. A transform enlarges them - strokes included, so they read
    // bolder too - only in this rail.
    transform: [{ scale: 1.5 }],
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
  },
  /** Between Flip/Flash and Timer, same as the reference design's own rail. */
  railDivider: { width: 26, height: 1.5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.42)" },
  railLabel: {
    color: "#fff", fontSize: 10.5, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  railLabelOn: { color: "#FFD54A" },
  /** The Speed rail item shows its current value ("1x") in place of an
   *  icon glyph - same as the old speedPuck's own content, just resized
   *  to fit railIconWrap's smaller circle. */
  /** Pinned to the icon circle's bottom-right corner - the reference
   *  design's "Beauty" badge. */
  railBadge: {
    position: "absolute", bottom: -3, right: -5, width: 15, height: 15, borderRadius: 999,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
  },

  /* One flex column, bottom-anchored as a whole; modeRow/shutterRow/footStrip
     are normal stacked children inside it, not independently absolute-
     positioned rows guessing their own offset from the screen edge. */
  bottomStack: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 16 },

  /** The gesture's reach, not the row's look.
   *
   *  paddingTop pushes the touch area a long way up over the live preview, so
   *  the swipe can be started anywhere in the open space above the capture
   *  button rather than only on the labels - a row of text is a very small
   *  thing to have to hit. Transparent and free of press handlers, so taps
   *  fall through to whatever is beneath; only a horizontal drag is claimed
   *  (activeOffsetX), which is what keeps the tool rail tappable through it.
   *
   *  200 rather than the full height on purpose: it stops short of where the
   *  collapsed tool rail and the Add Sound pill sit, so their taps are never
   *  competing with a pan recogniser in the first place.
   *
   *  paddingBottom is the gap to the capture button. */
  modeSwipeArea: { paddingTop: 200, paddingBottom: 14, alignSelf: "stretch" },
  modeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24,
    alignSelf: "center", paddingHorizontal: 8,
  },
  modeText: {
    fontSize: 17, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.3,
    // The row sits over the live feed with no plate behind it.
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  modeTextOn: { color: "#fff", fontSize: 19.5, fontWeight: "800" },

  /* Shutter dead-center: the left slot and the carousel's fixed viewport
     are equal widths (SHUTTER_SIDE_W), same symmetric-flanking trick as
     the top bar's sound pill. `gap` guarantees a minimum shutter<->carousel
     breathing room on top of whatever space-between works out on its own. */
  // One child now, so it simply centres it. This used to distribute three
  // slots (filter badge / shutter / carousel) to keep the shutter dead-centre.
  shutterRow: { alignItems: "center", justifyContent: "center" },
  /** Holds the filter-count badge, right-aligned like the reference
   *  design's own left slot (both its columns are flex-end). */
  shutterSideSlot: { width: SHUTTER_SIDE_W, alignItems: "flex-end", gap: 6 },
  filterCountPuck: {
    width: 56, height: 56, borderRadius: 999, backgroundColor: "rgba(20,18,24,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  filterCountPuckText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  /** Wraps the shutter and its optional filter-name label as one unit, so
   *  the label toggling on/off does not affect shutterRow's own centering
   *  math (shutterWrap's width is still just its 74px child). */
  shutterWrap: { alignItems: "center" },
  shutterOuter: {
    width: 74, height: 74, borderRadius: 999, borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  /** Mid-recording, the plain white border is replaced by
   *  ShutterProgressRing (an SVG sibling of the same size) - no double
   *  border underneath it. */
  shutterOuterRecording: { borderWidth: 0 },
  /** Shown only while a non-Original filter is active - "the shutter shows
   *  what's loaded" instead of a fixed label reserving space at rest. */
  shutterFilterName: {
    marginTop: 6, fontSize: 11, fontWeight: "800", color: "#fff",
    textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  /** Solid brand pink at rest, matching the reference capture button -
   *  opacity (not an rgba fill) so the same transparency also carries
   *  through when isFilterActive swaps in a FILTER_CATEGORY_COLOR below. */
  shutterInner: {
    width: 58, height: 58, borderRadius: 999, backgroundColor: RED, opacity: 0.62,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  footStrip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 14,
    // Solid, not translucent: this is the one piece of chrome that is meant to
    // read as a bar rather than as an overlay floating on the camera feed.
    backgroundColor: "#000000",
  },
  galleryThumb: {
    width: 40, height: 40, borderRadius: 10, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)",
    // Solid white and 2pt: it sits on a black bar, so a 1pt 30%-opacity edge
    // barely registered as a frame at all.
    borderWidth: 2, borderColor: "#ffffff",
    alignItems: "center", justifyContent: "center",
  },
  /** Narrower than galleryThumb (40) on purpose. footStrip lays out
   *  [thumb][tabs][spacer] with space-between, so shrinking only the right
   *  spacer slides the tab group rightwards by half the difference - the
   *  simplest way to shift it without absolute positioning or a margin that
   *  would fight the same space-between. */
  footSideSpacer: { width: 12 },
  footTabs: { flexDirection: "row", alignItems: "center", gap: 22 },
  footTabText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.4, color: "rgba(255,255,255,0.55)" },
  footTabTextOn: { color: "#fff", fontSize: 19, fontWeight: "800" },

  /* ── Permission prompt ──────────────────────────────────────────────────── */
  permissionRoot: { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  topLeftFloating: { position: "absolute", top: 52, left: 16 },
  permissionTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  permissionText: { fontSize: 13.5, color: "rgba(255,255,255,0.65)", textAlign: "center" },
  permissionBtn: { marginTop: 14, backgroundColor: ds.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  permissionBtnText: { fontSize: 14, fontWeight: "800", color: ds.onDark },
  permissionAlt: { marginTop: 6, paddingVertical: 10 },
  permissionAltText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.65)" },

  /* ── Gallery grid / compose (light surfaces) ────────────────────────────── */
  header: { paddingHorizontal: 18, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, fontSize: 23, fontWeight: "800", color: INK, letterSpacing: -0.5 },

  gridContent: { paddingHorizontal: 18, paddingBottom: 26, gap: 5 },
  tabRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 18, paddingBottom: 12 },
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

  footer: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 18, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE, backgroundColor: "#fff",
  },
  draftBtn: {
    height: 52, paddingHorizontal: 20, borderRadius: 14,
    borderWidth: 1, borderColor: LINE, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  draftBtnText: { fontSize: 13.5, fontWeight: "700", color: INK },
  /** A brand-tinted glow under the primary CTA, not a flat fill with no
   *  shadow at all - the same "the one button that matters lifts off the
   *  page" language TikTok/IG's own post buttons use. */
  postBtn: {
    flex: 1, height: 52, borderRadius: 14, backgroundColor: ds.accent,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
    shadowColor: ds.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  postBtnText: { fontSize: 15, fontWeight: "800", color: ds.onDark },

  /* ── Post-capture editor (edit phase) ───────────────────────────────────── */
  editRoot: { flex: 1, backgroundColor: "#1B1A20" },
  editPreviewImg: { ...StyleSheet.absoluteFill },
  editPreviewVideo: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 30,
  },
  editPreviewVideoText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.7)" },

  /* Bounded between a fixed top inset and the bottom stack's own real
     measured height - same measured-not-guessed reasoning as the camera
     phase's own rail, just with no top bar left to measure. */
  editRail: { position: "absolute", right: 16, alignItems: "center", justifyContent: "center", gap: 16 },
  editRailItem: { alignItems: "center" },
  editRailIcon: {
    width: 40, height: 40, borderRadius: 999, backgroundColor: "rgba(20,18,24,0.45)",
    alignItems: "center", justifyContent: "center",
  },

  editBottomStack: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 14, paddingHorizontal: 18 },
  editBottomPanel: { gap: 10 },

  editStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editStatusDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#22C55E" },
  editStatusText: { fontSize: 12.5, fontWeight: "700", color: "rgba(255,255,255,0.85)" },

  volumeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  volumeTrack: { flex: 1, height: 24, justifyContent: "center" },
  volumeBase: {
    position: "absolute", left: 0, right: 0, top: 10, height: 4, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  volumeFill: {
    position: "absolute", left: 0, top: 10, height: 4, borderRadius: 999, backgroundColor: RED,
  },
  volumeThumb: {
    position: "absolute", top: 3, width: 18, height: 18, borderRadius: 999,
    marginLeft: -9, backgroundColor: "#fff",
  },
  volumeValue: { width: 22, textAlign: "right", fontSize: 12, fontWeight: "700", color: "#fff" },

  scrubWrap: { height: 40, borderRadius: 10, overflow: "hidden" },
  scrubLabels: { flexDirection: "row", justifyContent: "space-between" },
  scrubLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.7)" },

  editFooter: { flexDirection: "row", alignItems: "center", gap: 14 },
  editFooterIconBtn: { alignItems: "center", gap: 4 },
  editFooterIconLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  editNextBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: ds.accent, borderRadius: 999, paddingVertical: 15,
  },
  editNextText: { color: ds.onDark, fontSize: 14.5, fontWeight: "800" },
});

/* ── Compose (the design's "New post" screen) - separate from the main
   `styles` sheet: this section's styles are only ever read from this
   file's Compose-related components, not shared with the camera/edit/grid
   phases. ─────────────────────────────────────────────────────────────── */
const composeStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26, gap: 20 },

  draftStatus: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  draftsPill: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    backgroundColor: CHIP, borderWidth: 1, borderColor: LINE,
  },
  draftsPillText: { fontSize: 13.5, fontWeight: "700", color: INK },

  captionCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 15, gap: 13,
    shadowColor: "#1a1420", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  captionRow: { flexDirection: "row", gap: 13, alignItems: "stretch" },
  coverBtn: { width: 78, height: 104, borderRadius: 14, overflow: "hidden" },
  coverBtnBg: { ...StyleSheet.absoluteFill },
  coverBtnVideoBg: { backgroundColor: "#15243C", alignItems: "center", justifyContent: "center" },
  coverBtnScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 34 },
  coverBtnLabelRow: { position: "absolute", left: 0, right: 0, bottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  coverBtnLabel: { fontSize: 9.5, fontWeight: "800", color: "#fff" },
  captionInput: { flex: 1, minWidth: 0, fontSize: 14, color: INK, lineHeight: 21, paddingTop: 2, paddingBottom: 24, textAlignVertical: "top" },
  captionExpandBtn: {
    position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 999,
    backgroundColor: CHIP, alignItems: "center", justifyContent: "center",
  },
  captionEditorInput: {
    flex: 1, fontSize: 16, color: INK, lineHeight: 24,
    paddingHorizontal: 18, paddingTop: 16, textAlignVertical: "top",
  },
  captionEditorFooter: { paddingHorizontal: 18, paddingVertical: 12, alignItems: "flex-end" },
  chipBar: { flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: CHIP, paddingTop: 12 },
  miniChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 999, backgroundColor: CHIP },
  miniChipText: { fontSize: 11.5, fontWeight: "700", color: "#4A4653" },
  charCount: { fontSize: 10.5, fontWeight: "700", color: FAINT },

  secLabel: { paddingHorizontal: 4, fontSize: 11, fontWeight: "800", color: FAINT, letterSpacing: 1.3 },
  uploadDefaultsTag: { fontSize: 13, color: MUTED, lineHeight: 18, paddingHorizontal: 4, marginBottom: 2 },
  /** A soft, barely-there lift instead of a flat white block on grey - the
   *  same "card floats a couple px above the page" language TikTok/IG's own
   *  settings-style screens use. */
  card: {
    backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 16,
    shadowColor: "#1a1420", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: CHIP },
  rowLabel: { fontSize: 13.5, fontWeight: "700", color: INK },
  rowSub: { fontSize: 11, color: MUTED },
  rowValue: { fontSize: 12, fontWeight: "700", color: ds.accent, maxWidth: 104, marginRight: 2 },
  footnote: { flex: 1, fontSize: 11.5, color: MUTED, lineHeight: 16 },

  tile: { width: 36, height: 36, borderRadius: 12, backgroundColor: CHIP, alignItems: "center", justifyContent: "center" },
  tileOn: { backgroundColor: "#FDECF1" },

  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: "#DED9E2", alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: ds.accent, backgroundColor: ds.accent },

  /** The design's own toggle track - flexbox justify-content flip on the
   *  outer pill, not a translateX on the thumb, so it matches exactly. */
  track: { width: 52, height: 31, borderRadius: 999, padding: 3, backgroundColor: "#E4E0E8", flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
  trackOn: { backgroundColor: ds.accent, justifyContent: "flex-end" },
  trackThumb: { width: 25, height: 25, borderRadius: 999, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

  scheduleFields: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  scheduleField: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9, height: 46, paddingHorizontal: 13, borderRadius: 13, backgroundColor: "#F6F5F8" },
  scheduleInput: { flex: 1, minWidth: 0, fontSize: 13, color: INK, padding: 0 },

  toastWrap: { position: "absolute", left: 0, right: 0, bottom: 100, alignItems: "center" },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
    backgroundColor: "#141318", maxWidth: "84%",
    shadowColor: "#000", shadowOpacity: 0.26, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  toastDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#5FE0AE" },
  toastText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },

  /* ── Sheets (Category / Media & safety / Tag people / Location) ────────── */
  sheetHeader: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 12, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: INK },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 9, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: CHIP },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13.5, color: INK, padding: 0 },
  sheetBody: { paddingHorizontal: 18, paddingBottom: 10, gap: 20 },
  sheetEmpty: { fontSize: 13, color: MUTED, textAlign: "center", paddingVertical: 40 },

  /* ── Add link sheet ──────────────────────────────────────────────────── */
  linkInput: {
    height: 46, borderRadius: 12, backgroundColor: CHIP, paddingHorizontal: 14,
    fontSize: 14, color: INK,
  },
  linkSheetActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  linkRemoveBtn: { height: 44, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  linkRemoveText: { fontSize: 13.5, fontWeight: "700", color: "#E23B4E" },
  linkDoneBtn: { height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  linkDoneText: { fontSize: 13.5, fontWeight: "800", color: ds.onDark },

  /* "Add link" chooser popup - External link / Teezer product. */
  linkChooserRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  rowValue2: { fontSize: 11.5, fontWeight: "700", color: ds.accent, marginTop: 2 },

  /* "Add link" -> Teezer Product picker - a 3-per-row grid, same card
     language as ShopScreen's own ProductCard (rounded square cover, name,
     price) at a smaller, picker-appropriate size. */
  gridImgWrap: { borderRadius: 10, overflow: "hidden", backgroundColor: "#EAE7EC" },
  gridImg: { width: "100%", height: "100%" },
  gridImgFallback: { backgroundColor: "#EAE7EC" },
  gridCheckBadge: {
    position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: ds.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fff",
  },
  gridName: { fontSize: 12, fontWeight: "700", color: INK, marginTop: 6 },
  gridPrice: { fontSize: 12, fontWeight: "800", color: ds.accent, marginTop: 1 },
  recommendedTag: { fontSize: 10, fontWeight: "800", color: ds.accent, marginTop: 1 },
  loadMoreBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18 },
  loadMoreText: { fontSize: 12.5, fontWeight: "700", color: ds.accent },
  /* Fixed footer bar under the grid - "N of 3 selected" + Done. */
  productPageFooter: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    paddingHorizontal: 18, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE, backgroundColor: "#fff",
  },
  productCountFooterText: { fontSize: 12.5, fontWeight: "700", color: MUTED },

  /* "Add link" -> Teezer Product's not-eligible blocked state. */
  eligibilityBlock: { alignItems: "center", gap: 8, paddingVertical: 18, paddingHorizontal: 6 },
  eligibilityIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  eligibilityTitle: { fontSize: 15.5, fontWeight: "800", color: INK, textAlign: "center" },
  eligibilitySub: { fontSize: 12.5, color: MUTED, textAlign: "center", lineHeight: 18, marginBottom: 6 },
  eligibilityBtn: {
    height: 46, paddingHorizontal: 22, borderRadius: 999, backgroundColor: ds.accent,
    alignItems: "center", justifyContent: "center",
  },
  eligibilityBtnText: { fontSize: 13.5, fontWeight: "800", color: ds.onDark },
  /** Tag people / Collab / @mention before anything's been typed - a blank
   *  state instead of a default followers/following list, per direction. */
  searchEmptyState: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 64, paddingHorizontal: 30 },
  searchEmptyText: { fontSize: 13, color: MUTED, textAlign: "center" },

  /* ── Full pages (Category / Media & safety) - not sheets. Same header
     language the gallery-grid phase already uses (styles.header +
     styles.circleBtnLight + styles.title). Same background as the page
     below it (no white strip, no shadow line) - one continuous surface
     from the status bar down through the cards. */
  pageHeader: { backgroundColor: "#fff", paddingBottom: 13 },
  pageSearchWrap: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, backgroundColor: "#fff" },
  pageListContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 30, gap: 20 },
  pageCard: {
    backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 6,
    shadowColor: "#1a1420", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  catPageRow: {
    minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, borderRadius: 14, gap: 12,
  },
  /** Selected row gets a tinted fill (not just a trailing checkmark) - a
   *  clearer, punchier "this one" state than a plain list row. */
  catPageRowOn: { backgroundColor: "#FDECF1" },
  catPageRowText: { flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: "600", color: INK },
  catPageRowTextOn: { fontWeight: "800", color: ds.accent },
  catCheckCircle: {
    width: 22, height: 22, borderRadius: 999, backgroundColor: ds.accent,
    alignItems: "center", justifyContent: "center",
  },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  personChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 999, backgroundColor: CHIP },
  personChipText: { fontSize: 12, fontWeight: "700", color: INK, maxWidth: 120 },
  personChipRemove: { fontSize: 15, fontWeight: "700", color: MUTED, lineHeight: 15 },

  personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  personAvatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: CHIP },
  personAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: ds.accent },
  personAvatarInitial: { color: "#fff", fontSize: 16, fontWeight: "800" },
  addCircle: { width: 26, height: 26, borderRadius: 999, borderWidth: 1.5, borderColor: LINE, alignItems: "center", justifyContent: "center" },
  addCirclePlus: { fontSize: 16, fontWeight: "700", color: MUTED, marginTop: -1 },

  locPageRow: {
    minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12,
  },
});

/**
 * The screen RootNavigator actually registers as "PostCamera". A brand new
 * post (`editVideoId` absent) mounts PostCameraCompose immediately - nothing
 * changes for that path.
 *
 * Editing an existing one is a real GET, not a shortcut through whatever
 * `Video` object happened to already be sitting in the caller's memory (e.g.
 * Studio Content's list rows): that list only eager-loads `hashtags`
 * (StudioContentController::index), so its own items have no tagged_users/
 * collab_users/main_sound on them at all - hydrating straight from one would
 * have silently shown an edit form with an empty Tag people/Paid
 * Collaboration list even on a post that has real, accepted tags. GET
 * /videos/{id} (VideoController::show) is the one endpoint in the app that
 * already eager-loads everything the editor needs in one call (hashtags,
 * taggedUsers, collabUsers, musicTrack/audioTrack) and already enforces the
 * same owner-or-admin authorization a private/draft/scheduled post needs -
 * reused as-is, no new endpoint.
 *
 * `key={editVideoId}` on PostCameraCompose forces a full remount (fresh
 * useState initializers) if this ever renders for a second, different id in
 * place - belt and suspenders against any state leaking from one post's
 * edit session into another's.
 */
export function PostCameraScreenImpl({ onClose, editVideoId }: { onClose: () => void; editVideoId?: number }) {
  // Called unconditionally, before any early return, same as any other hook -
  // both are cheap/no-ops on the create-mode and loading paths that don't
  // use their result.
  const insets = useSafeAreaInsets();
  const videoQ = useQuery({
    queryKey: ["video", editVideoId],
    queryFn: () => videoApi.get(editVideoId as number),
    enabled: !!editVideoId,
    retry: false,
  });

  if (!editVideoId) {
    return <PostCameraCompose onClose={onClose} />;
  }

  // Wait through isFetching too, not just isLoading (which only means "no
  // data at all yet"). React Query serves ALREADY-CACHED data synchronously
  // to a newly-mounted observer even when that entry was just invalidated
  // (e.g. by this same screen's own edit-save below) and a fresh refetch is
  // still in flight - isLoading alone would let PostCameraCompose mount,
  // and its useState initializers read that pre-refetch snapshot exactly
  // once, before the fresh data arrived. That is what let a field just
  // saved (a product, a caption, anything) appear to "not have saved" the
  // very next time Edit was reopened on the same post. Waiting for
  // isFetching too means this screen never mounts on data that might still
  // be about to change under it - the cost is a brief spinner on every
  // Edit open (this query has no staleTime, so it always background-
  // refetches on mount anyway; this just makes the UI honest about that
  // instead of racing it), which matches this whole file's own "never a
  // flash of defaults" rule for what PostCameraCompose is allowed to see.
  if (videoQ.isLoading || videoQ.isFetching) {
    return (
      <View style={loadStyles.root}>
        <ActivityIndicator color={ds.accent} size="large" />
      </View>
    );
  }

  if (videoQ.isError || !videoQ.data) {
    return (
      <View style={loadStyles.root}>
        <Pressable
          onPress={onClose}
          style={[loadStyles.backBtn, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackGlyph />
        </Pressable>
        <Text style={loadStyles.errorTitle}>Couldn't open this post</Text>
        <Text style={loadStyles.errorBody}>
          {apiErrorMessage(videoQ.error, "It may have been removed, or you may not have permission to edit it.")}
        </Text>
        <Pressable onPress={() => videoQ.refetch()} style={loadStyles.retryBtn} accessibilityRole="button">
          <Text style={loadStyles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return <PostCameraCompose key={editVideoId} onClose={onClose} editVideo={videoQ.data} />;
}

const loadStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  backBtn: {
    position: "absolute", left: 16, width: 36, height: 36, borderRadius: 999,
    backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center",
  },
  errorTitle: { fontSize: 17, fontWeight: "800", color: ds.text, textAlign: "center" },
  errorBody: { fontSize: 13.5, color: ds.textMuted, textAlign: "center", lineHeight: 19 },
  retryBtn: { marginTop: 6, height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  retryText: { fontSize: 14, fontWeight: "800", color: ds.onDark },
});
