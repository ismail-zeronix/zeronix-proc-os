import { type NextRequest } from "next/server";
import { mailApi } from "@/lib/mail/api";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_FILES,
  MAX_RECIPIENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  parseRecipients,
} from "@/lib/mail/compose";
import { mailServer } from "@/lib/mail/config";
import { loadMessage } from "@/lib/mail/message";
import { recipientsToday, sendMail } from "@/lib/mail/send";

const bad = (error: string, status = 400) => Response.json({ error, code: "invalid" }, { status });
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Sends an email from the signed-in user's own mailbox. Multipart form: to, cc, bcc, subject, body, quote, files, mode, replyUid. */
export function POST(req: NextRequest) {
  return mailApi(async (c) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return bad("Send the email as a form.");
    }

    const to = parseRecipients(text(form, "to"));
    const cc = parseRecipients(text(form, "cc"));
    const bcc = parseRecipients(text(form, "bcc"));
    const wrong = [...to.bad, ...cc.bad, ...bcc.bad];
    if (wrong.length) return bad(`These addresses do not look right: ${wrong.join(", ")}`);
    if (!to.ok.length) return bad("Add at least one person in To.");
    const total = to.ok.length + cc.ok.length + bcc.ok.length;
    if (total > MAX_RECIPIENTS) return bad(`An email can go to at most ${MAX_RECIPIENTS} people at once.`);

    const subject = text(form, "subject").trim();
    const body = text(form, "body");
    if (subject.length > 300) return bad("The subject is too long (300 characters at most).");
    if (body.length > 100_000) return bad("The message is too long.");

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_FILES) return bad(`Attach at most ${MAX_FILES} files.`);
    if (files.some((f) => f.size > MAX_ATTACHMENT_BYTES)) return bad("One of the files is over 10 MB.");
    if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) return bad("The attachments add up to over 15 MB.");
    if (!body.trim() && !files.length) return bad("Write a message or attach a file.");

    const limit = mailServer().dailyLimit;
    const used = await recipientsToday(c.userId);
    if (used + total > limit) {
      return bad(`Daily limit reached: ${used} of ${limit} recipients used in the last 24 hours. This brake protects the company mail domain.`, 429);
    }

    // threading: take the original's Message-ID from the mail server, never from the browser
    let inReplyTo: string | undefined;
    let references: string[] | undefined;
    const mode = text(form, "mode");
    const replyUid = Number(text(form, "replyUid"));
    if ((mode === "reply" || mode === "replyall") && Number.isInteger(replyUid) && replyUid > 0) {
      try {
        const original = await loadMessage(c, replyUid, false);
        if (original.messageId) {
          inReplyTo = original.messageId;
          references = [...original.references, original.messageId];
        }
      } catch {
        // sending still works without threading headers
      }
    }

    const result = await sendMail(c, {
      to: to.ok,
      cc: cc.ok,
      bcc: bcc.ok,
      subject,
      body,
      quote: text(form, "quote"),
      inReplyTo,
      references,
      files: await Promise.all(
        files.map(async (f) => ({ filename: f.name || "attachment", content: Buffer.from(await f.arrayBuffer()), contentType: f.type || "application/octet-stream" })),
      ),
    });
    return Response.json({ ok: true, savedToSent: result.savedToSent });
  });
}
