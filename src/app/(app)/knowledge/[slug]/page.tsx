import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/article-view";
import { articleBySlug, ARTICLES, SECTIONS } from "@/content/knowledge";
import { requireApp } from "@/lib/auth/session";
import { SectionIcon } from "../section-icon";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/knowledge/[slug]">) {
  const a = articleBySlug((await params).slug);
  return { title: `${a?.title ?? "Knowledge"} · Zeronix` };
}

/** One article in the viewing area: a one-row header, the text at a comfortable reading width, previous / next at the end. */
export default async function ArticlePage({ params }: PageProps<"/knowledge/[slug]">) {
  await requireApp("knowledge");
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const section = SECTIONS.find((s) => s.key === a.section)!;
  const at = ARTICLES.indexOf(a);
  const prev = ARTICLES[at - 1];
  const next = ARTICLES[at + 1];
  const reviewed = new Date(a.reviewed + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid max-w-4xl gap-3">
      <div className="flex items-center gap-2">
        <div className="lg:hidden">
          <BackButton fallback="/knowledge" />
        </div>
        <SectionIcon section={a.section} />
        <div className="grid min-w-0 gap-0.5">
          <h1 className="text-base font-semibold">{a.title}</h1>
          <p className="text-xs text-muted-foreground">
            {section.title} · reviewed {reviewed}
          </p>
        </div>
      </div>
      <article className="rounded-lg border bg-card p-4 md:p-6">
        <p className="mb-4 text-sm text-muted-foreground">{a.summary}</p>
        <ArticleView blocks={a.blocks} />
      </article>
      <nav className="grid gap-2 sm:grid-cols-2" aria-label="More articles">
        {prev ? (
          <Link href={`/knowledge/${prev.slug}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted">
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Previous</span>
              <span className="block truncate text-sm font-medium">{prev.title}</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/knowledge/${next.slug}`} className="flex items-center justify-end gap-2 rounded-lg border bg-card px-3 py-2 text-right hover:bg-muted">
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Next</span>
              <span className="block truncate text-sm font-medium">{next.title}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </nav>
    </div>
  );
}
