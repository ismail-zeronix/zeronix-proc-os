import { count, desc, asc, eq, ilike, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { db, schema } from "@/db";
import { requireFinance } from "@/lib/auth/session";
import { likeOf, readList } from "@/lib/list-params";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Credit notes · Zeronix Accounts" };

const PATH = "/accounts/credit-notes";

/** Every credit note, newest first. One is made on the invoice's page. */
export default async function CreditNotesPage({ searchParams }: PageProps<"/accounts/credit-notes">) {
  await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["date", "total", "customer"], { sort: "date", dir: "desc" });
  const c = schema.creditNotes;
  const found = list.q ? or(ilike(c.number, likeOf(list.q)), ilike(schema.invoices.customerName, likeOf(list.q)), ilike(schema.invoices.number, likeOf(list.q)), ilike(c.reason, likeOf(list.q))) : undefined;
  const by = { date: c.issueDate, total: c.total, customer: schema.invoices.customerName }[list.sort] ?? c.issueDate;
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: c.id, number: c.number, issueDate: c.issueDate, reason: c.reason, total: c.total, goodsBack: c.goodsBack, invoiceId: schema.invoices.id, invoiceNumber: schema.invoices.number, companyId: schema.invoices.companyId, customerName: schema.invoices.customerName })
      .from(c)
      .innerJoin(schema.invoices, eq(schema.invoices.id, c.invoiceId))
      .where(found)
      .orderBy(list.dir === "asc" ? asc(by) : desc(by), desc(c.id))
      .limit(list.size)
      .offset(list.offset),
    db.select({ n: count() }).from(c).innerJoin(schema.invoices, eq(schema.invoices.id, c.invoiceId)).where(found),
  ]);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Credit notes" meta={`${n} credit note${n === 1 ? "" : "s"}`}>
        <ListSearch placeholder="Search number, customer, invoice" />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/credit-notes/new" />}>
          <Plus /> New credit note
        </Button>
      </PageToolbar>
      <DataTable
        noun="credit note"
        total={n}
        acrossPages={false}
        actions={<ExportActions list="credit-notes" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={n} />}
        empty="No credit notes yet. Use New credit note for a sales return or a price reduction."
        columns={[
          { label: head("Credit note", "date") },
          { label: head("Customer", "customer") },
          { label: "Invoice", className: "hidden sm:table-cell" },
          { label: "Why", className: "hidden md:table-cell" },
          { label: head("Amount", "total", "right"), className: "text-right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/accounts/invoices/${r.invoiceId}`,
          cells: [
            <>
              <Link href={`/print/invoice/${r.invoiceId}?doc=credit&cn=${r.id}`} target="_blank" className="font-mono text-sm font-medium hover:underline">
                {r.number}
              </Link>
              <div className="text-xs text-muted-foreground">{longDay(r.issueDate)}</div>
            </>,
            <Link key="c" href={`/accounts/customers/${r.companyId}`} title={r.customerName} className="block max-w-64 truncate font-medium hover:underline">
              {r.customerName}
            </Link>,
            <Link key="i" href={`/accounts/invoices/${r.invoiceId}`} className="font-mono text-xs hover:underline">
              {r.invoiceNumber}
            </Link>,
            <div key="w" className="max-w-80 truncate text-xs" title={r.reason}>
              {r.reason}
              <div className="text-muted-foreground">{r.goodsBack ? "Goods coming back" : "Customer keeps the goods, or a service"}</div>
            </div>,
            <span key="a" className="font-medium tabular-nums">
              {money(r.total)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
