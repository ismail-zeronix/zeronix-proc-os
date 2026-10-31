"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { dubaiToday } from "@/lib/dates";
import { isEmail } from "@/lib/mail/compose";
import { AI_USES, aiProvider, isAiProvider, isSearchService } from "@/lib/prospecting/ai";
import { AiUnavailable, openRouterAllowance, refreshFreeModels, webSearch, type ProviderRow } from "@/lib/prospecting/ai-client";
import { testAi, testMailbox, type Check } from "@/lib/prospecting/connect";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { DAYS, HARD_MAX_PER_DAY, isTime } from "@/lib/prospecting/sending";

async function assertAdmin() {
  const me = await assertApp("prospecting");
  if (me.role !== "admin") throw new Problem("Only an admin can change Prospecting settings.");
  return me;
}

function refresh() {
  revalidatePath("/prospecting", "layout");
}

const host = z.string().trim().min(3, "Enter the server name").max(200).regex(/^[a-z0-9.-]+$/i, "A server name has only letters, digits, dots and dashes");
const port = z.number().int().min(1).max(65535);
const cap = (label: string) => z.number().int().min(1, `${label}: at least 1`).max(HARD_MAX_PER_DAY, `${label}: at most ${HARD_MAX_PER_DAY} a day`);

const mailboxSchema = z
  .object({
    email: z.string().trim().toLowerCase().refine(isEmail, "Enter the mailbox's email address"),
    fromName: z.string().trim().min(2, "Enter the name people see").max(80),
    username: z.string().trim().max(254).default(""),
    /** Empty when editing = keep the saved password. */
    password: z.string().max(200).default(""),
    smtpHost: host,
    smtpPort: port,
    imapHost: host,
    imapPort: port,
    startCap: cap("Start limit"),
    dailyCap: cap("Target limit"),
    rampPerWeek: z.number().int().min(0).max(50),
    warmupStartedOn: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date").default(""),
    sendDays: z.array(z.enum(DAYS.map((d) => d.key) as [string, ...string[]])).min(1, "Pick at least one sending day"),
    windowStart: z.string().refine(isTime, "Start time like 09:00"),
    windowEnd: z.string().refine(isTime, "End time like 17:00"),
    signature: z.string().max(1000).default(""),
  })
  .refine((m) => m.startCap <= m.dailyCap, { message: "The start limit cannot be above the target limit" })
  .refine((m) => m.windowStart < m.windowEnd, { message: "The sending window must end after it starts" });
export type MailboxInput = z.input<typeof mailboxSchema>;

/** Adds a sending mailbox or changes one. A changed login has to pass the test again before it sends. */
export async function saveMailbox(mailboxId: number | null, input: MailboxInput): Promise<Result<number>> {
  return attempt(async () => {
    await assertAdmin();
    const d = mailboxSchema.parse(input);
    if (/@zeronix\.ae$/i.test(d.email)) throw new Problem("Use a mailbox on the separate sending domain. Cold email from zeronix.ae puts quotes and invoices at risk of the spam folder.");
    if (d.warmupStartedOn && d.warmupStartedOn > dubaiToday()) throw new Problem("The warm-up start cannot be in the future");
    const { password, ...rest } = d;
    const cols = { ...rest, username: d.username || d.email, warmupStartedOn: d.warmupStartedOn || null };
    const [dup] = await db
      .select({ id: schema.outreachMailboxes.id })
      .from(schema.outreachMailboxes)
      .where(and(eq(schema.outreachMailboxes.email, d.email), mailboxId ? ne(schema.outreachMailboxes.id, mailboxId) : undefined));
    if (dup) throw new Problem(`${d.email} is already added`);
    if (!mailboxId) {
      if (!password) throw new Problem("Enter the mailbox password");
      const [row] = await db
        .insert(schema.outreachMailboxes)
        .values({ ...cols, passwordEnc: encryptSecret(password) })
        .returning({ id: schema.outreachMailboxes.id });
      refresh();
      return row.id;
    }
    const [old] = await db.select().from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.id, mailboxId));
    if (!old) throw new Problem("That mailbox no longer exists");
    const loginChanged = !!password || old.username !== cols.username || old.smtpHost !== d.smtpHost || old.smtpPort !== d.smtpPort || old.imapHost !== d.imapHost || old.imapPort !== d.imapPort;
    await db
      .update(schema.outreachMailboxes)
      .set({
        ...cols,
        ...(password ? { passwordEnc: encryptSecret(password) } : {}),
        // a new login must be tested again before anything is sent from it
        ...(loginChanged ? { lastTestOk: false, enabled: false, lastError: "" } : {}),
      })
      .where(eq(schema.outreachMailboxes.id, mailboxId));
    refresh();
    return mailboxId;
  });
}

export async function deleteMailbox(mailboxId: number): Promise<Result<void>> {
  return attempt(async () => {
    await assertAdmin();
    await db.delete(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.id, mailboxId));
    refresh();
  });
}

/** Logs in to the mailbox's SMTP and IMAP and stores the outcome. Sends nothing. */
export async function checkMailbox(mailboxId: number): Promise<Result<string>> {
  return attempt(async () => {
    await assertAdmin();
    const [m] = await db.select().from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.id, mailboxId));
    if (!m) throw new Problem("That mailbox no longer exists");
    let password: string;
    try {
      password = decryptSecret(m.passwordEnc);
    } catch {
      throw new Problem("The saved password can no longer be read. Edit the mailbox and enter it again.");
    }
    const r = await testMailbox({ username: m.username || m.email, password, smtpHost: m.smtpHost, smtpPort: m.smtpPort, imapHost: m.imapHost, imapPort: m.imapPort });
    await db
      .update(schema.outreachMailboxes)
      .set({ lastTestAt: new Date(), lastTestOk: r.ok, lastError: r.ok ? "" : r.detail, ...(r.ok ? {} : { enabled: false }) })
      .where(eq(schema.outreachMailboxes.id, mailboxId));
    refresh();
    if (!r.ok) throw new Problem(r.detail);
    return r.detail;
  });
}

/** Turns sending on or off for a mailbox. On needs a passed connection test. */
export async function setMailboxEnabled(mailboxId: number, enabled: boolean): Promise<Result<void>> {
  return attempt(async () => {
    await assertAdmin();
    const [m] = await db.select({ ok: schema.outreachMailboxes.lastTestOk, warm: schema.outreachMailboxes.warmupStartedOn }).from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.id, mailboxId));
    if (!m) throw new Problem("That mailbox no longer exists");
    if (enabled && !m.ok) throw new Problem("Test the connection first; it has to pass before this mailbox can send.");
    await db
      .update(schema.outreachMailboxes)
      // switching on starts the warm-up clock if nobody set a date
      .set({ enabled, ...(enabled && !m.warm ? { warmupStartedOn: dubaiToday() } : {}) })
      .where(eq(schema.outreachMailboxes.id, mailboxId));
    refresh();
  });
}

// ---------- AI providers ----------

const aiSchema = z.object({
  label: z.string().trim().min(2, "Enter a name").max(60),
  provider: z.string().refine(isAiProvider, "Pick a provider"),
  model: z.string().trim().max(120).default(""),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "The base URL starts with https://"),
  /** Empty when editing = keep the saved key. */
  apiKey: z.string().trim().max(500).default(""),
  uses: z.array(z.enum(AI_USES.map((u) => u.key) as [string, ...string[]])).default([]),
  enabled: z.boolean().default(true),
  dailyLimit: z.number().int().min(1, "Allow at least 1 call a day").max(500, "At most 500 calls a day").default(20),
  /** OpenRouter: switch between its free models instead of one fixed model. */
  autoFree: z.boolean().default(false),
  /** OpenRouter: allow its paid web search for research. */
  paidSearch: z.boolean().default(false),
});
export type AiProviderInput = z.input<typeof aiSchema>;

export async function saveAiProvider(providerId: number | null, input: AiProviderInput): Promise<Result<number>> {
  return attempt(async () => {
    await assertAdmin();
    const d = aiSchema.parse(input);
    const def = aiProvider(d.provider)!;
    if (d.provider === "openai_compatible" && !d.baseUrl) throw new Problem("Enter the service's base URL");
    if (d.provider !== "openrouter") Object.assign(d, { autoFree: false, paidSearch: false });
    // a search service has no model and only serves research
    if (isSearchService(d.provider)) Object.assign(d, { model: "", uses: ["research"] });
    else if (!d.autoFree && !d.model) throw new Problem("Pick a model, or use the free models");
    const { apiKey, ...rest } = d;
    const key = apiKey ? { apiKeyEnc: encryptSecret(apiKey), keyHint: apiKey.slice(-4) } : {};
    if (!providerId) {
      if (def.needsKey && !apiKey) throw new Problem("Enter the API key");
      // the first provider added becomes the default
      const n = await db.$count(schema.prospectAiProviders);
      const [row] = await db
        .insert(schema.prospectAiProviders)
        .values({ ...rest, ...key, isDefault: n === 0 })
        .returning({ id: schema.prospectAiProviders.id });
      refresh();
      return row.id;
    }
    const [row] = await db
      .update(schema.prospectAiProviders)
      .set({ ...rest, ...key, ...(apiKey ? { lastTestOk: false } : {}) })
      .where(eq(schema.prospectAiProviders.id, providerId))
      .returning({ id: schema.prospectAiProviders.id });
    if (!row) throw new Problem("That provider no longer exists");
    refresh();
    return row.id;
  });
}

export async function deleteAiProvider(providerId: number): Promise<Result<void>> {
  return attempt(async () => {
    await assertAdmin();
    const [gone] = await db.delete(schema.prospectAiProviders).where(eq(schema.prospectAiProviders.id, providerId)).returning({ isDefault: schema.prospectAiProviders.isDefault });
    // keep one default while any provider is left
    if (gone?.isDefault) {
      const [next] = await db.select({ id: schema.prospectAiProviders.id }).from(schema.prospectAiProviders).orderBy(schema.prospectAiProviders.id).limit(1);
      if (next) await db.update(schema.prospectAiProviders).set({ isDefault: true }).where(eq(schema.prospectAiProviders.id, next.id));
    }
    refresh();
  });
}

export async function setDefaultAiProvider(providerId: number): Promise<Result<void>> {
  return attempt(async () => {
    await assertAdmin();
    await db.transaction(async (tx) => {
      await tx.update(schema.prospectAiProviders).set({ isDefault: false }).where(ne(schema.prospectAiProviders.id, providerId));
      await tx.update(schema.prospectAiProviders).set({ isDefault: true }).where(eq(schema.prospectAiProviders.id, providerId));
    });
    refresh();
  });
}

/** Checks the key and the model against the service's model list (no tokens used) and stores the outcome. */
export async function checkAiProvider(providerId: number): Promise<Result<string>> {
  return attempt(async () => {
    await assertAdmin();
    const [p] = await db.select().from(schema.prospectAiProviders).where(eq(schema.prospectAiProviders.id, providerId));
    if (!p) throw new Problem("That provider no longer exists");
    let apiKey = "";
    if (p.apiKeyEnc) {
      try {
        apiKey = decryptSecret(p.apiKeyEnc);
      } catch {
        throw new Problem("The saved key can no longer be read. Edit the provider and enter it again.");
      }
    }
    const r =
      p.provider === "openrouter"
        ? await checkOpenRouter(p, apiKey)
        : isSearchService(p.provider)
          ? await checkSearch(p)
          : await testAi({ provider: p.provider, baseUrl: p.baseUrl, apiKey, model: p.model });
    await db
      .update(schema.prospectAiProviders)
      .set({ lastTestAt: new Date(), lastTestOk: r.ok, lastError: r.ok ? "" : r.detail })
      .where(eq(schema.prospectAiProviders.id, providerId));
    refresh();
    if (!r.ok) throw new Problem(r.detail);
    return r.detail;
  });
}

/** A search service: one small search (uses one search of the allowance). */
async function checkSearch(p: ProviderRow): Promise<Check> {
  try {
    const hits = await webSearch(p, "Dubai Chamber of Commerce contact");
    return { ok: true, detail: `Key works. ${hits.length} results for a test search.` };
  } catch (e) {
    return { ok: false, detail: e instanceof AiUnavailable ? e.message : "Tavily could not be reached." };
  }
}

/** OpenRouter: the key works when its allowance can be read; the free-model list is loaded at the same time. */
async function checkOpenRouter(p: ProviderRow, apiKey: string): Promise<Check> {
  const allowance = await openRouterAllowance(apiKey, p.baseUrl || undefined);
  if (!allowance) return { ok: false, detail: "OpenRouter refused the key, or could not be reached." };
  await db
    .update(schema.prospectAiProviders)
    .set({ usage: { used: allowance.used, limit: allowance.limit, remaining: allowance.remaining, checkedAt: new Date().toISOString() }, outUntil: null })
    .where(eq(schema.prospectAiProviders.id, p.id));
  let models = "";
  if (p.autoFree) models = `${await refreshFreeModels(p, dubaiToday())} free models ready. `;
  else {
    const t = await testAi({ provider: "openai_compatible", baseUrl: p.baseUrl || "https://openrouter.ai/api/v1", apiKey, model: p.model });
    if (!t.ok) return t;
  }
  return { ok: true, detail: `Key works. ${models}Free requests today: ${allowance.used} of ${allowance.limit}.` };
}

/** Reloads an OpenRouter provider's free-model list now (it also reloads by itself every day). */
export async function refreshAiModels(providerId: number): Promise<Result<string>> {
  return attempt(async () => {
    await assertAdmin();
    const [p] = await db.select().from(schema.prospectAiProviders).where(eq(schema.prospectAiProviders.id, providerId));
    if (!p || p.provider !== "openrouter") throw new Problem("Only OpenRouter has a free-model list");
    const n = await refreshFreeModels(p, dubaiToday());
    refresh();
    return `${n} free models`;
  });
}

/** Switches one free model on or off (off = never tried); switching on also ends its rest after errors. */
export async function setAiModelEnabled(modelRowId: number, enabled: boolean): Promise<Result<void>> {
  return attempt(async () => {
    await assertAdmin();
    await db
      .update(schema.prospectAiModels)
      .set({ enabled, ...(enabled ? { cooldownUntil: null, failCount: 0 } : {}) })
      .where(eq(schema.prospectAiModels.id, modelRowId));
    refresh();
  });
}
