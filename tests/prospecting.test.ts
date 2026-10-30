import { describe, expect, it } from "vitest";
import { domainOf, isGenericEmail } from "@/lib/prospecting/constants";
import { guessMapping, parseCsv, rowToProspect, toIsoDate } from "@/lib/prospecting/import";
import { fitScore, reachScore, scoreProspect, signalScore } from "@/lib/prospecting/score";

describe("domainOf", () => {
  it("reduces websites and emails to the bare domain", () => {
    expect(domainOf("https://www.Example.ae/about?x=1")).toBe("example.ae");
    expect(domainOf("www2.example.co.ae")).toBe("example.co.ae");
    expect(domainOf("sam@Example.ae")).toBe("example.ae");
    expect(domainOf("example.ae:8080")).toBe("example.ae");
  });

  it("ignores free mail, IPs and junk", () => {
    expect(domainOf("someone@gmail.com")).toBe("");
    expect(domainOf("hotmail.com")).toBe("");
    expect(domainOf("192.168.1.1")).toBe("");
    expect(domainOf("not a site")).toBe("");
    expect(domainOf("")).toBe("");
  });

  it("spots shared inboxes", () => {
    expect(isGenericEmail("info@x.ae")).toBe(true);
    expect(isGenericEmail("Sales@x.ae")).toBe(true);
    expect(isGenericEmail("ahmed.ali@x.ae")).toBe(false);
  });
});

describe("parseCsv", () => {
  it("reads quotes, doubled quotes and newlines inside quotes", () => {
    const rows = parseCsv('﻿Name,Notes\r\n"Acme, LLC","said ""hi""\nthen left"\r\nBeta,\r\n\r\n');
    expect(rows).toEqual([
      ["Name", "Notes"],
      ["Acme, LLC", 'said "hi"\nthen left'],
      ["Beta", ""],
    ]);
  });

  it("detects semicolon and tab files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
});

describe("guessMapping", () => {
  it("maps common header names, exact names first", () => {
    const m = guessMapping(["Company Name", "Web Site", "E-mail", "Contact Person", "Designation", "License Issue Date", "Activity"]);
    expect(m.name).toBe(0);
    expect(m.website).toBe(1);
    expect(m.email).toBe(2);
    expect(m.personName).toBe(3);
    expect(m.personTitle).toBe(4);
    expect(m.activity).toBe(6);
    expect(m.licenseDate).toBe(5);
  });

  it("never maps one column to two fields", () => {
    const m = guessMapping(["Name"]);
    expect(m.name).toBe(0);
    expect(m.personName).toBeUndefined();
  });
});

describe("toIsoDate", () => {
  it("reads UAE day-first dates, ISO dates, Excel serials and month names", () => {
    expect(toIsoDate("05/10/2026")).toBe("2026-10-05");
    expect(toIsoDate("2026-10-05T00:00:00Z")).toBe("2026-10-05");
    expect(toIsoDate("46300")).toBe("2026-10-05");
    expect(toIsoDate("12 Oct 2026")).toBe("2026-10-12");
  });

  it("rejects impossible dates", () => {
    expect(toIsoDate("31/02/2026")).toBe("");
    expect(toIsoDate("soon")).toBe("");
  });
});

describe("rowToProspect", () => {
  it("cleans a row and takes the domain from the website or the email", () => {
    const p = rowToProspect(["  Acme  Trading LLC ", "", "Sam@Acme.ae", "Dubai"], { name: 0, website: 1, email: 2, emirate: 3 });
    expect(p).toMatchObject({ name: "Acme Trading LLC", domain: "acme.ae", email: "sam@acme.ae", emirate: "Dubai" });
  });

  it("skips rows without a company name and drops bad emails", () => {
    expect(rowToProspect(["", "x"], { name: 0 })).toBeNull();
    expect(rowToProspect(["Beta", "not-an-email"], { name: 0, email: 1 })?.email).toBe("");
  });
});

describe("score", () => {
  const today = "2026-10-30";

  it("weights fit 40%, signal 40%, reach 20%", () => {
    const s = scoreProspect(
      {
        segmentKey: "new_company",
        domain: "acme.ae",
        emirate: "Dubai",
        sizeBand: "1-10",
        email: "",
        phone: "",
        signals: [{ kind: "new_license", observedOn: "2026-10-01" }],
        people: [{ roleKind: "decision", email: "sam@acme.ae", emailStatus: "verified", phone: "" }],
      },
      today,
    );
    expect(s).toEqual({ fit: 10, signal: 10, reach: 8, total: 9.6 });
  });

  it("makes old signals worth less and gives 2 for no signal", () => {
    expect(signalScore([], today)).toBe(2);
    expect(signalScore([{ kind: "hiring", observedOn: "2026-06-01" }], today)).toBe(6);
    expect(signalScore([{ kind: "hiring", observedOn: "2026-01-01" }], today)).toBe(4);
  });

  it("scores reach by who we can get to", () => {
    expect(reachScore({ people: [], email: "", phone: "" })).toBe(1);
    expect(reachScore({ people: [], email: "info@x.ae", phone: "" })).toBe(3);
    expect(reachScore({ people: [{ roleKind: "decision", email: "a@x.ae", emailStatus: "guess", phone: "" }], email: "", phone: "" })).toBe(6);
    expect(reachScore({ people: [{ roleKind: "influencer", email: "a@x.ae", emailStatus: "verified", phone: "" }], email: "", phone: "" })).toBe(4);
  });

  it("gives a company without segment or website a low fit", () => {
    expect(fitScore({ segmentKey: null, domain: null, emirate: "", sizeBand: "" })).toBe(3);
  });
});
