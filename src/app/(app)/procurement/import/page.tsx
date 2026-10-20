import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { getFx } from "@/lib/fx";
import { ImportTabs } from "./import-tabs";

export const metadata = { title: "Add price list · Zeronix" };

const STEPS = [
  ["1", "Paste or upload", "A WhatsApp message, a chat export, or the distributor's Excel sheet."],
  ["2", "It is read", "Excel is read instantly by rules. WhatsApp text is read by the local AI in the background; items you already checked on that supplier's earlier lists are skipped."],
  ["3", "Review and save", "Fix anything highlighted, then save. Prices appear on Compare straight away."],
];

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
  return (
    <div className="grid gap-4">
      <PageHeader title="Add price list" description="Add a supplier's latest prices. Nothing is saved until you review it." />
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map(([n, title, text]) => (
          <li key={n} className="flex gap-3 rounded-lg border bg-card p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {n}
            </span>
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{text}</div>
            </div>
          </li>
        ))}
      </ol>
      <ImportTabs suppliers={suppliers} fxUsd={fx.usd} initialMode={sp.mode === "excel" ? "excel" : "paste"} />
    </div>
  );
}
