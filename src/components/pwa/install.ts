"use client";

import { useSyncExternalStore } from "react";

/** Chrome, Edge and Android's install offer, kept until the user asks for it (the browser fires it once, early). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // keep the browser's own mini-bar quiet; the menu offers "Install app" instead
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone and iPad Safari, which have no install prompt: the user adds the app from the Share menu. */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export type InstallMode = "prompt" | "ios" | null;

const snapshot = (): InstallMode => (isStandalone() ? null : deferred ? "prompt" : isIos() ? "ios" : null);

/** How this browser can install the app: its own prompt, the iOS Share menu, or not at all (already installed). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Opens the browser's install dialog. */
export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const e = deferred;
  await e.prompt();
  await e.userChoice.catch(() => undefined);
  deferred = null;
  emit();
}
