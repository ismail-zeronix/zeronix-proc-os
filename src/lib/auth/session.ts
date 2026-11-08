import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { allowedApps, type AppKey } from "@/lib/apps";
import { dubaiToday } from "@/lib/dates";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./token";
import { UserError } from "@/lib/user-error";

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
  /** True when they see every sales record (admins, and users set to "All data"); false = only the deals they are on. */
  seesAll: boolean;
  /** Has the Accounts app (invoices, payments, purchases, reports): sees every money record. Admins always. */
  finance: boolean;
  /** Accountant work on top of Accounts: journals, chart of accounts, reconciliation, VAT filing, lock date. Admins always. */
  accountant: boolean;
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
      dataScope: schema.users.dataScope,
      isAccountant: schema.users.isAccountant,
      sessionVersion: schema.users.sessionVersion,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.id))
    .limit(1);
  if (!row || !row.isActive) return null;
  // the password changed, or "Sign out everywhere": this cookie is from before, so it no longer opens anything
  if (row.sessionVersion !== session.sv) return null;
  const user: SessionUser = { id: session.id, name: row.name, email: row.email, role: row.role, sv: session.sv };
  const apps = allowedApps({ role: row.role, apps: row.apps });
  return {
    user,
    apps,
    seesAll: row.role === "admin" || row.dataScope === "all",
    finance: apps.includes("accounts"),
    accountant: row.role === "admin" || (apps.includes("accounts") && row.isAccountant),
  };
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

/** For Accounts pages (invoices, payments, purchases, reports): others get "page does not exist". */
export async function requireFinance(): Promise<Access> {
  const access = await requireApp("accounts");
  if (!access.finance) notFound();
  return access;
}

/** For accountant pages (journals, chart of accounts, VAT returns, lock date): others get "page does not exist". */
export async function requireAccountant(): Promise<Access> {
  const access = await requireFinance();
  if (!access.accountant) notFound();
  return access;
}

/**
 * Nothing changes in the portal until you punch in (the browser blocks clicks too; this is the rule on the server).
 * Only a session opened today counts. Cached per request.
 */
export const isPunchedIn = cache(async (userId: number): Promise<boolean> => {
  const [open] = await db
    .select({ id: schema.attendancePunches.id })
    .from(schema.attendancePunches)
    .where(
      and(
        eq(schema.attendancePunches.userId, userId),
        eq(schema.attendancePunches.day, dubaiToday()),
        isNull(schema.attendancePunches.outAt),
      ),
    )
    .limit(1);
  return !!open;
});

export const NOT_PUNCHED_IN = "Punch in first: click the clock at the top of the page.";

/** For server actions that change something: throws unless the user may use this app and has punched in. */
export async function assertApp(key: AppKey): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || !access.apps.includes(key)) throw new UserError("You do not have access to this");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return access.user;
}

/** Like assertApp, for actions that people of either app may run (e.g. making a quote from Sales or from Projects). */
export async function assertAnyApp(...keys: AppKey[]): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || !keys.some((k) => access.apps.includes(k))) throw new UserError("You do not have access to this");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return access.user;
}

/** For money server actions (invoices, payments, bills, expenses): the Accounts app, punched in. */
export async function assertFinance(): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || !access.finance) throw new UserError("Only the accounts team can do this");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return access.user;
}

/** For accountant actions (post a journal, reconcile, file VAT, move the lock date): Accounts + the Accountant switch, punched in. */
export async function assertAccountant(): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || !access.accountant) throw new UserError("Only an accountant can do this. An admin can switch it on in Admin › Users.");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return access.user;
}

/** For route handlers: true when the user is signed in, active and allowed this app. */
export async function hasApp(key: AppKey): Promise<boolean> {
  const access = await loadAccess();
  return !!access && access.apps.includes(key);
}

export async function requireAdmin(): Promise<SessionUser> {
  const access = await loadAccess();
  if (!access || access.user.role !== "admin") throw new UserError("Admin access required");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return access.user;
}
