import { createHash, randomBytes } from "node:crypto";

/**
 * The rules of the Claude connector's OAuth sign-in that need no database: which return addresses are allowed, the PKCE
 * check and the scopes. Kept apart from lib/mcp/oauth.ts so tests can run them directly.
 */

/** Where Claude on the web, desktop and phone apps comes back after sign-in. */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

export const SCOPES = ["read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * Allowed return addresses: Claude's own callback, and Claude Code's loopback address on any port
 * (http://localhost:<port>/callback or http://127.0.0.1:<port>/callback, RFC 8252 7.3).
 */
export function redirectAllowed(uri: string): boolean {
  if (uri === CLAUDE_CALLBACK) return true;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.pathname === "/callback" && !u.username && !u.password;
}

/** The address an app asks to return to must be one it registered; loopback addresses match on any port. */
export function redirectMatches(registered: string[], asked: string): boolean {
  if (!redirectAllowed(asked)) return false;
  if (registered.includes(asked)) return true;
  const a = new URL(asked);
  if (a.protocol !== "http:") return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === a.hostname && u.pathname === a.pathname;
    } catch {
      return false;
    }
  });
}

/** A loopback address: any program on that computer could be the app, so the consent page says so. */
export function isLoopback(uri: string): boolean {
  try {
    const h = new URL(uri).hostname;
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

const b64url = (b: Buffer) => b.toString("base64url");

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge sent at the start. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return b64url(createHash("sha256").update(verifier).digest()) === challenge;
}

/** What Claude asked for, reduced to what we hand out: read always, write only when asked. */
export function parseScope(raw: string | null | undefined): Scope[] {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  return asked.includes("write") ? ["read", "write"] : ["read"];
}

export const scopeText = (s: Scope[]) => s.join(" ");
export const hasWrite = (scope: string) => scope.split(" ").includes("write");

export const newSecret = () => b64url(randomBytes(32));
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
