import Link from "next/link";
import { CtaStrip, PageHero, quoteLink, type Crumb } from "@/components/catalog/page-parts";
import type { SiteBrand, SitePostsResponse } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { PostGrid } from "./post-card";

/** A list page of posts (guides, blog, a category, an author) with optional filter chips and paging. */
export function PostList({
  brand,
  data,
  crumbs,
  tag,
  title,
  lead,
  chips,
  page,
  base,
  empty,
}: {
  brand: SiteBrand;
  data: SitePostsResponse;
  crumbs: Crumb[];
  tag: string;
  title: string;
  lead: string;
  chips?: { href: string; label: string; active: boolean }[];
  page: number;
  base: string;
  empty: string;
}) {
  const pages = Math.ceil(data.total / 24);
  return (
    <>
      <PageHero crumbs={crumbs} tag={tag} title={title} lead={lead} />
      <section className="container-site grid gap-5 py-5 sm:py-6">
        {chips && chips.length > 1 && (
          <div className="scroll-row sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {chips.map((c) => (
              <Link key={c.href} href={c.href} className={cn("inline-flex h-8 items-center rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors", c.active ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white hover:border-forest-700/40")}>
                {c.label}
              </Link>
            ))}
          </div>
        )}
        {data.posts.length ? <PostGrid posts={data.posts} /> : <p className="rounded-card bg-white p-10 text-center text-muted-ink">{empty}</p>}
        {pages > 1 && (
          <nav aria-label="Pages" className="flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={n === 1 ? base : `${base}${base.includes("?") ? "&" : "?"}page=${n}`} aria-current={n === page ? "page" : undefined} className={cn("grid size-10 place-items-center rounded-full border text-sm", n === page ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white")}>
                {n}
              </Link>
            ))}
          </nav>
        )}
      </section>
      <CtaStrip title="Prefer to just ask?" text="Tell us what your team does. We'll shortlist the right models and send B2B pricing." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
