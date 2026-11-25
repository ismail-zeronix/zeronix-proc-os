import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The `?r=` on the zeronixtech.com/connect link in every cold email (Phase 6 of the sales routine): which prospect the
 * email went to, signed so nobody can guess another company's link. "p123.k3j…" = prospect 123. No expiry: an old
 * email still works. The site passes it through untouched; only the portal reads it.
 */

const secret = () => process.env.AUTH_SECRET || process.env.SITE_API_KEY || "";

function sig(body: string): string {
  return createHmac("sha256", secret()).update(`connect:${body}`).digest("base64url").slice(0, 16);
}

export function connectToken(prospectId: number): string {
  const body = `p${prospectId}`;
  return `${body}.${sig(body)}`;
}

/** The prospect id in a token, or null when it is missing, malformed or not signed by us. */
export function readConnectToken(token: string | null | undefined): number | null {
  const m = /^p(\d{1,9})\.([A-Za-z0-9_-]{16})$/.exec((token ?? "").trim());
  if (!m || !secret()) return null;
  const want = Buffer.from(sig(`p${m[1]}`));
  const got = Buffer.from(m[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(m[1]);
}

/** The public form the link opens. */
export const CONNECT_URL = (process.env.SITE_PUBLIC_URL || "https://zeronixtech.com").replace(/\/$/, "") + "/connect";
