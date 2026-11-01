import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { getProduct, industryOptions, listBrands, listCategories } from "@/lib/website/catalog";
import { ProductForm } from "./product-form";

export const metadata = { title: "Product · Zeronix Website" };

export default async function ProductPage({ params }: PageProps<"/website/products/[id]">) {
  await requireApp("website");
  const { id } = await params;
  const isNew = id === "new";
  const row = isNew ? null : await getProduct(Number(id));
  if (!isNew && !row) notFound();
  const [categories, brands, industries] = await Promise.all([listCategories(), listBrands(), industryOptions()]);
  const siteUrl = process.env.SITE_PUBLIC_URL ?? "https://zeronixtech.com";
  const category = categories.find((c) => c.id === row?.categoryId);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <BackButton fallback="/website/products" />
        <h1 className="text-sm font-semibold">{row?.name ?? "New product"}</h1>
        {row?.status === "published" && category && (
          <a href={`${siteUrl}/products/${category.slug}/${row.slug}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-muted-foreground hover:underline">
            View on the site ↗
          </a>
        )}
      </div>
      <ProductForm
        id={row?.id}
        initial={row ? { ...row, specsChecked: false, links: row.links } : undefined}
        checkedAt={row?.specsCheckedAt?.toISOString() ?? null}
        categories={categories.map((c) => ({ id: c.id, name: c.name, specTemplate: c.specTemplate }))}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        industries={industries}
      />
    </div>
  );
}
