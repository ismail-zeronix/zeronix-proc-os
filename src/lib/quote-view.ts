import "server-only";
import type { QuoteBrand, QuoteDocData } from "@/components/quote-document";
import { getBrand } from "@/lib/brand";
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
    items: q.items.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice })),
    company: { name: q.company.name, emirate: q.company.emirate, trn: q.company.trn, phone: q.company.phone },
    contact: q.contact ? { name: q.contact.name, jobTitle: q.contact.jobTitle, email: q.contact.email, phone: q.contact.phone } : null,
    author: q.author,
  };
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
