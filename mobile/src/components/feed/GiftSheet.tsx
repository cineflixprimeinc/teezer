import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Dimensions, Easing, FlatList, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { BottomSheet } from "@/components/BottomSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { giftApi, Gift } from "@/api/gift.api";
import { apiErrorMessage } from "@/api/client";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { AnimatedGift } from "@/components/AnimatedGift";
import { CoinPlansPanel } from "@/components/CoinPlansPanel";

/** Emoji fallback for the retired 5-gift catalog, which had no icon_url. */
const GIFT_EMOJI: Record<string, string> = {
  Rose: "🌹", Heart: "❤️", Crown: "👑", Rocket: "🚀", Universe: "🌌",
};
const emojiFor = (name: string) => GIFT_EMOJI[name] ?? "🎁";

const WEB_ORIGIN = "https://teezer.live";

/**
 * gifts.icon_url is stored site-relative ("/gifts/001-heart-ribbon.svg") so it stays
 * domain-agnostic for the web app. RN can't resolve that - it needs an absolute URL.
 */
const iconUrlFor = (icon: string) => (icon.startsWith("/") ? `${WEB_ORIGIN}${icon}` : icon);

// Fixed-width gift cells: 4 columns that always fit the sheet's inner width with
// even gaps. (flex:1 cells stretched the lonely last item to full width and could
// overlap when combined with columnWrapperStyle gap.)
const GIFT_COLS = 4;
const GIFT_CELL_W =
  (Dimensions.get("window").width - spacing.lg * 2 - spacing.sm * (GIFT_COLS - 1)) / GIFT_COLS;

/**
 * One gift card. Animates in (scale + fade, lightly staggered) the first time it
 * mounts - i.e. as it scrolls into view via the FlatList - then stays static so
 * scrolling holds 60fps. Animated WebP/APNG/GIF gift icons render natively through
 * expo-image; the emoji is the never-blank fallback when icon_url is null.
 */
function GiftCell({ gift, index, sending, onPress }: {
  gift: Gift; index: number; sending: number | null; onPress: () => void;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 300,
      delay: Math.min(index, 7) * 35,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true, // hardware-accelerated transform/opacity
    }).start();
  }, [a, index]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Animated.View style={[styles.cellWrap, { opacity: a, transform: [{ scale }] }]}>
      <Pressable style={styles.cell} onPress={onPress} disabled={sending != null}>
        {gift.icon_url ? (
          // Same motion the web plays: RN rasterises SVGs, so the CSS keyframes baked into
          // the file never run - AnimatedGift replays them natively, per gift.
          <AnimatedGift uri={iconUrlFor(gift.icon_url)} slug={gift.slug} size={44} delay={(index % 4) * 140} />
        ) : (
          <Text style={styles.emoji}>{emojiFor(gift.name)}</Text>
        )}
        <Text style={styles.name} numberOfLines={1}>{gift.name}</Text>
        <View style={styles.priceRow}>
          {sending === gift.id ? <ActivityIndicator size="small" color={colors.brand} /> : (
            <>
              <Text style={styles.coinSm}>🪙</Text>
              <Text style={styles.price}>{gift.coin_value.toLocaleString()}</Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function GiftSheet({ visible, receiver, commentId, videoId, onClose }: {
  visible: boolean;
  receiver?: { id: number; username?: string | null } | null;
  commentId?: number;
  videoId?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const authUser = useAuthStore((s) => s.user);

  /*
   * The SENDER also has to be enrolled - this used to be checked only for
   * the person receiving the gift (comments/LIVE call giftApi.eligible on
   * the CREATOR before ever rendering this sheet), leaving anyone who could
   * open it at all free to send regardless of their own status. This is a
   * display gate, same caveat as every other eligible() call: send() below
   * still gets rejected server-side (SENDER_NOT_GIFT_ELIGIBLE) if this ever
   * disagrees with the live answer.
   */
  const myEligibleQ = useQuery({
    queryKey: ["gifts-eligible", authUser?.id],
    queryFn: () => giftApi.eligible(authUser!.id),
    enabled: visible && !!authUser?.id,
  });
  const notEnrolled = !!authUser?.id && myEligibleQ.data === false;
  /* "coins" swaps the sheet's BODY for the coin picker. It must not be a second
     <Modal>: only one modal can be presented at a time, so a sibling sheet
     opened from inside this one silently never appears - which is why "Get
     coins" used to do nothing. CoinPlansPanel is a plain View, so it composes.
     Buying runs through the store's own billing (Apple 3.1.1 / Play policy). */
  const [mode, setMode] = useState<"gifts" | "coins">("gifts");
  const [sending, setSending] = useState<number | null>(null);
  /* Survives a failed attempt so a retry reuses it - see send(). A ref, not
     state, because changing it must not re-render the sheet mid-send. */
  const giftKeyRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const gifts = useQuery({ queryKey: ["gifts"], queryFn: giftApi.gifts, enabled: visible });
  const wallet = useQuery({ queryKey: ["coin-wallet"], queryFn: giftApi.wallet, enabled: visible });

  const balance = wallet.data?.coin_balance ?? 0;

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200); }

  /** Coins may have been bought while the picker was up, so re-read the balance
   *  rather than trusting the one we rendered with. */
  function backToGifts() {
    setMode("gifts");
    qc.invalidateQueries({ queryKey: ["coin-wallet"] });
  }

  /** Reset to the gift grid whenever the sheet is dismissed, so reopening it
   *  doesn't land the user back on the coin picker. */
  useEffect(() => {
    if (!visible) setMode("gifts");
  }, [visible]);

  const coins = mode === "coins";

  function send(g: Gift) {
    if (!receiver?.id) return;
    requireAuth(async () => {
      setSending(g.id);
      /* One key per send attempt, held until the attempt resolves one way or
         the other. A retry after a timeout reuses it and the server refuses to
         charge twice; tapping a gift again afterwards is a NEW send and gets a
         new key, because sending the same gift twice is legitimate. */
      const key = giftKeyRef.current
        ??= `gf-${Date.now()}-${g.id}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await giftApi.send(receiver.id, g.id, { commentId, videoId, idempotencyKey: key });
        giftKeyRef.current = null;
        qc.invalidateQueries({ queryKey: ["coin-wallet"] });
        // A gift on a post leaves a comment, so the thread underneath this
        // sheet is now out of date - and so is the count on the feed's rail.
        if (videoId) {
          qc.invalidateQueries({ queryKey: ["comments", videoId] });
          qc.invalidateQueries({ queryKey: ["video", videoId] });
        }
        showToast(`${emojiFor(g.name)} ${g.name} sent${receiver.username ? ` to @${receiver.username}` : ""}!`);
        setTimeout(onClose, 700);
      } catch (e: any) {
        const status = e?.response?.status;
        /* A 4xx is a decision - the server looked and refused, so nothing was
           charged and the next attempt is genuinely new. A timeout or a 5xx
           leaves it unknown from here, so the key is HELD and a retry can be
           deduplicated rather than charged again. */
        if (typeof status === "number" && status >= 400 && status < 500) {
          giftKeyRef.current = null;
        }
        if (e?.response?.data?.code === "INSUFFICIENT_COINS") {
          // Straight into the real purchase flow, rather than a dead end.
          setMode("coins");
          showToast("Not enough coins - top up to send this gift.");
        } else if (e?.response?.data?.code === "DUPLICATE_GIFT") {
          // The retry landed on a send that had already gone through.
          showToast(`${emojiFor(g.name)} ${g.name} was already sent.`);
          setTimeout(onClose, 700);
        } else if (e?.response?.data?.code === "GIFT_UNAVAILABLE") {
          /* Retired in the admin while this sheet was open. The catalog we
             rendered from is the stale part, so refetch it - the gift drops out
             of the grid instead of sitting there failing on every tap. */
          qc.invalidateQueries({ queryKey: ["gifts"] });
          showToast(`${g.name} is no longer available.`);
        } else if (e?.response?.data?.code === "SENDER_NOT_GIFT_ELIGIBLE") {
          // Shouldn't normally reach here - the sheet gates on this below -
          // but status can change (suspension) between opening the sheet and
          // tapping a gift. Refetch so the enrollment prompt takes over.
          qc.invalidateQueries({ queryKey: ["gifts-eligible", authUser?.id] });
          showToast("Join the Gifts & Coins Program to send and receive Gifts.");
        } else if (e?.response?.data?.code === "RECEIVER_NOT_GIFT_ELIGIBLE") {
          showToast("Gift receiving is unavailable until this user joins the Gifts & Coins Program.");
        } else {
          showToast(apiErrorMessage(e, "Couldn't send the gift."));
        }
      } finally {
        setSending(null);
      }
    });
  }

  return (
    // Grids scroll internally → drag-to-dismiss lives on the grabber/header.
    <BottomSheet
      visible={visible}
      onClose={onClose}
      // The pack list needs the taller sheet the old build gave it.
      height={coins ? 0.86 : 0.78}
      scrollable={false}
      dragArea="header"
      header={
        coins ? undefined : (
          <View style={styles.header}>
            <Text style={styles.title}>Send a gift</Text>
            <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
          </View>
        )
      }
    >
      {coins ? (
        /* Its own header carries the title and the way back, so the sheet drops
           its own. Buying happens right here - the user never leaves the
           comments they were reading. */
        <CoinPlansPanel onClose={backToGifts} />
      ) : (
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {notEnrolled ? (
            <View style={styles.enrollWrap}>
              <Text style={styles.enrollEmoji}>🎁</Text>
              <Text style={styles.enrollTitle}>Join Gifts &amp; Coins</Text>
              <Text style={styles.enrollBody}>
                Complete the program requirements to send and receive Gifts and Coins across Teezer.
              </Text>
              <Pressable
                style={styles.enrollBtn}
                onPress={() => { onClose(); navigation.navigate("GiftsIntro"); }}
              >
                <Text style={styles.enrollBtnText}>Get Started</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Coin balance bar */}
              <View style={styles.balanceBar}>
                <View style={styles.balanceLeft}>
                  <Text style={styles.coinIcon}>🪙</Text>
                  <Text style={styles.balanceText}>{balance.toLocaleString()} Teezer Coins</Text>
                </View>
                <Pressable style={styles.topUpBtn} onPress={() => setMode("coins")}>
                  <Text style={styles.topUpText}>Get coins</Text>
                </Pressable>
              </View>

              {gifts.isLoading || myEligibleQ.isLoading ? (
                <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
              ) : (
                <FlatList
                  data={gifts.data ?? []}
                  keyExtractor={(g) => String(g.id)}
                  numColumns={GIFT_COLS}
                  columnWrapperStyle={{ gap: spacing.sm, justifyContent: "flex-start" }}
                  contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}
                  renderItem={({ item, index }) => (
                    <GiftCell gift={item} index={index} sending={sending} onPress={() => send(item)} />
                  )}
                  initialNumToRender={8}
                  windowSize={5}
                  removeClippedSubviews
                  ListEmptyComponent={<Text style={styles.empty}>No gifts available.</Text>}
                />
              )}
            </>
          )}

          {toast && <View style={styles.toast} pointerEvents="none"><Text style={styles.toastText}>{toast}</Text></View>}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  enrollWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, gap: spacing.sm },
  enrollEmoji: { fontSize: 40, marginBottom: spacing.xs },
  enrollTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  enrollBody: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  enrollBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  enrollBtnText: { color: colors.white, fontWeight: font.weightBold, fontSize: font.md },

  balanceBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  balanceLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  coinIcon: { fontSize: 18 },
  balanceText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  topUpBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  topUpText: { color: colors.white, fontWeight: font.weightBold, fontSize: font.sm },

  // Wrapper carries the grid width so the animated card can scale without nudging
  // its neighbours; the card itself fills it.
  cellWrap: { width: GIFT_CELL_W },
  cell: {
    width: "100%", paddingVertical: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    alignItems: "center", gap: 4,
    // soft shadow
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  emoji: { fontSize: 30 },
  giftImg: { width: 34, height: 34 },
  name: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.text },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 16 },
  coinSm: { fontSize: 11 },
  price: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: spacing.xl, width: "100%" },

  catRow: { gap: spacing.sm, paddingBottom: spacing.md },
  catChip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  catChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  catChipText: { fontSize: font.sm, color: colors.text, fontWeight: font.weightMedium },
  catChipTextOn: { color: colors.white, fontWeight: font.weightBold },

  pkg: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", gap: 2 },
  badge: { position: "absolute", top: 6, right: 6, backgroundColor: colors.brandTint, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 9, color: colors.brand, fontWeight: font.weightBold },
  pkgName: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  pkgCoins: { fontSize: font.xs, color: colors.brand, fontWeight: font.weightBold },
  pkgPrice: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginTop: 2 },
  pkgRate: { fontSize: 9.5, color: colors.textFaint, marginTop: 1 },
  note: { fontSize: font.xs, color: colors.textMuted, textAlign: "center", paddingTop: spacing.sm },

  toast: { position: "absolute", bottom: 40, alignSelf: "center", backgroundColor: "rgba(20,20,20,0.94)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, maxWidth: "86%" },
  toastText: { color: "#fff", fontSize: font.sm, fontWeight: font.weightMedium, textAlign: "center" },
});
