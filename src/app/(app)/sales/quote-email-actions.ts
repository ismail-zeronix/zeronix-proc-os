"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { currentViewer } from "@/lib/auth/visibility";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { mailCreds } from "@/lib/mail/account";
import { MAX_RECIPIENTS, parseRecipients } from "@/lib/mail/compose";
import { mailServer } from "@/lib/mail/config";
import { recipientsToday, sendMail } from "@/lib/mail/send";
import { printPageToPdf } from "@/lib/pdf";
import { proposalPdf } from "@/lib/proposal-pdf";
import { snapshotOfQuote } from "@/lib/proposals-data";
import { quotePdfName } from "@/lib/quote-email";
import { getQuote } from "@/lib/quotes-data";
import { logEmailOnDeal } from "@/lib/sales-log";
import { setQuoteStatus } from "./quote-actions";

const input = z.object({
  to: z.string().max(4000),
  cc: z.string().max(4000).default(""),
  subject: z.string().trim().min(1, "Add a subject").max(300, "The subject is too long (300 characters at most)."),
  body: z.string().max(20_000, "The message is too long."),
  attachPdf: z.boolean().default(true),
});

export type EmailQuoteResult = { ok: true; savedToSent: boolean; markedSent: boolean } | { ok: false; error: string };

/**
 * Emails a quote from the salesperson's own mailbox without leaving the quote: their signature is added, the quote is
 * attached as a PDF made from the print page, a copy goes to Sent, the email is put on the deal's timeline, and a draft
 * quote is marked Sent. Returns the problem as text instead of throwing, so the person sees the real reason.
 */
export async function emailQuote(quoteId: number, raw: z.input<typeof input>): Promise<EmailQuoteResult> {
  try {
    const me = await assertApp("sales");
    const d = input.parse(raw);
    const to = parseRecipients(d.to);
    const cc = parseRecipients(d.cc);
    const wrong = [...to.bad, ...cc.bad];
    if (wrong.length) return { ok: false, error: `These addresses do not look right: ${wrong.join(", ")}` };
    if (!to.ok.length) return { ok: false, error: "Add the customer's email address in To." };
    const total = to.ok.length + cc.ok.length;
    if (total > MAX_RECIPIENTS) return { ok: false, error: `An email can go to at most ${MAX_RECIPIENTS} people at once.` };

    const creds = await mailCreds();
    const limit = mailServer().dailyLimit;
    const used = await recipientsToday(creds.userId);
    if (used + total > limit) return { ok: false, error: `Daily limit reached: ${used} of ${limit} recipients used in the last 24 hours.` };

    const q = await getQuote(quoteId, await currentViewer());
    if (!q) return { ok: false, error: "That quote no longer exists." };

    const files: { filename: string; content: Buffer; contentType: string }[] = [];
    if (d.attachPdf) {
      const session = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!session) return { ok: false, error: "Your session ended. Sign in again." };
      // a project quote prints as its proposal, with the references and page numbers in the footer
      const snap = await snapshotOfQuote(q.id);
      files.push({
        filename: quotePdfName(q.number, q.company.name, snap ? "Proposal" : "Quotation"),
        content: snap ? await proposalPdf(`/print/quote/${q.id}`, session, `Quotation No. ${q.number}`) : await printPageToPdf(`/print/quote/${q.id}`, session),
        contentType: "application/pdf",
      });
    }

    const sent = await sendMail(creds, { to: to.ok, cc: cc.ok, bcc: [], subject: d.subject.trim(), body: d.body, quote: "", files });
    if (q.dealId) await logEmailOnDeal(q.dealId, me.id, d.subject.trim(), [...to.ok, ...cc.ok].map((r) => r.email).join(", ")).catch(() => {});

    let markedSent = false;
    if (q.status === "draft") {
      // the customer has it now; if the quote cannot move (e.g. another quote is open) the email still went
      markedSent = await setQuoteStatus(q.id, "sent").then(
        () => true,
        () => false,
      );
    }
    revalidatePath(`/sales/quotes/${q.id}`);
    revalidatePath(`/crm/deals/${q.dealId}`);
    return { ok: true, savedToSent: sent.savedToSent, markedSent };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the email." };
    return { ok: false, error: (e as Error).message || "Could not send the email." };
  }
}
