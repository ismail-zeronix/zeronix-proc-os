import { ArrowLeft, Mail, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { QuoteDocument } from "@/components/quote-document";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { dayLabel } from "@/lib/dates";
import { money, quoteWhatsApp } from "@/lib/quotation";
import { quoteBrand, toDoc } from "@/lib/quote-view";
import { getQuote } from "@/lib/quotes-data";
import { DeleteQuote, QuoteEdit, StatusSelect } from "./quote-controls";

export async function generateMetadata({ params }: PageProps<"/sales/quotes/[id]">) {
  const q = await getQuote(Number((await params).id)).catch(() => null);
  return { title: `${q?.number ?? "Quote"} · Zeronix Sales` };
}

export default async function QuotePage({ params }: PageProps<"/sales/quotes/[id]">) {
  const { user, apps } = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id);
  if (!q) notFound();
  const brand = await quoteBrand();
  const doc = toDoc(q);
  const text = quoteWhatsApp({
    number: q.number,
    company: q.company.name,
    contact: q.contact?.name ?? "",
    validUntil: q.validUntil,
    vatPct: q.vatPct,
    items: doc.items,
    subtotal: q.subtotal,
    vatAmount: q.vatAmount,
    total: q.total,
    preparedBy: q.author?.name ?? "",
    brand: brand.company,
  });
  const canMail = apps.includes("mail") && !!q.contact?.email;
  const mailTo = canMail ? `/mail/compose?to=${encodeURIComponent(q.contact!.email)}&deal=${q.dealId}&subject=${encodeURIComponent(`Quotation ${q.number} - ${brand.company}`)}` : "";
  const locked = q.status === "accepted" || q.status === "rejected";
  const profit = q.costTotal != null ? q.subtotal - q.costTotal : null;
  const canDelete = q.status === "draft" || user.role === "admin";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/sales/deals/${q.dealId}`} />} aria-label="Back to the deal" title="Back to the deal">
          <ArrowLeft />
        </Button>
        <h1 className="font-mono text-lg font-semibold tracking-tight">{q.number}</h1>
        <QuoteStatusBadge status={q.shownStatus} />
        <Link href={`/sales/deals/${q.dealId}`} className="min-w-0 flex-1 truncate text-sm text-muted-foreground hover:text-foreground hover:underline" title={q.dealTitle}>
          {q.companyName} · {q.dealTitle}
        </Link>
        <div className="w-36">
          <StatusSelect quoteId={q.id} status={q.shownStatus} dealStage={q.dealStage} />
        </div>
        <CopyButton text={text} label="Copy as WhatsApp text" iconOnly variant="outline" />
        {canMail && (
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href={mailTo} />} aria-label="Write an email to the contact" title="Write an email to the contact">
            <Mail />
          </Button>
        )}
        <Button size="sm" nativeButton={false} render={<Link href={`/print/quote/${q.id}`} target="_blank" />} title="Open a clean page to print or save as PDF">
          <Printer /> Print / PDF
        </Button>
        {canDelete && <DeleteQuote quoteId={q.id} number={q.number} dealId={q.dealId} />}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="The quotation the customer receives">
          <QuoteDocument q={doc} brand={brand} />
        </section>

        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Inside the company only</h2>
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quoted (before VAT)</dt>
                <dd className="tabular-nums">{money(q.subtotal)}</dd>
              </div>
              {q.costTotal != null && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Our cost</dt>
                    <dd className="tabular-nums">{money(q.costTotal)}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>Profit</dt>
                    <dd className="tabular-nums">{money(profit!)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xs text-muted-foreground">
                <dt>Made by</dt>
                <dd>{q.createdByName || "-"}</dd>
              </div>
              {q.sentAt && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>Sent</dt>
                  <dd>{dayLabel(q.sentAt.toISOString().slice(0, 10))}</dd>
                </div>
              )}
            </dl>
            {q.costTotal == null && <p className="mt-1 text-xs text-muted-foreground">No costs were entered on this quote, so there is no profit figure.</p>}
            {q.shownStatus === "expired" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">This quote has passed its date. Change “Valid until” below to give the customer more time.</p>}
          </section>
          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Validity and terms</h2>
            <QuoteEdit quoteId={q.id} validUntil={q.validUntil} terms={q.terms} locked={locked} />
          </section>
        </aside>
      </div>
    </div>
  );
}
