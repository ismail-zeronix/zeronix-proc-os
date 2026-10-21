import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { getLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/lib/brand";
import { AdminSettings, AdminUsers, QuoteSettings } from "./admin-ui";
import { BrandCard } from "./brand-ui";
import { AiControl, FeedSchedules } from "./automation-ui";

export const metadata = { title: "Admin · Zeronix" };

async function ollamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const data = (await res.json()) as { models?: { name: string; size: number }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  } catch {
    return [];
  }
}

/** When a started AI looks at the queue next (ISO), or null when stopped or already due. */
function nextLook(s: { ai_running: string; ai_last_run_at: string; ai_interval_minutes: string }): string | null {
  const last = Date.parse(s.ai_last_run_at);
  const at = last + (Number(s.ai_interval_minutes) || 5) * 60_000;
  return s.ai_running === "true" && Number.isFinite(last) && at > Date.now() ? new Date(at).toISOString() : null;
}

export default async function AdminPage() {
  const me = (await requireApp("admin")).user;
  const [users, settings, models, queue, feeds] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        isActive: schema.users.isActive,
        apps: schema.users.apps,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.name)),
    getSettings(),
    ollamaModels(),
    db
      .select({ status: schema.priceLists.status, n: sql<number>`count(*)::int` })
      .from(schema.priceLists)
      .where(sql`${schema.priceLists.status} IN ('queued', 'parsing')`)
      .groupBy(schema.priceLists.status),
    db
      .select({
        supplierId: schema.supplierFeeds.supplierId,
        supplier: schema.suppliers.name,
        intervalMinutes: schema.supplierFeeds.intervalMinutes,
        enabled: schema.supplierFeeds.enabled,
        lastCheckedAt: schema.supplierFeeds.lastCheckedAt,
        lastStatus: schema.supplierFeeds.lastStatus,
        lastMessage: schema.supplierFeeds.lastMessage,
      })
      .from(schema.supplierFeeds)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierFeeds.supplierId))
      .orderBy(asc(schema.suppliers.name)),
  ]);
  const { version, ...brand } = await getBrand();
  const llm = getLlm(settings.llm_model);
  // both only ask Ollama what it has: neither loads the model
  const [health, modelLoaded] = await Promise.all([llm.health(), llm.isLoaded()]);
  const nextLookAt = nextLook(settings);
  const count = (status: string) => queue.find((q) => q.status === status)?.n ?? 0;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">AI control, live feeds, users and comparison settings.</p>
      </div>
      <AiControl
        ai={{
          running: settings.ai_running === "true",
          intervalMinutes: Number(settings.ai_interval_minutes) || 5,
          lastRunAt: settings.ai_last_run_at || null,
          nextLookAt,
          waiting: count("queued"),
          reading: count("parsing"),
          modelLoaded,
          model: settings.llm_model,
        }}
      />
      <FeedSchedules feeds={feeds.map((f) => ({ ...f, lastCheckedAt: f.lastCheckedAt?.toISOString() ?? null }))} />
      <AdminSettings settings={settings} models={models} health={health} />
      <QuoteSettings settings={settings} />
      <BrandCard brand={brand} version={version} sample={{ name: me.name, email: me.email }} />
      <AdminUsers users={users} meId={me.id} />
    </div>
  );
}
