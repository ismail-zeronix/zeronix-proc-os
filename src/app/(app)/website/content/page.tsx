import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listPosts, postCounts } from "@/lib/website/posts";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../status-badge";
import { ContentUpload, NewPostButton } from "./content-upload";

export const metadata = { title: "Content · Zeronix Website" };

const TABS = [
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
] as const;

const TYPE_LABEL: Record<string, string> = { guide: "Guide", comparison: "Comparison", article: "Blog post", industry_page: "Industry page", page: "Company page" };

export default async function ContentPage({ searchParams }: PageProps<"/website/content">) {
  await requireApp("website");
  const tab = String((await searchParams).tab ?? "draft");
  const status = TABS.some((t) => t.key === tab) ? tab : "draft";
  const [rows, counts] = await Promise.all([listPosts(status), postCounts()]);

  return (
    <div className="grid gap-3">
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
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{status === "scheduled" ? "Goes live" : status === "published" ? "Published" : "Updated"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nothing here. Upload a post from your claude-seo research to start.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const fail = r.checks.filter((c) => c.level === "fail").length;
              const warn = r.checks.filter((c) => c.level === "warn").length;
              return (
                <TableRow key={r.id}>
                  <TableCell className="max-w-md font-medium">
                    <Link href={`/website/content/${r.id}`} className="line-clamp-1 hover:underline">
                      {r.title}
                    </Link>
                  </TableCell>
                  <TableCell>{TYPE_LABEL[r.type]}</TableCell>
                  <TableCell>{r.author ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-xs">
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
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {status === "scheduled" && r.publishAt ? r.publishAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : ago(status === "published" && r.publishedAt ? r.publishedAt : r.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
