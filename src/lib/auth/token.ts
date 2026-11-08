import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "zp_session";
export const SESSION_DAYS = 7;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "sales";
  /**
   * The user's session version when the cookie was signed. Changing the password, deactivating the user or "Sign out
   * everywhere" raises users.session_version, and every older cookie stops working at once (loadAccess compares them).
   * Cookies from before this existed count as version 1, the default, so nobody is signed out by the upgrade itself.
   */
  sv: number;
  /**
   * The organisation (tenant) the user works in; every query of their requests is scoped to it (db/org-context.ts).
   * Null on cookies from before organisations were in the cookie (a single-company install then uses organisation 1).
   */
  org: number | null;
}

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role, sv: user.sv, org: user.org })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return {
      id: Number(payload.sub),
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role === "admin" ? "admin" : "sales",
      sv: typeof payload.sv === "number" && Number.isInteger(payload.sv) ? payload.sv : 1,
      org: typeof payload.org === "number" && Number.isInteger(payload.org) && payload.org > 0 ? payload.org : null,
    };
  } catch {
    return null;
  }
}
