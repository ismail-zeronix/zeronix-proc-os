import { Flame, Flag, Snowflake, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TEMPERATURE_LABEL, type Checks, type Temperature, temperature } from "@/lib/sales";

const STYLE: Record<Temperature, { icon: typeof Flame; cls: string }> = {
  hot: { icon: Flame, cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  warm: { icon: Sun, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  cold: { icon: Snowflake, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

/** Hot / Warm / Cold, always with an icon and a word so it never depends on colour alone. */
export function TempBadge({ checks }: { checks: Checks }) {
  const t = temperature(checks);
  const { icon: Icon, cls } = STYLE[t];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="secondary" className={cls} title="From the genuine-lead checklist on the deal">
        <Icon /> {TEMPERATURE_LABEL[t]}
      </Badge>
      {checks.redFlag && (
        <Badge variant="destructive" title="Someone marked this lead as suspicious">
          <Flag /> Check
        </Badge>
      )}
    </span>
  );
}

/** Two-letter initials for an owner chip. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
