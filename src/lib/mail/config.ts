/** Where mailboxes live. All Zeronix mailboxes are on Hostinger; change with MAIL_* in .env if that ever moves. */
export function mailServer() {
  return {
    host: process.env.MAIL_IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.MAIL_IMAP_PORT) || 993,
    webmailUrl: process.env.MAIL_WEBMAIL_URL || "https://mail.hostinger.com",
  };
}
