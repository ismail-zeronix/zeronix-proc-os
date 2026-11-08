import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db, runAsOrg, schema } from "@/db";
import { audit } from "@/lib/audit";
import { loginUser } from "@/lib/auth/login-user";
import { UserError } from "@/lib/user-error";

/** How long an invitation link works. */
export const INVITE_HOURS = 72;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The address people open the portal at, for the links we hand out (APP_PUBLIC_URL, else this request's host). */
export async function publicBaseUrl(): Promise<string> {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, "");
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (process.env.COOKIE_SECURE === "true" ? "https" : "http");
    if (host) return `${proto}://${host}`;
  } catch {
    // no request (scripts)
  }
  return "http://localhost:3100";
}

/**
 * A new one-time link to join an organisation as `role`. Only the token's hash is stored, so the link cannot be read back
 * from the database; whoever made it passes it on (copy it into WhatsApp or an email). `createdBy` is a user of the
 * organisation, or null when the platform made it.
 */
export async function createInvite(orgId: number, input: { email: string; name?: string; role: "admin" | "sales"; createdBy: number | null }): Promise<{ url: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Enter a valid email address.");
  if (await loginUser(email)) throw new UserError("Someone already signs in with this email.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000);
  await runAsOrg(orgId, async () => {
    await assertRoomForUser();
    await db.insert(schema.invites).values({ tokenHash: hashToken(token), email, name: (input.name ?? "").trim().slice(0, 120), role: input.role, expiresAt, createdBy: input.createdBy });
  });
  return { url: `${await publicBaseUrl()}/invite/${token}`, expiresAt };
}

export interface InviteInfo {
  id: number;
  orgId: number;
  orgName: string;
  email: string;
  name: string;
  role: "admin" | "sales";
  /** null when it can be used; otherwise why not, in plain words. */
  problem: string | null;
}

/** What a link is for, through app_invite_lookup() (the person is not signed in to that organisation yet). */
export async function lookupInvite(token: string): Promise<InviteInfo | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const r = await db.execute<{ id: number; organization_id: number; org_name: string; org_active: boolean; email: string; name: string; role: string; expires_at: Date; used_at: Date | null }>(
    sql`SELECT * FROM app_invite_lookup(${hashToken(token)})`,
  );
  const i = r.rows[0];
  if (!i) return null;
  const problem = i.used_at ? "This link was already used. Sign in instead." : new Date(i.expires_at).getTime() < Date.now() ? "This link has expired. Ask for a new one." : !i.org_active ? "This company's account is paused." : null;
  return { id: i.id, orgId: i.organization_id, orgName: i.org_name, email: i.email, name: i.name, role: i.role === "admin" ? "admin" : "sales", problem };
}

/** The organisation's user limit (platform console), checked before anyone new joins. Runs inside the organisation. */
export async function assertRoomForUser(): Promise<void> {
  const [org] = await db.select({ limit: schema.organizations.userLimit }).from(schema.organizations).limit(1);
  if (org?.limit == null) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.isActive, true));
  if (n >= org.limit) throw new UserError(`This company's plan allows ${org.limit} active user${org.limit === 1 ? "" : "s"}. Deactivate someone first, or ask Zeronix for more.`);
}

/** Joins the organisation: the user is made with the invite's email and role, and the link can never be used again. */
export async function acceptInvite(token: string, input: { name: string; password: string }): Promise<{ id: number; orgId: number; name: string; email: string; role: "admin" | "sales" }> {
  const inv = await lookupInvite(token);
  if (!inv) throw new UserError("This link is not valid.");
  if (inv.problem) throw new UserError(inv.problem);
  const name = input.name.trim();
  if (name.length < 2) throw new UserError("Enter your name.");
  if (input.password.length < 8) throw new UserError("Use at least 8 characters for the password.");
  if (await loginUser(inv.email)) throw new UserError("Someone already signs in with this email. Sign in instead.");
  const passwordHash = await bcrypt.hash(input.password, 10);
  return runAsOrg(inv.orgId, () =>
    db.transaction(async (tx) => {
      // taken once: two clicks at the same moment cannot both join
      const used = await tx
        .update(schema.invites)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.invites.id, inv.id), sql`${schema.invites.usedAt} IS NULL`))
        .returning({ id: schema.invites.id });
      if (!used.length) throw new UserError("This link was already used. Sign in instead.");
      await assertRoomForUser();
      const [u] = await tx.insert(schema.users).values({ name: name.slice(0, 120), email: inv.email, passwordHash, role: inv.role }).returning({ id: schema.users.id });
      await audit(tx, { userId: u.id, action: "user.join", entity: "user", entityId: u.id, summary: `${inv.email} joined as ${inv.role} by invitation` });
      return { id: u.id, orgId: inv.orgId, name, email: inv.email, role: inv.role };
    }),
  );
}
