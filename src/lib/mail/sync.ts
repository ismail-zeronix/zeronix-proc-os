import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { fetchLatest, MailAuthError } from "./imap";

const KEEP = 20;

/** Reads one user's inbox and mirrors the newest messages into mail_messages. Never throws: the result is saved on the account. */
export async function syncMailbox(userId: number): Promise<{ status: "ok" | "error"; message: string }> {
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, userId));
  if (!acc) return { status: "error", message: "No mailbox connected." };
  try {
    let pass: string;
    try {
      pass = decryptSecret(acc.passwordEnc);
    } catch {
      throw new MailAuthError("The saved password can no longer be read. Enter it again.");
    }
    const { uidValidity, messages } = await fetchLatest(acc.imapUser, pass, KEEP);

    await db.transaction(async (tx) => {
      if (acc.uidValidity && acc.uidValidity !== uidValidity) {
        await tx.delete(schema.mailMessages).where(eq(schema.mailMessages.userId, userId));
      }
      if (messages.length) {
        await tx
          .insert(schema.mailMessages)
          .values(messages.map((m) => ({ userId, ...m })))
          .onConflictDoUpdate({
            target: [schema.mailMessages.userId, schema.mailMessages.uid],
            set: {
              seen: sql`excluded.seen`,
              subject: sql`excluded.subject`,
              fromName: sql`excluded.from_name`,
              fromEmail: sql`excluded.from_email`,
            },
          });
        await tx
          .delete(schema.mailMessages)
          .where(
            and(
              eq(schema.mailMessages.userId, userId),
              notInArray(
                schema.mailMessages.uid,
                messages.map((m) => m.uid),
              ),
            ),
          );
      } else {
        await tx.delete(schema.mailMessages).where(eq(schema.mailMessages.userId, userId));
      }
      await tx
        .update(schema.mailAccounts)
        .set({ lastCheckedAt: new Date(), lastStatus: "ok", lastError: "", uidValidity })
        .where(eq(schema.mailAccounts.userId, userId));
    });
    return { status: "ok", message: `${messages.length} messages` };
  } catch (e) {
    const message = (e as Error).message;
    await db
      .update(schema.mailAccounts)
      .set({
        lastCheckedAt: new Date(),
        lastStatus: "error",
        lastError: message,
        // stop after a wrong password: repeated bad logins can lock the mailbox
        ...(e instanceof MailAuthError ? { enabled: false } : {}),
      })
      .where(eq(schema.mailAccounts.userId, userId));
    return { status: "error", message };
  }
}

/**
 * Checks every enabled mailbox that is due: every 5 minutes, or every 30 after an error. A mailbox is claimed
 * in the same statement that finds it, so the web server and a separate worker never read it twice.
 */
export async function runDueMailboxes() {
  const due = await db.execute<{ user_id: number }>(sql`
    UPDATE mail_accounts SET last_checked_at = now()
    WHERE enabled
      AND (last_checked_at IS NULL
           OR last_checked_at <= now() - make_interval(mins => CASE WHEN last_status = 'error' THEN 30 ELSE 5 END))
    RETURNING user_id`);
  for (const row of due.rows) {
    const res = await syncMailbox(row.user_id);
    console.log(`[mail] user ${row.user_id}: ${res.status} - ${res.message}`);
  }
}
