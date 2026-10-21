import { eq } from "drizzle-orm";
import { ArrowLeft, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PriceChart, type ChartSeries } from "@/components/price-chart";
import { StatStrip } from "@/components/stat-strip";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { quoteText } from "@/lib/export";
import { ago, money } from "@/lib/format";
import { productLabel } from "@/lib/products";
import { searchOffers } from "@/lib/search";
import { getSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";

const th = "px-3 py-1.5 font-medium";

export default async function ProductPage({ params }: PageProps<"/procurement/products/[id]">) {
  await requireApp("procurement");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!product) notFound();
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const [{ products }, latestRes] = await Promise.all([
    searchOffers({ productId: id, latestOnly: false, limit: 1 }, staleDays),
    searchOffers({ productId: id, limit: 1 }, staleDays),
  ]);
  const history = [...(products[0]?.offers ?? [])].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const latest = latestRes.products[0];

  // one chart axis = one unit: AED whenever quotes can be converted (USD sheets rank with AED lists),
  // otherwise the first currency seen
  const inAed = history.some((o) => o.priceAed != null);
  const currency = inAed ? "AED" : (history.find((o) => o.price != null)?.currency ?? "AED");
  const valueOf = (o: (typeof history)[number]) =>
    inAed ? (o.priceAed == null ? null : Math.round(o.priceAed)) : o.currency === currency ? o.price : null;
  const priced = history.filter((o) => valueOf(o) != null);
  const bySupplier = new Map<number, ChartSeries>();
  for (const o of [...priced].reverse()) {
    const s = bySupplier.get(o.supplierId) ?? { id: o.supplierId, name: o.supplierName, points: [] };
    s.points.push({ at: o.receivedAt, price: valueOf(o)! });
    bySupplier.set(o.supplierId, s);
  }
  const series = [...bySupplier.values()].sort((a, b) => a.id - b.id);

  const prices = priced.map((o) => valueOf(o)!);
  const lowest = prices.length ? Math.min(...prices) : null;
  const lowestOffer = lowest != null ? priced.find((o) => valueOf(o) === lowest) : undefined;
  const average = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const currentBest = latest?.bestPrice ?? null;
  const bestCurrency = latest?.bestCurrency ?? currency;
  const showChart = series.length > 0 && priced.length > 1;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/procurement/compare" />} aria-label="Back to Compare" title="Back to Compare">
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{productLabel(product)}</h1>
        <Badge variant="outline" className="capitalize">{product.category}</Badge>
        <span className="ml-auto flex items-center gap-1.5">
          {latest && <CopyButton text={quoteText(latest, staleDays)} label="Copy quote" iconOnly />}
          <Button
            variant="outline"
            size="icon-sm"
            nativeButton={false}
            render={<Link href={`/procurement/compare?q=${encodeURIComponent(product.partNumber || product.modelName)}`} />}
            aria-label="Similar products"
            title="Similar products"
          >
            <Search />
          </Button>
        </span>
      </div>
      {product.specSummary && <p className="truncate px-1 text-xs text-muted-foreground">{product.specSummary}</p>}

      <StatStrip
        items={[
          {
            label: "Best price now",
            value: currentBest != null ? money(Math.round(currentBest), bestCurrency) : "On request",
            hint: latest ? `${new Set(latest.offers.filter((o) => !o.stale).map((o) => o.supplierId)).size} fresh supplier(s)` : "",
          },
          { label: "Lowest ever", value: lowest != null ? money(Math.round(lowest), currency) : "—", hint: lowestOffer ? `${lowestOffer.supplierName}, ${ago(lowestOffer.receivedAt)}` : "" },
          { label: "Average quote", value: average != null ? money(average, currency) : "—", hint: `${priced.length} priced quotes` },
          {
            label: "Spread now",
            value: latest?.worstPrice != null && currentBest != null ? money(Math.round(latest.worstPrice - currentBest), bestCurrency) : "—",
            hint: "dearest minus cheapest fresh quote",
          },
        ]}
      />

      <section className="rounded-xl border bg-card p-3">
        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">Current prices ({latest?.offers.length ?? 0})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="pt-1">
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className={cn(th, "text-left")}>Supplier</th>
                    <th className={cn(th, "text-right")}>Price</th>
                    <th className={cn(th, "text-right")}>Change</th>
                    <th className={cn(th, "hidden text-left md:table-cell")}>Spec as quoted</th>
                    <th className={cn(th, "text-left")}>Notes</th>
                    <th className={cn(th, "text-right")}>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {latest?.offers.map((o) => {
                    const isBest = o.id === latest.bestOfferId && !o.stale;
                    return (
                      <tr key={o.id} className={cn("border-t hover:bg-muted/30", o.stale && "text-muted-foreground", isBest && "bg-emerald-500/5")}>
                        <td className="px-3 py-1 font-medium">
                          <Link href={`/procurement/suppliers/${o.supplierId}`} className="hover:underline">
                            {o.supplierName}
                          </Link>
                          <SupplierTypeBadge type={o.supplierType} short className="ml-2 align-middle" />
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          <div className="grid justify-items-end">
                            <span className="font-semibold">
                              {isBest && <Trophy className="mr-1 inline size-3.5 text-emerald-700 dark:text-emerald-400" />}
                              {money(o.price, o.currency)}
                            </span>
                            {(o.priceBasis || (o.currency !== "AED" && o.priceAed != null)) && (
                              <span className="text-[11px] text-muted-foreground">
                                {o.currency !== "AED" && o.priceAed != null && `≈ AED ${Math.round(o.priceAed).toLocaleString("en-US")}`}
                                {o.currency !== "AED" && o.priceAed != null && o.priceBasis && " · "}
                                {o.priceBasis}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1 text-right">
                          <Trend price={o.price} prevPrice={o.prevPrice} />
                        </td>
                        <td className="hidden px-3 py-1 text-sm md:table-cell">
                          {[o.cpu, o.ramGb ? `${o.ramGb}GB` : "", o.storage, o.display, o.os, o.extras].filter(Boolean).join(" · ")}
                        </td>
                        <td className="px-3 py-1 text-xs">
                          {o.condition !== "new" && <Badge variant="outline" className="mr-1">{o.condition}</Badge>}
                          {o.stockNote}
                        </td>
                        <td className="px-3 py-1 text-right text-xs whitespace-nowrap">
                          {ago(o.receivedAt)}
                          {o.stale && <Badge variant="outline" className="ml-1">old</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="history" className="grid gap-3 pt-1">
            {showChart && (
              <div className="rounded-md border p-3">
                <h2 className="mb-2 text-sm font-medium">Price over time</h2>
                <PriceChart series={series} currency={currency} />
              </div>
            )}
            <div className="max-h-[calc(100svh-24rem)] min-h-40 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className={cn(th, "text-left")}>Date</th>
                    <th className={cn(th, "text-left")}>Supplier</th>
                    <th className={cn(th, "text-right")}>Price</th>
                    <th className={cn(th, "text-left")}>Stock / notes</th>
                    <th className={cn(th, "text-right")}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((o) => (
                    <tr key={o.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-1 text-sm whitespace-nowrap">{new Date(o.receivedAt).toLocaleDateString("en-GB")}</td>
                      <td className="px-3 py-1">{o.supplierName}</td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {money(o.price, o.currency)}
                        {o.priceBasis && <span className="ml-1 text-[11px] text-muted-foreground">{o.priceBasis}</span>}
                      </td>
                      <td className="px-3 py-1 text-xs">{o.stockNote}</td>
                      <td className="px-3 py-1 text-right text-xs">
                        <Link href={`/procurement/import/${o.priceListId}`} className="hover:underline">
                          list #{o.priceListId}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
