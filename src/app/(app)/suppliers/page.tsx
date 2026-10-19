import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { SUPPLIER_TYPES } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";
import { SupplierDialog, SupplierTable } from "./supplier-ui";

export const metadata = { title: "Suppliers · Zeronix Procurement" };

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  await requireUser();
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
      href={key ? `/suppliers?type=${key}` : "/suppliers"}
      className={cn(
        "rounded-full border px-3 py-1 text-sm",
        typeFilter === key ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
      )}
    >
      {label} <span className="ml-0.5 text-xs text-muted-foreground tabular-nums">{n}</span>
    </Link>
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Suppliers"
        description="Grouped by how they sell in the UAE market. New suppliers are also created when you paste or import a list."
        actions={<SupplierDialog />}
      />
      <div className="flex flex-wrap gap-2">
        {chip("", "All", all.length)}
        {SUPPLIER_TYPES.filter((t) => counts.get(t.key)).map((t) => chip(t.key, t.label, counts.get(t.key)!))}
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          <SupplierTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
