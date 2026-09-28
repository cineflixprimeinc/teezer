"use client";

import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import { Heart, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import likeAnimation from "@/assets/lottie/like-animation.json";
import saveAnimation from "@/assets/lottie/save.json";

/**
 * The same one-shot Lottie burst the mobile app's FeedActionRail (LikeIcon/
 * SaveIcon) plays on like/save, ported to the web. Only mounts on a
 * false -> true transition (never on unlike/unsave, never on the initial
 * mount if a post already arrives liked), plays once over the icon, and
 * unmounts itself via onComplete - no permanent overlay left behind. State
 * is local to each icon instance, so liking one video can never trigger or
 * affect the animation on another.
 *
 * Burst is sized ~2.8x the icon itself, same ratio FeedActionRail's own
 * likeLottieWrap/saveLottieWrap use (108/39 and 92/33) - a burst needs room
 * to expand past the icon's own bounds to read as one.
 */
export function AnimatedHeart({ filled, className, size = 23 }: { filled: boolean; className?: string; size?: number }) {
  const [playing, setPlaying] = useState(false);
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current) setPlaying(true);
    wasFilled.current = filled;
  }, [filled]);

  const burst = Math.round(size * 2.8);
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <Heart className={cn(className)} strokeWidth={2} />
      {playing && (
        <Lottie
          animationData={likeAnimation}
          loop={false}
          onComplete={() => setPlaying(false)}
          className="pointer-events-none absolute"
          style={{ width: burst, height: burst }}
        />
      )}
    </span>
  );
}

export function AnimatedBookmark({ filled, className, size = 23 }: { filled: boolean; className?: string; size?: number }) {
  const [playing, setPlaying] = useState(false);
  // Bumped on every false->true transition and used as the Lottie's key - a
  // fast unsave->save->unsave->save only replays the burst on the first
  // save otherwise (playing is already true from the tap before, so
  // setPlaying(true) again is a no-op and the still-mounted instance just
  // keeps running from wherever it was). Changing key forces React to
  // unmount and remount a fresh instance every time, same fix
  // FeedActionRail's SaveIcon already applies on mobile.
  const [burstKey, setBurstKey] = useState(0);
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current) {
      setBurstKey((n) => n + 1);
      setPlaying(true);
    } else if (!filled && wasFilled.current) {
      setPlaying(false);
    }
    wasFilled.current = filled;
  }, [filled]);

  const burst = Math.round(size * 2.8);
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <Bookmark className={cn(className)} strokeWidth={2} />
      {playing && (
        <Lottie
          key={burstKey}
          animationData={saveAnimation}
          loop={false}
          onComplete={() => setPlaying(false)}
          className="pointer-events-none absolute"
          style={{ width: burst, height: burst }}
        />
      )}
    </span>
  );
}
