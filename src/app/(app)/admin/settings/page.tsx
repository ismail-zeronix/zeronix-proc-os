import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Bell, Building2, Clock, Database, Download, FolderKanban, Receipt, Scale, Target } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { PageToolbar } from "@/components/page-toolbar";
import { supportEmail } from "@/lib/billing";
import { UrlTabs } from "@/components/url-tabs";
import { requireApp } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/db";
import { AdminSettings, WorkHoursSettings } from "../admin-ui";
import { BrandCard } from "../brand-ui";
import { ProjectTypeSettings } from "../projects-ui";
import { NotifySettings } from "../notify-ui";
import { ROUTINE_RULE_KEYS, ruleConfigs, RULES } from "@/lib/notifications/rules";
import { teamTargets } from "@/lib/routine";
import { zeronixFeatures } from "@/lib/edition";
import { TeamTargetsCard } from "../routine-ui";

export const metadata = { title: "Settings · Admin · Zeronix" };

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const me = (await requireApp("admin")).user;
  // Zeronix's own install shows its sales routine and price comparison too (lib/edition.ts)
  const zeronix = zeronixFeatures();
  const rules = RULES.filter((r) => zeronix || !ROUTINE_RULE_KEYS.has(r.key));
  const [{ tab }, settings, { version, ...brand }] = await Promise.all([searchParams, getSettings(), getBrand()]);
  const [types, templates, mailboxes] = await Promise.all([
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
          ...(zeronix
            ? [{ key: "targets", label: "Sales targets", icon: <Target />, content: <TeamTargetsCard targets={teamTargets(settings.sales_targets)} checkinMinutes={Number(settings.checkin_minutes) || 0} /> }]
            : []),
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
          // price comparison belongs to Procurement, which only Zeronix has
          ...(zeronix ? [{ key: "comparison", label: "Price comparison", icon: <Scale />, content: <AdminSettings settings={settings} /> }] : []),
          {
            key: "notifications",
            label: "Notifications",
            icon: <Bell />,
            content: <NotifySettings rules={rules} configs={ruleConfigs(settings.notify_rules)} mailboxes={mailboxes} digestFrom={settings.notify_digest_from} />,
          },
          {
            key: "branding",
            label: "Company & branding",
            icon: <Building2 />,
            content: <BrandCard brand={brand} version={version} sample={{ name: me.name, email: me.email }} zeronixPreset={zeronix} />,
          },
          // the SaaS install: an organisation's own copy of everything, and how to close the account
          ...(zeronix
            ? []
            : [
                {
                  key: "data",
                  label: "Your data",
                  icon: <Database />,
                  content: (
                    <div className="grid max-w-2xl gap-3 rounded-lg border bg-card px-3 py-3 text-sm">
                      <div className="grid gap-1">
                        <h3 className="font-medium">Download all your data</h3>
                        <p className="text-muted-foreground">
                          One ZIP file: every record as a spreadsheet (CSV) and every uploaded file. Passwords and sign-in keys are never included. Large accounts take a minute;
                          the file downloads by itself when it is ready.
                        </p>
                      </div>
                      <ExportButton url="/api/data-export" label="All your data (ZIP)" className="w-fit" size="sm">
                        <Download /> Download all data
                      </ExportButton>
                      <div className="grid gap-1 border-t pt-3">
                        <h3 className="font-medium">Closing your account</h3>
                        <p className="text-muted-foreground">
                          Write to{" "}
                          <a href={`mailto:${supportEmail()}`} className="underline">
                            {supportEmail()}
                          </a>
                          . We pause the account first, and delete all its data 30 days later. Download your data before you write: nobody can sign in once it is paused.
                        </p>
                      </div>
                    </div>
                  ),
                },
              ]),
        ]}
      />
    </div>
  );
}
