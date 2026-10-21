import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { getFx } from "@/lib/fx";
import { ImportTabs } from "./import-tabs";

export const metadata = { title: "Add price list · Zeronix" };

export default async function ImportPage({ searchParams }: PageProps<"/procurement/import">) {
  await requireApp("procurement");
  const sp = await searchParams;
  const [suppliers, fx] = await Promise.all([
    db
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
        type: schema.suppliers.type,
        defaultCurrency: schema.suppliers.defaultCurrency,
      })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.isActive, true))
      .orderBy(asc(schema.suppliers.name)),
    getFx(),
  ]);
  return <ImportTabs suppliers={suppliers} fxUsd={fx.usd} initialMode={sp.mode === "excel" ? "excel" : "paste"} />;
}
