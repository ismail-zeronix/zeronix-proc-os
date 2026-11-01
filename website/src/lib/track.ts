"use client";

/**
 * The site's own analytics (WEBSITE-PLAN.md section 9): no cookies, no third parties. Events go by sendBeacon to this
 * site's /api/t, which passes them to the portal. The session id lives in the tab's sessionStorage; the first visit
 * (landing page, referrer, campaign tags) is remembered in localStorage so a later quote or chat can say what brought
 * the visitor in.
 */

export type TrackType = "pageview" | "engaged" | "cta_click" | "outbound" | "compare" | "filter" | "quote_submit" | "chat_open" | "chat_lead";

export interface FirstTouch {
  path: string;
  ref: string;
  utm: Record<string, string>;
  at: number;
}

const FIRST = "zx-first";
const SID = "zx-sid";
const UTM = "zx-utm";
const FIRST_DAYS = 90;

function store(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function randomId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This tab's session id; `fresh` is true on the first call of a new session. */
export function session(): { sid: string; fresh: boolean } {
  const s = store("session");
  const had = s?.getItem(SID);
  if (had) return { sid: had, fresh: false };
  const sid = randomId();
  s?.setItem(SID, sid);
  return { sid, fresh: true };
}

export function utmFromUrl(): Record<string, string> {
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = q.get(`utm_${k}`);
    if (v) utm[k] = v.slice(0, 150);
  }
  return utm;
}

/** The campaign tags of this session (set on its first page). */
export function sessionUtm(): Record<string, string> {
  try {
    return JSON.parse(store("session")?.getItem(UTM) ?? "{}");
  } catch {
    return {};
  }
}

/** Remembers the first visit (kept 90 days) and this session's campaign tags. Called on a session's first page. */
export function rememberLanding(path: string, ref: string, utm: Record<string, string>) {
  if (Object.keys(utm).length) store("session")?.setItem(UTM, JSON.stringify(utm));
  const old = firstTouch();
  if (old && Date.now() - old.at < FIRST_DAYS * 86400_000) return;
  store("local")?.setItem(FIRST, JSON.stringify({ path, ref, utm, at: Date.now() } satisfies FirstTouch));
}

export function firstTouch(): FirstTouch | null {
  try {
    const v = JSON.parse(store("local")?.getItem(FIRST) ?? "null") as FirstTouch | null;
    return v && typeof v.path === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Sends events now. sendBeacon survives the page closing; fetch keepalive is the fallback. */
export function send(events: Record<string, unknown>[]) {
  if (!events.length) return;
  const body = JSON.stringify({ events: events.slice(0, 20) });
  try {
    if (navigator.sendBeacon?.("/api/t", body)) return;
  } catch {
    /* fall through */
  }
  fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
}

/** One event from anywhere on the site, e.g. track("compare", "hp-840-g11,dell-7450"). */
export function track(type: TrackType, target?: string, value?: number) {
  send([{ type, path: location.pathname, sid: session().sid, ...(target ? { target: target.slice(0, 200) } : {}), ...(value !== undefined ? { value } : {}) }]);
}
