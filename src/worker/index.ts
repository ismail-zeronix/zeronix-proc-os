import { startExportScheduler } from "./exports";
import { startFeedScheduler } from "./feeds";
import { startMailScheduler } from "./mail";
import { startNotifyScheduler } from "./notify";
import { startNewsletterScheduler } from "./newsletter";
import { startOutreachScheduler } from "./outreach";
import { startResearchScheduler } from "./prospecting";
import { startWebsiteScheduler } from "./website";
import { becomeLeader } from "./leader";

const g = globalThis as unknown as { __workerStarted?: boolean };

/** Starts the background schedulers in this process: live feeds, mailboxes, prospect research, prospecting email, scheduled website posts, the notification rules and background downloads. */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  // only one process runs the jobs (worker/leader.ts); the others wait as standby
  await becomeLeader();
  startFeedScheduler();
  startMailScheduler();
  startResearchScheduler();
  startOutreachScheduler();
  startNewsletterScheduler();
  startWebsiteScheduler();
  startNotifyScheduler();
  startExportScheduler();
}
