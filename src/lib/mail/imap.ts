import { ImapFlow } from "imapflow";
import { mailServer } from "./config";

export interface FetchedMessage {
  uid: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  receivedAt: Date;
  seen: boolean;
}

/** Thrown for a wrong login, so the caller can stop retrying (repeated bad logins can lock a mailbox). */
export class MailAuthError extends Error {}

function friendly(e: unknown): Error {
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string };
  if (err.authenticationFailed) return new MailAuthError("Wrong email or password.");
  if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ECONNRESET") {
    return new Error("Could not reach the mail server. Check the internet connection and try again.");
  }
  return new Error(err.message ? `Mail server said: ${err.message}` : "Could not read the mailbox.");
}

/** Logs in, reads the newest `limit` inbox messages (sender, subject, date, read flag only) and logs out. */
export async function fetchLatest(user: string, pass: string, limit = 20) {
  const { host, port } = mailServer();
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 20_000,
    socketTimeout: 60_000,
  });
  client.on("error", () => {}); // reported through the rejected promise below
  try {
    await client.connect();
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const messages: FetchedMessage[] = [];
    if (box.exists > 0) {
      const from = Math.max(1, box.exists - limit + 1);
      for await (const m of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
        const sender = m.envelope?.from?.[0];
        const when = m.envelope?.date ?? m.internalDate;
        messages.push({
          uid: m.uid,
          fromName: (sender?.name ?? "").trim(),
          fromEmail: (sender?.address ?? "").trim(),
          subject: (m.envelope?.subject ?? "").trim(),
          receivedAt: when ? new Date(when) : new Date(),
          seen: m.flags?.has("\\Seen") ?? false,
        });
      }
    }
    return { uidValidity: String(box.uidValidity), messages };
  } catch (e) {
    throw friendly(e);
  } finally {
    await client.logout().catch(() => client.close());
  }
}
