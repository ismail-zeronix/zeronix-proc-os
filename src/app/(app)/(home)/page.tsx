import { Quote } from "lucide-react";
import { Suspense } from "react";
import { AppTile } from "@/components/app-tile";
import { PageHeader } from "@/components/page-header";
import { listCounts } from "@/lib/alerts";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";
import { dubaiDateLabel, dubaiGreeting } from "@/lib/home";
import { unreadCount } from "@/lib/mail/unread";
import { quoteOfTheDay } from "@/lib/quotes";
import { salesPulse } from "@/lib/sales-data";
import { dueTasksFor } from "@/lib/tasks";
import {
  AttentionCard,
  DealsAttentionCard,
  LatestEmailsCard,
  MyTasksCard,
  PipelineCard,
  PriceMovesCard,
  ThisWeekProcurement,
  ThisWeekSales,
  TipCard,
  WidgetSkeleton,
} from "./widgets";

export const metadata = { title: "Home · Zeronix" };

export default async function HomePage() {
  const { user, apps } = await requireAccess();
  const tiles = visibleApps({ role: user.role, apps });
  const isAdmin = user.role === "admin";
  const hasProcurement = apps.includes("procurement");
  const hasSales = apps.includes("sales");
  const hasTasks = apps.includes("tasks");
  const hasMail = apps.includes("mail");

  // a few cheap numbers for the badges on the tiles
  const [toReview, newEnquiries, dueTasks, mailUnread] = await Promise.all([
    hasProcurement ? listCounts().then((c) => c.review + c.failed) : 0,
    hasSales ? salesPulse(user.id, isAdmin).then((p) => p.newCount) : 0,
    hasTasks ? dueTasksFor(user.id).then((d) => d.tasks.length) : 0,
    hasMail ? unreadCount(user.id) : 0,
  ]);
  const badges: Record<string, { n: number; label: string }> = {
    procurement: { n: toReview, label: `${toReview} to review` },
    sales: { n: newEnquiries, label: `${newEnquiries} new enquir${newEnquiries === 1 ? "y" : "ies"}` },
    tasks: { n: dueTasks, label: `${dueTasks} due today` },
    mail: { n: mailUnread, label: `${mailUnread} unread` },
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={`${dubaiGreeting()}, ${user.name.split(" ")[0]}`} description={dubaiDateLabel()} />

      <figure className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
        <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <blockquote className="text-sm">{quoteOfTheDay()}</blockquote>
      </figure>

      <section aria-label="Apps" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((a) => (
          <AppTile key={a.key} app={a} badge={badges[a.key]?.n} badgeLabel={badges[a.key]?.label} />
        ))}
      </section>

      {(hasSales || hasProcurement) && (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
          {hasSales && (
            <Suspense fallback={<WidgetSkeleton className="h-24" />}>
              <ThisWeekSales userId={user.id} isAdmin={isAdmin} />
            </Suspense>
          )}
          {hasProcurement && (
            <Suspense fallback={<WidgetSkeleton className="h-24" />}>
              <ThisWeekProcurement />
            </Suspense>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {hasTasks && (
          <Suspense fallback={<WidgetSkeleton />}>
            <MyTasksCard userId={user.id} />
          </Suspense>
        )}
        <Suspense fallback={<WidgetSkeleton />}>
          <LatestEmailsCard userId={user.id} />
        </Suspense>
        {hasSales && (
          <Suspense fallback={<WidgetSkeleton />}>
            <PipelineCard userId={user.id} isAdmin={isAdmin} />
          </Suspense>
        )}
        {hasSales && (
          <Suspense fallback={<WidgetSkeleton />}>
            <DealsAttentionCard userId={user.id} isAdmin={isAdmin} />
          </Suspense>
        )}
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
        {apps.includes("knowledge") && <TipCard />}
      </div>
    </div>
  );
}
