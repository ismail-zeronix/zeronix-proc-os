import { Quote } from "lucide-react";
import { Suspense } from "react";
import { AppTile } from "@/components/app-tile";
import { PageHeader } from "@/components/page-header";
import { listCounts } from "@/lib/alerts";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";
import { dubaiDateLabel, dubaiGreeting } from "@/lib/home";
import { quoteOfTheDay } from "@/lib/quotes";
import { AttentionCard, PriceMovesCard, SoonCard, ThisWeekProcurement, WidgetSkeleton } from "./widgets";

export const metadata = { title: "Home · Zeronix" };

export default async function HomePage() {
  const { user, apps } = await requireAccess();
  const tiles = visibleApps({ role: user.role, apps });
  const isAdmin = user.role === "admin";
  const hasProcurement = apps.includes("procurement");
  // one cheap count query: the number on the Procurement tile
  const toReview = hasProcurement ? await listCounts().then((c) => c.review + c.failed) : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${dubaiGreeting()}, ${user.name.split(" ")[0]}`}
        description={dubaiDateLabel()}
      />

      <figure className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
        <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <blockquote className="text-sm">{quoteOfTheDay()}</blockquote>
      </figure>

      <section aria-label="Apps" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((a) => (
          <AppTile
            key={a.key}
            app={a}
            badge={a.key === "procurement" ? toReview : undefined}
            badgeLabel={a.key === "procurement" ? `${toReview} to review` : undefined}
          />
        ))}
      </section>

      {hasProcurement && (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
          <Suspense fallback={<WidgetSkeleton className="h-24" />}>
            <ThisWeekProcurement />
          </Suspense>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {isAdmin && <SoonCard kind="tasks" />}
        {isAdmin && <SoonCard kind="emails" />}
        {hasProcurement && (
          <Suspense fallback={<WidgetSkeleton />}>
            <PriceMovesCard />
          </Suspense>
        )}
        {hasProcurement && (
          <Suspense fallback={<WidgetSkeleton />}>
            <AttentionCard />
          </Suspense>
        )}
        {isAdmin && <SoonCard kind="pipeline" />}
        {isAdmin && <SoonCard kind="tip" />}
      </div>
    </div>
  );
}
