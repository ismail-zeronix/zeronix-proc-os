import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { industryOptions, listCategories, listProducts } from "@/lib/website/catalog";
import { postPath, type PostInput } from "@/lib/website/post-parse";
import { authorOptions, getPost } from "@/lib/website/posts";
import { StatusBadge } from "../../status-badge";
import { PostEditor } from "./post-editor";
import { PostStats } from "./post-stats";

export const metadata = { title: "Post · Zeronix Website" };

export default async function PostPage({ params }: PageProps<"/website/content/[id]">) {
  const { user } = await requireApp("website");
  const post = await getPost(Number((await params).id));
  if (!post) notFound();
  const [industries, categories, products, authors] = await Promise.all([industryOptions(), listCategories(), listProducts({ pageSize: 1000 }).then((r) => r.rows), authorOptions()]);
  const siteUrl = process.env.SITE_PUBLIC_URL ?? "https://zeronixtech.com";
  const input: PostInput = {
    type: post.type,
    slug: post.slug,
    title: post.title,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    excerpt: post.excerpt,
    body: post.body,
    primaryKeyword: post.primaryKeyword,
    keywords: post.keywords,
    category: post.category,
    tags: post.tags,
    industryId: post.industryId,
    categoryId: post.categoryId,
    products: post.products,
    faq: post.faq,
    schema: post.schema ?? null,
    cover: post.cover ?? null,
    ctaText: post.ctaText,
    authorUserId: post.authorUserId,
    reviewNotes: post.reviewNotes,
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <BackButton fallback="/website/content" />
        <h1 className="line-clamp-1 text-sm font-semibold">{post.title}</h1>
        <StatusBadge status={post.status} />
        {post.status === "published" && (
          <a href={`${siteUrl}${postPath(post.type, post.slug)}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-muted-foreground hover:underline">
            View on the site ↗
          </a>
        )}
      </div>
      {post.status === "published" && <PostStats path={postPath(post.type, post.slug)} />}
      <PostEditor
        id={post.id}
        initial={input}
        status={post.status}
        publishAt={post.publishAt?.toISOString() ?? null}
        checks={post.seoChecks}
        revisions={post.revisions.map((r) => ({ id: r.id, note: r.note, by: r.by ?? "", at: r.createdAt.toISOString() }))}
        industries={industries}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        products={products.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        authors={authors}
        isAdmin={user.role === "admin"}
      />
    </div>
  );
}
