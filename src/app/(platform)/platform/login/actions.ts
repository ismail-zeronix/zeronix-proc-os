"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearFailures, ipLockedMinutes, lockedMinutes, recordFailure } from "@/lib/auth/lockout";
import { ipFromHeaders } from "@/lib/client-ip";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { platformDb, schema } from "@/platform/db";
import { platformAudit, setPlatformCookie } from "@/platform/session";

const schemaIn = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  code: z.string().trim().min(6).max(8),
});

/** A bcrypt hash nobody knows: an unknown email takes as long as a wrong password. */
const DUMMY_HASH = "$2b$10$CPmiTFy4B8jsqJavIFsIT.LITWmRl2I1z.bG3.vDTKkhOMyA9pZTe";

/** Platform sign-in: password and the 6-digit code from the authenticator app, both required. */
export async function platformLogin(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = schemaIn.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email, password and the 6-digit code." };
  const { email, password, code } = parsed.data;
  const key = `platform:${email}`;
  const ip = ipFromHeaders(await headers());
  if ((await ipLockedMinutes(ip)) || (await lockedMinutes(key))) return { error: "Too many wrong tries. Wait 15 minutes." };

  const [a] = await platformDb.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.email, email));
  const passwordOk = await bcrypt.compare(password, a?.passwordHash ?? DUMMY_HASH);
  const step = a && passwordOk && a.isActive ? verifyTotp(decryptSecret(a.totpSecret), code, a.lastTotpStep) : null;
  if (!a || step == null) {
    await recordFailure(key, ip);
    return { error: "Wrong email, password or code." };
  }
  // the code is used up: the same 6 digits can never sign in again
  const taken = await platformDb
    .update(schema.platformAdmins)
    .set({ lastTotpStep: step })
    .where(and(eq(schema.platformAdmins.id, a.id), eq(schema.platformAdmins.lastTotpStep, a.lastTotpStep)))
    .returning({ id: schema.platformAdmins.id });
  if (!taken.length) return { error: "That code was just used. Wait for the next one." };
  await clearFailures(key);
  const session = { id: a.id, name: a.name, email: a.email, sv: a.sessionVersion };
  await platformAudit({ admin: session, action: "platform.login", summary: `${a.email} signed in to the platform console` });
  await setPlatformCookie(session);
  redirect("/platform");
}
