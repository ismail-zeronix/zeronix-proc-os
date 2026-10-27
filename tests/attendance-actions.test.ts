import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The actions read the session cookie and ask Next to refresh pages. Here the cookie is ours to set, and refreshing is a no-op.
let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("punch in / out (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let A: typeof import("@/app/(app)/attendance-actions");
  let D: typeof import("@/lib/attendance-data");
  let worker = 0;
  let other = 0;
  let boss = 0;
  const tag = `ZZATT${Date.now()}`;

  const sign = (id: number, name: string, role: "admin" | "sales") =>
    new SignJWT({ name, email: `${name}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("7d") // the tests move the clock around
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await sign(id, `${tag}-${id}`, role);
  };
  /** Wednesday 21 Oct 2026 at this UAE time. */
  const clock = (hm: string, day = "2026-10-21") => vi.setSystemTime(new Date(`${day}T${hm}:00+04:00`));

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray } = await import("drizzle-orm"));
    A = await import("@/app/(app)/attendance-actions");
    D = await import("@/lib/attendance-data");
    const mk = async (name: string, role: "admin" | "sales") =>
      (
        await db
          .insert(schema.users)
          .values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, createdAt: new Date("2026-10-01T00:00:00Z") })
          .returning({ id: schema.users.id })
      )[0].id;
    worker = await mk("worker", "sales");
    other = await mk("other", "sales");
    boss = await mk("boss", "admin");
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    cookieValue = undefined;
  });

  afterAll(async () => {
    vi.useRealTimers();
    const ids = [worker, other, boss];
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, ids));
    await db.delete(schema.attendanceAbsences).where(inArray(schema.attendanceAbsences.userId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
    await pool.end();
  });

  it("punches in on time without a reason, and asks for one when leaving mid-day", async () => {
    await as(worker);
    clock("09:20");
    await A.punchIn({});
    await expect(A.punchIn({})).rejects.toThrow(/already punched in/i);
    expect((await D.punchState(worker)).punchedIn).toBe(true);

    clock("12:00");
    await expect(A.punchOut({})).rejects.toThrow(/reason/i);
    await A.punchOut({ reason: "Client or site visit: Dell office" });
    const state = await D.punchState(worker);
    expect(state.punchedIn).toBe(false);
    expect(state.closedMinutes).toBe(160);

    clock("15:00"); // during the break: no reason
    await A.punchIn({});
    clock("21:30"); // end of day: no reason
    await A.punchOut({});

    const rows = await db.select().from(schema.attendancePunches).where(eq(schema.attendancePunches.userId, worker));
    expect(rows.map((r) => [r.late, r.early, r.outReason])).toEqual([
      [false, true, "Client or site visit: Dell office"],
      [false, false, ""],
    ]);
  });

  it("needs a reason to punch in late, marks the day late, and closes a forgotten session next day", async () => {
    await as(other);
    clock("10:05", "2026-10-20");
    await expect(A.punchIn({ reason: "" })).rejects.toThrow(/late/i);
    await A.punchIn({ reason: "Traffic or transport delay" });
    // never punched out; next morning the session is closed at 9:30 PM the day before
    clock("09:00", "2026-10-21");
    const state = await D.punchState(other);
    expect(state.punchedIn).toBe(false);
    const [row] = await db.select().from(schema.attendancePunches).where(eq(schema.attendancePunches.userId, other));
    expect(row.autoClosed).toBe(true);
    expect(row.outAt?.toISOString()).toBe(new Date("2026-10-20T21:30:00+04:00").toISOString());

    const month = await D.monthAttendance(other, "2026-10");
    const cell = (d: string) => month.cells.find((c) => c.day === d)!;
    expect(cell("2026-10-20").status).toBe("late");
    expect(cell("2026-10-20").sessions[0].inReason).toBe("Traffic or transport delay");
    expect(cell("2026-10-19").status).toBe("absent");
    expect(cell("2026-10-18").status).toBe("off"); // Sunday
    expect(cell("2026-10-21").status).toBe("today");
  });

  it("records absences for yourself, or for anyone as an admin", async () => {
    clock("09:00");
    await as(other);
    await A.setAbsence({ userId: other, day: "2026-10-19", kind: "medical", note: "Fever" });
    await expect(A.setAbsence({ userId: worker, day: "2026-10-19", kind: "medical" })).rejects.toThrow(/own days/i);
    await expect(A.setAbsence({ userId: other, day: "2026-10-15", kind: "other", note: "" })).rejects.toThrow(/reason/i);
    await expect(A.setAbsence({ userId: other, day: "2027-03-01", kind: "other", note: "Holiday" })).rejects.toThrow(/60 days/i);

    await as(boss, "admin");
    await A.setAbsence({ userId: worker, day: "2026-10-15", kind: "other", note: "Bank visit" });

    const m = await D.monthAttendance(other, "2026-10");
    expect(m.cells.find((c) => c.day === "2026-10-19")!.status).toBe("medical");
    expect((await D.monthAttendance(worker, "2026-10")).cells.find((c) => c.day === "2026-10-15")!.status).toBe("other");

    await as(other);
    await A.clearAbsence({ userId: other, day: "2026-10-19" });
    expect((await D.monthAttendance(other, "2026-10")).cells.find((c) => c.day === "2026-10-19")!.status).toBe("absent");
  });
});
