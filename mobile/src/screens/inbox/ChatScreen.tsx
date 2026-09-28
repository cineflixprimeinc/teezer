import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { haptics } from "@/services/haptics";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { inboxApi, type Conversation, type DirectMessage } from "@/api/inbox.api";
import { setActiveChatPeer, subscribeTyping, isPeerTyping } from "@/realtime/dm-events";
import { peekSocket } from "@/realtime/socket";
import { profileApi } from "@/api/profile.api";
import { videoApi } from "@/api/video.api";
import { FollowButton } from "@/components/FollowButton";
import type { ProfileDetails } from "@/types";
import { useCreatorLayer } from "@/store/creator-layer.store";
import { usePostViewer } from "@/store/post-viewer.store";
import { useAuthStore } from "@/store/auth.store";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";
import { MessageRequestEmpty } from "./MessageRequestEmpty";
import { AttachmentSheet, type AttachmentKind } from "./AttachmentSheet";
import { MediaViewer, type ViewingMedia } from "./MediaViewer";
import { PinActionIcon as PinActionGlyph } from "@/components/icons/PinActionIcon";
import { BottomSheet } from "@/components/BottomSheet";
import { MenuRow } from "@/components/sheet/MenuRow";
import * as Clipboard from "expo-clipboard";
import { GifPicker } from "@/components/feed/GifPicker";
import { SendToSheet } from "@/components/SendToSheet";
import { ReportSheet } from "@/components/report/ReportSheet";
import { StoryContextPreview } from "@/components/story/StoryContextPreview";
import { STORY_REACTION_EMOJI, storyApi } from "@/api/story.api";
import { formatClock12 } from "@/utils/date-format";

/**
 * A direct-message thread.
 *
 * Backed by GET/POST /messages/conversations/{userId}. The API already models
 * everything this renders - message_type covers text, image, video, voice,
 * audio, document, story_reply and shared_video, and DirectMessage even carries
 * `_pending`/`_failed` for optimistic sends - so the bubble switches on the
 * server's own vocabulary rather than inventing one.
 *
 * The list is INVERTED: a chat is read from the bottom, and inverting is what
 * keeps the newest message pinned without measuring content height or
 * scrolling on every keystroke.
 *
 * Sending is optimistic. A message appears the instant you hit send, carrying
 * `_pending`; the server's row replaces it on success, and a failure marks it
 * `_failed` in place rather than silently dropping what you typed.
 */

/* ── glyphs ─────────────────────────────────────────────────────────────── */

function BackGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PhoneGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 3.5h3l1.5 3.7-1.9 1.1a12 12 0 0 0 5.5 5.5l1.1-1.9 3.7 1.5v3a1.8 1.8 0 0 1-2 1.8A16.2 16.2 0 0 1 4.8 5.5a1.8 1.8 0 0 1 1.8-2z"
        stroke={ds.text}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function VideoGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={13} height={12} rx={2.5} stroke={ds.text} strokeWidth={1.9} />
      <Path d="M16 10.5l5-2.8v8.6l-5-2.8" stroke={ds.text} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function MoreGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.6} fill={ds.text} />
      <Circle cx={12} cy={12} r={1.6} fill={ds.text} />
      <Circle cx={19} cy={12} r={1.6} fill={ds.text} />
    </Svg>
  );
}

/** The waiting bar on a request you have already written to. */
function LockGlyph() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={10.5} width={16} height={10.5} rx={2.4} stroke={ds.textDim} strokeWidth={1.9} />
      <Path
        d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"
        stroke={ds.textDim}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** The pin on a shared-location bubble. */
function PinGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" stroke={ds.onDark} strokeWidth={1.9} strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={2.4} stroke={ds.onDark} strokeWidth={1.9} />
    </Svg>
  );
}

/** Drops a staged attachment before it is sent. */
function CloseGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke={ds.onDark} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Revealed on whichever side a bubble is dragged away from, via SwipeableBubble. */
function ReplyHintGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M9 14 4 9l5-5" stroke={ds.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 9h10a6 6 0 0 1 6 6v2" stroke={ds.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The heart a double-tap throws over a bubble - scales in, drifts up, fades
 *  out, then tells the row to drop it. Same 900ms shape as the feed's own
 *  double-tap-to-like burst (FeedVideoItem's HeartBurst), just centred over
 *  the bubble instead of at the exact finger position - a message bubble is
 *  too small a target for "where you tapped" to read as anything but noise. */
function MessageHeartBurst({ onDone }: { onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.heartBurst,
        {
          opacity: t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) },
            { scale: t.interpolate({ inputRange: [0, 0.18, 0.5, 1], outputRange: [0.3, 1.25, 1, 1.05] }) },
          ],
        },
      ]}
    >
      <Svg width={52} height={52} viewBox="0 0 24 24">
        <Path
          d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z"
          fill={ds.accent}
        />
      </Svg>
    </Animated.View>
  );
}

const SWIPE_TRIGGER = 46;
const SWIPE_MAX = 64;

/**
 * WhatsApp-style swipe-to-reply: drag the bubble either direction - left or
 * right - past SWIPE_TRIGGER and release to reply to it, same result as the
 * long-press menu's own Reply row. Short of that threshold, it springs back
 * with no effect. Works identically for every bubble kind (text, photo,
 * video, shared reel/profile/product, location) since this wraps whatever
 * renderBubble() returned, not any one message type.
 *
 * Its own Animated.Value per mounted instance (not one shared/id-keyed
 * value), so the FlatList recycling this component for a different message
 * can never leak one row's in-progress drag onto another's.
 *
 * activeOffsetX/failOffsetY mirror BottomSheet's own pan gesture (just
 * symmetric on X instead of one-sided): any clear horizontal drag, either
 * way, claims the gesture, while a vertical scroll or - critically - a
 * long-press held still both fall through untouched to the FlatList's
 * scroll and the bubble's own onLongPress Pressable underneath.
 */
function SwipeableBubble({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const dragX = useRef(0);

  // What .onEnd() actually needs on the JS thread, called via runOnJS - see
  // the comment there for why this can't be called directly from the worklet.
  const triggerReply = () => {
    haptics.light();
    onReply();
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
      // Runs on the JS thread, NOT as a worklet.
      //
      // These callbacks drive a legacy RN Animated.Value. Gesture handlers are
      // workletized by default, which serialises the callback's whole closure
      // to the UI thread - and an Animated.Value cannot be serialised:
      //   "[Worklets] Cannot copy value of type `AnimatedValue`"
      // Reanimated 3 tolerated this; Reanimated 4 / react-native-worklets,
      // which arrived with the SDK 54 -> 57 upgrade, throws. In a release build
      // that throw is fatal, which is what was aborting the app on every screen
      // that opens a sheet.
      .runOnJS(true)
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const dx = Math.max(-SWIPE_MAX, Math.min(e.translationX, SWIPE_MAX));
          dragX.current = dx;
          translateX.setValue(dx);
        })
        .onEnd(() => {
          const dx = dragX.current;
          // translateX is a classic Animated.Value - Reanimated bridges
          // .setValue()/native-driven .start() calls to it safely from a
          // worklet. Haptics.impactAsync (a Promise-based native module call)
          // and onReply (which sets React state) are not - those need an
          // explicit hop to the JS thread, or the native crash the app was
          // hitting here on release, once left-swipe made this reachable
          // twice as often, is exactly what happens.
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
          if (Math.abs(dx) > SWIPE_TRIGGER) {
            runOnJS(triggerReply)();
          }
        })
        .onFinalize(() => { dragX.current = 0; }),
    [onReply],
  );

  // Two separate hints, not one repositioned - "left"/"right" are different
  // style properties (Animated can't interpolate between them), and only the
  // one on the side being uncovered should ever be visible.
  const rightSwipeHintOpacity = translateX.interpolate({
    inputRange: [-1, 0, SWIPE_TRIGGER],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });
  const leftSwipeHintOpacity = translateX.interpolate({
    inputRange: [-SWIPE_TRIGGER, 0, 1],
    outputRange: [1, 0, 0],
    extrapolate: "clamp",
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.swipeRow}>
        <Animated.View pointerEvents="none" style={[styles.swipeHint, { opacity: rightSwipeHintOpacity }]}>
          <ReplyHintGlyph />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.swipeHintRight, { opacity: leftSwipeHintOpacity }]}>
          <ReplyHintGlyph />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX }] }}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The quoted-original strip shown above a reply once it's delivered - the
 * composer already has its own "Replying to..." banner while composing;
 * this is the same information surfaced on the message itself, which
 * previously only ever stored reply_to_message_id with nothing rendered
 * back for it. Tapping jumps to and briefly highlights the original.
 */
function ReplyQuote({
  original, isMine, partnerName, onPress,
}: {
  original: NonNullable<DirectMessage["reply_to_message"]>;
  isMine: boolean;
  partnerName: string;
  onPress: () => void;
}) {
  const who = isMine ? "You" : partnerName;
  const isMedia = original.message_type === "image" || original.message_type === "video" || original.message_type === "shared_video";
  return (
    <Pressable onPress={onPress} style={styles.replyQuote} accessibilityRole="button" accessibilityLabel={`Jump to ${who}'s message`}>
      <View style={styles.replyQuoteBar} />
      {isMedia && original.thumbnail_url && (
        <Image source={{ uri: original.thumbnail_url }} style={styles.replyQuoteThumb} contentFit="cover" />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.replyQuoteWho} numberOfLines={1}>{who}</Text>
        <Text style={styles.replyQuoteText} numberOfLines={1}>
          {original.deleted_for_everyone_at ? "Message deleted" : replyPreview(original as DirectMessage)}
        </Text>
      </View>
    </Pressable>
  );
}

function CameraGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M14.4336 3C15.136 3 15.7869 3.36852 16.1484 3.9707L16.9209 5.25684C17.0113 5.40744 17.174 5.5 17.3496 5.5H19C20.6569 5.5 22 6.84315 22 8.5V18C22 19.6569 20.6569 21 19 21H5C3.34315 21 2 19.6569 2 18V8.5C2 6.84315 3.34315 5.5 5 5.5H6.65039C6.82602 5.5 6.98874 5.40744 7.0791 5.25684L7.85156 3.9707C8.21306 3.36852 8.86403 3 9.56641 3H14.4336ZM12 8.5C9.51472 8.5 7.5 10.5147 7.5 13C7.5 15.4853 9.51472 17.5 12 17.5C14.4853 17.5 16.5 15.4853 16.5 13C16.5 10.5147 14.4853 8.5 12 8.5ZM12 10.5C13.3807 10.5 14.5 11.6193 14.5 13C14.5 14.3807 13.3807 15.5 12 15.5C10.6193 15.5 9.5 14.3807 9.5 13C9.5 11.6193 10.6193 10.5 12 10.5Z" />
    </Svg>
  );
}

function SendGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="#fff">
      <Path d="M19.4999 2.00098C20.0944 2.00063 20.6989 2.15072 21.2499 2.46875C22.924 3.43525 23.4977 5.57598 22.5312 7.25001L15.0311 20.2403C14.0646 21.9142 11.9238 22.488 10.2498 21.5215C9.41372 21.0387 8.85157 20.2605 8.61994 19.3975L7.1209 13.8028L15.8905 8.73927C16.3687 8.46311 16.5327 7.85126 16.2567 7.37306C15.9805 6.89505 15.3686 6.73096 14.8905 7.00685L6.12089 12.0713L2.02515 7.97462C0.658428 6.60771 0.658787 4.39204 2.02515 3.02539C2.65731 2.39319 3.53383 2.00021 4.49978 2L19.4999 2.00098Z" />
    </Svg>
  );
}

/* Composer trailing cluster - bold black now (was muted grey, per request),
   same as the Plus button's own weight/colour just above. */

function EmojiGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M21.9024 10.5976C21.4442 10.5333 20.976 10.5 20.5 10.5C17.2404 10.5 14.3455 12.0604 12.5212 14.471C12.3501 14.4887 12.1763 14.4978 12 14.4978C10.7188 14.4978 9.55217 14.0172 8.66691 13.2248L7.33309 14.7151C8.41871 15.6868 9.81141 16.3253 11.3466 16.4676C10.8023 17.7016 10.5 19.0662 10.5 20.5C10.5 20.976 10.5333 21.4442 10.5976 21.9024C5.7387 21.2205 2 17.0469 2 12C2 6.47715 6.47715 2 12 2C17.0469 2 21.2205 5.7387 21.9024 10.5976ZM21.8707 12.617C21.4254 12.5401 20.9674 12.5 20.5 12.5C17.7656 12.5 15.3512 13.8709 13.9068 15.9675C13.0194 17.2556 12.5 18.8156 12.5 20.5C12.5 20.9674 12.5401 21.4254 12.617 21.8707L21.8707 12.617ZM8.5 11.5C9.32843 11.5 10 10.8284 10 10C10 9.17157 9.32843 8.5 8.5 8.5C7.67157 8.5 7 9.17157 7 10C7 10.8284 7.67157 11.5 8.5 11.5ZM15.5 11.5C16.3284 11.5 17 10.8284 17 10C17 9.17157 16.3284 8.5 15.5 8.5C14.6716 8.5 14 9.17157 14 10C14 10.8284 14.6716 11.5 15.5 11.5Z" />
    </Svg>
  );
}

function PhotoGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M20.4668 8.69379L20.7134 8.12811C21.1529 7.11947 21.9445 6.31641 22.9323 5.87708L23.6919 5.53922C24.1027 5.35653 24.1027 4.75881 23.6919 4.57612L22.9748 4.25714C21.9616 3.80651 21.1558 2.97373 20.7238 1.93083L20.4706 1.31953C20.2942 0.893489 19.7058 0.893489 19.5293 1.31953L19.2761 1.93083C18.8442 2.97373 18.0384 3.80651 17.0252 4.25714L16.308 4.57612C15.8973 4.75881 15.8973 5.35653 16.308 5.53922L17.0677 5.87708C18.0555 6.31641 18.8471 7.11947 19.2866 8.12811L19.5331 8.69379C19.7136 9.10792 20.2864 9.10792 20.4668 8.69379ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 11.5975 21.9762 11.2002 21.9298 10.8094L19.9437 11.0452C19.9809 11.3579 20 11.6765 20 12C20 12.9012 19.851 13.7676 19.5762 14.5759L15.7073 10.707C15.3168 10.3164 14.6836 10.3164 14.2931 10.707L6.86516 18.1349C5.11372 16.6674 4 14.4637 4 12C4 7.58172 7.58172 4 12 4C12.6919 4 13.3618 4.0876 14 4.25179L14.4983 2.31487C13.6987 2.10914 12.8614 2 12 2ZM9 12C10.1046 12 11 11.1046 11 10C11 8.89543 10.1046 8 9 8C7.89543 8 7 8.89543 7 10C7 11.1046 7.89543 12 9 12Z" />
    </Svg>
  );
}

function GifGlyph() {
  return (
    <Svg width={24} height={22} viewBox="0 0 26 24" fill="none">
      <Rect x={1.5} y={4.5} width={23} height={15} rx={3} stroke={ds.text} strokeWidth={2.2} />
      <Path d="M10 10.2a2.4 2.4 0 1 0 0 3.6v-1.5H8.9" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.4 9.8v4.4" stroke={ds.text} strokeWidth={2} strokeLinecap="round" />
      <Path d="M16.6 14.2V9.8h2.8M16.6 12h2.2" stroke={ds.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function MicGlyph({ active = false }: { active?: boolean }) {
  const c = active ? ds.accent : ds.text;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={c}>
      <Path d="M20.4668 7.69379L20.7134 7.12811C21.1529 6.11947 21.9445 5.31641 22.9323 4.87708L23.6919 4.53922C24.1027 4.35653 24.1027 3.75881 23.6919 3.57612L22.9748 3.25714C21.9616 2.80651 21.1558 1.97373 20.7238 0.930828L20.4706 0.319534C20.2942 -0.106511 19.7058 -0.106511 19.5293 0.319534L19.2761 0.930828C18.8442 1.97373 18.0384 2.80651 17.0252 3.25714L16.308 3.57612C15.8973 3.75881 15.8973 4.35653 16.308 4.53922L17.0677 4.87708C18.0555 5.31641 18.8471 6.11947 19.2866 7.12811L19.5331 7.69379C19.7136 8.10792 20.2864 8.10792 20.4668 7.69379ZM14.3869 5.33879C14.661 5.77254 15.0357 6.09305 15.5111 6.30032L16.0764 6.54679C16.4567 6.71256 16.7646 6.94544 17.0001 7.24543V12C17.0001 14.7614 14.7615 17 12.0001 17C9.23865 17 7.00008 14.7614 7.00008 12V6C7.00008 3.23858 9.23865 1 12.0001 1C13.1241 1 14.1615 1.37089 14.9965 1.99697C14.7564 2.17669 14.5532 2.39808 14.3869 2.66114C14.129 3.06938 14 3.51566 14 3.99997C14 4.48428 14.129 4.93056 14.3869 5.33879ZM2.19238 13.9615L4.15392 13.5692C4.88321 17.2361 8.11888 20 12.0001 20C15.8813 20 19.1169 17.2361 19.8462 13.5692L21.8078 13.9615C20.8961 18.5452 16.8516 22 12.0001 22C7.14858 22 3.104 18.5452 2.19238 13.9615Z" />
    </Svg>
  );
}


function PlayGlyph({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4.2 19.5 12 7 19.8Z" fill="#fff" />
    </Svg>
  );
}

/** Static waveform bars for a voice note - the API gives a duration, not samples. */
function Waveform({ tint }: { tint: string }) {
  const bars = [7, 12, 18, 10, 15, 22, 14, 9, 17, 21, 12, 8, 15, 19, 11, 7, 13, 16, 9, 6];
  return (
    <View style={styles.wave}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 2.5, height: h, borderRadius: 2, backgroundColor: tint }} />
      ))}
    </View>
  );
}

/**
 * Emoji panel.
 *
 * A curated grid rather than a picker library - the OS keyboard already has a
 * full emoji key, so this only needs to cover the handful people actually reach
 * for in a chat. Zero dependencies, zero bundle cost beyond the string.
 */
const EMOJI = "😀 😂 🥹 😍 😎 🤔 😴 🙌 👏 👍 🙏 💪 🔥 ✨ 💯 🎉 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 😭 😅 😇 🥳 🤩 😤 👀 🫶".split(" ");

function clock(iso?: string | null) {
  if (!iso) return "";
  return formatClock12(iso);
}

function mmss(sec?: number | null) {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "22.8K" style, for the profile header's Following/Followers counts. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/** One-line summary of a message for the reply banner - same idea as the
 *  Inbox row's own preview() for a conversation, just for one message. */
function replyPreview(m: DirectMessage): string {
  // Checked first: body is meaningful, non-empty data here (the
  // reaction_type key, e.g. "heart"), not a caption - the general
  // "body wins if present" rule below would otherwise show it raw.
  if (m.message_type === "story_reaction") {
    return `${STORY_REACTION_EMOJI[m.body ?? ""] ?? "❤️"} Reacted to your story`;
  }
  if (m.body && m.body.trim()) return m.body;
  switch (m.message_type) {
    case "image": return "Photo";
    case "video": return "Video";
    case "shared_video": return "Shared a reel";
    case "voice":
    case "audio": return "Voice message";
    case "location": return m.location_name || "Location";
    case "story_reply": return "Story reply";
    case "shared_story": return "Shared a story";
    default: return "Message";
  }
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "Chat">>();
  const qc = useQueryClient();

  const { userId, username, name, avatar, isVerified } = route.params;
  const me = useAuthStore((s) => s.user?.id);
  /** For resolving whose Story a story_reply/story_reaction bubble points at
   *  - see the tap handler in renderBubble below. */
  const myUsername = useAuthStore((s) => s.user?.username);

  /**
   * Opened from a swiped-in creator profile, the layer that drew that profile
   * is briefly still on top - it covers the single frame between openChat
   * dispatching and these routes painting, so the feed cannot show through the
   * gap.
   *
   * By the time this effect runs that gap is closed: this screen and the
   * UserProfile route beneath it went in on one dispatch, so both have
   * rendered, and the layer is drawing a profile the stack now holds for real.
   * It goes immediately - nothing is waited on, which is what makes this open
   * at the speed of any other pushed screen.
   *
   * A no-op for every other route into this screen: dropCovered only acts on a
   * cover the store actually set.
   */
  useEffect(() => {
    useCreatorLayer.getState().dropCovered();
  }, []);

  const [draft, setDraft] = useState("");
  /** Throttled typing emit - one dm:typing per ~2.5s of continuous typing,
   *  never per keystroke. The peer's own "typing" flag self-expires (see
   *  dm-events.ts), so nothing explicit needs to fire when typing stops. */
  const lastTypingEmitRef = useRef(0);
  const onDraftChange = useCallback((text: string) => {
    setDraft(text);
    const now = Date.now();
    if (text.trim() && now - lastTypingEmitRef.current > 2500) {
      lastTypingEmitRef.current = now;
      const socket = peekSocket();
      if (socket?.connected) socket.emit("dm:typing", { to_user_id: userId });
    }
  }, [userId]);
  /** A picture chosen but NOT yet sent - it goes on Send, with the draft as its
   *  caption, and can be dropped again before then. */
  const [attachment, setAttachment] = useState<
    { uri: string; mime: string; name: string; size: number; isVideo?: boolean } | null
  >(null);
  /** The "+" grid, and the GIF picker it can open. */
  const [attachOpen, setAttachOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  /** A picture being viewed full-screen, or null. */
  const [viewing, setViewing] = useState<ViewingMedia | null>(null);
  /** The message whose action popup is open, and the one being edited. */
  const [actionFor, setActionFor] = useState<DirectMessage | null>(null);
  /** Where that popup opens from - the long-press touch point (y) and which
   *  side of the screen the bubble was on, so the popup anchors to the
   *  message itself instead of sliding up as a detached bottom sheet. */
  const [actionAnchor, setActionAnchor] = useState<{ y: number; mine: boolean } | null>(null);
  /** Drives the popup's pop-in (scale + fade, growing from the corner nearest
   *  the long-pressed bubble) - reset to 0 and sprung to 1 every time it opens. */
  const actionPopupAnim = useRef(new Animated.Value(0)).current;

  /**
   * Where the popup actually fits. The old version picked a side purely off
   * which half of the screen the touch point was in, then capped height at a
   * flat 62% of the window regardless - fine when there was room, but on a
   * shorter screen (or a message already low in the thread) that 62% still
   * reached past the bottom edge, cutting the last rows off under the home
   * indicator, exactly what the screenshot showed.
   *
   * This instead measures the real space above and below the touch point
   * (minus the safe-area insets), opens toward whichever side actually has
   * enough room - preferring below, like a native context menu, only when
   * below has at least POPUP_MIN room - and caps maxHeight to that side's
   * real space, not a guess. The ScrollView inside still scrolls if the menu
   * is taller than even that.
   */
  const POPUP_GAP = 12;
  const POPUP_MIN = 260;
  const popupLayout = useMemo(() => {
    if (!actionAnchor) return null;
    const spaceBelow = winHeight - actionAnchor.y - insets.bottom - POPUP_GAP;
    const spaceAbove = actionAnchor.y - insets.top - POPUP_GAP;
    const openUp = spaceBelow < POPUP_MIN && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(winHeight * 0.62, openUp ? spaceAbove : spaceBelow));
    return { openUp, maxHeight };
  }, [actionAnchor, winHeight, insets.top, insets.bottom]);
  const [editing, setEditing] = useState<DirectMessage | null>(null);
  /** The message the next send will reply to - mutually exclusive with
   *  `editing` (both reuse the composer, and reusing it for both meanings at
   *  once makes no sense). Set from the long-press menu's Reply row or a
   *  right-swipe on the bubble. */
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  /** The message being forwarded (SendToSheet open), and this conversation's
   *  own report sheet - reuses the existing "conversation" report entity
   *  rather than a separate per-message report system. */
  const [forwarding, setForwarding] = useState<DirectMessage | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  /** The message a duration is being picked for before it's actually pinned. */
  const [pinDurationFor, setPinDurationFor] = useState<DirectMessage | null>(null);
  /** A tapped reply preview's target, briefly flashed after scrolling to it. */
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Optimistic rows, newest first, merged ahead of the server's. */
  const [pending, setPending] = useState<DirectMessage[]>([]);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  /**
   * Presence.
   *
   * `is_online` is reported on the conversation LIST, not on message history,
   * so it is read from that cache rather than invented here. Falls back to the
   * handle when the thread is new and has no conversation row yet - better than
   * asserting "Active now" for someone who may not be.
   */
  const convos = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    staleTime: 30_000,
  });
  const presence = convos.data?.find((c) => c.user_id === userId);
  const peerTyping = useSyncExternalStore(subscribeTyping, () => isPeerTyping(userId));
  const subtitle = peerTyping ? "Typing…" : presence?.is_online ? "Active now" : `@${username}`;

  const q = useQuery({
    queryKey: ["dm-history", userId],
    queryFn: () => inboxApi.history(userId),
    staleTime: 10_000,
  });

  /* Registers this screen as "actively viewing `userId`" for as long as it's
     focused (not just mounted - a screen pushed on top of this one leaves it
     mounted but no longer visible). dm-events.ts's applyDmNew already checks
     this registry to skip bumping the unread badge for a message that
     arrives while its own conversation is open; it was just never told who
     was looking, so that check was always false. */
  useFocusEffect(
    useCallback(() => {
      setActiveChatPeer(userId);
      return () => setActiveChatPeer(null);
    }, [userId]),
  );

  /* The thread endpoint auto-marks incoming messages read server-side the
     moment it's fetched (MessageController::history), but nothing told this
     device's own Inbox list or tab badge - they only found out once their
     own 30s/15s staleTime lapsed. Zero this peer's row + refresh the badge
     the instant the thread loads, once per visit, so "opened the
     conversation" and "unread count dropped" happen together. */
  const markedReadRef = useRef<number | null>(null);
  useEffect(() => {
    if (!q.isSuccess || markedReadRef.current === userId) return;
    markedReadRef.current = userId;
    qc.setQueryData<Conversation[]>(["inbox-conversations"], (old) =>
      old?.some((c) => c.user_id === userId && c.unread_count > 0)
        ? old.map((c) => (c.user_id === userId ? { ...c, unread_count: 0 } : c))
        : old,
    );
    void qc.invalidateQueries({ queryKey: ["messagesUnreadBadge"] });
  }, [q.isSuccess, userId, qc]);

  /* ── Message-request rules ───────────────────────────────────────────────
   * The rules themselves live in MessageController::send and are enforced
   * there; this only makes the thread agree with them, so it never offers a
   * reply the server is going to refuse.
   *
   *   incoming pending → you must accept before you can reply ("Accept the
   *                      message request to reply", 403)
   *   sent pending     → you may keep writing; the server allows the original
   *                      sender, but they only see it once they accept
   *   rejected/blocked → the server refuses and says why; surfaced on send
   *
   * A non-mutual message landing in requests rather than the inbox is the same
   * rule seen from the sending side - see the send handler's notice.
   *
   * The thread endpoint does not carry a status, so it is read from the
   * requests list, which is the same source the requests screen uses.
   */
  const requests = useQuery({
    queryKey: ["message-requests"],
    queryFn: () => inboxApi.messageRequests(),
    staleTime: 30_000,
  });
  const incomingRequest = requests.data?.incoming.find((r) => r.user_id === userId) ?? null;
  const sentPending = !!requests.data?.sent.some((r) => r.user_id === userId);
  /** Either side of a request that nobody has accepted yet. */
  const isRequestThread = !!incomingRequest || sentPending;

  /** Why a send was refused, or where it landed. Cleared on the next attempt. */
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  /** Every surface that counts requests or previews threads. */
  const refreshRequestSurfaces = useCallback(() => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["message-requests"] });
    void qc.invalidateQueries({ queryKey: ["inbox-message-requests"] });
    void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
  }, [q, qc]);

  const respond = useCallback(
    (accept: boolean) => {
      if (!incomingRequest || acting) return;
      setActing(true);
      setNotice(null);
      const call = accept
        ? inboxApi.acceptRequest(incomingRequest.conversation_id)
        : inboxApi.declineRequest(incomingRequest.conversation_id);
      call
        .then(() => {
          refreshRequestSurfaces();
          // Declining leaves a thread you have said you do not want - the
          // requests screen drops it, so this should not sit here showing it.
          if (!accept) navigation.goBack();
        })
        .catch(() => setNotice("Couldn't do that - check your connection."))
        .finally(() => setActing(false));
    },
    [incomingRequest, acting, refreshRequestSurfaces, navigation],
  );

  /** Server rows newest-first (the list is inverted), with pending ones on top. */
  const messages = useMemo(() => {
    const server = [...(q.data ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return [...pending, ...server];
  }, [q.data, pending]);

  /** The most recently pinned message, shown in a bar fixed below the
   *  compact header (stays put regardless of scroll position - unlike the
   *  profile section, a pinned message is meant to always stay visible). */
  const pinnedMessage = useMemo(() => {
    const pinned = messages.filter((m) => m.is_pinned);
    if (!pinned.length) return null;
    return pinned.reduce((latest, m) =>
      new Date(m.pinned_at ?? 0).getTime() > new Date(latest.pinned_at ?? 0).getTime() ? m : latest);
  }, [messages]);

  /** Tapping a reply preview scrolls to and briefly highlights the original.
   *  Only works for a message already loaded into this page of history - an
   *  older one needs "load more" first, same boundary the reply banner's own
   *  jump would hit, so this just says so rather than fetching-until-found. */
  const jumpToMessage = useCallback((id: number) => {
    const index = messages.findIndex((m) => m.id === id);
    if (index < 0) {
      setNotice("That message isn't loaded yet - scroll up to find it.");
      return;
    }
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1200);
  }, [messages]);

  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  /**
   * A request you opened is a ONE-message introduction, then it waits.
   *
   * You get to send exactly one; after that the composer is replaced by a
   * waiting bar until they accept, at which point the thread leaves the sent-
   * requests list, `sentPending` goes false, and the composer returns for both
   * sides. Failed sends still count as pending rows here on purpose - the
   * retry path is tapping that message, not writing a second one.
   *
   * NOTE: this is the app's own rule. MessageController::send still accepts
   * further messages from the request's initiator, so nothing but this screen
   * enforces the cap today - see the handover notes.
   */
  const requestLocked = sentPending && messages.some((m) => m.sender_id === me);

  /**
   * Is this a first contact, before anything has been sent?
   *
   * `isRequestThread` cannot answer that. It reads the requests list, and that
   * list only has a row once a CONVERSATION exists - which is to say once a
   * message has been sent. Open a chat with someone you do not follow and have
   * not written to yet and there is nothing in it, so the card never appeared
   * in exactly the case it was written for.
   *
   * Not following them settles it on its own: the server files a non-mutual
   * message as a request, and not following is one half of non-mutual. Fetched
   * only while the thread is empty and not already known to be a request, which
   * is the only time the answer is used.
   */
  const contact = useQuery({
    queryKey: ["profile-user", username],
    queryFn: () => profileApi.user(username),
    // Was only fetched for an empty thread's request-card check (notFollowing
    // below) - now also backs the profile header section above the message
    // list, which needs it on every open, not just an empty one. Same cache
    // key ProfileTabScreen itself uses, so a follow toggled from here is
    // already warm/consistent if that screen is opened next.
    enabled: !q.isLoading,
    staleTime: 60_000,
  });
  const contactHasStory = !!(contact.data?.has_story || contact.data?.has_active_story);
  /** Single-user lookup (not a list, so no N+1 concern) for the same
   *  has_unseen distinction the Inbox story rail/DM rows already draw -
   *  only fetched once we know there's actually a story to check. */
  const contactStory = useQuery({
    queryKey: ["story-user", username],
    queryFn: () => storyApi.userStories(username),
    enabled: contactHasStory,
    staleTime: 30_000,
  });
  const contactStorySeen = contactHasStory && contactStory.data ? !contactStory.data.has_unseen : false;
  /** Only the half we can see - see the caveat above `contact`. */
  const notFollowing = contact.data?.is_following === false;
  const showRequestCard = isRequestThread || notFollowing;

  /**
   * Follow toggle for the profile header section - same three-state
   * (none/pending/accepted) logic ProfileTabScreen's own toggleFollow uses,
   * trimmed of its guest-auth-gate branch: a signed-out user cannot have a
   * chat open in the first place, so that case cannot occur here.
   */
  const followState: "none" | "pending" | "accepted" =
    contact.data?.follow_status ?? (contact.data?.is_following ? "accepted" : "none");
  const [followOverride, setFollowOverride] = useState<"none" | "pending" | "accepted" | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const shownFollowState = followOverride ?? followState;

  useEffect(() => { setFollowOverride(null); }, [username]);

  const toggleFollow = useCallback(() => {
    if (followBusy) return;
    const now = shownFollowState;
    setFollowBusy(true);
    setFollowOverride(now === "none" ? (contact.data?.is_private ? "pending" : "accepted") : "none");

    (now === "none" ? videoApi.follow(username) : videoApi.unfollow(username))
      .then((res) => {
        const d = (res?.data ?? {}) as { follow_status?: "none" | "pending" | "accepted"; following?: boolean; followers_count?: number };
        const settled: "none" | "pending" | "accepted" =
          d.follow_status === "pending" ? "pending" : d.following ? "accepted" : "none";
        setFollowOverride(settled);
        if (typeof d.followers_count === "number") {
          qc.setQueryData<ProfileDetails>(["profile-user", username], (old) =>
            old ? { ...old, followers_count: d.followers_count, is_following: settled === "accepted", follow_status: settled } : old);
        }
      })
      .catch(() => setFollowOverride(now))
      .finally(() => setFollowBusy(false));
  }, [followBusy, shownFollowState, contact.data?.is_private, username, qc]);

  // Drop optimistic rows once the same text arrives back from the server, so a
  // refetch does not leave the message on screen twice.
  useEffect(() => {
    if (!q.data?.length || pending.length === 0) return;
    setPending((p) => p.filter((o) => !q.data.some((s) => s.body === o.body && s.sender_id === me)));
  }, [q.data, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const [uploading, setUploading] = useState(false);

  /**
   * Pick an image and send it.
   *
   * Uses the flow the app already has: presign -> PUT the bytes straight to the
   * bucket -> tell the API about the object. Nothing is proxied through the
   * backend, so a large photo never occupies a PHP worker.
   *
   * NOTE the `r2_*` names here are legacy. Storage moved to Backblaze B2; the
   * API kept the field names, and the presigned URL is whatever the server
   * hands back, so the transport is storage-agnostic. Renaming them would be an
   * API break for no gain.
   */
  /**
   * Choose a picture. It is STAGED, not sent.
   *
   * This used to pick, upload and post in one go, so the thread gained a bubble
   * the moment the picker closed and there was no way to change your mind or
   * put a caption on it. Nothing leaves this screen now until Send is pressed.
   */
  /** Stage whatever came back from a picker or the camera. */
  const stage = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    const isVideo = asset.type === "video";
    setNotice(null);
    setAttachment({
      uri: asset.uri,
      mime: asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
      name: asset.fileName ?? `${isVideo ? "video" : "photo"}-${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
      size: asset.fileSize ?? 0,
      isVideo,
    });
  }, []);

  const pickMedia = useCallback(
    async (kind: "images" | "videos" = "images"): Promise<void> => {
      if (!me || uploading) return;
      try {
        const picked = await ImagePicker.launchImageLibraryAsync({
          // GIFs are images as far as the picker is concerned.
          mediaTypes: [kind],
          quality: 0.85,
          allowsMultipleSelection: false,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        stage(picked.assets[0]);
      } catch {
        setNotice(kind === "videos" ? "Couldn't open your videos." : "Couldn't open your photos.");
      }
    },
    [me, uploading, stage],
  );


  /**
   * Share where you are.
   *
   * Sent straight out rather than staged: unlike a picture there is nothing to
   * look at first, and a coordinate goes stale the longer it sits in a composer.
   *
   * The name is whatever the device's own reverse geocode returns and is best
   * effort - a coordinate without a name is still a usable place, so a failed
   * lookup must not fail the send.
   */
  const sendLocation = useCallback(async (): Promise<void> => {
    if (!me || uploading || incomingRequest || requestLocked) return;
    setNotice(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setNotice("Location access is off. Turn it on in Settings to share where you are.");
      return;
    }
    setUploading(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name: string | null = null;
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        name = [place?.name, place?.city, place?.country].filter(Boolean).join(", ") || null;
      } catch {
        /* best effort - see above */
      }

      const res = await inboxApi.sendLocation(userId, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        location_name: name,
      });
      if (res.status === "pending_request") {
        setNotice(`Sent as a message request. @${username} will see it once they accept.`);
        void qc.invalidateQueries({ queryKey: ["message-requests"] });
      }
      void q.refetch();
      void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setNotice(msg ?? "Couldn't get your location - try again in a moment.");
    } finally {
      setUploading(false);
    }
  }, [me, uploading, incomingRequest, requestLocked, userId, username, q, qc]);

  /** Camera capture, staged like anything else - never sent on the spot. */
  const captureMedia = useCallback(async (): Promise<void> => {
    if (!me || uploading) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setNotice("Camera access is off. Turn it on in Settings to take a photo.");
      return;
    }
    try {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
      if (shot.canceled || !shot.assets?.[0]) return;
      stage(shot.assets[0]);
    } catch {
      setNotice("Couldn't open the camera.");
    }
  }, [me, uploading, stage]);

  /**
   * A tile from the "+" grid. Runs after the sheet has closed, because a picker
   * or the camera raised while that Modal is still up lands underneath it.
   */
  const onAttachmentPick = useCallback(
    (kind: AttachmentKind, enabled: boolean) => {
      setAttachOpen(false);
      if (!enabled) {
        // Named individually rather than one blanket message - what is missing
        // is different in each case, and so is what would unblock it.
        const why: Record<string, string> = {
          reel: "Sending a reel needs a picker for choosing which one. Not built yet.",
          savedReel: "Sending a saved reel needs a picker for choosing which one. Not built yet.",
          audioCall: "Calling from a chat isn't built yet.",
          videoCall: "Calling from a chat isn't built yet.",
          space: "Sending a Space to a chat isn't built yet.",
          file: "Sending files needs a document picker this app doesn't ship yet.",
        };
        setTimeout(() => Alert.alert("Not available yet", why[kind] ?? "Not built yet."), 220);
        return;
      }
      // Same delay: the sheet's exit animation has to finish first.
      setTimeout(() => {
        if (kind === "photo") void pickMedia("images");
        else if (kind === "video") void pickMedia("videos");
        else if (kind === "camera") void captureMedia();
        else if (kind === "gif") setGifOpen(true);
        else if (kind === "location") void sendLocation();
        else if (kind === "voice") setNotice("Hold the microphone in the composer to record a voice note.");
      }, 220);
    },
    [pickMedia, captureMedia, sendLocation],
  );

  /**
   * Upload the staged picture and post it, with whatever was typed as its
   * caption. Only ever reached through `send`.
   *
   * The attachment is cleared on success and kept on failure - a picture that
   * did not upload must still be there to try again.
   */
  const sendAttachment = useCallback(
    async (body: string): Promise<void> => {
      if (!attachment || !me || uploading) return;
      setUploading(true);
      setNotice(null);
      try {
        const presign = await inboxApi.getUploadUrl({
          file_name: attachment.name,
          file_type: attachment.mime,
          file_size: attachment.size,
          media_type: attachment.isVideo ? "video" : "image",
        });

        /* Works for a remote GIF as well as a local file - uploadToR2 fetches
           the uri into a blob either way, so a Klipy URL needs no special path. */
        await inboxApi.uploadToR2(presign.upload_url, attachment.uri, presign.content_type ?? attachment.mime);

        const res = await inboxApi.sendMedia(userId, {
          message_type: attachment.isVideo ? "video" : "image",
          body: body || undefined,
          r2_key: presign.object_key,
          r2_url: inboxApi.mediaUrl(presign.object_key),
          file_size: attachment.size || undefined,
          file_name: attachment.name,
          mime_type: attachment.mime,
        });

        setAttachment(null);
        setDraft("");

        if (res.status === "pending_request") {
          setNotice(`Sent as a message request. @${username} will see it once they accept.`);
          void qc.invalidateQueries({ queryKey: ["message-requests"] });
        }
        void q.refetch();
        void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      } catch (e) {
        // The privacy rules come back as a 403 with the reason written out, and
        // that is not something the user can retry their way past.
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setNotice(msg ?? "Couldn't send that - check your connection.");
      } finally {
        setUploading(false);
      }
    },
    [attachment, me, uploading, userId, username, q, qc],
  );

  /**
   * Message actions, on the endpoints that already exist: PATCH /messages/{id}
   * for an edit, DELETE /messages/{id} with scope "me" (hide it for you) or
   * "everyone" (unsend, sender only).
   *
   * Refetch rather than patch in place: an edit changes edited_at and an unsend
   * sets deleted_for_everyone_at, both of which the bubble reads, and the server
   * is the only thing that knows what it actually did.
   */
  /** Toggle a reaction. The endpoint is itself a toggle - sending the emoji you
   *  already have removes it - so this just posts and refetches. */
  const react = useCallback(
    (m: DirectMessage, emoji: string) => {
      inboxApi
        .reactMessage(m.id, emoji)
        .then(() => void q.refetch())
        .catch(() => setNotice("Couldn't react to that."));
    },
    [q],
  );

  /** Which message is currently showing its double-tap heart burst - only one
   *  at a time needs tracking, since the burst is a fire-and-forget overlay
   *  that clears itself. */
  const [heartBurstFor, setHeartBurstFor] = useState<number | null>(null);
  /** Timestamped by message id, not a bare timer - a fast double-tap has to
   *  land on the SAME message to count (tapping A then B quickly is two
   *  single taps, not a double-tap on either). renderItem/renderBubble are
   *  plain functions called during render, not components, so this can't be
   *  a per-row hook - it lives once here instead. */
  const lastBubbleTap = useRef<{ id: number; t: number } | null>(null);
  const pendingBubbleTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Every bubble's actual "your tap landed here" handler. A second tap on the
   * SAME message within 300ms bursts a heart reaction, mirroring
   * FeedVideoItem's own double-tap-to-like; a single tap instead runs
   * `singleTapAction` (open picture/video/profile/product/map - whatever
   * that bubble kind normally does on tap, if anything), but only after that
   * same 300ms window passes with no second tap - deferred exactly like
   * FeedVideoItem's own `singleTap` timeout, so a fast double-tap can still
   * preempt it instead of also opening the thing underneath.
   */
  const handleBubbleTap = useCallback(
    (m: DirectMessage, singleTapAction?: () => void) => {
      const now = Date.now();
      const prev = lastBubbleTap.current;
      if (pendingBubbleTap.current) {
        clearTimeout(pendingBubbleTap.current);
        pendingBubbleTap.current = null;
      }
      if (prev && prev.id === m.id && now - prev.t < 300) {
        lastBubbleTap.current = null;
        haptics.light();
        setHeartBurstFor(m.id);
        // Idempotent like every other app's double-tap-to-like: never toggles
        // an existing heart back off, only adds one if it isn't there yet.
        if (!m.reactions?.some((r) => r.emoji === "❤️" && r.mine)) react(m, "❤️");
        return;
      }
      lastBubbleTap.current = { id: m.id, t: now };
      if (singleTapAction) {
        pendingBubbleTap.current = setTimeout(() => {
          pendingBubbleTap.current = null;
          singleTapAction();
        }, 300);
      }
    },
    [react],
  );

  /** Shared by the long-press menu's Reply row and the bubble's swipe gesture -
   *  both land here so the composer ends up in the same state either way. */
  const startReply = useCallback((m: DirectMessage) => {
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  }, []);

  const removeMessage = useCallback(
    (m: DirectMessage, scope: "me" | "everyone") => {
      inboxApi
        .deleteMessage(m.id, scope)
        .then(() => {
          void q.refetch();
          void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
        })
        .catch(() => setNotice("Couldn't delete that - check your connection."));
    },
    [q, qc],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    if (!me) return;
    /* Editing reuses the composer, so Send commits the edit rather than posting
       a new message. Cleared first: a failure puts the notice up, and leaving
       the bar open would invite a second attempt at a message already changed. */
    if (editing) {
      const target = editing;
      setEditing(null);
      setDraft("");
      if (!body || body === (target.body ?? "")) return;
      inboxApi
        .editMessage(target.id, body)
        .then(() => void q.refetch())
        .catch(() => setNotice("Couldn't save that edit."));
      return;
    }
    // The server refuses this outright, so do not pretend otherwise.
    if (incomingRequest) return;
    // One message per request - the composer is already gone, this just closes
    // the path a hardware keyboard could still take.
    if (requestLocked) return;
    // A staged picture goes as the message, carrying the draft as its caption.
    if (attachment) {
      void sendAttachment(body);
      return;
    }
    if (!body) return;
    const replyToId = replyTo?.id;
    setDraft("");
    setReplyTo(null);
    setNotice(null);

    const optimistic: DirectMessage = {
      id: -Date.now(),
      conversation_id: null,
      sender_id: me,
      receiver_id: userId,
      body,
      message_type: "text",
      r2_url: null,
      thumbnail_url: null,
      read_at: null,
      created_at: new Date().toISOString(),
      reply_to_message_id: replyToId ?? null,
      _pending: true,
    };
    setPending((p) => [optimistic, ...p]);

    inboxApi
      .sendMessage(userId, body, replyToId)
      .then((res) => {
        // Non-mutual on a public account: the server files this as a request
        // rather than dropping it in their inbox. Say so - otherwise a reply
        // that never comes looks like the message was simply ignored.
        if (res.status === "pending_request") {
          setNotice(`Sent as a message request. @${username} will see it once they accept.`);
          void qc.invalidateQueries({ queryKey: ["message-requests"] });
        }
        void q.refetch();
        // The inbox list shows this thread's preview and unread count.
        void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      })
      .catch((e) => {
        // The privacy rules all come back as a 403 with the reason written out
        // - "This user only accepts messages from mutual friends", "Follow this
        // user to send them a message", "Your message request was declined".
        // A silent red bubble would leave the user guessing at which.
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setNotice(msg ?? "Couldn't send that - check your connection.");
        // Keep it on screen, marked, rather than losing what was typed.
        setPending((p) =>
          p.map((o) => (o.id === optimistic.id ? { ...o, _pending: false, _failed: true } : o)),
        );
      });
  }, [draft, me, userId, q, qc, incomingRequest, requestLocked, attachment, sendAttachment, editing, replyTo, username]);


  const [emojiOpen, setEmojiOpen] = useState(false);

  /* ── voice notes ──────────────────────────────────────────────────────────
   * expo-audio records to a local file; that file goes through the SAME
   * presign -> upload -> sendMedia path as a photo, with `duration` so the
   * recipient's bubble can show the length without downloading the audio. */
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      // Mic unavailable (in use by a call, or denied at OS level).
    }
  }, [recorder]);

  const stopAndSendRecording = useCallback(async () => {
    try {
      const seconds = Math.round((recorderState.durationMillis ?? 0) / 1000);
      await recorder.stop();
      const uri = recorder.uri;
      // Guard against an accidental tap - a sub-second blip is not a message.
      if (!uri || seconds < 1) return;

      setUploading(true);
      const presign = await inboxApi.getUploadUrl({
        file_name: `voice-${Date.now()}.m4a`,
        file_type: "audio/m4a",
        file_size: 0,
        media_type: "voice",
      });
      await inboxApi.uploadToR2(presign.upload_url, uri, presign.content_type ?? "audio/m4a");
      await inboxApi.sendMedia(userId, {
        message_type: "voice",
        r2_key: presign.object_key,
        r2_url: inboxApi.mediaUrl(presign.object_key),
        mime_type: "audio/m4a",
        duration: seconds,
      });
      void q.refetch();
      void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    } catch (e) {
      // Nothing was sent; the recording is simply discarded. A privacy refusal
      // still has to be said out loud - see the picker's catch.
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg) setNotice(msg);
    } finally {
      setUploading(false);
    }
  }, [recorder, recorderState.durationMillis, userId, q, qc]);

  /** Opens the long-press action popup, anchored to the touch point. Shared by
   *  the plain-bubble wrapper below AND every media/shared/location bubble's
   *  own inner Pressable - those each claim the touch responder for their tap
   *  (open picture / open reel / open profile / open map), which otherwise
   *  swallows the long-press before it ever reaches the outer wrapper. */
  const openMessageActions = (y: number, mine: boolean, m: DirectMessage) => {
    // If the keyboard was up (mid-compose when the long-press landed), it
    // stays up behind the popup otherwise - eating into the same space the
    // popup needs, which is what pushed it up over the composer worse than
    // it already was.
    Keyboard.dismiss();
    haptics.medium();
    actionPopupAnim.setValue(0);
    Animated.spring(actionPopupAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 7 }).start();
    setActionAnchor({ y, mine });
    setActionFor(m);
  };

  const renderBubble = (m: DirectMessage) => {
    const mine = m.sender_id === me;
    const tint = mine ? "#fff" : ds.text;
    const bubble = [styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs];

    // Unsend ("delete for everyone") only ever set deleted_for_everyone_at on
    // the row server-side - it never clears body/r2_url, so without this
    // check every bubble type below would keep rendering its original
    // content forever, on both sides, exactly as if nothing had happened.
    // This takes over before any type-specific branch so it applies no
    // matter what the message actually was (text, photo, video, shared
    // reel/profile/product, location, voice) - same as every other
    // messaging app's unsend.
    if (m.deleted_for_everyone_at) {
      return (
        <View style={[styles.bubble, styles.bubbleTheirs, styles.unsentBubble]}>
          <Text style={styles.unsentText}>{mine ? "You unsent this message" : "This message was unsent"}</Text>
        </View>
      );
    }

    // Media types the API declares. Anything unknown still renders its body, so
    // a new server-side type degrades to text rather than an empty bubble.
    if (m.message_type === "shared_video" || m.message_type === "video") {
      // shared_video references a real Teezer reel (video_id set) - tapping
      // opens the actual reel viewer. Plain "video" is an uploaded chat
      // attachment, no video_id - opens in the same full-screen viewer
      // pictures use (drag-down or the ✕ to close), now that it plays video too.
      const openReel = m.message_type === "shared_video" && m.video_id
        ? () => usePostViewer.getState().showVideo(m.video_id!)
        : undefined;
      const openVideo = m.message_type === "video" && m.r2_url
        ? () => setViewing({ uri: m.r2_url!, isVideo: true })
        : undefined;
      const onOpen = openReel ?? openVideo;
      return (
        <Pressable
          // Not `disabled` when there's nothing to open (a reel row with no
          // video_id, or a plain video with no r2_url) - that would also
          // swallow the long-press, leaving this bubble's actions unreachable.
          onPress={() => handleBubbleTap(m, onOpen)}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
          delayLongPress={300}
          style={[styles.mediaCard, mine ? styles.mediaMine : styles.mediaTheirs]}
          accessibilityRole={onOpen ? "button" : undefined}
          accessibilityLabel={openReel ? "Open reel" : openVideo ? "Open video" : undefined}
        >
          {m.thumbnail_url ? (
            <Image source={{ uri: m.thumbnail_url }} style={styles.mediaFill} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.mediaFill, styles.mediaPlaceholder]} />
          )}
          <View style={styles.mediaPlay}>
            <PlayGlyph size={16} />
          </View>
        </Pressable>
      );
    }

    if (m.message_type === "shared_profile" && m.shared_user) {
      const u = m.shared_user;
      return (
        <Pressable
          onPress={() => handleBubbleTap(m, () => navigation.navigate("UserProfile", { username: u.username }))}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
          delayLongPress={300}
          style={[styles.profileCard, mine ? styles.mediaMine : styles.mediaTheirs]}
          accessibilityRole="button"
          accessibilityLabel={`Open @${u.username}'s profile`}
        >
          {u.avatar ? (
            <Image source={{ uri: u.avatar }} style={styles.profileCardAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.profileCardAvatar, styles.mediaPlaceholder]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.profileCardName, { color: tint }]} numberOfLines={1}>{u.name || u.username}</Text>
            <Text style={[styles.profileCardHandle, { color: mine ? "rgba(255,255,255,0.75)" : ds.textMuted }]} numberOfLines={1}>@{u.username}</Text>
          </View>
        </Pressable>
      );
    }

    if (m.message_type === "shared_product" && m.product) {
      const p = m.product;
      return (
        <Pressable
          onPress={() => handleBubbleTap(m, () => navigation.navigate("ProductDetail", { productId: p.id }))}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
          delayLongPress={300}
          style={[styles.profileCard, mine ? styles.mediaMine : styles.mediaTheirs]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${p.name}`}
        >
          {p.image_url ? (
            <Image source={{ uri: p.image_url }} style={styles.productCardImage} contentFit="cover" />
          ) : (
            <View style={[styles.productCardImage, styles.mediaPlaceholder]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.profileCardName, { color: tint }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.profileCardHandle, { color: mine ? "rgba(255,255,255,0.75)" : ds.textMuted }]} numberOfLines={1}>
              {p.currency} {p.price.toLocaleString()} · {p.shop?.shop_name ?? "Teezer Shop"}
            </Text>
          </View>
        </Pressable>
      );
    }

    if (m.message_type === "location" && m.latitude != null && m.longitude != null) {
      const label = m.location_name || `${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`;
      /* Handed to the OS rather than drawn: opening it in whatever map app they
         actually use beats embedding one, and needs no map SDK or key. */
      const open = () => {
        const q = `${m.latitude},${m.longitude}`;
        const url = Platform.OS === "ios"
          ? `http://maps.apple.com/?ll=${q}`
          : `geo:${q}?q=${q}(${encodeURIComponent(label)})`;
        Linking.openURL(url).catch(() => setNotice("Couldn't open a map app."));
      };
      return (
        <Pressable
          onPress={() => handleBubbleTap(m, open)}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
          delayLongPress={300}
          style={[styles.mediaCard, styles.locationCard, mine ? styles.mediaMine : styles.mediaTheirs]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${label} in maps`}
        >
          <View style={styles.locationPin}>
            <PinGlyph />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.locationName} numberOfLines={2}>{label}</Text>
            <Text style={styles.locationHint} numberOfLines={1}>Tap to open in maps</Text>
          </View>
        </Pressable>
      );
    }

    if (m.message_type === "story_reply" || m.message_type === "story_reaction") {
      // The owner of the referenced Story: whoever RECEIVED this message -
      // reply()/react() always create it sender=viewer, receiver=owner, no
      // matter which side of the 1:1 thread you're looking from it. It's
      // either me (I'm the owner, reviewing a reaction/reply I received) or
      // this thread's other participant (I sent it, reviewing my own).
      const ownerUsername = m.receiver_id === me ? myUsername : username;
      return (
        <StoryContextPreview
          thumbnailUrl={m.story_thumbnail_url ?? null}
          kind={m.message_type === "story_reaction" ? "story_reaction" : "story_reply"}
          body={m.body}
          mine={mine}
          onPress={() => {
            if (!ownerUsername) return;
            handleBubbleTap(m, () =>
              navigation.navigate("StoryViewer", { username: ownerUsername, storyId: m.story_id ?? undefined }),
            );
          }}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
        />
      );
    }

    if (m.message_type === "image" || m.message_type === "shared_story") {
      const uri = m.r2_url ?? m.story_thumbnail_url ?? m.thumbnail_url;
      return (
        /* Tap to see it properly. The bubble crops to fill, so what is in the
           thread is not necessarily the whole picture. */
        <Pressable
          // Not `disabled` when there's no uri to view - that would also
          // swallow the long-press, leaving this bubble's actions unreachable.
          onPress={() => handleBubbleTap(m, uri ? () => setViewing({ uri, isVideo: false }) : undefined)}
          onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
          delayLongPress={300}
          style={[styles.mediaCard, mine ? styles.mediaMine : styles.mediaTheirs]}
          accessibilityRole={uri ? "imagebutton" : undefined}
          accessibilityLabel={uri ? "Open picture" : undefined}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.mediaFill} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.mediaFill, styles.mediaPlaceholder]} />
          )}
        </Pressable>
      );
    }

    if (m.message_type === "voice" || m.message_type === "audio") {
      return (
        <View style={[...bubble, styles.voiceBubble]}>
          <View style={[styles.voicePlay, { backgroundColor: mine ? "rgba(255,255,255,0.25)" : ds.surfaceSunken }]}>
            <PlayGlyph />
          </View>
          <Waveform tint={mine ? "rgba(255,255,255,0.85)" : ds.textMuted} />
          <Text style={[styles.voiceTime, { color: tint }]}>{mmss(m.duration)}</Text>
        </View>
      );
    }

    return (
      <View style={bubble}>
        <Text style={[styles.bubbleText, { color: tint }, m._failed && styles.failedText]}>
          {m.body ?? ""}
        </Text>
      </View>
    );
  };

  const newestMine = messages.find((m) => m.sender_id === me);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
          <BackGlyph />
        </Pressable>

        <Pressable
          style={styles.headerWho}
          accessibilityRole="button"
          onPress={() => navigation.push("UserProfile", { username })}
        >
          <View>
            <Avatar
              uri={avatar}
              style={styles.headerAvatar}
              hasStory={contactHasStory}
              storySeen={contactStorySeen}
            />
            {/* Only when they really are online. This was drawn unconditionally,
                so every thread claimed the other person was active - including
                ones where they had chosen not to share it at all. The server
                already decides that: activity_status public/friends/no one is
                applied in MessageController::conversations, and is_online is
                simply absent for anyone it does not apply to. */}
            {presence?.is_online && <View style={styles.onlineDot} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {name || username}
              </Text>
              {(presence?.is_verified ?? isVerified) && <VerifiedBadge size={14} />}
            </View>
            <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text>
          </View>
        </Pressable>

        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Voice call" style={styles.roundBtn}>
          <PhoneGlyph />
        </Pressable>
        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Video call" style={styles.roundBtn}>
          <VideoGlyph />
        </Pressable>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Chat details"
          style={styles.roundBtn}
          onPress={() => navigation.navigate("ChatDetails", { userId, username, name, avatar })}
        >
          <MoreGlyph />
        </Pressable>
      </View>

      {/* Fixed below the compact header, stays visible regardless of scroll
          position - a pinned message is meant to always be reachable, unlike
          the profile section above which scrolls with the conversation. */}
      {!!pinnedMessage && (
        <Pressable
          style={styles.pinnedBar}
          onPress={() => jumpToMessage(pinnedMessage.id)}
          accessibilityRole="button"
          accessibilityLabel="Jump to pinned message"
        >
          <PinActionGlyph size={16} color={ds.accent} />
          <Text style={styles.pinnedBarText} numberOfLines={1}>{replyPreview(pinnedMessage)}</Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Unpin"
            onPress={() => inboxApi.unpinMessage(pinnedMessage.id).then(() => void q.refetch()).catch(() => {})}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
              <Path d="m6 6 12 12M18 6 6 18" stroke={ds.textMuted} strokeWidth={2.4} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </Pressable>
      )}

      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ds.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          keyExtractor={(m) => String(m.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          // A target scrolled past the currently-measured window (long
          // conversation, jumping far) fails the direct scroll - retry once
          // the list has settled rather than leaving it half-scrolled.
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true });
            }, 100);
          }}
          // Inverted list: the footer slot renders at the visual TOP (the
          // oldest end) - scrolls away with the conversation naturally
          // rather than staying fixed, per request. NOT counter-flipped
          // (unlike ListEmptyComponent below) - confirmed live that this
          // slot already reads right-side-up on its own; scaleY here made
          // it render upside down.
          ListFooterComponent={
            <View style={styles.profileHeader}>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.push("UserProfile", { username })}
              >
                <Avatar
                  uri={avatar}
                  style={styles.profileHeaderAvatar}
                  hasStory={contactHasStory}
                  storySeen={contactStorySeen}
                />
              </Pressable>
              <View style={styles.profileHeaderNameRow}>
                <Text style={styles.profileHeaderName} numberOfLines={1}>{name || username}</Text>
                {(contact.data?.is_verified ?? isVerified) && <VerifiedBadge size={16} />}
              </View>
              <Text style={styles.profileHeaderHandle} numberOfLines={1}>@{username}</Text>
              {(!!contact.data?.role && contact.data.role !== "user") || contact.data?.has_approved_shop ? (
                <View style={styles.profileHeaderTagsRow}>
                  {contact.data?.role === "creator" && (
                    <View style={styles.profileHeaderTag}><Text style={styles.profileHeaderTagText}>Creator</Text></View>
                  )}
                  {contact.data?.has_approved_shop && (
                    <View style={styles.profileHeaderTag}><Text style={styles.profileHeaderTagText}>Shop</Text></View>
                  )}
                </View>
              ) : null}
              {!!contact.data && (
                <Text style={styles.profileHeaderCounts}>
                  <Text style={styles.profileHeaderCountsStrong}>{compactCount(contact.data.following_count ?? 0)}</Text> Following
                  {"  ·  "}
                  <Text style={styles.profileHeaderCountsStrong}>{compactCount(contact.data.followers_count ?? 0)}</Text> Followers
                </Text>
              )}
              {!!contact.data && (
                <FollowButton
                  following={shownFollowState !== "none"}
                  pending={followBusy}
                  onPress={toggleFollow}
                  followingLabel={shownFollowState === "pending" ? "Requested" : "Following"}
                  style={styles.profileHeaderFollowBtn}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            /* Counter-flipped, because the list is inverted - see styles.empty. */
            <View style={[styles.empty, showRequestCard && styles.emptyRequest]}>
              {showRequestCard ? (
                /* No date separator above this: the reference design goes
                   straight from the header into the card, and a "Today" pill on
                   a thread with nothing in it dates an empty page. */
                <MessageRequestEmpty username={username} name={name} avatar={avatar} />
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Say hello</Text>
                  <Text style={styles.emptyBody}>
                    Messages you send to @{username} will show up here.
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item: m }) => {
            const mine = m.sender_id === me;
            const isNewestMine = mine && m.id === newestMine?.id;
            return (
              <View style={[styles.rowWrap, mine ? styles.rowMine : styles.rowTheirs]}>
                {!mine && <Avatar uri={avatar} style={styles.rowAvatar} />}
                <View style={[{ maxWidth: "78%" }, m.id === highlightedId && styles.highlighted]}>
                  {heartBurstFor === m.id && <MessageHeartBurst onDone={() => setHeartBurstFor(null)} />}
                  {!!m.reply_to_message && (
                    <ReplyQuote
                      original={m.reply_to_message}
                      isMine={m.reply_to_message.sender_id === me}
                      partnerName={name || `@${username}`}
                      onPress={() => jumpToMessage(m.reply_to_message!.id)}
                    />
                  )}
                  {/* Long-press is the way in to reply/edit/delete/unsend; a
                      right-swipe is the shortcut straight to Reply. Optimistic
                      rows have no server id yet, so there is nothing to act on
                      until they land - no gesture wrapper for those. Once a
                      message is itself unsent, there's nothing left to reply
                      to - only the long-press (for Delete for me/Report on
                      the placeholder) still applies, not the swipe. */}
                  {m.id > 0 && !m.deleted_for_everyone_at ? (
                    <SwipeableBubble onReply={() => startReply(m)}>
                      <Pressable
                        // Only text/voice bubbles ever actually receive this -
                        // every media/shared/location bubble has its own inner
                        // Pressable that claims the tap first (see
                        // handleBubbleTap's own call sites in renderBubble).
                        onPress={() => handleBubbleTap(m)}
                        onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
                        delayLongPress={300}
                      >
                        {renderBubble(m)}
                      </Pressable>
                    </SwipeableBubble>
                  ) : m.id > 0 ? (
                    <Pressable
                      onLongPress={(e) => openMessageActions(e.nativeEvent.pageY, mine, m)}
                      delayLongPress={300}
                    >
                      {renderBubble(m)}
                    </Pressable>
                  ) : (
                    <Pressable onLongPress={() => {}} delayLongPress={300}>
                      {renderBubble(m)}
                    </Pressable>
                  )}
                  {/* Chips under the bubble, tap to add or take back your own.
                      Yours reads as selected, so you can see which is you at a
                      glance rather than counting. Not for an unsent message -
                      there's nothing left to have reacted to. */}
                  {!!m.reactions?.length && !m.deleted_for_everyone_at && (
                    <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
                      {m.reactions.map((r) => (
                        <Pressable
                          key={r.emoji}
                          onPress={() => react(m, r.emoji)}
                          style={[styles.reactionChip, r.mine && styles.reactionChipMine]}
                          accessibilityRole="button"
                          accessibilityLabel={`${r.emoji} ${r.count}`}
                        >
                          <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                          <Text style={[styles.reactionCount, r.mine && styles.reactionCountMine]}>
                            {r.count}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {(!!m.edited_at || m.is_pinned) && !m.deleted_for_everyone_at && (
                    <Text style={styles.receipt}>
                      {m.is_pinned && m.edited_at ? "Pinned · Edited" : m.is_pinned ? "Pinned" : "Edited"}
                    </Text>
                  )}
                  {/* Receipt on the newest outgoing message only - one status
                      line per thread, as every messenger does it. */}
                  {isNewestMine && (
                    <Text style={styles.receipt}>
                      {m._failed
                        ? "Not delivered - tap to retry"
                        : m._pending
                          ? "Sending…"
                          : m.read_at
                            ? `Seen ${clock(m.read_at)}`
                            : m.delivered_at
                              ? "Delivered"
                              : "Sent"}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {recording && (
          <View style={styles.recBar}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>
              Recording {mmss(Math.round((recorderState.durationMillis ?? 0) / 1000))} - release to send
            </Text>
          </View>
        )}

        {emojiOpen && (
          <View style={styles.emojiPanel}>
            {EMOJI.map((e) => (
              <Pressable key={e} onPress={() => setDraft((d) => d + e)} style={styles.emojiCell}>
                <Text style={styles.emojiChar}>{e}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Why a message was refused, or where it landed. Sits above whichever
            bar is showing, so it reads as the answer to what was just tried. */}
        {/* Suppressed once locked - the waiting bar below already says this, and
            saying it twice reads as two different problems. An explicit notice
            (a refusal, or where the message landed) still shows. */}
        {(!!notice || (sentPending && !requestLocked)) && (
          <Text style={styles.notice}>
            {notice ??
              `Waiting for @${username} to accept your message request. They'll see your messages then.`}
          </Text>
        )}

        {incomingRequest ? (
          /* The rule, not a design choice: the server answers a reply from the
             receiver of a pending request with "Accept the message request to
             reply". Offering a composer here would only produce that 403. */
          <View style={[styles.requestBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Text style={styles.requestText}>
              @{username} wants to send you a message. Accept it to reply.
            </Text>
            <View style={styles.requestActions}>
              <Pressable
                onPress={() => respond(false)}
                disabled={acting}
                accessibilityRole="button"
                accessibilityLabel="Delete request"
                style={[styles.requestBtn, styles.requestBtnGhost]}
              >
                <Text style={styles.requestBtnGhostText}>Delete</Text>
              </Pressable>
              <Pressable
                onPress={() => respond(true)}
                disabled={acting}
                accessibilityRole="button"
                accessibilityLabel="Accept request"
                style={[styles.requestBtn, styles.requestBtnPrimary]}
              >
                {acting ? (
                  <ActivityIndicator size="small" color={ds.onDark} />
                ) : (
                  <Text style={styles.requestBtnPrimaryText}>Accept</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : requestLocked ? (
          /* One message has gone; the thread is closed to you until they act on
             it. Same shape as the accept bar, so both request states read as the
             same kind of pause rather than one looking broken. */
          <View style={[styles.lockedBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <LockGlyph />
            <Text style={styles.lockedText}>
              Message request sent. You can write again once @{username} accepts it.
            </Text>
          </View>
        ) : (
        <>
        {/* What is about to be sent, and the chance to change your mind. Sits
            above the composer so the caption being typed reads as belonging to
            it. */}
        {!!replyTo && (
          <View style={styles.attachBar}>
            <Text style={styles.attachText} numberOfLines={1}>
              Replying to {replyTo.sender_id === me ? "yourself" : name || `@${username}`}: {replyPreview(replyTo)}
            </Text>
            <Pressable
              onPress={() => setReplyTo(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
              style={styles.attachRemove}
            >
              <CloseGlyph />
            </Pressable>
          </View>
        )}
        {!!editing && (
          <View style={styles.attachBar}>
            <Text style={styles.attachText} numberOfLines={1}>
              Editing your message
            </Text>
            <Pressable
              onPress={() => { setEditing(null); setDraft(""); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              style={styles.attachRemove}
            >
              <CloseGlyph />
            </Pressable>
          </View>
        )}
        {!!attachment && (
          <View style={styles.attachBar}>
            <Image source={{ uri: attachment.uri }} style={styles.attachThumb} contentFit="cover" />
            <Text style={styles.attachText} numberOfLines={1}>
              {uploading ? "Sending…" : "Photo ready - add a caption or hit send"}
            </Text>
            <Pressable
              onPress={() => setAttachment(null)}
              disabled={uploading}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              style={styles.attachRemove}
            >
              <CloseGlyph />
            </Pressable>
          </View>
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Take a photo or video"
            onPress={() => void captureMedia()}
            disabled={uploading}
            style={styles.plusBtn}
          >
            {uploading ? <ActivityIndicator size="small" color={ds.text} /> : <CameraGlyph />}
          </Pressable>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Message"
              placeholderTextColor={ds.textMuted}
              style={styles.input}
              multiline
              onSubmitEditing={send}
              returnKeyType="send"
            />

            {/* The cluster yields to the send button the moment there is text -
                one primary action at a time. */}
            {draft.trim().length === 0 && (
              <View style={styles.tools}>
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Emoji"
                  onPress={() => setEmojiOpen((v) => !v)}
                >
                  <EmojiGlyph />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Send a photo"
                  onPress={() => void pickMedia("images")}
                  disabled={uploading}
                >
                  <PhotoGlyph />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Send a GIF"
                  onPress={() => setGifOpen(true)}
                  disabled={uploading}
                >
                  <GifGlyph />
                </Pressable>
                {/* Hold to record, release to send - the gesture every messenger
                    uses, and it makes an accidental tap a no-op rather than an
                    empty voice note. */}
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={recording ? "Release to send" : "Hold to record a voice message"}
                  onPressIn={startRecording}
                  onPressOut={stopAndSendRecording}
                  disabled={uploading}
                >
                  <MicGlyph active={recording} />
                </Pressable>
              </View>
            )}
          </View>
          {/* Appears once there is something to send - typed text, a staged
              picture, or both. Nothing goes without it being pressed. */}
          {(draft.trim().length > 0 || !!attachment) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={send}
              disabled={uploading}
              style={[styles.sendBtn, uploading && styles.sendBtnBusy]}
            >
              {uploading ? <ActivityIndicator size="small" color={ds.onDark} /> : <SendGlyph />}
            </Pressable>
          )}
        </View>
        </>
        )}
      </KeyboardAvoidingView>

      <MediaViewer media={viewing} onClose={() => setViewing(null)} />

      {/* What can be done to one message - anchored to the bubble itself
          (the long-press's touch point) rather than a detached bottom sheet,
          same as the reference interaction. Flips to open upward when there
          isn't room below (near the composer), and sits on the same side of
          the screen the bubble was on. A transparent Modal, not another
          BottomSheet, because this needs free X/Y positioning, not a slide-
          up-from-the-bottom sheet. */}
      <Modal visible={!!actionFor} transparent animationType="fade" onRequestClose={() => setActionFor(null)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setActionFor(null)} accessibilityLabel="Close">
          {/* Real blur behind the popup - dims and softens the conversation
              rather than a flat scrim, so the focus reads as "this message"
              the way iOS/Telegram's own long-press does. */}
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
          {!!actionAnchor && !!popupLayout && (
            <Animated.View
              style={[
                styles.actionPopup,
                actionAnchor.mine ? { right: 14 } : { left: 14 },
                popupLayout.openUp
                  ? { bottom: winHeight - actionAnchor.y + 10 }
                  : { top: actionAnchor.y + 22 },
                { maxHeight: popupLayout.maxHeight },
                {
                  opacity: actionPopupAnim,
                  transform: [{ scale: actionPopupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
                  // Grows outward from the corner nearest the long-pressed
                  // bubble instead of from dead centre - same side as the
                  // anchor (left/right) and same side it opened from (up/down).
                  transformOrigin: [
                    actionAnchor.mine ? "100%" : "0%",
                    popupLayout.openUp ? "100%" : "0%",
                  ].join(" "),
                },
              ]}
              // Swallow taps so they don't fall through to the backdrop's close.
              onStartShouldSetResponder={() => true}
            >
        <ScrollView bounces={false}>
          {/* Once a message is unsent there's nothing left to react to, reply
              to, copy, forward, edit, or pin - deleted_for_everyone_at is set
              but the row's original body/media is still there underneath (see
              renderBubble's own comment on this), so every one of those would
              otherwise still work on content the bubble no longer shows.
              Only Delete for me (hide the placeholder from your own view) and
              Report stay available, same as other messaging apps. */}
          {!actionFor?.deleted_for_everyone_at && (
            <>
              {/* The quick row every messenger opens with. Tapping one that is
                  already yours takes it back, because the endpoint toggles. */}
              <View style={styles.reactPicker}>
                {["❤️", "😂", "😮", "😢", "🙏", "👍"].map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => {
                      const target = actionFor;
                      setActionFor(null);
                      if (target) react(target, e);
                    }}
                    style={({ pressed }) => [styles.reactPick, pressed && styles.reactPickPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`React ${e}`}
                  >
                    <Text style={styles.reactPickEmoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actionDivider} />

              {!!actionFor && actionFor.id > 0 && (
                <MenuRow
                  icon="arrow-undo-outline"
                  title="Reply"
                  onPress={() => {
                    const target = actionFor;
                    setActionFor(null);
                    if (target) startReply(target);
                  }}
                />
              )}
              {!!actionFor?.body && (
                <MenuRow
                  icon="copy-outline"
                  title="Copy text"
                  onPress={() => {
                    const body = actionFor?.body ?? "";
                    setActionFor(null);
                    void Clipboard.setStringAsync(body);
                  }}
                />
              )}
              {!!actionFor && actionFor.id > 0 && (
                <MenuRow
                  icon="arrow-redo-outline"
                  title="Forward"
                  onPress={() => {
                    const target = actionFor;
                    setActionFor(null);
                    setForwarding(target);
                  }}
                />
              )}
              {actionFor?.sender_id === me && actionFor?.message_type === "text" && (
                <MenuRow
                  icon="create-outline"
                  title="Edit"
                  subtitle="Only your own text messages can be changed"
                  onPress={() => {
                    const target = actionFor;
                    setActionFor(null);
                    if (!target) return;
                    setReplyTo(null);
                    setEditing(target);
                    setDraft(target.body ?? "");
                  }}
                />
              )}
              <MenuRow
                icon={<PinActionGlyph color={actionFor?.is_pinned ? ds.accent : ds.text} />}
                title={actionFor?.is_pinned ? "Unpin" : "Pin"}
                subtitle={actionFor?.is_pinned ? "Remove it from this chat's pins" : "Keep it easy to find in this chat"}
                onPress={() => {
                  const target = actionFor;
                  setActionFor(null);
                  if (!target) return;
                  if (target.is_pinned) {
                    inboxApi.unpinMessage(target.id).then(() => void q.refetch()).catch(() => setNotice("Couldn't change that pin."));
                  } else {
                    // Ask how long to keep it pinned, rather than pinning
                    // forever by default - see the pin-duration sheet below.
                    setPinDurationFor(target);
                  }
                }}
              />
            </>
          )}
          <MenuRow
            icon="eye-off-outline"
            title="Delete for me"
            subtitle="Removes it from your side only"
            onPress={() => {
              const target = actionFor;
              setActionFor(null);
              if (target) removeMessage(target, "me");
            }}
          />
          {actionFor?.sender_id === me && !actionFor?.deleted_for_everyone_at && (
            <MenuRow
              icon="trash-outline"
              title="Unsend"
              subtitle="Removes it for both of you"
              destructive
              onPress={() => {
                const target = actionFor;
                setActionFor(null);
                if (target) removeMessage(target, "everyone");
              }}
            />
          )}
          {actionFor && actionFor.sender_id !== me && (
            // Reuses the same "conversation" report entity/endpoint the
            // header's Chat details menu presumably would - there's no
            // separate per-message report system to duplicate.
            <MenuRow
              icon="flag-outline"
              title="Report"
              destructive
              onPress={() => {
                setActionFor(null);
                setReportOpen(true);
              }}
            />
          )}
        </ScrollView>
            </Animated.View>
          )}
        </Pressable>
      </Modal>

      {/* Asked only when PINNING (unpin above is instant) - which duration to
          keep it pinned for, rather than defaulting to forever. */}
      <BottomSheet visible={!!pinDurationFor} onClose={() => setPinDurationFor(null)} scrollable={false}>
        <View style={{ paddingBottom: insets.bottom + 12, paddingTop: 4 }}>
          <Text style={styles.pinDurationTitle}>Pin for how long?</Text>
          {([
            { key: "24h", label: "24 hours" },
            { key: "7d", label: "7 days" },
            { key: "30d", label: "30 days" },
            { key: "forever", label: "Until I unpin it" },
          ] as const).map((opt) => (
            <MenuRow
              key={opt.key}
              icon={<PinActionGlyph color={ds.text} />}
              title={opt.label}
              onPress={() => {
                const target = pinDurationFor;
                setPinDurationFor(null);
                if (!target) return;
                inboxApi.pinMessage(target.id, opt.key)
                  .then(() => void q.refetch())
                  .catch(() => setNotice("Couldn't pin that message."));
              }}
            />
          ))}
        </View>
      </BottomSheet>

      <SendToSheet
        visible={!!forwarding}
        onClose={() => setForwarding(null)}
        title="Forward message"
        source="forward"
        onSend={(friendId) => {
          const target = forwarding!;
          return inboxApi.forwardMessage(target.id, friendId);
        }}
      />

      <ReportSheet
        visible={reportOpen}
        entityType="conversation"
        entityId={userId}
        onClose={() => setReportOpen(false)}
      />

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={onAttachmentPick}
      />

      {/* Klipy, the same provider the comment composer uses. The chosen GIF is
          STAGED like any other picture - it still goes on Send. */}
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(gif) => {
          setGifOpen(false);
          const uri = gif.url;
          if (!uri) return;
          setNotice(null);
          setAttachment({ uri, mime: "image/gif", name: `gif-${Date.now()}.gif`, size: 0 });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0EDF1",
  },
  headerWho: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  headerAvatar: { width: 38, height: 38, borderRadius: 999 },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: "#2BC48A",
    borderWidth: 2,
    borderColor: ds.surface,
  },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerName: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text, flexShrink: 1 },
  headerSub: { fontSize: font.xs, color: ds.textMuted, marginTop: 1 },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#F4F2F5",
    alignItems: "center",
    justifyContent: "center",
  },

  listContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  rowWrap: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  rowAvatar: { width: 26, height: 26, borderRadius: 999 },
  swipeRow: { flexDirection: "row", alignItems: "center" },
  swipeHint: { position: "absolute", left: -26, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  swipeHintRight: { position: "absolute", right: -26, width: 20, height: 20, alignItems: "center", justifyContent: "center" },

  /** Briefly flashed around a message jumped to from its reply quote. */
  highlighted: { backgroundColor: ds.accentWash, borderRadius: 20 },

  replyQuote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4,
    backgroundColor: "#F1EFF3", borderRadius: 12,
  },
  replyQuoteBar: { width: 3, alignSelf: "stretch", borderRadius: 999, backgroundColor: ds.accent },
  replyQuoteThumb: { width: 30, height: 30, borderRadius: 6 },
  replyQuoteWho: { fontSize: 11.5, fontWeight: "700", color: ds.accent },
  replyQuoteText: { fontSize: 12, color: ds.textDim, marginTop: 1 },

  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleTheirs: { backgroundColor: "#F1EFF3", borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: ds.accent, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: font.base, lineHeight: 21 },
  failedText: { opacity: 0.7 },
  // Always the neutral/grey pill, on either side - real messaging apps never
  // keep the sender's own accent color once a message is unsent, since the
  // point is that it no longer reads as "content", just a system-like note.
  unsentBubble: { backgroundColor: "#F1EFF3" },
  unsentText: { fontSize: font.base, fontStyle: "italic", color: ds.textMuted },

  mediaCard: {
    width: 168,
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#EAE7EE",
  },
  mediaMine: { borderBottomRightRadius: 6 },
  mediaTheirs: { borderBottomLeftRadius: 6 },
  mediaFill: { width: "100%", height: "100%" },
  mediaPlaceholder: { backgroundColor: "#E4E1E8" },
  mediaPlay: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -19,
    marginTop: -19,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(18,16,20,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  /** shared_profile / shared_product - same card shell as mediaCard, laid
   *  out as a row instead of a full-bleed thumbnail. */
  profileCard: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    padding: 10,
    backgroundColor: "#EAE7EE",
  },
  profileCardAvatar: { width: 44, height: 44, borderRadius: 999 },
  productCardImage: { width: 44, height: 44, borderRadius: 10 },
  profileCardName: { fontSize: 13.5, fontWeight: "700" },
  profileCardHandle: { fontSize: 11.5, marginTop: 2 },

  voiceBubble: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  voicePlay: { width: 26, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  wave: { flexDirection: "row", alignItems: "center", gap: 2.5, height: 24 },
  voiceTime: { fontSize: font.xs, fontWeight: font.weightBold },

  receipt: { fontSize: font.xs, color: ds.textMuted, alignSelf: "flex-end", marginTop: 4 },

  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0EDF1",
  },

  /* Message-request bar - stands in for the composer while a request is
     unanswered, on the composer's own border and padding so the foot of the
     screen keeps its shape. */
  notice: { fontSize: font.xs, color: ds.textDim, paddingHorizontal: 16, paddingBottom: 8, lineHeight: 17 },
  requestBar: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0EDF1",
  },
  requestText: { fontSize: font.sm, color: ds.textDim, lineHeight: 18 },

  /** Composer replacement while a sent request waits - matches requestBar. */
  lockedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0EDF1",
  },
  lockedText: { flex: 1, fontSize: font.sm, color: ds.textDim, lineHeight: 18 },
  requestActions: { flexDirection: "row", gap: 10 },
  requestBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  requestBtnGhost: { backgroundColor: "#F4F2F5" },
  requestBtnGhostText: { fontSize: font.sm, fontWeight: "700", color: ds.text },
  requestBtnPrimary: { backgroundColor: ds.accent },
  requestBtnPrimaryText: { fontSize: font.sm, fontWeight: "700", color: ds.onDark },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#F4F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: "#F4F2F5",
    paddingLeft: 16,
    paddingRight: 10,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: font.base + 1,
    color: ds.text,
  },
  tools: { flexDirection: "row", alignItems: "center", gap: 13, paddingBottom: 12, paddingLeft: 8 },

  emojiPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0EDF1",
  },
  emojiCell: { width: "12.5%", alignItems: "center", paddingVertical: 7 },
  emojiChar: { fontSize: 24 },

  recBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#FDEBF0",
  },
  recDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: ds.accent },
  recText: { fontSize: font.sm, fontWeight: font.weightBold, color: ds.accent },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnBusy: { opacity: 0.6 },

  /** Reaction chips, aligned to whichever side the bubble is on. */
  heartBurst: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", zIndex: 5,
  },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  reactionRowMine: { justifyContent: "flex-end" },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: ds.surfaceSunken,
    borderWidth: 1,
    borderColor: "transparent",
  },
  reactionChipMine: { borderColor: ds.accent, backgroundColor: "#FEF0F4" },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: "700", color: ds.textMuted },
  reactionCountMine: { color: ds.accent },

  // The BlurView behind the popup already dims and softens the chat, so this
  // only needs a faint scrim on top of it for a touch more contrast - not the
  // whole darkening job it used to do alone.
  actionBackdrop: { flex: 1, backgroundColor: "rgba(18,16,20,0.10)" },
  actionPopup: {
    position: "absolute",
    width: 252,
    borderRadius: 20,
    backgroundColor: ds.surface,
    paddingVertical: 6,
    overflow: "hidden",
    // A bit more lift than BottomSheet's card - this floats free over blurred
    // content instead of sitting flush against the bottom of the screen.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 14,
  },

  /** The quick row at the top of a message's actions. */
  reactPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  reactPick: { padding: 7, borderRadius: 18 },
  reactPickPressed: { backgroundColor: ds.accentWash, transform: [{ scale: 0.9 }] },
  reactPickEmoji: { fontSize: 25 },
  actionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#F0EDF1", marginBottom: 4 },

  pinDurationTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text, paddingHorizontal: 16, paddingBottom: 8 },

  pinnedBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: ds.accentWash,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0EDF1",
  },
  pinnedBarText: { flex: 1, fontSize: 12.5, color: ds.text },

  /** A shared place - a row, not a cropped tile like the media bubbles. */
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    width: 232,
    height: undefined,
    padding: 12,
  },
  locationPin: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  locationName: { fontSize: 13.5, fontWeight: "700", color: ds.text, lineHeight: 18 },
  locationHint: { marginTop: 2, fontSize: 11, color: ds.textMuted },

  /** The staged picture, above the composer until Send is pressed. */
  attachBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  attachThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: ds.surfaceSunken },
  attachText: { flex: 1, fontSize: 12, color: ds.textDim },
  attachRemove: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(18,16,20,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  /** NOT counter-flipped: unlike ListEmptyComponent (which replaces the
   *  entire list content when there's no data and needs the scaleY trick to
   *  cancel the container's own flip), ListFooterComponent renders alongside
   *  real cell items when the list is non-empty and reads right-side-up on
   *  its own - confirmed live; scaleY here rendered everything upside down. */
  profileHeader: {
    alignItems: "center", gap: 4,
    paddingTop: 20, paddingBottom: 24, paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0EDF1",
  },
  profileHeaderAvatar: { width: 84, height: 84, borderRadius: 999, marginBottom: 8 },
  profileHeaderNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileHeaderName: { fontSize: font.lg, fontWeight: font.weightBold, color: ds.text, maxWidth: 260 },
  profileHeaderHandle: { fontSize: font.sm, color: ds.textMuted, marginTop: 2 },
  profileHeaderTagsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  profileHeaderTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  profileHeaderTagText: { fontSize: 11, fontWeight: "700", color: ds.textDim },
  profileHeaderCounts: { fontSize: font.sm, color: ds.textMuted, marginTop: 10 },
  profileHeaderCountsStrong: { fontWeight: font.weightBold, color: ds.text },
  profileHeaderFollowBtn: { marginTop: 14 },

  empty: { paddingTop: 80, alignItems: "center", gap: 6, transform: [{ scaleY: -1 }] },
  /** The request card sits just under the header, not floated down the page. */
  emptyRequest: { paddingTop: 12, gap: 0 },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  emptyBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center" },
});
