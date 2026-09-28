import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";

/**
 * One freely-transformable object on the story canvas.
 *
 * This is the single implementation of move / pinch-zoom / rotate / select /
 * delete for EVERY overlay - text, emoji, and whatever is added later. A new
 * element type supplies its own children and inherits the whole interaction
 * without writing any gesture code, which is the point: the editor should not
 * grow a second drag implementation every time it grows a tool.
 *
 * ── Why PanResponder and not react-native-gesture-handler ──────────────────
 *
 * The editor already drives its overlays with PanResponder, and this app has no
 * react-native-reanimated (Skia is pinned to a build that does not need it - see
 * src/features/editor/skia.ts). Reaching for a second gesture library would mean
 * two systems competing for the same touches on the same canvas. PanResponder
 * hands us the raw `touches` array, which is all a pinch or a rotation actually
 * needs.
 *
 * ── Why Animated values rather than state ──────────────────────────────────
 *
 * A finger moving across the screen fires on every frame. Writing that to React
 * state would re-render the canvas and every sibling overlay 60 times a second.
 * The live transform is held in Animated.Values driven by the NATIVE driver, so
 * a drag never crosses the JS/React boundary at all - it is a GPU transform on
 * the existing view. React only hears about it once, on release, when the final
 * numbers are committed upward.
 *
 * ── Coordinates ────────────────────────────────────────────────────────────
 *
 * x and y are PERCENTAGES of the canvas addressing the object's CENTRE, which is
 * exactly what StoryLayer stores and what the viewer reads. Nothing here is ever
 * saved in device pixels, so a story composed on a small phone lands in the same
 * place on a tablet or on the web.
 */

/** The persisted state of one object. Mirrors StoryLayer's transform fields. */
export interface LayerTransform {
  /** Percent of canvas width, addressing the object's centre. */
  x: number;
  /** Percent of canvas height, addressing the object's centre. */
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  zIndex: number;
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 6;

/** Kept off the very edge so an object can never be parked where the viewer clips it. */
const MIN_PCT = 4;
const MAX_PCT = 96;

/** Under this much travel, in px, a touch is a tap rather than a drag. */
const TAP_SLOP = 6;

/** Within this many percentage points of dead-centre, snapToCenter pulls the
 *  object exactly onto 50/50 rather than leaving it a hair off - the same
 *  "sticky" magnetism a design tool's own centre guide has. */
const SNAP_PCT = 1.6;

/** doubleTapZoom's one-finger alternative to pinching: tap twice within this
 *  long, in roughly the same spot, and keep the second tap held down. */
const DOUBLE_TAP_MS = 300;
/** How far apart two taps can land and still count as the same double-tap. */
const DOUBLE_TAP_SLOP = 36;
/** px of vertical drag per 1x of scale change once a double-tap zoom is
 *  engaged - up zooms in, down zooms out, tuned to feel like the pinch. */
const ZOOM_DRAG_PX_PER_1X = 220;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Distance and angle between the first two fingers - the whole of pinch/rotate. */
function spread(touches: { pageX: number; pageY: number }[]) {
  const [a, b] = touches;
  const dx = b.pageX - a.pageX;
  const dy = b.pageY - a.pageY;

  return {
    distance: Math.max(1, Math.hypot(dx, dy)),
    /** Degrees, so it can be added straight onto `rotation`. */
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    midX: (a.pageX + b.pageX) / 2,
    midY: (a.pageY + b.pageY) / 2,
  };
}

export interface TransformableLayerProps {
  transform: LayerTransform;
  /** Measured canvas, in px. Percentages are meaningless without it. */
  canvas: { w: number; h: number };
  selected: boolean;
  onSelect: () => void;
  /** Final numbers, once the fingers are off. Never called mid-gesture. */
  onCommit: (t: LayerTransform) => void;
  /**
   * Canvas-relative y, in px, above which the delete zone begins. Dragging an
   * object below it arms the drop. Undefined disables drag-to-delete.
   */
  deleteZoneTop?: number;
  /** Fired only when the answer CHANGES, so it costs at most a render per drag. */
  onOverDeleteChange?: (over: boolean) => void;
  onDelete?: () => void;
  /** Locked while a sheet is open, so a stray touch cannot move things. */
  disabled?: boolean;
  /** False skips the padded, dashed-on-select frame this wraps every overlay
   *  in - for a full-bleed background layer (the story's own photo) rather
   *  than a floating, individually-selectable object. Defaults to true, so
   *  every existing text/emoji overlay is unaffected. */
  framed?: boolean;
  /**
   * Opt-in: while dragging or pinch-repositioning, the object's centre
   * magnetically snaps to the canvas centre (50/50) within SNAP_PCT, with a
   * light haptic tick the moment it crosses into alignment on each axis
   * (never repeated while it stays there). Off by default - every existing
   * text/emoji overlay is unaffected unless it opts in too.
   */
  snapToCenter?: boolean;
  /** Reports X/Y alignment state, so the CALLER can draw a centre guide line
   *  across the full canvas - this component only knows its own box, not the
   *  canvas edges a full-width/height line needs. Fires only on change. */
  onCenterAlign?: (aligned: { x: boolean; y: boolean }) => void;
  /**
   * Opt-in: double-tap and hold, then drag up/down, zooms with one finger -
   * a one-handed alternative to the two-finger pinch, which is otherwise the
   * only way to change scale. The two-finger pinch is untouched either way;
   * this is additive. Off by default - every existing text/emoji overlay is
   * unaffected unless it opts in too.
   */
  doubleTapZoom?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

export function TransformableLayer({
  transform,
  canvas,
  selected,
  onSelect,
  onCommit,
  deleteZoneTop,
  onOverDeleteChange,
  onDelete,
  disabled = false,
  framed = true,
  snapToCenter = false,
  onCenterAlign,
  doubleTapZoom = false,
  accessibilityLabel,
  children,
}: TransformableLayerProps) {
  /* The object's own box. x/y address its centre, so half of this is subtracted
     to place it - measured rather than assumed, because an emoji and a
     three-line caption are nothing like the same size. */
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* The live transform. Never React state: see the note at the top. */
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(transform.scale)).current;
  const rotation = useRef(new Animated.Value(transform.rotation)).current;

  /* Plain mirrors of the above. Animated.Value has no readable `.value` without
     attaching a listener, and the responder needs the current numbers on every
     frame - so they are tracked here alongside. */
  const live = useRef({ ...transform });
  const box = useRef(size);
  const view = useRef(canvas);
  const overDelete = useRef(false);
  const zone = useRef(deleteZoneTop);
  const gestureMoved = useRef(false);
  /** Per-axis alignment state, so a haptic only fires on the frame it's
   *  newly crossed into - not once per frame for as long as it stays there. */
  const alignedX = useRef(false);
  const alignedY = useRef(false);
  /** True between grant and release. Blocks prop re-seating - see the effect. */
  const gesturing = useRef(false);

  box.current = size;
  view.current = canvas;
  zone.current = deleteZoneTop;

  /** Percent -> px offset from the canvas origin, less half the object. */
  const place = useCallback((t: LayerTransform, w: number, h: number, c: { w: number; h: number }) => ({
    x: (t.x / 100) * c.w - w / 2,
    y: (t.y / 100) * c.h - h / 2,
  }), []);

  /** Pulls x/y onto dead-centre within SNAP_PCT and reports/haptics the
   *  crossing - a no-op passthrough when snapToCenter is off. Called every
   *  move frame, so the haptic itself is gated on the ref actually flipping. */
  const applySnap = useCallback((x: number, y: number) => {
    if (!snapToCenter) return { x, y };
    const nearX = Math.abs(x - 50) < SNAP_PCT;
    const nearY = Math.abs(y - 50) < SNAP_PCT;
    if (nearX !== alignedX.current || nearY !== alignedY.current) {
      alignedX.current = nearX;
      alignedY.current = nearY;
      onCenterAlign?.({ x: nearX, y: nearY });
      if (nearX || nearY) haptics.light();
    }
    return { x: nearX ? 50 : x, y: nearY ? 50 : y };
  }, [snapToCenter, onCenterAlign]);

  /* Re-seat whenever the object is measured, the canvas resizes (rotation, a
     keyboard opening) or the committed transform changes from outside - an
     undo, say. Without this the object would keep a stale pixel offset.

     Skipped WHILE A GESTURE IS IN FLIGHT, and that guard is not theoretical:
     crossing into the delete zone flips state in the parent, which re-renders
     and hands down a fresh transform object. Re-seating on that would yank the
     object back to where the drag started, at the exact moment the user is
     reaching for the bin.

     Depends on the numbers rather than the object, because the parent builds a
     new transform literal on every render. */
  useEffect(() => {
    if (gesturing.current) return;
    live.current = { ...transform };
    const p = place(transform, size.w, size.h, canvas);
    tx.setValue(p.x);
    ty.setValue(p.y);
    scale.setValue(transform.scale);
    rotation.setValue(transform.rotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    transform.x, transform.y, transform.scale, transform.rotation,
    size.w, size.h, canvas.w, canvas.h,
  ]);

  /* Gesture baselines. Refs because they are read and written inside the
     responder, which is built once and must not close over a stale render. */
  const pinch = useRef<
    | { distance: number; angle: number; midX: number; midY: number; scale: number; rotation: number; x: number; y: number }
    | null
  >(null);
  const pan = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  /* Double-tap-zoom baselines - see doubleTapZoom's own doc comment above. */
  const lastTapAt = useRef(0);
  const lastTapPos = useRef<{ x: number; y: number } | null>(null);
  const zoomDrag = useRef<{ scale: number; y0: number } | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        /* Claim the touch on contact so tapping selects, and so the canvas
           underneath never steals a drag that started on an object. */
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        /* Once this object owns the gesture it keeps it. Without this a second
           finger landing for a pinch can hand the gesture to a sibling. */
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (evt) => {
          gesturing.current = true;
          gestureMoved.current = false;
          overDelete.current = false;
          /* Selecting on touch-DOWN, not on release: the bounding box and the
             delete zone have to be on screen before the drag starts, or there
             is nothing to drag toward. */
          onSelect();

          if (doubleTapZoom) {
            const touch = evt.nativeEvent.touches[0];
            const now = Date.now();
            const last = lastTapPos.current;
            const isDoubleTap =
              now - lastTapAt.current < DOUBLE_TAP_MS &&
              !!last &&
              Math.abs(touch.pageX - last.x) < DOUBLE_TAP_SLOP &&
              Math.abs(touch.pageY - last.y) < DOUBLE_TAP_SLOP;

            if (isDoubleTap) {
              zoomDrag.current = { scale: live.current.scale, y0: touch.pageY };
              // Consumed - a third quick tap starts a fresh pair rather than
              // re-triggering immediately.
              lastTapAt.current = 0;
              haptics.light();
            } else {
              lastTapAt.current = now;
              lastTapPos.current = { x: touch.pageX, y: touch.pageY };
              zoomDrag.current = null;
            }
          }
        },

        onPanResponderMove: (evt, gs) => {
          const c = view.current;
          if (!c.w || !c.h) return;

          if (Math.abs(gs.dx) > TAP_SLOP || Math.abs(gs.dy) > TAP_SLOP) {
            gestureMoved.current = true;
          }

          const touches = evt.nativeEvent.touches;
          const t = live.current;

          if (doubleTapZoom && zoomDrag.current && touches.length < 2) {
            /* ── One-finger zoom: double-tap-hold-and-drag ────────────────────
               Vertical only, and it never touches x/y - up zooms in, down
               zooms out, in place, same as the pinch would if you kept its
               midpoint still. A second finger landing mid-drag falls straight
               through to the pinch branch above on the very next frame (its
               own baseline reads live.current.scale, which this keeps
               current), so the two compose rather than fight. */
            const zd = zoomDrag.current;
            const deltaY = zd.y0 - touches[0].pageY;
            const nextScale = clamp(zd.scale * (1 + deltaY / ZOOM_DRAG_PX_PER_1X), MIN_SCALE, MAX_SCALE);
            live.current = { ...t, scale: nextScale };
            scale.setValue(nextScale);
            gestureMoved.current = true;
            return;
          }

          if (touches.length >= 2) {
            /* ── Two fingers: scale and rotate together ──────────────────────
               Re-baselined on the frame the second finger lands, so adding or
               lifting a finger mid-gesture adjusts from where the object is
               rather than snapping to where it would have been. */
            zoomDrag.current = null;
            const now = spread(touches as { pageX: number; pageY: number }[]);
            const base = pinch.current;

            if (!base) {
              pinch.current = {
                distance: now.distance,
                angle: now.angle,
                midX: now.midX,
                midY: now.midY,
                scale: t.scale,
                rotation: t.rotation,
                x: t.x,
                y: t.y,
              };
              return;
            }

            const nextScale = clamp((now.distance / base.distance) * base.scale, MIN_SCALE, MAX_SCALE);
            const nextRotation = base.rotation + (now.angle - base.angle);
            /* The midpoint drags too, so a two-finger gesture can reposition as
               well as resize - which is how it feels in every story editor. */
            const rawX = clamp(base.x + ((now.midX - base.midX) / c.w) * 100, MIN_PCT, MAX_PCT);
            const rawY = clamp(base.y + ((now.midY - base.midY) / c.h) * 100, MIN_PCT, MAX_PCT);
            const { x: nextX, y: nextY } = applySnap(rawX, rawY);

            live.current = { ...t, scale: nextScale, rotation: nextRotation, x: nextX, y: nextY };
            scale.setValue(nextScale);
            rotation.setValue(nextRotation);
            const p = place(live.current, box.current.w, box.current.h, c);
            tx.setValue(p.x);
            ty.setValue(p.y);
            gestureMoved.current = true;
          } else {
            /* ── One finger: move ───────────────────────────────────────────
               If a pinch just ended, re-baseline from the object's CURRENT
               position and this frame's finger offset, so lifting one finger
               does not teleport it back to where the drag began. */
            if (pinch.current) {
              pinch.current = null;
              pan.current = { x: t.x, y: t.y, dx: gs.dx, dy: gs.dy };
            }
            const base = pan.current ?? (pan.current = { x: t.x, y: t.y, dx: gs.dx, dy: gs.dy });

            const rawX = clamp(base.x + ((gs.dx - base.dx) / c.w) * 100, MIN_PCT, MAX_PCT);
            const rawY = clamp(base.y + ((gs.dy - base.dy) / c.h) * 100, MIN_PCT, MAX_PCT);
            const { x: nextX, y: nextY } = applySnap(rawX, rawY);

            live.current = { ...t, x: nextX, y: nextY };
            const p = place(live.current, box.current.w, box.current.h, c);
            tx.setValue(p.x);
            ty.setValue(p.y);
          }

          /* Armed / disarmed as the object crosses into the delete zone. Only
             the CHANGE is reported, so the highlight costs one render each way
             rather than one per frame. */
          if (zone.current !== undefined && onOverDeleteChange) {
            const centreY = (live.current.y / 100) * c.h;
            const isOver = centreY >= zone.current;
            if (isOver !== overDelete.current) {
              overDelete.current = isOver;
              onOverDeleteChange(isOver);
            }
          }
        },

        onPanResponderRelease: () => {
          gesturing.current = false;
          pinch.current = null;
          pan.current = null;
          zoomDrag.current = null;
          /* The centre guide is a during-drag affordance, not a resting state
             - clear it the instant fingers lift, whichever way this ends. */
          if (alignedX.current || alignedY.current) {
            alignedX.current = false;
            alignedY.current = false;
            onCenterAlign?.({ x: false, y: false });
          }

          /* Dropped on the bin. Checked before committing, so a deleted object
             never writes a position on its way out. */
          if (overDelete.current && onDelete) {
            overDelete.current = false;
            onOverDeleteChange?.(false);
            onDelete();
            return;
          }

          if (overDelete.current) {
            overDelete.current = false;
            onOverDeleteChange?.(false);
          }

          /* A tap selects and nothing else - already done on grant, and there is
             no new geometry to write. */
          if (!gestureMoved.current) return;

          onCommit({ ...live.current });
        },

        onPanResponderTerminate: () => {
          gesturing.current = false;
          pinch.current = null;
          pan.current = null;
          zoomDrag.current = null;
          if (alignedX.current || alignedY.current) {
            alignedX.current = false;
            alignedY.current = false;
            onCenterAlign?.({ x: false, y: false });
          }
          if (overDelete.current) {
            overDelete.current = false;
            onOverDeleteChange?.(false);
          }
          /* Interrupted rather than finished - keep whatever was reached, so an
             incoming call does not throw away the user's placement. */
          if (gestureMoved.current) onCommit({ ...live.current });
        },
      }),
    [disabled, onSelect, onCommit, onDelete, onOverDeleteChange, onCenterAlign, doubleTapZoom, place, applySnap, scale, rotation, tx, ty],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={onLayout}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.layer,
        {
          zIndex: transform.zIndex,
          /* Order matters: translate places the box, then rotate and scale act
             about its own centre. Every one of these is native-driver safe. */
          transform: [
            { translateX: tx },
            { translateY: ty },
            {
              rotate: rotation.interpolate({
                inputRange: [-360, 360],
                outputRange: ["-360deg", "360deg"],
              }),
            },
            { scale },
          ],
          /* Hidden until measured, or the first frame flashes at the corner. */
          opacity: size.w > 0 ? 1 : 0,
        },
      ]}
    >
      {framed ? <View style={[styles.frame, selected && styles.frameOn]}>{children}</View> : children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* left/top stay at 0 - placement is entirely in the transform, which is what
     lets it run on the native driver. */
  layer: { position: "absolute", left: 0, top: 0 },
  /** Padding is always present so selecting never nudges the content. */
  frame: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  frameOn: {
    borderColor: "rgba(255,255,255,.92)",
    borderStyle: "dashed",
    backgroundColor: "rgba(0,0,0,.12)",
  },
});
