import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers(),
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("go-live safety (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let L: typeof import("@/lib/auth/lockout");
  let T: typeof import("@/app/(app)/tasks/actions");
  let ACC: typeof import("@/app/(app)/account/actions");
  let bcrypt: typeof import("bcryptjs").default;
  let userId = 0;
  const tag = `ZZGO${Date.now()}`;
  const email = `${tag}@example.test`;

  const signIn = async () => {
    cookieValue = await new SignJWT({ name: tag, email, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(userId))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq } = await import("drizzle-orm"));
    bcrypt = (await import("bcryptjs")).default;
    L = await import("@/lib/auth/lockout");
    T = await import("@/app/(app)/tasks/actions");
    ACC = await import("@/app/(app)/account/actions");
    userId = (
      await db
        .insert(schema.users)
        .values({ name: tag, email, passwordHash: await bcrypt.hash("first-password", 4), role: "sales" })
        .returning({ id: schema.users.id })
    )[0].id;
  });

  afterAll(async () => {
    await L.clearFailures(email);
    await db.delete(schema.tasks).where(eq(schema.tasks.assignedTo, userId));
    await db.delete(schema.attendancePunches).where(eq(schema.attendancePunches.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("locks an email after 5 wrong passwords and unlocks when cleared", async () => {
    for (let i = 0; i < 4; i++) await L.recordFailure(email, "test");
    expect(await L.lockedMinutes(email)).toBe(0);
    await L.recordFailure(email, "test");
    const wait = await L.lockedMinutes(email);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(L.WINDOW_MINUTES);
    // the window passes
    expect(await L.lockedMinutes(email, new Date(Date.now() + (L.WINDOW_MINUTES + 1) * 60_000))).toBe(0);
    await L.clearFailures(email);
    expect(await L.lockedMinutes(email)).toBe(0);
  });

  it("refuses changes until the user punches in", async () => {
    await signIn();
    await expect(T.createTask({ title: `${tag} task` })).rejects.toThrow(/punch in/i);
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values({ userId, day: dubaiToday() });
    await T.createTask({ title: `${tag} task` });
    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.assignedTo, userId));
    expect(rows).toHaveLength(1);
  });

  it("changes your own password only with the current one", async () => {
    await signIn();
    await expect(ACC.changeMyPassword({ current: "wrong", next: "second-password" })).rejects.toThrow(/current password/i);
    await expect(ACC.changeMyPassword({ current: "first-password", next: "short" })).rejects.toThrow(/8 characters/);
    await expect(ACC.changeMyPassword({ current: "first-password", next: "first-password" })).rejects.toThrow(/different/);
    await ACC.changeMyPassword({ current: "first-password", next: "second-password" });
    const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId));
    expect(await bcrypt.compare("second-password", row.hash)).toBe(true);
  });
});
