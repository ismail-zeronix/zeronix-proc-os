import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { salesUsers } from "@/lib/sales-data";
import { EnquiryForm } from "./enquiry-form";

export const metadata = { title: "New enquiry · Zeronix Sales" };

export default async function NewEnquiryPage({ searchParams }: PageProps<"/sales/new">) {
  const { user } = await requireApp("sales");
  const sp = await searchParams;
  const companyId = Number(Array.isArray(sp.company) ? sp.company[0] : sp.company);
  const [users, preset] = await Promise.all([
    salesUsers(),
    Number.isInteger(companyId) && companyId > 0
      ? db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId))
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New enquiry</h1>
      <div className="rounded-xl border bg-card p-4">
        <EnquiryForm users={users} meId={user.id} preset={preset[0] ?? null} />
      </div>
    </div>
  );
}
