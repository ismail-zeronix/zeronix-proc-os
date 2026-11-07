import { BackButton } from "@/components/back-button";
import { BillForm } from "@/components/purchases-ui";
import { requireFinance } from "@/lib/auth/session";
import { directInvoiceOptions, orderOptions, supplierOptions } from "@/lib/purchases-data";

export const metadata = { title: "New bill · Zeronix Accounts" };

/** A supplier's invoice to pay later, or (`?kind=opening`) one still unpaid from before the portal. `?order=` or `?invoice=` links it to a sale, `?supplier=` picks who. */
export default async function NewBillPage({ searchParams }: PageProps<"/accounts/bills/new">) {
  await requireFinance();
  const sp = await searchParams;
  const orderId = Number(sp.order) || undefined;
  const invoiceId = Number(sp.invoice) || undefined;
  const supplierId = Number(sp.supplier) || undefined;
  const [suppliers, orders, invoices] = await Promise.all([supplierOptions(), orderOptions(), directInvoiceOptions()]);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/accounts/bills" />
        <h1 className="text-sm font-semibold">New bill</h1>
        <span className="text-xs text-muted-foreground">Prices before VAT, as on the supplier&apos;s invoice.</span>
      </div>
      <section className="rounded-xl border bg-card p-3 sm:p-4">
        <BillForm suppliers={suppliers} orders={orders} invoices={invoices} preset={{ orderId, invoiceId, supplierId, kind: sp.kind === "opening" ? "opening" : "bill" }} />
      </section>
    </div>
  );
}
