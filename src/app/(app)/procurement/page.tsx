import { AlertTriangle, ClipboardPaste, GitCompareArrows, Loader2, Package, Search, Tags, TrendingDown, Truck, Trophy } from "lucide-react";
import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { Delta, KpiTile } from "@/components/kpi-tile";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireApp } from "@/lib/auth/session";
import { ago, money } from "@/lib/format";
import { procurementOverview } from "@/lib/procurement-overview";

export const metadata = { title: "Procurement · Zeronix" };

const row = "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted";
const weekLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function ProcurementOverviewPage() {
  await requireApp("procurement");
  const o = await procurementOverview();
  const { counts, moves, quiet, stats, staleDays } = o;
  const drops = moves.filter((m) => m.changePct < 0);
  const rises = moves.filter((m) => m.changePct > 0);
  const bestNow = drops.filter((m) => m.isBest);
  const waitingCount = counts.review + counts.failed + counts.reading;
  const empty = stats.offers === 0;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Procurement overview</h1>
        <span className="text-xs text-muted-foreground">Prices older than {staleDays} days count as old</span>
        <span className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/procurement/compare" />}>
            <Search /> Compare
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/procurement/import" />}>
            <ClipboardPaste /> Paste list
          </Button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Products tracked" icon={<Package />} value={stats.products.toLocaleString("en-US")} hint={`${stats.offers.toLocaleString("en-US")} offers`} />
        <KpiTile
          label="Suppliers"
          icon={<Truck />}
          value={String(stats.suppliers)}
          hint={quiet.length ? `${quiet.length} gone quiet` : "all sent recently"}
        />
        <KpiTile label="Compared across suppliers" icon={<GitCompareArrows />} value={String(stats.compared)} hint={`quoted by 2+ suppliers in ${staleDays}d`} />
        <KpiTile
          label="Price changes, 7 days"
          icon={<TrendingDown />}
          value={String(moves.length)}
          hint={`${drops.length} down · ${rises.length} up${bestNow.length ? ` · ${bestNow.length} now cheapest` : ""}`}
        />
        <KpiTile
          label="Offers added, 7 days"
          icon={<Tags />}
          value={String(stats.week)}
          delta={<Delta cur={stats.week} prev={stats.prev_week} label="vs the week before" />}
        />
      </div>

      {empty ? (
        <div className="rounded-xl border bg-card py-12 text-center">
          <p className="font-medium">No prices yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Paste a supplier WhatsApp price list or upload a distributor Excel sheet to get started.</p>
          <Button nativeButton={false} render={<Link href="/procurement/import" />}>
            <ClipboardPaste /> Add a price list
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="rounded-xl border bg-card p-4 lg:col-span-2">
              <Tabs defaultValue={waitingCount ? "waiting" : quiet.length ? "quiet" : "recent"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="size-4 text-muted-foreground" /> Needs attention
                  </h2>
                  <TabsList>
                    <TabsTrigger value="waiting">Lists waiting ({waitingCount})</TabsTrigger>
                    <TabsTrigger value="quiet">Quiet suppliers ({quiet.length})</TabsTrigger>
                    <TabsTrigger value="recent">Recently saved</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="waiting" className="grid gap-0.5">
                  <p className="px-2 pb-1 text-xs text-muted-foreground">
                    {waitingCount ? `${counts.review} to review · ${counts.reading} being read · ${counts.failed} failed` : "Nothing waiting. New lists show up here while the AI reads them."}
                  </p>
                  {o.waiting.map((w) => (
                    <Link key={w.id} href={`/procurement/import/${w.id}`} className={row}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{w.supplier}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          list #{w.id} · {ago(w.receivedAt)}
                          {w.status === "failed" && w.error ? ` · ${w.error.slice(0, 70)}` : ""}
                        </span>
                      </span>
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
                </TabsContent>
                <TabsContent value="quiet" className="grid gap-0.5">
                  <p className="px-2 pb-1 text-xs text-muted-foreground">No saved list for more than {staleDays} days, so their prices are marked old.</p>
                  {quiet.slice(0, 10).map((s) => (
                    <Link key={s.id} href={`/procurement/suppliers/${s.id}`} className={row}>
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">{s.lastList ? `last list ${ago(s.lastList)}` : "no list yet"}</span>
                    </Link>
                  ))}
                  {!quiet.length && <p className="px-2 py-3 text-sm text-muted-foreground">Every active supplier sent a list within {staleDays} days.</p>}
                </TabsContent>
                <TabsContent value="recent" className="grid gap-0.5">
                  {o.recent.map((r) => (
                    <Link key={r.id} href={`/procurement/import/${r.id}`} className={row}>
                      <span className="truncate text-sm font-medium">{r.supplier}</span>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {r.offers} offer{r.offers === 1 ? "" : "s"} · {ago(r.receivedAt)}
                      </span>
                    </Link>
                  ))}
                  {!o.recent.length && <p className="px-2 py-3 text-sm text-muted-foreground">No saved lists yet.</p>}
                </TabsContent>
              </Tabs>
            </section>

            <HBarPanel
              title="Products quoted per supplier"
              hint="Fresh = quoted recently"
              views={[
                { key: "fresh", label: "Fresh", unit: "products", format: "count", empty: "No offers yet.", data: o.bySupplier.map((s) => ({ label: s.name, value: s.fresh, note: `${s.total} ever quoted` })) },
                { key: "all", label: "All time", unit: "products", format: "count", empty: "No offers yet.", data: [...o.bySupplier].sort((a, b) => b.total - a.total).map((s) => ({ label: s.name, value: s.total, note: `${s.fresh} still fresh` })) },
              ]}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <section className="rounded-xl border bg-card p-4 lg:col-span-2">
              <Tabs defaultValue={drops.length || !rises.length ? "drops" : "rises"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-medium">
                    <TrendingDown className="size-4 text-muted-foreground" /> Price moves this week
                  </h2>
                  <span className="flex items-center gap-2">
                    <TabsList>
                      <TabsTrigger value="drops">Drops ({drops.length})</TabsTrigger>
                      <TabsTrigger value="rises">Rises ({rises.length})</TabsTrigger>
                    </TabsList>
                    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/procurement/alerts" />}>
                      All alerts
                    </Button>
                  </span>
                </div>
                {([["drops", [...bestNow, ...drops.filter((m) => !m.isBest)]], ["rises", rises]] as const).map(([key, list]) => (
                  <TabsContent key={key} value={key} className="grid gap-0.5">
                    <p className="px-2 pb-1 text-xs text-muted-foreground">Compared with the same supplier&apos;s previous quote.</p>
                    {list.slice(0, 8).map((m) => (
                      <Link key={`${m.productId}-${m.supplierId}`} href={`/procurement/products/${m.productId}`} className={row}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {m.supplierName}
                            {m.isBest && key === "drops" && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                                <Trophy className="size-3" /> now cheapest
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="text-right whitespace-nowrap">
                          <span className="block text-sm font-semibold tabular-nums">{money(m.price, m.currency)}</span>
                          <Trend price={m.price} prevPrice={m.prevPrice} />
                        </span>
                      </Link>
                    ))}
                    {!list.length && <p className="px-2 py-3 text-sm text-muted-foreground">No price {key === "drops" ? "drops" : "rises"} in the last 7 days.</p>}
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <TrendPanel
              title="Offers added per week"
              hint="Last 12 weeks"
              points={o.weekly.map((w) => ({ label: weekLabel(w.start), offers: w.offers, lists: w.lists }))}
              series={[{ key: "offers", label: "Offers", color: "var(--series-1)" }]}
            />
          </div>
        </>
      )}
    </div>
  );
}
