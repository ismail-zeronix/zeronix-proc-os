import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { boqLines, getProject } from "@/lib/projects-data";
import { proposalOf, proposalTemplates, termsLibrary } from "@/lib/proposals-data";
import { quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";
import { PROJECT_VALID_DAYS } from "@/lib/proposal";
import { addDays } from "@/lib/quotation";
import { bankDetails, proposalBrand } from "@/lib/quote-view";
import type { ProposalContext } from "./blocks";
import { ProposalEditor } from "./editor";
import { StartProposal } from "./start";

export async function generateMetadata({ params }: PageProps<"/projects/list/[id]/proposal">) {
  const p = await getProject(Number((await params).id), viewerOf(await requireApp("projects"))).catch(() => null);
  return { title: `Proposal ${p?.number ?? ""} · Zeronix Projects` };
}

export default async function ProposalPage({ params }: PageProps<"/projects/list/[id]/proposal">) {
  const access = await requireApp("projects");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getProject(id, viewerOf(access));
  if (!p) notFound();

  const [proposal, templates] = await Promise.all([proposalOf(p.id), proposalTemplates(p.typeKey)]);
  if (!proposal) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <div className="flex items-center gap-3">
          <BackButton fallback={`/projects/list/${p.id}`} />
          <h1 className="text-lg font-semibold tracking-tight">Proposal for {p.title}</h1>
        </div>
        <StartProposal projectId={p.id} typeLabel={p.typeLabel} templates={templates.map((t) => ({ id: t.id, name: t.name, forType: !!t.typeKey, blocks: t.blocks }))} />
      </div>
    );
  }

  const [lines, defaults, quotes, brand, terms, contact, company, bank] = await Promise.all([
    boqLines(p.dealId),
    quoteDefaults(),
    quotesOfDeal(p.dealId),
    proposalBrand(),
    termsLibrary(),
    p.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, p.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select({ trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, p.companyId)).then((r) => r[0] ?? null),
    bankDetails(),
  ]);
  // the quote this proposal goes with: the accepted one, else the newest open one (quotes come newest first)
  const inPlay = quotes.find((q) => q.status === "accepted") ?? quotes.find((q) => q.status === "draft" || q.status === "sent");
  const today = dubaiToday();
  const cover = proposal.blocks.find((b) => b.type === "cover");
  const ctx: ProposalContext = {
    projectId: p.id,
    projectNumber: p.number,
    cover: {
      customer: p.companyName,
      contact: contact?.name ?? "",
      contactTitle: contact?.jobTitle ?? "",
      site: p.siteAddress,
      projectNumber: p.number,
      quoteNumber: inPlay?.number ?? null,
      date: today,
      validUntil: inPlay?.validUntil ?? addDays(today, PROJECT_VALID_DAYS),
      customerTrn: company?.trn ?? "",
      bank,
    },
    brand: { ...brand, color: /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#1f7a3f" },
    boq: { lines, sections: p.boqSections, vatPct: defaults.vatPct },
    terms: terms.map((t) => ({ id: t.id, title: t.title, doc: t.doc, mine: t.createdBy === access.user.id })),
    meId: access.user.id,
    isAdmin: access.user.role === "admin",
    customerAddress: cover?.type === "cover" ? cover.data.customerAddress : "",
  };

  return (
    <ProposalEditor
      proposal={{ id: proposal.id, title: proposal.title, blocks: proposal.blocks, version: proposal.version, updatedAt: proposal.updatedAt.toISOString(), updatedBy: proposal.updatedBy }}
      ctx={ctx}
      templates={templates.map((t) => ({ id: t.id, name: t.name, typeKey: t.typeKey, createdBy: t.createdBy, createdByName: t.createdByName, blocks: t.blocks }))}
      typeLabel={p.typeLabel}
      dealId={p.dealId}
      quote={inPlay ? { id: inPlay.id, number: inPlay.number, status: inPlay.status } : null}
      canOpenQuote={access.apps.includes("accounts")}
    />
  );
}
