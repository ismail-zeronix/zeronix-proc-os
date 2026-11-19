import { sendNewsletters } from "@/lib/newsletter/send";

const TICK_MS = 20_000;
const g = globalThis as unknown as { __newsletterTimer?: NodeJS.Timeout; __newsletterBusy?: boolean };

/**
 * Newsletters: each Prospecting mailbox that is switched on, inside its sending hours and under today's limit sends the
 * next queued newsletter email, spread over the day. Cold email and newsletters share each mailbox's daily limit.
 */
async function tick() {
  if (g.__newsletterBusy) return;
  g.__newsletterBusy = true;
  try {
    await sendNewsletters();
  } catch (e) {
    console.error("[newsletter] pass failed", e);
  } finally {
    g.__newsletterBusy = false;
  }
}

export function startNewsletterScheduler() {
  if (g.__newsletterTimer) return;
  g.__newsletterTimer = setInterval(() => void tick(), TICK_MS);
  g.__newsletterTimer.unref?.();
  console.log("[newsletter] sending queued newsletters every 20 seconds");
}
