import { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { ChevronRight, Link2 } from "lucide-react-native";
import { ds } from "@/theme/design";
import { usePostViewer } from "@/store/post-viewer.store";
import type { Video } from "@/types";

/**
 * Universal content-attached link/product bar - shown above the creator's
 * username/location wherever a `Video` is rendered (Feed, the shared single-
 * reel viewer, and everywhere that reaches it). Driven ENTIRELY by the
 * content's own persisted data (`video.featured_products` /
 * `video.link_url` - see VideoResource::featured_products/link_url on the
 * server) - never guessed, never a second source of truth. Renders nothing
 * when the post has neither, so no space/border/background is reserved.
 *
 * Both fields can be set on the same post (the Studio "Add link" popup
 * doesn't clear one when the other is picked), so rather than an arbitrary
 * priority between them, the external link is appended as one more slide
 * after the product slides - one compact swipeable strip, never two
 * stacked blocks.
 */

// Build marker - logs once per bundle load so it's possible to tell from
// Metro's output whether a device is actually running current code.
console.log("[TEEZER_BUILD] product-bar v5 (pinned height + in-card pagination)");

const COVER = 34;
const GAP = 9;
const CARD_W = 232;
const CARD_GAP = 8;
/**
 * The bar's height is PINNED, not derived from its content. Left to size
 * itself, the row was rendering far taller than cover+padding accounts for
 * (a horizontal ScrollView's cross-axis stretch will happily inflate its
 * children when nothing bounds it), which is what kept the box looking
 * oversized no matter how much padding came off. Fixed height + centered
 * content means product count, image load state and text length can never
 * change it.
 */
const BAR_H = 48;
/** Card height when the pagination strip is overlaid inside it - the extra
 *  is that strip's own room, so the indicator lives INSIDE the one box
 *  instead of adding a second row underneath. */
const BAR_H_PAGED = 60;

type ProductSlide = { type: "product"; id: number; name: string; price: number; currency: string; image_url: string | null };
type LinkSlide = { type: "link"; url: string };
type Slide = ProductSlide | LinkSlide;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fmtPrice(currency: string, price: number): string {
  return `${currency} ${price.toLocaleString(undefined, { minimumFractionDigits: price % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function ContentLinkBar({ video }: { video: Video }) {
  const navigation = useNavigation<any>();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const slides = useMemo<Slide[]>(() => {
    const products: ProductSlide[] = (video.featured_products ?? []).map((p) => ({
      type: "product",
      id: p.id,
      name: p.name,
      price: p.price,
      currency: p.currency,
      image_url: p.image_url,
    }));
    const linkSlide: LinkSlide[] = video.link_url ? [{ type: "link", url: video.link_url }] : [];
    return [...products, ...linkSlide];
  }, [video.featured_products, video.link_url]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
    setActiveIndex((prev) => {
      const next = Math.max(0, Math.min(slides.length - 1, idx));
      return next === prev ? prev : next;
    });
  }, [slides.length]);

  if (slides.length === 0) return null;

  // PostViewerLayer (the single-reel viewer opened from Profile/Search/
  // notifications/deep links) paints as an absolute overlay ABOVE the whole
  // navigator - see its own doc comment. Navigating from a FeedVideoItem
  // rendered inside it pushes ProductDetail onto the stack UNDERNEATH that
  // overlay, invisible until the viewer is dismissed - the tap looked like
  // it did nothing, and the product page only appeared after backing out.
  // Same fix openCreator/openProfileLayer already use for this exact
  // reason: hide the overlay first (a no-op when not inside it, e.g. the
  // main Feed) so the navigation is visible immediately either way.
  const openProduct = (id: number) => {
    if (usePostViewer.getState().mounted) usePostViewer.getState().hide();
    navigation.navigate("ProductDetail", { productId: id });
  };
  const openLink = (url: string) => { Linking.openURL(url).catch(() => {}); };

  const renderSlide = (slide: Slide, i: number) => (
    <Pressable
      key={slide.type === "product" ? `p${slide.id}` : `l${i}`}
      onPress={() => (slide.type === "product" ? openProduct(slide.id) : openLink(slide.url))}
      // Always a real, explicit width - not just single-slide's old
      // maxWidth-only sizing. A row container with no defined width, only
      // a cap, leaves its flex:1 text child (`txt` below) with no real
      // space to resolve against - Yoga's shrink-to-fit measurement and a
      // flex:1 grow request inside it are circular, and the practical
      // result was the name/price text collapsing to nothing while the
      // fixed-size cover image (unaffected by any of this) still rendered
      // fine - exactly "the product shows but the title/price don't."
      style={[
        styles.card,
        {
          width: CARD_W,
          marginRight: slides.length > 1 && i < slides.length - 1 ? CARD_GAP : 0,
          // Taller only when the pagination strip has to live inside it.
          ...(slides.length > 1 ? { height: BAR_H_PAGED, paddingBottom: 12 } : null),
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={slide.type === "product" ? slide.name : `Visit ${hostnameOf(slide.url)}`}
    >
      <View style={styles.cover}>
        {slide.type === "product" && slide.image_url ? (
          <Image source={{ uri: slide.image_url }} style={styles.coverImg} contentFit="cover" />
        ) : slide.type === "link" ? (
          <Link2 size={16} color={ds.onDark} strokeWidth={2} />
        ) : null}
      </View>
      <View style={styles.txt}>
        {slide.type === "product" ? (
          <>
            <Text style={styles.title} numberOfLines={1}>{slide.name}</Text>
            <Text style={styles.price} numberOfLines={1}>{fmtPrice(slide.currency, slide.price)}</Text>
          </>
        ) : (
          <Text style={styles.title} numberOfLines={1}>{hostnameOf(slide.url)}</Text>
        )}
      </View>
      <ChevronRight size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
    </Pressable>
  );

  if (slides.length === 1) {
    return <View style={styles.wrap}>{renderSlide(slides[0], 0)}</View>;
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        // Explicit viewport width = exactly one card. Without this, the
        // scroll view's own outer frame has nothing bounding it to "one
        // slide wide" and only relies on the parent's sizing - a real
        // single-slot carousel needs its own viewport pinned to one
        // card's width, with the rest of the track clipped, not just
        // "probably narrow enough" from surrounding layout.
        style={{ width: CARD_W, height: BAR_H_PAGED }}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        // snapToOffsets, not snapToInterval: only the gaps BETWEEN cards
        // exist (the last card has no trailing margin), so a fixed interval
        // drifts progressively out of alignment across slides. Explicit
        // offsets land every card flush against the viewport's edge.
        snapToOffsets={slides.map((_, i) => i * (CARD_W + CARD_GAP))}
        snapToAlignment="start"
        disableIntervalMomentum
        // Track the index continuously while the finger is down, not only
        // once momentum settles - the dots then follow the swipe instead of
        // catching up after it.
        scrollEventThrottle={16}
        onScroll={onScrollEnd}
        onMomentumScrollEnd={onScrollEnd}
        // alignItems center, not the default stretch - otherwise the cards
        // are told to fill the viewport's cross axis rather than keep their
        // own pinned height.
        contentContainerStyle={{ paddingRight: 4, alignItems: "center" }}
      >
        {slides.map(renderSlide)}
      </ScrollView>
      {/* Pagination overlays the card's own bottom-left corner rather than
          sitting in a row beneath it. Absolutely positioned on purpose: it
          adds ZERO height to the bar, so a post with products takes exactly
          as much vertical space as the card itself and the caption/handle/
          sound rows below keep their original positions. */}
      <View style={styles.dots} pointerEvents="none">
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotOn]} />
        ))}
        <Text style={styles.count}>{activeIndex + 1} of {slides.length} products</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", maxWidth: "100%", marginBottom: 3 },
  card: {
    flexDirection: "row", alignItems: "center", gap: GAP,
    height: BAR_H,
    borderRadius: 7, paddingVertical: 0, paddingRight: 11, paddingLeft: 7,
    backgroundColor: "rgba(10,9,12,0.42)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  cover: {
    width: COVER, height: COVER, borderRadius: 5, flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  coverImg: { width: "100%", height: "100%" },
  txt: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 12, fontWeight: "700", color: ds.onDark },
  price: { fontSize: 11, fontWeight: "800", color: "#FF8AA6" },
  // Overlaid inside the card's bottom-left corner - see its own comment.
  dots: {
    position: "absolute", left: 9, bottom: 4,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.4)" },
  dotOn: { width: 14, backgroundColor: "#fff" },
  count: { fontSize: 10.5, fontWeight: "600", color: "rgba(255,255,255,0.6)" },
});
