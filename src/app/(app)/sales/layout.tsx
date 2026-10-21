import { AppSidebar } from "@/components/app-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireApp } from "@/lib/auth/session";

export default async function SalesLayout({ children }: LayoutProps<"/sales">) {
  await requireApp("sales");
  return (
    <SidebarProvider>
      <AppSidebar app="sales" />
      <SidebarInset>
        <PortalHeader withSidebar />
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
