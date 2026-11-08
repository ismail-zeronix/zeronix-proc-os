/**
 * The visitor's address, as our own reverse proxy (Caddy) saw it. A caller can put anything into X-Forwarded-For, but the
 * proxy adds the address it really talked to at the END, so the rightmost entry is the one to trust; the first entry is
 * whatever the caller wrote. Without the header (local development) X-Real-IP, else "".
 */
export function ipFromHeaders(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts.at(-1);
    if (last) return last.slice(0, 64);
  }
  return (h.get("x-real-ip") ?? "").trim().slice(0, 64);
}
