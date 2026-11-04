import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listPosts, postCounts } from "@/lib/website/posts";
import { cn } from "@/lib/utils";
import { PostBulkActions } from "../bulk-actions";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "../status-badge";
import { ContentUpload, NewPostButton } from "./content-upload";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Content · Zeronix Website" };

const TABS = [
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
] as const;

const TYPE_LABEL: Record<string, string> = { guide: "Guide", comparison: "Comparison", article: "Blog post", industry_page: "Industry page", page: "Company page", service: "IT service" };

export default async function ContentPage({ searchParams }: PageProps<"/website/content">) {
  await requireApp("website");
  const sp = await searchParams;
  const tab = String(sp.tab ?? "draft");
  const status = TABS.some((t) => t.key === tab) ? tab : "draft";
  const page = pageParam(sp.page);
  const [{ rows, total }, counts] = await Promise.all([listPosts(status, page, PAGE_SIZE), postCounts()]);

  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Content</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/website/content?tab=${t.key}`}
              className={cn("rounded-md px-2.5 py-1 text-sm", status === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {t.label} <span className="tabular-nums opacity-70">{counts[t.key] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">Upload a .md, or a .zip with the .md and its pictures</span>
        <ContentUpload />
        <NewPostButton />
      </div>
      <DataTable
        noun="post"
        total={total}
        empty="Nothing here. Upload a post from your claude-seo research to start."
        actions={<PostBulkActions />}
        pager={<Pager path="/website/content" params={sp} page={page} total={total} showSingle />}
        columns={[{ label: "Title", className: "max-w-md" }, { label: "Type" }, { label: "Author" }, { label: "Checklist" }, { label: "Status" }, { label: status === "scheduled" ? "Goes live" : status === "published" ? "Published" : "Updated" }]}
        rows={rows.map((r) => {
          const fail = r.checks.filter((c) => c.level === "fail").length;
          const warn = r.checks.filter((c) => c.level === "warn").length;
          return {
            id: r.id,
            cells: [
              <Link key="t" href={`/website/content/${r.id}`} className="line-clamp-1 font-medium hover:underline">
                {r.title}
              </Link>,
              TYPE_LABEL[r.type],
              r.author ?? "—",
              <span key="c" className="inline-flex items-center gap-2 text-xs">
                {fail > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <CircleAlert className="size-3.5" /> {fail}
                  </span>
                )}
                {warn > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <TriangleAlert className="size-3.5" /> {warn}
                  </span>
                )}
                {!fail && !warn && <CircleCheck className="size-4 text-emerald-600" aria-label="All checks pass" />}
              </span>,
              <StatusBadge key="s" status={r.status} />,
              <span key="d" className="text-muted-foreground">
                {status === "scheduled" && r.publishAt ? r.publishAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : ago(status === "published" && r.publishedAt ? r.publishedAt : r.updatedAt)}
              </span>,
            ],
          };
        })}
      />
    </div>
  );
}
