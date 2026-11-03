import "server-only";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { mailServer } from "@/lib/mail/config";
import type { StoreSettings } from "./store-core";

/**
 * Shop emails (sign-in codes, order confirmations, new-order notices), sent through the mailbox of the portal user
 * chosen in Website › Settings › Store: the same Hostinger SMTP the Mail app uses, plain text, from "Zeronix Tech".
 */
export async function sendStoreMail(store: StoreSettings, mail: { to: string; subject: string; text: string }): Promise<void> {
  if (!store.mailUserId) throw new Error("No store mailbox is set (Website › Settings › Store)");
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, store.mailUserId));
  if (!acc || !acc.enabled) throw new Error("The store mailbox is not connected or is paused (Mail app)");
  const { smtpHost, smtpPort } = mailServer();
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: acc.imapUser, pass: decryptSecret(acc.passwordEnc) },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: { name: "Zeronix Tech", address: acc.imapUser }, to: mail.to, subject: mail.subject, text: mail.text });
  } finally {
    transport.close();
  }
}

/** Portal users with a connected mailbox, for the "send store emails from" choice. */
export async function storeMailboxes() {
  return db
    .select({ userId: schema.mailAccounts.userId, email: schema.mailAccounts.imapUser, name: schema.users.name })
    .from(schema.mailAccounts)
    .innerJoin(schema.users, eq(schema.users.id, schema.mailAccounts.userId))
    .where(eq(schema.mailAccounts.enabled, true));
}
