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

/** A message too large to open in the portal. */
export class MailTooBigError extends Error {}

export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

function friendly(e: unknown): Error {
  if (e instanceof MailAuthError || e instanceof MailTooBigError) return e;
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string };
  if (err.authenticationFailed) return new MailAuthError("Wrong email or password.");
  if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ECONNRESET") {
    return new Error("Could not reach the mail server. Check the internet connection and try again.");
  }
  return new Error(err.message ? `Mail server said: ${err.message}` : "Could not read the mailbox.");
}

/** Connects, runs `fn`, and always logs out. Errors come back as readable messages. */
async function using<T>(user: string, pass: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
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
    return await fn(client);
  } catch (e) {
    throw friendly(e);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Fetches envelope data for a range of the open mailbox. */
async function envelopes(client: ImapFlow, range: string): Promise<FetchedMessage[]> {
  const out: FetchedMessage[] = [];
  for await (const m of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
    const sender = m.envelope?.from?.[0];
    const when = m.envelope?.date ?? m.internalDate;
    out.push({
      uid: m.uid,
      fromName: (sender?.name ?? "").trim(),
      fromEmail: (sender?.address ?? "").trim(),
      subject: (m.envelope?.subject ?? "").trim(),
      receivedAt: when ? new Date(when) : new Date(),
      seen: m.flags?.has("\\Seen") ?? false,
    });
  }
  return out;
}

/** Logs in, reads the newest `limit` inbox messages (sender, subject, date, read flag only) and logs out. */
export async function fetchLatest(user: string, pass: string, limit = 20) {
  return using(user, pass, async (client) => {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const messages = box.exists > 0 ? await envelopes(client, `${Math.max(1, box.exists - limit + 1)}:*`) : [];
    return { uidValidity: String(box.uidValidity), messages };
  });
}

/** One page of the inbox, newest first. Page 0 is the newest `pageSize` messages. */
export async function listInbox(user: string, pass: string, page: number, pageSize = 30) {
  return using(user, pass, async (client) => {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const newest = box.exists - page * pageSize;
    if (newest < 1) return { messages: [] as FetchedMessage[], total: box.exists, hasMore: false };
    const oldest = Math.max(1, newest - pageSize + 1);
    const messages = (await envelopes(client, `${oldest}:${newest}`)).sort((a, b) => b.uid - a.uid);
    return { messages, total: box.exists, hasMore: oldest > 1 };
  });
}

/** The raw source of one inbox message. Refuses anything over 25 MB. */
export async function fetchSource(user: string, pass: string, uid: number): Promise<{ source: Buffer; seen: boolean }> {
  return using(user, pass, async (client) => {
    await client.mailboxOpen("INBOX", { readOnly: true });
    const meta = await client.fetchOne(String(uid), { size: true, flags: true }, { uid: true });
    if (!meta) throw new Error("That email no longer exists. It may have been moved or deleted.");
    if ((meta.size ?? 0) > MAX_MESSAGE_BYTES) {
      throw new MailTooBigError("This email is over 25 MB, too big to open here. Open it in webmail.");
    }
    const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!full || !full.source) throw new Error("Could not read that email.");
    return { source: full.source, seen: meta.flags?.has("\\Seen") ?? false };
  });
}

/** Marks one inbox message as read. */
export async function markSeenOnServer(user: string, pass: string, uid: number) {
  return using(user, pass, async (client) => {
    await client.mailboxOpen("INBOX");
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
  });
}
