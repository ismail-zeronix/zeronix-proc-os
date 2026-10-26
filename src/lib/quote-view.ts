import "server-only";
import type { QuoteBrand, QuoteDocData } from "@/components/quote-document";
import type { BankDetails, ProposalBrand } from "@/components/proposal/proposal-document";
import { getBrand, getDocBrand } from "@/lib/brand";
import { displayCompany } from "@/lib/proposal";
import { getSettings } from "@/lib/settings";
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
  const [q, d] = await Promise.all([quoteBrand(), getDocBrand()]);
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

/** Our bank account for customer payments (Admin > Settings > Documents), or null when not filled in. */
export async function bankDetails(): Promise<BankDetails | null> {
  const s = await getSettings();
  const b = { bank: s.bank_name, accountName: s.bank_account_name, accountNumber: s.bank_account_number, iban: s.bank_iban, swift: s.bank_swift };
  return Object.values(b).some((v) => v.trim()) ? b : null;
}

export async function quoteBrand(): Promise<QuoteBrand> {
  const [b, d] = await Promise.all([getBrand(), quoteDefaults()]);
  return {
    company: b.company,
    tagline: b.tagline,
    address: b.address,
    website: b.website,
    mainPhone: b.mainPhone,
    color: b.color,
    trn: d.trn,
    logoSrc: b.hasLogo ? `/api/brand/logo?v=${b.version}` : null,
  };
}
