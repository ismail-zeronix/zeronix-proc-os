import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { ClipboardPaste, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, schema } from "@/db";
import { listCounts } from "@/lib/alerts";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Price lists · Zeronix" };

const PAGE = 40;

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  queued: { label: "Queued", variant: "secondary" },
  parsing: { label: "Reading", variant: "secondary" },
  review: { label: "Needs review", variant: "default" },
  saved: { label: "Saved", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

const TABS = [
  { key: "", label: "All" },
  { key: "review", label: "Needs review" },
  { key: "failed", label: "Failed" },
  { key: "saved", label: "Saved" },
] as const;

export default async function PriceListsPage({ searchParams }: PageProps<"/procurement/price-lists">) {
  await requireApp("procurement");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = TABS.find((t) => t.key === str("status"))?.key ?? "";
  const supplier = Number(str("supplier")) || undefined;
  const q = str("q").trim().slice(0, 100);
  const page = Math.max(1, Number(str("page")) || 1);

  const where: SQL[] = [];
  if (status) where.push(eq(schema.priceLists.status, status));
  if (supplier) where.push(eq(schema.priceLists.supplierId, supplier));
  if (q) where.push(ilike(schema.priceLists.rawText, `%${q.replace(/[%_\\]/g, "\\$&")}%`));
  const filter = where.length ? and(...where) : undefined;

  const [rows, [{ total }], suppliers, counts] = await Promise.all([
    db
      .select({
        id: schema.priceLists.id,
        status: schema.priceLists.status,
        receivedAt: schema.priceLists.receivedAt,
        progressDone: schema.priceLists.progressDone,
        progressTotal: schema.priceLists.progressTotal,
        reused: schema.priceLists.reusedBlocks,
        supplierId: schema.priceLists.supplierId,
        supplier: schema.suppliers.name,
        by: schema.users.name,
        preview: sql<string>`left(${schema.priceLists.rawText}, 140)`,
        offers: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.price_list_id = ${schema.priceLists.id})`,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .leftJoin(schema.users, eq(schema.users.id, schema.priceLists.createdBy))
      .where(filter)
      // lists waiting on a person come first, then newest
      .orderBy(
        sql`(CASE ${schema.priceLists.status} WHEN 'review' THEN 0 WHEN 'failed' THEN 1 WHEN 'parsing' THEN 2 WHEN 'queued' THEN 2 ELSE 3 END)`,
        desc(schema.priceLists.receivedAt),
      )
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.priceLists).where(filter),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(schema.suppliers.name),
    listCounts(),
  ]);

  const href = (over: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const cur = { status, supplier: supplier ?? "", q, page: 1, ...over };
    for (const [k, v] of Object.entries(cur)) if (v !== "" && v !== undefined && !(k === "page" && v === 1)) next.set(k, String(v));
    const s = next.toString();
    return s ? `/procurement/price-lists?${s}` : "/procurement/price-lists";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const tabCount: Record<string, number | undefined> = { review: counts.review, failed: counts.failed };

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Price lists"
        description="Every pasted message with its status and the original text. Lists that need you come first."
        actions={
          <Button nativeButton={false} render={<Link href="/procurement/import" />}>
            <ClipboardPaste /> Paste price list
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ status: t.key })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                status === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!tabCount[t.key] && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{tabCount[t.key]}</span>}
            </Link>
          ))}
        </div>
        {/* plain GET form: works without JavaScript and keeps the filters in the URL */}
        <form action="/procurement/price-lists" className="ml-auto flex flex-wrap items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <select
            name="supplier"
            defaultValue={supplier ?? ""}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            aria-label="Supplier"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search message text…"
            aria-label="Search message text"
            className="h-8 w-48 rounded-lg border border-input bg-background px-2.5 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search /> Filter
          </Button>
          {(supplier || q) && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href({ supplier: "", q: "" })} />}>
              Clear
            </Button>
          )}
        </form>
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Message</TableHead>
                <TableHead className="text-right">Offers</TableHead>
                <TableHead className="hidden lg:table-cell">Pasted by</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/procurement/import/${r.id}`} className="font-medium hover:underline">
                      {r.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/procurement/suppliers/${r.supplierId}`} className="hover:underline">
                      {r.supplier}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[r.status].variant}>
                      {STATUS[r.status].label}
                      {r.status === "parsing" && r.progressTotal ? ` ${r.progressDone}/${r.progressTotal}` : ""}
                    </Badge>
                    {r.reused > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground" title="Items copied from earlier reviewed lists, no AI needed">
                        {r.reused} known
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-[420px] md:table-cell">
                    <Link href={`/procurement/import/${r.id}`} className="block truncate text-xs text-muted-foreground hover:underline">
                      {r.preview}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.offers || ""}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{r.by}</TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap">{ago(r.receivedAt)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {status || supplier || q ? (
                      <>
                        No lists match these filters. <Link href="/procurement/price-lists" className="underline">Show all</Link>.
                      </>
                    ) : (
                      <>
                        Nothing pasted yet. <Link href="/procurement/import" className="underline">Paste a price list</Link>.
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total} lists
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} nativeButton={false} render={<Link href={href({ page: page - 1 })} />}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} nativeButton={false} render={<Link href={href({ page: page + 1 })} />}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
