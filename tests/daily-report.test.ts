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

describe.skipIf(!live)("end-of-day report and routine nudges (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let att: typeof import("@/app/(app)/attendance-actions");
  let rep: typeof import("@/app/(app)/daily-report-actions");
  let lib: typeof import("@/lib/daily-report");
  let scan: typeof import("@/lib/notifications/scan");
  let rules: typeof import("@/lib/notifications/rules");
  let seller: number, idler: number, quiet: number, companyId: number, dealId: number;
  const tag = `ZZEOD${Date.now()}`;
  const sign = (id: number) =>
    new SignJWT({ name: "x", email: "x@example.test", role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const as = async (id: number) => {
    cookieValue = await sign(id);
  };
  // a fixed Tuesday and the Monday before it, for the nudges
  const DAY = "2026-11-24";
  const PREV = "2026-11-23";
  const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+04:00`);

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    att = await import("@/app/(app)/attendance-actions");
    rep = await import("@/app/(app)/daily-report-actions");
    lib = await import("@/lib/daily-report");
    scan = await import("@/lib/notifications/scan");
    rules = await import("@/lib/notifications/rules");
    const mk = async (name: string, extra: Partial<typeof schema.users.$inferInsert> = {}) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", ...extra }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", { salesTargets: { callsDay: 20 } });
    idler = await mk("idler");
    quiet = await mk("quiet", { salesTargets: { off: true } });
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values([seller, quiet].map((userId) => ({ userId, day: dubaiToday() })));
    // a deal of the seller's with a follow-up already past
    [{ id: companyId }] = await db.insert(schema.companies).values({ name: `${tag} Co`, nameNorm: `${tag} co`.toLowerCase() }).returning({ id: schema.companies.id });
    [{ id: dealId }] = await db
      .insert(schema.deals)
      .values({ title: `${tag} deal`, companyId, stage: "contacted", followUpAt: new Date(Date.now() - 3600_000) })
      .returning({ id: schema.deals.id });
    await db.insert(schema.dealAssignees).values({ dealId, userId: seller, position: 0 });
  });

  afterAll(async () => {
    const ids = [seller, idler, quiet];
    await db.delete(schema.activities).where(D.eq(schema.activities.dealId, dealId));
    await db.delete(schema.deals).where(D.eq(schema.deals.id, dealId));
    await db.delete(schema.companies).where(D.eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, ids));
    await db.delete(schema.users).where(D.inArray(schema.users.id, ids));
  });

  it("asks the sales team for the report before punching out, and nobody else", async () => {
    await as(seller);
    await expect(att.punchOut({ reason: "Client or site visit" })).rejects.toThrow(/end-of-day report/);
    // someone taken off the routine punches out as before
    expect(await lib.reportDue(quiet)).toBe(false);
    await as(quiet);
    expect(await rep.loadEndOfDay()).toBeNull();
    await att.punchOut({ reason: "Client or site visit" });
  });

  it("fills in the day, wants a note and a reason under target, and moves the leftovers", async () => {
    await as(seller);
    const sheet = (await rep.loadEndOfDay())!;
    expect(sheet.counts.targets.callsDay).toBe(20); // their own number over the team's
    expect(sheet.missed[0]).toMatch(/^calls 0\/20/);
    expect(sheet.left.map((l) => l.dealId)).toEqual([dealId]);

    await expect(rep.sendDailyReport({ note: "ok", behindReason: "", move: true })).rejects.toThrow(/short note/);
    await expect(rep.sendDailyReport({ note: "Called two clients back.", behindReason: "", move: true })).rejects.toThrow(/why/i);
    const r = await rep.sendDailyReport({ note: "Called two clients back.", behindReason: "Site visit all morning", move: true });
    expect(r.moved).toBe(1);

    const [deal] = await db.select({ followUpAt: schema.deals.followUpAt }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    expect(deal.followUpAt!.getTime()).toBeGreaterThan(Date.now());
    const notes = await db.select({ body: schema.activities.body }).from(schema.activities).where(D.eq(schema.activities.dealId, dealId));
    expect(notes.some((n) => /end-of-day report/.test(n.body))).toBe(true);

    const [saved] = await db.select().from(schema.dailyReports).where(D.eq(schema.dailyReports.userId, seller));
    expect(saved).toMatchObject({ note: "Called two clients back.", behindReason: "Site visit all morning", moved: 1 });
    expect(saved.counts.followUpsLeft).toBe(1);

    // sent: punching out goes through, and the sheet says it was sent
    expect((await rep.loadEndOfDay())!.sent?.note).toBe("Called two clients back.");
    await att.punchOut({ reason: "Client or site visit" });
  });

  it("shows the last report when the next day starts", async () => {
    await db.update(schema.dailyReports).set({ day: PREV }).where(D.eq(schema.dailyReports.userId, seller));
    const sod = (await lib.startOfDaySheet(seller))!;
    expect(sod.last).toMatchObject({ day: PREV, note: "Called two clients back." });
    expect(sod.targets.callsDay).toBe(20);
    expect(await lib.startOfDaySheet(quiet)).toBeNull();
  });

  it("nudges an idle or slow salesman, and tells the admins about a missing report", async () => {
    const { workHours } = await import("@/lib/attendance-data");
    const { ruleConfigs } = rules;
    const cfg = ruleConfigs("{}");
    const h = await workHours();
    const today = DAY;
    const now = at(DAY, "13:45");
    await db.insert(schema.attendancePunches).values([
      { userId: idler, day: PREV, inAt: at(PREV, "09:30"), outAt: at(PREV, "18:00") },
      { userId: idler, day: DAY, inAt: at(DAY, "09:30") },
    ]);
    const mine = (hits: Awaited<ReturnType<typeof scan.routineHits>>) => hits.filter((x) => x.recordId === idler);

    const idle = mine(await scan.routineHits("idle_while_punched_in", cfg.idle_while_punched_in, h, today, now));
    expect(idle).toHaveLength(1);
    expect(idle[0].userIds).toEqual([idler]);
    expect(rules.stepAt(idle[0].timeline, now)).not.toBeNull();

    const behind = mine(await scan.routineHits("day_behind_target", cfg.day_behind_target, h, today, now));
    expect(behind).toHaveLength(1);
    expect(behind[0].subject).toBe("0 of 25");
    expect(rules.stepAt(behind[0].timeline, now)).toBe("due");

    const missing = mine(await scan.routineHits("no_eod_report", cfg.no_eod_report, h, today, now));
    expect(missing).toHaveLength(1);
    expect(missing[0].userIds).toEqual([]); // empty = the admins
    await db.insert(schema.dailyReports).values({ userId: idler, day: PREV, note: "late", counts: { calls: 0, reached: 0, messages: 0, meetings: 0, prospectsAdded: 0, leadsWeek: 0, quotesWeek: 0, followUpsLeft: 0, targets: { callsDay: 25, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 } } });
    expect(mine(await scan.routineHits("no_eod_report", cfg.no_eod_report, h, today, now))).toHaveLength(0);
  });
});
