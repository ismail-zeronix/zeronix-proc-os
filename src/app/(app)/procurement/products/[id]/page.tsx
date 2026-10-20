import { eq } from "drizzle-orm";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { PriceChart, type ChartSeries } from "@/components/price-chart";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { quoteText } from "@/lib/export";
import { ago, money } from "@/lib/format";
import { productLabel } from "@/lib/products";
import { searchOffers } from "@/lib/search";
import { getSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";

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

  return (
    <div className="grid gap-5">
      <PageHeader
        back={{ href: "/procurement/compare", label: "Compare" }}
        title={productLabel(product)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">{product.category}</Badge>
            {product.specSummary}
          </span>
        }
        actions={
          <>
            {latest && <CopyButton text={quoteText(latest, staleDays)} label="Copy quote" />}
            <Button variant="outline" nativeButton={false} render={<Link href={`/procurement/compare?q=${encodeURIComponent(product.partNumber || product.modelName)}`} />}>
              Similar products
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Best price now" value={currentBest != null ? money(Math.round(currentBest), bestCurrency) : "On request"} hint={latest ? `${new Set(latest.offers.filter((o) => !o.stale).map((o) => o.supplierId)).size} fresh supplier(s)` : ""} />
        <Stat label="Lowest ever" value={lowest != null ? money(Math.round(lowest), currency) : "—"} hint={lowestOffer ? `${lowestOffer.supplierName}, ${ago(lowestOffer.receivedAt)}` : ""} />
        <Stat label="Average quote" value={average != null ? money(average, currency) : "—"} hint={`${priced.length} priced quotes`} />
        <Stat
          label="Spread now"
          value={latest?.worstPrice != null && currentBest != null ? money(Math.round(latest.worstPrice - currentBest), bestCurrency) : "—"}
          hint="dearest minus cheapest fresh quote"
        />
      </div>

      {series.length > 0 && priced.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price over time</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceChart series={series} currency={currency} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current price per supplier</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="hidden md:table-cell">Spec as quoted</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest?.offers.map((o) => {
                const isBest = o.id === latest.bestOfferId && !o.stale;
                return (
                  <TableRow key={o.id} className={cn(o.stale && "text-muted-foreground", isBest && "bg-emerald-500/5")}>
                    <TableCell className="font-medium">
                      <Link href={`/procurement/suppliers/${o.supplierId}`} className="hover:underline">
                        {o.supplierName}
                      </Link>
                      <SupplierTypeBadge type={o.supplierType} short className="ml-2 align-middle" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
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
                    </TableCell>
                    <TableCell className="text-right">
                      <Trend price={o.price} prevPrice={o.prevPrice} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {[o.cpu, o.ramGb ? `${o.ramGb}GB` : "", o.storage, o.display, o.os, o.extras].filter(Boolean).join(" · ")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.condition !== "new" && <Badge variant="outline" className="mr-1">{o.condition}</Badge>}
                      {o.stockNote}
                    </TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      {ago(o.receivedAt)}
                      {o.stale && <Badge variant="outline" className="ml-1">old</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All quotes ({history.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Stock / notes</TableHead>
                <TableHead className="text-right">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm whitespace-nowrap">{new Date(o.receivedAt).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell>{o.supplierName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(o.price, o.currency)}
                    {o.priceBasis && <span className="ml-1 text-[11px] text-muted-foreground">{o.priceBasis}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{o.stockNote}</TableCell>
                  <TableCell className="text-right text-xs">
                    <Link href={`/procurement/import/${o.priceListId}`} className="hover:underline">
                      list #{o.priceListId}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
