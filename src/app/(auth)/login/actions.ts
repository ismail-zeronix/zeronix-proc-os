"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, runAsOrg } from "@/db";
import { clearFailures, ipLockedMinutes, lockedMinutes, recordFailure } from "@/lib/auth/lockout";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { loginUser } from "@/lib/auth/login-user";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { safeNext } from "@/lib/auth/safe-next";
import { ipFromHeaders } from "@/lib/client-ip";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** A bcrypt hash of nothing anyone knows: compared against when the email is unknown, so both cases take as long. */
const DUMMY_HASH = "$2b$10$CPmiTFy4B8jsqJavIFsIT.LITWmRl2I1z.bG3.vDTKkhOMyA9pZTe";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, next } = parsed.data;
  const ip = ipFromHeaders(await headers());

  const ipWait = await ipLockedMinutes(ip);
  if (ipWait) return { error: `Too many wrong passwords from your network. Try again in ${ipWait} minute${ipWait === 1 ? "" : "s"}.` };
  const wait = await lockedMinutes(email);
  if (wait) return { error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or ask an admin to reset it.` };

  // the one read of users across organisations: the email is global and the organisation is not known yet
  const user = await loginUser(email);
  // always run one bcrypt compare, so an unknown email answers as slowly as a wrong password (no account guessing by timing)
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !ok) {
    await recordFailure(email, ip);
    return { error: "Wrong email or password." };
  }
  await clearFailures(email);
  if (!user.orgActive) return { error: "Your company's account is paused. Please contact Zeronix support." };
  await runAsOrg(user.organizationId, () => audit(db, { userId: user.id, action: "auth.login", entity: "user", entityId: user.id, summary: `${user.email} signed in` }));

  await setSessionCookie({ id: user.id, name: user.name, email: user.email, role: user.role, sv: user.sessionVersion, org: user.organizationId });
  redirect(safeNext(next));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
