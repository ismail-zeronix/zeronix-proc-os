import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml, type InlinePart } from "@/lib/mail/sanitize";

const clean = (html: string, loadImages = false, parts: InlinePart[] = []) => sanitizeEmailHtml(html, parts, loadImages);

describe("sanitizeEmailHtml", () => {
  it("keeps normal formatting", () => {
    const { html } = clean('<p>Hello <b>Ahmed</b></p><table><tr><td style="color:#333;font-size:13px">Price</td></tr></table>');
    expect(html).toContain("<b>Ahmed</b>");
    expect(html).toContain("<table>");
    expect(html).toContain("color:#333");
  });

  it("removes scripts, event handlers, frames, forms and styles blocks", () => {
    const { html } = clean(
      '<script>alert(1)</script><p onclick="x()">a</p><iframe src="https://evil"></iframe><form action="https://evil"><input name=p></form><style>body{display:none}</style><object data="x"></object>',
    );
    expect(html).not.toMatch(/<script|onclick|<iframe|<form|<input|<style|<object/i);
    expect(html).toContain("<p>a</p>");
  });

  it("blocks javascript: and data: links but keeps http, mailto and tel, opening in a new tab", () => {
    const { html } = clean(
      '<a href="javascript:alert(1)">a</a><a href="data:text/html,<script>1</script>">b</a><a href="https://zeronix.ae">c</a><a href="mailto:x@y.z">d</a><a href="tel:+9715">e</a>',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="https://zeronix.ae"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("mailto:x@y.z");
    expect(html).toContain("tel:+9715");
  });

  it("drops remote images until the person asks for them, and says that some exist", () => {
    const src = '<p>Hi</p><img src="https://track.example/pixel.gif" width="1" height="1">';
    const off = clean(src, false);
    expect(off.html).not.toContain("track.example");
    expect(off.html).not.toContain("<img");
    expect(off.remoteImages).toBe(true);
    const on = clean(src, true);
    expect(on.html).toContain("https://track.example/pixel.gif");
  });

  it("reports no remote images when there are none", () => {
    expect(clean("<p>plain</p>").remoteImages).toBe(false);
  });

  it("shows pictures that came inside the email (cid:) as data images", () => {
    const part: InlinePart = { cid: "logo123", contentType: "image/png", content: Buffer.from([1, 2, 3]), size: 3 };
    const { html } = clean('<img src="cid:logo123">', false, [part]);
    expect(html).toContain("data:image/png;base64,AQID");
  });

  it("will not inline a non-image attachment that a cid points at", () => {
    const part: InlinePart = { cid: "x", contentType: "text/html", content: Buffer.from("<script>1</script>"), size: 18 };
    const { html } = clean('<img src="cid:x">', false, [part]);
    expect(html).not.toContain("base64");
    expect(html).not.toContain("<img");
  });

  it("strips dangerous css values", () => {
    const { html } = clean('<p style="color:red;background:url(https://evil/x);position:fixed;width:expression(alert(1))">a</p>');
    expect(html).not.toContain("url(");
    expect(html).not.toContain("position");
    expect(html).not.toContain("expression");
    expect(html).toContain("color:red");
  });
});
