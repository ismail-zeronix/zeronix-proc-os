import { runDueMailboxes } from "@/lib/mail/sync";

const TICK_MS = 60_000;
const g = globalThis as unknown as { __mailTimer?: NodeJS.Timeout; __mailBusy?: boolean };

/** Reads the inboxes of connected users (headers only). Never starts the local AI model. */
async function tick() {
  if (g.__mailBusy) return;
  g.__mailBusy = true;
  try {
    await runDueMailboxes();
  } catch (e) {
    console.error("[mail] check failed", e);
  } finally {
    g.__mailBusy = false;
  }
}

export function startMailScheduler() {
  if (g.__mailTimer) return;
  g.__mailTimer = setInterval(() => void tick(), TICK_MS);
  g.__mailTimer.unref?.();
  setTimeout(() => void tick(), 20_000).unref?.();
  console.log("[mail] scheduler running, checking connected mailboxes every few minutes");
}
