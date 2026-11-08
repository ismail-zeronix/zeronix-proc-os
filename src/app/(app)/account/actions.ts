"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { revokeSessions, setSessionCookie } from "@/lib/auth/session-cookie";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { fetchLatest } from "@/lib/mail/imap";
import { syncMailbox } from "@/lib/mail/sync";
import { parseInput, UserError } from "@/lib/user-error";

async function me() {
  const access = await loadAccess();
  if (!access) throw new UserError("Please sign in again.");
  // a platform admin on a support visit never changes the person's own password, mailbox or profile
  if (access.support) throw new UserError("Not available in a support visit: only the person themselves can change their account.");
  return access.user;
}

const connectSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the full email address"),
  password: z.string().min(1, "Enter the mailbox password").max(200),
});

const profileSchema = z.object({
  jobTitle: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).default(""),
  mobile: z.string().trim().max(40).default(""),
});

/** Job title and phone numbers printed in this user's email signature. */
export async function saveMyProfile(input: z.input<typeof profileSchema>) {
  const user = await me();
  const d = parseInput(profileSchema, input);
  await db.update(schema.users).set(d).where(eq(schema.users.id, user.id));
  revalidatePath("/account");
}

function refresh() {
  revalidatePath("/account");
  revalidatePath("/");
}

/**
 * What the account forms get back. Production builds hide the message of an error thrown by a server action (the
 * browser only sees React error #441), so problems the user can fix are returned, not thrown.
 */
type Result = { error?: string };

/** Tests the login first; the mailbox is saved only if it works. The password is stored encrypted and never shown again. */
export async function connectMailbox(input: z.input<typeof connectSchema>): Promise<Result> {
  const user = await me();
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await fetchLatest(d.email, d.password, 1); // throws a readable error for a wrong login or an unreachable server
  } catch (e) {
    return { error: (e as Error).message };
  }
  const passwordEnc = encryptSecret(d.password);
  await db
    .insert(schema.mailAccounts)
    .values({ userId: user.id, imapUser: d.email, passwordEnc, enabled: true })
    .onConflictDoUpdate({
      target: schema.mailAccounts.userId,
      set: { imapUser: d.email, passwordEnc, enabled: true, lastStatus: "never", lastError: "", uidValidity: "" },
    });
  await syncMailbox(user.id);
  refresh();
  return {};
}

/** Reads the inbox right now instead of waiting for the next scheduled check. */
export async function checkMailNow(): Promise<Result> {
  const user = await me();
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, user.id));
  if (!acc) return { error: "No mailbox connected." };
  if (!acc.enabled) return { error: "This mailbox is paused. Connect it again with the right password." };
  const res = await syncMailbox(user.id);
  refresh();
  return res.status === "error" ? { error: res.message } : {};
}

/** Removes the saved login and the saved message list. */
export async function disconnectMailbox() {
  const user = await me();
  await db.delete(schema.mailMessages).where(eq(schema.mailMessages.userId, user.id));
  await db.delete(schema.mailAccounts).where(eq(schema.mailAccounts.userId, user.id));
  refresh();
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "The new password needs at least 8 characters").max(200),
  })
  .refine((d) => d.current !== d.next, { message: "Pick a password different from the current one", path: ["next"] });

/** Changes your own password. The current one is checked first, so a session left open cannot be used to take over the account. */
export async function changeMyPassword(input: z.input<typeof passwordSchema>): Promise<Result> {
  const user = await me();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await bcrypt.compare(parsed.data.current, row.hash))) return { error: "Your current password is not right." };
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(parsed.data.next, 10) }).where(eq(schema.users.id, user.id));
  await audit(db, { userId: user.id, action: "auth.password_change", entity: "user", entityId: user.id, summary: `${user.email} changed their password` });
  // every other browser and phone signed in with the old password is signed out; this one stays signed in
  await setSessionCookie({ ...user, sv: await revokeSessions(user.id) });
  return {};
}

/** Signs you out on every other browser and phone (a lost phone, a shared computer). This browser stays signed in. */
export async function signOutEverywhere(): Promise<Result> {
  const user = await me();
  await audit(db, { userId: user.id, action: "auth.sign_out_everywhere", entity: "user", entityId: user.id, summary: `${user.email} signed out everywhere else` });
  await setSessionCookie({ ...user, sv: await revokeSessions(user.id) });
  return {};
}
