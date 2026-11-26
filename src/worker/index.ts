import { startBillingScheduler } from "./billing";
import { startExportScheduler } from "./exports";
import { startFeedScheduler } from "./feeds";
import { startMailScheduler } from "./mail";
import { startNotifyScheduler } from "./notify";
import { startNewsletterScheduler } from "./newsletter";
import { startOutreachScheduler } from "./outreach";
import { startResearchScheduler } from "./prospecting";
import { startWebsiteScheduler } from "./website";
import { becomeLeader } from "./leader";
import { zeronixFeatures } from "@/lib/edition";

const g = globalThis as unknown as { __workerStarted?: boolean };

/**
 * Starts the background schedulers in this process: live feeds, mailboxes, prospect research, prospecting email,
 * newsletters, scheduled website posts, the notification rules and background downloads. The first six serve Zeronix's
 * own apps (lib/edition.ts); the SaaS install runs the notification rules, background downloads and billing.
 */
export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  // only one process runs the jobs (worker/leader.ts); the others wait as standby
  await becomeLeader();
  if (zeronixFeatures()) {
    startFeedScheduler();
    startMailScheduler();
    startResearchScheduler();
    startOutreachScheduler();
    startNewsletterScheduler();
    startWebsiteScheduler();
  } else {
    console.log("[worker] SaaS install: Zeronix's own jobs (feeds, mail, research, outreach, newsletters, website) are off");
    // trial and payment dates of the organisations (lib/billing.ts)
    startBillingScheduler();
  }
  startNotifyScheduler();
  startExportScheduler();
}
