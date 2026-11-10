import { requireApp } from "@/lib/auth/session";
import { getDfs } from "@/lib/website/dataforseo";
import { DFS_DEFAULTS, monthOf, spentIn } from "@/lib/website/dataforseo-core";
import { getGsc } from "@/lib/website/gsc";
import { dubaiDay } from "@/lib/website/traffic";
import { DataForSeoForm } from "./dataforseo-form";
import { getBrand } from "@/lib/website/settings";
import { getStore } from "@/lib/website/store";
import { storeMailboxes } from "@/lib/website/store-mail";
import { salesPeople } from "@/lib/website/web-to-sales";
import { BrandForm } from "./brand-form";
import { GscForm } from "./gsc-form";
import { StoreForm } from "./store-form";

export const metadata = { title: "Settings · Zeronix Website" };

export default async function WebsiteSettingsPage() {
  const { user } = await requireApp("website");
  const [brand, gsc, store, mailboxes, owners, dfs] = await Promise.all([getBrand(), getGsc(), getStore(), storeMailboxes(), salesPeople(), getDfs()]);

  return (
    <div className="grid max-w-3xl gap-3">
      <div>
        <h1 className="text-sm font-semibold">Website settings</h1>
        <p className="text-xs text-muted-foreground">Brand and contact details shown on every page of zeronixtech.com.{user.role !== "admin" && " Only an admin can change them."}</p>
      </div>
      <section className="rounded-lg border bg-card p-3">
        <BrandForm brand={brand} canEdit={user.role === "admin"} />
      </section>
      <section className="grid gap-2 rounded-lg border bg-card p-3">
        <h2 className="text-sm font-semibold">Store</h2>
        <StoreForm store={store} mailboxes={mailboxes} owners={owners} canEdit={user.role === "admin"} />
      </section>
      <section className="grid gap-2 rounded-lg border bg-card p-3">
        <h2 className="text-sm font-semibold">Google Search Console</h2>
        <GscForm
          canEdit={user.role === "admin"}
          gsc={{ property: gsc?.property ?? "", clientEmail: gsc?.clientEmail ?? "", connected: Boolean(gsc?.credentials), lastImportAt: gsc?.lastImportAt ?? null, lastError: gsc?.lastError ?? "", backfilled: Boolean(gsc?.backfilled) }}
        />
      </section>
      <section className="grid gap-2 rounded-lg border bg-card p-3">
        <h2 className="text-sm font-semibold">DataForSEO (search volumes, rankings, competitors)</h2>
        <DataForSeoForm
          canEdit={user.role === "admin"}
          dfs={{
            login: dfs?.login ?? "",
            connected: Boolean(dfs?.login && dfs.password),
            budgetUsd: dfs?.budgetUsd ?? DFS_DEFAULTS.budgetUsd,
            spentUsd: dfs ? spentIn(dfs, monthOf(dubaiDay())) : 0,
            competitors: dfs?.competitors ?? DFS_DEFAULTS.competitors,
            lastError: dfs?.lastError ?? "",
          }}
        />
      </section>
    </div>
  );
}
