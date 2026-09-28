import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import type { FilterDef } from "@/features/editor/types";
import { FILTER_CATEGORY_COLOR } from "./filterSwatchColors";

/**
 * The camera's filter carousel - one fixed active/selection slot at the
 * start of a horizontally-clipped viewport, with the filter thumbnails
 * dragging past underneath it. The capture button sits outside this
 * component entirely (a sibling in PostCameraScreen/StoryLiveCameraScreen's
 * layout) and never moves; this only ever transforms its own content.
 *
 * Physics: a PanGestureHandler drives one Animated.Value (raw scroll offset,
 * native-driven). A slow drag follows the finger 1:1 and live-previews
 * whichever filter is nearest the active slot as it crosses; a fast flick
 * projects the release velocity forward before picking the nearest index, so
 * a hard swipe can clear several filters, same as the design asks for. Both
 * paths converge on the same snap: animate to that index's exact slot, then
 * report it as the new activeKey.
 *
 * activeKey is owned by the caller (PostCameraScreen/StoryLiveCameraScreen's
 * own activeFilterKey state) - the single source of truth also driving the
 * shutter's tint and the edit-phase preview's shader. This component only ever
 * *reports* a change via onChange; it does not keep its own notion of "the"
 * active filter, so there is nothing here that can drift out of sync with
 * the rest of the screen.
 */

const ITEM_W = 54;
const ITEM_GAP = 14;
const STEP = ITEM_W + ITEM_GAP;
/** Multiplies release velocity (px/s) into an offset (px) added before
 *  picking the nearest index - the same "fast swipe moves several, slow
 *  drag moves one" feel as a native ScrollView's own deceleration, tuned by
 *  eye rather than copied from a physics constant. */
const FLING_PROJECTION = 0.22;

interface FilterCarouselProps {
  items: FilterDef[];
  activeKey: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** The viewport's fixed width - matches the shutter row's reserved slot. */
  viewportWidth: number;
  style?: StyleProp<ViewStyle>;
}

export function FilterCarousel({ items, activeKey, onChange, disabled, viewportWidth, style }: FilterCarouselProps) {
  const maxOffset = Math.max(0, (items.length - 1) * STEP);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Mirrors of the latest prop/gesture values the PanGestureHandler
  // callbacks close over - same pattern useSwipeTabs.ts uses, so a callback
  // created on an early render never reads a stale items/activeKey.
  const itemsRef = useRef(items);
  const onChangeRef = useRef(onChange);
  const baseOffsetRef = useRef(0);
  const liveIndexRef = useRef(Math.max(0, items.findIndex((f) => f.key === activeKey)));
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const indexOf = useCallback((key: string) => {
    const i = itemsRef.current.findIndex((f) => f.key === key);
    return i < 0 ? 0 : i;
  }, []);

  const settleTo = useCallback(
    (index: number, report: boolean) => {
      const clamped = Math.max(0, Math.min(itemsRef.current.length - 1, index));
      liveIndexRef.current = clamped;
      baseOffsetRef.current = clamped * STEP;
      Animated.spring(scrollX, {
        toValue: clamped * STEP,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      }).start();
      if (report) onChangeRef.current(itemsRef.current[clamped].key);
    },
    [scrollX],
  );

  // If activeKey changes from outside a drag/tap (e.g. a caller resets it),
  // stay in sync rather than silently drifting.
  useEffect(() => {
    const idx = indexOf(activeKey);
    if (idx !== liveIndexRef.current) settleTo(idx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const raw = baseOffsetRef.current - e.nativeEvent.translationX;
      const clamped = Math.max(0, Math.min(maxOffset, raw));
      scrollX.setValue(clamped);

      // Live-select whichever filter is nearest the active slot as it
      // crosses - rounding to the nearest step is itself the dead-zone (a
      // filter only takes over once the drag has passed the halfway point
      // to it, so small jitters near a boundary don't flicker the preview).
      const idx = Math.max(0, Math.min(itemsRef.current.length - 1, Math.round(clamped / STEP)));
      if (idx !== liveIndexRef.current) {
        liveIndexRef.current = idx;
        onChangeRef.current(itemsRef.current[idx].key);
      }
    },
    [scrollX, maxOffset],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = e.nativeEvent;
      if (state === State.BEGAN) {
        // Stops any in-flight settle spring (grabbing the carousel again
        // before it finished snapping from the last release) and reads
        // back wherever it actually was at that moment - via the
        // documented stopAnimation callback, not the still-in-flight
        // target settleTo() already wrote to baseOffsetRef.
        scrollX.stopAnimation((value) => { baseOffsetRef.current = value; });
        return;
      }
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const current = baseOffsetRef.current - translationX;
        const projected = current - velocityX * FLING_PROJECTION;
        const target = Math.round(Math.max(0, Math.min(maxOffset, projected)) / STEP);
        settleTo(target, true);
      }
    },
    [scrollX, maxOffset, settleTo],
  );

  const onTapItem = useCallback(
    (key: string) => {
      settleTo(indexOf(key), true);
    },
    [indexOf, settleTo],
  );

  const translateX = useMemo(() => Animated.multiply(scrollX, -1), [scrollX]);

  return (
    <View style={[styles.viewport, { width: viewportWidth }, style]} pointerEvents={disabled ? "none" : "auto"}>
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-6, 6]}
        failOffsetY={[-12, 12]}
        enabled={!disabled}
      >
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
          {items.map((item) => (
            <FilterThumb key={item.key} item={item} active={item.key === activeKey} onPress={onTapItem} />
          ))}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const FilterThumb = memo(function FilterThumb({
  item,
  active,
  onPress,
}: {
  item: FilterDef;
  active: boolean;
  onPress: (key: string) => void;
}) {
  const scale = useRef(new Animated.Value(active ? 1.12 : 1)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: active ? 1.12 : 1, useNativeDriver: true, speed: 24, bounciness: 5 }).start();
  }, [active, scale]);

  const handlePress = useCallback(() => onPress(item.key), [onPress, item.key]);

  return (
    <Pressable onPress={handlePress} style={styles.item} accessibilityRole="button" accessibilityLabel={item.name}>
      <Animated.View
        style={[
          styles.thumb,
          { backgroundColor: FILTER_CATEGORY_COLOR[item.category] ?? "#8A8592" },
          active && styles.thumbActive,
          { transform: [{ scale }] },
        ]}
      />
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {item.name}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  viewport: { overflow: "hidden" },
  track: { flexDirection: "row", alignItems: "center", gap: ITEM_GAP, paddingLeft: 4, paddingRight: 8 },
  item: { width: ITEM_W, alignItems: "center", gap: 4 },
  thumb: {
    width: ITEM_W, height: ITEM_W, borderRadius: 999,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
  },
  thumbActive: { borderColor: "#fff", borderWidth: 3 },
  label: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  labelActive: { color: "#fff", fontWeight: "800" },
});
