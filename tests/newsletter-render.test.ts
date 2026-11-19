import { describe, expect, it } from "vitest";
import { newBlock, normDoc } from "@/lib/newsletter/blocks";
import { hasUnsubToken, htmlToText, sanitizeHtml } from "@/lib/newsletter/custom";
import { renderEmail } from "@/lib/newsletter/render";
import { SAMPLE_PRODUCTS, TEMPLATES, withSamples } from "@/lib/newsletter/templates";
import type { NewsBrand, NewsDoc, RenderInput, ResolvedProduct } from "@/lib/newsletter/types";

const brand: NewsBrand = { company: "Zeronix Tech LLC", address: "Office 1, Dubai, UAE", website: "zeronixtech.com", phone: "+971 4 000 0000", email: "sales@example.ae" };
const products: ResolvedProduct[] = [
  { id: 1, name: "Laptop <15>", brand: "Acme", url: "https://zeronixtech.com/products/laptops/x", image: "https://zeronixtech.com/media/1", price: "AED 1,000" },
  { id: 2, name: "Camera", brand: "", url: "https://zeronixtech.com/products/cctv/y", image: null, price: null },
  { id: 3, name: "Switch", brand: "Net", url: "javascript:alert(1)", image: null, price: null },
];

const laptops = TEMPLATES.find((t) => t.key === "laptops")!;
const withProducts = (doc: NewsDoc): NewsDoc => ({ ...doc, blocks: doc.blocks.map((b) => (b.type === "products" ? { ...b, ids: [1, 2, 3] } : b)) });

const input = (over: Partial<RenderInput> = {}): RenderInput => ({
  doc: withProducts(laptops.doc),
  subject: laptops.subject,
  preheader: laptops.preheader,
  products,
  brand,
  logoSrc: "",
  firstName: "Sara",
  unsubUrl: "https://portal.example/unsubscribe/abc",
  reason: "You asked to hear from us.",
  ...over,
});

describe("renderEmail (block design)", () => {
  it("has the unsubscribe link, company name, address and reason in both parts", () => {
    const { html, text } = renderEmail(input());
    for (const out of [html, text]) {
      expect(out).toContain("https://portal.example/unsubscribe/abc");
      expect(out).toContain("Zeronix Tech LLC");
      expect(out).toContain("Office 1, Dubai, UAE");
      expect(out).toContain("You asked to hear from us.");
    }
  });

  it("keeps the legal footer even when every section is deleted", () => {
    const { html } = renderEmail(input({ doc: { ...laptops.doc, blocks: [] } }));
    expect(html).toContain("https://portal.example/unsubscribe/abc");
    expect(html).toContain("Office 1, Dubai, UAE");
  });

  it("fills {name} with the first name, or 'there'", () => {
    expect(renderEmail(input()).html).toContain("Hello Sara,");
    expect(renderEmail(input({ firstName: "" })).html).toContain("Hello there,");
    expect(renderEmail(input()).text).toContain("Hello Sara,");
  });

  it("escapes text and refuses links that are not http(s)", () => {
    const { html } = renderEmail(input());
    expect(html).toContain("Laptop &lt;15&gt;");
    expect(html).not.toContain("javascript:");
    const doc: NewsDoc = { ...laptops.doc, blocks: [newBlock("hero", { title: "<b>x</b>", buttonLabel: "Go", buttonUrl: "javascript:alert(1)" }), newBlock("text", { text: "[click](javascript:alert(1)) <script>alert(1)</script>" })] };
    const bad = renderEmail(input({ doc }));
    expect(bad.html).not.toMatch(/href="javascript:/i); // typed as text it is only shown, never a link
    expect(bad.html).not.toContain("<b>x</b>");
    expect(bad.html).not.toContain("<script>");
  });

  it("shows 'Request a quote' unless a product has a public price", () => {
    const { html } = renderEmail(input());
    expect(html).toContain("AED 1,000");
    expect(html).toContain("Request a quote");
  });

  it("hides a products section with no products, and shows picked ones", () => {
    const none = renderEmail(input({ doc: laptops.doc }));
    expect(none.html).not.toContain("View product");
    expect(renderEmail(input()).html).toContain("View product");
  });

  it("applies the chosen fonts and colours, with readable button text", () => {
    const doc: NewsDoc = { ...withProducts(laptops.doc), style: { ...laptops.doc.style, headingFont: "georgia", bodyFont: "verdana", brand: "#4A0E1B", accent: "#E9C46A" } };
    const { html } = renderEmail(input({ doc }));
    expect(html).toContain("Georgia");
    expect(html).toContain("Verdana");
    expect(html).toContain("#4A0E1B");
    expect(html).toContain("#E9C46A");
    // a dark accent gets light button text, a light accent gets dark button text
    expect(renderEmail(input({ doc: { ...doc, style: { ...doc.style, accent: "#1E3A8A" } } })).html).toContain("color:#FFFFFF;text-decoration:none");
    expect(html).toContain("color:#081A31;text-decoration:none");
  });

  it("ignores unknown fonts and bad colours instead of printing them", () => {
    const doc = normDoc({ style: { headingFont: "comic", brand: "red;background:url(x)", accent: "#GGGGGG" }, blocks: [{ id: "a", type: "hero", p: { title: "Hi" } }, { id: "b", type: "nope", p: {} }] })!;
    expect(doc.blocks).toHaveLength(1);
    const { html } = renderEmail(input({ doc }));
    expect(html).not.toContain("comic");
    expect(html).not.toContain("url(x)");
  });

  it("supports bold, links and bullet lists in text", () => {
    const doc: NewsDoc = { ...laptops.doc, blocks: [newBlock("text", { text: "We are **open** [here](https://zeronixtech.com)\n\n- one\n- two" })] };
    const { html, text } = renderEmail(input({ doc }));
    expect(html).toContain("<strong>open</strong>");
    expect(html).toContain('href="https://zeronixtech.com"');
    expect(html).toContain("<li");
    expect(text).toContain("open here (https://zeronixtech.com)");
  });

  it("renders every template, with samples, as full HTML and a plain-text part", () => {
    for (const t of TEMPLATES) {
      const { html, text } = renderEmail(input({ doc: withSamples(t.doc), products: SAMPLE_PRODUCTS, subject: t.subject, preheader: t.preheader }));
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("Unsubscribe");
      expect(text.length).toBeGreaterThan(50);
      expect(html).not.toMatch(/undefined|\[object/);
    }
  });
});

describe("renderEmail (pasted HTML code)", () => {
  const code = `<html><head><title>x</title><script>alert(1)</script></head><body onload="x()"><h1>Hi {name}</h1><a href="javascript:alert(1)">bad</a><a href="https://example.com/p?a=1&b=2">good</a><img src="https://example.com/a.png"><form action="/x"><input></form></body></html>`;

  it("removes scripts, handlers, forms and unsafe links, and fills {name}", () => {
    const { html } = renderEmail(input({ doc: undefined, html: code }));
    expect(html).not.toMatch(/<script|onload|<form|<input|javascript:/i);
    expect(html).toContain("Hi Sara");
    expect(html).toContain("https://example.com/p?a=1&b=2");
  });

  it("always adds the company address and a working Unsubscribe link", () => {
    const { html, text } = renderEmail(input({ doc: undefined, html: code }));
    for (const out of [html, text]) {
      expect(out).toContain("https://portal.example/unsubscribe/abc");
      expect(out).toContain("Office 1, Dubai, UAE");
    }
    expect(html.indexOf("Office 1, Dubai")).toBeLessThan(html.indexOf("</body>"));
  });

  it("uses the pasted unsubscribe tag when there is one, and does not add a second link", () => {
    const own = `<p>Hello</p><a href="{unsubscribe_url}">Stop these emails</a>`;
    expect(hasUnsubToken(own)).toBe(true);
    const { html } = renderEmail(input({ doc: undefined, html: own }));
    expect(html.match(/portal\.example\/unsubscribe\/abc/g)).toHaveLength(1);
    expect(html).toContain("Office 1, Dubai, UAE");
    expect(html).not.toContain("{unsubscribe_url}");
  });

  it("wraps a fragment into a full document with the hidden preview text", () => {
    const { html } = renderEmail(input({ doc: undefined, html: "<p>Just a fragment</p>", preheader: "Preview line" }));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Preview line");
  });

  it("makes plain text from the code and blocks data: pages in links", () => {
    expect(htmlToText('<p>Hi&nbsp;there</p><a href="https://x.com">Link</a><style>a{}</style>')).toBe("Hi there\nLink (https://x.com)");
    expect(sanitizeHtml('<a href="data:text/html;base64,AAA">x</a>')).toContain('href="#"');
  });
});
