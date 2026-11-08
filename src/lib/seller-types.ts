/** Our details as they were when a document was issued (lib/seller.ts). Stored as jsonb on the document. */
export interface SellerSnapshot {
  company: string;
  tagline: string;
  address: string;
  website: string;
  mainPhone: string;
  trn: string;
  bank: { name: string; accountName: string; accountNumber: string; iban: string; swift: string } | null;
  takenAt: string;
}
