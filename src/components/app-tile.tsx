import Link from "next/link";
import type { AppDef } from "@/lib/apps";

/**
 * One app on the home screen. Phones: an icon with its name under it, like a phone's home screen, and the number on
 * the icon. Wider screens: a small one-row tile with the icon, the name and one line (what is waiting, else what the
 * app is for).
 */
export function AppTile({ app, badge, badgeLabel }: { app: AppDef; badge?: number; badgeLabel?: string }) {
  const live = app.status === "live";
  const count = badge ? (badge > 99 ? "99+" : String(badge)) : "";
  const body = (
    <div
      className={
        "relative flex h-full flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 text-center transition-colors " +
        "sm:flex-row sm:gap-3 sm:border sm:bg-card sm:p-2.5 sm:text-left " +
        (live ? "active:bg-muted sm:hover:shadow-sm" : "opacity-50")
      }
    >
      <span
        className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-white sm:size-9 sm:rounded-lg"
        style={{ background: live ? app.color : "var(--muted-foreground)" }}
      >
        <app.icon className="size-6 sm:size-5" />
        {count && (
          <span
            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white ring-2 ring-background sm:hidden"
            aria-hidden
          >
            {count}
          </span>
        )}
      </span>
      <div className="grid w-full min-w-0 sm:flex-1">
        <span className="truncate text-[11px] leading-tight font-medium sm:text-sm sm:font-semibold">{app.label}</span>
        <span className={`hidden truncate text-xs sm:block ${badge ? "font-medium text-primary" : "text-muted-foreground"}`}>
          {!live ? "Coming soon" : badge ? badgeLabel : app.blurb}
        </span>
        {badge ? <span className="sr-only sm:hidden">{badgeLabel}</span> : null}
      </div>
      {count && (
        <span
          className="hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground sm:flex"
          aria-hidden
        >
          {count}
        </span>
      )}
    </div>
  );
  return live ? (
    <Link href={app.href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    <div aria-disabled title="Coming soon">
      {body}
    </div>
  );
}
