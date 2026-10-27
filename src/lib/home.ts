import "server-only";
import { cache } from "react";
import { listCounts, priceMoves, quietSuppliers } from "@/lib/alerts";
import { TZ } from "@/lib/dates";
import { getSetting } from "@/lib/settings";

export function dubaiGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now)) % 24;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function dubaiDateLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now);
}

/** Procurement numbers for the home screen. Cached per request, so every widget shares one set of queries. */
export const procurementPulse = cache(async () => {
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const [counts, moves, quiet] = await Promise.all([
    listCounts(),
    priceMoves({ withinDays: 7, staleDays, limit: 100 }),
    quietSuppliers(staleDays),
  ]);
  return { staleDays, counts, moves, quiet };
});
