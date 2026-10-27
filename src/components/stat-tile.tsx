import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/** A number with a label and a small hint underneath; a link when `href` is given. */
export function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number | string;
  hint: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full gap-1 py-4">
      <CardContent className="grid gap-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tracking-tight">
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    body
  );
}

/** One quiet line for a card with nothing to show. */
export function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`px-2 py-3 text-sm text-muted-foreground ${className ?? ""}`}>{children}</p>;
}
