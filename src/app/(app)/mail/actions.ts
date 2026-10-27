"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { mailCreds } from "@/lib/mail/account";
import { markSeenOnServer } from "@/lib/mail/imap";

/** Marks an email as read on the mail server and in the home screen's saved list. */
export async function markRead(uid: number) {
  const c = await mailCreds();
  if (!Number.isInteger(uid) || uid < 1) throw new Error("Bad message number");
  await markSeenOnServer(c.login, c.pass, uid);
  await db
    .update(schema.mailMessages)
    .set({ seen: true })
    .where(and(eq(schema.mailMessages.userId, c.userId), eq(schema.mailMessages.uid, uid)));
  revalidatePath("/");
}
