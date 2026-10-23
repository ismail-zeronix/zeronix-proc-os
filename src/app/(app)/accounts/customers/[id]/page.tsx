import { Printer } from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { InvoiceTable } from "@/components/invoice-table";
import { StatementDocument } from "@/components/money-documents";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyBalance, listInvoices, statement } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { money } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** One customer for Accounts: balance, invoices, and the statement of account for a period (print or save as PDF). */
export default async function CustomerAccountPage({ params, searchParams }: PageProps<"/accounts/customers/[id]">) {
  const { apps } = await requireApp("accounts");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const sp = await searchParams;
  const today = dubaiToday();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01-01`;
  const [s, invoices, bal, brand] = await Promise.all([statement(id, from, to), listInvoices({ companyId: id }), companyBalance(id), quoteBrand()]);
  if (!s) notFound();
  const paidIn = s.lines.filter((l) => l.kind === "payment").reduce((n, l) => n + l.credit, 0);
  const invoicedIn = s.lines.filter((l) => l.kind === "invoice").reduce((n, l) => n + l.debit, 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/customers" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">{s.company.name}</h1>
          <span className="truncate text-xs text-muted-foreground">
            {[s.company.emirate, s.company.trn && `TRN ${s.company.trn}`].filter(Boolean).join(" · ") || "No TRN saved"}
            {apps.includes("sales") && (
              <>
                {" · "}
                <AppLink href={`/sales/companies/${id}`} className="hover:underline">
                  company page
                </AppLink>
              </>
            )}
          </span>
        </div>
      </div>

      <StatStrip
        items={[
          { label: "Owes today", value: money(bal.owed) },
          { label: "Overdue", value: money(bal.overdue) },
          { label: "Invoiced in the period", value: money(invoicedIn) },
          { label: "Paid in the period", value: money(paidIn) },
        ]}
      />

      <InvoiceTable rows={invoices} showCustomer={false} empty="No invoices for this customer." />

      <section className="grid gap-2 rounded-xl border bg-card p-3" aria-label="Statement of account">
        <form className="flex flex-wrap items-end gap-2" action={`/accounts/customers/${id}`}>
          <h2 className="mr-auto text-sm font-semibold">Statement of account</h2>
          <div className="grid gap-1">
            <Label htmlFor="st-from" className="text-xs">
              From
            </Label>
            <Input id="st-from" name="from" type="date" defaultValue={from} className="h-8 w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="st-to" className="text-xs">
              To
            </Label>
            <Input id="st-to" name="to" type="date" defaultValue={to} max={today} className="h-8 w-40" />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Show
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href={`/print/statement/${id}?from=${from}&to=${to}`} target="_blank" />}>
            <Printer /> Print / PDF
          </Button>
        </form>
        <div className="overflow-hidden rounded-lg border">
          <StatementDocument brand={brand} s={{ customer: { name: s.company.name, emirate: s.company.emirate, trn: s.company.trn }, from, to, opening: s.opening, lines: s.lines, closing: s.closing }} />
        </div>
      </section>
    </div>
  );
}
