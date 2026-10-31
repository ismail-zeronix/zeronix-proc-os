"use client";

import { AlertTriangle, Check, ChevronDown, CircleStop, Loader2, ScanSearch, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ResearchQueue } from "@/lib/prospecting/research";
import { applyFinding, researchProgress, researchState, startResearch, stopResearch } from "./actions";
import { useRun } from "./prospect-ui";

/** Tells the progress panel that new research was queued, so it starts watching at once. */
const STARTED = "prospecting:research-started";

/**
 * The two research buttons for one prospect or a selection. Research reads their website only (free); Research with
 * AI also lets a free AI model read the pages and searches the web for the people who run the company.
 */
export function ResearchButtons({ ids, running = false, onDone }: { ids: number[]; running?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [pending, run] = useRun();
  const [mode, setMode] = useState<"site" | "ai">("site");
  const go = (m: "site" | "ai") => {
    setMode(m);
    run(() => startResearch(ids, m), ids.length > 1 ? `${m === "ai" ? "Research with AI" : "Research"} queued for ${ids.length} prospects` : "Research queued", () => {
      window.dispatchEvent(new Event(STARTED));
      onDone?.();
      router.refresh();
    });
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        pending={(pending && mode === "site") || running}
        disabled={!ids.length || pending || running}
        title="Read their website for emails, phones, people, address and hiring. Free, no AI."
        onClick={() => go("site")}
      >
        <ScanSearch /> {running ? "Researching…" : "Research"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        pending={pending && mode === "ai"}
        disabled={!ids.length || pending || running}
        title="Read their website, then let AI pick out the people and address, draft a personal line and search the web for the owner or manager. Uses AI allowance."
        onClick={() => go("ai")}
      >
        <Sparkles /> Research with AI
      </Button>
    </>
  );
}

const plural = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;

function timeLeft(q: ResearchQueue): string {
  const finished = q.done + q.stopped;
  if (!q.first || finished < 3) return "";
  const perRun = (Date.now() / 1000 - q.first) / finished;
  const mins = Math.ceil(((q.total - finished) * perRun) / 60);
  return mins <= 1 ? "about a minute left" : `about ${mins} minutes left`;
}

/**
 * The research queue as it happens: how far the batch is, what is being done right now (reading a website, AI reading
 * the pages, searching the web), the last results, and how many moved to Ready. Checks every few seconds while work is
 * going and refreshes the page as results come in.
 */
export function ResearchProgress() {
  const router = useRouter();
  const [q, setQ] = useState<ResearchQueue | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<number | null>(null);
  const [stopping, run] = useRun();
  const lastDone = useRef(-1);
  const lastRefresh = useRef(0);

  const load = useCallback(async () => {
    const res = await researchProgress().catch(() => null);
    const next = res && "value" in res ? res.value : null;
    if (!next) return null;
    setQ(next);
    // new results: refresh the list underneath, at most every 5 seconds
    if (lastDone.current >= 0 && next.done !== lastDone.current && Date.now() - lastRefresh.current > 5000) {
      lastRefresh.current = Date.now();
      router.refresh();
    }
    lastDone.current = next.done;
    return next;
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = async () => {
      const next = await load();
      if (!alive) return;
      const going = !!next && next.total > next.done + next.stopped;
      // fast while working, slow when idle (another person may start research)
      timer = setTimeout(tick, going ? 3000 : 30000);
    };
    const wake = () => {
      clearTimeout(timer);
      setHidden(null);
      void tick();
    };
    void tick();
    window.addEventListener(STARTED, wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener(STARTED, wake);
    };
  }, [load]);

  if (!q || !q.total || hidden === q.first) return null;
  const finished = q.done + q.stopped;
  const going = q.total > finished;
  const pct = Math.round((finished / q.total) * 100);
  const left = going ? timeLeft(q) : "";

  return (
    <section className="grid gap-2 rounded-lg border bg-card px-3 py-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {going ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Check className="size-4 text-emerald-600" />}
        <span className="font-medium">{going ? "Researching" : "Research finished"}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {finished} of {q.total} done
          {q.waiting > 0 && ` · ${q.waiting} waiting`}
          {q.ai > 0 && ` · ${q.ai} with AI`}
          {left && ` · ${left}`}
        </span>
        {q.movedToReady > 0 && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{plural(q.movedToReady, "prospect")} moved to Ready</span>}
        <div className="ml-auto flex items-center gap-1">
          {q.waiting > 0 && (
            <Button variant="ghost" size="sm" className="h-7" pending={stopping} onClick={() => run(() => stopResearch(), "Waiting research stopped", () => void load())} title="Stop the prospects that have not started; the ones being read now finish">
              <CircleStop /> Stop
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={open ? "Hide details" : "Show details"} aria-expanded={open} onClick={() => setOpen(!open)}>
            <ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </Button>
          {!going && (
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setHidden(q.first)}>
              <X />
            </Button>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Research progress">
        <div className="h-full rounded-full bg-[var(--series-1)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {q.stalled && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5" /> Nothing has started for a few minutes. The website reader (scraper container) may not be running.
        </p>
      )}
      {/* what is happening right now, always visible while working */}
      {q.working.length > 0 && (
        <ul className="grid gap-0.5">
          {q.working.slice(0, open ? 8 : 3).map((w) => (
            <li key={w.id} className="flex min-w-0 items-center gap-2 text-xs">
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--series-1)]" />
              <Link href={`/prospecting/prospects/${w.companyId}`} className="max-w-56 shrink-0 truncate font-medium hover:underline">
                {w.name}
              </Link>
              <span className="truncate text-muted-foreground">
                {w.stage || (w.status === "crawled" ? "Website read, waiting to be saved" : "Starting")}
                {w.mode === "ai" && " · with AI"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && q.recent.length > 0 && (
        <div className="grid gap-0.5 border-t pt-2">
          <div className="text-xs text-muted-foreground">Latest results</div>
          <ul className="grid gap-1">
            {q.recent.map((r) => (
              <li key={r.id} className="grid min-w-0 text-xs sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-2">
                <Link href={`/prospecting/prospects/${r.companyId}`} className="truncate font-medium hover:underline">
                  {r.name}
                </Link>
                <span className="text-muted-foreground [overflow-wrap:anywhere]">{r.summary || "Nothing found"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** While a run is going, shows what it is doing and reloads the page when it ends. */
export function ResearchWatcher({ companyId, stage }: { companyId: number; stage: string }) {
  const router = useRouter();
  const [now, setNow] = useState(stage);
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await researchState(companyId).catch(() => null);
      if (!res || !("value" in res) || !res.value) return;
      setNow(res.value.stage);
      if (!res.value.running) {
        clearInterval(t);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [companyId, router]);
  return <span className="animate-pulse">{now || "Waiting in the research queue…"}</span>;
}

/** Puts a found email or phone on the company. */
export function UseFindingButton({ companyId, kind, value }: { companyId: number; kind: "email" | "phone"; value: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" pending={pending} onClick={() => run(() => applyFinding(companyId, kind, value), `Company ${kind} updated`)}>
      <Check /> Use
    </Button>
  );
}
