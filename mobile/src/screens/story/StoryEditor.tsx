import { useCallback, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { BottomSheet } from "@/components/BottomSheet";
import { EmojiPicker } from "@/components/emoji/EmojiPicker";
import { musicApi, type MusicTrack } from "@/api/music.api";
import { TransformableLayer, type LayerTransform } from "./TransformableLayer";

/**
 * Story editor - the design's `storyIsEdit` phase, between picking media and
 * choosing who sees it.
 *
 * WHAT IS REAL: the media on the canvas, the music list (GET /music/trending),
 * and the text/emoji overlays - those are `StoryLayer`s with the same x/y/color/
 * font the website writes, so they are posted with the story rather than being
 * a preview that evaporates on Next.
 *
 * WHAT IS NOT: sticker, GIF and draw. `StoryLayerType` is text | link | mention
 * | hashtag | location | emoji - there is nothing to persist a sticker, a GIF or
 * a brush stroke as, so those three announce themselves rather than drawing
 * something the post would silently drop.
 */

/**
 * An overlay while it is being edited; serialised to a StoryLayer on post.
 *
 * Every field here has a home in StoryLayer already - x_percent, y_percent,
 * scale_value, rotation and z_index have been columns since the stories table
 * was created. The editor simply never wrote anything but x and y.
 */
export interface StoryOverlay {
  id: string;
  kind: "text" | "emoji";
  text: string;
  color: string;
  /** Percent of the canvas, matching StoryLayer.x / StoryLayer.y. */
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise, matching StoryLayer.rotation. */
  rotation: number;
  /** Draw order. Newest on top; never reshuffled by selecting something. */
  zIndex: number;
}

/** The design's text colours. White first - it reads on almost any frame. */
export const TEXT_COLORS = ["#FFFFFF", "#121014", "#F42B5B", "#FFC53D", "#5FE0AE", "#2FB6F0", "#8B5CF6"];

/** How tall the drop-to-delete strip is, measured up from the canvas bottom. */
const DELETE_ZONE_H = 132;

/* ── Rail glyphs ─────────────────────────────────────────────────────────── */

/** "Stickers" tool's icon - provided SVG, filled rather than stroked. */
function EmojiToolGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="#fff">
      <Path d="M21.9024 10.5976C21.4442 10.5333 20.976 10.5 20.5 10.5C17.2404 10.5 14.3455 12.0604 12.5212 14.471C12.3501 14.4887 12.1763 14.4978 12 14.4978C10.7188 14.4978 9.55217 14.0172 8.66691 13.2248L7.33309 14.7151C8.41871 15.6868 9.81141 16.3253 11.3466 16.4676C10.8023 17.7016 10.5 19.0662 10.5 20.5C10.5 20.976 10.5333 21.4442 10.5976 21.9024C5.7387 21.2205 2 17.0469 2 12C2 6.47715 6.47715 2 12 2C17.0469 2 21.2205 5.7387 21.9024 10.5976ZM21.8707 12.617C21.4254 12.5401 20.9674 12.5 20.5 12.5C17.7656 12.5 15.3512 13.8709 13.9068 15.9675C13.0194 17.2556 12.5 18.8156 12.5 20.5C12.5 20.9674 12.5401 21.4254 12.617 21.8707L21.8707 12.617ZM8.5 11.5C9.32843 11.5 10 10.8284 10 10C10 9.17157 9.32843 8.5 8.5 8.5C7.67157 8.5 7 9.17157 7 10C7 10.8284 7.67157 11.5 8.5 11.5ZM15.5 11.5C16.3284 11.5 17 10.8284 17 10C17 9.17157 16.3284 8.5 15.5 8.5C14.6716 8.5 14 9.17157 14 10C14 10.8284 14.6716 11.5 15.5 11.5Z" />
    </Svg>
  );
}

/** Text tool - the literal "Aa" mark, not an abstract icon. */
function AaGlyph() {
  return <Text style={styles.aaGlyph}>Aa</Text>;
}

/** "Effects" tool's icon - provided SVG, filled rather than stroked. */
function EffectsGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="#fff">
      <Path d="M10.6144 17.7956 11.492 15.7854C12.2731 13.9966 13.6789 12.5726 15.4325 11.7942L17.8482 10.7219C18.6162 10.381 18.6162 9.26368 17.8482 8.92277L15.5079 7.88394C13.7092 7.08552 12.2782 5.60881 11.5105 3.75894L10.6215 1.61673C10.2916.821765 9.19319.821767 8.8633 1.61673L7.97427 3.75892C7.20657 5.60881 5.77553 7.08552 3.97685 7.88394L1.63658 8.92277C.868537 9.26368.868536 10.381 1.63658 10.7219L4.0523 11.7942C5.80589 12.5726 7.21171 13.9966 7.99275 15.7854L8.8704 17.7956C9.20776 18.5682 10.277 18.5682 10.6144 17.7956ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899Z" />
    </Svg>
  );
}

/** "Filters" tool's icon - provided SVG, filled rather than stroked. */
function FiltersGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="#fff">
      <Path d="M15.5111 7.30032C15.8957 7.46801 16.2807 7.63473 16.6635 7.80646C16.6346 7.88102 16.604 7.95471 16.5717 8.02749C14.576 8.20785 12.6858 9.24029 11.4704 10.9723C8.95785 10.7079 6.99981 8.58261 6.99981 6C6.99981 3.23858 9.23839 1 11.9998 1C13.4594 1 14.773 1.62543 15.687 2.62292C14.7051 3.05106 14 3.8962 14 4.99997C14 5.9935 14.6012 6.90361 15.5111 7.30032ZM13.1542 17.9462C13.996 16.1276 14.047 13.9741 13.1547 12.0554C14.6399 10.0118 17.4591 9.37883 19.6956 10.6701C22.087 12.0509 22.9064 15.1086 21.5257 17.5C20.145 19.8915 17.087 20.7109 14.6956 19.3302C14.0707 18.9694 13.5532 18.4942 13.1542 17.9462ZM6.27311 10.0269C7.42726 11.6652 9.26672 12.786 11.3746 12.9726C12.4016 15.2807 11.5401 18.0388 9.30357 19.3301C6.91211 20.7108 3.85415 19.8914 2.47344 17.5C1.09273 15.1085 1.91211 12.0505 4.30357 10.6698C4.92851 10.309 5.59897 10.0984 6.27311 10.0269ZM16.8763 5.7134L16.3106 5.46682C15.8965 5.28637 15.8965 4.71357 16.3106 4.53312L16.8763 4.28656C17.8849 3.84706 18.688 3.05545 19.1273 2.06767L19.4652 1.30805C19.6479.897318 20.2456.897318 20.4283 1.30805L20.7472 2.0252C21.1979 3.03838 22.0307 3.84417 23.0736 4.27612L23.67 4.52932C24.096 4.70578 24.096 5.29417 23.67 5.47063L23.0736 5.72382C22.0307 6.15577 21.1979 6.96158 20.7472 7.9748L20.4283 8.69188C20.2456 9.10271 19.6479 9.10271 19.4652 8.69188L19.1273 7.93228C18.688 6.94451 17.8849 6.15288 16.8763 5.7134Z" />
    </Svg>
  );
}

/** "Music" tool's icon - provided SVG, replacing the top-bar sound pill's
 *  glyph now that this rail item is the way in instead. */
function MusicToolGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="#fff">
      <Path d="M18.7134 8.12811L18.4668 8.69379C18.2864 9.10792 17.7136 9.10792 17.5331 8.69379L17.2866 8.12811C16.8471 7.11947 16.0555 6.31641 15.0677 5.87708L14.308 5.53922C13.8973 5.35653 13.8973 4.75881 14.308 4.57612L15.0252 4.25714C16.0384 3.80651 16.8442 2.97373 17.2761 1.93083L17.5293 1.31953C17.7058.893489 18.2942.893489 18.4706 1.31953L18.7238 1.93083C19.1558 2.97373 19.9616 3.80651 20.9748 4.25714L21.6919 4.57612C22.1027 4.75881 22.1027 5.35653 21.6919 5.53922L20.9323 5.87708C19.9445 6.31641 19.1529 7.11947 18.7134 8.12811ZM7 3H12V6H9V17C9 19.2091 7.20914 21 5 21C2.79086 21 1 19.2091 1 17C1 14.7909 2.79086 13 5 13C5.72857 13 6.41165 13.1948 7 13.5351V3ZM18 13.5351V11H20V17C20 19.2091 18.2091 21 16 21C13.7909 21 12 19.2091 12 17C12 14.7909 13.7909 13 16 13C16.7286 13 17.4117 13.1948 18 13.5351Z" />
    </Svg>
  );
}

/** "Publish Story" button's icon - provided SVG, sits to the left of the
 *  label. */
function PublishIconGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#fff">
      <Path d="M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM14 9V15H10V9H5L12 2L19 9H14Z" />
    </Svg>
  );
}

function NextArrowGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h13M13 6l6 6-6 6" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BackGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M14 6l-6 6 6 6" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrashGlyph({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.2 6.5l.9 12.1a1.6 1.6 0 0 0 1.6 1.5h6.6a1.6 1.6 0 0 0 1.6-1.5l.9-12.1M10 10.5v6M14 10.5v6"
        stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function NoteGlyph({ color = "#fff", size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V6l11-2v12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={6.5} cy={18} r={2.5} stroke={color} strokeWidth={2} />
      <Circle cx={17.5} cy={16} r={2.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/* ── Editor ──────────────────────────────────────────────────────────────── */

interface StoryEditorProps {
  media: { uri: string; isVideo: boolean };
  overlays: StoryOverlay[];
  onOverlaysChange: (next: StoryOverlay[]) => void;
  track: MusicTrack | null;
  onTrackChange: (t: MusicTrack | null) => void;
  onBack: () => void;
  onNext: () => void;
  /** Told about the tools that have no layer type to be saved as. */
  onUnbuilt: (what: string) => void;
  /** Publishes immediately with whatever's on the canvas now (the same real
   *  post() the Share phase's own Post button calls, just reachable a step
   *  earlier) - Next still leads to that fuller Share phase unchanged. */
  onPublish: () => void;
  /** True while onPublish's request is in flight - disables the button and
   *  swaps its label for a spinner, same as the Share phase's own Post
   *  button already does. */
  publishing: boolean;
}

export function StoryEditor({
  media,
  overlays,
  onOverlaysChange,
  track,
  onTrackChange,
  onBack,
  onNext,
  onUnbuilt,
  onPublish,
  publishing,
}: StoryEditorProps) {
  const insets = useSafeAreaInsets();
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [textOpen, setTextOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  /* Exactly one object is selected at a time. Null means the canvas itself has
     focus, and the delete control is not on screen at all. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The dragged object is currently over the bin - drives its highlight. */
  const [overDelete, setOverDelete] = useState(false);
  /** Pinch-zoom/pan on the photo itself (image stories only - see the canvas
   *  below). Centred, at its natural cover-fit scale, until the user touches
   *  it; zIndex 0 keeps it under every text/emoji overlay regardless of when
   *  those were added. */
  const [mediaTransform, setMediaTransform] = useState<LayerTransform>({
    x: 50, y: 50, scale: 1, rotation: 0, zIndex: 0,
  });
  /** Drives the centre guide line(s) - see the render below. */
  const [mediaAligned, setMediaAligned] = useState({ x: false, y: false });

  /* Muted and looping: this is a canvas to lay text on, not a playback surface. */
  const player = useVideoPlayer(media.isVideo ? media.uri : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const onCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  }, []);

  /* Written once, when the fingers come off - see TransformableLayer on why a
     live gesture never reaches React state. */
  const commitOverlay = useCallback(
    (id: string, t: LayerTransform) =>
      onOverlaysChange(overlays.map((o) => (o.id === id ? { ...o, ...t } : o))),
    [overlays, onOverlaysChange],
  );

  const removeOverlay = useCallback(
    (id: string) => {
      onOverlaysChange(overlays.filter((o) => o.id !== id));
      /* Nothing is selected once the selection is gone, or the delete control
         would linger pointing at an object that no longer exists. */
      setSelectedId((cur) => (cur === id ? null : cur));
      setOverDelete(false);
    },
    [overlays, onOverlaysChange],
  );

  /** Newest object on top. Never renumbered, so layering survives editing. */
  const nextZ = useCallback(
    () => overlays.reduce((hi, o) => Math.max(hi, o.zIndex), 0) + 1,
    [overlays],
  );

  const addText = useCallback(() => {
    const text = draft.trim();
    setTextOpen(false);
    setDraft("");
    if (!text) return;
    const id = `t${Date.now()}`;
    onOverlaysChange([
      ...overlays,
      { id, kind: "text", text, color, x: 50, y: 45, scale: 1, rotation: 0, zIndex: nextZ() },
    ]);
    // Selected on arrival: it is the thing the user is thinking about, and the
    // bounding box is what tells them it can now be moved and resized.
    setSelectedId(id);
  }, [draft, color, overlays, onOverlaysChange, nextZ]);

  const addEmoji = useCallback(
    (emoji: string) => {
      setEmojiOpen(false);
      const id = `e${Date.now()}`;
      onOverlaysChange([
        ...overlays,
        { id, kind: "emoji", text: emoji, color: "#FFFFFF", x: 50, y: 60, scale: 1, rotation: 0, zIndex: nextZ() },
      ]);
      setSelectedId(id);
    },
    [overlays, onOverlaysChange, nextZ],
  );

  /* Real list, and only while the sheet is up - the editor should not spend a
     request on music the user never opened. */
  const trending = useQuery({
    queryKey: ["music-trending"],
    queryFn: () => musicApi.trending(),
    enabled: musicOpen,
    staleTime: 5 * 60_000,
  });

  /* "Sticker" is this rail's label for the real emoji-overlay tool - not a
     separate, still-unbuilt sticker system. Teezer doesn't have a distinct
     sticker asset set, and emoji already are the sticker-like thing this app
     can actually place and persist, so the working tool takes the slot
     rather than sitting beside a second, fake one. Effects/Filters are
     honest stubs, same onUnbuilt() convention as everywhere else in this
     rail. Music opens the same real music picker the old top-bar pill did -
     moved here, not duplicated, now that the pill itself is gone. */
  const TOOLS = [
    { key: "text", label: "Text", icon: <AaGlyph />, act: () => setTextOpen(true) },
    { key: "sticker", label: "Stickers", icon: <EmojiToolGlyph />, act: () => setEmojiOpen(true) },
    { key: "effects", label: "Effects", icon: <EffectsGlyph />, act: () => onUnbuilt("Effects") },
    { key: "filters", label: "Filters", icon: <FiltersGlyph />, act: () => onUnbuilt("Filters") },
    { key: "music", label: "Music", icon: <MusicToolGlyph />, act: () => setMusicOpen(true) },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {media.isVideo ? (
          /* Same pinch-to-zoom/pan engine the photo case already uses below -
             previously video was excluded from this ("out of scope for this
             pass" per the prior version of this comment), so a reposted
             video Story had no way to reposition/zoom it at all. `framed`/
             `onSelect`/`snapToCenter`/`doubleTapZoom` all mean exactly what
             they do for the photo case; only the child is a VideoView
             instead of an Image. */
          <TransformableLayer
            transform={mediaTransform}
            canvas={canvas}
            framed={false}
            selected={false}
            onSelect={() => setSelectedId(null)}
            onCommit={setMediaTransform}
            snapToCenter
            onCenterAlign={setMediaAligned}
            doubleTapZoom
            accessibilityLabel="Video - pinch to zoom, drag to reposition, or double-tap and hold then drag up/down to zoom with one finger"
          >
            <VideoView
              player={player}
              style={{ width: canvas.w, height: canvas.h }}
              contentFit="cover"
              nativeControls={false}
            />
          </TransformableLayer>
        ) : (
          /* The photo itself is pinch-to-zoom/pan, on the same engine every
             text/emoji overlay already uses - `framed={false}` skips their
             padded/dashed-on-select frame, which would look wrong around a
             full-bleed background. `onSelect` here IS the tap-to-deselect
             behaviour a plain Pressable used to provide (removed - it would
             have sat on top of this layer and eaten every touch before the
             gesture responder below ever saw one); touching the photo drops
             whatever overlay was selected, exactly as tapping bare canvas
             always has. */
          <TransformableLayer
            transform={mediaTransform}
            canvas={canvas}
            framed={false}
            selected={false}
            onSelect={() => setSelectedId(null)}
            onCommit={setMediaTransform}
            snapToCenter
            onCenterAlign={setMediaAligned}
            doubleTapZoom
            accessibilityLabel="Photo - pinch to zoom, drag to reposition, or double-tap and hold then drag up/down to zoom with one finger"
          >
            <Image
              source={{ uri: media.uri }}
              style={{ width: canvas.w, height: canvas.h }}
              contentFit="cover"
              transition={120}
            />
          </TransformableLayer>
        )}

        {/* Centre guide - only while the photo is mid-drag and aligned (see
            onCenterAlign above); the haptic tick lives in TransformableLayer
            itself, this just draws the line it's ticking about. pointerEvents
            none so it can never itself catch the touch that's drawing it. */}
        {mediaAligned.x && (
          <View pointerEvents="none" style={[styles.centerGuideV, { left: canvas.w / 2 - 0.5 }]} />
        )}
        {mediaAligned.y && (
          <View pointerEvents="none" style={[styles.centerGuideH, { top: canvas.h / 2 - 0.5 }]} />
        )}

        {/* Sorted by zIndex so the paint order matches the stored layering
            rather than the order things happened to be added in. */}
        {[...overlays]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((o) => (
            <TransformableLayer
              key={o.id}
              transform={{ x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, zIndex: o.zIndex }}
              canvas={canvas}
              selected={selectedId === o.id}
              onSelect={() => setSelectedId(o.id)}
              onCommit={(t) => commitOverlay(o.id, t)}
              /* Only meaningful for the object being dragged; the rest are not
                 moving, so they can never arm the bin. */
              deleteZoneTop={selectedId === o.id && canvas.h ? canvas.h - DELETE_ZONE_H : undefined}
              onOverDeleteChange={setOverDelete}
              onDelete={() => removeOverlay(o.id)}
              /* Frozen while a sheet is up, so a touch meant for the composer
                 cannot drag something on the canvas behind it. */
              disabled={textOpen || emojiOpen || musicOpen}
              accessibilityLabel={`${o.kind === "text" ? "Text" : "Emoji"} layer${
                selectedId === o.id ? ", selected" : ""
              }. Drag to move, pinch to resize and rotate.`}
            >
              {o.kind === "text" ? (
                <Text style={[styles.overlayText, { color: o.color }]}>{o.text}</Text>
              ) : (
                <Text style={styles.overlayEmoji}>{o.text}</Text>
              )}
            </TransformableLayer>
          ))}

        {/* Legibility scrims - the same reason TikTok/Instagram's own editors
            keep one: the top bar and rail sit over a photo that could be any
            brightness, and each button's own translucent background isn't
            enough on a genuinely bright, busy frame. Pure gradients,
            pointerEvents none, so they never compete with a touch meant for
            what's drawn on top of them. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,.55)", "rgba(0,0,0,0)"]}
          style={[styles.topScrim, { height: insets.top + 130 }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,.5)"]}
          style={[styles.bottomScrim, { height: insets.bottom + 110 }]}
        />

        {/* ── Top bar ── just Back now - Music moved into the right rail
            below, so there's no longer a second element to keep centred
            independently of it. */}
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable
            onPress={onBack}
            style={[styles.circleBtn, { top: insets.top + 10 }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackGlyph />
          </Pressable>
        </View>

        {/* ── Right tool rail ── icon + label, no button chip behind either -
            matches the reference layout's rail exactly. Sits a little higher
            than before, per request. */}
        <View style={[styles.rail, { top: insets.top + 66 }]} pointerEvents="box-none">
          {TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={t.act}
              style={styles.railBtn}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              {t.icon}
              <Text style={styles.railLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Delete control ──────────────────────────────────────────────
            On screen only while something is selected, and it is BOTH a drop
            target and a button: dragging an object onto it removes it, and so
            does tapping it. Drag-to-delete alone would leave the action
            unreachable to anyone who cannot make that gesture.

            It only ever removes the SELECTED OVERLAY. The background photo or
            video is not an overlay, is never selectable, and has no path to
            this control at all - swapping the media is the Back button's job. */}
        {selectedId && !textOpen && (
          <View
            style={[styles.deleteZone, { height: DELETE_ZONE_H, paddingBottom: insets.bottom + 14 }]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => removeOverlay(selectedId)}
              style={[styles.deleteBtn, overDelete && styles.deleteBtnArmed]}
              accessibilityRole="button"
              accessibilityLabel="Delete selected layer"
            >
              <TrashGlyph size={overDelete ? 26 : 22} />
            </Pressable>
            <Text style={[styles.deleteHint, overDelete && styles.deleteHintArmed]}>
              {overDelete ? "Release to delete" : "Drag here to delete"}
            </Text>
          </View>
        )}

        {/* Placement hint, only until something is selected - once the bin is up
            it says what to do instead. */}
        {overlays.length > 0 && !selectedId && !textOpen && (
          <Text style={[styles.hint, { bottom: insets.bottom + 22 }]}>
            Tap a layer to select · drag to move · pinch to resize
          </Text>
        )}

        {/* ── Text composer ── */}
        {textOpen && (
          <View style={styles.textSheet}>
            <Pressable style={StyleSheet.absoluteFill} onPress={addText} accessibilityRole="button" accessibilityLabel="Done" />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              placeholder="Type something"
              placeholderTextColor="rgba(255,255,255,.5)"
              style={[styles.textInput, { color }]}
            />
            <View style={[styles.swatches, { bottom: insets.bottom + 26 }]}>
              {TEXT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: color === c }}
                  accessibilityLabel={`Colour ${c}`}
                />
              ))}
            </View>
            <Pressable onPress={addText} style={[styles.doneBtn, { top: insets.top + 10 }]} accessibilityRole="button">
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        )}

      </View>

      {/* ── Bottom bar ── a real, solid-black section BELOW the canvas, not a
          translucent row floating over the photo - the canvas above shrinks
          to fill only the remaining space (flex:1 in a column, this bar's
          own height fixed by its content), so the media itself is measured
          and covers up to this bar's own top edge and no further; nothing
          renders underneath it any more.

          Just the two buttons asked for: Publish Story posts immediately
          with whatever's on the canvas now (same real post() the Share
          phase's own Post button calls); Next leads to that fuller Share
          phase (caption/audience/controls, its own Post button) unchanged. */}
      {!textOpen && (
        <View style={[styles.bottomBlackBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={() => {
              haptics.medium();
              onPublish();
            }}
            disabled={publishing}
            style={[styles.publishBtn, publishing && styles.publishBtnOff]}
            accessibilityRole="button"
            accessibilityLabel="Publish story"
          >
            {publishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <PublishIconGlyph />
                <Text style={styles.publishText}>Publish Story</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={onNext} style={styles.nextBtnBottom} accessibilityRole="button" accessibilityLabel="Next">
            <Text style={styles.nextText}>Next</Text>
            <NextArrowGlyph />
          </Pressable>
        </View>
      )}

      <EmojiPicker open={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={addEmoji} dark closeOnPick />

      <BottomSheet visible={musicOpen} onClose={() => setMusicOpen(false)} height={0.6}>
        <View style={styles.musicHead}>
          <Text style={styles.musicTitle}>Add music</Text>
          {!!track && (
            <Pressable onPress={() => { onTrackChange(null); setMusicOpen(false); }} accessibilityRole="button">
              <Text style={styles.musicClear}>Remove</Text>
            </Pressable>
          )}
        </View>

        {trending.isLoading ? (
          <View style={styles.musicCenter}><ActivityIndicator color="#F42B5B" /></View>
        ) : trending.isError ? (
          <Text style={styles.musicEmpty}>Couldn&apos;t load music. Pull the sheet down and try again.</Text>
        ) : !trending.data?.length ? (
          <Text style={styles.musicEmpty}>No tracks available yet.</Text>
        ) : (
          trending.data.map((t) => {
            const on = track?.id === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => { onTrackChange(t); setMusicOpen(false); }}
                style={styles.trackRow}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                {t.cover_url ? (
                  <Image source={{ uri: t.cover_url }} style={styles.trackArt} contentFit="cover" />
                ) : (
                  <View style={[styles.trackArt, styles.trackArtFallback]}><NoteGlyph color="#8A8592" size={16} /></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.trackTitle, on && styles.trackTitleOn]} numberOfLines={1}>
                    {t.title ?? "Untitled"}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {t.artist_name ?? "Unknown artist"}
                  </Text>
                </View>
                {on && <Text style={styles.trackPicked}>Added</Text>}
              </Pressable>
            );
          })
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A090C" },
  /** The design's storyMediaBg - a flat deep field behind whatever is placed. */
  canvas: { flex: 1, backgroundColor: "#3C5878", overflow: "hidden" },
  centerGuideV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,.75)" },
  centerGuideH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,.75)" },

  topScrim: { position: "absolute", left: 0, right: 0, top: 0 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0 },

  topBar: { position: "absolute", left: 0, right: 0, top: 0 },
  circleBtn: {
    position: "absolute",
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,.32)",
    alignItems: "center",
    justifyContent: "center",
  },

  rail: { position: "absolute", right: 14, gap: 18, alignItems: "center" },
  /** Icon + label, no button chip behind either - matches the reference's
   *  rail exactly, a step past the borderless-circle look from before. */
  railBtn: { alignItems: "center", gap: 4, width: 54 },
  railLabel: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  aaGlyph: { color: "#fff", fontSize: 23, fontWeight: "800", lineHeight: 25 },

  /* ── Bottom row: Publish Story (primary) + Next (secondary) ── */
  /* A real section below the canvas now, not an absolute overlay - see the
     render's own comment on why (media no longer draws underneath it). */
  bottomBlackBar: {
    backgroundColor: "#000",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    // Was 12 - the buttons sat hard against the bar's top edge, with the
    // safe-area bottom padding doing all the breathing room on its own
    // side. Raised so the row reads as centred in the bar rather than
    // pinned to its top.
    paddingTop: 20,
  },
  /* Primary action - solid brand pink, takes the lead width. */
  publishBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: "#F42B5B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  publishBtnOff: { opacity: 0.6 },
  publishText: { fontSize: 14.5, fontWeight: "800", color: "#fff" },
  /* Secondary - deliberately not pink too, so Publish Story reads as the
     one primary action and this as the lighter "more options" path. */
  nextBtnBottom: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nextText: { fontSize: 13.5, fontWeight: "800", color: "#fff" },

  /* Above every layer, so a selected object dragged to the bottom passes UNDER
     the bin rather than covering the thing it is being dropped on. */
  deleteZone: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  deleteBtn: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Armed reads as the brand red and a wider ring - unmistakable at a glance. */
  deleteBtnArmed: {
    backgroundColor: "#F42B5B",
    borderColor: "#fff",
    borderWidth: 2,
    transform: [{ scale: 1.16 }],
  },
  deleteHint: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,.72)" },
  deleteHintArmed: { color: "#fff" },

  overlayText: {
    maxWidth: 260,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 34,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  overlayEmoji: { fontSize: 44, lineHeight: 52 },

  hint: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,.72)",
  },

  textSheet: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "center" },
  textInput: {
    paddingHorizontal: 30,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    maxHeight: 220,
  },
  doneBtn: { position: "absolute", right: 16, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  swatches: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 10 },
  swatch: { width: 26, height: 26, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,.5)" },
  swatchOn: { borderColor: "#fff", transform: [{ scale: 1.18 }] },

  musicHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  musicTitle: { fontSize: 17, fontWeight: "800", color: "#121014" },
  musicClear: { fontSize: 13, fontWeight: "700", color: "#F42B5B" },
  musicCenter: { paddingVertical: 40, alignItems: "center" },
  musicEmpty: { paddingHorizontal: 18, paddingVertical: 28, fontSize: 13, color: "#8A8592", textAlign: "center" },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9 },
  trackArt: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#F1EFF3" },
  trackArtFallback: { alignItems: "center", justifyContent: "center" },
  trackTitle: { fontSize: 14, fontWeight: "700", color: "#121014" },
  trackTitleOn: { color: "#F42B5B" },
  trackArtist: { marginTop: 2, fontSize: 12, color: "#8A8592" },
  trackPicked: { fontSize: 12, fontWeight: "800", color: "#F42B5B" },
});
