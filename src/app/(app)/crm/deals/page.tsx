import { requireApp } from "@/lib/auth/session";
import { PipelineView } from "./pipeline-view";

export const metadata = { title: "Deals · Zeronix CRM" };

/** Qualified leads up to Won / Lost. */
export default async function DealsPage({ searchParams }: PageProps<"/crm/deals">) {
  await requireApp("crm");
  return <PipelineView mode="deals" searchParams={await searchParams} />;
}
