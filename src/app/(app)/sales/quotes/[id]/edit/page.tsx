import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { orderOfQuote } from "@/lib/orders-data";
import { projectOfDeal } from "@/lib/projects-data";
import { getQuote, quoteDefaults, quoteLines } from "@/lib/quotes-data";
import { salesPeople } from "@/lib/sales-data";
import { customerChoices } from "../../../quote-actions";
import { QuoteForm } from "../../quote-form";

export const metadata = { title: "Edit quote · Zeronix Sales" };

/** Change an open quote (draft or sent) on the same page it was made on. Answered quotes and quotes with an order stay as they are. */
export default async function EditQuotePage({ params }: PageProps<"/sales/quotes/[id]/edit">) {
  const access = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id, financeViewerOf(access));
  if (!q) notFound();
  const [order, project] = await Promise.all([orderOfQuote(id), q.dealId ? projectOfDeal(q.dealId) : Promise.resolve(null)]);
  // project quotes are changed from their BOQ; answered or ordered quotes are final
  if (project || order || (q.status !== "draft" && q.status !== "sent")) redirect(`/sales/quotes/${id}`);
  const [people, defaults, lines, choices] = await Promise.all([salesPeople(), quoteDefaults(), quoteLines(id), customerChoices(q.companyId)]);
  // keep the current salesperson even if they no longer use Sales, so saving does not silently change it
  const owner = q.ownerId ?? q.createdBy ?? access.user.id;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback={`/sales/quotes/${id}`} />
        <h1 className="text-sm font-semibold">Edit {q.number}</h1>
        {q.status === "sent" && <span className="text-xs text-muted-foreground">Already sent: send it again after saving.</span>}
      </div>
      <QuoteForm
        initial={{
          id,
          number: q.number,
          company: { id: q.companyId, name: q.companyName },
          dealId: q.dealId,
          contactId: q.contactId,
          ownerId: owner,
          validUntil: q.validUntil,
          termsDays: q.termsDays ?? 0,
          vatPct: q.vatPct,
          terms: q.terms,
          notes: q.notes,
          lines: lines.map((l) => ({ description: l.description, qty: l.qty, costAed: l.costAed, unitPriceAed: l.unitPrice, supplierName: l.supplierName })),
        }}
        initialChoices={choices}
        people={people.some((p) => p.id === owner) ? people : [...people, { id: owner, name: q.createdByName || "Current salesperson" }]}
        defaultMargin={defaults.marginPct}
        canFindPrice={access.apps.includes("procurement")}
      />
    </div>
  );
}
