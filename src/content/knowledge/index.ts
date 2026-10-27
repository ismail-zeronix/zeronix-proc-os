import { dubaiDayNumber } from "@/lib/dates";
import { CRM_GUIDE } from "./guide-crm";
import { PROJECTS_GUIDE } from "./guide-projects";
import { SALES_GUIDE } from "./guide-sales";
import { HARDWARE } from "./hardware";
import { PORTAL } from "./portal";
import { SALES } from "./sales";
import type { Article, Block, SectionKey, Tip } from "./types";
import { UAE } from "./uae";

export type { Article, Block, SectionKey, Tip } from "./types";

/** The categories of the Knowledge tree, in the order shown. The app guides use the app's own icon (knowledge-tree.tsx). */
export const SECTIONS: { key: SectionKey; title: string; blurb: string }[] = [
  { key: "portal", title: "Using the portal", blurb: "The daily routine and the steps from quote to money." },
  { key: "crm", title: "CRM app", blurb: "Leads, deals, companies and contacts: everything before the customer says yes." },
  { key: "sales", title: "Sales app", blurb: "Customers, quotes and sales orders." },
  { key: "projects", title: "Projects app", blurb: "Site work: BOQ, proposal, checklist and handover." },
  { key: "hardware", title: "Hardware guide", blurb: "Laptops, workstations, servers and processors." },
  { key: "playbook", title: "Sales playbook", blurb: "How to deal with corporates, talk to customers and spot a genuine lead." },
  { key: "uae", title: "Finding customers in the UAE", blurb: "Where new customers come from, and how to reach them." },
];

export const ARTICLES: Article[] = [...PORTAL, ...CRM_GUIDE, ...SALES_GUIDE, ...PROJECTS_GUIDE, ...HARDWARE, ...SALES, ...UAE];

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);

/** Plain text of one block, for search. */
function blockText(b: Block): string {
  if ("h" in b) return b.h;
  if ("p" in b) return b.p;
  if ("tip" in b) return b.tip;
  if ("ul" in b) return b.ul.join(" ");
  if ("ol" in b) return b.ol.join(" ");
  if ("img" in b) return `${b.alt} ${b.caption ?? ""}`;
  return [...b.table.head, ...b.table.rows.flat()].join(" ");
}

export const articleText = (a: Article) => a.blocks.map(blockText).join(" ");

/** Anchor id of a heading, so the tree can jump to it ("Step 2: quote it" → "step-2-quote-it"). */
export const headingId = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** All the "tip" boxes in the articles: the pool for the home screen's tip of the day. */
export const TIPS: Tip[] = ARTICLES.flatMap((a) =>
  a.blocks.flatMap((b) => ("tip" in b ? [{ text: b.tip, slug: a.slug }] : [])),
);

/** Same tip for everybody on a given day. */
export function tipOfTheDay(now = new Date()): Tip {
  return TIPS[dubaiDayNumber(now) % TIPS.length];
}
