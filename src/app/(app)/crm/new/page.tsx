import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { companyVisible, viewerOf } from "@/lib/auth/visibility";
import { projectTypes } from "@/lib/projects-data";
import { salesUsers } from "@/lib/sales-data";
import { DealForm } from "./deal-form";

export const metadata = { title: "New deal · Zeronix CRM" };

export default async function NewDealPage({ searchParams }: PageProps<"/crm/new">) {
  const access = await requireApp("crm");
  const { user, seesAll } = access;
  const sp = await searchParams;
  const companyId = Number(Array.isArray(sp.company) ? sp.company[0] : sp.company);
  const [team, types, preset] = await Promise.all([
    salesUsers(),
    projectTypes(),
    Number.isInteger(companyId) && companyId > 0
      ? db
          .select({ id: schema.companies.id, name: schema.companies.name })
          .from(schema.companies)
          .where(and(eq(schema.companies.id, companyId), companyVisible(viewerOf(access), schema.companies.id)))
      : Promise.resolve([]),
  ]);
  // only admins and "All data" users give deals to other people
  const users = seesAll ? team : team.filter((u) => u.id === user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New deal</h1>
      <div className="rounded-xl border bg-card p-4">
        <DealForm
          users={users}
          meId={user.id}
          preset={preset[0] ?? null}
          projectTypes={types.map((t) => ({ key: t.key, label: t.label }))}
          kind={sp.kind === "project" ? "project" : "product"}
        />
      </div>
    </div>
  );
}
