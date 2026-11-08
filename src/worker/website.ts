import { websiteOrg } from "./orgs";
import { siteDbConfigured } from "@/db/site";
import { pruneEvents, rebuildDaily } from "@/lib/website/analytics";
import { dailySearchImport } from "@/lib/website/gsc";
import { runPictureQueue } from "@/lib/website/picture-queue";
import { publishDuePosts } from "@/lib/website/posts";
import { dubaiDay } from "@/lib/website/traffic";

const TICK_MS = 60_000;
const ROLLUP_MS = 15 * 60_000;
const g = globalThis as unknown as { __websiteTimer?: NodeJS.Timeout; __websiteBusy?: boolean; __websiteDown?: boolean; __websiteRollupAt?: number; __websitePrunedOn?: string; __websiteGscOn?: string; __websitePicturesTimer?: NodeJS.Timeout };

/**
 * Public website, on the website's own database: publishes scheduled posts when their time comes, and every 15
 * minutes rolls the tracker's events up for the dashboards (today and yesterday; the last 35 days after a restart).
 * Once a day after 06:00 UAE it imports Google Search Console (the first time, 16 months of history).
 * Without SITE_DATABASE_URL it does nothing, and an outage is logged once, not every minute.
 */
async function tick() {
  if (g.__websiteBusy || !siteDbConfigured()) return;
  g.__websiteBusy = true;
  try {
    const n = await publishDuePosts();
    if (n) console.log(`[website] published ${n} scheduled post(s)`);
    if (!g.__websiteRollupAt || Date.now() - g.__websiteRollupAt >= ROLLUP_MS) {
      const today = dubaiDay();
      const from = dubaiDay(new Date(Date.now() - (g.__websiteRollupAt ? 1 : 34) * 86400_000));
      await rebuildDaily(from, today);
      g.__websiteRollupAt = Date.now();
      if (g.__websitePrunedOn !== today) {
        const gone = await pruneEvents();
        if (gone) console.log(`[website] removed ${gone} tracker events older than 13 months`);
        g.__websitePrunedOn = today;
      }
    }
    const today = dubaiDay();
    if (g.__websiteGscOn !== today && new Date(Date.now() + 4 * 3600_000).getUTCHours() >= 6) {
      g.__websiteGscOn = today; // once a day, even when it fails (the error shows in Website › Settings)
      const rows = await dailySearchImport().catch((e: Error) => {
        console.error("[website] Search Console import failed:", e.message);
        return 0;
      });
      if (rows) console.log(`[website] imported ${rows} Search Console rows`);
    }
    if (g.__websiteDown) console.log("[website] website database is back");
    g.__websiteDown = false;
  } catch (e) {
    if (!g.__websiteDown) console.error("[website] website job failed", e);
    g.__websiteDown = true;
  } finally {
    g.__websiteBusy = false;
  }
}

/** Pictures for imported products (picture-queue.ts), apart from tick() so slow downloads never hold up the rest. */
async function picturesTick() {
  if (!siteDbConfigured() || g.__websiteDown) return;
  try {
    const n = await runPictureQueue();
    if (n) console.log(`[website] pictures saved for ${n} imported product(s)`);
  } catch (e) {
    console.error("[website] picture fetch failed:", (e as Error).message);
  }
}

export function startWebsiteScheduler() {
  if (g.__websiteTimer) return;
  g.__websiteTimer = setInterval(() => void websiteOrg(tick), TICK_MS);
  g.__websiteTimer.unref?.();
  g.__websitePicturesTimer = setInterval(() => void websiteOrg(picturesTick), TICK_MS);
  g.__websitePicturesTimer.unref?.();
  console.log("[website] scheduled posts checked every minute, analytics rolled up every 15 minutes");
}
