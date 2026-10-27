/**
 * Project proposals: a document made of blocks (cover, quotation header, headings, text, tables, the BOQ price,
 * payment schedule, bank details, terms, signatures...). Safe for client components: the editor, the server actions and
 * the print page all use these shapes. The layout follows Zeronix's own project proposals (dark cover, numbered
 * sections, bordered quotation table, signature and stamp).
 */
import { z } from "zod";

/** Tiptap's JSON document (rich text). Checked loosely here; the editor and the print renderer only know a fixed set of nodes. */
export type RichDoc = { type: "doc"; content?: unknown[] };

export const BLOCK_TYPES = [
  { key: "cover", label: "Cover page", hint: "Dark cover: logo, title, customer, reference, validity" },
  { key: "quote_header", label: "Quotation header", hint: "Our details, quotation no., date, valid until, customer" },
  { key: "heading", label: "Heading", hint: "A numbered section title" },
  { key: "text", label: "Text", hint: "Paragraphs, lists, bold, links" },
  { key: "table", label: "Table", hint: "A grid, or label / value rows" },
  { key: "pricing", label: "Price (BOQ)", hint: "The BOQ of this project, always up to date" },
  { key: "payment", label: "Payment schedule", hint: "Advance, progress and final payments" },
  { key: "bank", label: "Bank details", hint: "Our bank account for the payments" },
  { key: "timeline", label: "Timeline", hint: "Phases and how long each takes" },
  { key: "terms", label: "Terms", hint: "Warranty, exclusions, conditions" },
  { key: "signature", label: "Signatures", hint: "Signature and stamp, customer acceptance" },
  { key: "divider", label: "Divider", hint: "A thin line" },
  { key: "page_break", label: "Page break", hint: "Start a new page when printed" },
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number]["key"];
export const blockTypeLabel = (k: string) => BLOCK_TYPES.find((b) => b.key === k)?.label ?? k;

const str = (max: number) => z.string().max(max);
const doc = z.looseObject({ type: z.literal("doc"), content: z.array(z.unknown()).max(2000).optional() }) as unknown as z.ZodType<RichDoc>;

const id = z.string().min(1).max(40);
export const blockSchema = z.discriminatedUnion("type", [
  // customerAddress: typed on the cover (the CRM keeps no postal address); older proposals have none
  z.object({
    id,
    type: z.literal("cover"),
    data: z.object({
      title: str(200),
      subtitle: str(300),
      customerAddress: str(500).default(""),
    }),
  }),
  z.object({ id, type: z.literal("quote_header"), data: z.object({ heading: str(60) }) }),
  z.object({ id, type: z.literal("heading"), data: z.object({ text: str(200), level: z.union([z.literal(1), z.literal(2)]) }) }),
  z.object({ id, type: z.literal("text"), data: z.object({ doc, style: z.enum(["plain", "callout"]) }) }),
  z.object({
    id,
    type: z.literal("table"),
    // "spec": label / value rows with the label in bold (e.g. the proposed solution); "grid": an ordinary table
    data: z.object({ header: z.boolean(), style: z.enum(["grid", "spec"]).default("grid"), rows: z.array(z.array(str(1000)).min(1).max(8)).min(1).max(100) }),
  }),
  z.object({ id, type: z.literal("pricing"), data: z.object({ title: str(200), display: z.enum(["items", "sections"]), showOptional: z.boolean() }) }),
  z.object({
    id,
    type: z.literal("payment"),
    data: z.object({ title: str(200), rows: z.array(z.object({ label: str(200), percent: z.number().min(0).max(100) })).max(12) }),
  }),
  z.object({ id, type: z.literal("bank"), data: z.object({ title: str(200) }) }),
  z.object({ id, type: z.literal("timeline"), data: z.object({ title: str(200), rows: z.array(z.object({ phase: str(200), duration: str(100) })).max(30) }) }),
  z.object({ id, type: z.literal("terms"), data: z.object({ title: str(200), doc }) }),
  z.object({ id, type: z.literal("signature"), data: z.object({ ourLabel: str(100), customerLabel: str(100), note: str(500) }) }),
  z.object({ id, type: z.literal("divider"), data: z.object({}) }),
  z.object({ id, type: z.literal("page_break"), data: z.object({}) }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/** At most this many blocks, and this much JSON, in one proposal (a long proposal is ~40 blocks and ~60 KB). */
export const MAX_BLOCKS = 200;
export const MAX_JSON = 800_000;
export const blocksSchema = z
  .array(blockSchema)
  .max(MAX_BLOCKS, `A proposal can have up to ${MAX_BLOCKS} blocks.`)
  .refine((b) => JSON.stringify(b).length <= MAX_JSON, "This proposal is too large to save. Split long text or remove some blocks.")
  .refine((b) => new Set(b.map((x) => x.id)).size === b.length, "Two blocks have the same id.");

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** "ZERONIX TECHNOLOGY LLC" (as typed in the brand) reads better as "Zeronix Technology LLC" in a document. */
export function displayCompany(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Llc|Fze|Fzco|Fzllc|Dmcc|Uae|It)\b/g, (w) => w.toUpperCase());
}

/** Project quotes stay open longer than product quotes: the customer has a site and a scope to agree. */
export const PROJECT_VALID_DAYS = 14;

/** Main headings are numbered in order ("1. Introduction"); a heading the writer numbered already is left alone. */
export function headingNumbers(blocks: Block[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const b of blocks) if (b.type === "heading" && b.data.level === 1 && !/^\s*\d+[.)]/.test(b.data.text)) out.set(b.id, ++n);
  return out;
}

// ---------- rich text helpers (for built-in content) ----------

type Inline = string | { text: string; bold?: boolean };
const inline = (parts: Inline[]) => parts.map((p) => (typeof p === "string" ? { type: "text", text: p } : { type: "text", text: p.text, marks: p.bold ? [{ type: "bold" }] : [] }));
export const para = (...parts: Inline[]) => ({ type: "paragraph", content: parts.length && parts.some((p) => (typeof p === "string" ? p : p.text)) ? inline(parts) : undefined });
export const bullets = (...items: string[]) => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [para(t)] })) });
export const numbered = (...items: string[]) => ({ type: "orderedList", content: items.map((t) => ({ type: "listItem", content: [para(t)] })) });
export const richDoc = (...content: object[]): RichDoc => ({ type: "doc", content: content.length ? content : [para()] });

/** Plain text of a rich document (outline labels, search, empty checks). */
export function docText(d: RichDoc | undefined, max = 200): string {
  let out = "";
  const walk = (n: unknown) => {
    if (out.length >= max || !n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text" && node.text) out += node.text;
    if (node.content) {
      for (const c of node.content) walk(c);
      if (node.type === "paragraph" || node.type === "listItem") out += " ";
    }
  };
  walk(d);
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- new blocks and labels ----------

export function newBlock(type: BlockType): Block {
  const i = newId();
  switch (type) {
    case "cover":
      return { id: i, type, data: { title: "Project proposal", subtitle: "", customerAddress: "" } };
    case "quote_header":
      return { id: i, type, data: { heading: "Quotation" } };
    case "heading":
      return { id: i, type, data: { text: "", level: 1 } };
    case "text":
      return { id: i, type, data: { doc: richDoc(), style: "plain" } };
    case "table":
      return { id: i, type, data: { header: true, style: "grid", rows: [["Item", "Details"], ["", ""]] } };
    case "pricing":
      return { id: i, type, data: { title: "", display: "items", showOptional: true } };
    case "payment":
      return { id: i, type, data: { title: "Payment schedule", rows: PAYMENT_DEFAULT.map((r) => ({ ...r })) } };
    case "bank":
      return { id: i, type, data: { title: "Bank details for payment" } };
    case "timeline":
      return { id: i, type, data: { title: "Timeline", rows: [{ phase: "", duration: "" }] } };
    case "terms":
      return { id: i, type, data: { title: "Terms and conditions", doc: richDoc() } };
    case "signature":
      return { id: i, type, data: { ourLabel: "For Zeronix Technology LLC", customerLabel: "Accepted by the Customer", note: "" } };
    case "divider":
      return { id: i, type, data: {} };
    case "page_break":
      return { id: i, type, data: {} };
  }
}

/** A copy of a block with a new id (duplicate, templates). */
export const cloneBlock = (b: Block): Block => ({ ...structuredClone(b), id: newId() });

/** The name a block has in the outline. */
export function blockLabel(b: Block): string {
  switch (b.type) {
    case "cover":
      return b.data.title.trim() || "Cover page";
    case "quote_header":
      return b.data.heading.trim() ? `${b.data.heading.trim()} header` : "Quotation header";
    case "heading":
      return b.data.text.trim() || "Heading";
    case "text":
      return docText(b.data.doc, 60) || (b.data.style === "callout" ? "Note" : "Text");
    case "pricing":
      return b.data.title.trim() || "Price (BOQ)";
    case "terms":
    case "payment":
    case "timeline":
    case "bank":
      return b.data.title.trim() || blockTypeLabel(b.type);
    default:
      return blockTypeLabel(b.type);
  }
}

/** How Zeronix usually asks for project payments: half with the order, half at handover. */
export const PAYMENT_DEFAULT = [
  { label: "Advance with the purchase order", percent: 50 },
  { label: "On completion and handover", percent: 50 },
];

/** Splits a total by percentages, rounding each part to fils so the parts add up to the total exactly. */
export function splitByPercent(total: number, percents: number[]): number[] {
  const cents = Math.round(total * 100);
  const parts = percents.map((p) => Math.floor((cents * p) / 100));
  const sumPct = percents.reduce((s, p) => s + p, 0);
  // only when the schedule adds up to 100% does the remainder go to the last line
  if (Math.abs(sumPct - 100) < 1e-9 && parts.length) parts[parts.length - 1] += cents - parts.reduce((s, p) => s + p, 0);
  return parts.map((c) => c / 100);
}

// ---------- built-in texts ----------

const EXCLUSIONS = [
  "Civil work, core drilling through structure, false ceiling cutting and refixing, and any building, landlord or authority permission are not included.",
  "Cabling is priced for the routes seen at the site survey. A significantly longer route or special conduit work will be quoted separately.",
  "Network rack or cabinet, UPS, power points near the equipment, and the internet connection and router are not included unless listed in the quotation table.",
  "Any item or work not listed in the quotation table is excluded and can be quoted separately if required.",
  "The customer will confirm equipment locations before installation starts.",
  "The customer will provide site access during working hours and a single point of contact for the project.",
];

function conditions(company: string, validDays: number, typeKey: string): string[] {
  return [
    "All prices are quoted in UAE Dirhams (AED). VAT at 5% is shown in the quotation table.",
    `This quotation is valid for ${validDays} days from the date of issue.`,
    "Payment terms are as per the payment schedule above.",
    "The delivery and installation schedule will be confirmed on receipt of the purchase order and advance payment, and is subject to stock availability.",
    "The quotation is based on the quantities listed. Any additional equipment, cabling length, materials or work will be charged separately and agreed in writing before the work is carried out.",
    ...(typeKey === "cctv" ? ["Storage retention depends on camera settings. Recording days will be advised after configuration."] : []),
    "Warranty coverage follows the manufacturer warranty policy for each product.",
    "Orders once confirmed cannot be cancelled. Goods sold are not returnable except under manufacturer warranty.",
    `All equipment remains the property of ${company} until full payment is received.`,
    `${company} is not responsible for delays caused by site readiness, permissions, access restrictions or third parties.`,
    "On completion of the project the customer will sign a certificate of completion.",
    `Please issue the LPO in favour of ${company}.`,
  ];
}

/** Standard texts offered by "Standard text" in a terms block (the library adds the ones people saved). */
export const STANDARD_TERMS: { key: string; title: string; doc: RichDoc }[] = [
  {
    key: "warranty",
    title: "Warranty",
    doc: richDoc(
      numbered(
        "All equipment carries the manufacturer's warranty. Warranty claims are handled through us, so you have one point of contact.",
        "Our installation work is warranted for 12 months from the handover date.",
        "Faults caused by misuse, power problems, changes made by others or physical damage are not covered.",
      ),
    ),
  },
  { key: "exclusions", title: "Exclusions and customer responsibilities", doc: richDoc(numbered(...EXCLUSIONS)) },
  { key: "conditions", title: "Terms and conditions", doc: richDoc(numbered(...conditions("Zeronix Technology LLC", PROJECT_VALID_DAYS, ""))) },
  {
    key: "site",
    title: "Site requirements",
    doc: richDoc(
      numbered(
        "Clear access to all work areas during agreed working hours.",
        "Power available at the rack and equipment locations.",
        "A contact person on site who can approve positions and routes.",
      ),
    ),
  },
];

export interface DefaultInput {
  typeKey: string;
  typeLabel: string;
  dealTitle: string;
  requirement: string;
  customer: string;
  site: string;
  /** Our legal name, as printed in the terms and the signature ("Zeronix Technology LLC"). */
  company: string;
  /** The BOQ so far, to fill the proposed solution table: section names and their lines. */
  boq: { section: string; lines: { qty: number; unit: string; description: string; optional: boolean }[] }[];
  validDays?: number;
}

/**
 * The standard proposal, laid out like Zeronix's own: dark cover, quotation header, then numbered sections
 * (introduction, scope of work, proposed solution, exclusions, deliverables, quotation), payment schedule, bank details,
 * terms and conditions, signature and stamp.
 */
export function defaultProposal(p: DefaultInput): Block[] {
  const b = <T extends BlockType>(type: T, data: BlockOf<T>["data"]) => ({ id: newId(), type, data }) as Block;
  const h = (text: string) => b("heading", { text, level: 1 });
  const validDays = p.validDays ?? PROJECT_VALID_DAYS;
  const req = p.requirement.trim();
  const solution = p.boq
    .map((s) => ({ section: s.section, items: s.lines.filter((l) => !l.optional) }))
    .filter((s) => s.items.length)
    .map((s) => [s.section || "Equipment", s.items.map((l) => `${l.qty}${l.unit && l.unit !== "nos" ? ` ${l.unit}` : " x"} ${l.description}`).join("; ")]);
  return [
    b("cover", { title: `${p.typeLabel} project proposal`, subtitle: p.dealTitle, customerAddress: "" }),
    b("quote_header", { heading: "Quotation" }),
    h("Introduction"),
    b("text", {
      style: "plain",
      doc: richDoc(
        para(
          "Thank you for the opportunity to submit our proposal. We are pleased to offer a complete ",
          { text: `${p.typeLabel} solution`, bold: true },
          ` for ${p.customer}`,
          ...(p.site ? [", for the site at ", { text: p.site.split(/\r?\n/)[0], bold: true }] : []),
          ".",
          ...(req ? [` The solution covers ${req.split(/\r?\n/).filter(Boolean).join("; ").replace(/\.$/, "")}.`] : []),
        ),
        para(
          "This is a complete project quotation. It includes supply of the equipment, cabling, accessories, installation, configuration, testing and handover. Prices are valid for ",
          { text: `${validDays} days`, bold: true },
          " from the date of issue.",
        ),
      ),
    }),
    h("Scope of Work"),
    b("text", {
      style: "plain",
      doc: richDoc(
        numbered(
          "Supply of the equipment listed in the quotation table.",
          "Supply and installation of the cabling and accessories required.",
          "Mounting and installation of all equipment, with termination and labelling of all cables.",
          "Configuration of the system, including remote access where it applies.",
          "Testing, commissioning, user training and handover to the customer.",
        ),
      ),
    }),
    h("Proposed Solution"),
    b("table", {
      header: false,
      style: "spec",
      rows: [...(solution.length ? solution : [["Equipment", ""]]), ["Services", "Installation, configuration, testing, commissioning and handover"]],
    }),
    h("Exclusions and Customer Responsibilities"),
    b("text", { style: "plain", doc: richDoc(numbered(...EXCLUSIONS)) }),
    h("Deliverables"),
    b("text", {
      style: "plain",
      doc: richDoc(
        numbered(
          "All equipment listed in the quotation table, delivered to site.",
          "All equipment installed, cabled, configured and working.",
          "Remote viewing or access set up on the customer's devices where it applies.",
          "User training and a tested, working system handed over to the customer.",
        ),
      ),
    }),
    h("Quotation"),
    b("pricing", { title: "", display: "items", showOptional: true }),
    b("payment", { title: "Payment schedule", rows: PAYMENT_DEFAULT.map((r) => ({ ...r })) }),
    b("bank", { title: "Bank details for payment" }),
    h("Terms and Conditions"),
    b("text", { style: "plain", doc: richDoc(numbered(...conditions(p.company, validDays, p.typeKey))) }),
    b("signature", { ourLabel: `For ${p.company}`, customerLabel: "Accepted by the Customer", note: "" }),
  ];
}
