import { desc, eq, sql } from "drizzle-orm";
import { ClipboardPaste, MapPin, Phone, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { StatStrip } from "@/components/stat-strip";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, schema } from "@/db";
import { getSession, requireApp } from "@/lib/auth/session";
import { ago, money } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { supplierOffers } from "@/lib/supplier-stats";
import { cn } from "@/lib/utils";
import { FeedBadge, FeedCard } from "../feed-card";
import { SupplierDialog } from "../supplier-ui";

const STATUS = { queued: "Queued", parsing: "Reading", review: "Needs review", saved: "Saved", failed: "Failed" } as const;
const th = "px-3 py-1.5 font-medium";

export default async function SupplierPage({ params }: PageProps<"/procurement/suppliers/[id]">) {
  await requireApp("procurement");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id));
  if (!supplier) notFound();
  const staleDays = Number(await getSetting("stale_days")) || 14;

  const session = await getSession();
  const [feedRow] = await db.select().from(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, id));
  const [offers, lists] = await Promise.all([
    supplierOffers(id, staleDays),
    db
      .select({
        id: schema.priceLists.id,
        status: schema.priceLists.status,
        receivedAt: schema.priceLists.receivedAt,
        // explicit table name: a bare "id" would be read as offers.id inside the subquery
        offers: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.price_list_id = price_lists.id)`,
        reused: schema.priceLists.reusedBlocks,
      })
      .from(schema.priceLists)
      .where(eq(schema.priceLists.supplierId, id))
      .orderBy(desc(schema.priceLists.receivedAt))
      .limit(15),
  ]);

  const fresh = offers.filter((o) => !o.stale);
  const compared = fresh.filter((o) => o.priceAed != null && o.best != null && o.suppliers > 1);
  const cheapest = compared.filter((o) => o.priceAed! <= o.best! + 0.005);
  const lastSaved = lists.find((l) => l.status === "saved");
  const isAdmin = session?.role === "admin";
  const feed = feedRow
    ? {
        url: feedRow.url,
        currency: feedRow.currency,
        intervalMinutes: feedRow.intervalMinutes,
        enabled: feedRow.enabled,
        lastCheckedAt: feedRow.lastCheckedAt?.toISOString() ?? null,
        lastChangedAt: feedRow.lastChangedAt?.toISOString() ?? null,
        lastRows: feedRow.lastRows,
        lastStatus: feedRow.lastStatus,
        lastMessage: feedRow.lastMessage,
      }
    : null;
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/procurement/suppliers" />
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{supplier.name}</h1>
        <SupplierTypeBadge type={supplier.type} />
        {!supplier.isActive && <Badge variant="outline">inactive</Badge>}
        <span className="ml-auto flex items-center gap-1.5">
          <SupplierDialog supplier={{ ...supplier, lists: lists.length, lastList: null, products: offers.length }} />
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href={`/procurement/compare?supplier=${id}`} />} aria-label="See on Compare" title="See on Compare">
            <Search />
          </Button>
          <Button size="icon-sm" nativeButton={false} render={<Link href="/procurement/import" />} aria-label="Paste their list" title="Paste their list">
            <ClipboardPaste />
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {supplier.contactName && <span>{supplier.contactName}</span>}
        {supplier.phone && (
          <span className={meta}>
            <Phone /> {supplier.phone}
          </span>
        )}
        {supplier.location && (
          <span className={meta}>
            <MapPin /> {supplier.location}
          </span>
        )}
        {supplier.notes && <span className="min-w-0 truncate" title={supplier.notes}>Note: {supplier.notes}</span>}
      </div>

      <StatStrip
        items={[
          { label: "Products quoted", value: offers.length, hint: `${fresh.length} still fresh` },
          { label: "Cheapest on", value: compared.length ? `${cheapest.length} of ${compared.length}` : "—", hint: "products also quoted by others" },
          { label: "Last saved list", value: lastSaved ? ago(lastSaved.receivedAt) : "—", hint: `${lists.length} lists in total` },
          { label: "Without a price", value: offers.filter((o) => o.price == null).length, hint: "stock lists with no price" },
        ]}
      />

      <section className="rounded-xl border bg-card p-3">
        <Tabs defaultValue="offers">
          <TabsList>
            <TabsTrigger value="offers">Current offers ({offers.length})</TabsTrigger>
            <TabsTrigger value="lists">Price lists ({lists.length})</TabsTrigger>
            {(feed || isAdmin) && (
              <TabsTrigger value="feed">
                Live feed <FeedBadge feed={feed} />
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="offers" className="pt-1">
            <div className="max-h-[calc(100svh-19rem)] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className={cn(th, "text-left")}>Product</th>
                    <th className={cn(th, "text-right")}>Their price</th>
                    <th className={cn(th, "text-right")}>Change</th>
                    <th className={cn(th, "text-right")}>Market best</th>
                    <th className={cn(th, "text-right")}>Quoted</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => {
                    const isBest = o.priceAed != null && o.best != null && o.suppliers > 1 && o.priceAed <= o.best + 0.005 && !o.stale;
                    const gap = o.priceAed != null && o.best != null ? Math.round(o.priceAed - o.best) : null;
                    return (
                      <tr key={o.productId} className={cn("border-t hover:bg-muted/30", o.stale && "text-muted-foreground")}>
                        <td className="max-w-[360px] px-3 py-1">
                          <Link href={`/procurement/products/${o.productId}`} className="block truncate font-medium hover:underline">
                            {o.label}
                          </Link>
                          {o.stockNote && <span className="text-xs text-muted-foreground">{o.stockNote}</span>}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {o.price == null ? (
                            <span className="text-xs italic text-muted-foreground">Price on request</span>
                          ) : (
                            <span className="font-semibold">
                              {isBest && <Trophy className="mr-1 inline size-3.5 text-emerald-700 dark:text-emerald-400" />}
                              {money(o.price, o.currency)}
                              {o.priceBasis && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{o.priceBasis}</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-right">
                          <Trend price={o.price} prevPrice={o.prevPrice} />
                        </td>
                        <td className="px-3 py-1 text-right text-sm tabular-nums">
                          {o.best == null || o.stale ? (
                            "—"
                          ) : isBest ? (
                            <span className="text-xs text-muted-foreground">{o.suppliers > 1 ? "this supplier" : "only quote"}</span>
                          ) : (
                            <>
                              {money(Math.round(o.best), "AED")}
                              {gap != null && gap > 0 && <span className="ml-1 text-xs text-muted-foreground">(+{gap.toLocaleString("en-US")})</span>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-1 text-right text-xs whitespace-nowrap">
                          <Link href={`/procurement/import/${o.priceListId}`} className="hover:underline">
                            {ago(o.receivedAt)}
                          </Link>
                          {o.stale && <Badge variant="outline" className="ml-1">old</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                  {!offers.length && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No offers saved from this supplier yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="lists" className="pt-1">
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className={cn(th, "text-left")}>List</th>
                    <th className={cn(th, "text-left")}>Status</th>
                    <th className={cn(th, "text-right")}>Offers</th>
                    <th className={cn(th, "text-right")}>Skipped AI</th>
                    <th className={cn(th, "text-right")}>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-1">
                        <Link href={`/procurement/import/${l.id}`} className="font-medium hover:underline">
                          #{l.id}
                        </Link>
                      </td>
                      <td className="px-3 py-1">
                        <Badge variant={l.status === "failed" ? "destructive" : l.status === "review" ? "default" : "outline"}>{STATUS[l.status]}</Badge>
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">{l.offers || ""}</td>
                      <td className="px-3 py-1 text-right text-xs tabular-nums text-muted-foreground">{l.reused ? `${l.reused} items` : ""}</td>
                      <td className="px-3 py-1 text-right text-xs whitespace-nowrap">{ago(l.receivedAt)}</td>
                    </tr>
                  ))}
                  {!lists.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No lists yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {(feed || isAdmin) && (
            <TabsContent value="feed" className="pt-2">
              <FeedCard supplierId={id} canEdit={isAdmin} feed={feed} />
            </TabsContent>
          )}
        </Tabs>
      </section>
    </div>
  );
}
