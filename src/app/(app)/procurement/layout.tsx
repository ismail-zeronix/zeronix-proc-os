import { AppSidebar } from "@/components/app-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { listCounts, priceMoves } from "@/lib/alerts";
import { requireApp } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export default async function ProcurementLayout({ children }: LayoutProps<"/procurement">) {
  await requireApp("procurement");
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const [counts, moves] = await Promise.all([
    listCounts(),
    priceMoves({ withinDays: 7, staleDays, limit: 100 }),
  ]);
  return (
    <SidebarProvider>
      <AppSidebar app="procurement" badges={{ review: counts.review, failed: counts.failed, alerts: moves.length }} />
      <SidebarInset>
        <PortalHeader withSidebar />
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
