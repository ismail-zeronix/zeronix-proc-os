import { QuoteSettings } from "@/app/(app)/admin/admin-ui";
import { requireAccountant } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Quote defaults · Zeronix Accounts" };

/** What a new quote starts with: margin, validity, VAT, printed terms and the email that carries it. */
export default async function QuoteDefaultsPage() {
  await requireAccountant();
  const s = await getSettings();
  return (
    <QuoteSettings
      key={[s.quote_margin_pct, s.quote_valid_days, s.quote_vat_pct, s.quote_terms, s.quote_email_subject, s.quote_email_body].join("|")}
      settings={{ quote_margin_pct: s.quote_margin_pct, quote_valid_days: s.quote_valid_days, quote_vat_pct: s.quote_vat_pct, quote_terms: s.quote_terms, quote_email_subject: s.quote_email_subject, quote_email_body: s.quote_email_body }}
    />
  );
}
