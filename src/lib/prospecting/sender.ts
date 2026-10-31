import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { db, schema } from "@/db";
import { getBrand, getLogo } from "@/lib/brand";
import { decryptSecret } from "@/lib/crypto";
import { dubaiToday } from "@/lib/dates";
import { textToHtml } from "@/lib/mail/compose";
import { signatureHtml, signatureText } from "@/lib/signature";
import { isFreeMail } from "./constants";
import { guessIndustry } from "./industry";
import { mergeVars } from "./outreach";
import { addWorkingDays, render, unfilled } from "./outreach-rules";
import { capOn, type DayKey } from "./sending";
import { offerOf, writeEmail, writeInputFor } from "./writer";
import { FALLBACK_FIRST } from "./writer-rules";

type Mailbox = typeof schema.outreachMailboxes.$inferSelect;
type Enrollment = typeof schema.outreachEnrollments.$inferSelect;

const LOGO_CID = "zeronix-logo";
/** How often each mailbox's inbox is checked for replies and bounces. */
const REPLY_CHECK_MS = 5 * 60_000;
/** A failed send is tried again after this. */
const RETRY_MS = 30 * 60_000;

// ---------- time in Dubai ----------

function dubaiNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("weekday").toLowerCase().slice(0, 3) as DayKey, time: `${get("hour")}:${get("minute")}` };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Inside the mailbox's sending days and hours right now (Dubai time). */
export function inWindow(m: Pick<Mailbox, "sendDays" | "windowStart" | "windowEnd">, now = new Date()): boolean {
  const { day, time } = dubaiNow(now);
  return m.sendDays.includes(day) && time >= m.windowStart && time < m.windowEnd;
}

/** A moment on a Dubai day inside the sending hours, at a random minute so emails do not all go out on the hour. */
function sometimeOn(day: string, m: Pick<Mailbox, "windowStart" | "windowEnd">): Date {
  const from = minutes(m.windowStart);
  const to = Math.max(from + 30, minutes(m.windowEnd) - 30);
  const at = from + Math.floor(Math.random() * (to - from));
  const hh = String(Math.floor(at / 60)).padStart(2, "0");
  const mm = String(at % 60).padStart(2, "0");
  return new Date(`${day}T${hh}:${mm}:00+04:00`);
}

// ---------- AI writing queue ----------

/**
 * Writes the next first emails AI still has to write (status "writing"), a few per pass. A written email is scheduled
 * (or waits in Review when the campaign asks for that). When every provider is out for today the queue simply waits;
 * when AI cannot write one at all, the plain template is used and the email waits in Review.
 */
export async function writePending(limit = 2): Promise<number> {
  const rows = await db
    .select({ e: schema.outreachEnrollments, c: schema.outreachCampaigns })
    .from(schema.outreachEnrollments)
    .innerJoin(schema.outreachCampaigns, eq(schema.outreachCampaigns.id, schema.outreachEnrollments.campaignId))
    .where(and(eq(schema.outreachEnrollments.status, "writing"), inArray(schema.outreachCampaigns.status, ["active", "paused"])))
    .orderBy(asc(schema.outreachEnrollments.id))
    .limit(limit);
  let n = 0;
  for (const { e, c } of rows) {
    const input = await writeInputFor(e.companyId, e.personId, c.brief);
    if (!input) continue;
    const out = await writeEmail(input);
    if ("waiting" in out && out.waiting) {
      await db.update(schema.outreachEnrollments).set({ writeError: `Waiting for AI allowance: ${out.error}`.slice(0, 400) }).where(eq(schema.outreachEnrollments.id, e.id));
      return n; // nobody can write now; try again on a later pass
    }
    const start = c.startAt && c.startAt > new Date() ? c.startAt : new Date();
    if ("email" in out) {
      await db
        .update(schema.outreachEnrollments)
        .set({
          subject: out.email.subject,
          body: out.email.body,
          aiProviderId: out.providerId,
          writeError: "",
          ...(c.review ? { status: "draft" } : { status: "active", nextSendAt: start, approvedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.outreachEnrollments.id, e.id), eq(schema.outreachEnrollments.status, "writing")));
    } else {
      // AI could not write a usable email: fall back to the template and let a person check it
      const [person] = e.personId ? await db.select({ name: schema.prospectPeople.name }).from(schema.prospectPeople).where(eq(schema.prospectPeople.id, e.personId)) : [];
      const vars = await mergeVars(e.companyId, person?.name ?? "", c.mailboxIds, c.brief);
      const [step1] = await db.select().from(schema.outreachSequenceSteps).where(and(eq(schema.outreachSequenceSteps.sequenceId, c.sequenceId), eq(schema.outreachSequenceSteps.position, 1)));
      await db
        .update(schema.outreachEnrollments)
        .set({
          subject: render(step1?.subject || `${vars.company}: ${offerOf(c.brief)}`, vars).text.slice(0, 150),
          body: render(FALLBACK_FIRST, vars).text,
          status: "draft",
          writeError: `AI could not write it (${out.error}); the template was used instead. Check it in Review.`.slice(0, 400),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.outreachEnrollments.id, e.id), eq(schema.outreachEnrollments.status, "writing")));
    }
    n++;
  }
  return n;
}

// ---------- sending ----------

function friendly(e: unknown): { message: string; recipient: boolean; login: boolean } {
  const err = e as { responseCode?: number; code?: string; message?: string };
  const login = err.responseCode === 535 || err.code === "EAUTH";
  const recipient = !!err.responseCode && [550, 551, 553].includes(err.responseCode);
  return { message: (err.message ?? "Could not send").slice(0, 300), recipient, login };
}

/** Today's sent emails per mailbox (failed attempts do not count). */
async function sentToday(mailboxId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachMessages)
    .where(and(eq(schema.outreachMessages.mailboxId, mailboxId), eq(schema.outreachMessages.error, ""), sql`(${schema.outreachMessages.sentAt} AT TIME ZONE 'Asia/Dubai')::date = ${dubaiToday()}::date`));
  return n;
}

/** Claims the next email due from this mailbox, so two passes never send it twice. */
async function claimDue(m: Mailbox): Promise<Enrollment | null> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute<{ id: number }>(sql`
      SELECT e.id FROM outreach_enrollments e
      JOIN outreach_campaigns c ON c.id = e.campaign_id
      WHERE e.status = 'active' AND e.next_send_at <= now() AND c.status = 'active'
        AND (c.start_at IS NULL OR c.start_at <= now())
        AND (e.mailbox_id = ${m.id} OR (e.mailbox_id IS NULL AND (cardinality(c.mailbox_ids) = 0 OR ${m.id} = ANY(c.mailbox_ids))))
      ORDER BY e.next_send_at, e.id
      LIMIT 1 FOR UPDATE OF e SKIP LOCKED`);
    const id = picked.rows[0]?.id;
    if (!id) return null;
    const [e] = await tx
      .update(schema.outreachEnrollments)
      .set({ nextSendAt: new Date(Date.now() + 10 * 60_000), mailboxId: m.id })
      .where(eq(schema.outreachEnrollments.id, Number(id)))
      .returning();
    return e ?? null;
  });
}

async function stop(e: Enrollment, status: string, reason: string) {
  await db.update(schema.outreachEnrollments).set({ status, stopReason: reason.slice(0, 300), nextSendAt: null, updatedAt: new Date() }).where(eq(schema.outreachEnrollments.id, e.id));
}

async function saveToSent(m: Mailbox, pass: string, raw: Buffer) {
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.username || m.email, pass }, logger: false, connectionTimeout: 15_000, socketTimeout: 30_000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === "\\Sent")?.path ?? boxes.find((b) => /^(inbox[./])?sent( items| messages| mail)?$/i.test(b.path))?.path;
    if (sent) await client.append(sent, raw, ["\\Seen"], new Date());
  } catch {
    // a copy in Sent is a convenience; the email itself went out
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Sends the next step of one enrollment from one mailbox: the first email as written (by AI or a person), or the next
 * follow-up in the same thread. The admin email signature (Admin > Settings) goes under every email, with the logo.
 */
async function sendOne(m: Mailbox, e: Enrollment): Promise<void> {
  const [campaign] = await db.select().from(schema.outreachCampaigns).where(eq(schema.outreachCampaigns.id, e.campaignId));
  const steps = campaign ? await db.select().from(schema.outreachSequenceSteps).where(eq(schema.outreachSequenceSteps.sequenceId, campaign.sequenceId)).orderBy(asc(schema.outreachSequenceSteps.position)) : [];
  const step = e.currentStep + 1;
  if (!campaign || step > steps.length) return stop(e, "completed", "Every email in the sequence was sent");

  // the do-not-contact list is checked again right before sending
  const addresses = [e.toEmail, ...e.ccEmails];
  const keys = [...new Set([...addresses, ...addresses.map((a) => a.split("@")[1] ?? "")])];
  const blocked = new Set((await db.select({ v: schema.outreachSuppression.value }).from(schema.outreachSuppression).where(inArray(schema.outreachSuppression.value, keys))).map((b) => b.v));
  const isBlocked = (a: string) => blocked.has(a) || blocked.has(a.split("@")[1] ?? "");
  if (isBlocked(e.toEmail)) return stop(e, "stopped", "On the do-not-contact list");
  const cc = e.ccEmails.filter((a) => !isBlocked(a));

  let subject = e.subject;
  let body = e.body;
  if (step > 1) {
    const [person] = e.personId ? await db.select({ name: schema.prospectPeople.name }).from(schema.prospectPeople).where(eq(schema.prospectPeople.id, e.personId)) : [];
    const r = render(steps[step - 1].body, await mergeVars(e.companyId, person?.name ?? "", campaign.mailboxIds, campaign.brief));
    if (r.missing.length) return stop(e, "paused", `Follow-up ${step} needs {${r.missing.join("}, {")}}`);
    subject = /^re:/i.test(e.subject) ? e.subject : `Re: ${e.subject}`;
    body = r.text;
  }
  if (!subject.trim() || !body.trim() || unfilled(`${subject} ${body}`).length) return stop(e, "paused", "The email still has fields to fill in");

  const [brand, logo, [owner]] = await Promise.all([
    getBrand(),
    getLogo(),
    db.select({ jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile }).from(schema.users).where(eq(schema.users.id, campaign.ownerId ?? 0)),
  ]);
  const person = { name: m.fromName || m.email, email: m.email, jobTitle: owner?.jobTitle ?? "", phone: owner?.phone ?? "", mobile: owner?.mobile ?? "" };
  const optOut = "If you would rather not hear from us, just reply with \"unsubscribe\" and we will not email you again.";
  const font = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222";
  const html =
    `<div style="${font}">${textToHtml(body)}</div>` +
    signatureHtml(brand, person, logo ? `cid:${LOGO_CID}` : "") +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888888;margin-top:16px">${optOut}</div>`;
  const text = [body.trimEnd(), "", signatureText(brand, person), "", optOut].join("\n");

  const domain = m.email.split("@")[1] ?? "mail.local";
  const messageId = `<${randomUUID()}@${domain}>`;
  const ext = logo?.mime === "image/jpeg" ? "jpg" : logo?.mime === "image/webp" ? "webp" : "png";
  const raw = await new MailComposer({
    from: { name: m.fromName || m.email, address: m.email },
    to: e.toEmail,
    cc,
    subject,
    text,
    html,
    messageId,
    ...(step > 1 && e.threadMessageId ? { inReplyTo: e.threadMessageId, references: [e.threadMessageId] } : {}),
    headers: { "List-Unsubscribe": `<mailto:${m.email}?subject=unsubscribe>` },
    attachments: logo ? [{ filename: `logo.${ext}`, content: logo.data, contentType: logo.mime, cid: LOGO_CID, contentDisposition: "inline" as const }] : [],
  })
    .compile()
    .build();

  let pass = "";
  try {
    pass = decryptSecret(m.passwordEnc);
  } catch {
    await db.update(schema.outreachMailboxes).set({ lastTestOk: false, lastError: "The saved password can no longer be read. Enter it again." }).where(eq(schema.outreachMailboxes.id, m.id));
    await db.update(schema.outreachEnrollments).set({ nextSendAt: new Date(Date.now() + RETRY_MS), mailboxId: e.currentStep ? e.mailboxId : null }).where(eq(schema.outreachEnrollments.id, e.id));
    return;
  }
  const transport = nodemailer.createTransport({
    host: m.smtpHost,
    port: m.smtpPort,
    secure: m.smtpPort === 465,
    auth: { user: m.username || m.email, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  const log = { enrollmentId: e.id, mailboxId: m.id, step, toEmail: e.toEmail, ccEmails: cc, subject: subject.slice(0, 300), messageId };
  try {
    await transport.sendMail({ envelope: { from: m.email, to: [e.toEmail, ...cc] }, raw });
  } catch (err) {
    const f = friendly(err);
    await db.insert(schema.outreachMessages).values({ ...log, error: f.message });
    if (f.recipient) {
      await db.insert(schema.outreachSuppression).values({ value: e.toEmail, kind: "email", reason: "bounce", note: f.message.slice(0, 200) }).onConflictDoNothing();
      return stop(e, "bounced", `The address was rejected: ${f.message}`);
    }
    if (f.login) await db.update(schema.outreachMailboxes).set({ lastTestOk: false, lastError: `Sending stopped: ${f.message}` }).where(eq(schema.outreachMailboxes.id, m.id));
    // try again later, from any mailbox if the thread has not started
    await db.update(schema.outreachEnrollments).set({ nextSendAt: new Date(Date.now() + RETRY_MS), mailboxId: e.currentStep ? e.mailboxId : null }).where(eq(schema.outreachEnrollments.id, e.id));
    return;
  } finally {
    transport.close();
  }

  await db.insert(schema.outreachMessages).values(log);
  const next = steps[step];
  const nextAt = next ? sometimeOn(addWorkingDays(dubaiToday(), Math.max(1, next.delayDays)), m) : null;
  await db
    .update(schema.outreachEnrollments)
    .set({
      currentStep: step,
      ...(step === 1 ? { threadMessageId: messageId } : {}),
      ...(next ? { nextSendAt: nextAt } : { status: "completed", nextSendAt: null, stopReason: "Every email in the sequence was sent" }),
      updatedAt: new Date(),
    })
    .where(eq(schema.outreachEnrollments.id, e.id));
  await db.update(schema.outreachMailboxes).set({ lastSentAt: new Date() }).where(eq(schema.outreachMailboxes.id, m.id));
  if (step === 1) {
    await db
      .update(schema.prospectCompanies)
      .set({ status: "in_sequence", statusChangedAt: new Date() })
      .where(and(eq(schema.prospectCompanies.id, e.companyId), inArray(schema.prospectCompanies.status, ["sourced", "researching", "ready"])));
  }
  await db.insert(schema.prospectActivities).values({ companyId: e.companyId, userId: null, kind: "email", body: `Email ${step} sent to ${e.toEmail}${cc.length ? ` (cc ${cc.join(", ")})` : ""}: ${subject}` });
  void saveToSent(m, pass, raw);
}

/**
 * One sending pass: each mailbox that is switched on, tested, inside its days and hours and under today's limit sends at
 * most one email, and only when enough time has passed since its last one, so a day's emails are spread over the day.
 */
export async function sendDue(): Promise<number> {
  const mailboxes = await db.select().from(schema.outreachMailboxes).where(and(eq(schema.outreachMailboxes.enabled, true), eq(schema.outreachMailboxes.lastTestOk, true)));
  let sent = 0;
  for (const m of mailboxes) {
    if (!inWindow(m)) continue;
    const cap = capOn(m, dubaiToday());
    if ((await sentToday(m.id)) >= cap) continue;
    const gapMin = Math.max(3, ((minutes(m.windowEnd) - minutes(m.windowStart)) / Math.max(1, cap)) * 0.6);
    if (m.lastSentAt && Date.now() - m.lastSentAt.getTime() < gapMin * 60_000) continue;
    const e = await claimDue(m);
    if (!e) continue;
    try {
      await sendOne(m, e);
      sent++;
    } catch (err) {
      console.error("[outreach] send failed", e.id, err);
      await db.update(schema.outreachEnrollments).set({ nextSendAt: new Date(Date.now() + RETRY_MS) }).where(eq(schema.outreachEnrollments.id, e.id));
    }
  }
  return sent;
}

// ---------- replies and bounces ----------

const DAEMON = /mailer-daemon|postmaster|mail delivery/i;
const UNSUBSCRIBE = /\b(unsubscribe|remove me|stop emailing|do not (email|contact)|not interested)\b/i;

/**
 * Reads new messages in a mailbox's inbox: a reply from anyone at a company being emailed stops its sequence (marked
 * replied, or unsubscribed when they ask to be left alone); a bounce stops it and blocks the address.
 */
export async function checkReplies(m: Mailbox): Promise<number> {
  let pass = "";
  try {
    pass = decryptSecret(m.passwordEnc);
  } catch {
    return 0;
  }
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.username || m.email, pass }, logger: false, connectionTimeout: 15_000, socketTimeout: 60_000 });
  client.on("error", () => {});
  let found = 0;
  try {
    await client.connect();
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const top = Number(box.uidNext ?? 1) - 1;
    // the first check starts from now: older mail cannot be replies to emails this mailbox has not sent yet
    if (!m.lastSeenUid || m.lastSeenUid > top) {
      await db.update(schema.outreachMailboxes).set({ lastSeenUid: top, repliesCheckedAt: new Date() }).where(eq(schema.outreachMailboxes.id, m.id));
      return 0;
    }
    if (top <= m.lastSeenUid) {
      await db.update(schema.outreachMailboxes).set({ repliesCheckedAt: new Date() }).where(eq(schema.outreachMailboxes.id, m.id));
      return 0;
    }
    const open = await db
      .select({ id: schema.outreachEnrollments.id, companyId: schema.outreachEnrollments.companyId, to: schema.outreachEnrollments.toEmail, cc: schema.outreachEnrollments.ccEmails, domain: schema.prospectCompanies.domain })
      .from(schema.outreachEnrollments)
      .innerJoin(schema.prospectCompanies, eq(schema.prospectCompanies.id, schema.outreachEnrollments.companyId))
      .where(and(eq(schema.outreachEnrollments.mailboxId, m.id), inArray(schema.outreachEnrollments.status, ["active", "paused", "completed"])));
    for await (const msg of client.fetch(`${m.lastSeenUid + 1}:*`, { uid: true, envelope: true, source: { maxLength: 60_000 } }, { uid: true })) {
      const from = (msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
      const raw = msg.source?.toString("utf8") ?? "";
      if (DAEMON.test(from) || DAEMON.test(msg.envelope?.from?.[0]?.name ?? "")) {
        const hit = open.find((o) => raw.toLowerCase().includes(o.to));
        if (hit) {
          await db.insert(schema.outreachSuppression).values({ value: hit.to, kind: "email", reason: "bounce", note: "Bounced" }).onConflictDoNothing();
          await db.update(schema.outreachEnrollments).set({ status: "bounced", stopReason: "The email bounced", nextSendAt: null, updatedAt: new Date() }).where(eq(schema.outreachEnrollments.id, hit.id));
          found++;
        }
        continue;
      }
      const domain = from.split("@")[1] ?? "";
      const hit = open.find((o) => o.to === from || o.cc.includes(from) || (!!o.domain && !isFreeMail(domain) && domain === o.domain));
      if (!hit) continue;
      const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n").slice(0, 3000);
      const optOut = UNSUBSCRIBE.test(`${msg.envelope?.subject ?? ""} ${body.split(/\n>|On .+ wrote:/)[0]}`);
      await db
        .update(schema.outreachEnrollments)
        .set({ status: optOut ? "unsubscribed" : "replied", stopReason: optOut ? `${from} asked not to be emailed` : `${from} replied`, nextSendAt: null, updatedAt: new Date() })
        .where(eq(schema.outreachEnrollments.id, hit.id));
      if (optOut) {
        await db.insert(schema.outreachSuppression).values({ value: from, kind: "email", reason: "unsubscribe", note: "Replied asking to stop" }).onConflictDoNothing();
      }
      await db
        .update(schema.prospectCompanies)
        .set({ status: optOut ? "disqualified" : "replied", ...(optOut ? { disqualifyReason: "Unsubscribed" } : {}), statusChangedAt: new Date() })
        .where(eq(schema.prospectCompanies.id, hit.companyId));
      await db.insert(schema.prospectActivities).values({ companyId: hit.companyId, userId: null, kind: "email", body: `${optOut ? "Asked to unsubscribe" : "Replied"}: ${from} · ${msg.envelope?.subject ?? ""}`.slice(0, 500) });
      found++;
    }
    await db.update(schema.outreachMailboxes).set({ lastSeenUid: top, repliesCheckedAt: new Date() }).where(eq(schema.outreachMailboxes.id, m.id));
  } catch (err) {
    console.error(`[outreach] reply check ${m.email}`, (err as Error).message);
  } finally {
    await client.logout().catch(() => client.close());
  }
  return found;
}

/** Inboxes not checked for a while (called by the worker before sending, so a follow-up never goes after a reply). */
export async function checkAllReplies(): Promise<void> {
  const due = await db
    .select()
    .from(schema.outreachMailboxes)
    .where(
      and(
        eq(schema.outreachMailboxes.enabled, true),
        eq(schema.outreachMailboxes.lastTestOk, true),
        or(isNull(schema.outreachMailboxes.repliesCheckedAt), lte(schema.outreachMailboxes.repliesCheckedAt, new Date(Date.now() - REPLY_CHECK_MS))),
      ),
    );
  for (const m of due) await checkReplies(m);
}

/** Gives prospects imported before industries existed a first guess from their name (once, at start). */
export async function fillIndustries(): Promise<number> {
  const rows = await db
    .select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name, activity: schema.prospectCompanies.activity })
    .from(schema.prospectCompanies)
    .where(eq(schema.prospectCompanies.industry, ""));
  let n = 0;
  for (const r of rows) {
    const industry = guessIndustry(r.name, r.activity);
    if (!industry) continue;
    await db.update(schema.prospectCompanies).set({ industry }).where(eq(schema.prospectCompanies.id, r.id));
    n++;
  }
  return n;
}
