import { Quote } from "lucide-react";
import { Suspense } from "react";
import { AppTile } from "@/components/app-tile";
import { accountsBadges } from "@/lib/accounts-data";
import { listCounts } from "@/lib/alerts";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";
import { dubaiDateLabel, dubaiGreeting } from "@/lib/home";
import { unreadTotal } from "@/lib/chat/channels";
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
  const { user, apps, seesAll, finance } = await requireAccess();
  const tiles = visibleApps({ role: user.role, apps });
  const hasProcurement = apps.includes("procurement");
  const hasSales = apps.includes("crm");
  const hasTasks = apps.includes("tasks");
  const hasMail = apps.includes("mail");

  // a few cheap numbers for the badges on the tiles
  const [toReview, newDeals, dueTasks, mailUnread, overdueInvoices, chatUnread] = await Promise.all([
    hasProcurement ? listCounts().then((c) => c.review + c.failed) : 0,
    hasSales ? salesPulse(user.id, seesAll).then((p) => p.newCount) : 0,
    hasTasks ? dueTasksFor(user.id).then((d) => d.tasks.length) : 0,
    hasMail ? unreadCount(user.id) : 0,
    finance ? accountsBadges().then((b) => b.overdue) : 0,
    unreadTotal(user.id),
  ]);
  const badges: Record<string, { n: number; label: string }> = {
    procurement: { n: toReview, label: `${toReview} to review` },
    sales: { n: newDeals, label: `${newDeals} new deal${newDeals === 1 ? "" : "s"}` },
    tasks: { n: dueTasks, label: `${dueTasks} due today` },
    mail: { n: mailUnread, label: `${mailUnread} unread` },
    chat: { n: chatUnread, label: `${chatUnread} unread message${chatUnread === 1 ? "" : "s"}` },
    accounts: { n: overdueInvoices, label: `${overdueInvoices} invoice${overdueInvoices === 1 ? "" : "s"} overdue` },
  };

  return (
    <div className="grid gap-4 md:gap-6">
      {/* one compact row: greeting and date, the quote of the day beside it (below it on a phone). Punching in and out
          lives in the header clock on every page, so it is not repeated here. */}
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            {dubaiGreeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="text-xs text-muted-foreground md:text-sm">{dubaiDateLabel()}</p>
        </div>
        <figure className="flex max-w-md items-start gap-2 text-xs text-muted-foreground md:text-right">
          <Quote className="mt-0.5 size-3.5 shrink-0 md:order-last" aria-hidden />
          <blockquote className="italic">{quoteOfTheDay()}</blockquote>
        </figure>
      </header>

      {/* phones: a launcher grid of icons, like a phone home screen; wider screens: small one-row tiles */}
      <section aria-label="Apps" className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((a) => (
          <AppTile key={a.key} app={a} badge={badges[a.key]?.n} badgeLabel={badges[a.key]?.label} />
        ))}
      </section>

      {(hasSales || hasProcurement) && (
        <section className="grid gap-2 md:gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
          {hasSales && (
            <Suspense fallback={<WidgetSkeleton className="h-24" />}>
              <ThisWeekSales userId={user.id} team={seesAll} />
            </Suspense>
          )}
          {hasProcurement && (
            <Suspense fallback={<WidgetSkeleton className="h-24" />}>
              <ThisWeekProcurement />
            </Suspense>
          )}
        </section>
      )}

      <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
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
            <PipelineCard userId={user.id} team={seesAll} />
          </Suspense>
        )}
        {hasSales && (
          <Suspense fallback={<WidgetSkeleton />}>
            <DealsAttentionCard userId={user.id} team={seesAll} />
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
