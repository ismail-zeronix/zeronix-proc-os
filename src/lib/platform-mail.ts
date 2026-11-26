import "server-only";
import nodemailer from "nodemailer";

/**
 * The SaaS install's own mailbox (no-reply@zeronixos.online): invitations, "forgot password" links, trial requests and
 * payment reminders. Set on the server in .env.saas:
 *   PLATFORM_SMTP_HOST, PLATFORM_SMTP_PORT (465 = TLS from the start, else STARTTLS when offered),
 *   PLATFORM_SMTP_USER, PLATFORM_SMTP_PASS (both empty = no sign-in, e.g. a local test mail catcher),
 *   PLATFORM_MAIL_FROM ("ZeronixOS <no-reply@zeronixos.online>").
 * Without a host nothing is sent and the callers fall back: links are shown to copy, "Forgot password?" is hidden.
 */
function config() {
  const host = process.env.PLATFORM_SMTP_HOST?.trim();
  const from = process.env.PLATFORM_MAIL_FROM?.trim() || process.env.PLATFORM_SMTP_USER?.trim();
  if (!host || !from) return null;
  return {
    host,
    port: Number(process.env.PLATFORM_SMTP_PORT) || 465,
    user: process.env.PLATFORM_SMTP_USER?.trim() || "",
    pass: process.env.PLATFORM_SMTP_PASS ?? "",
    from,
  };
}

/** True when the platform mailbox is set up, so emails will actually go out. */
export function platformMailReady(): boolean {
  return config() !== null;
}

export interface PlatformMail {
  to: string;
  subject: string;
  /** The message as short paragraphs (plain text; links are given separately). */
  lines: string[];
  /** One main link, shown as a button (and written out in the plain-text part). */
  button?: { label: string; url: string };
  /** Small print under the button, e.g. how long a link works. */
  note?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The plain and HTML parts of a platform email: one column, the ZeronixOS name, a button, small print. */
export function renderPlatformMail(m: PlatformMail): { text: string; html: string } {
  const text = [...m.lines, ...(m.button ? [`${m.button.label}: ${m.button.url}`] : []), ...(m.note ? [m.note] : []), "ZeronixOS"].join("\n\n");
  const paragraphs = m.lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f2937">${esc(l)}</p>`).join("");
  const button = m.button
    ? `<p style="margin:22px 0"><a href="${esc(m.button.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">${esc(m.button.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all">Or open this link: ${esc(m.button.url)}</p>`
    : "";
  const note = m.note ? `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280">${esc(m.note)}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td><div style="font-weight:700;font-size:18px;color:#0f172a;margin-bottom:18px">ZeronixOS</div>${paragraphs}${button}${note}</td></tr>
</table>
<p style="font-size:11px;color:#9ca3af;margin:14px 0 0">Sent by ZeronixOS. This mailbox is not read; reply to the person who invited you or to your company's admin.</p>
</td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Sends one platform email. Returns false when the mailbox is not set up or the send failed (logged, never thrown): the
 * caller always has a fallback, such as showing the link to copy.
 */
export async function sendPlatformMail(m: PlatformMail): Promise<boolean> {
  const c = config();
  if (!c) return false;
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    ...(c.user ? { auth: { user: c.user, pass: c.pass } } : {}),
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
  try {
    const { text, html } = renderPlatformMail(m);
    await transport.sendMail({ from: c.from, to: m.to, subject: m.subject, text, html });
    return true;
  } catch (e) {
    console.error(`[platform-mail] to ${m.to} failed:`, (e as Error).message);
    return false;
  } finally {
    transport.close();
  }
}
