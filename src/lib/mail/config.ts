/** Where mailboxes live. All Zeronix mailboxes are on Hostinger; change with MAIL_* in .env if that ever moves. */
export function mailServer() {
  return {
    host: process.env.MAIL_IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.MAIL_IMAP_PORT) || 993,
    smtpHost: process.env.MAIL_SMTP_HOST || "smtp.hostinger.com",
    smtpPort: Number(process.env.MAIL_SMTP_PORT) || 465,
    webmailUrl: process.env.MAIL_WEBMAIL_URL || "https://mail.hostinger.com",
    /** Most recipients one person can email in 24 hours (a brake on mistakes and misuse). */
    dailyLimit: Number(process.env.MAIL_DAILY_LIMIT) || 200,
  };
}
