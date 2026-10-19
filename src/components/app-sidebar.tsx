"use client";

import {
  Bell,
  ClipboardPaste,
  History,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Search,
  Settings,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/login/actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth/token";

export interface NavBadges {
  /** Price lists waiting for a person to check them. */
  review: number;
  /** Price lists the AI could not read. */
  failed: number;
  /** Price changes in the last week. */
  alerts: number;
}

type Item = { href: string; label: string; icon: typeof Search; badge?: keyof NavBadges };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/compare", label: "Compare prices", icon: Search },
      { href: "/import", label: "Paste price list", icon: ClipboardPaste },
    ],
  },
  {
    label: "Track",
    items: [
      { href: "/alerts", label: "Price alerts", icon: Bell, badge: "alerts" },
      { href: "/price-lists", label: "Price lists", icon: History, badge: "review" },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
    ],
  },
];

export function AppSidebar({ user, badges }: { user: SessionUser; badges: NavBadges }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups =
    user.role === "admin"
      ? [...GROUPS, { label: "Manage", items: [{ href: "/admin", label: "Admin", icon: Settings }] as Item[] }]
      : GROUPS;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <PackageSearch className="size-4" />
              </div>
              <div className="grid leading-tight">
                <span className="font-semibold">Zeronix</span>
                <span className="text-xs text-muted-foreground">Procurement</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((n) => {
                  const count = n.badge ? badges[n.badge] : 0;
                  return (
                    <SidebarMenuItem key={n.href}>
                      <SidebarMenuButton
                        isActive={active(n.href)}
                        tooltip={n.label}
                        render={<Link href={n.href} onClick={() => isMobile && setOpenMobile(false)} />}
                      >
                        <n.icon />
                        <span>{n.label}</span>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${count} ${n.badge === "review" ? "waiting for review" : "new"}`}
                          className={n.badge === "review" ? "bg-primary text-primary-foreground" : ""}
                        >
                          {count > 99 ? "99+" : count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="truncate px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {user.name} · {user.role}
            </div>
            <form action={logout}>
              <SidebarMenuButton type="submit" tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
