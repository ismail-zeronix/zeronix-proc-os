import { describe, expect, it } from "vitest";
import { parseLogoDataUrl } from "@/lib/logo";
import {
  DEFAULT_BRAND,
  normalizeStyle,
  safeColor,
  safeUrl,
  signatureHtml,
  signatureText,
  ZERONIX_SAMPLE,
  type Brand,
  type Person,
} from "@/lib/signature";

const brand: Brand = {
  ...DEFAULT_BRAND,
  template: "classic",
  company: "Zeronix",
  website: "www.zeronix.ae",
  address: "Office 101\nDubai, UAE",
  mainPhone: "+971 4 111 1111",
  hasLogo: true,
  disclaimer: "Confidential.",
};
const person: Person = { name: "Ismail K", jobTitle: "Sales Manager", phone: "", mobile: "+971 50 123 4567", email: "ismail@zeronix.ae" };

describe("signatureHtml", () => {
  it("includes the person, company details and the logo image", () => {
    const html = signatureHtml(brand, person, "cid:zeronix-logo");
    expect(html).toContain("Ismail K");
    expect(html).toContain("Sales Manager");
    expect(html).toContain('src="cid:zeronix-logo"');
    expect(html).toContain("mailto:ismail@zeronix.ae");
    expect(html).toContain("tel:+971501234567");
    expect(html).toContain('href="https://www.zeronix.ae"');
    expect(html).toContain("Office 101<br>Dubai, UAE");
    expect(html).toContain("Confidential.");
  });

  it("puts the logo where the layout says", () => {
    const at = (layout: Brand["layout"]) => {
      const html = signatureHtml({ ...brand, layout }, person, "cid:x");
      return { logo: html.indexOf("<img"), name: html.indexOf("Ismail K") };
    };
    expect(at("left").logo).toBeLessThan(at("left").name);
    expect(at("top").logo).toBeLessThan(at("top").name);
    expect(at("right").logo).toBeGreaterThan(at("right").name);
    expect(at("below").logo).toBeGreaterThan(at("below").name);
  });

  it("falls back to a text mark without a logo, and to the main phone without personal numbers", () => {
    const html = signatureHtml({ ...brand, hasLogo: false }, { ...person, mobile: "" }, "cid:x");
    expect(html).not.toContain("<img");
    expect(html).toContain("ZERONIX");
    expect(html).toContain("tel:+97141111111");
  });

  it("escapes everything typed by users, so a name cannot inject markup", () => {
    const evil: Person = { ...person, name: '<script>alert(1)</script>"x', jobTitle: "<img src=x onerror=alert(1)>" };
    const html = signatureHtml({ ...brand, company: "<b>Z</b>", address: "<i>a</i>" }, evil, 'x" onerror="alert(1)');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>Z</b>");
    expect(html).not.toContain("<i>a</i>");
    expect(html).not.toMatch(/<img src=x/);
    expect(html).not.toContain('onerror="alert(1)">');
  });

  it("does not turn a javascript: website into a link", () => {
    const html = signatureHtml({ ...brand, website: "javascript:alert(1)" }, person, "cid:x");
    expect(html).not.toContain("javascript:");
  });
});

describe("corporate template", () => {
  const corp: Brand = { ...DEFAULT_BRAND, ...ZERONIX_SAMPLE, hasLogo: false };

  it("follows the company structure: header, line, Contact Us, slogan, notice, green note", () => {
    const html = signatureHtml(corp, person, "");
    const order = [
      "Ismail K",
      "ZERONIX TECHNOLOGY LLC",
      "Your Trusted Partner",
      "IT Hardware | Networking",
      "<b>Authorized Business Partners:</b>",
      "border-top:2px solid #2a78d6",
      "text-decoration:underline",
      "Contact Us",
      "Office 19, Khurram Building",
      "tel:+971509811669",
      "tel:+971558246066",
      "mailto:sales@zeronix.ae",
      "mailto:info@zeronix.ae",
      "https://www.zeronix.ae",
      "Empowering Businesses",
      "<b>Confidentiality Notice:</b>",
      "Think Green",
    ].map((x) => html.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("uses the chosen line weight, style and colour, and drops the line at 0", () => {
    expect(signatureHtml({ ...corp, lineWeight: 5, lineStyle: "dashed", lineColor: "#ff0000" }, person, "")).toContain(
      "border-top:5px dashed #ff0000",
    );
    expect(signatureHtml({ ...corp, lineWeight: 0 }, person, "")).not.toContain("border-top");
    expect(signatureHtml({ ...corp, footerLine: true }, person, "").match(/border-top/g)).toHaveLength(2);
  });

  it("can hide the sender block", () => {
    expect(signatureHtml({ ...corp, showPerson: false }, person, "")).not.toContain("Ismail K");
  });

  it("builds a matching plain-text version", () => {
    const t = signatureText(corp, person);
    expect(t).toContain("Contact Us");
    expect(t).toContain("T: +971 50 981 1669 | +971 55 824 6066");
    expect(t).toContain("E: sales@zeronix.ae | info@zeronix.ae");
    expect(t).toContain("W: www.zeronix.ae");
  });

  it("cleans bad style values before they reach inline styles", () => {
    const s = normalizeStyle({ lineWeight: 99, lineStyle: "groove;x", lineColor: "red;x", font: "comic", fontSize: "abc", template: 1 });
    expect(s.lineWeight).toBe(8);
    expect(s.lineStyle).toBe("solid");
    expect(s.lineColor).toBe("");
    expect(s.font).toBe("arial");
    expect(s.fontSize).toBe(13);
    expect(s.template).toBe("corporate");
    const html = signatureHtml({ ...corp, lineColor: "red;background:url(x)" as string, services: "<b>x</b>" }, person, "");
    expect(html).not.toContain("url(x)");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("helpers", () => {
  it("safeUrl adds https and rejects other schemes", () => {
    expect(safeUrl("zeronix.ae")).toBe("https://zeronix.ae");
    expect(safeUrl("http://zeronix.ae")).toBe("http://zeronix.ae");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("ftp://x")).toBe("");
    expect(safeUrl("  ")).toBe("");
  });

  it("safeColor only lets hex colours into inline styles", () => {
    expect(safeColor("#2a78d6")).toBe("#2a78d6");
    expect(safeColor("#abc")).toBe("#abc");
    expect(safeColor("red; background:url(x)")).toBe(DEFAULT_BRAND.color);
  });

  it("builds a plain-text signature", () => {
    const t = signatureText(brand, person);
    expect(t).toContain("Ismail K");
    expect(t).toContain("M +971 50 123 4567");
    expect(t).toContain("zeronix.ae");
  });
});

describe("parseLogoDataUrl", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");

  it("accepts a real PNG", () => {
    expect(parseLogoDataUrl(`data:image/png;base64,${png}`).mime).toBe("image/png");
  });

  it("rejects SVG, other types and non-images", () => {
    expect(() => parseLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(/PNG, JPG or WebP/);
    expect(() => parseLogoDataUrl("data:text/html;base64,PGI+")).toThrow(/PNG, JPG or WebP/);
    expect(() => parseLogoDataUrl("not a data url")).toThrow();
  });

  it("rejects a file whose header does not match its claimed type", () => {
    expect(() => parseLogoDataUrl(`data:image/jpeg;base64,${png}`)).toThrow(/not really/);
  });

  it("rejects an image over 400 KB", () => {
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(401 * 1024)]).toString("base64");
    expect(() => parseLogoDataUrl(`data:image/png;base64,${big}`)).toThrow(/400 KB/);
  });
});
