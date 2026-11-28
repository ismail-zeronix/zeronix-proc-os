import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { ExportButton } from "@/components/export-button";
import { supportEmail } from "@/lib/billing";
import { zeronixFeatures } from "@/lib/edition";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Your data · Settings" };

/** The SaaS install: an organisation's own copy of everything, and how to close the account. */
export default async function DataSettingsPage() {
  if (zeronixFeatures()) notFound();
  await requireSettings("data");
  return (
    <section className="grid max-w-2xl gap-3 rounded-xl border bg-card p-4 text-sm">
      <div className="grid gap-1">
        <h2 className="font-semibold">Download all your data</h2>
        <p className="text-muted-foreground">
          One ZIP file: every record as a spreadsheet (CSV) and every uploaded file. Passwords and sign-in keys are never included. Large accounts take a minute; the
          file downloads by itself when it is ready.
        </p>
      </div>
      <ExportButton url="/api/data-export" label="All your data (ZIP)" className="w-fit" size="sm">
        <Download /> Download all data
      </ExportButton>
      <div className="grid gap-1 border-t pt-3">
        <h2 className="font-semibold">Closing your account</h2>
        <p className="text-muted-foreground">
          Write to{" "}
          <a href={`mailto:${supportEmail()}`} className="underline">
            {supportEmail()}
          </a>
          . We pause the account first, and delete all its data 30 days later. Download your data before you write: nobody can sign in once it is paused.
        </p>
      </div>
    </section>
  );
}
