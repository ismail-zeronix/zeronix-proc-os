import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { outreachView } from "@/lib/prospecting/access";
import { listReplies, recentlyConverted } from "@/lib/prospecting/work";
import { ReplyList } from "../work-ui";

export const metadata = { title: "Replies · Zeronix Outreach" };

/** Prospects that answered a cold email: make them a lead, call them, or close them. */
export default async function RepliesPage() {
  await requireApp("prospecting");
  const view = await outreachView();
  const scope = view.full ? undefined : view.userId;
  const [rows, converted] = await Promise.all([listReplies(scope), recentlyConverted(scope)]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar title="Replies" meta={rows.length ? `${rows.length} waiting for someone` : "Nothing waiting"} />
      {rows.length ? (
        <ReplyList rows={rows} full={view.full} />
      ) : (
        <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">
          No replies waiting. When someone answers a cold email it shows here, with what they wrote.
        </p>
      )}
      {converted.length > 0 && (
        <section className="grid gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">Recently made leads</h2>
          <ul className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm">
            {converted.map((c) => (
              <li key={c.id} className="flex items-center gap-2 bg-card px-3 py-2">
                <Link href={`/prospecting/prospects/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {c.name}
                </Link>
                {c.dealId && (
                  <Link href={`/crm/deals/${c.dealId}`} className="text-xs text-primary hover:underline">
                    Open the deal
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
