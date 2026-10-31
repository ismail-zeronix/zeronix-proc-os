import { checkAllReplies, fillIndustries, sendDue, writePending } from "@/lib/prospecting/sender";

const TICK_MS = 20_000;
const g = globalThis as unknown as { __outreachTimer?: NodeJS.Timeout; __outreachBusy?: boolean };

/**
 * Prospecting email: AI writes the first emails waiting to be written, inboxes are checked for replies and bounces
 * (before anything is sent, so a follow-up never goes out after a reply), then each mailbox sends what is due.
 */
async function tick() {
  if (g.__outreachBusy) return;
  g.__outreachBusy = true;
  try {
    await writePending(2);
    await checkAllReplies();
    await sendDue();
  } catch (e) {
    console.error("[outreach] pass failed", e);
  } finally {
    g.__outreachBusy = false;
  }
}

export function startOutreachScheduler() {
  if (g.__outreachTimer) return;
  void fillIndustries()
    .then((n) => n && console.log(`[outreach] industry guessed for ${n} prospects`))
    .catch((e) => console.error("[outreach] industry fill failed", e));
  g.__outreachTimer = setInterval(() => void tick(), TICK_MS);
  g.__outreachTimer.unref?.();
  console.log("[outreach] writing, sending and reading replies every 20 seconds");
}
