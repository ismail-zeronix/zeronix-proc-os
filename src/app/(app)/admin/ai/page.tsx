import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { getLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { AiControl, FeedSchedules } from "../automation-ui";
import { listFeeds, nextLook, queueCounts } from "../data";

export const metadata = { title: "AI & feeds · Admin · Zeronix" };

export default async function AdminAiPage() {
  await requireApp("admin");
  const [settings, queue, feeds] = await Promise.all([getSettings(), queueCounts(), listFeeds()]);
  // only asks Ollama what it has loaded: does not load the model
  const modelLoaded = await getLlm(settings.llm_model).isLoaded();
  const count = (status: string) => queue.find((q) => q.status === status)?.n ?? 0;

  return (
    <div className="grid gap-3">
      <PageToolbar title="AI & feeds" meta="When the local model reads pasted lists, and how often supplier feeds are checked" />
      <AiControl
        ai={{
          running: settings.ai_running === "true",
          intervalMinutes: Number(settings.ai_interval_minutes) || 5,
          lastRunAt: settings.ai_last_run_at || null,
          nextLookAt: nextLook(settings),
          waiting: count("queued"),
          reading: count("parsing"),
          modelLoaded,
          model: settings.llm_model,
        }}
      />
      <FeedSchedules feeds={feeds.map((f) => ({ ...f, lastCheckedAt: f.lastCheckedAt?.toISOString() ?? null }))} />
    </div>
  );
}
