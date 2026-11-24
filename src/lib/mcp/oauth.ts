import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { db, schema } from "@/db";
import { allowedApps, type AppKey } from "@/lib/apps";
import { claudeAllowed, hasWrite, newSecret, pkceMatches, redirectMatches, sha256 } from "./oauth-rules";

/**
 * Sign-in for the Claude connector (OAuth 2.1 with PKCE and dynamic client registration), as Claude expects it:
 * https://claude.com/docs/connectors/building/authentication.
 *
 * - Access tokens: 1-hour JWTs. Every MCP call also re-reads the connection and the user (see verifyAccess), so revoking,
 *   deactivating, taking the role away or "Sign out everywhere" stops Claude at once, and a change of apps or data
 *   scope applies from the next call.
 * - Codes: 5-minute JWTs that work once (the connection moves from pending to active).
 * - Refresh tokens: random, stored as a hash, replaced on every use.
 * Tokens are signed with a key derived from AUTH_SECRET, never the session key itself, so a token can never pass as a
 * portal session cookie.
 */

export const ACCESS_SECONDS = 3600;
const CODE_SECONDS = 300;
/** A connection nobody used for this long has to sign in again. */
const IDLE_DAYS = 90;
const AUD = "zeronix-mcp";

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return new Uint8Array(createHash("sha256").update(`${s}:mcp-oauth`).digest());
}

/**
 * The portal's public address. PORTAL_URL on the server (https://zeronixos.online); in local development, the address
 * the request came to, so sign-in can be tried on localhost.
 */
export function portalBase(reqUrl?: string): string {
  const env = process.env.PORTAL_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (process.env.NODE_ENV !== "production" && reqUrl) return new URL(reqUrl).origin;
  return "https://zeronixos.online";
}

export const mcpUrl = (base: string) => `${base}/api/mcp`;
export const resourceMetadataUrl = (base: string) => `${base}/.well-known/oauth-protected-resource`;

export class OAuthError extends Error {
  constructor(
    public code: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_client_metadata" | "invalid_redirect_uri",
    message: string,
  ) {
    super(message);
  }
}

/* ---------- clients ---------- */

export async function registerClient(name: string, redirectUris: string[]) {
  const clientId = randomBytes(16).toString("hex");
  await db.insert(schema.mcpClients).values({ clientId, name: name.slice(0, 120), redirectUris });
  return clientId;
}

export async function getClient(clientId: string) {
  if (!/^[0-9a-f]{32}$/.test(clientId)) return null;
  const [c] = await db.select().from(schema.mcpClients).where(eq(schema.mcpClients.clientId, clientId)).limit(1);
  return c ?? null;
}

/** For the consent page: the app exists and may return to this address. */
export async function checkAuthorizeRequest(clientId: string, redirectUri: string) {
  const client = await getClient(clientId);
  if (!client) return null;
  return redirectMatches(client.redirectUris, redirectUri) ? client : null;
}

/* ---------- consent → code ---------- */

/** The user pressed Allow: a pending connection, and a code that turns it into tokens once. */
export async function issueCode(p: { userId: number; userSv: number; clientId: string; scope: string; redirectUri: string; codeChallenge: string }) {
  // connections that were allowed but never finished (Claude closed, network...) are cleared after a day
  await db.delete(schema.mcpGrants).where(and(eq(schema.mcpGrants.status, "pending"), lt(schema.mcpGrants.createdAt, sql`now() - interval '1 day'`)));
  const [g] = await db
    .insert(schema.mcpGrants)
    .values({ userId: p.userId, userSv: p.userSv, clientId: p.clientId, scope: p.scope })
    .returning({ id: schema.mcpGrants.id });
  return new SignJWT({ typ: "code", gid: g.id, cid: p.clientId, ru: p.redirectUri, cc: p.codeChallenge })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${CODE_SECONDS}s`)
    .sign(key());
}

async function accessToken(grantId: number, userId: number, scope: string) {
  return new SignJWT({ typ: "access", gid: grantId, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUD)
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_SECONDS}s`)
    .sign(key());
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** The connection's user must still be active, in a role that may use Claude, with the same session version. */
async function grantOwnerOk(grantUserId: number, userSv: number) {
  const [u] = await db
    .select({ role: schema.users.role, isActive: schema.users.isActive, sv: schema.users.sessionVersion })
    .from(schema.users)
    .where(eq(schema.users.id, grantUserId))
    .limit(1);
  return !!u && u.isActive && claudeAllowed(u.role) && u.sv === userSv;
}

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenResponse> {
  let c: Record<string, unknown>;
  try {
    ({ payload: c } = await jwtVerify(p.code, key(), { audience: AUD }));
  } catch {
    throw new OAuthError("invalid_grant", "The code is invalid or has expired");
  }
  if (c.typ !== "code" || c.cid !== p.clientId || c.ru !== p.redirectUri) throw new OAuthError("invalid_grant", "The code does not match this request");
  if (!pkceMatches(p.codeVerifier, String(c.cc))) throw new OAuthError("invalid_grant", "PKCE check failed");
  const gid = Number(c.gid);
  const refresh = newSecret();
  // pending → active exactly once; a second use of the same code finds nothing pending and ends the connection
  const [g] = await db
    .update(schema.mcpGrants)
    .set({ status: "active", refreshHash: sha256(refresh), lastUsedAt: new Date() })
    .where(and(eq(schema.mcpGrants.id, gid), eq(schema.mcpGrants.status, "pending"), isNull(schema.mcpGrants.revokedAt)))
    .returning();
  if (!g) {
    await db.update(schema.mcpGrants).set({ revokedAt: new Date() }).where(and(eq(schema.mcpGrants.id, gid), isNull(schema.mcpGrants.revokedAt)));
    throw new OAuthError("invalid_grant", "The code was already used");
  }
  if (!(await grantOwnerOk(g.userId, g.userSv))) {
    await db.update(schema.mcpGrants).set({ revokedAt: new Date() }).where(eq(schema.mcpGrants.id, g.id));
    throw new OAuthError("invalid_grant", "This account cannot connect Claude");
  }
  return { access_token: await accessToken(g.id, g.userId, g.scope), token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: g.scope };
}

export async function refreshTokens(p: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const old = sha256(p.refreshToken);
  const next = newSecret();
  const [g] = await db
    .update(schema.mcpGrants)
    .set({ refreshHash: sha256(next), lastUsedAt: new Date() })
    .where(
      and(
        eq(schema.mcpGrants.refreshHash, old),
        eq(schema.mcpGrants.clientId, p.clientId),
        eq(schema.mcpGrants.status, "active"),
        isNull(schema.mcpGrants.revokedAt),
        sql`coalesce(${schema.mcpGrants.lastUsedAt}, ${schema.mcpGrants.createdAt}) > now() - make_interval(days => ${IDLE_DAYS})`,
      ),
    )
    .returning();
  if (!g) throw new OAuthError("invalid_grant", "The refresh token is invalid, expired or revoked");
  if (!(await grantOwnerOk(g.userId, g.userSv))) {
    await db.update(schema.mcpGrants).set({ revokedAt: new Date() }).where(eq(schema.mcpGrants.id, g.id));
    throw new OAuthError("invalid_grant", "This account cannot use Claude");
  }
  return { access_token: await accessToken(g.id, g.userId, g.scope), token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: next, scope: g.scope };
}

/* ---------- each MCP call ---------- */

export interface McpAuth {
  grantId: number;
  userId: number;
  name: string;
  email: string;
  orgId: number;
  /** users.session_version, so the portal's own checks accept Claude as this user (lib/auth/session.ts runAsClaude). */
  sv: number;
  write: boolean;
  role: "admin" | "sales";
  /** The apps this person may open in the portal; tools of other apps are not offered. */
  apps: AppKey[];
  /** Admins and "All data" users see every sales record; everybody else only the deals they are on. */
  seesAll: boolean;
  /** Has the Accounts app: money owed, bills, reports and every invoice. */
  finance: boolean;
}

/** The bearer token of an MCP call, checked against the database. Null = 401 (Claude then refreshes or signs in again). */
export async function verifyAccess(authorization: string | null): Promise<McpAuth | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!m) return null;
  let t: Record<string, unknown>;
  try {
    ({ payload: t } = await jwtVerify(m[1], key(), { audience: AUD }));
  } catch {
    return null;
  }
  if (t.typ !== "access") return null;
  const [row] = await db
    .select({
      grantId: schema.mcpGrants.id,
      scope: schema.mcpGrants.scope,
      status: schema.mcpGrants.status,
      revokedAt: schema.mcpGrants.revokedAt,
      userSv: schema.mcpGrants.userSv,
      lastUsedAt: schema.mcpGrants.lastUsedAt,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      apps: schema.users.apps,
      dataScope: schema.users.dataScope,
      sv: schema.users.sessionVersion,
      orgId: schema.users.organizationId,
    })
    .from(schema.mcpGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.mcpGrants.userId))
    .where(eq(schema.mcpGrants.id, Number(t.gid)))
    .limit(1);
  if (!row || row.status !== "active" || row.revokedAt || String(row.userId) !== t.sub) return null;
  if (!row.isActive || !claudeAllowed(row.role) || row.sv !== row.userSv) return null;
  // "last used" for Admin › Claude, written at most every few minutes
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(schema.mcpGrants).set({ lastUsedAt: new Date() }).where(eq(schema.mcpGrants.id, row.grantId));
  }
  // the same access the portal works out for this person (lib/auth/session.ts loadAccess)
  const apps = allowedApps({ role: row.role, apps: row.apps });
  return {
    grantId: row.grantId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    orgId: row.orgId,
    sv: row.sv,
    write: hasWrite(row.scope),
    role: row.role,
    apps,
    seesAll: row.role === "admin" || row.dataScope === "all",
    finance: apps.includes("accounts"),
  };
}

/* ---------- Admin › Claude ---------- */

export async function listConnections() {
  return db
    .select({
      id: schema.mcpGrants.id,
      userName: schema.users.name,
      app: schema.mcpClients.name,
      scope: schema.mcpGrants.scope,
      createdAt: schema.mcpGrants.createdAt,
      lastUsedAt: schema.mcpGrants.lastUsedAt,
    })
    .from(schema.mcpGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.mcpGrants.userId))
    .innerJoin(schema.mcpClients, eq(schema.mcpClients.clientId, schema.mcpGrants.clientId))
    .where(and(eq(schema.mcpGrants.status, "active"), isNull(schema.mcpGrants.revokedAt)))
    .orderBy(sql`coalesce(${schema.mcpGrants.lastUsedAt}, ${schema.mcpGrants.createdAt}) desc`);
}

export async function revokeConnection(id: number) {
  const [g] = await db
    .update(schema.mcpGrants)
    .set({ revokedAt: new Date(), refreshHash: null })
    .where(and(eq(schema.mcpGrants.id, id), isNull(schema.mcpGrants.revokedAt)))
    .returning({ id: schema.mcpGrants.id, userId: schema.mcpGrants.userId });
  return g ?? null;
}
