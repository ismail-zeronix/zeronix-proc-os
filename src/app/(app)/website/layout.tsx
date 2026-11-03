import { DatabaseZap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { siteDbReachable } from "@/db/site";
import { requireApp } from "@/lib/auth/session";
import { quoteCounts } from "@/lib/website/quotes";
import { orderCounts } from "@/lib/website/store";

export default async function WebsiteLayout({ children }: LayoutProps<"/website">) {
  await requireApp("website");
  // Everything in this app reads the website's own database. When it is missing or down, say so here instead of
  // failing page by page; the rest of ZeronixOS does not use it and carries on as normal.
  const leads = await quoteCounts().then(
    (c) => c.new ?? 0,
    () => null,
  );
  if (leads === null) {
    const db = await siteDbReachable();
    return (
      <AppShell app="website">
        <section className="mx-auto mt-8 grid max-w-xl gap-2 rounded-lg border bg-card p-4 text-sm">
          <h1 className="flex items-center gap-2 font-semibold">
            <DatabaseZap className="size-4 text-amber-600" aria-hidden /> The website database is not reachable
          </h1>
          <p className="text-muted-foreground">
            The Website app keeps its content, leads and analytics in its own database (zeronix-site-db), apart from ZeronixOS. Other apps are not affected.
          </p>
          <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{db.ok ? "Connected, but a query failed. Check the app log and run the migrations." : db.detail}</p>
          <p className="text-muted-foreground">
            Production: set SITE_POSTGRES_PASSWORD in .env and run production/deploy.sh. Local: <code className="text-xs">docker compose up -d site-db</code> then{" "}
            <code className="text-xs">npm run db:migrate</code>.
          </p>
        </section>
      </AppShell>
    );
  }
  // new B2B pricing requests wait on the Leads item until someone converts them or marks them as spam, and new web
  // orders wait on Orders until someone confirms them
  const orders = await orderCounts().then(
    (c) => c.new ?? 0,
    () => 0,
  );
  return (
    <AppShell app="website" badges={{ leads, orders }}>
      {children}
    </AppShell>
  );
}
