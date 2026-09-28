import { ComponentType, ReactNode, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/constants/colors";

const SCREEN_H = Dimensions.get("window").height;

/** Drag distance (fraction of sheet height) OR fling velocity that dismisses. */
const DISMISS_RATIO = 0.24;
const DISMISS_VELOCITY = 900;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fires after the exit animation completes - navigate/alert here, never in onClose. */
  onClosed?: () => void;
  /**
   * Sheet height: a fraction of the screen (e.g. 0.62), or "auto" to size to
   * content (capped at maxHeightRatio). Defaults to "auto".
   */
  height?: number | "auto";
  /** Max height cap as a screen fraction (default 0.85). */
  maxHeightRatio?: number;
  /** Wrap children in the sheet's managed ScrollView (default true). Set false
      when the content brings its own list (FlatList) or is a short static menu. */
  scrollable?: boolean;
  /** Where swipe-down-to-dismiss is recognised. "sheet" (default) needs the
      managed ScrollView for coordination; use "header" when the content owns
      its scrolling (drag the grabber/header to dismiss). */
  dragArea?: "sheet" | "header";
  /** Lift the sheet above the keyboard (sheets containing text inputs). */
  keyboardAvoid?: boolean;
  /** Fixed header row rendered above the scrolling content (title, back, ✕…). */
  header?: ReactNode;
  /**
   * Live swipe-to-dismiss feedback, for coupling something outside the sheet to
   * the drag (the feed's mini-player follows this so the video tracks the sheet
   * 1:1 as it is pulled down). `fraction` is drag distance ÷ sheet height: 0 at
   * rest, growing toward 1 as the sheet is dragged off-screen.
   */
  onDrag?: (fraction: number) => void;
  /** Drag ended: dismissed=true crossed the threshold (sheet is closing),
   *  false sprang back to open. Pair with onDrag to settle the coupled view. */
  onDragRelease?: (dismissed: boolean) => void;
  children: ReactNode;
}

/**
 * The app-wide bottom sheet. Every popup/sheet/picker should use this shell so
 * behaviour stays consistent (settings sheets, pickers, confirmations).
 *
 *  - NO dark backdrop - the screen behind stays fully visible; a transparent
 *    touch layer still dismisses on outside tap. Depth comes from the sheet's
 *    own soft shadow + hairline top border instead of dimming.
 *  - Springs up from the bottom (native driver, 60fps); slides back down on
 *    close. Swipe-down follows the finger 1:1 and dismisses past 24% height or
 *    a 900px/s fling, else springs back.
 *  - "auto" height sizes to content; fixed ratios never expand to fullscreen.
 *    Only the content scrolls; its position survives while open.
 */
export function BottomSheet({
  visible, onClose, onClosed, height = "auto", maxHeightRatio = 0.85,
  scrollable = true, dragArea = "sheet", keyboardAvoid = false, header,
  onDrag, onDragRelease, children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  // Held in refs so the pan gesture (memoised on [onClose] only - see
  // sheetHRef below) always calls the latest callback without being
  // rebuilt on every parent render.
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const onDragReleaseRef = useRef(onDragRelease);
  onDragReleaseRef.current = onDragRelease;
  const fixedH = typeof height === "number" ? Math.round(SCREEN_H * height) : null;
  const [measuredH, setMeasuredH] = useState(fixedH ?? 360);
  const sheetH = fixedH ?? measuredH;
  // The gesture below reads this via a ref, not the `sheetH` closure - see
  // the comment on `pan`'s useMemo for why: a sheet whose content changes
  // height while open (a multi-stage popup, a list that grows on "load
  // more"/search) must never rebuild the Pan gesture object on every one of
  // those content changes. Rebuilding mid-touch is what crashed the app
  // (confirmed: the "Add link" popup, whose stages differ wildly in height,
  // crashed on nearly every interaction - same root cause already diagnosed
  // once for the Studio Content date-filter calendar, fixed there only
  // locally by pinning that one caller's content height constant; this is
  // the general fix in the shared component itself).
  const sheetHRef = useRef(sheetH);
  sheetHRef.current = sheetH;

  const [render, setRender] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;   // 0 closed → 1 open
  const dragY = useRef(new Animated.Value(0)).current;  // finger displacement while dragging
  const dragYRef = useRef(0);
  const baselineRef = useRef<number | null>(null);
  const scrollOffsetRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setRender(true);
      dragY.setValue(0);
      dragYRef.current = 0;
      Animated.spring(anim, {
        toValue: 1, stiffness: 320, damping: 32, mass: 0.8,
        useNativeDriver: true,
      }).start();
    } else if (render) {
      Animated.timing(anim, {
        toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }).start(() => {
        dragY.setValue(0);
        dragYRef.current = 0;
        setRender(false);
        onClosed?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(() =>
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
      // Vertical intent only; runs alongside the inner scroll (which owns
      // upward movement - we only take over when the list is already at top).
      .activeOffsetY([-10, 10])
      .failOffsetX([-16, 16])
      // RNGH accepts native-component refs at runtime; its typings only admit
      // gesture refs, hence the cast (see RNGH cross-component interaction docs).
      .simultaneousWithExternalGesture(scrollRef as unknown as RefObject<ComponentType<object> | undefined>)
      .onUpdate((e) => {
        if (scrollOffsetRef.current <= 0) {
          if (baselineRef.current == null) baselineRef.current = e.translationY - dragYRef.current;
          const dy = Math.max(0, e.translationY - baselineRef.current);
          dragYRef.current = dy;
          dragY.setValue(dy);
          // Report the drag so a coupled view (the feed mini-player) can track it.
          const h = sheetHRef.current;
          onDragRef.current?.(h > 0 ? dy / h : 0);
        } else if (dragYRef.current > 0) {
          // Content started scrolling - hand the gesture back to the list.
          baselineRef.current = null;
          dragYRef.current = 0;
          dragY.setValue(0);
          onDragRef.current?.(0);
        }
      })
      .onEnd((e) => {
        const shouldDismiss =
          dragYRef.current > sheetHRef.current * DISMISS_RATIO ||
          (e.velocityY > DISMISS_VELOCITY && dragYRef.current > 16);
        baselineRef.current = null;
        if (shouldDismiss) {
          onDragReleaseRef.current?.(true); // let the coupled view finish to fullscreen
          onClose(); // parent flips `visible` → exit animation runs from here
        } else if (dragYRef.current > 0) {
          dragYRef.current = 0;
          onDragReleaseRef.current?.(false); // coupled view springs back to docked
          Animated.spring(dragY, {
            toValue: 0, velocity: e.velocityY, stiffness: 420, damping: 34, mass: 0.7,
            useNativeDriver: true,
          }).start();
        }
      })
      .onFinalize(() => { baselineRef.current = null; }),
  // Deliberately NOT depending on `sheetH` - see sheetHRef's comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [onClose]);

  if (!render) return null;

  const translateY = Animated.add(
    anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }),
    dragY,
  );

  // The grabber gets a padded zone around it, not just the 4px bar: with
  // dragArea="header" this strip is the entire drag target, and a 4px-tall
  // target is effectively impossible to grab by hand.
  const grabberAndHeader = (
    <>
      <View style={styles.grabZone}>
        <View style={styles.grabber} />
      </View>
      {header}
    </>
  );

  const body = scrollable ? (
    <ScrollView
      ref={scrollRef}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  const sheet = dragArea === "sheet" ? (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.sheet,
          fixedH ? { height: fixedH } : { maxHeight: Math.round(SCREEN_H * maxHeightRatio) },
          { transform: [{ translateY }] },
        ]}
        onLayout={fixedH ? undefined : (e) => setMeasuredH(e.nativeEvent.layout.height)}
        accessibilityViewIsModal
      >
        {grabberAndHeader}
        {body}
      </Animated.View>
    </GestureDetector>
  ) : (
    <Animated.View
      style={[
        styles.sheet,
        fixedH ? { height: fixedH } : { maxHeight: Math.round(SCREEN_H * maxHeightRatio) },
        { transform: [{ translateY }] },
      ]}
      onLayout={fixedH ? undefined : (e) => setMeasuredH(e.nativeEvent.layout.height)}
      accessibilityViewIsModal
    >
      <GestureDetector gesture={pan}>
        <View>{grabberAndHeader}</View>
      </GestureDetector>
      {body}
    </Animated.View>
  );

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      {/* A Modal is its own native view hierarchy, so the app-level
          GestureHandlerRootView in App.tsx does not reach inside it. Without
          this wrapper the pan handler (and every gesture-handler ScrollView
          this sheet uses for its content) never receives touches at all -
          same fix already applied in CommentsSheet/ShareSheet/PlaybackSheet. */}
      <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
        {/* Transparent outside-tap layer - dismisses without dimming the screen. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close popup"
        />
        {keyboardAvoid ? (
          // "padding" on both platforms: this sheet lives inside a Modal, and a
          // Modal never receives Android's native adjustResize, so leaving
          // Android's behavior undefined (as if the OS would handle it) left the
          // keyboard covering the input with no avoidance at all.
          <KeyboardAvoidingView behavior="padding" pointerEvents="box-none">
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Depth without dimming: a soft shadow around the sheet + crisp top edge.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  grabZone: { alignItems: "center", paddingTop: 8, paddingBottom: 10 },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
});
