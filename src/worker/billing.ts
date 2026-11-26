import { eachOrg } from "./orgs";
import { checkBilling } from "@/lib/billing-job";
import { dubaiToday } from "@/lib/dates";

const TICK_MS = 60 * 60_000;
const g = globalThis as unknown as { __billingTimer?: NodeJS.Timeout };

/**
 * Billing (SaaS install, lib/billing.ts): every hour, for each active organisation, the reminder that is due or the
 * pause after an unpaid date. Each reminder goes once (saved on the organisation), so the hourly check repeats nothing.
 */
async function tick() {
  const today = dubaiToday();
  await eachOrg(async () => {
    const r = await checkBilling(today);
    if (r) console.log(`[billing] ${r}`);
  }, "billing");
}

export function startBillingScheduler() {
  if (g.__billingTimer) return;
  g.__billingTimer = setInterval(() => void tick(), TICK_MS);
  g.__billingTimer.unref?.();
  setTimeout(() => void tick(), 60_000).unref?.();
  console.log("[billing] trial and payment dates checked every hour");
}
