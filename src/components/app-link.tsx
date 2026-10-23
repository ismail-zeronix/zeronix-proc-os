"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appOfPath, type AppDef } from "@/lib/apps";

/** Small "Accounts" style tag that says a link leaves the current app. */
export function AppTag({ app }: { app: AppDef }) {
  const Icon = app.icon;
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-sm border px-1 align-middle font-sans text-[10px] leading-4 font-medium text-muted-foreground">
      <Icon className="size-2.5" style={{ color: app.color }} aria-hidden />
      {app.label}
    </span>
  );
}

/** A link that, when it leads into another app (Sales → Accounts), shows that app's tag so the jump is not a surprise. */
export function AppLink({ href, title, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const here = appOfPath(usePathname());
  const there = appOfPath(href);
  const other = here && there && here.key !== there.key ? there : undefined;
  return (
    <Link href={href} title={other ? `${title ? `${title} · ` : ""}Opens in ${other.label}` : title} {...rest}>
      {children}
      {other && <AppTag app={other} />}
    </Link>
  );
}
