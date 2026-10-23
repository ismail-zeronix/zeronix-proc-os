"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { OPEN_PUNCH_EVENT } from "@/components/attendance/header-clock";

/** What still works before punching in: the switch and clock, the reason dialog, toasts, the home link, theme and the user menu (to sign out). */
const ALLOWED = [
  "[data-punch-allow]",
  "[data-punch-dialog]",
  "[data-sonner-toaster]",
  "[data-slot=dialog-overlay]",
  "[data-slot=dropdown-menu-content]",
].join(",");

/** Keys that only move focus or close things; everything else is blocked. */
const FREE_KEYS = new Set(["Tab", "Escape", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * Until the user punches in, every click and key press outside the allowed bits is swallowed and an error toast says why.
 * Server pages still render, so people can see the portal; they just cannot use it.
 */
export function PunchGate({ locked }: { locked: boolean }) {
  useEffect(() => {
    if (!locked) return;
    const allowed = (t: EventTarget | null) => t instanceof Element && !!t.closest(ALLOWED);
    const warn = () =>
      toast.error("Punch in first", {
        id: "punch-gate",
        description: "Click the clock at the top of the page to punch in and start your day.",
        action: { label: "Punch in", onClick: () => window.dispatchEvent(new Event(OPEN_PUNCH_EVENT)) },
      });
    const block = (e: Event) => {
      if (allowed(e.target)) return;
      if (e instanceof KeyboardEvent && FREE_KEYS.has(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.type === "click" || e.type === "keydown" || e.type === "submit") warn();
    };
    const events = ["pointerdown", "mousedown", "click", "dblclick", "auxclick", "submit", "keydown"] as const;
    for (const ev of events) window.addEventListener(ev, block, { capture: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, block, { capture: true });
    };
  }, [locked]);

  return null;
}
