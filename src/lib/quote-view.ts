import "server-only";
import type { QuoteBrand, QuoteDocData } from "@/components/quote-document";
import type { BankDetails, ProposalBrand } from "@/components/proposal/proposal-document";
import { getBrand, getDocBrand } from "@/lib/brand";
import { displayCompany } from "@/lib/proposal";
import { parseDocStyles, styleFor, withAccent } from "@/lib/doc-style";
import { printedBank } from "@/lib/printed-bank";
import { getSetting } from "@/lib/settings";
import { getQuote, quoteDefaults } from "@/lib/quotes-data";

type Loaded = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

/** The quote in the shape the document component draws. Cost and margin are never part of it. */
export function toDoc(q: Loaded): QuoteDocData {
  return {
    number: q.number,
    createdAt: q.createdAt,
    validUntil: q.validUntil,
    vatPct: q.vatPct,
    subtotal: q.subtotal,
    vatAmount: q.vatAmount,
    total: q.total,
    terms: q.terms,
    items: q.items.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice, section: i.section, unit: i.unit })),
    company: { name: q.company.name, emirate: q.company.emirate, address: q.company.address, trn: q.company.trn, phone: q.company.phone },
    contact: q.contact ? { name: q.contact.name, jobTitle: q.contact.jobTitle, email: q.contact.email, phone: q.contact.phone } : null,
    author: q.author,
  };
}

/** Our details for proposals: the quote brand plus the document lines and images (white logo, signature, stamp). */
export async function proposalBrand(): Promise<ProposalBrand> {
  const [q, d] = await Promise.all([quoteBrand("quote"), getDocBrand()]);
  return {
    ...q,
    company: displayCompany(q.company),
    email: d.email,
    phones: d.phones,
    tradeLicense: d.tradeLicense,
    logoDarkSrc: d.logoDarkSrc,
    signatureSrc: d.signatureSrc,
    stampSrc: d.stampSrc,
  };
}

/** Our bank account for customer payments (the default bank account, see printedBank), or null when not filled in. */
export async function bankDetails(): Promise<BankDetails | null> {
  const b = await printedBank();
  return b ? { bank: b.name, accountName: b.accountName, accountNumber: b.accountNumber, iban: b.iban, swift: b.swift } : null;
}

/**
 * Our details and the document template for one kind of document: "quote" for the quotation, "invoice" for every
 * other customer document (proforma, delivery note, invoices, notes, receipts, statements, reports).
 */
export async function quoteBrand(kind: "quote" | "invoice" = "invoice"): Promise<QuoteBrand> {
  const [b, d, doc, saved] = await Promise.all([getBrand(), quoteDefaults(), getDocBrand(), getSetting("doc_style")]);
  const style = withAccent(styleFor(parseDocStyles(saved), kind), b.color);
  return {
    company: b.company,
    tagline: b.tagline,
    address: b.address,
    website: b.website,
    mainPhone: b.mainPhone,
    // everything that reads the brand colour (receipts, statements, reports) follows the template's accent
    color: style.accent,
    trn: d.trn,
    logoSrc: b.hasLogo ? `/api/brand/logo?v=${b.version}` : null,
    style,
    logoDarkSrc: doc.logoDarkSrc,
    signatureSrc: doc.signatureSrc,
    stampSrc: doc.stampSrc,
  };
}
