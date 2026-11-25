import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { callQueue } from "@/lib/prospecting/work";
import { CallMode } from "../work-ui";

export const metadata = { title: "Call mode · Zeronix Outreach" };

/** Cold calls one prospect at a time: your prospects first, then the unassigned pool, hottest first. */
export default async function CallModePage() {
  const { user } = await requireApp("prospecting");
  const queue = await callQueue(user.id);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar title="Call mode" meta="Call, pick how it went, next. Not called in 14 days, with a phone number." />
      <CallMode queue={queue} />
    </div>
  );
}
