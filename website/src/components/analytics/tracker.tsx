"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { rememberLanding, send, session, track, utmFromUrl } from "@/lib/track";

/**
 * Page views, time on page and scroll depth, button clicks marked `data-track`, links to other sites, and the chat
 * widget's own events. Mounted once in the root layout; a client-side navigation counts as a new page view.
 */
export function Tracker() {
  const pathname = usePathname();
  const page = useRef({ path: "", active: 0, visibleSince: 0, scroll: 0, reported: 0 });

  // time on page counts only while the tab is visible; each report carries only the seconds not reported yet, so a
  // tab that is hidden and shown again never counts twice (the dashboards add them up)
  const engaged = () => {
    const p = page.current;
    if (!p.path) return;
    const active = p.active + (p.visibleSince ? Date.now() - p.visibleSince : 0);
    const seconds = Math.round((active - p.reported) / 1000);
    if (seconds < 1) return;
    p.reported += seconds * 1000;
    send([{ type: "engaged", path: p.path, sid: session().sid, value: Math.min(86_400, seconds), scroll: p.scroll }]);
  };

  useEffect(() => {
    if (!pathname) return;
    engaged();
    const { sid, fresh } = session();
    const utm = fresh ? utmFromUrl() : {};
    const ref = fresh && !document.referrer.startsWith(location.origin) ? document.referrer : "";
    if (fresh) rememberLanding(pathname, ref, utm);
    page.current = { path: pathname, active: 0, visibleSince: document.visibilityState === "visible" ? Date.now() : 0, scroll: 0, reported: 0 };
    send([{ type: "pageview", path: pathname, sid, ...(ref ? { ref: ref.slice(0, 500) } : {}), ...(Object.keys(utm).length ? { utm } : {}) }]);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100;
      if (pct > page.current.scroll) page.current.scroll = pct;
    };
    const onVisibility = () => {
      const p = page.current;
      if (document.visibilityState === "hidden") {
        if (p.visibleSince) p.active += Date.now() - p.visibleSince;
        p.visibleSince = 0;
        engaged();
      } else p.visibleSince = Date.now();
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const tagged = el?.closest<HTMLElement>("[data-track]");
      if (tagged?.dataset.track) return track("cta_click", tagged.dataset.track);
      const a = el?.closest<HTMLAnchorElement>("a[href]");
      if (!a || !/^https?:/.test(a.protocol)) return;
      // every way into the quote form is a call to action, named by where it sits
      if (a.host === location.host && a.pathname === "/quote") return track("cta_click", `quote-${a.closest("header") ? "header" : a.closest("footer") ? "footer" : "page"}`);
      if (a.host && a.host !== location.host) track("outbound", a.host + a.pathname);
    };
    const onChatOpen = () => track("chat_open");
    const onChatLead = () => track("chat_lead");
    const onQuote = () => track("quote_submit");
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", engaged);
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("zeronix-chat:open", onChatOpen);
    window.addEventListener("zeronix-chat:lead", onChatLead);
    window.addEventListener("zx:quote-sent", onQuote);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", engaged);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("zeronix-chat:open", onChatOpen);
      window.removeEventListener("zeronix-chat:lead", onChatLead);
      window.removeEventListener("zx:quote-sent", onQuote);
    };
  }, []);

  return null;
}
