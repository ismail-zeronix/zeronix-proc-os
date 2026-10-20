import { describe, expect, it } from "vitest";
import { bodyText, parseMessage, pickAttachment, quoteForForward, quoteForReply } from "@/lib/mail/parse";

const CRLF = "\r\n";
const raw = (lines: string[]) => Buffer.from(lines.join(CRLF));

const PIXEL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

const multipart = raw([
  "From: Ahmed Khan <ahmed@abc.test>",
  "To: Sales <sales@zeronix.test>, Bob <bob@zeronix.test>",
  "Cc: boss@abc.test",
  "Subject: Quote for 20 laptops",
  "Date: Tue, 20 Oct 2026 09:15:00 +0400",
  "Message-ID: <abc123@abc.test>",
  'Content-Type: multipart/mixed; boundary="MIX"',
  "",
  "--MIX",
  'Content-Type: multipart/related; boundary="REL"',
  "",
  "--REL",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p>Please quote <b>20 laptops</b>.</p><img src="cid:logo1"><img src="https://track.example/p.gif"><script>alert(1)</script>',
  "--REL",
  "Content-Type: image/png",
  "Content-ID: <logo1>",
  "Content-Disposition: inline",
  "Content-Transfer-Encoding: base64",
  "",
  PIXEL,
  "--REL--",
  "--MIX",
  'Content-Type: application/pdf; name="spec.pdf"',
  'Content-Disposition: attachment; filename="spec.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("%PDF-1.4 hello").toString("base64"),
  "--MIX--",
  "",
]);

describe("parseMessage", () => {
  it("reads people, subject, date and ids", async () => {
    const m = await parseMessage(7, multipart, false, false);
    expect(m.uid).toBe(7);
    expect(m.subject).toBe("Quote for 20 laptops");
    expect(m.from).toEqual({ name: "Ahmed Khan", email: "ahmed@abc.test" });
    expect(m.to.map((a) => a.email)).toEqual(["sales@zeronix.test", "bob@zeronix.test"]);
    expect(m.cc.map((a) => a.email)).toEqual(["boss@abc.test"]);
    expect(m.date).toBe("2026-10-20T05:15:00.000Z");
    expect(m.messageId).toBe("<abc123@abc.test>");
  });

  it("makes the HTML safe, inlines the embedded picture and flags remote images", async () => {
    const m = await parseMessage(1, multipart, false, false);
    expect(m.html).toContain("<b>20 laptops</b>");
    expect(m.html).not.toContain("<script");
    expect(m.html).toContain("data:image/png;base64,");
    expect(m.html).not.toContain("track.example");
    expect(m.remoteImages).toBe(true);
    const withImages = await parseMessage(1, multipart, false, true);
    expect(withImages.html).toContain("https://track.example/p.gif");
  });

  it("lists real attachments but not the picture shown in the body", async () => {
    const m = await parseMessage(1, multipart, false, false);
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]).toMatchObject({ filename: "spec.pdf", contentType: "application/pdf" });
    const file = await pickAttachment(multipart, m.attachments[0].index);
    expect(file.content.toString()).toBe("%PDF-1.4 hello");
    await expect(pickAttachment(multipart, 99)).rejects.toThrow(/not found/);
  });

  it("handles a plain text email", async () => {
    const m = await parseMessage(2, raw(["From: a@b.test", "Subject: Hi", "", "Just text", ""]), true, false);
    expect(m.html).toBeNull();
    expect(m.text.trim()).toBe("Just text");
    expect(m.seen).toBe(true);
  });
});

describe("quoting", () => {
  it("builds a reply quote and a forward block", async () => {
    const m = await parseMessage(1, multipart, false, false);
    expect(bodyText(m)).toContain("Please quote 20 laptops.");
    const reply = quoteForReply(m);
    expect(reply).toContain("Ahmed Khan <ahmed@abc.test> wrote:");
    expect(reply).toContain("> Please quote 20 laptops.");
    const fwd = quoteForForward(m);
    expect(fwd).toContain("Forwarded message");
    expect(fwd).toContain("Subject: Quote for 20 laptops");
  });
});
