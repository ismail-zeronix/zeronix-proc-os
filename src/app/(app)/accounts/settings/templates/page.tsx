import { DocTemplateEditor } from "@/components/doc-template-ui";
import { requireAccountant } from "@/lib/auth/session";
import { parseDocStyles } from "@/lib/doc-style";
import { quoteBrand } from "@/lib/quote-view";
import { getBrand } from "@/lib/brand";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Document templates · Zeronix Accounts" };

export default async function DocTemplatesPage() {
  await requireAccountant();
  const [saved, base, b] = await Promise.all([getSetting("doc_style"), quoteBrand(), getBrand()]);
  const initial = parseDocStyles(saved);
  // the preview restyles it live: hand over our details with the plain brand colour, not today's template accent
  const brand = { ...base, color: b.color, style: undefined };
  return <DocTemplateEditor key={saved} initial={initial} brand={brand} />;
}
