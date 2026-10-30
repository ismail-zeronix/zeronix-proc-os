import "server-only";
import type { WebGeo } from "./types";

/**
 * Where a website visitor is.
 * - From the IP address (city, region, internet provider, network owner): ipwho.is, falling back to ipinfo.io (set
 *   IPINFO_TOKEN for more than its small free allowance). Free, no key, about city level.
 * - From the browser's location (only when the visitor allows it): the address from OpenStreetMap's Nominatim.
 * Both are looked up once per chat and cached, with short timeouts; a failed lookup just leaves the panel without it.
 */

type IpGeo = NonNullable<WebGeo["ip"]>;

const g = globalThis as unknown as { webchatGeo?: Map<string, { at: number; geo: IpGeo | null }> };
const cache = (g.webchatGeo ??= new Map());
const DAY = 86400_000;

/** Loopback and private networks have no location (testing, the office LAN). */
function isPrivate(ip: string): boolean {
  return !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "ZeronixOS portal (www.zeronix.ae)" } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v && Number.isFinite(Number(v)) ? Number(v) : undefined);

async function fromIpwhois(ip: string): Promise<IpGeo | null> {
  const d = await getJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!d || d.success === false) return null;
  const conn = (d.connection ?? {}) as Record<string, unknown>;
  const tz = (d.timezone ?? {}) as Record<string, unknown>;
  const flag = (d.flag ?? {}) as Record<string, unknown>;
  return {
    city: str(d.city),
    region: str(d.region),
    country: str(d.country),
    countryCode: str(d.country_code),
    flag: str(flag.emoji),
    postal: str(d.postal),
    lat: num(d.latitude),
    lon: num(d.longitude),
    timeZone: str(tz.id),
    isp: str(conn.isp),
    org: str(conn.org),
    domain: str(conn.domain),
    asn: num(conn.asn),
  };
}

async function fromIpinfo(ip: string): Promise<IpGeo | null> {
  const token = process.env.IPINFO_TOKEN;
  const d = await getJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  if (!d || d.bogon) return null;
  const [lat, lon] = (str(d.loc) ?? "").split(",").map(Number);
  const org = str(d.org);
  const cc = str(d.country);
  return {
    city: str(d.city),
    region: str(d.region),
    countryCode: cc,
    country: cc,
    flag: cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : undefined,
    postal: str(d.postal),
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    timeZone: str(d.timezone),
    org: org?.replace(/^AS\d+\s+/, ""),
    asn: num(org?.match(/^AS(\d+)/)?.[1]),
  };
}

/** City-level location and network of an IP address, or null (private address, or both services failed). */
export async function locateIp(ip: string): Promise<IpGeo | null> {
  if (isPrivate(ip)) return null;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < DAY) return hit.geo;
  const geo = (await fromIpwhois(ip)) ?? (await fromIpinfo(ip));
  cache.set(ip, { at: Date.now(), geo });
  if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.at > DAY) cache.delete(k);
  return geo;
}

/** The address at a point (the visitor's own location, when they allow it). */
export async function placeAt(lat: number, lon: number): Promise<{ address: string; area?: string; city?: string } | null> {
  const d = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`);
  if (!d || !str(d.display_name)) return null;
  const a = (d.address ?? {}) as Record<string, unknown>;
  return {
    address: str(d.display_name)!,
    area: str(a.suburb) ?? str(a.neighbourhood) ?? str(a.quarter) ?? str(a.city_district),
    city: str(a.city) ?? str(a.town) ?? str(a.state),
  };
}
