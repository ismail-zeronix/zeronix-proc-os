import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, ProductGrid } from "@/components/catalog/page-parts";
import { getSearch } from "@/lib/api";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 80);
  const { products, posts } = q ? await getSearch(q) : { products: [], posts: [] };
  return (
    <div className="container-site grid gap-5 py-4 sm:py-6">
      <Breadcrumbs items={[{ href: "/search", label: "Search" }]} />
      <div>
        <h1 className="text-h2">{q ? `Results for “${q}”` : "Search"}</h1>
        {q && (
          <p className="mt-1 text-sm text-muted-ink">
            {products.length} product{products.length === 1 ? "" : "s"}
            {posts.length > 0 && `, ${posts.length} guide${posts.length === 1 ? "" : "s"} and pages`}
          </p>
        )}
      </div>
      {products.length > 0 && <ProductGrid products={products} />}
      {posts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Guides and services</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {posts.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="block rounded-card border border-line/70 bg-white px-4 py-3 transition-colors hover:border-forest-900">
                  <span className="block text-sm font-semibold text-ink">{p.title}</span>
                  {p.excerpt && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-ink">{p.excerpt}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {q && !products.length && !posts.length && (
        <div className="rounded-card border border-line/70 bg-white p-5 text-sm">
          <p className="font-semibold">Nothing found for “{q}”.</p>
          <p className="mt-1 text-muted-ink">
            Try a shorter word or a part number, browse <Link href="/products" className="font-semibold text-forest-800 underline">all products</Link>, or{" "}
            <Link href="/quote" className="font-semibold text-forest-800 underline">
              ask us for it
            </Link>
            : we source most business IT within days.
          </p>
        </div>
      )}
    </div>
  );
}
