import { Lightbulb } from "lucide-react";
import { type Block, headingId } from "@/content/knowledge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Renders an article's blocks (headings, paragraphs, lists, tables, tip boxes, screenshots). */
export function ArticleView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="grid gap-4 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if ("h" in b)
          return (
            <h2 key={i} id={headingId(b.h)} className="mt-2 scroll-mt-16 text-lg font-semibold tracking-tight">
              {b.h}
            </h2>
          );
        if ("img" in b)
          return (
            <figure key={i} className="grid gap-1.5">
              <a href={b.img} target="_blank" rel="noreferrer" title="Open full size" className="block overflow-hidden rounded-lg border bg-muted shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots, shown at their own size */}
                <img src={b.img} alt={b.alt} loading="lazy" className="block h-auto w-full" />
              </a>
              {b.caption && <figcaption className="text-xs text-muted-foreground">{b.caption}</figcaption>}
            </figure>
          );
        if ("p" in b) return <p key={i}>{b.p}</p>;
        if ("ul" in b)
          return (
            <ul key={i} className="grid list-disc gap-1.5 pl-5">
              {b.ul.map((t, j) => <li key={j}>{t}</li>)}
            </ul>
          );
        if ("ol" in b)
          return (
            <ol key={i} className="grid list-decimal gap-1.5 pl-5">
              {b.ol.map((t, j) => <li key={j}>{t}</li>)}
            </ol>
          );
        if ("tip" in b)
          return (
            <aside key={i} className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>{b.tip}</p>
            </aside>
          );
        return (
          <div key={i} className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {b.table.head.map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.table.rows.map((r, ri) => (
                  <TableRow key={ri}>
                    {r.map((c, ci) => (
                      <TableCell key={ci} className={ci === 0 ? "align-top font-medium" : "align-top whitespace-normal"}>{c}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
