import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { FeedSchedules } from "../automation-ui";
import { listFeeds } from "../data";

export const metadata = { title: "Supplier feeds · Admin · Zeronix" };

/** How often each supplier's published stock sheet is re-read (WhatsApp stock comes in through Claude instead). */
export default async function AdminFeedsPage() {
  await requireApp("admin");
  const feeds = await listFeeds();
  return (
    <div className="grid gap-3">
      <PageToolbar title="Supplier feeds" meta="How often supplier stock sheets are checked" />
      <FeedSchedules feeds={feeds.map((f) => ({ ...f, lastCheckedAt: f.lastCheckedAt?.toISOString() ?? null }))} />
    </div>
  );
}
