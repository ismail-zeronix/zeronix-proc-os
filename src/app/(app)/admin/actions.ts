"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { GRANTABLE_APPS } from "@/lib/apps";
import { audit } from "@/lib/audit";
import { revokeSessions, setSessionCookie } from "@/lib/auth/session-cookie";
import { clearFailures } from "@/lib/auth/lockout";
import { assertAccountant, requireAdmin } from "@/lib/auth/session";
import { parseLogoDataUrl } from "@/lib/logo";
import { type BrandStyle, normalizeStyle, safeColor } from "@/lib/signature";
import { getSettings, setSetting } from "@/lib/settings";
import { abortCurrentRead, runAiCycle, unloadModel } from "@/worker/ai";
import { parseInput, UserError } from "@/lib/user-error";

const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "sales"]),
});

export async function createUser(input: z.input<typeof userSchema>) {
  const me = await requireAdmin();
  const d = parseInput(userSchema, input);
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, d.email));
  if (exists) throw new UserError("A user with this email already exists.");
  const [created] = await db
    .insert(schema.users)
    .values({
      name: d.name,
      email: d.email,
      role: d.role,
      passwordHash: await bcrypt.hash(d.password, 10),
    })
    .returning({ id: schema.users.id });
  await audit(db, { userId: me.id, action: "user.create", entity: "user", entityId: created.id, summary: `${d.email} added as ${d.role}`, after: { name: d.name, email: d.email, role: d.role } });
  revalidatePath("/admin", "layout");
}

/** `apps: null` = use the role's defaults; an array = exactly these apps. */
export async function updateUser(
  id: number,
  patch: { role?: "admin" | "sales"; isActive?: boolean; password?: string; apps?: string[] | null; dataScope?: "own" | "all"; isAccountant?: boolean },
) {
  const me = await requireAdmin();
  if (id === me.id && (patch.role === "sales" || patch.isActive === false)) {
    throw new UserError("You cannot demote or deactivate yourself.");
  }
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role) set.role = patch.role;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.dataScope) set.dataScope = z.enum(["own", "all"]).parse(patch.dataScope);
  if (patch.isAccountant !== undefined) set.isAccountant = z.boolean().parse(patch.isAccountant);
  if (patch.apps !== undefined) {
    const valid = new Set<string>(GRANTABLE_APPS.map((a) => a.key));
    set.apps = patch.apps === null ? null : [...new Set(patch.apps)].filter((k) => valid.has(k));
  }
  if (patch.password) {
    if (patch.password.length < 8) throw new UserError("Password must be at least 8 characters");
    set.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  const [before] = await db.select({ role: schema.users.role, isActive: schema.users.isActive, apps: schema.users.apps, dataScope: schema.users.dataScope, isAccountant: schema.users.isAccountant }).from(schema.users).where(eq(schema.users.id, id));
  const [u] = await db.update(schema.users).set(set).where(eq(schema.users.id, id)).returning({ email: schema.users.email });
  // a new password from the admin also lifts a lock from too many wrong tries
  if (patch.password && u) await clearFailures(u.email);
  // a new password or a deactivation signs them out everywhere at once (a stolen cookie stops working too)
  if (u && (patch.password || patch.isActive === false)) {
    const sv = await revokeSessions(id);
    if (id === me.id) await setSessionCookie({ ...me, sv });
  }
  if (u) {
    // who changed whose access, and how (never the password itself)
    const { passwordHash: _hash, ...changed } = set;
    void _hash;
    await audit(db, { userId: me.id, action: "user.update", entity: "user", entityId: id, summary: `${u.email}: ${[...Object.keys(changed), ...(patch.password ? ["password reset"] : [])].join(", ")}`, before, after: { ...changed, ...(patch.password ? { password: "reset" } : {}) } });
  }
  revalidatePath("/admin", "layout");
}

// ---------- Company branding for email signatures ----------

const brandSchema = z.object({
  company: z.string().trim().min(1, "Enter the company name").max(80),
  tagline: z.string().trim().max(120).default(""),
  address: z.string().trim().max(300).default(""),
  website: z.string().trim().max(200).default(""),
  mainPhone: z.string().trim().max(120).default(""),
  layout: z.enum(["left", "right", "top", "below"]),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/, "Colour must look like #2a78d6"),
  disclaimer: z.string().trim().max(600).default(""),
});

/** `logo`: a data URL to replace the logo, "remove" to delete it, or leave out to keep the current one.
 *  `style`: template, divider line, fonts, colours and extra lines; bad values fall back to defaults. */
export async function saveBrand(input: z.input<typeof brandSchema> & { logo?: string; style?: Partial<BrandStyle> }) {
  await requireAdmin();
  const { logo, style, ...rest } = input;
  const d = parseInput(brandSchema, rest);
  const set: Partial<typeof schema.brandProfile.$inferInsert> = { ...d, color: safeColor(d.color), updatedAt: new Date() };
  if (style) {
    const s = normalizeStyle(style);
    set.style = { ...s, ...Object.fromEntries((["services", "partners", "contactHeading", "emails", "slogan", "greenNote"] as const).map((k) => [k, s[k].trim()])) };
  }
  if (logo === "remove") {
    set.logoB64 = "";
    set.logoMime = "";
  } else if (logo) {
    const parsed = parseLogoDataUrl(logo);
    set.logoB64 = parsed.b64;
    set.logoMime = parsed.mime;
  }
  await db
    .insert(schema.brandProfile)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: schema.brandProfile.organizationId, set });
  revalidatePath("/admin", "layout");
  revalidatePath("/account");
  revalidatePath("/mail", "layout");
}

const settingsSchema = z.object({
  llm_model: z.string().trim().min(1).max(100),
  /** "" = local Ollama, else a Prospecting AI provider id. */
  llm_provider_id: z.string().regex(/^\d*$/).default(""),
  stale_days: z.coerce.number().int().min(1).max(365),
  fx_usd: z.coerce.number().min(1).max(10),
});

export async function saveSettings(input: z.input<typeof settingsSchema>) {
  await requireAdmin();
  const d = parseInput(settingsSchema, input);
  await setSetting("llm_model", d.llm_model);
  await setSetting("llm_provider_id", d.llm_provider_id);
  await setSetting("stale_days", String(d.stale_days));
  await setSetting("fx_usd", String(d.fx_usd));
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
}

const quoteSettingsSchema = z.object({
  quote_margin_pct: z.coerce.number().min(0).max(300),
  quote_valid_days: z.coerce.number().int().min(1).max(180),
  quote_vat_pct: z.coerce.number().min(0).max(30),
  quote_terms: z.string().trim().max(2000),
  quote_email_subject: z.string().trim().min(1, "Enter an email subject").max(300).optional(),
  quote_email_body: z.string().trim().min(1, "Enter an email message").max(5000).optional(),
});

/**
 * Defaults a new quote starts with (Accounts › Settings › Documents › Quote defaults). Quotes already made keep their
 * own values. Our TRN is not here: it is saved, and checked, under VAT registration.
 */
export async function saveQuoteSettings(input: z.input<typeof quoteSettingsSchema>) {
  const me = await assertAccountant();
  const d = parseInput(quoteSettingsSchema, input);
  const before = await getSettings();
  if (Number(before.quote_vat_pct) !== d.quote_vat_pct) {
    await audit(db, { userId: me.id, action: "settings.vat", entity: "settings", summary: `Default VAT changed to ${d.quote_vat_pct}%`, before: { quote_vat_pct: before.quote_vat_pct }, after: { quote_vat_pct: d.quote_vat_pct } });
  }
  await setSetting("quote_margin_pct", String(d.quote_margin_pct));
  await setSetting("quote_valid_days", String(d.quote_valid_days));
  await setSetting("quote_vat_pct", String(d.quote_vat_pct));
  await setSetting("quote_terms", d.quote_terms);
  if (d.quote_email_subject !== undefined) await setSetting("quote_email_subject", d.quote_email_subject);
  if (d.quote_email_body !== undefined) await setSetting("quote_email_body", d.quote_email_body);
  revalidatePath("/admin", "layout");
  revalidatePath("/accounts", "layout");
  revalidatePath("/sales", "layout");
  revalidatePath("/crm", "layout");
}

const hm = z.string().regex(/^([01]d|2[0-3]):[0-5]d$/, "Use HH:MM, 24-hour (e.g. 09:30)");
const workHoursSchema = z
  .object({
    work_start: hm,
    work_end: hm,
    work_break_start: hm,
    work_break_end: hm,
    work_off_days: z.array(z.number().int().min(0).max(6)).max(6),
  })
  .refine((d) => d.work_start < d.work_end, "Work must end after it starts.")
  .refine((d) => d.work_break_start < d.work_break_end, "The break must end after it starts.")
  .refine((d) => d.work_start <= d.work_break_start && d.work_break_end <= d.work_end, "The break must be inside work hours.");

/** Punch in / out: working window, fixed break and weekly off days. */
export async function saveWorkHours(input: z.input<typeof workHoursSchema>) {
  await requireAdmin();
  const parsed = workHoursSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const d = parsed.data;
  await setSetting("work_start", d.work_start);
  await setSetting("work_end", d.work_end);
  await setSetting("work_break_start", d.work_break_start);
  await setSetting("work_break_end", d.work_break_end);
  await setSetting("work_off_days", [...new Set(d.work_off_days)].sort().join(","));
  revalidatePath("/", "layout");
}

// ---------- AI reading: start / stop / interval ----------

/** Starts AI reading: waiting lists are read now, then again on every interval until Stop. */
export async function startAi() {
  await requireAdmin();
  await setSetting("ai_running", "true");
  await setSetting("ai_last_run_at", "");
  void runAiCycle().catch((e) => console.error("[ai] cycle failed", e));
  revalidatePath("/admin", "layout");
}

/** Stops AI reading. A list being read goes back to the queue after its current step, and the model is unloaded. */
export async function stopAi() {
  await requireAdmin();
  await setSetting("ai_running", "false");
  await setSetting("ai_stop_at", new Date().toISOString());
  // cancel the batch that is generating, then free the model
  abortCurrentRead();
  void unloadModel();
  revalidatePath("/admin", "layout");
}

/** One pass over the waiting lists right now, whether or not AI reading is started. */
export async function runAiNow() {
  await requireAdmin();
  void runAiCycle({ manual: true }).catch((e) => console.error("[ai] cycle failed", e));
  revalidatePath("/admin", "layout");
}

export async function setAiInterval(minutes: number) {
  await requireAdmin();
  const m = parseInput(z.coerce.number().int().min(1).max(1440), minutes);
  await setSetting("ai_interval_minutes", String(m));
  revalidatePath("/admin", "layout");
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
  revalidatePath("/admin", "layout");
  revalidatePath(`/procurement/suppliers/${supplierId}`);
}

/** Puts lists back in the queue that are marked "being read" but whose reader died (e.g. the server was restarted mid-read). */
export async function requeueStuckLists() {
  await requireAdmin();
  await db
    .update(schema.priceLists)
    .set({ status: "queued", error: null, progressDone: 0 })
    .where(eq(schema.priceLists.status, "parsing"));
  revalidatePath("/admin", "layout");
  revalidatePath("/procurement/price-lists");
}
