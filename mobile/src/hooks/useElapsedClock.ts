import { useEffect, useState } from "react";

/**
 * "48:12" — time elapsed since an ISO timestamp, ticking once a second.
 *
 * Formats as MM:SS below an hour and H:MM:SS above it, so a room that has been
 * running for two hours does not report "127:04". Returns "" for a missing or
 * unparseable timestamp, which is the case for a scheduled room that has not
 * started yet — callers render nothing rather than a zeroed clock that would
 * claim the room is live.
 */
export function useElapsedClock(startedAt: string | null | undefined): string {
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(startMs)) return;
    // Aligned to the next whole second so the displayed value changes on the
    // second boundary rather than drifting by however long the mount took.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startMs]);

  if (!Number.isFinite(startMs)) return "";

  const total = Math.max(0, Math.floor((now - startMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
