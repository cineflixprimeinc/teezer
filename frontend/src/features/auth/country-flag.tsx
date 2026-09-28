"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

interface FlagProps {
  code?: string | null;
  size?: number;
  rounded?: boolean;
  className?: string;
}

/**
 * Cross-platform country flag.
 *
 * Windows Chrome doesn't render regional-indicator emoji pairs as flag glyphs
 * (it shows "NP" instead of 🇳🇵). flagcdn.com gives us real images on every
 * OS. We fall back to a globe icon if the image fails to load.
 */
export function CountryFlag({ code, size = 20, rounded = true, className }: FlagProps) {
  const [errored, setErrored] = useState(false);
  const valid = !!code && code.length === 2 && !errored;

  if (!valid) {
    return (
      <span
        className={className}
        style={{
          width:           size,
          height:          size,
          display:         "inline-flex",
          alignItems:      "center",
          justifyContent:  "center",
          borderRadius:    rounded ? size / 5 : 0,
          background:      "#f4f5f7",
          color:           "#9ca3af",
          flexShrink:      0,
        }}
      >
        <Globe size={Math.round(size * 0.7)} />
      </span>
    );
  }

  const lower = code!.toLowerCase();
  // 2x resolution for HiDPI displays
  const px2x = Math.round(size * 2);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w${px2x}/${lower}.png`}
      alt={code!.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      onError={() => setErrored(true)}
      className={className}
      style={{
        width:        size,
        height:       Math.round(size * 0.75),
        objectFit:    "cover",
        borderRadius: rounded ? Math.max(3, Math.round(size / 6)) : 0,
        boxShadow:    "0 0 0 1px rgba(0,0,0,0.06)",
        flexShrink:   0,
        display:      "inline-block",
      }}
    />
  );
}
