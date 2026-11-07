import { startAiScheduler } from "./ai";
import { startExportScheduler } from "./exports";
import { startFeedScheduler } from "./feeds";
import { startMailScheduler } from "./mail";
import { startNotifyScheduler } from "./notify";
import { startOutreachScheduler } from "./outreach";
import { startResearchScheduler } from "./prospecting";
import { startWebsiteScheduler } from "./website";

const g = globalThis as unknown as { __workerStarted?: boolean };

/** Starts the background schedulers in this process: live feeds, mailboxes, the admin-controlled AI queue, prospect research, prospecting email, scheduled website posts, the notification rules and background downloads. */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  startFeedScheduler();
  startMailScheduler();
  startAiScheduler();
  startResearchScheduler();
  startOutreachScheduler();
  startWebsiteScheduler();
  startNotifyScheduler();
  startExportScheduler();
}
