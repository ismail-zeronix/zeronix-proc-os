import Link from "next/link";
import { ArrowCircle, Tag } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import type { SiteAuthor, SitePostSummary } from "@/lib/contract";
import { imageFor } from "@/lib/images";
import { cn } from "@/lib/utils";

export const TYPE_LABEL: Record<string, string> = { guide: "Buying guide", comparison: "Comparison", article: "Blog", industry_page: "Industry guide", page: "Page", service: "IT service" };

/** The uploaded cover, else a service's picture in public/images (service-<slug>.webp). */
export const coverSrc = (post: Pick<SitePostSummary, "cover" | "type" | "slug">) => post.cover?.src ?? (post.type === "service" ? imageFor(`service-${post.slug}`) : undefined);

export const postDate =(iso: string) => new Date(iso).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });

/** Initials in a navy circle: the byline until authors have photos. */
export function AuthorAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-brand-900 font-heading text-sm font-semibold text-highlight", className)}>
      {initials}
    </span>
  );
}

export function Byline({ author, date, minutes }: { author: SiteAuthor | null; date: string; minutes: number }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-ink">
      {author && <AuthorAvatar name={author.name} className="size-8 text-xs" />}
      <span>
        {author && (
          <Link href={`/blog/author/${author.slug}`} className="font-medium text-ink hover:underline">
            {author.name}
          </Link>
        )}
        {author && " · "}
        <time dateTime={date}>{postDate(date)}</time> · {minutes} min read
      </span>
    </div>
  );
}

export function PostCard({ post, className }: { post: SitePostSummary; className?: string }) {
  return (
    <article className={cn("group relative flex h-full flex-col rounded-card bg-white p-2 transition-shadow duration-200 hover:shadow-lift", className)}>
      <Photo src={coverSrc(post)} subject={post.title} ratio="16:9" sizes="(min-width: 1024px) 33vw, 100vw" />
      <div className="flex flex-1 flex-col gap-3 px-3 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <Tag>{post.industry?.name ?? (post.category || TYPE_LABEL[post.type])}</Tag>
          <ArrowCircle />
        </div>
        <h3 className="text-lg leading-snug font-semibold">
          <Link href={post.path} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="line-clamp-2 text-sm text-muted-ink">{post.excerpt}</p>}
        <div className="mt-auto pt-2 text-xs text-muted-ink">
          {post.author ? `${post.author.name} · ` : ""}
          {postDate(post.publishedAt)} · {post.readingMinutes} min read
        </div>
      </div>
    </article>
  );
}

export function PostGrid({ posts }: { posts: SitePostSummary[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <PostCard key={p.slug} post={p} className="reveal" />
      ))}
    </div>
  );
}
