import { dubaiToday } from "@/lib/dates";
import { refreshStaleFreeModels } from "@/lib/prospecting/ai-client";
import { processResearch, resumeApplying } from "@/lib/prospecting/research";

const TICK_MS = 5_000;
/** How often to look for OpenRouter free-model lists older than a day. */
const MODELS_CHECK_MS = 30 * 60_000;
const g = globalThis as unknown as { __researchTimer?: NodeJS.Timeout; __researchBusy?: boolean; __modelsCheckedAt?: number };

/**
 * Applies Prospecting research runs the Python scraper has finished, and runs the AI step for the few that need it.
 * The website reading itself happens in the scraper container; this never starts the local AI model.
 */
async function tick() {
  if (g.__researchBusy) return;
  g.__researchBusy = true;
  try {
    // keep going while there is a backlog, a few runs per pass
    while ((await processResearch(5)) === 5);
    if (Date.now() - (g.__modelsCheckedAt ?? 0) > MODELS_CHECK_MS) {
      g.__modelsCheckedAt = Date.now();
      await refreshStaleFreeModels(dubaiToday());
    }
  } catch (e) {
    console.error("[research] pass failed", e);
  } finally {
    g.__researchBusy = false;
  }
}

export function startResearchScheduler() {
  if (g.__researchTimer) return;
  // runs a restart left half-applied go back to be applied
  void resumeApplying().catch((e) => console.error("[research] resume failed", e));
  g.__researchTimer = setInterval(() => void tick(), TICK_MS);
  g.__researchTimer.unref?.();
  console.log("[research] applying prospect research every few seconds");
}
