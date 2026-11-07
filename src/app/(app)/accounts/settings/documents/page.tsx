import { DocumentDetailsForm } from "@/components/settings-ui";
import { requireAccountant } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Terms and bank details · Zeronix Accounts" };

export default async function DocumentDetailsPage() {
  await requireAccountant();
  const s = await getSettings();
  return <DocumentDetailsForm key={JSON.stringify(s)} initial={{ default_terms_days: s.default_terms_days, bank_name: s.bank_name, bank_account_name: s.bank_account_name, bank_account_number: s.bank_account_number, bank_iban: s.bank_iban, bank_swift: s.bank_swift }} />;
}
