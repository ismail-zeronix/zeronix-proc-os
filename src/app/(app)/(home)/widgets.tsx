import { AlertTriangle, ArrowRight, Bell, Inbox, ListChecks, Target, TrendingDown, Lightbulb } from "lucide-react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Empty, Kpi } from "@/components/stat-tile";
import { TaskItem } from "@/components/task-ui";
import { Trend } from "@/components/trend";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { articleBySlug, tipOfTheDay } from "@/content/knowledge";
import { db, schema } from "@/db";
import { ago, money } from "@/lib/format";
import { aed, OPEN_STAGES } from "@/lib/sales";
import { salesPulse } from "@/lib/sales-data";
import { procurementPulse } from "@/lib/home";
import { dueTasksFor } from "@/lib/tasks";

/** Placeholder while a widget's data loads. */
export function WidgetSkeleton({ className = "h-40" }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />;
}

/** "This week" numbers from Procurement. Sales numbers join this row when the Sales app exists. */
export async function ThisWeekProcurement() {
  const { counts, moves, quiet } = await procurementPulse();
  const drops = moves.filter((m) => m.changePct < 0).length;
  const rises = moves.length - drops;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Price lists to review"
        value={counts.review}
        hint={counts.failed ? `${counts.failed} failed` : `${counts.reading} being read`}
        href="/procurement/price-lists?status=review"
      />
      <Kpi label="Price drops" value={drops} hint="in the last 7 days" href="/procurement/alerts" />
      <Kpi label="Price rises" value={rises} hint="in the last 7 days" href="/procurement/alerts" />
      <Kpi
        label="Suppliers gone quiet"
        value={quiet.length}
        hint={quiet.length ? "no recent list" : "all sent recently"}
        href="/procurement/suppliers"
      />
    </div>
  );
}

/** The newest emails in my own mailbox (sender, subject, time). Everyone sees only their own. */
export async function LatestEmailsCard({ userId }: { userId: number }) {
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, userId));
  const messages = acc
    ? await db
        .select()
        .from(schema.mailMessages)
        .where(eq(schema.mailMessages.userId, userId))
        .orderBy(desc(schema.mailMessages.receivedAt))
        .limit(5)
    : [];
  const unread = messages.filter((m) => !m.seen).length;
  const problem = acc && (!acc.enabled || acc.lastStatus === "error");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="size-4" /> Latest emails
        </CardTitle>
        <CardDescription>
          {!acc
            ? "Connect your mailbox to see your newest emails here."
            : problem
              ? "Your mailbox needs attention."
              : unread
                ? `${unread} unread of the latest ${messages.length}`
                : "No unread emails in the latest few."}
        </CardDescription>
        <CardAction>
          {acc && !problem ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/mail" />}>
              Open inbox <ArrowRight />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/account" />}>
              {acc ? "Fix" : "Connect"} <ArrowRight />
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-0.5">
        {problem && <Empty>{acc.lastError || "Paused."} Open My account to reconnect.</Empty>}
        {!problem &&
          messages.map((m) => (
            <Link
              key={m.id}
              href={`/mail/${m.uid}`}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-primary"}`} aria-label={m.seen ? "read" : "unread"} />
                <div className="min-w-0">
                  <div className={`truncate text-sm ${m.seen ? "" : "font-semibold"}`}>{m.fromName || m.fromEmail || "Unknown sender"}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.subject || "(no subject)"}</div>
                </div>
              </div>
              <span className="text-xs whitespace-nowrap text-muted-foreground">{ago(m.receivedAt)}</span>
            </Link>
          ))}
        {acc && !problem && !messages.length && <Empty>The inbox is empty, or the first check has not run yet.</Empty>}
      </CardContent>
    </Card>
  );
}

/** One tip from the Knowledge articles, the same for everybody today. */
export function TipCard() {
  const tip = tipOfTheDay();
  const article = articleBySlug(tip.slug);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-4" /> Tip of the day
        </CardTitle>
        <CardDescription>{tip.text}</CardDescription>
        {article && (
          <CardAction>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/knowledge/${article.slug}`} />}>
              Read more <ArrowRight />
            </Button>
          </CardAction>
        )}
      </CardHeader>
    </Card>
  );
}

/** Open tasks assigned to me that are due today or overdue. */
export async function MyTasksCard({ userId }: { userId: number }) {
  const { tasks, overdue } = await dueTasksFor(userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4" /> My tasks today
        </CardTitle>
        <CardDescription>
          {tasks.length === 0 ? "Nothing due today." : overdue ? `${tasks.length} due, ${overdue} overdue` : `${tasks.length} due today`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/tasks" />}>
            All tasks <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-0.5">
        {tasks.slice(0, 6).map((t) => (
          <TaskItem key={t.id} task={t} compact />
        ))}
        {tasks.length > 6 && (
          <Link href="/tasks" className="px-2 py-1 text-xs text-muted-foreground hover:underline">
            + {tasks.length - 6} more
          </Link>
        )}
        {!tasks.length && (
          <Empty>
            You are clear.{" "}
            <Link href="/tasks" className="underline">
              Add a task
            </Link>{" "}
            to plan the day.
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

export async function PriceMovesCard() {
  const { moves } = await procurementPulse();
  const drops = moves.filter((m) => m.changePct < 0);
  const rises = moves.filter((m) => m.changePct > 0);
  const best = drops.filter((m) => m.isBest);
  const list = [...best, ...drops.filter((m) => !m.isBest), ...rises].slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="size-4" /> Price moves this week
        </CardTitle>
        <CardDescription>
          {best.length ? `${best.length} drop${best.length === 1 ? " is" : "s are"} now the cheapest in the market.` : "Against each supplier's previous quote."}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/procurement/alerts" />}>
            All <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1">
        {list.map((m) => (
          <Link
            key={`${m.productId}-${m.supplierId}`}
            href={`/procurement/products/${m.productId}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{m.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {m.supplierName}
                {m.isBest && " · now cheapest"}
              </div>
            </div>
            <div className="text-right whitespace-nowrap">
              <div className="text-sm font-semibold tabular-nums">{money(m.price, m.currency)}</div>
              <Trend price={m.price} prevPrice={m.prevPrice} />
            </div>
          </Link>
        ))}
        {!list.length && <Empty>No price changes in the last 7 days.</Empty>}
      </CardContent>
    </Card>
  );
}

export async function AttentionCard() {
  const { counts, quiet, staleDays } = await procurementPulse();
  const waiting = counts.review + counts.failed + counts.reading;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4" /> Needs your attention
        </CardTitle>
        <CardDescription>
          {waiting === 0
            ? "No price lists waiting."
            : `${counts.review} to review · ${counts.reading} being read · ${counts.failed} failed`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/procurement" />}>
            Overview <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1">
        {quiet.slice(0, 5).map((s) => (
          <Link
            key={s.id}
            href={`/procurement/suppliers/${s.id}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Bell className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {s.lastList ? `last list ${ago(s.lastList)}` : "no list yet"}
            </span>
          </Link>
        ))}
        {!quiet.length && <Empty>Every active supplier sent a list within {staleDays} days.</Empty>}
      </CardContent>
    </Card>
  );
}

/** Sales numbers for this week: the whole team for admins, your own deals for everybody else. */
export async function ThisWeekSales({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const p = await salesPulse(userId, isAdmin);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="New enquiries" value={p.newThisWeek} hint={`this week · ${p.scope}`} href="/sales" />
      <Kpi label="Open deals" value={p.openCount} hint={aed(p.openValue)} href="/sales" />
      <Kpi label="Waiting for an answer" value={p.quotedCount} hint="quote sent" href="/sales" />
      <Kpi label="Won this week" value={p.wonCount} hint={aed(p.wonValue)} href="/sales?view=list&stage=won" />
    </div>
  );
}

/** Open deals by stage as simple bars. */
export async function PipelineCard({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const p = await salesPulse(userId, isAdmin);
  const max = Math.max(1, ...p.stages.map((s) => s.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" /> Pipeline
        </CardTitle>
        <CardDescription>
          {p.openCount} open deal{p.openCount === 1 ? "" : "s"} · {aed(p.openValue)} · {p.scope}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/sales" />}>
            Open <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {OPEN_STAGES.map((s) => {
          const row = p.stages.find((x) => x.stage === s.key);
          const n = row?.count ?? 0;
          return (
            <div key={s.key} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-muted-foreground">{s.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums">{n}</span>
            </div>
          );
        })}
        {p.openCount === 0 && (
          <Empty>
            No open deals.{" "}
            <Link href="/sales/new" className="underline">
              Add an enquiry
            </Link>
            .
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

/** Open deals that have gone quiet. */
export async function DealsAttentionCard({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const p = await salesPulse(userId, isAdmin);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4" /> Deals going quiet
        </CardTitle>
        <CardDescription>
          {p.attention.length ? "Nothing logged for 3 days or more. A call or a follow-up keeps them alive." : "Every open deal has had some activity in the last 3 days."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {p.attention.map((a) => (
          <Link key={a.id} href={`/sales/deals/${a.id}`} className="rounded-md px-2 py-2 hover:bg-muted">
            <div className="truncate text-sm font-medium">{a.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {a.companyName} · {a.reason}
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

