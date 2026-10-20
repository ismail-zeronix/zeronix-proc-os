import { dubaiDayNumber } from "@/lib/dates";
import { HARDWARE } from "./hardware";
import { SALES } from "./sales";
import type { Article, Block, SectionKey, Tip } from "./types";
import { UAE } from "./uae";

export type { Article, Block, SectionKey, Tip } from "./types";

export const SECTIONS: { key: SectionKey; title: string; blurb: string }[] = [
  { key: "hardware", title: "Hardware guide", blurb: "Laptops, workstations, servers and processors." },
  { key: "sales", title: "Sales playbook", blurb: "How to deal with corporates, talk to customers and spot a genuine lead." },
  { key: "uae", title: "Finding customers in the UAE", blurb: "Where new customers come from, and how to reach them." },
];

export const ARTICLES: Article[] = [...HARDWARE, ...SALES, ...UAE];

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);

/** Plain text of one block, for search. */
function blockText(b: Block): string {
  if ("h" in b) return b.h;
  if ("p" in b) return b.p;
  if ("tip" in b) return b.tip;
  if ("ul" in b) return b.ul.join(" ");
  if ("ol" in b) return b.ol.join(" ");
  return [...b.table.head, ...b.table.rows.flat()].join(" ");
}

export const articleText = (a: Article) => a.blocks.map(blockText).join(" ");

/** All the "tip" boxes in the articles: the pool for the home screen's tip of the day. */
export const TIPS: Tip[] = ARTICLES.flatMap((a) =>
  a.blocks.flatMap((b) => ("tip" in b ? [{ text: b.tip, slug: a.slug }] : [])),
);

/** Same tip for everybody on a given day. */
export function tipOfTheDay(now = new Date()): Tip {
  return TIPS[dubaiDayNumber(now) % TIPS.length];
}
