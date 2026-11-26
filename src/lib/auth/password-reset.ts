import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, runAsOrg, schema } from "@/db";
import { audit } from "@/lib/audit";
import { clearFailures } from "@/lib/auth/lockout";
import { loginUser } from "@/lib/auth/login-user";
import { revokeSessions } from "@/lib/auth/session-cookie";
import { publicBaseUrl } from "@/lib/invites";
import { sendPlatformMail } from "@/lib/platform-mail";
import { UserError } from "@/lib/user-error";

/**
 * "Forgot password?": a one-time link to choose a new password, emailed from the platform mailbox. Only the token's hash
 * is kept (password_resets). Asking never says whether an email has an account. A new password signs the person out
 * everywhere and closes their other open links.
 */
export const RESET_MINUTES = 60;
/** Links one person can be sent in an hour (each is an email). */
export const RESETS_PER_HOUR = 3;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Emails a reset link when the email belongs to an active person of an active company; does nothing otherwise, and
 * answers the same either way. The caller limits how often one network may ask.
 */
export async function requestPasswordReset(emailRaw: string, ip: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const user = await loginUser(email);
  if (!user || !user.isActive || !user.orgActive) return;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60_000);
  const made = await runAsOrg(user.organizationId, async () => {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.passwordResets)
      .where(and(eq(schema.passwordResets.userId, user.id), sql`${schema.passwordResets.createdAt} > now() - interval '1 hour'`));
    if (n >= RESETS_PER_HOUR) return false;
    await db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: hashToken(token), expiresAt, ip: ip.slice(0, 64) });
    await audit(db, { userId: user.id, action: "auth.reset_request", entity: "user", entityId: user.id, summary: `Password reset link sent to ${email}` });
    return true;
  });
  if (!made) return;
  const first = user.name.trim().split(/\s+/)[0];
  await sendPlatformMail({
    to: email,
    subject: "Reset your ZeronixOS password",
    lines: [
      first ? `Hello ${first},` : "Hello,",
      "Someone (hopefully you) asked to reset the password for this email on ZeronixOS.",
      "Open the link to choose a new password. Your current password keeps working until you do.",
    ],
    button: { label: "Choose a new password", url: `${await publicBaseUrl()}/reset-password/${token}` },
    note: `The link works once, for ${RESET_MINUTES} minutes. If you did not ask for it, ignore this email: nothing changes.`,
  });
}

export interface ResetInfo {
  id: number;
  orgId: number;
  userId: number;
  email: string;
  /** null when the link can be used; otherwise why not, in plain words. */
  problem: string | null;
}

/** What a reset link is for, through app_reset_lookup() (the person is not signed in). */
export async function lookupReset(token: string): Promise<ResetInfo | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const r = await db.execute<{ id: number; organization_id: number; user_id: number; email: string; user_active: boolean; org_active: boolean; expires_at: Date; used_at: Date | null }>(
    sql`SELECT * FROM app_reset_lookup(${hashToken(token)})`,
  );
  const x = r.rows[0];
  if (!x) return null;
  const problem = x.used_at
    ? "This link was already used. Ask for a new one if you need it."
    : new Date(x.expires_at).getTime() < Date.now()
      ? "This link has expired. Ask for a new one."
      : !x.user_active
        ? "This account is switched off. Ask your company's admin."
        : !x.org_active
          ? "Your company's account is paused. Please contact Zeronix support."
          : null;
  return { id: x.id, orgId: x.organization_id, userId: x.user_id, email: x.email, problem };
}

/** Sets the new password from a valid link: once only, then every session of that person ends. */
export async function resetPassword(token: string, password: string): Promise<{ email: string }> {
  const info = await lookupReset(token);
  if (!info) throw new UserError("This link is not valid. Ask for a new one.");
  if (info.problem) throw new UserError(info.problem);
  if (password.length < 8) throw new UserError("Use at least 8 characters for the password.");
  const passwordHash = await bcrypt.hash(password, 10);
  await runAsOrg(info.orgId, () =>
    db.transaction(async (tx) => {
      // taken once: two clicks at the same moment cannot both set a password
      const used = await tx
        .update(schema.passwordResets)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.passwordResets.id, info.id), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
        .returning({ id: schema.passwordResets.id });
      if (!used.length) throw new UserError("This link was already used. Ask for a new one if you need it.");
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, info.userId));
      // a stolen cookie stops working too, and the person's other links close
      await revokeSessions(info.userId, tx);
      await tx.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.userId, info.userId), isNull(schema.passwordResets.usedAt)));
      await audit(tx, { userId: info.userId, action: "auth.reset_done", entity: "user", entityId: info.userId, summary: `${info.email} set a new password from a reset link` });
    }),
  );
  await clearFailures(info.email);
  return { email: info.email };
}
