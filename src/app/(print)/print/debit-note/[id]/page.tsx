import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { db, schema } from "@/db";
import { requireFinance } from "@/lib/auth/session";
import { debitDoc } from "@/lib/doc-views";
import { getBill } from "@/lib/purchases-data";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Debit note" };

/** A debit note to a supplier: what we take back off their bill. */
export default async function PrintDebitNote({ params }: PageProps<"/print/debit-note/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [row] = await db.select({ billId: schema.debitNotes.billId }).from(schema.debitNotes).where(eq(schema.debitNotes.id, id));
  const bill = row ? await getBill(row.billId) : null;
  const d = bill ? debitDoc(bill, id) : null;
  if (!bill || !d) notFound();
  const brand = await quoteBrand();
  return (
    <PrintPage back={`/accounts/bills/${bill.id}`} number={d.number} pdfHref={`/api/documents/debit-note/${id}/pdf`}>
      <SalesDocument d={d} brand={brand} />
    </PrintPage>
  );
}
