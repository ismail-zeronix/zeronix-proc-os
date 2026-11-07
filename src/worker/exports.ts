import { cleanExportJobs, requeueInterrupted, runExportJob, takeNextExport } from "@/lib/export-jobs";

const TICK_MS = 2000;
const CLEAN_MS = 30 * 60_000;
const g = globalThis as unknown as { __exportTimer?: NodeJS.Timeout; __exportCleanTimer?: NodeJS.Timeout; __exportBusy?: boolean; __exportDown?: boolean };

/** Makes waiting files strictly one at a time: a tick that finds one running does nothing. An outage is logged once. */
async function tick() {
  if (g.__exportBusy) return;
  g.__exportBusy = true;
  try {
    for (let job = await takeNextExport(); job; job = await takeNextExport()) await runExportJob(job);
    if (g.__exportDown) console.log("[exports] queue is back");
    g.__exportDown = false;
  } catch (e) {
    if (!g.__exportDown) console.error("[exports] queue failed", e);
    g.__exportDown = true;
  } finally {
    g.__exportBusy = false;
  }
}

export function startExportScheduler() {
  if (g.__exportTimer) return;
  void requeueInterrupted().catch((e) => console.error("[exports] could not requeue", e));
  g.__exportTimer = setInterval(() => void tick(), TICK_MS);
  g.__exportCleanTimer = setInterval(() => void cleanExportJobs().catch((e) => console.error("[exports] clean-up failed", e)), CLEAN_MS);
}
