"use client";

import { FileUp, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_FIELDS, rowToProspect, type ImportField, type ImportMapping } from "@/lib/prospecting/import";
import { commitImport, type ImportResult } from "../actions";

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
  total: number;
  truncated: boolean;
  mapping: ImportMapping;
}

/** Rows sent per server call, so a long list stays under the request size limit and shows progress. */
const CHUNK = 200;

export function ImportFlow({ segments, sources }: { segments: { key: string; label: string }[]; sources: { key: string; name: string }[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [file, setFile] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ImportMapping>({});
  const [segment, setSegment] = useState("");
  const [source, setSource] = useState("file_import");
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function read(f: File) {
    setReading(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", f);
      const res = await fetch("/api/prospecting/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the file");
      setFile(data);
      setMap(data.mapping);
      setLabel(f.name.replace(/\.(csv|xlsx|txt)$/i, ""));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!file) return;
    // only the mapped columns go to the server, in the order of IMPORT_FIELDS
    const used = IMPORT_FIELDS.map((f) => f.key).filter((k) => (map[k] ?? -1) >= 0);
    const slim = file.rows.map((r) => used.map((k) => r[map[k]!] ?? ""));
    const slimMap = Object.fromEntries(used.map((k, i) => [k, i])) as ImportMapping;
    const total: ImportResult = { added: 0, duplicates: 0, skipped: 0 };
    setProgress({ done: 0, total: slim.length });
    try {
      for (let i = 0; i < slim.length; i += CHUNK) {
        const res = await commitImport({ rows: slim.slice(i, i + CHUNK), mapping: slimMap, segmentKey: segment, sourceKey: source, label });
        if (res.error !== undefined) throw new Error(res.error);
        const r = res.value;
        total.added += r.added;
        total.duplicates += r.duplicates;
        total.skipped += r.skipped;
        setProgress({ done: Math.min(slim.length, i + CHUNK), total: slim.length });
      }
      setResult(total);
      setFile(null);
      toast.success(`${total.added} prospect${total.added === 1 ? "" : "s"} added`);
    } catch (e) {
      // what was saved before the error stays saved; say so
      setResult(total);
      toast.error(`${(e as Error).message}${total.added ? ` (${total.added} were added before this)` : ""}`);
    } finally {
      setProgress(null);
    }
  }

  const preview = file ? file.rows.slice(0, 8).map((r) => rowToProspect(r, map)) : [];
  const valid = file ? file.rows.filter((r) => rowToProspect(r, map)).length : 0;

  return (
    <div className="grid gap-3">
      {result && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          Added {result.added}. Already in the list {result.duplicates}. Skipped without a company name {result.skipped}.{" "}
          <Link href="/prospecting/prospects?status=sourced" className="font-medium underline">
            Open the new prospects
          </Link>
        </div>
      )}

      {!file ? (
        <section className="grid gap-3 rounded-xl border bg-card p-4">
          <div className="text-sm">
            Upload a CSV or Excel list: an exhibitor list, a chamber or free-zone directory export, a register download. The first row must be the column names. Up to 2,000 rows per file.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept=".csv,.xlsx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
            <Button pending={reading} onClick={() => input.current?.click()}>
              <FileUp /> Choose file
            </Button>
            <span className="text-xs text-muted-foreground">Public business details only. Lists bought from data sellers must say the contacts agreed to be contacted.</span>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{file.fileName}</span>
              <span className="text-muted-foreground">
                {file.total} rows{file.truncated ? " (only the first 2,000 are read; split the file for the rest)" : ""} · {valid} with a company name
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFile(null)}>
                <RotateCcw /> Another file
              </Button>
            </div>
            <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label htmlFor={`map-${f.key}`} className="text-xs">
                    {f.label}
                    {f.key === "name" && " *"}
                  </Label>
                  <NativeSelect
                    size="sm"
                    className="w-full"
                    id={`map-${f.key}`}
                    value={String(map[f.key as ImportField] ?? -1)}
                    onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}
                  >
                    <NativeSelectOption value="-1">Not in the file</NativeSelectOption>
                    {file.headers.map((h, i) => (
                      <NativeSelectOption key={i} value={String(i)}>
                        {h}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="imp-seg" className="text-xs">
                  Segment for every row
                </Label>
                <NativeSelect size="sm" className="w-full" id="imp-seg" value={segment} onChange={(e) => setSegment(e.target.value)}>
                  <NativeSelectOption value="">Set later</NativeSelectOption>
                  {segments.map((s) => (
                    <NativeSelectOption key={s.key} value={s.key}>
                      {s.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="imp-src" className="text-xs">
                  Source
                </Label>
                <NativeSelect size="sm" className="w-full" id="imp-src" value={source} onChange={(e) => setSource(e.target.value)}>
                  {sources.map((s) => (
                    <NativeSelectOption key={s.key} value={s.key}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="imp-label" className="text-xs">
                  Name of this list
                </Label>
                <Input id="imp-label" className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="GITEX 2026 exhibitors" />
              </div>
            </div>
          </section>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Company</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>Licence date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((p, i) => (
                  <TableRow key={i} className={p ? "" : "text-muted-foreground"}>
                    <TableCell className="max-w-56 truncate py-1.5">{p?.name ?? "No company name: skipped"}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p?.domain || "-"}</TableCell>
                    <TableCell className="max-w-44 truncate py-1.5 text-xs">{p ? [p.personName, p.personTitle].filter(Boolean).join(", ") || "-" : ""}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p?.email || "-"}</TableCell>
                    <TableCell className="max-w-40 truncate py-1.5 text-xs">{p ? [p.emirate, p.freeZone].filter(Boolean).join(" · ") || "-" : ""}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p?.licenseDate || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} pending={!!progress} disabled={(map.name ?? -1) < 0 || !valid}>
              Add {valid} prospect{valid === 1 ? "" : "s"}
            </Button>
            {progress && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {progress.done} of {progress.total}…
              </span>
            )}
            <span className="text-xs text-muted-foreground">Companies already in the list (same website or name) are not added twice.</span>
          </div>
        </>
      )}
    </div>
  );
}
