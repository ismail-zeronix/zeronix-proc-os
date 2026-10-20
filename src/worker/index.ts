import { startAiScheduler } from "./ai";
import { startFeedScheduler } from "./feeds";

const g = globalThis as unknown as { __workerStarted?: boolean };

/** Starts the background schedulers in this process: live feeds, and the admin-controlled AI queue. */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  startFeedScheduler();
  startAiScheduler();
}
