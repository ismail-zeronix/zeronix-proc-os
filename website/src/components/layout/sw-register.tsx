"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) on the live build only, after the page has loaded. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const go = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
