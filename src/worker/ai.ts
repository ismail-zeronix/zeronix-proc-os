import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getLlm } from "@/lib/llm";
import { getSetting, getSettings, setSetting } from "@/lib/settings";
import { runParse, StopRequested } from "./jobs";

const TICK_MS = 20_000;
const g = globalThis as unknown as { __aiTimer?: NodeJS.Timeout; __aiBusy?: boolean };

export interface AiCycleResult {
  ran: boolean;
  processed: number;
  note: string;
}

/** Takes the oldest waiting list. SKIP LOCKED + the status flip mean two processes never read the same list. */
async function claimNext(): Promise<number | null> {
  const res = await db.execute<{ id: number }>(sql`
    UPDATE price_lists SET status = 'parsing'
    WHERE id = (SELECT id FROM price_lists WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  return res.rows[0]?.id ?? null;
}

/** Frees the model's RAM now instead of waiting for Ollama's keep-alive timer. */
export async function unloadModel() {
  try {
    await getLlm(await getSetting("llm_model")).unload();
  } catch {
    /* Ollama not running: nothing to free */
  }
}

/**
 * One pass over the queue. `manual` ("Run now") ignores the Start/Stop switch and the interval; a normal
 * pass only happens while an admin has pressed Start and the interval has passed. Lists are read one at
 * a time, and the model is unloaded again as soon as the queue is empty.
 */
export async function runAiCycle(opts: { manual?: boolean } = {}): Promise<AiCycleResult> {
  if (g.__aiBusy) return { ran: false, processed: 0, note: "The AI is already reading a list." };
  g.__aiBusy = true;
  try {
    const s = await getSettings();
    if (!opts.manual) {
      if (s.ai_running !== "true") return { ran: false, processed: 0, note: "Stopped" };
      const last = Date.parse(s.ai_last_run_at);
      const every = Math.max(1, Number(s.ai_interval_minutes) || 5) * 60_000;
      if (Number.isFinite(last) && Date.now() - last < every) return { ran: false, processed: 0, note: "Not due yet" };
      await setSetting("ai_last_run_at", new Date().toISOString());
    }

    const began = Date.now();
    let processed = 0;
    let stopped = false;
    for (;;) {
      // Stop pressed while this pass was running: leave the rest of the queue alone
      if (Date.parse(await getSetting("ai_stop_at")) > began || (!opts.manual && (await getSetting("ai_running")) !== "true")) {
        stopped = true;
        break;
      }
      const id = await claimNext();
      if (id == null) break;
      console.log(`[ai] reading price list ${id}`);
      try {
        await runParse(id);
        processed++;
      } catch (e) {
        if (e instanceof StopRequested) {
          stopped = true;
          break;
        }
        console.error(`[ai] list ${id} failed:`, (e as Error).message);
      }
    }
    if (processed || opts.manual) await unloadModel();
    return { ran: true, processed, note: stopped ? "Stopped by an admin" : processed ? `Read ${processed} list${processed === 1 ? "" : "s"}` : "Nothing was waiting" };
  } finally {
    g.__aiBusy = false;
  }
}

/** Ticks while the server is up, but does nothing at all unless an admin has pressed Start. */
export function startAiScheduler() {
  if (g.__aiTimer) return;
  g.__aiTimer = setInterval(() => {
    runAiCycle().catch((e) => console.error("[ai] cycle failed", e));
  }, TICK_MS);
  g.__aiTimer.unref?.();
  console.log("[ai] queue control ready (stopped until an admin presses Start)");
}
