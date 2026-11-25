import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { replySnippet } from "@/lib/prospecting/outreach-rules";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

describe("the new part of a reply", () => {
  it("stops at the quoted email and keeps it short", () => {
    expect(replySnippet("Yes please send a quote for 10 laptops.\n\nThanks,\nAli\n\nOn Mon, 23 Nov 2026 Zeronix wrote:\n> Hello Ali")).toBe(
      "Yes please send a quote for 10 laptops.\n\nThanks,\nAli",
    );
    expect(replySnippet("Interested\n-----Original Message-----\nFrom: us")).toBe("Interested");
    expect(replySnippet("Call me\nSent from my iPhone")).toBe("Call me");
    expect(replySnippet("x".repeat(500), 50)).toHaveLength(50);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("Outreach for salesmen (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/prospecting/actions");
  let W: typeof import("@/app/(app)/prospecting/work-actions");
  let data: typeof import("@/lib/prospecting/data");
  let work: typeof import("@/lib/prospecting/work");
  let seller: number, other: number;
  let mine: number, pool: number, theirs: number, replied: number;
  const tag = `ZZOUT${Date.now()}`;
  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: "x", email: "x@example.test", role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/prospecting/actions");
    W = await import("@/app/(app)/prospecting/work-actions");
    data = await import("@/lib/prospecting/data");
    work = await import("@/lib/prospecting/work");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales" }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller");
    other = await mk("other");
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values([seller, other].map((userId) => ({ userId, day: dubaiToday() })));
    const add = async (name: string, ownerId: number | null, extra: Partial<typeof schema.prospectCompanies.$inferInsert> = {}) =>
      (
        await db
          .insert(schema.prospectCompanies)
          .values({ name: `${tag} ${name}`, nameNorm: `${tag} ${name}`.toLowerCase(), ownerId, phone: "+971 4 000 0000", score: 5, ...extra })
          .returning({ id: schema.prospectCompanies.id })
      )[0].id;
    mine = await add("Mine", seller);
    pool = await add("Pool", null);
    theirs = await add("Theirs", other);
    replied = await add("Replied", seller, { status: "replied" });
    await db.insert(schema.prospectPeople).values({ companyId: replied, name: "Ali Khan", title: "IT Manager", email: `ali@${tag.toLowerCase()}.test`, phone: "+971 50 000 0000" });
    await db.insert(schema.prospectActivities).values({ companyId: replied, userId: null, kind: "email", body: "Replied: ali@x.test · Re: laptops\n\nSend a quote for 10 laptops" });
  });

  afterAll(async () => {
    const [r] = await db.select({ dealId: schema.prospectCompanies.crmDealId, companyId: schema.prospectCompanies.crmCompanyId }).from(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, replied));
    await db.delete(schema.prospectCompanies).where(D.inArray(schema.prospectCompanies.id, [mine, pool, theirs, replied]));
    if (r?.dealId) {
      await db.delete(schema.tasks).where(D.and(D.eq(schema.tasks.relatedType, "deal"), D.eq(schema.tasks.relatedId, r.dealId)));
      await db.delete(schema.activities).where(D.eq(schema.activities.dealId, r.dealId));
      await db.delete(schema.deals).where(D.eq(schema.deals.id, r.dealId));
    }
    if (r?.companyId) {
      await db.delete(schema.contacts).where(D.eq(schema.contacts.companyId, r.companyId));
      await db.delete(schema.companies).where(D.eq(schema.companies.id, r.companyId));
    }
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, [seller, other]));
    await db.delete(schema.users).where(D.inArray(schema.users.id, [seller, other]));
  });

  it("lists a salesman's own prospects and the unassigned pool, never someone else's", async () => {
    const { rows } = await data.listProspects({ q: tag, scopeUserId: seller, pageSize: 50 });
    expect(rows.map((r) => r.id).sort()).toEqual([mine, pool, replied].sort());
  });

  it("refuses someone else's prospect, gives an unassigned one to whoever works it, and keeps setup for admins", async () => {
    await as(seller);
    expect(await P.addProspectNote(theirs, "Trying")).toEqual({ error: "That prospect belongs to someone else." });
    expect((await P.addProspectNote(pool, "Called reception")).error).toBeUndefined();
    const [p] = await db.select({ ownerId: schema.prospectCompanies.ownerId }).from(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, pool));
    expect(p.ownerId).toBe(seller);
    expect(await P.setProspectOwner([mine], other)).toEqual({ error: "Only an admin can do that in Outreach." });
    expect(await P.deleteProspect(mine)).toEqual({ error: "Only an admin can do that in Outreach." });
  });

  it("queues prospects with a phone not called lately, own first", async () => {
    const q = (await work.callQueue(seller)).filter((x) => x.name.startsWith(tag));
    expect(q.map((x) => x.id)).toEqual(expect.arrayContaining([mine, pool]));
    expect(q.some((x) => x.id === theirs || x.id === replied)).toBe(false);
  });

  it("shows replies with what they wrote and turns one into a CRM lead once", async () => {
    const list = (await work.listReplies(seller)).filter((r) => r.id === replied);
    expect(list[0]).toMatchObject({ said: "Send a quote for 10 laptops", headline: "Replied: ali@x.test · Re: laptops" });
    expect((await work.listReplies(other)).some((r) => r.id === replied)).toBe(false);

    await as(seller);
    const personId = list[0].people[0].id;
    const r = await W.convertToLead(replied, { personId, requirement: list[0].said, via: "email" });
    expect(r.error).toBeUndefined();
    const [p] = await db.select().from(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, replied));
    expect(p).toMatchObject({ status: "converted", crmDealId: r.value!.dealId });
    const [deal] = await db.select().from(schema.deals).where(D.eq(schema.deals.id, r.value!.dealId));
    expect(deal).toMatchObject({ stage: "new", source: "Email", ownerId: seller, requirement: "Send a quote for 10 laptops" });
    const [contact] = await db.select().from(schema.contacts).where(D.eq(schema.contacts.id, deal.contactId!));
    expect(contact.name).toBe("Ali Khan");
    expect((await W.convertToLead(replied, { via: "email" })).error).toMatch(/Already a lead/);
    expect(await work.repliesWaiting(seller)).toBe(0);
  });
});
