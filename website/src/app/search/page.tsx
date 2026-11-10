import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, ProductGrid } from "@/components/catalog/page-parts";
import { getSearch } from "@/lib/api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const scope = typeof sp.in === "string" ? sp.in : "";
  const { products: found, posts } = q ? await getSearch(q) : { products: [], posts: [] };
  // categories among the results, most hits first: chips to narrow down (or widen again)
  const cats = [...found.reduce((m, p) => m.set(p.categorySlug, { slug: p.categorySlug, name: p.category, n: (m.get(p.categorySlug)?.n ?? 0) + 1 }), new Map<string, { slug: string; name: string; n: number }>()).values()].sort((a, b) => b.n - a.n);
  const active = cats.some((c) => c.slug === scope) ? scope : "";
  const products = active ? found.filter((p) => p.categorySlug === active) : found;
  const href = (c: string) => `/search?${new URLSearchParams({ q, ...(c ? { in: c } : {}) })}`;
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors";
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
      {cats.length > 1 && (
        <nav aria-label="Narrow by category" className="scroll-row items-center sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Link href={href("")} className={cn(chip, !active ? "border-brand-900 bg-brand-900 text-white" : "border-line bg-white hover:border-brand-700/40")}>
            All <span className="text-xs opacity-60">{found.length}</span>
          </Link>
          {cats.map((c) => (
            <Link key={c.slug} href={href(c.slug)} className={cn(chip, active === c.slug ? "border-brand-900 bg-brand-900 text-white" : "border-line bg-white hover:border-brand-700/40")}>
              {c.name} <span className="text-xs opacity-60">{c.n}</span>
            </Link>
          ))}
        </nav>
      )}
      {products.length > 0 && <ProductGrid products={products} />}
      {posts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Guides and services</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {posts.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="block rounded-card border border-line/70 bg-white px-4 py-3 transition-colors hover:border-brand-900">
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
            Try a shorter word or a part number, browse <Link href="/products" className="font-semibold text-brand-800 underline">all products</Link>, or{" "}
            <Link href="/quote" className="font-semibold text-brand-800 underline">
              ask us for it
            </Link>
            : we source most business IT within days.
          </p>
        </div>
      )}
    </div>
  );
}
