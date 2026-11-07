import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { NoteSupplierPick } from "@/components/note-pick";
import { requireFinance } from "@/lib/auth/session";
import { listBills, supplierOptions } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "New debit note · Zeronix Accounts" };

/** A debit note always belongs to a bill: pick the supplier, then the bill. */
export default async function NewDebitNotePage({ searchParams }: PageProps<"/accounts/debit-notes/new">) {
  await requireFinance();
  const sp = await searchParams;
  const supplierId = Number(Array.isArray(sp.supplier) ? sp.supplier[0] : sp.supplier) || 0;
  const suppliers = await supplierOptions();
  const known = suppliers.some((s) => s.id === supplierId);
  const rows = known ? (await listBills({ supplierId, kinds: ["bill"], withVoid: false })).filter((b) => b.total - b.creditedTotal > 0) : [];
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/accounts/debit-notes" />
        <h1 className="text-sm font-semibold">New debit note</h1>
        <span className="text-xs text-muted-foreground">For goods sent back or a price the supplier reduced.</span>
      </div>
      <section className="grid gap-1.5 rounded-xl border bg-card p-3 sm:p-4">
        <label htmlFor="dn-sup" className="text-sm font-medium">
          Supplier
        </label>
        <NoteSupplierPick value={known ? supplierId : null} suppliers={suppliers} />
      </section>
      {known && (
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="border-b px-3 py-2 text-sm font-medium">Which bill?</h2>
          {rows.length ? (
            <ul className="divide-y">
              {rows.map((b) => (
                <li key={b.id}>
                  <Link href={`/accounts/bills/${b.id}?debit=1`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-mono font-medium">{b.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {longDay(b.billDate)}
                      {b.supplierRef ? ` · their no. ${b.supplierRef}` : ""} · {b.state.label}
                    </span>
                    <span className="tabular-nums">{money(round2(b.total - b.creditedTotal))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">This supplier has no bill that can take a debit note.</p>
          )}
        </section>
      )}
    </div>
  );
}
