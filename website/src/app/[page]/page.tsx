import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs, CtaStrip, quoteLink } from "@/components/catalog/page-parts";
import { getPost, getSettings } from "@/lib/api";

export const revalidate = 600;

/**
 * Company pages (about, privacy, terms, delivery-warranty...): posts of type "page", written and published in the
 * portal's Website › Content like any post, shown at the root of the site. Any other post type has its own address.
 */

const prose =
  "prose prose-lg max-w-none prose-headings:font-heading prose-headings:font-medium prose-headings:tracking-tight prose-a:text-forest-700 prose-a:underline-offset-2 prose-strong:text-ink prose-table:text-base prose-th:text-left";

export async function generateMetadata({ params }: PageProps<"/[page]">): Promise<Metadata> {
  const p = await getPost((await params).page);
  if (!p || p.type !== "page") return {};
  return { title: p.seo.title || p.title, description: p.seo.description || p.excerpt, alternates: { canonical: p.path } };
}

export default async function CompanyPage({ params }: PageProps<"/[page]">) {
  const [p, { brand }] = await Promise.all([getPost((await params).page), getSettings()]);
  if (!p) notFound();
  if (p.type !== "page") permanentRedirect(p.path);
  return (
    <>
      <article className="container-site grid gap-6 py-6 lg:py-8">
        <Breadcrumbs items={[{ href: p.path, label: p.title }]} />
        <h1 className="max-w-3xl text-h2">{p.title}</h1>
        {p.excerpt && <p className="max-w-3xl text-lead text-muted-ink">{p.excerpt}</p>}
        <div className={`${prose} max-w-3xl`}>
          {p.blocks.map((b, i) => (b.kind === "html" ? <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} /> : null))}
        </div>
        <p className="text-sm text-muted-ink">Last updated {new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </article>
      <CtaStrip title="Equipping a team?" text="Tell us your industry and how many people. We reply with a shortlist and B2B pricing, usually within a working day." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
