import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { getBrand } from "@/lib/brand";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { NavPerms } from "@/lib/app-nav";
import type { AppKey } from "@/lib/apps";

/**
 * The frame of an app that has a sidebar: header, collapsed-by-default sidebar (the choice is remembered in the
 * sidebar's cookie) and tight page padding. Every app with a sidebar uses this so they all behave the same.
 */
export async function AppShell({
  app,
  badges,
  perms,
  fill = false,
  children,
}: {
  app: AppKey;
  badges?: Record<string, number>;
  /** Extra permissions that show hidden sidebar groups (Accounts › Accountant). */
  perms?: NavPerms;
  /** The page fills the screen below the header and scrolls inside itself (Chat), instead of the page scrolling. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const [open, brand] = await Promise.all([(async () => (await cookies()).get("sidebar_state")?.value === "true")(), getBrand()]);
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar app={app} badges={badges} perms={perms} orgName={brand.company} />
      <SidebarInset className={fill ? "h-svh overflow-hidden pb-(--mobile-nav-h)" : undefined}>
        <PortalHeader withSidebar />
        {fill ? (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col p-2 md:p-3">{children}</div>
        ) : (
          // bottom padding keeps the last row of every page clear of the round chat button (desktop) or the bottom bar (phones)
          <div className="mx-auto w-full min-w-0 max-w-[1800px] flex-1 p-3 pb-[calc(var(--mobile-nav-h)+1rem)] md:p-4 md:pb-20">{children}</div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
