import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { activeUsers } from "@/lib/sales-data";
import { EnquiryForm } from "./enquiry-form";

export const metadata = { title: "New enquiry · Zeronix Sales" };

export default async function NewEnquiryPage({ searchParams }: PageProps<"/sales/new">) {
  const { user } = await requireApp("sales");
  const sp = await searchParams;
  const companyId = Number(Array.isArray(sp.company) ? sp.company[0] : sp.company);
  const [users, preset] = await Promise.all([
    activeUsers(),
    Number.isInteger(companyId) && companyId > 0
      ? db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId))
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader
        back={{ href: "/sales", label: "Pipeline" }}
        title="New enquiry"
        description="Takes a minute. It creates the company, the person, the deal and a first follow-up for today."
      />
      <EnquiryForm users={users} meId={user.id} preset={preset[0] ?? null} />
    </div>
  );
}
