"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { GRANTABLE_APPS } from "@/lib/apps";
import { clearFailures } from "@/lib/auth/lockout";
import { requireAdmin } from "@/lib/auth/session";
import { parseLogoDataUrl } from "@/lib/logo";
import { type BrandStyle, normalizeStyle, safeColor } from "@/lib/signature";
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
  revalidatePath("/admin", "layout");
}

/** `apps: null` = use the role's defaults; an array = exactly these apps. */
export async function updateUser(
  id: number,
  patch: { role?: "admin" | "sales"; isActive?: boolean; password?: string; apps?: string[] | null; dataScope?: "own" | "all" },
) {
  const me = await requireAdmin();
  if (id === me.id && (patch.role === "sales" || patch.isActive === false)) {
    throw new Error("You cannot demote or deactivate yourself.");
  }
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role) set.role = patch.role;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.dataScope) set.dataScope = z.enum(["own", "all"]).parse(patch.dataScope);
  if (patch.apps !== undefined) {
    const valid = new Set<string>(GRANTABLE_APPS.map((a) => a.key));
    set.apps = patch.apps === null ? null : [...new Set(patch.apps)].filter((k) => valid.has(k));
  }
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("Password must be at least 8 characters");
    set.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  const [u] = await db.update(schema.users).set(set).where(eq(schema.users.id, id)).returning({ email: schema.users.email });
  // a new password from the admin also lifts a lock from too many wrong tries
  if (patch.password && u) await clearFailures(u.email);
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
  const d = brandSchema.parse(rest);
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
    .onConflictDoUpdate({ target: schema.brandProfile.id, set });
  revalidatePath("/admin", "layout");
  revalidatePath("/account");
  revalidatePath("/mail", "layout");
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
  revalidatePath("/admin", "layout");
}

const quoteSettingsSchema = z.object({
  quote_margin_pct: z.coerce.number().min(0).max(300),
  quote_valid_days: z.coerce.number().int().min(1).max(180),
  quote_vat_pct: z.coerce.number().min(0).max(30),
  quote_terms: z.string().trim().max(2000),
  /** Kept for older callers; our TRN is now saved from the Documents tab. */
  quote_trn: z.string().trim().max(30).optional(),
  quote_email_subject: z.string().trim().min(1, "Enter an email subject").max(300).optional(),
  quote_email_body: z.string().trim().min(1, "Enter an email message").max(5000).optional(),
});

/** Defaults a new quote starts with. Quotes already made keep their own values. */
export async function saveQuoteSettings(input: z.input<typeof quoteSettingsSchema>) {
  await requireAdmin();
  const d = quoteSettingsSchema.parse(input);
  await setSetting("quote_margin_pct", String(d.quote_margin_pct));
  await setSetting("quote_valid_days", String(d.quote_valid_days));
  await setSetting("quote_vat_pct", String(d.quote_vat_pct));
  await setSetting("quote_terms", d.quote_terms);
  if (d.quote_trn !== undefined) await setSetting("quote_trn", d.quote_trn);
  if (d.quote_email_subject !== undefined) await setSetting("quote_email_subject", d.quote_email_subject);
  if (d.quote_email_body !== undefined) await setSetting("quote_email_body", d.quote_email_body);
  revalidatePath("/admin", "layout");
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
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const d = parsed.data;
  await setSetting("work_start", d.work_start);
  await setSetting("work_end", d.work_end);
  await setSetting("work_break_start", d.work_break_start);
  await setSetting("work_break_end", d.work_break_end);
  await setSetting("work_off_days", [...new Set(d.work_off_days)].sort().join(","));
  revalidatePath("/", "layout");
}

const documentSettingsSchema = z.object({
  quote_trn: z.string().trim().max(30),
  invoice_prefix: z.string().max(12).regex(/^[A-Za-z0-9/_-]*$/, "Use letters, digits, - / or _ in the prefix"),
  invoice_next_number: z.coerce.number().int().min(1, "The next number must be 1 or more").max(99999999),
  invoice_digits: z.coerce.number().int().min(1).max(10),
  default_terms_days: z.coerce.number().int().min(0).max(365),
  bank_name: z.string().trim().max(80),
  bank_account_name: z.string().trim().max(120),
  bank_account_number: z.string().trim().max(40),
  bank_iban: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/s+/g, "").toUpperCase())
    .refine((v) => v === "" || /^AEd{21}$/.test(v) || /^[A-Z]{2}d{2}[A-Z0-9]{10,30}$/.test(v), "That IBAN does not look right (UAE IBANs are AE + 21 digits)"),
  bank_swift: z.string().trim().max(11),
});

/**
 * Our TRN, bank details and the invoice series. The next invoice number can be set to continue the series used before the
 * portal (e.g. Zoho), but never to a number the portal has already issued.
 */
export async function saveDocumentSettings(input: z.input<typeof documentSettingsSchema>) {
  await requireAdmin();
  const parsed = documentSettingsSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const d = parsed.data;
  const { invoiceNumber } = await import("@/lib/invoicing");
  const next = invoiceNumber(d.invoice_prefix, d.invoice_next_number, d.invoice_digits);
  const [used] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, next));
  if (used) throw new Error(`Invoice ${next} already exists. Pick a higher next number.`);
  for (const [k, v] of Object.entries(d)) await setSetting(k as Parameters<typeof setSetting>[0], String(v));
  revalidatePath("/admin", "layout");
  revalidatePath("/accounts", "layout");
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
  const m = z.coerce.number().int().min(1).max(1440).parse(minutes);
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
