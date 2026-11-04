import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { requireApp } from "@/lib/auth/session";
import { listBrands } from "@/lib/website/catalog";
import { BrandsTable } from "./brands-table";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Brands · Zeronix Website" };

export default async function BrandsPage({ searchParams }: PageProps<"/website/brands">) {
  await requireApp("website");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const all = await listBrands();
  return (
    <div className={`${LIST_PAGE} max-w-5xl`}>
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Brands</h1>
        <span className="text-xs text-muted-foreground">Shown as names (no logos), each with a page at /brands/slug</span>
      </div>
      <BrandsTable rows={all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} total={all.length} pager={<Pager path="/website/brands" params={sp} page={page} total={all.length} showSingle />} />
    </div>
  );
}
