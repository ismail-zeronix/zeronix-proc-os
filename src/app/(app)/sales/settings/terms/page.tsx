import { DocumentDetailsForm } from "@/components/settings-ui";
import { requireSettings } from "@/lib/settings/access";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Credit terms · Sales settings" };

export default async function DocumentDetailsPage() {
  await requireSettings("terms");
  const s = await getSettings();
  return <DocumentDetailsForm key={s.default_terms_days} initial={{ default_terms_days: s.default_terms_days }} />;
}
