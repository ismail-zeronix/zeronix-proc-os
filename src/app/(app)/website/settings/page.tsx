import { requireApp } from "@/lib/auth/session";
import { getGsc } from "@/lib/website/gsc";
import { getBrand } from "@/lib/website/settings";
import { BrandForm } from "./brand-form";
import { GscForm } from "./gsc-form";

export const metadata = { title: "Settings · Zeronix Website" };

export default async function WebsiteSettingsPage() {
  const { user } = await requireApp("website");
  const [brand, gsc] = await Promise.all([getBrand(), getGsc()]);

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
        <h2 className="text-sm font-semibold">Google Search Console</h2>
        <GscForm
          canEdit={user.role === "admin"}
          gsc={{ property: gsc?.property ?? "", clientEmail: gsc?.clientEmail ?? "", connected: Boolean(gsc?.credentials), lastImportAt: gsc?.lastImportAt ?? null, lastError: gsc?.lastError ?? "", backfilled: Boolean(gsc?.backfilled) }}
        />
      </section>
    </div>
  );
}
