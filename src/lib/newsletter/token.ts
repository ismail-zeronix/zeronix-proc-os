import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The unsubscribe link of one email: `<send id>.<signature>`. The signature is an HMAC over a fixed purpose and the id, made
 * with AUTH_SECRET, so a link cannot be made up or changed to unsubscribe somebody else, and checking it needs no
 * database. A send id of 0 is the link in a test email (it explains itself and changes nothing).
 */

const sign = (id: number) => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return createHmac("sha256", s).update(`newsletter-unsubscribe:${id}`).digest("base64url").slice(0, 27);
};

export const unsubscribeToken = (sendId: number) => `${sendId}.${sign(sendId)}`;

/** The send id inside a valid token, or null for anything else. */
export function readUnsubscribeToken(token: string): number | null {
  const m = /^(\d{1,10})\.([A-Za-z0-9_-]{27})$/.exec(token);
  if (!m) return null;
  const id = Number(m[1]);
  const want = Buffer.from(sign(id));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** The address of the portal for links in emails (set PORTAL_URL on the server; local development uses localhost). */
export const portalUrl = () => (process.env.PORTAL_URL || "https://zeronixos.online").replace(/\/+$/, "");

/** The page a person opens from the footer link. */
export const unsubscribePageUrl = (sendId: number) => `${portalUrl()}/unsubscribe/${unsubscribeToken(sendId)}`;

/** The address mail programs call (a POST) for the one-click unsubscribe button. */
export const unsubscribePostUrl = (sendId: number) => `${portalUrl()}/api/newsletter/unsubscribe/${unsubscribeToken(sendId)}`;
