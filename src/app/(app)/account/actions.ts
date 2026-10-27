"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto";
import { fetchLatest } from "@/lib/mail/imap";
import { syncMailbox } from "@/lib/mail/sync";

async function me() {
  const access = await loadAccess();
  if (!access) throw new Error("Please sign in again.");
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
  const d = profileSchema.parse(input);
  await db.update(schema.users).set(d).where(eq(schema.users.id, user.id));
  revalidatePath("/account");
}

function refresh() {
  revalidatePath("/account");
  revalidatePath("/");
}

/** Tests the login first; the mailbox is saved only if it works. The password is stored encrypted and never shown again. */
export async function connectMailbox(input: z.input<typeof connectSchema>) {
  const user = await me();
  const d = connectSchema.parse(input);
  await fetchLatest(d.email, d.password, 1); // throws a readable error for a wrong login or an unreachable server
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
}

/** Reads the inbox right now instead of waiting for the next scheduled check. */
export async function checkMailNow() {
  const user = await me();
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, user.id));
  if (!acc) throw new Error("No mailbox connected.");
  if (!acc.enabled) throw new Error("This mailbox is paused. Connect it again with the right password.");
  const res = await syncMailbox(user.id);
  refresh();
  if (res.status === "error") throw new Error(res.message);
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
export async function changeMyPassword(input: z.input<typeof passwordSchema>) {
  const user = await me();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await bcrypt.compare(parsed.data.current, row.hash))) throw new Error("Your current password is not right.");
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(parsed.data.next, 10) }).where(eq(schema.users.id, user.id));
}
