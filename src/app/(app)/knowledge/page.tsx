import { ARTICLES, articleText, SECTIONS } from "@/content/knowledge";
import { KnowledgeIndex } from "./knowledge-search";

export const metadata = { title: "Knowledge · Zeronix" };

export default function KnowledgePage() {
  const items = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    section: SECTIONS.find((s) => s.key === a.section)!.title,
    text: `${a.tags.join(" ")} ${articleText(a)}`,
  }));
  return <KnowledgeIndex items={items} sections={SECTIONS} />;
}
