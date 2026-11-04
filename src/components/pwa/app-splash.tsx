"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The launch screen of the installed app: navy, the mark, the name and a thin loading bar. It is in the first HTML, so
 * it covers the page until React has started, then fades out. CSS only shows it in standalone mode (installed app), so
 * browser tabs never see it, and it is in the root layout, so moving between pages never shows it again. There is no
 * timer: it goes as soon as the app is ready (a CSS fallback hides it after a few seconds if scripts fail).
 */
export function AppSplash() {
  // false in the server HTML and during hydration, true straight after: the fade starts once the app is interactive
  const ready = useSyncExternalStore(noop, () => true, () => false);
  return (
    <div className="app-splash" data-done={ready || undefined} aria-hidden="true">
      <div className="app-splash-inner">
        <svg width="72" height="72" viewBox="0 0 512 512" aria-hidden="true">
          <rect width="512" height="512" rx="112" fill="#111C2E" />
          <path d="M0 0H100V20.5L29.5 79.5H100V100H0V79.5L70.5 20.5H0Z" fill="#35C7A5" transform="translate(143.36 143.36) scale(2.2528)" />
        </svg>
        <p className="app-splash-name">Zeronix OS</p>
        <p className="app-splash-sub">Business Operating System</p>
        <div className="app-splash-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
