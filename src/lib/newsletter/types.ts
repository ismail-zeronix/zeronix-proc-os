/** Shapes shared by the newsletter renderer, the templates and the screens. Nothing here touches the server. */

export const DEFAULT_SITE = "https://zeronixtech.com";

/** One product card in a newsletter (already resolved from the website catalogue). */
export interface NewsProduct {
  name: string;
  brand: string;
  /** Absolute product page address. */
  url: string;
  /** Absolute image address, or null (the card then shows no picture). */
  image: string | null;
  /** "AED 1,299" for a public price; null = "Request a quote". */
  price: string | null;
}
export type ResolvedProduct = NewsProduct & { id: number };

export type BlockType = "hero" | "heading" | "text" | "image" | "button" | "points" | "stats" | "feature" | "callout" | "products" | "cta" | "divider" | "spacer";

/**
 * One section of a newsletter. All settings are plain text in `p` (numbers too), so one small form can edit every type and
 * the whole design is a single JSON value. `ids` is only used by a products block (website product ids).
 */
export interface Block {
  id: string;
  type: BlockType;
  p: Record<string, string>;
  ids?: number[];
}

/** Fonts are email-safe stacks (every mail app has them or falls back to a similar one). */
export type FontKey = "arial" | "segoe" | "verdana" | "trebuchet" | "georgia" | "times";

export interface NewsStyle {
  headingFont: FontKey;
  bodyFont: FontKey;
  /** Dark colour of the header, hero and footer (#RRGGBB). */
  brand: string;
  /** Colour of buttons and highlights (#RRGGBB). */
  accent: string;
  /** Colour around the 600 px page (#RRGGBB). */
  page: string;
  round: boolean;
  /** Logo band at the top. */
  logo: boolean;
}

export interface NewsDoc {
  v: 1;
  style: NewsStyle;
  blocks: Block[];
}

/** What is stored in a campaign's `fields`: a block design, or pasted HTML code. */
export type NewsFields = { doc?: NewsDoc; html?: string };

export interface TemplateDef {
  key: string;
  name: string;
  /** Short label for the gallery and list. */
  category: string;
  /** The filter chip it appears under in the gallery. */
  group: string;
  blurb: string;
  subject: string;
  preheader: string;
  doc: NewsDoc;
}

/** Who is sending and the legal footer (company name and address come from Admin's brand). */
export interface NewsBrand {
  company: string;
  address: string;
  website: string;
  phone: string;
  email: string;
}

/** Give `doc` for a block design or `html` for pasted code. */
export interface RenderInput {
  doc?: NewsDoc;
  html?: string;
  subject: string;
  preheader: string;
  products: ResolvedProduct[];
  brand: NewsBrand;
  /** Where the header logo is loaded from (an https address, or cid:... in a sent mail); empty = the company name in text. */
  logoSrc: string;
  /** The reader's first name for {name}; empty = "there". */
  firstName: string;
  /** The personal unsubscribe link ("#" in a preview). */
  unsubUrl: string;
  /** Why this person gets the mail ("You are receiving this because ..."). */
  reason: string;
  /** The editor's preview only: makes the text typeable and adds the section toolbar. Never set when mail is sent. */
  edit?: { selectedId?: string | null };
}
