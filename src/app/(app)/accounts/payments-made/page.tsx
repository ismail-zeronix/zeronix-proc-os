import { Printer, Wallet } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { VoidSupplierPaymentButton } from "@/components/purchases-ui";
import { Button } from "@/components/ui/button";
import { requireFinance } from "@/lib/auth/session";
import { methodLabel } from "@/lib/invoicing";
import { readList } from "@/lib/list-params";
import { categoryLabel } from "@/lib/purchases";
import { listSupplierPayments, voucherTotals } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Payments made · Zeronix Accounts" };

const PATH = "/accounts/payments-made";

/** Every payment voucher: supplier bills and expenses paid, newest first. */
export default async function PaymentsMadePage({ searchParams }: PageProps<"/accounts/payments-made">) {
  await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["date", "amount", "number"], { sort: "date", dir: "desc" });
  const [rows, t] = await Promise.all([listSupplierPayments({ limit: list.size, offset: list.offset, q: list.q, sort: list.sort as "date", dir: list.dir }), voucherTotals(list.q)]);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Payments made" meta={`${money(t.thisMonth)} paid out this month`}>
        <ListSearch placeholder="Search voucher, supplier, reference" />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/payments-made/new" />}>
          <Wallet /> New voucher
        </Button>
      </PageToolbar>
      <DataTable
        noun="voucher"
        total={t.n}
        acrossPages={false}
        actions={<ExportActions list="vouchers" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={t.n} />}
        empty="No payments made yet. Press New voucher, pay a bill from its page, or record an expense."
        columns={[
          { label: head("Voucher", "date") },
          { label: "Paid to" },
          { label: "For", className: "hidden md:table-cell" },
          { label: "Method", className: "hidden sm:table-cell" },
          { label: head("Amount", "amount", "right"), className: "text-right" },
          { label: <span className="sr-only">Actions</span>, className: "w-20 text-right" },
        ]}
        rows={rows.map((p) => ({
          id: p.id,
          href: `/print/payment-voucher/${p.id}`,
          cells: [
            <>
              <span className={`font-mono text-sm font-medium ${p.voidedAt ? "text-muted-foreground line-through" : ""}`}>{p.number}</span>
              <div className="text-xs text-muted-foreground">{longDay(p.paidOn)}</div>
            </>,
            <div key="w" className="max-w-64">
              <div className="truncate font-medium" title={p.payee}>{p.payee}</div>
              {p.voidedAt && <div className="truncate text-xs text-destructive">Void: {p.voidReason}</div>}
            </div>,
            <div key="f" className="text-xs">
              <span className="flex flex-wrap gap-x-2">
                {p.documents.map((d) => (
                  <Link key={d.id} href={`/accounts/bills/${d.id}`} className="font-mono hover:underline" title={money(d.amount)}>
                    {d.number}
                  </Link>
                ))}
              </span>
              <div className="text-muted-foreground">
                {p.documents.length === 1 ? (p.documents[0].kind === "expense" ? categoryLabel(p.documents[0].category) : p.documents[0].supplierRef ? `their no. ${p.documents[0].supplierRef}` : "") : ""}
                {p.advance > 0 ? `Advance ${money(p.advance)}` : ""}
              </div>
            </div>,
            <span key="m" className="text-xs">
              {methodLabel(p.method)}
              {p.reference && <div className="text-muted-foreground">{p.reference}</div>}
            </span>,
            <span key="a" className="font-medium tabular-nums">
              {money(p.amount)}
            </span>,
            <span key="b" className="whitespace-nowrap">
              <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/payment-voucher/${p.id}`} target="_blank" />} aria-label="Print the payment voucher" title="Payment voucher">
                <Printer />
              </Button>
              {!p.voidedAt && !p.isExpense && <VoidSupplierPaymentButton paymentId={p.id} number={p.number} />}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
