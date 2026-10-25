import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { requireApp } from "@/lib/auth/session";
import { recentErrors } from "@/lib/error-log";
import { ago } from "@/lib/format";

export const metadata = { title: "Errors · Admin · Zeronix" };

const KIND: Record<string, string> = { render: "Page", route: "API", action: "Button / form", proxy: "Sign-in gate" };

/**
 * The last server errors, newest first: which page, for whom, and the message. "Crashes" leaves out server-action
 * messages, which are mostly the plain-sentence refusals people also see on screen ("Enter the company name").
 */
export default async function AdminErrorsPage({ searchParams }: PageProps<"/admin/errors">) {
  await requireApp("admin");
  const all = (await searchParams).view === "all";
  const rows = (await recentErrors(300)).filter((e) => all || e.routeType !== "action").slice(0, 100);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Errors" meta="What failed on the server, newest first (kept 60 days)">
        <Segmented
          items={[
            { href: "/admin/errors", label: "Crashes", title: "Pages and APIs that failed", active: !all },
            { href: "/admin/errors?view=all", label: "Everything", title: "Also refusals shown to people after pressing a button", active: all },
          ]}
        />
      </PageToolbar>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((e) => (
          <li key={e.id} className="px-3 py-2">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground" title={e.at.toISOString()}>
                  {ago(e.at)}
                </span>
                <span className="rounded-sm border px-1 text-[10px] font-medium text-muted-foreground">{KIND[e.routeType] ?? (e.routeType || "?")}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{e.message || "(no message)"}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {e.method} {e.path}
                </span>
                <span className="text-xs text-muted-foreground">{e.userName ?? "-"}</span>
              </summary>
              <div className="mt-2 grid gap-1 text-xs">
                <div className="text-muted-foreground">
                  Route {e.routePath || "-"}
                  {e.digest ? ` · digest ${e.digest}` : ""}
                </div>
                {e.stack && <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">{e.stack}</pre>}
              </div>
            </details>
          </li>
        ))}
        {!rows.length && (
          <li>
            <Empty>No errors. Good.</Empty>
          </li>
        )}
      </ul>
    </div>
  );
}
