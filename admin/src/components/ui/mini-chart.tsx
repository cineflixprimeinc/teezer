"use client";

/** Pure SVG mini line chart - no external dependencies */
export function MiniLineChart({
  data,
  color = "#fe2c55",
  height = 50,
  fill = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length < 2) return null;

  const max    = Math.max(...data);
  const min    = Math.min(...data);
  const range  = max - min || 1;
  const w      = 200;
  const h      = height;
  const pad    = 2;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fillPath = fill
    ? `M${pts[0].x},${h} ` +
      pts.map((p) => `L${p.x},${p.y}`).join(" ") +
      ` L${pts[pts.length - 1].x},${h} Z`
    : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {fill && fillPath && (
        <path d={fillPath} fill={color} fillOpacity={0.08} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Simple bar chart */
export function MiniBarChart({
  data,
  color = "#fe2c55",
  height = 50,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (!data || !data.length) return null;
  const max   = Math.max(...data) || 1;
  const count = data.length;

  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(4, (v / max) * 100)}%`,
            backgroundColor: color,
            opacity: i === count - 1 ? 1 : 0.4 + (i / count) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

/** Simple donut / ring chart */
export function DonutChart({
  data,
  size = 120,
  thickness = 18,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total    = data.reduce((s, d) => s + d.value, 0) || 1;
  const r        = (size - thickness) / 2;
  const cx       = size / 2;
  const cy       = size / 2;
  const circ     = 2 * Math.PI * r;
  let dashOffset = 0;

  return (
    <svg width={size} height={size}>
      {data.map((d, i) => {
        const dash    = (d.value / total) * circ;
        const segment = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        dashOffset += dash;
        return segment;
      })}
    </svg>
  );
}
