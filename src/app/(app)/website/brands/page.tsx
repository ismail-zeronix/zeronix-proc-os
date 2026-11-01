import { requireApp } from "@/lib/auth/session";
import { listBrands } from "@/lib/website/catalog";
import { BrandsTable } from "./brands-table";

export const metadata = { title: "Brands · Zeronix Website" };

export default async function BrandsPage() {
  await requireApp("website");
  const rows = await listBrands();
  return (
    <div className="grid max-w-5xl gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Brands</h1>
        <span className="text-xs text-muted-foreground">Shown as names (no logos), each with a page at /brands/slug</span>
      </div>
      <BrandsTable rows={rows} />
    </div>
  );
}
