import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth/session";
import { getLlm } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { AdminSettings, AdminUsers } from "./admin-ui";

export const metadata = { title: "Admin · Zeronix Procurement" };

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

export default async function AdminPage() {
  const me = await getSession();
  if (me?.role !== "admin") redirect("/compare");
  const [users, settings, models] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.name)),
    getSettings(),
    ollamaModels(),
  ]);
  const health = await getLlm(settings.llm_model).health();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Users, AI model and comparison settings.</p>
      </div>
      <AdminSettings settings={settings} models={models} health={health} />
      <AdminUsers users={users} meId={me.id} />
    </div>
  );
}
