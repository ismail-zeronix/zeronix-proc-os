import { requireApp } from "@/lib/auth/session";
import { PipelineView } from "../deals/pipeline-view";

export const metadata = { title: "Leads · Zeronix CRM" };

/** New and contacted leads, not qualified yet. Qualify moves one to Deals. */
export default async function LeadsPage({ searchParams }: PageProps<"/crm/leads">) {
  await requireApp("crm");
  return <PipelineView mode="leads" searchParams={await searchParams} />;
}
