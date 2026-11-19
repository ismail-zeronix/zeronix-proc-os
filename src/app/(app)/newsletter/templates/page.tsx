import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { newsBrand } from "@/lib/newsletter/brand";
import { TEMPLATES } from "@/lib/newsletter/templates";
import { Gallery } from "./gallery";

export const metadata = { title: "Templates · Zeronix Newsletter" };

export default async function TemplatesPage() {
  await requireApp("newsletter");
  const { brand, previewSrc } = await newsBrand();
  return (
    <div className="grid gap-3">
      <PageToolbar title="Templates" meta={`${TEMPLATES.length} designs · change text, colours and sections after you pick one`} />
      <Gallery templates={TEMPLATES} brand={brand} logoSrc={previewSrc} />
    </div>
  );
}
