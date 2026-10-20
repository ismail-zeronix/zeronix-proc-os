import { type AddressObject, simpleParser } from "mailparser";
import { sanitizeEmailHtml } from "./sanitize";

export interface MailAddr {
  name: string;
  email: string;
}

export interface MessageView {
  uid: number;
  subject: string;
  from: MailAddr;
  to: MailAddr[];
  cc: MailAddr[];
  replyTo: MailAddr | null;
  date: string | null;
  /** Safe HTML (see sanitizeEmailHtml), or null when the email is plain text. */
  html: string | null;
  text: string;
  remoteImages: boolean;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
  messageId: string;
  references: string[];
  seen: boolean;
}

function addrs(a: AddressObject | AddressObject[] | undefined): MailAddr[] {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap((o) => o.value.filter((v) => v.address).map((v) => ({ name: v.name ?? "", email: v.address! })));
}

/** Reads a raw email into what the reading pane needs: people, date, safe HTML or text, and the download list. */
export async function parseMessage(uid: number, source: Buffer, seen: boolean, loadImages: boolean): Promise<MessageView> {
  const mail = await simpleParser(source);
  const safe = typeof mail.html === "string" && mail.html ? sanitizeEmailHtml(mail.html, mail.attachments, loadImages) : null;
  const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
  return {
    uid,
    subject: mail.subject ?? "",
    from: addrs(mail.from)[0] ?? { name: "", email: "" },
    to: addrs(mail.to),
    cc: addrs(mail.cc),
    replyTo: addrs(mail.replyTo)[0] ?? null,
    date: mail.date ? mail.date.toISOString() : null,
    html: safe?.html ?? null,
    text: mail.text ?? "",
    remoteImages: safe?.remoteImages ?? false,
    attachments: mail.attachments
      .map((a, index) => ({ a, index }))
      // pictures shown inside the email body are not listed as downloads
      .filter(({ a }) => !(a.related && a.cid))
      .map(({ a, index }) => ({
        index,
        filename: a.filename || `attachment-${index + 1}`,
        contentType: a.contentType,
        size: a.size,
      })),
    messageId: mail.messageId ?? "",
    references: refs,
    seen,
  };
}

/** One attachment's bytes by its position in the email. */
export async function pickAttachment(source: Buffer, index: number) {
  const mail = await simpleParser(source);
  const a = mail.attachments[index];
  if (!a) throw new Error("That attachment was not found.");
  return { filename: a.filename || `attachment-${index + 1}`, contentType: a.contentType || "application/octet-stream", content: a.content };
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" };

/** Plain text of a message body, for quoting in replies and forwards. */
export function bodyText(m: Pick<MessageView, "text" | "html">): string {
  if (m.text.trim()) return m.text.trim();
  if (!m.html) return "";
  return m.html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|lt|gt|quot|amp|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : "";
}

export const who = (a: MailAddr) => (a.name ? `${a.name} <${a.email}>` : a.email);

/** Reply quote: "On <date>, <name> wrote:" followed by the original with "> " on each line. */
export function quoteForReply(m: MessageView): string {
  const body = bodyText(m)
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");
  return `\n\nOn ${formatWhen(m.date)}, ${who(m.from)} wrote:\n${body}`;
}

/** Forward header block followed by the original text. */
export function quoteForForward(m: MessageView): string {
  return [
    "\n\n---------- Forwarded message ----------",
    `From: ${who(m.from)}`,
    `Date: ${formatWhen(m.date)}`,
    `Subject: ${m.subject}`,
    m.to.length ? `To: ${m.to.map(who).join(", ")}` : "",
    "",
    bodyText(m),
  ]
    .filter((l, i) => l !== "" || i === 5)
    .join("\n");
}
