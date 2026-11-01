import "server-only";

/**
 * After a change is published, tell the site to drop its cached copy so the change shows on the next visit. The site
 * is reached over the internal site-net network (SITE_INTERNAL_URL, e.g. http://zeronix-site:3000). A failure is not
 * fatal: the site refreshes on its own within 10 minutes.
 */
export async function revalidateSite(tags: string[]): Promise<boolean> {
  const base = process.env.SITE_INTERNAL_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!base || !secret) return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("[website] revalidate failed", (e as Error).message);
    return false;
  }
}

/** Can the portal reach the site? Shown on Website › Overview. */
export async function siteReachable(): Promise<{ ok: boolean; detail: string }> {
  const base = process.env.SITE_INTERNAL_URL;
  if (!base) return { ok: false, detail: "SITE_INTERNAL_URL is not set" };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok ? { ok: true, detail: base } : { ok: false, detail: `${base} answered ${res.status}` };
  } catch {
    return { ok: false, detail: `${base} did not answer` };
  }
}
