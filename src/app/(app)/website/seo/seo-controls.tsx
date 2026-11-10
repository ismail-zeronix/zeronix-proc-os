"use client";

import { BarChart3, Plus, Search, Swords, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { KeywordStatus } from "@/lib/website/keywords";
import { addGapIdeasAction, checkRanksAction, competitorGapAction, fillVolumesAction } from "../dataforseo-actions";
import { deleteKeywordAction, importKeywordsAction, setKeywordStatusAction } from "../seo-actions";

/** Import website/content/keywords.csv or a Google Keyword Planner export. */
export function KeywordImport() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          start(async () => {
            const form = new FormData();
            form.set("file", file);
            const res = await importKeywordsAction(form);
            if (input.current) input.current.value = "";
            if (res.error !== undefined) return void toast.error(res.error);
            toast.success(`${res.value.added} added, ${res.value.updated} updated${res.value.skipped ? `, ${res.value.skipped} skipped` : ""}`);
            router.refresh();
          });
        }}
      />
      <Button size="sm" pending={pending} onClick={() => input.current?.click()}>
        <Upload /> Import .csv
      </Button>
    </>
  );
}

const STATUSES: { key: KeywordStatus; label: string }[] = [
  { key: "idea", label: "Idea" },
  { key: "planned", label: "Planned" },
  { key: "writing", label: "Writing" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
];

/** Status and planned date of one keyword, saved on change. A published target page keeps it published. */
export function KeywordState({ id, status, plannedFor, locked }: { id: number; status: KeywordStatus; plannedFor: string | null; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (next: { status?: KeywordStatus; plannedFor?: string | null }) =>
    start(async () => {
      const res = await setKeywordStatusAction({ id, status: next.status ?? status, plannedFor: next.plannedFor === undefined ? plannedFor : next.plannedFor });
      if (res.error !== undefined) return void toast.error(res.error);
      router.refresh();
    });
  return (
    <div className="flex items-center gap-1.5" aria-busy={pending}>
      <NativeSelect size="sm" className="w-28" aria-label="Status" value={status} disabled={locked || pending} onChange={(e) => save({ status: e.target.value as KeywordStatus })}>
        {STATUSES.map((s) => (
          <NativeSelectOption key={s.key} value={s.key}>
            {s.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <input
        type="date"
        aria-label="Planned for"
        defaultValue={plannedFor ?? ""}
        disabled={pending}
        onBlur={(e) => e.target.value !== (plannedFor ?? "") && save({ plannedFor: e.target.value || null })}
        className="h-7 rounded-md border bg-background px-1.5 text-xs"
      />
    </div>
  );
}

export function KeywordDelete({ id, keyword }: { id: number; keyword: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      pending={pending}
      aria-label={`Remove "${keyword}"`}
      title="Remove from the plan"
      onClick={() =>
        confirm(`Remove "${keyword}" from the SEO plan?`) &&
        start(async () => {
          const res = await deleteKeywordAction(id);
          if (res.error !== undefined) return void toast.error(res.error);
          router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}

/** The paid DataForSEO buttons on the Rankings tab (admins only; each one checks the monthly budget first). */
export function DfsButtons() {
  const router = useRouter();
  const [vol, startVol] = useTransition();
  const [rank, startRank] = useTransition();
  const [gap, startGap] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        pending={vol}
        title="Monthly UAE searches and difficulty for keywords that have none"
        onClick={() =>
          startVol(async () => {
            const res = await fillVolumesAction();
            if (res.error !== undefined) return void toast.error(res.error);
            toast.success(`Search volumes for ${res.value.updated} keyword(s)`);
            router.refresh();
          })
        }
      >
        <BarChart3 /> Get volumes
      </Button>
      <Button
        size="sm"
        variant="outline"
        pending={rank}
        title="Google UAE positions for priority 1–2 and live keywords (also runs every Monday)"
        onClick={() =>
          startRank(async () => {
            const res = await checkRanksAction();
            if (res.error !== undefined) return void toast.error(res.error);
            toast.success("Ranking check started. It takes a few minutes; reload this page to see it.");
          })
        }
      >
        <Search /> Check rankings now
      </Button>
      <Button
        size="sm"
        variant="outline"
        pending={gap}
        title="Searches the competitors in Settings rank for in the UAE and we do not"
        onClick={() =>
          startGap(async () => {
            const res = await competitorGapAction();
            if (res.error !== undefined) return void toast.error(res.error);
            toast.success(`${res.value.rows} searches found`);
            router.refresh();
          })
        }
      >
        <Swords /> Competitor gap
      </Button>
    </div>
  );
}

/** "Add to plan" for one search from the competitor gap. */
export function AddGapIdea({ keyword }: { keyword: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={pending}
      onClick={() =>
        start(async () => {
          const res = await addGapIdeasAction([keyword]);
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(res.value.added ? `"${keyword}" added to the plan` : "Already in the plan");
          router.refresh();
        })
      }
    >
      <Plus /> Add
    </Button>
  );
}
