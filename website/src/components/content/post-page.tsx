import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCategory, getPost, getSettings } from "@/lib/api";
import { Article, type ArticleProducts } from "./article";
import { quoteLink } from "@/components/catalog/page-parts";
import { VC_NAMES, VC_PARENT, VC_SUBS } from "@/lib/seo-categories";

/** Shared by /guides/[slug], /blog/[slug] and /services/[slug]: each post has one address, the others redirect to it. */

export async function postMetadata(slug: string): Promise<Metadata> {
  const p = await getPost(slug);
  if (!p) return {};
  const title = p.seo.title || postTitle(p.type, p.title);
  const description = p.seo.description || postDescription(p.type, p.excerpt, p.title);
  return {
    title,
    description,
    keywords: p.keywords.length ? p.keywords : undefined,
    alternates: { canonical: p.path },
    openGraph: { type: "article", title, description, publishedTime: p.publishedAt, modifiedTime: p.updatedAt, authors: p.author ? [p.author.name] : undefined, images: p.cover ? [p.cover.src] : undefined },
  };
}

export async function PostPage({ slug, section }: { slug: string; section: "guides" | "blog" | "services" }) {
  const [p, { brand }] = await Promise.all([getPost(slug), getSettings()]);
  if (!p) notFound();
  if (!p.path.startsWith(`/${section}/`)) permanentRedirect(p.path);
  const crumb = section === "guides" ? { href: "/guides", label: "Guides" } : section === "services" ? { href: "/services", label: "Services" } : { href: "/blog", label: "Blog" };
  // product links only to categories that exist (the meeting-room ones are created from Website › Categories)
  let products = SERVICE_PRODUCTS[p.slug];
  if (products) {
    const ok = await Promise.all(products.links.map((l) => (l.href.startsWith("/products/") ? getCategory(l.href.split("/")[2]).then(Boolean).catch(() => false) : true)));
    products = { ...products, links: products.links.filter((_, i) => ok[i]) };
  }
  return <Article post={p} brand={brand} crumbs={[crumb, { href: p.path, label: p.title }]} products={products} />;
}

const cut = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

/** Search title by kind (the layout adds " · Zeronix Tech"; 45 characters leaves room for it). */
function postTitle(type: string, title: string): string {
  const pick = (...tries: string[]) => tries.find((t) => t.length <= 45) ?? cut(title, 45);
  if (type === "service") return pick(`${title} in Dubai, UAE`, `${title} in the UAE`, title);
  if (type === "guide" || type === "comparison") return pick(`${title}: UAE buying guide`, `${title} (UAE guide)`, title);
  return pick(title);
}

/** Search description by kind, under 155 characters, ending with what to do next. */
function postDescription(type: string, excerpt: string, title: string): string {
  const tail =
    type === "service" ? " Quote and site visit from our Dubai team." : type === "guide" || type === "comparison" ? " With UAE prices and B2B quotes." : " From Zeronix Tech, Dubai.";
  return cut(excerpt || title, 155 - tail.length) + tail;
}

/**
 * Service pages that should lead to hardware (SEO audit task 3): the meeting-room service sends people to the
 * video conferencing product categories, and its main action asks for product pricing.
 */
const SERVICE_PRODUCTS: Record<string, ArticleProducts> = {
  "av-meeting-rooms": {
    title: "Meeting room hardware we supply",
    text: "Choose the equipment for your rooms, or send us the room sizes and platform and we quote complete systems with installation.",
    links: [VC_PARENT, ...VC_SUBS].map((x) => ({ href: `/products/${x}`, label: VC_NAMES[x] })).concat([{ href: "/video-conferencing/dubai", label: "Video conferencing in Dubai" }]),
    cta: { label: "Get product pricing", href: quoteLink({ category: VC_PARENT }) },
  },
};
