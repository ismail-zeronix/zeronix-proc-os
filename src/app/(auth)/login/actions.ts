"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { clearFailures, lockedMinutes, recordFailure } from "@/lib/auth/lockout";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/token";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, next } = parsed.data;

  const wait = await lockedMinutes(email);
  if (wait) return { error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or ask an admin to reset it.` };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    const h = await headers();
    await recordFailure(email, h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "");
    return { error: "Wrong email or password." };
  }
  await clearFailures(email);

  const token = await signSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
