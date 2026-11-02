import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getPost, getSettings } from "@/lib/api";
import { Article } from "./article";

/** Shared by /guides/[slug], /blog/[slug] and /services/[slug]: each post has one address, the others redirect to it. */

export async function postMetadata(slug: string): Promise<Metadata> {
  const p = await getPost(slug);
  if (!p) return {};
  const title = p.seo.title || p.title;
  const description = p.seo.description || p.excerpt;
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
  return <Article post={p} brand={brand} crumbs={[crumb, { href: p.path, label: p.title }]} />;
}
