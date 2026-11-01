import { createSign } from "node:crypto";

/**
 * Google Search Console, the parts with no database (WEBSITE-PLAN.md section 8, W.9): reading the service account
 * key, signing the token request (RS256, no googleapis package), and turning API rows into site_search_daily rows.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** The JSON key file Google gives for a service account; only the two fields we need are kept. */
export function parseServiceAccount(json: string): ServiceAccount {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That is not a JSON key file. Download the key as JSON from Google Cloud and paste the whole file.");
  }
  const email = typeof data.client_email === "string" ? data.client_email : "";
  const key = typeof data.private_key === "string" ? data.private_key : "";
  if (data.type !== "service_account" || !email.includes("@") || !key.includes("PRIVATE KEY")) throw new Error("The JSON is not a service account key (it needs type, client_email and private_key).");
  return { client_email: email, private_key: key };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signed assertion exchanged at Google's token endpoint for an access token (read-only Search Console scope). */
export function signedAssertion(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${signer.sign(sa.private_key).toString("base64url")}`;
}

export interface GscApiRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchRow {
  day: string;
  page: string;
  query: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** A full URL to the site path the tracker uses (/guides/x), so Search Console and our own stats line up. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname.replace(/\/+$/, "") || "/").slice(0, 300);
  } catch {
    return url.slice(0, 300);
  }
}

/** API rows (dimensions date, page, query, country, device) to table rows; duplicates after trimming are summed. */
export function toSearchRows(rows: GscApiRow[]): SearchRow[] {
  const out = new Map<string, SearchRow>();
  for (const r of rows) {
    const [day, page, query, country, device] = r.keys;
    if (!day || !page || !query) continue;
    const row = { day, page: pathOf(page), query: query.slice(0, 300), country: (country ?? "").toUpperCase(), device: (device ?? "").toLowerCase(), clicks: r.clicks, impressions: r.impressions, position: r.position };
    const key = `${row.day}|${row.page}|${row.query}|${row.country}|${row.device}`;
    const had = out.get(key);
    if (!had) out.set(key, row);
    else {
      // impression-weighted average position
      const imp = had.impressions + row.impressions;
      had.position = imp ? (had.position * had.impressions + row.position * row.impressions) / imp : had.position;
      had.clicks += row.clicks;
      had.impressions = imp;
    }
  }
  return [...out.values()];
}
