import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { allowedApps, type AppKey } from "@/lib/apps";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./token";

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export interface Access {
  /** Name, email and role as they are in the database right now (not as they were when the cookie was signed). */
  user: SessionUser;
  apps: AppKey[];
}

/** The signed-in user's current role and apps, read from the database once per request. Null = not signed in or deactivated. */
export const loadAccess = cache(async (): Promise<Access | null> => {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db
    .select({
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      apps: schema.users.apps,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.id))
    .limit(1);
  if (!row || !row.isActive) return null;
  const user: SessionUser = { id: session.id, name: row.name, email: row.email, role: row.role };
  return { user, apps: allowedApps({ role: row.role, apps: row.apps }) };
});

/** For pages and layouts: any signed-in, active user. Deactivated users are signed out (their cookie is cleared). */
export async function requireAccess(): Promise<Access> {
  const access = await loadAccess();
  if (!access) redirect((await getSession()) ? "/api/signout" : "/login");
  return access;
}

/** For pages and layouts: the user must be allowed this app, otherwise it looks like the page does not exist. */
export async function requireApp(key: AppKey): Promise<Access> {
  const access = await requireAccess();
  if (!access.apps.includes(key)) notFound();
  return access;
}

/** For server actions and route handlers: throws unless the user may use this app. */
export async function assertApp(key: AppKey): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || !access.apps.includes(key)) throw new Error("You do not have access to this");
  return access.user;
}

/** For route handlers: true when the user is signed in, active and allowed this app. */
export async function hasApp(key: AppKey): Promise<boolean> {
  const access = await loadAccess();
  return !!access && access.apps.includes(key);
}

export async function requireAdmin(): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || access.user.role !== "admin") throw new Error("Admin access required");
  return access.user;
}
