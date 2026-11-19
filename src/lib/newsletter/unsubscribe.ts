import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { suppress } from "./data";
import { readUnsubscribeToken } from "./token";

export type UnsubscribeOutcome = { ok: true; email: string; test: boolean } | { ok: false };

/**
 * Looks up whom a token belongs to. `apply` also does it: the address goes on the do-not-contact list (the one
 * Prospecting uses too, so cold email stops as well) and its contact rows become "unsubscribed". Doing it twice is harmless.
 */
export async function unsubscribe(token: string, apply: boolean): Promise<UnsubscribeOutcome> {
  const id = readUnsubscribeToken(token);
  if (id === null) return { ok: false };
  if (id === 0) return { ok: true, email: "", test: true };
  const [send] = await db.select({ email: schema.newsletterSends.email }).from(schema.newsletterSends).where(eq(schema.newsletterSends.id, id));
  if (!send) return { ok: false };
  if (apply) {
    await suppress(send.email, "unsubscribe", "Newsletter unsubscribe link");
    await db.update(schema.newsletterContacts).set({ status: "unsubscribed" }).where(eq(schema.newsletterContacts.email, send.email));
  }
  return { ok: true, email: send.email, test: false };
}
