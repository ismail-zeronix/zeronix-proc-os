"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { RULES } from "@/lib/notifications/rules";
import { runScan } from "@/lib/notifications/scan";
import { setSetting } from "@/lib/settings";

const amount = z.number().min(0).max(1000);
const configSchema = z.object({ enabled: z.boolean(), limit: amount, warn: amount, escalate: amount });

/** Saves every rule's on/off and limits. Unknown rules are dropped. */
export async function saveNotifyRules(input: Record<string, z.input<typeof configSchema>>) {
  await requireAdmin();
  const clean: Record<string, z.output<typeof configSchema>> = {};
  for (const r of RULES) if (input[r.key]) clean[r.key] = configSchema.parse(input[r.key]);
  await setSetting("notify_rules", JSON.stringify(clean));
  revalidatePath("/admin/settings");
}

/** Picks the connected mailbox that sends the morning digests (0 = none). */
export async function setDigestSender(mailAccountId: number) {
  await requireAdmin();
  const id = z.number().int().min(0).parse(mailAccountId);
  if (id) {
    const [acc] = await db.select({ id: schema.mailAccounts.id }).from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id));
    if (!acc) throw new Error("That mailbox is no longer connected.");
  }
  await setSetting("notify_digest_from", id ? String(id) : "");
  revalidatePath("/admin/settings");
}

/** Runs the rule check now instead of waiting for the next 5-minute round. */
export async function runNotifyCheck() {
  await requireAdmin();
  return runScan();
}
