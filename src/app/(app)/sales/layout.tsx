import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireApp } from "@/lib/auth/session";

export default async function SalesLayout({ children }: LayoutProps<"/sales">) {
  await requireApp("sales");
  // collapsed to icons until the person opens it; their choice is remembered in the sidebar's cookie
  const open = (await cookies()).get("sidebar_state")?.value === "true";
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar app="sales" />
      <SidebarInset>
        <PortalHeader withSidebar />
        <div className="mx-auto w-full min-w-0 max-w-[1800px] flex-1 p-3 md:p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
