"use server";

import bcrypt from "bcryptjs";
import { count, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/token";

const setupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(12, "Use at least 12 characters").max(128),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function createInitialAdmin(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: "Enter your name, a valid email, and matching passwords of at least 12 characters." };
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  // Serialize concurrent first-run requests so only one can create the initial account.
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741902615)`);
    const [{ n }] = await tx.select({ n: count() }).from(schema.users);
    if (n > 0) return null;

    const [created] = await tx
      .insert(schema.users)
      .values({ name, email, passwordHash, role: "admin" })
      .returning();
    return created;
  });

  if (!user) return { error: "Setup is already complete. Please sign in instead." };

  const token = await signSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });

  redirect("/");
}
