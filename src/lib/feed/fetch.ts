/** Reads a supplier's feed link. Pure network helpers, no database. */

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

/** http(s) only, and nothing that points back into this machine or its network. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("That is not a valid link. Paste the full address, starting with https://");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https links are allowed.");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "[::1]" ||
    /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    throw new Error("Links to this computer or a private network are not allowed.");
  }
  return u;
}

/** A Google Sheets link in any of its forms -> the CSV export address, or null for other sites. */
export function googleSheetCsvUrl(raw: string): string | null {
  const u = new URL(raw);
  if (u.hostname !== "docs.google.com") return null;
  if (/^\/spreadsheets\/d\/e\//.test(u.pathname)) {
    // "published to the web" link: .../d/e/<key>/pub?gid=0&single=true&output=csv
    const out = new URL(u.origin + u.pathname.replace(/\/(pubhtml|pub)?$/, "/pub"));
    out.searchParams.set("gid", u.searchParams.get("gid") ?? "0");
    out.searchParams.set("single", "true");
    out.searchParams.set("output", "csv");
    return out.toString();
  }
  const id = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return null;
  const gid = u.searchParams.get("gid") ?? u.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function getText(url: string): Promise<{ text: string; contentType: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    headers: { "user-agent": "zeronix-procurement-feed/1.0", accept: "text/csv,text/html;q=0.8,*/*;q=0.5" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`The link answered ${res.status} ${res.statusText}.`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("The file behind the link is too large.");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("The file behind the link is too large.");
  return { text, contentType: res.headers.get("content-type") ?? "" };
}

const looksLikeHtml = (t: string) => /^\s*<(!doctype|html|head|body)/i.test(t);

/**
 * Finds the CSV behind a link. A Google Sheets address is converted directly; a web page (like the
 * supplier's stock viewer) is searched for the published sheet address it loads.
 */
export async function resolveFeed(url: string): Promise<{ csvUrl: string; text: string }> {
  assertSafeUrl(url);
  const direct = googleSheetCsvUrl(url);
  if (direct) {
    const { text } = await getText(direct);
    if (looksLikeHtml(text)) {
      throw new Error("Google did not return the sheet. Publish it to the web (File > Share > Publish to web > CSV).");
    }
    return { csvUrl: direct, text };
  }

  const first = await getText(url);
  if (!looksLikeHtml(first.text)) return { csvUrl: url, text: first.text };

  const found = first.text.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^"'\s<>\\]+/g)?.map((s) => s.replace(/&amp;/g, "&"));
  const sheetUrl = found?.find((s) => /output=csv/.test(s)) ?? found?.[0];
  const csvUrl = sheetUrl ? googleSheetCsvUrl(sheetUrl) : null;
  if (!csvUrl) throw new Error("That page does not contain a published sheet or CSV link that I can read.");
  const { text } = await getText(csvUrl);
  if (looksLikeHtml(text)) throw new Error("The sheet behind that page is not published as CSV.");
  return { csvUrl, text };
}

/** Re-reads a feed whose CSV address is already known, falling back to resolving the original link. */
export async function readFeed(url: string, resolvedUrl: string): Promise<{ csvUrl: string; text: string }> {
  if (resolvedUrl) {
    try {
      assertSafeUrl(resolvedUrl);
      const { text } = await getText(resolvedUrl);
      if (!looksLikeHtml(text)) return { csvUrl: resolvedUrl, text };
    } catch {
      // the supplier may have moved the sheet: look again from the page they gave us
    }
  }
  return resolveFeed(url);
}
