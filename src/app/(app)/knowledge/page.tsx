import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ARTICLES, articleText, SECTIONS } from "@/content/knowledge";
import { KnowledgeSearch } from "./knowledge-search";

export const metadata = { title: "Knowledge · Zeronix" };

export default function KnowledgePage() {
  const items = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    section: SECTIONS.find((s) => s.key === a.section)!.title,
    text: `${a.tags.join(" ")} ${articleText(a)}`,
  }));
  return (
    <div className="grid gap-6">
      <PageHeader title="Knowledge" description="Hardware guide, sales playbook and ideas for finding customers." />
      <KnowledgeSearch items={items} />
      {SECTIONS.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
            <CardDescription>{s.blurb}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-0.5">
            {ARTICLES.filter((a) => a.section === s.key).map((a) => (
              <Link
                key={a.slug}
                href={`/knowledge/${a.slug}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.summary}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
