import { AlertTriangle, ArrowRight, Bell, Inbox, ListChecks, Target, TrendingDown, Lightbulb } from "lucide-react";
import Link from "next/link";
import { Empty, Kpi } from "@/components/stat-tile";
import { TaskItem } from "@/components/task-ui";
import { Trend } from "@/components/trend";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ago, money } from "@/lib/format";
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

const SOON = {
  emails: { icon: Inbox, title: "Latest emails", text: "Your newest emails will show here." },
  pipeline: { icon: Target, title: "Pipeline", text: "Deals by stage will show here." },
  tip: { icon: Lightbulb, title: "Tip of the day", text: "A sales or hardware tip will show here." },
} as const;

/** A widget whose app is not built yet. Shown to admins only, so everyone can see where it will go. */
export function SoonCard({ kind }: { kind: keyof typeof SOON }) {
  const s = SOON[kind];
  return (
    <Card className="border-dashed opacity-60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <s.icon className="size-4" /> {s.title}
        </CardTitle>
        <CardDescription>Coming soon. {s.text}</CardDescription>
      </CardHeader>
    </Card>
  );
}
