"use client";

import { Download, File, FileImage, FileSpreadsheet, FileText, Link2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteFile, updateFile } from "@/app/(app)/files/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { ALLOWED_TYPES, extOf, FOLDERS, folderLabel, MAX_FILE_BYTES, sizeLabel, type FolderKey, type RelatedType } from "@/lib/file-folders";

const ACCEPT = Object.keys(ALLOWED_TYPES)
  .map((e) => `.${e}`)
  .join(",");

function FileIcon({ name }: { name: string }) {
  const e = extOf(name);
  const Icon = ["png", "jpg", "jpeg", "webp", "gif"].includes(e) ? FileImage : ["xls", "xlsx", "csv"].includes(e) ? FileSpreadsheet : ["pdf", "doc", "docx", "txt"].includes(e) ? FileText : File;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

/**
 * Upload one or more files. `related` links them to a company, deal, order or invoice (they show there and in Files).
 * Drop files on the box or pick them.
 */
export function UploadDialog({
  folder = "other",
  related,
  relatedLabel,
  trigger,
}: {
  folder?: FolderKey;
  related?: { type: RelatedType; id: number };
  relatedLabel?: string;
  trigger?: React.ReactElement;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<File[]>([]);
  const [dest, setDest] = useState<FolderKey>(folder);
  const [notes, setNotes] = useState("");
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...picked];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) toast.error(`${f.name} is over ${sizeLabel(MAX_FILE_BYTES)}.`);
      else if (!ALLOWED_TYPES[extOf(f.name)]) toast.error(`${f.name}: this file type is not kept.`);
      else next.push(f);
    }
    setPicked(next.slice(0, 20));
  };

  const upload = () =>
    start(async () => {
      const body = new FormData();
      picked.forEach((f) => body.append("file", f));
      body.set("folder", dest);
      body.set("notes", notes);
      if (related) {
        body.set("relatedType", related.type);
        body.set("relatedId", String(related.id));
      }
      const res = await fetch("/api/files", { method: "POST", body });
      const out = (await res.json().catch(() => ({}))) as { error?: string; files?: unknown[] };
      if (!res.ok) {
        toast.error(out.error ?? "Upload failed. Try again.");
        return;
      }
      toast.success(`${picked.length} file${picked.length === 1 ? "" : "s"} uploaded`);
      setPicked([]);
      setNotes("");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="icon-sm" aria-label="Upload files" title="Upload files">
              <Plus />
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            {relatedLabel ? `They will show on ${relatedLabel} and in Files. ` : ""}Up to 20 files, {sizeLabel(MAX_FILE_BYTES)} each.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
          className={`grid place-items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center text-sm ${over ? "border-primary bg-primary/5" : ""}`}
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Drop files here, or</span>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} />
        </div>
        {picked.length > 0 && (
          <ul className="grid max-h-36 gap-1 overflow-y-auto text-sm">
            {picked.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <FileIcon name={f.name} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{sizeLabel(f.size)}</span>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${f.name}`} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="up-folder">Folder</Label>
            <NativeSelect id="up-folder" value={dest} onChange={(e) => setDest(e.target.value as FolderKey)}>
              {FOLDERS.map((f) => (
                <NativeSelectOption key={f.key} value={f.key}>
                  {f.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="up-notes">Note</Label>
            <Input id="up-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={!picked.length} onClick={upload}>
            <Upload /> Upload {picked.length ? picked.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface FileItem {
  id: number;
  name: string;
  size: number;
  folder: string;
  notes: string;
  related: { label: string; href: string } | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
}

/** Dense list of files: open, download, rename/move, delete (uploader or admin). */
export function FileTable({ rows, meId, isAdmin, showFolder = true, empty }: { rows: FileItem[]; meId: number; isAdmin: boolean; showFolder?: boolean; empty?: string }) {
  if (!rows.length) return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{empty ?? "No files yet. Upload with +."}</p>;
  return (
    <ul className="divide-y">
      {rows.map((f) => (
        <FileLine key={f.id} f={f} canDelete={f.uploadedBy === meId || isAdmin} showFolder={showFolder} />
      ))}
    </ul>
  );
}

function FileLine({ f, canDelete, showFolder }: { f: FileItem; canDelete: boolean; showFolder: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  const when = new Date(f.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
  return (
    <li className={`group flex min-w-0 items-center gap-3 px-3 py-1.5 hover:bg-muted/50 ${pending ? "opacity-60" : ""}`}>
      <FileIcon name={f.name} />
      <div className="grid min-w-0 flex-1 leading-tight">
        <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="truncate text-sm font-medium hover:underline" title={f.name}>
          {f.name}
        </a>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {showFolder && <span>{folderLabel(f.folder)}</span>}
          {f.related && (
            <Link href={f.related.href} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">{f.related.label}</span>
            </Link>
          )}
          {f.notes && (
            <span className="truncate" title={f.notes}>
              {f.notes}
            </span>
          )}
        </span>
      </div>
      <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{sizeLabel(f.size)}</span>
      <span className="hidden w-24 text-right text-xs text-muted-foreground md:inline">{when}</span>
      {f.uploaderName && <UserAvatar name={f.uploaderName} size={22} />}
      <div className="flex shrink-0 gap-0.5 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<a href={`/api/files/${f.id}?download=1`} />} aria-label={`Download ${f.name}`} title="Download">
          <Download />
        </Button>
        <EditFile f={f} onSave={(d) => run(() => updateFile(f.id, d), "Saved")} />
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${f.name}`}
            title="Delete"
            pending={pending}
            onClick={() => confirm(`Delete "${f.name}"? This cannot be undone.`) && run(() => deleteFile(f.id), "File deleted")}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}

function EditFile({ f, onSave }: { f: FileItem; onSave: (d: { name: string; folder: string; notes: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ name: f.name, folder: f.folder, notes: f.notes });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Rename or move ${f.name}`} title="Rename or move" />}>
        <Pencil />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="grid gap-1.5">
          <Label htmlFor={`fn-${f.id}`}>Name</Label>
          <Input id={`fn-${f.id}`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ff-${f.id}`}>Folder</Label>
          <NativeSelect id={`ff-${f.id}`} value={d.folder} onChange={(e) => setD({ ...d, folder: e.target.value })}>
            {FOLDERS.map((x) => (
              <NativeSelectOption key={x.key} value={x.key}>
                {x.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fo-${f.id}`}>Note</Label>
          <Input id={`fo-${f.id}`} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </div>
        <Button
          size="sm"
          disabled={!d.name.trim()}
          onClick={() => {
            onSave(d);
            setOpen(false);
          }}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
