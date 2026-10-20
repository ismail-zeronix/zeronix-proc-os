import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { db, schema } from "@/db";
import { getBrand, getLogo } from "@/lib/brand";
import { signatureHtml, signatureText } from "@/lib/signature";
import type { MailCreds } from "./account";
import { textToHtml, type Recipient } from "./compose";
import { mailServer } from "./config";

export interface Outgoing {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  /** What the person typed. */
  body: string;
  /** Quoted original for replies and forwards; goes below the signature. */
  quote: string;
  inReplyTo?: string;
  references?: string[];
  files: { filename: string; content: Buffer; contentType: string }[];
}

const LOGO_CID = "zeronix-logo";
const fmt = (r: Recipient) => ({ name: r.name, address: r.email });

/** How many recipients this person has emailed in the last 24 hours. */
export async function recipientsToday(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.mailSentLog.recipients}), 0)::int` })
    .from(schema.mailSentLog)
    .where(and(eq(schema.mailSentLog.userId, userId), gte(schema.mailSentLog.sentAt, since)));
  return row?.n ?? 0;
}

function friendlySmtp(e: unknown): Error {
  const err = e as { responseCode?: number; code?: string; message?: string };
  if (err.responseCode === 535 || err.code === "EAUTH") return new Error("The mail server refused the login. Check the mailbox password under My account.");
  if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return new Error("Could not reach the mail server. Nothing was sent. Try again in a moment.");
  }
  if (err.responseCode && err.responseCode >= 500) return new Error(`The mail server rejected the email: ${err.message ?? "unknown reason"}`);
  return new Error(err.message ? `Could not send: ${err.message}` : "Could not send the email.");
}

/** Saves a copy in the mailbox's Sent folder so it also shows in webmail. Returns false if no Sent folder could be used. */
async function saveToSent(creds: MailCreds, raw: Buffer): Promise<boolean> {
  const { host, port } = mailServer();
  const client = new ImapFlow({ host, port, secure: true, auth: { user: creds.login, pass: creds.pass }, logger: false, connectionTimeout: 15_000, socketTimeout: 30_000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const boxes = await client.list();
    const sent =
      boxes.find((b) => b.specialUse === "\\Sent")?.path ?? boxes.find((b) => /^(inbox[./])?sent( items| messages| mail)?$/i.test(b.path))?.path;
    if (!sent) return false;
    await client.append(sent, raw, ["\\Seen"], new Date());
    return true;
  } catch {
    return false;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Builds the email (typed text, then the person's signature with the logo attached inline, then the quoted
 * original), sends it through the mailbox's own SMTP login, saves a copy to Sent and records it in the send log.
 */
export async function sendMail(creds: MailCreds, mail: Outgoing): Promise<{ messageId: string; savedToSent: boolean }> {
  const [brand, [profile], logo] = await Promise.all([
    getBrand(),
    db
      .select({ jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile })
      .from(schema.users)
      .where(eq(schema.users.id, creds.userId)),
    getLogo(),
  ]);
  const person = { name: creds.name, email: creds.login, jobTitle: profile?.jobTitle ?? "", phone: profile?.phone ?? "", mobile: profile?.mobile ?? "" };

  const sigHtml = signatureHtml(brand, person, logo ? `cid:${LOGO_CID}` : "");
  const font = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222";
  const html =
    `<div style="${font}">${textToHtml(mail.body)}</div>` +
    sigHtml +
    (mail.quote.trim() ? `<div style="${font};margin-top:16px">${textToHtml(mail.quote.trim())}</div>` : "");
  const text = [mail.body.trimEnd(), "", signatureText(brand, person), mail.quote.trim() ? `\n${mail.quote.trim()}` : ""].join("\n");

  const domain = creds.login.split("@")[1] ?? "zeronix.local";
  const messageId = `<${randomUUID()}@${domain}>`;
  const ext = logo?.mime === "image/jpeg" ? "jpg" : logo?.mime === "image/webp" ? "webp" : "png";
  const options = {
    from: { name: creds.name, address: creds.login },
    to: mail.to.map(fmt),
    cc: mail.cc.map(fmt),
    bcc: mail.bcc.map(fmt),
    subject: mail.subject,
    text,
    html,
    messageId,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    attachments: [
      ...(logo ? [{ filename: `logo.${ext}`, content: logo.data, contentType: logo.mime, cid: LOGO_CID, contentDisposition: "inline" as const }] : []),
      ...mail.files.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType })),
    ],
  };

  const raw = await new MailComposer(options).compile().build(); // as sent: no Bcc header
  const node = new MailComposer(options).compile();
  node.keepBcc = true;
  const sentCopy = await node.build(); // for the Sent folder: keeps who was on Bcc

  const { smtpHost, smtpPort } = mailServer();
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: creds.login, pass: creds.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  try {
    await transport.sendMail({
      envelope: { from: creds.login, to: [...mail.to, ...mail.cc, ...mail.bcc].map((r) => r.email) },
      raw,
    });
  } catch (e) {
    throw friendlySmtp(e);
  } finally {
    transport.close();
  }

  await db.insert(schema.mailSentLog).values({
    userId: creds.userId,
    toAddresses: [...mail.to, ...mail.cc, ...mail.bcc].map((r) => r.email).join(", ").slice(0, 2000),
    subject: mail.subject.slice(0, 500),
    messageId,
    recipients: mail.to.length + mail.cc.length + mail.bcc.length,
  });
  const savedToSent = await saveToSent(creds, sentCopy);
  return { messageId, savedToSent };
}
