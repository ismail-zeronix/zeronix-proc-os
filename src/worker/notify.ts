import { eachOrg } from "./orgs";
import { isOffDay } from "@/lib/attendance";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { sendDigests } from "@/lib/notifications/digest";
import { runScan } from "@/lib/notifications/scan";
import { dayAt } from "@/lib/notifications/work-time";
import { getSetting, setSetting } from "@/lib/settings";

const TICK_MS = 5 * 60_000;
const g = globalThis as unknown as { __notifyTimer?: NodeJS.Timeout; __notifyDown?: boolean };

/**
 * Checks the notification rules (lib/notifications/scan.ts), then once a working day, from the start of work, sends the
 * morning digests (digest.ts). The day sent is saved, so a restart never sends them twice. An outage is logged once.
 */
async function tick() {
  try {
    const { added, resolved } = await runScan();
    if (added || resolved) console.log(`[notify] ${added} alert(s) sent, ${resolved} resolved`);

    const today = dubaiToday();
    const h = await workHours();
    const start = dayAt(today, h.start).getTime();
    // only in the first 3 hours of the day: a server started in the afternoon does not send a "morning" email
    if (!isOffDay(today, h) && Date.now() >= start && Date.now() < start + 3 * 3600_000 && (await getSetting("notify_digest_day")) !== today) {
      await setSetting("notify_digest_day", today); // first, so a failing mail server is not retried every 5 minutes
      const { emails, summaries } = await sendDigests(today);
      console.log(`[notify] morning digests: ${emails} email(s), ${summaries} admin summary line(s)`);
    }
    if (g.__notifyDown) console.log("[notify] rule check is back");
    g.__notifyDown = false;
  } catch (e) {
    if (!g.__notifyDown) console.error("[notify] rule check failed", e);
    g.__notifyDown = true;
  }
}

export function startNotifyScheduler() {
  if (g.__notifyTimer) return;
  g.__notifyTimer = setInterval(() => void eachOrg(tick, "notify"), TICK_MS);
  g.__notifyTimer.unref?.();
  // first check shortly after start, once the server is up
  setTimeout(() => void eachOrg(tick, "notify"), 30_000).unref?.();
  console.log("[notify] alert rules checked every 5 minutes, digests each working morning");
}
