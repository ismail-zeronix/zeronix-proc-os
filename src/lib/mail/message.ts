import "server-only";
import { type MailCreds } from "./account";
import { fetchSource } from "./imap";
import { type MessageView, parseMessage, pickAttachment } from "./parse";

export type { MessageView } from "./parse";

/** One inbox email, read from the mail server and made safe to show. */
export async function loadMessage(creds: MailCreds, uid: number, loadImages: boolean): Promise<MessageView> {
  const { source, seen } = await fetchSource(creds.login, creds.pass, uid);
  return parseMessage(uid, source, seen, loadImages);
}

/** One attachment's bytes, for download. */
export async function loadAttachment(creds: MailCreds, uid: number, index: number) {
  const { source } = await fetchSource(creds.login, creds.pass, uid);
  return pickAttachment(source, index);
}
