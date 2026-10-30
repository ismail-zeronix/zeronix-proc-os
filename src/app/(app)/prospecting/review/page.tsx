import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Empty } from "@/components/stat-tile";
import { requireApp } from "@/lib/auth/session";
import { reviewQueue } from "@/lib/prospecting/outreach";
import { ReviewQueue } from "./review-ui";

export const metadata = { title: "Review · Zeronix Prospecting" };

export default async function ReviewPage({ searchParams }: PageProps<"/prospecting/review">) {
  await requireApp("prospecting");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const { rows, total } = await reviewQueue(page, PAGE_SIZE);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Review" meta={`${total} first email${total === 1 ? "" : "s"} waiting · J / K to move, A to approve, S to skip`} />
      {rows.length ? (
        <ReviewQueue
          key={rows.map((r) => r.id).join()}
          drafts={rows.map((r) => ({
            id: r.id,
            subject: r.subject,
            body: r.body,
            campaignName: r.campaignName,
            companyId: r.companyId,
            companyName: r.companyName,
            personName: r.personName,
            personTitle: r.personTitle,
            personEmail: r.personEmail,
            emailStatus: r.emailStatus,
          }))}
        />
      ) : (
        <div className="rounded-xl border bg-card p-3">
          <Empty>Nothing to review. Add prospects to a campaign from the Prospects list; their first emails show up here.</Empty>
        </div>
      )}
      <Pager path="/prospecting/review" params={sp} page={page} total={total} />
    </div>
  );
}
