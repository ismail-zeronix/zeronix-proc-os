import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/catalog/page-parts";
import { PostList } from "@/components/content/post-list";
import { getAuthor, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";

export async function generateMetadata({ params }: PageProps<"/blog/author/[slug]">): Promise<Metadata> {
  const a = await getAuthor((await params).slug);
  if (!a) return {};
  return { title: `${a.author.name}${a.author.jobTitle ? `, ${a.author.jobTitle}` : ""}`, alternates: { canonical: `/blog/author/${a.author.slug}` } };
}

/** Author page: every byline links here (Person data for search engines, so expertise is attributed). */
export default async function AuthorPage({ params }: PageProps<"/blog/author/[slug]">) {
  const [a, { brand }] = await Promise.all([getAuthor((await params).slug), getSettings()]);
  if (!a) notFound();
  const n = a.posts.length;
  return (
    <>
      <PostList
        brand={brand}
        data={{ contract: a.contract, posts: a.posts, total: n }}
        page={1}
        base={`/blog/author/${a.author.slug}`}
        crumbs={[
          { href: "/blog", label: "Blog" },
          { href: `/blog/author/${a.author.slug}`, label: a.author.name },
        ]}
        tag="Author"
        title={a.author.name}
        lead={`${a.author.jobTitle ? `${a.author.jobTitle} at ${brand.name}. ` : ""}${n} published guide${n === 1 ? "" : "s"} and post${n === 1 ? "" : "s"}.`}
        empty=""
      />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Person", name: a.author.name, jobTitle: a.author.jobTitle || undefined, worksFor: { "@type": "Organization", name: brand.name }, url: `${SITE_URL}/blog/author/${a.author.slug}` }} />
    </>
  );
}
