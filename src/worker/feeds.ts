import { sql } from "drizzle-orm";
import { db } from "@/db";
import { syncFeed } from "@/lib/feed/sync";

const TICK_MS = 60_000;
const g = globalThis as unknown as { __feedTimer?: NodeJS.Timeout; __feedBusy?: boolean };

/**
 * Syncs every live feed whose interval has passed. A feed is claimed in the same statement that finds
 * it, so two processes (web server + separate worker) never read the same feed twice. This only
 * fetches a small CSV and runs rules: it never starts the local AI model.
 */
export async function runDueFeeds() {
  if (g.__feedBusy) return;
  g.__feedBusy = true;
  try {
    const due = await db.execute<{ supplier_id: number }>(sql`
      UPDATE supplier_feeds f SET last_checked_at = now()
      FROM suppliers s
      WHERE s.id = f.supplier_id AND s.is_active AND f.enabled
        AND (f.last_checked_at IS NULL OR f.last_checked_at <= now() - make_interval(mins => f.interval_minutes))
      RETURNING f.supplier_id`);
    for (const row of due.rows) {
      const res = await syncFeed(row.supplier_id).catch((e: Error) => ({ status: "error", message: e.message }));
      console.log(`[feeds] supplier ${row.supplier_id}: ${res.status} - ${res.message}`);
    }
  } catch (e) {
    console.error("[feeds] check failed", e);
  } finally {
    g.__feedBusy = false;
  }
}

export function startFeedScheduler() {
  if (g.__feedTimer) return;
  g.__feedTimer = setInterval(() => void runDueFeeds(), TICK_MS);
  g.__feedTimer.unref?.();
  setTimeout(() => void runDueFeeds(), 15_000).unref?.();
  console.log("[feeds] scheduler running, checking every minute for due feeds");
}
