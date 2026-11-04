import { Plus } from "lucide-react";
import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listCategories, listProducts, type ProductFilter } from "@/lib/website/catalog";
import { getStore } from "@/lib/website/store";
import { ProductBulkActions, ProductFilters } from "../bulk-actions";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "../status-badge";
import { ListingImport } from "./listing-import";
import { ProductUpload } from "./product-upload";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Products · Zeronix Website" };

const STATUSES = ["draft", "published", "archived"] as const;

export default async function ProductsPage({ searchParams }: PageProps<"/website/products">) {
  const { user } = await requireApp("website");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const page = pageParam(sp.page);
  const category = one(sp.category);
  const filter: ProductFilter = {
    q: one(sp.q).trim().slice(0, 120) || undefined,
    status: STATUSES.find((s) => s === one(sp.status)),
    categoryId: category !== "" && Number.isInteger(Number(category)) && Number(category) >= 0 ? Number(category) : undefined,
  };
  const [{ rows, total }, store, categories] = await Promise.all([listProducts({ ...filter, page, pageSize: PAGE_SIZE }), getStore(), listCategories()]);
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Products</h1>
        <span className="text-xs text-muted-foreground">Import a listing, upload a product .md, or add one by hand</span>
        <span className="ml-auto" />
        <ListingImport markup={store.markupPercent} />
        <ProductUpload />
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/website/products/new" />}>
          <Plus /> New product
        </Button>
      </div>
      <ProductFilters categories={categoryOptions} />
      <DataTable
        noun="product"
        total={total}
        empty={filter.q || filter.status || filter.categoryId !== undefined ? "No products match these filters." : "No products yet. Import a listing or upload a product .md."}
        actions={<ProductBulkActions filter={filter} categories={categoryOptions} canDelete={user.role === "admin"} />}
        pager={<Pager path="/website/products" params={sp} page={page} total={total} showSingle />}
        columns={[
          { label: "Product" },
          { label: "Part number" },
          { label: "Brand" },
          { label: "Category" },
          { label: "Sold as", className: "text-right whitespace-nowrap" },
          { label: "Specs", className: "text-right" },
          { label: "Pictures", className: "text-right" },
          { label: "Industries", className: "text-right" },
          { label: "Status" },
          { label: "Updated", className: "whitespace-nowrap" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: [
            <Link key="n" href={`/website/products/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </Link>,
            <span key="m" className="text-muted-foreground">
              {r.mpn}
            </span>,
            r.brand ?? "—",
            r.category ?? <span className="text-amber-700 dark:text-amber-500">Pick one</span>,
            <span key="p" className="tabular-nums">
              {r.priceMode === "public" && r.listPrice ? `AED ${Number(r.listPrice).toLocaleString("en-US")}` : <span className="text-muted-foreground">Quote</span>}
            </span>,
            <span key="s" className="tabular-nums">
              {r.specs}
            </span>,
            r.images > 0 ? (
              <span key="i" className="tabular-nums">
                {r.images}
              </span>
            ) : r.pictureStatus === "queued" ? (
              <span key="i" className="text-muted-foreground" title={r.pictureError || "The worker fetches them within a few minutes"}>
                Fetching…
              </span>
            ) : r.pictureStatus === "failed" ? (
              <span key="i" className="text-red-700 dark:text-red-400" title={r.pictureError ?? ""}>
                Failed
              </span>
            ) : (
              <span key="i" className="text-amber-700 dark:text-amber-500">
                None
              </span>
            ),
            <span key="d" className="tabular-nums">
              {r.industries}
            </span>,
            <StatusBadge key="st" status={r.status} />,
            <span key="u" className="text-muted-foreground">
              {ago(r.updatedAt)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
