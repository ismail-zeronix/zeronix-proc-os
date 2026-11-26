import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectToken, readConnectToken } from "@/lib/connect-token";
import { replySnippet } from "@/lib/prospecting/outreach-rules";

vi.mock("server-only", () => ({}));

describe("the /connect link token", () => {
  it("reads back only what we signed", () => {
    const t = connectToken(4521);
    expect(readConnectToken(t)).toBe(4521);
    expect(readConnectToken(t.replace("p4521", "p4522"))).toBeNull(); // someone else's company
    expect(readConnectToken(`${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(readConnectToken("")).toBeNull();
    expect(readConnectToken("p12.short")).toBeNull();
    expect(replySnippet("ok")).toBe("ok");
  });
});

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("website forms: weekly-news opt-in and cold-email replies (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let c: typeof import("@/lib/website/connect");
  let q: typeof import("@/lib/website/quotes");
  let prospect: number;
  const tag = `zzconnect${Date.now()}`;
  const email = `${tag}@example.test`;
  const blockedEmail = `${tag}-no@example.test`;

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    c = await import("@/lib/website/connect");
    q = await import("@/lib/website/quotes");
    [{ id: prospect }] = await db.insert(schema.prospectCompanies).values({ name: `${tag} LLC`, nameNorm: `${tag} llc`, status: "in_sequence" }).returning({ id: schema.prospectCompanies.id });
    await db.insert(schema.prospectPeople).values({ companyId: prospect, name: "Sara Ali", email, phone: "+971 50 111 2222", isPrimary: true });
    await db.insert(schema.outreachSuppression).values({ value: blockedEmail, kind: "email", reason: "unsubscribe", note: "test" });
  });

  afterAll(async () => {
    await db.delete(schema.newsletterContacts).where(D.inArray(schema.newsletterContacts.email, [email, blockedEmail]));
    await db.delete(schema.outreachSuppression).where(D.eq(schema.outreachSuppression.value, blockedEmail));
    await db.delete(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, prospect));
  });

  it("takes the two new fields on the request form, off by default", () => {
    const base = { name: "Sara", company: "", email, phone: "", users: null, budget: "", timeline: "", notes: "", industry: "", items: [], sourcePage: "", cta: "", visitorKey: "" };
    expect(q.quoteSchema.parse(base)).toMatchObject({ newsletter: false, ref: "" });
    expect(q.quoteSchema.parse({ ...base, newsletter: true, ref: "p1.abc" })).toMatchObject({ newsletter: true, ref: "p1.abc" });
  });

  it("adds a ticked box to Website subscribers, with when and where, and keeps blocked addresses blocked", async () => {
    expect(await c.subscribe({ email, name: "Sara Ali", company: "X", sourcePage: "/quote" }, "zeronixtech.com", "1.2.3.4")).toBe("active");
    expect(await c.subscribe({ email: blockedEmail, name: "No", company: "", sourcePage: "" }, "zeronixtech.com", "1.2.3.4")).toBe("unsubscribed");
    const rows = await db
      .select({ email: schema.newsletterContacts.email, status: schema.newsletterContacts.status, source: schema.newsletterContacts.source, list: schema.newsletterLists.name })
      .from(schema.newsletterContacts)
      .innerJoin(schema.newsletterLists, D.eq(schema.newsletterLists.id, schema.newsletterContacts.listId))
      .where(D.inArray(schema.newsletterContacts.email, [email, blockedEmail]));
    expect(rows.find((r) => r.email === email)).toMatchObject({ status: "active", list: c.SUBSCRIBERS_LIST });
    expect(rows.find((r) => r.email === email)!.source).toMatch(/weekly news.*zeronixtech\.com.*\/quote.*IP 1\.2\.3\.4/);
    expect(rows.find((r) => r.email === blockedEmail)!.status).toBe("unsubscribed");
  });

  it("fills the form in from the link, and an answer moves the company to Replied", async () => {
    const ref = connectToken(prospect);
    expect(await c.connectPrefill(ref)).toEqual({ name: "Sara Ali", company: `${tag} LLC`, email, phone: "+971 50 111 2222" });
    expect(await c.connectPrefill("p1.notours000000000")).toEqual({ name: "", company: "", email: "", phone: "" });
    const extras = { name: "Sara Ali", company: `${tag} LLC`, email, phone: "", notes: "We need 8 laptops in January.", sourcePage: "", newsletter: false, ref };
    expect(await c.markProspectReplied(ref, extras)).toBe(prospect);
    const [p] = await db.select({ status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, prospect));
    expect(p.status).toBe("replied");
    const [a] = await db.select({ body: schema.prospectActivities.body }).from(schema.prospectActivities).where(D.eq(schema.prospectActivities.companyId, prospect));
    expect(a.body).toMatch(/^Replied: .* · filled the zeronixtech\.com form\n\nWe need 8 laptops in January\./);
    expect(await c.markProspectReplied("p999.forged000000000", extras)).toBeNull();
  });
});
