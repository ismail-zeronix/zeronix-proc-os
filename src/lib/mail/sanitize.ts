import sanitizeHtml from "sanitize-html";

const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/i;

export interface InlinePart {
  cid?: string | false | null;
  contentType: string;
  content: Buffer;
  size: number;
}

/**
 * Turns an email's HTML into something safe to show: no scripts, forms, frames or event handlers, links open in a
 * new tab, and remote images (a common way to track who read an email) are dropped unless `loadImages` is true.
 * Images embedded in the email (cid:) are inlined as data URIs. The result is shown inside a sandboxed iframe too,
 * so this is one of two layers.
 */
export function sanitizeEmailHtml(html: string, parts: InlinePart[], loadImages: boolean) {
  const remoteImages = /<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:/i.test(html);

  // cid:xyz -> data URI for small inline images that came with the email
  const withInline = html.replace(/cid:([^"'\s)>]+)/gi, (whole, raw: string) => {
    const cid = decodeURIComponent(raw).replace(/^<|>$/g, "");
    const part = parts.find((p) => p.cid && String(p.cid).replace(/^<|>$/g, "") === cid);
    if (part && INLINE_IMAGE.test(part.contentType) && part.size <= 2 * 1024 * 1024) {
      return `data:${part.contentType.toLowerCase()};base64,${part.content.toString("base64")}`;
    }
    return whole;
  });

  const clean = sanitizeHtml(withInline, {
    allowedTags: [
      "a", "abbr", "b", "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup", "dd", "div", "dl", "dt",
      "em", "font", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "small", "span",
      "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
    ],
    allowedAttributes: {
      a: ["href", "name", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      font: ["color", "size", "face"],
      td: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      th: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      table: ["width", "border", "cellpadding", "cellspacing", "align", "bgcolor"],
      tr: ["align", "valign", "bgcolor"],
      "*": ["style", "dir", "align"],
    },
    allowedStyles: {
      "*": {
        color: [/^[#\w(),.\s%-]+$/],
        "background-color": [/^[#\w(),.\s%-]+$/],
        "font-size": [/^[\d.]+(px|pt|em|rem|%)$/],
        "font-weight": [/^[\w]+$/],
        "font-style": [/^[\w]+$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "text-align": [/^(left|right|center|justify)$/],
        "text-decoration": [/^[\w\s-]+$/],
        width: [/^[\d.]+(px|%|pt|em)$/],
        height: [/^[\d.]+(px|%|pt|em)$/],
        "max-width": [/^[\d.]+(px|%|pt|em)$/],
        margin: [/^[\d.\s]+(px|pt|em|%)?[\d.\spxptem%]*$/],
        padding: [/^[\d.\s]+(px|pt|em|%)?[\d.\spxptem%]*$/],
        "line-height": [/^[\d.]+(px|pt|em|%)?$/],
        border: [/^[\w\s#().,-]+$/],
        "border-bottom": [/^[\w\s#().,-]+$/],
        "border-right": [/^[\w\s#().,-]+$/],
        "vertical-align": [/^[\w-]+$/],
        display: [/^(block|inline|inline-block|none)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: loadImages ? ["data", "https", "http"] : ["data"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } }),
    },
    // an <img> whose source was removed (remote image, not loaded) is dropped rather than shown broken
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });

  return { html: clean, remoteImages };
}

/** A short plain-text version of an email, used when it has no HTML part. */
export function escapeForPre(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
