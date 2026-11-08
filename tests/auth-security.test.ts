import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";
import { ipFromHeaders } from "@/lib/client-ip";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue ? { value: cookieValue } : undefined),
    set: (_name: string, value: string) => {
      cookieValue = value;
    },
    delete: () => {
      cookieValue = undefined;
    },
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

describe("after sign-in, only pages of this site", () => {
  it("keeps local paths and refuses everything else", () => {
    expect(safeNext("/crm/deals/4?tab=files")).toBe("/crm/deals/4?tab=files");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("crm")).toBe("/");
  });
});

describe("the visitor's address", () => {
  it("trusts what our proxy added (the last entry), never what the caller wrote first", () => {
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(new Headers({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(ipFromHeaders(new Headers())).toBe("");
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("sessions can be revoked (needs the test database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let userId = 0;
  const tag = `ZZAUTH${Date.now()}`;

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq } = await import("drizzle-orm"));
    [{ id: userId }] = await db.insert(schema.users).values({ name: tag, email: `${tag}@example.test`, passwordHash: "x", role: "sales", apps: ["crm"] }).returning({ id: schema.users.id });
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("an old cookie stops working once the session version is raised, a fresh one works", async () => {
    const { signSession } = await import("@/lib/auth/token");
    const { revokeSessions, setSessionCookie } = await import("@/lib/auth/session-cookie");
    const session = await import("@/lib/auth/session");
    const old = await signSession({ id: userId, name: tag, email: `${tag}@example.test`, role: "sales", sv: 1, org: 1 });
    cookieValue = old;
    // loadAccess is cached per request in React; outside a request it runs each time
    expect((await session.loadAccess())?.user.id).toBe(userId);
    const sv = await revokeSessions(userId);
    expect(sv).toBe(2);
    cookieValue = old;
    expect(await session.loadAccess()).toBeNull();
    await setSessionCookie({ id: userId, name: tag, email: `${tag}@example.test`, role: "sales", sv, org: 1 });
    expect(cookieValue).not.toBe(old);
    expect((await session.loadAccess())?.user.id).toBe(userId);
  });

  it("cookies from before session versions count as version 1", async () => {
    const { SignJWT } = await import("jose");
    const { verifySession } = await import("@/lib/auth/token");
    const legacy = await new SignJWT({ name: "x", email: "x@example.test", role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    expect((await verifySession(legacy))?.sv).toBe(1);
  });
});
