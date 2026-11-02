import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { Action, SectionHeading, Tag } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import { CompareTable } from "@/components/catalog/compare-table";
import { Breadcrumbs, CtaStrip, Faq, JsonLd, ProductTile, quoteLink, type Crumb } from "@/components/catalog/page-parts";
import type { SiteBrand, SitePostPage } from "@/lib/contract";
import { SITE_URL } from "@/lib/defaults";
import { AuthorAvatar, Byline, PostGrid, TYPE_LABEL } from "./post-card";

const PROSE =
  "prose prose-lg max-w-none prose-headings:scroll-mt-28 prose-headings:font-heading prose-headings:font-medium prose-headings:tracking-tight prose-a:text-forest-700 prose-a:underline-offset-2 prose-strong:text-ink prose-img:rounded-card prose-table:text-base prose-th:text-left";

/** Ranked picks: rank, label, the product card, and why it is on the list. */
function Picks({ post }: { post: SitePostPage }) {
  return (
    <section id="picks" className="scroll-mt-28">
      <h2 className="font-heading text-3xl font-medium tracking-tight">Our picks</h2>
      <ol className="mt-8 grid gap-5">
        {post.picks.map((p, i) => (
          <li key={p.slug} className="grid grid-cols-[minmax(0,1fr)] gap-5 rounded-card bg-white p-3 md:grid-cols-[18rem_minmax(0,1fr)]">
            <ProductTile p={p} />
            <div className="grid content-start gap-4 p-2 md:p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-forest-900 font-heading font-semibold text-lime-400">{i + 1}</span>
                {p.label && <Tag>{p.label}</Tag>}
              </div>
              <h3 className="text-2xl font-medium">{p.name}</h3>
              {p.verdict && <p className="text-muted-ink">{p.verdict}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                {p.pros.length > 0 && (
                  <ul className="grid gap-2 text-sm">
                    {p.pros.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-forest-700" /> {x}
                      </li>
                    ))}
                  </ul>
                )}
                {p.cons.length > 0 && (
                  <ul className="grid gap-2 text-sm">
                    {p.cons.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Minus className="mt-0.5 size-4 shrink-0 text-muted-ink" /> {x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InlineCta({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="not-prose my-10 flex flex-col gap-5 rounded-card bg-lime-400 p-6 text-forest-950 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-heading text-xl font-medium">{text || "Want B2B pricing on these models?"}</p>
      <Action href={href} variant="dark">
        {label}
      </Action>
    </div>
  );
}

/** A guide or blog post (BRAND.md): sage header with the byline, cover, contents + body, picks, comparison, FAQ, author. */
export function Article({ post, brand, crumbs }: { post: SitePostPage; brand: SiteBrand; crumbs: Crumb[] }) {
  const quote = quoteLink({ industry: post.industry?.slug, product: post.picks[0]?.slug });
  const compareInline = post.blocks.some((b) => b.kind === "compare");
  const url = `${SITE_URL}${post.path}`;
  const toc = [...post.toc, ...(post.picks.length ? [{ id: "picks", text: "Our picks" }] : []), ...(post.faq.length ? [{ id: "faq", text: "FAQ" }] : [])];

  return (
    <>
      <section className="frame mt-2 bg-sage-100">
        <div className="container-site grid gap-6 py-6 sm:py-8">
          <Breadcrumbs items={crumbs} />
          <div className="flex flex-wrap gap-2">
            <Tag>{TYPE_LABEL[post.type]}</Tag>
            {post.industry && (
              <Link href={`/industries/${post.industry.slug}`}>
                <Tag className="hover:border-forest-700/40">{post.industry.name}</Tag>
              </Link>
            )}
          </div>
          <h1 className="max-w-4xl text-2xl leading-tight font-medium tracking-tight text-ink sm:text-[2rem]">{post.title}</h1>
          {post.excerpt && <p className="max-w-3xl text-lead text-muted-ink">{post.excerpt}</p>}
          <Byline author={post.author} date={post.publishedAt} minutes={post.readingMinutes} />
        </div>
      </section>

      {post.cover && (
        <div className="container-site pt-8">
          <Photo src={post.cover.src} subject={post.cover.alt} ratio="21:9" priority sizes="(min-width: 1280px) 1240px, 100vw" className="rounded-frame" />
        </div>
      )}

      <div className="container-site grid grid-cols-[minmax(0,1fr)] gap-6 py-6 sm:py-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {toc.length > 2 ? (
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-28 grid gap-1 border-l border-line pl-4 text-sm">
              <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">On this page</p>
              {toc.map((t) => (
                <a key={t.id} href={`#${t.id}`} className="py-1 text-muted-ink hover:text-forest-700">
                  {t.text}
                </a>
              ))}
            </nav>
          </aside>
        ) : (
          <div className="hidden lg:block" />
        )}

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <div className={PROSE}>
            {post.blocks.map((b, i) =>
              b.kind === "html" ? (
                <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
              ) : b.kind === "product" ? (
                <div key={i} className="not-prose my-8 max-w-sm">
                  <ProductTile p={b.product} />
                </div>
              ) : b.kind === "compare" && post.picks.length >= 2 ? (
                <div key={i} className="not-prose my-10">
                  <CompareTable products={post.picks} groups={post.compare} />
                </div>
              ) : b.kind === "cta" ? (
                <InlineCta key={i} text={b.text || post.ctaText} href={quote} label={brand.ctaLabel} />
              ) : null,
            )}
          </div>

          {post.picks.length > 0 && <Picks post={post} />}

          {post.picks.length >= 2 && !compareInline && (
            <section>
              <h2 className="font-heading text-3xl font-medium tracking-tight">Side by side</h2>
              <div className="mt-8">
                <CompareTable products={post.picks} groups={post.compare} />
              </div>
            </section>
          )}

          {post.author && (
            <section className="flex items-center gap-4 rounded-card bg-white p-6">
              <AuthorAvatar name={post.author.name} className="size-14 text-lg" />
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">Written by</p>
                <Link href={`/blog/author/${post.author.slug}`} className="text-lg font-semibold hover:underline">
                  {post.author.name}
                </Link>
                {post.author.jobTitle && <p className="text-sm text-muted-ink">{post.author.jobTitle}, {brand.name}</p>}
              </div>
            </section>
          )}
        </div>
      </div>

      <div id="faq" className="scroll-mt-28">
        <Faq items={post.faq} />
      </div>

      {post.related.length > 0 && (
        <section className="container-site pb-20">
          <SectionHeading tag="Keep reading" title="Related" />
          <div className="mt-5">
            <PostGrid posts={post.related} />
          </div>
        </section>
      )}

      <CtaStrip title={post.ctaText || "Equipping a team? Get B2B pricing."} text="Tell us how many people and which roles. We reply with a shortlist and pricing, usually within a working day." quoteHref={quote} label={brand.ctaLabel} />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": post.type === "article" ? "BlogPosting" : "Article",
          headline: post.title,
          description: post.seo.description || post.excerpt,
          image: post.cover ? [`${SITE_URL}${post.cover.src}`] : undefined,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          mainEntityOfPage: url,
          keywords: post.keywords.join(", ") || undefined,
          author: post.author ? { "@type": "Person", name: post.author.name, jobTitle: post.author.jobTitle || undefined, url: `${SITE_URL}/blog/author/${post.author.slug}` } : { "@type": "Organization", name: brand.name },
          publisher: { "@type": "Organization", name: brand.name, url: SITE_URL },
          ...(post.schema ?? {}),
        }}
      />
      {post.picks.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: post.title,
            itemListElement: post.picks.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/products/${p.categorySlug}/${p.slug}`, name: p.name })),
          }}
        />
      )}
    </>
  );
}
