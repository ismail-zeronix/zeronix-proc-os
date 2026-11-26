import { Quote } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { MyDaySection, NowLine } from "./my-day";
import { AppTile } from "@/components/app-tile";
import { accountsBadges } from "@/lib/accounts-data";
import { listCounts } from "@/lib/alerts";
import { TENANT_BLURBS, visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";
import { zeronixFeatures } from "@/lib/edition";
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
import { GettingStarted } from "./getting-started";

export const metadata = { title: "Home · Zeronix" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { user, apps, seesAll, finance } = await requireAccess();
  // the SaaS install words two tiles without their Zeronix-only parts (lib/apps.ts TENANT_BLURBS)
  const tiles = visibleApps({ role: user.role, apps }).map((a) => (zeronixFeatures() ? a : { ...a, blurb: TENANT_BLURBS[a.key] ?? a.blurb }));
  const hasProcurement = apps.includes("procurement");
  const hasSales = apps.includes("crm");
  const hasTasks = apps.includes("tasks");
  const hasMail = apps.includes("mail");
  // salesmen open on My day, admins on the overview; either can switch. My day is part of Zeronix's sales routine
  // (lib/edition.ts): SaaS organisations get the overview only.
  const hasMyDay = hasSales && zeronixFeatures();
  const view = (await searchParams).view;
  const myDay = hasMyDay && (view === "day" || (view !== "overview" && user.role !== "admin"));

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

  const appTiles = (
    // phones: a launcher grid of icons, like a phone home screen; wider screens: small one-row tiles
    <section aria-label="Apps" className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 lg:grid-cols-4">
      {tiles.map((a) => (
        <AppTile key={a.key} app={a} badge={badges[a.key]?.n} badgeLabel={badges[a.key]?.label} />
      ))}
    </section>
  );
  const switcher = hasMyDay && (
    <nav aria-label="Home view" className="flex w-fit rounded-lg border p-0.5 text-xs">
      {[
        { key: "day", label: "My day", on: myDay },
        { key: "overview", label: "Overview", on: !myDay },
      ].map((v) => (
        <Link key={v.key} href={`/?view=${v.key}`} replace className={`rounded-md px-2.5 py-1 ${v.on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
          {v.label}
        </Link>
      ))}
    </nav>
  );
  const greeting = (
    <div className="min-w-0">
      <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
        {dubaiGreeting()}, {user.name.split(" ")[0]}
      </h1>
      <p className="text-xs text-muted-foreground md:text-sm">{dubaiDateLabel()}</p>
    </div>
  );

  if (myDay) {
    return (
      <div className="grid gap-3 md:gap-4">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-6">
          {greeting}
          <div className="flex flex-col gap-1.5 md:items-end">
            {switcher}
            <NowLine />
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <Suspense fallback={<WidgetSkeleton className="h-96" />}>
              <MyDaySection userId={user.id} coldCalls />
            </Suspense>
          </div>
          <aside className="grid gap-3">
            {hasTasks && (
              <Suspense fallback={<WidgetSkeleton />}>
                <MyTasksCard userId={user.id} />
              </Suspense>
            )}
            {hasMail && (
              <Suspense fallback={<WidgetSkeleton />}>
                <LatestEmailsCard userId={user.id} />
              </Suspense>
            )}
          </aside>
        </div>
        {appTiles}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:gap-6">
      {/* one compact row: greeting and date, the quote of the day beside it (below it on a phone). Punching in and out
          lives in the header clock on every page, so it is not repeated here. */}
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-6">
        {greeting}
        <div className="flex flex-col gap-1.5 md:items-end">
          {switcher}
          <figure className="flex max-w-md items-start gap-2 text-xs text-muted-foreground md:text-right">
            <Quote className="mt-0.5 size-3.5 shrink-0 md:order-last" aria-hidden />
            <blockquote className="italic">{quoteOfTheDay()}</blockquote>
          </figure>
        </div>
      </header>

      {/* a new company's admin: what its documents still need (goes away when everything is set) */}
      {user.role === "admin" && (
        <Suspense fallback={null}>
          <GettingStarted />
        </Suspense>
      )}

      {appTiles}

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
        {/* only with the Mail app: a SaaS company without it is never asked to connect a mailbox */}
        {hasMail && (
          <Suspense fallback={<WidgetSkeleton />}>
            <LatestEmailsCard userId={user.id} />
          </Suspense>
        )}
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
