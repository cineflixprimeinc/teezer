import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Share,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import { inboxApi, type ShareSuggestion } from "@/api/inbox.api";
import { videoApi } from "@/api/video.api";
import { profileApi } from "@/api/profile.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { useSheetDrag } from "./useSheetDrag";
import type { Video } from "@/types";

/**
 * Share sheet - laid out to the share modal the user supplied: a titled header
 * over a preview of the reel being shared, a search, then Suggested / Share to /
 * More options as labelled sections.
 *
 * Sending is still select-then-Send. A tap only ticks; nothing leaves the
 * device until Send is pressed, so unpicking never needs an un-send.
 *
 * Rows with no route behind them yet (Your story, Save video, Use sound, Add to
 * playlist) are drawn because the menu was asked for, but they SAY they are not
 * ready rather than failing silently. Wire each one here as its endpoint lands.
 */

/** Where a shared reel points. `reelsoo.com` is already claimed as a deep-link
 *  prefix in RootNavigator, so this opens the app when the recipient has it. */
const shareUrl = (id: number) => `https://teezer.live/video/${id}`;
const embedCode = (id: number) =>
  `<iframe src="https://teezer.live/embed/${id}" width="360" height="640" frameborder="0" allowfullscreen></iframe>`;

const shareMessage = (v: Video) => {
  const who = v.user?.username ? `@${v.user.username}` : "Teezer";
  return `${who} on Teezer\n${shareUrl(v.id)}`;
};

/* ── Glyphs ─────────────────────────────────────────────────────────────── */

function Glyph({ d, size = 22, stroke, width = 1.9 }: { d: string[]; size?: number; stroke: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d.map((p, i) => (
        <Path key={i} d={p} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

function SearchGlyph({ size = 17, stroke = ds.textMuted }: { size?: number; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={stroke} strokeWidth={2} />
      <Path d="M15.6 15.6L21 21" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CloseGlyph({ size = 18, stroke = ds.text }: { size?: number; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={stroke} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}

function TickGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5l5 5L20 6.5" stroke={ds.onDark} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function WhatsAppGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.1c-.24.68-1.2 1.26-1.96 1.42-.52.11-1.2.2-3.5-.75-2.94-1.22-4.83-4.2-4.98-4.4-.14-.2-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.83 2.01.9 2.16.07.14.12.31.02.51-.1.2-.15.32-.29.5-.14.17-.3.39-.43.52-.14.14-.29.3-.13.58.17.29.75 1.23 1.6 1.99 1.1.98 2.03 1.28 2.32 1.43.29.14.46.12.63-.07.17-.2.72-.85.92-1.14.19-.29.39-.24.65-.14.27.09 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.7-.17 1.37Z"
      />
    </Svg>
  );
}

function InstagramGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={2.6} y={2.6} width={18.8} height={18.8} rx={5.4} stroke="#E1306C" strokeWidth={2} />
      <Circle cx={12} cy={12} r={4.4} stroke="#E1306C" strokeWidth={2} />
      <Circle cx={17.4} cy={6.6} r={1.25} fill="#E1306C" />
    </Svg>
  );
}

function MessengerGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#0084FF"
        d="M12 2C6.24 2 2 6.22 2 11.78c0 2.9 1.19 5.42 3.13 7.17.16.15.26.35.27.57l.05 1.77c.02.57.6.94 1.12.71l1.97-.87c.17-.07.36-.09.53-.04 1.06.29 2.2.45 3.38.45 5.76 0 10-4.22 10-9.78S17.76 2 12 2Zm5.6 7.53-2.85 4.53c-.45.72-1.42.9-2.1.38l-2.27-1.7a.6.6 0 0 0-.72 0l-3.06 2.33c-.41.31-.94-.18-.67-.61l2.86-4.53c.45-.72 1.42-.9 2.1-.39l2.27 1.71a.6.6 0 0 0 .72 0l3.06-2.32c.41-.31.95.18.67.6Z"
      />
    </Svg>
  );
}

function FacebookGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#1877F2"
        d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z"
      />
    </Svg>
  );
}

function TelegramGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#229ED9"
        d="M21.5 4.3 2.9 11.5c-.9.35-.9 1.6.02 1.9l4.6 1.44 1.77 5.4c.25.75 1.2.94 1.72.36l2.5-2.77 4.6 3.4c.68.5 1.65.13 1.83-.7l3.06-14.4c.2-.9-.7-1.66-1.5-1.35ZM8.9 14.1l9.1-5.6c.2-.13.4.14.24.3l-7.2 6.7c-.2.18-.32.43-.36.7l-.25 1.9-1.53-4Z"
      />
    </Svg>
  );
}

function XGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#0F1419"
        d="M17.9 3h3.1l-6.77 7.74L22.2 21h-6.2l-4.86-6.36L5.58 21H2.47l7.24-8.28L2.1 3h6.36l4.4 5.82L17.9 3Zm-1.09 16.13h1.72L7.28 4.78H5.44l11.37 14.35Z"
      />
    </Svg>
  );
}

function SnapchatGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#0F1419"
        d="M12 2.2c2.7 0 4.62 2.1 4.62 4.9 0 .68-.05 1.4-.1 1.98.2.1.5.16.8.16.5 0 .95-.2 1.2-.2.4 0 .8.28.8.68 0 .78-1.66.86-1.66 1.6 0 .96 2.16 2.7 3.66 3.03.3.07.48.28.48.56 0 .78-2.02 1.2-2.44 1.32-.16.3-.16 1.06-.62 1.06-.5 0-1.02-.2-1.86-.2-1.32 0-1.78 1.1-3.68 1.1h-.4c-1.9 0-2.36-1.1-3.68-1.1-.84 0-1.36.2-1.86.2-.46 0-.46-.76-.62-1.06C6.22 16.1 4.2 15.68 4.2 14.9c0-.28.18-.5.48-.56 1.5-.34 3.66-2.07 3.66-3.03 0-.74-1.66-.82-1.66-1.6 0-.4.4-.68.8-.68.25 0 .7.2 1.2.2.3 0 .6-.06.8-.16-.05-.58-.1-1.3-.1-1.98 0-2.83 1.9-4.9 4.62-4.9Z"
      />
    </Svg>
  );
}

function RedditGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        fill="#FF4500"
        d="M22 12.1c0-1.2-1-2.2-2.2-2.2-.6 0-1.1.23-1.5.6-1.45-.98-3.4-1.6-5.55-1.68l1.1-3.5 3 .7a1.7 1.7 0 1 0 .2-1.15l-3.5-.82a.6.6 0 0 0-.7.4l-1.3 4.36c-2.2.06-4.2.68-5.7 1.69a2.18 2.18 0 0 0-1.5-.6A2.2 2.2 0 0 0 2 12.1c0 .84.47 1.56 1.15 1.93a4 4 0 0 0-.05.6c0 3.16 3.98 5.72 8.9 5.72s8.9-2.56 8.9-5.72c0-.2-.02-.4-.05-.6.68-.37 1.15-1.1 1.15-1.93ZM7.6 13.6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm8.1 4.06c-.98.98-2.86 1.06-3.7 1.06s-2.72-.08-3.7-1.06a.4.4 0 0 1 .57-.57c.62.62 1.95.84 3.13.84s2.5-.22 3.13-.84a.4.4 0 0 1 .57.57Zm-.2-2.56a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
    </Svg>
  );
}

/**
 * The Reelsoo R, drawn rather than bitmapped.
 *
 * `src/assets/logo-mark.png` is the brand mark but it is colour-type 2 - RGB
 * with NO alpha channel - so it always paints its own square background and can
 * never sit transparently on the tile's pastel well. Vector is the only way to
 * get the R alone, and it stays crisp at any size. Swap this path if the mark
 * is ever exported with transparency.
 */
function ReelsooGlyph() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.4 20.2V4.6c0-.5.4-.9.9-.9h5.4c2.9 0 4.9 1.8 4.9 4.5 0 2-1.1 3.5-2.9 4.2l3.1 5.9c.3.6-.1 1.3-.8 1.3h-2a.9.9 0 0 1-.8-.5l-2.7-5.3h-1.5v4.9c0 .5-.4.9-.9.9H8.3a.9.9 0 0 1-.9-.9Z"
        fill={ds.accent}
      />
      <Path d="M10.9 6.9v3.4h2.4c1.2 0 2-.7 2-1.7s-.8-1.7-2-1.7Z" fill={ds.surface} />
    </Svg>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

type ShareSheetProps = {
  video: Video | null;
  open: boolean;
  onClose: () => void;
};

export function ShareSheet({ video, open, onClose }: ShareSheetProps) {
  const { height } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);

  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [qrOpen, setQrOpen] = useState(false);

  const restHeight = Math.min(640, height * 0.82);
  /** The sheet is maxHeight-bounded, so its real height is whatever the content
   *  comes to. Measuring it keeps the dismiss threshold proportional to what is
   *  actually on screen - against restHeight, a short sheet needed an
   *  unreasonably long drag before it would let go. */
  const [sheetH, setSheetH] = useState(restHeight);
  const drag = useSheetDrag({ sheetHeight: sheetH, onDismiss: onClose });

  /** The vertical scroller. The pan handler has to run ALONGSIDE it, or the
   *  scroller swallows every downward drag and only the header strip can
   *  dismiss the sheet - which is exactly how this behaved before. */
  const scrollRef = useRef<React.ComponentRef<typeof GHScrollView>>(null);

  useEffect(() => {
    if (open) {
      drag.open();
      setPicked({});
      setSent({});
      setSending(false);
      setCopied(null);
      setNotice(null);
      setQuery("");
      setQrOpen(false);
    }
  }, [open, video?.id]);

  const friends = useQuery({
    queryKey: ["share-suggestions"],
    queryFn: () => inboxApi.shareSuggestions(30),
    enabled: open && !!me,
    staleTime: 60_000,
  });

  const countShare = useCallback(() => {
    if (video) videoApi.share(video.id).catch(() => {});
  }, [video]);

  /**
   * Same fix as CommentsSheet's gateGuest: this sheet is its own native
   * `<Modal>`, and so is the "log in or sign up" popup (AuthGateModal, via
   * BottomSheet). Opening that popup while this sheet's Modal stayed
   * visible={open} underneath it stacks two native Modals - which froze
   * the screen (no taps, no scroll) in CommentsSheet, and this sheet had
   * the identical risk with no guard against it at all. Closes this sheet
   * for real first, then waits for its own close animation to actually
   * finish (RN's `Modal` plays its exit transition asynchronously) before
   * presenting the popup - same 220ms handoff CommentsSheet/openProfile use.
   */
  const gateGuest = useCallback(
    (pending: () => void) => {
      onClose();
      setTimeout(() => useAuthGate.getState().open(pending), 220);
    },
    [onClose],
  );

  const togglePick = useCallback((f: ShareSuggestion) => {
    setPicked((p) => {
      const next = { ...p };
      if (next[f.id]) delete next[f.id];
      else next[f.id] = true;
      return next;
    });
  }, []);

  const pickedIds = useMemo(() => Object.keys(picked).map(Number), [picked]);

  /** allSettled, not all: one blocked recipient must not drop the others. */
  const sendToPicked = useCallback(async () => {
    if (!video || pickedIds.length === 0 || sending) return;
    if (!useAuthStore.getState().user) {
      gateGuest(() => void sendToPicked());
      return;
    }
    setSending(true);
    const payload = {
      id: video.id,
      caption: video.caption,
      thumbnail_url: video.thumbnail_url,
      duration: video.duration,
    };
    const results = await Promise.allSettled(pickedIds.map((id) => inboxApi.shareVideo(id, payload)));
    const ok: number[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(pickedIds[i]);
    });
    setSent((p) => {
      const next = { ...p };
      ok.forEach((id) => (next[id] = true));
      return next;
    });
    setPicked((p) => {
      const next = { ...p };
      ok.forEach((id) => delete next[id]);
      return next;
    });
    setSending(false);
    if (ok.length) countShare();
    const failed = pickedIds.length - ok.length;
    setNotice(
      failed === 0
        ? `Sent to ${ok.length} ${ok.length === 1 ? "person" : "people"}.`
        : `Sent to ${ok.length}. ${failed} couldn't receive it - they may not accept messages from you.`,
    );
  }, [video, pickedIds, sending, countShare, gateGuest]);

  const osShare = useCallback(async () => {
    if (!video) return;
    try {
      const res = await Share.share({ message: shareMessage(video) });
      if (res.action === Share.sharedAction) countShare();
    } catch {
      /* cancelled */
    }
  }, [video, countShare]);

  /** `canOpenURL` needs every scheme whitelisted in Info.plist on iOS, which
   *  Expo Go cannot carry, so attempt the open and fall back on failure. */
  const openApp = useCallback(
    async (url: string) => {
      if (!video) return;
      try {
        await Linking.openURL(url);
        countShare();
      } catch {
        void osShare();
      }
    },
    [video, countShare, osShare],
  );

  const soon = useCallback((what: string) => setNotice(`${what} isn't available yet.`), []);

  const list = useMemo(() => {
    const all = friends.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => f.username?.toLowerCase().includes(q) || (f.name ?? "").toLowerCase().includes(q));
  }, [friends.data, query]);

  /** Coloured row, per the reference. */
  const shareTo = useMemo(
    () =>
      video
        ? [
            {
              key: "copy",
              label: copied === "link" ? "Copied" : "Copy link",
              bg: "#E4ECFD",
              node: <Glyph d={["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"]} stroke="#2E6BE6" />,
              act: async () => {
                await Clipboard.setStringAsync(shareUrl(video.id));
                setCopied("link");
                countShare();
              },
            },
            {
              key: "story",
              label: "Your story",
              bg: "#FCE4EE",
              node: <Glyph d={["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 8v8", "M8 12h8"]} stroke="#E1306C" />,
              act: () => soon("Sharing to your story"),
            },
            {
              key: "reelsoo",
              label: "Teezer",
              bg: "#FDE3EA",
              node: <ReelsooGlyph />,
              // The in-app route is the picker above, so point at it rather
              // than opening a second way to do the same thing.
              act: () => setNotice("Pick someone above to send this inside Teezer."),
            },
            {
              key: "whatsapp",
              label: "WhatsApp",
              bg: "#DFF6E6",
              node: <WhatsAppGlyph />,
              act: () => openApp(`whatsapp://send?text=${encodeURIComponent(shareMessage(video))}`),
            },
            {
              key: "instagram",
              label: "Instagram",
              bg: "#FCE3F0",
              node: <InstagramGlyph />,
              // Instagram has no link-share intent; the OS sheet still lists it.
              act: osShare,
            },
            {
              key: "messenger",
              label: "Messenger",
              bg: "#E4E7FE",
              node: <MessengerGlyph />,
              act: () => openApp(`fb-messenger://share?link=${encodeURIComponent(shareUrl(video.id))}`),
            },
            {
              key: "facebook",
              label: "Facebook",
              bg: "#E1EBFB",
              node: <FacebookGlyph />,
              // The app scheme refuses arbitrary payloads; the web sharer works.
              act: () => openApp(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(video.id))}`),
            },
            {
              key: "telegram",
              label: "Telegram",
              bg: "#DCEEF9",
              node: <TelegramGlyph />,
              act: () => openApp(`tg://msg?text=${encodeURIComponent(shareMessage(video))}`),
            },
            {
              key: "x",
              label: "X",
              bg: "#E6E7E9",
              node: <XGlyph />,
              act: () => openApp(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage(video))}`),
            },
            {
              key: "snapchat",
              label: "Snapchat",
              bg: "#FFFBCC",
              node: <SnapchatGlyph />,
              // Snapchat only takes links through Creative Kit, a native module.
              act: osShare,
            },
            {
              key: "reddit",
              label: "Reddit",
              bg: "#FFE3D6",
              node: <RedditGlyph />,
              act: () => openApp(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl(video.id))}`),
            },
            {
              key: "sms",
              label: "Messages",
              bg: "#DEF6E1",
              node: <Glyph d={["M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.7-.8L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"]} stroke="#25A244" />,
              act: () => openApp(`sms:?body=${encodeURIComponent(shareMessage(video))}`),
            },
            {
              key: "email",
              label: "Email",
              bg: "#F0E6FB",
              node: <Glyph d={["M3 5.5h18v13H3z", "m3 6.5 9 6.5 9-6.5"]} stroke="#7B4BC8" />,
              act: () =>
                openApp(
                  `mailto:?subject=${encodeURIComponent("A reel on Teezer")}&body=${encodeURIComponent(shareMessage(video))}`,
                ),
            },
            {
              key: "more",
              label: "More",
              bg: "#EDEAF2",
              node: <Glyph d={["M21 3 3 10.5l7 2.5 2.5 7L21 3Z", "M10 13 21 3"]} stroke={ds.slate} />,
              act: osShare,
            },
          ]
        : [],
    [video, copied, countShare, openApp, osShare, soon],
  );

  /** Neutral row, per the reference. */
  const more = useMemo(
    () =>
      video
        ? [
            {
              key: "save",
              label: "Save video",
              d: ["M12 3v12", "m7 11 5 5 5-5", "M4 20h16"],
              act: () => soon("Saving to your device"),
            },
            {
              key: "sound",
              label: "Use sound",
              d: ["M9 18V6l11-2v12", "M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M17 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
              act: () => soon("Using this sound"),
            },
            {
              key: "playlist",
              label: "Add to playlist",
              d: ["M3 6h12", "M3 12h12", "M3 18h8", "M18 10v10", "M14 15h8"],
              act: () => soon("Playlists"),
            },
            {
              key: "qr",
              label: qrOpen ? "Hide QR" : "Share as QR",
              d: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h3v3h-3z", "M18 18h3v3h-3z"],
              act: () => setQrOpen((v) => !v),
            },
            {
              key: "embed",
              label: copied === "embed" ? "Copied" : "Copy embed",
              d: ["m8 8-5 4 5 4", "m16 8 5 4-5 4", "m13.5 5-3 14"],
              act: async () => {
                await Clipboard.setStringAsync(embedCode(video.id));
                setCopied("embed");
              },
            },
            {
              key: "why",
              label: "Why this post",
              d: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 11v5", "M12 8h.01"],
              // No endpoint returns a per-post explanation, so this states the
              // rule the feed actually follows rather than inventing a reason
              // for this particular reel.
              act: () =>
                setNotice(
                  "Reels are picked from creators you follow, what you watch to the end, and what people near you are watching.",
                ),
            },
            {
              key: "interested",
              label: "Not interested",
              d: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m4.9 4.9 14.2 14.2"],
              act: () => {
                // Same rule as Block below: this signal is stored per
                // account. Had no check at all - a guest's tap 401'd
                // silently while still claiming "You'll see fewer...".
                if (!useAuthStore.getState().user) {
                  gateGuest(() => {});
                  return;
                }
                videoApi.notInterested(video.id).catch(() => {});
                setNotice("You'll see fewer reels like this.");
              },
            },
            {
              key: "hide",
              label: "Hide creator",
              d: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M22 11h-6"],
              act: () => {
                if (!useAuthStore.getState().user) {
                  gateGuest(() => {});
                  return;
                }
                videoApi.dontRecommendCreator(video.id).catch(() => {});
                setNotice("You'll see fewer reels from this creator.");
              },
            },
            {
              key: "report",
              label: "Report",
              d: ["M4 21V4h9l.6 2H20v9h-7l-.6-2H4"],
              act: () => {
                // A report needs a reporter. Had no check at all - a
                // guest's tap 401'd silently while still saying "Thanks".
                if (!useAuthStore.getState().user) {
                  gateGuest(() => {});
                  return;
                }
                // "other", not "inappropriate": the backend validates reason
                // against in:spam,nudity,hate,misinformation,violence,copyright,
                // harassment,other, so the old value 422'd on every report while
                // this still said "thanks" - nothing was ever recorded. The
                // long-press playback sheet asks for a specific reason; this is
                // the one-tap version, so it files the unspecified one.
                videoApi.report(video.id, "other").catch(() => {});
                setNotice("Thanks - our team will take a look.");
              },
            },
            {
              key: "block",
              label: "Block user",
              danger: true,
              d: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m5.6 5.6 12.8 12.8"],
              act: () => {
                const handle = video.user?.username;
                if (!handle) return;
                if (!useAuthStore.getState().user) {
                  gateGuest(() => {});
                  return;
                }
                profileApi
                  .block(handle)
                  .then(() => setNotice(`@${handle} is blocked. They can't see your reels or message you.`))
                  .catch(() => setNotice("Couldn't block that account - try again."));
              },
            },
          ]
        : [],
    [video, copied, qrOpen, soon, gateGuest],
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root} accessibilityViewIsModal accessibilityRole="none">
          {/* Transparent, matching CommentsSheet: a Modal cannot fade a scrim
              independently of the sheet, so a filled one slides up as a black
              panel instead of fading in place. */}
          <Animated.View style={[styles.scrim, { opacity: drag.scrimOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close share sheet" />
          </Animated.View>

          {/* Lifts the sheet clear of the keyboard, so the people you are
              searching for are not sitting behind it. Same behaviour split as
              CommentsSheet: iOS needs padding, Android's adjustResize already
              shrinks the window. */}
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <PanGestureHandler
            onGestureEvent={drag.onGestureEvent}
            onHandlerStateChange={drag.onHandlerStateChange}
            activeOffsetY={[-14, 14]}
            failOffsetX={[-28, 28]}
            // Both this and the scroller see the gesture; useSheetDrag decides
            // which one acts, from the scroller's own offset.
            simultaneousHandlers={scrollRef}
          >
            <Animated.View
              style={[styles.sheet, { maxHeight: restHeight, transform: [{ translateY: drag.translateY }] }]}
              onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
              onTouchStart={() => Keyboard.dismiss()}
            >
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
              </View>

              {/* ── Header ───────────────────────────────────────────────── */}
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={styles.title}>Send to</Text>
                  <Text style={styles.subtitle}>Choose who to send this to</Text>
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={styles.closeBtn}
                >
                  <CloseGlyph />
                </Pressable>
              </View>

              <GHScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                // Feeds the hook the offset it uses to decide whether a
                // downward drag belongs to this list or to the sheet.
                onScroll={(e) => drag.onListScroll(e.nativeEvent.contentOffset.y)}
              >
                {/* ── Search ─────────────────────────────────────────────── */}
                <View style={styles.searchWrap} onTouchStart={(e) => e.stopPropagation()}>
                  <View style={styles.searchField}>
                    <SearchGlyph />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search friends, groups or handle"
                      placeholderTextColor={ds.textMuted}
                      style={styles.searchInput}
                      returnKeyType="search"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {query.length > 0 && (
                      <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                        <CloseGlyph size={15} stroke={ds.textMuted} />
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* ── Suggested ──────────────────────────────────────────── */}
                <Text style={styles.section}>Suggested</Text>
                {friends.isLoading ? (
                  <View style={styles.friendsLoading}>
                    <ActivityIndicator color={ds.accent} />
                  </View>
                ) : list.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.friends}
                    keyboardShouldPersistTaps="handled"
                  >
                    {list.map((f) => {
                      const isPicked = !!picked[f.id];
                      const isSent = !!sent[f.id];
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => togglePick(f)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isPicked }}
                          accessibilityLabel={`${isPicked ? "Deselect" : "Select"} ${f.username}`}
                          style={styles.friend}
                        >
                          <View style={styles.friendAvatarWrap}>
                            {f.avatar ? (
                              <Image source={{ uri: f.avatar }} style={styles.friendAvatar} contentFit="cover" transition={120} />
                            ) : (
                              <View style={[styles.friendAvatar, styles.friendAvatarFallback]}>
                                <Text style={styles.friendLetter}>{(f.username ?? "?").charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                            {(isPicked || isSent) && (
                              <View style={[styles.friendSent, isPicked && !isSent && styles.friendPicked]}>
                                <TickGlyph />
                              </View>
                            )}
                          </View>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {isSent ? "Sent" : f.username}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.empty}>
                    {me ? "Follow people to send reels straight to them." : "Log in to send this to a friend."}
                  </Text>
                )}

                {pickedIds.length > 0 && (
                  <View style={styles.sendWrap}>
                    <Pressable
                      onPress={() => void sendToPicked()}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={`Send to ${pickedIds.length}`}
                      style={[styles.sendBtn, sending && styles.sendBtnBusy]}
                    >
                      {sending ? (
                        <ActivityIndicator color={ds.onDark} size="small" />
                      ) : (
                        <Text style={styles.sendBtnText}>
                          Send{pickedIds.length > 1 ? ` to ${pickedIds.length}` : ""}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* ── Share to ───────────────────────────────────────────── */}
                <Text style={styles.section}>Share to</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tiles}
                  keyboardShouldPersistTaps="handled"
                >
                  {shareTo.map((a) => (
                    <Pressable key={a.key} onPress={a.act} accessibilityRole="button" style={styles.tile}>
                      <View style={[styles.tileIcon, { backgroundColor: a.bg }]}>{a.node}</View>
                      <Text style={styles.tileLabel} numberOfLines={2}>
                        {a.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* ── More options ───────────────────────────────────────── */}
                <Text style={styles.section}>More options</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tiles}
                  keyboardShouldPersistTaps="handled"
                >
                  {more.map((a) => (
                    <Pressable key={a.key} onPress={a.act} accessibilityRole="button" style={styles.tile}>
                      <View style={[styles.tileIcon, styles.tileIconPlain, a.danger && styles.tileIconDanger]}>
                        <Glyph d={a.d} stroke={a.danger ? "#D93B3B" : ds.text} width={1.8} />
                      </View>
                      <Text style={[styles.tileLabel, a.danger && styles.tileLabelDanger]} numberOfLines={2}>
                        {a.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {qrOpen && !!video && (
                  <View style={styles.qrWrap}>
                    <View style={styles.qr}>
                      <QRCode value={shareUrl(video.id)} size={148} backgroundColor="#FFFFFF" color={ds.text} />
                    </View>
                    <Text style={styles.qrHint}>Point a camera at this to open the reel.</Text>
                  </View>
                )}

                {!!notice && <Text style={styles.notice}>{notice}</Text>}
              </GHScrollView>
            </Animated.View>
          </PanGestureHandler>
          </KeyboardAvoidingView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },

  sheet: {
    backgroundColor: ds.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 26,
  },
  grabberWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 38, height: 4, borderRadius: 999, backgroundColor: ds.lineStrong },

  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: ds.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: ds.textMuted },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: ds.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: { paddingHorizontal: 16, paddingTop: 4 },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ds.surfaceSunken,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, minWidth: 0, padding: 0, fontSize: font.sm, color: ds.text },

  section: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, fontSize: 13, fontWeight: font.weightBold, color: ds.text },

  friendsLoading: { paddingVertical: 18, alignItems: "center" },
  empty: { paddingHorizontal: 16, paddingBottom: 4, fontSize: 12.5, color: ds.textMuted },
  friends: { gap: 16, paddingHorizontal: 16, paddingBottom: 4 },
  friend: { width: 62, alignItems: "center", gap: 7 },
  friendAvatarWrap: { width: 56, height: 56 },
  friendAvatar: { width: 56, height: 56, borderRadius: 999 },
  friendAvatarFallback: { backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center" },
  friendLetter: { fontSize: 20, fontWeight: font.weightHeavy, color: ds.textMuted },
  friendSent: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    backgroundColor: "rgba(244,43,91,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  friendPicked: { backgroundColor: "rgba(244,43,91,0.55)" },
  friendName: { fontSize: 11, color: ds.textDim, textAlign: "center", maxWidth: 62 },

  sendWrap: { paddingHorizontal: 16, paddingTop: 14 },
  sendBtn: { height: 44, borderRadius: 999, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  sendBtnBusy: { opacity: 0.7 },
  sendBtnText: { color: ds.onDark, fontSize: font.md, fontWeight: font.weightBold },

  tiles: { gap: 16, paddingHorizontal: 16, paddingBottom: 4 },
  tile: { width: 62, alignItems: "center", gap: 7 },
  tileIcon: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tileIconPlain: { backgroundColor: ds.surfaceSunken },
  tileIconDanger: { backgroundColor: "#FCE7E7" },
  tileLabel: { fontSize: 10.5, color: ds.textDim, textAlign: "center", lineHeight: 13 },
  tileLabelDanger: { color: "#D93B3B" },

  qrWrap: { alignItems: "center", paddingTop: 18, gap: 8 },
  qr: { padding: 12, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: ds.line },
  qrHint: { fontSize: 11.5, color: ds.textMuted },

  notice: { paddingHorizontal: 16, paddingTop: 16, fontSize: 12, color: ds.textDim, lineHeight: 17 },
});
