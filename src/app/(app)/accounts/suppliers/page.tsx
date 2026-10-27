import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFinance } from "@/lib/auth/session";
import { termsLabel } from "@/lib/invoicing";
import { supplierBalances } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Suppliers · Zeronix Accounts" };

/** The same suppliers as in Procurement, from the money side: what we owe each one, and how late. */
export default async function AccountsSuppliersPage() {
  await requireFinance();
  const rows = await supplierBalances();
  const owed = rows.reduce((s, r) => s + r.owed, 0);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Suppliers" meta={`${rows.length} suppliers · we owe ${money(owed)} · open one for its bills and statement`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Supplier</TableHead>
              <TableHead className="hidden md:table-cell">Terms</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Bills</TableHead>
              <TableHead className="text-right">We owe</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="hidden lg:table-cell">Last paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="max-w-72 py-1.5">
                  <Link href={`/accounts/suppliers/${s.id}`} className="block truncate font-medium hover:underline">
                    {s.name}
                  </Link>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SupplierTypeBadge type={s.type} />
                    {s.trn ? `TRN ${s.trn}` : "no TRN"}
                  </div>
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{termsLabel(s.termsDays)}</TableCell>
                <TableCell className="hidden py-1.5 text-right tabular-nums sm:table-cell">{s.bills || "-"}</TableCell>
                <TableCell className="py-1.5 text-right font-medium tabular-nums">{s.owed ? money(s.owed) : "-"}</TableCell>
                <TableCell className={`py-1.5 text-right tabular-nums ${s.overdue ? "font-medium text-red-700 dark:text-red-400" : ""}`}>{s.overdue ? money(s.overdue) : "-"}</TableCell>
                <TableCell className="hidden py-1.5 text-xs lg:table-cell">{s.lastPaid ? longDay(s.lastPaid) : "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No suppliers yet. They are added in Procurement, or from a new bill.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
