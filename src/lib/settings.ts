import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_HOURS } from "@/lib/attendance";
import { DEFAULT_MARGIN_PCT, DEFAULT_TERMS, DEFAULT_VALID_DAYS, DEFAULT_VAT_PCT } from "@/lib/quotation";
import { DEFAULT_QUOTE_EMAIL_BODY, DEFAULT_QUOTE_EMAIL_SUBJECT } from "@/lib/quote-email";

export const SETTING_DEFAULTS = {
  llm_model: process.env.LLM_MODEL ?? "qwen3.5:4b",
  stale_days: "14",
  /** AED per 1 USD. The dirham is pegged at 3.6725; change it only if you price on a different rate. */
  fx_usd: "3.6725",
  /** "true" while an admin has started AI reading; pasted lists wait in the queue otherwise. */
  ai_running: "false",
  /** How often (minutes) a running AI checks the queue for waiting lists. */
  ai_interval_minutes: "5",
  /** ISO time of the last queue check; empty = check on the next tick. */
  ai_last_run_at: "",
  /** ISO time an admin pressed Stop; a list being read when this is newer than its start is put back in the queue. */
  ai_stop_at: "",
  /** Quotes: margin added on top of cost when a price is picked, how long a quote stays valid, VAT, terms, and our tax number. */
  quote_margin_pct: String(DEFAULT_MARGIN_PCT),
  quote_valid_days: String(DEFAULT_VALID_DAYS),
  quote_vat_pct: String(DEFAULT_VAT_PCT),
  quote_terms: DEFAULT_TERMS,
  quote_trn: "",
  /** Email that carries a quote (Email button on the quote page); {placeholders} are filled in, see lib/quote-email.ts. */
  quote_email_subject: DEFAULT_QUOTE_EMAIL_SUBJECT,
  quote_email_body: DEFAULT_QUOTE_EMAIL_BODY,
  /** Punch in / out: working window and fixed break (UAE time, HH:MM 24h), and weekly off days (0 = Sunday, comma separated). */
  work_start: DEFAULT_HOURS.start,
  work_end: DEFAULT_HOURS.end,
  work_break_start: DEFAULT_HOURS.breakStart,
  work_break_end: DEFAULT_HOURS.breakEnd,
  work_off_days: DEFAULT_HOURS.offDays,
  /** Tax invoices: prefix + running number, padded to this many digits (INV-00124). Set the next number to continue an older series. */
  invoice_prefix: "INV-",
  invoice_next_number: "1",
  invoice_digits: "5",
  /** Credit terms a new order starts with, in days (0 = cash / on delivery). */
  default_terms_days: "30",
  /** Printed on invoices so customers know where to pay. */
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_iban: "",
  bank_swift: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<string> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.select().from(schema.settings);
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSetting(key: SettingKey, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}
