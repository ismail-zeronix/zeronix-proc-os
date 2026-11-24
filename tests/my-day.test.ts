import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("My day (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let D: typeof import("drizzle-orm");
  let A: typeof import("@/app/(app)/crm/actions");
  let M: typeof import("@/app/(app)/(home)/my-day-actions");
  let lib: typeof import("@/lib/my-day");
  let seller: number, other: number;
  const tag = `ZZDAY${Date.now()}`;
  const sign = (id: number, role: "admin" | "sales") =>
    new SignJWT({ name: "x", email: "x@example.test", role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const as = async (id: number) => {
    cookieValue = await sign(id, "sales");
  };
  const H = 3600_000;

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    D = await import("drizzle-orm");
    A = await import("@/app/(app)/crm/actions");
    M = await import("@/app/(app)/(home)/my-day-actions");
    lib = await import("@/lib/my-day");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales" }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller");
    other = await mk("other");
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values([seller, other].map((userId) => ({ userId, day: dubaiToday() })));
  });

  afterAll(async () => {
    const ids = [seller, other];
    await db.delete(schema.prospectCompanies).where(D.inArray(schema.prospectCompanies.ownerId, ids));
    const cs = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const mine = cs.filter((c) => c.name.includes(tag)).map((c) => c.id);
    if (mine.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(D.inArray(schema.deals.companyId, mine));
      if (deals.length) await db.delete(schema.tasks).where(D.and(D.eq(schema.tasks.relatedType, "deal"), D.inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      await db.delete(schema.companies).where(D.inArray(schema.companies.id, mine));
    }
    await db.delete(schema.tasks).where(D.inArray(schema.tasks.createdBy, ids));
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, ids));
    await db.delete(schema.users).where(D.inArray(schema.users.id, ids));
    await pool.end();
  });

  it("lists overdue, today's, new and no-next-step deals in that order, only the seller's own", async () => {
    await as(seller);
    const mk = async (name: string) => (await A.createDeal({ companyName: `${tag} ${name}`, contactName: "Sam", contactPhone: "+971501234567", requirement: "x" })).id;
    const overdue = await mk("Overdue");
    const later = await mk("Later");
    const fresh = await mk("Fresh");
    const nostep = await mk("NoStep");
    const now = Date.now();
    await db.update(schema.deals).set({ stage: "contacted", followUpAt: new Date(now - 2 * H) }).where(D.eq(schema.deals.id, overdue));
    await db.update(schema.deals).set({ stage: "requirement", followUpAt: new Date(now + 30 * 24 * H) }).where(D.eq(schema.deals.id, later));
    await db.update(schema.deals).set({ stage: "requirement", followUpAt: null }).where(D.eq(schema.deals.id, nostep));
    await as(other);
    const theirs = (await A.createDeal({ companyName: `${tag} Theirs`, requirement: "x" })).id;

    const day = await lib.myDay(seller, { coldCalls: false });
    const ours = day.items.filter((i) => [overdue, later, fresh, nostep, theirs].includes(i.dealId ?? 0));
    expect(ours.map((i) => [i.dealId, i.kind])).toEqual([
      [overdue, "overdue"],
      [fresh, "new_lead"],
      [nostep, "no_step"],
    ]);
    expect(ours[0]).toMatchObject({ contact: "Sam", phone: "+971501234567" });
  });

  it("counts today's calls and the week's leads", async () => {
    await as(seller);
    const before = await lib.dayCounts(seller);
    const id = (await A.createDeal({ companyName: `${tag} Counted`, requirement: "x" })).id;
    await A.logActivity(id, { type: "call", outcome: "no_answer", followUpAt: new Date(Date.now() + 24 * H).toISOString() });
    await A.logActivity(id, { type: "call", outcome: "connected" });
    const after = await lib.dayCounts(seller);
    expect(after.calls - before.calls).toBe(2);
    expect(after.reached - before.reached).toBe(1);
    expect(after.leadsWeek - before.leadsWeek).toBe(1);
  });

  it("moves a follow-up only with a reason, and notes it on the timeline", async () => {
    await as(seller);
    const id = (await A.createDeal({ companyName: `${tag} Moved`, requirement: "x" })).id;
    const to = new Date(Date.now() + 48 * H).toISOString();
    await expect(A.moveFollowUp(id, { followUpAt: to, reason: "" })).rejects.toThrow(/why/i);
    await A.moveFollowUp(id, { followUpAt: to, reason: "Customer travelling" });
    const [d] = await db.select({ f: schema.deals.followUpAt }).from(schema.deals).where(D.eq(schema.deals.id, id));
    expect(d.f?.toISOString()).toBe(to);
    const notes = await db.select({ body: schema.activities.body }).from(schema.activities).where(D.and(D.eq(schema.activities.dealId, id), D.eq(schema.activities.type, "note")));
    expect(notes[0].body).toMatch(/Follow-up moved to .*: Customer travelling/);
    await as(other);
    await expect(A.moveFollowUp(id, { followUpAt: to, reason: "not mine" })).rejects.toThrow();
  });

  it("puts the seller's prospects on the call list and logs cold calls", async () => {
    const [p] = await db
      .insert(schema.prospectCompanies)
      .values({ name: `${tag} Prospect`, nameNorm: `${tag}prospect`.toLowerCase(), phone: "+97142000000", status: "ready", ownerId: seller })
      .returning({ id: schema.prospectCompanies.id });
    let day = await lib.myDay(seller, { coldCalls: true });
    expect(day.items.find((i) => i.prospectId === p.id)?.kind).toBe("cold");
    // someone else's prospect (and no Prospecting app) is refused
    await as(other);
    await expect(M.logProspectCall(p.id, { outcome: "no_answer" })).rejects.toThrow(/not on your list/);
    await as(seller);
    await M.logProspectCall(p.id, { outcome: "no_answer" });
    day = await lib.myDay(seller, { coldCalls: true });
    expect(day.items.find((i) => i.prospectId === p.id)).toBeUndefined();
    const acts = await db.select().from(schema.prospectActivities).where(D.eq(schema.prospectActivities.companyId, p.id));
    expect(acts[0]).toMatchObject({ kind: "call", outcome: "no_answer", userId: seller, body: "No answer." });
    await M.logProspectCall(p.id, { outcome: "not_interested", body: "has a supplier" });
    const [after] = await db.select({ status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, p.id));
    expect(after.status).toBe("disqualified");
  });
});
