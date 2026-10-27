import { STATUS_META, type DayStatus } from "@/lib/attendance";

const AWAY = new Set<DayStatus>(["absent", "medical", "other"]);

/**
 * How a day looks, everywhere attendance is drawn. Filled = at work (present, late); outlined with a light tint = away
 * (absent, medical, other). The fill/outline split means "came in" and "away" never rely on colour alone.
 */
export function cellLook(status: DayStatus): { className: string; style?: React.CSSProperties } {
  if (status === "present" || status === "late") {
    return { className: "text-neutral-950/80 font-semibold", style: { background: STATUS_META[status].color } };
  }
  if (AWAY.has(status)) {
    const c = STATUS_META[status as "absent" | "medical" | "other"].color;
    return {
      className: "font-semibold text-foreground",
      style: { boxShadow: `inset 0 0 0 1.5px ${c}`, background: `color-mix(in oklab, ${c} 16%, transparent)` },
    };
  }
  if (status === "off") return { className: "bg-muted text-muted-foreground" };
  if (status === "today") return { className: "border border-dashed border-foreground/35 text-foreground" };
  return { className: "text-muted-foreground/60" };
}

/** Colour key used under every attendance chart. */
export function AttendanceLegend({ className = "" }: { className?: string }) {
  const keys = Object.keys(STATUS_META) as (keyof typeof STATUS_META)[];
  return (
    <ul className={`flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground ${className}`} aria-label="Legend">
      {keys.map((k) => {
        const look = cellLook(k);
        return (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-[3px] ${look.className}`} style={look.style} aria-hidden />
            {STATUS_META[k].label}
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded-[3px] bg-muted" aria-hidden /> Day off
      </li>
      <li className="text-muted-foreground/80">Filled = at work · outlined = away</li>
    </ul>
  );
}
