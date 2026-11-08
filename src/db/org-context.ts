import { AsyncLocalStorage } from "node:async_hooks";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Which organisation (tenant) the current work is for. In order:
 *  1. runAsOrg(id, fn): workers, jobs, scripts, sign-in and the platform console say it explicitly;
 *  2. the signed-in user's session cookie (its `org` claim, signed by us);
 *  3. the fallback organisation: FALLBACK_ORG_ID, or 1 (Zeronix) when MULTI_TENANT is not "true". It serves the
 *     public website and chat-widget endpoints and local scripts of a single-company install. A SaaS install
 *     (MULTI_TENANT=true) has none, so a request with no session sees nothing (fail closed).
 */
const als = new AsyncLocalStorage<{ orgId: number }>();

export function runAsOrg<T>(orgId: number, fn: () => PromiseLike<T>): Promise<T> {
  if (!Number.isInteger(orgId) || orgId < 1) return Promise.reject(new Error(`Bad organisation id: ${orgId}`));
  // awaited inside: a drizzle query only runs when awaited, and must run in this organisation, not the caller's
  return als.run({ orgId }, async () => await fn());
}

/** The organisation set by runAsOrg(), if any (no session or fallback). */
export function explicitOrgId(): number | null {
  return als.getStore()?.orgId ?? null;
}

export function fallbackOrgId(): number | null {
  const v = Number(process.env.FALLBACK_ORG_ID);
  if (Number.isInteger(v) && v > 0) return v;
  return process.env.MULTI_TENANT === "true" ? null : 1;
}

// a signed cookie always names the same organisation: remember the last few instead of checking the signature per query
const fromToken = new Map<string, number | null>();

async function sessionOrgId(): Promise<number | null> {
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch (e) {
    // Next's own signals (a page being made dynamic) must reach Next; "outside a request" just means no session
    if (e && typeof e === "object" && "digest" in e) throw e;
    return null;
  }
  if (!token) return null;
  if (fromToken.has(token)) return fromToken.get(token)!;
  const user = await verifySession(token);
  const org = user?.org ?? null;
  if (fromToken.size > 500) fromToken.clear();
  fromToken.set(token, org);
  return org;
}

/** The organisation for the next query, or null (no rows visible, inserts refused). */
export async function resolveOrgId(): Promise<number | null> {
  const explicit = explicitOrgId();
  if (explicit) return explicit;
  return (await sessionOrgId()) ?? fallbackOrgId();
}
