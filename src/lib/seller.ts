import "server-only";
import type { QuoteBrand } from "@/components/doc-parts";
import type { BankDetails } from "@/components/sales-document";
import { documentDetails } from "@/lib/accounts-data";
import { getBrand } from "@/lib/brand";
import type { SellerSnapshot } from "@/lib/seller-types";

export type { SellerSnapshot };

/**
 * Our own details as they are right now: copied onto a tax invoice, receipt or payment voucher when it is issued, so a
 * reprint next year shows the name, address, TRN and bank account it was issued with, not whatever settings say then.
 * The template, colours and logo still follow the current settings: they are looks, not facts of the document.
 */
export async function sellerSnapshot(): Promise<SellerSnapshot> {
  const [b, det] = await Promise.all([getBrand(), documentDetails()]);
  return {
    company: b.company,
    tagline: b.tagline,
    address: b.address,
    website: b.website,
    mainPhone: b.mainPhone,
    trn: det.trn,
    bank: det.bank && (det.bank.iban || det.bank.accountNumber) ? det.bank : null,
    takenAt: new Date().toISOString(),
  };
}

/** The brand to print a document with: the saved snapshot's facts over the current look. Old documents (no snapshot) print as before. */
export function brandFor(brand: QuoteBrand, snap: SellerSnapshot | null | undefined): QuoteBrand {
  if (!snap) return brand;
  return { ...brand, company: snap.company, tagline: snap.tagline, address: snap.address, website: snap.website, mainPhone: snap.mainPhone, trn: snap.trn };
}

/** The bank account a document prints: the one it was issued with, or (older documents) the current one. */
export function bankFor(current: BankDetails | null, snap: SellerSnapshot | null | undefined): BankDetails | null {
  return snap ? snap.bank : current;
}
