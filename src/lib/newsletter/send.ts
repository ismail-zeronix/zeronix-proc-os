import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { deliver, friendly, mailboxPassword, mailboxReady, withMailbox } from "@/lib/prospecting/sender";
import { Problem } from "@/lib/prospecting/result";
import { capOn, DAYS } from "@/lib/prospecting/sending";
import { getSetting } from "@/lib/settings";
import { newsBrand, NEWS_LOGO_CID } from "./brand";
import { blockedMap, suppress } from "./data";
import { firstName } from "./import";
import { newsProducts } from "@/lib/website/newsletter-products";
import { docProductIds } from "./blocks";
import { contentOf } from "./content";
import { renderEmail } from "./render";
import { unsubscribePageUrl, unsubscribePostUrl } from "./token";

type Mailbox = typeof schema.outreachMailboxes.$inferSelect;
type Campaign = typeof schema.newsletterCampaigns.$inferSelect;
type Send = typeof schema.newsletterSends.$inferSelect;

/** A failed send is tried once more after this; a second failure is final. */
const RETRY_MS = 30 * 60_000;

// ---------- one email ----------

interface Context {
  at: number;
  brand: Awaited<ReturnType<typeof newsBrand>>;
  products: Awaited<ReturnType<typeof newsProducts>>;
  reason: string;
}
const contexts = new Map<number, Context>();

/** What every email of a campaign shares, kept for a minute so a long send does not ask the databases for it each time. */
async function contextOf(c: Campaign): Promise<Context> {
  const hit = contexts.get(c.id);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const content = contentOf(c);
  const [brand, products, list] = await Promise.all([
    newsBrand(),
    newsProducts(content?.doc ? docProductIds(content.doc) : []),
    c.listId ? db.select({ note: schema.newsletterLists.consentNote }).from(schema.newsletterLists).where(eq(schema.newsletterLists.id, c.listId)) : Promise.resolve([]),
  ]);
  const ctx = { at: Date.now(), brand, products, reason: list[0]?.note ?? "" };
  contexts.set(c.id, ctx);
  return ctx;
}

/** The finished email for one reader, as the raw message to hand to SMTP. */
async function compose(m: Mailbox, c: Pick<Campaign, "id" | "templateKey" | "subject" | "preheader" | "fields" | "listId">, to: { email: string; name: string }, sendId: number, ctx: Context, subjectPrefix = "") {
  const content = contentOf(c);
  if (!content) throw new Problem("This newsletter has no content.");
  const subject = `${subjectPrefix}${c.subject}`.slice(0, 200);
  const { html, text } = renderEmail({
    ...content,
    subject,
    preheader: c.preheader,
    products: ctx.products,
    brand: ctx.brand.brand,
    logoSrc: ctx.brand.logo ? `cid:${NEWS_LOGO_CID}` : "",
    firstName: firstName(to.name),
    unsubUrl: unsubscribePageUrl(sendId),
    reason: ctx.reason,
  });
  const messageId = `<${randomUUID()}@${m.email.split("@")[1] ?? "mail.local"}>`;
  const logo = ctx.brand.logo;
  const raw = await new MailComposer({
    from: { name: m.fromName || m.email, address: m.email },
    to: to.name ? { name: to.name, address: to.email } : to.email,
    replyTo: m.email,
    subject,
    text,
    html,
    messageId,
    headers: {
      "List-Unsubscribe": `<${unsubscribePostUrl(sendId)}>, <mailto:${m.email}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      Precedence: "bulk",
    },
    attachments: logo
      ? [{ filename: `logo.${logo.mime === "image/jpeg" ? "jpg" : logo.mime === "image/webp" ? "webp" : "png"}`, content: logo.data, contentType: logo.mime, cid: NEWS_LOGO_CID, contentDisposition: "inline" as const }]
      : [],
  })
    .compile()
    .build();
  return { raw, messageId, subject };
}

/** Sends one queued email from this mailbox and records what happened. */
async function sendOne(m: Mailbox, s: Send): Promise<void> {
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, s.campaignId));
  if (!c) return void (await db.update(schema.newsletterSends).set({ status: "failed", error: "The campaign was deleted" }).where(eq(schema.newsletterSends.id, s.id)));

  // the do-not-contact list is checked again right before sending
  const blocked = (await blockedMap([s.email])).get(s.email);
  if (blocked) {
    await db.update(schema.newsletterSends).set({ status: "skipped", skipReason: "On the do-not-contact list", nextSendAt: null }).where(eq(schema.newsletterSends.id, s.id));
    await db.update(schema.newsletterContacts).set({ status: blocked }).where(eq(schema.newsletterContacts.email, s.email));
    return;
  }

  const pass = await mailboxPassword(m);
  if (pass === null) return void (await requeue(s, "The mailbox password can no longer be read", false));

  let built: Awaited<ReturnType<typeof compose>>;
  try {
    built = await compose(m, c, { email: s.email, name: s.name }, s.id, await contextOf(c));
  } catch (err) {
    return void (await db.update(schema.newsletterSends).set({ status: "failed", error: ((err as Error).message || "Could not build the email").slice(0, 300), nextSendAt: null }).where(eq(schema.newsletterSends.id, s.id)));
  }

  try {
    await deliver(m, pass, built.raw, [s.email]);
  } catch (err) {
    const f = friendly(err);
    if (f.recipient) {
      await suppress(s.email, "bounce", f.message);
      await db.update(schema.newsletterContacts).set({ status: "bounced" }).where(eq(schema.newsletterContacts.email, s.email));
      return void (await db.update(schema.newsletterSends).set({ status: "failed", error: `The address was rejected: ${f.message}`.slice(0, 300), nextSendAt: null }).where(eq(schema.newsletterSends.id, s.id)));
    }
    if (f.login) await db.update(schema.outreachMailboxes).set({ lastTestOk: false, lastError: `Sending stopped: ${f.message}` }).where(eq(schema.outreachMailboxes.id, m.id));
    return void (await requeue(s, f.message, !!s.error));
  }

  await db.update(schema.newsletterSends).set({ status: "sent", mailboxId: m.id, messageId: built.messageId, sentAt: new Date(), error: "", nextSendAt: null }).where(eq(schema.newsletterSends.id, s.id));
  await db.update(schema.outreachMailboxes).set({ lastSentAt: new Date() }).where(eq(schema.outreachMailboxes.id, m.id));
}

/** First failure: try again later (from any mailbox). Second failure: give up and show the error. */
async function requeue(s: Send, error: string, final: boolean) {
  await db
    .update(schema.newsletterSends)
    .set(final ? { status: "failed", error: error.slice(0, 300), nextSendAt: null } : { error: error.slice(0, 300), mailboxId: null, nextSendAt: new Date(Date.now() + RETRY_MS) })
    .where(eq(schema.newsletterSends.id, s.id));
}

/** Claims the next queued email this mailbox may send, so two passes never send it twice. */
async function claimNext(m: Mailbox): Promise<Send | null> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute<{ id: number }>(sql`
      SELECT s.id FROM newsletter_sends s
      JOIN newsletter_campaigns c ON c.id = s.campaign_id
      WHERE s.status = 'queued' AND s.next_send_at <= now() AND c.status = 'sending'
        AND (c.start_at IS NULL OR c.start_at <= now())
        AND (cardinality(c.mailbox_ids) = 0 OR ${m.id} = ANY(c.mailbox_ids))
      ORDER BY s.id
      LIMIT 1 FOR UPDATE OF s SKIP LOCKED`);
    const id = picked.rows[0]?.id;
    if (!id) return null;
    const [s] = await tx
      .update(schema.newsletterSends)
      .set({ nextSendAt: new Date(Date.now() + 10 * 60_000), mailboxId: m.id })
      .where(eq(schema.newsletterSends.id, Number(id)))
      .returning();
    return s ?? null;
  });
}

/**
 * One sending pass (called by the worker every few seconds): each mailbox that is switched on, tested, inside its days
 * and hours, under today's limit and past its gap sends at most one newsletter. Then finished campaigns are closed.
 */
export async function sendNewsletters(): Promise<number> {
  const mailboxes = await db.select().from(schema.outreachMailboxes).where(and(eq(schema.outreachMailboxes.enabled, true), eq(schema.outreachMailboxes.lastTestOk, true)));
  let sent = 0;
  for (const m of mailboxes) {
    await withMailbox(m, async () => {
      const [fresh] = await db.select().from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.id, m.id));
      if (!fresh?.enabled || !fresh.lastTestOk || !(await mailboxReady(fresh))) return;
      const s = await claimNext(fresh);
      if (!s) return;
      try {
        await sendOne(fresh, s);
        sent++;
      } catch (err) {
        console.error("[newsletter] send failed", s.id, err);
        await requeue(s, (err as Error).message || "Could not send", !!s.error);
      }
    });
  }
  await db.execute(sql`
    UPDATE newsletter_campaigns c SET status = 'done'
    WHERE c.status = 'sending' AND NOT EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.campaign_id = c.id AND s.status = 'queued')`);
  return sent;
}

// ---------- starting, pausing, estimating ----------

/** Mailboxes that can send right now (on, and the connection test passed). */
export async function readyMailboxes(ids: number[] = []) {
  const rows = await db.select().from(schema.outreachMailboxes).where(and(eq(schema.outreachMailboxes.enabled, true), eq(schema.outreachMailboxes.lastTestOk, true)));
  return ids.length ? rows.filter((m) => ids.includes(m.id)) : rows;
}

/** Roughly how many days the list takes with the mailboxes that will send (their daily limits on their sending days). */
export function daysToSend(recipients: number, mailboxes: Pick<Mailbox, "startCap" | "dailyCap" | "rampPerWeek" | "warmupStartedOn" | "sendDays">[]): number | null {
  if (!recipients) return 0;
  const today = dubaiToday();
  let left = recipients;
  for (let d = 0; d < 400; d++) {
    const day = new Date(Date.parse(today) + d * 86400_000);
    const key = DAYS[(day.getUTCDay() + 6) % 7].key;
    const dayStr = day.toISOString().slice(0, 10);
    for (const m of mailboxes) if (m.sendDays.includes(key)) left -= capOn(m, dayStr);
    if (left <= 0) return d + 1;
  }
  return null;
}

export async function cooloffDays(): Promise<number> {
  return Math.max(0, Math.min(365, Number.parseInt(await getSetting("newsletter_cooloff_days"), 10) || 0));
}

/** Builds the sending queue for a draft campaign and starts it. People who unsubscribed or were mailed lately are skipped, with the reason. */
export async function startCampaign(id: number): Promise<{ queued: number; skipped: number }> {
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
  if (!c) throw new Problem("Newsletter not found.");
  if (c.status !== "draft") throw new Problem("This newsletter has already been started.");
  if (!c.listId) throw new Problem("Pick the list to send it to.");
  if (!c.subject.trim()) throw new Problem("Write the subject line first.");
  const content = contentOf(c);
  if (!content || (content.html !== undefined && content.html.trim().length < 20) || (content.doc && !content.doc.blocks.length)) throw new Problem("This newsletter has no content yet.");
  if (!(await readyMailboxes(c.mailboxIds)).length) throw new Problem("No sending mailbox is ready. Connect and switch one on in Prospecting › Settings.");

  const contacts = await db.select().from(schema.newsletterContacts).where(and(eq(schema.newsletterContacts.listId, c.listId), eq(schema.newsletterContacts.status, "active")));
  if (!contacts.length) throw new Problem("That list has nobody who can receive newsletters yet.");

  const emails = contacts.map((x) => x.email);
  const blocked = await blockedMap(emails);
  const days = await cooloffDays();
  const recent = new Set<string>();
  if (days > 0) {
    for (let i = 0; i < emails.length; i += 1000) {
      const rows = await db
        .selectDistinct({ email: schema.newsletterSends.email })
        .from(schema.newsletterSends)
        .where(and(inArray(schema.newsletterSends.email, emails.slice(i, i + 1000)), eq(schema.newsletterSends.status, "sent"), sql`${schema.newsletterSends.sentAt} > now() - make_interval(days => ${days})`));
      for (const r of rows) recent.add(r.email);
    }
  }

  let queued = 0;
  let skipped = 0;
  const rows = contacts.map((x) => {
    const why = blocked.has(x.email) ? "On the do-not-contact list" : recent.has(x.email) ? `Mailed within the last ${days} days` : "";
    if (why) skipped++;
    else queued++;
    return { campaignId: id, contactId: x.id, email: x.email, name: x.name, status: why ? ("skipped" as const) : ("queued" as const), skipReason: why, nextSendAt: why ? null : new Date() };
  });
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.newsletterSends).values(rows.slice(i, i + 500)).onConflictDoNothing();
    for (const [email, status] of blocked) await tx.update(schema.newsletterContacts).set({ status }).where(eq(schema.newsletterContacts.email, email));
    await tx.update(schema.newsletterCampaigns).set({ status: queued ? "sending" : "done" }).where(eq(schema.newsletterCampaigns.id, id));
  });
  return { queued, skipped };
}

export async function setCampaignPaused(id: number, paused: boolean): Promise<void> {
  await db
    .update(schema.newsletterCampaigns)
    .set({ status: paused ? "paused" : "sending" })
    .where(and(eq(schema.newsletterCampaigns.id, id), inArray(schema.newsletterCampaigns.status, paused ? ["sending"] : ["paused"])));
}

// ---------- test email ----------

/** Sends a saved newsletter as it is now to one address, marked [TEST]. Uses a ready mailbox of the campaign; not counted against the list. */
export async function sendTest(campaignId: number, to: string): Promise<string> {
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, campaignId));
  if (!c) throw new Problem("Newsletter not found.");
  const [m] = await readyMailboxes(c.mailboxIds);
  if (!m) throw new Problem("No sending mailbox is ready. Connect and switch one on in Prospecting › Settings.");
  const pass = await mailboxPassword(m);
  if (pass === null) throw new Problem("The mailbox password can no longer be read. Enter it again in Prospecting › Settings.");
  contexts.delete(c.id);
  const built = await compose(m, c, { email: to, name: "" }, 0, await contextOf(c), "[TEST] ");
  try {
    const ran = await withMailbox(m, () => deliver(m, pass, built.raw, [to]));
    if (!ran) throw new Problem("That mailbox is sending right now. Try again in a moment.");
  } catch (err) {
    if (err instanceof Problem) throw err;
    throw new Problem(`Could not send: ${friendly(err).message}`);
  }
  return m.email;
}
