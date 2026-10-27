import { PortalHeader } from "@/components/portal-header";
import { ARTICLES, articleText, headingId, SECTIONS } from "@/content/knowledge";
import { requireApp } from "@/lib/auth/session";
import { KnowledgeTree } from "./knowledge-tree";

/** Knowledge: the contents tree on the left stays put while the article on the right changes. */
export default async function KnowledgeLayout({ children }: LayoutProps<"/knowledge">) {
  await requireApp("knowledge");
  const items = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    section: a.section,
    headings: a.blocks.flatMap((b) => ("h" in b ? [{ id: headingId(b.h), text: b.h }] : [])),
    text: `${a.tags.join(" ")} ${articleText(a)}`,
  }));
  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-start gap-4 p-3 md:p-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <KnowledgeTree items={items} sections={SECTIONS} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
