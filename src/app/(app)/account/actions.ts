"use server";

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
