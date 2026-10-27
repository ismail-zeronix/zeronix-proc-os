import { sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireApp("admin");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.priceLists)
    .where(sql`${schema.priceLists.status} = 'queued'`);
  return (
    <AppShell app="admin" badges={{ queue: n }}>
      {children}
    </AppShell>
  );
}
