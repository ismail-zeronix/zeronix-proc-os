import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Bell, Building2, Clock, FolderKanban, Receipt, Scale } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { UrlTabs } from "@/components/url-tabs";
import { requireApp } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand";
import { getPriceListLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/db";
import { AdminSettings, WorkHoursSettings } from "../admin-ui";
import { BrandCard } from "../brand-ui";
import { ProjectTypeSettings } from "../projects-ui";
import { hostedEngines, ollamaModels } from "../data";
import { NotifySettings } from "../notify-ui";
import { ruleConfigs, RULES } from "@/lib/notifications/rules";


export const metadata = { title: "Settings · Admin · Zeronix" };

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const me = (await requireApp("admin")).user;
  const [{ tab }, settings, models, engines, { version, ...brand }] = await Promise.all([searchParams, getSettings(), ollamaModels(), hostedEngines(), getBrand()]);
  const [health, types, templates, mailboxes] = await Promise.all([
    getPriceListLlm().then((llm) => llm.health()),
    db.select().from(schema.projectTypes).orderBy(asc(schema.projectTypes.position), asc(schema.projectTypes.label)),
    db.select().from(schema.projectTaskTemplates),
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
          {
            key: "documents",
            label: "Documents",
            icon: <Receipt />,
            content: (
              <div className="grid gap-2 rounded-lg border bg-card px-3 py-3 text-sm">
                <p>Everything printed for customers is set up in Accounts settings:</p>
                <ul className="grid gap-1">
                  {[
                    ["/accounts/settings/templates", "Templates", "how quotes, invoices and notes look"],
                    ["/accounts/settings/letterhead", "Letterhead", "contact lines, white logo, signature and stamp"],
                    ["/accounts/settings/quotes", "Quote defaults", "margin, validity, VAT, terms and the quote email"],
                    ["/accounts/settings/documents", "Invoice defaults", "credit terms; bank details come from Bank and cash accounts"],
                  ].map(([href, label, hint]) => (
                    <li key={href}>
                      <Link href={href} className="font-medium underline">
                        {label}
                      </Link>{" "}
                      <span className="text-muted-foreground">· {hint}</span>
                    </li>
                  ))}
                </ul>
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
            label: "Company & branding",
            icon: <Building2 />,
            content: <BrandCard brand={brand} version={version} sample={{ name: me.name, email: me.email }} zeronixPreset={process.env.MULTI_TENANT !== "true"} />,
          },
        ]}
      />
    </div>
  );
}
