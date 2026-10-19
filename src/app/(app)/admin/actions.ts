"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { setSetting } from "@/lib/settings";

const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "sales"]),
});

export async function createUser(input: z.input<typeof userSchema>) {
  await requireAdmin();
  const d = userSchema.parse(input);
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, d.email));
  if (exists) throw new Error("A user with this email already exists.");
  await db.insert(schema.users).values({
    name: d.name,
    email: d.email,
    role: d.role,
    passwordHash: await bcrypt.hash(d.password, 10),
  });
  revalidatePath("/admin");
}

export async function updateUser(id: number, patch: { role?: "admin" | "sales"; isActive?: boolean; password?: string }) {
  const me = await requireAdmin();
  if (id === me.id && (patch.role === "sales" || patch.isActive === false)) {
    throw new Error("You cannot demote or deactivate yourself.");
  }
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role) set.role = patch.role;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("Password must be at least 8 characters");
    set.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  await db.update(schema.users).set(set).where(eq(schema.users.id, id));
  revalidatePath("/admin");
}

const settingsSchema = z.object({
  llm_model: z.string().trim().min(1).max(100),
  stale_days: z.coerce.number().int().min(1).max(365),
  fx_usd: z.coerce.number().min(1).max(10),
});

export async function saveSettings(input: z.input<typeof settingsSchema>) {
  await requireAdmin();
  const d = settingsSchema.parse(input);
  await setSetting("llm_model", d.llm_model);
  await setSetting("stale_days", String(d.stale_days));
  await setSetting("fx_usd", String(d.fx_usd));
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}
