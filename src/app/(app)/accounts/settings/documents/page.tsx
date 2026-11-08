import { DocumentDetailsForm } from "@/components/settings-ui";
import { requireAccountant } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Invoice defaults · Zeronix Accounts" };

export default async function DocumentDetailsPage() {
  await requireAccountant();
  const s = await getSettings();
  return <DocumentDetailsForm key={s.default_terms_days} initial={{ default_terms_days: s.default_terms_days }} />;
}
