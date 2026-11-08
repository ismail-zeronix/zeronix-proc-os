import { jwtVerify, SignJWT } from "jose";

/**
 * The platform admin's own sign-in (/platform), apart from any organisation's. It is signed with a key of its own (derived
 * from AUTH_SECRET with a different label), so a platform cookie can never be read as a tenant cookie or the other way
 * round, and it lasts 8 hours.
 */
export const PLATFORM_COOKIE = "zp_platform";
export const PLATFORM_HOURS = 8;

export interface PlatformSession {
  id: number;
  name: string;
  email: string;
  sv: number;
}

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return new TextEncoder().encode(`${s}::platform-console`);
}

export async function signPlatform(a: PlatformSession): Promise<string> {
  return new SignJWT({ name: a.name, email: a.email, sv: a.sv, kind: "platform" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(a.id))
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_HOURS}h`)
    .sign(key());
}

export async function verifyPlatform(token: string | undefined): Promise<PlatformSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "platform") return null;
    return { id: Number(payload.sub), name: String(payload.name), email: String(payload.email), sv: Number(payload.sv) || 1 };
  } catch {
    return null;
  }
}
