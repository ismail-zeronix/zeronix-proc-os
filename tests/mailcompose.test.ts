import { describe, expect, it } from "vitest";
import { formatRecipient, isEmail, parseRecipients, replyRecipients, subjectFor, textToHtml } from "@/lib/mail/compose";

describe("parseRecipients", () => {
  it("splits on commas, semicolons and new lines, and reads Name <email>", () => {
    const { ok, bad } = parseRecipients("a@x.com, Bob Smith <b@x.com>; c@x.com\nd@x.com");
    expect(bad).toEqual([]);
    expect(ok.map((r) => r.email)).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(ok[1].name).toBe("Bob Smith");
  });

  it("keeps a comma inside a quoted name", () => {
    const { ok } = parseRecipients('"Khan, Ahmed" <ahmed@abc.test>, z@x.com');
    expect(ok).toHaveLength(2);
    expect(ok[0]).toEqual({ name: "Khan, Ahmed", email: "ahmed@abc.test" });
  });

  it("reports addresses that are not valid instead of dropping them silently", () => {
    const { ok, bad } = parseRecipients("a@x.com, not-an-email, b@, @c.com");
    expect(ok.map((r) => r.email)).toEqual(["a@x.com"]);
    expect(bad).toEqual(["not-an-email", "b@", "@c.com"]);
  });

  it("removes duplicates ignoring case and rejects header-injection attempts", () => {
    expect(parseRecipients("A@x.com, a@X.com").ok).toHaveLength(1);
    expect(parseRecipients("a@x.com\r\nBcc: evil@x.com").ok.map((r) => r.email)).toEqual(["a@x.com"]);
    expect(isEmail("a@x.com\nBcc: y@z.com")).toBe(false);
  });

  it("returns nothing for an empty field", () => {
    expect(parseRecipients("  ")).toEqual({ ok: [], bad: [] });
  });
});

describe("subjectFor / formatRecipient", () => {
  it("does not stack Re: and Fwd:", () => {
    expect(subjectFor("reply", "Quote")).toBe("Re: Quote");
    expect(subjectFor("reply", "RE: Re: Quote")).toBe("Re: Quote");
    expect(subjectFor("replyall", "Fwd: Quote")).toBe("Re: Quote");
    expect(subjectFor("forward", "Re: Quote")).toBe("Fwd: Quote");
    expect(subjectFor("new", "x")).toBe("");
  });

  it("formats names so they can be parsed back", () => {
    expect(formatRecipient({ name: "", email: "a@x.com" })).toBe("a@x.com");
    expect(formatRecipient({ name: "Bob", email: "b@x.com" })).toBe("Bob <b@x.com>");
    const r = { name: "Khan, Ahmed", email: "k@x.com" };
    expect(parseRecipients(formatRecipient(r)).ok[0]).toEqual(r);
  });
});

describe("replyRecipients", () => {
  const m = {
    from: { name: "Ahmed", email: "ahmed@abc.test" },
    replyTo: null,
    to: [
      { name: "Me", email: "me@zeronix.test" },
      { name: "Bob", email: "bob@zeronix.test" },
    ],
    cc: [{ name: "", email: "boss@abc.test" }],
  };

  it("reply goes only to the sender, or to Reply-To when set", () => {
    expect(replyRecipients("reply", m, "me@zeronix.test").to.map((r) => r.email)).toEqual(["ahmed@abc.test"]);
    expect(replyRecipients("reply", { ...m, replyTo: { name: "", email: "sales@abc.test" } }, "me@zeronix.test").to[0].email).toBe("sales@abc.test");
  });

  it("reply all adds everyone else but not me, with no duplicates", () => {
    const r = replyRecipients("replyall", m, "ME@zeronix.test");
    expect(r.to.map((x) => x.email)).toEqual(["ahmed@abc.test", "bob@zeronix.test"]);
    expect(r.cc.map((x) => x.email)).toEqual(["boss@abc.test"]);
  });
});

describe("textToHtml", () => {
  it("escapes HTML and keeps line breaks", () => {
    const h = textToHtml("Hi <b>there</b> & welcome\nSecond line");
    expect(h).toContain("Hi &lt;b&gt;there&lt;/b&gt; &amp; welcome<br>");
    expect(h).toContain("Second line<br>");
    expect(h).not.toContain("<b>");
  });

  it("turns > lines into an indented quote block", () => {
    const h = textToHtml("Reply\n> old line 1\n> old line 2\nafter");
    expect(h).toContain("<blockquote");
    expect(h).toContain("old line 1<br>old line 2");
    expect(h.indexOf("Reply")).toBeLessThan(h.indexOf("<blockquote"));
    expect(h.indexOf("after")).toBeGreaterThan(h.indexOf("</blockquote>"));
  });
});
