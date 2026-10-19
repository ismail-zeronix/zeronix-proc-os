import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const SETTING_DEFAULTS = {
  llm_model: process.env.LLM_MODEL ?? "qwen3.5:4b",
  stale_days: "14",
  /** AED per 1 USD. The dirham is pegged at 3.6725; change it only if you price on a different rate. */
  fx_usd: "3.6725",
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
