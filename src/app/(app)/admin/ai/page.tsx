import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { getPriceListLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { AiControl, FeedSchedules } from "../automation-ui";
import { listFeeds, nextLook, queueCounts } from "../data";

export const metadata = { title: "AI & feeds · Admin · Zeronix" };

export default async function AdminAiPage() {
  await requireApp("admin");
  const [settings, queue, feeds] = await Promise.all([getSettings(), queueCounts(), listFeeds()]);
  // only asks Ollama what it has loaded (never loads it); a hosted service is never "in memory"
  const llm = await getPriceListLlm();
  const modelLoaded = await llm.isLoaded();
  const count = (status: string) => queue.find((q) => q.status === status)?.n ?? 0;

  return (
    <div className="grid gap-3">
      <PageToolbar title="AI & feeds" meta="When AI reads pasted lists, and how often supplier feeds are checked" />
      <AiControl
        ai={{
          running: settings.ai_running === "true",
          intervalMinutes: Number(settings.ai_interval_minutes) || 5,
          lastRunAt: settings.ai_last_run_at || null,
          nextLookAt: nextLook(settings),
          waiting: count("queued"),
          reading: count("parsing"),
          modelLoaded,
          model: llm.model,
          hosted: llm.name !== "ollama",
        }}
      />
      <FeedSchedules feeds={feeds.map((f) => ({ ...f, lastCheckedAt: f.lastCheckedAt?.toISOString() ?? null }))} />
    </div>
  );
}
