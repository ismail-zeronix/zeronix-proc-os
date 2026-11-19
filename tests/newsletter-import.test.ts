import { describe, expect, it } from "vitest";
import { firstName, parseContacts } from "@/lib/newsletter/import";

describe("parseContacts", () => {
  it("reads plain addresses, 'Name <email>' and comma lines", () => {
    const r = parseContacts("a@one.ae\nSara Khan <Sara@Two.AE>\nc@three.ae, Omar Ali, Acme LLC\n");
    expect(r.contacts).toEqual([
      { email: "a@one.ae", name: "", company: "" },
      { email: "sara@two.ae", name: "Sara Khan", company: "" },
      { email: "c@three.ae", name: "Omar Ali", company: "Acme LLC" },
    ]);
    expect(r.invalid).toEqual([]);
  });

  it("uses a header row to find the columns", () => {
    const r = parseContacts("Company,Name,Email\nAcme,Sara Khan,sara@acme.ae\nBeta,,info@beta.ae");
    expect(r.contacts).toEqual([
      { email: "sara@acme.ae", name: "Sara Khan", company: "Acme" },
      { email: "info@beta.ae", name: "", company: "Beta" },
    ]);
  });

  it("counts duplicates and reports lines with no address", () => {
    const r = parseContacts("a@one.ae\nA@ONE.AE\nnot an email\nb@two.ae");
    expect(r.contacts.map((c) => c.email)).toEqual(["a@one.ae", "b@two.ae"]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual(["not an email"]);
  });

  it("returns nothing for empty text", () => {
    expect(parseContacts("").contacts).toEqual([]);
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Sara  Khan")).toBe("Sara");
    expect(firstName("")).toBe("");
  });
});
