import { Search } from "lucide-react";
import Link from "next/link";
import { FileTable, UploadDialog } from "@/components/files-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Input } from "@/components/ui/input";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { FOLDERS, isFolder, type FolderKey } from "@/lib/file-folders";
import { listFiles } from "@/lib/files-data";

export const metadata = { title: "Files · Zeronix" };

/** The company's shared documents: one list, folder chips, search, + to upload. */
export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const access = await requireApp("files");
  const { user } = access;
  const sp = await searchParams;
  const folder = typeof sp.folder === "string" && isFolder(sp.folder) ? sp.folder : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const rows = await listFiles(financeViewerOf(access), { folder, q: q || undefined });
  const href = (f?: string) => {
    const p = new URLSearchParams();
    if (f) p.set("folder", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/files?${s}` : "/files";
  };

  return (
    <div className="grid gap-3">
      <PageToolbar title="Files" meta={`${rows.length}${rows.length === 500 ? "+" : ""} file${rows.length === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`}>
        <form action="/files" className="relative w-64 max-w-full">
          {folder && <input type="hidden" name="folder" value={folder} />}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search names and notes" className="h-8 pl-8" aria-label="Search files" />
        </form>
        <UploadDialog folder={(folder as FolderKey) ?? "other"} />
      </PageToolbar>

      <nav className="flex gap-1.5 overflow-x-auto pb-0.5 text-xs" aria-label="Folders">
        {[{ key: undefined, label: "All files" }, ...FOLDERS].map((f) => {
          const active = folder === f.key;
          return (
            <Link
              key={f.label}
              href={href(f.key)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-2.5 py-1 font-medium ${active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      <div className="overflow-hidden rounded-lg border bg-card">
        <FileTable
          rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          meId={user.id}
          isAdmin={user.role === "admin"}
          showFolder={!folder}
          empty={q || folder ? "No files here." : "No files yet. Upload the first one with +."}
        />
      </div>
    </div>
  );
}
