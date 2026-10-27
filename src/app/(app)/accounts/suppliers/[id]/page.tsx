import { eq } from "drizzle-orm";
import { FilePlus2, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { InvoiceStateBadge } from "@/components/order-bits";
import { SupplierBillingDialog } from "@/components/purchases-ui";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { UrlTabs } from "@/components/url-tabs";
import { db, schema } from "@/db";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { methodLabel, termsLabel } from "@/lib/invoicing";
import { categoryLabel } from "@/lib/purchases";
import { listBills, listSupplierPayments } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Supplier · Zeronix Accounts" };

/** One supplier from the money side: billing details, what we owe, their bills and our payments. Prices stay in Procurement. */
export default async function AccountsSupplierPage({ params, searchParams }: PageProps<"/accounts/suppliers/[id]">) {
  const { apps } = await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [[s], bills, pays] = await Promise.all([db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)), listBills({ supplierId: id }), listSupplierPayments({ supplierId: id })]);
  if (!s) notFound();
  const live = bills.filter((b) => b.status !== "void");
  const owed = round2(live.reduce((n, b) => n + b.state.balance, 0));
  const overdue = round2(live.filter((b) => b.state.key === "overdue").reduce((n, b) => n + b.state.balance, 0));
  const year = Number(dubaiToday().slice(0, 4));
  const boughtThisYear = round2(live.filter((b) => b.billDate.startsWith(String(year))).reduce((n, b) => n + b.subtotal, 0));
  const paidThisYear = round2(pays.filter((p) => !p.voidedAt && p.paidOn.startsWith(String(year))).reduce((n, p) => n + p.amount, 0));

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/suppliers" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">{s.name}</h1>
          <span className="truncate text-xs text-muted-foreground">
            {[s.trn ? `TRN ${s.trn}` : "No TRN saved", termsLabel(s.termsDays), s.iban && `IBAN ${s.iban}`].filter(Boolean).join(" · ")}
            {apps.includes("procurement") && (
              <>
                {" · "}
                <AppLink href={`/procurement/suppliers/${id}`} className="hover:underline">
                  price lists
                </AppLink>
              </>
            )}
          </span>
        </div>
        <SupplierBillingDialog supplier={{ id: s.id, name: s.name, trn: s.trn, email: s.email, address: s.address, termsDays: s.termsDays, bankName: s.bankName, iban: s.iban }} />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/bills/new" />}>
          <FilePlus2 /> New bill
        </Button>
      </div>

      <StatStrip
        items={[
          { label: "We owe", value: money(owed) },
          { label: "Overdue", value: money(overdue) },
          { label: `Bought in ${year}`, value: money(boughtThisYear), hint: "before VAT" },
          { label: `Paid in ${year}`, value: money(paidThisYear) },
        ]}
      />

      <UrlTabs
        initial={(await searchParams).tab}
        tabs={[
          {
            key: "bills",
            label: `Bills (${bills.length})`,
            content: (
              <ul className="divide-y rounded-lg border bg-card">
                {bills.map((b) => (
                  <li key={b.id} className={b.status === "void" ? "opacity-60" : ""}>
                    <Link href={`/accounts/bills/${b.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                      <span className="font-mono font-medium">{b.number}</span>
                      <InvoiceStateBadge state={b.state} />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {longDay(b.billDate)}
                        {b.supplierRef ? ` · their no. ${b.supplierRef}` : ""}
                        {b.orderNumber ? ` · for ${b.orderNumber}` : ` · ${categoryLabel(b.category)}`}
                      </span>
                      <span className="tabular-nums">{money(b.total)}</span>
                    </Link>
                  </li>
                ))}
                {!bills.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No bills from this supplier yet.</li>}
              </ul>
            ),
          },
          {
            key: "payments",
            label: `Payments (${pays.length})`,
            content: (
              <ul className="divide-y rounded-lg border bg-card">
                {pays.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${p.voidedAt ? "opacity-60" : ""}`}>
                    <span className={`font-mono font-medium ${p.voidedAt ? "line-through" : ""}`}>{p.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {longDay(p.paidOn)} · {methodLabel(p.method)}
                      {p.reference ? ` · ${p.reference}` : ""} · for {p.billNumber}
                    </span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                    <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/payment-voucher/${p.id}`} target="_blank" />} aria-label="Print the payment voucher" title="Payment voucher">
                      <Printer />
                    </Button>
                  </li>
                ))}
                {!pays.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing paid to this supplier yet.</li>}
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}
