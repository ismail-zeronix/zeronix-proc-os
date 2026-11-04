"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker (production only: in development it would hold on to stale build files) and offers a
 * new version when one has been deployed. Nothing reloads until the user presses Refresh.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    let offered = false;
    let reloading = false;

    const offer = (worker: ServiceWorker) => {
      if (offered) return;
      offered = true;
      toast("A new version of Zeronix is available", {
        id: "app-update",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => {
            navigator.serviceWorker.addEventListener("controllerchange", () => {
              if (reloading) return;
              reloading = true;
              window.location.reload();
            });
            worker.postMessage("SKIP_WAITING");
          },
        },
      });
    };

    const watch = (reg: ServiceWorkerRegistration) => {
      // a worker already waiting from an earlier visit; only when one is in control (not the very first install)
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        next?.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) offer(next);
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        watch(reg);
      })
      .catch(() => {
        // no worker (private mode, blocked): the portal works the same, just without the offline page
      });

    // phones keep the app open for days: look for a new deploy whenever it comes back to the front
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
