import { describe, expect, it } from "vitest";
import { parseLogoDataUrl } from "@/lib/logo";
import { DEFAULT_BRAND, safeColor, safeUrl, signatureHtml, signatureText, type Brand, type Person } from "@/lib/signature";

const brand: Brand = {
  ...DEFAULT_BRAND,
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
