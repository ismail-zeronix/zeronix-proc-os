import { getSitemap } from "./api";
import { SITE_URL } from "./defaults";
import { flags } from "./flags";

/**
 * IndexNow (indexnow.org): tells Bing (which ChatGPT search and Copilot read), Yandex, Seznam and Naver that pages
 * changed, so they are crawled within hours instead of weeks. Google does not use it; Search Console covers Google.
 * Needs INDEXNOW_KEY (8–128 letters, digits or dashes) and SITE_INDEXING=true. The key is served at /indexnow.txt.
 */

export const indexNowKey = () => {
  const k = process.env.INDEXNOW_KEY ?? "";
  return /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : "";
};

/** Sends up to 10,000 site addresses in one call. Returns the HTTP status from IndexNow, or 0 when switched off. */
export async function submitIndexNow(urls: string[]): Promise<number> {
  const key = indexNowKey();
  if (!key || !flags.indexing || !urls.length) return 0;
  const host = new URL(SITE_URL).host;
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/indexnow.txt`, urlList: [...new Set(urls)].slice(0, 10000) }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  return res?.status ?? -1;
}

/** Addresses from the sitemap changed in the last `days` days (all of them with days = Infinity). */
export async function changedUrls(days: number): Promise<string[]> {
  const since = Date.now() - days * 86_400_000;
  const { entries } = await getSitemap();
  return entries.filter((e) => days === Infinity || Date.parse(e.updatedAt) >= since).map((e) => `${SITE_URL}${e.path === "/" ? "" : e.path}`);
}

let lastAuto = 0;

/** After a publish in the portal: send what changed recently, at most once every 10 minutes. */
export async function autoSubmit(): Promise<void> {
  if (!indexNowKey() || !flags.indexing || Date.now() - lastAuto < 600_000) return;
  lastAuto = Date.now();
  await submitIndexNow(await changedUrls(2));
}
