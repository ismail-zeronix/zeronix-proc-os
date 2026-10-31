import { startAiScheduler } from "./ai";
import { startFeedScheduler } from "./feeds";
import { startMailScheduler } from "./mail";
import { startOutreachScheduler } from "./outreach";
import { startResearchScheduler } from "./prospecting";

const g = globalThis as unknown as { __workerStarted?: boolean };

/** Starts the background schedulers in this process: live feeds, mailboxes, the admin-controlled AI queue, prospect research and prospecting email. */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  startFeedScheduler();
  startMailScheduler();
  startAiScheduler();
  startResearchScheduler();
  startOutreachScheduler();
}
