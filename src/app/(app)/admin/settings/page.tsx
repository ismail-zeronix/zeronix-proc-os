import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Bell, Building2, Clock, FileText, FolderKanban, Receipt, Scale } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { UrlTabs } from "@/components/url-tabs";
import { requireApp } from "@/lib/auth/session";
import { getBrand, getBrandRow, getDocBrand } from "@/lib/brand";
import { getPriceListLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/db";
import { AdminSettings, QuoteSettings, WorkHoursSettings } from "../admin-ui";
import { BrandCard } from "../brand-ui";
import { DocumentBrandCard } from "../doc-brand-ui";
import { ProjectTypeSettings } from "../projects-ui";
import { hostedEngines, ollamaModels } from "../data";
import { NotifySettings } from "../notify-ui";
import { ruleConfigs, RULES } from "@/lib/notifications/rules";


export const metadata = { title: "Settings · Admin · Zeronix" };

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const me = (await requireApp("admin")).user;
  const [{ tab }, settings, models, engines, { version, ...brand }] = await Promise.all([searchParams, getSettings(), ollamaModels(), hostedEngines(), getBrand()]);
  const [health, types, templates, docBrand, brandRow, mailboxes] = await Promise.all([
    getPriceListLlm().then((llm) => llm.health()),
    db.select().from(schema.projectTypes).orderBy(asc(schema.projectTypes.position), asc(schema.projectTypes.label)),
    db.select().from(schema.projectTaskTemplates),
    getDocBrand(),
    getBrandRow(),
    db
      .select({ id: schema.mailAccounts.id, address: schema.mailAccounts.imapUser, owner: schema.users.name, enabled: schema.mailAccounts.enabled })
      .from(schema.mailAccounts)
      .innerJoin(schema.users, eq(schema.users.id, schema.mailAccounts.userId))
      .orderBy(asc(schema.mailAccounts.imapUser)),
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
                <p className="rounded-lg border bg-card px-3 py-2 text-sm">
                  Our TRN, invoice numbers, credit terms and bank details have moved to{" "}
                  <Link href="/accounts/settings" className="font-medium underline">
                    Accounts › Settings
                  </Link>
                  .
                </p>
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
            content: <AdminSettings settings={settings} models={models} engines={engines} health={health} />,
          },
          {
            key: "notifications",
            label: "Notifications",
            icon: <Bell />,
            content: <NotifySettings rules={[...RULES]} configs={ruleConfigs(settings.notify_rules)} mailboxes={mailboxes} digestFrom={settings.notify_digest_from} />,
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
