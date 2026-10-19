import { cn } from "@/lib/utils";

export interface ChartPoint {
  /** ISO date of the quote. */
  at: string;
  price: number;
}

export interface ChartSeries {
  id: number;
  name: string;
  points: ChartPoint[];
}

const W = 760;
const H = 280;
const M = { top: 24, right: 16, bottom: 28, left: 56 };

/** Rounds the axis to tidy numbers: 1180..1730 -> ticks every 100 from 1100 to 1800. */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const dateLabel = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * One line per supplier over time. Colour follows the supplier (series-1..8 by position in `series`),
 * so filtering never repaints the survivors. Every point has a native tooltip; the quote table
 * below the chart on the same page is the text alternative.
 */
export function PriceChart({
  series,
  currency,
  className,
}: {
  series: ChartSeries[];
  currency: string;
  className?: string;
}) {
  const all = series.flatMap((s) => s.points.map((p) => ({ t: new Date(p.at).getTime(), v: p.price })));
  if (all.length < 2) return null;

  const tMin = Math.min(...all.map((p) => p.t));
  let tMax = Math.max(...all.map((p) => p.t));
  if (tMax === tMin) tMax = tMin + 86400_000;
  const ticks = niceTicks(Math.min(...all.map((p) => p.v)), Math.max(...all.map((p) => p.v)));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const x = (t: number) => M.left + ((t - tMin) / (tMax - tMin)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  // a span of a couple of days gets two date labels, not five copies of the same day
  const nTicks = tMax - tMin < 3 * 86400_000 ? 2 : 5;
  const xTicks = Array.from({ length: nTicks }, (_, i) => tMin + ((tMax - tMin) * i) / (nTicks - 1));

  return (
    <div className={cn("grid gap-3", className)}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Suppliers">
        {series.map((s, i) => {
          const last = s.points[s.points.length - 1];
          return (
            <li key={s.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: i < 8 ? `var(--series-${i + 1})` : "var(--muted-foreground)" }}
              />
              <span>{s.name}</span>
              <span className="text-muted-foreground tabular-nums">{last.price.toLocaleString("en-US")}</span>
            </li>
          );
        })}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Price history per supplier in ${currency}`}
        className="h-auto w-full overflow-visible text-muted-foreground"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.18} />
            <text x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor" className="tabular-nums">
              {v.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="currentColor"
          >
            {dateLabel(t)}
          </text>
        ))}
        <text x={M.left - 8} y={8} textAnchor="end" fontSize={11} fill="currentColor">
          {currency}
        </text>
        {series.map((s, i) => {
          const color = i < 8 ? `var(--series-${i + 1})` : "var(--muted-foreground)";
          const pts = s.points.map((p) => [x(new Date(p.at).getTime()), y(p.price)] as const);
          return (
            <g key={s.id}>
              {pts.length > 1 && (
                <polyline
                  points={pts.map(([px, py]) => `${px},${py}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {s.points.map((p, j) => (
                <circle
                  key={j}
                  cx={pts[j][0]}
                  cy={pts[j][1]}
                  r={4}
                  fill={color}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  <title>{`${s.name}: ${currency} ${p.price.toLocaleString("en-US")} on ${new Date(p.at).toLocaleDateString("en-GB")}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
