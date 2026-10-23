"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

const KEY = "portal:trail";
/** Set just before going back, so the page we land on reloads its data (browser Back shows the cached copy otherwise). */
const REFRESH = "portal:refresh";
const skip = (path: string) => path.startsWith("/login");

function readTrail(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Keeps a per-tab trail of portal pages, so Back knows whether the previous screen was ours. Mounted once in the root providers. */
export function NavTracker() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    try {
      if (sessionStorage.getItem(REFRESH)) {
        sessionStorage.removeItem(REFRESH);
        router.refresh();
      }
    } catch {}
    if (skip(pathname)) return;
    const trail = readTrail();
    if (trail.at(-1) === pathname) return;
    if (trail.at(-2) === pathname) trail.pop();
    else trail.push(pathname);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-50)));
    } catch {}
  }, [pathname, router]);
  return null;
}

/** True when the browser's previous entry is a portal page (not another site, a blank tab or the login screen). */
export function canGoBack(): boolean {
  const nav = (window as { navigation?: { currentEntry?: { index: number } | null; entries(): { url: string | null }[] } }).navigation;
  if (nav?.currentEntry) {
    const prev = nav.entries()[nav.currentEntry.index - 1]?.url;
    if (!prev) return false;
    const url = new URL(prev);
    return url.origin === window.location.origin && !skip(url.pathname);
  }
  return readTrail().length > 1;
}

/** Go to the screen the user came from; when the page was opened directly (new tab, shared link), go to `fallback` instead. */
export function useGoBack(fallback: string) {
  const router = useRouter();
  return useCallback(() => {
    if (!canGoBack()) return router.push(fallback);
    try {
      sessionStorage.setItem(REFRESH, "1");
    } catch {}
    router.back();
  }, [router, fallback]);
}

/** The arrow at the start of a detail page header. */
export function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback);
  return (
    <Button variant="ghost" size="icon-sm" onClick={goBack} aria-label="Back" title="Back">
      <ArrowLeft />
    </Button>
  );
}
