import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { SUPPLIER_TYPES } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";
import { SupplierDialog, SupplierTable } from "./supplier-ui";

export const metadata = { title: "Suppliers · Zeronix" };

export default async function SuppliersPage({ searchParams }: PageProps<"/procurement/suppliers">) {
  await requireApp("procurement");
  const sp = await searchParams;
  const typeFilter = SUPPLIER_TYPES.find((t) => t.key === sp.type)?.key ?? "";

  const all = await db
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      contactName: schema.suppliers.contactName,
      phone: schema.suppliers.phone,
      location: schema.suppliers.location,
      type: schema.suppliers.type,
      defaultCurrency: schema.suppliers.defaultCurrency,
      notes: schema.suppliers.notes,
      isActive: schema.suppliers.isActive,
      // Drizzle writes a bare "id" for single-table selects, which a subquery would resolve to its own
      // table. Name the outer table explicitly.
      lists: sql<number>`(SELECT count(*)::int FROM price_lists pl WHERE pl.supplier_id = suppliers.id)`,
      lastList: sql<string | null>`(SELECT max(received_at) FROM price_lists pl WHERE pl.supplier_id = suppliers.id AND pl.status = 'saved')`,
      products: sql<number>`(SELECT count(DISTINCT product_id)::int FROM offers o WHERE o.supplier_id = suppliers.id)`,
    })
    .from(schema.suppliers)
    .orderBy(asc(schema.suppliers.name));

  const counts = new Map<string, number>();
  for (const s of all) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  const rows = typeFilter ? all.filter((s) => s.type === typeFilter) : all;
  const chip = (key: string, label: string, n: number) => (
    <Link
      key={key || "all"}
      href={key ? `/procurement/suppliers?type=${key}` : "/procurement/suppliers"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
        typeFilter === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", typeFilter === key ? "bg-primary/15" : "bg-muted")}>{n}</span>
    </Link>
  );

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Suppliers</h1>
        <nav aria-label="Category" className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto sm:basis-0 sm:flex-1">
          {chip("", "All", all.length)}
          {SUPPLIER_TYPES.filter((t) => counts.get(t.key)).map((t) => chip(t.key, t.label, counts.get(t.key)!))}
        </nav>
        <SupplierDialog />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <SupplierTable rows={rows} />
      </div>
    </div>
  );
}
