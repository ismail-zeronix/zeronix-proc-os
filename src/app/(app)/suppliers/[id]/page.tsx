import { desc, eq, sql } from "drizzle-orm";
import { Phone, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Trend } from "@/components/trend";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { ago, money } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { supplierOffers } from "@/lib/supplier-stats";
import { cn } from "@/lib/utils";
import { SupplierDialog } from "../supplier-ui";

const STATUS = { queued: "Queued", parsing: "Reading", review: "Needs review", saved: "Saved", failed: "Failed" } as const;

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id));
  if (!supplier) notFound();
  const staleDays = Number(await getSetting("stale_days")) || 14;

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

  return (
    <div className="grid gap-5">
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={
          <>
            {supplier.name} <SupplierTypeBadge type={supplier.type} className="align-middle" />{" "}
            {!supplier.isActive && <Badge variant="outline">inactive</Badge>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {supplier.contactName && <span>{supplier.contactName}</span>}
            {supplier.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {supplier.phone}
              </span>
            )}
            {supplier.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {supplier.location}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <SupplierDialog supplier={{ ...supplier, lists: lists.length, lastList: null, products: offers.length }} />
            <Button variant="outline" nativeButton={false} render={<Link href={`/compare?supplier=${id}`} />}>
              See on Compare
            </Button>
            <Button nativeButton={false} render={<Link href="/import" />}>
              Paste their list
            </Button>
          </>
        }
      />
      {supplier.notes && <p className="max-w-3xl rounded-md bg-muted px-3 py-2 text-sm">{supplier.notes}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Products quoted" value={offers.length} hint={`${fresh.length} still fresh`} />
        <Stat
          label="Cheapest on"
          value={compared.length ? `${cheapest.length} of ${compared.length}` : "—"}
          hint="products also quoted by others"
        />
        <Stat label="Last saved list" value={lastSaved ? ago(lastSaved.receivedAt) : "—"} hint={`${lists.length} lists in total`} />
        <Stat
          label="Without a price"
          value={offers.filter((o) => o.price == null).length}
          hint="stock lists with no price"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current offers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Their price</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Market best</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((o) => {
                  const isBest = o.priceAed != null && o.best != null && o.suppliers > 1 && o.priceAed <= o.best + 0.005 && !o.stale;
                  const gap = o.priceAed != null && o.best != null ? Math.round(o.priceAed - o.best) : null;
                  return (
                    <TableRow key={o.productId} className={cn(o.stale && "text-muted-foreground")}>
                      <TableCell className="max-w-[360px]">
                        <Link href={`/products/${o.productId}`} className="block truncate font-medium hover:underline">
                          {o.label}
                        </Link>
                        {o.stockNote && <span className="text-xs text-muted-foreground">{o.stockNote}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.price == null ? (
                          <span className="text-xs italic text-muted-foreground">Price on request</span>
                        ) : (
                          <span className="font-semibold">
                            {isBest && <Trophy className="mr-1 inline size-3.5 text-emerald-700 dark:text-emerald-400" />}
                            {money(o.price, o.currency)}
                            {o.priceBasis && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{o.priceBasis}</span>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Trend price={o.price} prevPrice={o.prevPrice} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {o.best == null || o.stale ? "—" : isBest ? (
                          <span className="text-xs text-muted-foreground">{o.suppliers > 1 ? "this supplier" : "only quote"}</span>
                        ) : (
                          <>
                            {money(Math.round(o.best), "AED")}
                            {gap != null && gap > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">(+{gap.toLocaleString("en-US")})</span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs whitespace-nowrap">
                        <Link href={`/import/${o.priceListId}`} className="hover:underline">
                          {ago(o.receivedAt)}
                        </Link>
                        {o.stale && <Badge variant="outline" className="ml-1">old</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!offers.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No offers saved from this supplier yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price list history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>List</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Offers</TableHead>
                <TableHead className="text-right">Skipped AI</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/import/${l.id}`} className="font-medium hover:underline">
                      #{l.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.status === "failed" ? "destructive" : l.status === "review" ? "default" : "outline"}>
                      {STATUS[l.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.offers || ""}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {l.reused ? `${l.reused} items` : ""}
                  </TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap">{ago(l.receivedAt)}</TableCell>
                </TableRow>
              ))}
              {!lists.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No lists yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
