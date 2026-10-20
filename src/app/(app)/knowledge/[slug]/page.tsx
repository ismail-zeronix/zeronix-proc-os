import { notFound } from "next/navigation";
import { ArticleView } from "@/components/article-view";
import { PageHeader } from "@/components/page-header";
import { articleBySlug, ARTICLES } from "@/content/knowledge";
import { requireApp } from "@/lib/auth/session";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/knowledge/[slug]">) {
  const a = articleBySlug((await params).slug);
  return { title: `${a?.title ?? "Knowledge"} · Zeronix` };
}

export default async function ArticlePage({ params }: PageProps<"/knowledge/[slug]">) {
  await requireApp("knowledge");
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/knowledge", label: "Knowledge" }}
        title={a.title}
        description={`${a.summary} Last reviewed ${new Date(a.reviewed + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`}
      />
      <ArticleView blocks={a.blocks} />
    </div>
  );
}
