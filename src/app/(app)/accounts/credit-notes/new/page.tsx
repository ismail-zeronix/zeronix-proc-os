import { eq } from "drizzle-orm";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { NoteCustomerPick } from "@/components/note-pick";
import { db, schema } from "@/db";
import { listInvoices } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "New credit note · Zeronix Accounts" };

/** A credit note always belongs to an invoice, as a UAE tax credit note must refer to the original: pick the customer, then the invoice. */
export default async function NewCreditNotePage({ searchParams }: PageProps<"/accounts/credit-notes/new">) {
  await requireFinance();
  const sp = await searchParams;
  const companyId = Number(Array.isArray(sp.company) ? sp.company[0] : sp.company) || 0;
  const [company] = companyId ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
  const all = company ? await listInvoices({ companyId: company.id }) : [];
  const rows = all.filter((i) => i.kind === "sale" && i.status !== "cancelled" && i.total - i.creditedTotal > 0);
  const opening = all.filter((i) => i.kind === "opening" && i.status !== "cancelled").length;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/accounts/credit-notes" />
        <h1 className="text-sm font-semibold">New credit note</h1>
        <span className="text-xs text-muted-foreground">For a sales return or a price reduction. It always refers to the invoice.</span>
      </div>
      <section className="grid gap-1.5 rounded-xl border bg-card p-3 sm:p-4">
        <label htmlFor="cn-co" className="text-sm font-medium">
          Customer
        </label>
        <NoteCustomerPick value={company ? { id: company.id, name: company.name } : null} />
      </section>
      {company && (
        <section className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="border-b px-3 py-2 text-sm font-medium">Which invoice?</h2>
          {rows.length ? (
            <ul className="divide-y">
              {rows.map((i) => (
                <li key={i.id}>
                  <Link href={`/accounts/invoices/${i.id}?credit=1`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-mono font-medium">{i.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {longDay(i.issueDate)} · {i.state.label}
                    </span>
                    <span className="tabular-nums">{money(round2(i.total - i.creditedTotal))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">This customer has no invoice that can take a credit note.</p>
          )}
          {opening > 0 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Invoices carried over from Zoho are not listed: their credit notes belong in Zoho.</p>}
        </section>
      )}
    </div>
  );
}
