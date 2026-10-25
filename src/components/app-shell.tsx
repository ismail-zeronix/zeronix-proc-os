import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { AppKey } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";

/**
 * The frame of an app that has a sidebar: header, collapsed-by-default sidebar (the choice is remembered in the
 * sidebar's cookie) and tight page padding. Every app with a sidebar uses this so they all behave the same.
 */
export async function AppShell({ app, badges, children }: { app: AppKey; badges?: Record<string, number>; children: React.ReactNode }) {
  const open = (await cookies()).get("sidebar_state")?.value === "true";
  const { finance } = await requireAccess();
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar app={app} badges={badges} finance={finance} />
      <SidebarInset>
        <PortalHeader withSidebar />
        <div className="mx-auto w-full min-w-0 max-w-[1800px] flex-1 p-3 md:p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
