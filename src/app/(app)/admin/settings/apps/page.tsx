import Link from "next/link";
import { appByKey, type AppKey } from "@/lib/apps";
import { requireSettings, viewerOfAccess } from "@/lib/settings/access";
import { sectionsFor } from "@/lib/settings/registry";

export const metadata = { title: "App settings · Settings" };

/** Every app the company uses that has settings, with links to them: one place to find them all. */
export default async function AppSettingsPage() {
  const access = await requireSettings("apps");
  const sections = sectionsFor(viewerOfAccess(access)).filter((s) => s.home !== "admin");
  const homes = [...new Set(sections.map((s) => s.home))] as AppKey[];
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-0.5">
        <h2 className="text-sm font-semibold">App settings</h2>
        <p className="text-xs text-muted-foreground">How each app works is set in the app itself. These are the apps you use that have settings.</p>
      </div>
      {homes.length === 0 ? (
        <p className="text-sm text-muted-foreground">None of your apps has settings of its own.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {homes.map((home) => {
            const app = appByKey(home);
            const Icon = app.icon;
            return (
              <li key={home} className="grid content-start gap-1.5 rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4" style={{ color: app.color }} aria-hidden />
                  {app.label}
                </div>
                <ul className="grid gap-1">
                  {sections
                    .filter((s) => s.home === home)
                    .map((s) => (
                      <li key={s.key} className="text-sm">
                        <Link href={s.href} className="font-medium underline-offset-2 hover:underline">
                          {s.label}
                        </Link>
                        <span className="text-muted-foreground"> · {s.hint}</span>
                      </li>
                    ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
