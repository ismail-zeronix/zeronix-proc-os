import { asc, desc } from "drizzle-orm";
import { Building2, Clock, FileText, FolderKanban, Receipt, Scale } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { UrlTabs } from "@/components/url-tabs";
import { requireApp } from "@/lib/auth/session";
import { getBrand, getBrandRow, getDocBrand } from "@/lib/brand";
import { getLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/db";
import { AdminSettings, DocumentSettings, QuoteSettings, WorkHoursSettings } from "../admin-ui";
import { BrandCard } from "../brand-ui";
import { DocumentBrandCard } from "../doc-brand-ui";
import { ProjectTypeSettings } from "../projects-ui";
import { ollamaModels } from "../data";


export const metadata = { title: "Settings · Admin · Zeronix" };

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const me = (await requireApp("admin")).user;
  const [{ tab }, settings, models, { version, ...brand }] = await Promise.all([searchParams, getSettings(), ollamaModels(), getBrand()]);
  const [health, [last], types, templates, docBrand, brandRow] = await Promise.all([
    getLlm(settings.llm_model).health(),
    db.select({ number: schema.invoices.number }).from(schema.invoices).orderBy(desc(schema.invoices.createdAt)).limit(1),
    db.select().from(schema.projectTypes).orderBy(asc(schema.projectTypes.position), asc(schema.projectTypes.label)),
    db.select().from(schema.projectTaskTemplates),
    getDocBrand(),
    getBrandRow(),
  ]);

  return (
    <div className="grid gap-3">
      <PageToolbar title="Settings" meta="Defaults for the whole portal" />
      <UrlTabs
        initial={tab}
        tabs={[
          { key: "hours", label: "Work hours", icon: <Clock />, content: <WorkHoursSettings settings={settings} /> },
          { key: "quotes", label: "Quotes", icon: <FileText />, content: <QuoteSettings settings={settings} /> },
          {
            key: "documents",
            label: "Documents",
            icon: <Receipt />,
            content: (
              <div className="grid gap-3">
                <DocumentSettings settings={settings} lastIssued={last?.number ?? null} />
                <DocumentBrandCard
                  initial={{
                    docEmail: brandRow?.docEmail ?? "",
                    docPhones: brandRow?.docPhones ?? "",
                    tradeLicense: brandRow?.tradeLicense ?? "",
                    logoDarkSrc: docBrand.logoDarkSrc,
                    signatureSrc: docBrand.signatureSrc,
                    stampSrc: docBrand.stampSrc,
                  }}
                />
              </div>
            ),
          },
          {
            key: "projects",
            label: "Projects",
            icon: <FolderKanban />,
            content: <ProjectTypeSettings types={types} templates={templates} />,
          },
          {
            key: "comparison",
            label: "AI & comparison",
            icon: <Scale />,
            content: <AdminSettings settings={settings} models={models} health={health} />,
          },
          {
            key: "branding",
            label: "Email branding",
            icon: <Building2 />,
            content: <BrandCard brand={brand} version={version} sample={{ name: me.name, email: me.email }} />,
          },
        ]}
      />
    </div>
  );
}
