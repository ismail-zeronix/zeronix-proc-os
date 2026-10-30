"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { STATUSES, statusLabel } from "@/lib/prospecting/constants";
import type { ProspectRow } from "@/lib/prospecting/data";
import { OwnerControl, StatusControl, type SegmentOption } from "../prospect-ui";
import { AddToCampaign } from "../campaigns/campaign-ui";
import { ResearchButton } from "../research-ui";

const STATUS_TONE: Record<string, string> = {
  ready: "text-emerald-700 dark:text-emerald-400",
  replied: "font-medium text-amber-700 dark:text-amber-400",
  converted: "text-emerald-700 dark:text-emerald-400",
  disqualified: "text-muted-foreground line-through",
  not_now: "text-muted-foreground",
};

/** Score as a small bar plus the number, so the best prospects stand out while scanning. */
function ScoreCell({ score }: { score: number }) {
  return (
    <div className="flex items-center justify-end gap-1.5" title="Fit 40% · signal 40% · reach 20%">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.min(100, score * 10)}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}

export function ProspectTable({ rows, segments, users, campaigns }: { rows: ProspectRow[]; segments: SegmentOption[]; users: { id: number; name: string }[]; campaigns: { id: number; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const ids = [...picked].filter((i) => rows.some((r) => r.id === i));
  const all = rows.length > 0 && ids.length === rows.length;

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.replace(`${path}${p.size ? `?${p}` : ""}`);
  };
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect size="sm" aria-label="Status" value={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)}>
          <NativeSelectOption value="">Every status</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s.key} value={s.key}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect size="sm" aria-label="Segment" value={sp.get("segment") ?? ""} onChange={(e) => setParam("segment", e.target.value)}>
          <NativeSelectOption value="">Every segment</NativeSelectOption>
          {segments.map((s) => (
            <NativeSelectOption key={s.key} value={s.key}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect size="sm" aria-label="Owner" value={sp.get("owner") ?? ""} onChange={(e) => setParam("owner", e.target.value)}>
          <NativeSelectOption value="">Everyone</NativeSelectOption>
          {users.map((u) => (
            <NativeSelectOption key={u.id} value={String(u.id)}>
              {u.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <form
          className="relative w-56 max-w-full"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="Name, domain, activity" className="h-8 pl-8" aria-label="Search prospects" />
        </form>
        {ids.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1">
            <span className="text-xs font-medium">{ids.length} selected</span>
            <ResearchButton ids={ids} onDone={() => setPicked(new Set())} />
            <AddToCampaign ids={ids} campaigns={campaigns} onDone={() => setPicked(new Set())} />
            <StatusControl ids={ids} placeholder="Move to" onDone={() => setPicked(new Set())} />
            <OwnerControl ids={ids} users={users} onDone={() => setPicked(new Set())} />
            <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setPicked(new Set())}>
              <X />
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8">
                <Checkbox aria-label="Select all" checked={all} onCheckedChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Key person</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={picked.has(r.id) ? "selected" : undefined}>
                <TableCell className="py-1.5">
                  <Checkbox aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </TableCell>
                <TableCell className="max-w-72 py-1.5">
                  <Link href={`/prospecting/prospects/${r.id}`} className="block truncate font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{[r.domain, r.activity].filter(Boolean).join(" · ") || "No website yet"}</div>
                </TableCell>
                <TableCell className="max-w-48 py-1.5">
                  {r.person ? (
                    <>
                      <div className="truncate">{r.person}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.personTitle}</div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not found yet</span>
                  )}
                </TableCell>
                <TableCell className="max-w-44 truncate py-1.5 text-xs">{r.segmentLabel || "-"}</TableCell>
                <TableCell className="max-w-40 truncate py-1.5 text-xs">{[r.emirate, r.freeZone].filter(Boolean).join(" · ") || "-"}</TableCell>
                <TableCell className={`py-1.5 text-xs ${STATUS_TONE[r.status] ?? ""}`}>
                  {statusLabel(r.status)}
                  {r.signals > 0 && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground no-underline">{r.signals} signal{r.signals > 1 ? "s" : ""}</span>}
                </TableCell>
                <TableCell className="py-1.5 text-xs">
                  <ScoreCell score={r.score} />
                </TableCell>
                <TableCell className="py-1.5">{r.ownerName && <UserAvatar name={r.ownerName} size={22} />}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Empty>{sp.size ? "Nothing matches these filters." : "No prospects yet. Import a list, or add one with +."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
