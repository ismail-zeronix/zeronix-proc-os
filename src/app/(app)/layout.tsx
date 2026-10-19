import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { listCounts, priceMoves } from "@/lib/alerts";
import { requireUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const [counts, moves] = await Promise.all([
    listCounts(),
    priceMoves({ withinDays: 7, staleDays, limit: 100 }),
  ]);
  return (
    <SidebarProvider>
      <AppSidebar user={user} badges={{ review: counts.review, failed: counts.failed, alerts: moves.length }} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <SidebarTrigger />
          <GlobalSearch />
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
