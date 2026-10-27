import Link from "next/link";
import { ARTICLES, SECTIONS } from "@/content/knowledge";
import { SectionIcon } from "./section-icon";

export const metadata = { title: "Knowledge · Zeronix" };

/** The viewing area before an article is picked: one card per category, opening its first article. Phones get the tree instead. */
export default function KnowledgePage() {
  return (
    <div className="hidden gap-3 lg:grid">
      <div>
        <h1 className="text-base font-semibold">Knowledge</h1>
        <p className="text-xs text-muted-foreground">{ARTICLES.length} articles: how to use the portal apps, the hardware guide, the sales playbook and finding customers. Pick a topic on the left.</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {SECTIONS.map((s) => {
          const list = ARTICLES.filter((a) => a.section === s.key);
          if (!list.length) return null;
          return (
            <section key={s.key} className="rounded-lg border bg-card" aria-label={s.title}>
              <Link href={`/knowledge/${list[0].slug}`} className="flex items-start gap-2.5 border-b px-3 py-2.5 hover:bg-muted/50">
                <SectionIcon section={s.key} />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{s.title}</h2>
                  <p className="text-xs text-muted-foreground">{s.blurb}</p>
                </div>
              </Link>
              <ul className="p-1">
                {list.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/knowledge/${a.slug}`} className="block rounded-md px-2.5 py-1.5 hover:bg-muted" title={a.summary}>
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{a.summary}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
