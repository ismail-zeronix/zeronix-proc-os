"use server";

import { z } from "zod";
import { loadAccess } from "@/lib/auth/session";
import { markRead, snooze } from "@/lib/notifications";

async function me(): Promise<number> {
  const access = await loadAccess();
  if (!access) throw new Error("Sign in again.");
  return access.user.id;
}

/** Marks some of my lines read, or all open ones when `ids` is left out. */
export async function readNotifications(ids?: number[]) {
  const userId = await me();
  await markRead(userId, ids ? z.array(z.number().int().positive()).max(500).parse(ids) : undefined);
}

/** Hides one of my lines for an hour, or until the next morning (08:00 UAE). */
export async function snoozeNotification(id: number, until: "hour" | "tomorrow") {
  const userId = await me();
  const nid = z.number().int().positive().parse(id);
  const when = z.enum(["hour", "tomorrow"]).parse(until);
  let at: Date;
  if (when === "hour") at = new Date(Date.now() + 3600_000);
  else {
    // tomorrow 08:00 in Dubai (UTC+4, no daylight saving) = 04:00 UTC
    const d = new Date(Date.now() + 4 * 3600_000);
    at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 4, 0));
  }
  await snooze(userId, nid, at);
}
