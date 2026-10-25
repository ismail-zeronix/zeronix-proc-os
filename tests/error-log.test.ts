import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("error log (needs the dev database)", () => {
  const tag = `ZZERR${Date.now()}`;
  let userId = 0;

  afterAll(async () => {
    const { db, schema, pool } = await import("@/db");
    const { like, eq } = await import("drizzle-orm");
    await db.delete(schema.errorLog).where(like(schema.errorLog.message, `${tag}%`));
    if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("saves the page, the message and who it happened to, and never throws", async () => {
    const { db, schema } = await import("@/db");
    const { logServerError, recentErrors } = await import("@/lib/error-log");
    userId = (await db.insert(schema.users).values({ name: `${tag}-u`, email: `${tag}@example.test`, passwordHash: "x" }).returning({ id: schema.users.id }))[0].id;
    const token = await new SignJWT({ name: "u", email: "u@example.test", role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await logServerError(new Error(`${tag} boom`), { path: "/accounts/bills?view=all", method: "GET", headers: { cookie: `theme=dark; zp_session=${token}` } }, { routeType: "render", routePath: "/accounts/bills" });
    await logServerError("not even an Error", { path: "/x", method: "POST", headers: {} }, {});
    const [e] = (await recentErrors(20)).filter((r) => r.message === `${tag} boom`);
    expect(e).toMatchObject({ path: "/accounts/bills?view=all", routeType: "render", userName: `${tag}-u` });
    expect(e.stack).toContain("boom");
    await db.delete(schema.errorLog).where((await import("drizzle-orm")).eq(schema.errorLog.message, "not even an Error"));
  });
});
