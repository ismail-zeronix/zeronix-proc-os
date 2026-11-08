import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, type SessionUser } from "./token";

/** Signs the user in on this browser: the session cookie, httpOnly, for SESSION_DAYS. */
export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/**
 * Signs a user out on every browser and phone: raises their session version, so every cookie signed before stops
 * working at the next request. Returns the new version (to sign this browser in again when the user did it themselves).
 */
export async function revokeSessions(userId: number, tx: Pick<typeof db, "update"> = db): Promise<number> {
  const [r] = await tx
    .update(schema.users)
    .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .returning({ v: schema.users.sessionVersion });
  return r?.v ?? 1;
}
