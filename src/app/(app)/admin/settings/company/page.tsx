import { BrandCard } from "@/app/(app)/admin/brand-ui";
import { BusinessTypeCard, TaxRegistrationCard } from "@/app/(app)/admin/business-ui";
import { getBrand } from "@/lib/brand";
import { currentOrgId, orgProfile } from "@/lib/org";
import { EMIRATES } from "@/lib/sales";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Company & branding · Settings" };

const emirates = EMIRATES.filter((e) => e !== "Outside UAE").map((e) => ({ value: e.toLowerCase().replace(/ /g, "_"), label: e }));

/** What the company does, its tax registration, and the brand on emails and documents. */
export default async function CompanySettingsPage() {
  const access = await requireSettings("company");
  const [{ version, ...brand }, org] = await Promise.all([getBrand(), currentOrgId().then(orgProfile)]);
  return (
    <div className="grid gap-3">
      <BusinessTypeCard value={access.businessType} />
      <TaxRegistrationCard key={`${org.taxRegNo}|${org.emirate}`} initial={{ trn: org.taxRegNo, emirate: org.emirate }} emirates={emirates} />
      <BrandCard brand={brand} version={version} sample={{ name: access.user.name, email: access.user.email }} />
    </div>
  );
}
