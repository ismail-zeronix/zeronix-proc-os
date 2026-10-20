import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";

export type MailAccessCode = "forbidden" | "not_connected" | "paused";

export class MailAccessError extends Error {
  constructor(
    public code: MailAccessCode,
    message: string,
  ) {
    super(message);
  }
}

export interface MailCreds {
  userId: number;
  name: string;
  /** IMAP / SMTP login, normally the full address. */
  login: string;
  pass: string;
}

/** The signed-in user's mailbox login, for the Mail app. Throws MailAccessError with a code the UI can act on. */
export async function mailCreds(): Promise<MailCreds> {
  const access = await loadAccess();
  if (!access || !access.apps.includes("mail")) throw new MailAccessError("forbidden", "You do not have access to Mail.");
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, access.user.id));
  if (!acc) throw new MailAccessError("not_connected", "Connect your mailbox first.");
  if (!acc.enabled) throw new MailAccessError("paused", acc.lastError || "Your mailbox is paused. Connect it again.");
  try {
    return { userId: access.user.id, name: access.user.name, login: acc.imapUser, pass: decryptSecret(acc.passwordEnc) };
  } catch {
    throw new MailAccessError("paused", "The saved password can no longer be read. Enter it again under My account.");
  }
}

/** HTTP status for an access error. */
export const accessStatus = (e: MailAccessError) => (e.code === "forbidden" ? 403 : 409);
