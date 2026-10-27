/** A piece of an article. Kept deliberately small: no Markdown library, easy to edit by hand. */
export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { tip: string }
  /** A screenshot from public/help/ (e.g. "/help/crm-deal.webp"), taken from demo data, never real customers. */
  | { img: string; alt: string; caption?: string };

export type SectionKey = "portal" | "crm" | "sales" | "projects" | "hardware" | "playbook" | "uae";

export interface Article {
  slug: string;
  section: SectionKey;
  title: string;
  /** One line shown on the index and in search results. */
  summary: string;
  /** Extra search words. */
  tags: string[];
  /** YYYY-MM-DD the content was last checked by the team. Specs go out of date, so keep this honest. */
  reviewed: string;
  blocks: Block[];
}

export interface Tip {
  text: string;
  /** Article the tip comes from. */
  slug: string;
}
