import Link from "next/link";
import type { AppDef } from "@/lib/apps";

/** One app on the home screen: coloured icon, name, one line, and an optional number badge. */
export function AppTile({ app, badge, badgeLabel }: { app: AppDef; badge?: number; badgeLabel?: string }) {
  const body = (
    <div
      className={
        "relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow " +
        (app.status === "live" ? "hover:shadow-md" : "opacity-50")
      }
    >
      <span
        className="flex size-11 items-center justify-center rounded-xl text-white"
        style={{ background: app.status === "live" ? app.color : "var(--muted-foreground)" }}
      >
        <app.icon className="size-6" />
      </span>
      <div className="grid gap-0.5">
        <span className="font-semibold leading-tight">{app.label}</span>
        <span className="text-xs text-muted-foreground">{app.status === "live" ? app.blurb : "Coming soon"}</span>
        {badge ? <span className="mt-1 text-xs font-medium text-primary">{badgeLabel}</span> : null}
      </div>
      {badge ? (
        <span
          className="absolute top-3 right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
          aria-hidden
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </div>
  );
  return app.status === "live" ? (
    <Link href={app.href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    <div aria-disabled title="Coming soon">
      {body}
    </div>
  );
}
