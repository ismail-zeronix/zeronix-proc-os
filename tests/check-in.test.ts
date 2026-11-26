import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("the what-have-you-done check-in (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let ci: typeof import("@/lib/check-in");
  let scan: typeof import("@/lib/notifications/scan");
  let rules: typeof import("@/lib/notifications/rules");
  let h: import("@/lib/attendance").WorkHours;
  let add: typeof import("@/lib/notifications/work-time").addWorkMinutes;
  let seller: number, quiet: number;
  const tag = `ZZCHK${Date.now()}`;
  // a fixed Tuesday, so the test does not depend on today's clock
  const DAY = "2026-11-24";
  const MIN = 60_000;
  let inAt: Date;

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    ci = await import("@/lib/check-in");
    scan = await import("@/lib/notifications/scan");
    rules = await import("@/lib/notifications/rules");
    add = (await import("@/lib/notifications/work-time")).addWorkMinutes;
    h = await (await import("@/lib/attendance-data")).workHours();
    const mk = async (name: string, extra: Partial<typeof schema.users.$inferInsert> = {}) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", ...extra }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller");
    quiet = await mk("quiet", { salesTargets: { off: true } });
    inAt = new Date(new Date(`${DAY}T00:00:00+04:00`).getTime() + h.start * MIN);
    await db.insert(schema.attendancePunches).values([seller, quiet].map((userId) => ({ userId, day: DAY, inAt })));
  });

  afterAll(async () => {
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, [seller, quiet]));
    await db.delete(schema.users).where(D.inArray(schema.users.id, [seller, quiet]));
  });

  it("asks two working hours after punch-in, and not before", async () => {
    const due = add(inAt, 120, h);
    const early = (await ci.checkInState(seller, new Date(inAt.getTime() + 60 * MIN)))!;
    expect(early.due).toBe(false);
    expect(new Date(early.dueAt).getTime()).toBe(due.getTime());
    expect(await ci.checkInState(quiet, new Date(due.getTime() + MIN))).toBeNull(); // not on the routine
  });

  it("takes ticks and a line, then counts two hours from the answer", async () => {
    const due = add(inAt, 120, h);
    const now = new Date(due.getTime() + 2 * MIN);
    expect((await ci.checkInState(seller, now))!.due).toBe(true);
    await expect(ci.answerCheckIn(seller, { done: [], note: "called" }, now)).rejects.toThrow(/Tick/);
    await expect(ci.answerCheckIn(seller, { done: ["calls"], note: "" }, now)).rejects.toThrow(/one line/);
    expect(await ci.answerCheckIn(seller, { done: ["calls", "calls", "prospects"], note: "Called 4 hotels" }, now)).toEqual({ late: false });
    const [row] = await db.select().from(schema.checkIns).where(D.eq(schema.checkIns.userId, seller));
    expect(row).toMatchObject({ done: ["calls", "prospects"], note: "Called 4 hotels", missed: false });
    expect(row.counts).toMatchObject({ calls: 0 });
    const next = (await ci.checkInState(seller, new Date(now.getTime() + MIN)))!;
    expect(next.due).toBe(false);
    expect(new Date(next.dueAt).getTime()).toBe(add(now, 120, h).getTime());
  });

  it("marks an unanswered ask missed after 15 minutes, tells the admins, and still takes a late answer", async () => {
    const answered = add(add(inAt, 120, h), 2, h);
    const due = add(answered, 120, h);
    // 10 minutes: still ringing, not missed yet
    expect(await ci.markMissedCheckIns(new Date(due.getTime() + 10 * MIN), [seller])).toBe(0);
    const later = new Date(due.getTime() + 16 * MIN);
    expect(await ci.markMissedCheckIns(later, [seller])).toBe(1);
    expect(await ci.markMissedCheckIns(later, [seller])).toBe(0); // once

    const cfg = rules.ruleConfigs("{}");
    const hits = (await scan.routineHits("checkin_missed", cfg.checkin_missed, h, DAY, later)).filter((x) => x.recordId === seller);
    expect(hits).toHaveLength(1);
    expect(hits[0].userIds).toEqual([]); // empty = the admins
    expect(rules.stepAt(hits[0].timeline, later)).toBe("due");

    const state = (await ci.checkInState(seller, later))!;
    expect(state).toMatchObject({ due: true, missed: true });
    expect(new Date(state.dueAt).getTime()).toBe(due.getTime());
    expect(await ci.answerCheckIn(seller, { done: ["meeting"], note: "Was at a site visit" }, later)).toEqual({ late: true });
    const rows = await db.select().from(schema.checkIns).where(D.eq(schema.checkIns.userId, seller));
    const late = rows.find((r) => r.dueAt.getTime() === due.getTime())!;
    expect(late).toMatchObject({ missed: true, note: "Was at a site visit" });
    expect(late.answeredAt).not.toBeNull();
  });

  it("stops asking once they punch out", async () => {
    await db.update(schema.attendancePunches).set({ outAt: new Date(inAt.getTime() + 9 * 3600_000) }).where(D.eq(schema.attendancePunches.userId, seller));
    expect(await ci.checkInState(seller, new Date(inAt.getTime() + 9.5 * 3600_000))).toBeNull();
  });
});
