import { AppShell } from "@/components/app-shell";
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
    <AppShell app="procurement" badges={{ review: counts.review, failed: counts.failed, alerts: moves.length }}>
      {children}
    </AppShell>
  );
}
