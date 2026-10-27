"use client";

import { ChevronDown, LayoutGrid, LogOut, UserCog } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { HeaderClock } from "@/components/attendance/header-clock";
import type { PunchProps } from "@/components/attendance/punch-toggle";
import { GlobalSearch } from "@/components/global-search";
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
import { APPS, type AppKey, type Role } from "@/lib/apps";

/**
 * The bar on every page: brand (home), apps switcher, search, theme and the user menu.
 * `withSidebar` must be true only inside an app layout that has a SidebarProvider.
 */
export function AppHeader({
  user,
  apps,
  visible,
  withSidebar = false,
  punch,
}: {
  user: { name: string; email: string; role: Role };
  /** Every app the user may open (drives search). */
  apps: AppKey[];
  /** Apps shown in the switcher, in order. */
  visible: string[];
  withSidebar?: boolean;
  /** Punch state for the clock; left out, no clock is shown. */
  punch?: PunchProps;
}) {
  const switcher = APPS.filter((a) => visible.includes(a.key));
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
      {withSidebar && <SidebarTrigger />}
      <Link
        href="/"
        data-punch-allow
        className={`items-center gap-2 rounded-md px-1 font-semibold tracking-tight ${withSidebar ? "hidden sm:flex" : "flex"}`}
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
          Z
        </span>
        <span className="hidden sm:inline">Zeronix</span>
      </Link>

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Switch app" />}>
          <LayoutGrid />
          <span className="hidden sm:inline">Apps</span>
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

      <GlobalSearch apps={apps} />
      <div className="flex-1" />
      {punch && <HeaderClock {...punch} />}
      {apps.includes("tasks") && <QuickAddTask />}
      <span data-punch-allow className="contents">
        <ThemeToggle />
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger data-punch-allow render={<Button variant="ghost" size="sm" />}>
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{user.name.split(" ")[0]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
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
