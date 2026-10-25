import { BackButton } from "@/components/back-button";
import { BillForm } from "@/components/purchases-ui";
import { requireFinance } from "@/lib/auth/session";
import { orderOptions, supplierOptions } from "@/lib/purchases-data";

export const metadata = { title: "New bill · Zeronix Accounts" };

/** A supplier's invoice to pay later, or (`?kind=opening`) one still unpaid from before the portal. `?order=` links it to a customer order. */
export default async function NewBillPage({ searchParams }: PageProps<"/accounts/bills/new">) {
  await requireFinance();
  const sp = await searchParams;
  const orderId = Number(sp.order) || undefined;
  const [suppliers, orders] = await Promise.all([supplierOptions(), orderOptions()]);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/accounts/bills" />
        <h1 className="text-sm font-semibold">New bill</h1>
        <span className="text-xs text-muted-foreground">Prices before VAT, as on the supplier&apos;s invoice.</span>
      </div>
      <section className="rounded-xl border bg-card p-3 sm:p-4">
        <BillForm suppliers={suppliers} orders={orders} preset={{ orderId, kind: sp.kind === "opening" ? "opening" : "bill" }} />
      </section>
    </div>
  );
}
