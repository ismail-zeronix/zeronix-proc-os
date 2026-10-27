import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { ProposalPrintFrame } from "@/components/proposal/proposal-print";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { getProject } from "@/lib/projects-data";
import { livePriceLines, proposalOf } from "@/lib/proposals-data";
import { PROJECT_VALID_DAYS } from "@/lib/proposal";
import { addDays } from "@/lib/quotation";
import { bankDetails, proposalBrand } from "@/lib/quote-view";
import { quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";

/** Which project a proposal belongs to (the page is addressed by proposal id, as PDFs need a plain number). */
async function projectOfProposal(proposalId: number) {
  const [r] = await db.select({ projectId: schema.proposals.projectId }).from(schema.proposals).where(eq(schema.proposals.id, proposalId));
  return r?.projectId ?? null;
}

export async function generateMetadata({ params }: PageProps<"/print/proposal/[id]">) {
  const access = await requireApp("projects");
  const projectId = await projectOfProposal(Number((await params).id)).catch(() => null);
  const p = projectId ? await getProject(projectId, viewerOf(access)) : null;
  return { title: p ? `Proposal ${p.number} - ${p.companyName}` : "Proposal" };
}

/**
 * The working proposal as it would print today, with the live BOQ. A quote made from it freezes a copy; that copy is what
 * the customer gets (see /print/quote/[id]).
 */
export default async function PrintProposal({ params }: PageProps<"/print/proposal/[id]">) {
  const access = await requireApp("projects");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const projectId = await projectOfProposal(id);
  if (!projectId) notFound();
  const p = await getProject(projectId, viewerOf(access));
  if (!p) notFound();
  const [proposal, lines, defaults, quotes, brand, contact, company, bank] = await Promise.all([
    proposalOf(p.id),
    livePriceLines(p.dealId),
    quoteDefaults(),
    quotesOfDeal(p.dealId),
    proposalBrand(),
    p.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, p.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select({ trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, p.companyId)).then((r) => r[0] ?? null),
    bankDetails(),
  ]);
  if (!proposal) notFound();
  const open = quotes.find((q) => q.status === "draft" || q.status === "sent");
  const today = dubaiToday();
  return (
    <ProposalPrintFrame
      back={`/projects/list/${p.id}/proposal`}
      label={`Proposal ${p.number}`}
      pdfHref={`/api/projects/proposals/${proposal.id}/pdf`}
      note={open ? `Working draft. The customer copy is the one frozen with quote ${open.number}; update the quote to send these changes.` : "Working draft. Make a quote from the BOQ to freeze a copy for the customer."}
    >
      <ProposalDocument
        blocks={proposal.blocks}
        cover={{
          customer: p.companyName,
          contact: contact?.name ?? "",
          contactTitle: contact?.jobTitle ?? "",
          site: p.siteAddress,
          projectNumber: p.number,
          quoteNumber: open?.number ?? null,
          date: today,
          validUntil: open?.validUntil ?? addDays(today, PROJECT_VALID_DAYS),
          customerTrn: company?.trn ?? "",
          bank,
        }}
        boq={{ lines: lines.map((l) => ({ ...l, costAed: null })), sections: p.boqSections, vatPct: defaults.vatPct }}
        brand={brand}
      />
    </ProposalPrintFrame>
  );
}
