import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("Team today and the sales KPIs (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let k: typeof import("@/lib/sales-kpis");
  let digest: typeof import("@/lib/notifications/digest");
  let busy: number, away: number, boss: number, companyId: number, dealId: number, prospectId: number;
  const tag = `ZZKPI${Date.now()}`;
  let today: string;
  const ago = (min: number) => new Date(Date.now() - min * 60_000);

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    k = await import("@/lib/sales-kpis");
    digest = await import("@/lib/notifications/digest");
    today = (await import("@/lib/dates")).dubaiToday();
    const mk = async (name: string, extra: Partial<typeof schema.users.$inferInsert> = {}) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", ...extra }).returning({ id: schema.users.id }))[0].id;
    busy = await mk("busy", { salesTargets: { callsDay: 3 } });
    away = await mk("away");
    boss = await mk("boss", { role: "admin" });
    await db.insert(schema.attendancePunches).values({ userId: busy, day: today, inAt: ago(5) });
    [{ id: companyId }] = await db.insert(schema.companies).values({ name: `${tag} Co`, nameNorm: `${tag} co`.toLowerCase() }).returning({ id: schema.companies.id });
    [{ id: dealId }] = await db
      .insert(schema.deals)
      .values({ title: `${tag} deal`, companyId, stage: "contacted", ownerId: busy, followUpAt: ago(60) })
      .returning({ id: schema.deals.id });
    await db.insert(schema.dealAssignees).values({ dealId, userId: busy, position: 0 });
    await db.insert(schema.activities).values([
      { type: "call", outcome: "interested", body: "Wants 10 laptops", dealId, companyId, userId: busy, at: ago(4) },
      { type: "call", outcome: "no_answer", body: "No answer.", dealId, companyId, userId: busy, at: ago(3) },
      { type: "whatsapp", body: "Sent the brochure", dealId, companyId, userId: busy, at: ago(2) },
    ]);
    [{ id: prospectId }] = await db.insert(schema.prospectCompanies).values({ name: `${tag} Prospect`, nameNorm: `${tag} prospect`.toLowerCase(), ownerId: busy }).returning({ id: schema.prospectCompanies.id });
    await db.insert(schema.prospectActivities).values([
      { companyId: prospectId, userId: busy, kind: "created", body: "Added" },
      { companyId: prospectId, userId: busy, kind: "call", outcome: "connected", body: "Talked: call back" },
    ]);
    await db.insert(schema.checkIns).values({ userId: busy, day: today, dueAt: ago(1), answeredAt: ago(1), done: ["calls"], note: "Calls done" });
  });

  afterAll(async () => {
    await db.delete(schema.notifications).where(D.eq(schema.notifications.dedupeKey, `team_day:${today}`));
    await db.delete(schema.prospectCompanies).where(D.eq(schema.prospectCompanies.id, prospectId));
    await db.delete(schema.activities).where(D.eq(schema.activities.dealId, dealId));
    await db.delete(schema.deals).where(D.eq(schema.deals.id, dealId));
    await db.delete(schema.companies).where(D.eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, [busy, away, boss]));
    await db.delete(schema.users).where(D.inArray(schema.users.id, [busy, away, boss]));
  });

  it("shows who is in and what each one did today", async () => {
    const rows = await k.teamToday();
    const b = rows.find((r) => r.id === busy)!;
    expect(b).toMatchObject({ status: "in", calls: 3, reached: 2, messages: 1, prospectsAdded: 1, overdue: 1, checkIns: { answered: 1, missed: 0 }, report: null });
    expect(b.targets.callsDay).toBe(3);
    expect(rows.find((r) => r.id === away)).toMatchObject({ status: "away", calls: 0 });
    expect(rows.some((r) => r.id === boss)).toBe(false); // admins are not on the routine
  });

  it("adds up the week and draws calls per day", async () => {
    const w = await k.teamKpis("week");
    const b = w.rows.find((r) => r.id === busy)!;
    expect(b).toMatchObject({ daysWorked: 1, calls: 3, reached: 2, prospectsAdded: 1, reports: 0 });
    const lastDay = w.callsByDay.at(-1)!;
    expect(lastDay[`u${busy}`]).toBe(3);
  });

  it("lists the day in time order", async () => {
    const events = await k.personDay(busy, today);
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe("punch");
    expect(kinds).toContain("prospect");
    expect(events.find((e) => e.outcome === "interested")?.link).toBe(`/crm/deals/${dealId}`);
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort());
  });

  it("puts the evening team day in the admins' bell (no email without a digest mailbox)", async () => {
    const r = await digest.sendTeamDay(today);
    expect(r.emails).toBe(0);
    const [line] = await db
      .select({ title: schema.notifications.title, body: schema.notifications.body, link: schema.notifications.link })
      .from(schema.notifications)
      .where(D.and(D.eq(schema.notifications.userId, boss), D.eq(schema.notifications.dedupeKey, `team_day:${today}`)));
    expect(line.link).toBe("/crm/team");
    expect(line.body).toContain(`${tag}-busy 3 calls, no report`);
  });
});
