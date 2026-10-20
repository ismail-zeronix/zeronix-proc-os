import { startAiScheduler } from "./ai";
import { startFeedScheduler } from "./feeds";
import { startMailScheduler } from "./mail";

const g = globalThis as unknown as { __workerStarted?: boolean };

/** Starts the background schedulers in this process: live feeds, mailboxes, and the admin-controlled AI queue. */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  startFeedScheduler();
  startMailScheduler();
  startAiScheduler();
}
