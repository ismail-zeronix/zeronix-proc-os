import { DocumentBrandCard } from "@/app/(app)/admin/doc-brand-ui";
import { requireSettings } from "@/lib/settings/access";
import { getBrandRow, getDocBrand } from "@/lib/brand";

export const metadata = { title: "Letterhead · Settings" };

/** Contact lines, trade licence, white logo, signature and stamp printed on customer documents and proposals. */
export default async function LetterheadPage() {
  await requireSettings("letterhead");
  const [docBrand, row] = await Promise.all([getDocBrand(), getBrandRow()]);
  return (
    <DocumentBrandCard
      initial={{
        docEmail: row?.docEmail ?? "",
        docPhones: row?.docPhones ?? "",
        tradeLicense: row?.tradeLicense ?? "",
        logoDarkSrc: docBrand.logoDarkSrc,
        signatureSrc: docBrand.signatureSrc,
        stampSrc: docBrand.stampSrc,
      }}
    />
  );
}
