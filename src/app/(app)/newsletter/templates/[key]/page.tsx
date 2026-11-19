import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { PageToolbar } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { newsBrand } from "@/lib/newsletter/brand";
import { withTheme } from "@/lib/newsletter/blocks";
import { renderEmail } from "@/lib/newsletter/render";
import { SAMPLE_PRODUCTS, templateByKey, withSamples } from "@/lib/newsletter/templates";
import { MailFrame } from "../../mail-frame";

export const metadata = { title: "Template · Zeronix Newsletter" };

export default async function TemplatePage({ params, searchParams }: PageProps<"/newsletter/templates/[key]">) {
  await requireApp("newsletter");
  const { key } = await params;
  const sp = await searchParams;
  const theme = typeof sp.theme === "string" ? sp.theme : "";
  const t = templateByKey(key);
  if (!t) notFound();
  const { brand, previewSrc } = await newsBrand();
  const { html } = renderEmail({ doc: withTheme(withSamples(t.doc), theme), subject: t.subject, preheader: t.preheader, products: SAMPLE_PRODUCTS, brand, logoSrc: previewSrc, firstName: "", unsubUrl: "#", reason: "" });
  return (
    <div className="grid gap-3">
      <PageToolbar title={t.name} meta={t.blurb}>
        <BackButton fallback="/newsletter/templates" />
        <Button size="sm" nativeButton={false} render={<Link href={`/newsletter/campaigns/new?template=${t.key}${theme ? `&theme=${theme}` : ""}`} />}>
          Use this template
        </Button>
      </PageToolbar>
      <MailFrame html={html} title={t.name} height={1300} />
    </div>
  );
}
