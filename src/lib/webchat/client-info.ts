import "server-only";
import type { WebClientInfo } from "./types";

/**
 * The browser details the widget sends come from the open internet: keep only the known fields, of the right type,
 * cut to a sensible length.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const n = (v: unknown, min = 0, max = 1e6) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : undefined);
const b = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const size = (v: unknown) => (isObj(v) && n(v.w, 1, 20000) && n(v.h, 1, 20000) ? { w: n(v.w)!, h: n(v.h)! } : undefined);

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"];

/** Drops undefined fields so the stored JSON stays small. */
function compact<T extends object>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(isObj(v) && !Object.keys(v).length)));
  return Object.keys(out).length ? (out as T) : undefined;
}

export function cleanClient(v: unknown): WebClientInfo | null {
  if (!isObj(v)) return null;
  const hints = isObj(v.hints) ? v.hints : {};
  const conn = isObj(v.connection) ? v.connection : {};
  const campaign = isObj(v.campaign) ? v.campaign : {};
  const out = compact<WebClientInfo>({
    language: s(v.language, 20),
    languages: Array.isArray(v.languages) ? v.languages.map((l) => s(l, 20)).filter((l): l is string => !!l).slice(0, 8) : undefined,
    timeZone: s(v.timeZone, 60),
    utcOffset: n(v.utcOffset, -900, 900),
    screen: size(v.screen),
    viewport: size(v.viewport),
    pixelRatio: n(v.pixelRatio, 0.1, 10),
    touchPoints: n(v.touchPoints, 0, 50),
    cores: n(v.cores, 1, 512),
    memoryGb: n(v.memoryGb, 0.1, 1024),
    darkMode: b(v.darkMode),
    connection: compact({ type: s(conn.type, 20), downlinkMbps: n(conn.downlinkMbps, 0, 10000), rttMs: n(conn.rttMs, 0, 100000), saveData: b(conn.saveData) }),
    cookies: b(v.cookies),
    doNotTrack: b(v.doNotTrack),
    hints: compact({
      brands: Array.isArray(hints.brands) ? hints.brands.map((x) => s(x, 60)).filter((x): x is string => !!x).slice(0, 6) : undefined,
      mobile: b(hints.mobile),
      platform: s(hints.platform, 40),
      platformVersion: s(hints.platformVersion, 40),
      model: s(hints.model, 80),
      architecture: s(hints.architecture, 20),
      bitness: s(hints.bitness, 10),
    }),
    campaign: compact(Object.fromEntries(CAMPAIGN_KEYS.map((k) => [k, s(campaign[k], 200)]).filter((e): e is [string, string] => !!e[1]))),
    landing: s(v.landing, 1000),
    firstReferrer: s(v.firstReferrer, 1000),
    visits: n(v.visits, 1, 1e6),
    firstSeen: s(v.firstSeen, 40),
  });
  return out ?? null;
}
