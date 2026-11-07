import { ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { listPayments, paymentTotals } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { methodLabel } from "@/lib/invoicing";
import { readList } from "@/lib/list-params";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Payments received · Zeronix Accounts" };

const PATH = "/accounts/payments";

/** Every receipt, newest first. Voided ones stay on the list, crossed out. */
export default async function PaymentsPage({ searchParams }: PageProps<"/accounts/payments">) {
  await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["date", "amount", "number", "customer"], { sort: "date", dir: "desc" });
  const [rows, t] = await Promise.all([listPayments({ limit: list.size, offset: list.offset, q: list.q, sort: list.sort as "date", dir: list.dir }), paymentTotals(list.q)]);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Payments received" meta={`${t.live} received · cash ${money(t.cash)} · bank ${money(t.bank)}`}>
        <ListSearch placeholder="Search receipt, customer, reference" />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/payments/new" />}>
          <Wallet /> New receipt
        </Button>
      </PageToolbar>
      <DataTable
        noun="receipt"
        total={t.n}
        acrossPages={false}
        actions={<ExportActions list="receipts" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={t.n} />}
        empty="No payments yet. Press New receipt, or record one from an invoice."
        columns={[
          { label: head("Receipt", "date") },
          { label: head("Customer", "customer") },
          { label: "Invoice", className: "hidden sm:table-cell" },
          { label: "Paid by", className: "hidden md:table-cell" },
          { label: head("Amount", "amount", "right"), className: "text-right" },
          { label: <span className="sr-only">Receipt</span>, className: "w-10" },
        ]}
        rows={rows.map((p) => ({
          id: p.id,
          href: `/print/receipt/${p.id}`,
          cells: [
            <>
              <span className={`font-mono text-sm ${p.voidedAt ? "text-muted-foreground line-through" : "font-medium"}`}>{p.number}</span>
              <div className="text-xs text-muted-foreground">
                {longDay(p.paidOn)}
                {p.voidedAt ? " · voided" : ""}
              </div>
            </>,
            <Link key="c" href={`/accounts/customers/${p.companyId}`} title={p.customerName} className="block max-w-64 truncate font-medium hover:underline">
              {p.customerName}
            </Link>,
            <div key="d">
              <span className="flex flex-wrap gap-x-2">
                {p.documents.map((d) => (
                  <Link key={d.id} href={`/accounts/invoices/${d.id}`} className="font-mono text-xs hover:underline" title={money(d.amount)}>
                    {d.number}
                  </Link>
                ))}
              </span>
              {p.advance > 0 && <span className="text-xs text-muted-foreground">Advance {money(p.advance)}</span>}
            </div>,
            <span key="m" className="text-xs">
              {methodLabel(p.method)}
              {p.reference && <div className="text-muted-foreground">{p.reference}</div>}
            </span>,
            <span key="a" className={`tabular-nums ${p.voidedAt ? "text-muted-foreground line-through" : "font-medium"}`}>
              {money(p.amount)}
            </span>,
            <Button key="r" variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/receipt/${p.id}`} target="_blank" />} aria-label={`Receipt ${p.number}`} title="Receipt voucher">
              <ReceiptText />
            </Button>,
          ],
        }))}
      />
    </div>
  );
}
