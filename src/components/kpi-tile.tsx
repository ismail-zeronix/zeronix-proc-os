import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/** A 12-point-style trend line with a ringed end dot. Plain SVG, so it costs no JavaScript. */
export function Sparkline({ values, color = "var(--series-1)", width = 84, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pad = 4;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lx = x(values.length - 1);
  const ly = y(values[values.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend: ${values.join(", ")}`} className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      <circle cx={lx} cy={ly} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

/** Change against the previous period, as a sign, an arrow and a percentage: never colour alone. */
export function Delta({ cur, prev, goodWhenUp = true, label }: { cur: number; prev: number; goodWhenUp?: boolean; label: string }) {
  if (prev === 0 && cur === 0) return <span className="text-xs text-muted-foreground">No change {label}</span>;
  if (prev === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <ArrowUpRight className="size-3.5" /> New {label}
      </span>
    );
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3.5" /> 0% {label}
      </span>
    );
  }
  const up = pct > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      <Icon className="size-3.5" /> {up ? "+" : ""}
      {pct}% {label}
    </span>
  );
}

/**
 * One headline number: label, value, change vs the previous period, optional trend line.
 * `hero` makes it the single big figure of the view (48px).
 */
export function KpiTile({
  label,
  value,
  hint,
  delta,
  spark,
  hero,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  spark?: number[];
  hero?: boolean;
  icon?: React.ReactNode;
  /** "bad" marks a number that needs action (overdue follow-ups). */
  tone?: "bad";
}) {
  return (
    <div className={`flex flex-col justify-between gap-2 rounded-xl border bg-card p-4 ${hero ? "lg:col-span-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className={`font-semibold tracking-tight whitespace-nowrap ${hero ? "text-5xl" : "text-2xl"} ${tone === "bad" ? "text-red-700 dark:text-red-400" : ""}`}>{value}</div>
        {spark && <Sparkline values={spark} width={hero ? 84 : 60} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {delta}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
