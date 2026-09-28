"use client";
import { useEffect } from "react";
import { Heart } from "lucide-react";

export type HeartItem = {
  id: number;
  x: number;
  y: number;
  rotate: number;
};

export function DoubleTapLike({
  hearts,
  onRemove,
}: {
  hearts: HeartItem[];
  onRemove: (id: number) => void;
}) {
  return (
    <>
      {hearts.map((h) => (
        <HeartBurst key={h.id} heart={h} onDone={() => onRemove(h.id)} />
      ))}
    </>
  );
}

function HeartBurst({ heart, onDone }: { heart: HeartItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-30 reelsoo-heart-pop"
      style={
        {
          left: heart.x,
          top: heart.y,
          "--rotate": `${heart.rotate}deg`,
        } as React.CSSProperties
      }
    >
      <Heart
        className="h-20 w-20 fill-[#fe2c55] text-[#fe2c55]"
        strokeWidth={0}
        style={{
          filter:
            "drop-shadow(0 0 18px rgba(254,44,85,0.80)) drop-shadow(0 2px 8px rgba(0,0,0,0.50))",
        }}
      />
    </span>
  );
}
