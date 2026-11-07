import { count, desc, asc, eq, ilike, or, sql } from "drizzle-orm";
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

export const metadata = { title: "Debit notes · Zeronix Accounts" };

const PATH = "/accounts/debit-notes";

/** Every debit note to a supplier, newest first. One is made on the bill's page. */
export default async function DebitNotesPage({ searchParams }: PageProps<"/accounts/debit-notes">) {
  await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["date", "total", "supplier"], { sort: "date", dir: "desc" });
  const d = schema.debitNotes;
  const payee = sql<string>`coalesce(${schema.suppliers.name}, ${schema.bills.paidTo})`;
  const found = list.q ? or(ilike(d.number, likeOf(list.q)), ilike(payee, likeOf(list.q)), ilike(schema.bills.number, likeOf(list.q)), ilike(d.reason, likeOf(list.q)), ilike(d.supplierRef, likeOf(list.q))) : undefined;
  const by = { date: d.issueDate, total: d.total, supplier: payee }[list.sort] ?? d.issueDate;
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: d.id, number: d.number, issueDate: d.issueDate, reason: d.reason, total: d.total, billId: schema.bills.id, billNumber: schema.bills.number, supplierId: schema.bills.supplierId, payee })
      .from(d)
      .innerJoin(schema.bills, eq(schema.bills.id, d.billId))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.bills.supplierId))
      .where(found)
      .orderBy(list.dir === "asc" ? asc(by) : desc(by), desc(d.id))
      .limit(list.size)
      .offset(list.offset),
    db.select({ n: count() }).from(d).innerJoin(schema.bills, eq(schema.bills.id, d.billId)).leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.bills.supplierId)).where(found),
  ]);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Debit notes" meta={`${n} debit note${n === 1 ? "" : "s"}`}>
        <ListSearch placeholder="Search number, supplier, bill" />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/debit-notes/new" />}>
          <Plus /> New debit note
        </Button>
      </PageToolbar>
      <DataTable
        noun="debit note"
        total={n}
        acrossPages={false}
        actions={<ExportActions list="debit-notes" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={n} />}
        empty="No debit notes yet. Use New debit note for goods sent back or a price the supplier reduced."
        columns={[
          { label: head("Debit note", "date") },
          { label: head("Supplier", "supplier") },
          { label: "Bill", className: "hidden sm:table-cell" },
          { label: "Why", className: "hidden md:table-cell" },
          { label: head("Amount", "total", "right"), className: "text-right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/accounts/bills/${r.billId}`,
          cells: [
            <>
              <Link href={`/print/debit-note/${r.id}`} target="_blank" className="font-mono text-sm font-medium hover:underline">
                {r.number}
              </Link>
              <div className="text-xs text-muted-foreground">{longDay(r.issueDate)}</div>
            </>,
            r.supplierId ? (
              <Link key="s" href={`/accounts/suppliers/${r.supplierId}`} title={r.payee} className="block max-w-64 truncate font-medium hover:underline">
                {r.payee}
              </Link>
            ) : (
              <span key="s" title={r.payee} className="block max-w-64 truncate font-medium">
                {r.payee}
              </span>
            ),
            <Link key="b" href={`/accounts/bills/${r.billId}`} className="font-mono text-xs hover:underline">
              {r.billNumber}
            </Link>,
            <div key="w" className="max-w-80 truncate text-xs" title={r.reason}>
              {r.reason}
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
