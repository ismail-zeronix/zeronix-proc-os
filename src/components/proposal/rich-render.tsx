import type { ReactNode } from "react";
import type { RichDoc } from "@/lib/proposal";

/**
 * Draws the editor's rich text (Tiptap JSON) as plain React elements for print and PDF. Only the nodes and marks the
 * editor allows are drawn (paragraphs, lists, line breaks, bold, italic, underline, safe links, alignment); anything else
 * is skipped, and no HTML string is ever injected, so stored content cannot run code on the page.
 */

type Node = { type?: string; text?: string; content?: Node[]; marks?: { type?: string; attrs?: { href?: unknown } }[]; attrs?: { textAlign?: unknown } };

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;
const ALIGN = new Set(["left", "center", "right", "justify"]);

function text(n: Node, key: number): ReactNode {
  let out: ReactNode = n.text ?? "";
  for (const m of n.marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "underline") out = <u>{out}</u>;
    else if (m.type === "link" && typeof m.attrs?.href === "string" && SAFE_LINK.test(m.attrs.href)) out = <a href={m.attrs.href}>{out}</a>;
  }
  return <span key={key}>{out}</span>;
}

function nodes(list: Node[] | undefined): ReactNode[] {
  return (list ?? []).slice(0, 2000).map((n, i) => node(n, i));
}

function node(n: Node, key: number): ReactNode {
  switch (n.type) {
    case "text":
      return text(n, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph": {
      const align = typeof n.attrs?.textAlign === "string" && ALIGN.has(n.attrs.textAlign) && n.attrs.textAlign !== "left" ? n.attrs.textAlign : undefined;
      return (
        <p key={key} style={align ? { textAlign: align as "center" | "right" | "justify" } : undefined}>
          {nodes(n.content)}
        </p>
      );
    }
    case "bulletList":
      return <ul key={key}>{nodes(n.content)}</ul>;
    case "orderedList":
      return <ol key={key}>{nodes(n.content)}</ol>;
    case "listItem":
      return <li key={key}>{nodes(n.content)}</li>;
    default:
      return null;
  }
}

export function RichRender({ doc, className = "" }: { doc: RichDoc; className?: string }) {
  return <div className={`proposal-rich ${className}`}>{nodes(doc?.content as Node[] | undefined)}</div>;
}
