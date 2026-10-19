import { desc, eq, sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Bell, ClipboardPaste, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, schema } from "@/db";
import { listCounts, priceMoves, quietSuppliers } from "@/lib/alerts";
import { requireUser } from "@/lib/auth/session";
import { ago, money } from "@/lib/format";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Dashboard · Zeronix Procurement" };

export default async function DashboardPage() {
  const user = await requireUser();
  const staleDays = Number(await getSetting("stale_days")) || 14;

  const [counts, moves, quiet, stats, waiting, recent] = await Promise.all([
    listCounts(),
    priceMoves({ withinDays: 7, staleDays, limit: 100 }),
    quietSuppliers(staleDays),
    db
      .execute<{ offers: number; products: number; suppliers: number; compared: number }>(
        sql`SELECT count(*)::int AS offers, count(DISTINCT product_id)::int AS products,
              count(DISTINCT supplier_id)::int AS suppliers,
              (SELECT count(*)::int FROM (
                 SELECT product_id FROM offers WHERE received_at > now() - make_interval(days => ${staleDays})
                 GROUP BY product_id HAVING count(DISTINCT supplier_id) > 1) c) AS compared
            FROM offers`,
      )
      .then((r) => r.rows[0]),
    db
      .select({
        id: schema.priceLists.id,
        status: schema.priceLists.status,
        supplier: schema.suppliers.name,
        receivedAt: schema.priceLists.receivedAt,
        progressDone: schema.priceLists.progressDone,
        progressTotal: schema.priceLists.progressTotal,
        error: schema.priceLists.error,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .where(sql`${schema.priceLists.status} <> 'saved'`)
      .orderBy(desc(schema.priceLists.createdAt))
      .limit(6),
    db
      .select({
        id: schema.priceLists.id,
        supplier: schema.suppliers.name,
        receivedAt: schema.priceLists.receivedAt,
        offers: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.price_list_id = ${schema.priceLists.id})`,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .where(eq(schema.priceLists.status, "saved"))
      .orderBy(desc(schema.priceLists.receivedAt))
      .limit(5),
  ]);

  const drops = moves.filter((m) => m.changePct < 0);
  const rises = moves.filter((m) => m.changePct > 0);
  const bestNow = drops.filter((m) => m.isBest);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description="What needs you today, and what changed in supplier prices."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/compare" />}>
              <Search /> Compare prices
            </Button>
            <Button nativeButton={false} render={<Link href="/import" />}>
              <ClipboardPaste /> Paste price list
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Products tracked" value={stats.products} hint={`${stats.offers} offers`} />
        <Kpi label="Suppliers" value={stats.suppliers} hint={quiet.length ? `${quiet.length} gone quiet` : "all sent recently"} />
        <Kpi label="Compared across suppliers" value={stats.compared} hint={`quoted by 2+ suppliers in ${staleDays} days`} />
        <Kpi label="Price changes this week" value={moves.length} hint={`${drops.length} down · ${rises.length} up`} href="/alerts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4" /> Needs your attention
            </CardTitle>
            <CardDescription>
              {counts.review + counts.failed + counts.reading === 0
                ? "Nothing waiting. New lists show up here while the AI reads them."
                : `${counts.review} to review · ${counts.reading} being read · ${counts.failed} failed`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {waiting.map((w) => (
              <Link
                key={w.id}
                href={`/import/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{w.supplier}</div>
                  <div className="text-xs text-muted-foreground">
                    list #{w.id} · {ago(w.receivedAt)}
                    {w.status === "failed" && w.error ? ` · ${w.error.slice(0, 60)}` : ""}
                  </div>
                </div>
                {w.status === "review" && <Badge>Review</Badge>}
                {w.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                {(w.status === "queued" || w.status === "parsing") && (
                  <Badge variant="secondary">
                    <Loader2 className="animate-spin" />
                    {w.status === "parsing" && w.progressTotal ? `${w.progressDone}/${w.progressTotal}` : "Queued"}
                  </Badge>
                )}
              </Link>
            ))}
            {!waiting.length && (
              <Empty>
                All caught up.{" "}
                <Link href="/import" className="underline">
                  Paste a list
                </Link>{" "}
                when a supplier sends one.
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4" /> Suppliers gone quiet
            </CardTitle>
            <CardDescription>No saved list for more than {staleDays} days, so their prices are marked old.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {quiet.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/suppliers/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {s.lastList ? `last list ${ago(s.lastList)}` : "no list yet"}
                </span>
              </Link>
            ))}
            {!quiet.length && <Empty>Every active supplier sent a list within {staleDays} days.</Empty>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price moves this week</CardTitle>
          <CardDescription>
            Compared with the same supplier&apos;s previous quote.
            {bestNow.length ? ` ${bestNow.length} of the drops are now the cheapest in the market.` : ""}
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/alerts" />}>
              All alerts <ArrowRight />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          {[...bestNow, ...drops.filter((m) => !m.isBest), ...rises].slice(0, 8).map((m) => (
            <Link
              key={`${m.productId}-${m.supplierId}`}
              href={`/products/${m.productId}`}
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
          {!moves.length && <Empty className="md:col-span-2">No price changes in the last 7 days.</Empty>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest saved lists</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {recent.map((r) => (
            <Link
              key={r.id}
              href={`/import/${r.id}`}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
            >
              <span className="truncate text-sm font-medium">{r.supplier}</span>
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {r.offers} offer{r.offers === 1 ? "" : "s"} · {ago(r.receivedAt)}
              </span>
            </Link>
          ))}
          {!recent.length && <Empty>No saved lists yet.</Empty>}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, href }: { label: string; value: number; hint: string; href?: string }) {
  const body = (
    <Card className="h-full gap-1 py-4">
      <CardContent className="grid gap-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tracking-tight">{value.toLocaleString("en-US")}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    body
  );
}

function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`px-2 py-3 text-sm text-muted-foreground ${className ?? ""}`}>{children}</p>;
}
