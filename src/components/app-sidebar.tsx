"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
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
import { APP_NAV, BADGE_LABELS, type NavItem } from "@/lib/app-nav";
import { appByKey, type AppKey } from "@/lib/apps";

/** The left menu of one app. Pages come from lib/app-nav.ts; `badges` maps a badge name to its number. */
export function AppSidebar({ app, badges = {} }: { app: AppKey; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const def = appByKey(app);
  const groups = APP_NAV[app] ?? [];
  const close = () => isMobile && setOpenMobile(false);
  const active = (n: NavItem) =>
    n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={def.href} onClick={close} />}>
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: def.color }}
              >
                <def.icon className="size-4" />
              </div>
              <div className="grid leading-tight">
                <span className="font-semibold">{def.label}</span>
                <span className="text-xs text-muted-foreground">Zeronix</span>
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
                  const count = n.badge ? (badges[n.badge] ?? 0) : 0;
                  return (
                    <SidebarMenuItem key={n.href}>
                      <SidebarMenuButton
                        isActive={active(n)}
                        tooltip={n.label}
                        render={<Link href={n.href} onClick={close} />}
                      >
                        <n.icon />
                        <span>{n.label}</span>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${count} ${BADGE_LABELS[n.badge!] ?? "new"}`}
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
    </Sidebar>
  );
}
