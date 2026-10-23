import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { RichRender } from "@/components/proposal/rich-render";
import { defaultProposal, type RichDoc } from "@/lib/proposal";

const html = (doc: unknown) => renderToStaticMarkup(createElement(RichRender, { doc: doc as RichDoc }));

describe("RichRender (print)", () => {
  it("draws paragraphs, lists, marks, alignment and safe links", () => {
    const out = html({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Hello ", marks: [{ type: "bold" }] }, { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://zeronix.ae" } }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one", marks: [{ type: "italic" }, { type: "underline" }] }] }] }] },
      ],
    });
    expect(out).toContain('<p style="text-align:center"><span><strong>Hello </strong></span><span><a href="https://zeronix.ae">site</a></span></p>');
    expect(out).toContain("<ul><li><p><span><u><em>one</em></u></span></p></li></ul>");
  });

  it("never draws unsafe links, raw HTML or unknown nodes", () => {
    const out = html({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "paragraph", attrs: { textAlign: "expression(alert(1))" }, content: [{ type: "text", text: "x" }] },
      ],
    });
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("expression");
  });
});

describe("ProposalDocument", () => {
  it("draws the standard proposal like Zeronix's own: cover, quotation header, numbered sections, price grid, bank, signature", () => {
    const blocks = defaultProposal({
      typeKey: "cctv",
      typeLabel: "CCTV",
      dealTitle: "19 camera IP CCTV system",
      requirement: "",
      customer: "Al Noor LLC",
      site: "Ajman",
      company: "Zeronix Technology LLC",
      boq: [],
    });
    const out = renderToStaticMarkup(
      createElement(ProposalDocument, {
        blocks,
        cover: {
          customer: "Al Noor LLC",
          contact: "Faisal",
          contactTitle: "Manager",
          site: "Ajman",
          projectNumber: "ZPJ-2026-0001",
          quoteNumber: "ZQ-2026-0005",
          date: "2026-10-23",
          validUntil: "2026-11-06",
          customerTrn: "100222333400003",
          bank: { bank: "Emirates NBD", accountName: "Zeronix Technology LLC", accountNumber: "1012345678901", iban: "AE070331234567890123456", swift: "EBILAEAD" },
        },
        boq: {
          lines: [
            { id: 1, section: "CCTV", position: 0, description: "Hikvision 4MP IP Indoor Dome Camera, 2.8 mm", qty: 10, unit: "nos", unitPriceAed: 300, costAed: null, optional: false },
            { id: 2, section: "CCTV", position: 1, description: "PTZ camera", qty: 1, unit: "nos", unitPriceAed: 2000, costAed: null, optional: true },
          ],
          sections: ["CCTV"],
          vatPct: 5,
        },
        brand: {
          company: "Zeronix Technology LLC",
          tagline: "Complete IT Infrastructure and Technology Solutions",
          address: "Office 19, Khurram Building, Al Fahidi, Bur Dubai",
          website: "zeronix.ae",
          mainPhone: "",
          color: "#16a34a",
          trn: "100000000000003",
          logoSrc: null,
          email: "sales@zeronix.ae",
          phones: "+971 50 981 1669",
          tradeLicense: "",
          logoDarkSrc: null,
          signatureSrc: "/api/brand/asset/signature?v=1",
          stampSrc: "/api/brand/asset/stamp?v=1",
        },
      }),
    );
    // the cover, marked for the PDF, with the customer in capitals' worth of emphasis and the validity
    expect(out).toContain("data-pdf-cover");
    expect(out).toContain("data-pdf-body");
    expect(out).toContain("CCTV project proposal");
    expect(out).toContain("For Al Noor LLC");
    expect(out).toContain("6 Nov 2026");
    expect(out).toContain("CONFIDENTIAL");
    expect(out).toContain("sales@zeronix.ae");
    // the quotation header: our TRN, the customer's TRN, the quotation number
    expect(out).toContain("TRN: 100000000000003");
    expect(out).toContain("TRN: 100222333400003");
    expect(out).toContain("ZQ-2026-0005");
    // numbered sections
    expect(out).toContain("1. Introduction");
    expect(out).toContain("6. Quotation");
    // the price grid: bold product name, two decimals, totals inside; the optional PTZ apart
    expect(out).toContain('<span class="font-semibold">Hikvision 4MP IP Indoor Dome Camera</span>, 2.8 mm');
    expect(out).toContain("Grand Total (incl. VAT)");
    expect(out).toContain("3,150.00");
    expect(out).toContain("Optional items (not included in the total)");
    // 50% advance of 3,150
    expect(out).toContain("1,575.00");
    expect(out).toContain("AE070331234567890123456");
    expect(out).toContain('alt="Signature"');
    expect(out).toContain('alt="Company stamp"');
    expect(out).toContain("Name, Signature, Stamp and Date");
  });

  it("leaves out the bank block when no bank details are set", () => {
    const out = renderToStaticMarkup(
      createElement(ProposalDocument, {
        blocks: [{ id: "b", type: "bank", data: { title: "Bank details for payment" } }],
        cover: { customer: "X", contact: "", contactTitle: "", site: "", projectNumber: "ZPJ-1", quoteNumber: null, date: "2026-10-23", bank: null },
        boq: { lines: [], sections: [], vatPct: 5 },
        brand: { company: "Z", tagline: "", address: "", website: "", mainPhone: "", color: "#16a34a", trn: "", logoSrc: null, email: "", phones: "", tradeLicense: "", logoDarkSrc: null, signatureSrc: null, stampSrc: null },
      }),
    );
    expect(out).not.toContain("Bank details for payment");
  });
});
