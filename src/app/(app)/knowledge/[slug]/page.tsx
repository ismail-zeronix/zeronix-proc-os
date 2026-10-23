import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/article-view";
import { articleBySlug, ARTICLES, SECTIONS } from "@/content/knowledge";
import { requireApp } from "@/lib/auth/session";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/knowledge/[slug]">) {
  const a = articleBySlug((await params).slug);
  return { title: `${a?.title ?? "Knowledge"} · Zeronix` };
}

/** One article: a one-row header, the text at a comfortable reading width, and the rest of its section on the side. */
export default async function ArticlePage({ params }: PageProps<"/knowledge/[slug]">) {
  await requireApp("knowledge");
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const section = SECTIONS.find((s) => s.key === a.section)!;
  const siblings = ARTICLES.filter((x) => x.section === a.section);
  const reviewed = new Date(a.reviewed + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <BackButton fallback="/knowledge" />
        <div className="grid min-w-0 gap-0.5">
          <h1 className="text-base font-semibold">{a.title}</h1>
          <p className="text-xs text-muted-foreground">
            {section.title} · reviewed {reviewed}
          </p>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="max-w-3xl rounded-lg border bg-card p-4 md:p-6">
          <p className="mb-4 text-sm text-muted-foreground">{a.summary}</p>
          <ArticleView blocks={a.blocks} />
        </article>
        <nav className="sticky top-16 hidden rounded-lg border bg-card p-1 lg:block" aria-label={`More in ${section.title}`}>
          <p className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{section.title}</p>
          {siblings.map((s) => (
            <Link
              key={s.slug}
              href={`/knowledge/${s.slug}`}
              aria-current={s.slug === a.slug ? "page" : undefined}
              className={`block rounded-md px-2.5 py-1.5 text-sm ${s.slug === a.slug ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {s.title}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
