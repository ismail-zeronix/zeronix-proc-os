"use client";

import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Downloads in the background. A button asks for a file and is free again in the blink of an eye for everything else on
 * the page; the worker makes the files one at a time, and each downloads by itself when it is ready, also after moving to
 * another page. One store per browser tab, kept outside React so it survives navigating.
 */
interface ServerJob {
  id: number;
  url: string;
  label: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
}

const POLL_MS = 2500;
/** The app's toasts sit top right, right over download buttons: these stay out of the way of the next click. */
const PLACE = { position: "bottom-center" } as const;
let busy = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

const emit = () => listeners.forEach((l) => l());
const setBusy = (next: Set<string>) => {
  busy = next;
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function saveFile(id: number) {
  const a = document.createElement("a");
  a.href = `/api/exports/${id}/file`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Browsers drop a download when another starts in the same moment, so files that are ready together are saved one by one. */
let saving: Promise<unknown> = Promise.resolve();
const SAVE_GAP_MS = 1500;
function saveInTurn(id: number, then: () => void) {
  saving = saving.then(async () => {
    saveFile(id);
    then();
    await new Promise((done) => setTimeout(done, SAVE_GAP_MS));
  });
}

async function finish(job: ServerJob) {
  // the tab that claims it deals with it; any other open tab stays quiet
  const r = await fetch(`/api/exports/${job.id}/claim`, { method: "POST" })
    .then((x) => x.json())
    .catch(() => null);
  if (!r?.ok) return;
  if (job.status === "failed") {
    toast.error(`${job.label}: ${job.error ?? "the file could not be made."}`, PLACE);
    return;
  }
  // browsers can ask before a second automatic download, so there is always a button as well
  saveInTurn(job.id, () => toast.success(`${job.label} is ready`, { ...PLACE, action: { label: "Download again", onClick: () => saveFile(job.id) }, duration: 10_000 }));
}

async function check() {
  timer = null;
  let jobs: ServerJob[] | null = null;
  try {
    const res = await fetch("/api/exports", { cache: "no-store" });
    if (res.status === 401) return; // signed out: nothing to wait for
    if (res.ok) jobs = (await res.json()).jobs;
  } catch {
    /* no connection for a moment: try again below */
  }
  if (jobs) {
    await Promise.all(jobs.filter((j) => j.status === "done" || j.status === "failed").map(finish));
    setBusy(new Set(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.url)));
  }
  if (!jobs || busy.size) timer = setTimeout(check, POLL_MS);
}

/** Picks up what was on its way before a reload, once per tab. */
function load() {
  if (loaded) return;
  loaded = true;
  void check();
}

/** Asks for a file: the answer comes back at once, and the file follows. */
export async function startExport(url: string, label: string) {
  loaded = true;
  if (busy.has(url)) return;
  setBusy(new Set(busy).add(url));
  try {
    const res = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, label }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.error ?? "The file could not be asked for. Please try again.");
    toast.info(`${label}: your file will be downloaded when it is ready.`, { ...PLACE, description: r.ahead > 0 ? `${r.ahead} ${r.ahead === 1 ? "file is" : "files are"} ahead of it. You can carry on working.` : "You can carry on working." });
    if (!timer) timer = setTimeout(check, 800);
  } catch (e) {
    const next = new Set(busy);
    next.delete(url);
    setBusy(next);
    toast.error((e as Error).message, PLACE);
  }
}

const useExportBusy = (url: string) =>
  useSyncExternalStore(
    subscribe,
    () => busy.has(url),
    () => false,
  );

/** A download button. Pressed, it stays disabled until that file has arrived, so it cannot be asked for twice. */
export function ExportButton({ url, label, disabled, ...props }: { url: string; /** What the toasts call the file. */ label: string } & Omit<ComponentProps<typeof Button>, "onClick" | "render" | "nativeButton" | "pending">) {
  const isBusy = useExportBusy(url);
  useEffect(load, []);
  return <Button {...props} pending={isBusy} disabled={disabled || isBusy} onClick={() => void startExport(url, label)} />;
}

/** Keeps files arriving on every signed-in page, also after a reload. Shows nothing. */
export function ExportWatcher() {
  useEffect(load, []);
  return null;
}
