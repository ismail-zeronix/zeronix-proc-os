"use client";

import { ChevronDown, LayoutGrid, LogOut, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/login/actions";
import { HeaderClock } from "@/components/attendance/header-clock";
import type { PunchProps } from "@/components/attendance/punch-toggle";
import { GlobalSearch } from "@/components/global-search";
import { NewMenu } from "@/components/new-menu";
import { NotificationBell } from "@/components/notifications/bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickAddTask } from "@/components/task-ui";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navFor, type NavPerms } from "@/lib/app-nav";
import { APPS, appOfPath, type AppKey, type Role } from "@/lib/apps";
import type { BellData } from "@/lib/notifications/types";

/**
 * The bar on every page: brand (home), apps switcher, search, theme and the user menu.
 * `withSidebar` must be true only inside an app layout that has a SidebarProvider.
 *
 * On phones (below md) it is a compact app bar: mark, the page title, search, clock and the user menu. The sidebar
 * trigger, apps switcher, quick task, bell and theme move to the bottom bar and its Menu (components/mobile-nav.tsx).
 * It also pads itself below the status bar of the installed iPhone app.
 */
export function AppHeader({
  user,
  apps,
  perms,
  visible,
  withSidebar = false,
  punch,
  bell,
}: {
  user: { name: string; email: string; role: Role };
  /** Every app the user may open (drives search). */
  apps: AppKey[];
  /** Extra permissions (Accountant) for the pages search offers. */
  perms?: NavPerms;
  /** Apps shown in the switcher, in order. */
  visible: string[];
  withSidebar?: boolean;
  /** Punch state for the clock; left out, no clock is shown. */
  punch?: PunchProps;
  /** The bell's first load (later updates come live and from re-reads). */
  bell?: BellData;
}) {
  const switcher = APPS.filter((a) => visible.includes(a.key));
  const pathname = usePathname();
  const title = pageTitle(pathname);
  return (
    <header className="sticky top-0 z-10 flex h-(--header-h) items-center gap-1 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-2 sm:px-3">
      {withSidebar && <SidebarTrigger className="max-md:hidden" />}
      <Link href="/" data-punch-allow className="flex min-w-0 items-center gap-2 rounded-md px-1 font-semibold tracking-tight">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
          Z
        </span>
        <span className="hidden md:inline">Zeronix</span>
        <span className="truncate md:hidden">{title}</span>
      </Link>

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Switch app" className="max-md:hidden" />}>
          <LayoutGrid />
          <span className="hidden lg:inline">Apps</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-1 p-2">
          <div className="grid grid-cols-3 gap-1">
            {switcher.map((a) =>
              a.status === "live" ? (
                <Link
                  key={a.key}
                  href={a.href}
                  className="grid justify-items-center gap-1 rounded-md px-1 py-2 text-xs hover:bg-muted"
                >
                  <span
                    className="flex size-9 items-center justify-center rounded-lg text-white"
                    style={{ background: a.color }}
                  >
                    <a.icon className="size-5" />
                  </span>
                  {a.label}
                </Link>
              ) : (
                <span
                  key={a.key}
                  title="Coming soon"
                  className="grid justify-items-center gap-1 rounded-md px-1 py-2 text-xs text-muted-foreground opacity-50"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <a.icon className="size-5" />
                  </span>
                  {a.label}
                </span>
              ),
            )}
          </div>
          <Link href="/" className="rounded-md px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted">
            Home
          </Link>
        </PopoverContent>
      </Popover>

      <GlobalSearch apps={apps} perms={perms} />
      <div className="flex-1" />
      {pathname.startsWith("/accounts") && <NewMenu />}
      {punch && <HeaderClock {...punch} />}
      {apps.includes("tasks") && (
        <span className="contents max-md:hidden">
          <QuickAddTask />
        </span>
      )}
      <span className="contents max-md:hidden">
        <NotificationBell initial={bell} />
      </span>
      <span data-punch-allow className="contents max-md:hidden">
        <ThemeToggle />
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger data-punch-allow render={<Button variant="ghost" size="sm" aria-label="Your account" className="max-md:size-10 max-md:px-0" />}>
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium md:size-6">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate lg:inline">{user.name.split(" ")[0]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground max-md:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="grid gap-0.5 py-1.5">
              <span className="text-sm font-medium text-foreground">{user.name}</span>
              <span className="truncate font-normal">{user.email}</span>
              <span className="font-normal capitalize">{user.role}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <UserCog /> My account and mailbox
          </DropdownMenuItem>
          <form action={logout}>
            <DropdownMenuItem render={<button type="submit" className="w-full" />}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/** What the phone header calls the page: the sidebar page you are on, the app (on its overview), or the screen. */
function pageTitle(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return "Notifications";
  if (pathname === "/account" || pathname.startsWith("/account/")) return "My account";
  const app = appOfPath(pathname);
  if (!app) return "Zeronix";
  const under = (base: string) => pathname.startsWith(base + "/");
  const item = navFor(app.key as AppKey, { accountant: true })
    .flatMap((g) => g.items)
    .find((n) => pathname === n.href || (!n.exact && under(n.href)) || !!n.also?.some(under));
  return item && !item.exact ? item.label : app.label;
}
