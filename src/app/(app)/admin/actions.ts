"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { GRANTABLE_APPS } from "@/lib/apps";
import { requireAdmin } from "@/lib/auth/session";
import { setSetting } from "@/lib/settings";
import { abortCurrentRead, runAiCycle, unloadModel } from "@/worker/ai";

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

/** `apps: null` = use the role's defaults; an array = exactly these apps. */
export async function updateUser(
  id: number,
  patch: { role?: "admin" | "sales"; isActive?: boolean; password?: string; apps?: string[] | null },
) {
  const me = await requireAdmin();
  if (id === me.id && (patch.role === "sales" || patch.isActive === false)) {
    throw new Error("You cannot demote or deactivate yourself.");
  }
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role) set.role = patch.role;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.apps !== undefined) {
    const valid = new Set<string>(GRANTABLE_APPS.map((a) => a.key));
    set.apps = patch.apps === null ? null : [...new Set(patch.apps)].filter((k) => valid.has(k));
  }
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

// ---------- AI reading: start / stop / interval ----------

/** Starts AI reading: waiting lists are read now, then again on every interval until Stop. */
export async function startAi() {
  await requireAdmin();
  await setSetting("ai_running", "true");
  await setSetting("ai_last_run_at", "");
  void runAiCycle().catch((e) => console.error("[ai] cycle failed", e));
  revalidatePath("/admin");
}

/** Stops AI reading. A list being read goes back to the queue after its current step, and the model is unloaded. */
export async function stopAi() {
  await requireAdmin();
  await setSetting("ai_running", "false");
  await setSetting("ai_stop_at", new Date().toISOString());
  // cancel the batch that is generating, then free the model
  abortCurrentRead();
  void unloadModel();
  revalidatePath("/admin");
}

/** One pass over the waiting lists right now, whether or not AI reading is started. */
export async function runAiNow() {
  await requireAdmin();
  void runAiCycle({ manual: true }).catch((e) => console.error("[ai] cycle failed", e));
  revalidatePath("/admin");
}

export async function setAiInterval(minutes: number) {
  await requireAdmin();
  const m = z.coerce.number().int().min(1).max(1440).parse(minutes);
  await setSetting("ai_interval_minutes", String(m));
  revalidatePath("/admin");
}

// ---------- live feeds: interval and pause / resume ----------

export async function setFeedSchedule(supplierId: number, patch: { intervalMinutes?: number; enabled?: boolean }) {
  await requireAdmin();
  const set: Partial<typeof schema.supplierFeeds.$inferInsert> = {};
  if (patch.intervalMinutes !== undefined) set.intervalMinutes = z.coerce.number().int().min(5).max(60 * 24 * 7).parse(patch.intervalMinutes);
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  // resuming (or a new interval) is checked on the next minute tick rather than waiting out the old timer
  if (patch.enabled === true) set.lastCheckedAt = null;
  await db.update(schema.supplierFeeds).set(set).where(eq(schema.supplierFeeds.supplierId, supplierId));
  revalidatePath("/admin");
  revalidatePath(`/procurement/suppliers/${supplierId}`);
}

/** Puts lists back in the queue that are marked "being read" but whose reader died (e.g. the server was restarted mid-read). */
export async function requeueStuckLists() {
  await requireAdmin();
  await db
    .update(schema.priceLists)
    .set({ status: "queued", error: null, progressDone: 0 })
    .where(eq(schema.priceLists.status, "parsing"));
  revalidatePath("/admin");
  revalidatePath("/procurement/price-lists");
}
