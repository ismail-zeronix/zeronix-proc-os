import { ClipboardList, Download, ListPlus, Printer } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { CopyButton } from "@/components/copy-button";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { ConvertToOrderDialog } from "@/components/order-ui";
import { QuoteDocument } from "@/components/quote-document";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { money, quoteWhatsApp } from "@/lib/quotation";
import { proposalBrand, quoteBrand, toDoc } from "@/lib/quote-view";
import { orderOfQuote } from "@/lib/orders-data";
import { projectOfDeal } from "@/lib/projects-data";
import { snapshotOfQuote } from "@/lib/proposals-data";
import { getQuote } from "@/lib/quotes-data";
import { fillTemplate, quoteEmailValues, quotePdfName } from "@/lib/quote-email";
import { getSettings } from "@/lib/settings";
import { EmailQuote } from "./email-quote";
import { DeleteQuote, QuoteEdit, StatusSelect } from "./quote-controls";

export async function generateMetadata({ params }: PageProps<"/sales/quotes/[id]">) {
  const q = await getQuote(Number((await params).id), financeViewerOf(await requireApp("sales"))).catch(() => null);
  return { title: `${q?.number ?? "Quote"} · Zeronix Sales` };
}

export default async function QuotePage({ params }: PageProps<"/sales/quotes/[id]">) {
  const access = await requireApp("sales");
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id, financeViewerOf(access));
  if (!q) notFound();
  const [brand, order, settings, snapshot, project] = await Promise.all([quoteBrand(), orderOfQuote(q.id), getSettings(), snapshotOfQuote(q.id), q.dealId ? projectOfDeal(q.dealId) : Promise.resolve(null)]);
  const pBrand = snapshot ? await proposalBrand() : null;
  // the payment terms offered on the quote; older quotes fall back to the default
  const defaultTerms = q.termsDays ?? Math.max(0, Math.floor(Number(settings.default_terms_days)) || 0);
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
  const canMail = apps.includes("mail");
  const mailValues = quoteEmailValues({
    quote: { number: q.number, company: q.company.name, contact: q.contact?.name ?? "", validUntil: q.validUntil, total: q.total, items: doc.items },
    deal: q.dealTitle,
    myName: user.name,
    ourCompany: brand.company,
  });
  const locked = q.status === "accepted" || q.status === "rejected";
  const profit = q.costTotal != null ? q.subtotal - q.costTotal : null;
  const canDelete = !order && (q.status === "draft" || user.role === "admin");

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/sales/quotes" />
        <h1 className="font-mono text-lg font-semibold tracking-tight">{q.number}</h1>
        <QuoteStatusBadge status={q.shownStatus} />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={q.dealTitle}>
          <Link href={`/sales/customers/${q.companyId}`} className="hover:text-foreground hover:underline">
            {q.companyName}
          </Link>
          {" · "}
          {!q.dealId ? (
            "Instant quote"
          ) : apps.includes("crm") ? (
            <AppLink href={`/crm/deals/${q.dealId}`} className="hover:text-foreground hover:underline" title="Open the deal">
              {q.dealTitle}
            </AppLink>
          ) : (
            q.dealTitle
          )}
          {q.createdByName ? ` · ${q.createdByName}` : ""}
        </span>
        {!order && !locked && !project && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/sales/quotes/${q.id}/edit`} />} title="Change the customer, lines, terms or salesperson">
            <ListPlus /> Edit
          </Button>
        )}
        {order ? (
          <Button variant="secondary" size="sm" nativeButton={false} render={<Link href={`/sales/orders/${order.id}`} />} title="This quote became an order">
            <ClipboardList /> {order.number}
          </Button>
        ) : (
          <>
            <div className="w-36">
              <StatusSelect quoteId={q.id} status={q.shownStatus} dealStage={q.dealStage ?? ""} />
            </div>
            {q.status !== "rejected" && <ConvertToOrderDialog quoteId={q.id} quoteNumber={q.number} defaultTerms={defaultTerms} accepted={q.status === "accepted"} />}
          </>
        )}
        <CopyButton text={text} label="Copy as WhatsApp text" iconOnly variant="outline" />
        {canMail && (
          <EmailQuote
            quoteId={q.id}
            number={q.number}
            pdfName={quotePdfName(q.number, q.company.name, snapshot ? "Proposal" : "Quotation")}
            initial={{
              to: q.contact?.email ?? "",
              subject: fillTemplate(settings.quote_email_subject, mailValues),
              body: fillTemplate(settings.quote_email_body, mailValues),
            }}
          />
        )}
        {snapshot ? (
          <>
            <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href={`/print/quote/${q.id}`} target="_blank" />} aria-label="Print preview" title="Print preview">
              <Printer />
            </Button>
            <Button size="sm" nativeButton={false} render={<a href={`/api/quotes/${q.id}/pdf`} />} title="The proposal as a PDF, as the customer gets it">
              <Download /> Download PDF
            </Button>
          </>
        ) : (
          <Button size="sm" nativeButton={false} render={<Link href={`/print/quote/${q.id}`} target="_blank" />} title="Open a clean page to print or save as PDF">
            <Printer /> Print / PDF
          </Button>
        )}
        {canDelete && <DeleteQuote quoteId={q.id} number={q.number} />}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="The quotation the customer receives">
          {snapshot && pBrand ? (
            <ProposalDocument blocks={snapshot.blocks} cover={{ ...snapshot.cover, validUntil: snapshot.cover.validUntil ?? q.validUntil }} boq={snapshot.boq} brand={pBrand} />
          ) : (
            <QuoteDocument q={doc} brand={brand} />
          )}
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
          {project && (
            <section className="rounded-xl border bg-card p-3 text-sm">
              <h2 className="mb-1 font-medium">Project proposal</h2>
              {snapshot ? (
                <p className="text-xs text-muted-foreground">
                  The customer gets the proposal of {project.number} as it was on {dayLabel(snapshot.createdAt.toISOString().slice(0, 10))}. To change it, edit the proposal or the BOQ, then use Update {q.number} on
                  the project.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">This quote was made before the project had a proposal, so it prints as a plain quotation. Start the proposal, then update the quote from the BOQ.</p>
              )}
              {apps.includes("projects") && (
                <AppLink href={`/projects/list/${project.id}/proposal`} className="mt-1.5 inline-block text-xs font-medium hover:underline">
                  Open the proposal of {project.number}
                </AppLink>
              )}
            </section>
          )}
          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Validity and terms</h2>
            <QuoteEdit quoteId={q.id} validUntil={q.validUntil} terms={q.terms} locked={locked} />
          </section>
        </aside>
      </div>
    </div>
  );
}
